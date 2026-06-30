import { useMemo, useState } from 'react';
import type { Booking, BookingStatus, Room, RoomType } from '@kimura/core/database.types';
import { formatIDR, formatDate, STATUS_LABELS } from '@kimura/core/format';
import type { AdminLang } from '~/lib/admin-i18n';
import { t as tr } from '~/lib/admin-i18n';

interface Props {
  initialBookings: Booking[];
  roomTypes: Pick<RoomType, 'id' | 'name'>[];
  rooms: Pick<Room, 'id' | 'room_number' | 'room_type_id'>[];
  focusRef?: string;
  lang: AdminLang;
}

export default function BookingsManager({ initialBookings, roomTypes, rooms, focusRef, lang }: Props) {
  const FILTERS: { key: BookingStatus | 'all'; label: string }[] = [
    { key: 'all', label: tr(lang, 'bk.all') },
    { key: 'pending', label: tr(lang, 'bk.pending') },
    { key: 'confirmed', label: tr(lang, 'bk.confirmed') },
    { key: 'checked_in', label: tr(lang, 'bk.checked_in') },
    { key: 'checked_out', label: tr(lang, 'bk.checked_out') },
    { key: 'cancelled', label: tr(lang, 'bk.cancelled') },
  ];

  // Allowed next states from each status (the manual workflow).
  const NEXT: Record<BookingStatus, { status: BookingStatus; labelKey: 'bk.confirm' | 'bk.cancel' | 'bk.check_in' | 'bk.check_out' | 'bk.reopen' | 'bk.no_show'; toastKey: 'bk.confirm' | 'bk.cancel' | 'bk.check_in' | 'bk.check_out' | 'bk.reopen' | 'bk.no_show'; style: string }[]> = {
    pending: [
      { status: 'confirmed', labelKey: 'bk.confirm', toastKey: 'bk.confirm', style: 'bg-blue-600 text-white hover:bg-blue-700' },
      { status: 'cancelled', labelKey: 'bk.cancel', toastKey: 'bk.cancel', style: 'border border-border hover:bg-secondary' },
    ],
    confirmed: [
      { status: 'checked_in', labelKey: 'bk.check_in', toastKey: 'bk.check_in', style: 'bg-green-600 text-white hover:bg-green-700' },
      { status: 'no_show', labelKey: 'bk.no_show', toastKey: 'bk.no_show', style: 'border border-border hover:bg-secondary' },
      { status: 'cancelled', labelKey: 'bk.cancel', toastKey: 'bk.cancel', style: 'border border-border hover:bg-secondary' },
    ],
    checked_in: [
      { status: 'checked_out', labelKey: 'bk.check_out', toastKey: 'bk.check_out', style: 'bg-primary text-primary-foreground hover:opacity-90' },
    ],
    checked_out: [],
    cancelled: [{ status: 'pending', labelKey: 'bk.reopen', toastKey: 'bk.reopen', style: 'border border-border hover:bg-secondary' }],
    no_show: [{ status: 'pending', labelKey: 'bk.reopen', toastKey: 'bk.reopen', style: 'border border-border hover:bg-secondary' }],
  };
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [filter, setFilter] = useState<BookingStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Booking | null>(
    focusRef ? initialBookings.find((b) => b.reference === focusRef) ?? null : null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const rtName = (id: string) => roomTypes.find((r) => r.id === id)?.name ?? '—';
  const roomsFor = (rtId: string) => rooms.filter((r) => r.room_type_id === rtId);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (filter !== 'all' && b.status !== filter) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          b.reference.toLowerCase().includes(q) ||
          b.guest_name.toLowerCase().includes(q) ||
          b.guest_email.toLowerCase().includes(q) ||
          b.guest_phone.includes(q)
        );
      }
      return true;
    });
  }, [bookings, filter, query]);

  async function patch(id: string, body: Record<string, unknown>, okMsg: string) {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...body } as Booking : b)));
      setSelected((s) => (s && s.id === id ? ({ ...s, ...body } as Booking) : s));
      setToast(okMsg);
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Error');
      setTimeout(() => setToast(null), 3500);
    } finally {
      setBusy(null);
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookings.length };
    for (const b of bookings) c[b.status] = (c[b.status] ?? 0) + 1;
    return c;
  }, [bookings]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.key ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-secondary'
              }`}
            >
              {f.label}
              <span className="ml-1.5 text-xs opacity-70">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr(lang, 'bk.search')}
          className="ml-auto w-full max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">{tr(lang, 'bk.col_ref')}</th>
              <th className="px-4 py-3 font-medium">{tr(lang, 'bk.col_guest')}</th>
              <th className="px-4 py-3 font-medium">{tr(lang, 'bk.col_room')}</th>
              <th className="px-4 py-3 font-medium">{tr(lang, 'bk.col_dates')}</th>
              <th className="px-4 py-3 font-medium">{tr(lang, 'bk.col_total')}</th>
              <th className="px-4 py-3 font-medium">{tr(lang, 'bk.col_status')}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((b) => {
              const s = STATUS_LABELS[b.status];
              return (
                <tr key={b.id} className="transition-colors hover:bg-secondary/40">
                  <td className="px-4 py-3"><button onClick={() => setSelected(b)} className="font-mono text-xs text-accent hover:underline">{b.reference}</button></td>
                  <td className="px-4 py-3"><div className="font-medium">{b.guest_name}</div><div className="text-xs text-muted-foreground">{b.guest_phone}</div></td>
                  <td className="px-4 py-3"><div>{rtName(b.room_type_id)}</div><div className="text-xs text-muted-foreground capitalize">{b.package.replace('_', ' ')}</div></td>
                  <td className="px-4 py-3 text-xs">{formatDate(b.check_in)} → {formatDate(b.check_out)}</td>
                  <td className="px-4 py-3 font-medium">{formatIDR(b.total_price)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s?.color}`}>{s?.[lang]}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {NEXT[b.status].slice(0, 2).map((a) => (
                        <button key={a.status} disabled={busy === b.id} onClick={() => patch(b.id, { status: a.status }, `${b.reference} → ${tr(lang, a.toastKey)}`)}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${a.style}`}>
                          {tr(lang, a.labelKey)}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">{tr(lang, 'bk.no_match')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setSelected(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-sm text-muted-foreground">{selected.reference}</div>
                <h2 className="mt-1 font-display text-xl font-bold">{selected.guest_name}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_LABELS[selected.status]?.color}`}>
              {STATUS_LABELS[selected.status]?.[lang]}
            </span>

            <dl className="mt-6 space-y-3 text-sm">
              <Row label={tr(lang, 'bk.email')}><a href={`mailto:${selected.guest_email}`} className="text-accent hover:underline">{selected.guest_email}</a></Row>
              <Row label={tr(lang, 'bk.phone')}><a href={`https://wa.me/${selected.guest_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener" className="text-accent hover:underline">{selected.guest_phone}</a></Row>
              <Row label={tr(lang, 'bk.room_type')}>{rtName(selected.room_type_id)}</Row>
              <Row label={tr(lang, 'bk.package')}><span className="capitalize">{selected.package.replace('_', ' ')}</span></Row>
              <Row label={tr(lang, 'bk.check_in')}>{formatDate(selected.check_in)}</Row>
              <Row label={tr(lang, 'bk.check_out')}>{formatDate(selected.check_out)}</Row>
              <Row label={tr(lang, 'bk.guests')}>{selected.adults} {tr(lang, 'bk.adults')}{selected.children ? `, ${selected.children} ${tr(lang, 'bk.child')}` : ''}</Row>
              <Row label={tr(lang, 'bk.total')}><span className="font-semibold">{formatIDR(selected.total_price)}</span></Row>
              {selected.special_requests && <Row label={tr(lang, 'bk.requests')}>{selected.special_requests}</Row>}
            </dl>

            {/* Assign room */}
            <div className="mt-6">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">{tr(lang, 'bk.assign_room')}</label>
              <select
                value={selected.room_id ?? ''}
                onChange={(e) => patch(selected.id, { room_id: e.target.value || null }, tr(lang, 'bk.room_assigned'))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">{tr(lang, 'bk.unassigned')}</option>
                {roomsFor(selected.room_type_id).map((r) => (
                  <option key={r.id} value={r.id}>{tr(lang, 'rm.room')} {r.room_number}</option>
                ))}
              </select>
            </div>

            {/* Status actions */}
            <div className="mt-6 flex flex-wrap gap-2">
              {NEXT[selected.status].map((a) => (
                <button key={a.status} disabled={busy === selected.id}
                  onClick={() => patch(selected.id, { status: a.status }, `${selected.reference} → ${tr(lang, a.toastKey)}`)}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${a.style}`}>
                  {tr(lang, a.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
