import { createClient } from '@supabase/supabase-js';
import type { Database, RoomType } from './database.types';
import { getEnv } from './env';

/**
 * Read-only Supabase client for public pages. Uses the anon key (RLS allows
 * public SELECT on room_types/rooms). `env` resolved from the runtime by default.
 */
export function publicClient(env: Cloudflare.Env = getEnv()) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getRoomTypes(env: Cloudflare.Env = getEnv()): Promise<RoomType[]> {
  const supabase = publicClient(env);
  const { data, error } = await supabase
    .from('room_types')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[getRoomTypes]', error.message);
    return [];
  }
  return data ?? [];
}

export async function getRoomType(slug: string, env: Cloudflare.Env = getEnv()): Promise<RoomType | null> {
  const supabase = publicClient(env);
  const { data, error } = await supabase
    .from('room_types')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    console.error('[getRoomType]', error.message);
    return null;
  }
  return data;
}

export async function getRoomAvailability(
  slug: string,
  checkIn: string,
  checkOut: string,
  env: Cloudflare.Env = getEnv()
): Promise<{ total: number; booked: number; available: number } | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.warn('[getRoomAvailability] Missing Supabase credentials');
    return null;
  }
  try {
    const supabase = publicClient(env);
    const { data, error } = await supabase
      .rpc('room_type_availability', {
        p_slug: slug,
        p_check_in: checkIn,
        p_check_out: checkOut,
      })
      .maybeSingle();
    if (error) {
      console.error('[getRoomAvailability]', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[getRoomAvailability] Exception:', err);
    return null;
  }
}
