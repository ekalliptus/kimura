import { useEffect, useMemo, useState } from 'react';
import type { RoomType } from '@/lib/database.types';
import type { Lang, UIKey } from '@/lib/i18n';
import { ui } from '@/lib/i18n';
import { PACKAGES, estimateTotal, formatIDR } from '@/lib/format';
import type { StayPackage } from '@/lib/database.types';
import DateRangeCalendar from '@/components/DateRangeCalendar';
import { useRoomAvailability } from '@/lib/useAvailability';

interface Props {
  rooms: RoomType[];
  lang: Lang;
  initialRoom?: string;
}

function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** ISO date offset from a given ISO date (no DST drift — uses noon). */
function todayISOfromISO(iso: string, offsetDays: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function BookingForm({ rooms, lang, initialRoom }: Props) {
  const t = (k: UIKey) => ui[lang][k] ?? ui.en[k] ?? k;

  const [roomSlug, setRoomSlug] = useState(
    initialRoom && rooms.some((r) => r.slug === initialRoom) ? initialRoom : rooms[0]?.slug ?? '',
  );
  const [pkg, setPkg] = useState<StayPackage>('daily');
  const [checkIn, setCheckIn] = useState(todayISO(1));
  const [checkOut, setCheckOut] = useState(todayISO(2));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [requests, setRequests] = useState('');

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [reference, setReference] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const room = useMemo(() => rooms.find((r) => r.slug === roomSlug), [rooms, roomSlug]);
  const isHalfDay = pkg === 'half_day';

  // Realtime availability for the selected room + dates (soft model). half_day is
  // same-day and never "fills a night", so we don't gate it.
  const avail = useRoomAvailability(roomSlug, checkIn, checkOut, !isHalfDay);

  const estimate = useMemo(() => {
    if (!room) return null;
    // For half_day the range is the single check-in day.
    return estimateTotal(room, pkg, checkIn, isHalfDay ? checkIn : checkOut);
  }, [room, pkg, checkIn, checkOut, isHalfDay]);

  // Packages actually offered by the selected room.
  const availablePackages = useMemo(() => {
    if (!room) return PACKAGES;
    return PACKAGES.filter((p) =>
      p === 'half_day' ? room.price_half_day != null :
      p === 'daily' ? room.price_daily != null :
      p === 'weekly' ? room.price_weekly != null : room.price_monthly != null,
    );
  }, [room]);

  // Keep the selected package valid when the room changes (a room may not offer
  // the currently-selected package).
  useEffect(() => {
    if (!availablePackages.includes(pkg)) {
      setPkg(availablePackages[0] ?? 'daily');
    }
  }, [availablePackages, pkg]);

  // Normalise dates on package switch: half_day → single day (out = in);
  // overnight → ensure out > in. Fixes the stale/range-into-single-day bugs.
  function changePackage(next: StayPackage) {
    setPkg(next);
    if (next === 'half_day') {
      setCheckOut(checkIn);
    } else if (checkOut <= checkIn) {
      // Overnight needs at least one night.
      setCheckOut(todayISOfromISO(checkIn, 1));
    }
  }

  // Overnight packages need check_out > check_in; half_day is same-day.
  const dateInvalid = !isHalfDay && checkOut <= checkIn;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (dateInvalid) {
      setErrorMsg(lang === 'id' ? 'Tanggal keluar harus setelah tanggal masuk.' : 'Check-out must be after check-in.');
      setStatus('error');
      return;
    }
    setStatus('submitting');
    setErrorMsg('');
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_slug: roomSlug,
          package: pkg,
          guest_name: name,
          guest_email: email,
          guest_phone: phone,
          check_in: checkIn,
          check_out: checkOut,
          adults,
          children,
          special_requests: requests,
        }),
      });
      const data = (await res.json()) as { reference?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      setReference(data.reference ?? '');
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/15 text-3xl text-accent">✓</div>
        <h2 className="mt-5 font-display text-2xl font-bold">{t('book.success.title')}</h2>
        <p className="mt-3 text-sm text-muted-foreground">{t('book.success.body')}</p>
        <p className="mt-2 font-mono text-2xl font-bold tracking-wider text-accent">{reference}</p>
        <p className="mx-auto mt-4 max-w-sm text-sm text-muted-foreground">{t('book.success.note')}</p>
        <button
          onClick={() => { setStatus('idle'); setName(''); setEmail(''); setPhone(''); setRequests(''); }}
          className="mt-7 rounded-md border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
        >
          {t('book.another')}
        </button>
      </div>
    );
  }

  const labelCls = 'mb-1.5 block text-sm font-medium';
  const inputCls =
    'w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20';

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
        {/* Room + package */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{t('book.room')}</label>
            <select value={roomSlug} onChange={(e) => setRoomSlug(e.target.value)} className={inputCls}>
              {rooms.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {lang === 'id' ? r.name_id ?? r.name : r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('book.package')}</label>
            <select value={pkg} onChange={(e) => changePackage(e.target.value as StayPackage)} className={inputCls}>
              {availablePackages.map((p) => (
                <option key={p} value={p}>{ui[lang][`pkg.${p}` as UIKey]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dates — calendar. Range for overnight packages, single day for half-day. */}
        <div>
          <label className={labelCls}>
            {t('book.dates')}
            <span className="ml-2 font-normal text-muted-foreground">
              {isHalfDay
                ? (lang === 'id' ? '· sehari' : '· same day')
                : (lang === 'id' ? '· rentang' : '· range')}
            </span>
          </label>
          <div className="rounded-xl border border-border bg-card/50 p-4">
            <DateRangeCalendar
              checkIn={checkIn}
              checkOut={isHalfDay ? '' : checkOut}
              singleMode={isHalfDay}
              onChange={(inIso, outIso) => {
                setCheckIn(inIso);
                setCheckOut(isHalfDay ? inIso : outIso);
              }}
              locale={lang}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              {isHalfDay ? (
                <>{t('book.checkin')}: <span className="font-medium text-foreground">{checkIn}</span></>
              ) : (
                <>
                  {t('book.checkin')}: <span className="font-medium text-foreground">{checkIn}</span>
                  {' '}· {t('book.checkout')}: <span className="font-medium text-foreground">{checkOut}</span>
                </>
              )}
              {estimate && (
                <> · {estimate.quantity} {ui[lang][`unit.${pkg}` as UIKey] ?? ''}</>
              )}
            </span>
          </div>
          {/* Realtime availability indicator */}
          <AvailabilityBadge avail={avail} lang={lang} halfDay={isHalfDay} />
        </div>

        {/* Guest */}
        <div>
          <label className={labelCls}>{t('book.name')} <span className="text-destructive">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required placeholder="—" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{t('book.email')} <span className="text-destructive">*</span></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} required placeholder="you@email.com" />
          </div>
          <div>
            <label className={labelCls}>{t('book.phone')} <span className="text-destructive">*</span></label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} required placeholder="08xx / +62" />
          </div>
        </div>

        {/* Occupancy */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{t('book.adults')}</label>
            <input type="number" min={1} max={room?.max_occupancy ?? 4} value={adults} onChange={(e) => setAdults(Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('book.children')}</label>
            <input type="number" min={0} max={4} value={children} onChange={(e) => setChildren(Number(e.target.value))} className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>{t('book.requests')}</label>
          <textarea value={requests} onChange={(e) => setRequests(e.target.value)} rows={3} className={inputCls} />
        </div>
      </div>

      {/* Summary */}
      <aside className="h-fit lg:sticky lg:top-24">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {room?.images?.[0] && (
            <div className="mb-4 aspect-[4/3] w-full animate-pulse overflow-hidden rounded-lg bg-muted">
              <img
                key={room.images[0]}
                src={room.images[0]}
                alt=""
                loading="lazy"
                decoding="async"
                ref={(el) => {
                  // React swaps src on room change; the global reveal script only
                  // runs once, so self-reveal here. Covers the already-cached case
                  // (complete before onLoad) too.
                  if (el?.complete && el.naturalWidth > 0) {
                    el.classList.remove('opacity-0');
                    el.parentElement?.classList.remove('animate-pulse');
                  }
                }}
                onLoad={(e) => {
                  e.currentTarget.classList.remove('opacity-0');
                  e.currentTarget.parentElement?.classList.remove('animate-pulse');
                }}
                className="size-full object-cover opacity-0 transition-opacity duration-500"
              />
            </div>
          )}
          <h3 className="font-display text-lg font-semibold">
            {room ? (lang === 'id' ? room.name_id ?? room.name : room.name) : '—'}
          </h3>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">{t('book.package')}</dt><dd>{ui[lang][`pkg.${pkg}` as UIKey]}</dd></div>
            {estimate && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{formatIDR(estimate.unit)} × {estimate.quantity} {ui[lang][`unit.${pkg}` as UIKey]}</dt>
                <dd>{formatIDR(estimate.total)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-end justify-between">
              <span className="text-sm text-muted-foreground">{t('book.estimate')}</span>
              <span className="font-display text-2xl font-bold text-accent">{formatIDR(estimate?.total ?? null)}</span>
            </div>
          </div>

          {status === 'error' && (
            <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'submitting' || dateInvalid || avail.status === 'full'}
            className="mt-5 flex w-full items-center justify-center rounded-md bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {status === 'submitting' ? t('book.submitting') : t('book.submit')}
          </button>
        </div>
      </aside>
    </form>
  );
}

/** Realtime availability indicator under the date calendar. */
function AvailabilityBadge({ avail, lang, halfDay }: {
  avail: ReturnType<typeof useRoomAvailability>;
  lang: Lang;
  halfDay: boolean;
}) {
  const t = (k: UIKey) => ui[lang][k] as string;
  let cls = 'bg-muted text-muted-foreground';
  let text: string;
  let dot = '';

  switch (avail.status) {
    case 'idle':
      // half-day skips the inventory check by design; don't prompt for dates.
      text = halfDay
        ? (lang === 'id' ? 'Ketersediaan same-day dikonfirmasi staf.' : 'Same-day availability confirmed by staff.')
        : t('book.avail.select_dates');
      break;
    case 'checking':
      text = t('book.avail.checking');
      break;
    case 'ok':
      text = `${t('book.avail.available')} — ${avail.available} ${t('book.avail.left')}`;
      dot = avail.available <= 1 ? 'bg-amber-500' : 'bg-green-500';
      cls = avail.available <= 1
        ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
        : 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200';
      break;
    case 'full':
      text = t('book.avail.full');
      dot = 'bg-red-500';
      cls = 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200';
      break;
    case 'error':
      text = lang === 'id' ? 'Tidak dapat memeriksa ketersediaan.' : 'Could not check availability.';
      break;
  }

  return (
    <div className={`mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${cls}`}>
      {dot && <span className={`size-2 rounded-full ${dot}`} />}
      {avail.status === 'checking' && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {text}
    </div>
  );
}
