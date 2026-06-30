import type { Lang } from './i18n';
import type { RoomType, StayPackage } from './database.types';

/** IDR currency, e.g. "Rp 235.000". */
export function formatIDR(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(iso: string, lang: Lang = 'id'): string {
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, lang: Lang = 'id'): string {
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export const PACKAGES: StayPackage[] = ['half_day', 'daily', 'weekly', 'monthly'];

export function priceForPackage(rt: RoomType, pkg: StayPackage): number | null {
  switch (pkg) {
    case 'half_day': return rt.price_half_day;
    case 'daily': return rt.price_daily;
    case 'weekly': return rt.price_weekly;
    case 'monthly': return rt.price_monthly;
  }
}

/** Lowest available (daily-or-cheaper) headline price for a room card. */
export function fromPrice(rt: RoomType): number | null {
  return rt.price_daily ?? rt.price_half_day ?? rt.price_weekly ?? rt.price_monthly ?? null;
}

/** Inclusive nights between two ISO dates; min 1. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn + 'T00:00:00');
  const b = new Date(checkOut + 'T00:00:00');
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

/**
 * Quantity multiplier for a package over a date range.
 * daily → nights; weekly → ceil(nights/7); monthly → ceil(nights/30); half_day → 1.
 */
export function quantityForPackage(pkg: StayPackage, checkIn: string, checkOut: string): number {
  const nights = nightsBetween(checkIn, checkOut);
  switch (pkg) {
    case 'half_day': return 1;
    case 'daily': return nights;
    case 'weekly': return Math.max(1, Math.ceil(nights / 7));
    case 'monthly': return Math.max(1, Math.ceil(nights / 30));
  }
}

export function estimateTotal(
  rt: RoomType,
  pkg: StayPackage,
  checkIn: string,
  checkOut: string,
): { unit: number | null; quantity: number; total: number | null } {
  const unit = priceForPackage(rt, pkg);
  const quantity = quantityForPackage(pkg, checkIn, checkOut);
  return { unit, quantity, total: unit == null ? null : unit * quantity };
}

export const STATUS_LABELS: Record<string, { id: string; en: string; color: string }> = {
  pending:     { id: 'Menunggu',    en: 'Pending',     color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  confirmed:   { id: 'Dikonfirmasi',en: 'Confirmed',   color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
  checked_in:  { id: 'Check-in',    en: 'Checked in',  color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  checked_out: { id: 'Check-out',   en: 'Checked out', color: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200' },
  cancelled:   { id: 'Dibatalkan',  en: 'Cancelled',   color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
  no_show:     { id: 'Tidak hadir', en: 'No-show',     color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
};
