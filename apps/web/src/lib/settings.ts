import { getPropertySettings } from '@kimura/core/property';
import { publicClient } from './queries';

// Module-level 60s cache: BaseLayout, Header and Footer each ask for the same
// row on every render — one query per isolate minute is plenty for name/phone.
let cached: { value: Promise<PropertySettings>; at: number } | undefined;

type PropertySettings = Awaited<ReturnType<typeof getPropertySettings>>;

/**
 * Property identity for public pages (name, contact, tagline). Reads the
 * `property_settings` singleton; falls back to the HOTEL constant when the
 * table is missing or empty.
 */
export function getSiteSettings() {
  if (!cached || Date.now() - cached.at > 60_000) {
    cached = { value: getPropertySettings(publicClient()), at: Date.now() };
  }
  return cached.value;
}
