-- =============================================================================
-- Kimura Kostay — property settings (white-label groundwork)
-- One singleton row (`id = 1`) holding the property's public identity so a new
-- property can be onboarded by editing data, not code. Public pages read it
-- with a fallback to the HOTEL constant in @kimura/core when the row/DB is
-- unavailable — zero-config stays functional.
-- =============================================================================

create table public.property_settings (
  id            integer primary key default 1 check (id = 1),
  name          text not null,
  tagline_id    text not null,
  tagline_en    text not null,
  phone         text not null,
  whatsapp      text not null,
  email         text not null,
  address       text not null,
  address_short text not null,
  maps_url      text not null default '',
  maps_lat      double precision not null,
  maps_lng      double precision not null,
  check_in_time text not null,
  check_out_time text not null,
  updated_at    timestamptz not null default now()
);

-- Seed the singleton from the current constants.
insert into public.property_settings
  (id, name, tagline_id, tagline_en, phone, whatsapp, email, address, address_short, maps_url, maps_lat, maps_lng, check_in_time, check_out_time)
values
  (1,
   'Kimura Kostay',
   'Penginapan minimalis ala Jepang di Semarang.',
   'A Japanese-minimalist stay in Semarang.',
   '+6282177225800',
   '6282177225800',
   'rsv@kimurakostay.com',
   'Jl. Brigjen Sudiarto No. 116, Pandean Lamper, Gayamsari, Semarang, Jawa Tengah 50167',
   'Gayamsari, Semarang',
   'https://maps.app.goo.gl/XDb8dYMk97ojvtC58',
   -6.9986703,
   110.4430829,
   '14:00',
   '12:00'
  );

alter table public.property_settings enable row level security;

drop policy if exists "property_settings_public_read" on public.property_settings;
create policy "property_settings_public_read" on public.property_settings
  for select to anon, authenticated
  using (true);

drop policy if exists "property_settings_admin_update" on public.property_settings;
create policy "property_settings_admin_update" on public.property_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No insert/delete policies: the singleton row exists via seed; only
-- service-role can recreate it.
