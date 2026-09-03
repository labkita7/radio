# TODO — Eksekusi Replika radio.garden

Panduan eksekutor (model AI): kerjakan berurutan per fase. Jangan ubah keputusan PRD §2. Setiap fase punya verifikasi — jalankan sebelum lanjut. Semua fakta API sudah di PRD §3 (terverifikasi, tidak perlu reverse-engineer ulang). Jangan pakai curl/fetch Node ke radio.garden (Cloudflare 403). Lingkungan sandbox: `node`, `pnpm`, `python3`, `apt-get` tersedia; TIDAK ada docker.

## Fase 0 — Scaffold

- [ ] Scaffold Vite + React + TS di root repo (root sudah berisi `README.md`, `PRD.md`, `TODO.md`, `.hoplite/` — jangan overwrite):
  ```sh
  pnpm dlx create-vite@latest tmp-scaffold --template react-ts
  cp -r tmp-scaffold/. . && rm -rf tmp-scaffold
  pnpm install
  ```
- [ ] Deps runtime: `pnpm add maplibre-gl` (v5). Deps dev: `pnpm add -D playwright` lalu `pnpm exec playwright install --with-deps chromium`.
- [ ] `.gitignore`: `node_modules/`, `dist/`, `data/raw/`, `tmp-scaffold/`, `*.log`.
- [ ] Verifikasi: `pnpm dev` render halaman template; `pnpm build` bersih.

## Fase 1 — Harvest (scripts/harvest.mjs, scripts/build-dataset.mjs)

- [ ] `scripts/harvest.mjs`: launch chromium Playwright, `page.goto('https://radio.garden/')`, tunggu networkidle (Cloudflare auto-pass oleh browser sungguhan; tunggu sampai `page.title()` mengandung "Radio Garden" atau komponen globe muncul).
- [ ] **Step A — data columnar** (2 request saja): dari page context:
  ```js
  await page.evaluate(() => fetch('/api/ara/content/places-core-columnar').then(r => r.json()))
  ```
  idem `/api/ara/content/places-details-columnar`. Simpan `data/raw/places-core.json` + `data/raw/places-details.json`. Assert `ids.length === titles.length === 11448` (angka aktual PRD §3; kalau beda → catat di PRD "Catatan Eksekusi", jangan gagkan).
- [ ] **Step B — daftar channel per tempat**: loop semua `ids`. Untuk tiap placeId:
  ```js
  await page.evaluate(id => fetch('/api/ara/content/page/' + id).then(r => r.json()), placeId)
  ```
  Cari section `content[]` yang item-nya punya `page.url` match `/^\/listen\/([^/]+)\/([^/]+)$/` → group 2 = channelId, group 1 = slug, `title` = nama stasiun. Simpan per tempat ke `data/raw/pages/{placeId}.json` — RESUME-ABLE (skip file yang sudah ada). Tempat dengan 0 channel: tetap tulis file (array kosong). Throttle: batch 6–8 koncurrent + delay 100–200ms; 11.448 request ≈ 30–60 menit. Log progress tiap 100 tempat ke stdout.
- [ ] **Step C — resolve stream URL**. Mekanisme (WAJIB pilot dulu di 5 channel sebelum full run):
  - Pasang handler `page.on('response', res => { ... })`: jika URL mengandung `/api/ara/content/listen/` dan `res.status() === 302` → catat `res.request().url()` (ekstrak channelId) + `res.headers()['location']` = streamUrl. Header dibaca di level network Playwright, TIDAK kena batas CORS page.
  - Trigger dari page: `page.evaluate(id => fetch('/api/ara/content/listen/' + id + '/channel.mp3').catch(() => {}), channelId)` — CORS page bisa saja gagal saat membaca response, tapi request + 302 tetap terjadi dan tertangkap handler.
  - Jika `page.on('response')` tidak menangkap 302: fallback CDP — `const cdp = await page.context().newCDPSession(page); await cdp.send('Network.enable')`, listen event `Network.requestWillBeSent`, baca `params.request.url` (URL final) + `params.redirectResponse?.url` (URL listen asal → ekstrak channelId).
  - Simpan ke `data/raw/streams.json` (map `{channelId: {url, insecure}}`) — RESUME-ABLE (skip channelId yang sudah ada). 34.447 request, batch 6–8 + delay ≈ 1–2 jam. Catat suffix/content-type final untuk distribusi format.
- [ ] `scripts/build-dataset.mjs`: gabung `data/raw/*` → `public/data/places.json` + `public/data/channels.json` + `data/meta.json` sesuai skema PRD §4. Validasi: `places.length === ids.length`; total channel ter-list == sum `sizes` == total channel di channels.json. Channel gagal resolve → `streamUrl: null`. Stream `http://` → coba substitusi `https://` (opsional, hanya tandai valid kalau server menjawab); sisanya `insecure: true`.
- [ ] Download basemap sekali (build-time, bukan runtime): `ne_110m_admin_0_countries.geojson` dari Natural Earth (repo GitHub `nvkelso/natural-earth-vector`, path `geojson/ne_110m_admin_0_countries.geojson`) → `public/data/world.geojson`.
- [ ] Verifikasi Fase 1: `node scripts/build-dataset.mjs` sukses; `jq '.places | length' public/data/places.json` == 11448; `jq '.channels | length' public/data/channels.json` == 34447 (atau angka aktual yang dicatat); distribusi format di `data/meta.json` terbaca → putuskan kebutuhan hls.js (PRD §7).

## Fase 2 — Fondasi app

- [ ] `src/types.ts`: tipe `Place`, `Channel`, `PlacesData`, `ChannelsData` sesuai skema PRD §4.
- [ ] Loader data (`src/data.ts`): fetch kedua JSON saat init; assert minimal (places > 10.000, channels > 30.000) — throw dengan pesan jelas kalau dataset tidak ada/aneh.
- [ ] Verifikasi: dataset termuat di dev (console log counts sekali di dev-mode saja).

## Fase 3 — Globe

- [ ] `src/components/Globe.tsx`: `new maplibregl.Map({ container, style: <StyleSpecification>, center, zoom: 2 })` + `map.setProjection({ type: 'globe' })` (maplibre v5; cek API versi terpasang). Background `#05070d`.
- [ ] Layer negara dari `world.geojson`: source geojson + layer `fill` warna `#1f2a4a` (+ `fill-outline-color` lebih terang tipis). Tidak ada tile/source eksternal.
- [ ] Layer titik tempat: GeoJSON dibangun dari `places.json` → source + layer `circle`, warna putih, `circle-radius` data-driven (interpolate by zoom + `size`), `circle-opacity` ~0.85. Cursor pointer saat hover.
- [ ] Klik: cari tempat terdekat dari titik klik (nearest by pixel dari proyeksi koordinat tempat; toleransi ~12px). Jika kena → set tempat terpilih.
- [ ] `flyTo` saat tempat terpilih (zoom ~7, durasi default maplibre).
- [ ] Auto-rotate pelan (mis. `lng += 0.02/frame`) sampai interaksi pointer pertama (`dragstart`/`click`), lalu stop permanen.
- [ ] Verifikasi: globe tampil & berputar, drag/zoom jalan, klik titik memilih kota (cek via console + state panel).

## Fase 4 — Panel tempat & player

- [ ] `src/state/AppContext.tsx`: state global via Context + useReducer: `{ selectedPlaceId, currentChannelId, isPlaying, volume }`.
- [ ] `src/components/PlacePanel.tsx`: nama kota + negara; daftar stasiun (klik → play); tombol close (`Esc` juga). Channel `streamUrl: null` → disabled + label "unavailable".
- [ ] `src/components/PlayerBar.tsx`: satu elemen `<audio>` global (ref); play/pause; slider volume (persist localStorage key `rg:volume`); state buffering (`waiting`/`playing`/`stalled` events); `error` → "Stream offline" + tombol coba lagi (reload src). `Space` = toggle play (ignore saat fokus di input).
- [ ] Verifikasi via preview + browser: pilih 1 kota (mis. Jakarta) → panel daftar stasiun benar; play satu stasiun → audio berbunyi (cek via browser tools / console audio state); pause/resume; volume slider bekerja.

## Fase 5 — Polish & ship

- [ ] Responsive 390×844: panel = bottom sheet; player bar tidak menutupi panel.
- [ ] Search (P2 — skip kalau waktu terbatas): filter `places` by `title`/`country` (case-insensitive prefix/substring), klik hasil = flyTo + open panel.
- [ ] Bersihkan console error/warning; hapus debug logging.
- [ ] `README.md`: cara harvest (`node scripts/harvest.mjs` + `node scripts/build-dataset.mjs`), cara dev (`pnpm dev`), cara build (`pnpm build`), catatan ToS (PRD §7).
- [ ] Checklist Definition of Done PRD §8 semua tercentang.
- [ ] PR ke `main` dengan screenshot verifikasi (globe; panel kota terpilih; player playing) di bagian Verification.
