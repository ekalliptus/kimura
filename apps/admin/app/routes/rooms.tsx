import type { Route } from './+types/rooms';
import { requireAdmin } from '~/lib/auth.server';
import RoomsManager from '~/components/admin/RoomsManager';
import type { Room, RoomType } from '@kimura/core/database.types';

export function meta() {
  return [{ title: 'Rooms · Kimura Admin' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, lang, headers } = await requireAdmin(request);
  const [rtRes, roomsRes] = await Promise.all([
    supabase.from('room_types').select('*').order('sort_order'),
    supabase.from('rooms').select('*').order('room_number'),
  ]);
  return Response.json(
    { lang, roomTypes: (rtRes.data ?? []) as RoomType[], rooms: (roomsRes.data ?? []) as Room[] },
    { headers },
  );
}

export default function Rooms({ loaderData }: Route.ComponentProps) {
  const { lang, roomTypes, rooms } = loaderData;
  return <RoomsManager roomTypes={roomTypes} rooms={rooms} lang={lang} />;
}
