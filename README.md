# Kimura Kostay — Hotel Booking SaaS

Japanese-minimalist booking site + admin panel for **Kimura Kostay Semarang**.

- **Public site** (bilingual ID/EN): landing, rooms, room detail, reservation flow, map.
- **Admin panel** (`/admin`): dashboard, bookings workflow, room/pricing management,
  live activity console, and Supabase keep-alive control.
- **Reservation-only** flow — no payment gateway. Guests submit → admin confirms manually.

## Stack

| Layer      | Tech |
|------------|------|
| Framework  | Astro 7 (SSR, `output: 'server'`) |
| UI         | Tailwind v4 + shadcn/ui (React islands) |
| Map        | mapcn (MapLibre GL, free CARTO basemap) |
| Runtime    | Bun (dev/build), Cloudflare Workers (prod) |
| Database   | Supabase (Postgres + Auth + RLS) |
| Keep-alive | Cloudflare Cron → DB ping (twice weekly) |

---

## 1. Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- A [Supabase](https://supabase.com) project (free tier is fine)
- A [Cloudflare](https://dash.cloudflare.com) account + `wrangler` (bundled)

## 2. Install

```bash
bun install
```

## 3. Database (Supabase)

Run the migrations **in order** via the Supabase SQL Editor (or the CLI):

1. `supabase/migrations/0001_init.sql` — tables, enums, triggers, keep-alive row
2. `supabase/migrations/0002_rls.sql` — Row Level Security + `is_admin()`
3. `supabase/migrations/0003_seed.sql` — 8 room types + sample inventory
4. `supabase/migrations/0004_grants.sql` — role grants (RLS runs on top of these)
5. `supabase/migrations/0005_availability.sql` — `room_type_availability()` (soft inventory)
6. `supabase/migrations/0006_admin_bootstrap.sql` — `promote_admin()` helper
7. `supabase/migrations/0007_harden_booking_insert.sql` — constrain anon booking insert

> With the Supabase CLI: `supabase db push` (after `supabase link`).

### Create an admin user

Auth → Users → **Add user** (email + password). Then in the SQL Editor, promote
them **by email** (no UUID hunting):

```sql
select public.promote_admin('admin@kimurakostay.com', 'owner');
```

Only users present in `public.admins` can sign in to `/admin`. Re-running is safe
(idempotent), and it raises if no auth user has that email yet.

## 4. Local development

Copy env and fill in your Supabase keys (Project Settings → API):

```bash
cp .dev.vars.example .dev.vars
# edit .dev.vars
```

```bash
bun run dev          # fast Astro dev server (env via platformProxy + .dev.vars)
```

To exercise the **cron** and the real Workers runtime:

```bash
bun run build
bunx wrangler dev
# fire the keep-alive cron manually:
curl 'http://localhost:8787/__scheduled?cron=17+7+*+*+1,4'
```

## 5. Deploy to Cloudflare Workers

### a) Create the session KV namespace (one-time)

The Astro Cloudflare adapter injects a sessions driver bound to `SESSION`.
We don't use Astro sessions, but the binding must exist:

```bash
bunx wrangler kv namespace create SESSION
```

Paste the returned `id` into `wrangler.jsonc` → `kv_namespaces[0].id`
(replace `REPLACE_WITH_KV_NAMESPACE_ID`).

### b) Set production secrets

```bash
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_ANON_KEY
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### c) Deploy

```bash
bun run deploy        # = astro build && wrangler deploy
```

The cron (`17 7 * * 1,4` — Mon & Thu 07:17 UTC) is registered automatically and
pings the database so the Supabase free-tier project never pauses. Verify it in
the admin panel under **System → Supabase Keep-Alive** (or hit **Ping now**).

---

## Project layout

```
src/
  components/
    site/         Header, Footer, RoomCard
    admin/        BookingsManager, RoomsManager, ConsoleLog, KeepAlivePanel
    ui/           shadcn/ui + mapcn map
    SemarangMap.tsx, BookingForm.tsx
  layouts/        BaseLayout (public), AdminLayout
  lib/            supabase, queries, admin, i18n, format, hotel, database.types
  pages/
    index, rooms/, book          public
    admin/                       dashboard, bookings, rooms, activity, system, login
    api/bookings                 public reservation create
    api/admin/                   auth, bookings, rooms, logs, keepalive
  middleware.ts   /admin auth guard
  worker.ts       Worker entry: Astro SSR fetch + scheduled() keep-alive cron
supabase/migrations/   0001 schema · 0002 RLS · 0003 seed
```

## Notes

- **Prices** in the seed are estimates (Cloudbeds didn't expose them). Edit them
  inline in **Admin → Rooms → Room Types & Pricing**.
- **Images** point at the live Cloudbeds CDN. Swap to your own `/public` assets
  or R2 when ready.
- The `is_admin()` allowlist (not JWT claims) keeps admin setup to a single SQL
  insert. service-role writes (booking confirms, logs) bypass RLS by design.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Astro dev server |
| `bun run build` | Production build (`dist/`) |
| `bunx wrangler dev` | Run the built Worker locally (cron + bindings) |
| `bun run deploy` | Build + deploy to Cloudflare |
| `bun run generate-types` | Regenerate `worker-configuration.d.ts` |
