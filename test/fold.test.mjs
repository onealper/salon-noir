// The squeeze's geometry (baccarat/fold.mjs): a card's edge drawn across it comes up round a fold and over, and the
// card is never stretched: the edge lands where the finger took it, and a card turned right over lies where it lay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOLD_R, foldAt, edgeBehind, peel, reach, squared, turnOver } from '../src/baccarat/fold.mjs';

const W = 6.35, H = 8.89, half = Math.PI * FOLD_R, near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
// a point of the flat card under a fold, as scene/pieces.mjs bendCard lays it (a card with no thickness): where it
// is along `dir` and across it, and how high
function folded([x, y], { dir, s0 }, r = FOLD_R) {
  const s = x * dir[0] + y * dir[1], t = -x * dir[1] + y * dir[0], a = s - s0;
  if (a <= 0) return { s, t, up: 0 };
  const al = Math.min(a, Math.PI * r), th = al / r, on = a - al;
  return { s: s0 + r * Math.sin(th) + on * Math.cos(th), t, up: r * (1 - Math.cos(th)) + on * Math.sin(th) };
}

test('where the fold lies: the edge rises first, then every centimetre drawn moves the fold half a centimetre', () => {
  assert.ok(near(foldAt(0), 0, 1e-6)); assert.ok(near(foldAt(half), half, 1e-6), 'half a turn once the edge has come in by it');
  let last = 0; for (let D = 0; D <= 6; D += .05) { const f = foldAt(D); assert.ok(f >= last - 1e-9, `the fold moves on at ${D}`); last = f; }
  assert.ok(near(foldAt(3) - foldAt(2), .5)); assert.ok(foldAt(.05) > .3, 'a small pull lifts the edge at once');
  // unstretched: the edge has come in by exactly what it was drawn
  for (const D of [.1, .4, 1, half]) { const f = foldAt(D); assert.ok(near(f - FOLD_R * Math.sin(f / FOLD_R), D, 1e-6), `the edge drawn ${D}`); }
});

test('the peel starts from the edge behind the finger', () => {
  assert.deepEqual(edgeBehind(0, 0, 0, 1), { x: 0, y: -H / 2 }); assert.deepEqual(edgeBehind(1, 2, 1, 0), { x: -W / 2, y: 2 });
  const c = edgeBehind(-W / 2 + .5, -H / 2 + .5, Math.SQRT1_2, Math.SQRT1_2); assert.ok(near(c.x, -W / 2) && near(c.y, -H / 2), 'a pull up from a corner starts at the corner');
  for (let i = 0; i < 200; i++) {
    const a = i * .7, x = Math.sin(i * 1.3) * 4, y = Math.cos(i * .9) * 6, g = edgeBehind(x, y, Math.cos(a), Math.sin(a));
    assert.ok(Math.abs(g.x) <= W / 2 + 1e-9 && Math.abs(g.y) <= H / 2 + 1e-9); assert.ok(near(Math.abs(g.x), W / 2, 1e-9) || near(Math.abs(g.y), H / 2, 1e-9), 'on the edge');
  }
});

test('a peel: the edge taken lands as far along as the finger went; half over, the card is turned', () => {
  assert.equal(peel(0, 0, .005, .005), null);
  for (const [x0, y0, x, y] of [[0, -4, 0, -1], [-3, -4.2, -1, -2], [3, 0, 0, .5], [1, 4, 1.2, 1], [0, -4.4, .4, -4.1], [-2.9, 4.2, 1.5, -2]]) {
    const p = peel(x0, y0, x, y), D = Math.hypot(x - x0, y - y0), g = p.from, was = { s: g.x * p.dir[0] + g.y * p.dir[1] }, now = folded([g.x, g.y], p);
    assert.ok(near(was.s - now.s, D >= half ? D : D, 1e-5), `the edge drawn ${D.toFixed(2)} came in ${(was.s - now.s).toFixed(4)}`);
    assert.ok(near(Math.hypot(...p.dir), 1)); assert.ok(near(p.at.x * p.dir[0] + p.at.y * p.dir[1], p.s0), 'the fold passes through the point the edge was drawn through');
    assert.ok(now.up <= 2 * FOLD_R + 1e-9 && now.up >= 0);
    assert.equal(p.turned, p.s0 <= 0);
    // what lies beyond the fold stays where it was
    const far = folded([p.dir[0] * (p.s0 - 1), p.dir[1] * (p.s0 - 1)], p); assert.equal(far.up, 0); assert.ok(near(far.s, p.s0 - 1));
  }
  // (half over takes the edge all but the card's length: twice the way to its middle, less the half turn)
  assert.equal(peel(0, -4.4, 0, -3.4).turned, false); assert.equal(peel(0, -4.4, 0, 3).turned, false); assert.equal(peel(0, -4.4, 0, 3.3).turned, true);
  assert.deepEqual(squared([.8, .6]), [1, 0]); assert.deepEqual(squared([-.3, -.95]), [0, -1]); assert.ok(near(reach([1, 0]), W / 2) && near(reach([0, -1]), H / 2));
});

test('turned right over, the card lies face up where it lay', () => {
  for (const [x0, y0, x, y] of [[0, -4, 0, .6], [-3, -4.2, .5, .5], [3, 1, -.4, .6], [-2, 4.3, .3, -.4]]) {
    const p = peel(x0, y0, x, y), t0 = turnOver(p, 0), t1 = turnOver(p, 1);
    assert.ok(near(t0.dir[0], p.dir[0]) && near(t0.dir[1], p.dir[1]) && near(t0.s0, p.s0), 'it starts from the fold as it stands'); assert.equal(t0.back, 0); assert.equal(t0.down, 0);
    assert.deepEqual(t1.dir.map(v => Math.round(v * 1e9) / 1e9 + 0), squared(p.dir)); assert.ok(near(t1.s0, -reach(t1.to) - half), 'the fold has run on past the far edge'); assert.ok(near(t1.down, 2 * FOLD_R));
    // every point of the card: over the fold, drawn back, let down: its mirror about the card's middle, on the cloth
    for (const pt of [[0, 0], [W / 2, H / 2], [-W / 2, H / 2], [1, -3], [-2.2, .4]]) {
      const f = folded(pt, t1), s = pt[0] * t1.to[0] + pt[1] * t1.to[1];
      assert.ok(near(f.s + t1.back, -s, 1e-6), `${pt}: ${f.s + t1.back} for ${-s}`); assert.ok(near(f.up - t1.down, 0, 1e-6));
    }
    // and on the way the fold only ever moves on, the card only ever comes back
    let s = Infinity, b = -1; for (let e = 0; e <= 1.0001; e += .05) { const t = turnOver(p, Math.min(1, e)); assert.ok(near(Math.hypot(...t.dir), 1)); assert.ok(t.back >= b - 1e-9); b = t.back; if (e > .45) { assert.ok(t.s0 <= s + 1e-9); s = t.s0; } }
  }
});
