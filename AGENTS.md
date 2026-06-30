## Monorepo

Bun workspaces. Two Cloudflare Workers + a shared package:

```
apps/web      Astro public site   → kimura.ekalliptus.com
apps/admin    React Router v7     → admin.kimura.ekalliptus.com
packages/core shared lib (@kimura/core): database.types, format, hotel, i18n, img, utils, supabase
```

Supabase (Postgres + Auth + Storage) is shared by both apps. Auth is Supabase
session cookies via `@supabase/ssr`; the admin allowlist is the `is_admin()` RPC.
The keep-alive cron lives in the web worker (`apps/web/src/worker.ts`).

## Development

From the repo root:

```
bun install
bun run dev:web      # Astro dev server (apps/web)
bun run dev:admin    # React Router dev server (apps/admin)
```

Each worker reads its own `apps/<app>/.dev.vars` (gitignored; see `.dev.vars.example`).

Build / typecheck a single app: `bun run build:web` / `bun run build:admin`,
or `bun run --filter @kimura/web check` / `--filter @kimura/admin check`.

## Documentation

- Astro (apps/web): https://docs.astro.build
- React Router v7 framework mode (apps/admin): https://reactrouter.com
- Cloudflare Vite plugin: https://developers.cloudflare.com/workers/vite-plugin/
- Tailwind v4, shadcn/ui, Supabase, MapLibre — see README.
