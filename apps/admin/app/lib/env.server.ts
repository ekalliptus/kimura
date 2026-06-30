// Single source for Cloudflare env in the admin worker. The @cloudflare/vite-plugin
// runs SSR inside workerd, where `cloudflare:workers`'s `env` proxy is valid in any
// request scope (loaders/actions). Mirrors apps/web/src/lib/env.server.ts.
import { env } from 'cloudflare:workers';

export function getEnv(): Env {
  return env as unknown as Env;
}
