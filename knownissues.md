# Known Issues / Fix Log

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
