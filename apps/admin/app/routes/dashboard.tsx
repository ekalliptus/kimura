import type { Route } from './+types/dashboard';
import { Link, data } from 'react-router';
import { requireAdmin } from '~/lib/auth.server';
import { t as tr } from '~/lib/admin-i18n';
import { formatIDR, formatDateTime, STATUS_LABELS } from '@kimura/core/format';
import type { Booking } from '@kimura/core/database.types';

export function meta() {
  return [{ title: 'Dashboard · Kimura Admin' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, lang, headers } = await requireAdmin(request);

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  // Counts via head queries (exact, not sampled); recent rows fetched separately.
  const [pendingRes, checkedInRes, arrivalsRes, departuresRes, totalRes, monthRes, keepAliveRes, logsRes] =
    await Promise.all([
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'checked_in'),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('check_in', today)
        .in('status', ['confirmed', 'pending']),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('check_out', today)
        .in('status', ['confirmed', 'checked_in']),
      supabase.from('bookings').select('id', { count: 'exact', head: true }),
      supabase
        .from('bookings')
        .select('total_price')
        .gte('check_in', monthStart)
        .not('status', 'in', '(cancelled,no_show)')
        .limit(2000),
      supabase.from('keep_alive').select('*').eq('id', 1).maybeSingle(),
      supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(6),
    ]);

  const recentRes = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(8);

  const monthValue = (monthRes.data ?? []).reduce((sum, b) => sum + (b.total_price ?? 0), 0);

  return data(
    {
      lang,
      counts: {
        pending: pendingRes.count ?? 0,
        checkedIn: checkedInRes.count ?? 0,
        arrivals: arrivalsRes.count ?? 0,
        departures: departuresRes.count ?? 0,
        total: totalRes.count ?? 0,
      },
      monthValue,
      keepAlive: keepAliveRes.data,
      recentLogs: logsRes.data ?? [],
      recent: (recentRes.data ?? []) as Booking[],
    },
    { headers },
  );
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { lang, counts, monthValue, keepAlive, recentLogs, recent } = loaderData;
  const today = new Date().toISOString().slice(0, 10);

  const stats = [
    { label: tr(lang, 'dash.pending'), value: counts.pending, hint: tr(lang, 'dash.pending_hint'), accent: true },
    { label: tr(lang, 'dash.checked_in'), value: counts.checkedIn, hint: tr(lang, 'dash.checked_in_hint'), accent: false },
    { label: tr(lang, 'dash.arrivals'), value: counts.arrivals, hint: today, accent: false },
    { label: tr(lang, 'dash.departures'), value: counts.departures, hint: today, accent: false },
  ];

  const lastPing = keepAlive?.pinged_at ? new Date(keepAlive.pinged_at) : null;
  const daysSincePing = lastPing ? (Date.now() - lastPing.getTime()) / 86_400_000 : null;
  const pingHealthy = daysSincePing != null && daysSincePing < 4;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className={`mt-2 font-display text-3xl font-bold ${s.accent && s.value > 0 ? 'text-accent' : ''}`}>{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.hint}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-display font-semibold">{tr(lang, 'dash.recent')}</h2>
              <Link to="/bookings" className="text-sm text-accent hover:underline">{tr(lang, 'dash.view_all')} →</Link>
            </div>
            {recent.length > 0 ? (
              <div className="divide-y divide-border">
                {recent.map((b) => {
                  const s = STATUS_LABELS[b.status];
                  return (
                    <Link key={b.id} to={`/bookings?ref=${b.reference}`} className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-secondary/40">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{b.reference}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s?.color}`}>{s?.[lang]}</span>
                        </div>
                        <div className="mt-0.5 truncate text-sm font-medium">{b.guest_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{formatIDR(b.total_price)}</div>
                        <div className="text-xs text-muted-foreground">{b.check_in}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">{tr(lang, 'dash.no_bookings')}</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{tr(lang, 'dash.revenue_month')}</div>
            <div className="mt-2 font-display text-2xl font-bold">{formatIDR(monthValue)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {tr(lang, 'dash.all_time')}: {counts.total} · {tr(lang, 'dash.excl_cancelled')}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{tr(lang, 'dash.keepalive')}</div>
              <span className={`flex size-2.5 rounded-full ${pingHealthy ? 'bg-green-500' : 'bg-amber-500'}`}></span>
            </div>
            <div className="mt-2 text-sm font-medium">{pingHealthy ? tr(lang, 'dash.healthy') : (lastPing ? tr(lang, 'dash.stale') : tr(lang, 'dash.no_ping'))}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {lastPing ? `${tr(lang, 'dash.last')}: ${formatDateTime(keepAlive!.pinged_at)}` : tr(lang, 'dash.cron_not_run')}
            </div>
            {keepAlive && <div className="mt-1 text-xs text-muted-foreground">{keepAlive.ping_count} {tr(lang, 'dash.pings_total')}</div>}
            <Link to="/system" className="mt-3 inline-block text-xs text-accent hover:underline">{tr(lang, 'dash.system_details')} →</Link>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4"><h2 className="font-display font-semibold">{tr(lang, 'dash.activity')}</h2></div>
            {recentLogs.length > 0 ? (
              <ul className="divide-y divide-border">
                {recentLogs.map((l) => (
                  <li key={l.id} className="px-5 py-3">
                    <div className="text-sm">{l.message}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(l.created_at)} · {l.actor}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">{tr(lang, 'dash.no_activity')}</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
