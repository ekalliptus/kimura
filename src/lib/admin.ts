import type { AstroGlobal } from 'astro';
import { createSupabaseServerClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/** Cookie-bound, RLS-respecting client for admin pages (reads as the admin user). */
export function adminClient(Astro: AstroGlobal): SupabaseClient<Database> {
  return createSupabaseServerClient({
    request: Astro.request,
    cookies: Astro.cookies,
  });
}
