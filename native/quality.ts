// The look per graphics level. The engine's level (levelSettings()) owns the
// engine effects: shadow on/off and map size, AO, bloom, grade, anti-aliasing,
// the texture cap, and how far the dust scales within the tier (the level's
// particle budget over the tier's anchor level, at most 2×). The art stays the
// browser build's four presets (js/gfx.js, each tuned to hold 60 FPS), keyed by
// the level's quality tier. The rules are identical on every tier. The runtime
// owns Auto and the level choice, render scale and the pixel-ratio cap, adaptive
// resolution, the frame-rate limit and readout.
import { levelSettings, type GraphicsLevel, type LevelSettings, type QualityTier } from "starhermit:engine";
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
}
interface Art {
  reflections: boolean;
  /** Brick texture, sky gradient, torches, flowing lava, meniscus, hats and eyes. */
  detailed: boolean;
  particles: "off" | "low" | "high";
}
export interface Look extends Art {
  preset: QualityTier;
  /** Key-light shadow map, the level's size (0 = off). */
  shadows: number;
  ao: { resolution: number; samples: number; denoiseSamples: number } | null;
  /** Bloom's resolution, the level's (null = off). */
  bloom: number | null;
  grade: boolean;
  antialias: AntialiasMode;
  /** The composer ran (anything but plain MSAA or none): the glass is far fainter there. */
  post: boolean;
  budget: Budget;
}

/** gfx.js TABLE, the game's art. */
const ART: Record<QualityTier, Art> = {
  low: { reflections: false, detailed: false, particles: "off" },
  balanced: { reflections: true, detailed: true, particles: "low" },
  high: { reflections: true, detailed: true, particles: "high" },
  ultra: { reflections: true, detailed: true, particles: "high" },
};
/** gfx.js BUDGETS. */
const BUDGETS: Record<QualityTier, Budget> = {
  low: { material: "lambert", brick: 128, bump: false, lava: 64, seg: 0.75, dust: 70 },
  balanced: { material: "standard", brick: 256, bump: false, lava: 128, seg: 1, dust: 90 },
  high: { material: "physical", brick: 256, bump: true, lava: 128, seg: 1, dust: 110 },
  ultra: { material: "physical", brick: 512, bump: true, lava: 256, seg: 1.5, dust: 160 },
};
const ANCHOR: Record<QualityTier, GraphicsLevel> = { low: "quantum", balanced: "molecular", high: "terrestrial", ultra: "galactic" };
export const DUST_MAX = 320;
const PARTICLE_SHARE = { off: 0, low: 4 / 11, high: 1 };

/** The look for a graphics level's settings. */
export function lookFor(s: LevelSettings = levelSettings()): Look {
  const preset = s.quality;
  const k = Math.min(2, s.particles / levelSettings(ANCHOR[preset]).particles);
  const b = BUDGETS[preset];
  const ao = s.ao && { resolution: s.ao.resolution, samples: s.ao.samples, denoiseSamples: s.ao.denoiseSamples };
  const bloom = s.bloom ? s.bloom.resolution : null;
  return {
    preset, ...ART[preset],
    shadows: s.shadows ? s.shadowMapSize : 0,
    ao, bloom, grade: s.grade, antialias: s.antialias,
    post: !!ao || bloom !== null || s.grade || s.antialias === "fxaa" || s.antialias === "smaa",
    budget: { ...b, brick: Math.min(b.brick, s.maxTextureSize), lava: Math.min(b.lava, s.maxTextureSize), dust: Math.min(DUST_MAX, Math.round(b.dust * k)) },
  };
}
/** gfx.js particleCount: dust motes for the look (embers are half). */
export function particleCount(l: Look): number { return Math.round(l.budget.dust * PARTICLE_SHARE[l.particles]); }
