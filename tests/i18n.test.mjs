// Localization coverage for the engine client: every English key native/*.ts
// shows (T('…'), N('…')), plus the content it translates (themes, lessons,
// achievements, captions), is translated in every full locale (en-GB → en-US,
// es-ES → es-419, fr-CA → fr-FR inherit); placeholders survive; no table row
// is unused; js/lang.js picks locales and falls back like the browser build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadTables, codeKeys, audit, LOCALES } from './i18n-common.mjs';
import { THEMES, getTutorial } from '../js/content.js';
import { ACHIEVEMENTS } from '../js/achievements.js';
import { T, setLang, pickLocale } from '../js/lang.js';
import { shText } from '../js/sh-i18n.js';

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
  assert.deepEqual(audit(loadTables(ROOT, 'js/strings.js', 'RP_STRINGS'), used), []);
});

test('the language follows the runtime tag with the regional fallbacks', () => {
  assert.equal(pickLocale('de'), 'de-DE');
  assert.equal(pickLocale('en-AU'), 'en-GB');
  assert.equal(pickLocale('es-MX'), 'es-419');
  assert.equal(pickLocale('fr-CA'), 'fr-CA');
  assert.equal(pickLocale('ja-JP'), 'en-US');
  setLang('de-DE');
  assert.equal(T('Paused'), 'Pausiert');
  setLang('fr-CA');
  assert.equal(T('Score'), 'Pointage');
  assert.equal(T('Resume'), 'Reprendre'); // inherited from fr-FR
  setLang('en-GB');
  assert.equal(T('Colorblind'), 'Colourblind');
  setLang('it-IT');
  assert.equal(T('Pin {id}', { id: 3 }), 'Perno 3');
  assert.equal(shText('signIn'), 'Accedi con StarHermit');
  setLang('en-US');
  assert.equal(shText('signIn'), 'Sign in with StarHermit');
  for (const l of LOCALES) assert.equal(pickLocale(l), l);
});
