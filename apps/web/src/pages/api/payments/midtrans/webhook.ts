import type { APIRoute } from 'astro';
import type { Database } from '@kimura/core/database.types';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getEnv } from '@/lib/env';

export const prerender = false;

// POST /api/payments/midtrans/webhook — Midtrans notification callback.
// Verifies signature_key = sha512(order_id + status_code + gross_amount + server_key),
// then maps settlement/capture → confirmed, cancel/deny/expire → cancelled.
// Idempotent: only a `pending` booking transitions; anything else answers 200.
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!env.MIDTRANS_SERVER_KEY) return new Response('{"error":"payments disabled"}', { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response('{"error":"invalid json"}', { status: 400 });
  }

  const orderId = String(body.order_id ?? '');
  const statusCode = String(body.status_code ?? '');
  const grossAmount = String(body.gross_amount ?? '');
  const signature = String(body.signature_key ?? '');
  const txnStatus = String(body.transaction_status ?? '');
  if (!orderId || !signature) return new Response('{"error":"missing fields"}', { status: 400 });

  const digest = await crypto.subtle.digest(
    'SHA-512',
    new TextEncoder().encode(`${orderId}${statusCode}${grossAmount}${env.MIDTRANS_SERVER_KEY}`),
  );
  const expected = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (signature !== expected) {
    console.error('[midtrans webhook]', `signature mismatch for ${orderId}`);
    return new Response('{"error":"bad signature"}', { status: 403 });
  }

  const target = ['settlement', 'capture'].includes(txnStatus)
    ? 'confirmed'
    : ['cancel', 'deny', 'expire'].includes(txnStatus)
      ? 'cancelled'
      : null;
  if (!target) {
    // pending / refund / partial-refund etc — nothing to transition.
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const supabase = await createSupabaseAdminClient();
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, reference, status, total_price')
    .eq('reference', orderId)
    .maybeSingle();
  if (!booking) {
    console.error('[midtrans webhook]', `unknown order ${orderId}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  // Midtrans and our DB disagree on the amount — never transition on that.
  if (Number(grossAmount) !== booking.total_price) {
    console.error('[midtrans webhook]', `gross_amount ${grossAmount} != total_price ${booking.total_price} for ${orderId}`);
    return new Response('{"error":"amount mismatch"}', { status: 403 });
  }
  if (booking.status !== 'pending') {
    // Already processed, or an admin moved it manually — webhook stays no-op.
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const patch: Partial<Database['public']['Tables']['bookings']['Update']> = { status: target };
  if (target === 'confirmed') patch.confirmed_at = new Date().toISOString();
  if (target === 'cancelled') patch.cancelled_at = new Date().toISOString();

  const { error } = await supabase.from('bookings').update(patch).eq('id', booking.id);
  if (error) {
    console.error('[midtrans webhook]', error.message, orderId);
    return new Response('{"error":"update failed"}', { status: 200 });
  }

  // Audit log (best-effort).
  await supabase.from('activity_logs').insert({
    action: `booking.payment_${target}`,
    category: 'booking',
    message: `Payment ${txnStatus} — booking ${booking.reference} → ${target} (Midtrans)`,
    actor: 'midtrans',
    entity_type: 'booking',
    entity_id: booking.id,
    metadata: { reference: booking.reference, transaction_status: txnStatus, gross_amount: grossAmount },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
