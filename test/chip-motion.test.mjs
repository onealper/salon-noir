import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../src/vendor/three.module.min.js';
import { tossChip, payoutCuts, pushChipStack, RestingChipBatch } from '../src/scene/chip-motion.mjs';

test('payout cuts carry full twenties, then fives, without crossing an existing column or denomination', () => {
  assert.deepEqual(payoutCuts(Array(70).fill(5)).map(c => c.size), [20, 20, 20, 5, 5]);
  assert.deepEqual(payoutCuts(Array(25).fill(5), { start: 3 }).map(c => c.size), [5, 5, 5, 2, 5, 3]);
  assert.deepEqual(payoutCuts(Array(25).fill(5), { start: 19 }).map(c => c.size), [1, 20, 4]);
  const values = [...Array(23).fill(1000), ...Array(7).fill(500), 25, 10, 5, 1, .5];
  const cuts = payoutCuts(values), restored = cuts.flatMap(({ index, size }) => values.slice(index, index + size));
  assert.deepEqual(restored, values);
  assert.deepEqual(cuts.map(c => c.size), [20, 3, 5, 2, 1, 1, 1, 1, 1]);
  assert.equal(restored.reduce((sum, v) => sum + v, 0), 26541.5);
});

test('payout cut planning covers arbitrary long payouts exactly and rejects invalid chip positions', () => {
  for (let start = 0; start < 40; start++) {
    const values = [...Array(127).fill(100), ...Array(22).fill(5), .5], cuts = payoutCuts(values, { start }); let next = 0;
    for (const { index, size } of cuts) {
      assert.equal(index, next); next += size;
      assert.equal(Math.floor((start + index) / 20), Math.floor((start + index + size - 1) / 20));
      assert.ok(size <= 5 || size === 20);
      assert.ok(values.slice(index, index + size).every(v => v === values[index]));
    }
    assert.equal(next, values.length, 'no chip may be trimmed to make a payout fit');
  }
  assert.deepEqual(payoutCuts([]), []);
  for (const values of [[0], [-1], [Infinity], [NaN], [.25]]) assert.throws(() => payoutCuts(values), RangeError);
  for (const options of [{ start: -1 }, { start: .5 }, { columnSize: 0 }, { groupSize: 0 }]) assert.throws(() => payoutCuts([1], options), RangeError);
});

test('a twenty-chip payout moves as one rigid stack and lands with one sound', async () => {
  const chips = Array.from({ length: 20 }, () => new THREE.Object3D()), targets = chips.map((_, i) => new THREE.Vector3(8, .17 + i * .344, 49));
  const from = new THREE.Vector3(1, 2.5, -30), sounds = [];
  const motion = {
    wait: async ms => { assert.equal(ms, 70); assert.ok(chips.every(c => !c.visible), 'a cut still in the float stays out of the flight'); },
    tween: async (ms, update) => {
      assert.equal(ms, 500);
      for (const t of [0, .25, .5, .75, 1]) {
        update(t); assert.ok(chips.every(c => c.visible));
        for (let i = 1; i < chips.length; i++) assert.ok(chips[i].position.clone().sub(chips[0].position).distanceTo(targets[i].clone().sub(targets[0])) < 1e-10, 'chips must not spray apart during payment');
      }
    },
  };
  await pushChipStack(motion, chips, from, targets, { delay: 70, audio: { play: (...args) => sounds.push(args) } });
  chips.forEach((c, i) => assert.deepEqual(c.position.toArray(), targets[i].toArray()));
  assert.deepEqual(sounds, [['payout', { x: 8, gain: 1 }]]);
});

test('a reduced-motion payout preserves a half-chip remainder and finishes every mesh', async () => {
  const values = [5, 1, 1, .5], chips = values.map(() => new THREE.Object3D()), targets = chips.map((_, i) => new THREE.Vector3(0, .17 + i * .344, 49));
  await pushChipStack({ wait: async () => {}, tween: async (_, update) => update(1) }, chips, new THREE.Vector3(0, 2.5, -30), targets);
  assert.equal(values.reduce((sum, v) => sum + v, 0), 7.5);
  chips.forEach((c, i) => { assert.ok(c.visible); assert.deepEqual(c.position.toArray(), targets[i].toArray()); });
});

test('clearing a payout before departure or during flight suppresses late meshes and sounds', async () => {
  const chips = [new THREE.Object3D()], targets = [new THREE.Vector3(0, .17, 49)], sounds = []; let active = true, tweened = false;
  await pushChipStack({ wait: async () => { active = false; }, tween: async () => { tweened = true; } }, chips, new THREE.Vector3(0, 2.5, -30), targets,
    { active: () => active, audio: { play: (...args) => sounds.push(args) } });
  assert.equal(tweened, false); assert.equal(chips[0].visible, false); assert.deepEqual(sounds, []);
  active = true;
  await pushChipStack({ wait: async () => {}, tween: async (_, update) => { update(.5); active = false; update(1); } }, chips, new THREE.Vector3(0, 2.5, -30), targets,
    { active: () => active, audio: { play: (...args) => sounds.push(args) } });
  assert.equal(chips[0].visible, false); assert.deepEqual(sounds, []);
});

test('a shared chip toss follows its arc, lands once, and finishes flat at the stake', async () => {
  const chip = new THREE.Object3D(), from = new THREE.Vector3(0, 9, 70), to = new THREE.Vector3(10, .17, 49), frames = [], sounds = [];
  const motion = { tween: async (ms, update) => {
    assert.equal(ms, 440);
    for (const t of [0, .19, .38, .57, .76, .9, 1, 1]) { update(t); frames.push(chip.position.clone()); }
  } };
  await tossChip(motion, chip, from, to, { audio: { play: (...args) => sounds.push(args) } });
  assert.deepEqual(frames[0].toArray(), from.toArray());
  assert.ok(frames.some(p => p.y > from.y), 'the toss rises before dropping');
  for (let i = 1; i < frames.length; i++) assert.ok(frames[i].x >= frames[i - 1].x, 'no backward jump across the cloth');
  assert.deepEqual(chip.position.toArray(), to.toArray());
  assert.equal(chip.rotation.x, 0); assert.equal(chip.rotation.z, 0);
  assert.deepEqual(sounds, [['chip', { x: 10 }]], 'repeated final updates cannot double the landing sound');
});

test('a reduced-motion toss and a retargeted toss both settle at the current destination', async () => {
  const chip = new THREE.Object3D(), sounds = [], to = new THREE.Vector3(1, .17, 2);
  await tossChip({ tween: async (_, update) => update(1) }, chip, new THREE.Vector3(0, 9, 70), to,
    { onStack: true, pan: -18, audio: { play: (...args) => sounds.push(args) } });
  assert.deepEqual(chip.position.toArray(), [1, .17, 2]);
  assert.deepEqual(sounds, [['stack', { x: -18 }]]);
  await tossChip({ tween: async (_, update) => { update(.3); to.set(14, .51, 6); update(.8); update(1); } }, chip, chip.position.clone(), to);
  assert.deepEqual(chip.position.toArray(), [14, .51, 6], 'a phone rotation can move the landing point during flight');
});

test('resting chips batch by material and preserve transforms through growth, updates and removals', () => {
  const parent = new THREE.Group(), geometry = new THREE.CylinderGeometry(1.95, 1.95, .34), material = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
  const batch = new RestingChipBatch(parent, { geometry: () => geometry }), chips = [];
  for (let i = 0; i < 90; i++) {
    const c = new THREE.Mesh(geometry, material); c.castShadow = c.receiveShadow = true;
    c.position.set(i, .17 + i * .34, i / 3); c.rotation.y = i * .17; parent.add(c); chips.push(c); batch.park(c);
  }
  assert.equal(batch.count, 90);
  assert.equal(parent.children.length, 1, 'ninety resting chips need one material batch, not ninety drawables');
  assert.ok(parent.children[0].castShadow && parent.children[0].receiveShadow);
  assert.equal(parent.children[0].count, 90);
  const moved = chips[44]; moved.position.set(-5, 3, 9); batch.park(moved);
  batch.remove(chips[2]); batch.remove(chips[89]);
  assert.equal(batch.count, 88);
  const render = parent.children[0], matrix = new THREE.Matrix4(), rendered = [];
  for (let i = 0; i < render.count; i++) { render.getMatrixAt(i, matrix); rendered.push(new THREE.Vector3().setFromMatrixPosition(matrix).x); }
  assert.deepEqual(rendered.sort((a,b) => a-b), chips.filter(c => c !== chips[2] && c !== chips[89]).map(c => c.position.x).sort((a,b) => a-b));
  batch.lift(moved); assert.equal(moved.parent, parent); assert.equal(batch.count, 87);
  assert.deepEqual(moved.position.toArray(), [-5, 3, 9]);
  batch.park(moved); assert.equal(batch.count, 88); assert.equal(parent.children.length, 1);
  batch.clear(); assert.equal(batch.count, 0); assert.equal(render.count, 0); assert.equal(render.visible, false);
});

test('chip batches keep denominations separate and refresh geometry without losing chips', () => {
  const parent = new THREE.Group(), initial = new THREE.BoxGeometry(1, 1, 1); let geometry = initial;
  const batch = new RestingChipBatch(parent, { geometry: () => geometry });
  const chips = [new THREE.Mesh(initial, new THREE.MeshBasicMaterial({color:'red'})), new THREE.Mesh(initial, new THREE.MeshBasicMaterial({color:'white'}))];
  for (const c of chips) { parent.add(c); batch.park(c); }
  assert.equal(parent.children.length, 2);
  geometry = new THREE.CylinderGeometry(1.95, 1.95, .34, 28); batch.refresh();
  assert.ok(parent.children.every(m => m.geometry === geometry));
  assert.ok(chips.every(c => c.geometry === geometry));
  batch.lift(chips[0]); batch.remove(chips[1]);
  assert.equal(batch.count, 0); assert.equal(chips[0].parent, parent); assert.equal(chips[1].parent, null);
  assert.ok(parent.children.filter(m => m.isInstancedMesh).every(m => m.count === 0));
});
