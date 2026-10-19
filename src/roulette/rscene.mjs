// The roulette table as a scene, in centimetres. The wheel sits at the head of the table (-x); the
// betting layout runs from zero, next to the wheel, away along +x, with the dozens and even-money boxes
// on the players' side (+z). On a Mac you sit at the long side (+z) with the wheel on your left; on an
// upright phone you sit at the foot (+x), looking up the table at the wheel. The layout is painted for
// whichever seat you have, cells shaped for the screen, numbers facing you.
import * as THREE from '../vendor/three.module.min.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { artImage, CHIP_H, CHIP_R } from '../scene/textures.mjs';
import { chipGeometry, chipMaterials, QUALITY, detectQuality, setChipDetail } from '../scene/world.mjs';
import { SPOTS, colorOf, rowOf, colOf, REDS, WHEEL as WHEEL_ORDER } from './rules.mjs';
import { createWheel } from './wheel3d.mjs';
import { GEO } from './physics.mjs';

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
const ART = {};
export function preloadRouletteArt() {
  const load = (k, src) => new Promise(r => { const i = new Image(); i.onload = () => { ART[k] = i; r(); }; i.onerror = () => r(); i.src = src; });
  const fonts = document.fonts ? Promise.all(['700 80px "Barlow Condensed"', '700 80px Cinzel', '700 40px Inter'].map(f => document.fonts.load(f).catch(() => {}))) : Promise.resolve();
  return Promise.all([load('veneer', './assets/roulette/macassar.webp'), load('walnut', './assets/roulette/walnut.webp'), load('roomTall', './assets/roulette/room-tall.webp'), fonts]);
}

export function createRouletteScene(canvas, { quality = detectQuality() } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let ratioCap = quality.ratio; const ratio = () => Math.min(devicePixelRatio || 1, ratioCap);
  renderer.setPixelRatio(ratio()); setChipDetail(quality.chipSegments);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = quality.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  const maxTex = renderer.capabilities.maxTextureSize, aniso = renderer.capabilities.getMaxAnisotropy();
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0a09');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .5;
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 1400);

  // ---- light: one pendant over the wheel and one over the layout, a cool fill, warm room glow -------------
  const keyW = new THREE.SpotLight('#fff1dc', 5200, 0, .62, .8, 1.6); keyW.castShadow = true;
  keyW.shadow.mapSize.set(quality.shadow, quality.shadow); keyW.shadow.bias = -.0001; keyW.shadow.normalBias = .02; keyW.shadow.radius = 4; keyW.shadow.camera.near = 60; keyW.shadow.camera.far = 240;
  const keyL = new THREE.SpotLight('#fff0d8', 4200, 0, .72, .85, 1.6); keyL.castShadow = true;
  keyL.shadow.mapSize.set(quality.shadow, quality.shadow); keyL.shadow.bias = -.0001; keyL.shadow.normalBias = .02; keyL.shadow.radius = 5; keyL.shadow.camera.near = 60; keyL.shadow.camera.far = 240;
  const hemi = new THREE.HemisphereLight('#5b626e', '#0b0a09', .5);
  const glow = new THREE.PointLight('#ffb866', 900, 320, 1.6);
  scene.add(keyW, keyW.target, keyL, keyL.target, hemi, glow);

  // ---- the room: the drawn salon behind the head of the table, out of focus ------------------------------
  const roomImg = artImage('table:room');
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#c8c0b4' }));
  const texOf = img => { const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
  // the picture's edges melt into the dark room, so from any angle it reads as a far wall, never a hung poster
  const feather = (img, f = .24) => {
    const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.drawImage(img, 0, 0); g.globalCompositeOperation = 'destination-in';
    for (const [x1, y1] of [[w, 0], [0, h]]) {
      const lg = g.createLinearGradient(0, 0, x1, y1); lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(f, '#000'); lg.addColorStop(1 - f, '#000'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lg; g.fillRect(0, 0, w, h);
    }
    return c;
  };
  const roomTex = roomImg ? texOf(feather(roomImg)) : null, tallTex = ART.roomTall ? texOf(feather(ART.roomTall)) : null;
  backdrop.material.transparent = true; backdrop.material.depthWrite = false;
  scene.add(backdrop);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: '#0b0a09', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -80; scene.add(floor);

  // ---- the table ---------------------------------------------------------------------------------------------------
  const table = new THREE.Group(); scene.add(table);
  const woodTex = (img, rx, ry, rot = 0) => { if (!img) return null; const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.rotation = rot; t.anisotropy = aniso; t.needsUpdate = true; return t; };
  const walnut = new THREE.MeshPhysicalMaterial({ color: ART.veneer ? '#d9c2b0' : '#1c120c', map: woodTex(ART.veneer, 4, 1, Math.PI / 2), roughness: .4, clearcoat: .9, clearcoatRoughness: .1 });   // the table: Macassar ebony, its stripes along the length
  const leather = new THREE.MeshPhysicalMaterial({ color: '#141312', roughness: .58, clearcoat: .35, clearcoatRoughness: .45, sheen: .4, sheenColor: new THREE.Color('#3a3530') });
  const grain = artImage('table:leather'); if (grain) { const t = new THREE.Texture(grain); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 2); t.needsUpdate = true; leather.bumpMap = t; leather.bumpScale = 1.8; }
  const brass = new THREE.MeshStandardMaterial({ color: '#b98f45', metalness: 1, roughness: .28 });
  // the wheel's own studio light, for its reflections: a ring light overhead and two soft boxes in a dark room
  const studioEnv = (() => {
    const e = new THREE.Scene(); e.background = new THREE.Color('#030303');
    const lamp = c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c), side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.5, .22, 12, 96), lamp('#fff3e0').clone()); ring.material.color.multiplyScalar(3); ring.rotation.x = Math.PI / 2; ring.position.y = 4.2; e.add(ring);
    for (const [x, z, w] of [[-9, 3, 3], [8, -4, 2.6]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.1), lamp('#d8cfc2')); b.material.color.multiplyScalar(.9); b.position.set(x, 3.2, z); b.lookAt(0, 0, 0); e.add(b); }
    const warm = new THREE.Mesh(new THREE.PlaneGeometry(10, .6), lamp('#ff9f4a')); warm.material.color.multiplyScalar(.35); warm.position.set(0, .8, 9); warm.lookAt(0, 0, 0); e.add(warm);
    return pmrem.fromScene(e, .02).texture;
  })();
  const wheel = createWheel(THREE, { aniso, env: studioEnv, glow: '#ffb85a' }); table.add(wheel.group);   // black lacquer, a warm gold ring light
  const feltMat = new THREE.MeshStandardMaterial({ roughness: .96, metalness: 0 });
  const felt = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), feltMat); felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; table.add(felt);
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
    const xEnd = X(13), zFar = Z(3), zNear = Z(-2), wheelX = x0 - s.z0 - 5 - 45.6;
    // the cloth: the grid, felt round it, the racetrack printed on the croupier's side (-z), room at the foot for the players' chips
    return { orient, s, x0, zg, X, Z, U, V, xEnd, zFar, zNear, wheelX, rect: { x0: wheelX + 30, x1: xEnd + 34, z0: zFar - 40, z1: zNear + 15 } };
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
  const anchor = (id, slot = 0) => { const [u, v] = anchorUV(id), off = [[0, 0], [.95, -.7], [-.95, -.7], [.95, .7], [-.95, .7]][slot % 5]; return new THREE.Vector3(L.X(u) + off[0], 0, L.Z(v) + off[1]); };
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
  // The felt, painted like a printed casino cloth: classic green nap, fine cream lines, the numbers printed in red and black
  // (each with a thin cream keyline so it reads under low light), the French diamonds for red and black, and the racetrack
  // printed on the croupier's side. Text faces your seat.
  function paintLayout() {
    const R = L.rect, W = R.x1 - R.x0, D = R.z1 - R.z0, ppc = Math.min(24, Math.floor(Math.min(maxTex, 4096) / Math.max(W, D)));
    const c = document.createElement('canvas'); c.width = Math.round(W * ppc); c.height = Math.round(D * ppc); const g = c.getContext('2d');
    const px = x => (x - R.x0) * ppc, pz = z => (z - R.z0) * ppc;
    g.fillStyle = '#17533a'; g.fillRect(0, 0, c.width, c.height);
    const nap = artImage('table:felt'); if (nap) { g.globalAlpha = .5; g.globalCompositeOperation = 'overlay'; const t = 512; for (let y = 0; y < c.height; y += t) for (let x = 0; x < c.width; x += t) g.drawImage(nap, x, y, t, t); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    const vg = g.createRadialGradient(c.width * .5, c.height * .5, Math.min(c.width, c.height) * .3, c.width * .5, c.height * .5, Math.max(c.width, c.height) * .62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.28)'); g.fillStyle = vg; g.fillRect(0, 0, c.width, c.height);
    const s = L.s, portrait = L.orient === 'port', line = Math.max(2, .13 * ppc), CREAM = 'rgba(238,226,190,.92)';
    const INKC = { red: '#c3192b', black: '#111111', green: '#12924f' };
    const box = (u0, v0, u1, v1) => { const xa = px(L.X(u0)), xb = px(L.X(u1)), za = pz(L.Z(v0)), zb = pz(L.Z(v1)); return [Math.min(xa, xb), Math.min(za, zb), Math.abs(xb - xa), Math.abs(zb - za)]; };
    // print text at a point on the felt (cm), standing up for your seat: from the long side up is -z; from the foot, up is -x
    const print = (str, x, z, size, { color = CREAM, font = 'Cinzel', weight = 700, rot = 0, track = 0, key = 0 } = {}) => {
      g.save(); g.translate(px(x), pz(z)); g.rotate((portrait ? -Math.PI / 2 : 0) + rot);
      g.font = `${weight} ${size * ppc}px ${font}, "Bodoni Moda", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; if (track) g.letterSpacing = `${track * ppc}px`;
      if (key) { g.lineJoin = 'round'; g.lineWidth = key * ppc; g.strokeStyle = CREAM; g.strokeText(str, 0, size * ppc * .06); }
      g.fillStyle = color; g.fillText(str, 0, size * ppc * .06); g.restore();
    };
    const text = (str, u, v, size, o) => print(str, L.X(u), L.Z(v), size, o);
    g.lineWidth = line; g.strokeStyle = CREAM; g.lineJoin = 'round';
    // numbers
    const nSize = portrait ? s.cu * .58 : s.cu * .5;
    for (let n = 1; n <= 36; n++) {
      const [x, y, w, h] = box(rowOf(n) - 1, colOf(n) - 1, rowOf(n), colOf(n)); g.strokeRect(x, y, w, h);
      text(String(n), rowOf(n) - .5, colOf(n) - .5, nSize, { color: INKC[REDS.has(n) ? 'red' : 'black'], key: .16 });
    }
    // zero: a pointed box toward the wheel
    { const [x, y, w, h] = box(-1, 0, 0, 3), tip = w * .42;
      g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + tip, y); g.lineTo(x, y + h / 2); g.lineTo(x + tip, y + h); g.lineTo(x + w, y + h); g.closePath(); g.stroke();
      text('0', -.45, 1.5, nSize * 1.15, { color: INKC.green, key: .18 }); }
    // columns
    for (const k of [1, 2, 3]) { const [x, y, w, h] = box(12, k - 1, 13, k); g.strokeRect(x, y, w, h); text('2 to 1', 12.5, k - .5, portrait ? s.cc * .24 : s.cu * .2, { font: 'Inter', weight: 700, rot: portrait ? 0 : -Math.PI / 2 }); }
    // dozens and even money
    ['1st 12', '2nd 12', '3rd 12'].forEach((t, i) => { const [x, y, w, h] = box(i * 4, -1, i * 4 + 4, 0); g.strokeRect(x, y, w, h); text(t, i * 4 + 2, -.5, portrait ? s.d * .42 : s.d * .36, { rot: portrait ? Math.PI / 2 : 0 }); });
    ['1–18', 'EVEN', 'RED', 'BLACK', 'ODD', '19–36'].forEach((t, i) => {
      const [x, y, w, h] = box(i * 2, -2, i * 2 + 2, -1); g.strokeRect(x, y, w, h);
      if (t === 'RED' || t === 'BLACK') {   // the diamonds
        const cx = px(L.X(i * 2 + 1)), cy = pz(L.Z(-1.5)), a = (portrait ? s.e : s.cu * 1.35) * .5 * ppc * .62, b = (portrait ? s.cu * 1.35 : s.e) * .5 * ppc * .62;
        g.beginPath(); g.moveTo(cx - a, cy); g.lineTo(cx, cy - b); g.lineTo(cx + a, cy); g.lineTo(cx, cy + b); g.closePath();
        g.fillStyle = t === 'RED' ? INKC.red : INKC.black; g.fill(); g.lineWidth = line * .9; g.stroke(); g.lineWidth = line;
      } else text(t, i * 2 + 1, -1.5, portrait ? s.e * .3 : s.e * .3, { font: 'Inter', weight: 700, rot: portrait ? Math.PI / 2 : 0, track: .08 });
    });
    // a double gold rule round the grid
    g.strokeStyle = 'rgba(214,180,104,.9)'; g.lineWidth = line * 1.2;
    { const [x, y, w, h] = box(-1, -2, 13, 3), m = .9 * ppc; g.strokeRect(x - m, y - m, w + 2 * m, h + 2 * m); g.lineWidth = line * .6; g.strokeRect(x - 1.5 * m, y - 1.5 * m, w + 3 * m, h + 3 * m); }
    // the racetrack, printed on the croupier's side: the wheel's order round a stadium, its sectors named inside
    { const x0 = L.X(-1), x1 = L.xEnd, len = (x1 - x0) * .78, cxr = (x0 + x1) / 2, gapT = portrait ? 11 : 4, H = Math.min(26, L.zFar - R.z0 - 5 - gapT), czr = L.zFar - gapT - H / 2, bw = H * .27, r = H / 2, st = len - H;
      const pt = (t, rr) => {   // a point round the stadium at fraction t, starting at the left apex and running clockwise seen from above
        const per = 2 * st + 2 * Math.PI * r; let d = ((t % 1) + 1) % 1 * per; const arc = Math.PI * r;
        if (d < arc / 2) { const a = Math.PI + d / r; return [cxr - st / 2 + rr * Math.cos(a), czr + rr * Math.sin(a)]; } d -= arc / 2;
        if (d < st) return [cxr - st / 2 + d, czr - rr]; d -= st;
        if (d < arc) { const a = -Math.PI / 2 + d / r; return [cxr + st / 2 + rr * Math.cos(a), czr + rr * Math.sin(a)]; } d -= arc;
        if (d < st) return [cxr + st / 2 - d, czr + rr]; d -= st;
        const a = Math.PI / 2 + d / r; return [cxr - st / 2 + rr * Math.cos(a), czr + rr * Math.sin(a)];
      };
      const loop = rr => { g.beginPath(); for (let k = 0; k <= 240; k++) { const [x, z] = pt(k / 240, rr); k ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z)); } g.closePath(); g.stroke(); };
      g.strokeStyle = CREAM; g.lineWidth = line; loop(r); loop(r - bw);
      const N = WHEEL_ORDER.length, at0 = -.5 / N;
      for (let i = 0; i < N; i++) {
        const tb = at0 + i / N, [ax, az] = pt(tb, r), [bx, bz] = pt(tb, r - bw); g.beginPath(); g.moveTo(px(ax), pz(az)); g.lineTo(px(bx), pz(bz)); g.stroke();
        const n = WHEEL_ORDER[i], [mx, mz] = pt(tb + .5 / N, r - bw / 2); print(String(n), mx, mz, bw * .52, { color: INKC[colorOf(n)], key: .12, font: '"Barlow Condensed"', weight: 700 });
      }
      // the sector lines across the inside (Voisins | Orphelins | Tiers), and their names
      const edge = n => pt(at0 + WHEEL_ORDER.indexOf(n) / N, r - bw);
      const lines = [[17, 22], [27, 1]].map(([a, b]) => { const [ax, az] = edge(a), [bx, bz] = edge(b); g.beginPath(); g.moveTo(px(ax), pz(az)); g.lineTo(px(bx), pz(bz)); g.stroke(); return (ax + bx) / 2; });
      const lab = (t, x, k = .27) => print(t, x, czr, (H - 2 * bw) * k, { font: 'Cinzel', weight: 700, track: .06 });
      const left = cxr - st / 2, right = cxr + st / 2;
      lab('ZÉRO', left - r * .18, .2); lab('VOISINS', (left + r * .35 + lines[0]) / 2); lab('ORPHELINS', (lines[0] + lines[1]) / 2, .24); lab('TIERS', (lines[1] + right) / 2);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t;
  }
  function buildTable(orient) {
    L = geometry(orient); const R = L.rect;
    feltMat.map?.dispose(); feltMat.map = paintLayout(); feltMat.needsUpdate = true;
    felt.scale.set(R.x1 - R.x0, R.z1 - R.z0, 1); felt.position.set((R.x0 + R.x1) / 2, 0, (R.z0 + R.z1) / 2);
    wheel.group.position.set(L.wheelX, WHEEL_Y, (L.zFar + L.zNear) / 2);   // the bowl stands on the head of the table
    // body, after a TCS John Huxley table: a Macassar top with the wheel sunk in a well at the head, the croupier's
    // chip tray cut in beside it, a padded leather armrest round the players' side and the foot, a dark base
    body.clear();
    const cz = (L.zFar + L.zNear) / 2, wx = L.wheelX;
    const x0T = wx - 50, x1T = R.x1 + 24, z1T = R.z1 + 25, z0T = Math.min(R.z0 - 6, cz - 46 - 34);
    const tray = { x0: wx - 30, x1: wx + 26, z0: cz - 46 - 30, z1: cz - 46 - 7 };
    L.tray = new THREE.Vector3((tray.x0 + tray.x1) / 2, 0, (tray.z0 + tray.z1) / 2);
    // the top: rounded at the head and the foot, the well and the tray cut out
    const shape = new THREE.Shape(), rr = 22, P = (x, z) => new THREE.Vector2(x, -z);
    shape.moveTo(x0T + rr, -z0T); shape.lineTo(x1T - rr, -z0T); shape.absarc(x1T - rr, -(z0T + rr), rr, Math.PI / 2, 0, true);
    shape.lineTo(x1T, -(z1T - rr)); shape.absarc(x1T - rr, -(z1T - rr), rr, 0, -Math.PI / 2, true);
    shape.lineTo(x0T + rr * 1.6, -z1T); shape.absarc(x0T + rr * 1.6, -(z1T - rr * 1.6), rr * 1.6, -Math.PI / 2, -Math.PI, true);
    shape.lineTo(x0T, -(z0T + rr)); shape.absarc(x0T + rr, -(z0T + rr), rr, Math.PI, Math.PI / 2, true);
    const hole = new THREE.Path(); hole.absarc(wx, -cz, 46, 0, Math.PI * 2, true); shape.holes.push(hole);
    shape.holes.push(new THREE.Path([P(tray.x0, tray.z0), P(tray.x0, tray.z1), P(tray.x1, tray.z1), P(tray.x1, tray.z0)]));
    const topGeo = new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: true, bevelThickness: .8, bevelSize: .8, bevelSegments: 3, curveSegments: 64 }); topGeo.rotateX(-Math.PI / 2); topGeo.translate(0, -13.1, 0);
    const top = new THREE.Mesh(topGeo, walnut); top.receiveShadow = true; top.castShadow = true; body.add(top);
    const dark = new THREE.MeshStandardMaterial({ color: '#0b0908', roughness: .9, side: THREE.BackSide });
    const well = new THREE.Mesh(new THREE.CylinderGeometry(46, 46, 18, 96, 1, true), dark); well.position.set(wx, -9.3, cz); body.add(well);
    // the tray: a velvet-lined recess holding the float, chips lying on their sides in rows
    { const w = tray.x1 - tray.x0, d = tray.z1 - tray.z0, inner = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), new THREE.MeshStandardMaterial({ color: '#1a1512', roughness: 1, side: THREE.BackSide }));
      inner.position.set(L.tray.x, -3.2, L.tray.z); body.add(inner);
      for (const [a, b, len, along] of [[tray.x0, tray.z0, w, 'x'], [tray.x0, tray.z1, w, 'x'], [tray.x0, tray.z0, d, 'z'], [tray.x1, tray.z0, d, 'z']]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len + .8 : .8, .5, along === 'z' ? len + .8 : .8), brass);
        m.position.set(along === 'x' ? a + len / 2 : a, .05, along === 'z' ? b + len / 2 : b); body.add(m);
      }
      const rows = 10, gap = (w - 4) / rows, len = d - 3, cr = CHIP_R * .92;
      const colours = ['#ece6d6', '#b4202b', '#1e6a3c', '#17181b', '#5d2b7d', '#d29a34', '#ece6d6', '#b4202b', '#1e6a3c', '#17181b'];
      for (let i = 0; i < rows; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(cr, cr, len, 28, 1, false), floatMaterial(colours[i], len)); m.rotation.x = Math.PI / 2;
        m.position.set(tray.x0 + 2 + gap * (i + .5), -6.2 + cr, L.tray.z); m.receiveShadow = true; body.add(m);
      }
    }
    // a brass rule round the cloth
    const tx0 = wx + 47, trim = new THREE.Mesh(new THREE.BoxGeometry(R.x1 - tx0 + .6, .5, R.z1 - R.z0 + .6), brass); trim.position.set((tx0 + R.x1) / 2, -.3, felt.position.z); body.add(trim);
    // the armrest: a padded leather roll 22 cm wide, along the players' side, round the foot and a little way up the croupier's side
    { const half = 11, hgt = 9.5, rc = 18, prof = [];
      prof.push([-half, 0], [half, 0]);
      for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI / 2; prof.push([half - 4.6 + 4.6 * Math.cos(a), hgt - 4.6 + 4.6 * Math.sin(a)]); }
      for (let k = 0; k <= 8; k++) { const a = Math.PI / 2 + k / 8 * Math.PI / 2; prof.push([-half + 4.6 + 4.6 * Math.cos(a), hgt - 4.6 + 4.6 * Math.sin(a)]); }
      const sh = new THREE.Shape(prof.map(([o, y]) => new THREE.Vector2(o, y))), y0 = -.4;
      const zP = R.z1 + half, xF = R.x1 + half, zD = R.z0 - half;
      const straight = (len, along, x, z) => { const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false, curveSegments: 12 }); if (along === 'x') g.rotateY(Math.PI / 2); const m = new THREE.Mesh(g, leather); m.position.set(x, y0, z); m.castShadow = m.receiveShadow = true; body.add(m); };
      const corner = (cx, cz2, phi0) => { const g = new THREE.LatheGeometry(prof.concat([prof[0]]).map(([o, y]) => new THREE.Vector2(rc + o, y)), 24, phi0, Math.PI / 2); const m = new THREE.Mesh(g, leather); m.material = leather; m.position.set(cx, y0, cz2); m.castShadow = m.receiveShadow = true; body.add(m); };
      const xs = wx + 50;
      { const halfP = prof.filter(([o]) => o >= 0).sort((a, b) => a[1] - b[1] || b[0] - a[0]); const capG = new THREE.LatheGeometry([new THREE.Vector2(0, 0), ...halfP.map(([o, y]) => new THREE.Vector2(o, y)), new THREE.Vector2(0, hgt)], 20, Math.PI, Math.PI); const m = new THREE.Mesh(capG, leather); m.position.set(xs, y0, zP); m.castShadow = true; body.add(m); }   // the near end, rounded
      straight(xF - rc - xs, 'x', xs, zP);                       // along the players' side
      corner(xF - rc, zP - rc, 0);                                // round the near corner of the foot
      straight((zP - rc) - (zD + rc), 'z', xF, zD + rc);          // across the foot
      corner(xF - rc, zD + rc, Math.PI / 2);                      // round the far corner
      straight(xF - rc - (R.x1 - 34), 'x', R.x1 - 34, zD);         // a short way up the croupier's side
    }
    // the base: a dark plinth set back under the top, and a brass foot-rail on the players' side
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(x1T - x0T - 50, 66, z1T - z0T - 52), new THREE.MeshPhysicalMaterial({ color: '#0e0c0b', roughness: .5, clearcoat: .6, clearcoatRoughness: .3 }));
    plinth.position.set((x0T + x1T) / 2 + 4, -13.5 - 33, (z0T + z1T) / 2 - 4); body.add(plinth);
    const footRail = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, x1T - x0T - 70, 20), brass); footRail.rotation.z = Math.PI / 2; footRail.position.set((x0T + x1T) / 2 + 6, -64, z1T - 14); body.add(footRail);
    { const len = x1T - x0T - 70, cx = (x0T + x1T) / 2 + 6, legG = new THREE.CylinderGeometry(1.1, 1.4, 16, 12);      // standing on short brass posts, not floating
      for (const k of [-.46, 0, .46]) { const leg = new THREE.Mesh(legG, brass); leg.position.set(cx + k * len, -72, z1T - 14); body.add(leg); } }
    // lights follow the table
    keyW.position.set(L.wheelX + 6, 150, 20); keyW.target.position.set(L.wheelX, 0, (L.zFar + L.zNear) / 2);
    { const mid = (L.X(-1) + L.xEnd) / 2, cz2 = (L.zFar + L.zNear) / 2; keyL.position.set(mid, 175, cz2 + 26); keyL.target.position.set(mid, 0, cz2); }
    glow.position.set(L.wheelX - 120, 70, -40);
    // highlight tiles: one per number and per outside box
    hi.clear(); tiles.clear();
    const tile = (key, u0, v0, u1, v1) => {
      const w = Math.abs(L.X(u1) - L.X(u0)), d = Math.abs(L.Z(v1) - L.Z(v0)), m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.position.set((L.X(u0) + L.X(u1)) / 2, .06, (L.Z(v0) + L.Z(v1)) / 2); m.visible = false; hi.add(m); tiles.set(key, m);
    };
    for (let n = 1; n <= 36; n++) tile(n, rowOf(n) - 1, colOf(n) - 1, rowOf(n), colOf(n));
    tile(0, -1, 0, 0, 3);
    for (const k of [1, 2, 3]) tile(`col${k}`, 12, k - 1, 13, k);
    for (const k of [1, 2, 3]) tile(`doz${k}`, (k - 1) * 4, -1, k * 4, 0);
    ['low', 'even', 'red', 'black', 'odd', 'high'].forEach((id, i) => tile(id, i * 2, -2, i * 2 + 2, -1));
    placeBackdrop();
    for (const f of relayout) f();
    requestRender();
  }
  const tiles = new Map(), relayout = new Set();
  function placeBackdrop() {
    const tall = L.orient === 'port' && tallTex, t = tall ? tallTex : roomTex; if (!t) return;
    backdrop.material.map = t; backdrop.material.needsUpdate = true;
    const img = t.image, H = tall ? 600 : 420, W = H * img.width / img.height; backdrop.scale.set(W, H, 1);
    if (tall) { backdrop.position.set(L.wheelX - 190, -30 + H * .12, 0); backdrop.rotation.set(0, Math.PI / 2, 0); }     // behind the wheel, seen from the foot
    else { backdrop.position.set(L.xEnd * .2, -20 - H / 2 + .45 * H + 30, L.zFar - 170); backdrop.rotation.set(0, 0, 0); }
  }
  // Light up numbers or boxes: keys are numbers or outside ids; `level` 0-1.
  function highlight(keys, { level = .32, color = '#ffd98a' } = {}) {
    for (const [k, m] of tiles) { const on = keys.includes(k); m.visible = on; if (on) { m.material.opacity = level; m.material.color.set(color); } }
    requestRender();
  }

  // ---- chips and the dolly ------------------------------------------------------------------------------------------
  const wheelChipMats = new Map();
  function wheelChipMaterials(color) {
    if (wheelChipMats.has(color)) return wheelChipMats.get(color);
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 84, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 18; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.arc(128, 128, 116, a - .16, a + .16); g.stroke(); }
    const face = new THREE.CanvasTexture(c); face.colorSpace = THREE.SRGBColorSpace;
    const side = new THREE.MeshStandardMaterial({ color, roughness: .5 }), top = new THREE.MeshStandardMaterial({ map: face, roughness: .45 });
    const mats = [side, top, top]; wheelChipMats.set(color, mats); return mats;
  }
  const chipMesh = v => { const m = new THREE.Mesh(chipGeometry(), typeof v === 'number' ? chipMaterials(v) : wheelChipMaterials(v)); m.castShadow = m.receiveShadow = true; m.scale.setScalar(.92); chipsG.add(m); return m; };
  const dolly = new THREE.Group(); dolly.visible = false; table.add(dolly);
  { const glass = new THREE.MeshPhysicalMaterial({ color: '#f4f1ea', roughness: .05, metalness: 0, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 2.2, transparent: true, opacity: .42, depthWrite: false });   // no transmission: that would draw the whole room twice a frame
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, .5, 40), brass); base.position.y = .25;
    const body2 = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.2, 3.4, 40), glass); body2.position.y = 2.2;
    const capM = new THREE.Mesh(new THREE.SphereGeometry(.95, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), brass); capM.position.y = 3.9;
    for (const m of [base, body2, capM]) { m.castShadow = true; dolly.add(m); } }

  // ---- camera: shots and moves -----------------------------------------------------------------------------------------
  const view = { w: 1, h: 1, top: 0 }, v3 = new THREE.Vector3();
  const pose = (pos, look, fov) => { const m = new THREE.Matrix4().lookAt(pos, look, new THREE.Vector3(0, 1, 0)); return { pos: pos.clone(), quat: new THREE.Quaternion().setFromRotationMatrix(m), fov, look: look.clone() }; };
  // the narrowest lens from `pos` looking at `look` that keeps every point inside the picture
  function fit(pos, look, pts, mx = .94, my = .92) {
    const p = pose(pos, look, 40); camera.position.copy(p.pos); camera.quaternion.copy(p.quat); camera.updateMatrixWorld();
    const ok = fov => { camera.fov = fov; camera.updateProjectionMatrix(); return pts.every(q => { v3.copy(q).project(camera); return Math.abs(v3.x) < mx && Math.abs(v3.y) < my && v3.z < 1; }); };
    if (!ok(75)) return null; let lo = 12, hi2 = 75; while (hi2 - lo > .2) { const m = (lo + hi2) / 2; if (ok(m)) hi2 = m; else lo = m; }
    p.fov = hi2; return p;
  }
  const shots = {};
  const wheelCentre = () => wheel.group.position.clone();
  function layoutCorners() { return [[-1, 3], [-1, -2], [13, 3], [13, -2]].map(([u, v]) => new THREE.Vector3(L.X(u), 0, L.Z(v))); }
  const rimPts = (r = 46, y = 1.5, n = 16) => Array.from({ length: n }, (_, i) => wheelCentre().add(new THREE.Vector3(r * Math.cos(i / n * Math.PI * 2), y, r * Math.sin(i / n * Math.PI * 2))));
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
      // seated at the long side: a long lens from a good way back keeps the table from bending
      const must = [...layoutCorners(), ...rimPts(46, 1.5, 24).filter(p => p.x > L.wheelX + 22)], cx = (L.wheelX + 22 + L.xEnd) / 2;   // the layout first: the wheel may run off the picture's left edge
      for (let h = 100; h <= 380; h += 12) for (let d = 30; d <= 380; d += 12) {
        const pos = new THREE.Vector3(cx, h, L.zNear + d), look = new THREE.Vector3(cx, WHEEL_Y * .4, cz), p = fit(pos, look, must, .97, .93);
        if (!p) continue; const score = cellPx(p) - Math.max(0, p.fov - 26) * 1.6; if (!best || score > best.score) best = { ...p, score };
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
    // while the ball runs: a low three-quarter view, locked off, as the live studios film the track
    shots.wheel = portrait ? around(78, 74, 45.8, 1, 1, .9, -4) : around(96, 60, 45.8, 1, .92, .9, -4);
    // pushed in as the ball drops: the wheelhead fills the picture
    // from the drop: straight down over the wheelhead, where the bounce and the pocket are clearest
    shots.push = portrait ? overhead(37, -6, 118) : around(10, 96, 37, -6, .92, .92, -6);
    for (const k of ['seat', 'wheel', 'push']) shots[k].name = k;
  }
  const px2 = new THREE.Vector3();
  function cellPx(p) { camera.position.copy(p.pos); camera.quaternion.copy(p.quat); camera.fov = p.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const a = new THREE.Vector3(L.X(5), 0, L.Z(1.5)).project(camera), b = new THREE.Vector3(L.X(6), 0, L.Z(1.5)).project(camera), c = new THREE.Vector3(L.X(5.5), 0, L.Z(1)).project(camera), d = new THREE.Vector3(L.X(5.5), 0, L.Z(2)).project(camera);
    void px2; return Math.min(Math.hypot((a.x - b.x) * view.w, (a.y - b.y) * view.h), Math.hypot((c.x - d.x) * view.w, (c.y - d.y) * view.h)) / 2; }
  let current = null;
  function setPose(p) { camera.position.copy(p.pos); camera.quaternion.copy(p.quat); camera.fov = p.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); current = p; requestRender(); }
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
      tickers.add(f); requestRender();
    });
  }
  function frame(w, h, top = 0) {
    renderer.setPixelRatio(ratio()); renderer.setSize(w, h, false);
    const vh = Math.max(1, h - top); view.w = w; view.h = vh; view.top = top;
    camera.clearViewOffset(); camera.aspect = w / vh;
    const orient = w / vh < .9 ? 'port' : 'land';
    if (!L || L.orient !== orient) buildTable(orient);
    computeShots();
    view.h = h; if (top > 0) camera.setViewOffset(w, vh, 0, -top, w, h);
    if (show.on) placeShowcase(performance.now()); else if (current) setPose(shots[current.name] ?? shots.seat);
    requestRender();
  }

  // ---- the lobby's slow orbit round the wheel ----------------------------------------------------------------------------
  const show = { on: false };
  function placeShowcase(now) {
    if (!L) return;
    // a slow sway round the table from the players' side, looking toward the salon behind it
    const t = now / 1000, portrait = camera.aspect < .9, wc = wheelCentre(), cx = (L.wheelX - 46 + L.xEnd) / 2, a = Math.sin(t * .07) * .32 + Math.sin(t * .029) * .08;
    if (portrait) { const r = 370; camera.position.set(cx + Math.cos(a) * r, 300 + Math.sin(t * .11) * 5, wc.z + Math.sin(a) * r); camera.lookAt(cx - 22, -46, wc.z); camera.fov = 40; }
    else { const r = 300; camera.position.set(cx + Math.sin(a) * r, 185 + Math.sin(t * .11) * 5, wc.z + Math.cos(a) * r); camera.lookAt(cx + Math.sin(a) * 36, -30, wc.z - 14); camera.fov = 36; }
    camera.up.set(0, 1, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }
  const showTick = now => placeShowcase(now);
  const showcase = {
    get on() { return show.on; },
    start(still = false) { show.on = true; moveJob++; if (still) placeShowcase(9000); else tickers.add(showTick); requestRender(); },
    async stop(ms = 1300) { if (!show.on) return; tickers.delete(showTick); show.on = false; const s = { ...shots.seat, name: 'seat' }; await move(s, ms); setPose(s); },
  };

  // ---- render loop (drawn only when something changes) and the frame-time watcher ----------------------------
  let dirty = true, running = false; const tickers = new Set();
  function requestRender() { dirty = true; if (!running) { running = true; requestAnimationFrame(loop); } }
  let last = 0, late = 0, frames = 0, base = 1e9, good = 0;
  function watch(t) {
    if (!last || !tickers.size) { last = t; return; }
    const dt = t - last; last = t; if (dt > 250) return;
    frames++; base = Math.min(base * 1.002, dt); if (dt > base * 1.7) late++;
    if (frames < 90) return;
    const floorR = Math.max(1, quality.ratio - 1);
    if (late > 45 && ratioCap > floorR) { ratioCap = Math.max(floorR, ratioCap - .25); good = 0; resize(); }
    else if (late < 5 && ratioCap < quality.ratio && ++good >= 3) { ratioCap = Math.min(quality.ratio, ratioCap + .25); good = 0; resize(); }
    frames = late = 0;
  }
  const resize = () => { renderer.setPixelRatio(ratio()); renderer.setSize(view.w, view.h, false); requestRender(); };
  let paused = false;
  let loops = 0;
  function loop(t) {
    loops++; running = false; if (paused) return;
    watch(t); if (!tickers.size) last = 0;
    const active = tickers.size > 0;
    for (const f of tickers) { try { f(t); } catch (e) { tickers.delete(f); console.error('roulette ticker', e); } }   // one bad ticker must not stop the table
    if (dirty || active) { dirty = false; renderer.render(scene, camera); }
    if ((tickers.size || dirty) && !running) { running = true; requestAnimationFrame(loop); }
  }
  function project(p) { v3.copy(p).project(camera); return { x: (v3.x + 1) / 2 * view.w, y: (1 - v3.y) / 2 * view.h, behind: v3.z > 1 }; }
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // the spot under a point on the screen (CSS pixels within the canvas)
  function pick(x, y) {
    ray.setFromCamera({ x: x / view.w * 2 - 1, y: -(y / view.h) * 2 + 1 }, camera);
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3()); return p ? spotAt(p.x, p.z) : null;
  }
  function setQuality(q) { quality = q; ratioCap = q.ratio; resize(); for (const k of [keyW, keyL]) { k.shadow.mapSize.set(q.shadow, q.shadow); k.shadow.map?.dispose(); k.shadow.map = null; } renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; renderer.shadowMap.needsUpdate = true; requestRender(); }

  return {
    THREE, renderer, scene, camera, wheel, table, tickers, requestRender, frame, project, pick, highlight, anchor, chipMesh, dolly, chipsG,
    shots, move, setPose, showcase, relayout, setQuality,
    get layout() { return L; }, get quality() { return quality; }, get pixelRatio() { return renderer.getPixelRatio(); },
    get view() { return view; }, get current() { return current; },
    wheelToWorld(p) { return new THREE.Vector3(p[0], p[1], p[2]).add(wheel.group.position); },
    pause(on) { paused = on; if (!on) requestRender(); },
    get debug() { return { loops, running, paused, dirty, tickers: tickers.size }; },
    GEO,
  };
}
export { QUALITY, CHIP_H, CHIP_R };
