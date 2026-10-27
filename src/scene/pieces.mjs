// Cards and chips as objects, plus the small motion engine that moves them.
import * as THREE from '../vendor/three.module.min.js';
import { CARD_W, CARD_H, CARD_R, faceTexture, backTexture, markerFaceTexture } from './textures.mjs';
import { chipMaterials, chipGeometry, CARD_T } from './world.mjs';

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
// A card is two faces a card's thickness apart, each a fine grid cut to the rounded corners (each corner cell's square
// drawn onto its quarter circle), so that it can bend.
let cardGeo;
function roundedCard() {
  if (cardGeo) return cardGeo;
  const w = CARD_W / 2, h = CARD_H / 2, r = CARD_R, C = 3;   // C: steps across a corner
  const steps = (half, n) => [...Array.from({ length: C }, (_, k) => -half + r * k / C), ...Array.from({ length: n + 1 }, (_, k) => -half + r + (2 * (half - r)) * k / n), ...Array.from({ length: C }, (_, k) => half - r + r * (k + 1) / C)];
  const xs = steps(w, 10), ys = steps(h, 14), pos = [], uv = [], idx = [];
  for (const y of ys) for (const x of xs) {
    let px = x, py = y; const a = Math.abs(x) - (w - r), b = Math.abs(y) - (h - r);
    if (a > 0 && b > 0) { const m = Math.max(a, b) / Math.hypot(a, b); px = Math.sign(x) * (w - r + a * m); py = Math.sign(y) * (h - r + b * m); }
    pos.push(px, py, 0); uv.push((px + w) / CARD_W, (py + h) / CARD_H);
  }
  const nx = xs.length;
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < nx - 1; i++) { const k = j * nx + i; idx.push(k, k + 1, k + nx + 1, k, k + nx + 1, k + nx); }
  const g = new THREE.BufferGeometry(); g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
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
// A card bent as paper bends, without stretching: flat up to a fold line, then wrapped round a cylinder for a length
// `L` (an arc of k·L radians), then straight on along the last tangent. In the card's own frame (x across the short
// side, y along the long side, face +z): `dir` is the direction across the fold, toward the part that bends; `s0` how
// far along it the fold lies from the card's centre; `k` the curvature (1/radius, cm; positive curls toward the face);
// `L` Infinity for a curl that goes on round. `both`: bend both ways from the fold, a bow. `null` lays it flat again.
// Each card bent gets geometry of its own while it is bent, given back when it lies flat.
const _m = new THREE.Matrix4(), _i = new THREE.Matrix4(), _v = new THREE.Vector3();
export function bendCard(card, bend) {
  const flat = !bend || Math.abs(bend.k) < 1e-5 || bend.L <= 0;
  for (const mesh of card.children) {
    if (flat) { if (mesh.geometry !== cardGeo) { mesh.geometry.dispose(); mesh.geometry = cardGeo; } continue; }
    if (mesh.geometry === cardGeo) { mesh.geometry = cardGeo.clone(); mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), CARD_H); }
    mesh.updateMatrix(); _m.copy(mesh.matrix); _i.copy(_m).invert();
    const src = cardGeo.attributes.position, dst = mesh.geometry.attributes.position, { k, L = Infinity, s0 = 0, both = false } = bend;
    const dx = bend.dir?.[0] ?? 1, dy = bend.dir?.[1] ?? 0, R = 1 / k;
    for (let i = 0; i < src.count; i++) {
      _v.fromBufferAttribute(src, i).applyMatrix4(_m);
      const s = _v.x * dx + _v.y * dy, sign = s < s0 ? -1 : 1, a = (s - s0) * sign;
      if (a > 0 && (sign > 0 || both)) {
        const al = Math.min(a, L), th = k * al, sn = Math.sin(th), cs = Math.cos(th), z = _v.z, on = a - al;
        const ds = R * sn - z * sn + on * cs, h = R * (1 - cs) + z * cs + on * sn;   // along the fold's normal, and off the card's plane
        const ns = s0 + sign * ds; _v.x += (ns - s) * dx; _v.y += (ns - s) * dy; _v.z = h;
      }
      _v.applyMatrix4(_i); dst.setXYZ(i, _v.x, _v.y, _v.z);
    }
    dst.needsUpdate = true; mesh.geometry.computeVertexNormals();
  }
}

// ---- chips ------------------------------------------------------------------------------------
export function createChip(value) {
  const m = new THREE.Mesh(chipGeometry(), chipMaterials(value)); m.castShadow = m.receiveShadow = true; m.userData.value = value; return m;
}

// A chip set down from a hand, at either table: it decelerates across the felt on a gravity arc (its apex `top`, high
// enough to clear what stands in the way), lands flat (`onLand`, for the click) and settles with one small bounce and
// a fading wobble. Returns the update for Motion.tween; `finish()` puts it exactly in place at the end.
export function chipToss(c, start, to, { top = Math.max(start.y, to.y) + 3.4, land = .76, onLand = null } = {}) {
  const spin0 = Math.random() * Math.PI * 2, spin = (Math.random() - .5) * 1.4, a = Math.random() * Math.PI * 2, tx = Math.sin(a), tz = Math.cos(a);
  c.rotation.set(0, spin0, 0); c.position.copy(start);
  let landed = false;
  const update = t => {
    if (t < land) {
      const u = t / land, e = 1 - (1 - u) ** 2.4, w = 1 - u;
      c.position.set(start.x + (to.x - start.x) * e, w * w * start.y + 2 * w * u * top + u * u * to.y, start.z + (to.z - start.z) * e);
      c.rotation.set(tx * .42 * w, spin0 + spin * e, tz * .42 * w);
    } else {
      if (!landed) { landed = true; onLand?.(); }
      const v = (t - land) / (1 - land), damp = (1 - v) ** 2, wob = Math.cos(v * Math.PI * 3) * .07 * damp;
      c.position.set(to.x, to.y + Math.sin(v * Math.PI) * .22 * (1 - v), to.z);
      c.rotation.set(tx * wob, spin0 + spin, tz * wob);
    }
  };
  update.finish = () => { c.position.copy(to); c.rotation.set(0, spin0 + spin, 0); if (!landed) { landed = true; onLand?.(); } };
  return update;
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
