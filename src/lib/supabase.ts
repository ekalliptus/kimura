import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import type { Database } from './database.types';
import { getEnv } from './env';

const nativeFetch = { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) };

/**
 * ANON, cookie-bound, RLS-respecting client for user/admin sessions.
 * Instantiate per request. `env` optional — resolved from the runtime if omitted.
 */
export function createSupabaseServerClient(opts: {
  request: Request;
  cookies: AstroCookies;
  env?: Cloudflare.Env;
}): SupabaseClient<Database> {
  const { request, cookies } = opts;
  const env = opts.env ?? getEnv();
  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: nativeFetch,
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '').map((c) => ({
          name: c.name,
          value: c.value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookies.set(name, value, options),
        );
      },
    },
  });
}

/**
 * SERVICE-ROLE client. Bypasses RLS. SERVER-ONLY — never import into a React
 * island or any client-reachable path. `env` optional: resolves from the
 * worker runtime when omitted (e.g. inside scheduled()).
 */
export async function createSupabaseAdminClient(
  env?: Cloudflare.Env,
): Promise<SupabaseClient<Database>> {
  const e = env ?? getEnv();
  return createClient<Database>(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    global: nativeFetch,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
