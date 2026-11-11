// The baccarat table: the salon's card table (scene/world.mjs: the half-round table, shoe, rack and discard holder
// blackjack is played at) laid for punto banco; its dealer (scene/view.mjs, with this game's places for cards and
// chips); and the camera leaning in over your cards for the squeeze. Centimetres, the table's own frame: x across,
// z out from the dealer toward you.
import * as THREE from '../vendor/three.module.min.js';
import { createWorld, CAMERA, LAYOUT, EDGE_Z, SHOE, toSeat, seatAngle } from '../scene/world.mjs';
import { TableView } from '../scene/view.mjs';
import { paintBaccaratFelt } from '../scene/textures.mjs';
import { cardQuat, headingOf, ease } from '../scene/pieces.mjs';
import { TABLES } from './rules.mjs';

const V = (x, y, z) => new THREE.Vector3(x, y, z), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const SHADE = .66;   // how far the cloth's light falls away round your cards at the squeeze
export const SEATS = 5;
// Where everything lies. The two hands before the dealer: Player at your left, Banker at your right, each two cards
// side by side with room at the outside for a third, laid across, in a frame with its name in the foot. Each seat's spots, in its own frame (carried round
// to the others: toSeat): a row of three circles (the pairs either side of the tie), then Banker, then Player
// nearest the rail. Your cards come to `squeeze`, in front of you, to be turned.
export const BL = {
  hand: { z: -13.3, player: [-21.73, -14.68, -30.05], banker: [14.68, 21.73, 30.05] },
  box: { player: { x: -23, z: -12.6, w: 28.5, h: 13.6 }, banker: { x: 23, z: -12.6, w: 28.5, h: 13.6 } },
  total: { x: 4.9, z: -12.9 },   // the hands' totals, side by side between them
  word: 2.6, arcs: [51.9, 56, 58.7],   // the two lines of payouts and the fine line under them, about the dealer's edge
  seat: { ppair: { x: -9.6, z: 25.4, r: 3.5 }, tie: { x: 0, z: 25.4, r: 4.3 }, bpair: { x: 9.6, z: 25.4, r: 3.5 }, banker: { x: 0, z: 35.8, w: 25, h: 8.6 }, player: { x: 0, z: 46.8, w: 27, h: 9.4 } },
  squeeze: { z: 13.5, dx: 4.5 },
  angles: Array.from({ length: SEATS }, (_, k) => seatAngle(k)),
};
// a spot's outline on the cloth, as points (for the page's hit targets and what the seat's view must hold)
export function outline(id) {
  const s = BL.seat[id]; if (s.r) return [[s.x - s.r, s.z], [s.x + s.r, s.z], [s.x, s.z - s.r], [s.x, s.z + s.r]];
  return [[s.x - s.w / 2, s.z - s.h / 2], [s.x + s.w / 2, s.z - s.h / 2], [s.x - s.w / 2, s.z + s.h / 2], [s.x + s.w / 2, s.z + s.h / 2]];
}

// The table, laid for baccarat: its cloth, and what your seat's view holds (your spots, the hands' places, the
// dealer's edge, the shoe and the discard holder as at blackjack).
export function createBaccaratWorld(canvas, { quality, kind }) {
  const S = BL.seat, B = BL.box;
  return createWorld(canvas, { quality, mode: TABLES[kind], game: {
    felt: (px, table, into) => paintBaccaratFelt(px, table, BL, into),
    see: (portrait, compact) => [[0, 0, S.player.z + S.player.h / 2 + 1], [-S.player.w / 2 - 1, 0, S.player.z + 2], [S.player.w / 2 + 1, 0, S.player.z + 2], [S.ppair.x - S.ppair.r - 1, 0, S.ppair.z], [S.bpair.x + S.bpair.r + 1, 0, S.bpair.z],
      [B.player.x - B.player.w / 2 - 1, 0, B.player.z], [B.banker.x + B.banker.w / 2 + 1, 0, B.banker.z], [0, 3, EDGE_Z - 3], [-24, 3, EDGE_Z - 2]]
      .concat(portrait || compact ? [[LAYOUT.shoe.x + 7, SHOE.topAt(7) + .2, LAYOUT.shoe.z - 3]].concat(compact ? [[LAYOUT.discard.x + 5, 4, LAYOUT.discard.z]] : []) : [[LAYOUT.shoe.x + 30, SHOE.hgt + .2, LAYOUT.shoe.z - 9], [LAYOUT.discard.x - 7, 8, LAYOUT.discard.z]]),
    gauge: [S.banker.z, BL.hand.z], clear: S.player.z + S.player.h / 2 + .5,
    // the two hands lie as wide as the table: on a phone held upright the seat is higher and looks down more steeply, so
    // the layout runs up the screen and your spots are a finger's size
    camera: { land: CAMERA.land, port: { y: [70, 150], z: [52, 124], x: [0] } }, upright: .8,
  } });
}

// ---- the dealer -----------------------------------------------------------------------------------------------------
// Chips: your five spots by name ('player', 'banker', 'tie', 'ppair', 'bpair'); another seat's by 's<seat>' and the
// spot's first letter ('s3b': seat 3 on the Banker). Cards: the hands 'player' and 'banker' (the third card, i = 2,
// laid across at the outside), and 'squeeze', your cards in front of you (two side by side, or a third alone).
const SPOT_OF = { p: 'player', b: 'banker', t: 'tie' };
export const seatKey = (k, id) => `s${k}${id[0]}`;
export class BaccaratView extends TableView {
  constructor(world, motion, audio) { super(world, motion, audio); this.deck = { style: 'pips', fine: true }; }   // squeeze cards, on a grid that folds
  stackBase(key) { const m = /^s(\d)([pbt])$/.exec(key), s = BL.seat[m ? SPOT_OF[m[2]] : key]; return m ? toSeat(+m[1], s.x, s.z) : s; }
  anchor(owner, i) {
    if (owner === 'squeeze') return { pos: V(i >= 2 ? 0 : i ? BL.squeeze.dx : -BL.squeeze.dx, .05, BL.squeeze.z), heading: 0 };
    return { pos: V(BL.hand[owner][Math.min(i, 2)], .05, BL.hand.z), heading: i >= 2 ? Math.PI / 2 : 0 };
  }
  // Cards slid over the cloth to other places (`moves`: [{ c, owner, i }], one after another a beat apart), each
  // squared to its place the short way round, so a card a squeeze turned end for end is not spun back.
  async slide(moves, ms = 440) {
    if (!moves.length) return;
    this.audio?.play('slide', { x: moves[0].c.mesh.position.x, gain: .7 });
    await Promise.all(moves.map(({ c, owner, i }, n) => {
      const a = this.anchor(owner, i), from = c.mesh.position.clone(), q0 = c.mesh.quaternion.clone(), h0 = headingOf(q0);
      const h1 = Math.abs(wrap(a.heading - h0)) > Math.PI / 2 + .01 ? a.heading + Math.PI : a.heading, q1 = cardQuat(h1, c.hidden ? 0 : 1);
      Object.assign(c, { owner, i, heading: h1, flipFace: Math.cos(h1) < -.5 });
      return this.motion.wait(n * 70).then(() => this.motion.tween(ms * this.dealer.speed, t => { c.mesh.position.lerpVectors(from, a.pos, t); c.mesh.position.y += Math.sin(Math.PI * t) * .45; c.mesh.quaternion.slerpQuaternions(q0, q1, t); }, ease.inOut));
    }));
  }
  // a card lying face down taken as turned (a squeeze did it): how it lies now is how it is remembered
  turned(c) { c.hidden = false; c.heading = headingOf(c.mesh.quaternion); c.flipFace = Math.cos(c.heading) < -.5; }
}

// ---- the camera over your cards -------------------------------------------------------------------------------------
// For the squeeze the camera leans in from your seat until your cards fill the picture: over them and a little back,
// looking down at them, as you would bend over a card to peel it up. The room's light falls away round them as it
// does (a soft pool of shade laid on the cloth: the printing behind the cards goes quiet, the cards stay lit).
// `lean(on)` glides there and back; the seat's own view (world.frame) is taken up again whenever the picture is
// framed anew.
export function createDirector(world, motion) {
  const cam = world.camera, seat = { pos: V(0, 51, 108), quat: new THREE.Quaternion(), fov: 40 }, over = { pos: V(0, 40, 30), quat: new THREE.Quaternion(), fov: 31 };
  let k = 0, wanted = 0, job = 0;
  const eye = new THREE.PerspectiveCamera();   // (a camera, so that lookAt turns it as it turns the room's: looking down its own -z)
  const shade = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(.4, 'rgba(0,0,0,.96)'); r.addColorStop(.72, 'rgba(0,0,0,.42)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(190, 130), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, .02, BL.squeeze.z); m.renderOrder = 2; m.visible = false; world.scene.add(m); return m;
  })();
  function fit() {
    // the two cards and the room a fold needs, within the picture between the bar and the button
    const pitch = 62 * Math.PI / 180, half = Math.tan(over.fov / 2 * Math.PI / 180), wide = 2 * BL.squeeze.dx + 6.35 + 2.6, deep = (8.89 + 3.4) * Math.sin(pitch);
    const d = Math.max(wide / 2 / (half * cam.aspect * .94), deep / 2 / (half * .72)), at = V(0, 0, BL.squeeze.z - .5);
    over.pos.set(at.x, at.y + d * Math.sin(pitch), at.z + d * Math.cos(pitch)); eye.position.copy(over.pos); eye.up.set(0, 1, 0); eye.lookAt(at); over.quat.copy(eye.quaternion);
  }
  function apply() {
    if (world.showcase.on) return;   // (the lobby keeps its own camera)
    const e = ease.inOut(k); cam.position.lerpVectors(seat.pos, over.pos, e); cam.quaternion.slerpQuaternions(seat.quat, over.quat, e);
    cam.fov = seat.fov + (over.fov - seat.fov) * e; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    shade.material.opacity = SHADE * e; shade.visible = e > .004; world.requestRender(false);
  }
  // (called as the seat's view is set, before the lobby's own camera takes the picture back: the seat is known either way)
  world.afterFrame.add(() => { seat.pos.copy(cam.position); seat.quat.copy(cam.quaternion); seat.fov = cam.fov; fit(); if (k) apply(); });
  return {
    get over() { return k > 0; }, shade,
    // (a tween of its own: the dealer's pace and Reduce motion's cut both apply, and a new lean takes over from the last)
    lean(on, ms = 760) {
      wanted = on ? 1 : 0; const from = k, turn = ++job; if (from === wanted) return Promise.resolve();
      return motion.tween(ms * Math.abs(wanted - from), t => { if (turn !== job) return; k = from + (wanted - from) * t; apply(); });
    },
    reset() { job++; k = wanted = 0; shade.material.opacity = 0; shade.visible = false; },
  };
}
