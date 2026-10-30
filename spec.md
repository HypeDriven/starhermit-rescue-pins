# Rescue Pins — Product and Game Specification

**Document status:** running specification of the shipped game (a StarHermit engine script game); §0 describes the implementation, the design sections below stay the contract.  
**Game index:** 53  
**Genre:** Sequencing puzzle  
**Players:** 1 player; optional asynchronous score comparison  
**Targets:** the StarHermit client (Windows, macOS, Linux) and browsers through the engine's web runtime — desktop and phones, landscape and portrait  
**Rendering direction:** a 3D castle on `starhermit:scene` (three.js r185 names) with the interface on `starhermit:ui`

## 0. Implementation on the StarHermit engine

Rescue Pins is a StarHermit engine **script game** (`starhermit.txt`: `engine.api=1`, `engine.entry=native/main.ts`, `engine.version=1.28.0`, `engine.minor=30`, capabilities `platform`, `storage`, `clipboard`). The StarHermit client plays it natively; browsers open `launch=index.html`, the engine's web loader that `npm run package` writes with `starhermit-files.json` (never edit them; repackage after every change).

- **Rules and content** are plain ES modules shared with the node tests: `js/rules.js` (chambers, pins, the flow resolution, scoring, the BFS solver), `js/content.js` (themes, five lessons, the Journey generator, the Daily generator), `js/journey.js` (the 40 Journey stages as the generator builds them, written by `tools/gen-levels.mjs`: the generator takes ~1 s in V8 and far longer natively; a unit test checks the table still matches), `js/session.js` (validated commands, undo, replay envelope, snapshots, `mergeProgression`), `js/achievements.js`, `js/progress.js` (the save model, old cloud slot and settings migration).
- **Client** (`native/*.ts`): `main.ts` (screen flow, actions, input, the fixed-step clock, lifecycle), `screens.ts` (`starhermit:ui`), `render.ts` (`starhermit:scene`), `audio.ts`, `platform.ts`, `quality.ts`, `style.ts`, `i18n.ts`, `solve.ts` + `solve-worker.js` (a `starhermit:script` module worker running the hint's solve and the Daily's generation off the game's thread).
- **Time:** 60 Hz fixed steps drive the countdown's 450 ms beats and the toasts, so play scripts replay exactly; the state changes only on commands (the rules resolve a pull at once, as before; the castle shows the settled state).

### Controls

| Action | Keys (rebindable in the runtime's Options) | Gamepad |
|---|---|---|
| Previous / next pin (`prev`, `next`) | ← ↑ A W / → ↓ D S | D-pad, left stick |
| Pull the selected pin (`pull`) | Enter, Space, Numpad Enter | South |
| Pause / resume (`pause`) | Escape | Start, East |
| Undo — Learn and Practice (`undo`) | U | West |
| Hint (`hint`) | H | North |
| Reset view (`camera`) | C | Right stick press |

Pointer: hovering a brass pin selects it (legal-target preview); a click on the selected pin pulls it, on another selects it. Touch: a tap selects, a second tap on the selected pin pulls it; a drag over 12 px or a press over 600 ms is not a tap. Every pin you can pull is also a button in the status rail (one press pulls it) and a named target ("Brass pin p1") for screen readers and play scripts. Arrow keys on a focused rail or tray button move the UI focus away and act on the pins; Enter / Space on a focused button press that button.

### Screens

Title (over the first lava-and-water castle) → Choose a mode (Learn recommended until the tutorial is done, Journey, Daily Challenge, Practice) → Journey grid (★ cleared, ♛ mastery stage; names carry par, move limit, best) → countdown ("Ready…", 2, 1) → the castle (left rail: stage, objective, moves / par / limit, theme; right rail: player, saved, score, the hint, the pins you can pull, the sync line; tray: Undo, Hint, Pause; the coach box under the castle) ⇄ Pause (Resume and the settings sections, Rule cards, Save & quit to title) → Results (headline, reason, score breakdown, pins pulled against par, achievements unlocked, the leaderboard line and, for a won Daily, the board's top 5; Retry, Next stage / Change stage, Menu). Also How to play (rule cards with the current key bindings), Settings (from the title), Profile & Progress, Continue saved game.

### Settings

The runtime's Options own volumes and mute, graphics quality (Auto and levels, render scale, adaptive resolution, frame-rate limit), language, larger text, high contrast and reduced motion (the game follows `preferences().reducedMotion` and `ui.preferences().highContrast`); Settings links to them (**Open Options**, **Key bindings**). The game's own options are engine settings (device and account): **Captions** (sound captions spoken through the screen-reader announcer), **Palette** (Default, Colorblind, High contrast: the castle's water, lava, villager, brass, selection colours) and **Left-handed tray** (tray order reversed).

### Layouts (logical px)

Wide (≥ 1024 wide): 240 px rails either side, tray at the bottom, the coach under the castle. Short landscape (≤ 480 tall, landscape): 150 px rails, compact tray, the coach floats over the castle's top without its tip line. Compact (otherwise; phones): the left rail above and the right rail below the castle (each ≤ 22% of the height, scrolling when taller; the theme name hidden), the coach under the castle, the tray at the bottom. Panels are ≤ 640 px wide and scroll when taller than 90% of the window.

### Checks

`npm test`: unit tests (rules, content incl. the Journey table, session, achievements, server, progress, i18n) and `tests/native.mjs` — the web index up to date, `tsc` against the generated host API, `starhermit check .` with zero warnings, and the play scripts in `tests/native/` (from `tools/gen-plays.mjs`: Journey 1–8 by keys on a desktop, the five lessons by finger on a DPR-3 phone with lesson 3 lost and retried, Practice sideways with Undo and the Hint, the menus with Save & quit and Continue, and today's Daily, generated at test time). `npm run test:browser` (`tools/browser-play.mjs`) plays the packaged game in Chrome on the GPU at desktop, phone (DPR 3) and landscape (DPR 3), failing on console errors or warnings.

### Known limitations

- Guests' browser-build localStorage progress (and its saved game) cannot migrate to the engine; signed-in players' cloud progression migrates.
- The browser build's per-effect graphics overrides, frame-rate readout and graphics summary are not offered: the runtime's Options choose a quality level.
- The synthesized fallback blips the browser build played while a sound clip decoded are not ported.
- The sound captions go to the screen-reader announcer only (as the browser build's live region did).

## 1. Product vision

Rescue Pins is a game in which players pull pins in sequence to route safe materials, isolate hazards, and rescue the character. Its signature setting is a cutaway storybook castle of brass pins and glass chambers. The product should feel immediately understandable, responsive within one input, and polished enough that the board or playfield itself is the visual hero. Sessions should begin quickly, make the next useful action obvious without solving the game for the player, and end with a clear explanation of score and progress.

The experience must be original. Do not copy names, layouts, characters, iconography, writing, audio, progression maps, or level data from an existing title. Use an original visual language, original procedural assets, and internally authored content.

### Design pillars

1. **Readable before spectacular:** legal actions, hazards, selection, ownership, and goals remain legible with effects disabled.
2. **One-input confidence:** every press, tap, drag, key, or pointer action gives immediate visual and sonic acknowledgment.
3. **Short path to play:** a returning player reaches the primary playfield in at most two deliberate actions.
4. **Fair mastery:** randomness is seeded and inspectable; outcomes never depend on hidden purchases or invisible stat boosts.
5. **Scalable beauty:** the same art direction survives low-power mobile hardware and high-resolution desktop displays.

## 2. Core game design

### Objective and rules contract

Pull pins in sequence to route safe materials, isolate hazards, and rescue the character.

The rules engine must represent legal actions independently from rendering. It must expose legal-action queries, deterministic resolution, serializable state, a monotonically increasing turn/tick number, and a terminal-state reason. Tutorials and hints call the same legal-action API used by play rather than duplicating rules.

### Core loop

The repeated loop is: **inspect chamber contents, pull one pin, simulate flow or gravity, and protect the subject**. Input is locked only during the shortest non-interruptible resolution phase. Cosmetic animation may continue after the logical state is ready, but skip/fast-forward must settle every object into the exact deterministic end state.

### Scoring and victory

Score safety and action efficiency; outcomes must follow visible physical rules. Results show a component breakdown rather than one unexplained total. Store integers for score and simulation units; format values only in presentation. Ties use, in order: primary objective completion, fewer invalid actions, lower authoritative elapsed time, then stable session identifier.

### Modes

- **Learn:** interactive lessons introduce one rule at a time and require the player to perform the action.
- **Journey:** authored progression with gradually combined mechanics and periodic mastery stages.
- **Daily:** one shared seed and ruleset per UTC day, synchronized to platform time.
- **Practice:** selectable difficulty, restart, undo where rules permit, and no effect on competitive rating.
- **Challenge:** constrained goals such as move limits, speed targets, altered layouts, or restricted tools.
- **Score chase:** asynchronous global and friends comparisons using validated seeds and rulesets.

### Difficulty and content generation

- Represent content as versioned data: identifier, seed, initial state, goals, allowed mechanics, par values, tutorial flags, and presentation theme.
- Run offline validators to prove basic legality, reachable goals, bounded duration, and absence of soft locks. Logic puzzles additionally require a unique or explicitly accepted solution class.
- Difficulty is measured from solution depth, branching factor, time pressure, motor precision, hidden information, and recovery options—not merely larger numbers.
- Introduce one new concept in isolation, combine it with one known concept, then test mastery before adding another.
- Daily seeds are immutable after publication. If content is defective, mark the day excluded from ranking rather than silently replacing it.

### Game-state model

`boot → title → profile-ready → mode-select → preparing → tutorial/countdown → active ↔ paused/reconnecting → resolving → results → progression`.

Every transition has one owner and an explicit reason. Backgrounding pauses solo simulation. In hosted play, the authoritative clock continues where rules require it, while the returning client receives a fresh snapshot and a concise “while you were away” summary.

## 3. Interaction and user-interface design

### Information hierarchy

1. **Primary:** playfield, current objective, legal interaction target, and immediate danger or turn state.
2. **Secondary:** score/progress, remaining moves or time, opponent/party status where applicable.
3. **Tertiary:** settings, social controls, cosmetics, help, and history.

The 3D castle fills the stage but is never the only UI: menus, text, settings and assistive descriptions are `starhermit:ui` widgets beside or over it, the pins are named targets over their projected positions, and the board state is mirrored as text.

### Responsive layouts

- **Wide desktop (≥1024 CSS px):** centered playfield, objective/progression rail on the left, contextual actions and social/status rail on the right. Maximum line length is 70 characters.
- **Compact desktop/tablet:** playfield remains central; secondary rails collapse into drawers. Pointer hover may preview but never be required.
- **Portrait mobile:** top safe-area status bar, square or perspective-fit playfield, bottom thumb-zone action tray, and sheet-based secondary panels. Never place critical controls under browser chrome or display cutouts. On portrait phones the rails tighten (theme name hidden) and the lesson coach is compact — full-width text with **Got it** on its step line — so the board keeps ~310 px of height during Learn on a 390×844 phone.
- **Landscape mobile:** reserve a narrow status rail; preserve at least 44×44 CSS-pixel targets and 8-pixel separation. Overlay panels are compacted so the results and mode-select buttons stay above the fold.
- **Toast:** bottom centre in play; while a panel (results, menus) is open it moves to the top edge.
- **Large screens:** the runtime's interface scale (window scale × the player's interface size) sizes the rails, coach, tray, panels and toasts; the castle fills the remaining stage at native resolution.
- React to resize, orientation, device-pixel-ratio, safe-area insets, virtual keyboard, and visibility changes without losing input or restarting the round.

### Screens and overlays

- **Title/home:** Play is dominant; daily challenge, journey progress, and profile are one level below; How to play and Settings sit on the bottom row. The first journey castle with lava renders behind the menu as a backdrop.
- **Settings (from the title):** the same Audio, Graphics, Display, Controls and Accessibility sections as the pause screen, with Back to title.
- **Mode setup:** show rules, expected duration, player count, assists, and whether the result is ranked before commitment.
- **Play HUD:** objective, progress, current actor/state, pause, and only context-relevant actions.
- **Pause/settings:** resume first; audio, graphics, display, controls, accessibility, help, and leave are clearly separated.
- **Results:** outcome headline, score breakdown, progress, achievements, comparison, replay/retry, and next recommended action.
- **Help:** visual rule cards generated from current control mappings and representative legal states.
- Daily challenge, local practice, pause, resume, results, and progression are first-class screens.

### Input

- Pointer/touch: raycast only against explicit interaction layers; use pointer capture for drags; cancel safely on lost capture.
- Touch: distinguish tap, drag, and camera gesture by distance/time thresholds; never require multi-touch for core play.
- Keyboard: directional navigation among legal targets, confirm, cancel, pause, undo/hint where valid, and camera reset.
- Gamepad: focus navigation, primary/secondary actions, pause, and remappable axes/buttons.
- Prevent accidental double commits with action identifiers, not arbitrary long debounce timers. Provide visible drag origin, target preview, and invalid-action explanation.

### Accessibility

- Full keyboard operation and visible focus; widget equivalents for the castle's pins (the rail's pin buttons, the pins' named targets); announcements for the objective, score, errors, captions and results.
- Color is reinforced by shape, texture, icon, or label. Include contrast-safe and common color-vision palettes.
- Reduced-motion mode removes camera swoops, shake, parallax, rapid particles, and large scaling while preserving event timing.
- Independent sliders for music, effects, ambience, and voice; captions/text cues for meaningful audio; no audio-only gameplay.
- Options for larger text, high contrast, left-handed controls, hold-versus-toggle, timing assistance, haptics off, and tutorial replay.
- Announce Three.js board state through a concise navigable model rather than describing every decorative object.

## 4. Visual and audio design

### Visual contract

The subject is the active playfield at near-tabletop to room scale, framed so state changes occupy most of the screen. The scene is a cutaway storybook castle of brass pins and glass chambers. Use an authored camera, original procedural geometry, restrained environmental storytelling, and a deterministic visual seed. The no-post-processing baseline must still communicate hierarchy, depth, selection, and state.

### Three.js scene design

- Use physically based lighting and color management with one dominant key, soft environment fill, and contact grounding. Gameplay colors are tested after tone mapping.
- Build reusable semantic meshes for active pieces, board cells, obstacles, targets, and environment modules. Geometry detail follows silhouette importance and camera distance.
- Use instancing for repeated pieces and props, pooled effects, texture atlases where appropriate, and explicit disposal on scene changes.
- Separate render layers for environment, gameplay, selection/ghosts, effects, and UI anchors. Cosmetic particles never intercept raycasts.
- Selection uses a combination of lift/pose, outline or rim, and grounded marker—not bloom alone. Legal targets preview before commit; invalid targets explain why.
- Event hierarchy: input acknowledgment < legal move < combo/goal < round completion. Reserve camera motion, strong emission, and dense particles for the highest tier.
- Audio uses original short transients tied to logical events, layered material impacts, quiet ambience, and adaptive music stems. Randomized pitch/variant is seeded for replay consistency where recording matters.

**Graphics.** `native/render.ts` ports the browser build's three.js r185 scene: ACES filmic tone mapping at exposure 1.05 / 0.6 (lights at 60%, so lit stone stays under the bloom threshold), a warm key directional light plus a sky/ground hemisphere fill (r185 intensities), the torches' point lights (3 × 0.6, distance 7, decay 1.6), `RoomEnvironment(renderer)` lowered 3.5 (r185's room) prefiltered with sigma 0.04 and assigned per material at the old `envMapIntensity` values, fog, the procedural canvases (brick, flowing lava, sky gradient, dust sprite). Per quality tier (`frame().quality`, `native/quality.ts` = the old `gfx.js` presets and budgets): Low — Lambert, plain detail, no post, MSAA; Balanced — Standard, 1024² shadows, bloom, grade, FXAA, reflections, detail, low particles; High — Physical glass/water/villagers/brass, 2048² shadows, GTAO, SMAA, bump-mapped brick, high particles; Ultra — 4096² shadows, full GTAO, MSAA, 512 px brick, 1.5× segments, full-resolution bloom and AO. Post effects are the runtime's `renderer.bloom` (0.5 / 0.45 / 0.9), `renderer.ao` (GTAO radius 0.6, exponent 1.5, blend 0.75), `renderer.grade` (linear, S-curve 0.22, saturation 1.1, cool shadows / warm highlights, vignette 0.24) and `renderer.antialias`. Dust motes scale within a tier by `frame().levelIndex` (≤ 2×, at most 320; embers are half). The glass fronts use opacity 0.018 on every tier (the engine blends in linear light, where the old Low value 0.12 washed the interiors grey). Ambient motion (villager bob, water meniscus, lava flow, torch flicker, dust and embers, the selection ring's spin, the pin lift) stops with reduced motion. A tier change rebuilds the castle when its assets change (the selected pin stays selected).

### Camera and motion

- Choose orthographic or low-distortion perspective according to depth requirements; expose framing constants rather than magic offsets.
- Camera transitions use authored duration/easing or critically damped springs and remain interruptible. Never animate by cumulative per-frame lerp.
- Decorative motion is paused or reduced when hidden. Gameplay animation derives from simulation state and interpolation alpha, not frame count.
- Camera shake is low-amplitude, event-tiered, disabled by reduced motion, and never changes raycast truth.

### Performance budgets

- Target 60 fps at the default tier and a stable 30 fps fallback on constrained mobile hardware.
- Default active gameplay: ≤150 draw calls desktop, ≤90 mobile; ≤350k visible triangles desktop, ≤140k mobile; transient particles ≤20k desktop and ≤5k mobile.
- Cap device pixel ratio by quality tier; dynamically lower render scale before dropping simulation rate. UI text remains native resolution.
- Avoid runtime shader compilation during active play by prewarming required variants. Avoid per-frame allocations in simulation/render loops.
- Quality tiers independently control shadows, environment detail, particles, post effects, antialiasing, and render scale; they never alter rules or visibility of hazards.

## 5. Technical architecture

### Client modules

- `rules` (`js/rules.js`): pure deterministic state transitions, legality, scoring, seeded random streams, the solver.
- `content` (`js/content.js`, `js/journey.js`): versioned levels, themes, tutorials, the Daily generator, validation.
- `session` (`js/session.js`): commands with ids, undo, replay envelope, checksummed snapshots, progression merge.
- `progress` (`js/progress.js`): the engine save document, merge, the browser build's cloud slot and settings KV.
- `native/main.ts`: screen flow, actions, input routing, the fixed-step clock, lifecycle; `native/screens.ts`: the interface; `native/render.ts`: the castle; `native/audio.ts`: clips and the ambience pad; `native/platform.ts`: saves, options, player, clock, score posting; `native/solve.ts` + `solve-worker.js`: the hint and Daily searches on a worker.
- Localization: `js/strings.js` (tables), `js/lang.js` (lookup and locale choice), `js/sh-i18n.js` (account strings), `native/i18n.ts` (the runtime's interface language).

### Determinism, replay, and security

- Fixed simulation step where physics exists; quantize authoritative inputs and define stable collision/order rules.
- Use separate seeded random streams for rules, content decoration, and audiovisual variants. Cosmetic randomness never changes rules.
- Replay envelope: schema version, build/content version, seed, initial hash, timestamp offset, ordered commands, periodic state hashes, terminal result.
- Validate all network input for identity, session membership, turn/tick, bounds, rate, payload size, and legal action. Reject duplicates idempotently by command ID.
- Treat client clocks, scores, inventories, roles, physics outcomes, and completion claims as untrusted in competitive contexts.

### Loading and resilience

- The runtime loads the package; the Journey ships pre-generated (`js/journey.js`), the Daily is generated on a script worker behind "Preparing today's castle…". Sound clips load one at a time once the mixer runs; a clip still loading is silent.
- The last safe local snapshot (`rescue-pins:last`, device storage) backs **Continue saved game**.
- A hidden window saves the snapshot, pauses an active castle and silences the ambience.

## 6. StarHermit integration

### Packaging and launch
- The package is the game folder (`starhermit.txt` at its root); `.starhermitignore` leaves out tests, tools, docs, `server.js`, data and the sfx manifests. `server=score-script.js` names the platform script.
- Signed out, the title offers **Sign in with StarHermit** (`requestSignIn`); guests play fully offline. The Daily's UTC day comes from the platform's clock (`serverNow()`) when it has answered, else the device's.

### Identity, profile, presence, and preferences
- The player's display name (`player().displayName`) shows on the title, the status rail and Profile; the sync line shows Cloud save synced / saving / connecting / sync error.
- Progression is the engine save (`saves`, schema 1: device and account). A conflict between devices merges with `mergeProgression` (unions of completed stages, streak days and achievements, best score per stage, tutorial/coach kept, larger rescued total). The browser build's cloud slot (the checksummed progression in `game:<slug>`) shows as a foreign save: it is merged in and replaced once (`replaceForeign`); a broken checksum is ignored.
- The browser build's per-player settings KV (`audio`, `graphics`, `controls`, `captions`, `tutorialDone`, `ui.*`): the palette, captions and left-handed tray carry over to the game's engine settings (unless set since), then every one of those keys is removed.
- **Continue saved game** resumes the snapshot Save & quit (or hiding the window) wrote to the device's key/value storage.

### Localization
- Every player-facing string ships in nine locales: en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT — menus, coach, rails, tray, pin list, pin targets, the board mirror, captions, toasts, results, help, profile, content (themes, generated stage names, lessons, achievements). English source strings are the keys (`js/strings.js`; en-GB, es-ES and fr-CA list only their differences). The language is the runtime's interface language (Options › Language, else the account's preferred language, else the device's), and a change shows on the next frame without ending the castle.

### Discovery, activity, and social layer
- Signed in, the title shows **Invite a friend**, which copies the platform's invite link with a confirmation toast. No chat, voice or presence.

### Achievements and leaderboards
- Declare a small static achievement set: first completion, mechanic mastery, a sustained streak, a difficult content milestone, and an accessibility-neutral long-term goal. Keys are stable, lowercase identifiers; unlocks are idempotent.
- Provide global and friends-filtered boards for the primary metric plus a fair daily/weekly board. Include ruleset, content version, seed, assists, and duration with every submission; reject impossible or stale-version scores. Signed in, every finished level except tutorial lessons posts its total through a practice session (`sessions.practice()` + `connectGame`, as the JS SDK's `submitScores` did) whose `score-script.js` range-checks it and posts it to the `high-score` board, integer, higher is better, 0–100,000); the results screen shows "Leaderboard rank: #N" (or posted / not posted; strings in `js/sh-i18n.js`, nine locales). Won dailies also list the top 5 of that board (`leaderboards.list()` → `leaderboards.entries()`). Personal bests stay in the progression (the engine save, synced to the account when signed in); guests post nothing and show no line or board.
- For globally competitive boards, validate score claims through a lightweight authoritative script using replayable input logs and deterministic seeds. If validation is unavailable, label the board casual and apply plausibility/rate checks.
- Achievements stay local (part of the cloud-saved progression doc); the platform has no entitlement for catalog client-claims and `score-script.js` reports only scores; `server.js` is the local node:http dev backend.

### Sessions and transport
- The initial game is solo. Use an authoritative JavaScript Game Script only for seeded daily sessions, replay validation, and durable achievement delivery; ordinary practice can run locally and offline after initial load.
- A daily session records content version, seed, settings affecting difficulty, an ordered input log, score components, and final checksum. Reconnect from the durable session snapshot rather than trusting cached client state.
- Realtime rooms, peer relay, matchmaking, backfill, and voice are intentionally not used because they add no value to this ruleset.

### Publishing and operations
- The platform script ships inside the distribution and is declared with `server=score-script.js` (canonical copy in the games repo's `tools/score-script.js`); it range-checks scores but does not replay-validate them. Choose a digest-pinned container only if profiling proves the sandbox unsuitable; no initial design here requires one.
- Define control defaults, achievement metadata, and versioned settings before release. Publish immutable build assets, verify the launch path, maintain migration tests for saves, and expose no secret configuration to the client.
- Capture anonymous funnel events only for start, tutorial step, round end, retry, settings change, and error category. Avoid raw text, precise personal data, and cross-title tracking.

## 7. Content, economy, and retention

- Launch scope: tutorial sequence, at least 40 authored stages or equivalent procedural depth, daily challenge, practice, five visual themes, and a mastery track.
- Cosmetic rewards may alter materials, trails, board surrounds, ambience, or profile flourishes, but never hitboxes, timing windows, information, or power.
- Reward cadence: early feedback every session, meaningful unlock every 3–5 sessions, and long-term goals visible without manipulative countdowns.
- No real-money wagering, paid random rewards, forced advertising, energy pressure, punitive streak loss, or purchases that affect competitive outcomes.
- Notifications, if ever added by the host, are opt-in, frequency-capped, quiet-hour aware, and never use false urgency.

## 8. Analytics and privacy

Measure tutorial completion, first meaningful action time, session duration bands, level attempts, quit state, input modality, performance tier, reconnect success, and accessibility feature usage only in aggregate. Use random session identifiers, short retention, and explicit consent where required. Never collect message content, drawings, voice, private board notes, or exact pointer trails as analytics.

Success targets for the first public test: median first-play time under 20 seconds, tutorial completion above 80%, crash-free sessions above 99.5%, p95 input acknowledgment below 100 ms locally, and at least 95% of supported mobile sessions holding their selected frame-rate tier.

## 9. Testing and acceptance criteria

### Rules and content

- Unit-test every legal action, invalid-action reason, scoring component, terminal state, and serialization migration.
- Property-test deterministic replay: the same version, seed, and commands produce identical state hashes.
- Fuzz malformed commands and generated content; prove no hangs, NaN physics, impossible mandatory states, or unbounded loops.
- Golden-test representative easy, medium, hard, interrupted, resumed, and terminal sessions.

### Interface and accessibility

- Test pointer, coarse touch, keyboard-only, gamepad, screen reader, zoom to 200%, reduced motion, high contrast, safe areas, and both mobile orientations.
- Verify focus restoration after every modal, meaningful live announcements, no keyboard traps, and no hover-only instructions.
- Confirm all critical labels fit translated strings at 30% expansion and support right-to-left layout where localized.

### Graphics and performance

- `starhermit --render-check --quality low|balanced|high|ultra --script tests/native/journey-keys.play` checks each tier natively; `tools/browser-play.mjs` checks the web runtime on the GPU. Reference captures of the browser build (every preset, phone and landscape) were compared side by side during the port.
- Content generation and searches are timed natively: the Journey ships pre-generated, the Daily and the hint run on a worker.

### Platform and network

- Test expired/rotated tokens, privacy settings, rate limits, offline start, reconnect at each game state, duplicate commands, out-of-order events, server restart, and version mismatch.
- Verify achievement idempotency, leaderboard validation, friends-only filtering, cloud-save conflict handling, activity start/end pairing, and server-time countdown accuracy.
- For hosted sessions, test disconnect/rejoin, abandonment, timeout, invitation expiry, result reconciliation, replay access, moderation controls, and authoritative cheat attempts.

## 10. Definition of done and non-goals

This specification is ready for implementation when rules examples, content schema, wireframes for all responsive breakpoints, visual target frames, accessibility annotations, authoritative message schema, achievement definitions, leaderboard definitions, and performance test devices are approved.

This document does **not** authorize implementation, asset production, monetization work, native wrappers, real-money systems, or copying any existing product. The initial build should favor one excellent core loop and a coherent original visual identity over feature breadth.

## Runtime-provided options

Sound volumes and mute, graphics quality and frame-rate limit, language, larger text, high contrast, reduced motion and key / pad bindings are the StarHermit runtime's Options (the browser build's `game-options.js`, `ui-scale.js`, `sh-language.js` and `browser-guard.js` are gone with its page).
