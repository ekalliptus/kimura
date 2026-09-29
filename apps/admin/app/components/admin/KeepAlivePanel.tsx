import { useState } from 'react';
import type { KeepAlive } from '@kimura/core/database.types';
import type { AdminLang } from '~/lib/admin-i18n';
import { t as tr } from '~/lib/admin-i18n';

export default function KeepAlivePanel({ initial, lang }: { initial: KeepAlive | null; lang: AdminLang }) {
  const [ka, setKa] = useState<KeepAlive | null>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const lastReal = ka?.pinged_at ? new Date(ka.pinged_at) : null;
  const days = lastReal ? (Date.now() - lastReal.getTime()) / 86_400_000 : null;
  const healthy = days != null && days < 4;

  async function ping() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/keepalive', { method: 'POST' });
      const data = (await res.json()) as { keep_alive?: KeepAlive; elapsed_ms?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? tr(lang, 'sys.ping_failed'));
      setKa(data.keep_alive ?? null);
      setMsg(`${tr(lang, 'sys.ping_ok')} (${data.elapsed_ms}ms)`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{tr(lang, 'sys.ka_title')}</h2>
        <span className={`flex items-center gap-2 text-sm font-medium ${healthy ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
          <span className={`size-2.5 rounded-full ${healthy ? 'bg-green-500' : 'bg-amber-500'}`}></span>
          {healthy ? tr(lang, 'dash.healthy') : lastReal ? tr(lang, 'dash.stale') : tr(lang, 'dash.no_ping')}
        </span>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">{tr(lang, 'sys.ka_desc')}</p>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">{tr(lang, 'sys.last_ping')}</dt>
          <dd className="mt-1 font-medium">{lastReal ? lastReal.toLocaleString() : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">{tr(lang, 'sys.total_pings')}</dt>
          <dd className="mt-1 font-medium">{ka?.ping_count ?? 0}</dd>
        </div>
      </dl>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={ping} disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          {busy ? tr(lang, 'sys.pinging') : tr(lang, 'sys.ping_now')}
        </button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
