# SUPER PROMPT — Kimura Revenue-Ready (WA Notification → Payment → White-label)

> Prompt eksekusi untuk coding agent. Jalankan di root repo `C:\dev\kimura`.
> Eksekusi FASE PER FASE secara berurutan. Setiap fase: implement → verify → commit → laporan singkat → lanjut fase berikutnya. Jika ada keputusan ambigu yang mengubah arsitektur, berhenti dan tanya.

---

## 0. Konteks Proyek (baca dulu, jangan diubah tanpa alasan)

**Kimura Kostay** — booking site + admin panel untuk satu properti (kost/hotel Semarang).
Bun-workspace monorepo, dua Cloudflare Workers, satu Supabase bersama:

```
apps/web      Astro 7 SSR (site publik, bilingual ID/EN) → kimura.ekalliptus.com
apps/admin    React Router v7 framework mode → admin.kimura.ekalliptus.com
packages/core @kimura/core: database.types, format, hotel, i18n, img, supabase, utils
```

Fakta penting:

- Runtime **Cloudflare Workers** — WAJIB Web-standard API (`fetch`, `crypto.subtle`, `AbortSignal`). Dilarang memakai modul Node-only.
- Database Supabase: tabel `admins`, `room_types`, `rooms`, `bookings`, `activity_logs`, `keep_alive`. Enum `booking_status`: `pending | confirmed | checked_in | checked_out | cancelled | no_show`. Enum `stay_package`: `half_day | daily | weekly | monthly`.
- Booking dibuat di `apps/web/src/pages/api/bookings.ts` (POST): validasi ketat di trust boundary, harga di-snapshot server-side, insert dengan retry pada collision `reference` (kode `23505`), lalu audit log **best-effort** ke `activity_logs`.
- Admin mengubah status booking lewat `apps/admin/app/routes/api.bookings.tsx`.
- Auth admin: session cookie Supabase (`@supabase/ssr`) + allowlist `is_admin()` RPC. RLS aktif — **jangan ubah kebijakan RLS kecuali diminta eksplisit di bawah**.
- Env var per worker dibaca dari `apps/<app>/.dev.vars` (gitignored, contoh di `.dev.vars.example`); production secrets via `wrangler secret put`.
- Booking saat ini **reservasi-only**: tamu submit → admin konfirmasi manual. Tidak ada payment gateway.

**Kualitas kode yang diharapkan** (samakan dengan kode yang sudah ada):

- Validasi & sanitasi di trust boundary (trim, slice panjang, regex ketat).
- Side-effect eksternal (WA, payment, log) selalu **best-effort**: kegagalannya TIDAK BOLEH menggagalkan operasi utama (booking tetap tersimpan). Selalu `console.error` dengan prefix tag seperti `[POST /api/bookings]`.
- Response error API: JSON `{ error, code? }` dengan status HTTP tepat.
- Komentar hanya untuk constraint yang tidak terlihat dari kode.
- Bahasa komentar & kode: English. Pesan user-facing: bilingual mengikuti pola `packages/core/i18n.ts`.

---

## FASE 1 — Integrasi Notifikasi WhatsApp (prioritas utama)

Tujuan: setiap event booking penting otomatis muncul di WhatsApp admin, dan tamu menerima konfirmasi/batal via WA. Provider: **Fonnte** (primary), dengan adapter supaya Wablas mudah ditambahkan.

### 1.1 Modul adapter — `packages/core/src/wa.ts`

- Interface provider: `sendText(to: string, message: string): Promise<void>` + factory `waClientFromEnv(env)`.
- Implementasi Fonnte: `POST https://api.fonnte.com/send`, header `Authorization: <WA_API_TOKEN>`, body form `target` (nomor) & `message`. Wablas: siapkan stub interface saja (belum perlu diimplement penuh).
- Normalisasi nomor: terima `08…`, `8…`, `+62…`, `62…` → output `62xxxxxxxxxx` tanpa `+`. Buang karakter non-digit. Nomor invalid → lempar error yang ditangkap pemanggil (jangan pernah crash).
- Setiap request: `AbortSignal.timeout(8_000)`, satu kali retry pada network error/5xx. Kegagalan final → `console.error('[WA]', …)`.
- Ekspor juga template pesan (fungsi murni, teks Indonesia):
  - `bookingAdminMessage(booking)`: booking baru masuk — referensi, nama tamu, room type, paket, check-in/out, jumlah tamu, total, nomor & email tamu, special requests (jika ada).
  - `bookingGuestMessage(booking, status)`: konfirmasi (`confirmed`) berisi referensi + rangkuman + "menunggu pembayaran/instruksi check-in", dan pembatalan (`cancelled`) berisi referensi + permohonan maaf.
- Tambahkan `wa.ts` ke barrel ekspor `@kimura/core` jika ada.

### 1.2 Env var (kedua worker)

Tambahkan ke **kedua** `apps/web/.dev.vars.example` dan `apps/admin/.dev.vars.example` (dan dokumentasikan `wrangler secret put` di README bagian baru "WhatsApp & Payments"):

```
WA_ENABLED="true|false"        # default false — fitur mati tanpa konfigurasi
WA_PROVIDER="fonnte"           # saat ini hanya fonnte
WA_API_TOKEN=""
WA_ADMIN_PHONE="62812xxxxxxx"  # tujuan notifikasi booking masuk
```

Semua kode WA harus no-op aman ketika `WA_ENABLED` bukan `"true"` (tidak boleh error saat dev tanpa token).

### 1.3 Hook — booking baru (`apps/web/src/pages/api/bookings.ts`)

Setelah insert booking sukses (setelah blok audit log best-effort), kirim WA ke `WA_ADMIN_PHONE` berisi `bookingAdminMessage`. Fire-and-forget tapi tetap `await` dengan catch — di Workers tidak ada background task setelah response. Kegagalan WA hanya log, TIDAK mengubah response API.

### 1.4 Hook — perubahan status di admin (`apps/admin/app/routes/api.bookings.tsx`)

Saat admin mengubah status booking ke `confirmed` atau `cancelled`:
- Kirim WA ke nomor tamu (`bookings.guest_phone`) memakai `bookingGuestMessage` (butuh data room_type & tanggal — join/query yang diperlukan di server action).
- Kirim notifikasi ke `WA_ADMIN_PHONE` juga (ringkas: "Booking REF → dikonfirmasi/dibatalkan oleh admin").
- Best-effort, sama seperti di atas. Status tetap tersimpan meski WA gagal.
- Idealnya lewat satu helper kecil `notifyStatusChange(...)` agar tidak duplikasi; taruh di `apps/admin/app/lib/`.

### 1.5 Verifikasi Fase 1

1. `bun run --filter '*' check` — zero error TypeScript.
2. `bun run build:web && bun run build:admin` — sukses.
3. `bun run dev:web` → POST `/api/bookings` via curl (payload valid) → booking tersimpan, log `[WA]` muncul (karena tanpa token, WA skip/error ter-log — bukan crash).
4. Konfirmasi: dengan `WA_ENABLED=false` semua alur lama berperilaku 100% identik.
5. Commit: `feat: whatsapp notifications via fonnte adapter (admin + guest)`.

---

## FASE 2 — Payment Gateway Midtrans Snap

Tujuan: tamu bisa bayar langsung; pembayaran berhasil mengubah booking `pending → confirmed` otomatis. Sandbox Midtrans default.

### 2.1 Alur

1. Booking dibuat (status `pending`) → response API kini juga mengembalikan `reference` (sudah dikembalikan — pastikan; jangan ubah shape response yang ada kecuali menambah field opsional).
2. Halaman terima kasih / status booking (`apps/web`) menampilkan tombol **Bayar sekarang** untuk booking `pending` → memanggil endpoint baru `POST /api/bookings/[reference]/pay`:
   - Cari booking by `reference` (anon read RLS tetap berlaku), validasi status masih `pending`.
   - Server memanggil Midtrans Snap API (`https://app.sandbox.midtrans.com/snap/v1/transactions`, header Basic auth `server_key:` base64) dengan `order_id = booking.reference`, `gross_amount = total_price`, `customer_details` (nama/email/phone), `item_details` (room + nights/period), `expiry` (mis. 24 jam).
   - Kembalikan `snap_token` + `redirect_url`. Frontend redirect ke `redirect_url` (paling sederhana, tanpa widget JS tambahan).
3. Webhook `POST /api/payments/midtrans/webhook.ts` (prerender false, tidak butuh auth cookie):
   - Verifikasi `signature_key = sha512(order_id + status_code + gross_amount + server_key)` memakai `crypto.subtle` — reject 403 jika mismatch.
   - Idempotent: kalau order sudah di status target, balas `200` langsung.
   - Mapping: `settlement|capture → confirmed`, `cancel|deny|expire → cancelled`, `pending → pending` (no-op). Update via **service-role** client. Tulis `activity_logs` best-effort.
   - Balas `200 {"ok":true}` cepat; kegagalan midtrans mapping tidak boleh 500 tanpa log.

### 2.2 Env & UI

- Env: `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION="false"` (+ `MIDTRANS_CLIENT_KEY` bila perlu). Tambah ke `.dev.vars.example` web, README.
- UI: i18n ID/EN untuk tombol & status pembayaran. Booking `pending` yang sudah kadaluarsa/expired tetap bisa dikonfirmasi manual admin (perilaku lama tidak hilang).
- Fitur payment bersifat **opsional**: tanpa `MIDTRANS_SERVER_KEY`, tombol bayar tidak muncul dan alur reservasi manual lama tetap utuh.

### 2.3 Verifikasi Fase 2

1. `check` + kedua build sukses.
2. Simulasi webhook via curl dengan payload Midtrans sandbox + signature yang dihitung benar (buat skrip kecil atau contoh di README) → status booking berubah, signature salah → 403.
3. Commit: `feat: midtrans snap payment (pay endpoint + verified webhook)`.

---

## FASE 3 — White-label Groundwork (setting properti di database)

Tujuan: satu codebase bisa di-clone untuk properti lain tanpa edit kode.

1. Migrasi baru `supabase/migrations/0003_property_settings.sql`: tabel `property_settings` satu-baris (`id` check `= 1` atau singleton), kolom: `name`, `tagline_id`, `tagline_en`, `phone`, `whatsapp`, `email`, `address`, `maps_lat`, `maps_lng`, `check_in_time`, `check_out_time`. RLS: anon/all read, hanya admin (`is_admin()`) write.
2. Regenerasi `packages/core/database.types.ts` sesuai output `supabase gen types` (atau tulis tipe manual konsisten).
3. Refactor `packages/core/hotel.ts`: konstanta properti kini dibaca dari `property_settings` dengan fallback ke nilai konstanta lama (zero-config tetap jalan). Akses via fungsi async cache-per-request, bukan import konstanta langsung — sesuaikan pemakaian di kedua app.
4. Admin UI: halaman pengaturan properti sederhana (route baru di `apps/admin/app/routes/`, ikuti pola `rooms.tsx`) untuk edit kolom di atas.
5. Verifikasi: `check`, build, dev-run kedua app,ubah satu nilai via admin → tampil di site publik. Commit: `feat: property settings table + admin editing (white-label groundwork)`.

---

## Aturan Eksekusi Global

- **Satu fase = satu commit** (atau lebih bila wajar), conventional commits, jangan pernah commit `.dev.vars` atau secret apapun.
- Sebelum tiap commit: `bun run --filter '*' check` DAN `bun run build:web` DAN `bun run build:admin` harus lolos.
- Jangan menaikkan versi dependency besar tanpa perlu; jika butuh library (mis. SDK Midtrans), **jangan** — gunakan `fetch` langsung, runtime Workers sudah menyediakan semuanya.
- Jangan mengubah perilaku existing ketika fitur baru belum dikonfigurasi (semua fitur baru mati-by-default lewat env).
- Setelah tiap fase: tulis laporan singkat — apa yang berubah (file), env baru apa yang harus diisi admin, cara test manualnya.

## Definition of Done

- [ ] Fase 1: booking baru & perubahan status memicu WA (saat dikonfigurasi), no-op aman saat tidak dikonfigurasi.
- [ ] Fase 2: booking pending bisa dibayar via Midtrans Snap; webhook terverifikasi signature & idempotent.
- [ ] Fase 3: data properti hidup di database, editable dari admin, fallback ke konstanta lama.
- [ ] Semua check & build hijau, tidak ada secret ter-commit, README diperbarui (bagian WhatsApp/Payments + daftar env).
