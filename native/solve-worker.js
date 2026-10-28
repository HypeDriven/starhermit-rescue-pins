// The searches off the game's thread (a starhermit:script module worker): the
// hint's breadth-first solve from the current position (rules.js solveState,
// as main.js's hint action ran it) and the Daily castle (content.js
// getDailyLevel: a generator that solves its candidates, up to seconds
// natively — longer than a frame may run). rules.js and content.js are the
// browser build's, unchanged.
// In:  { id, kind: "hint", state } | { id, kind: "daily", day }
// Out: { id, hint: { solvable, first?, reason? } } | { id, level } | { id, error }
import { solveState } from "../js/rules.js";
import { getDailyLevel } from "../js/content.js";

globalThis.onmessage = (e) => {
  const d = e.data;
  try {
    if (d.kind === "hint") postMessage({ id: d.id, hint: solveState(d.state) });
    else if (d.kind === "daily") postMessage({ id: d.id, level: getDailyLevel(d.day) });
  } catch (err) {
    postMessage({ id: d.id, error: String((err && err.message) || err) });
  }
};
