// Cloudflare Worker env bindings for the admin app. `wrangler types` regenerates
// from wrangler.jsonc; secrets (set via `wrangler secret put` / .dev.vars) are
// declared here so loaders/actions are typed.
interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ASSETS: Fetcher;
}

// The @cloudflare/vite-plugin runs SSR in workerd, where this module's `env`
// proxy is valid in any request scope (loaders/actions). Mirrors the web app.
declare module 'cloudflare:workers' {
  export const env: Env;
}
