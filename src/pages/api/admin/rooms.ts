import type { APIRoute } from 'astro';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase';
import type { RoomState, Database } from '@/lib/database.types';

export const prerender = false;

const STATES: RoomState[] = ['available', 'occupied', 'maintenance', 'cleaning'];

/** ASCII-slugify a name → kebab-case. For auto-generating room_type.slug. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function requireAdmin(request: Request, cookies: any) {
  const supabase = createSupabaseServerClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: isAdmin } = await supabase.rpc('is_admin');
  return isAdmin ? { id: user.id, email: user.email ?? 'admin' } : null;
}

// POST /api/admin/rooms → create a room_type or a physical room.
//   body.kind = 'room_type' | 'room'
export const POST: APIRoute = async ({ request, cookies }) => {
  const admin = await requireAdmin(request, cookies);
  if (!admin) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const body = (await request.json()) as {
    kind: 'room_type' | 'room';
    // room_type fields
    name?: string;
    slug?: string;
    name_id?: string;
    description?: string;
    description_id?: string;
    size_sqm?: number;
    max_occupancy?: number;
    bed_config?: string;
    amenities?: string[];
    images?: string[];
    price_half_day?: number | null;
    price_daily?: number | null;
    price_weekly?: number | null;
    price_monthly?: number | null;
    // room fields
    room_number?: string;
    room_type_id?: string;
    floor?: number | null;
    state?: RoomState;
  };

  if (!body.kind) return new Response(JSON.stringify({ error: 'kind required' }), { status: 400 });
  const svc = await createSupabaseAdminClient();

  if (body.kind === 'room_type') {
    const name = (body.name ?? '').trim();
    if (!name) return new Response(JSON.stringify({ error: 'name is required' }), { status: 400 });
    let slug = (body.slug ?? '').trim() || slugify(name);
    if (!slug) slug = `room-${Math.random().toString(36).slice(2, 8)}`;

    const row = {
      name,
      slug,
      name_id: (body.name_id ?? '').trim() || name,
      description: (body.description ?? '').trim() || null,
      description_id: (body.description_id ?? '').trim() || null,
      size_sqm: body.size_sqm ?? null,
      max_occupancy: Math.max(1, Number(body.max_occupancy ?? 2)),
      bed_config: (body.bed_config ?? '').trim() || null,
      amenities: Array.isArray(body.amenities) ? body.amenities.map((a) => a.trim()).filter(Boolean) : [],
      images: Array.isArray(body.images) ? body.images.map((a) => a.trim()).filter(Boolean) : [],
      price_half_day: body.price_half_day ?? null,
      price_daily: body.price_daily ?? null,
      price_weekly: body.price_weekly ?? null,
      price_monthly: body.price_monthly ?? null,
      featured: false,
      active: true,
      sort_order: 100,
    };

    const { data, error } = await svc.from('room_types').insert(row).select('id, slug, name').single();
    if (error) {
      if (error.code === '23505') return new Response(JSON.stringify({ error: 'Slug already in use.' }), { status: 409 });
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    await svc.from('activity_logs').insert({
      action: 'room_type.created', category: 'room',
      message: `Room type "${data.name}" created by ${admin.email}`,
      actor: admin.email, actor_id: admin.id, entity_type: 'room_type', entity_id: data.id, metadata: { slug: data.slug },
    });
    return new Response(JSON.stringify({ ok: true, id: data.id }), { status: 201 });
  }

  // kind === 'room'
  const room_number = (body.room_number ?? '').trim();
  const room_type_id = (body.room_type_id ?? '').trim();
  if (!room_number) return new Response(JSON.stringify({ error: 'room_number is required' }), { status: 400 });
  if (!room_type_id) return new Response(JSON.stringify({ error: 'room_type_id is required' }), { status: 400 });

  const state: RoomState = body.state && STATES.includes(body.state) ? body.state : 'available';
  const row = {
    room_number,
    room_type_id,
    floor: body.floor ?? null,
    state,
    active: true,
  };

  const { data, error } = await svc.from('rooms').insert(row).select('id, room_number').single();
  if (error) {
    if (error.code === '23505') return new Response(JSON.stringify({ error: 'Room number already in use.' }), { status: 409 });
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  await svc.from('activity_logs').insert({
    action: 'room.created', category: 'room',
    message: `Room ${data.room_number} added to inventory by ${admin.email}`,
    actor: admin.email, actor_id: admin.id, entity_type: 'room', entity_id: data.id, metadata: { room_number: data.room_number, room_type_id },
  });
  return new Response(JSON.stringify({ ok: true, id: data.id }), { status: 201 });
};

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
