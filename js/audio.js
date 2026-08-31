// Rescue Pins — WebAudio-synthesized original transients. No external assets.

const EVENT_TIERS = {
  ack:        { freq: 660,  dur: 0.05, type: 'sine',     gain: 0.15 },
  pull:       { freq: 320,  dur: 0.12, type: 'square',   gain: 0.20, slide: 180 },
  flow:       { freq: 220,  dur: 0.25, type: 'sine',     gain: 0.12, slide: 90 },
  neutralize: { freq: 520,  dur: 0.30, type: 'sawtooth', gain: 0.16, slide: 780 },
  win:        { freq: 523,  dur: 0.50, type: 'triangle', gain: 0.25, arpeggio: [1, 1.25, 1.5, 2] },
  lose:       { freq: 180,  dur: 0.55, type: 'sawtooth', gain: 0.22, slide: 70 },
  invalid:    { freq: 140,  dur: 0.10, type: 'square',   gain: 0.14 },
  undo:       { freq: 440,  dur: 0.08, type: 'sine',     gain: 0.12, slide: 520 },
};

// Authored sample clips (sfx/*.opus, see sfx/manifest.json) mapped to the
// named events above. Samples are preferred once decoded; synthesized
// transients remain the fallback while a clip loads or if it is missing.
const SFX_SAMPLES = {
  pull:       ['pin-slide-metal', 'pin-clank'],
  flow:       ['water-rush', 'water-splash'],
  neutralize: ['steam-hiss', 'lava-sizzle-out'],
  win:        ['rescue-chime', 'villager-cheer'],
  lose:       ['lava-rumble', 'fail-thud'],
  invalid:    ['blocked-thunk'],
  undo:       ['rewind-swish'],
  ack:        ['ui-click'],
};

export function createAudio(settings, captionHook) {
  let ctx = null;
  const buses = {};
  let ambienceNodes = null;
  const sampleCache = new Map(); // name -> { buffer } | { error: true } | { pending: true }
  const sampleRotor = {};

  function ensureCtx() {
    if (ctx) return true;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    ctx = new AC();
    const master = ctx.createGain();
    master.connect(ctx.destination);
    for (const name of ['music', 'effects', 'ambience']) {
      const g = ctx.createGain();
      g.connect(master);
      buses[name] = g;
    }
    buses.master = master;
    applyVolumes();
    return true;
  }

  function applyVolumes() {
    if (!ctx) return;
    const a = settings.audio || {};
    const mute = a.muted ? 0 : 1;
    buses.master.gain.value = mute;
    buses.music.gain.value = a.music ?? 0.5;
    buses.effects.gain.value = a.effects ?? 0.8;
    buses.ambience.gain.value = a.ambience ?? 0.4;
  }

  // short synthesized transient on the effects bus
  function blip(spec, when = 0, freqMul = 1) {
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.freq * freqMul, t0);
    if (spec.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, spec.slide * freqMul), t0 + spec.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(spec.gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.dur);
    osc.connect(g); g.connect(buses.effects);
    osc.start(t0); osc.stop(t0 + spec.dur + 0.05);
  }

  // lazy fetch/decode/cache of sfx/<name>.opus; only called after the
  // user-gesture unlock has created the AudioContext
  function loadSample(name) {
    if (sampleCache.has(name)) return;
    const entry = { pending: true };
    sampleCache.set(name, entry);
    fetch('sfx/' + name + '.opus')
      .then(r => { if (!r.ok) throw new Error('http-' + r.status); return r.arrayBuffer(); })
      .then(ab => ctx.decodeAudioData(ab))
      .then(buf => { entry.buffer = buf; delete entry.pending; })
      .catch(() => { sampleCache.set(name, { error: true }); });
  }

  function playSample(buffer) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(buses.effects);
    src.start();
  }

  function play(eventName) {
    const spec = EVENT_TIERS[eventName];
    if (captionHook && settings.captions !== false) captionHook(eventName);
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended') ctx.resume();
    const names = SFX_SAMPLES[eventName];
    if (names) {
      const i = (sampleRotor[eventName] = ((sampleRotor[eventName] ?? -1) + 1) % names.length);
      const entry = sampleCache.get(names[i]);
      if (!entry) loadSample(names[i]);
      if (entry && entry.buffer) { playSample(entry.buffer); return; }
      // not decoded yet or failed: fall through to synthesized fallback
    }
    if (!spec) return;
    if (spec.arpeggio) spec.arpeggio.forEach((m, i) => blip({ ...spec, arpeggio: null }, i * 0.11, m));
    else blip(spec);
  }

  // quiet deterministic ambience: slow filtered noise-free pad on the ambience bus
  function startAmbience() {
    if (!ensureCtx() || ambienceNodes) return;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 110;
    osc2.type = 'sine'; osc2.frequency.value = 165.2;
    g.gain.value = 0.035;
    osc.connect(g); osc2.connect(g); g.connect(buses.ambience);
    osc.start(); osc2.start();
    ambienceNodes = [osc, osc2, g];
  }

  function stopAmbience() {
    if (!ambienceNodes) return;
    for (const n of ambienceNodes.slice(0, 2)) { try { n.stop(); } catch { /* already stopped */ } }
    ambienceNodes[2].disconnect();
    ambienceNodes = null;
  }

  function setMuted(m) { settings.audio.muted = m; applyVolumes(); }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  return { play, startAmbience, stopAmbience, applyVolumes, setMuted, suspend, resume,
           get available() { return ensureCtx(); } };
}
