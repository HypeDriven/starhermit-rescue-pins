// Rescue Pins — StarHermit platform adapter over the canonical SDK
// (starhermit-sdk.js, loaded as a classic script before the modules;
// globalThis.StarHermit). Browser + Node (no-ops without a launch token).
// The SDK reads the launch fragment (#game_token / #access_token), renews the
// token, resolves profiles, owns the cloud-save slot (game:<slug>), the
// settings KV, controls and leaderboards. This module keeps the game-facing
// API: versioned/checksummed progression doc, sync labels, keyboard bindings.

import { hashString, stableStringify } from './rules.js';

const SH = () => globalThis.StarHermit || null;

/** Keyboard actions (KeyboardEvent.code). Mirrors control.* in starhermit.txt. */
export const DEFAULT_BINDINGS = {
  prev: ['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'],
  next: ['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'],
  pull: ['Enter', 'Space', 'NumpadEnter'],
  pause: ['Escape'],
  undo: ['KeyU'],
  hint: ['KeyH'],
  camera: ['KeyC'],
};

/** Short label for a KeyboardEvent.code. */
export function keyLabel(code) {
  const named = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', NumpadEnter: 'Num Enter' };
  if (named[code]) return named[code];
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Digit(\d)$/.exec(code))) return m[1];
  return code;
}

// settings groups mirrored to the per-player KV (one key each)
const SETTING_KEYS = ['audio', 'graphics', 'controls', 'captions', 'tutorialDone'];

export function createPlatform(opts = {}) {
  const onSync = opts.onSync || (() => {});
  let nickname = null;
  let sync = 'local'; // local | connecting | synced | saving | error
  let sentSettings = {};
  let settingsTimer = null;
  let bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));

  function hosted() { const sh = SH(); return !!(sh && sh.signedIn); }
  function setSync(s) { sync = s; onSync(syncLabel()); }
  function syncLabel() {
    if (!hosted()) return null; // local play: no badge
    switch (sync) {
      case 'synced': return 'Cloud save synced';
      case 'saving': return 'Cloud saving…';
      case 'connecting': return 'Cloud connecting…';
      case 'error': return 'Cloud sync error — local copy safe';
      default: return null;
    }
  }
  function displayName() {
    const sh = SH();
    if (!hosted() || !sh.userId) return null;
    return nickname || ('Player ' + String(sh.userId).slice(0, 8));
  }

  // ---- profile nickname (SDK: nickname, "Player <id>" fallback) ----
  async function fetchProfileName(uid) {
    const sh = SH();
    const p = sh ? await sh.profile(uid).catch(() => null) : null;
    return p ? p.displayName : 'Player ' + String(uid).slice(0, 8);
  }
  async function loadProfile() {
    const sh = SH();
    const p = await sh.profile().catch(() => null);
    nickname = p && p.nickname ? p.nickname : null;
    onSync(syncLabel()); // re-render name slots
  }

  // ---- cloud save (SDK slot; localStorage stays the offline cache) ----
  function docWithChecksum(doc) {
    const out = { ...doc, v: 1 };
    out.checksum = hashString(stableStringify({ ...out, checksum: undefined }));
    return out;
  }
  function validateDoc(doc) {
    try {
      if (!doc || doc.v !== 1) return null;
      if (doc.checksum !== hashString(stableStringify({ ...doc, checksum: undefined }))) return null;
      const { checksum, ...data } = doc;
      return { v: 1, completed: {}, bestScores: {}, tutorialDone: false, streakDays: [],
               achievements: [], rescuedTotal: 0, coachDone: false, ...data };
    } catch { return null; }
  }
  async function loadCloudSave() {
    if (!hosted()) return null;
    const doc = validateDoc(await SH().loadJSON());
    setSync('synced');
    return doc;
  }
  function queueCloudSave(doc) {
    if (!hosted()) return;
    setSync('saving');
    SH().saveJSON(docWithChecksum(doc), 2000);
  }
  function flushCloudSave() {
    if (hosted()) void SH().flushSave(true);
  }

  // ---- settings KV (platform value wins at start; changes patched) ----
  function pick(settings) {
    return Object.fromEntries(SETTING_KEYS.filter((k) => settings[k] !== undefined).map((k) => [k, settings[k]]));
  }
  async function loadSettings(settings) {
    if (!hosted()) return false;
    const remote = await SH().getSettings().catch(() => ({}));
    let changed = false;
    for (const k of SETTING_KEYS) {
      const v = remote ? remote[k] : undefined;
      if (v === undefined || v === null) continue;
      settings[k] = v && typeof v === 'object' && settings[k] && typeof settings[k] === 'object' ? { ...settings[k], ...v } : v;
      changed = true;
    }
    sentSettings = JSON.parse(JSON.stringify(pick(settings)));
    return changed;
  }
  function mirrorSettings(settings) {
    if (!hosted()) return;
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => {
      const now = pick(settings);
      const diff = {};
      for (const [k, v] of Object.entries(now)) if (JSON.stringify(v) !== JSON.stringify(sentSettings[k])) diff[k] = v;
      if (!Object.keys(diff).length) return;
      sentSettings = JSON.parse(JSON.stringify(now));
      void SH().patchSettings(diff);
    }, 600);
  }

  // ---- controls ----
  async function loadBindings() {
    const sh = SH();
    if (sh) bindings = await sh.loadBindings(DEFAULT_BINDINGS).catch(() => bindings);
    return bindings;
  }
  function actionFor(code) {
    for (const [a, codes] of Object.entries(bindings)) if (codes.includes(code)) return a;
    return null;
  }

  // ---- platform leaderboard (read-only; resolve userIds to nicknames) ----
  async function fetchLeaderboardEntries(pageSize) {
    const sh = SH();
    if (!hosted()) return null;
    const info = await sh.getGame();
    let lbId = info && info.leaderboardId;
    if (!lbId) {
      const boards = await sh.leaderboards();
      lbId = boards && boards[0] && boards[0].id;
    }
    if (!lbId) return null; // no platform board: local records only
    const body = await sh.leaderboardEntries(lbId, { page: 1, pageSize: pageSize | 0 || 10 });
    const list = body && Array.isArray(body.items) ? body.items : (body && Array.isArray(body.entries) ? body.entries : []);
    const out = [];
    for (const e of list.slice(0, pageSize)) {
      const uid = e.userId || e.user_id;
      out.push({ name: uid ? await fetchProfileName(uid) : 'Player', score: e.score });
    }
    return out.length ? out : null;
  }

  // ---- leaderboard posting (score-script.js) ----
  // A finished level's total goes through submitScores to the high-score board;
  // resolves { posted, rank } (rank or null). Standalone: no request.
  async function submitScore(total) {
    const sh = SH();
    if (!hosted()) return { posted: false, rank: null };
    let keys = [];
    try { keys = await sh.submitScores({ 'high-score': total }); } catch { keys = []; }
    if (!keys || !keys.includes('high-score')) return { posted: false, rank: null };
    try {
      const r = await sh.leaderboard('high-score', { pageSize: 100 });
      const me = ((r && r.items) || []).find((i) => i.userId === sh.userId);
      return { posted: true, rank: me ? me.rank : null };
    } catch { return { posted: true, rank: null }; }
  }

  function start() {
    const sh = SH();
    if (!sh || typeof window === 'undefined') return;
    sh.init(); // reads + strips the launch fragment; idempotent
    sh.on('saved', (ok) => setSync(ok ? 'synced' : 'error'));
    sh.on('auth', (a) => { if (!a.signedIn) nickname = null; onSync(syncLabel()); if (opts.onAuth) opts.onAuth(a); });
    if (!hosted()) return;
    setSync('connecting');
    void loadProfile();
    window.addEventListener('pagehide', flushCloudSave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushCloudSave(); });
  }

  return {
    start, hosted, displayName, syncLabel,
    loadCloudSave, queueCloudSave, flushCloudSave, fetchLeaderboardEntries, submitScore,
    loadSettings, mirrorSettings, loadBindings, actionFor,
    bindings: () => bindings,
    canSignIn: () => { const sh = SH(); return !!(sh && sh.canSignIn()); },
    signIn: () => { const sh = SH(); return !!(sh && sh.signIn()); },
    inviteLink: () => (hosted() ? SH().inviteLink() : null),
  };
}
