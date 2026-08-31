// Rescue Pins — deterministic rules engine. No DOM, no THREE. Browser + Node.

export const RULES_VERSION = 1;
export const CONTENT_VERSION = 1;

// ---------- seeded RNG (mulberry32) ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeStreams(seed) {
  // separate streams so cosmetic randomness can never perturb rules
  return {
    rules: mulberry32((seed ^ 0x9E3779B9) >>> 0),
    decor: mulberry32((seed ^ 0x85EBCA6B) >>> 0),
    av: mulberry32((seed ^ 0xC2B2AE35) >>> 0),
  };
}

// ---------- stable hashing (FNV-1a over canonical JSON) ----------
export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function hashState(state) {
  const core = {
    chambers: state.chambers,
    pins: state.pins.map(p => p.id),
    pulled: state.pulledPins.slice().sort(), // canonical: order-independent
    tick: state.tick,
    status: state.status,
    stats: state.stats,
  };
  return hashString(stableStringify(core));
}

// ---------- chamber helpers ----------
export function cellKey(c, r) { return c + ',' + r; }

function emptyCell() { return { water: 0, lava: 0, hero: 0, saved: 0 }; }

// ---------- state creation ----------
// levelDef: { id, seed, cols, rows, chambers: {"c,r": {water,lava,hero}}, pins: [{id,a:[c,r],b:[c,r]}], par }
export function createInitialState(levelDef, streams) {
  if (!levelDef || !Number.isInteger(levelDef.cols) || !Number.isInteger(levelDef.rows)) {
    throw new Error('invalid level definition');
  }
  const chambers = {};
  let heroTotal = 0;
  for (let c = 0; c < levelDef.cols; c++) {
    for (let r = 0; r < levelDef.rows; r++) {
      const src = (levelDef.chambers && levelDef.chambers[cellKey(c, r)]) || {};
      const cell = emptyCell();
      cell.water = src.water | 0;
      cell.lava = src.lava | 0;
      cell.hero = src.hero ? 1 : 0;
      if (cell.hero) heroTotal++;
      chambers[cellKey(c, r)] = cell;
    }
  }
  if (heroTotal === 0) throw new Error('level has no hero');
  const pins = (levelDef.pins || []).map(p => ({ id: String(p.id), a: p.a.slice(), b: p.b.slice() }));
  // rules stream is consumed here only if a level needs rules-side randomness; base game does not.
  void (streams && streams.rules);
  return {
    rulesVersion: RULES_VERSION,
    contentVersion: levelDef.contentVersion ?? CONTENT_VERSION,
    levelId: String(levelDef.id),
    seed: levelDef.seed >>> 0,
    cols: levelDef.cols,
    rows: levelDef.rows,
    par: levelDef.par | 0,
    moveLimit: levelDef.moveLimit | 0,
    chambers,
    pins,
    pulledPins: [],
    tick: 0,
    status: 'active',
    reason: null,
    heroTotal,
    stats: { invalid: 0, neutralized: 0, savedCount: 0, moves: 0 },
  };
}

// ---------- legality ----------
function pinsEqual(p, a, b) {
  return (p.a[0] === a[0] && p.a[1] === a[1] && p.b[0] === b[0] && p.b[1] === b[1]) ||
         (p.a[0] === b[0] && p.a[1] === b[1] && p.b[0] === a[0] && p.b[1] === a[1]);
}

export function isOpen(state, a, b) {
  return !state.pins.some(p => pinsEqual(p, a, b));
}

export function legalActions(state) {
  if (!state || state.status !== 'active') return [];
  return state.pins.map(p => ({ type: 'pull', pinId: p.id }));
}

// Why a command is illegal, or null if legal.
export function explainIllegal(state, cmd) {
  if (!state) return 'no-state';
  if (!cmd || typeof cmd !== 'object') return 'malformed-command';
  if (state.status !== 'active') return 'game-over';
  if (cmd.type !== 'pull') return 'unknown-command-type';
  if (typeof cmd.pinId !== 'string') return 'missing-pin-id';
  if (state.pulledPins.includes(cmd.pinId)) return 'pin-already-pulled';
  if (!state.pins.some(p => p.id === cmd.pinId)) return 'pin-not-found';
  return null;
}

// ---------- flow simulation ----------
// Rule set (documented contract):
//  - Liquids (water, lava) fall down through open vertical passages and equalize
//    sideways through open horizontal passages (integer halves, fixed scan order).
//  - Heroes fall down through open vertical passages; heroes never move sideways.
//  - Water + lava in one chamber neutralize into inert steam (both removed).
//  - A hero sharing a chamber with lava is lost (level lost).
//  - A hero sharing a chamber with water is rescued (hero leaves the board).
//  - Win when every hero is rescued.
function resolveFlow(state, events) {
  const { cols, rows, chambers } = state;
  let iterations = 0;
  let changed = true;
  while (changed && state.status === 'active') {
    if (++iterations > 500) { // bounded: proves no unbounded loops
      state.status = 'lost';
      state.reason = 'simulation-overflow';
      events.push({ type: 'overflow' });
      return;
    }
    changed = false;

    // 1. interactions + neutralization, top-to-bottom, left-to-right
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const cell = chambers[cellKey(c, r)];
        if (cell.water > 0 && cell.lava > 0) {
          const n = Math.min(cell.water, cell.lava);
          cell.water -= n; cell.lava -= n;
          state.stats.neutralized += n;
          events.push({ type: 'neutralize', c, r, amount: n });
          changed = true;
        }
        if (cell.hero && cell.lava > 0) {
          state.status = 'lost';
          state.reason = 'hero-burned';
          events.push({ type: 'lose', c, r });
          return;
        }
        if (cell.hero && cell.water > 0) {
          cell.hero = 0; cell.saved = 1;
          state.stats.savedCount++;
          events.push({ type: 'rescued', c, r });
          changed = true;
          if (state.stats.savedCount >= state.heroTotal) {
            state.status = 'won';
            state.reason = 'all-rescued';
            events.push({ type: 'win' });
            return;
          }
        }
      }
    }

    // 2. gravity, bottom-up so chains settle in one pass
    for (let r = rows - 2; r >= 0; r--) {
      for (let c = 0; c < cols; c++) {
        const from = chambers[cellKey(c, r)];
        const to = chambers[cellKey(c, r + 1)];
        if (!isOpen(state, [c, r], [c, r + 1])) continue;
        if (from.water > 0) { to.water += from.water; from.water = 0; changed = true; }
        if (from.lava > 0) { to.lava += from.lava; from.lava = 0; changed = true; }
        if (from.hero) { to.hero = 1; from.hero = 0; changed = true; events.push({ type: 'hero-fall', c, r: r + 1 }); }
      }
    }

    // 3. sideways equalization of liquids, left-to-right
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        if (!isOpen(state, [c, r], [c + 1, r])) continue;
        const left = chambers[cellKey(c, r)];
        const right = chambers[cellKey(c + 1, r)];
        for (const k of ['water', 'lava']) {
          const diff = left[k] - right[k];
          if (diff > 1) { const m = diff >> 1; left[k] -= m; right[k] += m; changed = true; }
          else if (diff < -1) { const m = (-diff) >> 1; right[k] -= m; left[k] += m; changed = true; }
        }
      }
    }
  }
}

// ---------- command application ----------
// cmd: { id?: string, type: 'pull', pinId: string }
// Returns { state, events, error }. Never mutates the input state.
export function applyCommand(prev, cmd) {
  const state = structuredClone(prev); // deep copy; input state never mutated
  const events = [];
  const why = explainIllegal(state, cmd);
  if (why) {
    state.stats.invalid++;
    return { state, events, error: why };
  }
  state.pins = state.pins.filter(p => p.id !== cmd.pinId);
  state.pulledPins.push(cmd.pinId);
  state.tick++;
  state.stats.moves++;
  events.push({ type: 'pull', pinId: cmd.pinId });
  resolveFlow(state, events);
  if (state.status === 'active' && state.moveLimit > 0 && state.stats.moves >= state.moveLimit) {
    state.status = 'lost';
    state.reason = 'move-limit-exceeded';
    events.push({ type: 'lose', reason: state.reason });
  }
  return { state, events, error: null };
}

// ---------- terminal / scoring ----------
export function isTerminal(state) {
  if (state.status === 'won') return { done: true, won: true, lost: false, reason: state.reason };
  if (state.status === 'lost') return { done: true, won: false, lost: true, reason: state.reason };
  return { done: false, won: false, lost: false, reason: null };
}

export function scoreBreakdown(state) {
  const saved = state.stats.savedCount * 1000;
  const neutralized = state.stats.neutralized * 50;
  const overPar = Math.max(0, state.stats.moves - state.par);
  const underPar = Math.max(0, state.par - state.stats.moves);
  const parBonus = state.status === 'won' ? underPar * 150 : 0;
  const efficiency = state.status === 'won' ? Math.max(0, 300 - overPar * 100 - state.stats.invalid * 25) : 0;
  const invalidPenalty = state.stats.invalid * 25;
  const total = Math.max(0, saved + neutralized + parBonus + efficiency - invalidPenalty);
  return { saved, neutralized, parBonus, efficiency, invalidPenalty, total };
}

// ---------- serialization ----------
export function serialize(state) {
  return JSON.stringify({ v: RULES_VERSION, state });
}

export function deserialize(json) {
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  if (!obj || typeof obj !== 'object' || obj.state === undefined) throw new Error('bad-serialized-state');
  if (obj.v > RULES_VERSION) throw new Error('unsupported-state-version');
  const s = obj.state;
  if (obj.v < RULES_VERSION) s.stats = s.stats || { invalid: 0, neutralized: 0, savedCount: 0, moves: 0 };
  return s;
}

// ---------- solver (used by content validator and hints) ----------
export function solveLevel(levelDef, maxNodes = 60000) {
  const start = createInitialState(levelDef, makeStreams(levelDef.seed >>> 0));
  const seen = new Set([hashState(start)]);
  const queue = [{ state: start, path: [] }];
  let nodes = 0;
  while (queue.length) {
    const { state, path } = queue.shift();
    if (++nodes > maxNodes) return { solvable: false, reason: 'node-budget-exceeded' };
    for (const act of legalActions(state)) {
      const { state: next, error } = applyCommand(state, { type: 'pull', pinId: act.pinId });
      if (error) continue;
      const h = hashState(next);
      if (seen.has(h)) continue;
      seen.add(h);
      const p2 = path.concat(act.pinId);
      if (next.status === 'won') return { solvable: true, solution: p2, nodes };
      if (next.status === 'active') queue.push({ state: next, path: p2 });
    }
  }
  return { solvable: false, reason: 'exhausted' };
}
