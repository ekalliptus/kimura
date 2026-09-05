/// <reference types="@cloudflare/workers-types" />
/// <reference types="astro/client" />
/// <reference types="geojson" />
/// <reference path="../worker-configuration.d.ts" />

// `wrangler types` generates bindings/vars from wrangler.jsonc into
// worker-configuration.d.ts (ASSETS, SESSION, …). Secrets set via
// `wrangler secret put` (or local .dev.vars) are NOT there — augment the
// generated Cloudflare.Env here so `import { env } from 'cloudflare:workers'`
// and `locals.runtime.env` are typed.
interface SupabaseSecrets {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// Feature-flagged integrations (WhatsApp, Midtrans). Absent = feature off.
interface IntegrationEnv {
  WA_ENABLED?: string;
  WA_PROVIDER?: string;
  WA_API_TOKEN?: string;
  WA_ADMIN_PHONE?: string;
  MIDTRANS_SERVER_KEY?: string;
  MIDTRANS_CLIENT_KEY?: string;
  MIDTRANS_IS_PRODUCTION?: string;
}

declare namespace Cloudflare {
  interface Env extends SupabaseSecrets, IntegrationEnv {}
}

// The generated worker-configuration.d.ts declares a global `interface Env`
// (used by worker.ts's handler signature). Augment it with the same secrets.
interface Env extends SupabaseSecrets, IntegrationEnv {}

// Astro SSR locals: the CF runtime is exposed under Astro.locals.runtime.
declare namespace App {
  interface Locals {
    runtime: {
      env: Cloudflare.Env;
      cf: CfProperties;
      ctx: ExecutionContext;
    };
    // Populated by src/middleware.ts on /admin routes.
    user?: { id: string; email: string | null } | null;
    isAdmin?: boolean;
  }
}
