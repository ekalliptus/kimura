-- =============================================================================
-- Kimura Kostay — seed data
-- 8 real room types (from cloudbeds listing). Prices are ESTIMATES in IDR for a
-- Semarang budget hotel — adjust in the admin panel to the real rate card.
-- Photos point at the live Cloudbeds CDN (property 171276).
-- =============================================================================

insert into public.room_types
  (slug, name, name_id, description, description_id, size_sqm, max_occupancy, bed_config,
   price_half_day, price_daily, price_weekly, price_monthly, amenities, images, featured, sort_order)
values
  ('studio-14-single', 'Studio 14 — Single', 'Studio 14 — Single',
   'A compact 14 m² studio for the solo traveller. Everything you need, nothing you don''t.',
   'Studio ringkas 14 m² untuk pelancong solo. Semua yang dibutuhkan, tanpa berlebih.',
   14, 1, 'Single',
   75000, 185000, 1100000, 3500000,
   array['AC','WiFi','Smart TV','Private bathroom','Mineral water','Work desk'],
   array['https://h-img1.cloudbeds.com/uploads/171276/bed_sudut_kiri~~66e3fd7aa7d21.jpg',
         'https://h-img1.cloudbeds.com/uploads/171276/bathroom~~66e3d7b4526e0.jpg'],
   false, 10),

  ('studio-16-queen', 'Studio 16 — Queen', 'Studio 16 — Queen',
   'A 16 m² studio with a queen bed — a calm, well-lit base for two.',
   'Studio 16 m² dengan ranjang queen — tempat tenang dan terang untuk berdua.',
   16, 2, 'Queen',
   90000, 235000, 1400000, 4300000,
   array['AC','WiFi','Smart TV','Private bathroom','Mineral water','Coffee maker'],
   array['https://h-img1.cloudbeds.com/uploads/171276/bed_depan~~6703b0901fb79.jpg',
         'https://h-img1.cloudbeds.com/uploads/171276/mirror~~66e3f948be499.jpg'],
   true, 20),

  ('studio-16-twin', 'Studio 16 — Twin', 'Studio 16 — Twin',
   'Two single beds in a tidy 16 m² studio — ideal for friends or colleagues.',
   'Dua ranjang single dalam studio rapi 16 m² — pas untuk teman atau rekan kerja.',
   16, 2, 'Twin',
   90000, 235000, 1400000, 4300000,
   array['AC','WiFi','Smart TV','Private bathroom','Mineral water'],
   array['https://h-img1.cloudbeds.com/uploads/171276/bed_sudut_kanan~~6703b02d069dd.jpg'],
   false, 30),

  ('studio-16-king', 'Studio 16 — King', 'Studio 16 — King',
   'A 16 m² studio with a king bed for extra comfort.',
   'Studio 16 m² dengan ranjang king untuk kenyamanan ekstra.',
   16, 2, 'King',
   95000, 245000, 1450000, 4500000,
   array['AC','WiFi','Smart TV','Private bathroom','Mineral water','Coffee maker'],
   array['https://h-img1.cloudbeds.com/uploads/171276/bed_sudut_kanan~~6703b0a0041c1.jpg'],
   false, 40),

  ('studio-20-king', 'Studio 20 — King', 'Studio 20 — King',
   'A roomier 20 m² king studio with a lounge corner.',
   'Studio king 20 m² yang lebih lega dengan sudut santai.',
   20, 2, 'King',
   110000, 295000, 1750000, 5300000,
   array['AC','WiFi','Google TV','Private bathroom','Mineral water','Coffee maker','Minibar'],
   array['https://h-img1.cloudbeds.com/uploads/171276/kamar_7~~67c6ab4a0ad08.jpg',
         'https://h-img1.cloudbeds.com/uploads/171276/complimentary~~66e3fd7cd5a64.jpg'],
   true, 50),

  ('suite-20-king', 'Suite 20 — King', 'Suite 20 — King',
   'Our 20 m² suite — premium finishes, minibar, and the best light in the house.',
   'Suite 20 m² kami — material premium, minibar, dan pencahayaan terbaik.',
   20, 2, 'King',
   140000, 365000, 2200000, 6700000,
   array['AC','WiFi','Google TV','Private bathroom','Mineral water','Coffee maker','Minibar','Premium toiletries'],
   array['https://h-img1.cloudbeds.com/uploads/171276/9~~69b7c88371551.jpg',
         'https://h-img1.cloudbeds.com/uploads/171276/10~~69b7c8896bc24.jpg'],
   true, 60),

  ('triple-bed', 'Triple Bed', 'Kamar Triple',
   'A 24 m² room sleeping three — for small families or groups.',
   'Kamar 24 m² untuk bertiga — cocok untuk keluarga kecil atau rombongan.',
   24, 3, 'Triple',
   160000, 395000, 2400000, 7200000,
   array['AC','WiFi','Smart TV','Private bathroom','Mineral water','Coffee maker'],
   array['https://h-img1.cloudbeds.com/uploads/171276/3~~69b7c84a1b2f1.jpg'],
   false, 70),

  ('ryokan-king', 'Ryokan King', 'Ryokan King',
   'Our signature room: a king bed and a full-body massage chair — a quiet nod to the Japanese ryokan. Recover, the Kimura way.',
   'Kamar andalan kami: ranjang king dan kursi pijat seluruh tubuh — sentuhan ryokan Jepang. Pulihkan tenaga, ala Kimura.',
   20, 2, 'King',
   175000, 450000, 2700000, 8200000,
   array['AC','WiFi','Google TV','Massage chair','Private bathroom','Mineral water','Coffee maker','Minibar','Premium toiletries'],
   array['https://h-img1.cloudbeds.com/uploads/171276/img20260316113036~~69ba75eb31a13.jpg',
         'https://h-img1.cloudbeds.com/uploads/171276/img_8242~~67fcc9652c5df.jpg'],
   true, 80)
on conflict (slug) do nothing;

-- A few physical rooms per type so the admin inventory isn't empty.
insert into public.rooms (room_type_id, room_number, floor, state)
select rt.id, r.room_number, r.floor, 'available'::room_state
from public.room_types rt
join (values
  ('studio-14-single','101',1),
  ('studio-14-single','102',1),
  ('studio-16-queen','201',2),
  ('studio-16-queen','202',2),
  ('studio-16-twin','203',2),
  ('studio-16-king','204',2),
  ('studio-20-king','301',3),
  ('suite-20-king','302',3),
  ('triple-bed','303',3),
  ('ryokan-king','401',4)
) as r(slug, room_number, floor) on r.slug = rt.slug
on conflict (room_number) do nothing;

-- A welcome log line so the activity feed isn't empty on first load.
insert into public.activity_logs (action, category, message, actor)
values ('system.seed', 'system', 'Database seeded with room catalogue.', 'system');
