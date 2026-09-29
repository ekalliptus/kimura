/** Same-origin check for admin JSON actions (CSRF defense-in-depth on top of SameSite=Lax). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser clients (curl) — auth still enforced
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/** Restrict a `?next=` redirect to a local path (no protocol-relative or absolute URLs). */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next) return fallback;
  return next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
