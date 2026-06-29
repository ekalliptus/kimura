import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getEnv } from '@/lib/env';

const LOGIN_PATH = '/admin/login';

/**
 * Guards /admin/*. Verifies the Supabase session (getUser → network-verified)
 * and that the user is in the admins allowlist (is_admin RPC). Unauthenticated
 * or non-admin users are redirected to the login page.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { url, locals, request, cookies, redirect } = context;
  const path = url.pathname;

  const isAdminArea = path === '/admin' || path.startsWith('/admin/');
  const isLogin = path === LOGIN_PATH;
  const isAuthApi = path.startsWith('/api/admin/auth');

  if (!isAdminArea || isLogin || isAuthApi) {
    return next();
  }

  const env = getEnv();
  if (!env.SUPABASE_URL) {
    // Env not wired yet (e.g. running without .dev.vars) — send to login.
    return redirect(LOGIN_PATH);
  }

  const supabase = createSupabaseServerClient({ request, cookies, env });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return redirect(`${LOGIN_PATH}?next=${encodeURIComponent(path)}`);
  }

  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    return redirect(`${LOGIN_PATH}?error=not_admin`);
  }

  locals.user = { id: user.id, email: user.email ?? null };
  locals.isAdmin = true;
  return next();
});
