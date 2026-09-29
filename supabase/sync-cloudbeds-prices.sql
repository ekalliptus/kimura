-- Sync room_types.price_daily to the live Cloudbeds rate card
-- (property EdAnNO, 2026-10-01 → 2026-10-02, the "Smart Stay - Non-Refundable"
-- plan — the rate a guest actually pays on the booking engine).
--
-- Rack rates (before the 35% promo) are in comments for reference.
-- Run via the Supabase SQL editor, or: bun scripts/sync-cloudbeds-prices.ts

update public.room_types set price_daily = 157950  where slug = 'studio-14-single';  -- rack 243000
update public.room_types set price_daily = 196950  where slug = 'studio-16-twin';    -- rack 303000
update public.room_types set price_daily = 196950  where slug = 'studio-16-queen';   -- no live rate on those dates; matched to twin (seed had them equal)
update public.room_types set price_daily = 206700  where slug = 'studio-16-king';    -- rack 318000
update public.room_types set price_daily = 252200  where slug = 'studio-20-king';    -- rack 388000
update public.room_types set price_daily = 278200  where slug = 'suite-20-king';     -- rack 428000
update public.room_types set price_daily = 330200  where slug = 'triple-bed';        -- rack 508000
update public.room_types set price_daily = 310700  where slug = 'ryokan-king';       -- rack 478000
