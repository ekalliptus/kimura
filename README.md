# Kimura Kostay — Hotel Booking SaaS

Japanese-minimalist booking site + admin panel for **Kimura Kostay Semarang**.

- **Public site** (bilingual ID/EN): landing, rooms, room detail, reservation flow, map.
- **Admin panel** (`/admin`): dashboard, bookings workflow, room/pricing management,
  live activity console, and Supabase keep-alive control.
- **Reservation-only** flow — no payment gateway. Guests submit → admin confirms manually.

## Architecture

Bun-workspace monorepo deploying to **two Cloudflare Workers**, sharing one Supabase project:

| App | Tech | Domain |
|-----|------|--------|
| `apps/web` | Astro 7 (SSR) — public site | kimura.ekalliptus.com |
| `apps/admin` | React Router v7 (framework mode) — admin panel | admin.kimura.ekalliptus.com |
| `packages/core` | Shared lib (`@kimura/core`): database.types, format, hotel, i18n, img, utils, supabase | — |

## Stack

| Layer      | Tech |
|------------|------|
| UI         | Tailwind v4 + shadcn/ui (React) |
| Map        | mapcn (MapLibre GL, free CARTO basemap) |
| Runtime    | Bun (dev/build), Cloudflare Workers (prod) |
| Database   | Supabase (Postgres + Auth + Storage + RLS), shared by both apps |
| Auth       | Supabase session cookies (`@supabase/ssr`) + `is_admin()` allowlist |
| Keep-alive | Cloudflare Cron in the web worker → DB ping (twice weekly) |

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

Each worker reads its own `.dev.vars`. Copy the example into both apps and fill
in your Supabase keys (Project Settings → API):

```bash
cp apps/web/.dev.vars.example   apps/web/.dev.vars
cp apps/admin/.dev.vars.example apps/admin/.dev.vars
# edit both
```

```bash
bun run dev:web      # Astro dev server   (apps/web,   http://localhost:4321)
bun run dev:admin    # React Router dev    (apps/admin, http://localhost:5173)
```

To exercise the **cron** and the real Workers runtime (cron lives in the web worker):

```bash
bun run build:web
cd apps/web && bunx wrangler dev
# fire the keep-alive cron manually:
curl 'http://localhost:8787/__scheduled?cron=17+7+*+*+1,4'
```

## 5. Deploy to Cloudflare Workers

Each app deploys as its own worker. Run these from inside each app dir.

### a) Web worker — session KV namespace (one-time)

The Astro Cloudflare adapter injects a sessions driver bound to `SESSION`.
We don't use Astro sessions, but the binding must exist:

```bash
cd apps/web && bunx wrangler kv namespace create SESSION
```

Paste the returned `id` into `apps/web/wrangler.jsonc` → `kv_namespaces[0].id`.

### b) Set production secrets (per worker)

```bash
cd apps/web   && for s in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do bunx wrangler secret put $s; done
cd apps/admin && for s in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do bunx wrangler secret put $s; done
```

### c) Deploy

```bash
bun run --filter @kimura/web deploy     # → kimura.ekalliptus.com
bun run --filter @kimura/admin deploy   # → admin.kimura.ekalliptus.com
```

The cron (`17 7 * * 1,4` — Mon & Thu 07:17 UTC) lives in the **web** worker and
pings the database so the Supabase free-tier project never pauses. Verify it in
the admin panel under **System → Supabase Keep-Alive** (or hit **Ping now**).

---

## Project layout

```
apps/web/                Astro public site (→ kimura.ekalliptus.com)
  src/
    components/site/     Header, Footer, RoomCard
    components/ui/        shadcn/ui + mapcn map
    components/          SemarangMap.tsx, BookingForm.tsx
    layouts/             BaseLayout
    lib/                 queries, supabase (service-role), env, useAvailability
    pages/
      index, rooms/, book        public
      api/bookings               public reservation create + availability
    worker.ts            Worker entry: Astro SSR fetch + scheduled() keep-alive cron

apps/admin/              React Router v7 admin (→ admin.kimura.ekalliptus.com)
  app/
    routes/              login, admin-layout, dashboard, bookings, rooms,
                         activity, system, api.* (auth/lang/logs/bookings/rooms/keepalive)
    components/admin/    BookingsManager, RoomsManager, ConsoleLog, KeepAlivePanel
    lib/                 auth.server, supabase.server, env.server, admin-i18n
    root.tsx, app.css
  workers/app.ts         Worker entry (RR request handler)

packages/core/src/       @kimura/core — shared by both apps
                         database.types, format, hotel, i18n, img, utils, supabase

supabase/migrations/     0001 schema · 0002 RLS · 0003 seed · 0004 grants ·
                         0005 availability · 0006 admin_bootstrap · 0007 harden_insert
```

## Notes

- **Prices** in the seed are estimates (Cloudbeds didn't expose them). Edit them
  inline in **Admin → Rooms → Room Types & Pricing**.
- **Images** point at the live Cloudbeds CDN. Swap to your own `/public` assets
  or R2 when ready.
- The `is_admin()` allowlist (not JWT claims) keeps admin setup to a single SQL
  insert. service-role writes (booking confirms, logs) bypass RLS by design.

## WhatsApp & Payments

Both integrations are **off by default** — the apps behave exactly as before
until the env vars below are set (`wrangler secret put` per worker in
production; `.dev.vars` locally).

### WhatsApp (Fonnte)

| Var | Worker | Purpose |
|-----|--------|---------|
| `WA_ENABLED` | web + admin | `"true"` turns the feature on |
| `WA_PROVIDER` | web + admin | `"fonnte"` (only provider for now) |
| `WA_API_TOKEN` | web + admin | Fonnte device token |
| `WA_ADMIN_PHONE` | web + admin | recipient of new-booking / status notifications |

Flow: new public booking → WA to `WA_ADMIN_PHONE`; admin confirms/cancels a
booking → WA to the guest + a one-line notice to `WA_ADMIN_PHONE`. All sends
are best-effort: a failed notification never fails the booking or the admin
action (failures are logged with a `[WA]` prefix).

### Payments (Midtrans Snap)

| Var | Worker | Purpose |
|-----|--------|---------|
| `MIDTRANS_SERVER_KEY` | web | Snap API auth + webhook signature verification |
| `MIDTRANS_CLIENT_KEY` | web | only needed if you switch to Snap JS widget |
| `MIDTRANS_IS_PRODUCTION` | web | `"true"` targets production, default sandbox |

Flow: booking `pending` → **Bayar sekarang** button → `POST /api/bookings/[reference]/pay`
returns a Snap `redirect_url` → guest pays → Midtrans webhook
`POST /api/payments/midtrans/webhook` verifies the SHA-512 signature and flips
the booking to `confirmed` (or `cancelled` on deny/expire/cancel). The webhook
is idempotent. Without `MIDTRANS_SERVER_KEY` the pay button never renders and
the manual confirm flow stays intact.

Simulate a webhook locally (sandbox, correct signature):

```bash
ORDER_ID="KIMURA-XXXX"; STATUS_CODE="200"; GROSS="150000"; KEY="SB-Mid-server-..."
SIG=$(printf '%s' "$ORDER_ID$STATUS_CODE$GROSS$KEY" | openssl dgst -sha512 | awk '{print $2}')
curl -X POST http://localhost:4321/api/payments/midtrans/webhook \
  -H 'Content-Type: application/json' \
  -d "{\"order_id\":\"$ORDER_ID\",\"status_code\":\"$STATUS_CODE\",\"gross_amount\":\"$GROSS\",\"signature_key\":\"$SIG\",\"transaction_status\":\"settlement\"}"
```

## Scripts (from repo root)

| Command | Description |
|---------|-------------|
| `bun run dev:web` | Astro dev server (apps/web) |
| `bun run dev:admin` | React Router dev server (apps/admin) |
| `bun run build` | Build both apps |
| `bun run build:web` / `build:admin` | Build one app |
| `bun run --filter @kimura/web check` | Astro typecheck |
| `bun run --filter @kimura/admin check` | RR typegen + tsc |
| `bun run --filter @kimura/<app> deploy` | Build + deploy one worker |
