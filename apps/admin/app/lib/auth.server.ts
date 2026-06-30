import { redirect } from 'react-router';
import { adminLang } from './admin-i18n';
import { getServerClient } from './supabase.server';

/** Read a single cookie value from the request. */
export function getCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Gate a loader/action on an authenticated admin. Verifies the Supabase session
 * (getUser → network-verified) and the admins allowlist (is_admin RPC). Throws a
 * redirect to /login otherwise. Returns the cookie-bound client + a `headers`
 * bag (attach to the Response so any refreshed auth cookie reaches the browser).
 */
export async function requireAdmin(request: Request) {
  const { supabase, headers } = getServerClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  const url = new URL(request.url);

  if (!user) {
    throw redirect(`/login?next=${encodeURIComponent(url.pathname)}`, { headers });
  }
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    throw redirect('/login?error=not_admin', { headers });
  }
  return {
    user: { id: user.id, email: user.email ?? null },
    supabase,
    headers,
    lang: adminLang(getCookie(request, 'admin_lang')),
  };
}

/**
 * Admin check for JSON resource routes: returns the admin identity or null
 * (never redirects — callers respond 401/403 so fetch() doesn't follow into
 * login HTML).
 */
export async function getAdminIdentity(
  request: Request,
): Promise<{ id: string; email: string } | null> {
  const { supabase } = getServerClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) return null;
  return { id: user.id, email: user.email ?? 'admin' };
}
