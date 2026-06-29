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
 * earlier day after a check-in resets to a new check-in. Keyboard-accessible
 * via native button elements. `singleMode` disables range selection (half-day).
 */
export default function DateRangeCalendar({ checkIn, checkOut, minDate, onChange, locale, singleMode }: Props) {
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const floor = minDate ?? todayISO;

  // Month the left pane shows. Initialise to the check-in month, else today.
  const [anchor, setAnchor] = useState(() => {
    const base = checkIn || todayISO;
    return new Date(base.slice(0, 7) + '-01T00:00:00');
  });

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

  function handleClick(dayISO: string) {
    const dayTs = new Date(dayISO + 'T00:00:00').getTime();
    if (singleMode) {
      // Half-day: each click just sets the single check-in day.
      onChange(dayISO, dayISO);
      return;
    }
    // No start, or clicking before/at start → new check-in.
    if (inTs == null || dayTs <= inTs) {
      onChange(dayISO, '');
      return;
    }
    // Have a start, picking a later day → check-out.
    if (outTs == null || inTs == null) {
      onChange(checkIn, dayISO);
      return;
    }
    // Have both: a later click redefines check-out, an earlier click restarts.
    onChange(dayTs <= inTs ? dayISO : checkIn, dayTs > inTs ? dayISO : '');
  }

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label={locale === 'id' ? 'Bulan sebelumnya' : 'Previous month'}
          className="flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary">‹</button>
        <button type="button" onClick={() => shiftMonth(1)} aria-label={locale === 'id' ? 'Bulan berikutnya' : 'Next month'}
          className="flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary">›</button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {months.map((month) => (
          <MonthGrid
            key={month.toISOString()}
            month={month}
            floor={floor}
            inTs={inTs}
            outTs={outTs}
            locale={locale}
            onPick={handleClick}
          />
        ))}
      </div>
    </div>
  );
}

const WD = {
  id: ['Mi', 'Se', 'Sl', 'Ra', 'Ka', 'Ju', 'Sa'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
} as const;

function MonthGrid({ month, floor, inTs, outTs, locale, onPick }: {
  month: Date;
  floor: string;
  inTs: number | null;
  outTs: number | null;
  locale: 'id' | 'en';
  onPick: (iso: string) => void;
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
    const iso = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push(iso);
  }

  return (
    <div>
      <div className="mb-2 text-center font-display text-sm font-semibold">{label}</div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] uppercase text-muted-foreground">
        {WD[locale].map((w, i) => <div key={i}>{w}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1">
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} />;
          const ts = new Date(iso + 'T00:00:00').getTime();
          const disabled = ts < floorTs;
          const isStart = inTs != null && ts === inTs;
          const isEnd = outTs != null && ts === outTs;
          const inRange = inTs != null && outTs != null && ts > inTs && ts < outTs;
          return (
            <div key={iso} className="flex items-center justify-center">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(iso)}
                className={[
                  'flex size-9 items-center justify-center rounded-full text-sm transition-colors',
                  disabled
                    ? 'cursor-not-allowed text-muted-foreground/30'
                    : isStart || isEnd
                      ? 'bg-accent font-semibold text-accent-foreground'
                      : inRange
                        ? 'bg-accent/15 text-accent'
                        : 'hover:bg-secondary',
                ].join(' ')}
              >
                {Number(iso.slice(8))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
