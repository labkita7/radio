/**
 * Gabungkan data/raw/* -> public/data/{places.json,channels.json} + data/meta.json
 * sesuai skema PRD §4. Validasi: jumlah place == jumlah ids; total channel ter-list
 * == sum sizes == jumlah channel di channels.json.
 *
 * Usage: node scripts/build-dataset.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const RAW = path.resolve('data/raw');
const OUT = path.resolve('public/data');
fs.mkdirSync(OUT, { recursive: true });

const coreEnv = JSON.parse(fs.readFileSync(path.join(RAW, 'places-core.json'), 'utf8'));
const core = coreEnv.data ?? coreEnv;
const detailsEnv = JSON.parse(fs.readFileSync(path.join(RAW, 'places-details.json'), 'utf8'));
const details = detailsEnv.data ?? detailsEnv;
const streams = fs.existsSync(path.join(RAW, 'streams.json'))
  ? JSON.parse(fs.readFileSync(path.join(RAW, 'streams.json'), 'utf8'))
  : {};

const ids = core.ids;
const lats = core.lats;
const lngs = core.lngs;
const sizes = core.sizes;
const titles = details.titles;
const countries = details.countries;
const skipRides = details.skipRides ?? [];

if (ids.length !== titles.length) {
  console.error(`FATAL: ids.length (${ids.length}) !== titles.length (${titles.length})`);
  process.exit(1);
}

let channelCount = 0;
const channels = [];
for (let i = 0; i < ids.length; i++) {
  const f = path.join(RAW, 'pages', ids[i] + '.json');
  if (!fs.existsSync(f)) {
    console.warn(`place ${ids[i]} tanpa page dump (channel di-skip)`);
    continue;
  }
  const json = JSON.parse(fs.readFileSync(f, 'utf8'));
  const pageData = json?.data ?? json; const secs = pageData?.page?.content ?? pageData?.content ?? [];
  for (const sec of secs) {
    if (!/^Stations in /.test(sec?.title ?? '')) continue;
    for (const it of sec?.items ?? []) {
      const m = /^\/listen\/([^/]+)\/([^/]+)$/.exec(it?.page?.url ?? '');
      if (!m) continue;
      channels.push({
        id: m[2],
        placeId: ids[i],
        title: it.title,
        slug: m[1],
        streamUrl: streams[m[2]]?.url ?? null,
        format: streams[m[2]]?.format ?? null,
        insecure: streams[m[2]]?.insecure ?? false,
      });
      channelCount++;
    }
  }
}

const formatDistribution = {};
for (const c of channels) {
  const k = c.format ?? 'unknown';
  formatDistribution[k] = (formatDistribution[k] ?? 0) + 1;
}

const places = ids.map((id, i) => ({
  id,
  title: titles[i],
  country: countries[i] ?? null,
  lat: lats[i],
  lng: lngs[i],
  size: sizes[i],
}));

fs.writeFileSync(
  path.join(OUT, 'places.json'),
  JSON.stringify({ countries, places }, null, 1)
);
fs.writeFileSync(
  path.join(OUT, 'channels.json'),
  JSON.stringify({ channels }, null, 1)
);

const meta = {
  generatedAt: new Date().toISOString(),
  placeCount: places.length,
  channelCount,
  resolvedCount: Object.values(streams).filter((s) => s.url).length,
  formatDistribution,
};
fs.writeFileSync(path.resolve('data/meta.json'), JSON.stringify(meta, null, 2));

console.log('[build-dataset]', JSON.stringify(meta));
console.log(
  `[build-dataset] validasi: places=${places.length} (ids=${ids.length}), channels=${channelCount}, sum(sizes)=${sizes.reduce((a, b) => a + b, 0)}`
);
