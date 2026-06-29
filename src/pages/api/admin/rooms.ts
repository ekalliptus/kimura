import type { APIRoute } from 'astro';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase';
import type { RoomState, Database } from '@/lib/database.types';

export const prerender = false;

const STATES: RoomState[] = ['available', 'occupied', 'maintenance', 'cleaning'];

async function requireAdmin(request: Request, cookies: any) {
  const supabase = createSupabaseServerClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: isAdmin } = await supabase.rpc('is_admin');
  return isAdmin ? { id: user.id, email: user.email ?? 'admin' } : null;
}

// PATCH /api/admin/rooms → update a physical room's state, or a room_type field.
export const PATCH: APIRoute = async ({ request, cookies }) => {
  const admin = await requireAdmin(request, cookies);
  if (!admin) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const body = (await request.json()) as {
    kind: 'room' | 'room_type';
    id: string;
    state?: RoomState;
    active?: boolean;
    field?: 'price_half_day' | 'price_daily' | 'price_weekly' | 'price_monthly' | 'featured' | 'active';
    value?: number | boolean | null;
  };
  if (!body.id || !body.kind) return new Response(JSON.stringify({ error: 'id and kind required' }), { status: 400 });

  const svc = await createSupabaseAdminClient();

  if (body.kind === 'room') {
    const patch: Record<string, unknown> = {};
    if (body.state) {
      if (!STATES.includes(body.state)) return new Response(JSON.stringify({ error: 'invalid state' }), { status: 400 });
      patch.state = body.state;
    }
    if (body.active !== undefined) patch.active = body.active;
    const { data, error } = await svc.from('rooms').update(patch as Database['public']['Tables']['rooms']['Update']).eq('id', body.id).select('room_number').single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    await svc.from('activity_logs').insert({
      action: 'room.updated', category: 'room',
      message: `Room ${data.room_number} updated (${JSON.stringify(patch)}) by ${admin.email}`,
      actor: admin.email, actor_id: admin.id, entity_type: 'room', entity_id: body.id, metadata: patch,
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // room_type field edit (pricing / featured / active)
  if (!body.field) return new Response(JSON.stringify({ error: 'field required' }), { status: 400 });
  const patch = { [body.field]: body.value } as Record<string, unknown>;
  const { data, error } = await svc.from('room_types').update(patch as Database['public']['Tables']['room_types']['Update']).eq('id', body.id).select('name').single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  await svc.from('activity_logs').insert({
    action: 'room_type.updated', category: 'room',
    message: `Room type "${data.name}" — ${body.field} set to ${body.value} by ${admin.email}`,
    actor: admin.email, actor_id: admin.id, entity_type: 'room_type', entity_id: body.id, metadata: patch,
  });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
