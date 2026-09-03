/**
 * Verifikasi UI headless via Playwright chromium (WebGL swiftshader) melawan
 * dev server lokal. Usage: node scripts/verify-ui.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3000';
const OUT = 'data/verify';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60_000 });

// Tunggu dataset termuat + map siap.
await page.waitForSelector('.globe-container canvas', { timeout: 60_000 });
await page.evaluate(() =>
  new Promise((resolve) => {
    const map = window.__rgMap;
    if (map.loaded()) return resolve();
    map.once('load', resolve);
    setTimeout(resolve, 10_000);
  })
);
await page.waitForTimeout(2000);

const placesRendered = await page.evaluate(() => {
  const map = window.__rgMap;
  return map.queryRenderedFeatures({ layers: ['places-circle'] }).length;
});
console.log('places rendered (viewport):', placesRendered);

await page.screenshot({ path: OUT + '/globe.png' });

// Pilih tempat via klik map pada proyeksi koordinat Jakarta.
const clicked = await page.evaluate(() => {
  const map = window.__rgMap;
  const target = map.querySourceFeatures('places').find((f) => f.properties.title === 'Jakarta');
  if (!target) return null;
  const p = map.project(target.geometry.coordinates);
  return { x: p.x, y: p.y };
});
if (clicked) {
  await page.mouse.click(clicked.x, clicked.y);
  await page.waitForSelector('.place-panel', { timeout: 15_000 });
  await page.waitForTimeout(1500);
}
const panelTitle = await page.textContent('.place-panel h2').catch(() => null);
const stationCount = await page.locator('.stations button').count();
console.log('panel:', panelTitle, '| stations:', stationCount);
await page.screenshot({ path: OUT + '/panel.png' });

// Play stasiun pertama yang tersedia.
const played = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.stations button')].filter((b) => !b.disabled);
  if (!btns.length) return null;
  const name = btns[0].querySelector('.name')?.textContent;
  btns[0].click();
  return name;
});
console.log('klik stasiun:', played);
await page.waitForTimeout(4000);
const audioState = await page.evaluate(() => {
  const a = document.querySelector('audio');
  if (!a) return null;
  return {
    src: a.currentSrc || a.src,
    paused: a.paused,
    error: !!a.error,
    readyState: a.readyState,
    currentTime: a.currentTime,
  };
});
console.log('audio:', JSON.stringify(audioState));
await page.screenshot({ path: OUT + '/player.png' });

console.log('page errors:', errors.length ? errors.slice(0, 5) : 'tidak ada');
await browser.close();
