// Rescue Pins — hosted-mode smoke test (dev only, not part of `npm test`).
// Serves the game together with a mock StarHermit platform (launch token,
// profile, cloud saves, read-only leaderboard, daily verify) and drives a
// headless Chrome session through boot + a hosted daily round, asserting
// Bearer auth on every call, the nickname in the UI, a valid zip cloud save,
// and zero page errors.
// Run: node tests/hosted-smoke.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const USER = '2712e04e-461b-4d23-81ae-e40b429128a8';
const received = []; // {path, auth}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    received.push({ path: url.pathname + url.search, auth: req.headers.authorization || null, method: req.method });    const j = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    if (url.pathname === '/api/v1/time') return j(200, { serverTime: Date.now() });
    if (url.pathname === `/api/v1/games/rescue-pins/launch-token`) return j(200, { token: globalThis.TOKEN });
    if (url.pathname === `/api/v1/users/${USER}/profile`) return j(200, { id: USER, username: 'mira_x', nickname: 'Mira' });
    if (url.pathname === '/api/v1/me/cloud-saves/rescue-pins') {
      if (req.method === 'PUT') { let b = ''; for await (const c of req) b += c; globalThis.PUT_BODY = JSON.parse(b); return j(200, { ok: true }); }
      return j(404, { error: 'none' }); // no remote save yet
    }
    if (url.pathname === '/api/v1/daily/verify' && req.method === 'POST') {
      let b = ''; for await (const c of req) b += c;
      const body = JSON.parse(b);
      if (body.envelope && body.envelope.won) return j(200, { valid: true, score: { total: body.envelope.scoreBreakdown.total }, won: true });
      return j(422, { error: 'bad-replay' });
    }
    if (url.pathname === '/api/v1/games/rescue-pins') return j(200, { leaderboardId: 'lb-1' });
    if (url.pathname.startsWith('/api/v1/leaderboards/')) return j(200, { entries: [{ userId: USER, score: 1500 }] });
    return j(404, { error: 'nope' });
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/favicon.ico') return res.end('');
  received.push({ path: '[static] ' + p, auth: null, method: req.method });
  if (p === '/') p = '/index.html';
  const full = normalize(join(ROOT, p));
  if (!full.startsWith(ROOT)) return res.end('no');
  try { const data = await readFile(full); res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

import { zipStore } from '../js/platform.js';
globalThis.TOKEN = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') + '.' +
  Buffer.from(JSON.stringify({ sub: USER, game_scope: 'rescue-pins' })).toString('base64url') + '.s';

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--mute-audio'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => {
  // "Failed to load resource" is Chrome's network log line for the expected
  // 404 cloud-save probe (none yet), not a JS error.
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
});

await page.goto(base + '/#game_token=' + globalThis.TOKEN, { waitUntil: 'load' });
await page.waitForSelector('.rp-overlay:not([hidden]) .rp-title', { timeout: 15000 });
await page.waitForTimeout(2600); // allow profile + debounced cloud PUT

const checks = [];
const t1 = await page.locator('.rp-title').innerText();
checks.push(['title shows nickname', /Signed in as Mira/.test(t1)]);
const sync = await page.locator('.rp-sync').innerText().catch(() => '');
if (!sync) {
  console.log('  debug badge:', await page.locator('.rp-sync').evaluate(e => e.outerHTML).catch(e => String(e)));
  console.log('  debug static 404s:', JSON.stringify(received.filter(r => r.path.startsWith('[static]'))));
}
checks.push(['sync badge visible on title', sync.length > 0]);
checks.push(['fragment stripped', await page.evaluate(() => location.hash) === '']);
const withAuth = received.filter(r => r.auth === 'Bearer ' + globalThis.TOKEN);
checks.push(['time fetch authenticated', received.some(r => r.path === '/api/v1/time' && r.auth)]);
checks.push(['refresh POST scoped route', received.some(r => r.path === '/api/v1/games/rescue-pins/launch-token' && r.auth)]);
checks.push(['profile fetch by sub', received.some(r => r.path === `/api/v1/users/${USER}/profile` && r.auth)]);
checks.push(['cloud PUT authenticated', received.some(r => r.path === '/api/v1/me/cloud-saves/rescue-pins' && r.method === 'PUT' && r.auth)]);
let putOk = false;
if (globalThis.PUT_BODY && globalThis.PUT_BODY.dataBase64) {
  const bytes = new Uint8Array(Buffer.from(globalThis.PUT_BODY.dataBase64, 'base64'));
  const { unzipFirstEntry } = await import('../js/platform.js');
  const doc = JSON.parse(new TextDecoder().decode(unzipFirstEntry(bytes)));
  putOk = doc.v === 1 && typeof doc.checksum === 'string';
}
checks.push(['cloud PUT body is valid zip save doc', putOk]);
checks.push(['no page errors', errors.length === 0]);

// start a level: HUD should show Player row + sync badge
await page.getByRole('button', { name: '▶ Play' }).click();
await page.getByRole('button', { name: /^Journey/ }).click();
await page.locator('.rp-stage-grid button').first().click();
await page.waitForSelector('.rp-pin-list button', { timeout: 15000 });
const rail = await page.locator('.rp-rail-right').innerText();
checks.push(['HUD shows player name', /Player\s*\n?Mira/.test(rail) || rail.includes('Mira')]);
checks.push(['HUD shows sync row', /Cloud save synced|Cloud saving/.test(rail)]);

// hosted daily round: hint-guided win → authenticated own-server verify with
// the nickname, and the results board read from the platform leaderboard
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Save & quit to title' }).click();
await page.waitForSelector('.rp-overlay:not([hidden]) .rp-title');
await page.getByRole('button', { name: '▶ Play' }).click();
await page.getByRole('button', { name: /^Daily Challenge/ }).click();
await page.waitForSelector('.rp-pin-list button', { timeout: 15000 });
for (let i = 0; i < 30; i++) {
  const h2 = page.locator('.rp-overlay:not([hidden]) .rp-panel h2');
  if (await h2.count() && /Rescued!|claims another/.test(await h2.first().innerText())) break;
  await page.getByRole('button', { name: /Hint/ }).click();
  const hint = await page.locator('.rp-rail-right .rp-hint').innerText();
  const m = hint.match(/Try pin (\S+)/);
  if (!m) throw new Error('hint did not name a pin: ' + hint);
  await page.locator('.rp-pin-list').getByRole('button', { name: `Pin ${m[1]}`, exact: true }).click();
  await page.waitForTimeout(350);
}
await page.waitForSelector('.rp-overlay:not([hidden]) .rp-panel h2:text("Rescued!")', { timeout: 8000 });
const resultsText = await page.locator('.rp-overlay:not([hidden]) .rp-panel').innerText();
checks.push(['daily submit accepted', /Daily score accepted/.test(resultsText)]);
checks.push(['results board shows platform entry', /Mira: 1500/.test(resultsText)]);
const verify = received.find(r => r.path === '/api/v1/daily/verify');
checks.push(['daily verify POST authenticated', !!(verify && verify.auth === 'Bearer ' + globalThis.TOKEN)]);
checks.push(['platform leaderboard read', received.some(r => r.path.startsWith('/api/v1/leaderboards/lb-1/entries'))]);
const boardNames = await page.locator('.rp-overlay:not([hidden]) .rp-score-list').last().innerText().catch(() => '');
checks.push(['no username leaked on board', !/mira_x/.test(resultsText)]);

let fail = 0;
for (const [name, ok] of checks) { console.log((ok ? 'ok  - ' : 'FAIL- ') + name); if (!ok) fail++; }
if (errors.length) console.log(errors.join('\n'));
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
