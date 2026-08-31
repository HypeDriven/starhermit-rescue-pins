// Rescue Pins — session/state machine, command log, undo, replay envelope,
// versioned+checksummed persistence. Browser + Node (storage injectable).

import { createInitialState, applyCommand, legalActions, explainIllegal, isTerminal,
         scoreBreakdown, serialize, deserialize, hashState, makeStreams,
         stableStringify, hashString, RULES_VERSION } from './rules.js';
import { CONTENT_VERSION } from './content.js';

export const REPLAY_SCHEMA_VERSION = 1;
export const SAVE_VERSION = 1;

// screens: boot → title → mode-select → preparing → tutorial/countdown →
//          active ↔ paused → resolving → results → progression
export const SCREENS = ['boot', 'title', 'mode-select', 'preparing', 'countdown',
                        'tutorial', 'active', 'paused', 'resolving', 'results', 'progression'];

const memoryStorage = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};

export function defaultStorage() {
  try { if (typeof localStorage !== 'undefined') return localStorage; } catch { /* denied */ }
  return memoryStorage();
}

export function createSession(opts) {
  const storage = opts.storage || defaultStorage();
  const streams = makeStreams((opts.level.seed ?? 0) >>> 0);
  const session = {
    id: 's-' + hashString(String(opts.level.seed) + '-' + (opts.now || 0) + '-' + Math.floor((streams.av() * 1e9))),
    screen: 'boot',
    screenReason: 'init',
    mode: opts.mode || 'journey', // tutorial | journey | daily | practice
    level: opts.level,
    practice: !!opts.practice,
    allowUndo: !!opts.practice || opts.mode === 'practice' || opts.mode === 'tutorial',
    state: createInitialState(opts.level, streams),
    initialHash: null,
    commandLog: [],       // [{ id, cmd, hashAfter }]
    seenCommandIds: new Set(),
    invalidCount: 0,
    lastEvents: [],
    startedAt: opts.now || Date.now(),
    elapsedMs: 0,
  };
  session.initialHash = hashState(session.state);

  function transition(to, reason) {
    if (!SCREENS.includes(to)) throw new Error('bad-screen:' + to);
    session.screen = to;
    session.screenReason = reason;
  }

  function dispatch(cmd) {
    // idempotent duplicate rejection by command id
    if (!cmd || typeof cmd.id !== 'string' || cmd.id.length === 0 || cmd.id.length > 64) {
      return { ok: false, error: 'bad-command-id' };
    }
    if (session.seenCommandIds.has(cmd.id)) return { ok: false, error: 'duplicate-command', duplicate: true };
    const why = explainIllegal(session.state, cmd);
    if (why) {
      session.seenCommandIds.add(cmd.id);
      session.invalidCount++;
      const res = applyCommand(session.state, cmd); // counts invalid, keeps state coherent
      session.state = res.state;
      return { ok: false, error: why };
    }
    const res = applyCommand(session.state, cmd);
    session.state = res.state;
    session.seenCommandIds.add(cmd.id);
    session.commandLog.push({ id: cmd.id, cmd: { type: cmd.type, pinId: cmd.pinId }, hashAfter: hashState(res.state) });
    session.lastEvents = res.events;
    const term = isTerminal(session.state);
    if (term.done) transition('resolving', term.reason);
    return { ok: true, events: res.events, terminal: term };
  }

  // practice/tutorial undo: rebuild deterministically from the initial state
  function undo() {
    if (!session.allowUndo) return { ok: false, error: 'undo-not-allowed' };
    if (session.screen !== 'active' && session.screen !== 'tutorial') return { ok: false, error: 'undo-wrong-screen' };
    const last = session.commandLog.pop();
    if (!last) return { ok: false, error: 'nothing-to-undo' };
    session.seenCommandIds.delete(last.id);
    let s = createInitialState(session.level, streams);
    for (const entry of session.commandLog) s = applyCommand(s, entry.cmd).state;
    session.state = s;
    session.lastEvents = [{ type: 'undo' }];
    return { ok: true };
  }

  function restart() {
    session.state = createInitialState(session.level, makeStreams(session.level.seed >>> 0));
    session.commandLog = [];
    session.seenCommandIds = new Set();
    session.invalidCount = 0;
    session.lastEvents = [];
    session.initialHash = hashState(session.state);
    transition('preparing', 'restart');
  }

  function replayEnvelope() {
    const term = isTerminal(session.state);
    return {
      schemaVersion: REPLAY_SCHEMA_VERSION,
      rulesVersion: RULES_VERSION,
      contentVersion: CONTENT_VERSION,
      levelId: session.level.id,
      seed: session.level.seed >>> 0,
      initialHash: session.initialHash,
      startedAt: session.startedAt,
      elapsedMs: session.elapsedMs | 0,
      commands: session.commandLog.map(e => ({ id: e.id, type: e.cmd.type, pinId: e.cmd.pinId, hashAfter: e.hashAfter })),
      finalHash: hashState(session.state),
      terminal: { status: session.state.status, reason: session.state.reason },
      scoreBreakdown: scoreBreakdown(session.state),
      won: term.won,
    };
  }

  // authoritative replay verification (also used server-side)
  function verifyReplay(envelope, level) {
    if (!envelope || envelope.schemaVersion !== REPLAY_SCHEMA_VERSION) return { valid: false, error: 'bad-schema-version' };
    if (envelope.contentVersion !== CONTENT_VERSION) return { valid: false, error: 'stale-content-version' };
    if (!level || level.excluded) return { valid: false, error: 'unknown-or-excluded-level' };
    if ((level.seed >>> 0) !== (envelope.seed >>> 0)) return { valid: false, error: 'seed-mismatch' };
    let s = createInitialState(level, makeStreams(level.seed >>> 0));
    if (hashState(s) !== envelope.initialHash) return { valid: false, error: 'initial-hash-mismatch' };
    const seen = new Set();
    const cmds = Array.isArray(envelope.commands) ? envelope.commands : [];
    if (cmds.length > 200) return { valid: false, error: 'too-many-commands' };
    for (const c of cmds) {
      if (!c || typeof c.id !== 'string' || seen.has(c.id)) return { valid: false, error: 'bad-or-duplicate-command-id' };
      seen.add(c.id);
      const res = applyCommand(s, { type: c.type, pinId: c.pinId });
      if (res.error) return { valid: false, error: 'illegal-command:' + res.error };
      s = res.state;
      if (c.hashAfter && c.hashAfter !== hashState(s)) return { valid: false, error: 'state-hash-mismatch' };
    }
    if (hashState(s) !== envelope.finalHash) return { valid: false, error: 'final-hash-mismatch' };
    const score = scoreBreakdown(s);
    const claimed = envelope.scoreBreakdown || {};
    if ((claimed.total | 0) !== score.total) return { valid: false, error: 'score-mismatch' };
    return { valid: true, score, won: s.status === 'won', terminal: { status: s.status, reason: s.reason } };
  }

  // versioned + checksummed persistence
  function saveSnapshot(key) {
    const doc = {
      v: SAVE_VERSION,
      savedAt: Date.now(),
      levelId: session.level.id,
      mode: session.mode,
      screen: session.screen,
      commandLog: session.commandLog,
      initialHash: session.initialHash,
      stateJson: serialize(session.state),
    };
    doc.checksum = hashString(stableStringify({ ...doc, checksum: undefined }));
    storage.setItem(key, JSON.stringify(doc));
    return doc.checksum;
  }

  function loadSnapshot(key, levelResolver) {
    const raw = storage.getItem(key);
    if (!raw) return null;
    let doc;
    try { doc = JSON.parse(raw); } catch { return null; }
    if (!doc || doc.v > SAVE_VERSION) return null;
    if (doc.checksum !== hashString(stableStringify({ ...doc, checksum: undefined }))) return null; // tampered/corrupt
    if (doc.v < SAVE_VERSION) doc.commandLog = doc.commandLog || [];
    const level = levelResolver ? levelResolver(doc.levelId) : null;
    if (!level) return null;
    session.level = level;
    session.state = deserialize(doc.stateJson);
    session.commandLog = doc.commandLog;
    session.seenCommandIds = new Set(doc.commandLog.map(e => e.id));
    session.mode = doc.mode || session.mode;
    transition(doc.screen === 'active' ? 'paused' : session.screen, 'resumed-from-snapshot');
    return doc;
  }

  return {
    session, transition, dispatch, undo, restart,
    replayEnvelope, verifyReplay, saveSnapshot, loadSnapshot,
    legalActions: () => legalActions(session.state),
    isTerminal: () => isTerminal(session.state),
    score: () => scoreBreakdown(session.state),
    storage,
  };
}

// settings persistence (versioned, checksummed)
export const DEFAULT_SETTINGS = {
  v: 1,
  audio: { music: 0.5, effects: 0.8, ambience: 0.4, muted: false },
  graphics: { tier: 'auto', reducedMotion: false, highContrast: false, palette: 'default', textSize: 'normal' },
  controls: { leftHanded: false, holdConfirm: false },
  tutorialDone: false,
  captions: true,
};

export function loadSettings(storage) {
  try {
    const raw = (storage || defaultStorage()).getItem('rescue-pins:settings');
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const doc = JSON.parse(raw);
    if (doc.checksum !== hashString(stableStringify({ ...doc, checksum: undefined }))) return structuredClone(DEFAULT_SETTINGS);
    const { checksum, ...data } = doc;
    return { ...structuredClone(DEFAULT_SETTINGS), ...data, audio: { ...DEFAULT_SETTINGS.audio, ...(data.audio || {}) },
             graphics: { ...DEFAULT_SETTINGS.graphics, ...(data.graphics || {}) },
             controls: { ...DEFAULT_SETTINGS.controls, ...(data.controls || {}) } };
  } catch { return structuredClone(DEFAULT_SETTINGS); }
}

export function saveSettings(settings, storage) {
  const doc = { ...settings, v: 1 };
  doc.checksum = hashString(stableStringify({ ...doc, checksum: undefined }));
  (storage || defaultStorage()).setItem('rescue-pins:settings', JSON.stringify(doc));
}

export function loadProgression(storage) {
  try {
    const raw = (storage || defaultStorage()).getItem('rescue-pins:progression');
    if (!raw) return { v: 1, completed: {}, bestScores: {}, tutorialDone: false, streakDays: [] };
    const doc = JSON.parse(raw);
    if (doc.checksum !== hashString(stableStringify({ ...doc, checksum: undefined }))) throw new Error('bad');
    const { checksum, ...data } = doc;
    return { v: 1, completed: {}, bestScores: {}, tutorialDone: false, streakDays: [], ...data };
  } catch { return { v: 1, completed: {}, bestScores: {}, tutorialDone: false, streakDays: [] }; }
}

export function saveProgression(prog, storage) {
  const doc = { ...prog, v: 1 };
  doc.checksum = hashString(stableStringify({ ...doc, checksum: undefined }));
  (storage || defaultStorage()).setItem('rescue-pins:progression', JSON.stringify(doc));
}
