// Server tests: ephemeral port, static files, /api/v1/time, daily verify
// (valid + tampered), leaderboard POST/GET with idempotency.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// point the server at a throwaway data dir BEFORE importing it, so test
// submissions never pollute the shipped data/leaderboard.json
process.env.RESCUE_PINS_DATA_DIR = mkdtempSync(join(tmpdir(), 'rescue-pins-test-'));
const { createServer } = await import('../server.js');
const { createSession } = await import('../js/session.js');
const { getDailyLevel, dailySeedForDate } = await import('../js/content.js');

async function withServer(fn) {
  const srv = createServer();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base); } finally { await new Promise(r => srv.close(r)); }
}

test('static files served with correct MIME', async () => {
  await withServer(async (base) => {
    for (const [path, mime] of [['/', 'text/html'], ['/js/main.js', 'text/javascript'],
                                ['/js/three.min.js', 'text/javascript'], ['/starhermit.txt', 'text/plain']]) {
      const res = await fetch(base + path);
      assert.equal(res.status, 200, path);
      assert.ok(res.headers.get('content-type').startsWith(mime), path + ' mime');
    }
    assert.equal((await fetch(base + '/../etc/passwd')).status, 404);
    assert.equal((await fetch(base + '/data/leaderboard.json')).status, 403);
  });
});

test('GET /api/v1/time', async () => {
  await withServer(async (base) => {
    const res = await fetch(base + '/api/v1/time');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Math.abs(body.serverTime - Date.now()) < 5000);
  });
});

test('daily verify: valid replay accepted, tampered rejected', async () => {
  await withServer(async (base) => {
    const seed = dailySeedForDate(new Date());
    const level = getDailyLevel(seed);
    if (level.excluded) return; // excluded day: nothing to verify
    // build a genuinely winning replay client-side
    const s = createSession({ level, mode: 'daily', now: Date.now() });
    s.transition('active', 'test');
    const { solveLevel } = await import('../js/rules.js');
    const sol = solveLevel(level).solution;
    sol.forEach((pid, i) => s.dispatch({ id: 'cmd-' + i, type: 'pull', pinId: pid }));
    const env = s.replayEnvelope();
    env.elapsedMs = 30000;
    let res = await fetch(base + '/api/v1/daily/verify', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ envelope: env, name: 'tester' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.valid && body.score.total > 0);
    // tampered
    const bad = structuredClone(env);
    bad.scoreBreakdown.total += 1000;
    res = await fetch(base + '/api/v1/daily/verify', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ envelope: bad }),
    });
    assert.equal(res.status, 422);
    assert.ok((await res.json()).error);
    // stale version
    const stale = structuredClone(env);
    stale.contentVersion = 999;
    res = await fetch(base + '/api/v1/daily/verify', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ envelope: stale }),
    });
    assert.equal(res.status, 409);
    // a seed from another day (not today/yesterday) is not ranked
    const oldDay = structuredClone(env);
    oldDay.seed = seed - 7;
    res = await fetch(base + '/api/v1/daily/verify', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ envelope: oldDay }),
    });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error, 'stale-or-future-daily-seed');
  });
});

test('leaderboard: validated POST, idempotent duplicate, GET filters', async () => {
  await withServer(async (base) => {
    const seed = dailySeedForDate(new Date());
    const level = getDailyLevel(seed);
    if (level.excluded) return;
    const s = createSession({ level, mode: 'daily', now: Date.now() });
    s.transition('active', 'test');
    const { solveLevel } = await import('../js/rules.js');
    solveLevel(level).solution.forEach((pid, i) => s.dispatch({ id: 'c' + i, type: 'pull', pinId: pid }));
    const env = s.replayEnvelope();
    env.elapsedMs = 45000;
    const payload = { name: 'tester-' + seed, seed, contentVersion: 1, envelope: env, submissionId: 'sub-' + seed };
    let res = await fetch(base + '/api/v1/leaderboard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(res.status, 200);
    const first = await res.json();
    assert.ok(first.stored && first.entry.score > 0);
    // duplicate submission id -> idempotent, no double-store
    res = await fetch(base + '/api/v1/leaderboard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.ok((await res.json()).duplicate);
    // fake score -> rejected
    const cheat = structuredClone(payload);
    cheat.submissionId = 'sub-cheat-' + seed;
    cheat.envelope.scoreBreakdown.total += 999;
    res = await fetch(base + '/api/v1/leaderboard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cheat) });
    assert.equal(res.status, 422);
    // GET global + friends filter
    res = await fetch(base + '/api/v1/leaderboard?seed=' + seed);
    const lb = await res.json();
    assert.ok(lb.entries.some(e => e.submissionId === 'sub-' + seed));
    res = await fetch(base + '/api/v1/leaderboard?scope=friends&names=someone-else');
    assert.equal((await res.json()).entries.length, 0);
  });
});

test('API validates garbage input without crashing', async () => {
  await withServer(async (base) => {
    let res = await fetch(base + '/api/v1/daily/verify', { method: 'POST', body: 'not json' });
    assert.equal(res.status, 400);
    res = await fetch(base + '/api/v1/daily/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"envelope":{}}' });
    assert.equal(res.status, 409);
    res = await fetch(base + '/api/v1/nope');
    assert.equal(res.status, 404);
    res = await fetch(base + '/api/v1/leaderboard', { method: 'DELETE' });
    assert.equal(res.status, 405);
  });
});
