import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '@/lib/supabase';

export const prerender = false;

// POST /api/admin/auth  → sign in (email/password). Sets session cookies.
export const POST: APIRoute = async ({ request, cookies }) => {
  let email = '', password = '';
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const b = (await request.json()) as { email?: string; password?: string };
    email = (b.email ?? '').trim();
    password = b.password ?? '';
  } else {
    const f = await request.formData();
    email = String(f.get('email') ?? '').trim();
    password = String(f.get('password') ?? '');
  }

  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password required' }), { status: 400 });
  }

  const supabase = createSupabaseServerClient({ request, cookies });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return new Response(JSON.stringify({ error: error?.message ?? 'Invalid credentials' }), { status: 401 });
  }

  // Enforce admin allowlist at login too (defence in depth).
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    await supabase.auth.signOut();
    return new Response(JSON.stringify({ error: 'This account is not an administrator.' }), { status: 403 });
  }

  await supabase.from('activity_logs').insert({
    action: 'auth.login',
    category: 'auth',
    message: `Admin signed in: ${email}`,
    actor: email,
    actor_id: data.user.id,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

// DELETE /api/admin/auth → sign out.
// This route is exempt from the middleware guard, so verify auth here AND check
// the Origin to prevent a cross-site forced sign-out (CSRF).
export const DELETE: APIRoute = async ({ request, cookies, url }) => {
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== url.host) {
    return new Response(JSON.stringify({ error: 'Bad origin' }), { status: 403 });
  }

  const supabase = createSupabaseServerClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  await supabase.auth.signOut();
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
