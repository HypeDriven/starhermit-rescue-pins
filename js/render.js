// Rescue Pins — Three.js scene: cutaway storybook castle, glass chambers,
// brass pins, liquid blobs, hero. Orthographic authored camera.

import * as THREE from './three.min.js';

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

const QUALITY_TIERS = {
  low:    { shadows: false, particles: false, renderScale: 0.75, maxDPR: 1 },
  medium: { shadows: true,  particles: false, renderScale: 1.0,  maxDPR: 1.5 },
  high:   { shadows: true,  particles: true,  renderScale: 1.0,  maxDPR: 2 },
};

export function createRenderer(container, opts) {
  const settings = opts.settings;
  const palette = COLORS[settings.graphics.palette] || COLORS.default;
  const reducedMotion = !!settings.graphics.reducedMotion;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch {
    return null; // caller shows the compatibility fallback
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  // layers: 0 environment, 1 gameplay, 2 interaction/selection
  const gameplayGroup = new THREE.Group();
  const envGroup = new THREE.Group();
  const interactionGroup = new THREE.Group();
  scene.add(envGroup, gameplayGroup, interactionGroup);

  // lighting: one dominant key + soft fill + ambient ground bounce
  const key = new THREE.DirectionalLight(0xfff2dd, 2.8);
  key.position.set(6, 10, 8);
  const fill = new THREE.HemisphereLight(0xcfe0ff, 0x4a4036, 1.2);
  scene.add(key, fill);

  container.appendChild(renderer.domElement);

  let disposables = [];
  let pinMeshes = new Map();   // pinId -> mesh (interaction layer)
  let cellViews = new Map();   // "c,r" -> { water, lava, hero, group }
  let selectionMarker = null;
  let selectedPinId = null;
  let level = null;
  let running = true;
  let tier = QUALITY_TIERS[settings.graphics.tier] || QUALITY_TIERS.high;
  let onContextLost = null;

  function track(...objs) { disposables.push(...objs); return objs[0]; }

  function applyTier(name) {
    tier = QUALITY_TIERS[name] || QUALITY_TIERS.high;
    renderer.shadowMap.enabled = tier.shadows;
    key.castShadow = tier.shadows;
    resize();
  }

  applyTier(settings.graphics.tier === 'auto' ? 'high' : settings.graphics.tier);

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running = false;
    if (onContextLost) onContextLost();
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    running = true;
    if (level) build(level.lastState || null, level.def, level.theme);
  });

  function cellCenter(c, r, def) {
    const w = def.cols * FRAMING.cellW, h = def.rows * FRAMING.cellH;
    return new THREE.Vector3(-w / 2 + c * FRAMING.cellW + FRAMING.cellW / 2,
                             h / 2 - r * FRAMING.cellH - FRAMING.cellH / 2, 0);
  }

  function build(state, def, theme) {
    // explicit disposal of previous scene resources
    for (const d of disposables) { if (d.dispose) d.dispose(); }
    disposables = [];
    gameplayGroup.clear(); envGroup.clear(); interactionGroup.clear();
    pinMeshes = new Map(); cellViews = new Map();
    level = { def, theme, lastState: state };
    selectedPinId = null;

    const themeDef = theme || { sky: 0x20242c, stone: 0x777777, accent: 0x7fe0a8 };
    scene.background = new THREE.Color(themeDef.sky);
    scene.fog = new THREE.Fog(themeDef.sky, 30, 60);

    const stoneMat = track(new THREE.MeshStandardMaterial({ color: themeDef.stone, roughness: 0.9 }));
    const glassMat = track(new THREE.MeshPhysicalMaterial({ color: palette.glass, transparent: true, opacity: 0.12, roughness: 0.1, metalness: 0, depthWrite: false }));
    // dark chamber interior: liquids, villagers and pins read against it, and
    // the pale stone frame reads against the interior — a real cutaway.
    const interiorMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(themeDef.sky).multiplyScalar(0.9), roughness: 1 }));
    const frameMat = track(new THREE.LineBasicMaterial({ color: palette.frame, transparent: true, opacity: 0.9 }));
    const slotMat = track(new THREE.MeshStandardMaterial({ color: 0x14100a, roughness: 1 }));
    const waterMat = track(new THREE.MeshStandardMaterial({ color: palette.water, roughness: 0.25, emissive: palette.water, emissiveIntensity: 0.5 }));
    const lavaMat = track(new THREE.MeshStandardMaterial({ color: palette.lava, roughness: 0.5, emissive: palette.lava, emissiveIntensity: 0.7 }));
    const heroMat = track(new THREE.MeshStandardMaterial({ color: palette.hero, roughness: 0.6 }));

    const W = def.cols * FRAMING.cellW, H = def.rows * FRAMING.cellH;

    // castle shell: floor, side walls, crenellated top
    const floor = new THREE.Mesh(track(new THREE.BoxGeometry(W + 1.6, 0.8, 2.4)), stoneMat);
    floor.position.set(0, -H / 2 - 0.4, 0);
    envGroup.add(floor);
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(track(new THREE.BoxGeometry(0.8, H + 1.6, 2.4)), stoneMat);
      wall.position.set(s * (W / 2 + 0.4), 0, 0);
      envGroup.add(wall);
      const merlon = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 0.6, 2.5)), stoneMat);
      merlon.position.set(s * (W / 2 + 0.4), H / 2 + 1.0, 0);
      envGroup.add(merlon);
    }
    const back = new THREE.Mesh(track(new THREE.BoxGeometry(W + 1.6, H + 1.6, 0.3)), stoneMat);
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
        const interior = new THREE.Mesh(track(new THREE.BoxGeometry(FRAMING.cellW - FRAMING.wall, FRAMING.cellH - FRAMING.wall, 0.1)), interiorMat);
        interior.position.z = -0.85;
        const frame = new THREE.LineSegments(track(new THREE.EdgesGeometry(glassGeo)), frameMat);
        group.add(interior, glass, frame);
        const water = new THREE.Mesh(track(new THREE.BoxGeometry(FRAMING.cellW - 0.5, FRAMING.cellH - 0.6, 1.4)), waterMat);
        const lava = new THREE.Mesh(track(new THREE.BoxGeometry(FRAMING.cellW - 0.5, FRAMING.cellH - 0.6, 1.4)), lavaMat);
        const hero = new THREE.Group();
        const body = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.32, 0.5, 4, 12)), heroMat);
        const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.24, 12, 10)), heroMat);
        head.position.y = 0.65;
        hero.add(body, head);
        group.add(water, lava, hero);
        gameplayGroup.add(group);
        cellViews.set(c + ',' + r, { water, lava, hero, group });
      }
    }

    // brass pins on the interaction layer (raycast only against these).
    // Each pin gets its OWN material instance: the selection highlight writes
    // emissive per pin, and a shared material would light up every pin at once.
    for (const p of def.pins) {
      const pinMat = track(new THREE.MeshStandardMaterial({ color: palette.pin, metalness: 0.85, roughness: 0.3 }));
      const a = cellCenter(p.a[0], p.a[1], def), b = cellCenter(p.b[0], p.b[1], def);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const horizontal = p.a[1] !== p.b[1]; // separates rows -> pin lies horizontally
      const geo = track(new THREE.CylinderGeometry(FRAMING.pinRad, FRAMING.pinRad, FRAMING.pinLen, 10));
      const m = new THREE.Mesh(geo, pinMat);
      m.position.set(0, 0, 0.6);
      // dark slot behind the pin so brass stays legible against pale stone
      const slot = new THREE.Mesh(track(new THREE.BoxGeometry(horizontal ? FRAMING.pinLen + 0.3 : FRAMING.pinRad * 3.2,
                                                              horizontal ? FRAMING.pinRad * 3.2 : FRAMING.pinLen + 0.3, 0.1)), slotMat);
      slot.position.set(mid.x, mid.y, 0.3);
      envGroup.add(slot);
      m.rotation.z = horizontal ? Math.PI / 2 : 0;
      if (!horizontal) m.rotation.z = 0;
      // ring handle
      const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.32, 0.09, 8, 16)), pinMat);
      ring.position.set(horizontal ? FRAMING.pinLen / 2 + 0.2 : 0,
                        horizontal ? 0 : FRAMING.pinLen / 2 + 0.2, 0.6);
      // group anchored at the pin's world position so selection/lift poses
      // and the marker use a real location (children are group-relative)
      const pinGroup = new THREE.Group();
      pinGroup.position.set(mid.x, mid.y, 0);
      pinGroup.userData.base = mid.clone();
      pinGroup.add(m, ring);
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

    fitCamera(def);
    sync(state);
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

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, tier.maxDPR);
    renderer.setPixelRatio(dpr * tier.renderScale);
    renderer.setSize(w, h);
    if (level) fitCamera(level.def);
  }

  function frame(timeMs) {
    if (!running) return;
    if (selectionMarker && selectionMarker.visible && !reducedMotion) {
      selectionMarker.rotation.z = timeMs * 0.001;
    }
    renderer.render(scene, camera);
  }

  function setPaused(p) { running = !p; }
  function dispose() {
    if (resizeObserver) resizeObserver.disconnect();
    window.removeEventListener('resize', resize);
    for (const d of disposables) { if (d.dispose) d.dispose(); }
    disposables = [];
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
  resize();

  return { build, sync, select, pick, frame, resize, dispose, applyTier, setPaused,
           onContextLost: (fn) => { onContextLost = fn; },
           stats: () => renderer.info.render, camera, FRAMING };
}
