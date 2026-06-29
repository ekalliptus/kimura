-- =============================================================================
-- Kimura Kostay — defense-in-depth on public booking insert
-- 0002 granted anon INSERT with check(true). The /api/bookings route already
-- validates server-side, but the anon key is shipped to the browser — a raw
-- POST to PostgREST bypasses our route. Constrain the row at the RLS layer so a
-- direct insert can only reference an ACTIVE room type. Money fields stay
-- informational until an admin confirms (reservation-only), so we don't police
-- price here — only that the referenced product is real and sellable.
-- =============================================================================

drop policy if exists "bookings_public_insert" on public.bookings;
create policy "bookings_public_insert" on public.bookings
  for insert to anon, authenticated
  with check (
    room_type_id in (select id from public.room_types where active = true)
    and check_out >= check_in
    and adults >= 1
    and char_length(guest_name)  between 1 and 200
    and char_length(guest_email) between 3 and 320
    and char_length(guest_phone) between 6 and 40
  );
