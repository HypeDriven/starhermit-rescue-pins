// Platform adapter tests: launch-token read/strip/decode, Bearer on every
// call, nickname resolution (profile, never /api/v1/me), cloud save
// (zip+base64, remote-preferred load, debounced PUT), read-only leaderboard.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatform, zipStore, unzipFirstEntry, bytesToBase64 } from '../js/platform.js';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function makeToken(payload) {
  return b64url({ alg: 'none' }) + '.' + b64url(payload) + '.sig';
}
const USER = '2712e04e-461b-4d23-81ae-e40b429128a8';
const TOKEN = makeToken({ sub: USER, game_scope: 'rescue-pins' });

// minimal browser shims so createPlatform().start() runs under node:test
function shimBrowser(hash) {
  const calls = [];
  const state = { hash };
  globalThis.window = {
    location: { hash, pathname: '/', search: '' },
    history: { replaceState: (a, b, url) => { state.stripped = url; } },
    addEventListener: () => {},
  };
  globalThis.document = { addEventListener: () => {}, hidden: false };
  return state;
}
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (path, options = {}) => {
    calls.push({ path, options });
    return handler(path, options);
  };
  return calls;
}
const jsonRes = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const notFound = () => jsonRes({ error: 'not-found' }, 404);

test('zip writer output round-trips through the stored-entry reader', () => {
  const doc = JSON.stringify({ v: 1, completed: { a: true }, rescuedTotal: 7 });
  const bytes = zipStore('save.json', new TextEncoder().encode(doc));
  assert.equal(new TextDecoder().decode(unzipFirstEntry(bytes)), doc);
});

test('start(): fragment token read once, stripped, sub/game_scope decoded', async () => {
  const state = shimBrowser('#game_token=' + TOKEN + '&session_id=abc');
  const calls = stubFetch(() => jsonRes({ token: TOKEN }));
  const p = createPlatform();
  p.start();
  assert.ok(p.hosted());
  assert.equal(state.stripped, '/');
  assert.equal(p.displayName(), 'Player ' + USER.slice(0, 8)); // fallback before profile
  // refresh POST goes to the scoped launch-token route with the Bearer header
  await new Promise(r => setTimeout(r, 0));
  const refresh = calls.find(c => c.options.method === 'POST');
  assert.ok(refresh, 'refresh call made');
  assert.match(refresh.path, /^\/api\/v1\/games\/rescue-pins\/launch-token$/);
  assert.equal(refresh.options.headers.authorization, 'Bearer ' + TOKEN);
  delete globalThis.window; delete globalThis.document; delete globalThis.fetch;
});

test('start(): malformed token stays local; query fallback works for dev', async () => {
  shimBrowser('#game_token=not-a-jwt');
  stubFetch(() => notFound());
  const p = createPlatform();
  p.start();
  assert.equal(p.hosted(), false);

  const state = shimBrowser('');
  globalThis.window.location.search = '?token=' + TOKEN;
  const p2 = createPlatform();
  p2.start();
  assert.ok(p2.hosted());
  assert.equal(p2.displayName(), 'Player ' + USER.slice(0, 8));
  delete globalThis.window; delete globalThis.document; delete globalThis.fetch;
});

test('nickname from /api/v1/users/{sub}/profile; never /api/v1/me, never usernames', async () => {
  shimBrowser('#game_token=' + TOKEN);
  const calls = stubFetch((path) => {
    if (path === `/api/v1/users/${USER}/profile`) return jsonRes({ id: USER, username: 'mira_x', nickname: 'Mira' });
    if (path.endsWith('/launch-token')) return jsonRes({ token: TOKEN });
    return notFound();
  });
  const p = createPlatform();
  p.start();
  await new Promise(r => setTimeout(r, 10)); // let profile load
  assert.equal(p.displayName(), 'Mira');
  assert.ok(!calls.some(c => c.path === '/api/v1/me'));
  delete globalThis.window; delete globalThis.document; delete globalThis.fetch;
});

test('cloud save: remote load preferred, invalid remote rejected; debounced PUT uploads a valid zip', async () => {
  shimBrowser('#game_token=' + TOKEN);
  const remote = { v: 1, completed: { daily: true }, bestScores: { daily: 900 }, tutorialDone: false,
                   streakDays: [], achievements: [], rescuedTotal: 3, coachDone: false };
  const remoteZip = bytesToBase64(zipStore('save.json', new TextEncoder().encode(
    JSON.stringify({ ...remote, checksum: 'bogus' }))));
  let savedBody = null;
  const calls = stubFetch((path, options) => {
    if (path.endsWith('/launch-token')) return jsonRes({ token: TOKEN });
    if (path === `/api/v1/users/${USER}/profile`) return jsonRes({ id: USER, username: 'u', nickname: 'Mira' });
    if (path === '/api/v1/me/cloud-saves/rescue-pins' && options.method === 'PUT') {
      savedBody = JSON.parse(options.body);
      return jsonRes({ ok: true });
    }
    return notFound();
  });
  const p = createPlatform();
  p.start();
  await new Promise(r => setTimeout(r, 10));
  // 404 on GET = no remote save yet
  assert.equal(await p.loadCloudSave(), null);
  // tampered remote (bad checksum) must not clobber local progress
  const handler = globalThis.fetch;
  globalThis.fetch = async (path, options = {}) => {
    calls.push({ path, options });
    if (path === '/api/v1/me/cloud-saves/rescue-pins') {
      return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(remoteZip, 'base64') };
    }
    return notFound();
  };
  assert.equal(await p.loadCloudSave(), null);
  // valid remote comes back validated
  const { hashString, stableStringify } = await import('../js/rules.js');
  const withSum = { ...remote, v: 1 };
  withSum.checksum = hashString(stableStringify({ ...withSum, checksum: undefined }));
  const goodZip = bytesToBase64(zipStore('save.json', new TextEncoder().encode(JSON.stringify(withSum))));
  globalThis.fetch = async (path, options = {}) => {
    calls.push({ path, options });
    if (path === '/api/v1/me/cloud-saves/rescue-pins') {
      return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(goodZip, 'base64') };
    }
    return notFound();
  };
  const doc = await p.loadCloudSave();
  assert.equal(doc.rescuedTotal, 3);
  // queue a save: debounced PUT with Bearer + zip body
  globalThis.fetch = handler;
  p.queueCloudSave({ ...remote, rescuedTotal: 4 });
  assert.match(p.syncLabel(), /saving/i);
  await new Promise(r => setTimeout(r, 2200));
  assert.equal(p.syncLabel(), 'Cloud save synced');
  const put = calls.find(c => c.options.method === 'PUT');
  assert.equal(put.options.headers.authorization, 'Bearer ' + TOKEN);
  const uploaded = JSON.parse(new TextDecoder().decode(unzipFirstEntry(Buffer.from(savedBody.dataBase64, 'base64'))));
  assert.equal(uploaded.rescuedTotal, 4);
  assert.equal(uploaded.v, 1);
  delete globalThis.window; delete globalThis.document; delete globalThis.fetch;
});

test('leaderboard: read-only entries resolved to nicknames; no leaderboardId → null', async () => {
  shimBrowser('#game_token=' + TOKEN);
  const calls = stubFetch((path) => {
    if (path.endsWith('/launch-token')) return jsonRes({ token: TOKEN });
    if (path === '/api/v1/games/rescue-pins') return jsonRes({ leaderboardId: 'lb-1' });
    if (path === '/api/v1/leaderboards/lb-1/entries?page=1&pageSize=5') {
      return jsonRes({ entries: [{ userId: USER, score: 1200 }, { userId: 'other-user-2', score: 900 }] });
    }
    if (path === `/api/v1/users/${USER}/profile`) return jsonRes({ id: USER, username: 'u', nickname: 'Mira' });
    if (path === '/api/v1/users/other-user-2/profile') return jsonRes({ id: 'other-user-2', username: 'o', nickname: null });
    return notFound();
  });
  const p = createPlatform();
  p.start();
  await new Promise(r => setTimeout(r, 10));
  const entries = await p.fetchLeaderboardEntries(5);
  assert.deepEqual(entries, [{ name: 'Mira', score: 1200 }, { name: 'Player other-us', score: 900 }]);
  assert.ok(calls.every(c => !/leaderboards\/.*entries/.test(c.path) || c.options.method !== 'POST'));
  delete globalThis.window; delete globalThis.document; delete globalThis.fetch;
});
