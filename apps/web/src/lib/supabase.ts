import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@kimura/core/database.types';
import { adminClient } from '@kimura/core/supabase';
import { getEnv } from './env';

/**
 * SERVICE-ROLE client. Bypasses RLS. SERVER-ONLY — never import into a React
 * island or any client-reachable path. `env` resolves from the worker runtime
 * when omitted (e.g. inside scheduled()).
 */
export async function createSupabaseAdminClient(
  env: Cloudflare.Env = getEnv(),
): Promise<SupabaseClient<Database>> {
  return adminClient(env);
}
