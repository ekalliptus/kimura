import type { Route } from './+types/system';
import { data } from 'react-router';
import { requireAdmin } from '~/lib/auth.server';
import ConsoleLog from '~/components/admin/ConsoleLog';
import KeepAlivePanel from '~/components/admin/KeepAlivePanel';
import { t as tr } from '~/lib/admin-i18n';
import { formatDateTime } from '@kimura/core/format';
import type { ActivityLog, KeepAlive } from '@kimura/core/database.types';

const CRON = '17 7 * * 1,4';

export function meta() {
  return [{ title: 'System · Kimura Admin' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, lang, user, headers } = await requireAdmin(request);
  const [kaRes, logsRes, countsRes] = await Promise.all([
    supabase.from('keep_alive').select('*').eq('id', 1).maybeSingle(),
    supabase.from('activity_logs').select('*').eq('category', 'system').order('created_at', { ascending: false }).limit(80),
    supabase.from('bookings').select('id', { count: 'exact', head: true }),
  ]);
  return data(
    {
      lang,
      user,
      keepAlive: (kaRes.data ?? null) as KeepAlive | null,
      systemLogs: (logsRes.data ?? []) as ActivityLog[],
      bookingCount: countsRes.count ?? 0,
    },
    { headers },
  );
}

export default function System({ loaderData }: Route.ComponentProps) {
  const { lang, user, keepAlive, systemLogs, bookingCount } = loaderData;
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <KeepAlivePanel initial={keepAlive} lang={lang} />

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-semibold">{tr(lang, 'sys.env')}</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">{tr(lang, 'sys.signed_in')}</dt><dd className="font-medium">{user?.email}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">{tr(lang, 'sys.runtime')}</dt><dd className="font-medium">Cloudflare Workers</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">{tr(lang, 'sys.cron')}</dt><dd className="font-mono text-xs">{CRON}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">{tr(lang, 'sys.total_bookings')}</dt><dd className="font-medium">{bookingCount}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">{tr(lang, 'sys.last_ka')}</dt><dd className="font-medium">{keepAlive?.pinged_at ? formatDateTime(keepAlive.pinged_at) : '—'}</dd></div>
          </dl>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 font-display text-lg font-semibold">{tr(lang, 'sys.console')}</h2>
        <ConsoleLog initialLogs={systemLogs} lang={lang} />
      </div>
    </>
  );
}
