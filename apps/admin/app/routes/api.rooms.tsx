import type { Route } from './+types/api.rooms';
import type { RoomState, Database } from '@kimura/core/database.types';
import { getAdminIdentity } from '~/lib/auth.server';
import { sameOrigin } from '~/lib/request.server';
import { getAdminClient } from '~/lib/supabase.server';

const STATES: RoomState[] = ['available', 'occupied', 'maintenance', 'cleaning'];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// POST → create a room_type or a physical room. PATCH → update room state or a
// room_type field (pricing / featured / active).
export async function action({ request }: Route.ActionArgs) {
  if (!sameOrigin(request)) return Response.json({ error: 'Bad origin' }, { status: 403 });
  const admin = await getAdminIdentity(request);
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = getAdminClient();

  if (request.method === 'POST') {
    const body = (await request.json()) as Record<string, unknown> & { kind?: 'room_type' | 'room' };
    if (!body.kind) return Response.json({ error: 'kind required' }, { status: 400 });

    if (body.kind === 'room_type') {
      const name = String(body.name ?? '').trim();
      if (!name) return Response.json({ error: 'name is required' }, { status: 400 });
      let slug = String(body.slug ?? '').trim() || slugify(name);
      if (!slug) slug = `room-${Math.random().toString(36).slice(2, 8)}`;

      // Prices: null or non-negative integer (client sends strings via num()).
      const price = (v: unknown): number | null => {
        const n = Number(v);
        return v != null && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
      };

      const row = {
        name,
        slug,
        name_id: String(body.name_id ?? '').trim() || name,
        description: String(body.description ?? '').trim() || null,
        description_id: String(body.description_id ?? '').trim() || null,
        size_sqm: price(body.size_sqm),
        max_occupancy: Math.max(1, Math.round(Number(body.max_occupancy) || 2)),
        bed_config: String(body.bed_config ?? '').trim() || null,
        amenities: Array.isArray(body.amenities) ? (body.amenities as string[]).map((a) => a.trim()).filter(Boolean) : [],
        images: Array.isArray(body.images) ? (body.images as string[]).map((a) => a.trim()).filter(Boolean).slice(0, 12) : [],
        price_half_day: price(body.price_half_day),
        price_daily: price(body.price_daily),
        price_weekly: price(body.price_weekly),
        price_monthly: price(body.price_monthly),
        featured: false,
        active: true,
        sort_order: 100,
      };

      const { data, error } = await svc.from('room_types').insert(row).select('id, slug, name').single();
      if (error) {
        if (error.code === '23505') return Response.json({ error: 'Slug already in use.' }, { status: 409 });
        return Response.json({ error: error.message }, { status: 500 });
      }
      await svc.from('activity_logs').insert({
        action: 'room_type.created', category: 'room',
        message: `Room type "${data.name}" created by ${admin.email}`,
        actor: admin.email, actor_id: admin.id, entity_type: 'room_type', entity_id: data.id, metadata: { slug: data.slug },
      });
      return Response.json({ ok: true, id: data.id }, { status: 201 });
    }

    // kind === 'room'
    const room_number = String(body.room_number ?? '').trim();
    const room_type_id = String(body.room_type_id ?? '').trim();
    if (!room_number) return Response.json({ error: 'room_number is required' }, { status: 400 });
    if (!room_type_id) return Response.json({ error: 'room_type_id is required' }, { status: 400 });

    const state: RoomState = body.state && STATES.includes(body.state as RoomState) ? (body.state as RoomState) : 'available';
    const row = { room_number, room_type_id, floor: (body.floor as number | null) ?? null, state, active: true };

    const { data, error } = await svc.from('rooms').insert(row).select('id, room_number').single();
    if (error) {
      if (error.code === '23505') return Response.json({ error: 'Room number already in use.' }, { status: 409 });
      return Response.json({ error: error.message }, { status: 500 });
    }
    await svc.from('activity_logs').insert({
      action: 'room.created', category: 'room',
      message: `Room ${data.room_number} added to inventory by ${admin.email}`,
      actor: admin.email, actor_id: admin.id, entity_type: 'room', entity_id: data.id, metadata: { room_number: data.room_number, room_type_id },
    });
    return Response.json({ ok: true, id: data.id }, { status: 201 });
  }

  if (request.method === 'PATCH') {
    const body = (await request.json()) as {
      kind: 'room' | 'room_type';
      id: string;
      state?: RoomState;
      active?: boolean;
      field?: 'price_half_day' | 'price_daily' | 'price_weekly' | 'price_monthly' | 'featured' | 'active' | 'images';
      value?: number | boolean | string[] | null;
    };
    if (!body.id || !body.kind) return Response.json({ error: 'id and kind required' }, { status: 400 });

    if (body.kind === 'room') {
      const patch: Record<string, unknown> = {};
      if (body.state) {
        if (!STATES.includes(body.state)) return Response.json({ error: 'invalid state' }, { status: 400 });
        patch.state = body.state;
      }
      if (body.active !== undefined) patch.active = body.active;
      const { data, error } = await svc.from('rooms').update(patch as Database['public']['Tables']['rooms']['Update']).eq('id', body.id).select('room_number').single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      await svc.from('activity_logs').insert({
        action: 'room.updated', category: 'room',
        message: `Room ${data.room_number} updated (${JSON.stringify(patch)}) by ${admin.email}`,
        actor: admin.email, actor_id: admin.id, entity_type: 'room', entity_id: body.id, metadata: patch,
      });
      return Response.json({ ok: true });
    }

    if (!body.field) return Response.json({ error: 'field required' }, { status: 400 });
    // TS type above isn't a runtime guard — enforce the writable column set.
    const WRITABLE = ['price_half_day', 'price_daily', 'price_weekly', 'price_monthly', 'featured', 'active', 'images'] as const;
    if (!WRITABLE.includes(body.field)) return Response.json({ error: 'invalid field' }, { status: 400 });
    let value = body.value;
    if (body.field === 'images') {
      if (!Array.isArray(value)) return Response.json({ error: 'images must be an array' }, { status: 400 });
      value = value.map((u) => String(u).trim()).filter(Boolean).slice(0, 12);
    } else if (body.field === 'featured' || body.field === 'active') {
      if (typeof value !== 'boolean') return Response.json({ error: 'must be boolean' }, { status: 400 });
    } else {
      // Price columns: null clears, otherwise a non-negative integer.
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        return Response.json({ error: 'price must be a non-negative number or null' }, { status: 400 });
      }
      value = typeof value === 'number' ? Math.round(value) : null;
    }
    const patch = { [body.field]: value } as Record<string, unknown>;
    const { data, error } = await svc.from('room_types').update(patch as Database['public']['Tables']['room_types']['Update']).eq('id', body.id).select('name').single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await svc.from('activity_logs').insert({
      action: 'room_type.updated', category: 'room',
      message: `Room type "${data.name}" — ${body.field} updated by ${admin.email}`,
      actor: admin.email, actor_id: admin.id, entity_type: 'room_type', entity_id: body.id, metadata: patch,
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
