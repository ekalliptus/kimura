import { handle } from '@astrojs/cloudflare/handler';
import { createClient } from '@supabase/supabase-js';

// Allowed resize widths — MUST match IMG_WIDTHS in src/lib/img.ts. Clamping to a
// fixed list bounds the number of unique transformations (the billed unit), so a
// malicious `?w=<arbitrary>` can't blow past Cloudflare's 5,000/month free tier.
const IMG_WIDTHS = new Set([320, 480, 640, 800, 1280, 1920]);
// Only proxy images from the Cloudbeds CDN. Prevents the route being used as an
// open image proxy for arbitrary origins (abuse + cost vector).
const IMG_HOST = /^h-img\d+\.cloudbeds\.com$/;
// Uploaded room photos: the Supabase public `room-images` bucket. Allow ONLY
// this exact path prefix on the Supabase host — a bare host check would proxy
// every public bucket. MUST stay in sync with canOptimize() in
// packages/core/src/img.ts. Host is derived per-request from env.SUPABASE_URL.
const SUPABASE_IMG_PREFIX = '/storage/v1/object/public/room-images/';

/**
 * GET /_img?w=&q=&src= — edge image optimization via Cloudflare Image
 * Transformations. Resizes the remote Cloudbeds source and negotiates AVIF/WebP
 * from the Accept header. Returns null when the request isn't a valid /_img call
 * so the caller falls through to Astro SSR.
 */
async function handleImage(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/_img') return null;
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const src = url.searchParams.get('src');
  const w = Number(url.searchParams.get('w') ?? '800');
  const q = Number(url.searchParams.get('q') ?? '80');
  if (!src) return new Response('Missing src', { status: 400 });

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return new Response('Bad src', { status: 400 });
  }
  let supabaseHost = '';
  try {
    supabaseHost = new URL(env.SUPABASE_URL).hostname;
  } catch { /* unset/malformed → Supabase source simply not allowed */ }
  const allowed =
    IMG_HOST.test(target.hostname) ||
    (target.hostname === supabaseHost && target.pathname.startsWith(SUPABASE_IMG_PREFIX));
  if (target.protocol !== 'https:' || !allowed) {
    return new Response('Host not allowed', { status: 403 });
  }
  if (!IMG_WIDTHS.has(w)) return new Response('Width not allowed', { status: 400 });
  // Quantize quality — arbitrary floats would mint unique edge transformations
  // and burn the billed quota.
  const quality = Math.min(100, Math.max(40, Math.round((Number.isFinite(q) ? q : 80) / 10) * 10));

  // Content negotiation: prefer AVIF, then WebP, else let CF pick.
  const accept = request.headers.get('Accept') ?? '';
  const format: 'avif' | 'webp' | undefined = /image\/avif/.test(accept)
    ? 'avif'
    : /image\/webp/.test(accept)
      ? 'webp'
      : undefined;

  const resized = await fetch(target.toString(), {
    cf: {
      image: { width: w, quality, fit: 'scale-down', ...(format ? { format } : {}) },
      // Cache the transformed result hard at the edge.
      cacheTtl: 60 * 60 * 24 * 30,
      cacheEverything: true,
    },
  } as RequestInit);

  if (!resized.ok) {
    // Fall back to the original image rather than showing a broken element.
    return fetch(target.toString());
  }

  const headers = new Headers(resized.headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Vary', 'Accept');
  return new Response(resized.body, { status: resized.status, headers });
}

/**
 * Custom Worker entry. Astro generates only a `fetch` handler; we wrap it so a
 * `scheduled()` cron can live alongside SSR. `wrangler.jsonc > main` points here.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const img = await handleImage(request, env);
    if (img) return img;
    return handle(request, env, ctx);
  },

  /**
   * Cron (Mon & Thu 07:17 UTC). Hits Postgres so Supabase free-tier never pauses,
   * and records the ping into keep_alive + activity_logs for the admin dashboard.
   */
  async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const startedAt = Date.now();
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      global: { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    try {
      // 1. Activity ping — resets the inactivity clock.
      const { error: pingErr } = await supabase
        .from('keep_alive')
        .update({ pinged_at: new Date().toISOString() })
        .eq('id', 1);
      if (pingErr) throw pingErr;

      // 2. Audit trail for the admin "keep-alive status" panel.
      await supabase.from('activity_logs').insert({
        action: 'keepalive.ping',
        category: 'system',
        message: `Supabase keep-alive ping OK (${Date.now() - startedAt}ms)`,
        actor: 'cron',
        metadata: { cron: event.cron, scheduledTime: event.scheduledTime },
      });

      console.log('[keep-alive] ok', event.cron, `${Date.now() - startedAt}ms`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[keep-alive] FAILED', message);
      // Best-effort failure record (may itself fail if the DB is down).
      try {
        await supabase.from('activity_logs').insert({
          action: 'keepalive.fail',
          category: 'system',
          message: `Supabase keep-alive FAILED: ${message}`,
          actor: 'cron',
          metadata: { cron: event.cron },
        });
      } catch {
        /* swallow — nothing more we can do */
      }
    }
  },
} satisfies ExportedHandler<Env>;
