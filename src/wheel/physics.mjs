// The money wheel's motion: a heavy wheel on a bearing, a peg at every segment's edge, and a leather flapper at the
// top that each peg has to bend aside to pass. The pegs are what stop it: every one that passes takes the same small
// energy with it (the flapper snaps free and slaps back: the clack), so the wheel slows evenly, the clacks draw apart,
// and at the end a peg comes that it cannot quite push past: the flapper bends, holds, and sets the wheel back to rock
// to rest between two pegs. Where it rests is the segment read.
//
// The result is drawn before the spin (wheel/rules.mjs) and the spin is found for it: how hard the host pulls, tried
// ahead in this same simulation until one comes to rest in the drawn segment (`plan`). Nothing is pushed on the way:
// the wheel shown is the one simulated, start to rest. Angles are the wheel's turn in radians, growing as it spins; the
// flapper reads the segment floor(angle / PITCH). Units: the wheel's inertia is 1. No DOM in here.
import { COUNT, PITCH } from './rules.mjs';

export const PHYS = {
  reach: .02,      // how far before the flapper's line a peg meets it (rad)
  slip: .026,      // how far past the line it has bent the flapper when that slips off
  spring: 16.6,    // the flapper's stiffness (1/s²): a peg that passes takes spring·(reach + slip)² of the wheel's speed squared
  give: .3,        // the share of its bend the leather gives back as it straightens (the rest is lost): the rock dies in two or three
  drag: .045,      // the bearing (rad/s²)
  flick: .075,     // the blow of each peg on the flapper, which grows with the speed squared (1/rad): a fast wheel slows fast
  pull: .55,       // the host's pull: seconds from rest to full speed
  fps: 120, sub: 8,     // the way is kept 120 times a second, and worked out in 8 steps between
  speeds: [4.5, 11],    // the pulls tried (rad/s)
  turns: [2.6, 4.4],    // how far a spin runs, in turns of the wheel
};
const smooth = u => u * u * (3 - 2 * u);
export const segmentAt = angle => ((Math.floor(angle / PITCH) % COUNT) + COUNT) % COUNT;

// One spin from rest at `from`, pulled up to `w0`: where it comes to rest (`end`) and when (`T`). With `rec`, the way
// there as well (and `calm`, when it is as good as at rest): the angle and the flapper's bend `fps` times a second, and each clack (`t`, the wheel's speed `w`
// as the peg passed; `soft`: a peg that met the flapper and fell back, at the moment they met).
export function simulate(from, w0, rec = false, P = PHYS) {
  const { reach: a, slip: b, spring: k, give, drag, flick, pull, fps, sub } = P, dt = 1 / (fps * sub);
  let phi = from, w = 0, t = 0, eng = null, met = null, still = 0, flap = 0, flapV = 0;
  const phis = rec ? [from] : null, flaps = rec ? [0] : null, clicks = rec ? [] : null;
  for (let i = 1; i < 6e4; i++) {
    // the flapper and the peg at it: the next peg to come bends it forward; the last one past bends it back, if the wheel rocks onto it
    if (!eng) {
      if (w > 0) { const n = Math.floor(phi / PITCH) + 1; if (phi >= n * PITCH - a) { eng = { n, dir: 1 }; met = { t, w, soft: true }; } }
      else if (w < 0) { const n = Math.floor(phi / PITCH); if (phi <= n * PITCH + a) { eng = { n, dir: -1 }; met = { t, w: -w, soft: true }; } }
    }
    let ts = 0;
    if (eng) {
      const d = eng.dir > 0 ? phi - (eng.n * PITCH - a) : phi - (eng.n * PITCH + a);   // its bend: forward positive
      if (eng.dir > 0 ? d >= a + b : d <= -(a + b)) { clicks?.push({ t, w: Math.abs(w) }); flap = eng.dir * (a + b); flapV = 0; eng = null; }   // past: it snaps free
      else if (eng.dir > 0 ? d < 0 : d > 0) { if (met.w > .03) clicks?.push(met); eng = null; flap = 0; flapV = 0; }   // set back off it: the peg only thumped the leather
      else { ts = -k * d * ((eng.dir > 0 ? w > 0 : w < 0) ? 1 : give); flap = d; }
    }
    if (!eng && (flap || flapV)) { flapV += (-12000 * flap - 70 * flapV) * dt; flap += flapV * dt; if (Math.abs(flap) < 1e-5 && Math.abs(flapV) < 1e-3) flap = flapV = 0; }   // free, the flapper swings back and settles
    if (t < pull) w = w0 * smooth((t + dt) / pull);   // the pull: the host's hand sets the speed
    else {
      let w1 = w + ts * dt; const fr = (drag + flick * w1 * w1) * dt;
      if (Math.abs(w1) <= fr) w1 = 0; else w1 -= Math.sign(w1) * fr;
      w = w1;
      if (w === 0 && Math.abs(ts) <= drag) { if ((still += dt) > .05) break; } else still = 0;
    }
    phi += w * dt; t = i * dt;
    if (rec && i % sub === 0) { phis.push(phi); flaps.push(flap); }
  }
  if (!rec) return { end: phi, T: t };
  phis.push(phi); flaps.push(eng ? flap : 0);   // (the frame it is at rest by)
  // `calm`: when the wheel is as good as at rest (within a few millimetres at the rim of where it stays), the last of its rock too small to see
  let calm = phis.length - 1; while (calm > 0 && Math.abs(phis[calm - 1] - phi) < .004) calm--;
  return { from, w0, end: phi, T: t, calm: calm / fps, fps, phis: Float64Array.from(phis), flaps: Float32Array.from(flaps), clicks };
}

// The spin for a drawn segment: from where the wheel stands, a pull that brings it to rest there after a few turns.
// The harder the pull the farther it runs, so the pulls that end in the segment are one stretch of speeds, found by
// halving; one inside it is taken (`random`), anywhere from only just over the last peg to all but over the next.
export function plan(target, { from = 0, random = Math.random, P = PHYS } = {}) {
  const here = Math.floor(from / PITCH), [t0, t1] = P.turns, lo = Math.ceil(t0 * COUNT), hi = Math.floor(t1 * COUNT), want = [];
  for (let k = here + lo; k <= here + hi; k++) if (((k % COUNT) + COUNT) % COUNT === target) want.push(k);
  const K = want[Math.floor(random() * want.length)] ?? here + lo + ((target - (here + lo)) % COUNT + COUNT) % COUNT;
  const seg = w => Math.floor(simulate(from, w, false, P).end / PITCH);
  const least = k => { let [l, h] = P.speeds; for (let i = 0; i < 26; i++) { const m = (l + h) / 2; if (seg(m) >= k) h = m; else l = m; } return h; };   // the least pull that reaches segment k
  const wa = least(K), wb = least(K + 1), u = .06 + .88 * random();
  for (const w of [wa + (wb - wa) * u, (wa + wb) / 2, wa + (wb - wa) * .25, wa + (wb - wa) * .75]) {
    const s = simulate(from, w, true, P);
    if (Math.floor(s.end / PITCH) === K) return { ...s, target, segment: K };
  }
  throw new Error(`no spin found for segment ${target}`);
}

// The wheel `t` seconds into a planned spin: its angle, the flapper's bend and the speed.
export function at(p, t) {
  const n = p.phis.length - 1, x = Math.max(0, Math.min(n, t * p.fps)), i = Math.min(n - 1, Math.floor(x)), f = x - i;
  return { angle: p.phis[i] + (p.phis[i + 1] - p.phis[i]) * f, flap: p.flaps[i] + (p.flaps[i + 1] - p.flaps[i]) * f, w: (p.phis[i + 1] - p.phis[i]) * p.fps, done: t >= p.T };
}
