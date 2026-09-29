/**
 * One-shot price sync from the Cloudbeds rate card to Supabase room_types.
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from apps/web/.dev.vars.
 * Usage: bun scripts/sync-cloudbeds-prices.ts [--dry-run]
 */
import { readFileSync } from 'node:fs';

const rates: Record<string, number> = {
  'studio-14-single': 157_950, // rack 243000
  'studio-16-twin': 196_950,   // rack 303000
  'studio-16-queen': 196_950,  // not bookable on those dates; matched to twin
  'studio-16-king': 206_700,   // rack 318000
  'studio-20-king': 252_200,   // rack 388000
  'suite-20-king': 278_200,    // rack 428000
  'triple-bed': 330_200,       // rack 508000
  'ryokan-king': 310_700,      // rack 478000
};

const dryRun = process.argv.includes('--dry-run');

const vars = Object.fromEntries(
  readFileSync(new URL('../apps/web/.dev.vars', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = vars;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in apps/web/.dev.vars');
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

const current = await fetch(`${SUPABASE_URL}/rest/v1/room_types?select=slug,price_daily&order=sort_order`, { headers }).then((r) => r.json() as Promise<{ slug: string; price_daily: number }[]>);

let changed = 0;
for (const row of current) {
  const target = rates[row.slug];
  if (target == null) continue;
  const mark = row.price_daily === target ? '  =' : ' ~>';
  if (row.price_daily !== target) changed++;
  console.log(`${mark} ${row.slug}: ${row.price_daily} → ${target}`);
  if (!dryRun && row.price_daily !== target) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/room_types?slug=eq.${row.slug}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ price_daily: target }),
    });
    if (!res.ok) console.error(`   FAILED: ${res.status} ${await res.text()}`);
  }
}
console.log(dryRun ? `[dry-run] ${changed} rows would change` : `Synced ${changed} rows`);
