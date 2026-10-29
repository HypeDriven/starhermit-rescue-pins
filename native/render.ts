// The cutaway storybook castle on starhermit:scene, as the browser build's
// js/render.js drew it with three.js r185: the authored orthographic camera
// (tilted a little from below), the stone shell (floor, side walls, merlons
// and back wall; brick texture and bump when detailed), the glass chambers
// with their dark interiors and pale frame edges, water (with its meniscus)
// and lava (flowing crust with hot cracks) filling by their amounts, the
// villagers (capsule body, head; hat and eyes when detailed) bobbing, the
// brass pins with their slots, ring handles and tips (lifted and lit when
// selected, with the spinning selection ring), the wall torches with their
// flickering lights, the drifting dust motes and the embers over lava.
// Graphics follow the runtime's quality tier (native/quality.ts: gfx.js's
// presets and budgets) and the game's palette option (default, colorblind,
// high contrast). The state shows as the rules leave it (render.js sync
// snapped every chamber to the state; no flow animation).
//
// From three.js r185 (physically based lights): colours as written, the
// punctual and hemisphere lights' intensities as written (engine.minor 23+). render.js's RoomEnvironment() without a renderer is r185's
// 900-candela room, so the port passes the renderer and lowers the room by
// 3.5 (engine spec, Porting environments); every lit material carries it as
// its own envMap at its envMapIntensity, as render.js did. The old composer
// (RenderPass in half floats → GTAO → UnrealBloom 0.5 / 0.45 / 0.9 → the
// colour grade + vignette → OutputPass with ACES at exposure 1.05 / 0.6 →
// SMAA / FXAA) is the runtime's renderer.ao / bloom / grade / antialias.
// The old canvas sat between the rails: the camera spans the window and its
// frustum is offset so the castle is framed in that rectangle.
import {
  ACESFilmicToneMapping, AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CapsuleGeometry, Color,
  ConeGeometry, CylinderGeometry, DirectionalLight, EdgesGeometry, Fog, Group, HemisphereLight, LineBasicMaterial, LineSegments, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, MeshPhysicalMaterial, MeshStandardMaterial, OrthographicCamera, PMREMGenerator, PointLight,
  Points, PointsMaterial, Raycaster, RepeatWrapping, RoomEnvironment, SRGBColorSpace, SphereGeometry, TorusGeometry, Vector2, Vector3,
  pointerToNdc, renderer, scene, type Material, type Object3D, type Texture,
} from "starhermit:scene";
import { OffscreenCanvas, type OffscreenCanvasRenderingContext2D } from "starhermit:canvas";
import type { LevelDef, State, Theme } from "./game.ts";
import { particleCount, type Look } from "./quality.ts";

/** render.js FRAMING (no magic offsets scattered through code). */
export const FRAMING = {
  cellW: 2.2, cellH: 2.0, wall: 0.18, pinLen: 1.6, pinRad: 0.17,
  viewMargin: 1.35, camTiltY: -0.32, camDist: 30,
};
const COLORS = {
  default: { water: 0x3f8cff, lava: 0xff5a2a, hero: 0xffe08a, pin: 0xe0b530, glass: 0xdceefc, frame: 0xf4f7fa, select: 0x7fe0a8, danger: 0xff3b30 },
  colorblind: { water: 0x0072b2, lava: 0xd55e00, hero: 0xf0e442, pin: 0xe08fc0, glass: 0xdceefc, frame: 0xf4f7fa, select: 0x009e73, danger: 0xd55e00 },
  highcontrast: { water: 0x00bfff, lava: 0xff2200, hero: 0xffffff, pin: 0xffd700, glass: 0xaaaaaa, frame: 0xffffff, select: 0x00ff88, danger: 0xff0000 },
};
export type PaletteName = keyof typeof COLORS;
export interface Rect { x: number; y: number; width: number; height: number }

// ---------------------------------------------------------------- procedural textures (render.js, unchanged drawing)
type Ctx = OffscreenCanvasRenderingContext2D;
function rng(seed: number): () => number { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvas(w: number, h: number): { c: OffscreenCanvas; g: Ctx } {
  const c = new OffscreenCanvas(w, h);
  return { c, g: c.getContext("2d")! as Ctx };
}
function brickCanvas(n: number): OffscreenCanvas {
  const { c, g } = canvas(n, n);
  const r = rng(7);
  g.scale(n / 256, n / 256);
  g.fillStyle = "#8a8a8a"; g.fillRect(0, 0, 256, 256); // mortar
  const rows = 8, bh = 256 / rows;
  for (let y = 0; y < rows; y++) {
    const off = (y % 2) * 32;
    for (let x = -1; x < 4; x++) {
      const v = 200 + Math.floor(r() * 45);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x * 64 + off + 2, y * bh + 2, 60, bh - 4);
    }
  }
  for (let i = 0; i < 2600; i++) { // grain
    const v = Math.floor(r() * 255);
    g.fillStyle = `rgba(${v},${v},${v},0.08)`;
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  return c;
}
function blotchCanvas(seed: number, dark: string, light: string, n: number): OffscreenCanvas {
  const { c, g } = canvas(n, n);
  const r = rng(seed);
  g.scale(n / 128, n / 128);
  g.fillStyle = dark; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) {
    const x = r() * 128, y = r() * 128, rad = 6 + r() * 18;
    for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) { // tileable
      if (x + dx + rad < 0 || x + dx - rad > 128 || y + dy + rad < 0 || y + dy - rad > 128) continue; // off the tile: draws nothing
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      gr.addColorStop(0, light); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  }
  return c;
}
const hex = (col: Color): string => "#" + col.getHex().toString(16).padStart(6, "0");
function skyCanvas(sky: number, accent: number): OffscreenCanvas {
  const { c, g } = canvas(4, 256);
  const base = new Color(sky);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, hex(base.clone().multiplyScalar(0.45)));
  gr.addColorStop(0.6, hex(base.clone().lerp(new Color(accent), 0.1)));
  gr.addColorStop(1, hex(base.clone().multiplyScalar(0.4)));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return c;
}
function dotCanvas(): OffscreenCanvas {
  const { c, g } = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function srgbTexture(c: OffscreenCanvas): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- the scene
// Lights run at 60% and exposure makes it back up (applied after bloom), so lit
// stone stays under the bloom threshold and only emissive things glow.
const LIGHT = 0.6;
const LAVA_GLOW = 1.8;
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
const raycaster = new Raycaster();
const ndc = new Vector2();

// one dominant key (shadow caster) + soft sky/ground fill (r185 intensities)
const key = new DirectionalLight(0xfff2dd, 2.8 * LIGHT);
key.position.set(5, 11, 9);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 3;
const fill = new HemisphereLight(0xcfe0ff, 0x4a4036, 1.2 * LIGHT);
scene.add(key, key.target, fill);

// layers: environment, gameplay, interaction (pins: picking), effects
const envGroup = new Group();
const gameplayGroup = new Group();
const interactionGroup = new Group();
const fxGroup = new Group();
scene.add(envGroup, gameplayGroup, interactionGroup, fxGroup);

interface CellView { water: Mesh; lava: Mesh; hero: Group; group: Group; surface: Mesh | null; phase: number; surfaceBase: number }
interface Torch { flame: Mesh; light: PointLight; phase: number }
let levelDisposables: { dispose(): void }[] = [];
let pinGroups = new Map<string, Group>();
let cellViews = new Map<string, CellView>();
let pinMats: MeshStandardMaterial[] = [];
let glassMat: Material | null = null;
let lavaMat: MeshStandardMaterial | MeshLambertMaterial | null = null;
let lavaTex: CanvasTexture | null = null;
let torches: Torch[] = [];
let dust: Points | null = null, embers: Points | null = null;
let dustSeed: Float32Array = new Float32Array(0), dustW = 1;
let ember = { life: new Float32Array(0), cell: new Int32Array(0), jitter: new Float32Array(0), rnd: rng(11) };
let selectionMarker: Mesh | null = null;
let selectedPinId: string | null = null;
let level: { def: LevelDef; theme: Theme | null; lastState: State | null } | null = null;
let look: Look | null = null;
let palette = COLORS.default;
let paletteName: PaletteName = "default";
let reducedMotion = false;
let envTex: Texture | null = null;
let time = 0;

function track<T extends { dispose(): void }>(o: T): T { levelDisposables.push(o); return o; }

function cellCenter(c: number, r: number, def: LevelDef): Vector3 {
  const w = def.cols * FRAMING.cellW, h = def.rows * FRAMING.cellH;
  return new Vector3(-w / 2 + c * FRAMING.cellW + FRAMING.cellW / 2, h / 2 - r * FRAMING.cellH - FRAMING.cellH / 2, 0);
}

function environmentTexture(): Texture | null {
  if (!envTex) {
    try {
      const pmrem = new PMREMGenerator(renderer);
      const room = new RoomEnvironment(renderer);
      room.position.y = -3.5;
      envTex = pmrem.fromScene(room, 0.04).texture;
    } catch (e) { console.warn(`environment: ${String(e)}`); }
  }
  return envTex;
}

interface SurfaceParams {
  color: number | Color; roughness?: number; metalness?: number; clearcoat?: number; clearcoatRoughness?: number; envMapIntensity?: number;
  map?: Texture | null; bumpMap?: Texture | null; bumpScale?: number; emissive?: number | Color; emissiveIntensity?: number; emissiveMap?: Texture | null;
  transparent?: boolean; opacity?: number; depthWrite?: boolean;
}
/**
 * Shading per the preset's budget: Lambert on Low, Standard on Balanced, Physical (clear-coated water and
 * villagers, glass, brass) on High/Ultra; brick bump only where the budget allows.
 */
function surface(p: SurfaceParams, physical = false): MeshStandardMaterial | MeshLambertMaterial {
  const bud = look!.budget;
  const { roughness, metalness, clearcoat, clearcoatRoughness, envMapIntensity, bumpMap, bumpScale, ...base } = p;
  const clean = Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined && v !== null));
  if (bud.material === "lambert") return new MeshLambertMaterial(clean);
  const std: Record<string, unknown> = { ...clean, roughness: roughness ?? 1, metalness: metalness ?? 0 };
  if (envMapIntensity !== undefined) std.envMapIntensity = envMapIntensity;
  if (bumpMap && bud.bump) Object.assign(std, { bumpMap, bumpScale });
  if (bud.material === "standard" || !physical) return new MeshStandardMaterial(std);
  return new MeshPhysicalMaterial({ ...std, ...(clearcoat ? { clearcoat, clearcoatRoughness: clearcoatRoughness || 0 } : {}) });
}

/** render.js build: the castle for a level, then sync to the state. */
export function build(state: State | null, def: LevelDef, theme: Theme | null): void {
  for (const d of levelDisposables) d.dispose();
  levelDisposables = [];
  envGroup.clear(); gameplayGroup.clear(); interactionGroup.clear(); fxGroup.clear();
  if (selectionMarker) scene.remove(selectionMarker);
  pinGroups = new Map(); cellViews = new Map(); pinMats = []; torches = [];
  dust = null; embers = null;
  level = { def, theme, lastState: state };
  selectedPinId = null;
  if (!look) return;

  const detailed = look.detailed;
  const bud = look.budget;
  const seg = (n: number, min = 3): number => Math.max(min, Math.round(n * bud.seg));
  const themeDef = theme || { sky: 0x20242c, stone: 0x777777, accent: 0x7fe0a8 };
  if (detailed) scene.background = track(srgbTexture(skyCanvas(themeDef.sky, themeDef.accent)));
  else scene.background = new Color(themeDef.sky);
  scene.fog = new Fog(themeDef.sky, 30, 60);

  const W = def.cols * FRAMING.cellW, H = def.rows * FRAMING.cellH;

  // stone: brick texture + bump when detailed; one material per box so the brick repeat follows each box's size
  const brick = detailed ? track(srgbTexture(brickCanvas(bud.brick))) : null;
  if (brick) { brick.wrapS = brick.wrapT = RepeatWrapping; brick.anisotropy = 4; }
  const plainStone = track(surface({ color: themeDef.stone, roughness: 0.9, envMapIntensity: 0.06 }));
  const stoneMat = (w: number, h: number): Material => {
    if (!brick) return plainStone;
    const map = track(brick.clone());
    map.repeat.set(Math.max(0.5, w / 2.4), Math.max(0.5, h / 1.4));
    map.needsUpdate = true;
    return track(surface({ color: themeDef.stone, roughness: 0.88, map, bumpMap: map, bumpScale: 1.4, envMapIntensity: 0.06 }));
  };
  glassMat = track(surface({ color: palette.glass, transparent: true, // render.js: 0.018 under the composer, 0.12 without (blended in display space there); the engine blends in
    // linear light on every tier, where 0.12 washes the dark interiors grey, so Low keeps the composer's value
    opacity: 0.018, roughness: 0.06,
    metalness: 0, envMapIntensity: 0.15, depthWrite: false }, true));
  // dark chamber interior: liquids, villagers and pins read against it, and the pale stone frame reads against it
  const interiorMat = track(surface({ color: new Color(themeDef.sky).multiplyScalar(0.9), roughness: 1, envMapIntensity: 0.03 }));
  const frameMat = track(new LineBasicMaterial({ color: palette.frame, transparent: true, opacity: 0.9 }));
  const slotMat = track(surface({ color: 0x14100a, roughness: 1, envMapIntensity: 0.03 }));
  const waterMat = track(surface({ color: palette.water, roughness: 0.15, clearcoat: 0.5, clearcoatRoughness: 0.1,
    emissive: palette.water, emissiveIntensity: 0.5 * LIGHT, envMapIntensity: 0.05 }, true));
  const surfaceMat = track(new MeshBasicMaterial({ color: new Color(palette.water).lerp(new Color(0xffffff), 0.3) }));
  lavaTex = detailed ? track(srgbTexture(blotchCanvas(3, "#5a1400", "rgba(255,230,150,0.95)", bud.lava))) : null;
  if (lavaTex) lavaTex.wrapS = lavaTex.wrapT = RepeatWrapping;
  // plain: flat glow; detailed: flowing crust with hot cracks bright enough (above the bloom threshold) to glow
  lavaMat = track(surface({ color: palette.lava, roughness: 0.5,
    emissive: detailed ? new Color(palette.lava).lerp(new Color(0xffffff), 0.45) : palette.lava,
    emissiveIntensity: detailed ? LAVA_GLOW : 0.7 * LIGHT, emissiveMap: lavaTex, envMapIntensity: 0.05 }));
  const heroMat = track(surface({ color: palette.hero, roughness: 0.55, clearcoat: 0.3, envMapIntensity: 0.08 }, true));
  const eyeMat = track(new MeshBasicMaterial({ color: 0x1a1410 }));
  const hatMat = track(surface({ color: 0x6b3b2a, roughness: 0.8, envMapIntensity: 0.08 }));

  const shadowy = <T extends Mesh>(m: T, cast = true, receive = true): T => { m.castShadow = cast; m.receiveShadow = receive; return m; };

  // castle shell: floor, side walls, crenellated top
  const floor = shadowy(new Mesh(track(new BoxGeometry(W + 1.6, 0.8, 2.4)), stoneMat(W + 1.6, 0.8)));
  floor.position.set(0, -H / 2 - 0.4, 0);
  envGroup.add(floor);
  for (const s of [-1, 1]) {
    const wall = shadowy(new Mesh(track(new BoxGeometry(0.8, H + 1.6, 2.4)), stoneMat(0.8, H + 1.6)));
    wall.position.set(s * (W / 2 + 0.4), 0, 0);
    envGroup.add(wall);
    const merlon = shadowy(new Mesh(track(new BoxGeometry(0.9, 0.6, 2.5)), stoneMat(0.9, 0.6)));
    merlon.position.set(s * (W / 2 + 0.4), H / 2 + 1.0, 0);
    envGroup.add(merlon);
    if (detailed) addTorch(s * (W / 2 + 0.4), H / 2 - 0.3);
  }
  const back = shadowy(new Mesh(track(new BoxGeometry(W + 1.6, H + 1.6, 0.3)), stoneMat(W + 1.6, H + 1.6)), false, true);
  back.position.set(0, 0, -1.25);
  envGroup.add(back);

  // chamber glass + contents
  for (let c = 0; c < def.cols; c++) {
    for (let r = 0; r < def.rows; r++) {
      const pos = cellCenter(c, r, def);
      const group = new Group();
      group.position.copy(pos);
      const glassGeo = track(new BoxGeometry(FRAMING.cellW - FRAMING.wall, FRAMING.cellH - FRAMING.wall, 1.8));
      const glass = new Mesh(glassGeo, glassMat);
      glass.renderOrder = 2;
      const interior = shadowy(new Mesh(track(new BoxGeometry(FRAMING.cellW - FRAMING.wall, FRAMING.cellH - FRAMING.wall, 0.1)), interiorMat), false, true);
      interior.position.z = -0.85;
      const frame = new LineSegments(track(new EdgesGeometry(glassGeo)), frameMat);
      group.add(interior, glass, frame);
      const water = shadowy(new Mesh(track(new BoxGeometry(FRAMING.cellW - 0.5, FRAMING.cellH - 0.6, 1.4)), waterMat));
      const lava = shadowy(new Mesh(track(new BoxGeometry(FRAMING.cellW - 0.5, FRAMING.cellH - 0.6, 1.4)), lavaMat));
      // bright meniscus line on the water surface (detailed)
      let meniscus: Mesh | null = null;
      if (detailed) {
        meniscus = new Mesh(track(new BoxGeometry(FRAMING.cellW - 0.48, 0.05, 1.42)), surfaceMat);
        meniscus.visible = false;
        group.add(meniscus);
      }
      const hero = new Group();
      const body = shadowy(new Mesh(track(new CapsuleGeometry(0.32, 0.5, seg(4, 2), seg(12, 8))), heroMat));
      const head = shadowy(new Mesh(track(new SphereGeometry(0.24, seg(16, 10), seg(12, 8))), heroMat));
      head.position.y = 0.65;
      hero.add(body, head);
      if (detailed) {
        const hat = shadowy(new Mesh(track(new ConeGeometry(0.27, 0.32, seg(14, 8))), hatMat));
        hat.position.y = 0.93;
        hero.add(hat);
        for (const ex of [-0.08, 0.08]) {
          const eye = new Mesh(track(new SphereGeometry(0.035, 8, 6)), eyeMat);
          eye.position.set(ex, 0.68, 0.22);
          hero.add(eye);
        }
      }
      group.add(water, lava, hero);
      gameplayGroup.add(group);
      cellViews.set(c + "," + r, { water, lava, hero, group, surface: meniscus, phase: c * 1.7 + r * 0.9, surfaceBase: 0 });
    }
  }

  // brass pins on the interaction layer (raycast only against these); each pin its own material for its highlight
  for (const p of def.pins) {
    const pinMat = track(surface({ color: palette.pin, metalness: 0.85, roughness: 0.3, envMapIntensity: 0.1 }, true));
    pinMats.push(pinMat as MeshStandardMaterial);
    const a = cellCenter(p.a[0], p.a[1], def), b = cellCenter(p.b[0], p.b[1], def);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const horizontal = p.a[1] !== p.b[1]; // separates rows -> pin lies horizontally
    const geo = track(new CylinderGeometry(FRAMING.pinRad, FRAMING.pinRad, FRAMING.pinLen, seg(detailed ? 20 : 10, 8)));
    const m = shadowy(new Mesh(geo, pinMat), true, false);
    m.position.set(0, 0, 0.6);
    // dark slot behind the pin so brass stays legible against pale stone
    const slot = shadowy(new Mesh(track(new BoxGeometry(horizontal ? FRAMING.pinLen + 0.3 : FRAMING.pinRad * 3.2,
      horizontal ? FRAMING.pinRad * 3.2 : FRAMING.pinLen + 0.3, 0.1)), slotMat), false, true);
    slot.position.set(mid.x, mid.y, 0.3);
    envGroup.add(slot);
    m.rotation.z = horizontal ? Math.PI / 2 : 0;
    const ring = shadowy(new Mesh(track(new TorusGeometry(0.32, 0.09, seg(detailed ? 12 : 8, 6), seg(detailed ? 28 : 16, 12))), pinMat), true, false);
    ring.position.set(horizontal ? FRAMING.pinLen / 2 + 0.2 : 0, horizontal ? 0 : FRAMING.pinLen / 2 + 0.2, 0.6);
    const pinGroup = new Group();
    pinGroup.position.set(mid.x, mid.y, 0);
    pinGroup.userData.base = { x: mid.x, y: mid.y };
    pinGroup.add(m, ring);
    if (detailed) { // rounded tip opposite the handle
      const tip = new Mesh(track(new SphereGeometry(FRAMING.pinRad * 1.05, seg(14, 8), seg(10, 6))), pinMat);
      tip.position.set(horizontal ? -FRAMING.pinLen / 2 : 0, horizontal ? 0 : -FRAMING.pinLen / 2, 0.6);
      tip.userData.pinId = p.id;
      pinGroup.add(tip);
    }
    pinGroup.userData.pinId = p.id;
    m.userData.pinId = p.id; ring.userData.pinId = p.id;
    interactionGroup.add(pinGroup);
    pinGroups.set(p.id, pinGroup);
  }

  // grounded selection marker
  selectionMarker = new Mesh(track(new TorusGeometry(0.5, 0.08, 8, 24)), track(new MeshBasicMaterial({ color: palette.select })));
  selectionMarker.visible = false;
  scene.add(selectionMarker);

  buildParticles(W, H);
  applyMaterialQuality();
  frameKey = "";
  sync(state);
}

function addTorch(x: number, y: number): void {
  const bracket = new Mesh(track(new CylinderGeometry(0.07, 0.1, 0.45, 8)),
    track(new MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.7, metalness: 0.3 })));
  bracket.position.set(x, y, 1.3);
  const flameMat = track(new MeshBasicMaterial({ color: new Color(0xffb04a).multiplyScalar(2.2) }));
  const flame = new Mesh(track(new ConeGeometry(0.12, 0.34, 10)), flameMat);
  flame.position.set(x, y + 0.36, 1.3);
  const light = new PointLight(0xffa24a, 3 * LIGHT, 7, 1.6);
  light.position.set(x, y + 0.5, 1.8);
  envGroup.add(bracket, flame, light);
  torches.push({ flame, light, phase: x });
}

function buildParticles(W: number, H: number): void {
  const n = particleCount(look!);
  if (!n) return;
  const dot = track(srgbTexture(dotCanvas()));
  const r = rng(11);
  // dust motes drifting in the light across the whole castle
  {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * (W + 3); pos[i * 3 + 1] = (r() - 0.5) * (H + 3); pos[i * 3 + 2] = 1.2 + r() * 1.5;
    }
    const geo = track(new BufferGeometry());
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    const mat = track(new PointsMaterial({ size: 0.09, map: dot, color: 0xfff1d0, transparent: true, opacity: 0.5,
      depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true }));
    dust = new Points(geo, mat);
    dustW = W + 3;
    dustSeed = new Float32Array(n).map(() => r() * 6.28);
    fxGroup.add(dust);
  }
  // embers rising from lava chambers
  {
    const m = Math.round(n * 0.5);
    const pos = new Float32Array(m * 3);
    const geo = track(new BufferGeometry());
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    const mat = track(new PointsMaterial({ size: 0.12, map: dot, color: new Color(0xffa040).multiplyScalar(2),
      transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending }));
    embers = new Points(geo, mat);
    ember = { life: new Float32Array(m).map(() => r()), cell: new Int32Array(m), jitter: new Float32Array(m), rnd: r };
    embers.visible = false;
    fxGroup.add(embers);
  }
}

/** Quality-dependent material tweaks that need no rebuild: environment maps, shadows. */
function applyMaterialQuality(): void {
  if (!look) return;
  const refl = look.reflections;
  const env = refl ? environmentTexture() : null;
  scene.environment = null;
  for (const m of pinMats) { m.metalness = refl ? 0.9 : 0.6; m.roughness = refl ? 0.36 : 0.34; }
  const sm = look.shadows;
  renderer.shadowMap.enabled = sm > 0;
  key.castShadow = sm > 0;
  if (sm > 0) key.shadow.mapSize = sm;
  // the key's shadow covers the castle (render.js fitShadow: half the larger side + 2.5 around the centre)
  if (level) {
    const ext = Math.max(level.def.cols * FRAMING.cellW, level.def.rows * FRAMING.cellH) / 2 + 2.5;
    const sc = key.shadow.camera as OrthographicCamera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 40;
    sc.updateProjectionMatrix();
  }
  scene.traverse((o: Object3D) => {
    const mat = (o as Mesh).material as Material | Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      if (m instanceof MeshStandardMaterial) m.envMap = env;
    }
  });
}

/** The runtime's quality tier applied live: rebuild the castle when the detail or budgets change, else the post chain. */
export function applyLook(next: Look): void {
  if (look && JSON.stringify(look) === JSON.stringify(next)) return;
  const prev = look;
  look = next;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05 / LIGHT;
  // UnrealBloomPass(0.5, 0.45, 0.9): only lava, torch flames, embers and the selection glow bloom.
  renderer.bloom = next.bloom ? { strength: 0.5, radius: 0.45, threshold: 0.9, resolution: next.budget.bloomRes } : null;
  // GTAO radius 0.6, distance exponent 1.5, thickness 1, 16 / 8 samples and the denoise per tier; blend 0.75.
  renderer.ao = next.ao === "off" ? null : {
    blendIntensity: 0.75, radius: 0.6, distanceExponent: 1.5, thickness: 1.0, scale: 1,
    samples: next.ao === "high" ? 16 : 8, resolution: next.budget.aoRes,
    denoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: next.ao === "high" ? 6 : 4, rings: 2, samples: next.ao === "high" ? 16 : 8, radiusExponent: 2 },
  };
  // GradeShader on the composer's linear buffer: a 0.22 S-curve, saturation 1.1, cool shadows / warm highlights by
  // a smoothstep of luma from 0.2 to 0.8, a 0.24 vignette from 0.35 to 0.85.
  renderer.grade = next.grade ? {
    space: "linear", contrast: 0.22, saturation: 1.1, split: [0.2, 0.8], shadows: [0.95, 0.98, 1.06], highlights: [1.05, 1.0, 0.94],
    vignette: { amount: 0.24, inner: 0.35, outer: 0.85 },
  } : null;
  renderer.antialias = next.antialias;
  const rebuild = !prev || prev.detailed !== next.detailed || particleCount(prev) !== particleCount(next) || prev.post !== next.post ||
    (["material", "brick", "bump", "lava", "seg"] as const).some((k) => prev.budget[k] !== next.budget[k]);
  if (level && rebuild) {
    const sel = selectedPinId;
    build(level.lastState, level.def, level.theme);
    select(sel);
  } else applyMaterialQuality();
}

/** Settings › Palette (render.js rebuilt the view). */
export function setPalette(name: PaletteName): void {
  if (name === paletteName) return;
  paletteName = name;
  palette = COLORS[name] || COLORS.default;
  if (level) { const sel = selectedPinId; build(level.lastState, level.def, level.theme); select(sel); }
}
export function setReducedMotion(v: boolean): void { reducedMotion = v; if (level) select(selectedPinId); }

/** render.js sync: every chamber shows the state's contents (water/lava fill by amount, villagers, pins left). */
export function sync(state: State | null): void {
  if (!state || !level) return;
  level.lastState = state;
  const H = FRAMING.cellH - 0.6;
  for (const [k, view] of cellViews) {
    const cell = state.chambers[k];
    if (!cell) continue;
    view.water.visible = cell.water > 0;
    if (cell.water > 0) {
      view.water.scale.y = Math.max(0.15, Math.min(1, cell.water / 3));
      view.water.position.y = -((1 - view.water.scale.y) * H) / 2;
    }
    if (view.surface) {
      view.surface.visible = cell.water > 0;
      view.surface.position.y = view.water.position.y + (view.water.scale.y * H) / 2;
      view.surfaceBase = view.surface.position.y;
    }
    view.lava.visible = cell.lava > 0;
    if (cell.lava > 0) {
      view.lava.scale.y = Math.max(0.15, Math.min(1, cell.lava / 3));
      view.lava.position.y = -((1 - view.lava.scale.y) * H) / 2;
    }
    view.hero.visible = !!cell.hero;
  }
  for (const [id, g] of pinGroups) g.visible = !state.pulledPins.includes(id);
}

/** render.js select: the lift pose, the selection glow and the grounded ring. */
export function select(pinId: string | null): void {
  selectedPinId = pinId;
  for (const [id, g] of pinGroups) {
    const on = id === pinId;
    const base = g.userData.base as { x: number; y: number };
    g.position.y = base.y + (on && !reducedMotion ? 0.25 : 0);
    g.traverse((o: Object3D) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (m && m.emissive !== undefined) m.emissive.setHex(on ? palette.select : 0x000000);
    });
  }
  const g = pinId ? pinGroups.get(pinId) : undefined;
  if (g && selectionMarker) {
    const base = g.userData.base as { x: number; y: number };
    selectionMarker.visible = true;
    selectionMarker.position.set(base.x, base.y, 0.9);
  } else if (selectionMarker) selectionMarker.visible = false;
}

// -------------------------------------------------------------- framing and picking
let frameKey = "";
let win = { w: 1, h: 1 };
let view: Rect = { x: 0, y: 0, width: 1, height: 1 };
/** render.js fitCamera, fitted into the view rectangle; the frustum spans the whole window. */
function fitCamera(): void {
  if (!level) return;
  const def = level.def;
  const W = def.cols * FRAMING.cellW + 2 * FRAMING.viewMargin;
  const H = def.rows * FRAMING.cellH + 2 * FRAMING.viewMargin;
  const aspect = view.width / Math.max(1, view.height);
  const viewH = Math.max(H, W / aspect);
  const unit = viewH / Math.max(1, view.height);
  const cx = view.x + view.width / 2, cy = view.y + view.height / 2;
  camera.left = -cx * unit; camera.right = (win.w - cx) * unit;
  camera.top = cy * unit; camera.bottom = -(win.h - cy) * unit;
  camera.position.set(0, (FRAMING.camTiltY * viewH) / 4, FRAMING.camDist);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}
/** C: re-frame the view. */
export function reframe(): void { frameKey = ""; }
/** Whether the castle draws (render.js always drew it; hidden only while the runtime covers the window). */
export function setActive(on: boolean): void { renderer.camera = on ? camera : null; }

/** The pin under a window point (render.js pick: raycast against the interaction layer only). */
export function pick(x: number, y: number): string | null {
  pointerToNdc(x, y, ndc);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(interactionGroup.children, true);
  for (const h of hits) {
    let o: Object3D | null = h.object;
    while (o && !o.userData.pinId) o = o.parent;
    if (o && o.userData.pinId) {
      const g = pinGroups.get(o.userData.pinId as string);
      if (g && g.visible) return o.userData.pinId as string;
    }
  }
  return null;
}
/** A pin's handle-to-tip box on screen (window px), for its named target; null when pulled. */
export function pinScreenRect(id: string): Rect | null {
  const g = pinGroups.get(id);
  if (!g || !g.visible || !level) return null;
  const p = level.def.pins.find((q) => q.id === id);
  if (!p) return null;
  const horizontal = p.a[1] !== p.b[1];
  const base = { x: g.position.x, y: g.position.y }; // lifted when selected
  const half = FRAMING.pinLen / 2 + 0.55, thick = 0.4;
  const pts = horizontal
    ? [[base.x - half + 0.25, base.y - thick], [base.x + half, base.y + thick]]
    : [[base.x - thick, base.y - half + 0.25], [base.x + thick, base.y + half]];
  const s = pts.map(([x, y]) => {
    const v = new Vector3(x, y, 0.6).project(camera);
    return { x: ((v.x + 1) / 2) * win.w, y: ((1 - v.y) / 2) * win.h };
  });
  const x0 = Math.min(s[0]!.x, s[1]!.x), x1 = Math.max(s[0]!.x, s[1]!.x), y0 = Math.min(s[0]!.y, s[1]!.y), y1 = Math.max(s[0]!.y, s[1]!.y);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// -------------------------------------------------------------- each frame
function animate(t: number, dt: number): void {
  if (reducedMotion) return; // static poses, no drift, no flicker
  for (const v of cellViews.values()) {
    if (v.hero.visible) v.hero.position.y = Math.sin(t * 2.2 + v.phase) * 0.04;
    if (v.surface && v.surface.visible) v.surface.position.y = v.surfaceBase + Math.sin(t * 3 + v.phase) * 0.015;
  }
  if (lavaTex) { lavaTex.offset.x = t * 0.03; lavaTex.offset.y = -t * 0.05; }
  if (lavaMat && look?.detailed) lavaMat.emissiveIntensity = LAVA_GLOW * (1 + Math.sin(t * 2.4) * 0.1);
  for (const tc of torches) {
    const f = 0.85 + 0.15 * Math.sin(t * 13 + tc.phase) * Math.sin(t * 7.3 + tc.phase * 2);
    tc.flame.scale.set(1, f * 1.1, 1);
    tc.light.intensity = ((3 * LIGHT) / Math.PI) * f;
  }
  if (dust) {
    const p = dust.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) + dt * 0.12;
      const y = p.getY(i) + Math.sin(t * 0.6 + dustSeed[i]!) * dt * 0.08;
      if (x > dustW / 2) x -= dustW;
      p.setXY(i, x, y);
    }
    p.needsUpdate = true;
  }
  if (embers && level) {
    const lavaCells: CellView[] = [];
    for (const v of cellViews.values()) if (v.lava.visible) lavaCells.push(v);
    embers.visible = lavaCells.length > 0;
    if (!embers.visible) return;
    const p = embers.geometry.attributes.position as BufferAttribute, u = ember;
    const H = FRAMING.cellH - 0.6;
    for (let i = 0; i < p.count; i++) {
      u.life[i] = u.life[i]! + dt * 0.45;
      if (u.life[i]! >= 1 || u.cell[i]! >= lavaCells.length) {
        u.life[i] = u.life[i]! % 1;
        u.cell[i] = Math.floor(u.rnd() * lavaCells.length);
        u.jitter[i] = (u.rnd() - 0.5) * (FRAMING.cellW - 0.6);
      }
      const v = lavaCells[u.cell[i]!]!;
      const top = v.group.position.y + v.lava.position.y + (v.lava.scale.y * H) / 2;
      const room = Math.max(0.2, v.group.position.y + FRAMING.cellH / 2 - 0.15 - top);
      p.setXYZ(i, v.group.position.x + u.jitter[i]! + Math.sin(t * 3 + i) * 0.05, top + u.life[i]! * room, 0.75);
    }
    p.needsUpdate = true;
  }
}

/** Each frame: framing to the view rectangle, the selection ring's spin and the ambient animation. */
export function update(dt: number, w: number, h: number, rect: Rect): void {
  dt = Math.min(0.25, dt);
  time += dt;
  const fk = `${w}x${h}:${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
  if (w > 0 && h > 0 && rect.width > 0 && rect.height > 0 && fk !== frameKey) {
    frameKey = fk;
    win = { w, h };
    view = { ...rect };
    fitCamera();
  }
  if (selectionMarker && selectionMarker.visible && !reducedMotion) selectionMarker.rotation.z = time;
  animate(time, dt);
}
