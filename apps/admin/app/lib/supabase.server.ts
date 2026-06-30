import { serializeCookieHeader } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@kimura/core/database.types';
import {
  createServerClientWithCookies,
  adminClient as coreAdminClient,
  parseCookieHeader,
} from '@kimura/core/supabase';
import { getEnv } from './env.server';

/**
 * ANON, cookie-bound, RLS-respecting client for a loader/action. Returns a
 * `headers` bag — any auth cookie the SDK refreshes is appended here; attach it
 * to the loader/action Response so Set-Cookie reaches the browser.
 */
export function getServerClient(request: Request): {
  supabase: SupabaseClient<Database>;
  headers: Headers;
} {
  const headers = new Headers();
  const supabase = createServerClientWithCookies(getEnv(), {
    getAll() {
      return parseCookieHeader(request.headers.get('Cookie') ?? '').map((c) => ({
        name: c.name,
        value: c.value ?? '',
      }));
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) =>
        headers.append('Set-Cookie', serializeCookieHeader(name, value, options)),
      );
    },
  });
  return { supabase, headers };
}

/** SERVICE-ROLE client. Bypasses RLS. SERVER-ONLY. */
export function getAdminClient(): SupabaseClient<Database> {
  return coreAdminClient(getEnv());
}
