/**
 * Single source for Cloudflare env access.
 *
 * `Astro.locals.runtime.env` was REMOVED in @astrojs/cloudflare v14 / Astro 6 —
 * it throws at runtime. The supported path is the `cloudflare:workers` module,
 * whose `env` is a live proxy valid in any SSR request and in the worker's
 * scheduled() handler. Under `astro dev`, the adapter loads `.dev.vars` into
 * `process.env`, so we fall back to that when the module env is missing keys.
 */
import { env as cfEnv } from 'cloudflare:workers';

export function getEnv(): Cloudflare.Env {
  const e = cfEnv as unknown as Partial<Cloudflare.Env>;
  // Dev fallback: adapter injects .dev.vars into process.env, not the module env.
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  return {
    ...p,
    ...e,
    SUPABASE_URL: e.SUPABASE_URL ?? p.SUPABASE_URL ?? '',
    SUPABASE_ANON_KEY: e.SUPABASE_ANON_KEY ?? p.SUPABASE_ANON_KEY ?? '',
    SUPABASE_SERVICE_ROLE_KEY: e.SUPABASE_SERVICE_ROLE_KEY ?? p.SUPABASE_SERVICE_ROLE_KEY ?? '',
  } as Cloudflare.Env;
}
