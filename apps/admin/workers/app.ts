import { createRequestHandler } from 'react-router';

// Env is read inside loaders/actions via `cloudflare:workers` (see app/lib/env.server.ts),
// so the request handler needs no load context.
const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

export default {
  fetch(request) {
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;
