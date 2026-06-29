import { useEffect, useState } from 'react';

export type AvailState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok'; available: number; total: number }
  | { status: 'full' }
  | { status: 'error' };

/**
 * Poll-free realtime availability for a room type over a date range. Debounces
 * so rapid date changes fire one RPC. Hits the anon `room_type_availability`
 * PostgREST RPC directly (RLS allows public execute).
 */
export function useRoomAvailability(roomSlug: string, checkIn: string, checkOut: string, enabled: boolean): AvailState {
  const [state, setState] = useState<AvailState>({ status: 'idle' });

  useEffect(() => {
    if (!enabled || !roomSlug || !checkIn || !checkOut || checkOut <= checkIn) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'checking' });
    const handle = setTimeout(async () => {
      try {
        const url = new URL('/api/bookings/availability', window.location.origin);
        url.searchParams.set('room', roomSlug);
        url.searchParams.set('in', checkIn);
        url.searchParams.set('out', checkOut);
        const res = await fetch(url.toString());
        const data = (await res.json()) as { available?: number; total?: number; error?: string };
        if (cancelled) return;
        if (!res.ok || data.available == null) {
          setState({ status: 'error' });
          return;
        }
        setState(data.available > 0 ? { status: 'ok', available: data.available, total: data.total ?? 0 } : { status: 'full' });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [roomSlug, checkIn, checkOut, enabled]);

  return state;
}
