import type { Route } from './+types/activity';
import { requireAdmin } from '~/lib/auth.server';
import ConsoleLog from '~/components/admin/ConsoleLog';
import { t as tr } from '~/lib/admin-i18n';
import type { ActivityLog } from '@kimura/core/database.types';

export function meta() {
  return [{ title: 'Activity Log · Kimura Admin' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, lang, headers } = await requireAdmin(request);
  const { data } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  return Response.json({ lang, logs: (data ?? []) as ActivityLog[] }, { headers });
}

export default function Activity({ loaderData }: Route.ComponentProps) {
  const { lang, logs } = loaderData;
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">{tr(lang, 'act.intro')}</p>
      <ConsoleLog initialLogs={logs} lang={lang} />
    </>
  );
}
