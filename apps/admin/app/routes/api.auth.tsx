import type { Route } from './+types/api.auth';
import { getServerClient } from '~/lib/supabase.server';

// POST → sign in (email/password), sets session cookies. DELETE → sign out.
export async function action({ request }: Route.ActionArgs) {

  if (request.method === 'DELETE') {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);
    if (origin && new URL(origin).host !== url.host) {
      return Response.json({ error: 'Bad origin' }, { status: 403 });
    }
    const { supabase, headers } = getServerClient(request);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    await supabase.auth.signOut();
    return Response.json({ ok: true }, { headers });
  }

  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

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
    return Response.json({ error: 'Email and password required' }, { status: 400 });
  }

  const { supabase, headers } = getServerClient(request);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return Response.json({ error: error?.message ?? 'Invalid credentials' }, { status: 401 });
  }

  // Enforce admin allowlist at login (defence in depth). Cookies from signIn are
  // NOT returned on failure, so a non-admin sign-in leaves no session behind.
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    await supabase.auth.signOut();
    return Response.json({ error: 'This account is not an administrator.' }, { status: 403 });
  }

  await supabase.from('activity_logs').insert({
    action: 'auth.login',
    category: 'auth',
    message: `Admin signed in: ${email}`,
    actor: email,
    actor_id: data.user.id,
  });

  return Response.json({ ok: true }, { headers });
}
