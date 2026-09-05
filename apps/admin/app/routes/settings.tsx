import { useState } from 'react';
import type { Route } from './+types/settings';
import type { PropertySettings } from '@kimura/core/database.types';
import { requireAdmin } from '~/lib/auth.server';
import { t as tr, type StringKey } from '~/lib/admin-i18n';

export function meta() {
  return [{ title: 'Settings · Kimura Admin' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, lang, headers } = await requireAdmin(request);
  const { data } = await supabase.from('property_settings').select('*').eq('id', 1).maybeSingle();
  return Response.json({ lang, settings: data as PropertySettings | null }, { headers });
}

const TEXT_FIELDS: { key: keyof PropertySettings; labelKey: StringKey }[] = [
  { key: 'name', labelKey: 'st.f_name' },
  { key: 'tagline_id', labelKey: 'st.f_tagline_id' },
  { key: 'tagline_en', labelKey: 'st.f_tagline_en' },
  { key: 'phone', labelKey: 'st.f_phone' },
  { key: 'whatsapp', labelKey: 'st.f_whatsapp' },
  { key: 'email', labelKey: 'st.f_email' },
  { key: 'address', labelKey: 'st.f_address' },
  { key: 'address_short', labelKey: 'st.f_address_short' },
  { key: 'maps_url', labelKey: 'st.f_maps_url' },
  { key: 'check_in_time', labelKey: 'st.f_checkin' },
  { key: 'check_out_time', labelKey: 'st.f_checkout' },
];

const inputCls =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { lang, settings } = loaderData;
  const [draft, setDraft] = useState<PropertySettings>(
    settings ?? ({
      id: 1, name: '', tagline_id: '', tagline_en: '', phone: '', whatsapp: '', email: '',
      address: '', address_short: '', maps_url: '', maps_lat: 0, maps_lng: 0,
      check_in_time: '', check_out_time: '', updated_at: '',
    } as PropertySettings),
  );
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Failed');
      flash(tr(lang, 'st.saved'));
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-2xl space-y-4">
      {!settings && (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          {tr(lang, 'st.missing_hint')}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {TEXT_FIELDS.map(({ key, labelKey }) => (
          <label key={key} className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {tr(lang, labelKey)}
            </span>
            <input
              value={String(draft[key] ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              className={inputCls}
            />
          </label>
        ))}
        {(['maps_lat', 'maps_lng'] as const).map((key) => (
          <label key={key} className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {tr(lang, key === 'maps_lat' ? 'st.f_lat' : 'st.f_lng')}
            </span>
            <input
              type="number" step="any"
              value={draft[key]}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
              className={inputCls}
            />
          </label>
        ))}
      </div>

      <div className="pt-2">
        <button
          type="submit" disabled={busy}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? tr(lang, 'st.saving') : tr(lang, 'st.save')}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}
    </form>
  );
}
