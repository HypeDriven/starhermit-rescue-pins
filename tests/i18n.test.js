// Localization coverage: every English key the markup and code use is
// translated in every locale (en-GB → en-US, es-ES → es-419, fr-CA → fr-FR
// inherit), placeholders survive, content (themes, lessons, achievements) is
// covered, and the language follows sh-language.js and switches live.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTables, codeKeys, htmlKeys, audit, bootI18n, LOCALES } from './i18n-common.mjs';
import { THEMES, getTutorial } from '../js/content.js';
import { ACHIEVEMENTS } from '../js/achievements.js';
import { GFX_STRINGS } from '../js/gfx-i18n.js';
import { shText } from '../js/sh-i18n.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

function usedKeys() {
  const keys = new Set(htmlKeys(read('index.html')));
  for (const f of ['js/main.js', 'js/ui.js', 'js/platform.js']) codeKeys(read(f), ['t']).forEach((k) => keys.add(k));
  for (const th of THEMES) keys.add(th.name);
  for (const l of getTutorial()) { keys.add(l.title); keys.add(l.text); }
  for (const a of ACHIEVEMENTS) { keys.add(a.name); keys.add(a.description); }
  keys.add('Player');
  return [...keys].sort();
}

test('every used key is translated in every locale; placeholders intact', () => {
  const used = usedKeys();
  assert.ok(used.length > 180, 'keys found: ' + used.length);
  assert.deepEqual(audit(loadTables(ROOT, 'js/strings.js', 'RP_STRINGS'), used), []);
});

test('no player-facing literal is left untranslated in the UI module', () => {
  const src = read('js/ui.js');
  const literals = [
    ...[...src.matchAll(/\bel\('\w+',\s*'[^']*',\s*'([^']*)'/g)].map((m) => m[1]),
    ...[...src.matchAll(/\bbutton\('([^']*)'/g)].map((m) => m[1]),
  ].filter((l) => /[A-Za-z]{3}/.test(l));
  assert.deepEqual(literals.filter((l) => l !== 'Rescue Pins'), []);
});

test('the locale follows sh-language and switches live', () => {
  const { I18N, events, doc } = bootI18n(ROOT, { strings: 'js/strings.js', i18n: 'js/i18n.js', global: 'RPI18N', languages: ['de-DE'] });
  assert.equal(I18N.lang, 'de-DE');
  assert.equal(doc.documentElement.lang, 'de-DE');
  assert.equal(I18N.T('Paused'), 'Pausiert');
  I18N.language.setChoice('fr-CA');
  assert.equal(I18N.lang, 'fr-CA');
  assert.equal(events.at(-1), 'fr-CA');
  assert.equal(I18N.T('Score'), 'Pointage');
  I18N.language.setChoice('en-GB');
  assert.equal(I18N.T('Colorblind'), 'Colourblind');
  I18N.language.setChoice('it-IT');
  assert.equal(I18N.T('Pin {id}', { id: 3 }), 'Perno 3');
});

test('Graphics and StarHermit strings cover all nine locales', () => {
  for (const l of LOCALES) assert.ok(GFX_STRINGS[l], l);
  assert.equal(shText('signIn'), 'Sign in with StarHermit');
});
