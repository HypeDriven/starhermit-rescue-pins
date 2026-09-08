# Known Issues / Fix Log

## Review fixes (2026-09-07)

- **Left-handed tray toggle crashed.** `js/ui.js` pause settings called
  `actions.setLeftHanded`, which did not exist in `js/main.js` — clicking it
  threw a `TypeError`. Added the action; it now persists the setting and
  flips the tray order via a `body.lefty` CSS class (applied on boot too).
- **Selection highlight lit up every pin.** All pin meshes shared one
  material, and `select()` writes `material.emissive` — so selecting one pin
  recolored them all. Each pin now gets its own material instance.
  (`js/render.js`; also removed a dead visibility line in `sync()`.)
- **A single invalid tap made daily scores unverifiable.** Invalid commands
  incremented `stats.invalid` (part of the state hash and score) but were not
  in the command log, so `verifyReplay` could never reproduce `finalHash`
  and the server would reject the run. Invalid attempts are now logged with
  `invalid: true` and replayed deterministically; an unflagged illegal
  command or a falsely flagged valid one is rejected as forgery.
  (`js/session.js`.)
- **Saved games could never be resumed.** Snapshots were written on quit and
  on backgrounding but nothing ever called `loadSnapshot`. The title screen
  now offers "Continue saved game" when a snapshot exists; finishing a round
  clears the stale snapshot. (`js/main.js`, `js/ui.js`.)
- **Keyboard dead ends with no pins left.** The key handler returned early
  when no legal pulls remained, disabling Esc (pause) and U (undo) exactly
  when undo is the only way back in practice. Pause/undo/hint/camera keys
  are now handled before the legal-pin check. (`js/main.js`.)
- **Retry re-announced stale tutorial text** on non-tutorial modes; the
  lesson caption is now passed only when retrying a tutorial level.
- **Countdown race:** a stale countdown timer could advance a newly started
  level; the timer now checks it still owns the current session.
- **Hints could name a losing pin** after the player deviated from the par
  solution. New `solveState()` in `js/rules.js` BFS-searches from the
  current position, so the hint is always on a real winning line (or says
  when none exists).
- **Daily API accepted any day's seed** (past or future) for ranked
  submission. `/api/v1/daily/verify` and leaderboard POST now accept only
  today's UTC seed plus a one-day grace. (`server.js`.)
- Added `LICENSE.md` (PolyForm Noncommercial 1.0.0) required at repo root.
- **Server tests polluted the shipped leaderboard.** `tests/server.test.js`
  wrote entries into `data/leaderboard.json`. The server's data dir is now
  overridable via `RESCUE_PINS_DATA_DIR`, and the test uses a temp dir.

**Verification:** `npm test` → 36 passing, 0 failing. `node tests/e2e.mjs`
(extended with the left-handed toggle and the continue-saved-game flow) →
E2E PASS, desktop + mobile, no page errors.

## E2E pin-click timeout (fixed)

**Symptoms:** `node tests/e2e.mjs` failed in `playToResults` with a Playwright
`locator.click: Timeout` on `.rp-pin-list` → `'Pin p1'`. Desktop timed out
waiting for the locator to resolve; mobile timed out with
`<canvas …> from <div class="rp-stage"> subtree intercepts pointer events`.

**Root cause (two distinct bugs in the game):**

1. **Pin buttons lost their `button` role.** `js/ui.js` `pinSelector()` set
   `role="listbox"` on the pin list and `role="option"` + `aria-selected` on
   each pin `<button>`, which **overrides** the element's native `button` role
   in the accessibility/role model. The pin list buttons are real action
   controls (clicking pulls the pin), so they must stay `button`-role. With the
   role masked, `getByRole('button', 'Pin p1')` matched 0 elements and the
   click waited forever. (This is what surfaced as the desktop "waiting for
   locator" timeout — not an overlay interceptor.)

2. **Oversized canvas overflowing the stage intercepted pointer events.**
   The WebGL renderer captured the container's size at first paint and kept a
   stale `height: 780px` inline size, while the `.rp-canvas-host`/`.rp-stage`
   shrank to ~406px once the rails were populated. On the mobile single-column
   layout the overflowing canvas hung down over `.rp-rail-right` and swallowed
   clicks on the pin buttons. On desktop (3-column grid) the canvas stays in
   its own column, so it did not overlap, which is why this only bit mobile.

**Fixes:**

- `js/ui.js` — `pinSelector()`: removed the `role="listbox"`/`role="option"`
  overrides so the pin list buttons keep their real `button` role. Selection is
  conveyed by the existing `.rp-selected` class plus `aria-pressed` (kept the
  list's `aria-label`).
- `index.html` — `.rp-canvas-host` now has `overflow: hidden`, so the canvas is
  clipped to the stage and can never take pointer events outside it.
- `js/render.js` — added a `ResizeObserver` on the container (disconnected on
  `dispose()`) and a matching `window.resize` cleanup, so the renderer re-fits
  the canvas to the host after reflow instead of trusting a stale first-paint
  size. This also fixes the 3D view's aspect ratio on reflow.

**Verification:**

- `node tests/e2e.mjs` → `E2E PASS — desktop + mobile playthroughs clean, no
  page errors` (exit 0).
- `npm test` → 32 passing, 0 failing, 0 skipped.
