import type { Route } from './+types/bookings';
import { data, useSearchParams } from 'react-router';
import { requireAdmin } from '~/lib/auth.server';
import BookingsManager from '~/components/admin/BookingsManager';
import type { Booking } from '@kimura/core/database.types';

export function meta() {
  return [{ title: 'Bookings · Kimura Admin' }];
}

const BOOKINGS_CAP = 1000;

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, lang, headers } = await requireAdmin(request);
  const [bookingsRes, rtRes, roomsRes] = await Promise.all([
    supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(BOOKINGS_CAP),
    supabase.from('room_types').select('id, name').order('sort_order'),
    supabase.from('rooms').select('id, room_number, room_type_id').eq('active', true).order('room_number'),
  ]);
  // A DB outage must not render as "no bookings".
  if (bookingsRes.error || rtRes.error || roomsRes.error) {
    throw data('Failed to load bookings', 500);
  }
  return Response.json(
    {
      lang,
      bookings: bookingsRes.data as Booking[],
      capped: bookingsRes.data.length >= BOOKINGS_CAP,
      roomTypes: rtRes.data,
      rooms: roomsRes.data,
    },
    { headers },
  );
}

export default function Bookings({ loaderData }: Route.ComponentProps) {
  const { lang, bookings, capped, roomTypes, rooms } = loaderData;
  const [params] = useSearchParams();
  const focusRef = params.get('ref') ?? undefined;
  return (
    <BookingsManager
      initialBookings={bookings}
      roomTypes={roomTypes}
      rooms={rooms}
      focusRef={focusRef}
      lang={lang}
      capped={capped}
    />
  );
}
