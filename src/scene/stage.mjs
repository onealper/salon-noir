// The stage every room of the salon is drawn on: one WebGL renderer for its 3D table, the presets it draws at, a
// render loop that draws only when something changes, and a frame-time watcher that trades pixels for smoothness.
// The blackjack table (world.mjs) and the roulette wheel (roulette/rscene.mjs) each make one, so a fix to how a
// room is drawn lands in both. In centimetres, like every scene here.
import * as THREE from '../vendor/three.module.min.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';

// Rendering detail per device class, dearest first (Sharp, Balanced, Battery saver). 'auto' picks one;
// the frame-time watcher can step down.
export const QUALITY = {
  // ratio: the most device pixels drawn per CSS pixel. mpx: a budget for the whole canvas, in megapixels.
  // On an iPhone's 3x screen a 2x picture is stretched by half again, and that softness, not jagged edges, is most of
  // what it loses (measured against a supersampled frame: the busiest detail is about half as far off at 3x, and at
  // the 2.7x the 2.4 MP budget allows on a 6.1" phone it recovers most of that). Desktops stay at their own 2x.
  // felt: the largest painted cloth (px); face: card faces at this share of 512 px wide.
  high: { name: 'high', ratio: 3, shadow: 2048, soft: true, felt: 4096, chipSegments: 48, face: 1 },
  phone: { name: 'phone', ratio: 3, mpx: 2.4, shadow: 1024, soft: true, felt: 2048, chipSegments: 40, face: .5 },
  saver: { name: 'saver', ratio: 1.5, mpx: 1.2, shadow: 1024, soft: false, felt: 1024, chipSegments: 28, face: .5 },
};
// The device pixels per CSS pixel a w x h canvas gets under a preset (and the watcher's cap).
export const pixelRatio = (q, w, h, cap = q.ratio) => Math.min(devicePixelRatio || 1, cap, q.mpx ? Math.sqrt(q.mpx * 1e6 / Math.max(1, w * h)) : Infinity);
// Multisampling (4x) smooths the edges of the geometry, not the textures: on a 2x desktop it takes about a quarter
// off the error at the wheel's frets and pockets and the chips' rims, so the Sharp preset has it at any density, and
// every 1x screen has it. The Balanced preset draws a phone at a fractional ratio stretched to the screen, where it
// measurably adds nothing, and the battery saver goes without. It is chosen with the context, at load: a preset
// changed in Settings keeps the multisampling the page started with.
export const glOptions = q => ({ antialias: q.name === 'high' || (devicePixelRatio || 1) < 2, powerPreference: q.name === 'high' ? 'high-performance' : 'default' });
// A room environment for reflections, made once; the generator and the room it was rendered from are freed.
export function roomEnvironment(renderer, blur = .04) {
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), rt = pmrem.fromScene(room, blur);
  pmrem.dispose(); room.dispose(); return rt.texture;
}
// iOS drops WebGL contexts under memory pressure and in the background. three rebuilds its own state and
// re-uploads every texture that has an image; `restored` remakes what has none (the environment maps) and
// redraws. If the browser never gives the context back, the page offers a reload.
export function watchContext(canvas, restored) {
  let lost = false, timer = 0;
  const wait = () => { clearTimeout(timer); if (lost && !document.hidden) timer = setTimeout(() => { if (lost) dispatchEvent(new CustomEvent('salonnoir:gpulost')); }, 4000); };   // counted only while the page is in view
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; wait(); });
  document.addEventListener('visibilitychange', wait);
  canvas.addEventListener('webglcontextrestored', () => { lost = false; clearTimeout(timer); restored(); dispatchEvent(new CustomEvent('salonnoir:gpurestored')); });
}
export function detectQuality() {
  const coarse = matchMedia('(pointer: coarse)').matches, short = Math.min(screen.width, screen.height) < 820;
  // deviceMemory exists in Chromium only; Safari reports nothing, and slow devices are caught by the frame watcher.
  if ((navigator.deviceMemory ?? 8) <= 2) return QUALITY.saver;
  return coarse && short ? QUALITY.phone : QUALITY.high;
}

const shadowType = q => q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
// The salon's two finishes, the same at every table: the padded leather of the armrests and the brass trim.
export const leatherMaterial = () => new THREE.MeshPhysicalMaterial({ color: '#141312', roughness: .58, clearcoat: .35, clearcoatRoughness: .45, sheen: .4, sheenColor: new THREE.Color('#3a3530') });
export const brassMaterial = () => new THREE.MeshStandardMaterial({ color: '#b98f45', metalness: 1, roughness: .28 });
// ---- the salon round a table -----------------------------------------------------------------------------------------
// Both rooms stand in the same salon: a panorama of it (generated for Salon Noir, then blurred out of focus) on the
// inside of a wide cylinder round the table, so every shot has the room behind it, and the salon's carpet on the floor.
// The picture goes round once and then mirrored, so its two joins are seamless; place() turns its middle to where the
// seat looks. The floor it paints fades out below its horizon (`horizon`, down the picture) to where the wall meets the
// room's own floor (`floorY`), which runs on under it into the dark; the horizon stands at `eye` over the table.
// `level`: how bright it is drawn (the room's light on it; the rooms dim it with their lights).
export function salonWall(img, { radius = 420, horizon = .45, eye = 90, floorY = -80, level = .62, aniso = 1 } = {}) {
  const H = Math.PI * radius * img.height / img.width, meet = horizon + (eye - floorY) / H;   // (one picture round half the wall, true to its shape)
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  if (meet > horizon + .08) {   // (a wall hung low enough that the floor already hides its painted floor needs no fade)
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, 0, c.height); fade.addColorStop(0, '#000'); fade.addColorStop(horizon + .06, '#000'); fade.addColorStop(Math.min(1, meet), 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, c.width, c.height);
  }
  const t = new THREE.Texture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.MirroredRepeatWrapping; t.repeat.x = 2; t.anisotropy = aniso; t.needsUpdate = true;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, H, 96, 1, true), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, transparent: true, depthWrite: false }));
  mesh.material.color.setScalar(level);
  // centred on (x, z), its middle facing along (dx, dz)
  const place = (x, z, dx, dz) => { mesh.position.set(x, eye - (.5 - horizon) * H, z); mesh.rotation.y = Math.atan2(dx, dz) - Math.PI / 2; };
  return { mesh, level, place };
}
// The salon's carpet on a room's floor plane: a 75 cm repeat mirrored at its edges, lit by the pendants round the table
// and dark beyond them.
export function carpetFloor(floor, img, { tile = 75, aniso = 1 } = {}) {
  const t = new THREE.Texture(img), { width, height } = floor.geometry.parameters;
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.repeat.set(width / tile, height / tile); t.anisotropy = aniso; t.needsUpdate = true;
  floor.material.map = t; floor.material.color.set('#5e5955'); floor.material.needsUpdate = true;
}

// The narrowest lens between `lo` and `hi` degrees (to within `tol`) for which fits(fov) holds; null when even the
// widest leaves something out.
export function fitFov(fits, lo, hi, tol) {
  if (!fits(hi)) return null;
  while (hi - lo > tol) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return hi;
}

// A room's renderer, scene and camera. `lights`: the lights that cast shadows (their maps are let go while the room
// is out of sight); `restored`: what the room remakes itself after a lost context, besides the room environment.
export function createStage(canvas, { quality = detectQuality(), background, environment, fov, far, lights = () => [], restored = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, ...glOptions(quality) });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  // shadows are redrawn only when something that casts one moves (see loop), not for a moving camera
  renderer.shadowMap.enabled = true; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.type = shadowType(quality);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(background);
  scene.environment = roomEnvironment(renderer); scene.environmentIntensity = environment;
  const camera = new THREE.PerspectiveCamera(fov, 1, 1, far);
  // What the lost context drew into (the environment map, the shadow maps) went with it: let go, not disposed, which
  // would have the new context delete objects it never had.
  watchContext(canvas, () => { scene.environment = roomEnvironment(renderer); for (const k of lights()) k.shadow.map = null; restored(); requestRender(); });
  const view = { w: 1, h: 1 };   // the canvas in CSS pixels (the room's frame() sets it)
  let ratioCap = quality.ratio; const ratio = (w = view.w, h = view.h) => pixelRatio(quality, w, h, ratioCap);

  // Drawn only when something changes. A ticker draws every frame while it runs, unless it is `lazy` (it
  // asks for its own frames); it redraws the shadows too, unless it is `still` (it moves no shadow caster:
  // the camera, a glow, a light's level). `requestRender(false)` asks for a frame that keeps the shadows.
  let dirty = true, running = false, paused = false, shadowsDirty = true, loops = 0; const tickers = new Set();
  function requestRender(shadows = true) { dirty = true; if (shadows) shadowsDirty = true; if (!running) { running = true; requestAnimationFrame(loop); } }
  // Frame-time watch: while things move, compare each frame with the display's own refresh (the
  // shortest recent interval - 8, 16 or 33 ms), so a 30 Hz screen or Low Power Mode is not mistaken
  // for a slow GPU. Only frames that miss well behind it count. After a stretch of mostly late
  // frames, draw a quarter fewer pixels per CSS pixel (never below one);
  // after a few smooth stretches, step back up.
  let last = 0, late = 0, frames = 0, base = 1e9, good = 0;
  function watch(t) {
    if (!last || !tickers.size) { last = t; return; }
    const dt = t - last; last = t; if (dt > 250) return;
    frames++; base = Math.min(base * 1.002, dt); if (dt > base * 1.7) late++;
    if (frames < 90) return;
    const floor = 1, now = ratio();   // steps start from what is drawn (the pixel budget may already hold it under the cap)
    if (late > 45 && now > floor) { ratioCap = Math.max(floor, now - .25); good = 0; resize(); }
    else if (late < 5 && ratioCap < quality.ratio && ++good >= 3) { ratioCap = Math.min(quality.ratio, ratioCap + .25); good = 0; resize(); }
    frames = late = 0;
  }
  const resize = () => { if (paused) return; renderer.setPixelRatio(ratio()); renderer.setSize(view.w, view.h, false); requestRender(false); };   // a hidden room keeps its 1 x 1 buffer
  const gl = renderer.getContext();
  function loop(t) {
    loops++; running = false; if (paused || gl.isContextLost()) return;   // out of sight, or the context is gone (its restore asks for a frame)
    watch(t); if (!tickers.size) last = 0;
    let busy = false, moving = false;
    for (const f of tickers) { try { f(t); busy ||= !f.lazy; moving ||= !f.still; } catch (e) { tickers.delete(f); console.error('ticker', e); } }   // one bad ticker must not stop the table (a finishing tween may request another frame here)
    if (dirty || busy) {
      dirty = false; if (shadowsDirty || moving) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false; }
      renderer.render(scene, camera);
    }
    if ((tickers.size || dirty) && !running) { running = true; requestAnimationFrame(loop); }
  }
  const freeShadows = () => { for (const k of lights()) { k.shadow.map?.dispose(); k.shadow.map = null; } };
  return {
    THREE, renderer, scene, camera, view, tickers, requestRender,
    maxTex: renderer.capabilities.maxTextureSize, aniso: renderer.capabilities.getMaxAnisotropy(),
    // the drawing buffer for a w x h canvas (CSS pixels), at the preset's pixels
    size(w, h) { renderer.setPixelRatio(ratio(w, h)); renderer.setSize(w, h, false); },
    // A preset's pixels and shadows apply at once (a change of softness recompiles the materials); the room
    // repaints its own cloth, chips and cards after.
    setQuality(q) {
      const was = quality; quality = q; ratioCap = q.ratio; resize();
      for (const k of lights()) k.shadow.mapSize.set(q.shadow, q.shadow); freeShadows(); renderer.shadowMap.type = shadowType(q);
      if (q.soft !== was.soft) scene.traverse(o => { for (const m of [o.material ?? []].flat()) m.needsUpdate = true; });
    },
    // Out of sight (the other room): no frames, the smallest drawing buffer and no shadow maps held.
    pause(on) {
      if (on === paused) return; paused = on;
      if (on) { renderer.setSize(1, 1, false); freeShadows(); } else { shadowsDirty = true; resize(); }
    },
    project: (() => { const v3 = new THREE.Vector3(); return (x, y, z) => { v3.set(x, y, z).project(camera); return { x: (v3.x + 1) / 2 * view.w, y: (1 - v3.y) / 2 * view.h, behind: v3.z > 1 }; }; })(),
    get paused() { return paused; }, get quality() { return quality; }, get pixelRatio() { return +renderer.getPixelRatio().toFixed(2); },
    get debug() { return { loops, running, paused, dirty, tickers: tickers.size }; },
  };
}
