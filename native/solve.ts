// Requests to the search worker (native/solve-worker.js): a hint for the
// current position, or the Daily castle for a UTC day. Without a worker (it
// failed to start) the search runs on the game's thread, as the browser build
// ran it.
import { worker, type Worker } from "starhermit:script";
import { Content, Rules, type LevelDef, type State } from "./game.ts";

export interface HintResult { solvable: boolean; first?: string; reason?: string }
type Reply = { id: number; hint?: HintResult; level?: LevelDef; error?: string };
let w: Worker | null = null;
let failed = false;
let nextId = 1;
const waiting = new Map<number, (r: Reply | null) => void>();

function ensure(): Worker | null {
  if (w || failed) return w;
  try {
    w = worker("native/solve-worker.js", { type: "module" });
    w.on("message", (m) => {
      const r = m as unknown as Reply;
      const job = waiting.get(r.id);
      if (!job) return;
      waiting.delete(r.id);
      job(r);
    });
    // A long search reports "not responding" but goes on: the answer still comes.
    w.on("error", (msg) => { if (!/not responding/i.test(msg)) console.warn(`solve worker: ${msg}`); });
    w.on("stopped", () => {
      failed = true; w = null;
      for (const [id, job] of waiting) { waiting.delete(id); job(null); }
    });
  } catch (e) { console.warn(`solve worker: ${String(e)}`); failed = true; w = null; }
  return w;
}
/** Starts the worker ahead of the first request (its modules load meanwhile). */
export function warm(): void { ensure(); }

function ask(msg: Record<string, unknown>, sync: () => Reply, done: (r: Reply) => void): () => void {
  const run = (): void => { let r: Reply; try { r = sync(); } catch (e) { r = { id: 0, error: String(e) }; } done(r); };
  const wk = ensure();
  if (!wk) { run(); return () => undefined; }
  const id = nextId++;
  let cancelled = false;
  waiting.set(id, (r) => { if (cancelled) return; if (!r) run(); else done(r); });
  try { wk.post({ id, ...msg }); } catch (e) { waiting.delete(id); console.warn(`solve worker: ${String(e)}`); run(); }
  return () => { cancelled = true; waiting.delete(id); };
}

/** The solver's verdict from a position. Returns a cancel. */
export function hint(state: State, done: (r: HintResult) => void): () => void {
  return ask({ kind: "hint", state: JSON.parse(JSON.stringify(state)) as unknown },
    () => ({ id: 0, hint: Rules.solveState(state) }),
    (r) => done(r.hint ?? { solvable: false, reason: r.error ?? "error" }));
}
/** The Daily castle for a UTC day number. Returns a cancel. */
export function daily(day: number, done: (level: LevelDef | null, error?: string) => void): () => void {
  return ask({ kind: "daily", day }, () => ({ id: 0, level: Content.getDailyLevel(day) }), (r) => done(r.level ?? null, r.error));
}
