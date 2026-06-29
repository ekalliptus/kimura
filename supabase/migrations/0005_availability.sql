-- =============================================================================
-- Kimura Kostay — soft availability
-- Reservation-only model: a date range is "full" for a room type when the number
-- of CONFIRMED / CHECKED-IN holds overlapping it already meets the count of
-- sellable physical rooms. Pending requests do NOT consume inventory (a human
-- confirms them), so two guests may both submit — the admin resolves overbooking.
--
-- Date-granularity overlap. Half-day stays (check_in = check_out) are intra-day
-- and are treated as non-consuming here — acceptable for a budget hotel; tighten
-- to timestamp granularity only if half-day volume ever warrants it.
-- =============================================================================

create or replace function public.room_type_availability(
  p_slug     text,
  p_check_in date,
  p_check_out date
)
returns table (total int, booked int, available int)
language sql
stable
security definer
set search_path = ''
as $$
  with rt as (
    select id from public.room_types where slug = p_slug and active = true
  ),
  total as (
    -- Sellable units: active and not pulled for maintenance.
    select count(*)::int as n
    from public.rooms r
    join rt on r.room_type_id = rt.id
    where r.active = true and r.state <> 'maintenance'
  ),
  booked as (
    -- Live holds that overlap [p_check_in, p_check_out). Half-open: a stay ending
    -- the day another starts does not collide.
    select count(*)::int as n
    from public.bookings b
    join rt on b.room_type_id = rt.id
    where b.status in ('confirmed', 'checked_in')
      and b.check_in  < p_check_out
      and b.check_out > p_check_in
  )
  select total.n,
         booked.n,
         greatest(total.n - booked.n, 0)
  from total, booked;
$$;

revoke all on function public.room_type_availability(text, date, date) from public;
grant execute on function public.room_type_availability(text, date, date)
  to anon, authenticated, service_role;
