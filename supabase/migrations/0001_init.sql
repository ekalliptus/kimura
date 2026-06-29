-- =============================================================================
-- Kimura Kostay — initial schema
-- Run order: 0001_init.sql → 0002_rls.sql → 0003_seed.sql
-- Apply via Supabase SQL Editor, or `supabase db push` with the CLI.
-- =============================================================================

-- gen_random_uuid() is core in Postgres 13+ (no pgcrypto needed). We derive
-- booking references from it to avoid relying on the extensions search_path.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type booking_status as enum (
    'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  -- Kimura's differentiator: stays from half-day to monthly.
  create type stay_package as enum (
    'half_day', 'daily', 'weekly', 'monthly'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type room_state as enum ('available', 'occupied', 'maintenance', 'cleaning');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- admins — allowlist of users permitted into the admin panel.
-- An auth user is an admin iff their id is present here. Simpler to operate
-- than JWT custom-claim hooks; is_admin() (0002) reads this table.
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'manager',  -- 'owner' | 'manager' | 'staff'
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- room_types — the catalogue (Studio 14, Ryokan King, …)
-- ---------------------------------------------------------------------------
create table if not exists public.room_types (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  name_id         text,                      -- Indonesian display name (bilingual)
  description     text,
  description_id  text,
  size_sqm        integer,
  max_occupancy   integer not null default 2,
  bed_config      text,                      -- 'King', 'Twin', 'Queen', 'Single'
  -- Pricing per package, in IDR (whole rupiah). NULL = package not offered.
  price_half_day  integer,
  price_daily     integer,
  price_weekly    integer,
  price_monthly   integer,
  amenities       text[] not null default '{}',
  images          text[] not null default '{}',
  featured        boolean not null default false,
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_room_types_updated
  before update on public.room_types
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- rooms — physical inventory (a unit of a given room_type)
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id            uuid primary key default gen_random_uuid(),
  room_type_id  uuid not null references public.room_types(id) on delete restrict,
  room_number   text not null unique,
  floor         integer,
  state         room_state not null default 'available',
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_rooms_updated
  before update on public.rooms
  for each row execute function public.set_updated_at();

create index if not exists idx_rooms_type on public.rooms(room_type_id);

-- ---------------------------------------------------------------------------
-- bookings — a reservation request (reservation-only flow, no payment gateway)
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique default (
    -- 12 hex chars from a v4 UUID (~48 bits) — collision risk negligible at scale,
    -- and gen_random_uuid() is core (no pgcrypto dependency).
    'KMR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ),
  room_type_id      uuid not null references public.room_types(id) on delete restrict,
  room_id           uuid references public.rooms(id) on delete set null, -- assigned by admin
  -- Guest details (captured inline; no separate auth account needed)
  guest_name        text not null,
  guest_email       text not null,
  guest_phone       text not null,
  guest_country     text default 'ID',
  -- Stay
  package           stay_package not null default 'daily',
  check_in          date not null,
  check_out         date not null,
  check_in_time     time,
  check_out_time    time,
  adults            integer not null default 1,
  children          integer not null default 0,
  nights            integer,                  -- computed by app for daily+; informational
  -- Money (IDR, snapshot at booking time)
  unit_price        integer not null default 0,
  quantity          integer not null default 1,
  total_price       integer not null default 0,
  currency          text not null default 'IDR',
  -- Workflow
  status            booking_status not null default 'pending',
  special_requests  text,
  admin_notes       text,
  source            text not null default 'website',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  confirmed_at      timestamptz,
  cancelled_at      timestamptz,
  constraint chk_dates check (check_out >= check_in)
);

create trigger trg_bookings_updated
  before update on public.bookings
  for each row execute function public.set_updated_at();

create index if not exists idx_bookings_status   on public.bookings(status);
create index if not exists idx_bookings_checkin  on public.bookings(check_in);
create index if not exists idx_bookings_roomtype on public.bookings(room_type_id);
create index if not exists idx_bookings_created   on public.bookings(created_at desc);

-- ---------------------------------------------------------------------------
-- activity_logs — audit trail surfaced in the admin panel
-- Written server-side via service-role (bypasses RLS). Admins read.
-- ---------------------------------------------------------------------------
create table if not exists public.activity_logs (
  id          bigint generated by default as identity primary key,
  action      text not null,                  -- 'booking.created', 'booking.status_changed', 'keepalive.ping' …
  category    text not null default 'general',-- 'booking' | 'room' | 'system' | 'auth' | 'general'
  message     text not null,
  actor       text not null default 'system', -- 'cron' | 'public' | admin email
  actor_id    uuid,
  entity_type text,                           -- 'booking' | 'room' | 'room_type'
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_logs_created  on public.activity_logs(created_at desc);
create index if not exists idx_logs_category on public.activity_logs(category);
create index if not exists idx_logs_action   on public.activity_logs(action);

-- ---------------------------------------------------------------------------
-- keep_alive — single heartbeat row the cron touches to prevent free-tier pause
-- ---------------------------------------------------------------------------
create table if not exists public.keep_alive (
  id         integer primary key default 1,
  pinged_at  timestamptz not null default now(),
  ping_count integer not null default 0,
  constraint chk_singleton check (id = 1)
);

insert into public.keep_alive (id, pinged_at, ping_count)
values (1, now(), 0)
on conflict (id) do nothing;

-- Bump ping_count automatically whenever pinged_at is updated.
create or replace function public.bump_keepalive()
returns trigger
language plpgsql
as $$
begin
  new.ping_count = old.ping_count + 1;
  return new;
end;
$$;

create trigger trg_keepalive_bump
  before update on public.keep_alive
  for each row execute function public.bump_keepalive();
