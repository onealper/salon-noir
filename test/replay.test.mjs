// The slow-motion replay (roulette/replay.mjs) keeps the ball in the picture on every screen shape, a phone held upright
// included, whose narrow picture lost it a third of the time behind a fixed lens. The lens is fitted here as rscene.mjs
// fits it in the browser: the narrowest one from the camera's place that keeps every point inside the margins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../src/vendor/three.module.min.js';
import { fitFov } from '../src/scene/stage.mjs';
import { plan, at } from '../src/roulette/physics.mjs';
import { replayShot } from '../src/roulette/replay.mjs';

const V = a => new THREE.Vector3(...a), v3 = new THREE.Vector3();
function camera(aspect) {
  const cam = new THREE.PerspectiveCamera(40, aspect, 1, 2000);
  const aim = (pos, look) => { cam.position.copy(V(pos)); cam.lookAt(V(look)); cam.updateMatrixWorld(); };
  const fit = (pos, look, pts, mx, my) => { aim(pos, look); return fitFov(fov => { cam.fov = fov; cam.updateProjectionMatrix(); return pts.every(q => { v3.copy(V(q)).project(cam); return Math.abs(v3.x) < mx && Math.abs(v3.y) < my && v3.z < 1; }); }, 12, 75, .2); };
  return { cam, aim, fit };
}

const spins = Array.from({ length: 120 }, (_, i) => plan(i % 37, { dir: i % 2 ? 1 : -1, phiNow: (i * 1.3) % (2 * Math.PI), fast: i % 5 === 0, seed: (i * 2654435761 + 17) >>> 0 }));
// desktop 1280x650 under the bar, phone landscape 557x296, phone upright 390x568 (aspect 0.69) and a taller one
for (const [name, aspect, want] of [['desktop', 1280 / 650, .99], ['phone landscape', 557 / 296, .99], ['phone upright', .69, .95], ['tall phone upright', .62, .95]]) {
  test(`the replay keeps the ball in the picture: ${name}`, () => {
    const { cam, aim, fit } = camera(aspect);
    let frames = 0, seen = 0, ends = 0; const N = 120;
    for (let i = 0; i < N; i++) {
      const p = spins[i];
      const s = replayShot(p, fit);
      assert.ok(s.fov >= 30 && s.fov <= 62, `spin ${i}: lens ${s.fov}`); assert.ok(s.t1 > s.t0 && s.t1 - s.t0 <= 1.6 + 1e-9);
      aim(s.pos, s.look); cam.fov = s.fov; cam.updateProjectionMatrix();
      const inside = t => { const b = at(p, t); v3.set(b.r * Math.cos(b.theta), b.y, -b.r * Math.sin(b.theta)).project(cam); return Math.abs(v3.x) < .95 && Math.abs(v3.y) < .95; };
      for (let t = s.t0; t <= s.t1; t += 1 / 60) { frames++; if (inside(t)) seen++; }
      if (inside(s.t1)) ends++;
    }
    assert.ok(seen / frames >= want, `${name}: ball in the picture ${(100 * seen / frames).toFixed(1)}% of the replay`);
    assert.equal(ends, N, `${name}: every replay ends on the ball in its pocket`);
  });
}
