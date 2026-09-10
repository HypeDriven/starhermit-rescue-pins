// Achievement tests: static set shape, unlock rules, idempotency, streak math.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, achievementByKey, longestStreak, evaluateAchievements } from '../js/achievements.js';

const freshProg = () => ({ v: 1, completed: {}, bestScores: {}, tutorialDone: false, streakDays: [], achievements: [], rescuedTotal: 0 });

test('static set: five achievements, stable lowercase keys, named + described', () => {
  assert.equal(ACHIEVEMENTS.length, 5);
  for (const a of ACHIEVEMENTS) {
    assert.match(a.key, /^[a-z0-9-]+$/);
    assert.ok(a.name.length > 0 && a.description.length > 0);
    assert.equal(achievementByKey(a.key).key, a.key);
  }
  assert.equal(achievementByKey('nope'), null);
});

test('first completion unlocks first-rescue, idempotently', () => {
  const prog = freshProg();
  const before = evaluateAchievements(prog, () => null);
  assert.deepEqual(before.newly, []);
  prog.completed['journey-1'] = true;
  const ev = evaluateAchievements(prog, () => null);
  assert.deepEqual(ev.newly, ['first-rescue']);
  // store + re-evaluate: nothing new, still unlocked (idempotent)
  prog.achievements = ev.unlocked;
  const again = evaluateAchievements(prog, () => null);
  assert.deepEqual(again.newly, []);
  assert.ok(again.unlocked.includes('first-rescue'));
});

test('mechanic mastery requires the full tutorial', () => {
  const prog = freshProg();
  prog.completed['tut-1'] = true;
  assert.ok(!evaluateAchievements(prog, () => null).newly.includes('mechanic-mastery'));
  prog.tutorialDone = true;
  assert.ok(evaluateAchievements(prog, () => null).newly.includes('mechanic-mastery'));
});

test('daily streak: seven consecutive UTC days unlock, gaps break the run', () => {
  assert.equal(longestStreak([]), 0);
  assert.equal(longestStreak([5, 4, 4, 3]), 3);        // unsorted + dupes ok
  assert.equal(longestStreak([1, 2, 3, 10, 11]), 3);   // gap resets
  assert.equal(longestStreak([7, 8, 9, 10, 11, 12, 13]), 7);
  const prog = freshProg();
  prog.streakDays = [1, 2, 3, 4, 5, 6];
  assert.ok(!evaluateAchievements(prog, () => null).newly.includes('daily-streak-7'));
  prog.streakDays = [1, 2, 3, 4, 5, 6, 7];
  assert.ok(evaluateAchievements(prog, () => null).newly.includes('daily-streak-7'));
});

test('difficult milestone: any completed stage in the final theme', () => {
  const prog = freshProg();
  prog.completed['journey-10'] = true;
  assert.ok(!evaluateAchievements(prog, (id) => (id === 'journey-10' ? 'amber-spires' : null)).newly.includes('ember-depths-veteran'));
  prog.completed['journey-35'] = true;
  const ev = evaluateAchievements(prog, (id) => (id === 'journey-35' ? 'ember-depths' : 'amber-spires'));
  assert.ok(ev.newly.includes('ember-depths-veteran'));
});

test('long-term goal: 100 villagers rescued, and evaluation does not mutate prog', () => {
  const prog = freshProg();
  prog.rescuedTotal = 99;
  assert.ok(!evaluateAchievements(prog, () => null).newly.includes('guardian-hundred'));
  prog.rescuedTotal = 100;
  assert.ok(evaluateAchievements(prog, () => null).newly.includes('guardian-hundred'));
  const snapshot = JSON.stringify(prog);
  evaluateAchievements(prog, () => 'ember-depths');
  assert.equal(JSON.stringify(prog), snapshot);
});
