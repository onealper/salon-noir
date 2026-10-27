// The ball and the wheel: the number is drawn at the call, and the simulated spin must put the ball in that number's
// pocket, every time (the sign conventions are shared by physics.mjs, wheel3d.mjs and the roulette controller).
// The spin itself must look like a real wheel's: a long run on the track, never fewer than the regulators' four
// laps, no jump as the ball leaves the track, the wheelhead at a croupier's speed and never pushed: the most it does
// is make up a pocket or two by a gentle swell in its speed between the call and the ball landing on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, at, simulate, mulberry, duration, GEO, THROW, AIM } from '../src/roulette/physics.mjs';
import { WHEEL_INDEX, PITCH, POCKETS } from '../src/roulette/rules.mjs';

const spins = [];
for (let i = 0; i < 370; i++) {
  const n = i % 37, dir = i % 2 ? 1 : -1, fast = i % 3 === 0, phiNow = i % 10 === 9 ? 1e4 + i : (i * .7) % (2 * Math.PI);
  spins.push({ n, fast, p: plan(n, { dir, phiNow, fast, seed: (i * 2654435761) >>> 0 }) });
}

test('370 spins aimed from the launch rest in the drawn number\'s pocket (both directions, fast play, a wheel idled for hours)', () => {
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
    const laps = Math.abs(p.drop.th - at(p, p.callAt).theta) / (2 * Math.PI);   // (the last rounds run a few per cent quicker or slower: see the aim)
    assert.ok(laps > (fast ? .64 : 1.34) && laps < (fast ? 1.71 : 2.41), `"No more bets" ${laps.toFixed(2)} laps before the drop`);
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

test('the wheelhead turns at a croupier\'s 15-20 rpm and is never pushed: it makes up at most two pockets, gently, before the ball lands', () => {
  for (const { p } of spins) {
    const rpm = p.opts.rotorSpeed * 60 / (2 * Math.PI); assert.ok(rpm >= 15 && rpm <= 20.1, `${rpm.toFixed(1)} rpm`);
    assert.ok(Number.isInteger(p.m) && Math.abs(p.m) <= 2, `${p.m} pockets made up`);
    const S = p.samples, k = t => S.findIndex(s => s[0] >= t), lead = i => at(p, S[i][0]).phi - S[i][4];   // the played wheelhead against the simulated one, sample by sample
    const call = k(p.callAt), land = k(p.landAt + .02);
    for (const i of [0, call >> 1, call - 1]) assert.ok(Math.abs(lead(i)) < 1e-9, 'nothing before the call');
    for (const i of [land, k(p.settledAt), S.length - 1]) assert.ok(Math.abs(lead(i) - p.m * PITCH) < 1e-6, 'made up by the landing, and no more after');
    // never a jolt: frame to frame, its speed stays within a sixth of its own while the lead is made up
    for (let i = call; i < land; i++) {
      const w = (lead(i + 1) - lead(i)) + (S[i + 1][4] - S[i][4]), own = S[i + 1][4] - S[i][4];
      assert.ok(Math.abs(w / own - 1) < 1 / 6, `speed ${(100 * (w / own - 1)).toFixed(1)}% off its own at ${S[i][0].toFixed(2)} s`);
    }
  }
});

test('bets close at the call: the number is drawn then, and the run until the call is untouched by it', () => {
  for (let i = 0; i < 74; i++) {
    const n = (i * 7) % 37, phiNow = (i * .37) % 6, p = plan(null, { dir: i % 2 ? 1 : -1, phiNow, fast: i % 4 === 0, seed: (i * 40503 + 9) >>> 0, rotorSpeed: 1.6 + (i % 6) * .1 });
    assert.ok(Math.abs(at(p, 0).phi - phiNow) < .01, 'the wheelhead goes on from where the croupier left it');   // (the first sample is one step in)
    const ts = [0, p.callAt / 3, p.callAt * .9, p.callAt - 1 / 30], before = ts.map(t => { const a = at(p, t); return [a.theta, a.r, a.phi]; });
    for (let k = 0; k < 24; k++) p.warm();   // while the ball runs, a try a frame (the game makes AIM.tries)
    p.aim(n);   // the number, drawn at the call
    assert.deepEqual(ts.map(t => { const a = at(p, t); return [a.theta, a.r, a.phi]; }), before, 'ball and wheelhead as they were, up to the call');
    const st = at(p, p.settledAt + .12), pocket = ((Math.round((st.phi - st.theta) / PITCH) % POCKETS) + POCKETS) % POCKETS;
    assert.equal(pocket, WHEEL_INDEX[n], `spin ${i}: ball under ${n}`);
    assert.ok(Math.abs(p.opts.rotorSpeed - (1.6 + (i % 6) * .1)) < 1e-12);
  }
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
