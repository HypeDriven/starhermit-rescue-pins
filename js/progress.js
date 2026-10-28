// Rescue Pins — the engine client's save model. Pure (no storage, no
// platform) so the engine client (native/platform.ts) and the node tests
// share it.
//
// The engine save (starhermit:storage `saves`, schema 1) is the progression
// document the browser build kept in localStorage (rescue-pins:progression)
// and mirrored to the cloud slot game:<slug> through the JS SDK's saveJSON:
// { v: 1, completed, bestScores, tutorialDone, streakDays, achievements,
//   rescuedTotal, coachDone }, without the browser build's checksum (the
// engine keeps its own integrity). Two saves merge with session.js's
// mergeProgression (unions, best of each side), as the browser build merged
// on its saveconflict. readForeign() reads that old cloud slot's text.
import { hashString, stableStringify } from './rules.js';
import { mergeProgression } from './session.js';

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

export function emptyProgress() {
  return { v: 1, completed: {}, bestScores: {}, tutorialDone: false, streakDays: [], achievements: [], rescuedTotal: 0 };
}

/** A progression document from anything (missing or broken fields from the empty one). */
export function normalize(raw) {
  const d = obj(raw) ? JSON.parse(JSON.stringify(raw)) : {};
  delete d.checksum;
  const out = { ...emptyProgress(), ...d, v: 1 };
  out.completed = obj(out.completed) || {};
  out.bestScores = {};
  for (const [k, v] of Object.entries(obj(d.bestScores) || {})) if (Number.isFinite(v)) out.bestScores[k] = v;
  out.tutorialDone = !!out.tutorialDone;
  out.streakDays = Array.isArray(out.streakDays) ? out.streakDays.filter((n) => Number.isInteger(n)) : [];
  out.achievements = Array.isArray(out.achievements) ? out.achievements.filter((a) => typeof a === 'string') : [];
  out.rescuedTotal = Number.isFinite(out.rescuedTotal) ? out.rescuedTotal | 0 : 0;
  if (out.coachDone) out.coachDone = true; else delete out.coachDone;
  return out;
}

/** Merge two saves (this device's and another device's / the old cloud slot's). */
export function mergeSave(remote, local) {
  return normalize(mergeProgression(normalize(local), normalize(remote)));
}

export function sameSave(a, b) {
  return stableStringify(normalize(a)) === stableStringify(normalize(b));
}

/**
 * The browser build's cloud slot text (platform.js queueCloudSave: the
 * progression document with its FNV checksum): the progression, or null when
 * it is not one (a broken checksum is refused, as platform.js validateDoc did).
 */
export function readForeign(text) {
  if (typeof text !== 'string' || !text) return null;
  try {
    const doc = JSON.parse(text);
    if (!obj(doc) || doc.v !== 1) return null;
    if (doc.checksum !== hashString(stableStringify({ ...doc, checksum: undefined }))) return null;
    return normalize(doc);
  } catch { return null; }
}

/**
 * The game's own options (engine `settings`, synced with the account) and the
 * browser build's settings KV keys they came from (platform.js SETTING_KEYS:
 * audio, graphics, controls, captions, tutorialDone). Volumes, mute, graphics
 * quality, reduced motion, high contrast and larger text are the runtime's
 * Options now; the castle palette, captions and the left-handed tray stay the
 * game's.
 */
export const DEFAULT_OPTIONS = { palette: 'default', captions: true, leftHanded: false };
export const OPTION_KEYS = Object.keys(DEFAULT_OPTIONS);
export const BROWSER_KEYS = ['audio', 'graphics', 'controls', 'captions', 'tutorialDone'];
export const PALETTES = ['default', 'colorblind', 'highcontrast'];

/** Valid option values from anything. */
export function pickOptions(raw) {
  const r = obj(raw) || {};
  const out = {};
  if (PALETTES.includes(r.palette)) out.palette = r.palette;
  if (typeof r.captions === 'boolean') out.captions = r.captions;
  if (typeof r.leftHanded === 'boolean') out.leftHanded = r.leftHanded;
  return out;
}

/** The browser build's settings KV (key → value) as { options, tutorialDone }. */
export function readLegacySettings(kv) {
  const k = obj(kv) || {};
  const options = pickOptions({
    palette: obj(k.graphics)?.palette,
    captions: k.captions,
    leftHanded: obj(k.controls)?.leftHanded,
  });
  return { options, tutorialDone: k.tutorialDone === true };
}
