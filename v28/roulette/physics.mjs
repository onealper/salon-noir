// The ball and the wheel, simulated. Units: centimetres, seconds, radians; angles in the wheel's own
// frame, measured about its vertical axis. Three stages, after Small & Tse, "Predicting the outcome of
// roulette" (Chaos 22, 2012) and the wheel patents in the Phase 3 research:
//   track  the ball runs round the inclined ball track, slowed by rolling friction and air drag, until it
//          is too slow to hold the track (v² < g·R·tan α) and falls away;
//   cone   it spirals down the stator cone, now and then striking one of the eight diamonds;
//   rotor  it lands on the spinning wheelhead, skips over the frets, rebounds, and settles in a pocket.
// The whole spin is computed ahead in fixed steps from a seed, then played back. The result is drawn
// first: several spins are simulated, the one whose landing needs the smallest correction is kept, and the
// wheelhead is given a slightly different push so the pocket under the ball carries the drawn number. The
// frets repeat every pocket, so this changes nothing about how the ball moves.
import { PITCH, POCKETS, WHEEL_INDEX } from './rules.mjs';

export const G = 981;
// The wheel's shape (ball centre heights, relative to the rim of the bowl).
export const GEO = {
  ball: 1.05,                    // 21 mm resin ball
  trackR: 37.3, trackY: -1.9, trackSlope: 14.6 * Math.PI / 180,   // the ball leaves the track at about 150°/s, as filmed on a live wheel
  coneR0: 35.6, coneY0: -3.1, coneR1: 28.4, coneY1: -7.9,   // stator cone, down to the wheelhead
  deflR: 31.9, deflLen: 5.2, deflectors: 8,
  rotorR: 28.1,                  // outer edge of the wheelhead
  // proportions measured off a filmed live wheel: a wide number band (about 17% of the wheelhead's radius) and long pockets
  ringR0: 28.1, ringY0: -8.4, ringR1: 23.3, ringY1: -9.3,   // the number ring, sloping down to the pockets
  pocketR0: 23.3, pocketR1: 16.9, pocketY: -10.45, fretTop: 1.15,   // pocket floor and fret height
  pocketMid: 20.4,
};
const coneY = r => GEO.coneY1 + (r - GEO.coneR1) / (GEO.coneR0 - GEO.coneR1) * (GEO.coneY0 - GEO.coneY1);
const ringY = r => GEO.ringY1 + (r - GEO.ringR1) / (GEO.ringR0 - GEO.ringR1) * (GEO.ringY0 - GEO.ringY1);
// Height of the ball's centre resting on whatever is under it at radius r.
export function floorY(r) {
  const b = GEO.ball;
  if (r >= GEO.coneR0) return GEO.trackY;
  if (r > GEO.coneR1) return coneY(r) + b / Math.cos(Math.atan2(GEO.coneY0 - GEO.coneY1, GEO.coneR0 - GEO.coneR1));
  if (r > GEO.ringR1) return ringY(r) + b;
  return GEO.pocketY + b;
}
const CONE_SLOPE = Math.atan2(GEO.coneY0 - GEO.coneY1, GEO.coneR0 - GEO.coneR1);

export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// How long the ball holds the track at a given launch speed (closed form of v' = -a - k v²).
const A0 = 5;    // rolling friction, cm/s²: low, so the last laps slow gently (about 1.9 s, then 2.1 s, on a filmed live wheel)
function trackTime(v0, vc, k) { const s = Math.sqrt(k / A0); return (Math.atan(v0 * s) - Math.atan(vc * s)) / (A0 * s); }
function dragFor(v0, vc, T) { let lo = 1e-7, hi = .05; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (trackTime(v0, vc, m) > T) lo = m; else hi = m; } return (lo + hi) / 2; }

const DT = 1 / 240, SAMPLE = 1 / 60;
// The feel of the wheel, tuned so the stages last as long as on a real wheel (Phase 3 research):
// about 1 s spiralling down the cone, 1.5-3.5 s of scatter over 4-15 pockets.
export const TUNE = {
  coneSlope: 14 * Math.PI / 180, coneSpin: .55, coneDamp: .9,          // the cone's pull, spin lost to friction, radial damping
  rollF: 14, ringF: 14,                                                 // rolling friction among the frets / on the number ring (cm/s²)
  skipAbove: 28, skipOdds: .9, skipKeep: [.8, .12], skipHop: 1.2,      // skipping over a fret: above what speed, how often, speed kept, hop
  rebound: [.45, .3], reboundHop: .35, restBelow: 7, hopMax: 70,
};
// One spin from its parameters. Returns the samples (60 a second) and the events for the sound.
//   dir: +1 or -1, the ball's direction; the wheelhead turns the other way
//   theta0: where the ball is launched; phi0, rotorSpeed: the wheelhead's angle and speed at launch
//   trackT: seconds on the track; seed: all the small randomness
export function simulate({ dir = 1, theta0 = 0, phi0 = 0, rotorSpeed = 1.9, trackT = 6.2, v0 = 360, seed = 1 } = {}) {
  const rnd = mulberry(seed), R = GEO.trackR, vc = Math.sqrt(G * R * Math.tan(GEO.trackSlope)), k = dragFor(v0, vc, trackT);
  let t = 0, phase = 'track', th = theta0, v = v0, r = R, vr = 0, L = 0, h = 0, vh = 0, phi = phi0, wr = -dir * Math.abs(rotorSpeed), psiRate = 0;
  const hit = new Set(), samples = [], events = [{ t: 0, type: 'launch' }];
  let nextSample = 0, settledAt = null, pocket = null, fretCount = 0, crossed = 0, lastFret = null, psi = 0;   // psi: the ball's angle on the wheelhead
  const ROTOR_DECAY = .018;
  const steps = 60 / DT;
  for (let i = 0; i < steps; i++) {
    // the wheelhead coasts down very gradually
    wr -= wr * ROTOR_DECAY * DT; phi += wr * DT;
    if (phase === 'track') {
      v -= (A0 + k * v * v) * DT; th += dir * v / R * DT;
      if (v * v < G * R * Math.tan(GEO.trackSlope) * (1 + .03 * Math.cos(th - 1.1))) {   // a wheel is never perfectly level
        phase = 'cone'; L = r * v; r = GEO.coneR0; vr = -4; events.push({ t, type: 'drop' });
      }
    } else if (phase === 'cone') {
      const w = L / (r * r);
      // radial: gravity down the cone against the ball's swing outward; angular momentum bleeds to friction
      vr += (r * w * w * Math.cos(TUNE.coneSlope) - G * Math.sin(TUNE.coneSlope)) * DT; vr *= 1 - TUNE.coneDamp * DT;
      L -= L * TUNE.coneSpin * DT; r += vr * DT; th += dir * w * DT;
      if (h > 0 || vh > 0) { vh -= G * DT; h = Math.max(0, h + vh * DT); if (h === 0) vh = 0; }
      // the diamonds: eight, alternately upright (across the ball's path) and flat (along it)
      if (Math.abs(r - GEO.deflR) < 1.6 && h < .6) {
        const j = Math.round((th / (Math.PI * 2 / GEO.deflectors)) - .5), a = (j + .5) * Math.PI * 2 / GEO.deflectors, d = (((th - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        const across = ((j % 2) + 2) % 2 === 0, half = (across ? .9 : GEO.deflLen / 2) / r;
        if (Math.abs(d) < half && !hit.has(j)) {
          hit.add(j);
          const s = L / r, keep = across ? .38 + rnd() * .25 : .72 + rnd() * .2;
          L *= keep; vh = (across ? 36 : 18) + rnd() * 30; vr += (rnd() - .6) * 22;
          events.push({ t, type: 'deflector', power: Math.min(1, s / 160) * (across ? 1 : .6) });
        }
      }
      if (r <= GEO.rotorR) { phase = 'rotor'; psi = th - phi; psiRate = dir * (L / (r * r)) - wr; events.push({ t, type: 'land', power: Math.min(1, Math.abs(psiRate) * r / 150) }); vh = Math.max(vh, 14 + rnd() * 16); }
    } else if (phase === 'rotor') {
      // in the wheelhead's frame: the ball's angle relative to it (psi), sliding in over the number ring
      const target = GEO.pocketMid + (rnd() - .5) * .8;
      vr += ((target - r) * 90 - vr * 11) * DT; r += vr * DT;
      if (h > 0 || vh > 0) { vh -= G * DT; h = Math.max(0, h + vh * DT); if (h === 0) { if (vh < -30) events.push({ t, type: 'bounce', power: Math.min(1, -vh / 120) }); vh = Math.abs(vh) > 40 ? -vh * .28 : 0; } }
      // rolling friction in the pocket ring (stronger once it is down among the frets)
      const f = (r < GEO.pocketR0 ? TUNE.rollF : TUNE.ringF) / r;
      if (Math.abs(psiRate) > f * DT) psiRate -= Math.sign(psiRate) * f * DT; else psiRate = 0;
      let npsi = psi + psiRate * DT;
      // frets at the pocket edges: (i + 1/2) pitches
      if (r < GEO.pocketR0 + .2 && h < GEO.fretTop * .9) {
        const a = Math.floor(psi / PITCH - .5), b = Math.floor(npsi / PITCH - .5);
        if (a !== b) {
          const s = Math.abs(psiRate) * r;
          fretCount++; lastFret = t;
          if (s > TUNE.skipAbove && rnd() < TUNE.skipOdds) { psiRate *= TUNE.skipKeep[0] + rnd() * TUNE.skipKeep[1]; vh = Math.min(TUNE.hopMax, TUNE.skipHop * s * (.7 + rnd() * .5)); crossed++; }   // skips over
          else { psiRate = -psiRate * (TUNE.rebound[0] + rnd() * TUNE.rebound[1]); vh = TUNE.reboundHop * s * rnd(); npsi = psi; }                                // bounces back
          events.push({ t, type: 'fret', power: Math.min(1, s / 140) });
        }
      }
      psi = npsi; th = psi + phi;
      // it comes to rest when it is barely moving in its pocket
      if (h === 0 && Math.abs(psiRate) * r < TUNE.restBelow && r < GEO.pocketR0 && Math.abs(vr) < 4 && t - (lastFret ?? 0) > .12) {
        pocket = ((Math.round(-psi / PITCH) % POCKETS) + POCKETS) % POCKETS; phase = 'rest'; settledAt = t; events.push({ t, type: 'settle' });
      }
    } else {
      // resting: the ball eases to the middle of its pocket and rides round with the wheelhead
      const c = -pocket * PITCH, goal = c + Math.round((psi - c) / (Math.PI * 2)) * Math.PI * 2;
      psi += (goal - psi) * Math.min(1, 6 * DT); th = phi + psi; r += (GEO.pocketMid - r) * Math.min(1, 6 * DT);
      if (t - settledAt > 3) break;
    }
    if (t >= nextSample) { samples.push([t, th, r, floorY(r) + h, phi, phase === 'track' ? 0 : phase === 'cone' ? 1 : phase === 'rotor' ? 2 : 3, phase === 'track' ? v : phase === 'cone' ? L / r : Math.abs(psiRate) * r]); nextSample += SAMPLE; }
    t += DT;
  }
  return { samples, events, pocket, settledAt, dir, rotorSpeed, crossed, frets: fretCount, dropAt: events.find(e => e.type === 'drop')?.t };
}

// A spin to a drawn number. Several spins are tried; the one needing the least extra turn of the
// wheelhead wins, and that extra turn is given at the croupier's push and fades out long before the
// ball reaches the wheelhead. `phiNow`: the wheelhead's angle when the ball is launched.
export function plan(result, { dir = 1, phiNow = 0, fast = false, seed = (Math.random() * 2 ** 32) >>> 0, tries = 12 } = {}) {
  const rnd = mulberry(seed); let best = null;
  for (let i = 0; i < tries; i++) {
    const opts = { dir, theta0: rnd() * Math.PI * 2, phi0: phiNow, rotorSpeed: 1.25 + rnd() * .25, trackT: (fast ? 5.6 : 9.4) + (rnd() - .5) * (fast ? .6 : 1.2), v0: (fast ? 330 : 360) + rnd() * 40, seed: (rnd() * 2 ** 32) >>> 0 };
    const s = simulate(opts); if (s.pocket == null) continue;
    // extra pockets the wheelhead must turn (in its own direction) so the ball's pocket carries `result`
    // pockets run clockwise (pocket i sits i pitches clockwise of zero), so turning the wheelhead by
    // (i_result - i_landed) pitches puts the drawn number under the ball
    const need = ((WHEEL_INDEX[result] - s.pocket) % POCKETS + POCKETS) % POCKETS;
    const rot = Math.sign(-dir);                            // the wheelhead turns opposite to the ball
    const k = rot > 0 ? need : (POCKETS - need) % POCKETS;   // pockets to add in the direction it already turns
    const extra = k * PITCH;
    if (!best || extra < best.extra) best = { ...s, opts, extra, k };
  }
  // the extra turn: given at the push, fading out by the time the ball leaves the track
  const T = Math.max(1, best.dropAt - .4), e0 = 3 * best.extra / T, rot = Math.sign(-dir);
  best.rotorAt = t => t >= T ? rot * best.extra : rot * best.extra * (1 - (1 - t / T) ** 3);
  best.result = result; best.T = T; best.e0 = e0;
  return best;
}
// Where things are at time t (seconds since launch), interpolated from the samples.
export function at(spin, t) {
  const S = spin.samples, i = Math.min(S.length - 2, Math.max(0, Math.floor(t * 60))), a = S[i], b = S[i + 1], f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1)));
  const lerp = (x, y) => x + (y - x) * f;
  const phi = lerp(a[4], b[4]) + spin.rotorAt(t);
  // the ball keeps its own path: the correction is whole pockets, so the frets it meets are where they were
  return { theta: lerp(a[1], b[1]), r: lerp(a[2], b[2]), y: lerp(a[3], b[3]), phi, phase: a[5], speed: lerp(a[6], b[6]) };
}
export const duration = spin => spin.samples.at(-1)[0];
