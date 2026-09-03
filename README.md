# Radio Globe

Replika radio.garden: globe 3D interaktif berisi 12.000+ titik kota, klik kota → daftar stasiun radio, klik stasiun → play stream langsung dari server asli stasiun. Static snapshot — dataset di-harvest sekali, nol request runtime ke radio.garden.

Stack: React + Vite + TypeScript, maplibre-gl (projection globe, basemap GeoJSON lokal), data statis di `public/data/`.

## Prasyarat

- Node.js + pnpm
- Data harvest (`public/data/places.json`, `public/data/channels.json`) — hasilkan dulu dengan langkah di bawah.

## Harvest data (sekali jalan, manual)

```sh
pnpm install
pnpm exec playwright install --with-deps chromium
node scripts/harvest.mjs          # 1–2 jam; resume-able: jalankan ulang bila terputus
node scripts/build-dataset.mjs    # gabung raw -> public/data/ + data/meta.json
```

Opsi:
- `node scripts/harvest.mjs --pilot` — uji cepat (5 tempat + 5 channel).
- `node scripts/harvest.mjs --refresh-streams` — resolve ulang semua redirect stream saja (bila banyak stream mati).

Basemap: `public/data/world.geojson` berasal dari Natural Earth (`nvkelso/natural-earth-vector`, `ne_110m_admin_0_countries`) dan di-bundle lokal.

## Development

```sh
pnpm dev          # buka http://localhost:5173
```

## Build

```sh
pnpm build        # output di dist/
```

## Verifikasi UI headless (opsional)

```sh
node scripts/verify-ui.mjs http://127.0.0.1:3000   # butuh dev server aktif + WebGL2
```

## Catatan ToS

Proyek penggunaan pribadi/eksperimen (lihat PRD §7). Jangan di-deploy komersial atau dimonetisasi.
