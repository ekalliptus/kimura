import type { Route } from './+types/bookings';
import { useSearchParams } from 'react-router';
import { requireAdmin } from '~/lib/auth.server';
import BookingsManager from '~/components/admin/BookingsManager';
import type { Booking } from '@kimura/core/database.types';

export function meta() {
  return [{ title: 'Bookings · Kimura Admin' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, lang, headers } = await requireAdmin(request);
  const [bookingsRes, rtRes, roomsRes] = await Promise.all([
    supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(1000),
    supabase.from('room_types').select('id, name').order('sort_order'),
    supabase.from('rooms').select('id, room_number, room_type_id').eq('active', true).order('room_number'),
  ]);
  return Response.json(
    {
      lang,
      bookings: (bookingsRes.data ?? []) as Booking[],
      roomTypes: rtRes.data ?? [],
      rooms: roomsRes.data ?? [],
    },
    { headers },
  );
}

export default function Bookings({ loaderData }: Route.ComponentProps) {
  const { lang, bookings, roomTypes, rooms } = loaderData;
  const [params] = useSearchParams();
  const focusRef = params.get('ref') ?? undefined;
  return (
    <BookingsManager
      initialBookings={bookings}
      roomTypes={roomTypes}
      rooms={rooms}
      focusRef={focusRef}
      lang={lang}
    />
  );
}
