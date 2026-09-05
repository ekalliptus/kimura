import { formatIDR, formatDate } from './format';

/**
 * WhatsApp notification adapter. Provider: Fonnte (Wablas stub kept for later).
 * All sends are best-effort by contract: callers must never let a WA failure
 * fail the main operation (booking save / status change).
 */

export interface WaBooking {
  reference: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  package: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  total_price: number;
  special_requests: string | null;
  room_type_name: string;
}

export interface WaProvider {
  sendText(to: string, message: string): Promise<void>;
}

export interface WaConfig {
  WA_ENABLED?: string;
  WA_PROVIDER?: string;
  WA_API_TOKEN?: string;
  WA_ADMIN_PHONE?: string;
}

/** `08…`/`8…`/`+62…`/`62…` → `62…`. Throws on numbers that can't be one. */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  else if (digits.startsWith('8')) digits = '62' + digits;
  if (!/^62\d{8,13}$/.test(digits)) throw new Error(`invalid WA number: ${raw}`);
  return digits;
}

const FONNTE_URL = 'https://api.fonnte.com/send';
const TIMEOUT_MS = 8_000;

class WaSendError extends Error {}

async function fonnteSend(token: string, to: string, message: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(FONNTE_URL, {
      method: 'POST',
      headers: { Authorization: token },
      body: new URLSearchParams({ target: to, message }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new WaSendError(`network: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status >= 500) throw new WaSendError(`HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Fonnte answers 200 with {status:false} on provider-side rejects.
  try {
    const body = (await res.json()) as { status?: boolean };
    if (body.status === false) throw new Error('provider rejected the message');
  } catch (err) {
    if (err instanceof WaSendError) throw err;
    if (err instanceof Error && err.message !== 'provider rejected the message') {
      throw new WaSendError(`bad response body: ${err.message}`);
    }
    throw err;
  }
}

/** Enabled client, or null when the feature is off / unconfigured. */
export function waClientFromEnv(config: WaConfig): WaProvider | null {
  if (config.WA_ENABLED !== 'true' || !config.WA_API_TOKEN) return null;
  if (config.WA_PROVIDER && config.WA_PROVIDER !== 'fonnte') return null;
  const token = config.WA_API_TOKEN;
  return {
    async sendText(to: string, message: string) {
      const target = normalizePhone(to);
      try {
        await fonnteSend(token, target, message);
      } catch (err) {
        if (err instanceof WaSendError) {
          // One retry for transient failures (network / 5xx / unreadable body).
          await fonnteSend(token, target, message);
        } else {
          throw err;
        }
      }
    },
  };
}

/** Fire-and-forget send for hooks: silently no-op when disabled, logs failures. */
export async function sendWaText(config: WaConfig, to: string, message: string): Promise<void> {
  const client = waClientFromEnv(config);
  if (!client) return;
  try {
    await client.sendText(to, message);
  } catch (err) {
    console.error('[WA]', err instanceof Error ? err.message : String(err));
  }
}

const PKG_LABEL: Record<string, string> = {
  half_day: 'setengah hari',
  daily: 'harian',
  weekly: 'mingguan',
  monthly: 'bulanan',
};

export function bookingAdminMessage(b: WaBooking): string {
  const guests = b.children > 0 ? `${b.adults} dewasa, ${b.children} anak` : `${b.adults} dewasa`;
  const lines = [
    `Booking baru ${b.reference}`,
    `Tamu: ${b.guest_name}`,
    `Kamar: ${b.room_type_name} (paket ${PKG_LABEL[b.package] ?? b.package})`,
    `Tanggal: ${formatDate(b.check_in)} → ${formatDate(b.check_out)}`,
    `Jumlah tamu: ${guests}`,
    `Total: ${formatIDR(b.total_price)}`,
    `WA tamu: ${b.guest_phone}`,
    `Email: ${b.guest_email}`,
  ];
  if (b.special_requests) lines.push(`Catatan: ${b.special_requests}`);
  return lines.join('\n');
}

export function bookingGuestMessage(b: WaBooking, status: 'confirmed' | 'cancelled'): string {
  if (status === 'cancelled') {
    return [
      `Mohon maaf, reservasi ${b.reference} (${b.room_type_name}, ${formatDate(b.check_in)}) dibatalkan.`,
      'Silakan hubungi kami bila ingin membuat reservasi lain. Terima kasih.',
    ].join('\n');
  }
  return [
    `Terima kasih! Reservasi ${b.reference} telah dikonfirmasi.`,
    `${b.room_type_name} · ${formatDate(b.check_in)} → ${formatDate(b.check_out)} · ${formatIDR(b.total_price)}`,
    'Silakan menunggu pembayaran / instruksi check-in dari kami.',
  ].join('\n');
}
