// Platform adapter tests over the shipped StarHermit SDK with a stubbed fetch
// and launch fragment: token read/strip, Bearer on every call, nickname
// (profile, never /api/v1/me), checksummed cloud save round trip on the
// `game:<slug>` slot, settings KV, control bindings, read-only leaderboard,
// and no network traffic when standalone.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlatform } from '../js/platform.js';

const SDK = (() => {
  const m = { exports: {} };
  new Function('module', 'exports', readFileSync(new URL('../starhermit-sdk.js', import.meta.url), 'utf8'))(m, m.exports);
  return m.exports;
})();

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USER = '2712e04e-461b-4d23-81ae-e40b429128a8';
const TOKEN = b64u({ alg: 'none' }) + '.' + b64u({ sub: USER, game_scope: 'rescue-pins', exp: 9999999999 }) + '.sig';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timers = { setTimeout: (fn, ms) => (ms > 5000 ? 0 : setTimeout(fn, ms)), clearTimeout: (t) => t && clearTimeout(t) };

function fakeWindow(hash, hostname = 'localhost') {
  const loc = { hash, pathname: '/', search: '', hostname, href: `https://${hostname}/${hash}`, origin: `https://${hostname}` };
  return { location: loc, history: { state: null, replaceState(_s, _t, url) { loc.hash = url.includes('#') ? url.slice(url.indexOf('#')) : ''; } },
           addEventListener() {} };
}

function stubNet() {
  const calls = [];
  const store = { save: null, patches: [] };
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ method, url, auth: init.headers && init.headers.Authorization });
    const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });
    if (url === `/api/v1/users/${USER}/profile`) return json(200, { username: 'mira_x', nickname: 'Mira' });
    if (url === '/api/v1/me/cloud-saves/game%3Arescue-pins') {
      if (method === 'GET') return store.save ? new Response(store.save, { status: 200 }) : json(404, {});
      if (method === 'PUT') { store.save = Buffer.from(JSON.parse(init.body).dataBase64, 'base64'); return json(200, { etag: `"v${calls.length}"` }); }
    }
    if (url === '/api/v1/games/rescue-pins/settings') {
      if (method === 'GET') return json(200, { settings: { audio: { music: 0.1 }, captions: false } });
      if (method === 'PATCH') { store.patches.push(JSON.parse(init.body).settings); return json(200, {}); }
    }
    if (url === '/api/v1/games/rescue-pins/controls') return json(200, { actions: [{ action: 'hint', codes: ['KeyJ'] }] });
    if (url === '/api/v1/games/rescue-pins') return json(200, { leaderboardId: 'lb-1' });
    if (url.startsWith('/api/v1/leaderboards/lb-1/entries')) return json(200, { items: [{ userId: USER, score: 1500 }] });
    return json(404, {});
  };
  return { calls, store, fetch };
}

function boot(win, net) {
  globalThis.window = win;
  globalThis.document = { addEventListener() {}, hidden: false };
  globalThis.StarHermit = SDK.create({ window: win, fetch: net.fetch, ...timers });
  const p = createPlatform();
  p.start();
  return p;
}
function cleanup() { delete globalThis.window; delete globalThis.document; delete globalThis.StarHermit; }

test('hosted: token, nickname, checksummed cloud save, settings KV, bindings, board', async () => {
  const net = stubNet();
  const win = fakeWindow('#game_token=' + TOKEN + '&session_id=abc');
  const p = boot(win, net);
  try {
    assert.ok(p.hosted());
    assert.equal(win.location.hash, '', 'fragment stripped');
    assert.equal(globalThis.StarHermit.slug, 'rescue-pins');
    await sleep(10);
    assert.equal(p.displayName(), 'Mira');
    assert.ok(!net.calls.some((c) => c.url === '/api/v1/me'));

    assert.equal(await p.loadCloudSave(), null); // empty slot
    p.queueCloudSave({ completed: { a: true }, rescuedTotal: 7 });
    p.flushCloudSave();
    await sleep(20);
    assert.ok(net.calls.some((c) => c.method === 'PUT' && c.url === '/api/v1/me/cloud-saves/game%3Arescue-pins'));
    const doc = await p.loadCloudSave();
    assert.equal(doc.rescuedTotal, 7, 'round trip validated by checksum');

    const settings = { audio: { music: 0.5, effects: 0.8 }, controls: { leftHanded: false }, captions: true, tutorialDone: false };
    assert.equal(await p.loadSettings(settings), true);
    assert.deepEqual(settings.audio, { music: 0.1, effects: 0.8 });
    assert.equal(settings.captions, false);
    settings.controls.leftHanded = true;
    p.mirrorSettings(settings);
    await sleep(700);
    assert.deepEqual(net.store.patches.at(-1), { controls: { leftHanded: true } });

    await p.loadBindings();
    assert.equal(p.actionFor('KeyJ'), 'hint');
    assert.equal(p.actionFor('KeyH'), null);
    assert.equal(p.actionFor('Space'), 'pull');

    assert.deepEqual(await p.fetchLeaderboardEntries(5), [{ name: 'Mira', score: 1500 }]);
    assert.ok(net.calls.every((c) => c.auth === 'Bearer ' + TOKEN), 'Bearer on every call');
    assert.ok(p.inviteLink().includes(`/game-invite/${USER}/rescue-pins`));
  } finally { cleanup(); }
});

test('tampered cloud save is rejected', async () => {
  const net = stubNet();
  const p = boot(fakeWindow('#game_token=' + TOKEN), net);
  try {
    await globalThis.StarHermit.writeSave(JSON.stringify({ v: 1, rescuedTotal: 99, checksum: 'bogus' }));
    assert.equal(await p.loadCloudSave(), null);
  } finally { cleanup(); }
});

test('standalone: no network, local defaults, sign-in only on the platform host', async () => {
  const net = stubNet();
  const p = boot(fakeWindow('', '0b9d6f2e-3c4a-4e5b-9a7c-1d2e3f405162.starhermit.com'), net);
  try {
    assert.equal(p.hosted(), false);
    assert.equal(p.canSignIn(), true);
    assert.equal(p.displayName(), null);
    assert.equal(p.syncLabel(), null);
    assert.equal(await p.loadCloudSave(), null);
    p.queueCloudSave({ a: 1 });
    p.flushCloudSave();
    assert.equal(await p.loadSettings({ audio: {} }), false);
    p.mirrorSettings({ audio: { music: 1 } });
    await p.loadBindings();
    assert.equal(p.actionFor('KeyH'), 'hint');
    assert.equal(await p.fetchLeaderboardEntries(5), null);
    assert.equal(p.inviteLink(), null);
    await sleep(700);
    assert.deepEqual(net.calls, []);
  } finally { cleanup(); }
  const local = boot(fakeWindow('', 'localhost'), stubNet());
  try { assert.equal(local.canSignIn(), false); } finally { cleanup(); }
});

test('hosted: a save conflict reloads the cloud copy, merges it (onConflict) and saves again', async () => {
  const { mergeProgression } = await import('../js/session.js');
  // ETag-versioned slot: writes after a load are conditional (If-Match / If-None-Match).
  let slot = null, version = 0;
  const puts = [];
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const h = init.headers || {};
    const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/profile')) return json(200, { nickname: 'Mira' });
    if (url === '/api/v1/me/cloud-saves/game%3Arescue-pins/info') return json(200, slot ? { exists: true, etag: `"v${version}"` } : { exists: false });
    if (url === '/api/v1/me/cloud-saves/game%3Arescue-pins') {
      if (method === 'GET') return slot ? new Response(slot, { status: 200 }) : json(404, {});
      const cur = slot ? `"v${version}"` : null;
      puts.push(h['If-Match'] || h['If-None-Match'] || null);
      if ((h['If-Match'] && h['If-Match'] !== cur) || (h['If-None-Match'] === '*' && slot)) return json(412, { error: 'precondition failed', etag: cur });
      slot = Buffer.from(JSON.parse(init.body).dataBase64, 'base64');
      version++;
      return json(200, { etag: `"v${version}"` });
    }
    return json(404, {});
  };
  const p = boot(fakeWindow('#game_token=' + TOKEN), { fetch });
  try {
    assert.equal(await p.loadCloudSave(), null); // empty slot: the first write is If-None-Match: *
    let prog = { v: 1, completed: { 'j-1': true }, bestScores: { 'j-1': 900 }, tutorialDone: false, streakDays: [3], achievements: ['first-rescue'], rescuedTotal: 12 };
    p.onConflict((doc) => { prog = mergeProgression(prog, doc); return prog; });
    p.queueCloudSave(prog);
    p.flushCloudSave();
    await sleep(30);
    assert.equal(puts[0], '*');

    // Another device saves different progress (checksummed like the game's writes).
    const other = { v: 1, completed: { 'j-1': true, 'j-2': true }, bestScores: { 'j-1': 700, 'j-2': 1200 }, tutorialDone: true, streakDays: [4], achievements: ['mechanic-mastery'], rescuedTotal: 30 };
    const { hashString, stableStringify } = await import('../js/rules.js');
    const doc = { ...other };
    doc.checksum = hashString(stableStringify({ ...doc, checksum: undefined }));
    slot = Buffer.from(globalThis.StarHermit._zip('save.json', new TextEncoder().encode(JSON.stringify(doc))));
    version++;

    p.queueCloudSave({ ...prog, rescuedTotal: 13 });
    p.flushCloudSave(); // refused (412) → saveconflict → reload, merge, save
    for (let i = 0; i < 50 && puts.length < 3; i++) await sleep(5);
    await globalThis.StarHermit.flushSave();
    assert.equal(globalThis.StarHermit.saveConflicted(), false);
    assert.equal(puts.at(-1), '"v2"', 'merged doc written on top of the other device\'s version');
    const saved = await p.loadCloudSave();
    assert.deepEqual(saved.completed, { 'j-1': true, 'j-2': true });
    assert.deepEqual(saved.bestScores, { 'j-1': 900, 'j-2': 1200 });
    assert.equal(saved.tutorialDone, true);
    assert.deepEqual(saved.streakDays, [3, 4]);
    assert.deepEqual(saved.achievements.sort(), ['first-rescue', 'mechanic-mastery']);
    assert.equal(saved.rescuedTotal, 30);
  } finally { cleanup(); }
});
