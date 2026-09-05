// Cloudflare Worker env bindings for the admin app. `wrangler types` regenerates
// from wrangler.jsonc; secrets (set via `wrangler secret put` / .dev.vars) are
// declared here so loaders/actions are typed. Integration vars are optional —
// absent means the feature is off.
interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ASSETS: Fetcher;
  WA_ENABLED?: string;
  WA_PROVIDER?: string;
  WA_API_TOKEN?: string;
  WA_ADMIN_PHONE?: string;
}

// The @cloudflare/vite-plugin runs SSR in workerd, where this module's `env`
// proxy is valid in any request scope (loaders/actions). Mirrors the web app.
declare module 'cloudflare:workers' {
  export const env: Env;
}
