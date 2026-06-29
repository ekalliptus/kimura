import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '@/lib/supabase';
import { adminLang } from '@/lib/admin-i18n';

export const prerender = false;

// POST /api/admin/lang → toggle admin_lang cookie (id ↔ en). Admins only.
export const POST: APIRoute = async ({ request, cookies, url }) => {
  // CSRF: only accept same-origin POSTs.
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== url.host) {
    return new Response(JSON.stringify({ error: 'Bad origin' }), { status: 403 });
  }
  // Require an authenticated admin (reuse the guard pattern).
  const supabase = createSupabaseServerClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  const current = adminLang(cookies.get('admin_lang')?.value);
  const next = current === 'id' ? 'en' : 'id';
  cookies.set('admin_lang', next, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 24 * 365,
  });

  return new Response(JSON.stringify({ lang: next }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
