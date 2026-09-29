import type { Route } from './+types/api.bookings';
import type { Booking, BookingStatus, Database } from '@kimura/core/database.types';
import { getAdminIdentity } from '~/lib/auth.server';
import { sameOrigin } from '~/lib/request.server';
import { getAdminClient } from '~/lib/supabase.server';
import { notifyStatusChange } from '~/lib/notify.server';

const VALID: BookingStatus[] = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'];

// PATCH /api/admin/bookings → update status / room / notes for a booking.
export async function action({ request }: Route.ActionArgs) {
  if (!sameOrigin(request)) return Response.json({ error: 'Bad origin' }, { status: 403 });
  if (request.method !== 'PATCH') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  const admin = await getAdminIdentity(request);
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    id?: string;
    status?: BookingStatus;
    room_id?: string | null;
    admin_notes?: string;
  };
  if (!body.id) return Response.json({ error: 'id required' }, { status: 400 });

  const svc = getAdminClient();

  const patch: Record<string, unknown> = {};
  if (body.status) {
    if (!VALID.includes(body.status)) return Response.json({ error: 'invalid status' }, { status: 400 });
    patch.status = body.status;
    if (body.status === 'confirmed') patch.confirmed_at = new Date().toISOString();
    if (body.status === 'cancelled') patch.cancelled_at = new Date().toISOString();
  }
  if (body.room_id !== undefined && body.room_id !== null) {
    // The assigned room must exist and belong to the booking's room type.
    const { data: room } = await svc
      .from('rooms')
      .select('id, room_type_id')
      .eq('id', body.room_id)
      .maybeSingle();
    if (!room) return Response.json({ error: 'room not found' }, { status: 400 });
    const { data: bk } = await svc
      .from('bookings')
      .select('room_type_id')
      .eq('id', body.id)
      .single();
    if (bk && room.room_type_id !== bk.room_type_id) {
      return Response.json({ error: "room does not belong to the booking's room type" }, { status: 400 });
    }
    patch.room_id = body.room_id;
  } else if (body.room_id === null) {
    patch.room_id = null;
  }
  if (body.admin_notes !== undefined) patch.admin_notes = body.admin_notes.slice(0, 2000);

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'nothing to update' }, { status: 400 });
  }

  // Confirming consumes inventory — route through the atomic RPC so two
  // simultaneous confirms for the same room_type can't oversell.
  if (body.status === 'confirmed') {
    const { error: rpcErr } = await svc.rpc('confirm_booking', { p_booking_id: body.id });
    if (rpcErr) {
      const full = rpcErr.message.includes('ROOM_FULL');
      return Response.json(
        { error: full ? 'Confirming would oversell this room type for these dates.' : rpcErr.message },
        { status: full ? 409 : 500 },
      );
    }
    delete patch.status;
    delete patch.confirmed_at;
  }

  let data: Booking | null = null;
  if (Object.keys(patch).length > 0) {
    const res = await svc
      .from('bookings')
      .update(patch as Database['public']['Tables']['bookings']['Update'])
      .eq('id', body.id)
      .select('*')
      .single();
    if (res.error || !res.data) {
      return Response.json({ error: res.error?.message ?? 'update failed' }, { status: 500 });
    }
    data = res.data;
  } else {
    const res = await svc.from('bookings').select('*').eq('id', body.id).single();
    if (res.error || !res.data) {
      return Response.json({ error: res.error?.message ?? 'fetch failed' }, { status: 500 });
    }
    data = res.data;
  }

  // Guest + admin WA on confirmed/cancelled (best-effort, never fails the action).
  if (body.status === 'confirmed' || body.status === 'cancelled') {
    const rtRes = await svc.from('room_types').select('name').eq('id', data.room_type_id).single();
    await notifyStatusChange(data, body.status, rtRes.data?.name ?? '', admin.email);
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

  return Response.json({ ok: true, reference: data.reference, status: data.status });
}
