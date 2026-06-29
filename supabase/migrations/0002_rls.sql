-- =============================================================================
-- Kimura Kostay — Row Level Security
-- Model: anon can read the public catalogue + create bookings. Only admins
-- (rows in public.admins) can read/manage everything. service_role bypasses RLS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- is_admin(): true when the current auth user is in the admins allowlist.
-- SECURITY DEFINER + empty search_path to avoid privilege escalation.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a where a.id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere (mandatory — policies are ignored otherwise)
-- ---------------------------------------------------------------------------
alter table public.admins        enable row level security;
alter table public.room_types    enable row level security;
alter table public.rooms         enable row level security;
alter table public.bookings      enable row level security;
alter table public.activity_logs enable row level security;
alter table public.keep_alive    enable row level security;

-- ---------------------------------------------------------------------------
-- admins: a user may read their own row (to self-check). Only owners manage the
-- allowlist — do that via service-role/SQL editor to avoid lockout footguns.
-- ---------------------------------------------------------------------------
drop policy if exists "admin_read_self" on public.admins;
create policy "admin_read_self" on public.admins
  for select to authenticated
  using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- room_types: public read (active catalogue); admin full write.
-- ---------------------------------------------------------------------------
drop policy if exists "room_types_public_read" on public.room_types;
create policy "room_types_public_read" on public.room_types
  for select to anon, authenticated
  using (true);

drop policy if exists "room_types_admin_write" on public.room_types;
create policy "room_types_admin_write" on public.room_types
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- rooms: public read; admin full write.
-- ---------------------------------------------------------------------------
drop policy if exists "rooms_public_read" on public.rooms;
create policy "rooms_public_read" on public.rooms
  for select to anon, authenticated
  using (true);

drop policy if exists "rooms_admin_write" on public.rooms;
create policy "rooms_admin_write" on public.rooms
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- bookings: anyone can CREATE a reservation; only admins can read/update/delete.
-- (App also writes via service-role for the confirmation flow, which bypasses RLS.)
-- ---------------------------------------------------------------------------
drop policy if exists "bookings_public_insert" on public.bookings;
create policy "bookings_public_insert" on public.bookings
  for insert to anon, authenticated
  with check (true);

drop policy if exists "bookings_admin_read" on public.bookings;
create policy "bookings_admin_read" on public.bookings
  for select to authenticated
  using (public.is_admin());

drop policy if exists "bookings_admin_update" on public.bookings;
create policy "bookings_admin_update" on public.bookings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "bookings_admin_delete" on public.bookings;
create policy "bookings_admin_delete" on public.bookings
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- activity_logs: admin read only. Writes happen via service-role (bypasses RLS),
-- so no client INSERT policy is granted.
-- ---------------------------------------------------------------------------
drop policy if exists "logs_admin_read" on public.activity_logs;
create policy "logs_admin_read" on public.activity_logs
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- keep_alive: admin read (for the status panel). Cron writes via service-role.
-- ---------------------------------------------------------------------------
drop policy if exists "keepalive_admin_read" on public.keep_alive;
create policy "keepalive_admin_read" on public.keep_alive
  for select to authenticated
  using (public.is_admin());
