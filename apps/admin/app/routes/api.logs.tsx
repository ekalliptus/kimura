import type { Route } from './+types/api.logs';
import { getAdminIdentity } from '~/lib/auth.server';
import { getServerClient } from '~/lib/supabase.server';

// GET /api/admin/logs?since=<iso>&category=<cat>&limit=<n> — live console poller.
export async function loader({ request }: Route.LoaderArgs) {
  const admin = await getAdminIdentity(request);
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const since = url.searchParams.get('since');
  const category = url.searchParams.get('category');
  const limit = Math.min(200, Number(url.searchParams.get('limit') ?? 50));

  const { supabase, headers } = getServerClient(request);
  let q = supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (since) q = q.gt('created_at', since);
  if (category && category !== 'all') q = q.eq('category', category);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // Refreshed auth cookies must reach the browser or long-lived pollers drop the session.
  return Response.json({ logs: data ?? [] }, { headers });
}
