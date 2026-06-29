-- =============================================================================
-- Kimura Kostay — race-safe confirmation
-- Where the real overbooking race lives: pending bookings DON'T consume
-- inventory (soft model), so two concurrent public inserts can't oversell. But
-- two admins (or double-clicks) confirming different pending bookings for the
-- same room_type + overlapping dates at the same instant BOTH pass a naive
-- capacity check, because neither sees the other's not-yet-committed write.
--
-- Fix: serialize confirmations per room_type with a transaction-scoped advisory
-- lock, re-count inside the lock, and reject if confirming would exceed the
-- sellable room count. Atomic: the count and the status flip share one tx.
-- =============================================================================

create or replace function public.confirm_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_total   int;
  v_booked  int;
begin
  -- Load the target booking. FOR UPDATE pins this row for the tx.
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  -- Idempotent: already-live bookings just return unchanged.
  if v_booking.status in ('confirmed', 'checked_in', 'checked_out') then
    return v_booking;
  end if;
  if v_booking.status in ('cancelled', 'no_show') then
    raise exception 'BOOKING_NOT_CONFIRMABLE: status is %', v_booking.status;
  end if;

  -- Serialize all confirmations for this room_type. Two confirms targeting the
  -- same type now run strictly one-after-another; the second sees the first's
  -- committed effect. Auto-released at tx end.
  perform pg_advisory_xact_lock(hashtext(v_booking.room_type_id::text)::bigint);

  -- Sellable physical units for this type.
  select count(*)::int into v_total
  from public.rooms r
  where r.room_type_id = v_booking.room_type_id
    and r.active = true and r.state <> 'maintenance';

  -- Live holds (excluding this booking) overlapping the requested range.
  select count(*)::int into v_booked
  from public.bookings b
  where b.room_type_id = v_booking.room_type_id
    and b.id <> v_booking.id
    and b.status in ('confirmed', 'checked_in')
    and b.check_in  < v_booking.check_out
    and b.check_out > v_booking.check_in;

  if v_booked >= v_total then
    raise exception 'ROOM_FULL: confirming would oversell (% of % already held)', v_booked, v_total
      using hint = 'Reassign dates/room or decline this request.';
  end if;

  update public.bookings
     set status = 'confirmed', confirmed_at = now()
   where id = p_booking_id
   returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.confirm_booking(uuid) from public, anon, authenticated;
grant execute on function public.confirm_booking(uuid) to service_role;
