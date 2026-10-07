import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { estimateTotal, nightsBetween, todayWIB } from '@kimura/core/format';
import type { RoomType, StayPackage } from '@kimura/core/database.types';
import { bookingAdminMessage, sendWaText } from '@kimura/core/wa';
import { rateLimit, clientIp } from '@kimura/core/ratelimit';
import { publicClient } from '@/lib/queries';
import { getEnv } from '@/lib/env';

export const prerender = false;

const PACKAGES: StayPackage[] = ['half_day', 'daily', 'weekly', 'monthly'];

function bad(message: string, status = 400, code?: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Spam brake: booking rows + admin WA sends are the abuse surface.
  if (!rateLimit(`bookings:${clientIp(request, clientAddress)}`, 5, 60_000)) {
    return bad('Too many requests. Please wait a minute.', 429, 'rate_limited');
  }
  // JSON only — blocks cross-site `text/plain`/form-encoded CSRF posts.
  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return bad('Expected application/json', 415);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad('Invalid JSON');
  }

  const roomSlug = String(body.room_slug ?? '').trim();
  const pkg = String(body.package ?? 'daily') as StayPackage;
  // Length caps at the trust boundary — these land in unbounded text columns.
  const guest_name = String(body.guest_name ?? '').trim().slice(0, 120);
  const guest_email = String(body.guest_email ?? '').trim().slice(0, 254);
  const guest_phone = String(body.guest_phone ?? '').trim().slice(0, 32);
  const check_in = String(body.check_in ?? '').trim();
  const check_out = String(body.check_out ?? '').trim();
  const special_requests = String(body.special_requests ?? '').trim().slice(0, 1000) || null;

  // --- validation ---
  if (!roomSlug) return bad('room_slug is required');
  if (!PACKAGES.includes(pkg)) return bad('invalid package');
  if (!guest_name) return bad('guest_name is required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guest_email)) return bad('valid guest_email is required');
  if (guest_phone.replace(/\D/g, '').length < 8) return bad('valid guest_phone is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(check_in)) return bad('valid check_in is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(check_out)) return bad('valid check_out is required');
  // Regex accepts impossible dates (2026-02-31); verify against the calendar and
  // reject past dates — Postgres `date` cast would otherwise 500.
  for (const [label, iso] of [['check_in', check_in], ['check_out', check_out]] as const) {
    const d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d.getTime()) || iso !== d.toISOString().slice(0, 10)) {
      return bad(`valid ${label} is required`);
    }
  }
  // Property runs on WIB (UTC+7); "today" must not lag the guest's calendar.
  const todayWib = todayWIB();
  if (check_in < todayWib) return bad('check_in cannot be in the past', 400, 'past_dates');
  if (check_out < check_in) return bad('check_out must be on/after check_in');
  // half_day is a same-day stay (check_out may equal check_in). Overnight
  // packages must span at least one night.
  if (pkg !== 'half_day' && check_out <= check_in) {
    return bad('check_out must be after check_in for overnight stays');
  }

  // Fetch the room type (anon read) to snapshot price server-side (never trust client).
  const anon = publicClient();
  const { data: room, error: roomErr } = await anon
    .from('room_types')
    .select('*')
    .eq('slug', roomSlug)
    .maybeSingle();
  if (roomErr || !room) return bad('room not found', 404, 'not_found');

  // Clamp guests to the room type's capacity (UI caps it too; server enforces).
  const adults = Math.min(Math.max(1, Number(body.adults ?? 1) || 1), (room as RoomType).max_occupancy || 16);
  const children = Math.min(Math.max(0, Number(body.children ?? 0) || 0), 20);

  const rt = room as RoomType;
  const { unit, quantity, total } = estimateTotal(rt, pkg, check_in, check_out);
  if (unit == null) return bad('selected package not available for this room');

  // Soft availability: reject only when CONFIRMED/checked-in holds already fill
  // every sellable room of this type for the requested dates. Pending requests
  // don't consume inventory (admin confirms manually). Overnight only — a
  // same-day half_day stay can't "fill a night", so we skip the gate for it.
  if (pkg !== 'half_day') {
    const { data: avail } = await anon
      .rpc('room_type_availability', { p_slug: roomSlug, p_check_in: check_in, p_check_out: check_out })
      .maybeSingle();
    if (avail && avail.available <= 0) {
      return bad('Fully booked for the selected dates. Please try other dates.', 409, 'fully_booked');
    }
  }

  // Insert via service-role so we can also write the activity log atomically-ish.
  const admin = await createSupabaseAdminClient();
  const row = {
    room_type_id: rt.id,
    guest_name,
    guest_email,
    guest_phone,
    package: pkg,
    check_in,
    check_out,
    adults,
    children,
    nights: pkg === 'half_day' ? 0 : nightsBetween(check_in, check_out),
    unit_price: unit,
    quantity,
    total_price: total ?? 0,
    special_requests,
    status: 'pending' as const,
    source: 'website',
  };

  // Retry on the (astronomically rare) reference-uniqueness collision (23505),
  // letting the DB default regenerate the reference each attempt.
  let created: { reference: string; total_price: number } | null = null;
  let insErr: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await admin.from('bookings').insert(row).select('reference, total_price').single();
    if (!res.error) { created = res.data; insErr = null; break; }
    insErr = res.error;
    if (res.error.code !== '23505') break; // not a collision — don't retry
  }

  if (insErr || !created) {
    console.error('[POST /api/bookings]', insErr?.message);
    return bad('Could not create booking', 500);
  }

  // Audit log (best-effort).
  await admin.from('activity_logs').insert({
    action: 'booking.created',
    category: 'booking',
    message: `New reservation ${created.reference} — ${rt.name} (${pkg}) for ${guest_name}`,
    actor: 'public',
    entity_type: 'booking',
    metadata: { reference: created.reference, room: rt.slug, package: pkg, ip: clientAddress ?? null },
  });

  // WA notification to the admin (best-effort; never fails the booking).
  const env = getEnv();
  if (env.WA_ADMIN_PHONE) {
    await sendWaText(
      env,
      env.WA_ADMIN_PHONE,
      bookingAdminMessage({
        reference: created.reference,
        guest_name,
        guest_phone,
        guest_email,
        package: pkg,
        check_in,
        check_out,
        adults,
        children,
        total_price: created.total_price,
        special_requests,
        room_type_name: rt.name,
      }),
    );
  }

  return new Response(
    JSON.stringify({ reference: created.reference, total: created.total_price }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  );
};
