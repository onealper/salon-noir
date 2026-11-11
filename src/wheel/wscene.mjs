// The money wheel's room: an upright wheel of 55 segments on a brass stand, a leather flapper over its pegs, and a
// betting counter before it, in the card salon. Centimetres: the counter's cloth is y = 0, x runs across it and z
// toward you. The wheel only shows the turn it is given (`wheel.set(angle, flap)`: wheel/physics.mjs works the motion
// out), and the room (wheel/wgame.mjs) tells this scene what happened.
import * as THREE from '../vendor/three.module.min.js';
import { createStage, detectQuality, leatherMaterial, brassMaterial, fitFov, salonWall, carpetFloor, orbitPace } from '../scene/stage.mjs';
import { artImage, INK, CHIP_H, feltMark } from '../scene/textures.mjs';
import { createChip, chipToss, ease } from '../scene/pieces.mjs';
import { setChipDetail, swapChipGeometry } from '../scene/world.mjs';
import { breakDown } from '../core/chips.mjs';
import { SEGMENTS, COUNT, PITCH, NUMBERS, isMultiplier, valueOf } from './rules.mjs';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// The wheel: its middle over the cloth behind the counter, its radius, the z of its face. The pegs stand on the face
// near the rim; the flapper hangs from a pivot over the top one.
export const WHEEL = { y: 63, z: -58, R: 52, face: -55.48 };
const PEG_R = WHEEL.R * .955, FLAP = { y: WHEEL.y + PEG_R + 11.7, z: WHEEL.face + 1.9, len: 12.4 };
export const CLOTH = { w: 164, z0: -27, z1: 19 };
const FLOOR_Y = -95, TRAY = { x: 0, y: 1.1, z: -32.6 };
const BRASS = 'rgba(201,164,92,.95)';
// How each segment is painted, on the wheel and on its spot: the ground from the hub out to the rim, and the ink on it.
export const LOOK = {
  1: { in: '#cdc4b0', out: '#f0e9d9', ink: '#17130b' },
  2: { in: '#16161a', out: '#2b2b31', ink: '#ece4d2' },
  5: { in: '#560d16', out: '#93192a', ink: '#f6eedb' },
  10: { in: '#0a3326', out: '#135a43', ink: '#f6eedb' },
  20: { in: '#86672d', out: '#cdaa62', ink: '#17130b' },
  40: { in: '#b58530', out: '#f6e0a0', ink: '#17130b' },
  x: { in: '#040405', out: '#0e0e11', ink: '#e9cd8c' },
};
const lookOf = s => isMultiplier(s) ? LOOK.x : LOOK[s];

// Where the six spots lie on the cloth: one row on a wide screen, two rows of three on one held upright (a finger's
// size either way). In each, the number's medallion stands at the far half and the chips at the near one: yours in the
// middle, the other players' beside it.
export function layoutFor(orient) {
  const land = orient === 'land', spots = {};
  NUMBERS.forEach((n, i) => {
    const s = land ? { n, x: (i - 2.5) * 26.4, z: -3, w: 24, h: 27, r: 5.4 } : { n, x: (i % 3 - 1) * 38, z: i < 3 ? -15.2 : 7.2, w: 35, h: 20.5, r: 4.5 };
    spots[`n${n}`] = { ...s, chips: s.z + s.h * .19, mark: s.z - s.h * .21 };
  });
  return { orient, spots, half: land ? 2.5 * 26.4 + 12 : 38 + 17.5, near: land ? 10.5 : 17.45, far: land ? -16.5 : -25.45 };
}
const OTHERS_AT = [-4.6, 4.6, -9.2, 9.2];   // the other players' stacks beside yours on a spot: your two neighbours', then the two beyond them

// ---- what is painted ----------------------------------------------------------------------------------------------
// The wheel's face. A segment k lies between the angles k and k + 1 pitches, counted anticlockwise from the top as you
// look at the wheel (so turned clockwise by `angle`, the segment floor(angle / pitch) stands under the flapper). Its
// number reads upright there, its top to the rim.
function paintFace(px) {
  const c = canvas(px, px), g = c.getContext('2d'), m = px / 2, R = m * .998, r0 = R * .335, r1 = R * .925;
  const dir = a => [-Math.sin(a), -Math.cos(a)], th = a => -Math.PI / 2 - a;   // a point at the angle a; that angle as the canvas counts it
  g.fillStyle = '#08080a'; g.fillRect(0, 0, px, px);
  SEGMENTS.forEach((s, k) => {
    const a0 = k * PITCH, a1 = a0 + PITCH, am = a0 + PITCH / 2, look = lookOf(s), mult = isMultiplier(s);
    const wedge = (ra, rb) => { g.beginPath(); g.arc(m, m, rb, th(a0), th(a1), true); g.arc(m, m, ra, th(a1), th(a0), false); g.closePath(); };
    const grad = g.createRadialGradient(m, m, r0, m, m, r1); grad.addColorStop(0, look.in); grad.addColorStop(1, look.out);
    wedge(r0, r1); g.fillStyle = grad; g.fill();
    if (mult || s === '40') {   // rays out of the hub: gold on the multipliers' black, a shade darker on the forty's gold
      g.save(); wedge(r0, r1); g.clip(); g.strokeStyle = mult ? 'rgba(226,196,131,.3)' : 'rgba(120,84,22,.3)'; g.lineWidth = px * .0016;
      for (let i = 1; i < 6; i++) { const a = a0 + PITCH * i / 6, [dx, dy] = dir(a); g.beginPath(); g.moveTo(m + dx * r0, m + dy * r0); g.lineTo(m + dx * r1, m + dy * r1); g.stroke(); }
      g.restore();
    }
    // the number, near the rim
    const [dx, dy] = dir(am), rt = R * .8, text = mult ? `×${valueOf(s)}` : s;
    g.save(); g.translate(m + dx * rt, m + dy * rt); g.rotate(-am);
    g.fillStyle = look.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${R * (text.length > 1 ? .079 : .094)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    g.fillText(text, 0, R * .004);
    // and a small diamond under it, toward the hub
    g.globalAlpha = .55; g.beginPath(); const d = R * .011, y = R * .098; g.moveTo(0, y - d * 1.5); g.lineTo(d, y); g.lineTo(0, y + d * 1.5); g.lineTo(-d, y); g.closePath(); g.fill();
    g.restore();
  });
  // the brass between the segments (under each peg), and the rings
  g.strokeStyle = BRASS; g.lineWidth = px * .0026;
  for (let k = 0; k < COUNT; k++) { const [dx, dy] = dir(k * PITCH); g.beginPath(); g.moveTo(m + dx * r0, m + dy * r0); g.lineTo(m + dx * r1, m + dy * r1); g.stroke(); }
  const ring = (r, w, col = BRASS) => { g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.strokeStyle = col; g.lineWidth = w; g.stroke(); };
  ring(r1, px * .006); ring(r0, px * .0055); ring(R * .995, px * .004, 'rgba(201,164,92,.7)');
  // the middle: black lacquer with fine rays, a brass line round the hub
  const mid = g.createRadialGradient(m, m, 0, m, m, r0); mid.addColorStop(0, '#17171a'); mid.addColorStop(1, '#070708');
  g.beginPath(); g.arc(m, m, r0 - px * .003, 0, Math.PI * 2); g.fillStyle = mid; g.fill();
  g.strokeStyle = 'rgba(201,164,92,.2)'; g.lineWidth = px * .0012;
  for (let i = 0; i < COUNT * 2; i++) { const [dx, dy] = dir(i * PITCH / 2); g.beginPath(); g.moveTo(m + dx * R * .16, m + dy * R * .16); g.lineTo(m + dx * (r0 - px * .006), m + dy * (r0 - px * .006)); g.stroke(); }
  ring(R * .29, px * .0022, 'rgba(201,164,92,.6)'); ring(R * .16, px * .003);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// the hub's cap: black enamel in a brass ring, the salon's mark on it
function paintCap(px = 256) {
  const c = canvas(px, px), g = c.getContext('2d'), m = px / 2;
  const e = g.createRadialGradient(m, m * .8, px * .05, m, m, m); e.addColorStop(0, '#26262b'); e.addColorStop(1, '#0a0a0c');
  g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.fillStyle = e; g.fill();
  g.beginPath(); g.arc(m, m, m * .93, 0, Math.PI * 2); g.strokeStyle = BRASS; g.lineWidth = px * .03; g.stroke();
  feltMark(g, m - px * .27, m - px * .28, px * .54);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// The counter's cloth: the salon's baize with the six spots printed on it (`into`: a cloth painted before, at this
// size, painted again in place).
function paintCloth(L, px, into = null) {
  const W = px, H = Math.round(px * (CLOTH.z1 - CLOTH.z0) / CLOTH.w), k = W / CLOTH.w, c = into?.image?.width === W ? into.image : canvas(W, H), g = c.getContext('2d');
  const X = x => (x + CLOTH.w / 2) * k, Z = z => (z - CLOTH.z0) * k;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.letterSpacing = '0px';
  g.fillStyle = INK.felt; g.fillRect(0, 0, W, H);
  const nap = artImage('table:felt'); if (nap) { const t = 32 * k; for (let y = 0; y < H; y += t) for (let x = 0; x < W; x += t) g.drawImage(nap, x, y, t, t); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const s of Object.values(L.spots)) {
    const look = LOOK[s.n], x = X(s.x - s.w / 2), y = Z(s.z - s.h / 2), w = s.w * k, h = s.h * k, i = .55 * k;
    g.beginPath(); g.roundRect(x, y, w, h, 2.2 * k); g.fillStyle = 'rgba(12,12,13,.24)'; g.fill(); g.strokeStyle = BRASS; g.lineWidth = .18 * k; g.stroke();
    g.beginPath(); g.roundRect(x + i, y + i, w - 2 * i, h - 2 * i, 1.7 * k); g.strokeStyle = 'rgba(201,164,92,.55)'; g.lineWidth = .07 * k; g.stroke();
    // the number as the wheel shows it: its colour, in a brass ring
    const mx = X(s.x), my = Z(s.mark), r = s.r * k, grad = g.createRadialGradient(mx, my - r * .35, r * .1, mx, my, r); grad.addColorStop(0, look.out); grad.addColorStop(1, look.in);
    g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.fillStyle = grad; g.fill(); g.strokeStyle = BRASS; g.lineWidth = .3 * k; g.stroke();
    g.beginPath(); g.arc(mx, my, r * .85, 0, Math.PI * 2); g.strokeStyle = look.ink === '#17130b' ? 'rgba(23,19,11,.34)' : 'rgba(236,228,210,.3)'; g.lineWidth = .08 * k; g.stroke();
    g.fillStyle = look.ink; g.font = `800 ${s.r * 1.14 * k}px "Barlow Condensed", "Arial Narrow", sans-serif`; g.fillText(String(s.n), mx, my + s.r * .07 * k);
    // what it pays, along its near edge
    g.font = `700 ${1.4 * k}px Inter, system-ui, sans-serif`; g.letterSpacing = `${.34 * k}px`; g.fillStyle = 'rgba(236,228,210,.74)';
    g.fillText(`PAYS ${s.n} TO 1`, mx + .17 * k, Z(s.z + s.h / 2 - 2.05)); g.letterSpacing = '0px';
  }
  if (L.orient === 'land') {   // (upright, the two rows take the cloth's whole depth)
    g.font = `700 ${1.62 * k}px Cinzel, Georgia, serif`; g.letterSpacing = `${.42 * k}px`; g.fillStyle = BRASS;
    g.fillText('A MULTIPLIER KEEPS EVERY BET · SPINS AGAIN · MULTIPLIES THE WIN', X(0), Z(-21.6)); g.letterSpacing = '0px';
  }
  if (into?.image === c) { into.needsUpdate = true; return into; }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; return t;
}

// ---- the chips on the cloth -----------------------------------------------------------------------------------------
// Your stack on a spot is 'n10'; another player's, 'o2n10' (the third of the others). Chips are tossed from their
// owner's side of the counter, the losing ones drawn to the tray below the wheel, the winners paid from it.
const PER = 20, CHIPS = [1000, 500, 100, 50, 25, 10, 5, 1], T = { toss: 440, lift: 300, move: 460, pay: 500, home: 560 };
export class WheelChips {
  constructor(S, motion, audio) { Object.assign(this, { S, motion, audio }); this.stacks = new Map(); }
  base(key) { const m = /^(?:o(\d))?(n\d+)$/.exec(key), s = this.S.layout.spots[m[2]]; return { x: s.x + (m[1] == null ? 0 : OTHERS_AT[+m[1]] ?? 0), z: s.chips }; }
  home(key, y = 9, back = 0) { const m = /^o(\d)/.exec(key); return m ? V([-96, 96, -118, 118][+m[1]] ?? 0, y, 50 + back) : V(this.base(key).x * .5, y, 62 + back); }
  of(key) { if (!this.stacks.has(key)) this.stacks.set(key, []); return this.stacks.get(key); }
  slot(key, i) {
    const b = this.base(key), col = Math.floor(i / PER), row = i % PER, dz = col ? (col % 2 ? 1 : -1) * Math.ceil(col / 2) * -4.05 : 0;   // a second column stands behind the first
    return V(b.x + ((i * 7.31) % 1 - .5) * .09, CHIP_H / 2 + .03 + row * (CHIP_H + .004), b.z + dz + ((i * 3.7) % 1 - .5) * .09);
  }
  add(key, value) {
    const chips = this.of(key), c = createChip(value), to = this.slot(key, chips.length), start = this.home(key).add(V((Math.random() - .5) * 3, 0, 0));
    this.S.table.add(c); chips.push(c);
    const onStack = chips.length > 1, toss = chipToss(c, start, to, { onLand: () => this.audio?.play(onStack ? 'stack' : 'chip', { x: to.x }) });
    const flight = this.motion.tween(T.toss, toss).then(() => { toss.finish(); c.userData.flight = null; });
    c.userData.flight = flight; return flight;
  }
  async amount(key, amount) { const vals = breakDown(amount, CHIPS); for (const [i, v] of vals.entries()) { const p = this.add(key, v); if (i === vals.length - 1) await p; else await this.motion.wait(60); } }
  async removeTop(key) {
    const c = this.of(key).pop(); if (!c) return; if (c.userData.flight) await c.userData.flight;
    const from = c.position.clone(), to = this.home(key, 20, 26);
    await this.motion.tween(T.lift, t => c.position.lerpVectors(from, to, t), ease.in); this.S.table.remove(c);
  }
  // a stack made to show exactly these chips (bottom first): those there stay, the rest drop in or lift away
  async sync(key, values) {
    const chips = this.of(key); let keep = 0;
    while (keep < chips.length && keep < values.length && chips[keep].userData.value === values[keep]) keep++;
    const jobs = []; while (chips.length > keep) jobs.push(this.removeTop(key));
    await Promise.all(jobs);
    for (let i = keep; i < values.length; i++) { const p = this.add(key, values[i]); if (i === values.length - 1) await p; else await this.motion.wait(55); }
  }
  // losing chips drawn off the cloth into the tray, top chip first
  async sweep(key) {
    const chips = this.of(key); if (!chips.length) return; this.stacks.set(key, []);
    const b = this.base(key), tray = V(TRAY.x + b.x * .3, TRAY.y + .6, TRAY.z + 1.5);
    await Promise.all(chips.map((c, i) => { const from = c.position.clone(), to = tray.clone().add(V(0, i * CHIP_H, 0));
      return this.motion.wait((chips.length - 1 - i) * 18).then(() => this.motion.tween(T.move, t => { c.position.lerpVectors(from, to, t); c.position.y += Math.sin(Math.PI * t) * 1.4; }, ease.inOut)); }));
    for (const c of chips) this.S.table.remove(c); this.S.requestRender();
  }
  // winnings from the tray, in a low arc onto the bet itself
  async pay(key, amount) {
    const vals = breakDown(amount, CHIPS), b = this.base(key), from = V(TRAY.x + b.x * .25, TRAY.y + 2, TRAY.z + 1.5);
    for (const [i, v] of vals.entries()) {
      const chips = this.of(key), c = createChip(v), to = this.slot(key, chips.length);
      c.rotation.y = Math.random() * Math.PI * 2; c.position.copy(from); this.S.table.add(c); chips.push(c);
      const p = this.motion.tween(T.pay, t => { const e = ease.inOut(t); c.position.lerpVectors(from, to, e); c.position.y += Math.sin(Math.PI * e) * 4; }).then(() => { c.position.copy(to); if (i === 0) this.audio?.play('payout', { x: to.x }); });
      if (i === vals.length - 1) await p; else await this.motion.wait(70);
    }
  }
  // at the round's end every stack slides back to its owner, each as one piece
  async toHome() {
    const entries = [...this.stacks.entries()].filter(([, a]) => a.length); this.stacks.clear(); if (!entries.length) return; this.audio?.play('collect', { gain: .8 });
    await Promise.all(entries.map(([key, chips], k) => {
      const from = chips.map(c => c.position.clone()), to = this.home(key, 10, 22), dest = from.map(f => to.clone().add(f).sub(from[0]));
      return this.motion.wait(k * 40).then(() => this.motion.tween(T.home, t => chips.forEach((c, i) => c.position.lerpVectors(from[i], dest[i], t)), ease.in));
    }));
    for (const [, chips] of entries) for (const c of chips) this.S.table.remove(c);
    this.S.requestRender();
  }
  // (the layout was laid out anew, a phone turned: every chip to its place in it)
  relay() { for (const [key, chips] of this.stacks) chips.forEach((c, i) => { if (!c.userData.flight) c.position.copy(this.slot(key, i)); }); }
  clear() { for (const c of [...this.stacks.values()].flat()) this.S.table.remove(c); this.stacks.clear(); this.S.requestRender(); }
}

// ---- the room -----------------------------------------------------------------------------------------------------
export function createWheelScene(canvasEl, { quality = detectQuality() } = {}) {
  const st = createStage(canvasEl, { quality, background: '#0b0a09', environment: .4, fov: 40, far: 1500, lights: () => [keyC] });
  const { renderer, scene, camera, view, tickers, requestRender, aniso } = st;
  camera.near = 8; camera.updateProjectionMatrix();   // (nothing comes nearer: the depth buffer's steps are that much finer over the cloth)
  setChipDetail(quality.chipSegments);
  const brass = brassMaterial(), leather = leatherMaterial();
  const lacquer = new THREE.MeshPhysicalMaterial({ color: '#0c0c0e', roughness: .34, clearcoat: .85, clearcoatRoughness: .2 });
  const mesh = (geo, mat, x = 0, y = 0, z = 0, into = null) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (into ?? table).add(m); return m; };

  // ---- light: a spot on the wheel, a pendant over the cloth (the only one that casts shadows: the chips'), a fill,
  // and a lamp by the flapper that is dark until a number is read (always there: a light shown or hidden would have
  // every shader built again)
  const keyW = new THREE.SpotLight('#fff0d8', 5600, 0, .4, .75, 1.5); keyW.position.set(46, 196, 150); keyW.target.position.set(0, WHEEL.y, WHEEL.z);
  const keyC = new THREE.SpotLight('#fff0d8', 3600, 0, .66, .8, 1.6); keyC.position.set(-22, 150, 40); keyC.target.position.set(0, 0, -4); keyC.castShadow = true;
  keyC.shadow.mapSize.set(quality.shadow, quality.shadow); keyC.shadow.bias = -.0001; keyC.shadow.normalBias = .02; keyC.shadow.radius = 5; keyC.shadow.camera.near = 60; keyC.shadow.camera.far = 260;
  const hemi = new THREE.HemisphereLight('#5b626e', '#0b0a09', .34);
  const warm = new THREE.PointLight('#ffb866', 800, 320, 1.6); warm.position.set(0, 30, 110);
  const read = new THREE.PointLight('#ffd58a', 0, 150, 1.4); read.position.set(0, WHEEL.y + WHEEL.R - 6, WHEEL.face + 26);
  scene.add(keyW, keyW.target, keyC, keyC.target, hemi, warm, read);
  const LIT = { w: keyW.intensity, c: keyC.intensity, h: hemi.intensity };

  // ---- the salon round it, and its carpet ----------------------------------------------------------------------------
  const salon = artImage('table:salon') ? salonWall(artImage('table:salon'), { radius: 420, eye: 84, floorY: FLOOR_Y, aniso, level: .5 }) : null;
  if (salon) { salon.place(0, 205, 0, -1); scene.add(salon.mesh); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: '#0b0a09', roughness: 1 }));
  if (artImage('table:carpet')) carpetFloor(floor, artImage('table:carpet'), { aniso });
  floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; floor.receiveShadow = true; scene.add(floor);

  // ---- the furniture: one group, which the lobby's portal takes down through the floor --------------------------------
  const table = new THREE.Group(); scene.add(table);
  // the counter: a lacquered top with a ledge at the back for the tray, the cloth inside a brass line, a padded
  // armrest along your side, an apron with two lines of warm light, a plinth
  const depth = CLOTH.z1 - CLOTH.z0, zc = (CLOTH.z0 + CLOTH.z1) / 2;
  mesh(new THREE.BoxGeometry(CLOTH.w + 8, 3.4, depth + 15), lacquer, 0, -1.86, zc - 4.2).receiveShadow = true;
  const lip = mesh(new THREE.BoxGeometry(CLOTH.w + 1.3, .12, depth + 1.3), brass, 0, -.09, zc);
  let L = null;
  const cloth = mesh(new THREE.PlaneGeometry(CLOTH.w, depth), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .96 }), 0, 0, zc); cloth.rotation.x = -Math.PI / 2; cloth.receiveShadow = true;
  const arm = mesh(new THREE.CapsuleGeometry(3.4, CLOTH.w + 1, 10, 28), leather, 0, .5, CLOTH.z1 + 4.4); arm.rotation.z = Math.PI / 2; arm.castShadow = arm.receiveShadow = true;
  mesh(new THREE.BoxGeometry(CLOTH.w - 4, 64, depth - 2), lacquer, 0, -35.4, zc - 3);
  const line = new THREE.MeshBasicMaterial({ color: '#ffb866', toneMapped: false });
  for (const y of [-11, -55]) mesh(new THREE.BoxGeometry(CLOTH.w - 12, .45, .3), line, 0, y, zc - 3 + (depth - 2) / 2 + .1);
  mesh(new THREE.BoxGeometry(CLOTH.w + 4, 6.4, depth + 8), lacquer, 0, FLOOR_Y + 3.2, zc - 3);
  mesh(new THREE.BoxGeometry(CLOTH.w + 4.6, .8, depth + 8.6), brass, 0, FLOOR_Y + 6.8, zc - 3);
  // (the light the lines and the plinth throw on the carpet: painted, a pool round the foot)
  const pool = (() => {
    const c = canvas(128, 128), g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 8, 64, 64, 64); r.addColorStop(0, 'rgba(255,184,102,.5)'); r.addColorStop(.5, 'rgba(255,184,102,.16)'); r.addColorStop(1, 'rgba(255,184,102,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(430, 250), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: .5 }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, FLOOR_Y + .3, zc + 6); m.renderOrder = 1; table.add(m); return m;
  })();
  // the tray on the ledge: black, brass-lipped, a short stack of each chip in it
  mesh(new THREE.BoxGeometry(62, 1.1, 8.4), brass, TRAY.x, .45, TRAY.z);
  mesh(new THREE.BoxGeometry(60.6, 1.2, 7), new THREE.MeshStandardMaterial({ color: '#070708', roughness: .8 }), TRAY.x, .5, TRAY.z);
  [500, 100, 100, 50, 25, 25, 10, 5, 5, 1, 1].forEach((v, i) => { for (let j = 0; j < 4; j++) { const c = createChip(v); c.position.set(TRAY.x + (i - 5) * 5.3, TRAY.y + .25 + j * (CHIP_H + .004), TRAY.z); c.rotation.y = i * 1.7 + j * .9; c.castShadow = false; table.add(c); } });

  // the stand: a lacquered column on a brass-edged foot behind the wheel, the axle to its hub, and an arm over the top
  // that carries the flapper
  const zs = WHEEL.z - 12, top = FLAP.y + 2.6;
  mesh(new THREE.CylinderGeometry(4.6, 5.6, top - FLOOR_Y, 40), lacquer, 0, (top + FLOOR_Y) / 2, zs);
  mesh(new THREE.CylinderGeometry(27, 30, 5, 64), lacquer, 0, FLOOR_Y + 2.5, zs); mesh(new THREE.CylinderGeometry(27.3, 27.3, .7, 64), brass, 0, FLOOR_Y + 5.3, zs);
  for (const y of [FLOOR_Y + 22, WHEEL.y - 9, WHEEL.y + 9, top - 3]) mesh(new THREE.CylinderGeometry(5.9, 5.9, 1.3, 40), brass, 0, y, zs);
  const axle = mesh(new THREE.CylinderGeometry(2.4, 2.4, 13, 24), brass, 0, WHEEL.y, WHEEL.z - 6); axle.rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(2.6, 2.6, FLAP.z - zs + 2.2), brass, 0, FLAP.y + 1.2, (FLAP.z + zs) / 2 + 1.1);
  const pin = mesh(new THREE.CylinderGeometry(1.05, 1.05, 2.6, 20), brass, 0, FLAP.y, FLAP.z); pin.rotation.x = Math.PI / 2;

  // ---- the wheel -----------------------------------------------------------------------------------------------------
  const wheel = (() => {
    const R = WHEEL.R, group = new THREE.Group(), disc = new THREE.Group(); group.position.set(0, WHEEL.y, WHEEL.z); group.add(disc); table.add(group);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 5, 128).rotateX(Math.PI / 2), lacquer); disc.add(body);
    const faceMat = new THREE.MeshPhysicalMaterial({ map: paintFace(quality.felt >= 4096 ? 2048 : 1024), roughness: .4, clearcoat: .55, clearcoatRoughness: .22 }); faceMat.map.anisotropy = aniso;
    const face = new THREE.Mesh(new THREE.CircleGeometry(R * .998, 160), faceMat); face.position.z = 2.52; disc.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 1.5, 18, 160), brass); rim.position.z = 1.3; disc.add(rim);
    const pegs = new THREE.InstancedMesh(new THREE.CylinderGeometry(.56, .56, 3.5, 16).rotateX(Math.PI / 2), brass, COUNT), M = new THREE.Matrix4();
    for (let k = 0; k < COUNT; k++) { const a = k * PITCH; M.makeTranslation(-Math.sin(a) * PEG_R, Math.cos(a) * PEG_R, 2.5 + 1.75); pegs.setMatrixAt(k, M); }
    disc.add(pegs);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 7.6, 3.2, 56).rotateX(Math.PI / 2), brass); hub.position.z = 4.1; disc.add(hub);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(6, 56), new THREE.MeshStandardMaterial({ map: paintCap(), roughness: .35, metalness: .2 })); cap.position.z = 5.72; disc.add(cap);
    // the segment read, lit: a wedge of light laid on it (it turns with the wheel, so it stays on its segment)
    const lit = new THREE.Mesh(new THREE.RingGeometry(R * .335, R * .925, 10, 1, Math.PI / 2 - PITCH / 2, PITCH), new THREE.MeshBasicMaterial({ color: '#ffe2a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    lit.position.z = 2.56; lit.visible = false; disc.add(lit);
    // the flapper: a tongue of leather hanging from its pin over the top peg
    const flap = new THREE.Group(); flap.position.set(0, FLAP.y, FLAP.z); table.add(flap);
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(2.3, FLAP.len, .5), new THREE.MeshStandardMaterial({ color: '#23160d', roughness: .78 })); tongue.position.y = -FLAP.len / 2; flap.add(tongue);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, .52, 24).rotateX(Math.PI / 2), tongue.material); tip.position.y = -FLAP.len; flap.add(tip);   // (its end rounded)
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, .9), brass); clamp.position.y = -.4; flap.add(clamp);
    let angle = 0;
    return {
      group, disc, flap, get angle() { return angle; },
      // turned clockwise by `angle` (radians); the flapper pushed aside by a peg `bend` radians of the wheel's turn past its line
      set(a, bend = 0) { angle = a; disc.rotation.z = -a; flap.rotation.z = Math.atan2(bend * PEG_R * 1.2, FLAP.len); requestRender(false); },
      // the segment k lit to `v` (0 to 1), the lamp by the flapper with it
      glow(k, v) { lit.rotation.z = (k + .5) * PITCH; lit.material.opacity = v * .17; lit.visible = v > .004; read.intensity = v * 460; requestRender(false); },   // (lit, not washed out: its number stays the thing read)
    };
  })();

  // The light follows the spin: the cloth's pendant and the room dim, the wheel's spot comes up. Eased by a still ticker.
  let moodJob = null;
  function mood(on, ms = 900) {
    const from = { w: keyW.intensity, c: keyC.intensity, h: hemi.intensity, s: salon?.mesh.material.color.r ?? 0 }, to = on ? { w: LIT.w * 1.12, c: LIT.c * .62, h: LIT.h * .7, s: (salon?.level ?? 0) * .62 } : { ...LIT, s: salon?.level ?? 0 };
    if (moodJob) tickers.delete(moodJob);
    const t0 = performance.now();
    moodJob = now => {
      const k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1, e = k * k * (3 - 2 * k);
      keyW.intensity = from.w + (to.w - from.w) * e; keyC.intensity = from.c + (to.c - from.c) * e; hemi.intensity = from.h + (to.h - from.h) * e;
      salon?.mesh.material.color.setScalar(from.s + (to.s - from.s) * e);
      if (k >= 1) { tickers.delete(moodJob); moodJob = null; }
    };
    moodJob.still = true; tickers.add(moodJob); requestRender(false);
  }

  // ---- the camera ----------------------------------------------------------------------------------------------------
  // Three views, fitted to the picture: your place at the counter (the whole wheel over the six spots), the wheel
  // alone while it turns, and its top under the flapper for the last pegs. Each is the nearest that holds what it must.
  const scratch = V(), shots = {}; let current = 'seat', moveJob = 0;
  // The camera at `eye`, its lens opened just enough for what it must hold: looking down the middle of it, or (with
  // `low`) so that this point stands at the picture's foot, where the width is what limits the lens and the room to
  // spare is better given to what stands above.
  function aim(eye, pts, { head = .93, foot = -.93, side = .95, low = null } = {}) {
    const pitch = p => Math.atan2(eye.y - p[1], eye.z - p[2]), ps = pts.map(pitch), mid = (Math.min(...ps) + Math.max(...ps)) / 2;
    const look = a => { camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(eye.x, eye.y - Math.sin(a) * 100, eye.z - Math.cos(a) * 100); camera.updateMatrixWorld(); };
    look(mid);
    const fits = fov => {
      camera.fov = fov; camera.updateProjectionMatrix(); if (low) look(pitch(low) + Math.atan(Math.tan(fov * Math.PI / 360) * (foot + .012)));
      return pts.every(p => { scratch.set(...p).project(camera); return Math.abs(scratch.x) < side && scratch.y < head && scratch.y > foot && scratch.z < 1; });
    };
    const fov = fitFov(fits, 14, 62, .25); if (fov == null) return null;
    fits(fov); return { pos: eye.clone(), quat: camera.quaternion.clone(), fov };
  }
  const pxOf = (a, b) => { scratch.set(...a).project(camera); const x0 = scratch.x, y0 = scratch.y; scratch.set(...b).project(camera); return Math.hypot((scratch.x - x0) * view.w, (scratch.y - y0) * view.h) / 2; };
  function computeShots() {
    const R = WHEEL.R, f = WHEEL.face, yw = WHEEL.y, topY = FLAP.y + 4.5, keep = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov };
    const whole = [[-R - 3, yw, f], [R + 3, yw, f], [0, topY, f], [0, yw - R - 3, f]];
    // Your place at the counter: looking down at the six spots, as large as they come (no steeper than 39° on a wide
    // screen and 56° on one held upright: the wheel behind them is still a wheel from there), the armrest at the picture's foot and the wheel standing over them, on a
    // wide screen as far up as a little over its hub. The whole of it is the spin's view.
    const rail = [0, 3, CLOTH.z1 + 7.5], land = L.orient === 'land', over = land ? [[0, yw + 12, f], [-R * .86, yw - R * .4, f], [R * .86, yw - R * .4, f]] : [[0, yw - R + 9, f]];   // (a little over the hub: its cap stands clear of the hint's line)
    const must = [[-L.half - 1.5, 0, L.near + 1], [L.half + 1.5, 0, L.near + 1], [-L.half - 1.5, 0, L.far - 1], [L.half + 1.5, 0, L.far - 1], rail, ...over];
    let best = null;
    for (let y = 50; y <= 206; y += 6) for (let z = 36; z <= 240; z += 6) {
      if (Math.atan2(y, z + 4) > (land ? .68 : .98)) continue;   // (on a wide screen you look across the counter at the wheel, not down on it)
      // (with the whole wheel in the picture, flapper and all, where the spots stay a finger deep for it: a tablet, a large screen)
      for (const full of [true, false]) {
        const s = aim(V(0, y, z), full ? [...must, ...whole] : must, { low: rail }); if (!s) continue;
        const deep = pxOf([0, 0, -5], [0, 0, 5]);
        const score = pxOf([-5, 0, 0], [5, 0, 0]) ** .4 * deep ** .6 * (1 - Math.max(0, s.fov - 47) * .02) * (full && deep * L.spots.n1.h / 10 >= 46 ? 1.5 : 1);   // (their depth counts for more than their width: seen from a seat, depth is what a spot is short of)
        if (!best || score > best.score) best = { ...s, score };
      }
    }
    shots.seat = best ?? aim(V(0, 110, 200), must) ?? { pos: V(0, 110, 200), quat: new THREE.Quaternion(), fov: 46 };
    // the wheel alone, and its top: from straight before it, as near as a 33° lens (30° for the top) holds it
    const near = (pts, y, lens) => { let s = null; for (let z = 40; z <= 520 && !(s && s.fov <= lens); z += 6) s = aim(V(0, y, f + z), pts, { head: .94, foot: -.94, side: .95 }) ?? s; return s; };
    shots.wheel = near(whole, yw + 12, 33) ?? shots.seat;
    shots.call = near([[-21, yw + R - 5, f], [21, yw + R - 5, f], [0, topY, f], [0, yw + R - 33, f]], yw + R - 3, 30) ?? shots.wheel;
    camera.position.copy(keep.pos); camera.quaternion.copy(keep.quat); camera.fov = keep.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }
  function setPose(s) { camera.position.copy(s.pos); camera.quaternion.copy(s.quat); camera.fov = s.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); requestRender(false); }
  // the camera glides to a view (`name`: 'seat', 'wheel', 'call') over `ms`; a later move takes over from an earlier one
  function move(name, ms = 900) {
    const to = shots[name]; if (!to) return Promise.resolve(); current = name;
    const job = ++moveJob, from = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov };
    if (ms <= 0) { setPose(to); for (const fn of afterFrame) fn(); return Promise.resolve(); }
    return new Promise(done => {
      const t0 = performance.now();
      const tick = now => {
        if (job !== moveJob) { tickers.delete(tick); done(); return; }
        const k = Math.min(1, (now - t0) / ms), e = ease.inOut(k), goal = shots[name] ?? to;   // (the views may be fitted anew meanwhile: a phone turned)
        camera.position.lerpVectors(from.pos, goal.pos, e); camera.quaternion.slerpQuaternions(from.quat, goal.quat, e); camera.fov = from.fov + (goal.fov - from.fov) * e;
        camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        if (k >= 1) { tickers.delete(tick); for (const fn of afterFrame) fn(); done(); }
      };
      tick.still = true; tickers.add(tick); requestRender(false);
    });
  }

  // the canvas is w x h; the picture is framed for the part of it between `top` (the bar and what hangs under it) and
  // `bottom` (the dock, which the canvas runs on under)
  const afterFrame = new Set(); let framedAs = null;
  function relayout(orient) {
    L = layoutFor(orient); const px = Math.min(st.maxTex, quality.felt >= 4096 ? 2048 : 1024), was = cloth.material.map;
    cloth.material.map = paintCloth(L, px, was); cloth.material.map.anisotropy = aniso; if (cloth.material.map !== was) { was?.dispose(); cloth.material.needsUpdate = true; }
  }
  function frame(w, h, top = 0, bottom = 0) {
    framedAs = [w, h, top, bottom]; st.size(w, h);
    const vh = Math.max(1, h - top - bottom); view.w = w; view.h = vh;
    camera.clearViewOffset(); camera.aspect = w / vh;
    const orient = w / vh < 1.12 ? 'port' : 'land';
    if (!L || L.orient !== orient) relayout(orient);
    computeShots();
    view.h = h; if (top > 0 || bottom > 0) camera.setViewOffset(w, vh, 0, -top, w, h);
    if (show.on) placeShowcase(performance.now()); else { moveJob++; setPose(shots[current] ?? shots.seat); }
    for (const fn of afterFrame) fn();
    requestRender();
  }

  // ---- the lobby's slow sway before the wheel ----------------------------------------------------------------------------
  const show = { on: false, lag: 0, frozen: 0, driven: false }, orbitEye = V(), orbitAt = V();
  function orbitPose(now) {
    // a slow sway before the wheel, far enough back that it and its counter stand in the band between the title and the rail of tables
    const t = ((show.frozen || now) - show.lag) / 1000, portrait = camera.aspect < .9, a = Math.sin(t * .07) * .34 + Math.sin(t * .029) * .08, r = portrait ? 640 : 540;
    orbitEye.set(Math.sin(a) * r, (portrait ? 170 : 104) + Math.sin(t * .11) * 5, WHEEL.z + Math.cos(a) * r); orbitAt.set(Math.sin(a) * 30, portrait ? 60 : 24, WHEEL.z + 26); return portrait ? 40 : 36;
  }
  function placeShowcase(now) {
    if (show.driven) return; const fov = orbitPose(now);
    camera.position.copy(orbitEye); camera.up.set(0, 1, 0); camera.lookAt(orbitAt); camera.fov = fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }
  const pace = orbitPace(); let ticked = 0;
  const showTick = now => {
    const dt = ticked ? Math.min(100, now - ticked) : 0; ticked = now; if (show.frozen) return;
    show.lag += pace.step(dt);
    if (pace.still) { tickers.delete(showTick); pace.wake(() => { if (show.on && !show.frozen) { ticked = 0; tickers.add(showTick); requestRender(false); } }); return; }   // (left alone, the sway comes to rest: nothing is drawn)
    placeShowcase(now); requestRender(false);
  };
  showTick.lazy = showTick.still = true;
  const showcase = {
    get on() { return show.on; },
    start(still = false) { show.on = true; moveJob++; if (still) placeShowcase(9000); else tickers.add(showTick); requestRender(false); },
    async stop(ms = 1300) { if (!show.on) return; tickers.delete(showTick); show.on = false; await move('seat', ms); },
    freeze(on, drive = false) {
      const now = performance.now();
      if (on) { show.frozen ||= now; show.driven = drive; } else { if (show.frozen) show.lag += now - show.frozen; show.frozen = 0; show.driven = false; if (show.on) placeShowcase(now); requestRender(false); }
    },
    pose() { const fov = orbitPose(performance.now()); return { eye: orbitEye.clone(), at: orbitAt.clone(), fov }; },
  };

  function setQuality(q) {
    const was = quality; quality = q; st.setQuality(q);
    if (q.felt !== was.felt && L) relayout(L.orient);
    setChipDetail(q.chipSegments); swapChipGeometry(scene); requestRender();
  }

  return {
    THREE, renderer, scene, camera, tickers, requestRender, table, wheel, mood, frame, afterFrame, shots, move, showcase, setQuality,
    get layout() { return L; }, get current() { return current; }, get view() { return view; }, get quality() { return quality; }, get pixelRatio() { return st.pixelRatio; },
    project: (x, y, z) => st.project(x, y, z), pause: st.pause, hold: st.hold, warm: st.warm, compiled: st.compiled, floorY: () => FLOOR_Y,
    swap(apply, o) { showcase.freeze(true); return st.swap(apply, o).finally(() => showcase.freeze(false)); },
    get debug() { return st.debug; },
  };
}
