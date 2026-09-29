-- =============================================================================
-- Kimura Kostay — booking insert hardening (follow-up to 0007) + Snap token
-- 0007 constrained the referenced room type but not the row's workflow fields:
-- the anon key is shipped to the browser, so a raw PostgREST POST could insert
-- a booking with status='confirmed' (bypassing confirm_booking's advisory-lock
-- capacity check), an arbitrary total_price, or a pre-assigned room.
-- =============================================================================

drop policy if exists "bookings_public_insert" on public.bookings;
create policy "bookings_public_insert" on public.bookings
  for insert to anon, authenticated
  with check (
    room_type_id in (select id from public.room_types where active = true)
    and status = 'pending'
    and confirmed_at is null
    and cancelled_at is null
    and room_id is null
    and source = 'website'
    and check_out >= check_in
    and adults >= 1
    and char_length(guest_name)  between 1 and 200
    and char_length(guest_email) between 3 and 320
    and char_length(guest_phone) between 6 and 40
  );

-- Payment idempotency: the pay endpoint stores the live Snap token and
-- re-serves it while the booking is still pending, so double-clicks and
-- retries never mint duplicate Midtrans transactions.
alter table public.bookings
  add column if not exists snap_token text,
  add column if not exists snap_token_created_at timestamptz;
