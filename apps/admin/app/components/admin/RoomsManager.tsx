import { useState } from 'react';
import type { Room, RoomState, RoomType } from '@/lib/database.types';
import { formatIDR } from '@/lib/format';
import type { AdminLang } from '@/lib/admin-i18n';
import { t as tr } from '@/lib/admin-i18n';

interface Props {
  roomTypes: RoomType[];
  rooms: Room[];
  lang: AdminLang;
}

const STATES: { key: RoomState; labelKey: 'rm.state_available' | 'rm.state_occupied' | 'rm.state_cleaning' | 'rm.state_maintenance'; color: string }[] = [
  { key: 'available', labelKey: 'rm.state_available', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  { key: 'occupied', labelKey: 'rm.state_occupied', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
  { key: 'cleaning', labelKey: 'rm.state_cleaning', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  { key: 'maintenance', labelKey: 'rm.state_maintenance', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
];

type PriceField = 'price_half_day' | 'price_daily' | 'price_weekly' | 'price_monthly';
const PRICE_FIELDS: { key: PriceField; labelKey: 'rm.f_half_day' | 'rm.f_daily' | 'rm.f_weekly' | 'rm.f_monthly'; colKey: 'rm.f_half_day' | 'rm.f_daily' | 'rm.f_weekly' | 'rm.f_monthly' }[] = [
  { key: 'price_half_day', labelKey: 'rm.f_half_day', colKey: 'rm.f_half_day' },
  { key: 'price_daily', labelKey: 'rm.f_daily', colKey: 'rm.f_daily' },
  { key: 'price_weekly', labelKey: 'rm.f_weekly', colKey: 'rm.f_weekly' },
  { key: 'price_monthly', labelKey: 'rm.f_monthly', colKey: 'rm.f_monthly' },
];

function num(v: string): number | null {
  const n = v.trim();
  if (n === '') return null;
  const x = Math.round(Number(n));
  return Number.isNaN(x) ? null : Math.max(0, x);
}

export default function RoomsManager({ roomTypes, rooms, lang }: Props) {
  const [types, setTypes] = useState<RoomType[]>(roomTypes);
  const [units, setUnits] = useState<Room[]>(rooms);
  const [tab, setTab] = useState<'types' | 'inventory'>('types');
  const [editing, setEditing] = useState<{ id: string; field: PriceField } | null>(null);
  const [draft, setDraft] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [creating, setCreating] = useState<'type' | 'room' | null>(null);

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  async function patchType(id: string, field: string, value: unknown, msg: string) {
    try {
      const res = await fetch('/api/admin/rooms', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'room_type', id, field, value }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Failed');
      setTypes((p) => p.map((tt) => (tt.id === id ? { ...tt, [field]: value } as RoomType : tt)));
      flash(msg);
    } catch (e) { flash(e instanceof Error ? e.message : 'Error'); }
  }

  async function patchRoom(id: string, state: RoomState) {
    try {
      const res = await fetch('/api/admin/rooms', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'room', id, state }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Failed');
      setUnits((p) => p.map((r) => (r.id === id ? { ...r, state } : r)));
      flash(tr(lang, 'rm.room_updated'));
    } catch (e) { flash(e instanceof Error ? e.message : 'Error'); }
  }

  function startEdit(id: string, field: PriceField, current: number | null) {
    setEditing({ id, field });
    setDraft(current?.toString() ?? '');
  }
  async function commitEdit() {
    if (!editing) return;
    const value = num(draft);
    if (draft.trim() !== '' && value === null) { setEditing(null); return; }
    await patchType(editing.id, editing.field, value, tr(lang, 'rm.price_updated'));
    setEditing(null);
  }

  async function createdType(row: Record<string, unknown>) {
    // Refresh from server so we get id + defaults sorted; simplest: reload types list.
    const res = await fetch('/api/admin/rooms?list=types', { headers: { 'Content-Type': 'application/json' } }).catch(() => null);
    // Fallback: we don't have a list endpoint — optimistically fetch room_types via the same admin client path isn't available client-side.
    // Instead append a minimal object so the table updates; full reload on next nav.
    const slug = (row.slug as string) ?? '';
    setTypes((p) => [...p, { ...(row as any) }]);
    void res;
    void slug;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {(['types', 'inventory'] as const).map((tt) => (
            <button key={tt} onClick={() => setTab(tt)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${tab === tt ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-secondary'}`}>
              {tr(lang, tt === 'types' ? 'rm.tab_types' : 'rm.tab_inventory')}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCreating(tab === 'types' ? 'type' : 'room')}
          className="ml-auto rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          {tr(lang, tab === 'types' ? 'rm.add_type' : 'rm.add_room')}
        </button>
      </div>

      {tab === 'types' ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">{tr(lang, 'rm.col_type')}</th>
                {PRICE_FIELDS.map((f) => <th key={f.key} className="px-4 py-3 font-medium">{tr(lang, f.colKey)}</th>)}
                <th className="px-4 py-3 font-medium">{tr(lang, 'rm.featured')}</th>
                <th className="px-4 py-3 font-medium">{tr(lang, 'rm.active')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {types.map((rt) => (
                <tr key={rt.id} className="hover:bg-secondary/40">
                  <td className="px-4 py-3"><div className="font-medium">{rt.name}</div><div className="text-xs text-muted-foreground">{rt.size_sqm} m² · {rt.max_occupancy} {tr(lang, 'rm.guests')}</div></td>
                  {PRICE_FIELDS.map((f) => {
                    const isEditing = editing?.id === rt.id && editing.field === f.key;
                    const val = rt[f.key];
                    return (
                      <td key={f.key} className="px-4 py-3">
                        {isEditing ? (
                          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                            onBlur={commitEdit} onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                            className="w-24 rounded border border-accent bg-background px-2 py-1 text-sm outline-none" />
                        ) : (
                          <button onClick={() => startEdit(rt.id, f.key, val)} className="rounded px-1 py-0.5 text-left hover:bg-secondary">
                            {val != null ? formatIDR(val) : <span className="text-muted-foreground">{tr(lang, 'rm.set')}</span>}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    <button onClick={() => patchType(rt.id, 'featured', !rt.featured, tr(lang, rt.featured ? 'rm.unfeatured_toast' : 'rm.featured_toast'))}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${rt.featured ? 'bg-accent text-accent-foreground' : 'border border-border text-muted-foreground'}`}>
                      {rt.featured ? tr(lang, 'rm.yes') : tr(lang, 'rm.no')}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => patchType(rt.id, 'active', !rt.active, tr(lang, rt.active ? 'rm.hidden_toast' : 'rm.published_toast'))}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${rt.active ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'border border-border text-muted-foreground'}`}>
                      {rt.active ? tr(lang, 'rm.live') : tr(lang, 'rm.hidden')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{tr(lang, 'rm.price_hint')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((r) => {
            const rt = types.find((tt) => tt.id === r.room_type_id);
            const cur = STATES.find((s) => s.key === r.state)!;
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="font-display text-lg font-semibold">{tr(lang, 'rm.room')} {r.room_number}</div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cur.color}`}>{tr(lang, cur.labelKey)}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{rt?.name} · {tr(lang, 'rm.floor')} {r.floor ?? '—'}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {STATES.map((s) => (
                    <button key={s.key} onClick={() => patchRoom(r.id, s.key)} disabled={r.state === s.key}
                      className={`rounded-md px-2 py-1 text-xs transition-colors ${r.state === s.key ? 'cursor-default bg-secondary font-medium' : 'border border-border hover:bg-secondary'}`}>
                      {tr(lang, s.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {units.length === 0 && <p className="col-span-full rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">{tr(lang, 'rm.no_inventory')}</p>}
        </div>
      )}

      {creating && (
        <CreateDialog
          kind={creating}
          lang={lang}
          roomTypes={types}
          onClose={() => setCreating(null)}
          onCreatedType={(row) => { createdType(row); setCreating(null); flash(tr(lang, 'rm.created_type')); }}
          onCreatedRoom={(row) => { setUnits((p) => [...p, row as Room]); setCreating(null); flash(tr(lang, 'rm.created_room')); }}
        />
      )}

      {toast && <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg">{toast}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create dialog — POST to /api/admin/rooms. Bilingual via lang.
// ---------------------------------------------------------------------------
function field(label: string, children: React.ReactNode) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
const inputCls = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

function CreateDialog({ kind, lang, roomTypes, onClose, onCreatedType, onCreatedRoom }: {
  kind: 'type' | 'room';
  lang: AdminLang;
  roomTypes: RoomType[];
  onClose: () => void;
  onCreatedType: (row: Record<string, unknown>) => void;
  onCreatedRoom: (row: Record<string, unknown>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);

    try {
      if (kind === 'type') {
        const name = String(fd.get('name') ?? '').trim();
        if (!name) { setErr(tr(lang, 'rm.err_name_slug')); return; }
        const body = {
          kind: 'room_type',
          name,
          slug: String(fd.get('slug') ?? '').trim(),
          name_id: String(fd.get('name_id') ?? '').trim(),
          description: String(fd.get('description') ?? '').trim(),
          description_id: String(fd.get('description_id') ?? '').trim(),
          size_sqm: Number(fd.get('size_sqm') ?? 0) || null,
          max_occupancy: Number(fd.get('max_occupancy') ?? 2) || 2,
          bed_config: String(fd.get('bed_config') ?? '').trim(),
          amenities: String(fd.get('amenities') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          images: String(fd.get('images') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          price_half_day: num(String(fd.get('price_half_day') ?? '')),
          price_daily: num(String(fd.get('price_daily') ?? '')),
          price_weekly: num(String(fd.get('price_weekly') ?? '')),
          price_monthly: num(String(fd.get('price_monthly') ?? '')),
        };
        setBusy(true);
        const res = await fetch('/api/admin/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = (await res.json()) as { error?: string; id?: string };
        if (!res.ok) {
          if (res.status === 409) { setErr(tr(lang, 'rm.err_slug_taken')); setBusy(false); return; }
          throw new Error(data.error ?? 'Failed');
        }
        // Optimistic row so the table shows it without a full reload.
        onCreatedType({
          id: data.id, name: body.name, slug: body.slug || name.toLowerCase(),
          name_id: body.name_id || body.name, description: body.description, description_id: body.description_id,
          size_sqm: body.size_sqm, max_occupancy: body.max_occupancy, bed_config: body.bed_config || null,
          amenities: body.amenities, images: body.images, price_half_day: body.price_half_day,
          price_daily: body.price_daily, price_weekly: body.price_weekly, price_monthly: body.price_monthly,
          featured: false, active: true, sort_order: 100,
        });
      } else {
        const room_number = String(fd.get('room_number') ?? '').trim();
        const room_type_id = String(fd.get('room_type_id') ?? '').trim();
        if (!room_number) { setErr(tr(lang, 'rm.err_number')); return; }
        if (!room_type_id) { setErr(tr(lang, 'rm.err_type')); return; }
        const body = {
          kind: 'room',
          room_number,
          room_type_id,
          floor: Number(fd.get('floor') ?? 0) || null,
          state: String(fd.get('state') ?? 'available') as RoomState,
        };
        setBusy(true);
        const res = await fetch('/api/admin/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = (await res.json()) as { error?: string; id?: string };
        if (!res.ok) {
          if (res.status === 409) { setErr(tr(lang, 'rm.err_number_taken')); setBusy(false); return; }
          throw new Error(data.error ?? 'Failed');
        }
        onCreatedRoom({
          id: data.id, room_number: body.room_number, room_type_id: body.room_type_id,
          floor: body.floor, state: body.state, active: true,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{tr(lang, kind === 'type' ? 'rm.new_type' : 'rm.new_room')}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {err && <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}

        <form onSubmit={submit} className="space-y-3">
          {kind === 'type' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {field(tr(lang, 'rm.f_name'), <input name="name" className={inputCls} required />)}
                {field(tr(lang, 'rm.f_slug'), <input name="slug" className={inputCls} placeholder="auto" />)}
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">{tr(lang, 'rm.f_slug_hint')}</p>
              <div className="grid grid-cols-2 gap-3">
                {field(tr(lang, 'rm.f_desc'), <textarea name="description" rows={2} className={inputCls} />)}
                {field(tr(lang, 'rm.f_desc_id'), <textarea name="description_id" rows={2} className={inputCls} />)}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {field(tr(lang, 'rm.f_size'), <input name="size_sqm" type="number" min="0" className={inputCls} />)}
                {field(tr(lang, 'rm.f_occupancy'), <input name="max_occupancy" type="number" min="1" defaultValue={2} className={inputCls} />)}
                {field(tr(lang, 'rm.f_bed'), <input name="bed_config" className={inputCls} placeholder="King / Twin / Queen" />)}
              </div>
              {field(tr(lang, 'rm.f_amenities'), <input name="amenities" className={inputCls} placeholder="AC, WiFi, Smart TV" />)}
              {field(tr(lang, 'rm.f_images'), <input name="images" className={inputCls} placeholder="https://…" />)}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {field(tr(lang, 'rm.f_half_day'), <input name="price_half_day" type="number" min="0" className={inputCls} />)}
                {field(tr(lang, 'rm.f_daily'), <input name="price_daily" type="number" min="0" className={inputCls} />)}
                {field(tr(lang, 'rm.f_weekly'), <input name="price_weekly" type="number" min="0" className={inputCls} />)}
                {field(tr(lang, 'rm.f_monthly'), <input name="price_monthly" type="number" min="0" className={inputCls} />)}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {field(tr(lang, 'rm.f_number'), <input name="room_number" className={inputCls} required placeholder="101" />)}
                {field(tr(lang, 'rm.f_type'), (
                  <select name="room_type_id" className={inputCls} required defaultValue="">
                    <option value="" disabled>{tr(lang, 'rm.opt_none')}</option>
                    {roomTypes.map((rt) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
                  </select>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {field(tr(lang, 'rm.floor') + ' *', <input name="floor" type="number" min="0" className={inputCls} />)}
                {field(tr(lang, 'rm.f_state'), (
                  <select name="state" className={inputCls} defaultValue="available">
                    {STATES.map((s) => <option key={s.key} value={s.key}>{tr(lang, s.labelKey)}</option>)}
                  </select>
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
              {tr(lang, 'rm.cancel')}
            </button>
            <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? tr(lang, 'rm.saving') : tr(lang, 'rm.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
