import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPreset, resolve, presetTier, describe, choosePreset, setOverride, PRESETS, CATEGORIES } from '../js/gfx.js';
import { GFX_STRINGS, pickLocale } from '../js/gfx-i18n.js';

test('detectPreset maps GPU strings to presets', () => {
  assert.equal(detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'low');
  assert.equal(detectPreset('llvmpipe (LLVM 15.0.7, 256 bits)'), 'low');
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)'), 'high');
  assert.equal(detectPreset('Apple M2'), 'high');
  assert.equal(detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'), 'balanced');
  assert.equal(detectPreset('Adreno (TM) 650'), 'balanced');
  assert.equal(detectPreset(''), 'balanced');
  // touch/mobile devices cap Auto at balanced
  assert.equal(detectPreset('Apple M2', true), 'balanced');
  assert.equal(detectPreset('SwiftShader', true), 'low');
});

test('resolve: auto follows the detected preset, explicit preset wins', () => {
  const a = resolve({}, 'low');
  assert.equal(a.preset, 'low');
  assert.equal(a.auto, true);
  assert.equal(a.post, false, 'low preset renders without post-processing');
  assert.equal(a.shadows, 'off');
  const h = resolve({ preset: 'high' }, 'low');
  assert.equal(h.preset, 'high');
  assert.equal(h.auto, false);
  assert.equal(h.shadows, presetTier('high', 'shadows'));
  assert.equal(h.post, true);
  for (const p of PRESETS) {
    const r = resolve({ preset: p });
    for (const [cat, tiers] of Object.entries(CATEGORIES)) assert.ok(tiers.includes(r[cat]), `${p}.${cat}`);
  }
});

test('resolve: overrides and render-scale clamp', () => {
  const r = resolve({ preset: 'high', bloom: 'off', shadows: 'high', particles: 'bogus', render_scale: 5 }, 'low');
  assert.equal(r.bloom, 'off');
  assert.equal(r.shadows, 'high');
  assert.equal(r.particles, presetTier('high', 'particles'), 'unknown tier falls back to preset');
  assert.equal(r.renderScale, 2);
  assert.equal(resolve({ render_scale: 0.1 }, 'low').renderScale, 0.5);
  assert.equal(resolve({ preset: 'ultra', render_scale: 1 }).scale, 1.25);
  const low = resolve({ preset: 'low', antialias: 'fxaa' });
  assert.equal(low.post, true, 'an FXAA override turns the post chain on');
  assert.equal(resolve({ adaptive: false }).adaptive, false);
  assert.equal(resolve({}).adaptive, true);
  assert.equal(resolve({ show_fps: true }).showFps, true);
});

test('choosing a preset clears overrides but keeps scale/adaptive/fps', () => {
  let s = { preset: 'high', bloom: 'off', ao: 'high', render_scale: 1.5, adaptive: false, show_fps: true };
  s = choosePreset(s, 'low');
  assert.deepEqual(s, { preset: 'low', render_scale: 1.5, adaptive: false, show_fps: true });
  assert.equal(choosePreset(s, 'auto').preset, 'auto');
  s = setOverride(s, 'bloom', 'on');
  assert.equal(s.bloom, 'on');
  s = setOverride(s, 'bloom', 'preset');
  assert.equal('bloom' in s, false);
});

test('describe summarises cost and pixels', () => {
  const d = describe(resolve({ preset: 'high' }), [1280, 800]);
  assert.match(d, /2048² shadows/);
  assert.match(d, /SMAA/);
  assert.match(d, /1280×800 px$/);
  assert.match(describe(resolve({ preset: 'low' })), /no shadows/);
});

test('graphics strings exist for every required locale', () => {
  const required = ['en-US', 'en-GB', 'es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT'];
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, p + k + '.') : [p + k])).sort();
  const en = keys(GFX_STRINGS['en-US']);
  for (const loc of required) {
    assert.ok(GFX_STRINGS[loc], loc);
    assert.deepEqual(keys(GFX_STRINGS[loc]), en, `${loc} has every key`);
    for (const cat of Object.keys(CATEGORIES)) assert.ok(GFX_STRINGS[loc].cat[cat], `${loc} cat ${cat}`);
  }
  assert.equal(pickLocale('de'), 'de-DE');
  assert.equal(pickLocale('en-GB'), 'en-GB');
  assert.equal(pickLocale('es-MX'), 'es-419');
  assert.equal(pickLocale('fr-CA'), 'fr-CA');
  assert.equal(pickLocale('xx'), 'en-US');
});
