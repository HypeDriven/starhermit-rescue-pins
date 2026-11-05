// Sound, as the browser build's js/audio.js: the authored one-shots
// (sfx/<name>.opus, sfx/manifest.json) per game event, a SoundBank alternating
// between each event's clips, and the quiet ambience pad (sines at 110 and
// 165.2 Hz, gain 0.035 on the old ambience bus). The pad is rendered once
// (OfflineAudioContext) into a 10-second clip (both tones complete whole cycles
// in it, so it loops without a seam) and looped on the music bus at the old
// ambience-to-music ratio (0.4 / 0.5). A clip still loading is silent. The
// runtime's Options own the volumes and the mute. Everything loads in onStart;
// only starting the pad waits for the mixer (in a browser, the first press).
import { context, createClip, loadClip, OfflineAudioContext, play as playClip, SoundBank, type AudioClip, type Sound } from "starhermit:audio";

/** audio.js SFX_SAMPLES. */
const SAMPLES: Record<string, string[]> = {
  pull: ["pin-slide-metal", "pin-clank"],
  flow: ["water-rush", "water-splash"],
  neutralize: ["steam-hiss", "lava-sizzle-out"],
  win: ["rescue-chime", "villager-cheer"],
  lose: ["lava-rumble", "fail-thud"],
  invalid: ["blocked-thunk"],
  undo: ["rewind-swish"],
  ack: ["ui-click"],
};
export type Sfx = "pull" | "flow" | "neutralize" | "win" | "lose" | "invalid" | "undo" | "ack";
const banks = new Map<Sfx, SoundBank>();
let suspended = false;

/** Loads every clip at once and renders the pad (onStart). */
export function loadSfx(): void {
  for (const [ev, names] of Object.entries(SAMPLES) as [Sfx, string[]][]) {
    void Promise.all(names.map((n) => loadClip(`sfx/${n}.opus`).catch((e: unknown) => { console.warn(`sfx ${n}: ${e instanceof Error ? e.message : String(e)}`); return null; }))).then((loaded) => {
      const list = loaded.filter((c) => c !== null);
      if (list.length) banks.set(ev, new SoundBank({ clips: list, order: "sequence", bus: "effects" }));
    });
  }
  renderPad().then((c) => { padClip = c; }, (e: unknown) => { console.warn(`audio: ${String(e)}`); });
}

export function play(ev: Sfx): void {
  if (suspended) return;
  try { banks.get(ev)?.play(); } catch { /* the mixer is full this frame: skip it */ }
}

// -- the ambience pad -------------------------------------------------------------------------
const RATE = 22050, PAD_SECONDS = 10;
async function renderPad(): Promise<AudioClip> {
  const off = new OfflineAudioContext(1, RATE * PAD_SECONDS, RATE);
  const g = off.createGain(); g.gain.value = 0.035; g.connect(off.destination);
  for (const f of [110, 165.2]) { const osc = off.createOscillator(); osc.frequency.value = f; osc.connect(g); osc.start(); }
  return createClip(await off.startRendering());
}
const PAD_GAIN = 0.4 / 0.5;
let padClip: AudioClip | null = null;
let padVoice: Sound | null = null;
let padWanted = false;
/** audio.js startAmbience (the old build began it on the first press). */
export function startAmbience(): void { padWanted = true; }
/** A hidden window and the pause panel silence the pad (audio.js suspend). */
export function setSuspended(on: boolean): void {
  if (on === suspended) return;
  suspended = on;
  try { padVoice?.fade(on ? 0 : PAD_GAIN, 0.2); } catch { /* gone */ }
}

/** Each frame, once the mixer runs: the pad. */
export function update(): void {
  if (context.state !== "running" || !padWanted || !padClip || padVoice) return;
  try { padVoice = playClip(padClip, { bus: "music", gain: suspended ? 0 : PAD_GAIN, loop: true }); } catch { padVoice = null; }
}
