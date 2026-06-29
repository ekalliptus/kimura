import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '@/lib/supabase';

export const prerender = false;

// GET /api/admin/logs?since=<iso>&category=<cat>&limit=<n>
// Returns recent activity logs (admin only). Used by the live console poller.
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const supabase = createSupabaseServerClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  const since = url.searchParams.get('since');
  const category = url.searchParams.get('category');
  const limit = Math.min(200, Number(url.searchParams.get('limit') ?? 50));

  let q = supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (since) q = q.gt('created_at', since);
  if (category && category !== 'all') q = q.eq('category', category);

  const { data, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ logs: data ?? [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
