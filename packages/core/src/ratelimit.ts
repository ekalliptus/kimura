/**
 * Per-isolate in-memory sliding-window rate limiter for Cloudflare Workers.
 * Not global (each isolate counts separately) — enough to blunt spam without
 * a Durable Object. Buckets self-clean when checked.
 */
const buckets = new Map<string, number[]>();
let lastSweep = 0;

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [k, hits] of buckets) {
      if (hits.length === 0 || now - hits[hits.length - 1] > windowMs) buckets.delete(k);
    }
    lastSweep = now;
  }
  const hits = buckets.get(key) ?? [];
  const fresh = hits.filter((t) => now - t < windowMs);
  if (fresh.length >= limit) {
    buckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  buckets.set(key, fresh);
  return true;
}

/** Client IP from a Request (Cloudflare adds cf-connecting-ip). */
export function clientIp(request: Request, fallback = 'unknown'): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    fallback
  );
}
