import type { APIRoute } from 'astro';
import { publicClient } from '@/lib/queries';

export const prerender = false;

// GET /api/bookings/availability?room=<slug>&in=yyyy-mm-dd&out=yyyy-mm-dd
// Public, cacheable. Wraps the room_type_availability RPC for the booking form's
// realtime availability indicator. Soft model: counts confirmed/checked-in holds.
export const GET: APIRoute = async ({ url }) => {
  const room = url.searchParams.get('room');
  const checkIn = url.searchParams.get('in');
  const checkOut = url.searchParams.get('out');

  if (!room || !checkIn || !checkOut) {
    return new Response(JSON.stringify({ error: 'room, in, out required' }), { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    return new Response(JSON.stringify({ error: 'bad date format' }), { status: 400 });
  }
  if (checkOut <= checkIn) {
    return new Response(JSON.stringify({ error: 'out must be after in' }), { status: 400 });
  }

  const supabase = publicClient();
  const { data, error } = await supabase
    .rpc('room_type_availability', { p_slug: room, p_check_in: checkIn, p_check_out: checkOut })
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!data) {
    // RPC absent or room inactive → fail open (don't block booking).
    return new Response(JSON.stringify({ available: null, total: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Availability shifts as bookings land; keep it short.
      'Cache-Control': 'public, max-age=30, s-maxage=60',
    },
  });
};
