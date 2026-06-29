import type { APIRoute } from 'astro';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase';
import type { BookingStatus, Database } from '@/lib/database.types';

export const prerender = false;

const VALID: BookingStatus[] = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'];

/** Verify the caller is an admin; returns their email or null. */
async function requireAdmin(request: Request, cookies: any) {
  const supabase = createSupabaseServerClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) return null;
  return { id: user.id, email: user.email ?? 'admin' };
}

// PATCH /api/admin/bookings → update status / room / notes for a booking.
export const PATCH: APIRoute = async ({ request, cookies }) => {
  const admin = await requireAdmin(request, cookies);
  if (!admin) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const body = (await request.json()) as {
    id?: string;
    status?: BookingStatus;
    room_id?: string | null;
    admin_notes?: string;
  };
  if (!body.id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.status) {
    if (!VALID.includes(body.status)) return new Response(JSON.stringify({ error: 'invalid status' }), { status: 400 });
    patch.status = body.status;
    if (body.status === 'confirmed') patch.confirmed_at = new Date().toISOString();
    if (body.status === 'cancelled') patch.cancelled_at = new Date().toISOString();
  }
  if (body.room_id !== undefined) patch.room_id = body.room_id;
  if (body.admin_notes !== undefined) patch.admin_notes = body.admin_notes;

  if (Object.keys(patch).length === 0) {
    return new Response(JSON.stringify({ error: 'nothing to update' }), { status: 400 });
  }

  // Use service-role for the write + log (bypasses RLS; we've already authorised).
  const svc = await createSupabaseAdminClient();
  const { data, error } = await svc
    .from('bookings')
    .update(patch as Database['public']['Tables']['bookings']['Update'])
    .eq('id', body.id)
    .select('reference, status')
    .single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: error?.message ?? 'update failed' }), { status: 500 });
  }

  await svc.from('activity_logs').insert({
    action: body.status ? 'booking.status_changed' : 'booking.updated',
    category: 'booking',
    message: body.status
      ? `Booking ${data.reference} → ${data.status} by ${admin.email}`
      : `Booking ${data.reference} updated by ${admin.email}`,
    actor: admin.email,
    actor_id: admin.id,
    entity_type: 'booking',
    entity_id: body.id,
    metadata: patch,
  });

  return new Response(JSON.stringify({ ok: true, reference: data.reference, status: data.status }), { status: 200 });
};
