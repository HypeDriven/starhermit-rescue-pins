# Known Issues / Fix Log

## Spec-gap pass: achievements, daily comparison, mastery track (2026-09-09)

- **No achievement system** despite spec §6 requiring "a small static
  achievement set: first completion, mechanic mastery, a sustained streak, a
  difficult content milestone, and an accessibility-neutral long-term goal."
  New `js/achievements.js` declares the five static achievements
  (`first-rescue`, `mechanic-mastery`, `daily-streak-7`, `ember-depths-veteran`,
  `guardian-hundred`) and a pure, idempotent `evaluateAchievements()`.
  `js/main.js` evaluates on every won round: progression gains `rescuedTotal`
  (villagers rescued, feeds the long-term goal) and daily wins append the UTC
  day seed to `streakDays` (feeds the consecutive-day streak). Unlocks are
  announced on the results screen; the full set with locked/unlocked state
  lives in Profile & Progress. (`js/session.js` progression defaults extended;
  older saves pick the new fields up via the existing spread merge.)
- **Results screen lacked the spec's "achievements" and "comparison" items.**
  Unlocked achievements now render on results; daily results also fetch
  `/api/v1/leaderboard?seed=<today>` (same online gate as the score submit) and
  show the top of today's board.
- **Mastery track (launch scope, spec §7) was invisible.** Journey stages
  already carried `difficulty.mastery` flags (one per theme); the journey grid
  now marks them with a ♛ (and "mastery test" in the button label/title), and
  Profile & Progress shows "Mastery track: N/5 theme-final stages cleared".
- **Shipped leaderboard still contained a test entry** (`tester-20514`) from
  before the server-test data-dir isolation fix. `data/leaderboard.json`
  reset to empty.
- New `tests/achievements.test.js` (set shape, unlock rules, streak math,
  idempotency, no-mutation); e2e extended to assert the results achievement
  section, the profile achievements/mastery lines, and the 5 ♛ markers.

**Verification:** `npm test` → 42 passing, 0 failing. `node tests/e2e.mjs` →
E2E PASS, desktop + mobile, no page errors.

## UI contrast + first-play guidance (2026-09-08)

- **Low-contrast UI.** Rails, buttons and panels were dark-on-dark with no
  borders; form controls rendered in the browser's light theme. `index.html`
  now uses a brighter palette (`--fg` #f3f6fa, `--dim` #b9c3d0, buttons
  #313b4c with a #5d6a80 border), rail/tray/panel dividers, `color-scheme:
  dark` with styled selects/checkboxes, accent-coloured section headings, and
  a yellow focus ring. Hint text is now a filled accent callout.
- **Low-contrast 3D scene.** Stone nearly matched the sky and chamber glass
  was invisible. `js/content.js` THEMES now use dark skies and pale stone;
  `js/render.js` adds a dark interior plate and white edge frame to every
  chamber, a dark slot behind each pin, thicker brass pins/rings, brighter
  water emissive and stronger lighting.
- **Selection ring drawn at the castle centre.** Pin groups sat at the
  origin (children carried the offset), so `select()` copied a zero position.
  Groups are now anchored at the pin's world position (`userData.base`) and
  the lift pose/marker use it.
- **Tutorial lesson text was invisible to sighted players** (only sent to
  the captions live region). New in-stage coach banner (`ui.coach`) shows the
  lesson title/text during Learn, plus a 3-step first-play walkthrough
  (choose a pin → pull it → watch the flow) on the first board of any mode.
  It is dismissable ("Got it"), persisted as `prog.coachDone`, and sits below
  the canvas as a flex sibling so it never covers the board.
- **Onboarding discoverability.** Title screen gains "How to play" (rule
  cards, previously only reachable from Pause) and accurate newcomer copy;
  mode select highlights Learn as "Recommended" until the tutorial is done;
  the pin list has a visible "Pins you can pull" heading; tutorial rails show
  the lesson title instead of the raw level id.
- **Stage sizing.** The canvas is now absolutely positioned inside its host
  and grid rows use `minmax(0, 1fr)`, so the stage can never grow past the
  shell (the coach used to slide under the tray).

**Verification:** `npm test` → 36 passing. `node tests/e2e.mjs` → E2E PASS,
desktop + mobile, no page errors.

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
