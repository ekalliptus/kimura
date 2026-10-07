import type { Route } from './+types/api.keepalive';
import { getServerClient, getAdminClient } from '~/lib/supabase.server';
import { sameOrigin } from '~/lib/request.server';

// POST → manually fire a keep-alive ping (same as the web worker's cron).
export async function action({ request }: Route.ActionArgs) {
  if (!sameOrigin(request)) return Response.json({ error: 'Bad origin' }, { status: 403 });
  const { supabase, headers } = getServerClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const svc = getAdminClient();
  const start = Date.now();
  const { error } = await svc.from('keep_alive').update({ pinged_at: new Date().toISOString() }).eq('id', 1);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await svc.from('activity_logs').insert({
    action: 'keepalive.manual',
    category: 'system',
    message: `Manual keep-alive ping by ${user.email} (${Date.now() - start}ms)`,
    actor: user.email ?? 'admin',
    actor_id: user.id,
  });
  const { data: ka } = await svc.from('keep_alive').select('*').eq('id', 1).maybeSingle();
  // Refreshed auth cookies must reach the browser or long-lived tabs drop the session.
  return Response.json({ ok: true, keep_alive: ka, elapsed_ms: Date.now() - start }, { headers });
}
