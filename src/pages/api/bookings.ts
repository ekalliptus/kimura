import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { estimateTotal, nightsBetween } from '@/lib/format';
import type { RoomType, StayPackage } from '@/lib/database.types';
import { publicClient } from '@/lib/queries';

export const prerender = false;

const PACKAGES: StayPackage[] = ['half_day', 'daily', 'weekly', 'monthly'];

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad('Invalid JSON');
  }

  const roomSlug = String(body.room_slug ?? '').trim();
  const pkg = String(body.package ?? 'daily') as StayPackage;
  const guest_name = String(body.guest_name ?? '').trim();
  const guest_email = String(body.guest_email ?? '').trim();
  const guest_phone = String(body.guest_phone ?? '').trim();
  const check_in = String(body.check_in ?? '').trim();
  const check_out = String(body.check_out ?? '').trim();
  const adults = Math.max(1, Number(body.adults ?? 1));
  const children = Math.max(0, Number(body.children ?? 0));
  const special_requests = String(body.special_requests ?? '').trim() || null;

  // --- validation ---
  if (!roomSlug) return bad('room_slug is required');
  if (!PACKAGES.includes(pkg)) return bad('invalid package');
  if (!guest_name) return bad('guest_name is required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guest_email)) return bad('valid guest_email is required');
  if (guest_phone.replace(/\D/g, '').length < 8) return bad('valid guest_phone is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(check_in)) return bad('valid check_in is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(check_out)) return bad('valid check_out is required');
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
  if (roomErr || !room) return bad('room not found', 404);

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
      return bad('Fully booked for the selected dates. Please try other dates.', 409);
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
    nights: nightsBetween(check_in, check_out),
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

  return new Response(
    JSON.stringify({ reference: created.reference, total: created.total_price }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  );
};
