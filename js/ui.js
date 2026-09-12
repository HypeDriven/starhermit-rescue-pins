// Rescue Pins — semantic HTML DOM shell over/beside the canvas.
// All screens, keyboard operation, ARIA live regions, accessibility mirror.

export function createUI(root, actions, settings) {
  root.innerHTML = '';
  root.className = 'rp-root';

  // ---- persistent shell ----
  const shell = el('div', 'rp-shell');
  const railLeft = el('aside', 'rp-rail rp-rail-left');
  railLeft.setAttribute('aria-label', 'Objective and progression');
  const stage = el('div', 'rp-stage');
  const canvasHost = el('div', 'rp-canvas-host');
  const railRight = el('aside', 'rp-rail rp-rail-right');
  railRight.setAttribute('aria-label', 'Actions and status');
  const tray = el('nav', 'rp-tray');
  tray.setAttribute('aria-label', 'Primary actions');
  stage.appendChild(canvasHost);
  shell.append(railLeft, stage, railRight);
  root.append(shell, tray);

  // live regions
  const liveObjective = liveRegion('Objective');
  const liveScore = liveRegion('Score');
  const liveError = liveRegion('Errors');
  const liveResults = liveRegion('Results');
  const liveCaption = liveRegion('Audio captions');
  root.append(liveObjective, liveScore, liveError, liveResults, liveCaption);

  // accessibility mirror: concise navigable text of board state
  const mirror = el('section', 'rp-mirror sr-only');
  mirror.setAttribute('aria-label', 'Board state in text');
  root.appendChild(mirror);

  const webglFallback = el('div', 'rp-webgl-fallback');
  webglFallback.setAttribute('role', 'alert');
  webglFallback.hidden = true;
  stage.appendChild(webglFallback);

  // in-stage coach banner: visible first-play guidance and tutorial lesson text
  const coachBox = el('aside', 'rp-coach');
  coachBox.setAttribute('aria-label', 'Guidance');
  coachBox.hidden = true;
  stage.appendChild(coachBox);

  const overlay = el('div', 'rp-overlay');
  overlay.hidden = true;
  root.appendChild(overlay);

  // persistent sync badge: lives in the right rail; hud()/pinSelector()
  // re-append it after their periodic rail rebuilds
  const syncBadge = el('p', 'rp-dim rp-sync');
  syncBadge.hidden = true;
  railRight.appendChild(syncBadge);
  function setSync(text) {
    if (text) { syncBadge.textContent = text; syncBadge.hidden = false; }
    else syncBadge.hidden = true;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function liveRegion(label) {
    const r = el('div', 'sr-only');
    r.setAttribute('aria-live', 'polite');
    r.setAttribute('aria-label', label);
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
    if (first) first.focus();
  }

  function titleScreen(prog, opts) {
    const p = el('section', 'rp-panel rp-title');
    p.appendChild(el('h1', '', 'Rescue Pins'));
    p.appendChild(el('p', 'rp-tag', 'Pull the pins. Spare the villagers.'));
    const play = button('▶ Play', 'rp-btn-primary', () => actions.showModeSelect());
    p.appendChild(play);
    if (opts && opts.hasSave) {
      p.appendChild(button('Continue saved game', '', () => actions.continueSaved()));
    }
    if (opts && opts.player) p.appendChild(el('p', 'rp-dim', `Signed in as ${opts.player}`));
    if (opts && opts.sync) p.appendChild(el('p', 'rp-dim', opts.sync));
    const row = el('div', 'rp-row');
    row.append(
      button('Daily Challenge', '', () => actions.startDaily()),
      button('Journey', '', () => actions.showJourney()),
      button('Profile & Progress', '', () => actions.showProgression()));
    p.appendChild(row);
    const done = Object.keys(prog.completed || {}).length;
    p.appendChild(el('p', 'rp-dim', done ? `Journey progress: ${done}/40 stages cleared` : 'New here? Press Play, then pick Learn for five short lessons.'));
    p.appendChild(button('How to play', 'rp-btn-quiet', () => actions.showHelp('title')));
    showOverlay(p);
  }

  function modeSelectScreen(opts) {
    const newcomer = !(opts && opts.tutorialDone);
    const p = el('section', 'rp-panel');
    p.appendChild(el('h2', '', 'Choose a mode'));
    if (newcomer) p.appendChild(el('p', 'rp-dim', 'First time? Learn teaches the controls and rules one at a time.'));
    const modes = [
      ['learn', 'Learn', 'Five short lessons. One rule at a time. Unranked.'],
      ['journey', 'Journey', '40 authored castles across five themes.'],
      ['daily', 'Daily Challenge', 'One shared castle per UTC day. Ranked.'],
      ['practice', 'Practice', 'Pick a stage, undo allowed, unranked.'],
    ];
    for (const [id, name, desc] of modes) {
      const b = button(name, 'rp-btn-mode' + (newcomer && id === 'learn' ? ' rp-btn-primary' : ''), () => actions.startMode(id));
      if (newcomer && id === 'learn') b.appendChild(el('span', 'rp-badge', 'Recommended'));
      b.appendChild(el('small', 'rp-dim', desc));
      p.appendChild(b);
    }
    p.appendChild(button('Back', 'rp-btn-quiet', () => actions.showTitle()));
    showOverlay(p);
  }

  function journeyScreen(prog, journey) {
    const p = el('section', 'rp-panel rp-journey');
    p.appendChild(el('h2', '', 'Journey'));
    const grid = el('div', 'rp-stage-grid');
    journey.forEach((lv, i) => {
      const done = !!(prog.completed || {})[lv.id];
      const best = (prog.bestScores || {})[lv.id];
      const mastery = lv.difficulty && lv.difficulty.mastery;
      const b = button(`${done ? '★' : '☆'} ${i + 1}${mastery ? ' ♛' : ''}`, done ? 'rp-stage-done' : '', () => actions.startLevel(lv));
      b.title = `${lv.name} — par ${lv.par}${lv.moveLimit ? ' — move limit ' + lv.moveLimit : ''}${mastery ? ' — mastery test' : ''}${best ? ' — best ' + best : ''}`;
      b.setAttribute('aria-label', b.title);
      grid.appendChild(b);
    });
    p.appendChild(grid);
    p.appendChild(button('Back', 'rp-btn-quiet', () => actions.showTitle()));
    showOverlay(p);
  }

  function progressionScreen(prog, extra) {
    const p = el('section', 'rp-panel');
    p.appendChild(el('h2', '', 'Profile & Progress'));
    const done = Object.keys(prog.completed || {}).length;
    p.appendChild(el('p', '', `Stages cleared: ${done}/40`));
    p.appendChild(el('p', '', `Tutorial: ${prog.tutorialDone ? 'complete' : 'not finished'}`));
    if (extra && extra.masteryTotal) {
      p.appendChild(el('p', '', `Mastery track: ${extra.masteryDone}/${extra.masteryTotal} theme-final stages cleared`));
    }
    const best = Object.entries(prog.bestScores || {});
    if (best.length) {
      const ul = el('ul', 'rp-best-list');
      for (const [id, s] of best.slice(-8)) ul.appendChild(el('li', '', `${id}: ${s}`));
      p.appendChild(ul);
    }
    if (extra && extra.achievements && extra.achievements.length) {
      p.appendChild(el('h3', 'rp-rail-title', 'Achievements'));
      const ul = el('ul', 'rp-score-list');
      for (const a of extra.achievements) {
        ul.appendChild(el('li', a.unlocked ? 'rp-win' : 'rp-dim',
          `${a.unlocked ? '✓' : '○'} ${a.name} — ${a.description}`));
      }
      p.appendChild(ul);
    }
    if (extra && extra.account) p.appendChild(el('p', 'rp-dim', extra.account));
    p.appendChild(button('Back', 'rp-btn-quiet', () => actions.showTitle()));
    showOverlay(p);
  }

  function countdownScreen(n) {
    const p = el('section', 'rp-panel rp-countdown');
    p.appendChild(el('h2', '', String(n)));
    showOverlay(p);
  }

  function resultsScreen(result) {
    const p = el('section', 'rp-panel');
    p.appendChild(el('h2', result.won ? 'rp-win' : 'rp-lose', result.won ? 'Rescued!' : 'The castle claims another…'));
    p.appendChild(el('p', '', result.reason || ''));
    const sb = result.score;
    const ul = el('ul', 'rp-score-list');
    const rows = [
      ['Villagers saved', sb.saved], ['Hazards neutralized', sb.neutralized],
      ['Under-par bonus', sb.parBonus], ['Efficiency', sb.efficiency],
      ['Invalid-action penalty', -sb.invalidPenalty],
    ];
    for (const [k, v] of rows) if (v) ul.appendChild(el('li', '', `${k}: ${v}`));
    ul.appendChild(el('li', 'rp-total', `Total: ${sb.total}`));
    p.appendChild(ul);
    p.appendChild(el('p', 'rp-dim', `Pins pulled: ${result.moves} (par ${result.par})`));
    if (result.achievements && result.achievements.length) {
      p.appendChild(el('h3', 'rp-rail-title', 'Achievements unlocked'));
      const au = el('ul', 'rp-score-list');
      for (const a of result.achievements) au.appendChild(el('li', 'rp-win', `✓ ${a.name} — ${a.description}`));
      p.appendChild(au);
    }
    if (result.board && result.board.length) {
      p.appendChild(el('h3', 'rp-rail-title', "Today's daily board"));
      const ol = el('ol', 'rp-score-list');
      for (const e of result.board) ol.appendChild(el('li', '', `${e.name}: ${e.score}`));
      p.appendChild(ol);
    }
    const row = el('div', 'rp-row');
    row.append(
      button('Retry', '', () => actions.retry()),
      button(result.won ? 'Next stage' : 'Change stage', 'rp-btn-primary', () => actions.next()),
      button('Menu', 'rp-btn-quiet', () => actions.showTitle()));
    p.appendChild(row);
    if (result.dailySubmit) p.appendChild(el('p', result.dailySubmit.ok ? 'rp-win' : 'rp-dim', result.dailySubmit.message));
    announce(liveResults, result.won ? `Victory. Score ${sb.total}.` : `Defeat. ${result.reason || ''}`);
    showOverlay(p);
  }

  function pauseScreen() {
    const p = el('section', 'rp-panel');
    p.appendChild(el('h2', '', 'Paused'));
    p.appendChild(button('Resume', 'rp-btn-primary', () => actions.resume()));
    const secs = el('div', 'rp-settings-sections');
    // audio
    secs.appendChild(settingsSection('Audio', (sec) => {
      for (const bus of ['music', 'effects', 'ambience']) {
        sec.appendChild(slider(bus[0].toUpperCase() + bus.slice(1), settings.audio[bus], v => actions.setVolume(bus, v)));
      }
      sec.appendChild(toggle('Mute all', settings.audio.muted, v => actions.setMuted(v)));
      sec.appendChild(toggle('Captions', settings.captions !== false, v => actions.setCaptions(v)));
    }));
    // graphics
    secs.appendChild(settingsSection('Graphics', (sec) => {
      sec.appendChild(select('Quality tier', ['auto', 'low', 'medium', 'high'], settings.graphics.tier, v => actions.setTier(v)));
      sec.appendChild(select('Palette', ['default', 'colorblind', 'highcontrast'], settings.graphics.palette, v => actions.setPalette(v)));
      sec.appendChild(toggle('Reduced motion', settings.graphics.reducedMotion, v => actions.setReducedMotion(v)));
      sec.appendChild(toggle('High contrast', settings.graphics.highContrast, v => actions.setHighContrast(v)));
      sec.appendChild(toggle('Larger text', settings.graphics.textSize === 'large', v => actions.setTextSize(v ? 'large' : 'normal')));
    }));
    // controls
    secs.appendChild(settingsSection('Controls', (sec) => {
      sec.appendChild(el('p', 'rp-dim', 'Arrows/WASD: choose pin · Enter/Space: pull · Esc: pause/cancel · U: undo (practice) · H: hint · C: reset camera'));
      sec.appendChild(toggle('Left-handed tray', settings.controls.leftHanded, v => actions.setLeftHanded(v)));
    }));
    // accessibility
    secs.appendChild(settingsSection('Accessibility', (sec) => {
      sec.appendChild(el('p', 'rp-dim', 'Every board state is mirrored as text for screen readers. No gameplay information is audio-only or color-only.'));
      sec.appendChild(button('Replay tutorial', '', () => actions.startMode('learn')));
    }));
    // help + leave
    secs.appendChild(settingsSection('Help', (sec) => {
      sec.appendChild(button('Rule cards', '', () => actions.showHelp()));
    }));
    secs.appendChild(settingsSection('Leave', (sec) => {
      sec.appendChild(button('Save & quit to title', 'rp-btn-danger', () => actions.quitToTitle()));
    }));
    p.appendChild(secs);
    showOverlay(p);
  }

  function settingsSection(title, fill) {
    const sec = el('fieldset', 'rp-settings-section');
    sec.appendChild(el('legend', '', title));
    fill(sec);
    return sec;
  }
  function slider(label, value, onChange) {
    const w = el('label', 'rp-field', label + ' ');
    const i = el('input');
    i.type = 'range'; i.min = '0'; i.max = '1'; i.step = '0.05'; i.value = String(value);
    i.setAttribute('aria-label', label);
    i.addEventListener('input', () => onChange(parseFloat(i.value)));
    w.appendChild(i);
    return w;
  }
  function toggle(label, value, onChange) {
    const w = el('label', 'rp-field', label + ' ');
    const i = el('input');
    i.type = 'checkbox'; i.checked = !!value;
    i.addEventListener('change', () => onChange(i.checked));
    w.appendChild(i);
    return w;
  }
  function select(label, options, value, onChange) {
    const w = el('label', 'rp-field', label + ' ');
    const s = el('select');
    s.setAttribute('aria-label', label);
    for (const o of options) {
      const opt = el('option', '', o);
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
    p.appendChild(el('h2', '', 'How to play'));
    const cards = el('div', 'rp-rule-cards');
    const rules = [
      ['Pull pins', 'Tap or click a brass pin to select it, then tap it again to pull it. On a keyboard, choose a pin with the arrow keys and press ' + bindings.confirm + '. The pin list in the Status rail works too: one press pulls that pin.'],
      ['Water rescues', 'Water falls and flows sideways. A villager touched by water is rescued.'],
      ['Lava kills', 'A villager touched by lava is lost. The stage ends.'],
      ['Steam', 'Water and lava in the same chamber neutralize into inert steam.'],
      ['Score', 'Save villagers, waste no pins: beating par and avoiding mistakes raises your score.'],
      ['Stuck?', 'Press H (or the Hint button) for a pin on a winning line. Esc pauses and opens settings. U undoes in Learn and Practice.'],
    ];
    for (const [t, d] of rules) {
      const c = el('article', 'rp-rule-card');
      c.appendChild(el('h3', '', t));
      c.appendChild(el('p', '', d));
      cards.appendChild(c);
    }
    p.appendChild(cards);
    p.appendChild(button('Back', 'rp-btn-quiet', () => actions.backFromHelp()));
    showOverlay(p);
  }

  // ---- HUD (rails + tray) ----
  function hud(data) {
    railLeft.innerHTML = '';
    railLeft.appendChild(el('h2', 'rp-rail-title', data.title || ''));
    railLeft.appendChild(el('p', 'rp-objective', data.objective));
    railLeft.appendChild(stat('Moves', `${data.moves} / par ${data.par}${data.moveLimit ? ' · limit ' + data.moveLimit : ''}`, 'rp-moves'));
    if (data.themeName) railLeft.appendChild(el('p', 'rp-dim', data.themeName));
    railRight.innerHTML = '';
    railRight.appendChild(el('h2', 'rp-rail-title', 'Status'));
    if (data.player) railRight.appendChild(stat('Player', data.player));
    railRight.appendChild(stat('Saved', `${data.saved} / ${data.heroTotal}`));
    railRight.appendChild(stat('Score', String(data.score)));
    if (data.hint) railRight.appendChild(el('p', 'rp-hint', data.hint));
    railRight.appendChild(el('h3', 'rp-rail-title rp-pin-heading', 'Pins you can pull'));
    if (data.sync) setSync(data.sync);
    railRight.appendChild(syncBadge);
    tray.innerHTML = '';
    const mk = (label, fn, cls) => { const b = button(label, cls || '', fn); tray.appendChild(b); };
    if (data.canUndo) mk('↩ Undo (U)', () => actions.undo());
    mk('💡 Hint (H)', () => actions.hint());
    mk('⏸ Pause (Esc)', () => actions.pause(), 'rp-btn-quiet');
    announce(liveObjective, data.objective);
    announce(liveScore, `Score ${data.score}. Moves ${data.moves} of par ${data.par}.`);
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
      list.setAttribute('aria-label', 'Pins you can pull');
      railRight.appendChild(list);
    }
    railRight.appendChild(syncBadge); // keep the badge after the pin list
    list.innerHTML = '';
    if (!legalPinIds.length) list.appendChild(el('p', 'rp-dim', 'No pins left to pull.'));
    for (const id of legalPinIds) {
      // Real action buttons (clicking pulls the pin). Do NOT override their
      // native `button` role — role="option" unmasked the button semantics and
      // made "Pin N" unreachable for assistive tech and role-based selectors
      // (e.g. getByRole('button')). Selection is conveyed by the .rp-selected
      // class; the buttons themselves are the actionable controls.
      const b = button('Pin ' + id, 'rp-pin-opt' + (id === selectedId ? ' rp-selected' : ''), () => actions.pullPin(id));
      b.setAttribute('aria-pressed', id === selectedId ? 'true' : 'false');
      list.appendChild(b);
    }
  }

  function updateMirror(state, levelName) {
    const lines = [`Castle: ${levelName}. ${state.cols} columns, ${state.rows} rows.`];
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const cell = state.chambers[c + ',' + r];
        const bits = [];
        if (cell.water) bits.push(cell.water + ' water');
        if (cell.lava) bits.push(cell.lava + ' lava');
        if (cell.hero) bits.push('villager');
        if (cell.saved) bits.push('rescued villager');
        if (bits.length) lines.push(`Row ${r + 1} column ${c + 1}: ${bits.join(', ')}.`);
      }
    }
    lines.push(`${state.pins.length} pins remain.`);
    mirror.innerHTML = '';
    const h = el('h3', '', 'Board state');
    const ul = el('ul');
    for (const l of lines) ul.appendChild(el('li', '', l));
    mirror.append(h, ul);
  }

  function showWebglFallback(msg) {
    webglFallback.textContent = msg;
    webglFallback.hidden = false;
  }

  function error(msg) { announce(liveError, msg); }
  function caption(text) { if (settings.captions !== false) announce(liveCaption, text); }

  return { titleScreen, modeSelectScreen, journeyScreen, progressionScreen, countdownScreen,
           resultsScreen, pauseScreen, helpScreen, hud, pinSelector, updateMirror, coach,
           clearOverlay, showWebglFallback, error, caption, setSync,
           canvasHost, el };
}
