import type { APIRoute } from 'astro';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase';

export const prerender = false;

// POST /api/admin/keepalive → manually fire a keep-alive ping (same as the cron).
// Lets an admin verify the mechanism without waiting for the schedule.
export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  const svc = await createSupabaseAdminClient();
  const start = Date.now();
  const { error } = await svc.from('keep_alive').update({ pinged_at: new Date().toISOString() }).eq('id', 1);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  await svc.from('activity_logs').insert({
    action: 'keepalive.manual',
    category: 'system',
    message: `Manual keep-alive ping by ${user.email} (${Date.now() - start}ms)`,
    actor: user.email ?? 'admin',
    actor_id: user.id,
  });
  const { data: ka } = await svc.from('keep_alive').select('*').eq('id', 1).maybeSingle();
  return new Response(JSON.stringify({ ok: true, keep_alive: ka, elapsed_ms: Date.now() - start }), { status: 200 });
};
