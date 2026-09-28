// Rescue Pins — Three.js scene: cutaway storybook castle, glass chambers,
// brass pins, liquid blobs, hero. Orthographic authored camera.
// Graphics quality (shadows, IBL, post chain, detail, particles, render scale)
// comes from gfx.js and is applied live through setGraphics().

import * as THREE from './three.min.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { detectPreset, resolve, SHADOW_MAP, PARTICLE_COUNT } from './gfx.js';

// authored framing constants (no magic offsets scattered through code)
export const FRAMING = {
  cellW: 2.2, cellH: 2.0, wall: 0.18, pinLen: 1.6, pinRad: 0.17,
  viewMargin: 1.35,           // world-units margin around the castle
  camTiltY: -0.32, camDist: 30,
};

const COLORS = {
  default:      { water: 0x3f8cff, lava: 0xff5a2a, hero: 0xffe08a, pin: 0xe0b530, glass: 0xdceefc, frame: 0xf4f7fa, select: 0x7fe0a8, danger: 0xff3b30 },
  colorblind:   { water: 0x0072b2, lava: 0xd55e00, hero: 0xf0e442, pin: 0xe08fc0, glass: 0xdceefc, frame: 0xf4f7fa, select: 0x009e73, danger: 0xd55e00 },
  highcontrast: { water: 0x00bfff, lava: 0xff2200, hero: 0xffffff, pin: 0xffd700, glass: 0xaaaaaa, frame: 0xffffff, select: 0x00ff88, danger: 0xff0000 },
};

// Colour grade + vignette (display-space colours in, display-space out).
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 1.0 }, uVignette: { value: 0.24 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAmount; uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      vec3 lc = clamp(c, 0.0, 1.0);
      // gentle S-curve, a touch more saturation, warm highlights / cool shadows (storybook)
      vec3 s = mix(lc, lc * lc * (3.0 - 2.0 * lc), 0.22);
      float l = dot(s, vec3(0.299, 0.587, 0.114));
      s = mix(vec3(l), s, 1.1);
      s *= mix(vec3(0.95, 0.98, 1.06), vec3(1.05, 1.0, 0.94), smoothstep(0.2, 0.8, l));
      s = s * 0.97 + 0.02;
      c = mix(c, s + max(c - 1.0, 0.0), uAmount);
      float d = length(vUv - 0.5);
      c *= 1.0 - uVignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = vec4(c, src.a);
    }`,
};

// GTAO that ignores the glass fronts (transparent) so contents keep their contact shadows.
class ChamberGTAOPass extends GTAOPass {
  _overrideVisibility() {
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      if (!o.visible) return;
      if (o.isPoints || o.isLine || o.isLine2 || (o.material && o.material.transparent)) {
        o.visible = false;
        cache.push(o);
      }
    });
  }
}

// ---- procedural textures (canvas, deterministic) ----
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function brickCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const r = rng(7);
  g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, 256, 256); // mortar
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

function blotchCanvas(seed, dark, light) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const r = rng(seed);
  g.fillStyle = dark; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) {
    const x = r() * 128, y = r() * 128, rad = 6 + r() * 18;
    for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) { // tileable
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      gr.addColorStop(0, light); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  }
  return c;
}

function skyCanvas(sky, accent) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const base = new THREE.Color(sky);
  const hex = (col) => '#' + col.getHexString();
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, hex(base.clone().multiplyScalar(0.45)));
  gr.addColorStop(0.6, hex(base.clone().lerp(new THREE.Color(accent), 0.1)));
  gr.addColorStop(1, hex(base.clone().multiplyScalar(0.4)));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return c;
}

function dotCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

function readGpu(renderer) {
  try {
    const gl = renderer.getContext();
    let name = gl.getParameter(gl.RENDERER) || '';
    // Only ask for the (deprecated in Firefox) debug extension when the plain string is masked.
    if (/^(webkit webgl|mozilla)$/i.test(name) && !/firefox/i.test(navigator.userAgent)) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) name = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || name;
    }
    return String(name);
  } catch { return ''; }
}

function isMobileDevice() {
  try {
    return (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  } catch { return false; }
}

export function createRenderer(container, opts) {
  const settings = opts.settings;
  const palette = COLORS[settings.graphics.palette] || COLORS.default;
  const osReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reducedMotion = !!settings.graphics.reducedMotion || osReduced;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    return null; // caller shows the compatibility fallback
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Lights run at 60% and exposure makes it back up (applied after bloom), so lit
  // stone stays under the bloom threshold and only emissive things glow.
  const LIGHT = 0.6;
  renderer.toneMappingExposure = 1.05 / LIGHT;
  const LAVA_GLOW = 1.8;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const gpu = readGpu(renderer);
  const detected = detectPreset(gpu, isMobileDevice());

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  // layers: 0 environment, 1 gameplay, 2 interaction/selection
  const gameplayGroup = new THREE.Group();
  const envGroup = new THREE.Group();
  const interactionGroup = new THREE.Group();
  const fxGroup = new THREE.Group();
  scene.add(envGroup, gameplayGroup, interactionGroup, fxGroup);

  // lighting: one dominant key (shadow caster) + soft sky/ground fill
  const key = new THREE.DirectionalLight(0xfff2dd, 2.8 * LIGHT);
  key.position.set(5, 11, 9);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  const fill = new THREE.HemisphereLight(0xcfe0ff, 0x4a4036, 1.2 * LIGHT);
  scene.add(key, key.target, fill);

  container.appendChild(renderer.domElement);

  let disposables = [];
  let levelDisposables = [];
  let pinMeshes = new Map();   // pinId -> mesh (interaction layer)
  let cellViews = new Map();   // "c,r" -> { water, lava, hero, group, surface }
  let pinMats = [];
  let glassMat = null, lavaMat = null, lavaTex = null;
  let torches = [];
  let dust = null, embers = null;
  let selectionMarker = null;
  let selectedPinId = null;
  let level = null;
  let running = true;
  let onContextLost = null;

  // graphics state
  let q = resolve({}, detected);
  let envTex = null;
  let composer = null, postKey = null, postFailed = false, gradePass = null;
  let pixelRatio = 1, size = [0, 0];
  let adaptiveScale = 1, frameTimes = [], fps = 0, lastT = 0, time = 0;

  function track(...objs) { levelDisposables.push(...objs); return objs[0]; }

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running = false;
    if (onContextLost) onContextLost();
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    running = true;
    postKey = null;
    if (level) build(level.lastState || null, level.def, level.theme);
  });

  function cellCenter(c, r, def) {
    const w = def.cols * FRAMING.cellW, h = def.rows * FRAMING.cellH;
    return new THREE.Vector3(-w / 2 + c * FRAMING.cellW + FRAMING.cellW / 2,
                             h / 2 - r * FRAMING.cellH - FRAMING.cellH / 2, 0);
  }

  function environmentTexture() {
    if (!envTex) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      envTex = pmrem.fromScene(room, 0.04).texture;
      room.dispose();
      pmrem.dispose();
      disposables.push(envTex);
    }
    return envTex;
  }

  function build(state, def, theme) {
    // explicit disposal of previous scene resources
    for (const d of levelDisposables) { if (d.dispose) d.dispose(); }
    levelDisposables = [];
    gameplayGroup.clear(); envGroup.clear(); interactionGroup.clear(); fxGroup.clear();
    if (selectionMarker) scene.remove(selectionMarker);
    pinMeshes = new Map(); cellViews = new Map(); pinMats = []; torches = [];
    dust = null; embers = null;
    level = { def, theme, lastState: state };
    selectedPinId = null;

    const detailed = q.detail === 'detailed';
    const themeDef = theme || { sky: 0x20242c, stone: 0x777777, accent: 0x7fe0a8 };
    if (detailed) {
      const sky = track(new THREE.CanvasTexture(skyCanvas(themeDef.sky, themeDef.accent)));
      sky.colorSpace = THREE.SRGBColorSpace;
      scene.background = sky;
    } else {
      scene.background = new THREE.Color(themeDef.sky);
    }
    scene.fog = new THREE.Fog(themeDef.sky, 30, 60);

    const W = def.cols * FRAMING.cellW, H = def.rows * FRAMING.cellH;

    // stone: brick texture + bump when detailed; one material per box so the
    // brick repeat follows each box's size
    const brick = detailed ? track(new THREE.CanvasTexture(brickCanvas())) : null;
    if (brick) { brick.colorSpace = THREE.SRGBColorSpace; brick.wrapS = brick.wrapT = THREE.RepeatWrapping; brick.anisotropy = 4; }
    const plainStone = track(new THREE.MeshStandardMaterial({ color: themeDef.stone, roughness: 0.9, envMapIntensity: 0.06 }));
    const stoneMat = (w, h) => {
      if (!brick) return plainStone;
      const map = track(brick.clone());
      map.repeat.set(Math.max(0.5, w / 2.4), Math.max(0.5, h / 1.4));
      map.needsUpdate = true;
      return track(new THREE.MeshStandardMaterial({ color: themeDef.stone, roughness: 0.88, map, bumpMap: map, bumpScale: 1.4, envMapIntensity: 0.06 }));
    };
    glassMat = track(new THREE.MeshPhysicalMaterial({ color: palette.glass, transparent: true, opacity: composer ? 0.018 : 0.12, roughness: 0.06,
      metalness: 0, envMapIntensity: 0.15, depthWrite: false }));
    // dark chamber interior: liquids, villagers and pins read against it, and
    // the pale stone frame reads against the interior — a real cutaway.
    const interiorMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(themeDef.sky).multiplyScalar(0.9), roughness: 1, envMapIntensity: 0.03 }));
    const frameMat = track(new THREE.LineBasicMaterial({ color: palette.frame, transparent: true, opacity: 0.9 }));
    const slotMat = track(new THREE.MeshStandardMaterial({ color: 0x14100a, roughness: 1, envMapIntensity: 0.03 }));
    const waterMat = track(new THREE.MeshPhysicalMaterial({ color: palette.water, roughness: 0.15, clearcoat: 0.5, clearcoatRoughness: 0.1,
      emissive: palette.water, emissiveIntensity: 0.5 * LIGHT, envMapIntensity: 0.05 }));
    const surfaceMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.water).lerp(new THREE.Color(0xffffff), 0.3) }));
    if (detailed) {
      lavaTex = track(new THREE.CanvasTexture(blotchCanvas(3, '#5a1400', 'rgba(255,230,150,0.95)')));
      lavaTex.colorSpace = THREE.SRGBColorSpace; lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
    } else lavaTex = null;
    // plain: flat glow as before; detailed: flowing crust with hot cracks bright
    // enough (above the bloom threshold) to glow
    lavaMat = track(new THREE.MeshStandardMaterial({ color: palette.lava, roughness: 0.5,
      emissive: detailed ? new THREE.Color(palette.lava).lerp(new THREE.Color(0xffffff), 0.45) : palette.lava,
      emissiveIntensity: detailed ? LAVA_GLOW : 0.7 * LIGHT, emissiveMap: lavaTex, envMapIntensity: 0.05 }));
    const heroMat = track(new THREE.MeshPhysicalMaterial({ color: palette.hero, roughness: 0.55, clearcoat: 0.3, envMapIntensity: 0.08 }));
    const eyeMat = track(new THREE.MeshBasicMaterial({ color: 0x1a1410 }));
    const hatMat = track(new THREE.MeshStandardMaterial({ color: 0x6b3b2a, roughness: 0.8, envMapIntensity: 0.08 }));

    const shadowy = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };

    // castle shell: floor, side walls, crenellated top
    const floor = shadowy(new THREE.Mesh(track(new THREE.BoxGeometry(W + 1.6, 0.8, 2.4)), stoneMat(W + 1.6, 0.8)));
    floor.position.set(0, -H / 2 - 0.4, 0);
    envGroup.add(floor);
    for (const s of [-1, 1]) {
      const wall = shadowy(new THREE.Mesh(track(new THREE.BoxGeometry(0.8, H + 1.6, 2.4)), stoneMat(0.8, H + 1.6)));
      wall.position.set(s * (W / 2 + 0.4), 0, 0);
      envGroup.add(wall);
      const merlon = shadowy(new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 0.6, 2.5)), stoneMat(0.9, 0.6)));
      merlon.position.set(s * (W / 2 + 0.4), H / 2 + 1.0, 0);
      envGroup.add(merlon);
      if (detailed) addTorch(s * (W / 2 + 0.4), H / 2 - 0.3);
    }
    const back = shadowy(new THREE.Mesh(track(new THREE.BoxGeometry(W + 1.6, H + 1.6, 0.3)), stoneMat(W + 1.6, H + 1.6)), false, true);
    back.position.set(0, 0, -1.25);
    envGroup.add(back);

    // chamber glass + contents
    for (let c = 0; c < def.cols; c++) {
      for (let r = 0; r < def.rows; r++) {
        const pos = cellCenter(c, r, def);
        const group = new THREE.Group();
        group.position.copy(pos);
        const glassGeo = track(new THREE.BoxGeometry(FRAMING.cellW - FRAMING.wall, FRAMING.cellH - FRAMING.wall, 1.8));
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.renderOrder = 2;
        const interior = shadowy(new THREE.Mesh(track(new THREE.BoxGeometry(FRAMING.cellW - FRAMING.wall, FRAMING.cellH - FRAMING.wall, 0.1)), interiorMat), false, true);
        interior.position.z = -0.85;
        const frame = new THREE.LineSegments(track(new THREE.EdgesGeometry(glassGeo)), frameMat);
        group.add(interior, glass, frame);
        const water = shadowy(new THREE.Mesh(track(new THREE.BoxGeometry(FRAMING.cellW - 0.5, FRAMING.cellH - 0.6, 1.4)), waterMat));
        const lava = shadowy(new THREE.Mesh(track(new THREE.BoxGeometry(FRAMING.cellW - 0.5, FRAMING.cellH - 0.6, 1.4)), lavaMat));
        // bright meniscus line on the water surface (detailed)
        let surface = null;
        if (detailed) {
          surface = new THREE.Mesh(track(new THREE.BoxGeometry(FRAMING.cellW - 0.48, 0.05, 1.42)), surfaceMat);
          surface.visible = false;
          group.add(surface);
        }
        const hero = new THREE.Group();
        const body = shadowy(new THREE.Mesh(track(new THREE.CapsuleGeometry(0.32, 0.5, 4, 12)), heroMat));
        const head = shadowy(new THREE.Mesh(track(new THREE.SphereGeometry(0.24, 16, 12)), heroMat));
        head.position.y = 0.65;
        hero.add(body, head);
        if (detailed) {
          const hat = shadowy(new THREE.Mesh(track(new THREE.ConeGeometry(0.27, 0.32, 14)), hatMat));
          hat.position.y = 0.93;
          hero.add(hat);
          for (const ex of [-0.08, 0.08]) {
            const eye = new THREE.Mesh(track(new THREE.SphereGeometry(0.035, 8, 6)), eyeMat);
            eye.position.set(ex, 0.68, 0.22);
            hero.add(eye);
          }
        }
        hero.userData.phase = (c * 1.7 + r * 0.9);
        group.add(water, lava, hero);
        gameplayGroup.add(group);
        cellViews.set(c + ',' + r, { water, lava, hero, group, surface });
      }
    }

    // brass pins on the interaction layer (raycast only against these).
    // Each pin gets its OWN material instance: the selection highlight writes
    // emissive per pin, and a shared material would light up every pin at once.
    for (const p of def.pins) {
      const pinMat = track(new THREE.MeshPhysicalMaterial({ color: palette.pin, metalness: 0.85, roughness: 0.3,
        envMapIntensity: 0.1 }));
      pinMats.push(pinMat);
      const a = cellCenter(p.a[0], p.a[1], def), b = cellCenter(p.b[0], p.b[1], def);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const horizontal = p.a[1] !== p.b[1]; // separates rows -> pin lies horizontally
      const geo = track(new THREE.CylinderGeometry(FRAMING.pinRad, FRAMING.pinRad, FRAMING.pinLen, detailed ? 20 : 10));
      const m = shadowy(new THREE.Mesh(geo, pinMat), true, false);
      m.position.set(0, 0, 0.6);
      // dark slot behind the pin so brass stays legible against pale stone
      const slot = shadowy(new THREE.Mesh(track(new THREE.BoxGeometry(horizontal ? FRAMING.pinLen + 0.3 : FRAMING.pinRad * 3.2,
                                                              horizontal ? FRAMING.pinRad * 3.2 : FRAMING.pinLen + 0.3, 0.1)), slotMat), false, true);
      slot.position.set(mid.x, mid.y, 0.3);
      envGroup.add(slot);
      m.rotation.z = horizontal ? Math.PI / 2 : 0;
      // ring handle
      const ring = shadowy(new THREE.Mesh(track(new THREE.TorusGeometry(0.32, 0.09, detailed ? 12 : 8, detailed ? 28 : 16)), pinMat), true, false);
      ring.position.set(horizontal ? FRAMING.pinLen / 2 + 0.2 : 0,
                        horizontal ? 0 : FRAMING.pinLen / 2 + 0.2, 0.6);
      // group anchored at the pin's world position so selection/lift poses
      // and the marker use a real location (children are group-relative)
      const pinGroup = new THREE.Group();
      pinGroup.position.set(mid.x, mid.y, 0);
      pinGroup.userData.base = mid.clone();
      pinGroup.add(m, ring);
      if (detailed) { // rounded tip opposite the handle
        const tip = new THREE.Mesh(track(new THREE.SphereGeometry(FRAMING.pinRad * 1.05, 14, 10)), pinMat);
        tip.position.set(horizontal ? -FRAMING.pinLen / 2 : 0, horizontal ? 0 : -FRAMING.pinLen / 2, 0.6);
        tip.userData.pinId = p.id;
        pinGroup.add(tip);
      }
      pinGroup.userData.pinId = p.id;
      m.userData.pinId = p.id; ring.userData.pinId = p.id;
      interactionGroup.add(pinGroup);
      pinMeshes.set(p.id, pinGroup);
    }

    // grounded selection marker
    selectionMarker = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.5, 0.08, 8, 24)),
      track(new THREE.MeshBasicMaterial({ color: palette.select })));
    selectionMarker.visible = false;
    scene.add(selectionMarker);

    buildParticles(W, H);
    fitShadow(W, H);
    applyMaterialQuality();
    fitCamera(def);
    sync(state);
  }

  function addTorch(x, y) {
    const bracket = new THREE.Mesh(track(new THREE.CylinderGeometry(0.07, 0.1, 0.45, 8)),
      track(new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.7, metalness: 0.3 })));
    bracket.position.set(x, y, 1.3);
    const flameMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb04a).multiplyScalar(2.2) }));
    const flame = new THREE.Mesh(track(new THREE.ConeGeometry(0.12, 0.34, 10)), flameMat);
    flame.position.set(x, y + 0.36, 1.3);
    const light = new THREE.PointLight(0xffa24a, 3 * LIGHT, 7, 1.6);
    light.position.set(x, y + 0.5, 1.8);
    envGroup.add(bracket, flame, light);
    torches.push({ flame, light, phase: x });
  }

  function buildParticles(W, H) {
    const n = PARTICLE_COUNT[q.particles] || 0;
    if (!n) return;
    const dot = track(new THREE.CanvasTexture(dotCanvas()));
    const r = rng(11);
    // dust motes drifting in the light across the whole castle
    {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (r() - 0.5) * (W + 3); pos[i * 3 + 1] = (r() - 0.5) * (H + 3); pos[i * 3 + 2] = 1.2 + r() * 1.5;
      }
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = track(new THREE.PointsMaterial({ size: 0.09, map: dot, color: 0xfff1d0, transparent: true, opacity: 0.5,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
      dust = new THREE.Points(geo, mat);
      dust.userData = { W: W + 3, H: H + 3, seed: new Float32Array(n).map(() => r() * 6.28) };
      fxGroup.add(dust);
    }
    // embers rising from lava chambers
    {
      const m = Math.round(n * 0.5);
      const pos = new Float32Array(m * 3);
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = track(new THREE.PointsMaterial({ size: 0.12, map: dot, color: new THREE.Color(0xffa040).multiplyScalar(2),
        transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      embers = new THREE.Points(geo, mat);
      embers.userData = { life: new Float32Array(m).map(() => r()), cell: new Int32Array(m), rnd: r, jitter: new Float32Array(m) };
      embers.visible = false;
      fxGroup.add(embers);
    }
  }

  function fitShadow(W, H) {
    const ext = Math.max(W, H) / 2 + 2.5;
    const sc = key.shadow.camera;
    Object.assign(sc, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 40 });
    sc.updateProjectionMatrix();
  }

  // quality-dependent material tweaks that do not need a rebuild
  function applyMaterialQuality() {
    const refl = q.reflections === 'on';
    // per-material envMap (not scene.environment) so each envMapIntensity is honoured
    const env = refl ? environmentTexture() : null;
    scene.environment = null;
    for (const m of pinMats) { m.metalness = refl ? 0.9 : 0.6; m.roughness = refl ? 0.36 : 0.34; }
    const sm = SHADOW_MAP[q.shadows];
    renderer.shadowMap.enabled = sm > 0;
    key.castShadow = sm > 0;
    if (sm > 0 && key.shadow.mapSize.x !== sm) {
      key.shadow.mapSize.set(sm, sm);
      if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    }
    for (const t of torches) t.light.visible = true;
    // shadow-map / env changes recompile programs
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.isMeshStandardMaterial) m.envMap = env;
        m.needsUpdate = true;
      }
    });
  }

  function fitCamera(def) {
    const W = def.cols * FRAMING.cellW + 2 * FRAMING.viewMargin;
    const H = def.rows * FRAMING.cellH + 2 * FRAMING.viewMargin;
    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    const viewH = Math.max(H, W / aspect);
    camera.left = -viewH * aspect / 2; camera.right = viewH * aspect / 2;
    camera.top = viewH / 2; camera.bottom = -viewH / 2;
    camera.position.set(0, FRAMING.camTiltY * viewH / 4, FRAMING.camDist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  // render reflects simulation state (interpolation hook kept for animation)
  function sync(state, alpha) {
    if (!state || !level) return;
    level.lastState = state;
    void alpha;
    for (const [key, view] of cellViews) {
      const cell = state.chambers[key];
      if (!cell) continue;
      view.water.visible = cell.water > 0;
      if (cell.water > 0) {
        const fillFrac = Math.min(1, cell.water / 3);
        view.water.scale.y = Math.max(0.15, fillFrac);
        view.water.position.y = -((1 - view.water.scale.y) * (FRAMING.cellH - 0.6)) / 2;
      }
      if (view.surface) {
        view.surface.visible = cell.water > 0;
        view.surface.position.y = view.water.position.y + view.water.scale.y * (FRAMING.cellH - 0.6) / 2;
        view.surface.userData.baseY = view.surface.position.y;
      }
      view.lava.visible = cell.lava > 0;
      if (cell.lava > 0) {
        const fillFrac = Math.min(1, cell.lava / 3);
        view.lava.scale.y = Math.max(0.15, fillFrac);
        view.lava.position.y = -((1 - view.lava.scale.y) * (FRAMING.cellH - 0.6)) / 2;
      }
      view.hero.visible = !!cell.hero;
    }
    for (const [id, g] of pinMeshes) {
      g.visible = !state.pulledPins.includes(id);
    }
  }

  function select(pinId) {
    selectedPinId = pinId;
    for (const [id, g] of pinMeshes) {
      const on = id === pinId;
      g.position.y = g.userData.base.y + (on && !reducedMotion ? 0.25 : 0); // lift pose
      g.traverse(o => { if (o.material && o.material.emissive !== undefined) o.material.emissive.setHex(on ? palette.select : 0x000000); });
    }
    if (pinId && pinMeshes.has(pinId)) {
      selectionMarker.visible = true;
      selectionMarker.position.copy(pinMeshes.get(pinId).userData.base);
      selectionMarker.position.z = 0.9;
    } else if (selectionMarker) selectionMarker.visible = false;
  }

  // raycast only against the interaction layer
  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(interactionGroup.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.pinId) o = o.parent;
      if (o && o.userData.pinId) {
        const g = pinMeshes.get(o.userData.pinId);
        if (g && g.visible) return o.userData.pinId;
      }
    }
    return null;
  }

  // ---- graphics settings ----

  /** Apply saved graphics settings ({ preset, render_scale, adaptive, show_fps, <category> }). */
  function setGraphics(saved) {
    const prev = q;
    q = resolve(saved || {}, detected);
    adaptiveScale = 1;
    frameTimes = [];
    postKey = null; // rebuild the post chain on the next frame
    postFailed = false;
    fpsVisible(q.showFps);
    renderer.domElement.dataset.gfxPreset = q.preset;
    document.body.dataset.gfxPreset = q.preset;
    // detail + particle counts change geometry: rebuild the level view
    if (level && (prev.detail !== q.detail || prev.particles !== q.particles)) {
      const sel = selectedPinId;
      build(level.lastState, level.def, level.theme);
      select(sel);
    } else {
      applyMaterialQuality();
    }
    resize();
  }

  /** What the settings panel shows: GPU, auto choice, resolved tiers, pixels, frame rate. */
  function graphicsInfo() {
    return {
      gpu, detected, resolved: q,
      pixels: [Math.round(size[0] * pixelRatio), Math.round(size[1] * pixelRatio)],
      fps: Math.round(fps), adaptiveScale: Math.round(adaptiveScale * 100) / 100, postFailed,
    };
  }

  function fpsVisible(on) {
    let el = document.getElementById('rp-fps');
    if (on && !el) {
      el = document.createElement('div');
      el.id = 'rp-fps';
      el.setAttribute('aria-hidden', 'true');
      el.textContent = '… fps';
      document.body.appendChild(el);
    }
    if (el) el.hidden = !on;
  }

  function buildPost(w, h) {
    if (composer) { composer.dispose(); composer = null; }
    gradePass = null;
    if (!q.post || postFailed) return;
    try {
      const pw = Math.max(1, Math.round(w * pixelRatio)), ph = Math.max(1, Math.round(h * pixelRatio));
      const target = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType, samples: q.antialias === 'msaa' ? 4 : 0 });
      const c = new EffectComposer(renderer, target);
      c.setPixelRatio(pixelRatio);
      c.setSize(w, h);
      c.addPass(new RenderPass(scene, camera));
      if (q.ao !== 'off') {
        const ao = new ChamberGTAOPass(scene, camera, pw, ph);
        ao.output = GTAOPass.OUTPUT.Default;
        ao.blendIntensity = 0.75;
        ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: q.ao === 'high' ? 16 : 8 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: q.ao === 'high' ? 6 : 4, rings: 2, samples: q.ao === 'high' ? 16 : 8 });
        c.addPass(ao);
      }
      if (q.bloom === 'on') {
        // high threshold: only lava, torch flames, embers and the selection glow bloom
        c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.45, 0.9));
      }
      if (q.grade === 'on') {
        gradePass = new ShaderPass(GradeShader);
        c.addPass(gradePass);
      }
      c.addPass(new OutputPass());
      if (q.antialias === 'smaa') c.addPass(new SMAAPass(pw, ph));
      if (q.antialias === 'fxaa') {
        const fxaa = new ShaderPass(FXAAShader);
        fxaa.material.uniforms.resolution.value.set(1 / pw, 1 / ph);
        c.addPass(fxaa);
      }
      composer = c;
    } catch {
      // post-processing is an enhancement: render directly and let the panel say so
      postFailed = true;
      composer = null;
    }
  }

  // adaptive resolution: step the render scale down when frames are slow, back up when fast
  function adapt(dt) {
    frameTimes.push(dt);
    if (frameTimes.length < 90) return false;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    frameTimes = [];
    fps = 1000 / avg;
    const el = document.getElementById('rp-fps');
    if (el && !el.hidden) el.textContent = `${Math.round(fps)} fps · ${Math.round(pixelRatio * 100) / 100}×`;
    if (!q.adaptive) return false;
    const before = adaptiveScale;
    if (avg > 26) adaptiveScale = Math.max(0.6, adaptiveScale - 0.1);
    else if (avg < 14 && adaptiveScale < 1) adaptiveScale = Math.min(1, adaptiveScale + 0.05);
    return before !== adaptiveScale;
  }

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    const ratio = Math.min(window.devicePixelRatio || 1, q.dprCap) * q.scale * adaptiveScale;
    if (w !== size[0] || h !== size[1] || ratio !== pixelRatio) {
      size = [w, h];
      pixelRatio = ratio;
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h);
    }
    if (level) fitCamera(level.def);
  }

  function animate(t, dt) {
    if (reducedMotion) return; // static poses, no drift, no flicker
    for (const view of cellViews.values()) {
      if (view.hero.visible) view.hero.position.y = Math.sin(t * 2.2 + view.hero.userData.phase) * 0.04;
      if (view.surface && view.surface.visible) view.surface.position.y = view.surface.userData.baseY + Math.sin(t * 3 + view.hero.userData.phase) * 0.015;
    }
    if (lavaTex) { lavaTex.offset.x = t * 0.03; lavaTex.offset.y = -t * 0.05; }
    if (lavaMat && q.detail === 'detailed') lavaMat.emissiveIntensity = LAVA_GLOW * (1 + Math.sin(t * 2.4) * 0.1);
    for (const tc of torches) {
      const f = 0.85 + 0.15 * Math.sin(t * 13 + tc.phase) * Math.sin(t * 7.3 + tc.phase * 2);
      tc.flame.scale.set(1, f * 1.1, 1);
      tc.light.intensity = 3 * LIGHT * f;
    }
    if (dust) {
      const p = dust.geometry.attributes.position, { W, H, seed } = dust.userData;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i) + dt * 0.12, y = p.getY(i) + Math.sin(t * 0.6 + seed[i]) * dt * 0.08;
        if (x > W / 2) x -= W;
        p.setXY(i, x, y);
      }
      p.needsUpdate = true;
    }
    if (embers && level) {
      const lavaCells = [];
      for (const v of cellViews.values()) if (v.lava.visible) lavaCells.push(v);
      embers.visible = lavaCells.length > 0;
      if (!embers.visible) return;
      const p = embers.geometry.attributes.position, u = embers.userData;
      for (let i = 0; i < p.count; i++) {
        u.life[i] += dt * 0.45;
        if (u.life[i] >= 1 || u.cell[i] >= lavaCells.length) {
          u.life[i] = u.life[i] % 1;
          u.cell[i] = Math.floor(u.rnd() * lavaCells.length);
          u.jitter[i] = (u.rnd() - 0.5) * (FRAMING.cellW - 0.6);
        }
        const v = lavaCells[u.cell[i]];
        const top = v.group.position.y + v.lava.position.y + v.lava.scale.y * (FRAMING.cellH - 0.6) / 2;
        const room = Math.max(0.2, v.group.position.y + FRAMING.cellH / 2 - 0.15 - top);
        p.setXYZ(i, v.group.position.x + u.jitter[i] + Math.sin(t * 3 + i) * 0.05, top + u.life[i] * room, 0.75);
      }
      p.needsUpdate = true;
    }
  }

  function frame(timeMs) {
    if (!running) return;
    const dt = lastT ? Math.min(250, timeMs - lastT) : 16;
    lastT = timeMs;
    time += dt / 1000;
    if (selectionMarker && selectionMarker.visible && !reducedMotion) {
      selectionMarker.rotation.z = timeMs * 0.001;
    }
    animate(time, dt / 1000);
    if (adapt(dt)) resize();
    else if (container.clientWidth !== size[0] || container.clientHeight !== size[1]) resize();
    const k = q.post && !postFailed ? [q.ao, q.bloom, q.grade, q.antialias, size[0], size[1], pixelRatio].join('|') : 'none';
    if (k !== postKey) {
      postKey = k;
      buildPost(size[0], size[1]);
      // the composer blends transparency in linear HDR, where the same opacity
      // reads far stronger than in the display-space framebuffer
      if (glassMat) glassMat.opacity = composer ? 0.018 : 0.12;
    }
    if (composer) {
      try { composer.render(dt / 1000); }
      catch { postFailed = true; postKey = null; composer = null; renderer.render(scene, camera); }
    } else renderer.render(scene, camera);
  }

  function setPaused(p) { running = !p; if (!p) lastT = 0; }
  function dispose() {
    if (resizeObserver) resizeObserver.disconnect();
    window.removeEventListener('resize', resize);
    for (const d of levelDisposables) { if (d.dispose) d.dispose(); }
    for (const d of disposables) { if (d.dispose) d.dispose(); }
    levelDisposables = []; disposables = [];
    if (composer) composer.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  // Re-fit the render target to the host whenever the layout changes (the
  // shell reflows on screen swap / rail content), instead of trusting a stale
  // size captured at first paint. Keeping the canvas box in sync prevents it
  // from overflowing the host and swallowing pointer events over the rails.
  const resizeObserver = typeof ResizeObserver !== 'undefined' && new ResizeObserver(() => resize());
  if (resizeObserver) resizeObserver.observe(container);
  window.addEventListener('resize', resize);

  setGraphics((settings.graphics && settings.graphics.gfx) || {});

  return { build, sync, select, pick, frame, resize, dispose, setGraphics, graphicsInfo, setPaused,
           onContextLost: (fn) => { onContextLost = fn; },
           stats: () => renderer.info.render, camera, FRAMING };
}
