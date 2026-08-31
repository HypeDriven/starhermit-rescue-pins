// Unit tests: rules engine — legal actions, invalid reasons, scoring,
// terminal states, serialization round-trip/migration, determinism, fuzz.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, legalActions, explainIllegal, applyCommand, isTerminal,
         scoreBreakdown, serialize, deserialize, hashState, makeStreams, mulberry32,
         solveLevel, RULES_VERSION } from '../js/rules.js';

const L = (over = {}) => ({
  id: 't', seed: 7, cols: 2, rows: 3, par: 2, contentVersion: 1,
  chambers: { '0,0': { water: 2 }, '1,0': { lava: 1 }, '1,2': { hero: 1 } },
  pins: [
    { id: 'pv', a: [0, 0], b: [0, 1] },
    { id: 'ph', a: [0, 2], b: [1, 2] },
    { id: 'pl', a: [1, 0], b: [1, 1] },
    { id: 'pl2', a: [1, 1], b: [1, 2] },
    { id: 'px', a: [0, 1], b: [1, 1] },
    { id: 'pt', a: [0, 0], b: [1, 0] },
  ],
  ...over,
});
const S = (lvl) => createInitialState(lvl || L(), makeStreams(7));

test('rng is seeded and streams are independent', () => {
  const a = mulberry32(5), b = mulberry32(5);
  assert.equal(a(), b());
  const s1 = makeStreams(9), s2 = makeStreams(9);
  assert.equal(s1.rules(), s2.rules());
  assert.notEqual(s1.rules(), s1.decor());
});

test('legal actions list every remaining pin; none when terminal', () => {
  const s = S();
  assert.deepEqual(legalActions(s).map(a => a.pinId).sort(), ['ph', 'pl', 'pl2', 'pt', 'pv', 'px']);
  const won = applyCommand(applyCommand(s, { type: 'pull', pinId: 'pv' }).state, { type: 'pull', pinId: 'ph' }).state;
  assert.equal(won.status, 'won');
  assert.deepEqual(legalActions(won), []);
});

test('invalid action reasons', () => {
  const s = S();
  assert.equal(explainIllegal(s, null), 'malformed-command');
  assert.equal(explainIllegal(s, { type: 'zap', pinId: 'pv' }), 'unknown-command-type');
  assert.equal(explainIllegal(s, { type: 'pull' }), 'missing-pin-id');
  assert.equal(explainIllegal(s, { type: 'pull', pinId: 'nope' }), 'pin-not-found');
  const s2 = applyCommand(s, { type: 'pull', pinId: 'pv' }).state;
  assert.equal(explainIllegal(s2, { type: 'pull', pinId: 'pv' }), 'pin-already-pulled');
  const won = applyCommand(s2, { type: 'pull', pinId: 'ph' }).state;
  assert.equal(explainIllegal(won, { type: 'pull', pinId: 'ph' }), 'game-over');
});

test('water rescues hero -> win; tick is monotonic', () => {
  let s = S();
  s = applyCommand(s, { type: 'pull', pinId: 'pv' }).state;
  assert.equal(s.tick, 1);
  assert.equal(s.status, 'active');
  s = applyCommand(s, { type: 'pull', pinId: 'ph' }).state;
  assert.equal(s.tick, 2);
  assert.equal(s.status, 'won');
  const t = isTerminal(s);
  assert.deepEqual([t.done, t.won, t.reason], [true, true, 'all-rescued']);
});

test('lava touching hero -> loss', () => {
  let s = S();
  s = applyCommand(s, { type: 'pull', pinId: 'pl' }).state;   // lava falls to 1,1
  s = applyCommand(s, { type: 'pull', pinId: 'pl2' }).state;  // lava falls onto hero
  assert.equal(s.status, 'lost');
  assert.equal(isTerminal(s).reason, 'hero-burned');
});

test('water + lava neutralize into steam', () => {
  const lvl = L({
    chambers: { '0,0': { water: 2 }, '0,1': { lava: 2 }, '0,2': { hero: 1 } },
    pins: [{ id: 'p1', a: [0, 0], b: [0, 1] }, { id: 'p2', a: [0, 1], b: [0, 2] }],
  });
  let s = S(lvl);
  s = applyCommand(s, { type: 'pull', pinId: 'p1' }).state; // 2 water vs 2 lava -> both gone
  assert.equal(s.stats.neutralized, 2);
  assert.equal(s.status, 'active'); // nothing left to rescue the hero with
});

test('move limit challenge ends in loss', () => {
  const lvl = L({ moveLimit: 1 });
  let s = S(lvl);
  s = applyCommand(s, { type: 'pull', pinId: 'pv' }).state;
  assert.equal(s.status, 'lost');
  assert.equal(s.reason, 'move-limit-exceeded');
});

test('score breakdown is integer components', () => {
  let s = S();
  s = applyCommand(s, { type: 'pull', pinId: 'pv' }).state;
  s = applyCommand(s, { type: 'pull', pinId: 'ph' }).state;
  const sb = scoreBreakdown(s);
  assert.equal(sb.saved, 1000);
  assert.ok(Number.isInteger(sb.total));
  assert.ok(sb.efficiency > 0);
  assert.equal(sb.total, sb.saved + sb.neutralized + sb.parBonus + sb.efficiency - sb.invalidPenalty);
  // loss scores no win bonuses
  let s2 = S();
  s2 = applyCommand(s2, { type: 'pull', pinId: 'pl' }).state;
  s2 = applyCommand(s2, { type: 'pull', pinId: 'pl2' }).state;
  const sb2 = scoreBreakdown(s2);
  assert.equal(sb2.parBonus, 0);
  assert.equal(sb2.efficiency, 0);
});

test('serialization round-trip + migration', () => {
  let s = S();
  s = applyCommand(s, { type: 'pull', pinId: 'pv' }).state;
  const back = deserialize(serialize(s));
  assert.equal(hashState(back), hashState(s));
  // migration from v0: missing stats tolerated
  const old = JSON.parse(serialize(s));
  old.v = 0;
  delete old.state.stats;
  const mig = deserialize(old);
  assert.ok(mig.stats);
  // future version rejected
  const fut = JSON.parse(serialize(s));
  fut.v = RULES_VERSION + 1;
  assert.throws(() => deserialize(fut));
});

test('property: same version+seed+commands -> identical hashes (replay determinism)', () => {
  for (const seed of [1, 42, 999983]) {
    const lvl = L({ seed });
    const run = () => {
      let s = createInitialState(lvl, makeStreams(seed));
      const hashes = [hashState(s)];
      for (const pid of ['pv', 'ph']) { s = applyCommand(s, { type: 'pull', pinId: pid }).state; hashes.push(hashState(s)); }
      return hashes;
    };
    assert.deepEqual(run(), run());
  }
});

test('fuzz malformed commands: no hang, no NaN, no crash', () => {
  const junk = [undefined, null, 0, '', 'pull', {}, [], { type: {} }, { type: 'pull', pinId: 5 },
                { type: 'pull', pinId: '' }, { type: 'pull', pinId: '\0'.repeat(500) },
                { type: 'pull', pinId: 'pv', extra: { deep: [1, 2, 3] } }];
  for (let i = 0; i < 200; i++) {
    let s = S();
    const rng = mulberry32(i);
    for (let k = 0; k < 12; k++) {
      const cmd = rng() < 0.5 ? junk[Math.floor(rng() * junk.length)]
        : { type: 'pull', pinId: 'p' + Math.floor(rng() * 8) };
      const { state } = applyCommand(s, cmd);
      s = state;
      for (const cell of Object.values(s.chambers)) {
        assert.ok(Number.isFinite(cell.water) && Number.isFinite(cell.lava));
        assert.ok(cell.water >= 0 && cell.lava >= 0);
      }
      assert.ok(['active', 'won', 'lost'].includes(s.status));
    }
  }
});

test('solver bound: impossible level reports exhaustion, does not hang', () => {
  const lvl = L({ chambers: { '0,0': { water: 1 }, '1,2': { hero: 1 } },
                  pins: [{ id: 'p1', a: [0, 0], b: [0, 1] }] }); // water can never cross to col 1
  const res = solveLevel(lvl);
  assert.equal(res.solvable, false);
});
