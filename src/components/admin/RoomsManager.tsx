import { useState } from 'react';
import type { Room, RoomState, RoomType } from '@/lib/database.types';
import { formatIDR } from '@/lib/format';

interface Props {
  roomTypes: RoomType[];
  rooms: Room[];
}

const STATES: { key: RoomState; label: string; color: string }[] = [
  { key: 'available', label: 'Available', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  { key: 'occupied', label: 'Occupied', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
  { key: 'cleaning', label: 'Cleaning', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  { key: 'maintenance', label: 'Maintenance', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
];

type PriceField = 'price_half_day' | 'price_daily' | 'price_weekly' | 'price_monthly';
const PRICE_FIELDS: { key: PriceField; label: string }[] = [
  { key: 'price_half_day', label: 'Half-day' },
  { key: 'price_daily', label: 'Daily' },
  { key: 'price_weekly', label: 'Weekly' },
  { key: 'price_monthly', label: 'Monthly' },
];

export default function RoomsManager({ roomTypes, rooms }: Props) {
  const [types, setTypes] = useState<RoomType[]>(roomTypes);
  const [units, setUnits] = useState<Room[]>(rooms);
  const [tab, setTab] = useState<'types' | 'inventory'>('types');
  const [editing, setEditing] = useState<{ id: string; field: PriceField } | null>(null);
  const [draft, setDraft] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  async function patchType(id: string, field: string, value: unknown, msg: string) {
    try {
      const res = await fetch('/api/admin/rooms', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'room_type', id, field, value }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Failed');
      setTypes((p) => p.map((t) => (t.id === id ? { ...t, [field]: value } as RoomType : t)));
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
      flash('Room updated');
    } catch (e) { flash(e instanceof Error ? e.message : 'Error'); }
  }

  function startEdit(id: string, field: PriceField, current: number | null) {
    setEditing({ id, field });
    setDraft(current?.toString() ?? '');
  }
  async function commitEdit() {
    if (!editing) return;
    const value = draft.trim() === '' ? null : Math.max(0, Math.round(Number(draft)));
    if (value !== null && Number.isNaN(value)) { setEditing(null); return; }
    await patchType(editing.id, editing.field, value, 'Price updated');
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {(['types', 'inventory'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-secondary'}`}>
            {t === 'types' ? 'Room Types & Pricing' : 'Room Inventory'}
          </button>
        ))}
      </div>

      {tab === 'types' ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Room type</th>
                {PRICE_FIELDS.map((f) => <th key={f.key} className="px-4 py-3 font-medium">{f.label}</th>)}
                <th className="px-4 py-3 font-medium">Featured</th>
                <th className="px-4 py-3 font-medium">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {types.map((rt) => (
                <tr key={rt.id} className="hover:bg-secondary/40">
                  <td className="px-4 py-3"><div className="font-medium">{rt.name}</div><div className="text-xs text-muted-foreground">{rt.size_sqm} m² · {rt.max_occupancy} guests</div></td>
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
                            {val != null ? formatIDR(val) : <span className="text-muted-foreground">— set</span>}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    <button onClick={() => patchType(rt.id, 'featured', !rt.featured, rt.featured ? 'Unfeatured' : 'Featured')}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${rt.featured ? 'bg-accent text-accent-foreground' : 'border border-border text-muted-foreground'}`}>
                      {rt.featured ? '★ Yes' : 'No'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => patchType(rt.id, 'active', !rt.active, rt.active ? 'Hidden' : 'Published')}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${rt.active ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'border border-border text-muted-foreground'}`}>
                      {rt.active ? 'Live' : 'Hidden'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">Click a price to edit inline. Enter to save, Esc to cancel.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((r) => {
            const rt = types.find((t) => t.id === r.room_type_id);
            const cur = STATES.find((s) => s.key === r.state)!;
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="font-display text-lg font-semibold">Room {r.room_number}</div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cur.color}`}>{cur.label}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{rt?.name} · Floor {r.floor ?? '—'}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {STATES.map((s) => (
                    <button key={s.key} onClick={() => patchRoom(r.id, s.key)} disabled={r.state === s.key}
                      className={`rounded-md px-2 py-1 text-xs transition-colors ${r.state === s.key ? 'cursor-default bg-secondary font-medium' : 'border border-border hover:bg-secondary'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {units.length === 0 && <p className="col-span-full rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">No rooms in inventory.</p>}
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg">{toast}</div>}
    </div>
  );
}
