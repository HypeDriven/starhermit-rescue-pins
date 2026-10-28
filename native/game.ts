// The browser build's pure game modules (shared with the node tests), typed
// for this client: the rules (js/rules.js: chambers, pins, the deterministic
// flow resolution, scoring, the BFS solver), the content (js/content.js:
// themes, the five lessons, the 40 Journey stages from js/journey.js, the
// Daily generator), the session (js/session.js: validated commands, undo,
// replay envelope, snapshots), the achievements and the save model
// (js/progress.js).
import * as rules from "../js/rules.js";
import * as content from "../js/content.js";
import * as sessionMod from "../js/session.js";
import * as achievements from "../js/achievements.js";
import * as progress from "../js/progress.js";

export interface Cell { water: number; lava: number; hero: number; saved: number }
export interface Pin { id: string; a: [number, number]; b: [number, number] }
export interface LevelDef {
  id: string; seed: number; cols: number; rows: number; par: number; moveLimit?: number; contentVersion: number; theme: string;
  chambers: Record<string, { water?: number; lava?: number; hero?: number }>; pins: Pin[];
  name?: string; daily?: number; excluded?: boolean;
  difficulty?: { tier: number; depth: number; branching: number; mastery: boolean; challenge: boolean };
}
export interface State {
  rulesVersion: number; contentVersion: number; levelId: string; seed: number; cols: number; rows: number; par: number; moveLimit: number;
  chambers: Record<string, Cell>; pins: Pin[]; pulledPins: string[]; tick: number; status: "active" | "won" | "lost"; reason: string | null;
  heroTotal: number; stats: { invalid: number; neutralized: number; savedCount: number; moves: number };
}
export interface GameEvent { type: string; pinId?: string; c?: number; r?: number; amount?: number; reason?: string }
export interface Terminal { done: boolean; won: boolean; lost: boolean; reason: string | null }
export interface Score { saved: number; neutralized: number; parBonus: number; efficiency: number; invalidPenalty: number; total: number }
export interface Lesson { id: string; title: string; theme: string; text: string; level: LevelDef; mustPull: string[] }
export interface Theme { id: string; name: string; sky: number; stone: number; accent: number }
export interface Achievement { key: string; name: string; description: string }
export interface Progress {
  v: number; completed: Record<string, boolean>; bestScores: Record<string, number>; tutorialDone: boolean; streakDays: number[];
  achievements: string[]; rescuedTotal: number; coachDone?: boolean;
}
export interface Options { palette: "default" | "colorblind" | "highcontrast"; captions: boolean; leftHanded: boolean }
export interface SessionData {
  id: string; screen: string; mode: string; level: LevelDef; practice: boolean; allowUndo: boolean; state: State;
  commandLog: { id: string; cmd: { type: string; pinId: string }; invalid?: boolean; hashAfter: string }[];
  startedAt: number; elapsedMs: number;
}
export interface Session {
  session: SessionData;
  transition(to: string, reason: string): void;
  dispatch(cmd: { id: string; type: string; pinId: string }): { ok: boolean; error?: string; duplicate?: boolean; events?: GameEvent[]; terminal?: Terminal };
  undo(): { ok: boolean; error?: string };
  saveSnapshot(key: string): string;
  loadSnapshot(key: string, resolver: (id: string) => LevelDef | null): unknown;
  legalActions(): { type: string; pinId: string }[];
  isTerminal(): Terminal;
  score(): Score;
}
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

interface RulesApi {
  solveState(s: State, maxNodes?: number): { solvable: boolean; first?: string; reason?: string; nodes?: number };
  solveLevel(l: LevelDef, maxNodes?: number): { solvable: boolean; solution?: string[]; reason?: string };
  hashString(s: string): string;
}
interface ContentApi {
  THEMES: Theme[]; getTutorial(): Lesson[]; getJourney(): LevelDef[]; getDailyLevel(day: number): LevelDef;
  dailySeedForDate(d: Date | number): number;
  dailyTheme(day: number): string;
}
interface AchievementsApi {
  ACHIEVEMENTS: Achievement[]; achievementByKey(k: string): Achievement | null;
  evaluateAchievements(p: Progress, themeOf: (id: string) => string | undefined): { unlocked: string[]; newly: string[] };
}
interface ProgressApi {
  emptyProgress(): Progress; normalize(raw: unknown): Progress; mergeSave(remote: unknown, local: unknown): Progress; sameSave(a: unknown, b: unknown): boolean;
  readForeign(text: string): Progress | null;
  DEFAULT_OPTIONS: Options; OPTION_KEYS: (keyof Options)[]; BROWSER_KEYS: string[]; PALETTES: string[];
  pickOptions(raw: unknown): Partial<Options>; readLegacySettings(kv: Record<string, unknown>): { options: Partial<Options>; tutorialDone: boolean };
}

export const Rules = rules as unknown as RulesApi;
export const Content = content as unknown as ContentApi;
export const Achievements = achievements as unknown as AchievementsApi;
export const ProgressModel = progress as unknown as ProgressApi;
export const createSession = (sessionMod as unknown as {
  createSession(o: { storage: KV; level: LevelDef; mode: string; practice?: boolean; now?: number }): Session;
}).createSession;
