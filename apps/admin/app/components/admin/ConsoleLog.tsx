import { useEffect, useRef, useState, useCallback } from 'react';
import type { ActivityLog } from '@kimura/core/database.types';
import type { AdminLang } from '~/lib/admin-i18n';
import { t as tr } from '~/lib/admin-i18n';

interface Props {
  initialLogs: ActivityLog[];
  lang: AdminLang;
}

const CAT_COLOR: Record<string, string> = {
  booking: 'text-blue-400',
  room: 'text-purple-400',
  system: 'text-green-400',
  auth: 'text-amber-400',
  general: 'text-neutral-400',
};

function ts(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false }) +
    '.' + String(new Date(iso).getMilliseconds()).padStart(3, '0');
}

/** Live, terminal-style console that tails activity_logs by polling. */
export default function ConsoleLog({ initialLogs, lang }: Props) {
  // Stored newest-first from the server; render oldest-first like a terminal.
  const [logs, setLogs] = useState<ActivityLog[]>(initialLogs);
  const [live, setLive] = useState(true);
  const [category, setCategory] = useState('all');
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const newestRef = useRef<string | null>(initialLogs[0]?.created_at ?? null);

  const poll = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (newestRef.current) params.set('since', newestRef.current);
      if (category !== 'all') params.set('category', category);
      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      if (!res.ok) return;
      const { logs: fresh } = (await res.json()) as { logs: ActivityLog[] };
      if (fresh.length) {
        newestRef.current = fresh[0].created_at;
        setLogs((prev) => {
          const seen = new Set(prev.map((l) => l.id));
          const add = fresh.filter((l) => !seen.has(l.id));
          return [...add.reverse(), ...prev].slice(0, 500);
        });
      }
    } catch { /* network blip — keep polling */ }
  }, [category]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [live, poll]);

  // Reset stream when category changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      params.set('limit', '100');
      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      if (!res.ok || cancelled) return;
      const { logs: fresh } = (await res.json()) as { logs: ActivityLog[] };
      newestRef.current = fresh[0]?.created_at ?? null;
      setLogs(fresh);
    })();
    return () => { cancelled = true; };
  }, [category]);

  // Auto-scroll to bottom on new logs unless paused.
  const ordered = [...logs].reverse(); // oldest → newest
  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, paused]);

  const cats = ['all', 'booking', 'room', 'system', 'auth', 'general'];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`flex size-2.5 rounded-full ${live ? 'animate-pulse bg-green-500' : 'bg-neutral-400'}`}></span>
          <span className="text-sm font-medium">{tr(lang, 'con.console')}</span>
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none">
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setPaused((p) => !p)}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary">
            {paused ? tr(lang, 'con.resume') : tr(lang, 'con.pause')}
          </button>
          <button onClick={() => setLive((l) => !l)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${live ? 'bg-green-600 text-white' : 'border border-border hover:bg-secondary'}`}>
            {live ? tr(lang, 'con.live') : tr(lang, 'con.paused')}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="h-[460px] overflow-y-auto bg-neutral-950 p-4 font-mono text-xs leading-relaxed">
        {ordered.length === 0 ? (
          <div className="text-neutral-500">{tr(lang, 'con.empty')}</div>
        ) : (
          ordered.map((l) => (
            <div key={l.id} className="flex gap-2 border-b border-white/5 py-0.5">
              <span className="shrink-0 text-neutral-600">{ts(l.created_at)}</span>
              <span className={`shrink-0 uppercase ${CAT_COLOR[l.category] ?? 'text-neutral-400'}`}>[{l.category}]</span>
              <span className="text-neutral-200">{l.message}</span>
              <span className="ml-auto shrink-0 text-neutral-600">{l.actor}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
