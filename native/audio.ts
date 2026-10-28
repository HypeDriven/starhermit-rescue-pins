// Sound, as the browser build's js/audio.js: the authored one-shots
// (sfx/<name>.opus, sfx/manifest.json) per game event, alternating between
// each event's clips, and the quiet ambience pad (sines at 110 and 165.2 Hz,
// gain 0.035 on the old ambience bus). The pad is rendered once into a
// 10-second clip (both tones complete whole cycles in it, so it loops without
// a seam; a slice a frame) and looped on the music bus — the runtime has no
// ambience bus — at the old ambience-to-music ratio (0.4 / 0.5). The
// synthesized transients audio.js played while a clip decoded are not ported
// (a live synthesis graph makes clip loads fail on the web runtime): a clip
// still loading is silent. The runtime's Options own the volumes and the mute.
// Clips load once the mixer runs (natively at once, in a browser after the
// first press), one at a time.
import { context, createClip, loadClip, play as playClip, type AudioClip, type Sound } from "starhermit:audio";

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
const clips = new Map<string, AudioClip>();
const rotor: Record<string, number> = {};
const queue: string[] = [];
let loading = false;
let wantClips = false;
let suspended = false;

/** Asks for the clips; they load once the mixer runs (see update). */
export function loadSfx(): void { wantClips = true; }

export function play(ev: Sfx): void {
  if (suspended) return;
  const names = SAMPLES[ev]!;
  const i = (rotor[ev] = ((rotor[ev] ?? -1) + 1) % names.length);
  const clip = clips.get(names[i]!);
  if (!clip) return;
  try { playClip(clip, { bus: "effects" }); } catch { clips.delete(names[i]!); if (!queue.includes(names[i]!)) queue.push(names[i]!); }
}

// -- the ambience pad -------------------------------------------------------------------------
const RATE = 22050, PAD_N = RATE * 10;
const pad = new Float32Array(PAD_N);
let padPos = 0;
function renderPad(count: number): boolean {
  const end = Math.min(PAD_N, padPos + count);
  for (; padPos < end; padPos++) {
    const t = padPos / RATE;
    pad[padPos] = (Math.sin(2 * Math.PI * 110 * t) + Math.sin(2 * Math.PI * 165.2 * t)) * 0.035;
  }
  return padPos >= PAD_N;
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

/** Each frame: the clips once the mixer runs (one at a time), then the pad. */
export function update(): void {
  if (context.state !== "running") return;
  if (wantClips) {
    wantClips = false;
    for (const list of Object.values(SAMPLES)) for (const n of list) if (!queue.includes(n)) queue.push(n);
  }
  if (!loading && queue.length) {
    const name = queue.shift()!;
    if (!clips.has(name)) {
      loading = true;
      loadClip(`sfx/${name}.opus`).then((c) => { clips.set(name, c); loading = false; }, (e: unknown) => {
        console.warn(`sfx ${name}: ${e instanceof Error ? e.message : String(e)}`);
        loading = false;
      });
    }
    return;
  }
  if (loading || !padWanted) return;
  if (!padClip) {
    if (!renderPad(20000)) return;
    try { padClip = createClip([pad], RATE); } catch (e) { console.warn(`audio: ${String(e)}`); padPos = 0; }
    return;
  }
  if (!padVoice) {
    try { padVoice = playClip(padClip, { bus: "music", gain: suspended ? 0 : PAD_GAIN, loop: true }); } catch { padVoice = null; }
  }
}
