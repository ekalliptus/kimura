/**
 * Image optimization helpers — produce URLs served by the `/_img` Worker route
 * (see src/worker.ts), which runs Cloudflare Image Transformations on the
 * remote Cloudbeds source. Resizing + AVIF/WebP negotiation happens at the edge.
 *
 * Cost guard: widths are clamped to a fixed bucket list both here AND in the
 * Worker. Each (width × format) is one "unique transformation" billed once per
 * month; bounding the buckets keeps total uniques tiny (≈ images × 6 × 2), well
 * under Cloudflare's 5,000/month free allowance.
 *
 * Dev fallback: under `astro dev` (Node, no Worker), the `/_img` route doesn't
 * exist, so we passthrough the original URL. Optimization only kicks in on the
 * deployed Worker (import.meta.env.PROD).
 */

// Keep in sync with IMG_WIDTHS in src/worker.ts.
export const IMG_WIDTHS = [320, 480, 640, 800, 1280, 1920] as const;

const ALLOWED_HOST = /^h-img\d+\.cloudbeds\.com$/;
// Uploaded room photos live in the Supabase public `room-images` bucket. Allow
// ONLY that host + path prefix — a bare host check would make /_img an open proxy
// for every public bucket. MUST stay in sync with the same check in
// apps/web/src/worker.ts (which derives the host from env.SUPABASE_URL).
const SUPABASE_IMG_HOST = 'ptrbczteqpyamwasidai.supabase.co';
const SUPABASE_IMG_PREFIX = '/storage/v1/object/public/room-images/';

/** Smallest allowed bucket ≥ requested width (or the largest bucket). */
function bucket(width: number): number {
  return IMG_WIDTHS.find((w) => w >= width) ?? IMG_WIDTHS[IMG_WIDTHS.length - 1];
}

export function canOptimize(src: string | null | undefined): src is string {
  if (!src) return false;
  try {
    const u = new URL(src);
    if (ALLOWED_HOST.test(u.hostname)) return true;
    return u.hostname === SUPABASE_IMG_HOST && u.pathname.startsWith(SUPABASE_IMG_PREFIX);
  } catch {
    return false;
  }
}

/**
 * Optimized URL for a remote image. Returns the original URL unchanged in dev,
 * or for any non-whitelisted source.
 */
export function cdnImage(src: string, width: number, quality = 80): string {
  if (!import.meta.env.PROD || !canOptimize(src)) return src;
  const w = bucket(width);
  return `/_img?w=${w}&q=${quality}&src=${encodeURIComponent(src)}`;
}

/**
 * Responsive `srcset` across the given widths. Returns `undefined` when
 * optimization is unavailable (dev / non-whitelisted) so the attribute is
 * omitted rather than emitted empty.
 */
export function cdnSrcset(src: string, widths: number[], quality = 80): string | undefined {
  if (!import.meta.env.PROD || !canOptimize(src)) return undefined;
  const seen = new Set<number>();
  const parts: string[] = [];
  for (const requested of widths) {
    const w = bucket(requested);
    if (seen.has(w)) continue;
    seen.add(w);
    parts.push(`${cdnImage(src, w, quality)} ${w}w`);
  }
  return parts.length ? parts.join(', ') : undefined;
}
