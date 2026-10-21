// The ball and the wheel: the number is drawn first, and the simulated spin must put the ball in that number's
// pocket, every time (the sign conventions are shared by physics.mjs, wheel3d.mjs and the roulette controller).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, at, simulate, mulberry, duration } from '../src/roulette/physics.mjs';
import { WHEEL_INDEX, PITCH, POCKETS } from '../src/roulette/rules.mjs';

test('1,110 planned spins rest in the drawn number\'s pocket (both directions, fast play, a wheel idled for hours)', () => {
  let slowest = 0, quickest = Infinity;
  for (let i = 0; i < 1110; i++) {
    const n = i % 37, dir = i % 2 ? 1 : -1, fast = i % 3 === 0, phiNow = i % 10 === 9 ? 1e4 + i : (i * .7) % (2 * Math.PI);
    const p = plan(n, { dir, phiNow, fast, seed: (i * 2654435761) >>> 0 });
    const st = at(p, p.settledAt + .12), pocket = ((Math.round((st.phi - st.theta) / PITCH) % POCKETS) + POCKETS) % POCKETS;
    assert.equal(pocket, WHEEL_INDEX[n], `spin ${i}: ball under ${n}`);
    for (const v of [st.theta, st.r, st.y, st.phi]) assert.ok(Number.isFinite(v));
    assert.ok(duration(p) >= p.settledAt); slowest = Math.max(slowest, p.settledAt); quickest = Math.min(quickest, p.settledAt);
  }
  assert.ok(quickest > 3 && slowest < 16, `settles between ${quickest.toFixed(1)} and ${slowest.toFixed(1)} s`);
});

test('the raw simulation always settles in some pocket, spread evenly over the wheel', () => {
  const rnd = mulberry(42), f = new Array(37).fill(0), N = 1850;
  for (let i = 0; i < N; i++) {
    const s = simulate({ dir: i % 2 ? 1 : -1, theta0: rnd() * 6.28, rotorSpeed: 1.25 + rnd() * .25, trackT: 9.4 + (rnd() - .5) * 1.2, v0: 360 + rnd() * 40, seed: (rnd() * 2 ** 32) >>> 0 });
    assert.ok(Number.isInteger(s.pocket), `spin ${i} settled`); f[s.pocket]++;
  }
  const chi = f.reduce((s, x) => s + (x - N / 37) ** 2 / (N / 37), 0); assert.ok(chi < 80, `chi-squared ${chi.toFixed(1)}`);   // seeded: the same every run
});
