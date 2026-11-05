// Localization coverage for the engine client: every English key native/*.ts
// shows (T('…'), N('…')), plus the content it translates (themes, lessons,
// achievements, captions), is translated in every full locale (en-GB → en-US,
// es-ES → es-419, fr-CA → fr-FR inherit); placeholders survive; no table row
// is unused (assets/strings.json, on the engine's strings).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { codeKeys, audit } from './i18n-common.mjs';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
import { THEMES, getTutorial } from '../js/content.js';
import { ACHIEVEMENTS } from '../js/achievements.js';

const ROOT = new URL('../', import.meta.url);

function usedKeys() {
  const keys = new Set();
  for (const f of readdirSync(new URL('native/', ROOT)).filter((n) => n.endsWith('.ts'))) {
    codeKeys(readFileSync(new URL(`native/${f}`, ROOT), 'utf8')).forEach((k) => keys.add(k));
  }
  for (const th of THEMES) keys.add(th.name);
  for (const l of getTutorial()) { keys.add(l.title); keys.add(l.text); }
  for (const a of ACHIEVEMENTS) { keys.add(a.name); keys.add(a.description); }
  return [...keys].sort();
}

test('every used key is translated in every locale; placeholders intact; no unused rows', () => {
  const used = usedKeys();
  assert.ok(used.length > 150, 'keys found: ' + used.length);
  assert.deepEqual(audit(JSON.parse(read('assets/strings.json')), used), []);
});

test('regional tables list differences; the full locales translate', () => {
  const T = JSON.parse(read('assets/strings.json'));
  assert.equal(T['de-DE'].Paused, 'Pausiert');
  assert.equal(T['fr-CA'].Score, 'Pointage');
  assert.equal(T['fr-FR'].Resume, 'Reprendre');
  assert.equal(T['en-GB'].Colorblind, 'Colourblind');
  assert.equal(T['it-IT']['Pin {id}'], 'Perno {id}');
});
