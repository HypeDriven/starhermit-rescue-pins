// The look per graphics level: the browser build's four presets and budgets
// (js/gfx.js TABLE / BUDGETS, each tuned to hold 60 FPS on the weakest GPU
// its Auto gave it) keyed by the runtime's quality tier (frame().quality),
// with the dust motes scaled within the tier by the level
// (frame().levelIndex, at most 2×), as the browser build scaled them by its
// hardware level. The runtime owns the rest of what the old Graphics panel
// did: Auto and the level choice, render scale and the pixel-ratio cap,
// adaptive resolution, the frame-rate limit and readout. The old panel's
// per-effect overrides are not offered (the runtime's Options choose a level).
import type { QualityTier } from "starhermit:engine";
import type { AntialiasMode } from "starhermit:scene";

export interface Budget {
  /** Shading: Lambert (Low), Standard (Balanced), Physical glass, water, villagers and brass (High, Ultra). */
  material: "lambert" | "standard" | "physical";
  /** Brick texture size (Detail on). */
  brick: number;
  /** Bump-mapped brick. */
  bump: boolean;
  /** Flowing-lava texture size. */
  lava: number;
  /** Curved-mesh segment multiplier. */
  seg: number;
  /** Dust motes at Particles "high" (low: 4/11; embers: half). */
  dust: number;
  bloomRes: number;
  aoRes: number;
}
export interface Look {
  preset: QualityTier;
  shadows: 0 | 1024 | 2048 | 4096;
  ao: "off" | "on" | "high";
  bloom: boolean;
  grade: boolean;
  antialias: AntialiasMode;
  reflections: boolean;
  /** Brick texture, sky gradient, torches, flowing lava, meniscus, hats and eyes. */
  detailed: boolean;
  particles: "off" | "low" | "high";
  /** The composer ran (anything but plain MSAA): the glass is far fainter there. */
  post: boolean;
  budget: Budget;
}

/** gfx.js TABLE. */
const TABLE: Record<QualityTier, Omit<Look, "preset" | "budget" | "post">> = {
  low: { shadows: 0, ao: "off", bloom: false, grade: false, antialias: "msaa", reflections: false, detailed: false, particles: "off" },
  balanced: { shadows: 1024, ao: "off", bloom: true, grade: true, antialias: "fxaa", reflections: true, detailed: true, particles: "low" },
  high: { shadows: 2048, ao: "on", bloom: true, grade: true, antialias: "smaa", reflections: true, detailed: true, particles: "high" },
  ultra: { shadows: 4096, ao: "high", bloom: true, grade: true, antialias: "msaa", reflections: true, detailed: true, particles: "high" },
};
/** gfx.js BUDGETS. */
const BUDGETS: Record<QualityTier, Budget> = {
  low: { material: "lambert", brick: 128, bump: false, lava: 64, seg: 0.75, dust: 70, bloomRes: 0.5, aoRes: 0.5 },
  balanced: { material: "standard", brick: 256, bump: false, lava: 128, seg: 1, dust: 90, bloomRes: 0.5, aoRes: 0.5 },
  high: { material: "physical", brick: 256, bump: true, lava: 128, seg: 1, dust: 110, bloomRes: 0.5, aoRes: 0.5 },
  ultra: { material: "physical", brick: 512, bump: true, lava: 256, seg: 1.5, dust: 160, bloomRes: 1, aoRes: 1 },
};
/** The first level index of each tier. */
const TIER_FLOOR: Record<QualityTier, number> = { low: 0, balanced: 2, high: 4, ultra: 7 };
export const DUST_MAX = 320;
const PARTICLE_SHARE = { off: 0, low: 4 / 11, high: 1 };

/** The look for a quality tier at a level index (0 … 9). */
export function lookFor(preset: QualityTier, levelIndex: number): Look {
  const b = { ...BUDGETS[preset] };
  const k = Math.min(2, Math.pow(1.64, Math.max(0, levelIndex - TIER_FLOOR[preset])));
  b.dust = Math.min(DUST_MAX, Math.round(b.dust * k));
  const row = TABLE[preset];
  const post = row.ao !== "off" || row.bloom || row.grade || row.antialias === "fxaa" || row.antialias === "smaa";
  return { preset, ...row, post, budget: b };
}
/** gfx.js particleCount: dust motes for the look (embers are half). */
export function particleCount(l: Look): number { return Math.round(l.budget.dust * PARTICLE_SHARE[l.particles]); }
