// Rescue Pins on the StarHermit engine: the entry module (starhermit.txt
// engine.entry), played natively by the StarHermit client and in browsers by
// the engine's web runtime. The rules (js/rules.js), content (js/content.js
// with the Journey from js/journey.js) and session (js/session.js: validated
// commands, undo, snapshots) are the browser build's, unchanged; this module
// is what js/main.js did around them — the screen flow (title → modes /
// journey / profile / help / settings → countdown → the castle ⇄ pause →
// results), starting every mode (Learn, Journey, Daily, Practice), pulling
// pins by keys, pads, pointer and touch, undo, the hint, the first-play
// coach, the results with achievements, the daily streak and the score post,
// "Continue saved game", and the lifecycle (a hidden window saves and pauses
// the stage, as visibilitychange did). Screens are drawn by screens.ts
// (starhermit:ui), the castle by render.ts (starhermit:scene).
//
// Time is the runtime's fixed steps: the countdown's beats (450 ms each) and
// the toasts run on a clock advanced 1/60 s per fixed step, so slow frames
// never change a round and play scripts replay exactly. The hint's search and
// the Daily's generation run on a script worker (native/solve.ts).
import { clipboard, frame, onFixedUpdate, onPreferencesChange, onRender, onResume, onStart, onSuspend, onUpdate, preferences, setFixedRate } from "starhermit:engine";
import { onAction, onPointerButton, onPointerMove, onTouch, primaryPointer } from "starhermit:input";
import * as ui from "starhermit:ui";
import { onSessionEnded, requestSignIn } from "starhermit:platform";
import { Achievements, Content, createSession, type Achievement, type LevelDef, type Lesson, type Score, type Session, type Terminal } from "./game.ts";
import * as audio from "./audio.ts";
import { N, S, T, levelLabel } from "./i18n.ts";
import * as platform from "./platform.ts";
import { lookFor } from "./quality.ts";
import * as render from "./render.ts";
import { drawScreens } from "./screens.ts";
import * as solve from "./solve.ts";
import { applyTokens, initStyles } from "./style.ts";

export type Overlay = "title" | "modes" | "journey" | "progression" | "help" | "settings" | "countdown" | "pause" | "results" | null;
export interface Results {
  won: boolean; reason: string | null; score: Score; moves: number; par: number;
  achievements: Achievement[]; dailyNote: string | null; board: platform.BoardRow[] | null; lb: platform.Posted | "posting" | null;
}
export interface Coach { step: string; title: string; text: string; tip: string; dismiss: boolean }
const LAST = "rescue-pins:last";
const BEAT_MS = 450;

export const app = {
  overlay: "title" as Overlay,
  openedFrame: 0,
  focusNext: null as string | null,
  session: null as Session | null,
  lesson: null as Lesson | null,
  /** The mode a Journey-screen pick starts (journey or practice; Learn starts itself). */
  pendingMode: "journey",
  selectedPin: null as string | null,
  hint: null as (() => string) | null,
  hintPending: false,
  countdown: "" as string,
  countdownAt: 0,
  countdownLeft: 0,
  preparing: false,
  results: null as Results | null,
  helpReturn: "title" as "title" | "pause",
  toasts: [] as { text: string; until: number }[],
  journey: [] as LevelDef[],
};
let clockMs = 0;
const now = (): number => clockMs / 1000;
export const fresh = (): boolean => frame().frame !== app.openedFrame;
let cmdCounter = 0;

// ------------------------------------------------------------------ helpers
const spoken: string[] = [];
let spokenAssertive = false;
/** The live regions (captions, objective, score, errors, results): one announcement a frame, joined. */
export function announce(text: string, assertive = false): void {
  if (!text) return;
  spoken.push(text);
  spokenAssertive ||= assertive;
}
function flushAnnouncements(): void {
  if (!spoken.length) return;
  const text = spoken.splice(0).join(" ").slice(0, 500);
  try { ui.announce(text, { politeness: spokenAssertive ? "assertive" : "polite" }); } catch { /* busy */ }
  spokenAssertive = false;
}
export function toast(text: string): void {
  app.toasts.push({ text, until: now() + 3.2 });
  if (app.toasts.length > 3) app.toasts.shift();
}
const CAPTIONS: Record<audio.Sfx, string> = {
  ack: N("click"), pull: N("pin pulled"), flow: N("liquid flowing"), neutralize: N("steam hiss"),
  win: N("victory chime"), lose: N("low fail tone"), invalid: N("error buzz"), undo: N("rewind"),
};
/** audio.js play with its caption hook (the captions live region). */
export function sound(ev: audio.Sfx): void {
  audio.play(ev);
  if (platform.options.captions && ev !== "ack") announce(T(CAPTIONS[ev]));
}
const pending: (() => void)[] = [];
/** A widget's press, run once the frame's UI is built (state changes mid-build would break later widgets). */
export function later(fn: () => void): void { pending.push(fn); }
export function themeOf(level: LevelDef): (typeof Content.THEMES)[number] { return Content.THEMES.find((t) => t.id === level.theme) || Content.THEMES[0]!; }
export const screen = (): string => app.session?.session.screen ?? "title";
export const playing = (): boolean => !!app.session && app.session.session.screen === "active" && app.overlay === null;

// ------------------------------------------------------------------ overlays
export function open(o: Overlay, focus: string | null = null): void {
  app.overlay = o;
  app.openedFrame = frame().frame;
  app.focusNext = focus ?? (primaryPointer() === "coarse" ? null : firstFocus(o));
  if (!focus) ui.setFocus(null);
}
function firstFocus(o: Overlay): string | null {
  switch (o) {
    case "title": return "btn-play";
    case "modes": return "mode-learn";
    case "journey": return "stage-1";
    case "progression": case "help": return "btn-back";
    case "settings": return "btn-options";
    case "pause": return "btn-resume";
    case "results": return "btn-retry";
    default: return null;
  }
}
export function hasSavedGame(): boolean { return !!platform.deviceKV.getItem(LAST); }
export function showTitle(): void {
  if (app.session) app.session.transition("title", "menu");
  open("title");
}
export function showModes(): void { open("modes"); }
export function showJourney(): void { open("journey"); }
export function showProgression(): void { open("progression"); }
export function showSettings(): void { open("settings"); }
export function showHelp(from: "title" | "pause"): void { app.helpReturn = from; open("help"); }
export function backFromHelp(): void { if (app.helpReturn === "title") showTitle(); else open("pause"); }
export function backFromSettings(): void { showTitle(); }

// ------------------------------------------------------------------ starting levels
export function startMode(mode: string): void {
  app.pendingMode = mode === "learn" ? "tutorial" : mode;
  if (mode === "learn") { const l = Content.getTutorial()[0]!; startLevel(l.level, "tutorial", l); }
  else if (mode === "daily") startDaily();
  else showJourney();
}
export function startPicked(lv: LevelDef): void { startLevel(lv, app.pendingMode === "tutorial" ? "tutorial" : app.pendingMode); }
let dailyCancel: (() => void) | null = null;
export function startDaily(): void {
  const day = Content.dailySeedForDate(new Date(platform.nowMs()));
  dailyCancel?.();
  app.preparing = true;
  app.countdown = "";
  open("countdown");
  dailyCancel = solve.daily(day, (level, err) => {
    dailyCancel = null;
    app.preparing = false;
    if (!level) { showTitle(); toast(T("Cannot start: {reason}", { reason: err ?? "?" })); return; }
    startLevel(level, "daily");
  });
}
export function startLevel(level: LevelDef, mode: string, lesson?: Lesson | null): void {
  if (level.excluded) { toast(T("This day is excluded from ranking (defective content).")); announce(T("This day is excluded from ranking (defective content)."), true); showTitle(); return; }
  const s = createSession({ storage: platform.deviceKV, level, mode: mode || "journey", practice: mode === "practice" || mode === "tutorial", now: Math.round(platform.nowMs()) });
  app.session = s;
  s.transition("preparing", "level-selected");
  cmdCounter = 0;
  app.selectedPin = null;
  app.hint = null;
  hintCancel?.();
  app.results = null;
  app.lesson = mode === "tutorial" ? (lesson ?? app.lesson) : null;
  render.build(s.session.state, s.session.level, themeOf(s.session.level));
  s.transition(mode === "tutorial" ? "tutorial" : "countdown", "start");
  if (mode === "tutorial" && app.lesson) announce(`${T(app.lesson.title)}: ${T(app.lesson.text)}`);
  // countdown: "Ready…", 2, 1, then active (450 ms beats)
  app.countdown = T("Ready…");
  app.countdownLeft = 2;
  app.countdownAt = clockMs + BEAT_MS;
  open("countdown");
}
function countdownTick(): void {
  const s = app.session;
  if (!s || app.overlay !== "countdown" || app.preparing || clockMs < app.countdownAt) return;
  if (s.session.screen !== "countdown" && s.session.screen !== "tutorial") return;
  if (app.countdownLeft-- > 0) { app.countdown = String(app.countdownLeft + 1); app.countdownAt = clockMs + BEAT_MS; }
  else {
    s.transition("active", "countdown-done");
    app.overlay = null;
    app.openedFrame = frame().frame;
    refresh();
  }
}

/** js/main.js refreshHud: the selection stays legal, the castle shows the state. */
export function refresh(): void {
  const s = app.session;
  if (!s) return;
  const legal = s.legalActions().map((a) => a.pinId);
  if (app.selectedPin && !legal.includes(app.selectedPin)) app.selectedPin = legal[0] ?? null;
  if (!app.selectedPin && legal.length) app.selectedPin = legal[0]!;
  render.sync(s.session.state);
  render.select(app.selectedPin);
}
export function objectiveText(): string {
  const st = app.session!.session.state;
  const need = st.heroTotal - st.stats.savedCount;
  if (need <= 0) return T("Every villager is safe.");
  return need === 1 ? T("Rescue {n} villager with water. Keep lava away.", { n: need }) : T("Rescue {n} villagers with water. Keep lava away.", { n: need });
}
export function levelTitle(): string {
  const s = app.session!;
  const lv = s.session.level;
  return lv.name ? levelLabel(lv) : (s.session.mode === "tutorial" && app.lesson ? T(app.lesson.title) : lv.id);
}

// ------------------------------------------------------------------ first-play coach (main.js coachContent)
function controlTip(step: string): string {
  const touch = primaryPointer() === "coarse";
  switch (step) {
    case "select": return touch ? T("Tap a brass pin to select it — or use the buttons under “Pins you can pull”, or the arrow keys.")
      : T("Click or hover a brass pin to select it — or use the buttons under “Pins you can pull”, or the arrow keys.");
    case "pull": return touch ? T("Selected. Now tap it again to pull it. One press on its button in the list also pulls it.")
      : T("Selected. Now click it again or press Enter to pull it. One press on its button in the list also pulls it.");
    case "flow": return T("Water falls and spreads sideways: blue water rescues villagers, orange lava is deadly. H = hint · Esc = pause & settings.");
    default: return "";
  }
}
export function coach(): Coach | null {
  const s = app.session;
  if (!s || s.session.screen !== "active") return null;
  const prog = platform.progress();
  const isTutorial = s.session.mode === "tutorial" && !!app.lesson;
  if (prog.coachDone && !isTutorial) return null;
  const st = s.session.state;
  const legal = s.legalActions();
  let step: string | null = null;
  if (!prog.coachDone) {
    if (st.stats.moves === 0) step = app.selectedPin && legal.length ? "pull" : "select";
    else if (st.stats.moves === 1) step = "flow";
    else { prog.coachDone = true; later(() => platform.persist()); }
  }
  if (!step && !isTutorial) return null;
  const stepIdx = { select: 1, pull: 2, flow: 3 }[step ?? "select"] ?? 1;
  const tut = Content.getTutorial();
  return {
    step: isTutorial ? T("Lesson {n} of {total}", { n: tut.findIndex((t) => t.level.id === s.session.level.id) + 1, total: tut.length })
      : step ? T("How to play · {n} of 3", { n: stepIdx }) : "",
    title: isTutorial ? T(app.lesson!.title) : step === "select" ? T("Choose a pin") : step === "pull" ? T("Pull it") : T("Watch the flow"),
    text: isTutorial ? T(app.lesson!.text) : controlTip(step!),
    tip: isTutorial && step ? controlTip(step) : "",
    dismiss: !!step,
  };
}
export function dismissCoach(): void {
  platform.progress().coachDone = true;
  platform.persist();
}

// ------------------------------------------------------------------ actions
export function selectPin(id: string): void { app.selectedPin = id; render.select(id); }
export function movePin(d: number): void {
  const s = app.session;
  if (!s) return;
  const legal = s.legalActions().map((a) => a.pinId);
  if (!legal.length) return;
  const i = Math.max(0, legal.indexOf(app.selectedPin ?? ""));
  selectPin(legal[(i + d + legal.length) % legal.length]!);
  sound("ack");
  announce(T("Pin {id}", { id: app.selectedPin! }));
}
export function pullPin(pinId: string): void {
  const s = app.session;
  if (!s || s.session.screen !== "active") return;
  const res = s.dispatch({ id: s.session.id + "-" + (++cmdCounter), type: "pull", pinId });
  if (!res.ok) {
    if (!res.duplicate) { sound("invalid"); announce(T("Cannot pull that pin: {reason}", { reason: res.error ?? "" }), true); }
    refresh();
    return;
  }
  for (const ev of res.events ?? []) {
    if (ev.type === "pull") sound("pull");
    else if (ev.type === "neutralize") sound("neutralize");
    else if (ev.type === "rescued") sound("flow");
  }
  app.selectedPin = null;
  app.hint = null;
  hintCancel?.();
  refresh();
  const st = s.session.state;
  announce(`${objectiveText()} ${T("Score {score}. Moves {n} of par {par}.", { score: s.score().total, n: st.stats.moves, par: st.par })}`);
  if (res.terminal && res.terminal.done) finishRound(res.terminal);
}
export function undo(): void {
  const s = app.session;
  if (!s) return;
  const r = s.undo();
  if (r.ok) { sound("undo"); app.selectedPin = null; app.hint = null; refresh(); }
  else announce(T("Undo: {reason}", { reason: r.error ?? "" }), true);
}
let hintCancel: (() => void) | null = null;
/** Solve from the CURRENT position (main.js: a hint that names a losing pin is worse than none). */
export function hint(): void {
  const s = app.session;
  if (!s) return;
  hintCancel?.();
  app.hintPending = true;
  const mine = s;
  hintCancel = solve.hint(s.session.state, (res) => {
    hintCancel = null;
    app.hintPending = false;
    if (app.session !== mine) return;
    const first = res.first ?? "";
    app.hint = res.solvable ? () => T("Try pin {id} — it is on a winning line from here.", { id: first })
      : res.reason === "node-budget-exceeded" ? () => T("Hint search limit reached — try another move.")
      : () => T("No winning line from this position — undo (practice) or retry.");
    announce(app.hint());
  });
}
export function pause(): void {
  const s = app.session;
  if (!s || s.session.screen !== "active") return;
  s.transition("paused", "user-pause");
  audio.setSuspended(true);
  open("pause");
}
export function resume(): void {
  const s = app.session;
  if (!s) return;
  s.transition("active", "resume");
  audio.setSuspended(false);
  app.overlay = null;
  app.openedFrame = frame().frame;
  ui.setFocus(null);
  refresh();
}
export function retry(): void {
  const s = app.session!;
  const m = s.session.mode;
  startLevel(s.session.level, m, m === "tutorial" ? app.lesson : null);
}
export function next(): void {
  const s = app.session!;
  if (s.session.mode === "tutorial") {
    const tut = Content.getTutorial();
    const li = tut.findIndex((t) => t.level.id === s.session.level.id);
    if (li >= 0 && li + 1 < tut.length) { const l = tut[li + 1]!; startLevel(l.level, "tutorial", l); return; }
    showTitle();
    return;
  }
  const idx = app.journey.findIndex((l) => l.id === s.session.level.id);
  if (idx >= 0 && idx + 1 < app.journey.length) startLevel(app.journey[idx + 1]!, "journey");
  else showTitle();
}
export function quitToTitle(): void {
  const s = app.session;
  if (s) { s.saveSnapshot(LAST); s.transition("title", "quit"); }
  audio.setSuspended(false);
  open("title");
}
/** Continue saved game (main.js continueSaved): the snapshot rescue-pins:last, a Daily's castle from the worker. */
export function continueSaved(): void {
  let doc: { levelId?: string; mode?: string } | null = null;
  try { doc = JSON.parse(platform.deviceKV.getItem(LAST) || "null") as { levelId?: string; mode?: string } | null; } catch { doc = null; }
  const id = doc?.levelId ?? "";
  const resume = (lv: LevelDef | null): void => {
    if (!lv || !doc) { toast(T("No saved game to continue.")); announce(T("No saved game to continue."), true); return; }
    const s = createSession({ storage: platform.deviceKV, level: lv, mode: doc.mode || "journey", now: Math.round(platform.nowMs()) });
    if (!s.loadSnapshot(LAST, () => lv)) {
      toast(T("Saved game was corrupted and could not be restored."));
      return;
    }
    app.session = s;
    cmdCounter = 0;
    app.lesson = doc.mode === "tutorial" ? (Content.getTutorial().find((t) => t.level.id === lv.id) ?? null) : null;
    app.selectedPin = null;
    app.hint = null;
    render.build(s.session.state, s.session.level, themeOf(s.session.level));
    const term = s.isTerminal();
    if (term.done) {
      s.transition("results", term.reason ?? "");
      const st = s.session.state;
      app.results = { won: term.won, reason: term.reason, score: s.score(), moves: st.stats.moves, par: st.par, achievements: [], dailyNote: null, board: null, lb: null };
      open("results");
    } else {
      s.transition("active", "resume-saved-game");
      app.overlay = null;
      app.openedFrame = frame().frame;
      refresh();
    }
  };
  if (id.startsWith("daily-")) {
    app.preparing = true;
    app.countdown = "";
    open("countdown");
    solve.daily(parseInt(id.slice(6), 10), (lv) => { app.preparing = false; resume(lv); });
  } else resume(findLevel(id));
}
function findLevel(id: string): LevelDef | null {
  for (const t of Content.getTutorial()) if (t.level.id === id) return t.level;
  return app.journey.find((l) => l.id === id) ?? null;
}
/** A completed level's theme (a Daily's without generating it). */
function themeOfId(id: string): string | undefined {
  const lv = findLevel(id);
  if (lv) return lv.theme;
  const m = /^daily-(\d+)$/.exec(id);
  return m ? Content.dailyTheme(Number(m[1])) : undefined;
}

/** main.js finishRound: progress, achievements, streak, the score post, the results. */
function finishRound(term: Terminal): void {
  const s = app.session!;
  sound(term.won ? "win" : "lose");
  s.session.elapsedMs = Math.round(platform.nowMs()) - s.session.startedAt;
  platform.deviceKV.removeItem(LAST);
  const score = s.score();
  const lv = s.session.level;
  const prog = platform.progress();
  let newly: Achievement[] = [];
  if (term.won) {
    prog.completed[lv.id] = true;
    if (!prog.bestScores[lv.id] || score.total > prog.bestScores[lv.id]!) prog.bestScores[lv.id] = score.total;
    if (s.session.mode === "tutorial") prog.tutorialDone = true;
    prog.rescuedTotal = (prog.rescuedTotal | 0) + s.session.state.stats.savedCount;
    if (s.session.mode === "daily" && lv.daily) {
      // one entry per completed UTC day; consecutive days build the streak
      prog.streakDays = [...new Set([...(prog.streakDays || []), lv.daily])].sort((a, b) => a - b);
    }
    const ev = Achievements.evaluateAchievements(prog, themeOfId);
    prog.achievements = ev.unlocked;
    newly = ev.newly.map((k) => Achievements.achievementByKey(k)).filter((a): a is Achievement => !!a);
    platform.persist();
  }
  s.transition("results", term.reason ?? "");
  const st = s.session.state;
  const r: Results = {
    won: term.won, reason: term.reason, score, moves: st.stats.moves, par: st.par, achievements: newly,
    dailyNote: s.session.mode === "daily" && term.won ? (platform.signedIn() ? T("Daily score kept on your profile.") : T("Daily score kept locally.")) : null,
    board: null, lb: null,
  };
  app.results = r;
  // Signed in: every finished level except lessons posts its total (score-script.js).
  if (platform.signedIn() && s.session.mode !== "tutorial") {
    r.lb = "posting";
    void platform.postScore(score.total).then((res) => {
      r.lb = res;
      if (s.session.mode === "daily" && term.won) void platform.topEntries(5).then((b) => { r.board = b; });
    });
  }
  open("results");
  announce(term.won ? T("Victory. Score {n}.", { n: score.total }) : T("Defeat. {why}", { why: reasonText(term.reason) }), true);
}
const REASON_TEXT: Record<string, string> = {
  "all-rescued": N("Every villager reached safety."),
  "hero-burned": N("Lava reached a villager."),
  "move-limit-exceeded": N("Out of moves for this stage."),
  "simulation-overflow": N("The flow could not settle."),
};
export function reasonText(reason: string | null): string { return reason && REASON_TEXT[reason] ? T(REASON_TEXT[reason]!) : ""; }
export function resultsLbLine(): string | null {
  const lb = app.results?.lb;
  if (!lb) return null;
  if (lb === "posting") return S("lbPosting");
  return !lb.posted ? S("lbNotPosted") : lb.rank ? S("lbRank", { rank: lb.rank }) : S("lbPosted");
}
export function signIn(): void { void requestSignIn().catch(() => undefined); }
export function invite(): void {
  const link = platform.inviteLink();
  if (!link) return;
  try { clipboard.writeText(link); toast(S("inviteCopied")); } catch { toast(S("inviteLink", { url: link })); }
}
export function replayTutorial(): void { startMode("learn"); }

// ------------------------------------------------------------------ keys and pads (main.js keydown)
onAction((e) => {
  if (!e.pressed || ui.capturingKeys()) return;
  const a = e.action;
  const s = app.session;
  if (app.overlay) {
    if (a !== "pause" || !fresh()) return;
    if (app.overlay === "pause") later(resume);
    else if (app.overlay === "help") later(backFromHelp);
    else if (app.overlay === "settings" || app.overlay === "modes" || app.overlay === "journey" || app.overlay === "progression") later(showTitle);
    return;
  }
  if (!s || s.session.screen !== "active") return;
  switch (a) {
    case "pause": later(pause); return;
    case "undo": later(undo); return;
    case "hint": later(hint); return;
    case "camera": render.reframe(); sound("ack"); return;
  }
  if (ui.focused() !== null && (a === "pull" || a === "prev" || a === "next")) {
    // Enter / Space / arrows on a focused rail or tray button are the button's (UI focus navigation)
    if (a === "pull") return;
    ui.setFocus(null);
  }
  if (a === "prev") movePin(-1);
  else if (a === "next") movePin(1);
  else if (a === "pull" && app.selectedPin) { const id = app.selectedPin; later(() => pullPin(id)); }
});

// ------------------------------------------------------------------ pointer and touch on the castle (main.js wirePointer)
/** The castle's view rectangle (the old canvas) in window pixels, set by screens.ts. */
export const view: render.Rect = { x: 0, y: 0, width: 0, height: 0 };
const inView = (x: number, y: number): boolean => x >= view.x && y >= view.y && x <= view.x + view.width && y <= view.y + view.height;
let downAt: { x: number; y: number; t: number } | null = null;
const taps: { x: number; y: number }[] = [];
let hover: { x: number; y: number } | null = null;
let lastTouch = -1e9;
function release(x: number, y: number): void {
  if (!downAt) return;
  const dist = Math.hypot(x - downAt.x, y - downAt.y) / frame().scale;
  const dt = now() - downAt.t;
  downAt = null;
  if (dist > 12 || dt > 0.6) return; // drag / long press, not a tap
  taps.push({ x, y });
}
onTouch((e) => {
  lastTouch = now();
  if (e.control || !e.primary) return;
  if (e.phase === "start") downAt = inView(e.x, e.y) ? { x: e.x, y: e.y, t: now() } : null;
  else if (e.phase === "end") release(e.x, e.y);
  else if (e.phase === "cancel") downAt = null;
});
onPointerButton((e) => {
  if (e.button !== 0 || now() - lastTouch < 0.6) return;
  if (e.pressed) downAt = inView(e.x, e.y) ? { x: e.x, y: e.y, t: now() } : null;
  else release(e.x, e.y);
});
onPointerMove((x, y) => { if (now() - lastTouch >= 0.6) hover = { x, y }; });
/** Taps on the castle: a tap on the selected pin pulls it, on another pin selects it; hovering selects (legal-target preview). */
function pointerInput(wasPlaying: boolean): void {
  const list = taps.splice(0);
  const h = hover;
  hover = null;
  // a press that closed a panel this frame belongs to that widget, not the castle
  if (!wasPlaying || !playing()) return;
  if (h && inView(h.x, h.y)) {
    const id = render.pick(h.x, h.y);
    if (id && id !== app.selectedPin) selectPin(id);
  }
  for (const p of list) {
    if (!inView(p.x, p.y)) continue;
    const id = render.pick(p.x, p.y);
    if (!id) continue;
    ui.setFocus(null);
    if (app.selectedPin === id) pullPin(id);
    else selectPin(id);
  }
}

// ------------------------------------------------------------------ the clock
let hidden = false;
onFixedUpdate(() => {
  if (hidden) return;
  clockMs += 1000 / 60;
  countdownTick();
});

// ------------------------------------------------------------------ boot and lifecycle
let lookKey = "";
function applyLook(): void {
  const f = frame();
  const k = `${f.quality}:${f.levelIndex}`;
  if (k === lookKey) return;
  lookKey = k;
  render.applyLook(lookFor(f.quality, f.levelIndex));
}
/** The title backdrop: the first journey castle with both lava and water, untouched (main.js showcase). */
function showcase(): void {
  const lv = app.journey.find((l) => Object.values(l.chambers || {}).some((c) => c.lava) && Object.values(l.chambers || {}).some((c) => c.water)) || app.journey[0]!;
  const s = createSession({ storage: platform.deviceKV, level: lv, mode: "journey", now: 0 });
  render.build(s.session.state, lv, themeOf(lv));
}
onStart(() => {
  setFixedRate(60);
  initStyles();
  platform.initPlatform();
  audio.loadSfx();
  audio.startAmbience();
  solve.warm();
  render.setReducedMotion(preferences().reducedMotion);
  render.setPalette(platform.options.palette);
  applyLook();
  app.journey = Content.getJourney();
  showcase();
  render.setActive(true);
  open("title");
});
onPreferencesChange((p) => render.setReducedMotion(p.reducedMotion));
platform.onOptionsChange(() => render.setPalette(platform.options.palette));
platform.onProgressMerged(() => { if (app.overlay === "title") announce(T("Progress restored from your StarHermit cloud save.")); });
onSessionEnded(() => toast(S("signedOut")));
onSuspend(() => {
  hidden = true;
  // backgrounding saves and pauses the stage (main.js visibilitychange)
  const s = app.session;
  if (s && s.session.screen === "active" && app.overlay === null) { s.saveSnapshot(LAST); pause(); }
  audio.setSuspended(true);
  platform.flush();
});
onResume(() => { hidden = false; if (app.overlay !== "pause") audio.setSuspended(false); });

let frameDt = 0;
onUpdate((dt) => {
  frameDt = dt;
  applyLook();
  applyTokens(ui.preferences().highContrast);
  audio.update();
  const t = now();
  app.toasts = app.toasts.filter((x) => x.until >= t);
});
onRender(() => {
  const wasPlaying = playing();
  drawScreens();
  for (const fn of pending.splice(0)) fn();
  pointerInput(wasPlaying);
  const f = frame();
  render.update(frameDt, f.width, f.height, view);
  flushAnnouncements();
});
