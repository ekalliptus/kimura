import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getEnv } from '@/lib/env';

export const prerender = false;

function bad(message: string, status = 400, code?: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SANDBOX_SNAP = 'https://app.sandbox.midtrans.com/snap/v1/transactions';
const PROD_SNAP = 'https://app.midtrans.com/snap/v1/transactions';

// POST /api/bookings/[reference]/pay → open a Midtrans Snap transaction for a
// pending booking. Service-role read: bookings have no anon SELECT policy, and
// the guest only holds the reference (unguessable 10-char token).
export const POST: APIRoute = async ({ params }) => {
  const reference = (params.reference ?? '').trim();
  if (!reference) return bad('reference required');

  const env = getEnv();
  if (!env.MIDTRANS_SERVER_KEY) return bad('payments are not configured', 404, 'payments_disabled');

  const supabase = await createSupabaseAdminClient();
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('reference, status, guest_name, guest_email, guest_phone, total_price, unit_price, quantity, package, check_in, check_out, room_type_id, room_types(name)')
    .eq('reference', reference)
    .maybeSingle();
  if (error || !booking) return bad('booking not found', 404, 'not_found');
  if (booking.status !== 'pending') return bad('booking is no longer awaiting payment', 409, 'not_payable');
  if (booking.total_price <= 0) return bad('booking has no amount to pay', 409, 'not_payable');

  // Midtrans rejects names >50 chars; item total must equal gross_amount.
  const rtName = (booking.room_types as { name?: string } | null)?.name ?? booking.package;
  const item = {
    id: booking.room_type_id,
    price: booking.unit_price,
    quantity: booking.quantity,
    name: rtName.slice(0, 50),
  };

  const res = await fetch(env.MIDTRANS_IS_PRODUCTION === 'true' ? PROD_SNAP : SANDBOX_SNAP, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`${env.MIDTRANS_SERVER_KEY}:`)}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: booking.reference, gross_amount: booking.total_price },
      customer_details: {
        first_name: booking.guest_name.slice(0, 255),
        email: booking.guest_email,
        phone: booking.guest_phone,
      },
      item_details: [item],
      expiry: { unit: 'hours', duration: 24 },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error('[pay]', `midtrans snap HTTP ${res.status}`, await res.text().catch(() => ''));
    return bad('payment service error', 502, 'payment_error');
  }
  const snap = (await res.json()) as { token?: string; redirect_url?: string };
  if (!snap.redirect_url) return bad('payment service error', 502, 'payment_error');

  return new Response(
    JSON.stringify({ token: snap.token, redirect_url: snap.redirect_url }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  );
};
