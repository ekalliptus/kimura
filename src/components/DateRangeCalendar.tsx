import { useMemo, useState } from 'react';

interface Props {
  /** ISO yyyy-mm-dd */
  checkIn: string;
  checkOut: string;
  minDate?: string; // earliest selectable day (ISO), default today
  onChange: (checkIn: string, checkOut: string) => void;
  locale: 'id' | 'en';
  /** Single-day selection (half-day stays): each click sets check-in only. */
  singleMode?: boolean;
}

/**
 * Two-month date-range picker. No dependencies.
 * Click 1 → check-in; click 2 → check-out (must be after check-in). Clicking an
 * earlier day after a check-in resets to a new check-in. A continuous range band
 * + hover preview make the selection legible. `singleMode` disables ranges.
 */
export default function DateRangeCalendar({ checkIn, checkOut, minDate, onChange, locale, singleMode }: Props) {
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const floor = minDate ?? todayISO;

  // Month the left pane shows. Initialise to the check-in month, else today.
  const [anchor, setAnchor] = useState(() => {
    const base = checkIn || todayISO;
    return new Date(base.slice(0, 7) + '-01T00:00:00');
  });
  // Day under the cursor while picking a check-out (for the range preview).
  const [hoverISO, setHoverISO] = useState<string | null>(null);

  function shiftMonth(delta: number) {
    const d = new Date(anchor);
    d.setMonth(d.getMonth() + delta);
    setAnchor(d);
  }

  // Two consecutive months to render.
  const months = useMemo(() => {
    const m0 = new Date(anchor);
    const m1 = new Date(anchor);
    m1.setMonth(m1.getMonth() + 1);
    return [m0, m1];
  }, [anchor]);

  const inTs = checkIn ? new Date(checkIn + 'T00:00:00').getTime() : null;
  const outTs = checkOut ? new Date(checkOut + 'T00:00:00').getTime() : null;
  const hoverTs = hoverISO ? new Date(hoverISO + 'T00:00:00').getTime() : null;
  // Preview end: while a start is set but no end yet, follow the cursor.
  const previewTs = !singleMode && inTs != null && outTs == null && hoverTs != null && hoverTs > inTs ? hoverTs : null;
  const todayTs = new Date(todayISO + 'T00:00:00').getTime();

  function handleClick(dayISO: string) {
    const dayTs = new Date(dayISO + 'T00:00:00').getTime();
    if (singleMode) {
      onChange(dayISO, dayISO);
      return;
    }
    if (inTs == null || dayTs <= inTs) {
      onChange(dayISO, '');
      return;
    }
    if (outTs == null) {
      onChange(checkIn, dayISO);
      return;
    }
    onChange(dayTs <= inTs ? dayISO : checkIn, dayTs > inTs ? dayISO : '');
  }

  return (
    <div className="select-none">
      <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
        {months.map((month, i) => (
          <MonthGrid
            key={month.toISOString()}
            month={month}
            floor={floor}
            inTs={inTs}
            outTs={outTs}
            previewTs={previewTs}
            todayTs={todayTs}
            singleMode={!!singleMode}
            locale={locale}
            onPick={handleClick}
            onHover={setHoverISO}
            // Nav arrows live on the first/second pane corners.
            navLeft={i === 0 ? () => shiftMonth(-1) : undefined}
            navRight={i === months.length - 1 ? () => shiftMonth(1) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

const WD = {
  id: ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
} as const;

function MonthGrid({ month, floor, inTs, outTs, previewTs, todayTs, singleMode, locale, onPick, onHover, navLeft, navRight }: {
  month: Date;
  floor: string;
  inTs: number | null;
  outTs: number | null;
  previewTs: number | null;
  todayTs: number;
  singleMode: boolean;
  locale: 'id' | 'en';
  onPick: (iso: string) => void;
  onHover: (iso: string | null) => void;
  navLeft?: () => void;
  navRight?: () => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const label = new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { month: 'long', year: 'numeric' }).format(month);

  const firstDow = new Date(year, m, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const floorTs = new Date(floor + 'T00:00:00').getTime();

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  // Effective range end (real or hover preview).
  const endTs = outTs ?? previewTs;

  return (
    <div onMouseLeave={() => onHover(null)}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={navLeft}
          disabled={!navLeft}
          aria-label={locale === 'id' ? 'Bulan sebelumnya' : 'Previous month'}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary disabled:invisible"
        >‹</button>
        <div className="font-display text-sm font-semibold">{label}</div>
        <button
          type="button"
          onClick={navRight}
          disabled={!navRight}
          aria-label={locale === 'id' ? 'Bulan berikutnya' : 'Next month'}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary disabled:invisible"
        >›</button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {WD[locale].map((w, i) => <div key={i} className="pb-1.5">{w}</div>)}
      </div>

      {/* gap-y only — no x gap so the range band is horizontally continuous */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`e${i}`} />;
          const ts = new Date(iso + 'T00:00:00').getTime();
          const disabled = ts < floorTs;
          const isStart = inTs != null && ts === inTs;
          const isEnd = !singleMode && endTs != null && ts === endTs;
          const inBand = !singleMode && inTs != null && endTs != null && ts > inTs && ts < endTs;
          const isToday = ts === todayTs;
          const selected = isStart || isEnd;

          // Continuous band: paint the CELL background; round only the ends.
          const bandCls = inBand
            ? 'bg-accent/12'
            : isStart && endTs != null && endTs > (inTs ?? 0)
              ? 'bg-accent/12 rounded-l-full'
              : isEnd && inTs != null
                ? 'bg-accent/12 rounded-r-full'
                : '';

          return (
            <div key={iso} className={`flex items-center justify-center ${bandCls}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(iso)}
                onMouseEnter={() => onHover(iso)}
                aria-label={iso}
                aria-pressed={selected}
                className={[
                  'relative flex size-9 items-center justify-center rounded-full text-sm transition-colors',
                  disabled
                    ? 'cursor-not-allowed text-muted-foreground/30'
                    : selected
                      ? 'bg-accent font-semibold text-accent-foreground'
                      : inBand
                        ? 'text-accent hover:bg-accent/20'
                        : 'hover:bg-secondary',
                ].join(' ')}
              >
                {Number(iso.slice(8))}
                {isToday && !selected && (
                  <span className="absolute bottom-1 size-1 rounded-full bg-accent" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
