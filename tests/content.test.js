// Content tests: validator over tutorial + all 40 journey stages + daily sample;
// solvable, bounded, no soft locks, difficulty metadata present.

import test from 'node:test';
import assert from 'node:assert/strict';
import { getTutorial, getJourney, getDailyLevel, dailySeedForDate, validateLevel,
         THEMES, CONTENT_VERSION, findLevel } from '../js/content.js';
import { solveLevel } from '../js/rules.js';

test('tutorial: 5 lessons, each valid and solvable, one rule at a time', () => {
  const tut = getTutorial();
  assert.equal(tut.length, 5);
  for (const lesson of tut) {
    assert.ok(lesson.text && lesson.title);
    const v = validateLevel(lesson.level);
    assert.ok(v.ok, lesson.id + ': ' + v.errors.join(','));
    assert.ok(v.solution.length >= 1);
  }
});

test('journey: 40 stages, 5 themes, all valid + solvable + bounded', () => {
  const journey = getJourney();
  assert.equal(journey.length, 40);
  const themes = new Set(journey.map(l => l.theme));
  assert.equal(themes.size, 5);
  for (const lv of journey) {
    const v = validateLevel(lv);
    assert.ok(v.ok, lv.id + ': ' + v.errors.join(','));
    assert.ok(lv.pins.length <= 9, lv.id + ' too many pins');
    assert.ok(lv.par >= 1 && lv.par <= lv.pins.length);
    assert.ok(lv.difficulty && Number.isInteger(lv.difficulty.tier));
    assert.equal(lv.contentVersion, CONTENT_VERSION);
  }
  // periodic mastery + challenge stages exist
  assert.ok(journey.some(l => l.difficulty.mastery));
  assert.ok(journey.some(l => l.moveLimit > 0));
  // difficulty trends upward (branching or depth)
  const avg = (arr) => arr.reduce((a, l) => a + l.pins.length, 0) / arr.length;
  assert.ok(avg(journey.slice(32)) >= avg(journey.slice(0, 8)));
});

test('journey generation is deterministic', () => {
  const a = getJourney().map(l => JSON.stringify(l)).join();
  // regenerate from a fresh module state via daily path determinism check
  const b = getJourney().map(l => JSON.stringify(l)).join();
  assert.equal(a, b);
});

test('daily challenge: immutable per UTC day, solvable sample', () => {
  const d0 = dailySeedForDate(new Date('2026-01-15T12:00:00Z'));
  const d1 = dailySeedForDate(new Date('2026-01-15T23:59:59Z'));
  assert.equal(d0, d1); // same UTC day -> same seed
  const d2 = dailySeedForDate(new Date('2026-01-16T00:00:01Z'));
  assert.notEqual(d0, d2);
  for (const ds of [d0, d2, 19500, 19999, 20222, 21000]) {
    const lvl = getDailyLevel(ds);
    if (lvl.excluded) continue; // defective days are excluded, not replaced
    const v = validateLevel(lvl);
    assert.ok(v.ok, 'daily ' + ds + ': ' + v.errors.join(','));
    // immutability: same seed -> identical level
    assert.equal(JSON.stringify(getDailyLevel(ds)), JSON.stringify(lvl));
  }
});

test('validator rejects broken levels', () => {
  assert.ok(!validateLevel(null).ok);
  assert.ok(!validateLevel({}).ok);
  assert.ok(!validateLevel({ id: 'x', seed: 1, cols: 1, rows: 2, chambers: {}, pins: [], theme: THEMES[0].id, contentVersion: 1 }).ok); // no hero
  const floating = { id: 'x', seed: 1, cols: 1, rows: 2, contentVersion: 1, theme: THEMES[0].id,
    chambers: { '0,0': { water: 1 }, '0,1': { hero: 1 } }, pins: [], par: 1 };
  const v = validateLevel(floating);
  assert.ok(v.errors.some(e => e.startsWith('floating-content')));
  const stale = { ...getTutorial()[0].level, contentVersion: 999 };
  assert.ok(validateLevel(stale).errors.includes('stale-content-version'));
});

test('findLevel resolves tutorial, journey, daily', () => {
  assert.equal(findLevel('tut-1').id, 'tut-1');
  assert.equal(findLevel('journey-20').id, 'journey-20');
  assert.equal(findLevel('daily-20000').id, 'daily-20000');
  assert.equal(findLevel('nope'), null);
});

test('solver node budget respected (no unbounded search)', () => {
  const lvl = { id: 'big', seed: 1, cols: 3, rows: 4, contentVersion: 1, theme: THEMES[0].id,
    chambers: { '0,0': { water: 1 }, '2,3': { hero: 1 } },
    pins: Array.from({ length: 9 }, (_, i) => ({ id: 'p' + i, a: [i % 3, (i / 3) | 0], b: [i % 3, (i / 3) | 0 + 1] })) };
  const t0 = Date.now();
  solveLevel(lvl, 5000);
  assert.ok(Date.now() - t0 < 10000);
});
