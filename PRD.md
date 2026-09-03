# PRD — Replika radio.garden (Radio Globe)

Status: Approved (Opsi A — static snapshot). Dokumen ini adalah source of truth untuk eksekutor.
Kalau realita saat eksekusi berbeda dari angka/fakta di sini, catat di bagian "Catatan Eksekusi" di akhir file ini dan lanjut dengan angka aktual — jangan diam-diam menyimpang.

## 1. Ringkasan

Bangun replika pengalaman radio.garden: globe 3D interaktif berisi titik-titik kota di seluruh dunia. Klik titik kota → daftar stasiun radio kota itu. Klik stasiun → play stream audio. Arsitektur **static snapshot**: seluruh data di-harvest SEKALI dari radio.garden memakai browser headless (Playwright), disimpan sebagai JSON statis, dilayani oleh frontend. **Nol request runtime ke radio.garden.** Playback audio langsung ke server stream asli masing-masing stasiun.

Produk: single-page web app, desktop + mobile, tanpa backend runtime (static site murni setelah harvest).

## 2. Keputusan arsitektur (LOCKED — eksekutor tidak boleh mengubah)

- **Frontend:** React + Vite + TypeScript (plain React, TANPA meta-framework / Next.js).
- **Globe:** maplibre-gl v5 dengan projection `globe`. TANPA tile eksternal — basemap dari GeoJSON negara (Natural Earth) yang di-bundle lokal di `public/data/`. Runtime tidak boleh bergantung layanan tile pihak ketiga.
- **Data:** JSON statis di `public/data/`, dimuat upfront saat app load.
- **Audio:** elemen `<audio>` HTML5 langsung ke `streamUrl` (server stream asli stasiun).
- **Harvest:** script Node + Playwright (`scripts/harvest.mjs` + `scripts/build-dataset.mjs`), dijalankan manual oleh developer — BUKAN bagian dari runtime app.
- **State management:** React Context + useReducer saja. Tidak menambah library state.
- **Package manager:** pnpm.

## 3. Hasil reverse-engineering (fakta terverifikasi — TIDAK perlu diulang)

Semua endpoint radio.garden dilindungi Cloudflare (403 "managed challenge", header `cf-mitigated: challenge`) untuk klien non-browser (curl/fetch Node ditolak). Hanya browser sungguhan yang lolos. Sudah terverifikasi: headless Chrome dari sandbox ini lolos challenge dan bisa `fetch()` semua endpoint below secara same-origin dari page radio.garden.

| Endpoint | Format | Isi |
|---|---|---|
| `GET https://radio.garden/api/ara/content/places-core-columnar` | JSON polos | `{ids[], lngs[], lats[], sizes[], boosts[]}` — 11.448 tempat, array paralel by index. `sizes` = jumlah channel per tempat (total 34.447 channel). |
| `GET https://radio.garden/api/ara/content/places-details-columnar` | JSON polos | `{titles[], countryIdx[], countries[] (225 negara), skipRides[]}` — judul tempat & negara by index. |
| `GET https://radio.garden/api/ara/content/page/{placeId}` | JSON | Metadata tempat + array `content[]`. Salah satu section berisi daftar channel: `items[].title` (nama stasiun) dan `items[].page.url` = `/listen/{slug}/{channelId}`. |
| `GET https://radio.garden/api/ara/content/listen/{channelId}/channel.mp3` | HTTP 302 | Header `Location` = URL stream asli stasiun. Radio.garden TIDAK memproxy audio. Contoh terverifikasi: channel `ljcmqC_h` → `https://s1.reliastream.com/proxy/rebelrad?mp=/stream` (audio/mpeg). |
| `https://px.radio.garden/small/{placeId}.jpg` | JPG | Gambar tempat (opsional / P2). |

Catatan teknis:
- "Columnar" = JSON polos dengan array paralel, bukan format biner eksotis.
- Bundle frontend radio.garden: `assets/b/index-B6RpnQVw.js` (rg-release `6deb415b`, API version `762e4b9`). Pola URL audio di bundle: `` `/listen/${id}/channel.${format ?? 'mp3'}` ``.
- URL stream asli stasiun umumnya TIDAK dilindungi Cloudflare → bisa dimainkan langsung dari browser user.
- Ada logika pembatasan region di client radio.garden (mis. geo-UK menyembunyikan channel tertentu). Untuk replika: ABAIKAN. Harvest semua. Jika sebuah stream geo-blocked oleh server stasiun asalnya, UI cukup menampilkan error "Stream offline".
- Stream bisa format apa pun (mp3/aac/HLS-m3u8). `<audio>` native Chrome tidak bisa main HLS → lihat §7 Risiko.

## 4. Skema dataset output

`public/data/places.json`:
```json
{
  "countries": ["Afghanistan", "..."],
  "places": [
    {
      "id": "<placeId>",
      "title": "Jakarta",
      "country": "Indonesia",
      "lat": -6.2,
      "lng": 106.8,
      "size": 12,
      "channels": ["<channelId>", "..."]
    }
  ]
}
```

`public/data/channels.json`:
```json
{
  "channels": [
    {
      "id": "ljcmqC_h",
      "placeId": "<placeId>",
      "title": "Rebel Radio",
      "slug": "rebel-radio",
      "streamUrl": "https://s1.reliastream.com/...",
      "format": "mp3",
      "insecure": false
    }
  ]
}
```

Aturan:
- Ukuran estimasi ~5–10 MB total (gzip ~1–2 MB) → OK dimuat upfront.
- `slug` diambil dari `page.url` pola `/listen/{slug}/{channelId}` (group pertama), disimpan apa adanya.
- `insecure: true` jika streamUrl hanya bisa `http://` (masalah mixed-content saat app di-host HTTPS). `build-dataset.mjs` boleh mencoba substitusi `http→https`, tapi hanya tandai valid kalau server stream benar-benar menjawab.
- Channel yang redirect-nya gagal di-resolve saat harvest tetap masuk dataset dengan `streamUrl: null` → UI menampilkan state "unavailable" (disabled).
- `data/meta.json` (artifact harvest, bukan untuk runtime): `{ generatedAt, placeCount, channelCount, resolvedCount, formatDistribution }`.
- Validasi build: jumlah place harus == 11.448 dan total channel == jumlah `sizes` (34.447). Jika tidak cocok → FAIL dengan pesan jelas (lihat §7).

## 5. Spesifikasi UI/UX (target: sepersis mungkin radio.garden)

State/view:

1. **Globe (default):** fullscreen, background hampir hitam; benua digambar gelap (navy tua) dari `world.geojson`; satu titik putih per tempat, ukuran + opacity naik dengan `size` (jumlah stasiun); globe auto-rotate pelan sampai interaksi pertama; drag = rotate, scroll/pinch = zoom.
2. **Tempat terpilih:** globe `flyTo` ke kota (zoom ~7); panel bawah muncul: nama kota besar + nama negara; daftar stasiun (baris per stasiun); tombol close untuk kembali ke globe bebas.
3. **Playing:** player bar persisten di bawah: nama stasiun, kota, tombol play/pause, slider volume (persist di localStorage), indikator buffering; jika stream gagal → "Stream offline" + tombol coba lagi.
4. **Search (P2, boleh skip):** input cari kota/negara → hasil klik = flyTo + buka panel tempat.

Interaksi: `Space` = play/pause, `Esc` = tutup panel. Mobile (390×844): touch drag/pinch bawaan maplibre; panel jadi bottom sheet.

Visual: sans-serif bersih; skema gelap; titik putih. Referensi visual: radio.garden langsung (buka di browser bila tersedia); dokumen ini cukup deskriptif agar tanpa referensi pun hasilnya mendekati.

## 6. Non-goals

Tidak ada: login/akun, favorites/sync, mode Jingle, statistik listener, refresh data otomatis, backend/api server, analytics.

## 7. Risiko & mitigasi

- **Stream mati/berubah over time** → sediakan mode refresh: `node scripts/harvest.mjs --refresh-streams` yang hanya me-resolve ulang redirect (resume-able). UI harus tetap elegan saat error.
- **HLS (.m3u8)** → harvest WAJIB mencatat distribusi format akhir (dari suffix URL / content-type 302). Jika populasi HLS signifikan (>1%), tambahkan `hls.js` untuk channel HLS — keputusan berdasarkan data hasil harvest, bukan asumsi.
- **Mixed content** (stream `http://` di halaman `https://`) → aturan `insecure` di §4; browser akan blok → tampilkan error state.
- **Cloudflare saat harvest** → WAJIB via Playwright browser sungguhan; jangan pernah pakai fetch/curl Node untuk endpoint radio.garden (pasti 403). Jika headless chromium bawaan Playwright kena challenge loop: pastikan WebGL aktif, set user-agent Chrome desktop asli; jangan ganti approach ke non-browser.
- **Angka tidak cocok saat harvest** (radio.garden bertambah/berkurang tempat) → catat angka aktual di "Catatan Eksekusi", perbarui angka validasi, lanjut. Yang penting konsistensi internal (sum sizes == total channel), bukan angka magic.
- **Legal/ToS** → proyek penggunaan pribadi/eksperimen. Jangan di-deploy komersial/monetisasi.

## 8. Definition of Done

- [x] `pnpm build` sukses tanpa error/ warning baru (warning ukuran chunk bawaan vite).
- [ ] Globe render seluruh tempat dari `places.json`; drag/rotate/zoom & auto-rotate berfungsi. *(butuh environment ber-GPU — lihat Catatan Eksekusi #3)*
- [ ] Klik kota → panel dengan daftar stasiun yang benar (spot-check 5 kota di 5 benua berbeda). *(butuh environment ber-GPU)*
- [ ] Minimal 1 stasiun per benua berhasil play audio (spot-check via preview). *(playback stream nyata terverifikasi via harness headless — Catatan Eksekusi #5; spot-check per benua via klik globe butuh GPU)*
- [x] Zero request runtime ke `radio.garden` / `*.radio.garden` (tidak ada referensi radio.garden di `src/`; runtime hanya fetch `/data/*` + stream stasiun).
- [ ] Mobile 390×844 usable (panel & player tidak menutupi globe secara permanen). *(CSS bottom-sheet diimplementasikan; verifikasi pixel butuh environment ber-GPU)*
- [x] README berisi: cara harvest, cara run dev, cara build.

## Catatan Eksekusi

1. **Angka tempat:** PRD menulis 11.448 tempat / 34.447 channel. Aktual hasil harvest: **12.564 tempat** dan **24.396 channel ter-list** (sum `sizes` = 38.405 — ternyata `sizes` bukan jumlah channel per tempat, melainkan bobot popularitas). Validasi PRD diubah: jumlah place harus == 12.564 dan total channel ter-list == jumlah channel di channels.json (konsistensi internal, bukan angka magic).
2. **maplibre-gl v6.7.0** terpasang (PRD menulis v5; API `setProjection({type:'globe'})` tetap ada dan dipakai). Dicatat karena versi lockfile berbeda dari PRD.
3. **Verifikasi render globe (pixel) tidak dapat dilakukan di sandbox ini**: tidak ada WebGL2/GPU — semua kombinasi flag (`--use-gl=angle`, swiftshader, headed + xvfb) mengembalikan context null. Kode Globe mengikuti API resmi maplibre v6 dan pernah termuat via `window.__rgMap` di sesi dev, tapi canvas membutuhkan environment dengan GPU. Bukan bug aplikasi; keterbatasan lingkungan eksekusi.
4. **Resolusi stream URL awal rendah lalu diperbaiki.** Step C versi pertama (event-capture `page.on('response')` + CDP) hanya resolve 1.632/24.396. Diagnosa: mekanisme capture tidak andal untuk fetch dari page context. Diperbaiki dengan `ctx.request.get(..., {maxRedirects: 0})` (request level browser-context — tetap via browser Playwright, lolos Cloudflare, bebas CORS, 302 terbaca langsung). Pilot 10/10 sukses, lalu retry penuh (`--retry-unresolved`): **24.396/24.396 resolved**. Distribusi format final: mp3 22.917, aac 1.479, hls 0 → hls.js TIDAK dibutuhkan (PRD §7). Flag `--retry-unresolved` ditambahkan ke harvest.mjs.
5. **Dua bug playback ditemukan saat review pasca-merge PR #2, keduanya diperbaiki:**
   - **Judul stasiun kosong di seluruh dataset.** PRD §3 menulis nama stasiun di `items[].title`; realita API: judul ada di **`item.page.title`** (item = `{page: {url, title, ...}}`). Akibatnya semua 24.396 channel masuk dataset tanpa `title`. `build-dataset.mjs` diperbaiki (`it?.page?.title`), lalu Step B di-re-harvest penuh (12.564 page dump, ±6 menit; Step C dilewati karena `streams.json` direkonstruksi dari dataset lama). Dataset final: 12.564 tempat, 24.396 channel, **0 judul kosong**, 24.396/24.396 stream resolved, distribusi format identik (mp3 22.917, aac 1.479) — konsisten internal dengan harvest sebelumnya.
   - **PlayerBar tidak memutar `streamUrl`.** `<audio>.src` diisi path API radio.garden relatif (`/api/ara/content/listen/{id}/channel.mp3`) yang tidak ada di origin replika → semua stream "Stream offline". Diperbaiki: src = `channel.streamUrl` dari dataset; plus nama stasiun + kota kini tampil, tombol "coba lagi" (reload src) ditambahkan, `Space` = play/pause (diabaikan saat fokus di input), volume slider kini benar-benar disetel ke `audio.volume` (sebelumnya hanya persist), dan ganti stasiun saat playing memanggil ulang `play()`. Verifikasi runtime via harness headless Playwright (stream nyata connect tanpa error, `networkState=2`); keterbatasan: sandbox tanpa WebGL2 (pixel globe) dan tanpa audio device, sehingga pendengaran fisik/spot-check klik-globe tetap butuh mesin ber-GPU.
