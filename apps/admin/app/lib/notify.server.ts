import type { Booking } from '@kimura/core/database.types';
import { bookingGuestMessage, sendWaText } from '@kimura/core/wa';
import { getEnv } from './env.server';

/**
 * Best-effort WhatsApp notifications for booking status changes. Never throws:
 * a failed send must not fail the admin action. No-op when WA is disabled.
 */
export async function notifyStatusChange(
  booking: Booking,
  status: 'confirmed' | 'cancelled',
  roomTypeName: string,
  adminEmail: string,
): Promise<void> {
  const env = getEnv();
  if (env.WA_ENABLED !== 'true') return;
  const waBooking = { ...booking, room_type_name: roomTypeName };
  const adminLine = `Booking ${booking.reference} → ${status} oleh admin (${adminEmail})`;
  await Promise.allSettled([
    booking.guest_phone
      ? sendWaText(env, booking.guest_phone, bookingGuestMessage(waBooking, status))
      : Promise.resolve(),
    env.WA_ADMIN_PHONE ? sendWaText(env, env.WA_ADMIN_PHONE, adminLine) : Promise.resolve(),
  ]);
}
