// Session tests: state machine, command log idempotency, undo, replay envelope
// verification (valid + tampered), persistence round-trip, settings.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, loadSettings, saveSettings, loadProgression, saveProgression } from '../js/session.js';
import { getTutorial, findLevel } from '../js/content.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};
const tut1 = () => getTutorial()[0].level;

test('screen transitions carry an owner reason', () => {
  const s = createSession({ level: tut1(), mode: 'tutorial', storage: memStorage() });
  s.transition('title', 'boot-done');
  assert.equal(s.session.screen, 'title');
  assert.equal(s.session.screenReason, 'boot-done');
  assert.throws(() => s.transition('nope', 'x'));
});

test('duplicate command ids rejected idempotently', () => {
  const s = createSession({ level: tut1(), mode: 'tutorial', storage: memStorage() });
  s.transition('active', 'test');
  const r1 = s.dispatch({ id: 'c1', type: 'pull', pinId: 'p1' });
  assert.ok(r1.ok && r1.terminal.won);
  const r2 = s.dispatch({ id: 'c1', type: 'pull', pinId: 'p1' });
  assert.ok(!r2.ok && r2.duplicate);
  assert.equal(s.session.commandLog.length, 1);
  const r3 = s.dispatch({ id: 'c2', type: 'pull', pinId: 'p1' });
  assert.ok(!r3.ok && !r3.duplicate); // illegal after game over, but a fresh id
});

test('bad command id rejected', () => {
  const s = createSession({ level: tut1(), mode: 'tutorial', storage: memStorage() });
  s.transition('active', 'test');
  assert.equal(s.dispatch({ type: 'pull', pinId: 'p1' }).error, 'bad-command-id');
});

test('undo allowed in practice/tutorial, forbidden in ranked modes', () => {
  const s = createSession({ level: tut1(), mode: 'tutorial', storage: memStorage() });
  s.transition('active', 'test');
  s.dispatch({ id: 'a', type: 'pull', pinId: 'p1' });
  assert.equal(s.session.state.status, 'won');
  // wrong screen now (resolving) -> rejected
  assert.equal(s.undo().error, 'undo-wrong-screen');
  const r = createSession({ level: tut1(), mode: 'daily', storage: memStorage() });
  assert.equal(r.undo().error, 'undo-not-allowed');
});

test('undo rebuilds deterministically from the log', () => {
  const lvl = getTutorial()[1].level; // two-step lesson
  const s = createSession({ level: lvl, mode: 'practice', storage: memStorage() });
  s.transition('active', 'test');
  const h0 = s.session.initialHash;
  s.dispatch({ id: 'a', type: 'pull', pinId: 'pa' });
  const h1 = s.replayEnvelope().finalHash;
  s.dispatch({ id: 'b', type: 'pull', pinId: 'pb' });
  assert.equal(s.session.state.status, 'won');
  s.transition('active', 'test'); // pretend resolution overlay dismissed
  assert.ok(s.undo().ok);
  assert.equal(s.replayEnvelope().finalHash, h1); // identical state after undo
  assert.ok(s.undo().ok);
  assert.equal(s.replayEnvelope().finalHash, h0);
  assert.equal(s.undo().error, 'nothing-to-undo');
});

test('replay envelope verifies; tampering rejected', () => {
  const lvl = getTutorial()[1].level;
  const s = createSession({ level: lvl, mode: 'journey', storage: memStorage() });
  s.transition('active', 'test');
  s.dispatch({ id: 'a', type: 'pull', pinId: 'pa' });
  s.dispatch({ id: 'b', type: 'pull', pinId: 'pb' });
  const env = s.replayEnvelope();
  const gate = createSession({ level: lvl, mode: 'daily', storage: memStorage() });
  const ok = gate.verifyReplay(env, findLevel(env.levelId));
  assert.ok(ok.valid, ok.error);
  assert.ok(ok.score.total > 0);
  // tamper: inflated score
  const bad1 = structuredClone(env);
  bad1.scoreBreakdown.total += 500;
  assert.equal(gate.verifyReplay(bad1, lvl).error, 'score-mismatch');
  // tamper: drop a command
  const bad2 = structuredClone(env);
  bad2.commands.pop();
  assert.equal(gate.verifyReplay(bad2, lvl).error, 'final-hash-mismatch');
  // stale content version
  const bad3 = structuredClone(env);
  bad3.contentVersion = 999;
  assert.equal(gate.verifyReplay(bad3, lvl).error, 'stale-content-version');
  // wrong seed
  const bad4 = structuredClone(env);
  bad4.seed += 1;
  assert.equal(gate.verifyReplay(bad4, lvl).error, 'seed-mismatch');
});

test('save snapshot round-trips; corrupted snapshot rejected', () => {
  const storage = memStorage();
  const lvl = tut1();
  const s = createSession({ level: lvl, mode: 'journey', storage });
  s.transition('active', 'test');
  s.saveSnapshot('k');
  const s2 = createSession({ level: lvl, mode: 'journey', storage });
  const doc = s2.loadSnapshot('k', findLevel);
  assert.ok(doc);
  assert.equal(s2.session.screen, 'paused'); // resumed sessions park in pause
  storage.setItem('k', storage.getItem('k').replace('"mode":"journey"', '"mode":"daily"'));
  const s3 = createSession({ level: lvl, mode: 'journey', storage });
  assert.equal(s3.loadSnapshot('k', findLevel), null); // checksum mismatch
});

test('settings and progression persistence with checksums', () => {
  const storage = memStorage();
  const st = loadSettings(storage);
  assert.equal(st.audio.effects, 0.8);
  st.audio.effects = 0.3;
  saveSettings(st, storage);
  assert.equal(loadSettings(storage).audio.effects, 0.3);
  storage.setItem('rescue-pins:settings', '{"v":1,"audio":{"effects":0.1}}');
  assert.equal(loadSettings(storage).audio.effects, 0.8); // bad checksum -> defaults
  const p = loadProgression(storage);
  p.completed['journey-1'] = true;
  saveProgression(p, storage);
  assert.ok(loadProgression(storage).completed['journey-1']);
});
