import { getPropertySettings } from '@kimura/core/property';
import { publicClient } from './queries';

/**
 * Property identity for public pages (name, contact, tagline). Reads the
 * `property_settings` singleton; falls back to the HOTEL constant when the
 * table is missing or empty. One small anon query per component that needs it.
 */
export function getSiteSettings() {
  return getPropertySettings(publicClient());
}
