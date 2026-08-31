// Rescue Pins — bootstrap: capability detection, module wiring, settings,
// visibility/resize handling, fixed-step loop, offline API fallback.

import { hashState, makeStreams } from './rules.js';
import { getTutorial, getJourney, getDailyLevel, dailySeedForDate, validateLevel, THEMES, findLevel } from './content.js';
import { createSession, loadSettings, saveSettings, loadProgression, saveProgression } from './session.js';
import { createRenderer } from './render.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';

const root = document.getElementById('app');
const settings = loadSettings();
let prog = loadProgression();
const audio = createAudio(settings, (ev) => ui && ui.caption(soundCaption(ev)));

function soundCaption(ev) {
  return { ack: 'click', pull: 'pin pulled', flow: 'liquid flowing', neutralize: 'steam hiss',
           win: 'victory chime', lose: 'low fail tone', invalid: 'error buzz', undo: 'rewind' }[ev] || ev;
}

// ---- server time sync + daily API with graceful offline fallback ----
let clockOffsetMs = 0;
let apiOnline = false;
async function syncClock() {
  try {
    const t0 = Date.now();
    const res = await fetch('/api/v1/time', { signal: AbortSignal.timeout(3000) });
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
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ envelope, name: (name || 'guest').slice(0, 24) }),
      signal: AbortSignal.timeout(5000),
    });
    const body = await res.json();
    if (!res.ok) return { ok: false, message: 'Rejected: ' + (body.error || res.status) };
    return { ok: true, message: `Daily score accepted: ${body.score.total}` };
  } catch { return { ok: false, message: 'Offline — score kept locally only.' }; }
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
    title: sess.session.level.name || sess.session.level.id,
    objective: objectiveText(),
    moves: s.stats.moves, par: s.par, moveLimit: s.moveLimit,
    saved: s.stats.savedCount, heroTotal: s.heroTotal,
    score: sess.score().total,
    canUndo: sess.session.allowUndo && sess.session.commandLog.length > 0 && sess.session.screen === 'active',
    themeName: themeOf(sess.session.level).name,
    hint: hint || null,
  });
  ui.pinSelector(legal, selectedPin);
  ui.updateMirror(s, sess.session.level.name || sess.session.level.id);
  if (view) { view.sync(s); view.select(selectedPin); }
}

function startLevel(level, mode, tutorialLesson) {
  if (level.excluded) { ui.error('This day is excluded from ranking (defective content).'); return; }
  sess = createSession({ level, mode: mode || 'journey', practice: mode === 'practice' || mode === 'tutorial', now: Date.now() });
  sess.transition('preparing', 'level-selected');
  cmdCounter = 0;
  selectedPin = null;
  if (view) view.build(sess.session.state, sess.session.level, themeOf(sess.session.level));
  // countdown: 3 short beats, then active
  sess.transition(mode === 'tutorial' ? 'tutorial' : 'countdown', 'start');
  if (tutorialLesson) announceLesson(tutorialLesson);
  let n = 2;
  ui.countdownScreen('Ready…');
  const step = () => {
    if (!sess || (sess.session.screen !== 'countdown' && sess.session.screen !== 'tutorial')) return;
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
  const score = sess.score();
  const id = sess.session.level.id;
  let dailySubmit = null;
  if (term.won) {
    prog.completed[id] = true;
    if (!prog.bestScores[id] || score.total > prog.bestScores[id]) prog.bestScores[id] = score.total;
    if (sess.session.mode === 'tutorial') prog.tutorialDone = true;
    saveProgression(prog);
  }
  if (sess.session.mode === 'daily' && term.won) {
    dailySubmit = await submitDaily(sess.replayEnvelope(), 'guest');
  }
  sess.transition('results', term.reason);
  ui.resultsScreen({
    won: term.won, reason: term.reason, score,
    moves: sess.session.state.stats.moves, par: sess.session.state.par,
    dailySubmit,
  });
}

// ---- UI action handlers ----
const actions = {
  uiAck: () => audio.play('ack'),
  showTitle: () => { if (sess) sess.transition('title', 'menu'); ui.titleScreen(prog); },
  showModeSelect: () => ui.modeSelectScreen(),
  showJourney: () => ui.journeyScreen(prog, journey),
  showProgression: () => ui.progressionScreen(prog),
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
    const v = validateLevel(sess.session.level);
    const remaining = v.solution ? v.solution.filter(p => !sess.session.state.pulledPins.includes(p)) : [];
    const hint = remaining.length ? `Try pin ${remaining[0]} — it is part of a winning line.` : 'No hint available.';
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
  retry: () => { const lv = sess.session.level, m = sess.session.mode; startLevel(lv, m, lesson); },
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
    ui.titleScreen(prog);
  },
  showHelp: () => ui.helpScreen({ confirm: 'Enter' }),
  backFromHelp: () => ui.pauseScreen(),
  setVolume: (bus, v) => { settings.audio[bus] = v; audio.applyVolumes(); saveSettings(settings); },
  setMuted: (m) => { audio.setMuted(m); saveSettings(settings); },
  setCaptions: (c) => { settings.captions = c; saveSettings(settings); },
  setTier: (t) => { settings.graphics.tier = t; if (view) view.applyTier(t === 'auto' ? 'high' : t); saveSettings(settings); },
  setPalette: (p) => { settings.graphics.palette = p; saveSettings(settings); rebuildView(); },
  setReducedMotion: (m) => { settings.graphics.reducedMotion = m; saveSettings(settings); rebuildView(); },
  setHighContrast: (hc) => { settings.graphics.highContrast = hc; document.body.classList.toggle('hc', hc); saveSettings(settings); },
  setTextSize: (t) => { settings.graphics.textSize = t; document.body.classList.toggle('big-text', t === 'large'); saveSettings(settings); },
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
  if (!sess || (sess.session.screen !== 'active' && sess.session.screen !== 'tutorial')) {
    if (e.key === 'Escape' && sess && sess.session.screen === 'paused') actions.resume();
    return;
  }
  const legal = sess.legalActions().map(a => a.pinId);
  if (!legal.length) return;
  const i = Math.max(0, legal.indexOf(selectedPin));
  const move = (d) => { selectedPin = legal[(i + d + legal.length) % legal.length]; audio.play('ack'); refreshHud(); };
  switch (e.key) {
    case 'ArrowLeft': case 'ArrowUp': case 'a': case 'w': move(-1); e.preventDefault(); break;
    case 'ArrowRight': case 'ArrowDown': case 'd': case 's': move(1); e.preventDefault(); break;
    case 'Enter': case ' ': if (selectedPin) { pullPin(selectedPin); e.preventDefault(); } break;
    case 'Escape': actions.pause(); break;
    case 'u': case 'U': actions.undo(); break;
    case 'h': case 'H': actions.hint(); break;
    case 'c': case 'C': if (view) view.resize(); audio.play('ack'); break;
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
  document.body.classList.toggle('hc', !!settings.graphics.highContrast);
  document.body.classList.toggle('big-text', settings.graphics.textSize === 'large');

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

  // AudioContext may only start after a user gesture (browser autoplay policy)
  const kickAudio = () => { audio.startAmbience(); window.removeEventListener('pointerdown', kickAudio); window.removeEventListener('keydown', kickAudio); };
  window.addEventListener('pointerdown', kickAudio);
  window.addEventListener('keydown', kickAudio);

  ui.titleScreen(prog);
  requestAnimationFrame(loop);
}

boot();
