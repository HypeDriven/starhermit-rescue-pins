// The game's data and the StarHermit platform, on the runtime's modules (what
// js/platform.js did over the JS SDK and localStorage):
// - the save (starhermit:storage `saves`, schema 1: on the device and in the
//   player's cloud slot) is the progression document (js/progress.js); two
//   devices' saves merge on a conflict (mergeProgression, as the browser
//   build did on its saveconflict); the slot the browser build wrote through
//   the JS SDK (game:<slug>, the checksummed progression) shows as foreign:
//   it is merged in and replaced once;
// - the saved game "Continue" resumes (the browser build's localStorage
//   rescue-pins:last snapshot) is kept in the device's key/value storage,
//   as before only on this device;
// - the game's own options (castle palette, captions, left-handed tray) are
//   engine `settings` (synced with the account); the browser build's values
//   in the account's settings KV (graphics.palette, captions,
//   controls.leftHanded) are adopted (unless set here since), then all its KV
//   keys are removed (volumes, mute, graphics quality, reduced motion,
//   contrast, larger text and the language are the runtime's Options);
// - the player, the invite link, the platform's clock for the Daily, posting a
//   finished level's total through score-script.js (a practice session whose
//   socket carries { type: 'result', scores }, as the JS SDK's submitScores
//   did) with the rank, and the board's top entries for the Daily results.
import type { JsonValue } from "starhermit:engine";
import {
  connectGame, inviteLink as fetchInviteLink, leaderboards, onPlayerChange, player, serverNow, serverTime, sessions, type Leaderboard,
} from "starhermit:platform";
import { saves, settings as store, storage } from "starhermit:storage";
import { ProgressModel, type KV, type Options, type Progress } from "./game.ts";

// --- the save --------------------------------------------------------------------------------
let data: Progress = ProgressModel.emptyProgress();
let lastSavedAt = 0;
const mergedListeners = new Set<() => void>();
/** fn() after progress from the account (another device, the browser build) was merged in. */
export function onProgressMerged(fn: () => void): void { mergedListeners.add(fn); }
function merged(): void { for (const fn of mergedListeners) fn(); }

function write(opts: { replaceForeign?: boolean } = {}): void {
  try {
    saves.save(data as unknown as JsonValue, { schema: 1, ...opts });
    lastSavedAt = saves.load()?.savedAt ?? lastSavedAt;
  } catch (e) { console.warn(`save: ${String(e)}`); }
}
/** The live progression (change it, then persist()). */
export function progress(): Progress { return data; }
/** Saves (the device at once, the account debounced by the runtime). */
export function persist(): void { write(); }
function adopt(other: unknown): boolean {
  const next = ProgressModel.mergeSave(other, data);
  if (ProgressModel.sameSave(next, data)) return false;
  data = next;
  write();
  return true;
}
saves.onConflict((mine, remote) => ({ merged: ProgressModel.mergeSave(remote.data, mine?.data ?? null) as unknown as JsonValue }));
saves.onStatus((_status, state) => {
  if (state === "foreign") { migrateForeign(); return; }
  const cur = saves.load();
  if (cur && cur.savedAt !== lastSavedAt) {
    lastSavedAt = cur.savedAt;
    if (adopt(cur.data)) merged();
  }
});
/** The browser build's cloud progression: merged with this device's save, saved over it once. */
function migrateForeign(): void {
  const old = saves.foreign();
  if (!old) return;
  const doc = old.text != null ? ProgressModel.readForeign(old.text) : null;
  let grew = false;
  if (doc) {
    const next = ProgressModel.mergeSave(doc, data);
    grew = !ProgressModel.sameSave(next, data);
    data = next;
  }
  write({ replaceForeign: true });
  if (grew) merged();
}

/** The sync line: null for a guest, else saving / synced / error (platform.js syncLabel). */
export function syncState(): "local" | "connecting" | "saving" | "synced" | "error" {
  if (!player()) return "local";
  const st = saves.state();
  if (st === "error" || st === "read-blocked") return "error";
  if (st === "loading") return "connecting";
  if (st === "foreign" || st === "uploading" || saves.status() === "pending") return "saving";
  return "synced";
}
export function flush(): void { void saves.flush().catch(() => undefined); }

/** The device's key/value storage as the Storage the session's snapshots use (rescue-pins:last). */
export const deviceKV: KV = {
  getItem: (k) => { try { return storage.getText(k); } catch { return null; } },
  setItem: (k, v) => { try { storage.set(k, String(v)); } catch (e) { console.warn(`storage: ${String(e)}`); } },
  removeItem: (k) => { try { storage.remove(k); } catch { /* gone */ } },
};

// --- the game's options -----------------------------------------------------------------------
export const options: Options = { ...ProgressModel.DEFAULT_OPTIONS };
const KEYS = ProgressModel.OPTION_KEYS;
const optionListeners = new Set<() => void>();
export function onOptionsChange(fn: () => void): void { optionListeners.add(fn); }
function optionsChanged(): void { for (const fn of optionListeners) fn(); }
function readOption(key: keyof Options): void {
  let v: JsonValue | undefined;
  try { v = store.get(key); } catch { return; }
  const ok = ProgressModel.pickOptions({ [key]: v })[key];
  if (ok !== undefined) (options as unknown as Record<string, unknown>)[key] = ok;
}
/** A migrated value, kept unless this game set the key since. */
function adoptOption(key: keyof Options, value: unknown): void {
  const v = ProgressModel.pickOptions({ [key]: value })[key];
  if (v === undefined) return;
  try {
    if (store.get(key) !== undefined) return;
    store.set(key, v as JsonValue);
    (options as unknown as Record<string, unknown>)[key] = v;
    optionsChanged();
  } catch { /* keep the device's */ }
}
/** Changes one of the game's options (device and account). */
export function setOption<K extends keyof Options>(key: K, value: Options[K]): void {
  if (options[key] === value) return;
  options[key] = value;
  try { store.set(key, value as JsonValue); } catch (e) { console.warn(`option ${key}: ${String(e)}`); }
  optionsChanged();
}
/** The browser build's settings KV: the game's options carry over (unless set here since), then all its keys go. */
function importLegacy(): void {
  const keys = store.legacyKeys();
  if (!keys) return;
  const kv: Record<string, unknown> = {};
  for (const key of keys) kv[key] = store.legacy(key);
  const old = ProgressModel.readLegacySettings(kv);
  for (const [k, v] of Object.entries(old.options)) adoptOption(k as keyof Options, v);
  if (old.tutorialDone && !data.tutorialDone) { data.tutorialDone = true; write(); }
  for (const key of keys) if (ProgressModel.BROWSER_KEYS.includes(key) || key.startsWith("ui.")) store.removeLegacy(key);
}

/** Reads the device's save and the game's options (from onStart). */
export function initPlatform(): void {
  const cur = saves.load();
  lastSavedAt = cur?.savedAt ?? 0;
  data = ProgressModel.normalize(cur?.data ?? null);
  for (const k of KEYS) readOption(k);
  store.onChange((key) => {
    if (!(KEYS as string[]).includes(key)) return;
    readOption(key as keyof Options);
    optionsChanged();
  });
  store.onLegacy(importLegacy);
  importLegacy();
  if (saves.state() === "foreign") migrateForeign();
  optionsChanged();
  refreshPlayer();
  void serverTime().then(() => undefined, () => undefined);
}

// --- the player and the clock -----------------------------------------------------------------
export function signedIn(): boolean { return !!player(); }
export function displayName(): string { return player()?.displayName ?? ""; }
let invite: string | null = null;
/** The invite link, fetched ahead so a button press can copy it at once. */
export function inviteLink(): string | null { return player() ? invite : null; }
function refreshPlayer(): void {
  invite = null;
  board = undefined;
  if (!player()) return;
  fetchInviteLink().then((u) => { invite = u; }, () => { invite = null; });
}
const playerListeners = new Set<() => void>();
export function onPlayer(fn: () => void): void { playerListeners.add(fn); }
onPlayerChange(() => { refreshPlayer(); for (const fn of playerListeners) fn(); });

/** Now in ms by the platform's clock when it has answered, else the device's (the Daily's UTC day). */
export function nowMs(): number {
  try { return serverNow() ?? Date.now(); } catch { return Date.now(); }
}

// --- the high-score board ---------------------------------------------------------------------
let board: Leaderboard | null | undefined;
async function highScoreBoard(): Promise<Leaderboard | null> {
  if (board !== undefined) return board;
  const list = await leaderboards.list();
  board = list.find((b) => b.key === "high-score") ?? list[0] ?? null;
  return board;
}
export interface BoardRow { name: string; score: number }
/** platform.js fetchLeaderboardEntries: the board's top entries (signed in), null when unavailable. */
export async function topEntries(n: number): Promise<BoardRow[] | null> {
  if (!player()) return null;
  try {
    const b = await highScoreBoard();
    if (!b) return null;
    const r = await leaderboards.entries(b.id, { pageSize: n });
    const rows = r.items.slice(0, n).map((e) => ({ name: e.displayName || e.username || "", score: Number.isFinite(e.score) ? e.score : 0 }));
    return rows.length ? rows : null;
  } catch { return null; }
}
export interface Posted { posted: boolean; rank: number | null }
/** Signed in only: post a finished level's total through score-script.js; { posted, rank }. Never rejects. */
export async function postScore(total: number): Promise<Posted> {
  const me = player();
  if (!me) return { posted: false, rank: null };
  const score = Math.max(0, Math.round(total));
  let accepted: string[] = [];
  try {
    const sessionId = await sessions.practice();
    accepted = await new Promise<string[]>((resolve) => {
      const socket = connectGame(sessionId);
      let done = false;
      const finish = (list: string[]): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.close();
        resolve(list);
      };
      const timer = setTimeout(() => finish([]), 15000);
      socket.on("open", () => { socket.sendCommand({ type: "result", scores: { "high-score": score } }); });
      socket.on("game", (d) => {
        const m = d as { type?: string; accepted?: string[] } | null;
        if (m && m.type === "result-ack") finish(Array.isArray(m.accepted) ? m.accepted : []);
      });
      socket.on("error", () => finish([]));
      socket.on("stopped", () => finish([]));
      socket.on("abandoned", () => finish([]));
    });
  } catch { return { posted: false, rank: null }; }
  if (!accepted.includes("high-score")) return { posted: false, rank: null };
  try {
    const b = await highScoreBoard();
    if (!b) return { posted: true, rank: null };
    const r = await leaderboards.entries(b.id, { pageSize: 100 });
    const mine = r.items.find((e) => e.userId === me.userId);
    return { posted: true, rank: mine ? mine.rank : null };
  } catch { return { posted: true, rank: null }; }
}
