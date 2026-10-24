// Cards and chips as objects, plus the small motion engine that moves them.
import * as THREE from '../vendor/three.module.min.js';
import { CARD_W, CARD_H, CARD_R, faceTexture, backTexture, markerFaceTexture } from './textures.mjs';
import { chipMaterials, chipGeometry, CARD_T } from './world.mjs';
export { tossChip, payoutCuts, pushChipStack, RestingChipBatch } from './chip-motion.mjs';

// ---- orientation vocabulary -------------------------------------------------------------
// A card's local frame: x across the short side, y along the long side (its top), face +z.
// On the felt its top points at the dealer; `heading` turns it about the vertical.
const basis = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)));
export const FACE_DOWN = basis([-1, 0, 0], [0, 0, -1], [0, -1, 0]);
const Y = new THREE.Vector3(0, 1, 0), LONG = new THREE.Vector3(0, 1, 0), SHORT = new THREE.Vector3(1, 0, 0);
// heading (about world Y) x lying face down x turned over by `flip` (0 down, 1 up) about the long axis
// x tipped by `tilt` about the short axis (a peek lifts the near end).
export function cardQuat(heading, flip = 0, tilt = 0) {
  return new THREE.Quaternion().setFromAxisAngle(Y, heading).multiply(FACE_DOWN)
    .multiply(new THREE.Quaternion().setFromAxisAngle(LONG, Math.PI * flip))
    .multiply(new THREE.Quaternion().setFromAxisAngle(SHORT, tilt));
}
// Heading of any card orientation: the direction its long axis points, projected on the felt.
export function headingOf(q) { const d = LONG.clone().applyQuaternion(q); return Math.atan2(-d.x, -d.z); }

// ---- cards ---------------------------------------------------------------------------------
let cardGeo;
function roundedCard() {
  if (cardGeo) return cardGeo;
  const w = CARD_W / 2, h = CARD_H / 2, r = CARD_R, s = new THREE.Shape();
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  const g = new THREE.ShapeGeometry(s, 6), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w) / CARD_W, (p.getY(i) + h) / CARD_H);
  return cardGeo = g;
}
const faceMats = new Map(); let backMat;
export function createCard(card) {
  const k = card.rank + card.suit;
  if (!faceMats.has(k)) faceMats.set(k, new THREE.MeshStandardMaterial({ map: faceTexture(card), roughness: .38, metalness: 0 }));
  backMat ??= new THREE.MeshStandardMaterial({ map: backTexture(), roughness: .38, metalness: 0 });
  const g = new THREE.Group(), face = new THREE.Mesh(roundedCard(), faceMats.get(k)), back = new THREE.Mesh(roundedCard(), backMat);
  face.position.z = CARD_T / 2; back.position.z = -CARD_T / 2; back.rotation.y = Math.PI;
  face.castShadow = back.castShadow = true; face.receiveShadow = back.receiveShadow = true;
  g.add(face, back); g.userData.card = card; return g;
}

// ---- chips ------------------------------------------------------------------------------------
export function createChip(value) {
  const m = new THREE.Mesh(chipGeometry(), chipMaterials(value)); m.castShadow = m.receiveShadow = true; m.userData.value = value; return m;
}

// A free-bet marker: a slightly smaller, thicker brass-yellow disc that reads FREE BET.
let markerMats;
export function createMarker() {
  markerMats ??= (() => { const side = new THREE.MeshStandardMaterial({ color: '#c99a2e', metalness: .35, roughness: .4 }), top = new THREE.MeshStandardMaterial({ map: markerFaceTexture(), roughness: .42 }); return [side, top]; })();   // rim, both faces
  const m = new THREE.Mesh(chipGeometry(), markerMats); m.scale.set(.86, 1.5, .86); m.castShadow = m.receiveShadow = true; m.userData.value = 'free'; return m;
}

// ---- motion ---------------------------------------------------------------------------------------
export const ease = {
  linear: t => t, out: t => 1 - (1 - t) ** 3, inOut: t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
  in: t => t ** 3, smooth: t => t * t * (3 - 2 * t),
  // a clay chip landing: quick fall, one small settle
  land: t => t < .72 ? 1 - (1 - t / .72) ** 2 : 1 - Math.sin((t - .72) / .28 * Math.PI) * .045,
};
export class Motion {
  constructor(world) { this.world = world; this.slow = 1; this.reduced = false; this.live = new Set(); this.clock = null; }   // clock: a fixed time for frame-by-frame checks
  tween(ms, update, easing = ease.linear) {
    const dur = this.reduced ? 0 : ms * this.slow;
    if (dur <= 0) { update(1); this.world.requestRender(); return Promise.resolve(); }
    return new Promise(resolve => {
      const job = { update, easing, resolve, done: false };
      let t0 = null;
      job.tick = now => {
        now = this.clock ?? now; t0 ??= now; const t = Math.min(1, (now - t0) / dur);
        job.update(job.easing(t)); if (t >= 1) job.end();
      };
      job.end = () => { if (job.done) return; job.done = true; job.update(1); this.world.tickers.delete(job.tick); this.live.delete(job); resolve(); setTimeout(() => this.world.requestRender(), 0); };   // draw what the caller settles after awaiting
      this.live.add(job); this.world.tickers.add(job.tick); this.world.requestRender();
    });
  }
  wait(ms) { const d = this.reduced ? 0 : ms * this.slow; return d ? new Promise(r => setTimeout(r, d)) : Promise.resolve(); }
  finishAll() { for (const j of [...this.live]) j.end(); }
}
