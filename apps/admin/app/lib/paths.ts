/** Restrict a '?next=' redirect to a local path (no protocol-relative or absolute URLs). */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next) return fallback;
  return next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
