// The engine client's save model (js/progress.js): the progression document,
// two devices' saves merged, the browser build's cloud slot (the checksummed
// progression js/platform.js wrote through the JS SDK) read as a foreign
// save, and its settings KV carried over to the game's options.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, mergeSave, sameSave, readForeign, readLegacySettings, pickOptions, emptyProgress } from '../js/progress.js';
import { hashString, stableStringify } from '../js/rules.js';

/** js/platform.js docWithChecksum, as the browser build saved its cloud slot. */
function oldCloudText(prog) {
  const out = { ...prog, v: 1 };
  out.checksum = hashString(stableStringify({ ...out, checksum: undefined }));
  return JSON.stringify(out);
}

test('normalize fills and cleans a progression document', () => {
  assert.deepEqual(normalize(null), emptyProgress());
  const p = normalize({ completed: { 'journey-1': true }, bestScores: { a: 5, b: 'x' }, streakDays: [3, 'x'], achievements: ['first-rescue', 7], checksum: 'abc', coachDone: true });
  assert.deepEqual(p.bestScores, { a: 5 });
  assert.deepEqual(p.streakDays, [3]);
  assert.deepEqual(p.achievements, ['first-rescue']);
  assert.equal(p.coachDone, true);
  assert.equal('checksum' in p, false);
});

test('two devices merge: unions, best scores, larger rescued total', () => {
  const a = { completed: { 'journey-1': true }, bestScores: { 'journey-1': 1200 }, streakDays: [10, 11], achievements: ['first-rescue'], rescuedTotal: 4 };
  const b = { completed: { 'journey-2': true }, bestScores: { 'journey-1': 1500, 'journey-2': 900 }, streakDays: [12], achievements: ['mechanic-mastery'], rescuedTotal: 9, tutorialDone: true };
  const m = mergeSave(b, a);
  assert.deepEqual(Object.keys(m.completed).sort(), ['journey-1', 'journey-2']);
  assert.deepEqual(m.bestScores, { 'journey-1': 1500, 'journey-2': 900 });
  assert.deepEqual(m.streakDays, [10, 11, 12]);
  assert.deepEqual(m.achievements.sort(), ['first-rescue', 'mechanic-mastery']);
  assert.equal(m.rescuedTotal, 9);
  assert.equal(m.tutorialDone, true);
  assert.ok(sameSave(m, mergeSave(m, m)));
});

test('the browser build\'s cloud slot reads as a foreign save; a broken checksum is refused', () => {
  const prog = { v: 1, completed: { 'tut-1': true }, bestScores: { 'tut-1': 1300 }, tutorialDone: false, streakDays: [], achievements: ['first-rescue'], rescuedTotal: 1, coachDone: true };
  const doc = readForeign(oldCloudText(prog));
  assert.deepEqual(doc.completed, { 'tut-1': true });
  assert.equal(doc.coachDone, true);
  const bad = JSON.parse(oldCloudText(prog));
  bad.rescuedTotal = 99;
  assert.equal(readForeign(JSON.stringify(bad)), null);
  assert.equal(readForeign('not json'), null);
  assert.equal(readForeign(''), null);
});

test('the browser build\'s settings KV carries the palette, captions and left-handed tray over', () => {
  const r = readLegacySettings({ audio: { music: 0.2 }, graphics: { palette: 'colorblind', reducedMotion: true }, controls: { leftHanded: true }, captions: false, tutorialDone: true });
  assert.deepEqual(r.options, { palette: 'colorblind', captions: false, leftHanded: true });
  assert.equal(r.tutorialDone, true);
  assert.deepEqual(pickOptions({ palette: 'neon', captions: 'yes' }), {});
});
