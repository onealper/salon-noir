// The ball and the wheel: the number is drawn first, and the simulated spin must put the ball in that number's
// pocket, every time (the sign conventions are shared by physics.mjs, wheel3d.mjs and the roulette controller).
// The spin itself must look like a real wheel's: a long run on the track, never fewer than the regulators' four
// laps, no jump as the ball leaves the track, the wheelhead at a croupier's speed and never seen being pushed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, at, simulate, mulberry, duration, GEO, THROW, TUNE } from '../src/roulette/physics.mjs';
import { WHEEL_INDEX, PITCH, POCKETS } from '../src/roulette/rules.mjs';

const spins = [];
for (let i = 0; i < 1110; i++) {
  const n = i % 37, dir = i % 2 ? 1 : -1, fast = i % 3 === 0, phiNow = i % 10 === 9 ? 1e4 + i : (i * .7) % (2 * Math.PI);
  spins.push({ n, fast, p: plan(n, { dir, phiNow, fast, seed: (i * 2654435761) >>> 0 }) });
}

test('1,110 planned spins rest in the drawn number\'s pocket (both directions, fast play, a wheel idled for hours)', () => {
  let slowest = 0, quickest = Infinity;
  for (const [i, { n, p }] of spins.entries()) {
    const st = at(p, p.settledAt + .12), pocket = ((Math.round((st.phi - st.theta) / PITCH) % POCKETS) + POCKETS) % POCKETS;
    assert.equal(pocket, WHEEL_INDEX[n], `spin ${i}: ball under ${n}`);
    for (const v of [st.theta, st.r, st.y, st.phi]) assert.ok(Number.isFinite(v));
    assert.ok(duration(p) >= p.settledAt); slowest = Math.max(slowest, p.settledAt); quickest = Math.min(quickest, p.settledAt);
  }
  assert.ok(quickest > 8 && slowest < 20, `settles between ${quickest.toFixed(1)} and ${slowest.toFixed(1)} s`);
});

test('a real run on the track: 13-15 laps in about 14 s, at least 5 in fast play (the regulators ask for 4); the call 1-2 laps before the drop', () => {
  for (const { fast, p } of spins) {
    if (fast) { assert.ok(p.laps >= 5, `fast: ${p.laps.toFixed(2)} laps`); assert.ok(p.dropAt > 7 && p.dropAt < 10); }
    else { assert.ok(p.laps >= 12.5 && p.laps <= 15.5, `${p.laps.toFixed(2)} laps`); assert.ok(p.dropAt > 12.5 && p.dropAt < 15.5, `${p.dropAt.toFixed(1)} s`); }
    const laps = Math.abs(p.drop.th - at(p, p.callAt).theta) / (2 * Math.PI);
    assert.ok(laps > (fast ? 1 : 1.7) && laps < (fast ? 1.3 : 2), `"No more bets" ${laps.toFixed(2)} laps before the drop`);
  }
});

test('the ball rides the wall, slides down the track as it slows and rolls off without a jump', () => {
  for (const { p, fast } of spins.slice(0, 300)) {
    const S = p.samples, near = t => p.events.some(e => e.type !== 'drop' && e.type !== 'launch' && Math.abs(e.t - t) < .05);
    if (!fast) assert.ok(S[0][2] > GEO.wallR - GEO.ball - .2, `thrown hard, it rides against the wall (r ${S[0][2].toFixed(2)})`);
    else assert.ok(S[0][2] > GEO.wallR - 2.5, `thrown softly, it rides high on the flare (r ${S[0][2].toFixed(2)})`);
    for (let k = 1; k < S.length; k++) {
      if (near(S[k][0])) continue;   // a canoe, a fret or the landing knocks it about: that is no jump
      assert.ok(S[k - 1][2] - S[k][2] < 1, `inward step ${(S[k - 1][2] - S[k][2]).toFixed(2)} cm at ${S[k][0].toFixed(2)} s`);
      assert.ok(Math.abs(S[k - 1][3] - S[k][3]) < 1.2, `height step at ${S[k][0].toFixed(2)} s`);
    }
    const d = S.findIndex(s => s[5] === 1), w = s => s[6] / s[2];   // angular speed either side of the drop (unless a canoe is struck there)
    if (!near(S[d][0])) assert.ok(Math.abs(w(S[d]) / w(S[d - 1]) - 1) < .03, `angular speed at the drop jumps ${(w(S[d]) / w(S[d - 1]) - 1).toFixed(3)}`);
  }
});

test('the wheelhead turns at a croupier\'s 15-20 rpm, coasts, and is never seen pushed (the correction is made at the launch)', () => {
  for (const { p } of spins) {
    const rpm = p.opts.rotorSpeed * 60 / (2 * Math.PI); assert.ok(rpm >= 15 && rpm <= 20.1, `${rpm.toFixed(1)} rpm`);
    const S = p.samples, off = k => at(p, S[k][0]).phi - S[k][4];   // the played wheelhead against the simulated one
    for (const k of [1, S.length >> 2, S.length >> 1, S.length - 2]) assert.ok(Math.abs(off(k) - off(0)) < 1e-6, 'the same whole-pocket turn throughout');
    assert.ok(Number.isInteger(p.k) && p.k >= 0 && p.k < POCKETS);
  }
});

test('leaving the track preserves angular momentum; a collision-free first integration step changes speed by less than 1.3%', () => {
  let firstSteps = 0;
  for (const { p } of spins) {
    const s = p.samples.find(x => x[5] === 1);
    if (p.events.some(e => e.type === 'deflector' && e.t <= s[0] + 1e-9)) continue;
    const steps = Math.round((s[0] - p.dropAt) * 240) + 1;
    const momentum = s[2] * s[6], before = p.drop.r * p.drop.v;
    assert.ok(Math.abs(momentum / before - (1 - TUNE.coneSpin / 240) ** steps) < 1e-9, 'the drop adds no angular impulse beyond rolling friction');
    // A 60 Hz sample may span four integration steps and legitimate radial acceleration.
    // Check the actual first 1/240 s step separately instead of treating that acceleration as a jump.
    if (steps === 1) {
      firstSteps++;
      assert.ok(Math.abs((s[6] / s[2]) / (p.drop.v / p.drop.r) - 1) < .013);
    }
  }
  assert.ok(firstSteps > 100, `${firstSteps} collision-free first steps checked`);
});

test('the ball rests out against its pocket\'s outer wall, and the canoes knock it about as on a real wheel', () => {
  const hits = [0, 0, 0, 0];
  for (const { p } of spins) { assert.ok(Math.abs(at(p, p.settledAt + 2).r - GEO.restR) < .05); hits[Math.min(3, p.deflectors)]++; }
  assert.ok(hits[1] > hits[2] && hits[2] > 0, `canoe hits 0/1/2/3+: ${hits.join(' / ')}`);
});

test('the raw simulation always settles in some pocket, spread evenly over the wheel', () => {
  const rnd = mulberry(42), f = new Array(37).fill(0), N = 1850, [a, b] = THROW.normal;
  for (let i = 0; i < N; i++) {
    const s = simulate({ dir: i % 2 ? 1 : -1, theta0: rnd() * 6.28, phi0: rnd() * 6.28, rotorSpeed: 1.6 + rnd() * .5, v0: (a + (b - a) * rnd()) * 2 * Math.PI * 39.35, seed: (rnd() * 2 ** 32) >>> 0 });
    assert.ok(Number.isInteger(s.pocket), `spin ${i} settled`); f[s.pocket]++;
  }
  const chi = f.reduce((s, x) => s + (x - N / 37) ** 2 / (N / 37), 0); assert.ok(chi < 80, `chi-squared ${chi.toFixed(1)}`);   // seeded: the same every run
});

test('raw simulations can be played back without a drawn-number correction', () => {
  for (const [i, { p }] of spins.slice(0, 40).entries()) {
    const s = simulate({ ...p.opts, seed: i + 1 });
    for (const t of [0, s.dropAt / 2, s.dropAt + .2, s.settledAt + .12]) {
      const b = at(s, t);
      for (const v of [b.theta, b.r, b.y, b.phi, b.speed]) assert.ok(Number.isFinite(v));
    }
    const b = at(s, s.settledAt + .12), pocket = ((Math.round((b.phi - b.theta) / PITCH) % POCKETS) + POCKETS) % POCKETS;
    assert.equal(pocket, s.pocket, `raw spin ${i}: rests in its simulated pocket`);
  }
});

test('playback stays continuous across frame boundaries when sample timestamps drift from 60 Hz', () => {
  for (const { p } of spins.slice(0, 16)) {
    for (let frame = 1; frame / 60 < duration(p); frame++) {
      const t = frame / 60, a = at(p, t - 1e-7), b = at(p, t + 1e-7);
      const distance = Math.hypot(a.r * Math.cos(a.theta) - b.r * Math.cos(b.theta), a.y - b.y, a.r * Math.sin(a.theta) - b.r * Math.sin(b.theta));
      assert.ok(distance < .001, `frame ${frame}: ball jumps ${distance.toFixed(4)} cm`);
      assert.ok(Math.abs(a.phi - b.phi) < 1e-5, `frame ${frame}: wheelhead jumps`);
    }
    for (const sample of p.samples) {
      const b = at(p, sample[0]);
      assert.ok(Math.abs(b.theta - sample[1]) < 1e-9, 'each stored ball position is reproduced at its own timestamp');
      assert.ok(Math.abs(b.phi - sample[4] - p.rotorAt(sample[0])) < 1e-9);
    }
  }
});
