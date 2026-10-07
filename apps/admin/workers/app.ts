import { createRequestHandler } from 'react-router';

// Env is read inside loaders/actions via `cloudflare:workers` (see app/lib/env.server.ts),
// so the request handler needs no load context.
const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    const res = await requestHandler(request);
    // Baseline hardening — the admin console must never be framed or sniffed.
    const headers = new Headers(res.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    return new Response(res.body, { status: res.status, headers });
  },
} satisfies ExportedHandler<Env>;
