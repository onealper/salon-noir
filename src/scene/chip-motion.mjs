// A tossed chip has the same weight at every table. Resting chips are instances; the original
// mesh comes back while it moves, so animations never need to write into a shared buffer.
import * as THREE from '../vendor/three.module.min.js';

// A dealer carries a full column of twenty, then cuts the remainder in fives. Cuts never
// straddle a destination column or mix denominations; an existing stake may partly fill it.
export function payoutCuts(values, { start = 0, columnSize = 20, groupSize = 5 } = {}) {
  if (!Array.isArray(values) || values.some(v => !Number.isFinite(v) || v <= 0 || !Number.isSafeInteger(v * 2))) throw new RangeError('Payout chips must be positive half-chip denominations.');
  if (![start, columnSize, groupSize].every(Number.isSafeInteger) || start < 0 || columnSize < 1 || groupSize < 1 || !Number.isSafeInteger(start + values.length)) throw new RangeError('Payout column positions must be nonnegative safe integers with positive cut sizes.');
  const cuts = [];
  for (let index = 0; index < values.length;) {
    let end = index + 1; while (end < values.length && values[end] === values[index]) end++;
    while (index < end) {
      const room = columnSize - (start + index) % columnSize, left = end - index;
      const size = room === columnSize && left >= columnSize ? columnSize : Math.min(groupSize, room, left);
      cuts.push({ index, size }); index += size;
    }
  }
  return cuts;
}

// One rigid stack follows one arc. Pending cuts stay in the dealer's float until their turn,
// rather than drawing several coincident stacks there. Targets may move during a re-layout.
export async function pushChipStack(motion, chips, from, targets, { duration = 500, delay = 0, audio, pan = targets[0]?.x, gain = 1, active = () => true } = {}) {
  if (!chips.length) return;
  const origins = targets.map(to => from.clone().add(to).sub(targets[0]));
  chips.forEach((c, i) => { c.position.copy(origins[i]); c.visible = false; });
  await motion.wait(delay); if (!active()) return; chips.forEach(c => { c.visible = true; });
  await motion.tween(duration, t => {
    if (!active()) { chips.forEach(c => { c.visible = false; }); return; }
    const e = t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2, lift = Math.sin(Math.PI * e) * 4;
    chips.forEach((c, i) => { c.position.lerpVectors(origins[i], targets[i], e); c.position.y += lift; });
  });
  if (!active()) return;
  chips.forEach((c, i) => c.position.copy(targets[i])); audio?.play('payout', { x: pan, gain });
}

export function tossChip(motion, chip, from, to, { duration = 440, audio, onStack = false, pan = to.x } = {}) {
  const start = from.clone(), end = to, top = Math.max(start.y, end.y) + 3.4, LAND = .76;
  const spin0 = Math.random() * Math.PI * 2, spin = (Math.random() - .5) * 1.4, a = Math.random() * Math.PI * 2, tx = Math.sin(a), tz = Math.cos(a);
  chip.rotation.set(0, spin0, 0); chip.position.copy(start); let landed = false;
  const sound = () => { if (landed) return; landed = true; audio?.play(onStack ? 'stack' : 'chip', { x: pan }); };
  return motion.tween(duration, t => {
    if (t < LAND) {
      const u = t / LAND, e = 1 - (1 - u) ** 2.4, w = 1 - u;
      chip.position.set(start.x + (end.x - start.x) * e, w * w * start.y + 2 * w * u * top + u * u * end.y, start.z + (end.z - start.z) * e);
      chip.rotation.set(tx * .42 * w, spin0 + spin * e, tz * .42 * w);
    } else {
      sound();
      const v = (t - LAND) / (1 - LAND), damp = (1 - v) ** 2, wob = Math.cos(v * Math.PI * 3) * .07 * damp;
      chip.position.set(end.x, end.y + Math.sin(v * Math.PI) * .22 * (1 - v), end.z);
      chip.rotation.set(tx * wob, spin0 + spin, tz * wob);
    }
  }).then(() => { chip.position.copy(end); chip.rotation.set(0, spin0 + spin, 0); sound(); });
}

export class RestingChipBatch {
  constructor(parent, { geometry } = {}) {
    this.parent = parent; this.geometry = geometry; this.buckets = new Map(); this.parked = new Map(); this.matrix = new THREE.Matrix4();
  }
  get count() { return this.parked.size; }
  // A material array identifies one denomination or one player's colour, shared by all its chips.
  bucket(chip) {
    let b = this.buckets.get(chip.material);
    if (!b) {
      b = { items: [], mesh: null, capacity: 0, geometry: chip.geometry, material: chip.material, cast: chip.castShadow, receive: chip.receiveShadow };
      this.buckets.set(chip.material, b);
    }
    if (b.items.length === b.capacity) {
      const capacity = Math.max(32, b.capacity * 2), old = b.mesh;
      b.mesh = new THREE.InstancedMesh(this.geometry?.() ?? b.geometry, b.material, capacity);
      b.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); b.mesh.count = b.items.length;
      b.mesh.castShadow = b.cast; b.mesh.receiveShadow = b.receive;
      // A batch's bounds change whenever a chip lands or leaves. There are few batches and all
      // sit on the table; skip stale bounds rather than recalculate them for every landing.
      b.mesh.frustumCulled = false; b.mesh.name = 'Resting chips';
      if (old) {
        for (let i = 0; i < b.items.length; i++) { old.getMatrixAt(i, this.matrix); b.mesh.setMatrixAt(i, this.matrix); }
        this.parent.remove(old); old.dispose();
      }
      b.capacity = capacity; this.parent.add(b.mesh);
    }
    return b;
  }
  park(chip) {
    let r = this.parked.get(chip);
    if (!r) {
      const bucket = this.bucket(chip), index = bucket.items.length;
      bucket.items.push(chip); r = { bucket, index }; this.parked.set(chip, r); chip.removeFromParent();
    }
    const { bucket: b, index } = r;
    chip.updateMatrix(); b.mesh.setMatrixAt(index, chip.matrix); b.mesh.count = b.items.length;
    b.mesh.instanceMatrix.needsUpdate = true; b.mesh.visible = true;
    return chip;
  }
  unpark(chip) {
    const r = this.parked.get(chip); if (!r) return false;
    const { bucket: b, index } = r, last = b.items.pop();
    if (last !== chip) {
      b.items[index] = last; this.parked.get(last).index = index;
      b.mesh.getMatrixAt(b.items.length, this.matrix); b.mesh.setMatrixAt(index, this.matrix);
    }
    this.parked.delete(chip); b.mesh.count = b.items.length; b.mesh.visible = !!b.items.length; b.mesh.instanceMatrix.needsUpdate = true;
    return true;
  }
  lift(chip) {
    if (this.unpark(chip)) { chip.geometry = this.geometry?.() ?? chip.geometry; this.parent.add(chip); }
    return chip;
  }
  remove(chip) { this.unpark(chip); chip.removeFromParent(); }
  clear() {
    this.parked.clear();
    for (const b of this.buckets.values()) { b.items.length = 0; b.mesh.count = 0; b.mesh.visible = false; }
  }
  refresh() {
    for (const b of this.buckets.values()) {
      const g = this.geometry?.() ?? b.geometry; b.geometry = g; b.mesh.geometry = g;
      for (const chip of b.items) chip.geometry = g;
    }
  }
}
