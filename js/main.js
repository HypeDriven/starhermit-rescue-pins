// Rescue Pins — bootstrap: capability detection, module wiring, settings,
// visibility/resize handling, fixed-step loop, offline API fallback.

import { solveState } from './rules.js';
import { getTutorial, getJourney, getDailyLevel, dailySeedForDate, THEMES, findLevel } from './content.js';
import { createSession, loadSettings, saveSettings, loadProgression, saveProgression, defaultStorage } from './session.js';
import { createPlatform } from './platform.js';
import { createRenderer } from './render.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { ACHIEVEMENTS, achievementByKey, evaluateAchievements } from './achievements.js';

const root = document.getElementById('app');
const storage = defaultStorage();
const settings = loadSettings(storage);
let prog = loadProgression(storage);
// StarHermit platform adapter: launch token, nickname, cloud save, boards.
// Without a token every method no-ops and the game plays exactly as before.
const platform = createPlatform({ onSync: () => { if (ui) ui.setSync(platform.syncLabel()); } });
function persistProgress() {
  saveProgression(prog, storage);
  platform.queueCloudSave(prog); // no-op unless hosted; localStorage stays the cache
}
const audio = createAudio(settings, (ev) => ui && ui.caption(soundCaption(ev)));

function soundCaption(ev) {
  return { ack: 'click', pull: 'pin pulled', flow: 'liquid flowing', neutralize: 'steam hiss',
           win: 'victory chime', lose: 'low fail tone', invalid: 'error buzz', undo: 'rewind' }[ev] || ev;
}

// ---- server time sync + daily API with graceful offline fallback ----
// Hosted (StarHermit): same-origin platform /api with the Bearer launch token;
// the daily board is the platform leaderboard (read-only). Local dev: the
// repo's own server.js serves these routes, daily verify included.
let clockOffsetMs = 0;
let apiOnline = false;
async function syncClock() {
  try {
    const t0 = Date.now();
    const res = await fetch('/api/v1/time', { headers: platform.authHeaders(), signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error('bad');
    const body = await res.json();
    clockOffsetMs = body.serverTime - Math.round((t0 + Date.now()) / 2);
    apiOnline = true;
  } catch { apiOnline = false; }
}
function serverNow() { return Date.now() + clockOffsetMs; }

async function submitDaily(envelope, name) {
  if (!apiOnline) return { ok: false, message: 'Offline — score kept locally only.' };
  try {
    const res = await fetch('/api/v1/daily/verify', {
      method: 'POST', headers: { 'content-type': 'application/json', ...platform.authHeaders() },
      body: JSON.stringify({ envelope, name: (name || 'guest').slice(0, 24) }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return { ok: false, message: 'Daily ranking is unavailable on this host — score kept locally only.' };
    const body = await res.json();
    if (!res.ok) return { ok: false, message: 'Rejected: ' + (body.error || res.status) };
    return { ok: true, message: `Daily score accepted: ${body.score.total}` };
  } catch { return { ok: false, message: 'Offline — score kept locally only.' }; }
}

async function fetchDailyBoard(seed) {
  if (!apiOnline) return null;
  if (platform.hosted()) {
    // Platform leaderboard is read-only; the game never submits scores to it.
    try { return await platform.fetchLeaderboardEntries(5); } catch { return null; }
  }
  try {
    const res = await fetch('/api/v1/leaderboard?seed=' + (seed >>> 0), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body.entries) && body.entries.length ? body.entries.slice(0, 5) : null;
  } catch { return null; }
}

// ---- renderer (with WebGL fallback) ----
let view = null;
let ui = null;

// ---- game controller ----
let sess = null;
let journey = [];
let selectedPin = null;
let cmdCounter = 0;

function themeOf(level) { return THEMES.find(t => t.id === level.theme) || THEMES[0]; }

function objectiveText() {
  const s = sess.session.state;
  const need = s.heroTotal - s.stats.savedCount;
  return `Rescue ${need} villager${need === 1 ? '' : 's'} with water. Keep lava away.`;
}

function refreshHud(hint) {
  const s = sess.session.state;
  const legal = sess.legalActions().map(a => a.pinId);
  if (selectedPin && !legal.includes(selectedPin)) selectedPin = legal[0] || null;
  if (!selectedPin && legal.length) selectedPin = legal[0];
  ui.hud({
    title: sess.session.level.name || (sess.session.mode === 'tutorial' && lesson ? lesson.title : sess.session.level.id),
    objective: objectiveText(),
    moves: s.stats.moves, par: s.par, moveLimit: s.moveLimit,
    saved: s.stats.savedCount, heroTotal: s.heroTotal,
    score: sess.score().total,
    canUndo: sess.session.allowUndo && sess.session.commandLog.length > 0 && sess.session.screen === 'active',
    themeName: themeOf(sess.session.level).name,
    hint: hint || null,
    player: platform.displayName(),
    sync: platform.syncLabel(),
  });
  ui.pinSelector(legal, selectedPin);
  ui.updateMirror(s, sess.session.level.name || sess.session.level.id);
  if (view) { view.sync(s); view.select(selectedPin); }
  ui.coach(coachContent(s, legal));
}

// ---- first-play coaching ----
// Shown in the stage until the player has pulled a couple of pins or dismisses
// it; tutorial lessons always show their lesson text here (the live-region
// caption alone is invisible to sighted players).
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
function controlTip(step) {
  const pick = TOUCH ? 'Tap a brass pin to select it' : 'Click or hover a brass pin to select it';
  const confirm = TOUCH ? 'tap it again' : 'click it again or press Enter';
  switch (step) {
    case 'select': return `${pick} — or use the buttons under “Pins you can pull”, or the arrow keys.`;
    case 'pull':   return `Selected. Now ${confirm} to pull it. One press on its button in the list also pulls it.`;
    case 'flow':   return 'Water falls and spreads sideways: blue water rescues villagers, orange lava is deadly. H = hint · Esc = pause & settings.';
    default: return '';
  }
}
function coachContent(state, legal) {
  const active = sess && sess.session.screen === 'active';
  if (!active) return null;
  const isTutorial = sess.session.mode === 'tutorial' && lesson;
  if (prog.coachDone && !isTutorial) return null;
  let step = null;
  if (!prog.coachDone) {
    if (state.stats.moves === 0) step = selectedPin && legal.length ? 'pull' : 'select';
    else if (state.stats.moves === 1) step = 'flow';
    else { prog.coachDone = true; persistProgress(); }
  }
  if (!step && !isTutorial) return null;
  const stepIdx = { select: 1, pull: 2, flow: 3 }[step];
  return {
    step: isTutorial ? `Lesson ${getTutorial().findIndex(t => t.level.id === sess.session.level.id) + 1} of ${getTutorial().length}` : (step ? `How to play · ${stepIdx} of 3` : ''),
    title: isTutorial ? lesson.title : (step === 'select' ? 'Choose a pin' : step === 'pull' ? 'Pull it' : 'Watch the flow'),
    text: isTutorial ? lesson.text : controlTip(step),
    tip: isTutorial && step ? controlTip(step) : '',
    dismiss: step ? 'Got it' : null,
  };
}

function startLevel(level, mode, tutorialLesson) {
  if (level.excluded) { ui.error('This day is excluded from ranking (defective content).'); return; }
  sess = createSession({ storage, level, mode: mode || 'journey', practice: mode === 'practice' || mode === 'tutorial', now: Date.now() });
  sess.transition('preparing', 'level-selected');
  cmdCounter = 0;
  selectedPin = null;
  if (mode !== 'tutorial') lesson = null;
  ui.coach(null);
  if (view) view.build(sess.session.state, sess.session.level, themeOf(sess.session.level));
  // countdown: 3 short beats, then active
  sess.transition(mode === 'tutorial' ? 'tutorial' : 'countdown', 'start');
  if (tutorialLesson) announceLesson(tutorialLesson);
  let n = 2;
  ui.countdownScreen('Ready…');
  const mySession = sess; // a newer startLevel must not be advanced by this timer
  const step = () => {
    if (sess !== mySession) return;
    if (sess.session.screen !== 'countdown' && sess.session.screen !== 'tutorial') return;
    if (n-- > 0) { ui.countdownScreen(String(n + 1)); setTimeout(step, 450); }
    else {
      sess.transition('active', 'countdown-done');
      ui.clearOverlay();
      refreshHud();
    }
  };
  setTimeout(step, 450);
}

let lesson = null;
let pendingMode = 'journey';
let helpReturn = 'pause';
function announceLesson(l) {
  lesson = l;
  setTimeout(() => ui.error(''), 0);
  ui.caption(l.title + ': ' + l.text);
}

function pullPin(pinId) {
  if (!sess || sess.session.screen !== 'active') return;
  const res = sess.dispatch({ id: sess.session.id + '-' + (++cmdCounter), type: 'pull', pinId });
  if (!res.ok) {
    if (!res.duplicate) { audio.play('invalid'); ui.error('Cannot pull that pin: ' + res.error); }
    refreshHud();
    return;
  }
  for (const ev of res.events) {
    if (ev.type === 'pull') audio.play('pull');
    else if (ev.type === 'neutralize') audio.play('neutralize');
    else if (ev.type === 'rescued') audio.play('flow');
  }
  selectedPin = null;
  refreshHud();
  if (res.terminal && res.terminal.done) finishRound(res.terminal);
}

async function finishRound(term) {
  audio.play(term.won ? 'win' : 'lose');
  sess.session.elapsedMs = Date.now() - sess.session.startedAt;
  try { storage.removeItem('rescue-pins:last'); } catch { /* storage denied */ }
  const score = sess.score();
  const id = sess.session.level.id;
  let dailySubmit = null;
  let dailyBoard = null;
  let newlyUnlocked = [];
  if (term.won) {
    prog.completed[id] = true;
    if (!prog.bestScores[id] || score.total > prog.bestScores[id]) prog.bestScores[id] = score.total;
    if (sess.session.mode === 'tutorial') prog.tutorialDone = true;
    prog.rescuedTotal = (prog.rescuedTotal | 0) + sess.session.state.stats.savedCount;
    if (sess.session.mode === 'daily' && sess.session.level.daily) {
      // one entry per completed UTC day; consecutive days build the streak
      prog.streakDays = [...new Set([...(prog.streakDays || []), sess.session.level.daily])].sort((a, b) => a - b);
    }
    const ev = evaluateAchievements(prog, (lid) => { const l = findLevel(lid); return l && l.theme; });
    prog.achievements = ev.unlocked; // idempotent: re-storing the full set is safe
    newlyUnlocked = ev.newly.map(achievementByKey).filter(Boolean);
    persistProgress();
  }
  if (sess.session.mode === 'daily' && term.won) {
    dailySubmit = await submitDaily(sess.replayEnvelope(), platform.displayName() || 'guest');
    dailyBoard = await fetchDailyBoard(sess.session.level.daily);
  }
  sess.transition('results', term.reason);
  ui.coach(null);
  ui.resultsScreen({
    won: term.won, reason: term.reason, score,
    moves: sess.session.state.stats.moves, par: sess.session.state.par,
    dailySubmit, achievements: newlyUnlocked, board: dailyBoard,
  });
}

function hasSavedGame() {
  try { return !!storage.getItem('rescue-pins:last'); } catch { return false; }
}

// identity + sync status for the title/profile name slots (nulls when local)
function titleOpts() {
  return { hasSave: hasSavedGame(), player: platform.displayName(), sync: platform.syncLabel() };
}
function accountLine() {
  if (platform.hosted()) return `Signed in as ${platform.displayName()} · ${platform.syncLabel() || 'cloud save'}`;
  return 'Progress is stored locally (versioned, checksummed).';
}

// ---- UI action handlers ----
const actions = {
  uiAck: () => audio.play('ack'),
  showTitle: () => { if (sess) sess.transition('title', 'menu'); ui.titleScreen(prog, titleOpts()); },
  showModeSelect: () => ui.modeSelectScreen({ tutorialDone: !!prog.tutorialDone }),
  dismissCoach: () => { prog.coachDone = true; persistProgress(); if (sess && sess.session.screen === 'active') refreshHud(); },
  showJourney: () => ui.journeyScreen(prog, journey),
  showProgression: () => {
    const unlocked = new Set(prog.achievements || []);
    const masteryStages = journey.filter(l => l.difficulty && l.difficulty.mastery);
    ui.progressionScreen(prog, {
      achievements: ACHIEVEMENTS.map(a => ({ ...a, unlocked: unlocked.has(a.key) })),
      masteryDone: masteryStages.filter(l => prog.completed[l.id]).length,
      masteryTotal: masteryStages.length,
      account: accountLine(),
    });
  },
  startMode: (mode) => {
    pendingMode = mode === 'learn' ? 'tutorial' : mode;
    if (mode === 'learn') { lesson = getTutorial()[0]; startLevel(lesson.level, 'tutorial', lesson); }
    else if (mode === 'journey') ui.journeyScreen(prog, journey);
    else if (mode === 'daily') startLevel(getDailyLevel(dailySeedForDate(new Date(serverNow()))), 'daily');
    else if (mode === 'practice') ui.journeyScreen(prog, journey);
  },
  startLevel: (lv) => startLevel(lv, pendingMode === 'tutorial' ? 'tutorial' : pendingMode),
  startDaily: () => startLevel(getDailyLevel(dailySeedForDate(new Date(serverNow()))), 'daily'),
  pullPin,
  undo: () => {
    if (!sess) return;
    const r = sess.undo();
    if (r.ok) { audio.play('undo'); selectedPin = null; refreshHud(); }
    else ui.error('Undo: ' + r.error);
  },
  hint: () => {
    if (!sess) return;
    // Solve from the CURRENT position, not the authored par solution: after a
    // deviation the old solution pins may no longer win, and a hint that names
    // a losing pin is worse than none.
    const res = solveState(sess.session.state);
    const hint = res.solvable
      ? `Try pin ${res.first} — it is on a winning line from here.`
      : res.reason === 'node-budget-exceeded' ? 'Hint search limit reached — try another move.'
      : 'No winning line from this position — undo (practice) or retry.';
    refreshHud(hint);
  },
  pause: () => {
    if (!sess || sess.session.screen !== 'active') return;
    sess.transition('paused', 'user-pause');
    audio.suspend();
    ui.pauseScreen();
  },
  resume: () => {
    if (!sess) return;
    sess.transition('active', 'resume');
    audio.resume();
    ui.clearOverlay();
    refreshHud();
  },
  retry: () => { const lv = sess.session.level, m = sess.session.mode; startLevel(lv, m, m === 'tutorial' ? lesson : null); },
  next: () => {
    if (sess.session.mode === 'tutorial') {
      const tut = getTutorial();
      const li = tut.findIndex(t => t.level.id === sess.session.level.id);
      if (li >= 0 && li + 1 < tut.length) { lesson = tut[li + 1]; startLevel(lesson.level, 'tutorial', lesson); return; }
      actions.showTitle();
      return;
    }
    const idx = journey.findIndex(l => l.id === sess.session.level.id);
    if (idx >= 0 && idx + 1 < journey.length) startLevel(journey[idx + 1], 'journey');
    else actions.showTitle();
  },
  quitToTitle: () => {
    if (sess) { sess.saveSnapshot('rescue-pins:last'); sess.transition('title', 'quit'); }
    ui.titleScreen(prog, titleOpts());
  },
  showHelp: (from) => { helpReturn = from === 'title' ? 'title' : 'pause'; ui.helpScreen({ confirm: 'Enter' }); },
  backFromHelp: () => { if (helpReturn === 'title') actions.showTitle(); else ui.pauseScreen(); },
  setVolume: (bus, v) => { settings.audio[bus] = v; audio.applyVolumes(); saveSettings(settings, storage); },
  setMuted: (m) => { audio.setMuted(m); saveSettings(settings, storage); },
  setCaptions: (c) => { settings.captions = c; saveSettings(settings, storage); },
  setTier: (t) => { settings.graphics.tier = t; if (view) view.applyTier(t === 'auto' ? 'high' : t); saveSettings(settings, storage); },
  setPalette: (p) => { settings.graphics.palette = p; saveSettings(settings, storage); rebuildView(); },
  setReducedMotion: (m) => { settings.graphics.reducedMotion = m; saveSettings(settings, storage); rebuildView(); },
  setHighContrast: (hc) => { settings.graphics.highContrast = hc; document.body.classList.toggle('hc', hc); saveSettings(settings, storage); },
  setTextSize: (t) => { settings.graphics.textSize = t; document.body.classList.toggle('big-text', t === 'large'); saveSettings(settings, storage); },
  setLeftHanded: (v) => { settings.controls.leftHanded = v; document.body.classList.toggle('lefty', v); saveSettings(settings, storage); },
  continueSaved: () => {
    let doc = null;
    try { doc = JSON.parse(storage.getItem('rescue-pins:last') || 'null'); } catch { doc = null; }
    const lv = doc && findLevel(doc.levelId);
    if (!lv) { ui.error('No saved game to continue.'); return; }
    sess = createSession({ storage, level: lv, mode: doc.mode || 'journey', now: Date.now() });
    if (!sess.loadSnapshot('rescue-pins:last', findLevel)) {
      sess = null;
      ui.error('Saved game was corrupted and could not be restored.');
      return;
    }
    cmdCounter = 0;
    lesson = doc.mode === 'tutorial' ? getTutorial().find(t => t.level.id === lv.id) : null;
    selectedPin = null;
    if (view) view.build(sess.session.state, sess.session.level, themeOf(sess.session.level));
    const term = sess.isTerminal();
    if (term.done) {
      sess.transition('results', term.reason);
      ui.resultsScreen({ won: term.won, reason: term.reason, score: sess.score(),
                         moves: sess.session.state.stats.moves, par: sess.session.state.par,
                         dailySubmit: null });
    } else {
      sess.transition('active', 'resume-saved-game');
      ui.clearOverlay();
      refreshHud();
    }
  },
};

function rebuildView() {
  if (!view) return;
  const s = sess && sess.session.state, lv = sess && sess.session.level;
  view.dispose();
  view = createRenderer(ui.canvasHost, { settings });
  if (view && s) { view.build(s, lv, themeOf(lv)); wirePointer(); }
}

// ---- pointer input (raycast against interaction layer only) ----
function wirePointer() {
  const elc = ui.canvasHost.querySelector('canvas');
  if (!elc) return;
  let downAt = null;
  elc.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; elc.setPointerCapture(e.pointerId); });
  elc.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const dist = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    const dt = performance.now() - downAt.t;
    downAt = null;
    if (dist > 12 || dt > 600) return; // drag/camera gesture, not a tap
    const pinId = view.pick(e.clientX, e.clientY);
    if (pinId) {
      if (selectedPin === pinId) pullPin(pinId);       // tap selected pin again to confirm
      else { selectedPin = pinId; refreshHud(); }      // first tap selects + previews
    }
  });
  elc.addEventListener('pointercancel', () => { downAt = null; });
  elc.addEventListener('pointermove', (e) => {
    if (!sess || sess.session.screen !== 'active') return;
    const pinId = view.pick(e.clientX, e.clientY);
    if (pinId && pinId !== selectedPin) { selectedPin = pinId; refreshHud(); } // legal-target preview
  });
}

// ---- keyboard ----
window.addEventListener('keydown', (e) => {
  if (!sess) return;
  const screen = sess.session.screen;
  if (screen === 'paused') { if (e.key === 'Escape') actions.resume(); return; }
  if (screen !== 'active' && screen !== 'tutorial') return;
  // Pause/undo/hint/camera must stay reachable even when no pins remain
  // (e.g. a dead-end board in practice, where undo is the only way back).
  switch (e.key) {
    case 'Escape': actions.pause(); return;
    case 'u': case 'U': actions.undo(); return;
    case 'h': case 'H': actions.hint(); return;
    case 'c': case 'C': if (view) view.resize(); audio.play('ack'); return;
  }
  const legal = sess.legalActions().map(a => a.pinId);
  if (!legal.length) return;
  const i = Math.max(0, legal.indexOf(selectedPin));
  const move = (d) => { selectedPin = legal[(i + d + legal.length) % legal.length]; audio.play('ack'); refreshHud(); };
  switch (e.key) {
    case 'ArrowLeft': case 'ArrowUp': case 'a': case 'w': move(-1); e.preventDefault(); break;
    case 'ArrowRight': case 'ArrowDown': case 'd': case 's': move(1); e.preventDefault(); break;
    case 'Enter': case ' ': if (selectedPin) { pullPin(selectedPin); e.preventDefault(); } break;
  }
});

// ---- fixed-step loop + lifecycle ----
let hidden = false;
document.addEventListener('visibilitychange', () => {
  hidden = document.hidden;
  if (hidden && sess && sess.session.screen === 'active') {
    sess.saveSnapshot('rescue-pins:last'); // backgrounding pauses solo sim
    actions.pause();
  }
  if (view) view.setPaused(hidden);
  if (hidden) audio.suspend(); else audio.resume();
});

let last = performance.now(), acc = 0;
const STEP = 1000 / 60;
function loop(now) {
  requestAnimationFrame(loop);
  if (hidden) return;                    // zero rendering while hidden
  acc += Math.min(250, now - last); last = now;
  while (acc >= STEP) { acc -= STEP; }   // sim is command-driven; step reserved for future ticks
  if (view) view.frame(now);
}

// ---- boot ----
async function boot() {
  ui = createUI(root, actions, settings);
  platform.start(); // reads the launch token (ui exists for sync callbacks)
  document.body.classList.toggle('hc', !!settings.graphics.highContrast);
  document.body.classList.toggle('big-text', settings.graphics.textSize === 'large');
  document.body.classList.toggle('lefty', !!settings.controls.leftHanded);

  view = createRenderer(ui.canvasHost, { settings });
  if (!view) {
    ui.showWebglFallback('3D rendering (WebGL) is unavailable in this browser. ' +
      'You can still play using the pin list in the status rail — every action has a text equivalent.');
  } else {
    view.onContextLost(() => ui.showWebglFallback('Graphics context was lost. Your progress is saved; reload to restore 3D view.'));
    wirePointer();
  }

  const t0 = performance.now();
  journey = getJourney(); // deterministic, solver-verified at first use (~1s)
  void t0;

  await syncClock();

  // Hosted: prefer the remote cloud save over the local cache (conflict rule
  // per platform contract); queue a mirror upload so the slot exists.
  if (platform.hosted()) {
    const remote = await platform.loadCloudSave();
    if (remote) { prog = remote; saveProgression(prog, storage); }
    platform.queueCloudSave(prog);
  }

  // AudioContext may only start after a user gesture (browser autoplay policy)
  const kickAudio = () => { audio.startAmbience(); window.removeEventListener('pointerdown', kickAudio); window.removeEventListener('keydown', kickAudio); };
  window.addEventListener('pointerdown', kickAudio);
  window.addEventListener('keydown', kickAudio);

  ui.setSync(platform.syncLabel());
  ui.titleScreen(prog, titleOpts());
  requestAnimationFrame(loop);
}

boot();
