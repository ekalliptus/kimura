-- =============================================================================
-- Kimura Kostay — block snap_token spoofing via anon insert
-- Follow-up to 0011: the hardened insert policy constrained the workflow fields
-- but not the payment-idempotency columns added in the same release. The public
-- anon key is shipped to the browser, so a raw PostgREST POST could pre-seed a
-- Snap token on a fresh booking and make /api/bookings/[ref]/pay serve a bogus
-- payment redirect for it. Tokens are only ever written server-side (service
-- role), so the anon path must never set them.
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
    and snap_token is null
    and snap_token_created_at is null
    and char_length(guest_name)  between 1 and 200
    and char_length(guest_email) between 3 and 320
    and char_length(guest_phone) between 6 and 40
  );
