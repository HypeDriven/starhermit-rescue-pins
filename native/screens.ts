// The browser build's DOM shell (js/ui.js + index.html's <style>) as
// starhermit:ui, built every frame over the castle: the left rail (stage
// name, objective, moves against par, theme), the right rail (status: player,
// saved, score, the hint, the pins you can pull as buttons, the sync line),
// the tray (Undo, Hint, Pause; mirrored for the left-handed tray), the coach
// box under the castle (first-play guidance and the lesson text), named
// targets over the brass pins (the old picking's DOM equivalent: screen
// readers and play scripts find them) and the board's text mirror, the
// toast, and every overlay panel (title, modes, journey, profile, help,
// settings, countdown, pause, results) over the dimmed castle. The old media
// queries are layouts picked by the window's logical size: wide (≥ 1024 px:
// three columns), short landscape (≤ 480 px tall: narrow rails either side)
// and compact (the rails above and below the castle). The castle view's
// rectangle goes to main.ts (view → render.ts).
import { frame, openMenu } from "starhermit:engine";
import { bindings, requestRebind } from "starhermit:input";
import * as draw from "starhermit:draw";
import * as ui from "starhermit:ui";
import { Achievements, ProgressModel } from "./game.ts";
import { N, S, T, levelLabel } from "./i18n.ts";
import * as platform from "./platform.ts";
import * as render from "./render.ts";
import {
  app, backFromHelp, coach, continueSaved, dismissCoach, fresh, hasSavedGame, hint, invite, later, levelTitle, next, objectiveText,
  pause, pullPin, quitToTitle, reasonText, replayTutorial, resultsLbLine, resume, retry, showHelp, showJourney, showModes,
  showProgression, showSettings, showTitle, signIn, sound, startDaily, startMode, startPicked, undo, view, themeOf,
} from "./main.ts";

// ------------------------------------------------------------------ layout
interface Layout { lw: number; lh: number; sc: number; wide: boolean; land: boolean }
function layoutNow(): Layout {
  const f = frame();
  const sc = ui.preferences().scale;
  const sa = f.safeArea;
  const lw = Math.max(1, (f.width - sa.left - sa.right) / sc), lh = Math.max(1, (f.height - sa.top - sa.bottom) / sc);
  const land = lw > lh && lh <= 480;
  return { lw, lh, sc, wide: lw >= 1024 && !land, land };
}
const lastSize = new Map<string, ui.Rect>();
function textWidth(text: string, style: string, kind?: "button" | "heading"): number {
  return ui.measureText(text, { ...(kind ? { kind } : {}), style: [style] }).width / ui.preferences().scale;
}
/** Text up to `width` wide: one label when it fits, else a paragraph. */
function para(text: string, width: number, cls = "text", id?: string): void {
  if (!text) return;
  let u = ui.style(cls);
  if (id) u = u.id(id);
  if (textWidth(text, cls) <= width) u.label(text);
  else u.paragraph(text, Math.max(20, width));
}
interface Btn {
  id: string; text: string; style?: string; act: () => void; disabled?: boolean; name?: string; selected?: boolean;
  content?: () => void; width?: number; height?: number;
}
const buttonWidth = (text: string, style: string): number => textWidth(text, style, "button") + 2;
function button(b: Btn): void {
  const style = b.style ?? "btn";
  const opts: ui.ButtonOptions = {};
  if (b.disabled) opts.disabled = true;
  if (b.selected !== undefined) opts.selected = b.selected;
  if (b.content) opts.content = b.content;
  else if (b.width != null && buttonWidth(b.text, style) > b.width) {
    // a label wider than its button wraps (labels don't)
    const inner = b.width - 36;
    opts.content = () => { ui.style(style === "btn-primary" ? "wrap-ink" : "wrap").paragraph(b.text, Math.max(20, inner)); };
  } else if (b.name && b.name !== b.text) opts.content = () => { ui.label(b.text); };
  const s: ui.Style = {};
  if (b.width != null) s.width = b.width;
  if (b.height != null) s.height = b.height;
  if (ui.style(style, s).id(b.id).button(b.name ?? b.text, opts) && fresh()) {
    later(() => { sound("ack"); b.act(); });
  }
}
/** Buttons at their own widths in rows that wrap at `width` (flex-wrap). */
function flow(label: string, list: Btn[], width: number, gap = 8, justify: "start" | "center" = "start"): void {
  const rows: Btn[][] = [[]];
  let used = 0;
  const bw = (b: Btn): number => Math.min(width, b.width ?? buttonWidth(b.text, b.style ?? "btn"));
  for (const b of list) {
    const w = bw(b);
    if (rows[rows.length - 1]!.length && used + gap + w > width) { rows.push([]); used = 0; }
    used += (rows[rows.length - 1]!.length ? gap : 0) + w;
    rows[rows.length - 1]!.push(b);
  }
  ui.column(label, () => {
    rows.forEach((row, ri) => ui.row(`${label}-r${ri}`, () => {
      for (const b of row) button({ ...b, width: bw(b) });
    }, { spacing: gap, width, justify, align: "center" }));
  }, { spacing: gap, width });
}
function toWindow(x: number, y: number, w: number, h: number): ui.Rect {
  const sc = ui.preferences().scale, sa = frame().safeArea;
  return { x: sa.left + x * sc, y: sa.top + y * sc, width: w * sc, height: h * sc };
}
/** A box over a logical rectangle drawn by a placed role-none widget. */
function paint(id: string, x: number, y: number, w: number, h: number, cls: string): void {
  if (w <= 0 || h <= 0) return;
  ui.place(id, { anchor: "top-start", x, y }, () => { ui.style(cls).widget("", { role: "none", size: { width: w, height: h } }); });
}

// ------------------------------------------------------------------ the frame
export function drawScreens(): void {
  const L = layoutNow();
  const f = frame();
  shell(L);
  overlay(L);
  toasts(L);
  if (app.focusNext) {
    const age = f.frame - app.openedFrame;
    if (age >= 1) ui.setFocus(app.focusNext);
    if (age >= 3) app.focusNext = null;
  }
}

// ------------------------------------------------------------------ the shell: rails, stage, coach, tray
const TRAY_MIN = 62;
function shell(L: Layout): void {
  const s = app.session;
  const active = !!s && s.session.screen !== "title" && app.overlay !== "title" && app.overlay !== "modes" && app.overlay !== "journey" &&
    app.overlay !== "progression" && app.overlay !== "settings" && !(app.overlay === "help" && app.helpReturn === "title");
  const trayH = Math.max(TRAY_MIN, (lastSize.get("tray-in")?.height ?? 0) / L.sc + (L.land ? 8 : 16) + 1);
  const bottom = L.lh - trayH;
  const c = active ? coach() : null;
  const coachH = c ? (lastSize.get("coach")?.height ?? 120 * L.sc) / L.sc : 0;
  let st: { x: number; y: number; w: number; h: number };
  if (L.wide || L.land) {
    const rw = L.wide ? 240 : 150;
    st = { x: rw, y: 0, w: L.lw - 2 * rw, h: bottom };
    railBox("rail-left", 0, 0, rw, bottom, (iw) => { if (active) leftRail(iw, L); });
    railBox("rail-right", L.lw - rw, 0, rw, bottom, (iw) => { if (active) rightRail(iw, L); });
    paint("edge-l", rw - 1, 0, 1, bottom, "edge");
    paint("edge-r", L.lw - rw, 0, 1, bottom, "edge");
  } else {
    const cap = 0.22 * L.lh;
    const lh = Math.min(cap, (lastSize.get("rail-left-in")?.height ?? 80 * L.sc) / L.sc + 16 + 1);
    const rh = Math.min(cap, (lastSize.get("rail-right-in")?.height ?? 80 * L.sc) / L.sc + 16 + 1);
    st = { x: 0, y: lh, w: L.lw, h: bottom - lh - rh };
    railBox("rail-left", 0, 0, L.lw, lh, (iw) => { if (active) leftRail(iw, L); });
    railBox("rail-right", 0, bottom - rh, L.lw, rh, (iw) => { if (active) rightRail(iw, L); });
    paint("edge-l", 0, lh - 1, L.lw, 1, "edge");
    paint("edge-r", 0, bottom - rh, L.lw, 1, "edge");
  }
  // the castle's view: the stage minus the coach (which floats over the stage's top in short landscape)
  const viewH = L.land || !c ? st.h : Math.max(80, st.h - coachH - 12);
  Object.assign(view, toWindow(st.x, st.y, Math.max(1, st.w), Math.max(1, viewH)));
  if (c && !L.land) paint("stage-bg", st.x, st.y + viewH, st.w, st.h - viewH, "stage-bg");
  tray(L, trayH, active);
  if (c) coachBox(c, L, st, viewH);
  if (active) pinTargets();
}
/** A .rp-rail panel at a logical rectangle; its content scrolls when taller. */
function railBox(id: string, x: number, y: number, w: number, h: number, build: (inner: number) => void): void {
  ui.place(id, { anchor: "top-start", x, y }, () => {
    ui.column(id, () => {
      const prev = lastSize.get(`${id}-in`);
      const padX = 14, padY = 8;
      const inner = h - 2 * padY;
      const scroll = !!prev && prev.height / ui.preferences().scale > inner + 1;
      const iw = w - 2 * padX - (scroll ? 14 : 0);
      const body = (): void => { lastSize.set(`${id}-in`, ui.column(`${id}-in`, () => build(iw), { spacing: 8, width: iw })); };
      if (scroll) ui.scrollArea(`${id}-scroll`, { width: w - padX - 2, height: inner }, body);
      else body();
    }, { style: "rail", width: w, height: h, spacing: 0, padding: { top: 8, bottom: 8, start: 14, end: 14 } });
  });
}
function stat(id: string, k: string, v: string, w: number): void {
  ui.row(id, () => {
    ui.style("stat-k").label(k);
    ui.spacer();
    ui.style("stat-v").id(`${id}-v`).label(v);
  }, { style: "stat", width: w, align: "center" });
}
/** .rp-rail-left: the stage name, objective, moves, theme. */
function leftRail(w: number, L: Layout): void {
  const s = app.session!, st = s.session.state;
  para(levelTitle(), w, "rail-title", "hud-title");
  para(objectiveText(), w, "objective", "hud-objective");
  stat("hud-moves", T("Moves"), st.moveLimit ? T("{n} / par {par} · limit {limit}", { n: st.stats.moves, par: st.par, limit: st.moveLimit })
    : T("{n} / par {par}", { n: st.stats.moves, par: st.par }), w);
  if (L.wide || L.land) para(T(themeOf(s.session.level).name), w, "dim", "hud-theme"); // portrait phones: decorative, hidden
}
/** .rp-rail-right: status, the hint, the pins you can pull, the sync line. */
function rightRail(w: number, L: Layout): void {
  const s = app.session!, st = s.session.state;
  para(T("Status"), w, "rail-title");
  if (platform.signedIn()) stat("hud-player", T("Player"), platform.displayName() || T("Player"), w);
  stat("hud-saved", T("Saved"), `${st.stats.savedCount} / ${st.heroTotal}`, w);
  stat("hud-score", T("Score"), String(s.score().total), w);
  if (app.hint) ui.column("hint-box", () => para(app.hint!(), w - 20, "hint-text", "hint-text"), { style: "hint", width: w });
  para(T("Pins you can pull"), w, "rail-title", "pins-h");
  const legal = s.session.screen === "active" || s.session.screen === "paused" || s.session.screen === "countdown" || s.session.screen === "tutorial"
    ? s.legalActions().map((a) => a.pinId) : [];
  if (!legal.length) para(T("No pins left to pull."), w, "dim", "pins-none");
  const pw = L.wide || L.land || w < 360 ? w : Math.min(w, 360);
  ui.column("pin-list", () => {
    for (const id of legal) {
      const label = T("Pin {id}", { id });
      button({ id: `pin-${id}`, text: label, style: "btn-pin", width: pw, selected: id === app.selectedPin,
        disabled: s.session.screen !== "active", act: () => pullPin(id) });
    }
  }, { spacing: 4, width: w, align: "center" });
  const sync = syncLine();
  if (sync) para(sync, w, "small", "sync-line");
}
function syncLine(): string | null {
  switch (platform.syncState()) {
    case "synced": return T("Cloud save synced");
    case "saving": return T("Cloud saving…");
    case "connecting": return T("Cloud connecting…");
    case "error": return T("Cloud sync error — local copy safe");
    default: return null;
  }
}
/** .rp-tray: Undo (practice and lessons), Hint, Pause — reversed for the left-handed tray. */
function tray(L: Layout, h: number, active: boolean): void {
  ui.place("tray", { anchor: "top-start", x: 0, y: L.lh - h }, () => {
    ui.column("tray-box", () => {
      const s = app.session;
      if (!active || !s) { lastSize.set("tray-in", { x: 0, y: 0, width: 0, height: 44 * L.sc }); return; }
      const canUndo = s.session.allowUndo && s.session.commandLog.length > 0 && s.session.screen === "active";
      const btns: Btn[] = [];
      if (canUndo) btns.push({ id: "btn-undo", text: T("↩ Undo (U)"), act: undo });
      btns.push({ id: "btn-hint", text: T("💡 Hint (H)"), act: hint, disabled: app.hintPending });
      btns.push({ id: "btn-pause", text: T("⏸ Pause (Esc)"), style: "btn-quiet", act: pause });
      if (platform.options.leftHanded) btns.reverse();
      const inner = L.lw - 16;
      lastSize.set("tray-in", ui.column("tray-in", () => flow("tray-row", btns, inner, 8, "center"), { width: inner }));
    }, { style: "tray", width: L.lw, height: h, align: "center", padding: L.land ? { top: 4, bottom: 4, start: 8, end: 8 } : 8 });
  });
}
/** The coach box (main.js coachContent): under the castle, over its top in short landscape. */
function coachBox(c: NonNullable<ReturnType<typeof coach>>, L: Layout, st: { x: number; y: number; w: number; h: number }, viewH: number): void {
  const m = L.wide ? 12 : 8;
  const w = st.w - 2 * m;
  const y = L.land ? st.y + 6 : st.y + viewH;
  const compact = !L.wide;
  ui.place("coach", { anchor: "top-start", x: st.x + m, y }, () => {
    const r = ui.row("coach-row", () => {
      const edgeH = Math.max(10, (lastSize.get("coach")?.height ?? 0) / L.sc - (L.land ? 12 : 20));
      ui.style("coach-edge").widget("", { role: "none", size: { width: 6, height: edgeH } });
      const dismissW = c.dismiss ? buttonWidth(T("Got it"), "btn-quiet") : 0;
      const bw = w - 28 - 6 - 12 - (c.dismiss ? dismissW + 12 : 0);
      ui.column("coach-body", () => {
        if (c.step) para(c.step, bw, "coach-step", "coach-step");
        if (c.title) para(c.title, bw, "coach-h", "coach-title");
        if (c.text) para(c.text, bw, "text", "coach-text");
        if (c.tip && !L.land) para(c.tip, bw, "coach-tip", "coach-tip");
      }, { spacing: compact ? 2 : 4, width: bw });
      if (c.dismiss) button({ id: "btn-coach", text: T("Got it"), style: "btn-quiet", act: dismissCoach });
    }, { style: "coach", width: w, spacing: 12, align: "start", padding: L.land ? { top: 6, bottom: 6, start: 10, end: 10 } : { top: 10, bottom: 10, start: 12, end: 12 } });
    lastSize.set("coach", r);
  });
}
/** Every pin you can pull as a named target over its handle and shaft, and the board's text mirror (the sr-only list). */
function pinTargets(): void {
  const s = app.session;
  if (!s || app.overlay) return;
  const st = s.session.state;
  for (const p of st.pins) {
    const r = render.pinScreenRect(p.id);
    if (!r || r.x + r.width < view.x || r.y + r.height < view.y || r.x > view.x + view.width || r.y > view.y + view.height) continue;
    ui.target(T("Brass pin {id}", { id: p.id }) + (app.selectedPin === p.id ? T(", selected") : ""), r, { role: "button" });
  }
  const lines = [T("Castle: {name}. {cols} columns, {rows} rows.", { name: levelTitle(), cols: st.cols, rows: st.rows })];
  for (let r = 0; r < st.rows; r++) {
    for (let c = 0; c < st.cols; c++) {
      const cell = st.chambers[c + "," + r]!;
      const bits: string[] = [];
      if (cell.water) bits.push(T("{n} water", { n: cell.water }));
      if (cell.lava) bits.push(T("{n} lava", { n: cell.lava }));
      if (cell.hero) bits.push(T("villager"));
      if (cell.saved) bits.push(T("rescued villager"));
      if (bits.length) lines.push(T("Row {r} column {c}: {list}.", { r: r + 1, c: c + 1, list: bits.join(", ") }));
    }
  }
  lines.push(T("{n} pins remain.", { n: st.pins.length }));
  ui.target(`${T("Board state")}: ${lines.join(" ")}`, { x: view.x, y: view.y, width: 1, height: 1 }, { role: "label" });
}

// ------------------------------------------------------------------ toasts
function toasts(L: Layout): void {
  if (!app.toasts.length) return;
  const w = Math.min(L.lw - 32, 480);
  const where = app.overlay ? { anchor: "top" as const, y: 8 } : { anchor: "bottom" as const, y: 16 };
  ui.place("toast-stack", where, () => {
    ui.column("toast-col", () => {
      app.toasts.forEach((t, i) => ui.column(`toast-${i}`, () => para(t.text, w - 34, "toast-text", `toast-${i}-text`), { style: "toast" }));
    }, { spacing: 6, align: "center" });
  });
}

// ------------------------------------------------------------------ overlay panels (.rp-overlay > .rp-panel)
function overlay(L: Layout): void {
  const o = app.overlay;
  if (!o) return;
  const w = Math.min(640, 0.92 * L.lw, 70 * 9 + 44);
  const pad = L.land ? 16 : 22;
  const inner = w - 2 * pad;
  const maxH = (L.land ? L.lh - 16 : 0.9 * L.lh) - 2;
  const key = `panel-${o}`;
  const prev = lastSize.get(key);
  const scroll = !!prev && prev.height / L.sc + 2 * (L.land ? 12 : pad) > maxH;
  const opening = frame().frame - app.openedFrame <= 6;
  const isOpen = ui.dialog(panelLabel(o), "", true, () => {
    ui.column("panel", () => {
      const iw = inner - (scroll ? 14 : 0);
      const body = (): void => { lastSize.set(key, ui.column(`${key}-in`, () => buildPanel(o, iw, L), { spacing: 12, width: iw })); };
      if (scroll) ui.scrollArea(`${key}-scroll`, { width: inner + 6, height: maxH - 2 * (L.land ? 12 : pad) }, body, opening ? { scrollTo: { top: 0 } } : undefined);
      else body();
    }, { style: "panel", width: w, spacing: 0, padding: L.land ? { top: 12, bottom: 12, start: pad, end: pad } : pad });
  });
  if (!isOpen && fresh()) {
    // Escape / the backdrop: the pause panel resumes, menus go back to the title
    if (o === "pause") later(resume);
    else if (o === "help") later(backFromHelp);
    else if (o === "modes" || o === "journey" || o === "progression" || o === "settings") later(showTitle);
  }
}
function panelLabel(o: Overlay): string {
  switch (o) {
    case "title": return "Rescue Pins";
    case "modes": return T("Choose a mode");
    case "journey": return T("Journey");
    case "progression": return T("Profile & Progress");
    case "help": return T("How to play");
    case "settings": return T("Settings");
    case "countdown": return T("Ready…");
    case "pause": return T("Paused");
    case "results": return app.results?.won ? T("Rescued!") : T("The castle claims another…");
    default: return "";
  }
}
type Overlay = NonNullable<typeof app.overlay>;
function buildPanel(o: Overlay, w: number, L: Layout): void {
  switch (o) {
    case "title": titlePanel(w); break;
    case "modes": modesPanel(w); break;
    case "journey": journeyPanel(w); break;
    case "progression": progressionPanel(w); break;
    case "help": helpPanel(w); break;
    case "settings": settingsPanel(w); break;
    case "countdown": countdownPanel(w); break;
    case "pause": pausePanel(w); break;
    case "results": resultsPanel(w); break;
  }
  void L;
}

function titlePanel(w: number): void {
  const prog = platform.progress();
  para("Rescue Pins", w, "h1", "title-h");
  para(T("Pull the pins. Spare the villagers."), w, "dim", "title-tag");
  button({ id: "btn-play", text: T("▶ Play"), style: "btn-primary", act: showModes });
  if (hasSavedGame()) button({ id: "btn-continue", text: T("Continue saved game"), act: continueSaved });
  if (platform.signedIn()) {
    para(T("Signed in as {name}", { name: platform.displayName() || T("Player") }), w, "dim", "title-player");
    const sync = syncLine();
    if (sync) para(sync, w, "dim", "title-sync");
  }
  flow("title-row", [
    { id: "btn-daily", text: T("Daily Challenge"), act: startDaily },
    { id: "btn-journey", text: T("Journey"), act: showJourney },
    { id: "btn-profile", text: T("Profile & Progress"), act: showProgression },
  ], w, 8);
  const done = Object.keys(prog.completed || {}).length;
  para(done ? T("Journey progress: {n}/40 stages cleared", { n: done }) : T("New here? Press Play, then pick Learn for five short lessons."), w, "dim", "title-progress");
  const row2: Btn[] = [
    { id: "btn-howto", text: T("How to play"), style: "btn-quiet", act: () => showHelp("title") },
    { id: "btn-settings", text: `⚙ ${T("Settings")}`, style: "btn-quiet", act: showSettings },
  ];
  if (platform.signedIn() && platform.inviteLink()) row2.push({ id: "btn-invite", text: S("invite"), style: "btn-quiet", act: invite });
  flow("title-row2", row2, w, 8);
  if (!platform.signedIn()) button({ id: "btn-signin", text: S("signIn"), act: signIn, width: Math.min(w, buttonWidth(S("signIn"), "btn")) });
}

const MODES: [string, string, string][] = [
  ["learn", N("Learn"), N("Five short lessons. One rule at a time. Unranked.")],
  ["journey", N("Journey"), N("40 authored castles across five themes.")],
  ["daily", N("Daily Challenge"), N("One shared castle per UTC day. Ranked.")],
  ["practice", N("Practice"), N("Pick a stage, undo allowed, unranked.")],
];
function modesPanel(w: number): void {
  const newcomer = !platform.progress().tutorialDone;
  para(T("Choose a mode"), w, "h2", "modes-h");
  if (newcomer) para(T("First time? Learn teaches the controls and rules one at a time."), w, "dim", "modes-first");
  for (const [id, name, desc] of MODES) {
    const on = newcomer && id === "learn";
    const iw = w - 36;
    button({
      id: `mode-${id}`, text: T(name), name: T(name), style: on ? "btn-mode-on" : "btn-mode", width: w, act: () => startMode(id),
      content: () => ui.column(`mode-${id}-face`, () => {
        ui.row(`mode-${id}-top`, () => {
          ui.style(on ? "mode-name-on" : "mode-name").label(T(name));
          if (on) ui.row(`mode-${id}-badge`, () => ui.style("badge-text").label(T("Recommended")), { style: "badge" });
        }, { spacing: 8, align: "center" });
        para(T(desc), iw, on ? "mode-desc-on" : "mode-desc");
      }, { spacing: 2, width: iw }),
    });
  }
  button({ id: "btn-back", text: T("Back"), style: "btn-quiet", act: showTitle });
}

function journeyPanel(w: number): void {
  const prog = platform.progress();
  para(T("Journey"), w, "h2", "journey-h");
  const gap = 6, min = 64;
  const cols = Math.max(1, Math.floor((w + gap) / (min + gap)));
  const cw = (w - (cols - 1) * gap) / cols;
  const J = app.journey;
  ui.column("stage-grid", () => {
    for (let r = 0; r * cols < J.length; r++) {
      ui.row(`stage-grid-r${r}`, () => {
        for (let i = r * cols; i < Math.min(J.length, (r + 1) * cols); i++) {
          const lv = J[i]!;
          const done = !!prog.completed[lv.id];
          const best = prog.bestScores[lv.id];
          const mastery = !!lv.difficulty?.mastery;
          const name = [levelLabel(lv), T("par {n}", { n: lv.par }), lv.moveLimit ? T("move limit {n}", { n: lv.moveLimit }) : null,
            mastery ? T("mastery test") : null, best ? T("best {n}", { n: best }) : null].filter(Boolean).join(" — ");
          const text = `${done ? "★" : "☆"} ${i + 1}${mastery ? " ♛" : ""}`;
          button({ id: `stage-${i + 1}`, text, name, style: done ? "btn-stage-done" : "btn-stage", width: cw, act: () => startPicked(lv),
            content: () => ui.label(text) });
        }
      }, { spacing: gap });
    }
  }, { spacing: gap, width: w });
  button({ id: "btn-back", text: T("Back"), style: "btn-quiet", act: showTitle });
}

function progressionPanel(w: number): void {
  const prog = platform.progress();
  para(T("Profile & Progress"), w, "h2", "prog-h");
  const done = Object.keys(prog.completed || {}).length;
  para(T("Stages cleared: {n}/40", { n: done }), w, "text", "prog-cleared");
  para(prog.tutorialDone ? T("Tutorial: complete") : T("Tutorial: not finished"), w, "text", "prog-tutorial");
  const mastery = app.journey.filter((l) => l.difficulty?.mastery);
  para(T("Mastery track: {n}/{total} theme-final stages cleared", { n: mastery.filter((l) => prog.completed[l.id]).length, total: mastery.length }), w, "text", "prog-mastery");
  const best = Object.entries(prog.bestScores || {});
  if (best.length) {
    ui.column("best-list", () => {
      best.slice(-8).forEach(([id, s], i) => para(`• ${id}: ${s}`, w - 20, "text", `best-${i}`));
    }, { spacing: 4, width: w, padding: { start: 20 } });
  }
  para(T("Achievements"), w, "rail-title", "ach-h");
  const unlocked = new Set(prog.achievements || []);
  ui.column("ach-list", () => {
    for (const a of Achievements.ACHIEVEMENTS) {
      const on = unlocked.has(a.key);
      para(`${on ? "✓" : "○"} ${T(a.name)} — ${T(a.description)}`, w, on ? "win" : "dim", `ach-${a.key}`);
    }
  }, { spacing: 6, width: w });
  para(platform.signedIn()
    ? T("Signed in as {name} · {sync}", { name: platform.displayName() || T("Player"), sync: syncLine() || T("cloud save") })
    : T("Progress is stored locally (versioned, checksummed)."), w, "dim", "prog-account");
  button({ id: "btn-back", text: T("Back"), style: "btn-quiet", act: showTitle });
}

const GLYPH: Record<string, string> = { "Arrow Up": "↑", "Arrow Down": "↓", "Arrow Left": "←", "Arrow Right": "→", Escape: "Esc", "Numpad Enter": "Num Enter" };
function keysFor(action: string): string {
  let list: string[] = [];
  try { list = bindings(action).filter((b) => b.device === "keyboard").map((b) => GLYPH[b.label] ?? b.label); } catch { /* not yet */ }
  return [...new Set(list)].join(" / ");
}
function helpPanel(w: number): void {
  para(T("How to play"), w, "h2", "help-h");
  const b = { confirm: keysFor("pull"), select: `${keysFor("prev")}, ${keysFor("next")}`, hint: keysFor("hint"), pause: keysFor("pause"), undo: keysFor("undo") };
  const rules: [string, string][] = [
    [T("Pull pins"), T("Tap or click a brass pin to select it, then tap it again to pull it. On a keyboard, choose a pin with {select} and press {confirm}. The pin list in the Status rail works too: one press pulls that pin.", b)],
    [T("Water rescues"), T("Water falls and flows sideways. A villager touched by water is rescued.")],
    [T("Lava kills"), T("A villager touched by lava is lost. The stage ends.")],
    [T("Steam"), T("Water and lava in the same chamber neutralize into inert steam.")],
    [T("Score"), T("Save villagers, waste no pins: beating par and avoiding mistakes raises your score.")],
    [T("Stuck?"), T("Press {hint} (or the Hint button) for a pin on a winning line. {pause} pauses and opens settings. {undo} undoes in Learn and Practice.", b)],
  ];
  ui.column("rule-cards", () => {
    rules.forEach(([title, text], i) => ui.column(`rule-${i}`, () => {
      para(title, w - 32, "card-h", `rule-${i}-h`);
      para(text, w - 32, "text", `rule-${i}-p`);
    }, { style: "rule-card", width: w, spacing: 4 }));
  }, { spacing: 8, width: w });
  button({ id: "btn-back", text: T("Back"), style: "btn-quiet", act: backFromHelp });
}

/** The pause panel's and the title's settings (ui.js settingsSections) — what the runtime's Options do not cover. */
function settingsSections(w: number, inGame: boolean): void {
  const o = platform.options;
  const section = (id: string, title: string, build: (iw: number) => void): void => {
    ui.column(id, () => { para(title, w - 28, "legend", `${id}-h`); build(w - 28); }, { style: "section", width: w, spacing: 8 });
  };
  section("set-audio", T("Audio"), (iw) => {
    para(T("Volumes, mute, graphics quality, language, larger text, high contrast and reduced motion are in the StarHermit Options."), iw, "dim", "options-note");
    flow("set-runtime", [
      { id: "btn-options", text: T("Open Options"), act: () => openMenu() },
      { id: "btn-rebind", text: T("Key bindings"), act: () => requestRebind() },
    ], iw, 8);
    toggleRow("set-captions", T("Captions"), o.captions, iw, (v) => platform.setOption("captions", v));
  });
  section("set-display", T("Display"), (iw) => {
    const names = [N("Default"), N("Colorblind"), N("High contrast")];
    const idx = Math.max(0, ProgressModel.PALETTES.indexOf(o.palette));
    ui.row("set-palette-row", () => {
      para(T("Palette"), iw * 0.4, "text", "set-palette-label");
      ui.spacer();
      const pick = ui.id("set-palette").select(T("Palette"), idx, names.map((n) => T(n)), { width: Math.min(iw * 0.58, 220) } as ui.WidgetOptions);
      if (pick !== idx) later(() => platform.setOption("palette", ProgressModel.PALETTES[pick] as typeof o.palette));
    }, { width: iw, align: "center", height: 48 });
  });
  section("set-controls", T("Controls"), (iw) => {
    para(T("Arrows/WASD: choose pin · Enter/Space: pull · Esc: pause/cancel · U: undo (practice) · H: hint · C: reset camera"), iw, "dim", "controls-note");
    toggleRow("set-left", T("Left-handed tray"), o.leftHanded, iw, (v) => platform.setOption("leftHanded", v));
  });
  section("set-a11y", T("Accessibility"), (iw) => {
    para(T("Every board state is mirrored as text for screen readers. No gameplay information is audio-only or color-only."), iw, "dim", "a11y-note");
    button({ id: "btn-replay", text: T("Replay tutorial"), act: replayTutorial });
  });
  if (inGame) {
    section("set-help", T("Help"), () => button({ id: "btn-rules", text: T("Rule cards"), act: () => showHelp("pause") }));
    section("set-leave", T("Leave"), () => button({ id: "btn-quit", text: T("Save & quit to title"), style: "btn-danger", act: quitToTitle }));
  }
}
/** A check box row (.rp-field; a role "checkbox" widget: built-in check box labels don't wrap). */
function toggleRow(id: string, label: string, on: boolean, w: number, set: (v: boolean) => void): void {
  ui.row(`${id}-row`, () => {
    para(label, w - 56, "text", `${id}-label`);
    ui.spacer();
    const res = ui.id(id).widget(label, {
      role: "checkbox", checked: on, size: { width: 44, height: 44 },
      draw: (r, st) => {
        const s = st.scale, box = 22 * s, bx = r.x + (r.width - box) / 2, by = r.y + (r.height - box) / 2;
        draw.roundRect(bx, by, box, box, 4, on ? "#8cf0b9" : "#313b4c");
        draw.strokeRoundRect(bx, by, box, box, 4, "#5d6a80", 2);
        if (on) draw.text("✓", bx + box / 2, by + 1 * s, { size: 17 * s, color: "#0c2418", align: "center", weight: "bold" });
      },
    });
    if (res.activated && fresh()) later(() => set(!on));
  }, { width: w, align: "center", spacing: 8, height: 44 });
}
function settingsPanel(w: number): void {
  para(T("Settings"), w, "h2", "settings-h");
  settingsSections(w, false);
  button({ id: "btn-back", text: T("Back"), style: "btn-quiet", act: showTitle });
}
function pausePanel(w: number): void {
  para(T("Paused"), w, "h2", "pause-h");
  button({ id: "btn-resume", text: T("Resume"), style: "btn-primary", act: resume });
  settingsSections(w, true);
}
function countdownPanel(w: number): void {
  if (app.preparing) para(T("Preparing today's castle…"), w, "h2", "countdown-prep");
  else ui.row("countdown-row", () => ui.style("countdown").id("countdown").label(app.countdown), { width: w, justify: "center" });
}
function resultsPanel(w: number): void {
  const r = app.results;
  if (!r) return;
  para(r.won ? T("Rescued!") : T("The castle claims another…"), w, r.won ? "win-h" : "lose-h", "results-h");
  const why = reasonText(r.reason);
  if (why) para(why, w, "text", "results-why");
  const sb = r.score;
  const rows: [string, number][] = [
    [N("Villagers saved: {n}"), sb.saved], [N("Hazards neutralized: {n}"), sb.neutralized],
    [N("Under-par bonus: {n}"), sb.parBonus], [N("Efficiency: {n}"), sb.efficiency],
    [N("Invalid-action penalty: {n}"), -sb.invalidPenalty],
  ];
  ui.column("score-list", () => {
    rows.forEach(([k, v], i) => { if (v) para(T(k, { n: v }), w, "text", `score-${i}`); });
    para(T("Total: {n}", { n: sb.total }), w, "total", "score-total");
  }, { spacing: 4, width: w });
  para(T("Pins pulled: {n} (par {par})", { n: r.moves, par: r.par }), w, "dim", "results-moves");
  if (r.achievements.length) {
    para(T("Achievements unlocked"), w, "rail-title", "results-ach-h");
    r.achievements.forEach((a, i) => para(`✓ ${T(a.name)} — ${T(a.description)}`, w, "win", `results-ach-${i}`));
  }
  const lb = resultsLbLine();
  if (lb) para(lb, w, "dim", "results-lb");
  if (r.board && r.board.length) {
    para(T("Leaderboard"), w, "rail-title", "results-board-h");
    r.board.forEach((e, i) => para(`${i + 1}. ${e.name}: ${e.score}`, w, "text", `results-board-${i}`));
  }
  flow("results-row", [
    { id: "btn-retry", text: T("Retry"), act: retry },
    { id: "btn-next", text: r.won ? T("Next stage") : T("Change stage"), style: "btn-primary", act: next },
    { id: "btn-menu", text: T("Menu"), style: "btn-quiet", act: showTitle },
  ], w, 8);
  if (r.dailyNote) para(r.dailyNote, w, "win", "results-daily");
}
