import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PropertySettings } from './database.types';
import { HOTEL } from './hotel';

export type { PropertySettings };

/**
 * The property's public identity. Sourced from the `property_settings`
 * singleton when present, otherwise identical to the HOTEL constant — a fresh
 * clone without migrations keeps rendering.
 */
export const DEFAULT_SETTINGS: PropertySettings = {
  id: 1,
  name: HOTEL.name,
  tagline_id: 'Penginapan minimalis ala Jepang di Semarang.',
  tagline_en: 'A Japanese-minimalist stay in Semarang.',
  phone: HOTEL.phone,
  whatsapp: HOTEL.whatsapp,
  email: HOTEL.email,
  address: HOTEL.address,
  address_short: HOTEL.addressShort,
  maps_url: HOTEL.mapsUrl,
  maps_lat: HOTEL.lat,
  maps_lng: HOTEL.lng,
  check_in_time: HOTEL.checkIn,
  check_out_time: HOTEL.checkOut,
  updated_at: '',
};

/**
 * Read the singleton row. Best-effort: any error (missing table, outage, empty
 * DB) falls back to DEFAULT_SETTINGS instead of breaking public pages.
 */
export async function getPropertySettings(supabase: SupabaseClient<Database>): Promise<PropertySettings> {
  const { data, error } = await supabase
    .from('property_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  return data;
}

/** Site display name for titles/OG tags, e.g. "Room · Kimura Kostay". */
export function siteName(s: PropertySettings): string {
  return s.name;
}

export function tagline(s: PropertySettings, lang: 'id' | 'en'): string {
  return lang === 'id' ? s.tagline_id : s.tagline_en;
}

export function whatsappLinkFor(s: PropertySettings, message: string): string {
  return `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(message)}`;
}
