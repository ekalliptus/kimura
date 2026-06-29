import { useState } from 'react';
import type { KeepAlive } from '@/lib/database.types';

export default function KeepAlivePanel({ initial }: { initial: KeepAlive | null }) {
  const [ka, setKa] = useState<KeepAlive | null>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const last = ka?.pinged_at ? new Date(ka.pinged_at) : null;
  const days = last ? (Date.now() - last.getTime()) / 86_400_000 : null;
  const healthy = days != null && days < 4;

  async function ping() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/keepalive', { method: 'POST' });
      const data = (await res.json()) as { keep_alive?: KeepAlive; elapsed_ms?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Ping failed');
      setKa(data.keep_alive ?? null);
      setMsg(`✓ Ping OK (${data.elapsed_ms}ms)`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Supabase Keep-Alive</h2>
        <span className={`flex items-center gap-2 text-sm font-medium ${healthy ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
          <span className={`size-2.5 rounded-full ${healthy ? 'bg-green-500' : 'bg-amber-500'}`}></span>
          {healthy ? 'Healthy' : last ? 'Stale' : 'No ping yet'}
        </span>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        The Cloudflare cron pings the database twice weekly so the free-tier project never pauses.
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Last ping</dt>
          <dd className="mt-1 font-medium">{last ? last.toLocaleString() : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Total pings</dt>
          <dd className="mt-1 font-medium">{ka?.ping_count ?? 0}</dd>
        </div>
      </dl>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={ping} disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          {busy ? 'Pinging…' : 'Ping now'}
        </button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
