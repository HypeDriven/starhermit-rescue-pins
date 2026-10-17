// Rescue Pins — semantic HTML DOM shell over/beside the canvas.
// All screens, keyboard operation, ARIA live regions, accessibility mirror.

import { PRESETS, CATEGORIES, presetTier, resolve, describe, choosePreset, setOverride } from './gfx.js';
import { gfxStrings } from './gfx-i18n.js';
import { shText } from './sh-i18n.js';
import { T, N } from './lang.js';

// Lazy text: a function that renders `key` in the current language.
const t = (key, vars) => () => T(key, typeof vars === 'function' ? vars() : vars);
// Display names for generated level names ("Emerald Keep 3", "Daily 2026-10-17").
export function levelLabel(level) {
  if (!level) return '';
  if (level.excluded) return T('Daily (excluded)');
  if (level.daily != null) return T('Daily {date}', { date: new Date(level.daily * 86400000).toISOString().slice(0, 10) });
  const m = /^(.*) (\d+)$/.exec(level.name || '');
  return m ? `${T(m[1])} ${m[2]}` : (level.name || '');
}

export function createUI(root, actions, settings) {
  // Every text set from a function is remembered so a language change can
  // re-render it in place (relabel), without rebuilding screens or moving focus.
  let bound = [];
  function tx(node, fn, attr) {
    const apply = () => { const v = fn(); if (attr) node.setAttribute(attr, v); else node.textContent = v; };
    apply();
    bound = bound.filter((b) => !(b.node === node && b.attr === attr)); // latest text wins
    bound.push({ node, attr, apply });
    if (bound.length > 4000) bound = bound.filter((b) => b.node.isConnected);
    return node;
  }
  function relabel() {
    bound = bound.filter((b) => b.node.isConnected);
    for (const b of bound) b.apply();
    if (gfxBox && gfxBox.isConnected) gfxBox.redraw();
  }
  let gfxBox = null;

  root.innerHTML = '';
  root.className = 'rp-root';

  // ---- persistent shell ----
  const shell = el('div', 'rp-shell');
  const railLeft = el('aside', 'rp-rail rp-rail-left');
  tx(railLeft, t('Objective and progression'), 'aria-label');
  const stage = el('div', 'rp-stage');
  const canvasHost = el('div', 'rp-canvas-host');
  const railRight = el('aside', 'rp-rail rp-rail-right');
  tx(railRight, t('Actions and status'), 'aria-label');
  const tray = el('nav', 'rp-tray');
  tx(tray, t('Primary actions'), 'aria-label');
  stage.appendChild(canvasHost);
  shell.append(railLeft, stage, railRight);
  root.append(shell, tray);

  // live regions
  const liveObjective = liveRegion(t('Objective'));
  const liveScore = liveRegion(t('Score'));
  const liveError = liveRegion(t('Errors'));
  const liveResults = liveRegion(t('Results'));
  const liveCaption = liveRegion(t('Audio captions'));
  root.append(liveObjective, liveScore, liveError, liveResults, liveCaption);

  // accessibility mirror: concise navigable text of board state
  const mirror = el('section', 'rp-mirror sr-only');
  tx(mirror, t('Board state in text'), 'aria-label');
  root.appendChild(mirror);

  const webglFallback = el('div', 'rp-webgl-fallback');
  webglFallback.setAttribute('role', 'alert');
  webglFallback.hidden = true;
  stage.appendChild(webglFallback);

  // in-stage coach banner: visible first-play guidance and tutorial lesson text
  const coachBox = el('aside', 'rp-coach');
  tx(coachBox, t('Guidance'), 'aria-label');
  coachBox.hidden = true;
  stage.appendChild(coachBox);

  const overlay = el('div', 'rp-overlay');
  overlay.hidden = true;
  root.appendChild(overlay);

  // transient confirmation toast (visible on every screen)
  const toastBox = el('p', 'rp-toast');
  toastBox.setAttribute('role', 'status');
  toastBox.hidden = true;
  root.appendChild(toastBox);
  let toastTimer = null;
  // While an overlay (results, menus) is open the toast sits at the top edge
  // and the overlay reserves its height (--toast-h, layout px of the equally
  // zoomed toast) so it never covers a heading or button.
  const fitToast = () => document.documentElement.style.setProperty('--toast-h',
    toastBox.hidden ? '0px' : `${toastBox.offsetHeight + 8}px`);
  function toast(msg, ms = 3200) {
    if (typeof msg === 'function') tx(toastBox, msg);
    else { bound = bound.filter((b) => b.node !== toastBox); toastBox.textContent = msg; }
    toastBox.hidden = false;
    fitToast();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastBox.hidden = true; fitToast(); }, ms);
  }

  // persistent sync badge: lives in the right rail; hud()/pinSelector()
  // re-append it after their periodic rail rebuilds
  const syncBadge = el('p', 'rp-dim rp-sync');
  syncBadge.hidden = true;
  railRight.appendChild(syncBadge);
  function setSync(text) {
    if (text) {
      if (typeof text === 'function') tx(syncBadge, text);
      else { bound = bound.filter((b) => b.node !== syncBadge); syncBadge.textContent = text; }
      syncBadge.hidden = false;
    }
    else syncBadge.hidden = true;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (typeof text === 'function') tx(e, text);
    else if (text !== undefined) e.textContent = text;
    return e;
  }
  function liveRegion(label) {
    const r = el('div', 'sr-only');
    r.setAttribute('aria-live', 'polite');
    tx(r, label, 'aria-label');
    r.setAttribute('role', 'status');
    return r;
  }
  function announce(region, msg) { region.textContent = ''; region.textContent = msg; }
  function button(label, cls, onClick) {
    const b = el('button', 'rp-btn ' + (cls || ''), label);
    b.type = 'button';
    b.addEventListener('click', () => { actions.uiAck(); onClick(); });
    return b;
  }

  // ---- screens ----
  function clearOverlay() { overlay.innerHTML = ''; overlay.hidden = true; }

  function showOverlay(panel) {
    overlay.innerHTML = '';
    overlay.appendChild(panel);
    overlay.hidden = false;
    const first = panel.querySelector('button');
    // preventScroll + reset: a low first button must not scroll the heading
    // away; every panel opens at its top.
    if (first) first.focus({ preventScroll: true });
    for (const n of [overlay, ...overlay.querySelectorAll('*')]) if (n.scrollTop) n.scrollTop = 0;
  }

  function titleScreen(prog, opts) {
    const p = el('section', 'rp-panel rp-title');
    p.appendChild(el('h1', '', 'Rescue Pins'));
    p.appendChild(el('p', 'rp-tag', t('Pull the pins. Spare the villagers.')));
    const play = button(t('▶ Play'), 'rp-btn-primary', () => actions.showModeSelect());
    p.appendChild(play);
    if (opts && opts.hasSave) {
      p.appendChild(button(t('Continue saved game'), '', () => actions.continueSaved()));
    }
    if (opts && opts.player) p.appendChild(el('p', 'rp-dim', t('Signed in as {name}', { name: opts.player })));
    if (opts && opts.sync) p.appendChild(el('p', 'rp-dim', opts.sync));
    const row = el('div', 'rp-row');
    row.append(
      button(t('Daily Challenge'), '', () => actions.startDaily()),
      button(t('Journey'), '', () => actions.showJourney()),
      button(t('Profile & Progress'), '', () => actions.showProgression()));
    p.appendChild(row);
    const done = Object.keys(prog.completed || {}).length;
    p.appendChild(el('p', 'rp-dim', done ? t('Journey progress: {n}/40 stages cleared', { n: done }) : t('New here? Press Play, then pick Learn for five short lessons.')));
    const row2 = el('div', 'rp-row');
    const settingsBtn = button(() => '⚙ ' + gfxStrings().settings, 'rp-btn-quiet', () => actions.showSettings());
    settingsBtn.id = 'rp-settings-btn';
    row2.append(button(t('How to play'), 'rp-btn-quiet', () => actions.showHelp('title')), settingsBtn);
    if (opts && opts.signedIn) {
      const inv = button(() => shText('invite'), 'rp-btn-quiet', () => actions.invite());
      inv.id = 'rp-invite-btn';
      row2.append(inv);
    }
    p.appendChild(row2);
    if (opts && opts.canSignIn && !opts.signedIn) {
      const si = button(() => shText('signIn'), '', () => actions.signIn());
      si.id = 'rp-signin-btn';
      p.appendChild(si);
    }
    showOverlay(p);
  }

  function modeSelectScreen(opts) {
    const newcomer = !(opts && opts.tutorialDone);
    const p = el('section', 'rp-panel');
    p.appendChild(el('h2', '', t('Choose a mode')));
    if (newcomer) p.appendChild(el('p', 'rp-dim', t('First time? Learn teaches the controls and rules one at a time.')));
    const modes = [
      ['learn', N('Learn'), N('Five short lessons. One rule at a time. Unranked.')],
      ['journey', N('Journey'), N('40 authored castles across five themes.')],
      ['daily', N('Daily Challenge'), N('One shared castle per UTC day. Ranked.')],
      ['practice', N('Practice'), N('Pick a stage, undo allowed, unranked.')],
    ];
    for (const [id, name, desc] of modes) {
      const b = button('', 'rp-btn-mode' + (newcomer && id === 'learn' ? ' rp-btn-primary' : ''), () => actions.startMode(id));
      b.appendChild(el('span', 'rp-mode-name', t(name)));
      if (newcomer && id === 'learn') b.appendChild(el('span', 'rp-badge', t('Recommended')));
      b.appendChild(el('small', 'rp-dim', t(desc)));
      p.appendChild(b);
    }
    p.appendChild(button(t('Back'), 'rp-btn-quiet', () => actions.showTitle()));
    showOverlay(p);
  }

  function journeyScreen(prog, journey) {
    const p = el('section', 'rp-panel rp-journey');
    p.appendChild(el('h2', '', t('Journey')));
    const grid = el('div', 'rp-stage-grid');
    journey.forEach((lv, i) => {
      const done = !!(prog.completed || {})[lv.id];
      const best = (prog.bestScores || {})[lv.id];
      const mastery = lv.difficulty && lv.difficulty.mastery;
      const b = button(`${done ? '★' : '☆'} ${i + 1}${mastery ? ' ♛' : ''}`, done ? 'rp-stage-done' : '', () => actions.startLevel(lv));
      const title = () => [levelLabel(lv), T('par {n}', { n: lv.par }), lv.moveLimit ? T('move limit {n}', { n: lv.moveLimit }) : null,
        mastery ? T('mastery test') : null, best ? T('best {n}', { n: best }) : null].filter(Boolean).join(' — ');
      tx(b, title, 'title');
      tx(b, title, 'aria-label');
      grid.appendChild(b);
    });
    p.appendChild(grid);
    p.appendChild(button(t('Back'), 'rp-btn-quiet', () => actions.showTitle()));
    showOverlay(p);
  }

  function progressionScreen(prog, extra) {
    const p = el('section', 'rp-panel');
    p.appendChild(el('h2', '', t('Profile & Progress')));
    const done = Object.keys(prog.completed || {}).length;
    p.appendChild(el('p', '', t('Stages cleared: {n}/40', { n: done })));
    p.appendChild(el('p', '', prog.tutorialDone ? t('Tutorial: complete') : t('Tutorial: not finished')));
    if (extra && extra.masteryTotal) {
      p.appendChild(el('p', '', t('Mastery track: {n}/{total} theme-final stages cleared', { n: extra.masteryDone, total: extra.masteryTotal })));
    }
    const best = Object.entries(prog.bestScores || {});
    if (best.length) {
      const ul = el('ul', 'rp-best-list');
      for (const [id, s] of best.slice(-8)) ul.appendChild(el('li', '', () => `${actions.levelName ? actions.levelName(id) : id}: ${s}`));
      p.appendChild(ul);
    }
    if (extra && extra.achievements && extra.achievements.length) {
      p.appendChild(el('h3', 'rp-rail-title', t('Achievements')));
      const ul = el('ul', 'rp-score-list');
      for (const a of extra.achievements) {
        ul.appendChild(el('li', a.unlocked ? 'rp-win' : 'rp-dim',
          () => `${a.unlocked ? '✓' : '○'} ${T(a.name)} — ${T(a.description)}`));
      }
      p.appendChild(ul);
    }
    if (extra && extra.account) p.appendChild(el('p', 'rp-dim', extra.account));
    p.appendChild(button(t('Back'), 'rp-btn-quiet', () => actions.showTitle()));
    showOverlay(p);
  }

  function countdownScreen(n) {
    const p = el('section', 'rp-panel rp-countdown');
    p.appendChild(el('h2', '', typeof n === 'function' ? n : String(n)));
    showOverlay(p);
  }

  const REASON_TEXT = {
    'all-rescued': N('Every villager reached safety.'),
    'hero-burned': N('Lava reached a villager.'),
    'move-limit-exceeded': N('Out of moves for this stage.'),
    'simulation-overflow': N('The flow could not settle.'),
  };

  function resultsScreen(result) {
    const p = el('section', 'rp-panel');
    p.appendChild(el('h2', result.won ? 'rp-win' : 'rp-lose', result.won ? t('Rescued!') : t('The castle claims another…')));
    const why = REASON_TEXT[result.reason];
    if (why) p.appendChild(el('p', '', t(why)));
    const sb = result.score;
    const ul = el('ul', 'rp-score-list');
    const rows = [
      [N('Villagers saved: {n}'), sb.saved], [N('Hazards neutralized: {n}'), sb.neutralized],
      [N('Under-par bonus: {n}'), sb.parBonus], [N('Efficiency: {n}'), sb.efficiency],
      [N('Invalid-action penalty: {n}'), -sb.invalidPenalty],
    ];
    for (const [k, v] of rows) if (v) ul.appendChild(el('li', '', t(k, { n: v })));
    ul.appendChild(el('li', 'rp-total', t('Total: {n}', { n: sb.total })));
    p.appendChild(ul);
    p.appendChild(el('p', 'rp-dim', t('Pins pulled: {n} (par {par})', { n: result.moves, par: result.par })));
    if (result.achievements && result.achievements.length) {
      p.appendChild(el('h3', 'rp-rail-title', t('Achievements unlocked')));
      const au = el('ul', 'rp-score-list');
      for (const a of result.achievements) au.appendChild(el('li', 'rp-win', () => `✓ ${T(a.name)} — ${T(a.description)}`));
      p.appendChild(au);
    }
    if (result.lbPost) {
      let lb = null;
      const line = el('p', 'rp-dim rp-lb-line', () => (!lb ? shText('lbPosting') : !lb.posted ? shText('lbNotPosted')
        : lb.rank ? shText('lbRank', { rank: lb.rank }) : shText('lbPosted')));
      p.appendChild(line);
      result.lbPost.then((r) => { lb = r; relabel(); });
    }
    if (result.board && result.board.length) {
      p.appendChild(el('h3', 'rp-rail-title', t('Leaderboard')));
      const ol = el('ol', 'rp-score-list');
      for (const e of result.board) ol.appendChild(el('li', '', `${e.name}: ${e.score}`));
      p.appendChild(ol);
    }
    const row = el('div', 'rp-row');
    row.append(
      button(t('Retry'), '', () => actions.retry()),
      button(result.won ? t('Next stage') : t('Change stage'), 'rp-btn-primary', () => actions.next()),
      button(t('Menu'), 'rp-btn-quiet', () => actions.showTitle()));
    p.appendChild(row);
    if (result.dailySubmit) p.appendChild(el('p', result.dailySubmit.ok ? 'rp-win' : 'rp-dim', result.dailySubmit.message));
    announce(liveResults, result.won ? T('Victory. Score {n}.', { n: sb.total }) : T('Defeat. {why}', { why: why ? T(why) : '' }));
    showOverlay(p);
  }

  function pauseScreen() {
    const p = el('section', 'rp-panel');
    p.appendChild(el('h2', '', t('Paused')));
    p.appendChild(button(t('Resume'), 'rp-btn-primary', () => actions.resume()));
    p.appendChild(settingsSections(true));
    showOverlay(p);
  }

  // Settings reachable from the title screen (the pause screen embeds the same sections)
  function settingsScreen() {
    const p = el('section', 'rp-panel');
    p.appendChild(el('h2', '', () => gfxStrings().settings));
    p.appendChild(settingsSections(false));
    p.appendChild(button(() => gfxStrings().back, 'rp-btn-quiet', () => actions.showTitle()));
    showOverlay(p);
  }

  function settingsSections(inGame) {
    const secs = el('div', 'rp-settings-sections');
    // audio
    secs.appendChild(settingsSection(t('Audio'), (sec) => {
      for (const [bus, name] of [['music', N('Music')], ['effects', N('Effects')], ['ambience', N('Ambience')]]) {
        sec.appendChild(slider(t(name), settings.audio[bus], v => actions.setVolume(bus, v)));
      }
      sec.appendChild(toggle(t('Mute all'), settings.audio.muted, v => actions.setMuted(v)));
      sec.appendChild(toggle(t('Captions'), settings.captions !== false, v => actions.setCaptions(v)));
    }));
    // graphics quality (presets, per-effect overrides, render scale); the
    // shared Sound / Language / Report sections (game-options.js) mount at the
    // end of this fieldset, after the controls box that redraws itself.
    const gfxSec = settingsSection(() => gfxStrings().graphics, (sec) => {
      const box = el('div', 'rp-gfx-controls');
      box.redraw = (focusId) => {
        box.innerHTML = '';
        graphicsControls(box);
        const f = focusId && box.querySelector('#' + focusId);
        if (f) f.focus();
      };
      gfxBox = box;
      sec.appendChild(box);
      graphicsControls(box);
    });
    gfxSec.classList.add('rp-gfx');
    gfxSec.id = 'rp-gfx-section';
    gfxSec.dataset.optionsGraphics = '';
    secs.appendChild(gfxSec);
    // display / readability
    secs.appendChild(settingsSection(() => gfxStrings().display, (sec) => {
      sec.appendChild(select(t('Palette'), [['default', N('Default')], ['colorblind', N('Colorblind')], ['highcontrast', N('High contrast')]], settings.graphics.palette, v => actions.setPalette(v)));
      sec.appendChild(toggle(t('Reduced motion'), settings.graphics.reducedMotion, v => actions.setReducedMotion(v)));
      sec.appendChild(toggle(t('High contrast'), settings.graphics.highContrast, v => actions.setHighContrast(v)));
      sec.appendChild(toggle(t('Larger text'), settings.graphics.textSize === 'large', v => actions.setTextSize(v ? 'large' : 'normal')));
    }));
    // controls
    secs.appendChild(settingsSection(t('Controls'), (sec) => {
      sec.appendChild(el('p', 'rp-dim', t('Arrows/WASD: choose pin · Enter/Space: pull · Esc: pause/cancel · U: undo (practice) · H: hint · C: reset camera')));
      sec.appendChild(toggle(t('Left-handed tray'), settings.controls.leftHanded, v => actions.setLeftHanded(v)));
    }));
    // accessibility
    secs.appendChild(settingsSection(t('Accessibility'), (sec) => {
      sec.appendChild(el('p', 'rp-dim', t('Every board state is mirrored as text for screen readers. No gameplay information is audio-only or color-only.')));
      sec.appendChild(button(t('Replay tutorial'), '', () => actions.startMode('learn')));
    }));
    if (inGame) {
      // help + leave
      secs.appendChild(settingsSection(t('Help'), (sec) => {
        sec.appendChild(button(t('Rule cards'), '', () => actions.showHelp()));
      }));
      secs.appendChild(settingsSection(t('Leave'), (sec) => {
        sec.appendChild(button(t('Save & quit to title'), 'rp-btn-danger', () => actions.quitToTitle()));
      }));
    }
    return secs;
  }

  // Graphics controls: every change applies immediately, persists, and the
  // controls box re-renders so "From preset (…)" labels and the summary stay true.
  function graphicsControls(sec) {
    const T = gfxStrings();
    const saved = actions.gfxSaved();
    const info = actions.gfxInfo();
    const detected = info ? info.detected : 'low';
    const r = info ? info.resolved : resolve(saved, detected);
    const apply = (next, focusId) => {
      actions.setGfx(next);
      sec.redraw(focusId);
    };
    const tierName = (t) => T.tier[t] || t;

    const presetOpts = [['auto', T.auto.replace('{tier}', T.preset[detected])], ...PRESETS.map(p => [p, T.preset[p]])];
    sec.appendChild(selectKV('gfx-preset', T.quality, presetOpts, PRESETS.includes(saved.preset) ? saved.preset : 'auto',
      v => apply(choosePreset(saved, v), 'gfx-preset')));

    // render scale 50–200 %
    const pct = Math.round((Number(saved.render_scale) || 1) * 100);
    const w = field(T.renderScale);
    w.classList.add('rp-scale');
    const box = el('span', 'rp-scale-box');
    const range = el('input');
    range.type = 'range'; range.min = '50'; range.max = '200'; range.step = '10'; range.value = String(pct);
    range.id = 'gfx-render-scale'; range.dataset.gfx = 'render_scale';
    range.setAttribute('aria-label', T.renderScale);
    const val = el('output', 'rp-scale-val', pct + '%');
    range.addEventListener('input', () => { val.textContent = range.value + '%'; });
    range.addEventListener('change', () => apply({ ...saved, render_scale: Number(range.value) / 100 }, 'gfx-render-scale'));
    box.append(range, val);
    w.appendChild(box);
    sec.appendChild(w);

    for (const [cat, tiers] of Object.entries(CATEGORIES)) {
      const opts = [['preset', T.fromPreset.replace('{tier}', tierName(presetTier(r.preset, cat)))], ...tiers.map(t => [t, tierName(t)])];
      sec.appendChild(selectKV('gfx-' + cat, T.cat[cat], opts, tiers.includes(saved[cat]) ? saved[cat] : 'preset',
        v => apply(setOverride(saved, cat, v), 'gfx-' + cat)));
    }
    sec.appendChild(toggleId('gfx-adaptive', T.adaptive, r.adaptive, v => apply({ ...saved, adaptive: v }, 'gfx-adaptive')));
    sec.appendChild(toggleId('gfx-show-fps', T.showFps, r.showFps, v => apply({ ...saved, show_fps: v }, 'gfx-show-fps')));

    const summary = el('p', 'rp-dim rp-gfx-summary');
    summary.id = 'gfx-summary';
    summary.setAttribute('aria-live', 'polite');
    const paint = () => {
      const i = actions.gfxInfo();
      const res = i ? i.resolved : r;
      summary.textContent = `${(i && i.gpu) || T.unknownGpu} · ${describe(res, i ? i.pixels : null, T.summary)}`;
      summary.dataset.preset = res.preset;
      note.hidden = !(i && i.postFailed);
    };
    const note = el('p', 'rp-dim rp-gfx-note', T.postUnavailable);
    note.id = 'gfx-post-note';
    note.setAttribute('role', 'note');
    sec.append(summary, note);
    paint();
    setTimeout(paint, 200); // pixel size / post state settle on the next frames
  }

  function selectKV(id, label, options, value, onChange) {
    const w = field(label);
    const s = el('select');
    s.id = id; s.dataset.gfx = id.replace(/^gfx-/, '');
    s.setAttribute('aria-label', label);
    for (const [v, text] of options) {
      const opt = el('option', '', text);
      opt.value = v;
      if (v === value) opt.selected = true;
      s.appendChild(opt);
    }
    s.addEventListener('change', () => onChange(s.value));
    w.appendChild(s);
    return w;
  }
  function toggleId(id, label, value, onChange) {
    const w = toggle(label, value, onChange);
    const i = w.querySelector('input');
    i.id = id; i.dataset.gfx = id.replace(/^gfx-/, '');
    return w;
  }

  function settingsSection(title, fill) {
    const sec = el('fieldset', 'rp-settings-section');
    sec.appendChild(el('legend', '', title));
    fill(sec);
    return sec;
  }
  // Field label text lives in its own span so a relabel never removes the control.
  function field(label) {
    const w = el('label', 'rp-field');
    w.append(el('span', 'rp-field-label', label), ' ');
    return w;
  }
  function slider(label, value, onChange) {
    const w = field(label);
    const i = el('input');
    i.type = 'range'; i.min = '0'; i.max = '1'; i.step = '0.05'; i.value = String(value);
    tx(i, label, 'aria-label');
    i.addEventListener('input', () => onChange(parseFloat(i.value)));
    w.appendChild(i);
    return w;
  }
  function toggle(label, value, onChange) {
    const w = field(label);
    const i = el('input');
    i.type = 'checkbox'; i.checked = !!value;
    i.addEventListener('change', () => onChange(i.checked));
    w.appendChild(i);
    return w;
  }
  function select(label, options, value, onChange) {
    const w = field(label);
    const s = el('select');
    tx(s, label, 'aria-label');
    for (const [o, name] of options) {
      const opt = el('option', '', t(name));
      opt.value = o;
      if (o === value) opt.selected = true;
      s.appendChild(opt);
    }
    s.addEventListener('change', () => onChange(s.value));
    w.appendChild(s);
    return w;
  }

  function helpScreen(bindings) {
    const p = el('section', 'rp-panel');
    p.appendChild(el('h2', '', t('How to play')));
    const cards = el('div', 'rp-rule-cards');
    const rules = [
      [t('Pull pins'), t('Tap or click a brass pin to select it, then tap it again to pull it. On a keyboard, choose a pin with {select} and press {confirm}. The pin list in the Status rail works too: one press pulls that pin.', bindings)],
      [t('Water rescues'), t('Water falls and flows sideways. A villager touched by water is rescued.')],
      [t('Lava kills'), t('A villager touched by lava is lost. The stage ends.')],
      [t('Steam'), t('Water and lava in the same chamber neutralize into inert steam.')],
      [t('Score'), t('Save villagers, waste no pins: beating par and avoiding mistakes raises your score.')],
      [t('Stuck?'), t('Press {hint} (or the Hint button) for a pin on a winning line. {pause} pauses and opens settings. {undo} undoes in Learn and Practice.', bindings)],
    ];
    for (const [title, d] of rules) {
      const c = el('article', 'rp-rule-card');
      c.appendChild(el('h3', '', title));
      c.appendChild(el('p', '', d));
      cards.appendChild(c);
    }
    p.appendChild(cards);
    p.appendChild(button(t('Back'), 'rp-btn-quiet', () => actions.backFromHelp()));
    showOverlay(p);
  }

  // ---- HUD (rails + tray) ----
  function hud(data) {
    railLeft.innerHTML = '';
    railLeft.appendChild(el('h2', 'rp-rail-title', data.title || ''));
    railLeft.appendChild(el('p', 'rp-objective', data.objective));
    railLeft.appendChild(stat(t('Moves'), data.moveLimit ? t('{n} / par {par} · limit {limit}', { n: data.moves, par: data.par, limit: data.moveLimit })
      : t('{n} / par {par}', { n: data.moves, par: data.par }), 'rp-moves'));
    if (data.themeName) railLeft.appendChild(el('p', 'rp-dim', data.themeName));
    railRight.innerHTML = '';
    railRight.appendChild(el('h2', 'rp-rail-title', t('Status')));
    if (data.player) railRight.appendChild(stat(t('Player'), data.player));
    railRight.appendChild(stat(t('Saved'), `${data.saved} / ${data.heroTotal}`));
    railRight.appendChild(stat(t('Score'), String(data.score)));
    if (data.hint) railRight.appendChild(el('p', 'rp-hint', data.hint));
    railRight.appendChild(el('h3', 'rp-rail-title rp-pin-heading', t('Pins you can pull')));
    if (data.sync) setSync(data.sync);
    railRight.appendChild(syncBadge);
    tray.innerHTML = '';
    const mk = (label, fn, cls) => { const b = button(label, cls || '', fn); tray.appendChild(b); };
    if (data.canUndo) mk(t('↩ Undo (U)'), () => actions.undo());
    mk(t('💡 Hint (H)'), () => actions.hint());
    mk(t('⏸ Pause (Esc)'), () => actions.pause(), 'rp-btn-quiet');
    announce(liveObjective, typeof data.objective === 'function' ? data.objective() : data.objective);
    announce(liveScore, T('Score {score}. Moves {n} of par {par}.', { score: data.score, n: data.moves, par: data.par }));
  }

  function stat(label, value, cls) {
    const p = el('p', 'rp-stat ' + (cls || ''));
    p.append(el('span', '', label), el('b', '', value));
    return p;
  }

  // Coach banner. data: { step, title, text, tip, dismiss } or null to hide.
  function coach(data) {
    coachBox.innerHTML = '';
    if (!data) { coachBox.hidden = true; return; }
    const body = el('div', 'rp-coach-body');
    if (data.step) body.appendChild(el('p', 'rp-coach-step', data.step));
    if (data.title) body.appendChild(el('h3', '', data.title));
    if (data.text) body.appendChild(el('p', '', data.text));
    if (data.tip) body.appendChild(el('p', 'rp-coach-tip', data.tip));
    coachBox.appendChild(body);
    if (data.dismiss) coachBox.appendChild(button(data.dismiss, 'rp-btn-quiet', () => actions.dismissCoach()));
    coachBox.hidden = false;
  }

  function pinSelector(legalPinIds, selectedId) {
    // DOM equivalents for canvas pins: a focusable list in the right rail
    let list = railRight.querySelector('.rp-pin-list');
    if (!list) {
      list = el('div', 'rp-pin-list');
      tx(list, t('Pins you can pull'), 'aria-label');
      railRight.appendChild(list);
    }
    railRight.appendChild(syncBadge); // keep the badge after the pin list
    list.innerHTML = '';
    if (!legalPinIds.length) list.appendChild(el('p', 'rp-dim', t('No pins left to pull.')));
    for (const id of legalPinIds) {
      // Real action buttons (clicking pulls the pin). Do NOT override their
      // native `button` role — role="option" unmasked the button semantics and
      // made "Pin N" unreachable for assistive tech and role-based selectors
      // (e.g. getByRole('button')). Selection is conveyed by the .rp-selected
      // class; the buttons themselves are the actionable controls.
      const b = button(t('Pin {id}', { id }), 'rp-pin-opt' + (id === selectedId ? ' rp-selected' : ''), () => actions.pullPin(id));
      b.setAttribute('aria-pressed', id === selectedId ? 'true' : 'false');
      list.appendChild(b);
    }
  }

  function updateMirror(state, levelName) {
    const lines = [T('Castle: {name}. {cols} columns, {rows} rows.', { name: typeof levelName === 'function' ? levelName() : levelName, cols: state.cols, rows: state.rows })];
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const cell = state.chambers[c + ',' + r];
        const bits = [];
        if (cell.water) bits.push(T('{n} water', { n: cell.water }));
        if (cell.lava) bits.push(T('{n} lava', { n: cell.lava }));
        if (cell.hero) bits.push(T('villager'));
        if (cell.saved) bits.push(T('rescued villager'));
        if (bits.length) lines.push(T('Row {r} column {c}: {list}.', { r: r + 1, c: c + 1, list: bits.join(', ') }));
      }
    }
    lines.push(T('{n} pins remain.', { n: state.pins.length }));
    mirror.innerHTML = '';
    const h = el('h3', '', t('Board state'));
    const ul = el('ul');
    for (const l of lines) ul.appendChild(el('li', '', l));
    mirror.append(h, ul);
  }

  function showWebglFallback(msg) {
    if (typeof msg === 'function') tx(webglFallback, msg); else webglFallback.textContent = msg;
    webglFallback.hidden = false;
  }

  function error(msg) { announce(liveError, typeof msg === 'function' ? msg() : msg); }
  function caption(text) { if (settings.captions !== false) announce(liveCaption, text); }

  return { titleScreen, modeSelectScreen, journeyScreen, progressionScreen, countdownScreen,
           resultsScreen, pauseScreen, settingsScreen, helpScreen, hud, pinSelector, updateMirror, coach,
           clearOverlay, showWebglFallback, error, caption, setSync, toast, relabel,
           canvasHost, el };
}
