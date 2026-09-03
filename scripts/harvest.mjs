/**
 * Harvest dataset dari radio.garden via Playwright headless Chrome.
 * Cloudflare hanya lolos dari browser sungguhan — jangan ganti ke fetch/curl.
 * Resume-able: data/raw/pages/{placeId}.json dan data/raw/streams.json di-skip jika sudah ada.
 *
 * Usage:
 *   node scripts/harvest.mjs                # full run (step A+B+C)
 *   node scripts/harvest.mjs --pilot        # hanya 5 place + 5 channel (uji mekanisme)
 *   node scripts/harvest.mjs --refresh-streams  # resolve ulang semua redirect (step C saja)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://radio.garden';
const RAW = path.resolve('data/raw');
const PAGES = path.join(RAW, 'pages');
for (const d of [RAW, PAGES]) fs.mkdirSync(d, { recursive: true });

const args = new Set(process.argv.slice(2));
const PILOT = args.has('--pilot');
const REFRESH = args.has('--refresh-streams');

const BATCH = 7;
const DELAY_MS = 150;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function batches(items, fn) {
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    await Promise.all(chunk.map(fn));
    if (i % 700 === 0) await sleep(DELAY_MS);
    if ((i / BATCH) % 15 === 0) await sleep(DELAY_MS);
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--use-gl=swiftshader', '--disable-blink-features=AutomationControlled'],
});
const ctx = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

console.log('[harvest] opening radio.garden ...');
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
// Cloudflare challenge auto-passes in a real browser; wait until the app title appears.
for (let i = 0; i < 60; i++) {
  const title = await page.title();
  if (/radio garden/i.test(title)) break;
  await sleep(2000);
}
if (!/radio garden/i.test(await page.title())) {
  console.error('[harvest] Cloudflare challenge tidak lolos (title=' + (await page.title()) + ')');
  process.exit(1);
}
await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
console.log('[harvest] page ready:', await page.title());

// ---------- Step A: columnar data ----------
async function stepA() {
  let core, details;
  const corePath = path.join(RAW, 'places-core.json');
  const detailsPath = path.join(RAW, 'places-details.json');
  if (fs.existsSync(corePath) && fs.existsSync(detailsPath) && !PILOT) {
    console.log('[stepA] sudah ada, skip');
    return;
  }
  core = await page.evaluate(() =>
    fetch('/api/ara/content/places-core-columnar').then((r) => r.json())
  );
  details = await page.evaluate(() =>
    fetch('/api/ara/content/places-details-columnar').then((r) => r.json())
  );
  // Response dibungkus envelope { apiVersion, version, data: {...} }
  core = core.data ?? core;
  details = details.data ?? details;
  fs.writeFileSync(corePath, JSON.stringify({ data: core }));
  fs.writeFileSync(detailsPath, JSON.stringify({ data: details }));
  console.log('[stepA] places:', core.ids.length, 'titles:', details.titles.length);
  if (core.ids.length !== details.titles.length) {
    console.error('[stepA] FATAL: ids.length !== titles.length');
    process.exit(1);
  }
}

// ---------- Step B: page per place (channel list) ----------
async function stepB(core) {
  const ids = PILOT ? core.ids.slice(0, 5) : core.ids;
  let done = 0;
  let channels = 0;
  await batches(ids, async (id) => {
    const out = path.join(PAGES, id + '.json');
    try {
      if (!fs.existsSync(out)) {
        const json = await page.evaluate(
          (pid) => fetch('/api/ara/content/page/' + pid).then((r) => r.json()),
          id
        );
        fs.writeFileSync(out, JSON.stringify(json));
      }
      const json = JSON.parse(fs.readFileSync(out, 'utf8'));
      const pageData = json?.data ?? json; for (const sec of pageData?.page?.content ?? pageData?.content ?? []) {
        if (!/^Stations in /.test(sec?.title ?? '')) continue;
        for (const it of sec?.items ?? []) {
          if (/^\/listen\/[^/]+\/[^/]+$/.test(it?.page?.url ?? '')) channels++;
        }
      }
    } catch (e) {
      console.error('[stepB] error place', id, String(e).slice(0, 120));
    }
    done++;
    if (done % 100 === 0) console.log(`[stepB] ${done}/${ids.length} places, ${channels} channels`);
  });
  console.log(`[stepB] selesai: ${done} places, ${channels} channels`);
}

// ---------- Step C: resolve stream URLs via 302 ----------
async function stepC(channelIds) {
  const streamsPath = path.join(RAW, 'streams.json');
  const streams = fs.existsSync(streamsPath)
    ? JSON.parse(fs.readFileSync(streamsPath, 'utf8'))
    : {};
  if (REFRESH) for (const k of Object.keys(streams)) delete streams[k];

  // Capture 302 Location at the network level (works around page CORS).
  const pending = new Map();
  page.on('response', (res) => {
    try {
      const url = res.url();
      if (!url.includes('/api/ara/content/listen/')) return;
      const m = url.match(/listen\/([^/]+)\/channel/);
      if (!m) return;
      const chId = m[1];
      const status = res.status();
      const loc = res.headers()['location'];
      const contentType = res.headers()['content-type'] ?? '';
      if (status === 302 && loc) {
        const finalUrl = loc.startsWith('http') ? loc : new URL(loc, url).href;
        pending.set(chId, { url: finalUrl, contentType });
      } else if (status >= 400) {
        pending.set(chId, { url: null, contentType, status });
      }
    } catch {}
  });
  // CDP fallback captures redirects the response handler may miss.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (p) => {
    try {
      const url = p.request.url;
      const m = url.match(/listen\/([^/]+)\/channel/);
      if (!m) return;
      const loc = p.redirectResponse?.headers?.['location'] ?? p.redirectResponse?.headers?.['Location'];
      if (loc) {
        const finalUrl = loc.startsWith('http') ? loc : new URL(loc, p.redirectResponse.url).href;
        pending.set(m[1], {
          url: finalUrl,
          contentType: p.redirectResponse.headers['content-type'] ?? '',
        });
      }
    } catch {}
  });

  let done = 0;
  const todo = channelIds.filter((id) => !(id in streams));
  console.log(`[stepC] ${todo.length} channel perlu resolve (total ${channelIds.length})`);
  await batches(todo, async (chId) => {
    pending.delete(chId);
    page.evaluate(
      (id) => fetch('/api/ara/content/listen/' + id + '/channel.mp3').catch(() => {}),
      chId
    ).catch(() => {});
    await sleep(80); // beri waktu 302 tiba di network layer
    for (let w = 0; w < 12 && !pending.has(chId); w++) await sleep(100);
    const hit = pending.get(chId);
    if (hit?.url) {
      const u = hit.url;
      streams[chId] = {
        url: u,
        insecure: u.startsWith('http://'),
        format: /m3u8/i.test(u) || /mpegurl/i.test(hit.contentType ?? '')
          ? 'hls'
          : /aac/i.test(u) || /aac/i.test(hit.contentType ?? '')
            ? 'aac'
            : 'mp3',
      };
    } else {
      streams[chId] = { url: null, insecure: false, format: null };
    }
    done++;
    if (done % 100 === 0) console.log(`[stepC] ${done}/${todo.length}`);
  });
  fs.writeFileSync(streamsPath, JSON.stringify(streams));
  const ok = Object.values(streams).filter((s) => s.url).length;
  console.log(`[stepC] selesai: ${ok}/${Object.keys(streams).length} resolved`);
}

(async () => {
  await stepA();
  const coreEnv = JSON.parse(fs.readFileSync(path.join(RAW, 'places-core.json'), 'utf8'));
  const core = coreEnv.data ?? coreEnv;
  if (!REFRESH) await stepB(core);

  // Kumpulkan channelId dari page dumps.
  const channelIds = [];
  for (const id of PILOT ? core.ids.slice(0, 5) : core.ids) {
    const f = path.join(PAGES, id + '.json');
    if (!fs.existsSync(f)) continue;
    const json = JSON.parse(fs.readFileSync(f, 'utf8'));
    const pageData = json?.data ?? json; for (const sec of pageData?.page?.content ?? pageData?.content ?? []) {
      if (!/^Stations in /.test(sec?.title ?? '')) continue;
      for (const it of sec?.items ?? []) {
        const m = /^\/listen\/[^/]+\/([^/]+)$/.exec(it?.page?.url ?? '');
        if (m) channelIds.push(m[1]);
      }
    }
  }
  console.log('[harvest] total channel:', channelIds.length);
  await stepC(PILOT ? channelIds.slice(0, 5) : channelIds);

  await browser.close();
  console.log('[harvest] DONE');
})();
