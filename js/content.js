// Rescue Pins — versioned content: tutorial, journey (40 stages, 5 themes),
// daily generator, and an offline validator. Browser + Node.

import { CONTENT_VERSION, makeStreams, mulberry32, solveLevel, createInitialState,
         applyCommand, hashState, legalActions } from './rules.js';

export { CONTENT_VERSION };

export const THEMES = [
  // dark skies + pale stone: the castle must read as a bright cutaway against
  // the backdrop, and chamber contents against the stone (design pillar 1).
  { id: 'emerald-keep',   name: 'Emerald Keep',   sky: 0x0d1f16, stone: 0x9aa892, accent: 0x7fe0a8 },
  { id: 'amber-spires',   name: 'Amber Spires',   sky: 0x1f150c, stone: 0xb59a7a, accent: 0xffc46b },
  { id: 'frost-halls',    name: 'Frost Halls',    sky: 0x0d1620, stone: 0x94a8b8, accent: 0x9fd8ff },
  { id: 'ember-depths',   name: 'Ember Depths',   sky: 0x1a0d0d, stone: 0xa88478, accent: 0xff9a6b },
  { id: 'moonlit-towers', name: 'Moonlit Towers', sky: 0x120d20, stone: 0x9a90b8, accent: 0xc4a8ff },
];

// ---------- level helpers ----------
function pin(id, a, b) { return { id, a, b }; }
function V(c, r) { return [c, r]; }

// ---------- tutorial: one rule at a time, each requires performing the action ----------
function tutorialLevels() {
  return [
    {
      id: 'tut-1', title: 'Pull a pin', theme: THEMES[0].id,
      text: 'Water rescues the villager. Pull the brass pin to let the water fall.',
      level: {
        id: 'tut-1', seed: 101, contentVersion: CONTENT_VERSION, theme: THEMES[0].id, cols: 1, rows: 2, par: 1,
        chambers: { '0,0': { water: 1 }, '0,1': { hero: 1 } },
        pins: [pin('p1', V(0, 0), V(0, 1))],
      },
      mustPull: ['p1'],
    },
    {
      id: 'tut-2', title: 'Keep lava away', theme: THEMES[0].id,
      text: 'Lava is deadly. Route water to the villager while the lava stays sealed above.',
      level: {
        id: 'tut-2', seed: 102, contentVersion: CONTENT_VERSION, theme: THEMES[0].id, cols: 2, rows: 3, par: 2,
        chambers: { '0,0': { water: 2 }, '1,0': { lava: 1 }, '1,2': { hero: 1 } },
        pins: [
          pin('pa', V(0, 0), V(0, 1)), // release water down the left shaft
          pin('pb', V(0, 2), V(1, 2)), // let water flow to the villager
          pin('pc', V(1, 0), V(1, 1)), // lava seal — never pull
          pin('pd', V(1, 1), V(1, 2)), // lava seal — never pull
          pin('pe', V(0, 1), V(1, 1)), // keeps water in the left shaft
        ],
      },
      mustPull: ['pa', 'pb'],
    },
    {
      id: 'tut-3', title: 'Steam safety', theme: THEMES[1].id,
      text: 'Water and lava neutralize into harmless steam. Drop the water onto the lava first — never the other way round.',
      level: {
        id: 'tut-3', seed: 103, contentVersion: CONTENT_VERSION, theme: THEMES[1].id, cols: 1, rows: 3, par: 2,
        chambers: { '0,0': { water: 3 }, '0,1': { lava: 2 }, '0,2': { hero: 1 } },
        pins: [
          pin('pa', V(0, 0), V(0, 1)), // water meets lava -> steam, spare water remains
          pin('pb', V(0, 1), V(0, 2)), // pulling this first drops lava on the villager!
        ],
      },
      mustPull: ['pa', 'pb'],
    },
    {
      id: 'tut-4', title: 'Two villagers', theme: THEMES[1].id,
      text: 'Every villager must be rescued. Share the water between both shafts.',
      level: {
        id: 'tut-4', seed: 104, contentVersion: CONTENT_VERSION, theme: THEMES[1].id, cols: 2, rows: 2, par: 2,
        chambers: { '0,0': { water: 2 }, '0,1': { hero: 1 }, '1,1': { hero: 1 } },
        pins: [
          pin('pa', V(0, 0), V(0, 1)),
          pin('pb', V(0, 0), V(1, 0)),
          pin('pc', V(0, 1), V(1, 1)),
        ],
      },
      mustPull: ['pa', 'pc'],
    },
    {
      id: 'tut-5', title: 'Mastery drill', theme: THEMES[2].id,
      text: 'Combine everything: neutralize the lava first, then send water down.',
      level: {
        id: 'tut-5', seed: 105, contentVersion: CONTENT_VERSION, theme: THEMES[2].id, cols: 2, rows: 3, par: 3,
        chambers: { '1,0': { water: 4 }, '1,1': { lava: 2 }, '0,2': { hero: 1 } },
        pins: [
          pin('pa', V(1, 0), V(1, 1)), // water meets lava -> steam, spare water remains
          pin('pb', V(1, 1), V(1, 2)), // pulling first drops lava toward the villager
          pin('pc', V(0, 2), V(1, 2)), // lets the water flow left to the villager
          pin('pd', V(0, 0), V(0, 1)), // decoy: empty shaft
          pin('pe', V(0, 1), V(0, 2)), // decoy: empty shaft
          pin('pf', V(0, 0), V(1, 0)), // seals the water into the right shaft
          pin('pg', V(0, 1), V(1, 1)), // seals the lava into the right shaft
        ],
      },
      mustPull: ['pa', 'pb', 'pc'],
    },
  ];
}

// ---------- journey generator (deterministic, solver-verified) ----------
// Layout recipe per stage index: params grow difficulty; layouts that fail
// validation are re-rolled with the next sub-seed (bounded, deterministic).
function journeyParams(i) {
  const tier = Math.floor(i / 8);       // 0..4 -> theme
  const j = i % 8;
  return {
    tier, j,
    theme: THEMES[tier].id,
    cols: 1 + Math.min(2, Math.floor((i + 2) / 6)),       // 1 -> 2 -> 3
    rows: Math.min(5, 3 + Math.floor(i / 10)),            // 3 -> 5
    heroes: i >= 24 ? 2 : 1,
    water: 1 + Math.min(3, Math.floor(i / 8) + (j % 2)),  // 1..4
    lava: i < 6 ? 0 : Math.min(3, 1 + Math.floor((i - 6) / 10)), // introduced at stage 7
    mastery: j === 7,                                     // last stage of a theme tests mastery
    challenge: j === 5,                                   // move-limit challenge variant
  };
}

function tryBuildLevel(id, seed, p, variant) {
  const rng = mulberry32((seed ^ Math.imul((variant | 0) + 1, 0x9e3779b1)) >>> 0);
  const { cols, rows } = p;
  const chambers = {};
  const pins = [];
  let pinN = 0;
  const pid = () => 'p' + (++pinN);

  // heroes on the bottom row
  const heroCols = [];
  while (heroCols.length < Math.min(p.heroes, cols)) {
    const c = Math.floor(rng() * cols);
    if (!heroCols.includes(c)) heroCols.push(c);
  }
  for (const c of heroCols) chambers[c + ',' + (rows - 1)] = { hero: 1 };

  // water in top chambers of distinct columns where possible
  let waterLeft = p.water;
  const waterCols = [];
  let guard = 0;
  while (waterLeft > 0 && guard++ < 40) {
    const c = Math.floor(rng() * cols);
    if (waterCols.length < cols && !waterCols.includes(c)) waterCols.push(c);
    const wc = waterCols[waterCols.length - 1];
    const key = wc + ',0';
    chambers[key] = chambers[key] || {};
    chambers[key].water = (chambers[key].water || 0) + 1;
    waterLeft--;
  }

  // lava in upper/mid chambers, never on a hero or on water
  let lavaLeft = p.lava;
  guard = 0;
  while (lavaLeft > 0 && guard++ < 60) {
    const c = Math.floor(rng() * cols);
    const r = Math.floor(rng() * Math.max(1, rows - 2));
    const key = c + ',' + r;
    const cell = chambers[key] = chambers[key] || {};
    if (cell.hero || cell.water) continue;
    cell.lava = (cell.lava || 0) + 1;
    lavaLeft--;
  }

  // Pin only load-bearing passages: every chamber holding water/lava/hero that
  // is not on the bottom row rests on a pin (visual + physical plausibility),
  // plus a few horizontal connectors and decoys. Keeps pin counts small so the
  // solver's search space stays bounded.
  const pinSet = new Set();
  const addPin = (a, b) => {
    const k = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? a + ';' + b : b + ';' + a;
    if (!pinSet.has(k)) { pinSet.add(k); pins.push(pin(pid(), a, b)); }
  };
  for (const [key, cell] of Object.entries(chambers)) {
    const [c, r] = key.split(',').map(Number);
    if (!(cell.water || cell.lava || cell.hero)) continue;
    if (r < rows - 1) addPin(V(c, r), V(c, r + 1));
    // horizontal connector candidates where sideways flow would matter
    if (c < cols - 1 && rng() < 0.45) addPin(V(c, r), V(c + 1, r));
  }
  // ensure at least one bottom-row horizontal pin exists for multi-column levels
  if (cols > 1) {
    const hc = heroCols[0];
    const nc = hc > 0 ? hc - 1 : hc + 1;
    if (rng() < 0.8) addPin(V(hc, rows - 1), V(nc, rows - 1));
  }
  // 1-2 decoy pins on empty passages (misdirection for harder tiers)
  const decoys = p.tier >= 2 ? 2 : p.tier >= 1 ? 1 : 0;
  for (let d = 0; d < decoys; d++) {
    const c = Math.floor(rng() * cols), r = Math.floor(rng() * (rows - 1));
    addPin(V(c, r), V(c, r + 1));
  }

  const level = {
    id, seed, cols, rows, chambers, pins,
    contentVersion: CONTENT_VERSION,
    theme: p.theme,
  };
  if (p.challenge) level.moveLimit = 0; // set after par is known
  return level;
}

function hasRisk(level, solutionLen) {
  // a real puzzle: at least one plausible wrong order fails to win
  const rng = mulberry32(level.seed ^ 0x5bd1e995);
  const pinIds = level.pins.map(p => p.id);
  for (let t = 0; t < 8; t++) {
    const order = pinIds.slice();
    for (let k = order.length - 1; k > 0; k--) {
      const m = Math.floor(rng() * (k + 1));
      [order[k], order[m]] = [order[m], order[k]];
    }
    let s = createInitialState(level, makeStreams(level.seed));
    for (const pid of order) {
      if (s.status !== 'active') break;
      s = applyCommand(s, { type: 'pull', pinId: pid }).state;
    }
    if (s.status !== 'won') return true;
  }
  return false;
}

function buildJourneyStage(i) {
  const p = journeyParams(i);
  const baseSeed = 1000 + i * 7919;
  let best = null;
  for (let attempt = 0; attempt < 150; attempt++) {
    const level = tryBuildLevel('journey-' + (i + 1), baseSeed >>> 0, p, attempt);
    if (level.pins.length > 9) continue;
    const res = solveLevel(level);
    if (!res.solvable) continue;
    level.par = res.solution.length;
    if (p.challenge) level.moveLimit = level.par; // move-limit challenge variant
    // harder tiers must punish careless orders
    if (i >= 16 && !hasRisk(level, res.solution.length)) continue;
    best = { level, solution: res.solution };
    break;
  }
  if (!best) throw new Error('failed to generate stage ' + (i + 1));
  best.level.name = THEMES[p.tier].name + ' ' + (p.j + 1);
  best.level.difficulty = {
    tier: p.tier,
    depth: best.level.par,
    branching: best.level.pins.length,
    mastery: p.mastery,
    challenge: !!p.challenge,
  };
  return best.level;
}

let _journey = null;
export function getJourney() {
  if (!_journey) {
    _journey = [];
    for (let i = 0; i < 40; i++) _journey.push(buildJourneyStage(i));
  }
  return _journey;
}

let _tutorial = null;
export function getTutorial() {
  if (!_tutorial) _tutorial = tutorialLevels();
  return _tutorial;
}

// ---------- daily challenge: immutable per UTC day ----------
export function dailySeedForDate(date) {
  const d = date ? new Date(date) : new Date();
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
}

export function getDailyLevel(daySeed) {
  const seed = (daySeed === undefined ? dailySeedForDate() : daySeed) >>> 0;
  const rng = mulberry32(seed ^ 0x27d4eb2f);
  // rotate through themes and mid-to-high difficulty params
  const tier = Math.floor(rng() * 5);
  const p = {
    tier, theme: THEMES[tier].id,
    cols: 2 + Math.floor(rng() * 2),
    rows: 4 + Math.floor(rng() * 2),
    heroes: rng() < 0.4 ? 2 : 1,
    water: 2 + Math.floor(rng() * 3),
    lava: 1 + Math.floor(rng() * 3),
    mastery: false, challenge: rng() < 0.3,
  };
  for (let attempt = 0; attempt < 120; attempt++) {
    const level = tryBuildLevel('daily-' + seed, seed, p, attempt);
    if (level.pins.length > 9) continue;
    const res = solveLevel(level);
    if (!res.solvable) continue;
    level.par = res.solution.length;
    if (p.challenge) level.moveLimit = level.par;
    level.name = 'Daily ' + new Date(seed * 86400000).toISOString().slice(0, 10);
    level.daily = seed;
    level.difficulty = { tier, depth: level.par, branching: level.pins.length, mastery: false, challenge: !!p.challenge };
    return level;
  }
  // defective days are excluded from ranking, never silently replaced
  return { id: 'daily-' + seed, excluded: true, name: 'Daily (excluded)', seed, contentVersion: CONTENT_VERSION };
}

// ---------- offline validator ----------
export function validateLevel(level) {
  const errors = [];
  if (!level || typeof level !== 'object') return { ok: false, errors: ['not-an-object'] };
  if (level.excluded) return { ok: true, errors: [], excluded: true };
  if (!level.id) errors.push('missing-id');
  if (!Number.isInteger(level.cols) || level.cols < 1 || level.cols > 5) errors.push('bad-cols');
  if (!Number.isInteger(level.rows) || level.rows < 2 || level.rows > 7) errors.push('bad-rows');
  if (!Number.isInteger(level.seed)) errors.push('bad-seed');
  if (level.contentVersion !== CONTENT_VERSION) errors.push('stale-content-version');
  if (!THEMES.some(t => t.id === level.theme)) errors.push('unknown-theme');
  if (!level.chambers || typeof level.chambers !== 'object') errors.push('missing-chambers');
  if (!Array.isArray(level.pins)) errors.push('missing-pins');
  if (errors.length) return { ok: false, errors };

  // structural checks
  let heroes = 0;
  const seen = new Set();
  for (const [key, cell] of Object.entries(level.chambers)) {
    const [c, r] = key.split(',').map(Number);
    if (!(c >= 0 && c < level.cols && r >= 0 && r < level.rows)) { errors.push('chamber-out-of-bounds:' + key); continue; }
    if (seen.has(key)) errors.push('duplicate-chamber:' + key);
    seen.add(key);
    for (const k of ['water', 'lava']) {
      if (cell[k] !== undefined && (!Number.isInteger(cell[k]) || cell[k] < 0 || cell[k] > 9)) errors.push('bad-cell-value:' + key);
    }
    if (cell.hero) heroes++;
    if (cell.hero && cell.lava) errors.push('hero-in-lava:' + key);
  }
  if (heroes === 0) errors.push('no-hero');
  const pinIds = new Set();
  for (const p of level.pins) {
    if (!p.id || pinIds.has(p.id)) { errors.push('bad-pin-id'); continue; }
    pinIds.add(p.id);
    const ok = [p.a, p.b].every(v => Array.isArray(v) && v.length === 2 &&
      v[0] >= 0 && v[0] < level.cols && v[1] >= 0 && v[1] < level.rows);
    if (!ok) { errors.push('pin-out-of-bounds:' + p.id); continue; }
    const dc = Math.abs(p.a[0] - p.b[0]), dr = Math.abs(p.a[1] - p.b[1]);
    if (dc + dr !== 1) errors.push('pin-not-adjacent:' + p.id);
  }
  if (level.pins.length > 9) errors.push('too-many-pins'); // bounded duration
  if (errors.length) return { ok: false, errors };

  // initial state must be physically plausible: every content cell above the
  // bottom row must rest on a pin (nothing may float before the first pull)
  for (const [key, cell] of Object.entries(level.chambers)) {
    const [c, r] = key.split(',').map(Number);
    if (!(cell.water || cell.lava || cell.hero) || r >= level.rows - 1) continue;
    const supported = level.pins.some(p =>
      (p.a[0] === c && p.a[1] === r && p.b[0] === c && p.b[1] === r + 1) ||
      (p.b[0] === c && p.b[1] === r && p.a[0] === c && p.a[1] === r + 1));
    if (!supported) errors.push('floating-content:' + key);
  }

  // reachability + no soft lock: a winning pull order must exist
  const res = solveLevel(level);
  if (!res.solvable) { errors.push('unsolvable:' + (res.reason || '')); return { ok: false, errors }; }
  if (!Number.isInteger(level.par) || level.par < 1) errors.push('bad-par');

  // solution replay must win (guards against solver/content drift)
  let s = createInitialState(level, makeStreams(level.seed));
  for (const pid of res.solution) s = applyCommand(s, { type: 'pull', pinId: pid }).state;
  if (s.status !== 'won') errors.push('solution-does-not-win');
  if (level.moveLimit && res.solution.length > level.moveLimit) errors.push('solution-exceeds-move-limit');

  return { ok: errors.length === 0, errors, solution: res.solution, par: res.solution.length };
}

// ---------- lookup ----------
export function findLevel(id) {
  for (const t of getTutorial()) if (t.level.id === id) return t.level;
  for (const l of getJourney()) if (l.id === id) return l;
  if (typeof id === 'string' && id.startsWith('daily-')) {
    return getDailyLevel(parseInt(id.slice(6), 10));
  }
  return null;
}
