// The roulette table as a scene, in centimetres. The wheel sits at the head of the table (-x); the
// betting layout runs from zero, next to the wheel, away along +x, with the dozens and even-money boxes
// on the players' side (+z). On a Mac you sit at the long side (+z) with the wheel on your left; on an
// upright phone you sit at the foot (+x), looking up the table at the wheel. The layout is painted for
// whichever seat you have, cells shaped for the screen, numbers facing you.
import * as THREE from '../vendor/three.module.min.js';
import { artImage, CHIP_H, CHIP_R, chipBumpTexture } from '../scene/textures.mjs';
import { chipGeometry, chipMaterials, setChipDetail, swapChipGeometry } from '../scene/world.mjs';
import { createStage, QUALITY, detectQuality, leatherMaterial, brassMaterial, fitFov, salonWall, carpetFloor } from '../scene/stage.mjs';
import { SPOTS, colorOf, rowOf, colOf, REDS, WHEEL as WHEEL_ORDER, LIMITS, KINDS } from './rules.mjs';
import { createWheel } from './wheel3d.mjs';
import { GEO } from './physics.mjs';
import { SPADE, INLAY, KEYHOLE, KEYLIGHT } from '../core/brand.mjs';
const WELL = GEO.rimR + .4;   // the well the bowl stands in, just clear of its rim
export const RAKE_W = 26;   // the rake's head, cm

export { THREE };
// Cell sizes per seat (cm): cu along the table, cv across; z0 the zero's depth, cc the column boxes',
// d and e the dozen and even-money strips.
export const WHEEL_Y = 7.2;   // the bowl sits sunk in the head of the table, its rim this far above the felt
const SHAPES = {
  // sized to a real table (TCS John Huxley's 2.82 x 1.70 m, a printed grid of about 1.2 x 0.5 m): a 39 mm chip covers
  // under half a box. On the phone the boxes run deeper across, so a thumb can still find them from the foot.
  land: { cu: 8.6, cv: 8.9, z0: 9.8, cc: 8.6, d: 7.4, e: 7.4 },
  port: { cu: 6.4, cv: 11.6, z0: 10.2, cc: 7.6, d: 6.6, e: 6.6 },
};
// The rooms the table stands in (setStudio): the salon's European table, green cloth on Macassar under warm pendants, and
// the Lightning studio's, after Evolution's: black cloth ruled in gold on black lacquer, the wheel raised on a stepped gold
// plinth, a black-and-gold art deco set round it under a cooler light. Mega Lightning is the same studio, its light red.
const SALON = { studio: false, cloth: '#17533a', zero: '#0c4f30', line: 'rgba(238,226,190,.92)', sheen: '#3f8a63', game: 'EUROPEAN ROULETTE',
  leather: '#8a847c', lacquer: '#16110d', lamp: '#ffd9a6', pool: 'rgba(255,200,140,.95)', fill: '#5b626e', glow: '#ffb866', key: '#fff1dc' };
const STUDIO = { studio: true, cloth: '#0f1014', zero: '#0b2f22', line: 'rgba(214,180,104,.92)', sheen: '#7d6c48', game: 'LIGHTNING ROULETTE',
  leather: '#4e4a46', lacquer: '#060607', lamp: '#ffe6b3', pool: 'rgba(255,214,150,.9)', fill: '#46557a', glow: '#6f9cff', key: '#f6f4ff', accent: '#9cc8ff' };
export const DRESS = { european: SALON, lightning: STUDIO, mega: { ...STUDIO, game: 'MEGA LIGHTNING', glow: '#ff5636', accent: '#ff6a3d', lamp: '#ffd2b8' } };
const ART = {};
const load = (k, src) => ART[k] ? Promise.resolve() : new Promise(r => { const i = new Image(); i.onload = () => { ART[k] = i; r(); }; i.onerror = () => r(); i.src = src; });
// the Lightning studio's own pictures, fetched the first time you sit at one of its tables
export const preloadStudioArt = () => load('studio', './assets/roulette/studio.webp');
export function preloadRouletteArt() {
  const fonts = document.fonts ? Promise.all(['700 80px "Barlow Condensed"', '700 80px Cinzel', '700 40px Inter', '500 80px "Bodoni Moda"', 'italic 600 80px "Bodoni Moda"'].map(f => document.fonts.load(f).catch(() => {}))) : Promise.resolve();
  return Promise.all([load('veneer', './assets/roulette/macassar.webp'), load('salon', './assets/roulette/salon.webp'), load('stone', './assets/roulette/stone.webp'), load('cloth', './assets/roulette/cloth.webp'), load('leather', './assets/roulette/leather.webp'), fonts]);
}

export function createRouletteScene(canvas, { quality = detectQuality(), dressing = 'european' } = {}) {
  let dress = SALON;   // (the room asked for is put on at the end: setStudio)
  // the renderer, its loop and frame watcher, the scene and the camera (scene/stage.mjs: the same as the blackjack table's);
  // a lost and restored context makes the wheel's studio light again too (the rest re-uploads by itself)
  const st = createStage(canvas, { quality, background: '#0b0a09', environment: .38, fov: 40, far: 1400, lights: () => [keyL],
    restored: () => { const old = studioEnv; studioEnv = studio(); wheel.group.traverse(o => { if (o.material?.envMap === old) o.material.envMap = studioEnv; }); } });
  const { renderer, scene, camera, tickers, requestRender, maxTex, aniso } = st;
  setChipDetail(quality.chipSegments);

  // ---- light: one pendant over the wheel and one over the layout, a cool fill, warm room glow -------------
  // Only the layout's pendant casts shadows (the chips, the rake, the bowl on the wood): the wheel is shaded by its own
  // painted occlusion and the ball's contact shadow (wheel3d.mjs), so one shadow map serves the table, and it is drawn
  // again only when a chip or the rake moves, never for the turning wheel.
  const keyW = new THREE.SpotLight('#fff1dc', 5400, 0, .5, .7, 1.6);
  const keyL = new THREE.SpotLight('#fff0d8', 4400, 0, .6, .75, 1.6); keyL.castShadow = true;
  keyL.shadow.mapSize.set(quality.shadow, quality.shadow); keyL.shadow.bias = -.0001; keyL.shadow.normalBias = .02; keyL.shadow.radius = 5; keyL.shadow.camera.near = 60; keyL.shadow.camera.far = 240;
  const hemi = new THREE.HemisphereLight('#5b626e', '#0b0a09', .3);
  const glow = new THREE.PointLight('#ffb866', 900, 320, 1.6);
  const rim = new THREE.SpotLight('#9cc8ff', 0, 0, .55, .8, 1.4);   // the studio's: a cool light from behind the set, picking out edges
  scene.add(keyW, keyW.target, keyL, keyL.target, hemi, glow, rim, rim.target);
  // The light follows the spin (mood): from the croupier's call the layout's pendant and the fill dim by a quarter and the
  // wheel's pendant comes up a tenth, so the bowl is the brightest thing in the room, until the picture goes back to the
  // seat. Eased over `ms` by a still ticker (the shadows stand: nothing moves).
  const LIT = { w: keyW.intensity, l: keyL.intensity, h: hemi.intensity };
  let moodJob = null;
  function mood(on, ms = 900) {
    const wall = room(), from = { w: keyW.intensity, l: keyL.intensity, h: hemi.intensity, s: wall?.mesh.material.color.r ?? 0 }, to = on ? { w: LIT.w * 1.1, l: LIT.l * .75, h: LIT.h * .75, s: (wall?.level ?? 0) * .7 } : { ...LIT, s: wall?.level ?? 0 };
    if (moodJob) tickers.delete(moodJob);
    const t0 = performance.now();
    moodJob = now => {
      const k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1, e = k * k * (3 - 2 * k);
      keyW.intensity = from.w + (to.w - from.w) * e; keyL.intensity = from.l + (to.l - from.l) * e; hemi.intensity = from.h + (to.h - from.h) * e;
      wall?.mesh.material.color.setScalar(from.s + (to.s - from.s) * e);   // (the room round the table too)
      if (k >= 1) { tickers.delete(moodJob); moodJob = null; }
    };
    moodJob.still = true; tickers.add(moodJob); requestRender(false);
  }

  // ---- the room: the salon round the table, out of focus (scene/stage.mjs), the carpet underfoot ------------------
  // Its middle faces where your seat looks (placeBackdrop); without the picture the room is simply dark.
  const FLOOR_Y = -80;
  const salon = ART.salon ? salonWall(ART.salon, { radius: 420, eye: 90, floorY: FLOOR_Y, aniso, level: .48 }) : null; if (salon) scene.add(salon.mesh);
  let studioWall = null;   // the Lightning studio's set, made the first time you sit there
  const room = () => dress.studio ? studioWall : salon;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: '#0b0a09', roughness: 1 }));
  if (artImage('table:carpet')) carpetFloor(floor, artImage('table:carpet'), { aniso });
  floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; scene.add(floor);
  const carpet = floor.material, gloss = new THREE.MeshStandardMaterial({ color: '#050506', roughness: .3, metalness: 0, envMapIntensity: 1.2 });   // the studio's floor: black, polished

  // ---- the table ---------------------------------------------------------------------------------------------------
  const table = new THREE.Group(); scene.add(table);
  // (the top's shape gives texture coordinates in centimetres: one picture of the veneer to every 80 cm, its stripes
  // along the table)
  const woodTex = (img, cm, rot = 0) => { if (!img) return null; const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.repeat.set(1 / cm, 1 / cm); t.rotation = rot; t.anisotropy = aniso; t.needsUpdate = true; return t; };
  const walnut = new THREE.MeshStandardMaterial({ color: ART.veneer ? '#e6d6c8' : '#1c120c', map: woodTex(ART.veneer, 80, Math.PI / 2), roughness: .34, envMapIntensity: .7 });   // the table: Macassar ebony, its stripes along the length, laid book-matched (each 80 cm leaf the mirror of the next), in a satin lacquer (one coat, drawn as one: a clear coat on the largest wood in the picture costs every pixel of it twice)
  const blackTop = new THREE.MeshStandardMaterial({ color: '#09090b', roughness: .16, envMapIntensity: 1.3 });   // the studio's: black piano lacquer
  const leather = leatherMaterial();
  // its pebble grain, a picture to every 12 cm (the armrest's pieces are all mapped in cm): the room's own photograph
  // (assets/roulette/leather.webp) is its colour and its bump both, the salon's shared grain only a bump
  const grain = ART.leather ?? artImage('table:leather'); if (grain) { const t = new THREE.Texture(grain); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 12, 1 / 12); t.anisotropy = aniso; t.needsUpdate = true; leather.bumpMap = t; leather.bumpScale = 1.8;
    if (ART.leather) { const c = t.clone(); c.colorSpace = THREE.SRGBColorSpace; c.needsUpdate = true; leather.map = c; leather.color.set(dress.leather); leather.bumpScale = 1.3; } }
  const brass = brassMaterial();
  // the wheel's own studio light, for its reflections: a ring light overhead and two soft boxes in a dark room
  // (rendered once; the generator and the little studio are freed straight after)
  const studio = () => {
    const e = new THREE.Scene(); e.background = new THREE.Color('#030303');
    const lamp = c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c), side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.5, .22, 12, 96), lamp('#fff3e0')); ring.material.color.multiplyScalar(3); ring.rotation.x = Math.PI / 2; ring.position.y = 4.2; e.add(ring);
    for (const [x, z, w] of [[-9, 3, 3], [8, -4, 2.6]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.1), lamp('#d8cfc2')); b.material.color.multiplyScalar(.9); b.position.set(x, 3.2, z); b.lookAt(0, 0, 0); e.add(b); }
    const warm = new THREE.Mesh(new THREE.PlaneGeometry(10, .6), lamp('#ff9f4a')); warm.material.color.multiplyScalar(.35); warm.position.set(0, .8, 9); warm.lookAt(0, 0, 0); e.add(warm);
    const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(e, .02).texture;
    pmrem.dispose(); e.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); return env;
  };
  let studioEnv = studio();
  const wheel = createWheel(THREE, { aniso, env: studioEnv, glow: '#ffb85a', stone: ART.stone }); table.add(wheel.group);   // black lacquer, a warm gold ring light
  // the cloth: matte wool, and on the high preset a fabric sheen at grazing angles and the nap as a fine bump (the other
  // presets keep the plain material: the cloth is the largest surface in the picture, and a phone pays for every pixel)
  const feltMats = new Map(), nap = ART.cloth ?? artImage('table:felt');
  const feltMaterial = q => {
    const rich = q.name === 'high'; if (feltMats.has(rich)) return feltMats.get(rich);
    const m = rich ? new THREE.MeshPhysicalMaterial({ roughness: .96, metalness: 0, sheen: .35, sheenRoughness: .8, sheenColor: new THREE.Color(dress.sheen) }) : new THREE.MeshStandardMaterial({ roughness: .96, metalness: 0 });
    if (rich && nap) { const t = new THREE.Texture(nap); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; m.bumpMap = t; m.bumpScale = .15; }
    feltMats.set(rich, m); return m;
  };
  let feltMat = feltMaterial(quality);
  const felt = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), feltMat); felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; table.add(felt);
  // the cloth beyond the printed layout, over the whole top round the wheel: the same wool, the nap alone (one tile
  // painted as the layout paints its own), cut to the table in buildTable, with a brass rule at its edge and round the well
  const NAP = 512 / 24;   // cm a nap tile covers, as the sharpest layout paints it
  const napTile = (() => { const c = document.createElement('canvas'); c.width = c.height = 512;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / NAP, 1 / NAP); t.anisotropy = aniso;
    t.paint = () => { const g = c.getContext('2d'); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = dress.cloth; g.fillRect(0, 0, 512, 512);
      if (nap) { g.globalAlpha = .5; g.globalCompositeOperation = 'overlay'; g.drawImage(nap, 0, 0, 512, 512); } t.needsUpdate = true; };
    t.paint(); return t; })();
  const clothMats = new Map(), clothMaterial = q => { const f = feltMaterial(q); if (clothMats.has(f)) return clothMats.get(f);
    const m = f.clone(); m.map = napTile; if (f.bumpMap) { m.bumpMap = f.bumpMap.clone(); m.bumpMap.repeat.set(1 / NAP, 1 / NAP); m.bumpMap.needsUpdate = true; } clothMats.set(f, m); return m; };
  const cloth = new THREE.Mesh(new THREE.BufferGeometry(), clothMaterial(quality)); cloth.position.y = -.05; cloth.receiveShadow = true; table.add(cloth);
  const body = new THREE.Group(); table.add(body);
  const hi = new THREE.Group(); table.add(hi);             // highlight tiles over the layout
  const chipsG = new THREE.Group(); table.add(chipsG);

  // the float's chips, lying on their sides: a stripe per chip edge, edge spots, seen end-on as a row
  const floatMats = new Map();
  function floatMaterial(color, len) {
    if (floatMats.has(color)) return floatMats.get(color);
    const c = document.createElement('canvas'); c.width = 64; c.height = 1024; const g = c.getContext('2d'), n = Math.round(len / CHIP_H), h = c.height / n;
    g.fillStyle = color; g.fillRect(0, 0, 64, 1024);
    for (let i = 0; i < n; i++) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, i * h, 64, Math.max(1, h * .12)); g.fillStyle = 'rgba(255,255,255,.75)'; for (let k = 0; k < 4; k++) g.fillRect(k * 16 + (i % 2) * 8, i * h + h * .25, 5, h * .55); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: .5 }); floatMats.set(color, m); return m;
  }
  // ---- the layout, for the seat you have -----------------------------------------------------------------------
  let L = null;   // { shape, x0, zg, xEnd, zFar, zNear, wheelX, feltRect, ... }
  function geometry(orient) {
    const s = SHAPES[orient], x0 = 0, zg = (3 * s.cv - s.d - s.e) / 2;
    const X = u => u < 0 ? x0 + u * s.z0 : u <= 12 ? x0 + u * s.cu : x0 + 12 * s.cu + (u - 12) * s.cc;
    const Z = v => v >= 0 ? zg - v * s.cv : v >= -1 ? zg - v * s.d : zg + s.d + (-v - 1) * s.e;
    const U = x => x < x0 ? (x - x0) / s.z0 : x <= x0 + 12 * s.cu ? (x - x0) / s.cu : 12 + (x - x0 - 12 * s.cu) / s.cc;
    const V = z => z <= zg ? (zg - z) / s.cv : z <= zg + s.d ? -(z - zg) / s.d : -1 - (z - zg - s.d) / s.e;
    const xEnd = X(13), zFar = Z(3), zNear = Z(-2), wheelX = x0 - s.z0 - 5 - GEO.rimR, rect = { x0: wheelX + WELL + 1, x1: xEnd + 34, z0: zFar - 40, z1: zNear + 15 };   // (the cloth starts past the wheel's well: inside it, it would cut through the bowl)
    // the racetrack, a stadium printed on the croupier's side: only from the long side. On an upright phone it would lie
    // off the right edge of the picture, and the Racetrack sheet is the phone's track.
    const track = orient === 'land' ? (() => { const xa = X(-1), len = (xEnd - xa) * .78, H = Math.min(26, zFar - rect.z0 - 5 - 4); return { cx: (xa + xEnd) / 2, cz: zFar - 4 - H / 2, len, H }; })() : null;
    // the cloth: the grid, felt round it, the racetrack, room at the foot for the players' chips
    return { orient, s, x0, zg, X, Z, U, V, xEnd, zFar, zNear, wheelX, rect, track };
  }
  // Where each spot's chips sit, in layout units (u along, v across).
  function anchorUV(id) {
    const sp = SPOTS.get(id); if (!sp) return null;
    const n = sp.nums, uvOf = k => [rowOf(k) - .5, colOf(k) - .5];
    switch (sp.kind) {
      case 'straight': return n[0] === 0 ? [-.5, 1.5] : uvOf(n[0]);
      case 'split': if (n[0] === 0) return [0, n[1] - .5]; return n[1] - n[0] === 1 ? [rowOf(n[0]) - .5, colOf(n[0])] : [rowOf(n[0]), colOf(n[0]) - .5];
      case 'street': return [rowOf(n[0]) - .5, 0];
      case 'trio': return [0, n.includes(1) ? 1 : 2];
      case 'corner': return [rowOf(n[0]), colOf(n[0])];
      case 'four': return [0, 0];
      case 'line': return [rowOf(n[0]), 0];
      case 'column': return [12.5, +id.slice(3) - .5];
      case 'dozen': return [(+id.slice(3) - 1) * 4 + 2, -.5];
      case 'even': return [['low', 'even', 'red', 'black', 'odd', 'high'].indexOf(id) * 2 + 1, -1.5];
    }
  }
  // (each player's layer of a spot's one column sits a few millimetres off by its slot, so the layers read apart)
  const anchor = (id, slot = 0) => { const [u, v] = anchorUV(id), off = [[0, 0], [.3, -.22], [-.3, -.22], [.3, .22], [-.3, .22]][slot % 5]; return new THREE.Vector3(L.X(u) + off[0], 0, L.Z(v) + off[1]); };
  // The spot under a point on the felt, or null.
  function spotAt(x, z) {
    const u = L.U(x), v = L.V(z), s = L.s;
    if (u < -1 || u > 13 || v > 3 || v < -2) return null;
    // the line where the numbers meet the dozens carries the streets and six lines: a finger just over it still means them
    if (v < 0 && v > -1 && -v * s.d < .8 && u >= -.2 && u < 12) return spotAt(x, L.Z(.001));
    if (v < 0) { if (u < 0 || u >= 12) return null; return v >= -1 ? `doz${Math.min(3, Math.floor(u / 4) + 1)}` : ['low', 'even', 'red', 'black', 'odd', 'high'][Math.min(5, Math.floor(u / 2))]; }
    if (u >= 12) return `col${Math.min(3, Math.floor(v) + 1)}`;
    const tu = Math.max(.14, .9 / (u < 0 ? s.z0 : s.cu)), tv = Math.max(.12, 1.1 / s.cv);
    const near = (x, t, lo, hi) => { const f = x - Math.floor(x); const b = f < t ? Math.floor(x) : f > 1 - t ? Math.floor(x) + 1 : null; return b != null && b >= lo && b <= hi ? b : null; };
    if (u < 0) {
      if (u > -tu * s.cu / s.z0 * 1.2) { const bv = near(v, tv, 0, 2); if (bv === 0) return 'ff'; if (bv === 1) return 'tr0-1-2'; if (bv === 2) return 'tr0-2-3'; return `sp0-${Math.min(3, Math.floor(v) + 1)}`; }
      return 'n0';
    }
    const bu = near(u, tu, 0, 11), bv = near(v, tv, 0, 2), r = Math.min(12, Math.floor(u) + 1), c = Math.min(3, Math.floor(v) + 1), at = (rr, cc) => 3 * (rr - 1) + cc;
    if (bu === 0) { if (bv === 0) return 'ff'; if (bv === 1) return 'tr0-1-2'; if (bv === 2) return 'tr0-2-3'; return `sp0-${c}`; }
    if (bv === 0) return bu ? `sl${at(bu, 1)}` : `st${at(r, 1)}`;
    if (bu && bv) return `co${at(bu, bv)}`;
    if (bu) { const a = at(bu, c); return `sp${a}-${a + 3}`; }
    if (bv) { const a = at(r, bv); return `sp${a}-${a + 1}`; }
    return `n${at(r, c)}`;
  }
  // The felt, painted like a printed casino cloth: classic green nap, fine cream lines, ivory numbers on red and black ovals,
  // the diamonds for red and black, the racetrack printed on the croupier's side and the house mark at the foot. Text faces
  // your seat.
  function paintLayout() {
    const R = L.rect, W = R.x1 - R.x0, D = R.z1 - R.z0, ppc = Math.min(24, Math.floor(Math.min(maxTex, quality.felt) / Math.max(W, D)));   // as sharp as the preset's cloth
    const c = document.createElement('canvas'); c.width = Math.round(W * ppc); c.height = Math.round(D * ppc); const g = c.getContext('2d');
    const px = x => (x - R.x0) * ppc, pz = z => (z - R.z0) * ppc;
    g.fillStyle = dress.cloth; g.fillRect(0, 0, c.width, c.height);
    if (nap) { g.globalAlpha = .5; g.globalCompositeOperation = 'overlay'; const t = 512; for (let y = 0; y < c.height; y += t) for (let x = 0; x < c.width; x += t) g.drawImage(nap, x, y, t, t); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    const s = L.s, portrait = L.orient === 'port', line = Math.max(2, .13 * ppc), CREAM = dress.line;
    const INKC = { red: '#c3192b', black: '#111111', green: '#12924f' }, IVORY = '#ece4d2', OVAL = { red: '#a3141f', black: '#141416' };
    // an oval under a number, rx across your view and ry up it, with a fine brass edge
    const oval = (x, z, rx, ry, fill) => {
      g.beginPath(); g.ellipse(px(x), pz(z), (portrait ? ry : rx) * ppc, (portrait ? rx : ry) * ppc, 0, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill(); g.lineWidth = line * .5; g.strokeStyle = 'rgba(214,180,104,.85)'; g.stroke(); g.lineWidth = line; g.strokeStyle = CREAM;
    };
    const box = (u0, v0, u1, v1) => { const xa = px(L.X(u0)), xb = px(L.X(u1)), za = pz(L.Z(v0)), zb = pz(L.Z(v1)); return [Math.min(xa, xb), Math.min(za, zb), Math.abs(xb - xa), Math.abs(zb - za)]; };
    // print text at a point on the felt (cm), standing up for your seat: from the long side up is -z; from the foot, up is -x.
    // `str` may be runs, [text, scale, rise], set side by side (a raised 'st' in '1st 12'). Figures are Barlow Condensed,
    // the salon's face for values (its 1 is never read as a Roman I); words are Cinzel, the felt lettering.
    const BARLOW = '"Barlow Condensed"';
    const print = (str, x, z, size, { color = CREAM, font = 'Cinzel', weight = 700, rot = 0, track = 0, key = 0 } = {}) => {
      g.save(); g.translate(px(x), pz(z)); g.rotate((portrait ? -Math.PI / 2 : 0) + rot);
      g.textAlign = 'left'; g.textBaseline = 'middle'; if (track) g.letterSpacing = `${track * ppc}px`;
      const face = k => { g.font = `${weight} ${size * k * ppc}px ${font}, "Bodoni Moda", serif`; };
      const runs = (Array.isArray(str) ? str : [[str, 1, 0]]).map(([t, k = 1, up = 0]) => { face(k); return [t, k, up, g.measureText(t).width - (track ? track * ppc : 0)]; });
      let at = -runs.reduce((a, r) => a + r[3], 0) / 2;
      for (const [t, k, up, w] of runs) {
        face(k); const y = size * ppc * (.06 - up);
        if (key) { g.lineJoin = 'round'; g.lineWidth = key * ppc; g.strokeStyle = CREAM; g.strokeText(t, at, y); }
        g.fillStyle = color; g.fillText(t, at, y); at += w;
      }
      g.restore();
    };
    const text = (str, u, v, size, o) => print(str, L.X(u), L.Z(v), size, o);
    g.lineWidth = line; g.strokeStyle = CREAM; g.lineJoin = 'round';
    // numbers: ivory on red and black ovals, so a number's colour reads by its lightness and not by hue alone (red on green
    // is the pair a colour-blind eye loses), as on the salon's strip and the Racetrack sheet
    const nSize = portrait ? s.cu * .56 : s.cu * .5, across = portrait ? s.cv : s.cu, up = portrait ? s.cu : s.cv;
    const ry = up * .3, rx = Math.min(across * .34, ry * 1.4);
    for (let n = 1; n <= 36; n++) {
      const [x, y, w, h] = box(rowOf(n) - 1, colOf(n) - 1, rowOf(n), colOf(n)); g.strokeRect(x, y, w, h);
      oval(L.X(rowOf(n) - .5), L.Z(colOf(n) - .5), rx, ry, OVAL[REDS.has(n) ? 'red' : 'black']);
      text(String(n), rowOf(n) - .5, colOf(n) - .5, nSize, { color: IVORY, font: BARLOW });
    }
    // zero: a pointed box toward the wheel, on a deeper green
    { const [x, y, w, h] = box(-1, 0, 0, 3), tip = w * .42;
      g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + tip, y); g.lineTo(x, y + h / 2); g.lineTo(x + tip, y + h); g.lineTo(x + w, y + h); g.closePath();
      g.fillStyle = dress.zero; g.fill(); g.stroke();
      text('0', -.45, 1.5, nSize * 1.2, { color: IVORY, font: BARLOW }); }
    // columns (at least an 8 px cap height on a phone held upright)
    for (const k of [1, 2, 3]) { const [x, y, w, h] = box(12, k - 1, 13, k); g.strokeRect(x, y, w, h); text('2 to 1', 12.5, k - .5, portrait ? s.cc * .4 : s.cu * .38, { font: BARLOW, rot: portrait ? 0 : -Math.PI / 2 }); }
    // dozens and even money
    [['1', 'st'], ['2', 'nd'], ['3', 'rd']].forEach(([d, o], i) => { const [x, y, w, h] = box(i * 4, -1, i * 4 + 4, 0); g.strokeRect(x, y, w, h); text([[d], [o, .56, .2], [' 12']], i * 4 + 2, -.5, s.d * .5, { font: BARLOW, rot: portrait ? Math.PI / 2 : 0 }); });
    ['1–18', 'EVEN', 'RED', 'BLACK', 'ODD', '19–36'].forEach((t, i) => {
      const [x, y, w, h] = box(i * 2, -2, i * 2 + 2, -1); g.strokeRect(x, y, w, h);
      if (t === 'RED' || t === 'BLACK') {   // the diamonds
        const cx = px(L.X(i * 2 + 1)), cy = pz(L.Z(-1.5)), a = (portrait ? s.e : s.cu * 1.35) * .5 * ppc * .62, b = (portrait ? s.cu * 1.35 : s.e) * .5 * ppc * .62;
        g.beginPath(); g.moveTo(cx - a, cy); g.lineTo(cx, cy - b); g.lineTo(cx + a, cy); g.lineTo(cx, cy + b); g.closePath();
        g.fillStyle = t === 'RED' ? INKC.red : INKC.black; g.fill(); g.lineWidth = line * .9; g.stroke(); g.lineWidth = line;
      } else text(t, i * 2 + 1, -1.5, s.e * .46, /\d/.test(t) ? { font: BARLOW, rot: portrait ? Math.PI / 2 : 0, track: .04 } : { rot: portrait ? Math.PI / 2 : 0, track: .08 });
    });
    // a double gold rule round the grid
    g.strokeStyle = 'rgba(214,180,104,.9)'; g.lineWidth = line * 1.2;
    { const [x, y, w, h] = box(-1, -2, 13, 3), m = .9 * ppc; g.strokeRect(x - m, y - m, w + 2 * m, h + 2 * m); g.lineWidth = line * .6; g.strokeRect(x - 1.5 * m, y - 1.5 * m, w + 3 * m, h + 3 * m); }
    // the racetrack, printed on the croupier's side: the wheel's order round a stadium, its sectors named inside
    if (L.track) { const { len, cx: cxr, cz: czr, H } = L.track, bw = H * .27, r = H / 2, st = len - H;
      const pt = (t, rr) => {   // a point round the stadium at fraction t, starting at the left apex and running clockwise seen from above
        const per = 2 * st + 2 * Math.PI * r; let d = ((t % 1) + 1) % 1 * per; const arc = Math.PI * r;
        if (d < arc / 2) { const a = Math.PI + d / r; return [cxr - st / 2 + rr * Math.cos(a), czr + rr * Math.sin(a)]; } d -= arc / 2;
        if (d < st) return [cxr - st / 2 + d, czr - rr]; d -= st;
        if (d < arc) { const a = -Math.PI / 2 + d / r; return [cxr + st / 2 + rr * Math.cos(a), czr + rr * Math.sin(a)]; } d -= arc;
        if (d < st) return [cxr + st / 2 - d, czr + rr]; d -= st;
        const a = Math.PI / 2 + d / r; return [cxr - st / 2 + rr * Math.cos(a), czr + rr * Math.sin(a)];
      };
      const per = 2 * st + 2 * Math.PI * r, loop = rr => { g.beginPath(); for (let k = 0; k <= 240; k++) { const [x, z] = pt(k / 240, rr); k ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z)); } g.closePath(); g.stroke(); };
      g.strokeStyle = CREAM; g.lineWidth = line; loop(r); loop(r - bw);
      const N = WHEEL_ORDER.length, at0 = -.5 / N;
      for (let i = 0; i < N; i++) {
        const tb = at0 + i / N, [ax, az] = pt(tb, r), [bx, bz] = pt(tb, r - bw); g.beginPath(); g.moveTo(px(ax), pz(az)); g.lineTo(px(bx), pz(bz)); g.stroke();
        const n = WHEEL_ORDER[i], [mx, mz] = pt(tb + .5 / N, r - bw / 2), o = Math.min(per / N, bw) * .42;
        if (n) oval(mx, mz, o * 1.08, o * .86, OVAL[colorOf(n)]); else oval(mx, mz, o * 1.08, o * .86, dress.zero);
        print(String(n), mx, mz, bw * .46, { color: IVORY, font: BARLOW });
      }
      // the sector lines across the inside (Zero | Voisins | Orphelins | Tiers: the zero game's chord runs from between 15
      // and 19 to between 28 and 12, inside the neighbours of zero), and their names
      const edge = n => pt(at0 + WHEEL_ORDER.indexOf(n) / N, r - bw);
      const lines = [[17, 22], [27, 1], [19, 12]].map(([a, b]) => { const [ax, az] = edge(a), [bx, bz] = edge(b); g.beginPath(); g.moveTo(px(ax), pz(az)); g.lineTo(px(bx), pz(bz)); g.stroke(); return [ax, az, bx, bz]; });
      Object.assign(L.track, { st, r, bw, at0, per, lines });   // read back by trackAt
      // each name sized to its own room on the band, so a long one never runs into a divider, the ring or the numbers:
      // ZERO inside the round end (where the band is narrowest), the others between the dividers where they cross its type
      const band = H - 2 * bw, ri = r - bw, left = cxr - st / 2, right = cxr + st / 2, hh = band * .14;
      const xAt = ([ax, az, bx, bz], z) => ax + (bx - ax) * (z - az) / (bz - az), lo = l => Math.min(xAt(l, czr - hh), xAt(l, czr + hh)), hi = l => Math.max(xAt(l, czr - hh), xAt(l, czr + hh));
      const lab = (t, a, b, k = .27) => { g.font = `700 100px Cinzel, "Bodoni Moda", serif`; g.letterSpacing = '0px'; const em = g.measureText(t).width / 100; print(t, (a + b) / 2, czr, Math.min(band * k, (b - a - .06 * t.length) / em), { font: 'Cinzel', weight: 700, track: .06 }); };
      lab('ZERO', left - Math.sqrt(ri * ri - (hh + 1) ** 2) + .4, lo(lines[2]) - .7, .2); lab('VOISINS', hi(lines[2]) + 1.2, lo(lines[0]) - 1.2); lab('ORPHELINS', hi(lines[0]) + 1.2, lo(lines[1]) - 1.2, .24); lab('TIERS', hi(lines[1]) + 1.2, right);
    }
    // the house mark at the foot of the cloth, past the columns, as the blackjack felt prints it: the brass spade with its
    // lit keyhole, the wordmark and the game, standing up for your seat
    { const k = ppc, size = 10 * k;
      g.save(); g.translate(px((L.xEnd + R.x1) / 2 + 1), pz((L.zFar + L.zNear) / 2)); g.rotate(portrait ? -Math.PI / 2 : 0);
      g.save(); g.translate(-size / 2, -size - .6 * k); g.scale(size / 100, size / 100);
      const gr = g.createLinearGradient(0, 0, 0, 100); gr.addColorStop(0, 'rgba(243,222,166,.95)'); gr.addColorStop(.45, 'rgba(201,164,92,.95)'); gr.addColorStop(1, 'rgba(141,106,48,.95)');
      g.fillStyle = gr; g.fill(new Path2D(SPADE)); g.strokeStyle = 'rgba(12,11,10,.4)'; g.lineWidth = 1.2; g.stroke(new Path2D(INLAY));
      g.fillStyle = '#10261b'; g.fill(new Path2D(KEYHOLE));
      const lt = g.createRadialGradient(50, 47, 0, 50, 50, 14); lt.addColorStop(0, 'rgba(255,240,200,.95)'); lt.addColorStop(.5, 'rgba(255,190,90,.9)'); lt.addColorStop(1, 'rgba(170,90,25,.85)');
      g.fillStyle = lt; g.fill(new Path2D(KEYLIGHT)); g.restore();
      const a = `500 ${5 * k}px "Bodoni Moda", Georgia, serif`, b = `italic 600 ${5 * k}px "Bodoni Moda", Georgia, serif`;
      g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.letterSpacing = '0px';
      g.font = a; const wa = g.measureText('Salon ').width; g.font = b; const wb = g.measureText('Noir').width, x0 = -(wa + wb) / 2;
      g.font = a; g.fillStyle = 'rgba(236,228,210,.9)'; g.fillText('Salon ', x0, 4.6 * k); g.font = b; g.fillStyle = 'rgba(226,196,131,.95)'; g.fillText('Noir', x0 + wa, 4.6 * k);
      g.font = `700 ${1.45 * k}px Inter, system-ui, sans-serif`; g.letterSpacing = `${.62 * k}px`; g.textAlign = 'center'; g.fillStyle = 'rgba(201,164,92,.88)';
      g.fillText(dress.game, .31 * k, 7.7 * k); g.letterSpacing = '0px';
      g.restore(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t;
  }
  // the cloth for the seat: the old one's texture and canvas are freed (width 0 lets its pixels go now)
  function repaintLayout() { const old = feltMat.map; feltMat.map = paintLayout(); feltMat.needsUpdate = !old; if (old) { old.dispose(); old.image.width = 0; } requestRender(false); }
  // A rebuild (the phone turned) frees the last body's shapes and its own materials; the shared ones stay.
  const keep = new Set([walnut, blackTop, leather, brass, feltMat]);
  function clearGroup(g) { g.traverse(o => { if (o === g) return; o.geometry?.dispose(); for (const m of [o.material ?? []].flat()) if (!keep.has(m) && ![...floatMats.values()].includes(m)) m.dispose(); }); g.clear(); }
  function buildTable(orient) {
    L = geometry(orient); const R = L.rect;
    repaintLayout();
    felt.scale.set(R.x1 - R.x0, R.z1 - R.z0, 1); felt.position.set((R.x0 + R.x1) / 2, 0, (R.z0 + R.z1) / 2);
    for (const m of feltMats.values()) m.bumpMap?.repeat.set((R.x1 - R.x0) / 21, (R.z1 - R.z0) / 21);   // the nap's tile, as painted
    wheel.group.position.set(L.wheelX, WHEEL_Y, (L.zFar + L.zNear) / 2);   // the bowl stands on the head of the table
    // body, after a TCS John Huxley table: a Macassar top with the wheel sunk in a well at the head, the croupier's
    // chip tray cut in beside it, a padded leather armrest round the players' side and the foot, a dark base
    clearGroup(body);
    const cz = (L.zFar + L.zNear) / 2, wx = L.wheelX;
    const x0T = wx - WELL - 14, x1T = R.x1 + 24, z1T = R.z1 + 25, z0T = Math.min(R.z0 - 14, cz - WELL - 42);   // (room for the cloth round the well and the tray)
    const tray = { x0: wx - 30, x1: wx + 26, z0: cz - WELL - 30, z1: cz - WELL - 7 };
    L.tray = new THREE.Vector3((tray.x0 + tray.x1) / 2, 0, (tray.z0 + tray.z1) / 2);
    // the top: rounded at the head and the foot (more at the near corner of the head), drawn d in from its edge; the
    // well and the tray cut out
    const rr = 22, P = (x, z) => new THREE.Vector2(x, -z);
    const outline = (d = 0) => { const a = x0T + d, b = x1T - d, c = z0T + d, e = z1T - d, r = rr - d, r2 = rr * 1.6 - d, sh = new THREE.Shape();
      sh.moveTo(a + r, -c); sh.lineTo(b - r, -c); sh.absarc(b - r, -(c + r), r, Math.PI / 2, 0, true);
      sh.lineTo(b, -(e - r)); sh.absarc(b - r, -(e - r), r, 0, -Math.PI / 2, true);
      sh.lineTo(a + r2, -e); sh.absarc(a + r2, -(e - r2), r2, -Math.PI / 2, -Math.PI, true);
      sh.lineTo(a, -(c + r)); sh.absarc(a + r, -(c + r), r, Math.PI, Math.PI / 2, true); return sh; };
    const cut = (sh, well) => { const hole = new THREE.Path(); hole.absarc(wx, -cz, well, 0, Math.PI * 2, true); sh.holes.push(hole);
      sh.holes.push(new THREE.Path([P(tray.x0, tray.z0), P(tray.x0, tray.z1), P(tray.x1, tray.z1), P(tray.x1, tray.z0)])); return sh; };
    const shape = cut(outline(), WELL);
    // the cloth: the whole top inside a rim of wood, cut round the well a little wide; under it a brass sheet a little
    // larger, showing as a fine rule at the cloth's edge and a ring round the wheel. (The armrest lies over its edge.)
    const RIM = 5, flat = (sh, y) => { const g = new THREE.ShapeGeometry(sh, 48); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; };
    cloth.geometry.dispose(); cloth.geometry = flat(cut(outline(RIM), WELL + 1.2), 0);
    const rule = new THREE.Mesh(flat(cut(outline(RIM - .7), WELL - .2), -.15), brass); rule.receiveShadow = true; body.add(rule);
    const topGeo = new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: true, bevelThickness: .8, bevelSize: .8, bevelSegments: 3, curveSegments: 64 }); topGeo.rotateX(-Math.PI / 2); topGeo.translate(0, -13.1, 0);
    const top = new THREE.Mesh(topGeo, dress.studio ? blackTop : walnut); top.receiveShadow = true; top.castShadow = true; body.add(top);
    if (dress.studio) {
      // the studio's lacquer is edged in gold, and the wheel stands raised on a stepped gold plinth, as on Evolution's set
      // (art deco: three steps down to the cloth); its value markers stand clear of it
      const edge = outline(.25); edge.holes.push(outline(1.7)); const eg = new THREE.ShapeGeometry(edge, 64); eg.rotateX(-Math.PI / 2); eg.translate(0, -.24, 0); body.add(new THREE.Mesh(eg, brass));
      const r0 = WELL + .2, steps = [[r0, 0], [r0, 2.6], [r0 + 2.2, 2.6], [r0 + 2.2, 1.8], [r0 + 4.2, 1.8], [r0 + 4.2, 1], [r0 + 6.4, 1], [r0 + 6.4, 0]];
      const plinth = new THREE.Mesh(new THREE.LatheGeometry(steps.map(([x, y]) => new THREE.Vector2(x, y)), 160), brass); plinth.position.set(wx, 0, cz); plinth.receiveShadow = true; body.add(plinth);
      studioProps({ wx, cz, x0T, z0T, z1T, R, tray, rOut: r0 + 6.4 });
    }
    const dark = new THREE.MeshStandardMaterial({ color: '#0b0908', roughness: .9, side: THREE.BackSide });
    const well = new THREE.Mesh(new THREE.CylinderGeometry(WELL, WELL, 18, 96, 1, true), dark); well.position.set(wx, -9.3, cz); body.add(well);
    // the tray: a velvet-lined recess holding the float, chips lying on their sides in rows
    { const w = tray.x1 - tray.x0, d = tray.z1 - tray.z0, inner = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), new THREE.MeshStandardMaterial({ color: '#1a1512', roughness: 1, side: THREE.BackSide }));
      inner.position.set(L.tray.x, -3.2, L.tray.z); body.add(inner);
      for (const [a, b, len, along] of [[tray.x0, tray.z0, w, 'x'], [tray.x0, tray.z1, w, 'x'], [tray.x0, tray.z0, d, 'z'], [tray.x1, tray.z0, d, 'z']]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len + .8 : .8, .5, along === 'z' ? len + .8 : .8), brass);
        m.position.set(along === 'x' ? a + len / 2 : a, .05, along === 'z' ? b + len / 2 : b); body.add(m);
      }
      const rows = 10, gap = (w - 4) / rows, len = d - 3, cr = CHIP_R;
      const colours = ['#ece6d6', '#b4202b', '#1e6a3c', '#17181b', '#5d2b7d', '#d29a34', '#ece6d6', '#b4202b', '#1e6a3c', '#17181b'];
      for (let i = 0; i < rows; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(cr, cr, len, 28, 1, false), floatMaterial(colours[i], len)); m.rotation.x = Math.PI / 2;
        m.position.set(tray.x0 + 2 + gap * (i + .5), -6.2 + cr, L.tray.z); m.receiveShadow = true; body.add(m);
      }
    }
    // the armrest: a padded leather roll 22 cm wide, along the players' side and round the foot, each end rounded
    { const half = 11, hgt = 9.5, rc = 18, prof = [];
      prof.push([-half, 0], [half, 0]);
      for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI / 2; prof.push([half - 4.6 + 4.6 * Math.cos(a), hgt - 4.6 + 4.6 * Math.sin(a)]); }
      for (let k = 0; k <= 8; k++) { const a = Math.PI / 2 + k / 8 * Math.PI / 2; prof.push([-half + 4.6 + 4.6 * Math.cos(a), hgt - 4.6 + 4.6 * Math.sin(a)]); }
      const sh = new THREE.Shape(prof.map(([o, y]) => new THREE.Vector2(o, y))), y0 = -.4;
      const zP = R.z1 + half, xF = R.x1 + half, zD = R.z0 - half;
      // an extrusion comes flat-shaded, every facet of the roll a band of its own: its normals smoothed where faces meet
      // at under 50 degrees (the roll), its flat ends kept sharp
      const smooth = g => { const P = g.attributes.position, N = g.attributes.normal, key = k => `${P.getX(k).toFixed(3)},${P.getY(k).toFixed(3)},${P.getZ(k).toFixed(3)}`, at = new Map();
        for (let k = 0; k < P.count; k++) { const q = key(k); if (!at.has(q)) at.set(q, []); at.get(q).push(k); }
        const out = new Float32Array(N.count * 3), n = new THREE.Vector3(), m = new THREE.Vector3(), sum = new THREE.Vector3();
        for (const ks of at.values()) for (const k of ks) { n.fromBufferAttribute(N, k); sum.set(0, 0, 0); for (const j of ks) { m.fromBufferAttribute(N, j); if (m.dot(n) > .64) sum.add(m); } sum.normalize(); out.set([sum.x, sum.y, sum.z], k * 3); }
        g.setAttribute('normal', new THREE.BufferAttribute(out, 3)); return g; };
      const straight = (len, along, x, z) => { const g = smooth(new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false, curveSegments: 12 })); if (along === 'x') g.rotateY(Math.PI / 2); const m = new THREE.Mesh(g, leather); m.position.set(x, y0, z); m.castShadow = m.receiveShadow = true; body.add(m); };
      // a lathe's uv runs 0..1 round and along its outline: in cm instead, across the roll and along it, as the straight runs have
      const inCm = (g, pts, around) => { let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getY(k) * len, uv.getX(k) * around); return g; };
      const corner = (cx, cz2, phi0) => { const g = inCm(new THREE.LatheGeometry(prof.concat([prof[0]]).map(([o, y]) => new THREE.Vector2(rc + o, y)), 24, phi0, Math.PI / 2), prof.concat([prof[0]]), rc * Math.PI / 2); const m = new THREE.Mesh(g, leather); m.material = leather; m.position.set(cx, y0, cz2); m.castShadow = m.receiveShadow = true; body.add(m); };
      const xs = wx + 50;
      const halfP = prof.filter(([o]) => o >= 0).sort((a, b) => a[1] - b[1] || b[0] - a[0]), capP = [[0, 0], ...halfP, [0, hgt]];
      const cap = (x, z) => { const m = new THREE.Mesh(inCm(new THREE.LatheGeometry(capP.map(([o, y]) => new THREE.Vector2(o, y)), 20, Math.PI, Math.PI), capP, half * Math.PI / 2), leather); m.position.set(x, y0, z); m.castShadow = m.receiveShadow = true; body.add(m); };   // an end, rounded off toward the head
      cap(xs, zP);                                                // the near end
      straight(xF - rc - xs, 'x', xs, zP);                       // along the players' side
      corner(xF - rc, zP - rc, 0);                                // round the near corner of the foot
      straight((zP - rc) - (zD + rc), 'z', xF, zD + rc);          // across the foot
      corner(xF - rc, zD + rc, Math.PI / 2);                      // round the far corner
      cap(xF - rc, zD);                                           // and it ends there: the croupier's side is his
    }
    // what holds it up, as at the blackjack table: a lacquered apron under the top with two lines of warm light round it,
    // a pedestal set well back, and a low plinth with a brass edge and a line of light at its foot that lies warm on the
    // carpet; a brass foot-rail on the players' side
    { const lacquer = new THREE.MeshStandardMaterial({ color: dress.lacquer, roughness: dress.studio ? .2 : .34, envMapIntensity: .8 }), glowM = new THREE.MeshBasicMaterial({ color: dress.lamp, toneMapped: false });
      const rect = (inset, r) => { const a = x0T + inset, b = x1T - inset, c = z0T + inset, d = z1T - inset, q = Math.min(r, (b - a) / 2, (d - c) / 2), sh = new THREE.Shape();
        sh.moveTo(a + q, -c); sh.lineTo(b - q, -c); sh.absarc(b - q, -(c + q), q, Math.PI / 2, 0, true); sh.lineTo(b, -(d - q)); sh.absarc(b - q, -(d - q), q, 0, -Math.PI / 2, true);
        sh.lineTo(a + q, -d); sh.absarc(a + q, -(d - q), q, -Math.PI / 2, -Math.PI, true); sh.lineTo(a, -(c + q)); sh.absarc(a + q, -(c + q), q, Math.PI, Math.PI / 2, true); return sh; };
      const slab = (inset, r, y0, y1, mat) => { const g = new THREE.ExtrudeGeometry(rect(inset, r), { depth: y1 - y0, bevelEnabled: false, curveSegments: 24 }); g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; body.add(m); return m; };
      const band = (inset, r, y, h, mat, t = .3) => { const sh = rect(inset - t, r + t); sh.holes.push(rect(inset, r)); const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 24 }); g.rotateX(-Math.PI / 2); g.translate(0, y - h / 2, 0); body.add(new THREE.Mesh(g, mat)); };
      const A0 = -13.1, A1 = -30, P1 = FLOOR_Y + 4.5;
      slab(4, rr, A1, A0, lacquer); for (const y of [-17.5, -24.5]) band(4, rr, y, .45, glowM, .15); band(4, rr, A1 + .6, 1.2, brass, .25);
      slab(34, 18, P1, A1, lacquer); band(34, 18, A1 - 1.2, .5, glowM, .12);
      slab(24, 22, FLOOR_Y, P1, lacquer); band(24, 22, P1 - .5, 1, brass, .2); band(24, 22, FLOOR_Y + .5, .4, glowM, .25);
      // its light on the carpet: a warm band round the plinth, strongest at its edge
      { const pad = 36, w = x1T - x0T - 48 + 2 * pad, d = z1T - z0T - 48 + 2 * pad, k = 6, c = document.createElement('canvas'); c.width = Math.round(w * k / 4); c.height = Math.round(d * k / 4); const g = c.getContext('2d'), sx = c.width / w, sz = c.height / d;
        g.filter = `blur(${Math.round(9 * sx)}px)`; g.strokeStyle = dress.pool; g.lineWidth = 14 * sx; g.beginPath(); g.roundRect(pad * sx, pad * sz, (w - 2 * pad) * sx, (d - 2 * pad) * sz, 22 * sx); g.stroke();
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        pool.rotation.x = -Math.PI / 2; pool.position.set((x0T + x1T) / 2, FLOOR_Y + .15, (z0T + z1T) / 2); pool.renderOrder = 1; body.add(pool); } }
    const footRail = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, x1T - x0T - 70, 20), brass); footRail.rotation.z = Math.PI / 2; footRail.position.set((x0T + x1T) / 2 + 6, -64, z1T - 14); body.add(footRail);
    { const len = x1T - x0T - 70, cx = (x0T + x1T) / 2 + 6, legG = new THREE.CylinderGeometry(1.1, 1.4, 16, 12);      // standing on short brass posts, not floating
      for (const k of [-.46, 0, .46]) { const leg = new THREE.Mesh(legG, brass); leg.position.set(cx + k * len, -72, z1T - 14); body.add(leg); } }
    // lights follow the table
    keyW.position.set(L.wheelX + 6, 150, 20); keyW.target.position.set(L.wheelX, 0, (L.zFar + L.zNear) / 2);
    rim.position.set((L.wheelX + L.xEnd) / 2, 70, L.zFar - 260); rim.target.position.set((L.wheelX + L.xEnd) / 2, 0, (L.zFar + L.zNear) / 2);
    { const mid = (L.X(-1) + L.xEnd) / 2, cz2 = (L.zFar + L.zNear) / 2; keyL.position.set(mid, 175, cz2 + 26); keyL.target.position.set(mid, 0, cz2); }
    glow.position.set(L.wheelX - 120, 70, -40);
    // highlight tiles: one per number and per outside box
    clearGroup(hi); tiles.clear();
    const tile = (key, u0, v0, u1, v1) => {
      const w = Math.abs(L.X(u1) - L.X(u0)), d = Math.abs(L.Z(v1) - L.Z(v0)), m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: '#ffd98a', alphaMap: glowMap(w, d, key === 0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.position.set((L.X(u0) + L.X(u1)) / 2, .06, (L.Z(v0) + L.Z(v1)) / 2); m.visible = false; hi.add(m); tiles.set(key, m);
    };
    for (let n = 1; n <= 36; n++) tile(n, rowOf(n) - 1, colOf(n) - 1, rowOf(n), colOf(n));
    tile(0, -1, 0, 0, 3);
    for (const k of [1, 2, 3]) tile(`col${k}`, 12, k - 1, 13, k);
    for (const k of [1, 2, 3]) tile(`doz${k}`, (k - 1) * 4, -1, k * 4, 0);
    ['low', 'even', 'red', 'black', 'odd', 'high'].forEach((id, i) => tile(id, i * 2, -2, i * 2 + 2, -1));
    placeBackdrop(); placeMarkers(); placePlaque(); placeBoard();
    for (const f of relayout) f();
    requestRender();
  }
  const tiles = new Map(), relayout = new Set();
  // The studio's own pieces, built with the table there. A gold sunburst printed on the cloth round the wheel's plinth
  // (cut away where the layout and the tray are, and short of the rim), and the lightning machine standing behind the
  // croupier's side: a lacquered column with gold bands, a glass tube with a glowing filament wound in gold, a gold sphere
  // and ring on top, and the lever the croupier pulls (L.machine: where its bolts leave from; the show is rgame's).
  function studioProps({ wx, cz, x0T, z0T, z1T, R, tray, rOut }) {
    { const Rd = rOut + 30, k = 10, S = Math.round(2 * Rd * k), c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
      const X = x => (x - (wx - Rd)) * k, Z = z => (z - (cz - Rd)) * k;
      g.translate(S / 2, S / 2); g.lineCap = 'round';
      for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, long = i % 2 === 0, r1 = (rOut + 1.2) * k, r2 = (long ? Rd - 2 : Rd - 12) * k;
        const gr = g.createLinearGradient(Math.cos(a) * r1, Math.sin(a) * r1, Math.cos(a) * r2, Math.sin(a) * r2); gr.addColorStop(0, 'rgba(226,192,120,.75)'); gr.addColorStop(1, 'rgba(226,192,120,0)');
        g.strokeStyle = gr; g.lineWidth = (long ? .32 : .2) * k; g.beginPath(); g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); g.stroke(); }
      g.strokeStyle = 'rgba(226,192,120,.6)'; for (const [r, w] of [[rOut + 2.4, .18], [rOut + 3.2, .08]]) { g.lineWidth = w * k; g.beginPath(); g.arc(0, 0, r * k, 0, Math.PI * 2); g.stroke(); }
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
      g.fillRect(X(R.x0 - 1.5), Z(R.z0 - 1.5), X(R.x1) - X(R.x0 - 1.5), Z(R.z1 + 1.5) - Z(R.z0 - 1.5));                 // the layout
      g.fillRect(X(tray.x0 - 1.5), Z(tray.z0 - 1.5), X(tray.x1 + 1.5) - X(tray.x0 - 1.5), Z(tray.z1 + 1.5) - Z(tray.z0 - 1.5));   // the tray
      g.fillRect(0, 0, X(x0T + 7), S); g.fillRect(0, 0, S, Z(z0T + 7)); g.fillRect(0, Z(z1T - 7), S, S);               // short of the rim
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * Rd, 2 * Rd), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: .5, metalness: .35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.rotation.x = -Math.PI / 2; m.position.set(wx, .02, cz); m.receiveShadow = true; body.add(m); }
    { const mx = wx + WELL + 34, mz = z0T - 17, top = 46, ink = new THREE.MeshStandardMaterial({ color: '#08080a', roughness: .2, envMapIntensity: 1.2 });
      const m = new THREE.Group(); m.position.set(mx, 0, mz); body.add(m);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(8, 9.5, 4 - FLOOR_Y, 8), ink); col.position.y = (FLOOR_Y + 4) / 2; col.castShadow = col.receiveShadow = true; m.add(col);
      for (const y of [FLOOR_Y + 3, -20, -2, 3.4]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(9.6 - (y + 80) * .012, 9.8 - (y + 80) * .012, y > 0 ? 1.2 : .8, 8), brass); b.position.y = y; m.add(b); }
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, top - 4, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#cfd8e6', roughness: .06, metalness: 0, transparent: true, opacity: .22, envMapIntensity: 2, depthWrite: false, side: THREE.DoubleSide }));
      glass.position.y = 4 + (top - 4) / 2; glass.renderOrder = 2; m.add(glass);
      const fil = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, top - 6, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(dress.accent ?? '#9cc8ff').multiplyScalar(1.6), toneMapped: false })); fil.position.y = 4 + (top - 4) / 2; m.add(fil);
      const helix = new THREE.Curve(); helix.getPoint = (u, out = new THREE.Vector3()) => out.set(Math.cos(u * Math.PI * 2 * 16) * 1.9, 6 + u * (top - 12), Math.sin(u * Math.PI * 2 * 16) * 1.9);
      m.add(new THREE.Mesh(new THREE.TubeGeometry(helix, 640, .16, 6, false), brass));
      for (const y of [4.6, top]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 1.4, 40), brass); r.position.y = y; m.add(r); }
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(4.2, 32, 20), brass); sphere.position.y = top + 5; sphere.castShadow = true; m.add(sphere);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7.2, 1.3, 16, 64), brass); ring.rotation.x = Math.PI / 2; ring.position.y = top + 3.4; m.add(ring);
      // the lever, on the column's face toward the table: a gold arm with a red knob, up until it is pulled
      const lever = new THREE.Group(); lever.position.set(0, 0, 9.6); lever.rotation.x = -.5; m.add(lever);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 14, 12), brass); arm.position.y = 7; lever.add(arm);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), new THREE.MeshStandardMaterial({ color: '#a3141f', roughness: .25 })); knob.position.y = 14.5; knob.castShadow = true; lever.add(knob);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 20), brass); hub.rotation.z = Math.PI / 2; lever.add(hub);
      L.machine = { group: m, lever, filament: fil, tip: new THREE.Vector3(mx, top + 5, mz) }; }
  }
  // The salon's middle faces where your seat looks: the croupier's side from the long side, the head of the table from the
  // foot.
  function placeBackdrop() { const port = L.orient === 'port'; for (const w of [salon, studioWall]) w?.place((L.wheelX - WELL + L.rect.x1) / 2, (L.zFar + L.zNear) / 2, port ? -1 : 0, port ? 0 : -1); }
  // A lit box glows like a lamp under the cloth: brightest along its printed edge and fading in toward the middle, so
  // the numeral keeps its ink. One alpha map per box shape (the zero's is pointed), shared by the boxes of that size.
  const glowMaps = new Map();
  function glowMap(w, d, zero) {
    const key = `${w.toFixed(2)}x${d.toFixed(2)}${zero ? 'z' : ''}`; if (glowMaps.has(key)) return glowMaps.get(key);
    const k = 12, W = Math.ceil(w * k), D = Math.ceil(d * k), c = document.createElement('canvas'); c.width = W; c.height = D; const g = c.getContext('2d');
    const path = () => { g.beginPath(); if (zero) { const tip = W * .42; g.moveTo(W, 0); g.lineTo(tip, 0); g.lineTo(0, D / 2); g.lineTo(tip, D); g.lineTo(W, D); g.closePath(); } else g.rect(0, 0, W, D); };
    g.fillStyle = '#000'; g.fillRect(0, 0, W, D); g.save(); path(); g.clip(); g.lineJoin = 'round';
    for (let i = 24; i >= 1; i--) { g.lineWidth = i * .1 * k * 2; g.strokeStyle = 'rgba(255,255,255,.045)'; path(); g.stroke(); }   // a soft falloff 2.4 cm deep
    g.lineWidth = .4 * k * 2; g.strokeStyle = '#fff'; path(); g.stroke(); g.restore();   // and a bright 4 mm line on the edge
    const t = new THREE.CanvasTexture(c); glowMaps.set(key, t); return t;
  }
  // Light up numbers or boxes: keys are numbers or outside ids, or [key, level]; `level` 0-1. `fade` (ms) brings the
  // glow up once, as a lamp warms (a still ticker: no shadows redrawn, and it stops at full).
  let glowJob = null;
  function highlight(keys, { level = .32, color = '#ffd98a', fade = 0 } = {}) {
    const want = new Map(keys.map(k => Array.isArray(k) ? k : [k, level]));
    if (glowJob) { tickers.delete(glowJob); glowJob = null; }
    for (const [k, m] of tiles) { const lv = want.get(k); m.visible = lv != null; if (lv != null) { m.userData.level = lv; m.material.opacity = fade > 0 ? 0 : lv; m.material.color.set(color); } }
    if (fade > 0) {
      const t0 = performance.now(), job = now => { const t = Math.min(1, (now - t0) / fade), e = 1 - (1 - t) ** 3; for (const m of tiles.values()) if (m.visible) m.material.opacity = m.userData.level * e; if (t >= 1) { tickers.delete(job); if (glowJob === job) glowJob = null; } };
      job.still = true; glowJob = job; tickers.add(job);
    }
    requestRender(false);   // glowing tiles cast nothing
  }

  // ---- chips and the dolly ------------------------------------------------------------------------------------------
  // The other players' colour chips: each colour has its own count of edge inserts, on the face and round the rim, so a
  // stack still says whose it is from the side or to an eye that can't tell the colours apart (`chipLook` sets the count).
  // Made like the salon's value chips: clay with its inserts running in from the edge and round the rim, a moulded ring
  // of suits (the same bump), and a printed inlay for the table, as the regulators ask of a roulette chip.
  const wheelChipMats = new Map(), chipLooks = new Map();
  function wheelChipMaterials(color) {
    if (wheelChipMats.has(color)) return wheelChipMats.get(color);
    const n = chipLooks.get(color)?.inserts ?? 6, half = Math.PI * .3 / n;   // the inserts cover 30% of the edge, however many
    const S = 512, m = S / 2, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    const tone = k => { const x = new THREE.Color(color); x.offsetHSL(0, 0, k); return `#${x.getHexString()}`; };
    const gr = g.createRadialGradient(m * .8, m * .7, 20, m, m, m); gr.addColorStop(0, tone(.05)); gr.addColorStop(1, tone(-.05));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.fillStyle = '#f3eee2'; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.beginPath(); g.arc(m, m, m, a - half, a + half); g.arc(m, m, 196, a + half, a - half, true); g.closePath(); g.fill(); }
    g.strokeStyle = 'rgba(243,238,226,.9)'; g.lineWidth = 6; g.beginPath(); g.arc(m, m, 176, 0, Math.PI * 2); g.stroke();
    // the inlay: ivory, the house and the table printed on it
    g.fillStyle = '#efe8d8'; g.beginPath(); g.arc(m, m, 128, 0, Math.PI * 2); g.fill(); g.strokeStyle = color; g.lineWidth = 8; g.beginPath(); g.arc(m, m, 118, 0, Math.PI * 2); g.stroke();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 30px Inter, sans-serif'; g.fillText('SALON NOIR', m, m - 26); g.font = '700 26px Inter, sans-serif'; g.fillText('ROULETTE', m, m + 22);
    g.fillRect(m - 40, m - 2, 80, 3);
    const face = new THREE.CanvasTexture(c); face.colorSpace = THREE.SRGBColorSpace; face.anisotropy = aniso;   // (seen edge-on across the cloth)
    // the rim: u runs once round the chip from the face's angle 0 (as chipEdgeTexture lines its spots up)
    const r = document.createElement('canvas'); r.width = 1024; r.height = 32; const e = r.getContext('2d');
    e.fillStyle = color; e.fillRect(0, 0, 1024, 32); e.fillStyle = '#f3eee2';
    for (let i = 0; i <= n; i++) { const u = i / n * 1024, hw = half / (Math.PI * 2) * 1024; e.fillRect(u - hw, 0, hw * 2, 32); }
    e.fillStyle = 'rgba(0,0,0,.22)'; e.fillRect(0, 0, 1024, 4); e.fillRect(0, 28, 1024, 4);
    const rim = new THREE.CanvasTexture(r); rim.colorSpace = THREE.SRGBColorSpace; rim.wrapS = THREE.RepeatWrapping; rim.anisotropy = aniso;
    const side = new THREE.MeshStandardMaterial({ map: rim, roughness: .5 }), top = new THREE.MeshStandardMaterial({ map: face, bumpMap: chipBumpTexture(1), bumpScale: .9, roughness: .46 });
    const mats = [side, top]; wheelChipMats.set(color, mats); return mats;   // rim, both faces
  }
  // true size: a 39 mm chip, CHIP_H thick (the regulation 1.55 in, and Paulson's roulette chip)
  const chipMesh = v => { const m = new THREE.Mesh(chipGeometry(), typeof v === 'number' ? chipMaterials(v) : wheelChipMaterials(v)); m.castShadow = m.receiveShadow = true; chipsG.add(m); return m; };
  const chipLook = (color, look) => { chipLooks.set(color, look); };
  // ---- chips at rest: one instanced draw per kind of chip --------------------------------------------------------
  // A chip that has come to rest is folded into its kind's InstancedMesh (a value, or a player's colour): two draws for
  // every chip of that kind on the cloth, shadows included, where each chip on its own cost two draws and two more in
  // each shadow pass. A chip about to move is taken out again (free) and drawn on its own until it settles (rest).
  const batches = new Map();
  function grow(b) {
    const cap = Math.max(32, b.cap * 2), mesh = new THREE.InstancedMesh(chipGeometry(), b.mats, cap);
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = b.list.length;
    b.list.forEach((m, i) => { m.updateMatrix(); mesh.setMatrixAt(i, m.matrix); });
    if (b.mesh) { chipsG.remove(b.mesh); b.mesh.dispose(); }
    b.mesh = mesh; b.cap = cap; chipsG.add(mesh);
  }
  const chips = {
    rest(m) {
      if (m.userData.batch) { chips.sync(m); return; }
      let b = batches.get(m.material); if (!b) batches.set(m.material, b = { mats: m.material, list: [], mesh: null, cap: 0 }); if (b.list.length >= b.cap) grow(b);
      m.userData.batch = b; m.userData.slot = b.list.length; b.list.push(m); b.mesh.count = b.list.length; m.visible = false; chips.sync(m);
    },
    free(m) {
      const b = m.userData.batch; if (!b) return; const i = m.userData.slot, last = b.list.pop();
      if (last !== m) { b.list[i] = last; last.userData.slot = i; chips.sync(last); }
      b.mesh.count = b.list.length; b.mesh.instanceMatrix.needsUpdate = true; m.userData.batch = m.userData.slot = null; m.visible = true;
    },
    sync(m) { const b = m.userData.batch; if (!b) return; m.updateMatrix(); b.mesh.setMatrixAt(m.userData.slot, m.matrix); b.mesh.instanceMatrix.needsUpdate = true; },
    drop(m) { chips.free(m); chipsG.remove(m); },
  };
  // each colour's value, as at a real table: a chip of that colour on the wood beside the wheel, under a brass button
  // that reads what a stack of twenty of them is worth
  const markers = new THREE.Group(); table.add(markers);
  function setMarkers(list) {
    markers.clear();
    list.forEach(({ color, unit }, i) => {
      const c = chipMesh(color); chipsG.remove(c); c.position.set(i * (CHIP_R * 2 + .6), CHIP_H / 2, 0); markers.add(c);
      const tc = document.createElement('canvas'); tc.width = tc.height = 128; const g = tc.getContext('2d');
      g.fillStyle = '#d9b265'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#2a2010'; g.font = '700 54px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(unit * 20), 64, 68);
      const tt = new THREE.CanvasTexture(tc); tt.colorSpace = THREE.SRGBColorSpace;
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, .32, 32), [brass, new THREE.MeshStandardMaterial({ map: tt, metalness: .6, roughness: .3 }), brass]);
      btn.position.set(c.position.x, CHIP_H + .16, 0); btn.castShadow = true; markers.add(btn);
    });
    placeMarkers();
  }
  // The table's limits, posted at the table as the gaming rules ask: a black plate in a brass frame standing on the cloth's
  // far corner, past the racetrack, facing your seat. Its figures come from the rules, so it never drifts from what the
  // table takes.
  const plaque = (() => {
    const W = 15, H = 8.2, c = document.createElement('canvas'); c.width = 600; c.height = Math.round(600 * H / W); const g = c.getContext('2d'), k = c.width / W;
    g.fillStyle = '#0f0e0d'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(214,180,104,.85)'; g.lineWidth = .1 * k; g.strokeRect(.5 * k, .5 * k, c.width - k, c.height - k);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#d9b265'; g.font = `700 ${1.3 * k}px Cinzel, serif`; g.letterSpacing = `${.22 * k}px`;
    g.fillText('TABLE LIMITS', W / 2 * k + .11 * k, 1.75 * k); g.letterSpacing = '0px';
    [['Minimum bet', LIMITS.min], ['Straight up', KINDS.straight.max], ['Even money', KINDS.even.max], ['Table', LIMITS.table]].forEach(([a, v], i) => {
      const y = (3.3 + i * 1.3) * k;
      g.textAlign = 'left'; g.font = `500 ${1 * k}px Inter, sans-serif`; g.fillStyle = 'rgba(236,228,210,.86)'; g.fillText(a, 1.3 * k, y);
      g.textAlign = 'right'; g.font = `700 ${1.2 * k}px "Barlow Condensed", sans-serif`; g.fillStyle = '#ecd9a6'; g.fillText(v.toLocaleString('en-US'), (W - 1.3) * k, y);
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    const sign = new THREE.Group(), lean = new THREE.Group(); lean.rotation.x = -.32; lean.position.y = .5; sign.add(lean);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + .8, H + .8, .5), brass); frame.position.y = (H + .8) / 2; frame.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: t, roughness: .3, metalness: .1 })); face.position.set(0, (H + .8) / 2, .26);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, .5, 3.4), brass); foot.position.y = .25; foot.castShadow = foot.receiveShadow = true;
    lean.add(frame, face); sign.add(foot); table.add(sign); return sign;
  })();
  // The results board: a low black marquee in a brass frame on a brass post, standing at the head of the table behind the
  // wheel beside the croupier's chip tray, turned toward your seat (wide and low, so it shows whole under the bar at your
  // seat and never stands over the wheel): the newest number large at its left in its colour, the twelve before it in a
  // grid to the right, newest first. Repainted when a number lands (setBoard).
  // In the Lightning studio the board is the strike screen: in an art deco gold frame stepped up to a crown, the
  // table's name across its head, the newest number large at its left and the last eight beside it, and under them the
  // numbers lightning struck this round with their multipliers (setBoard's `strikes`).
  const BOARD_Y = 2;   // the display's foot, over the felt
  function makeBoard(studio) {
    const W = studio ? 33 : 30, H = studio ? 33 * 17 / 40 : 13, c = document.createElement('canvas'); c.width = studio ? 1200 : 900; c.height = Math.round(c.width * H / W);   // (the studio's is painted 40 x 17 and shown as large as the salon's fits under the bar)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    const g3 = new THREE.Group(), face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    const pole = BOARD_Y - FLOOR_Y, rim = studio ? 2.2 : 1.4, frame = new THREE.Mesh(new THREE.BoxGeometry(W + rim, H + rim, 1.6), brass), post = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, pole, 16), brass), foot = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 1.5, 40), brass);
    frame.position.y = face.position.y = BOARD_Y + H / 2; face.position.z = .81; post.position.y = FLOOR_Y + pole / 2; foot.position.y = FLOOR_Y + .75; frame.castShadow = post.castShadow = true;
    g3.add(frame, face, post, foot);
    if (studio) {   // the crown: three gold steps over the frame, and a fluted fin either side
      let y = BOARD_Y + H + rim / 2; for (const [w, h] of [[W * .62, .8], [W * .36, .7], [W * .14, .9]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.4), brass); b.position.y = y + h / 2; b.castShadow = true; g3.add(b); y += h; }
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(.5, H * (.95 - i * .18), 1.2), brass); f.position.set(sx * (W / 2 + rim / 2 + .5 + i * .9), BOARD_Y + H / 2 - i * H * .06, 0); g3.add(f); }
    }
    table.add(g3); return { group: g3, canvas: c, tex: t, studio, W, H };
  }
  let board = makeBoard(false), boardShows = { history: [], strikes: [] };
  function setBoard(history = boardShows.history, strikes = boardShows.strikes) {
    boardShows = { history, strikes };
    if (board.studio) return paintStrikeBoard(history, strikes);
    const c = board.canvas, g = c.getContext('2d'), k = c.width / 30, ink = { red: '#ff4b55', black: '#f1ece0', green: '#3fd98a' };   // laid out in the board's own centimetres
    g.fillStyle = '#060606'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(214,180,104,.7)'; g.lineWidth = .1 * k; g.strokeRect(.4 * k, .4 * k, c.width - .8 * k, c.height - .8 * k);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#c9a45c'; g.font = `700 ${.95 * k}px Cinzel, serif`; g.letterSpacing = `${.14 * k}px`; g.fillText('SALON NOIR', 5.6 * k, 1.5 * k); g.letterSpacing = '0px';
    const [first, ...rest] = history;
    if (first != null) { g.fillStyle = ink[colorOf(first)]; g.font = `800 ${8.4 * k}px "Barlow Condensed", sans-serif`; g.fillText(String(first), 5.6 * k, 7.6 * k); }
    g.fillStyle = 'rgba(214,180,104,.45)'; g.fillRect(11.2 * k, 1.2 * k, .08 * k, 10.6 * k);
    g.font = `700 ${2.3 * k}px "Barlow Condensed", sans-serif`;
    rest.slice(0, 12).forEach((n, i) => { const col = i % 4, row = Math.floor(i / 4); g.fillStyle = ink[colorOf(n)]; g.globalAlpha = 1 - i * .045; g.fillText(String(n), (13.9 + col * 4.4) * k, (2.9 + row * 3.6) * k); });
    g.globalAlpha = 1; board.tex.needsUpdate = true; requestRender(false);
  }
  // The strike screen, laid out in its own centimetres (40 x 17)
  const BOLT = 'M 0.5 -1 L -0.32 0.12 L 0.06 0.12 L -0.48 1 L 0.4 -0.18 L 0.02 -0.18 Z';   // a lightning bolt, 1 high either way of 0
  function paintStrikeBoard(history, strikes) {
    const c = board.canvas, g = c.getContext('2d'), k = c.width / 40, ink = { red: '#ff4b55', black: '#f1ece0', green: '#3fd98a' }, gold = '#d8b46a';   // (k: px to its 40 cm)
    g.fillStyle = '#050506'; g.fillRect(0, 0, c.width, c.height);
    // a faint sunburst from the foot of the screen
    g.save(); g.translate(20 * k, 17.6 * k); g.strokeStyle = 'rgba(214,180,104,.08)'; g.lineWidth = .12 * k;
    for (let i = 0; i <= 26; i++) { const a = Math.PI + i / 26 * Math.PI; g.beginPath(); g.moveTo(Math.cos(a) * 3 * k, Math.sin(a) * 3 * k); g.lineTo(Math.cos(a) * 40 * k, Math.sin(a) * 40 * k); g.stroke(); }
    g.restore();
    g.strokeStyle = 'rgba(214,180,104,.85)'; g.lineWidth = .12 * k; g.strokeRect(.5 * k, .5 * k, c.width - k, c.height - k); g.lineWidth = .05 * k; g.strokeRect(.85 * k, .85 * k, c.width - 1.7 * k, c.height - 1.7 * k);
    // the head: the table's name between two bolts
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = gold; g.font = `700 ${1.25 * k}px Cinzel, serif`; g.letterSpacing = `${.3 * k}px`;
    const title = dress.game, tw = g.measureText(title).width; g.fillText(title, 20 * k + .15 * k, 2.3 * k); g.letterSpacing = '0px';
    for (const sx of [-1, 1]) { g.save(); g.translate(20 * k + sx * (tw / 2 + 1.4 * k), 2.3 * k); g.scale(.8 * k, .8 * k); g.fillStyle = dress.accent ?? gold; g.fill(new Path2D(BOLT)); g.restore(); }
    // the newest number, large, and the eight before it
    const [first, ...rest] = history;
    g.fillStyle = 'rgba(214,180,104,.4)'; g.fillRect(12.4 * k, 4 * k, .07 * k, 5.6 * k); g.fillRect(1.6 * k, 10.4 * k, 36.8 * k, .07 * k);
    if (first != null) { g.fillStyle = ink[colorOf(first)]; g.font = `800 ${6.4 * k}px "Barlow Condensed", sans-serif`; g.fillText(String(first), 6.8 * k, 7 * k); }
    g.font = `700 ${2.2 * k}px "Barlow Condensed", sans-serif`;
    rest.slice(0, 8).forEach((n, i) => { g.fillStyle = ink[colorOf(n)]; g.globalAlpha = 1 - i * .07; g.fillText(String(n), (14.9 + i * 3.1) * k, 7 * k); });
    g.globalAlpha = 1;
    // the lightning numbers: each in a gold-ringed cell, its multiplier under it
    g.fillStyle = 'rgba(236,228,210,.6)'; g.font = `700 ${.7 * k}px Inter, sans-serif`; g.letterSpacing = `${.2 * k}px`; g.fillText('LIGHTNING NUMBERS', 20 * k, 11.5 * k); g.letterSpacing = '0px';
    const list = strikes ?? [], n = list.length, cw = Math.min(5.2, 34 / Math.max(1, n));
    list.forEach((st, i) => {
      const x = (20 + (i - (n - 1) / 2) * cw) * k, y = 14 * k, r = Math.min(1.9, cw * .4) * k, hot = st.double ? '#ff7a4d' : st.chain ? '#ff5a3c' : dress.accent ?? gold;
      g.beginPath(); g.arc(x, y - .5 * k, r, 0, Math.PI * 2); g.fillStyle = '#0d0d10'; g.fill(); g.lineWidth = .14 * k; g.strokeStyle = hot; g.stroke();
      g.fillStyle = ink[colorOf(st.n)]; g.font = `800 ${r * 1.05}px "Barlow Condensed", sans-serif`; g.fillText(String(st.n), x, y - .5 * k);
      g.fillStyle = gold; g.font = `800 ${Math.min(1.1, cw * .26) * k}px "Barlow Condensed", sans-serif`; g.fillText(`${st.x}×`, x, y + 2 * k);
    });
    if (!n) { g.fillStyle = 'rgba(236,228,210,.35)'; g.font = `500 ${.8 * k}px Inter, sans-serif`; g.fillText('Lightning strikes when bets close', 20 * k, 14 * k); }
    board.tex.needsUpdate = true; requestRender(false);
  }
  // behind the wheel, beside the croupier's chip tray, turned toward your seat (from the foot, on an upright phone, it
  // stands beyond the wheel)
  function placeBoard() {
    const port = L.orient === 'port', cz = (L.zFar + L.zNear) / 2, x = L.wheelX - WELL + 4, z = cz - WELL - 22;
    const seat = port ? new THREE.Vector3(L.xEnd + 120, 0, cz) : new THREE.Vector3((L.wheelX + L.xEnd) / 2, 0, L.zNear + 140);   // (where it faces)
    board.group.position.set(x, 0, z); board.group.rotation.y = Math.atan2(seat.x - x, seat.z - z);
  }
  function placePlaque() { const port = L.orient === 'port'; plaque.position.set(L.xEnd + (port ? 10 : -4), 0, L.zFar - (port ? 22 : 17)); plaque.rotation.y = port ? Math.PI / 2 : -.22; }
  function placeMarkers() { if (!L) return; const cz = (L.zFar + L.zNear) / 2, k = dress.studio ? 1.24 : 1; markers.position.set(L.wheelX + WELL * .55 * k, 0, cz - WELL * .9 * k); markers.rotation.y = 0; }   // (clear of the studio's plinth)
  // The croupier's rake: a slim ebony stick with a T head and a brass ferrule where they meet. Its group sits on the felt
  // under the middle of the head; the head's face (local -z) pushes the chips, and the stick runs back from it toward the
  // croupier and up to his hand. Out of sight until he reaches in.
  const rake = new THREE.Group(); rake.visible = false; table.add(rake);
  { const wood = new THREE.MeshStandardMaterial({ color: '#2b1e15', roughness: .42 }), up = .3, dir = new THREE.Vector3(0, Math.sin(up), -Math.cos(up));
    const head = new THREE.Mesh(new THREE.BoxGeometry(RAKE_W, 1.3, 1.1), wood); head.position.y = .65;
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, 2.4, 16), brass), stick = new THREE.Mesh(new THREE.CylinderGeometry(.5, .62, 120, 12), wood);
    for (const [m, along] of [[ferrule, 1.6], [stick, 62]]) { m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); m.position.set(0, 1.2, 0).addScaledVector(dir, along); }
    for (const m of [head, ferrule, stick]) { m.castShadow = true; rake.add(m); } }
  const dolly = new THREE.Group(); dolly.visible = false; table.add(dolly);
  { const glass = new THREE.MeshPhysicalMaterial({ color: '#f4f1ea', roughness: .05, metalness: 0, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 2.2, transparent: true, opacity: .42, depthWrite: false });   // no transmission: that would draw the whole room twice a frame
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, .5, 40), brass); base.position.y = .25;
    const body2 = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.2, 3.4, 40), glass); body2.position.y = 2.2;
    const capM = new THREE.Mesh(new THREE.SphereGeometry(.95, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), brass); capM.position.y = 3.9;
    for (const m of [base, body2, capM]) { m.castShadow = true; dolly.add(m); } }

  // ---- camera: shots and moves -----------------------------------------------------------------------------------------
  const view = Object.assign(st.view, { top: 0 }), v3 = new THREE.Vector3();
  const pose = (pos, look, fov) => { const m = new THREE.Matrix4().lookAt(pos, look, new THREE.Vector3(0, 1, 0)); return { pos: pos.clone(), quat: new THREE.Quaternion().setFromRotationMatrix(m), fov, look: look.clone() }; };
  // the narrowest lens from `pos` looking at `look` that keeps every point inside the picture
  function fit(pos, look, pts, mx = .94, my = .92) {
    const p = pose(pos, look, 40); camera.position.copy(p.pos); camera.quaternion.copy(p.quat); camera.updateMatrixWorld();
    const ok = fov => { camera.fov = fov; camera.updateProjectionMatrix(); return pts.every(q => { v3.copy(q).project(camera); return Math.abs(v3.x) < mx && Math.abs(v3.y) < my && v3.z < 1; }); };
    const fov = fitFov(ok, 12, 75, .2); if (fov == null) return null;
    p.fov = fov; return p;
  }
  // the same for a shot worked out between frames (the replay): over the picture under the bar, the camera left as it was
  function fitNow(pos, look, pts, mx, my) {
    const off = camera.view?.enabled ? { ...camera.view } : null, was = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov };
    camera.clearViewOffset(); const p = fit(pos, look, pts, mx, my);
    if (off) camera.setViewOffset(off.fullWidth, off.fullHeight, off.offsetX, off.offsetY, off.width, off.height);
    camera.position.copy(was.pos); camera.quaternion.copy(was.quat); camera.fov = was.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    return p;
  }
  const shots = {};
  const wheelCentre = () => wheel.group.position.clone();
  function layoutCorners() { return [[-1, 3], [-1, -2], [13, 3], [13, -2]].map(([u, v]) => new THREE.Vector3(L.X(u), 0, L.Z(v))); }
  const rimPts = (r = WELL, y = 1.5, n = 16) => Array.from({ length: n }, (_, i) => wheelCentre().add(new THREE.Vector3(r * Math.cos(i / n * Math.PI * 2), y, r * Math.sin(i / n * Math.PI * 2))));
  function computeShots() {
    const portrait = L.orient === 'port', wc = wheelCentre(), cz = wc.z;
    // your seat: the whole layout, largest, with the wheel beside it (Mac) or rising at the top (phone)
    let best = null;
    if (portrait) {
      const must = [...layoutCorners(), new THREE.Vector3(L.wheelX + 28, 0, cz)];
      for (let h = 80; h <= 280; h += 8) for (let d = 10; d <= 170; d += 8) {
        const pos = new THREE.Vector3(L.xEnd + d, h, cz), look = new THREE.Vector3((L.X(-1) + L.xEnd) / 2 - 8, 0, cz), p = fit(pos, look, must, .96, .95);
        if (!p) continue; const score = cellPx(p) - Math.max(0, p.fov - 42) * .8; if (!best || score > best.score) best = { ...p, score };
      }
    } else {
      // standing at the long side, as a player leans in to bet: eyes about a metre over the cloth, looking down at about
      // 50 degrees through a natural lens, so the table has depth (near boxes larger, the track and the wheel's far side
      // receding) and the whole wheel stands at your left. What must show: the layout, the printed racetrack and the
      // whole bowl. Of the places that show it all, the one whose boxes are largest, kept near that height and lens.
      const T = L.track, must = [...layoutCorners(), ...rimPts(WELL, 1.5, 24), ...(T ? [[-1, 0], [1, 0], [-.5, -1], [.5, -1]].map(([a, b]) => new THREE.Vector3(T.cx + a * (b ? T.len - T.H : T.len) / 2, 0, T.cz + b * T.H / 2)) : [])];
      const cx = (L.wheelX - WELL + L.xEnd) / 2;
      // aimed at the middle of what must show, seen from the camera (the track makes it lopsided): the lens can be no wider
      // than the content needs. The camera has no yaw, so a point's height in the picture depends on its y and z alone.
      const aim = pos => { let a0 = Infinity, a1 = -Infinity; for (const q of must) { const a = Math.atan2(pos.y - q.y, pos.z - q.z); a0 = Math.min(a0, a); a1 = Math.max(a1, a); } const yL = WHEEL_Y * .4; return new THREE.Vector3(cx, yL, pos.z - (pos.y - yL) / Math.tan((a0 + a1) / 2)); };
      for (let h = 60; h <= 220; h += 6) for (let d = 10; d <= 240; d += 6) {
        const pos = new THREE.Vector3(cx, h, L.zNear + d), look = aim(pos), p = fit(pos, look, must, .97, .93);
        if (!p) continue;
        const pitch = Math.atan2(pos.y - look.y, pos.z - look.z) * 180 / Math.PI;
        const score = cellPx(p) - Math.abs(pitch - 50) * 1.2 - Math.max(0, 32 - p.fov) * 2 - Math.max(0, p.fov - 46) * 2;
        if (!best || score > best.score) best = { ...p, score };
      }
    }
    shots.seat = best ?? pose(new THREE.Vector3(L.xEnd + 40, 120, 60), new THREE.Vector3(0, 0, 0), 45);
    // the wheel, from your side, at about 50 degrees, filling most of the short side of the screen
    const side = portrait ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    // back off along the same line until the whole rim fits, under a natural lens
    const around = (dist, up, r, y, mx, my, lookDown) => {
      for (let k = 0; k < 40; k++) {
        const pos = wc.clone().add(side.clone().multiplyScalar(dist * (1 + k * .06))).add(new THREE.Vector3(0, up * (1 + k * .06), 0));
        let best = null;   // aim so the wheel sits centred in the picture: try aim points along your line of sight
        for (let o = -4; o <= 22; o += 2) { const p = fit(pos, wc.clone().add(new THREE.Vector3(0, lookDown, 0)).add(side.clone().multiplyScalar(o)), rimPts(r, y, 24), mx, my); if (p && (!best || p.fov < best.fov)) best = p; }
        if (best && best.fov <= (portrait ? 58 : 46)) return best;
      }
      return pose(wc.clone().add(side.clone().multiplyScalar(dist * 3)).add(new THREE.Vector3(0, up * 3, 0)), wc, 40);
    };
    // on the phone the spin is watched from almost straight above, as the live studios film it; on the Mac from a high three-quarter
    // phone: from high above, the wheel near the top of the picture with the table running down below it (no empty room above)
    const overhead = (r, y, h) => {
      let best = null, f0 = null;
      for (let k = 0; k <= 90; k += 2) {
        const pos = wc.clone().add(new THREE.Vector3(k + 16, h, 0)), p = fit(pos, wc.clone().add(new THREE.Vector3(k, -4, 0)), rimPts(r, y, 24), 1, .95);
        if (!p) continue; f0 ??= p.fov;
        if (p.fov <= Math.min(76, f0 * 1.03)) best = p;   // the wheel as wide as the screen, aimed as far down as that allows: it sits at the top
      }
      return best ?? around(17, 96, r, y, 1, .93, -6);
    };
    // from the croupier's call to the drop: a low three-quarter view, locked off, as the live studios film the track (room
    // left above and below it for the recent numbers and the hint)
    // from the drop: straight down over the wheelhead, where the bounce and the pocket are clearest. An upright phone has
    // that view from the call on: from the side the wheel left a fifth of the tall picture to the room behind it, and
    // from above it fills the width with the ball at its largest.
    shots.push = portrait ? overhead(37, -6, 118) : around(10, 96, 37, -6, .92, .92, -6);
    shots.wheel = portrait ? null : around(96, 60, GEO.rimR + .2, 1, .92, .86, -4);
    for (const k of ['seat', 'wheel', 'push']) if (shots[k]) shots[k].name = k;
    shots.wheel ??= shots.push;
  }
  function cellPx(p) { camera.position.copy(p.pos); camera.quaternion.copy(p.quat); camera.fov = p.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const a = new THREE.Vector3(L.X(5), 0, L.Z(1.5)).project(camera), b = new THREE.Vector3(L.X(6), 0, L.Z(1.5)).project(camera), c = new THREE.Vector3(L.X(5.5), 0, L.Z(1)).project(camera), d = new THREE.Vector3(L.X(5.5), 0, L.Z(2)).project(camera);
    return Math.min(Math.hypot((a.x - b.x) * view.w, (a.y - b.y) * view.h), Math.hypot((c.x - d.x) * view.w, (c.y - d.y) * view.h)) / 2; }
  let current = null;
  function setPose(p) { camera.position.copy(p.pos); camera.quaternion.copy(p.quat); camera.fov = p.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); current = p; requestRender(false); }
  // a camera move: position, turn and lens together, eased
  let moveJob = 0;
  function move(to, ms = 1100, easing = t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2) {
    const id = ++moveJob, from = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov };
    if (ms <= 0) { setPose(to); return Promise.resolve(); }
    const t0 = performance.now();
    return new Promise(done => {
      const f = now => {
        if (id !== moveJob) { tickers.delete(f); done(); return; }
        const k = Math.min(1, (performance.now() - t0) / ms), e = easing(k);
        camera.position.lerpVectors(from.pos, to.pos, e); camera.quaternion.slerpQuaternions(from.quat, to.quat, e); camera.fov = from.fov + (to.fov - from.fov) * e; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        if (k >= 1) { tickers.delete(f); current = to; done(); }
      };
      f.still = true; tickers.add(f); requestRender(false);   // only the camera moves: the shadows stand
    });
  }
  // the canvas is w x h; the picture is framed for the part of it between `top` (the bar, the strip of numbers) and
  // `bottom` (the dock, which the canvas runs on under, blurred)
  let framedAs = null;
  function frame(w, h, top = 0, bottom = 0) {
    framedAs = [w, h, top, bottom]; st.size(w, h);
    const vh = Math.max(1, h - top - bottom); view.w = w; view.h = vh; view.top = top;
    camera.clearViewOffset(); camera.aspect = w / vh;
    const orient = w / vh < .9 ? 'port' : 'land';
    if (!L || L.orient !== orient) buildTable(orient);
    computeShots();
    view.h = h; if (top > 0 || bottom > 0) camera.setViewOffset(w, vh, 0, -top, w, h);
    if (show.on) placeShowcase(performance.now()); else if (current) setPose(shots[current.name] ?? shots.seat);
    requestRender();
  }

  // ---- the lobby's slow orbit round the wheel ----------------------------------------------------------------------------
  const show = { on: false };
  function placeShowcase(now) {
    if (!L) return;
    // a slow sway round the table from the players' side, looking toward the salon behind it
    const t = now / 1000, portrait = camera.aspect < .9, wc = wheelCentre(), cx = (L.wheelX - WELL + L.xEnd) / 2, a = Math.sin(t * .07) * .32 + Math.sin(t * .029) * .08;
    if (portrait) { const r = 370; camera.position.set(cx + Math.cos(a) * r, 300 + Math.sin(t * .11) * 5, wc.z + Math.sin(a) * r); camera.lookAt(cx - 22, -46, wc.z); camera.fov = 40; }
    else { const r = 300; camera.position.set(cx + Math.sin(a) * r, 185 + Math.sin(t * .11) * 5, wc.z + Math.cos(a) * r); camera.lookAt(cx + Math.sin(a) * 36, -30, wc.z - 14); camera.fov = 36; }
    camera.up.set(0, 1, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }
  // a slow drift: 30 frames a second, asked for by the orbit itself, and the camera alone moves
  let shown = 0;
  const showTick = now => { if (now - shown < 31) return; shown = now; placeShowcase(now); requestRender(false); };
  showTick.lazy = showTick.still = true;
  const showcase = {
    get on() { return show.on; },
    start(still = false) { show.on = true; moveJob++; if (still) placeShowcase(9000); else tickers.add(showTick); requestRender(false); },
    async stop(ms = 1300) { if (!show.on) return; tickers.delete(showTick); show.on = false; const s = { ...shots.seat, name: 'seat' }; await move(s, ms); setPose(s); },
  };

  // (drawn only when something changes, as at the blackjack table: see scene/stage.mjs for `still`, `lazy` and requestRender(false))
  const project = p => st.project(p.x, p.y, p.z);
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // the spot under a point on the screen (CSS pixels within the canvas)
  // the spot under a point of the picture: a bet's id on the layout, or on the printed racetrack 'race:17' (a number and
  // its neighbours) or 'call:tiers' (a section's call bet)
  function pick(x, y) {
    ray.setFromCamera({ x: x / view.w * 2 - 1, y: -(y / view.h) * 2 + 1 }, camera);
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3()); return p ? spotAt(p.x, p.z) ?? trackAt(p.x, p.z) : null;
  }
  // The printed racetrack read back: its number band gives the number in that cell, its inner band the section the
  // dividers part it into. Arc length round the stadium as pt() runs it in paintLayout: from the left apex, clockwise.
  function trackAt(x, z) {
    const T = L.track; if (!T?.per) return null;
    const left = T.cx - T.st / 2, right = T.cx + T.st / 2, ex = Math.max(left, Math.min(right, x)), rho = Math.hypot(x - ex, z - T.cz);
    if (rho > T.r) return null;
    if (rho >= T.r - T.bw) {
      const arc = Math.PI * T.r; let d;
      if (x < left) { const a = Math.atan2(z - T.cz, x - left); d = a < 0 ? (a + Math.PI) * T.r : arc / 2 + 2 * T.st + arc + (a - Math.PI / 2) * T.r; }
      else if (x > right) d = arc / 2 + T.st + (Math.atan2(z - T.cz, x - right) + Math.PI / 2) * T.r;
      else d = z < T.cz ? arc / 2 + (x - left) : arc / 2 + T.st + arc + (right - x);
      const N = WHEEL_ORDER.length; return `race:${WHEEL_ORDER[((Math.floor((d / T.per - T.at0) * N) % N) + N) % N]}`;
    }
    const xAt = ([ax, az, bx, bz]) => ax + (bx - ax) * (z - az) / (bz - az), side = ([ax, az, bx, bz], x, z) => Math.sign((bx - ax) * (z - az) - (bz - az) * (x - ax));
    const [vo, ot, zc] = T.lines;
    if (x > xAt(ot)) return 'call:tiers';
    if (x > xAt(vo)) return 'call:orphelins';
    return side(zc, x, z) === side(zc, left - T.r, T.cz) ? 'call:zero' : 'call:voisins';
  }
  // a preset applies at once: pixels and shadows (the stage), the cloth and the chips
  // The room the table stands in (DRESS): the light and the room round it changed, the cloth repainted, and the top, the
  // leather, the lower body and the plinth rebuilt. The studio's set is made the first time it is wanted (the room fetches
  // its picture first: preloadStudioArt).
  function setStudio(name) {
    const d = DRESS[name] ?? SALON; if (d === dress) return; dress = d;
    if (d.studio && !studioWall && ART.studio) { studioWall = salonWall(ART.studio, { radius: 420, eye: 90, floorY: FLOOR_Y, aniso, level: .62 }); scene.add(studioWall.mesh); }
    if (salon) salon.mesh.visible = !d.studio; if (studioWall) studioWall.mesh.visible = d.studio;
    floor.material = d.studio ? gloss : carpet;
    napTile.paint(); for (const m of [...feltMats.values(), ...clothMats.values()]) m.sheenColor?.set(d.sheen);
    leather.color.set(d.leather); keyW.color.set(d.key); keyL.color.set(d.key); hemi.color.set(d.fill); glow.color.set(d.glow);
    rim.color.set(d.accent ?? '#9cc8ff'); rim.intensity = d.studio ? 2600 : 0;
    if (board.studio !== d.studio) { table.remove(board.group); board.group.traverse(o => { o.geometry?.dispose(); if (o.material && o.material !== brass) o.material.dispose(); }); board.tex.dispose(); board = makeBoard(d.studio); }
    if (L) { buildTable(L.orient); if (framedAs) frame(...framedAs); }   // (the shots are worked out as frame works them: over the picture between the bar and the dock)
    setBoard();
    requestRender();
  }
  function setQuality(q) {
    const was = quality; quality = q; st.setQuality(q);
    const m = feltMaterial(q); if (m !== feltMat) { m.map = feltMat.map; feltMat.map = null; feltMat = felt.material = m; m.needsUpdate = true; }
    cloth.material = clothMaterial(q);
    if (q.felt !== was.felt && L) repaintLayout();
    setChipDetail(q.chipSegments); swapChipGeometry(scene); requestRender();
  }

  setStudio(dressing);   // the room asked for (a salon table changes nothing)
  return {
    THREE, renderer, scene, camera, wheel, table, tickers, requestRender, lights: { key: keyW, hemi, glow }, frame, project, pick, highlight, anchor, chipMesh, chipLook, chips, setMarkers, dolly, rake, chipsG, mood, setBoard,
    shots, move, setPose, showcase, relayout, setQuality, setStudio, get studio() { return Object.keys(DRESS).find(k => DRESS[k] === dress); }, fit: fitNow,
    get layout() { return L; }, get quality() { return quality; }, get pixelRatio() { return st.pixelRatio; },
    get view() { return view; }, get current() { return current; },
    wheelToWorld(p) { return new THREE.Vector3(p[0], p[1], p[2]).add(wheel.group.position); },
    pause: st.pause,
    get debug() { return st.debug; },
    GEO,
  };
}
export { QUALITY, CHIP_H, CHIP_R };
