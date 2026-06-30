import { createServerClient, parseCookieHeader, type CookieMethodsServer } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const nativeFetch = { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) };

/**
 * ANON, cookie-bound, RLS-respecting client. Framework-agnostic: the caller
 * supplies a cookie adapter (Astro cookies, RR7 Set-Cookie headers, etc).
 * Use `parseCookieHeader` (re-exported) to build `getAll` from a request.
 */
export function createServerClientWithCookies(
  env: Pick<SupabaseEnv, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'>,
  cookies: CookieMethodsServer,
): SupabaseClient<Database> {
  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: nativeFetch,
    cookies,
  });
}

/** Read-only ANON client for public pages (no session cookies). */
export function publicClient(
  env: Pick<SupabaseEnv, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'>,
): SupabaseClient<Database> {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: nativeFetch,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * SERVICE-ROLE client. Bypasses RLS. SERVER-ONLY — never import into a
 * client-reachable path.
 */
export function adminClient(
  env: Pick<SupabaseEnv, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>,
): SupabaseClient<Database> {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: nativeFetch,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export { parseCookieHeader };
