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

export const IMG_WIDTHS = new Set([320, 480, 640, 800, 1280, 1920]);
const IMG_BUCKET_ORDER = [...IMG_WIDTHS].sort((a, b) => a - b);

const ALLOWED_HOST = /^h-img\d+\.cloudbeds\.com$/;
// Uploaded room photos live in the Supabase public `room-images` bucket. Allow
// ONLY that host + path prefix — a bare host check would make /_img an open proxy
// for every public bucket. The host is the project's own SUPABASE_URL host;
// the /_img route derives it per-request from env (keep checks in sync).
const SUPABASE_IMG_PREFIX = '/storage/v1/object/public/room-images/';

export function supabaseImgHost(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return '';
  }
}

/** Smallest allowed bucket ≥ requested width (or the largest bucket). */
function bucket(width: number): number {
  return IMG_BUCKET_ORDER.find((w) => w >= width) ?? IMG_BUCKET_ORDER[IMG_BUCKET_ORDER.length - 1];
}

/** Runtime check with the live host (used by the /_img route). */
export function canOptimizeWithHost(src: string, imgHost: string): boolean {
  if (!src || !imgHost) return false;
  try {
    const u = new URL(src);
    if (ALLOWED_HOST.test(u.hostname)) return true;
    return u.hostname === imgHost && u.pathname.startsWith(SUPABASE_IMG_PREFIX);
  } catch {
    return false;
  }
}

/**
 * Build-time variant used by cdnImage/cdnSrcset during SSR render: the render
 * env supplies the host. Kept as a thin wrapper so call sites stay env-free.
 */
let activeImgHost = '';
export function setSupabaseImgHost(supabaseUrl: string): void {
  activeImgHost = supabaseImgHost(supabaseUrl);
}

export function canOptimize(src: string | null | undefined): src is string {
  return canOptimizeWithHost(src ?? '', activeImgHost);
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
