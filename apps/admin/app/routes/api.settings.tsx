import type { Route } from './+types/api.settings';
import type { Database } from '@kimura/core/database.types';
import { getAdminIdentity } from '~/lib/auth.server';
import { getAdminClient } from '~/lib/supabase.server';

const FIELDS = [
  'name', 'tagline_id', 'tagline_en', 'phone', 'whatsapp', 'email',
  'address', 'address_short', 'maps_url', 'check_in_time', 'check_out_time',
] as const;

const NUMERIC = ['maps_lat', 'maps_lng'] as const;

// PATCH /api/admin/settings → update the property_settings singleton (id = 1).
export async function action({ request }: Route.ActionArgs) {
  const admin = await getAdminIdentity(request);
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (request.method !== 'PATCH') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (body[f] !== undefined) patch[f] = String(body[f]).trim();
  }
  for (const f of NUMERIC) {
    if (body[f] !== undefined) {
      const n = Number(body[f]);
      if (!Number.isFinite(n)) return Response.json({ error: `${f} must be a number` }, { status: 400 });
      patch[f] = n;
    }
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'nothing to update' }, { status: 400 });
  }

  const svc = getAdminClient();
  const { error } = await svc
    .from('property_settings')
    .update(patch as Database['public']['Tables']['property_settings']['Update'])
    .eq('id', 1);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await svc.from('activity_logs').insert({
    action: 'property.updated',
    category: 'room',
    message: `Property settings updated by ${admin.email}`,
    actor: admin.email,
    actor_id: admin.id,
    entity_type: 'property_settings',
    entity_id: '1',
    metadata: patch,
  });

  return Response.json({ ok: true });
}
