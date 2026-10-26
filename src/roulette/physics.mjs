// The ball and the wheel, simulated. Units: centimetres, seconds, radians; angles in the wheel's own
// frame, measured about its vertical axis. Three stages, after Small & Tse, "Predicting the outcome of
// roulette" (Chaos 22, 2012), Eichberger's track model and the published wheel patents:
//   track  the ball runs round the ball track pressed against the rim's wall, slowed by rolling friction and
//          air drag (v' = -a - k·v², the wheel's own constants). As it slows it slides down the curved flare
//          of the track, always where the track's bank matches its speed, until even the flattest part is too
//          steep for it (v² < g·r·tan α) and it rolls off onto the stator;
//   cone   it spirals down the stator cone, now and then striking one of the eight canoes;
//   rotor  it lands on the spinning wheelhead, skips over the frets, rebounds, and settles in a pocket.
// The whole spin is computed ahead in fixed steps, then played back. The track stage holds no chance at all
// (it follows from the croupier's throw); the small randomness of the canoes and frets starts at the drop.
// The result is drawn first: from the ball's drop, several descents are tried and the one landing nearest
// the drawn number is kept, the remaining whole pockets made up by turning the wheelhead, given while the
// picture is black at the launch. The frets repeat every pocket, so this changes nothing about how the ball
// moves.
import { PITCH, POCKETS, WHEEL_INDEX } from './rules.mjs';
import { mulberry } from '../core/rng.mjs';

export const G = 981;
const D = Math.PI / 180;
// The wheel's shape (heights relative to the rim of the bowl), after an 83 cm studio wheel.
export const GEO = {
  ball: 1.05,                    // 21 mm ball, one of the two sizes the wheel makers sell
  wallR: 40.4, rimR: 41.8,       // the foot of the rim's wall (the ball rides against it), the bowl's outer edge
  coneR0: 35.6, coneY0: -5.3, coneR1: 28.4, coneY1: -7.9,   // stator cone (about 20°), down to the wheelhead
  deflR: 31.9, deflLen: 5.2, deflW: 1, deflectors: 8,       // canoes 5.2 cm long (US 6,047,965), alternately radial and tangential
  rotorR: 28.1,                  // outer edge of the wheelhead
  // proportions measured off a filmed live wheel: a wide number band (about 17% of the wheelhead's radius) and long pockets
  ringR0: 28.1, ringY0: -8.4, ringR1: 23.3, ringY1: -9.3,   // the number ring, sloping down to the pockets
  pocketR0: 23.3, pocketR1: 16.9, pocketY: -10.45, fretTop: 1.15,   // pocket floor and fret height
  pocketMid: 20.4,
};
GEO.restR = GEO.pocketR0 - GEO.ball - .1;   // a ball at rest is carried out against its pocket's outer wall by the turning wheelhead

// The ball track: a flare from the stator's edge (about 17°) curving up into the rim's wall (72° at its foot).
// A ball held at speed v sits where the track's bank matches it: tan α = v² / (g·r).
const S0 = 16.7 * D, S1 = 72 * D, FLARE = 3;
const slopeU = u => S0 + (S1 - S0) * u ** FLARE;
export const TRACK = (() => {   // contact surface, [r, y], from the stator's edge to the foot of the wall
  const n = 96, w = GEO.wallR - GEO.coneR0, pts = []; let y = GEO.coneY0;
  for (let i = 0; i <= n; i++) { pts.push([GEO.coneR0 + w * i / n, y]); y += Math.tan(slopeU((i + .5) / n)) * w / n; }
  return pts;
})();
GEO.wallY = TRACK.at(-1)[1];
const trackY = u => { const f = u * (TRACK.length - 1), i = Math.min(TRACK.length - 2, Math.floor(f)); return TRACK[i][1] + (TRACK[i + 1][1] - TRACK[i][1]) * (f - i); };
// where the ball's centre rides at speed v: [radius, height], and the bank there
function onTrack(v) {
  let rc = GEO.wallR - GEO.ball, u = 1;
  for (let i = 0; i < 3; i++) { const need = Math.atan(v * v / (G * rc)); u = need >= S1 ? 1 : need <= S0 ? 0 : ((need - S0) / (S1 - S0)) ** (1 / FLARE); const s = slopeU(u); rc = GEO.coneR0 + u * (GEO.wallR - GEO.coneR0) - GEO.ball * Math.sin(s); }
  const s = slopeU(u);
  return [GEO.coneR0 + u * (GEO.wallR - GEO.coneR0) - GEO.ball * Math.sin(s), trackY(u) + GEO.ball * Math.cos(s), u];
}

const CONE = Math.atan2(GEO.coneY0 - GEO.coneY1, GEO.coneR0 - GEO.coneR1);
const coneY = r => GEO.coneY1 + (r - GEO.coneR1) / (GEO.coneR0 - GEO.coneR1) * (GEO.coneY0 - GEO.coneY1);
const ringY = r => GEO.ringY1 + (r - GEO.ringR1) / (GEO.ringR0 - GEO.ringR1) * (GEO.ringY0 - GEO.ringY1);
// Height of the ball's centre resting on whatever is under it at radius r (the track's lowest part, the stator
// and the wheelhead).
export function floorY(r) {
  const b = GEO.ball;
  if (r >= GEO.coneR0) { const u = Math.min(1, (r - GEO.coneR0) / (GEO.wallR - GEO.coneR0)); return trackY(u) + b / Math.cos(slopeU(u)); }
  if (r > GEO.coneR1) return coneY(r) + b / Math.cos(CONE);
  if (r > GEO.ringR1) return ringY(r) + b;
  return GEO.pocketY + b;
}

export { mulberry };   // (core/rng.mjs: the same generator as the ?seed shoe)

const DT = 1 / 240, SAMPLE = 1 / 60;
// The wheel's constants. On the track, rolling friction and air drag (Eichberger's form, a drag a little lower so
// a strong throw runs 13-15 laps); these belong to the wheel and ball, the same on every spin, so only the
// croupier's throw sets how long a spin lasts. The rest is the feel of the stator and the wheelhead: about a
// second down the cone, then two or so seconds of scatter over the frets.
export const TUNE = {
  trackA: 13.4, trackK: 1.6e-4,                                          // v' = -A - K·v² (cm/s², 1/cm)
  tilt: .12, tiltAt: 1.1,                                                // no wheel is perfectly level: its drops gather on one side
  coneSpin: .12, coneDamp: 2.2,                                         // spin lost to friction on the stator, radial damping
  rollF: 4, ringF: 5,                                                   // rolling friction among the frets / on the number ring (cm/s²)
  skipAbove: 24, skipOdds: .65, skipKeep: [.85, .1], skipHop: 1.2,      // skipping over a fret: above what speed, how often, speed kept, hop
  rebound: [.55, .3], reboundHop: .35, bounceKeep: .4, restBelow: 5, hopMax: 70,
  radialKeep: [.65, .25],                                               // angular momentum kept off a radial canoe
  rotorDecay: .018,                                                     // the wheelhead coasts, slowing about 2% a second
};
const sample = (st, phase, speed) => [st.t, st.th, st.r, st.y, st.phi, phase, speed];

// The track stage: deterministic from the throw. Returns the samples and the state at the drop.
function runTrack({ dir, theta0, phi0, rotorSpeed, v0 }) {
  const st = { t: 0, th: theta0, v: v0, phi: phi0, wr: -dir * Math.abs(rotorSpeed), r: 0, y: 0, u: 1 };
  [st.r, st.y, st.u] = onTrack(v0);
  const samples = [], { trackA: A, trackK: K, tilt, tiltAt } = TUNE; let next = 0;
  for (let i = 0; i < 120 / DT; i++) {
    st.wr -= st.wr * TUNE.rotorDecay * DT; st.phi += st.wr * DT;
    st.v -= (A + K * st.v * st.v) * DT;
    const [r, y, u] = onTrack(st.v); st.r += (r - st.r) * Math.min(1, 10 * DT); st.y += (y - st.y) * Math.min(1, 10 * DT); st.u = u;
    st.th += dir * st.v / st.r * DT;
    if (st.t >= next) { samples.push(sample(st, 0, st.v)); next += SAMPLE; }
    st.t += DT;
    // off the flattest part of the track: where it rolls off depends a little on the wheel's lean
    if (st.v * st.v < G * st.r * Math.tan(S0) * (1 + tilt * Math.cos(st.th - tiltAt))) break;
  }
  return { samples, drop: { t: st.t, th: st.th, r: st.r, y: st.y, v: st.v, phi: st.phi, wr: st.wr }, next };
}

// The descent: from the drop down the stator, onto the wheelhead and into a pocket. `rnd` holds all its chance.
function runDescent(drop, dir, rnd, next) {
  let t = drop.t, th = drop.th, r = drop.r, y = drop.y, phi = drop.phi, wr = drop.wr;
  let phase = 'cone', L = r * drop.v, vr = -(6 + rnd() * 10), h = 0, vh = 0, psi = 0, psiRate = 0, bounced = 0;
  const hit = new Set(), samples = [], events = [{ t, type: 'drop' }];
  let settledAt = null, pocket = null, fretCount = 0, crossed = 0, lastFret = null, defl = 0;
  const half = GEO.deflLen / 2, w2 = GEO.deflW / 2, b = GEO.ball;
  for (let i = 0; i < 40 / DT; i++) {
    wr -= wr * TUNE.rotorDecay * DT; phi += wr * DT;
    if (phase === 'cone') {
      const w = L / (r * r);
      // a rolling ball on the cone (5/7 of a sliding one's pull): gravity down the slope against its swing outward
      vr += 5 / 7 * (r * w * w * Math.cos(CONE) - G * Math.sin(CONE)) * DT; vr *= 1 - TUNE.coneDamp * DT;
      L -= L * TUNE.coneSpin * DT; r += vr * DT; th += dir * w * DT;
      if (h > 0 || vh > 0) { vh -= G * DT; h = Math.max(0, h + vh * DT); if (h === 0) vh = 0; }
      y = floorY(r) + h;
      // the canoes: eight, alternately radial (lying across the ball's path) and tangential (along it)
      const j = Math.round((th / (Math.PI * 2 / GEO.deflectors)) - .5), a = (j + .5) * Math.PI * 2 / GEO.deflectors, d = (((th - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      const radial = ((j % 2) + 2) % 2 === 0, k = ((j % GEO.deflectors) + GEO.deflectors) % GEO.deflectors;
      if (h < .6 && !hit.has(k) && Math.abs(r - GEO.deflR) < (radial ? half : w2) + b && Math.abs(d) * r < (radial ? w2 : half) + b) {
        hit.add(k); defl++;
        const s = L / r, keep = radial ? TUNE.radialKeep[0] + rnd() * TUNE.radialKeep[1] : .78 + rnd() * .16;
        L *= keep; vh = (radial ? 34 : 16) + rnd() * 26; vr += (rnd() - .55) * (radial ? 30 : 16);
        events.push({ t, type: 'deflector', power: Math.min(1, s / 160) * (radial ? 1 : .6), radial });
      }
      if (r <= GEO.rotorR) { phase = 'rotor'; psi = th - phi; psiRate = dir * (L / (r * r)) - wr; events.push({ t, type: 'land', power: Math.min(1, Math.abs(psiRate) * r / 150) }); vh = Math.max(vh, 14 + rnd() * 16); }
    } else if (phase === 'rotor') {
      // in the wheelhead's frame: the ball's angle relative to it (psi), sliding in over the number ring
      const target = GEO.pocketMid + (rnd() - .5) * .8;
      vr += ((target - r) * 90 - vr * 11) * DT; r += vr * DT;
      if (h > 0 || vh > 0) { vh -= G * DT; h = Math.max(0, h + vh * DT); if (h === 0) { if (vh < -30) events.push({ t, type: 'bounce', power: Math.min(1, -vh / 120) }); vh = Math.abs(vh) > 30 && bounced++ < 3 ? -vh * TUNE.bounceKeep : 0; } }
      // rolling friction in the pocket ring (stronger once it is down among the frets)
      const f = (r < GEO.pocketR0 ? TUNE.rollF : TUNE.ringF) / r;
      if (Math.abs(psiRate) > f * DT) psiRate -= Math.sign(psiRate) * f * DT; else psiRate = 0;
      let npsi = psi + psiRate * DT;
      // frets at the pocket edges: (i + 1/2) pitches
      if (r < GEO.pocketR0 + .2 && h < GEO.fretTop * .9) {
        const a = Math.floor(psi / PITCH - .5), c = Math.floor(npsi / PITCH - .5);
        if (a !== c) {
          const s = Math.abs(psiRate) * r;
          fretCount++; lastFret = t; bounced = 0;
          if (s > TUNE.skipAbove && rnd() < TUNE.skipOdds) { psiRate *= TUNE.skipKeep[0] + rnd() * TUNE.skipKeep[1]; vh = Math.min(TUNE.hopMax, TUNE.skipHop * s * (.7 + rnd() * .5)); crossed++; }   // skips over
          else { psiRate = -psiRate * (TUNE.rebound[0] + rnd() * TUNE.rebound[1]); vh = TUNE.reboundHop * s * rnd(); npsi = psi; }                                // bounces back
          events.push({ t, type: 'fret', power: Math.min(1, s / 140) });
        }
      }
      psi = npsi; th = psi + phi; y = floorY(r) + h;
      // it comes to rest when it is barely moving in its pocket
      if (h === 0 && Math.abs(psiRate) * r < TUNE.restBelow && r < GEO.pocketR0 && Math.abs(vr) < 4 && t - (lastFret ?? 0) > .12) {
        pocket = ((Math.round(-psi / PITCH) % POCKETS) + POCKETS) % POCKETS; phase = 'rest'; settledAt = t; events.push({ t, type: 'settle' });
      }
    } else {
      // resting: the ball eases to the middle of its pocket, out against the outer wall, and rides round with the wheelhead
      const c = -pocket * PITCH, goal = c + Math.round((psi - c) / (Math.PI * 2)) * Math.PI * 2;
      psi += (goal - psi) * Math.min(1, 6 * DT); th = phi + psi; r += (GEO.restR - r) * Math.min(1, 6 * DT); y = floorY(r);
      if (t - settledAt > 3) break;
    }
    if (t >= next) { samples.push([t, th, r, y, phi, phase === 'cone' ? 1 : phase === 'rotor' ? 2 : 3, phase === 'cone' ? L / r : Math.abs(psiRate) * r]); next += SAMPLE; }
    t += DT;
  }
  return { samples, events, pocket, settledAt, frets: fretCount, crossed, deflectors: defl };
}

// One spin from its parameters. Returns the samples (60 a second) and the events for the sound.
//   dir: +1 or -1, the ball's direction; the wheelhead turns the other way
//   theta0: where the ball is launched; phi0, rotorSpeed: the wheelhead's angle and speed at launch
//   v0: the throw (cm/s); seed: all the small randomness, from the drop on
export function simulate({ dir = 1, theta0 = 0, phi0 = 0, rotorSpeed = 1.8, v0 = 440, seed = 1 } = {}) {
  const tr = runTrack({ dir, theta0, phi0, rotorSpeed, v0 });
  return join(tr, runDescent(tr.drop, dir, mulberry(seed), tr.next), dir, rotorSpeed);
}
function join(tr, de, dir, rotorSpeed) {
  const laps = Math.abs(tr.drop.th - tr.samples[0][1]) / (Math.PI * 2);
  return { samples: tr.samples.concat(de.samples), events: [{ t: 0, type: 'launch' }, ...de.events], pocket: de.pocket, settledAt: de.settledAt, dir, rotorSpeed, crossed: de.crossed, frets: de.frets, deflectors: de.deflectors, dropAt: tr.drop.t, laps, drop: tr.drop };
}
// The croupier's throw: a strong one in normal play (about 1.7-1.9 revolutions a second, 13-15 laps), a softer
// one in fast play (5-6 laps, still past every regulator's four).
export const THROW = { normal: [1.7, 1.9], fast: [1.0, 1.1] };
const throwV = (fast, x) => { const [a, b] = THROW[fast ? 'fast' : 'normal']; return (a + (b - a) * x) * 2 * Math.PI * (GEO.wallR - GEO.ball); };

// A spin. The throw is made once, and its descent from the drop (the first of `tries` that comes to rest in a pocket);
// the number is drawn apart from it. At a real wheel the bets close while the ball still runs, at the croupier's call,
// so the number is aimed at then: `aim(n)` finds the whole pockets the wheelhead must be turned on by to bring that
// number under the ball, and the controller makes the turn while the picture is black (`fixed`), so no push is ever
// seen. With `result` the spin is aimed from the launch. `phiNow`: the wheelhead's angle when the ball is launched;
// `theta0`: where the croupier releases it; `rotorSpeed`: the wheelhead's speed then (rad/s), when the controller has
// already spun it up.
export function plan(result = null, { dir = 1, phiNow = 0, fast = false, seed = (Math.random() * 2 ** 32) >>> 0, tries = 48, theta0 = null, rotorSpeed = null } = {}) {
  const rnd = mulberry(seed);
  const opts = { dir, theta0: theta0 ?? rnd() * Math.PI * 2, phi0: phiNow, rotorSpeed: rotorSpeed ?? 1.6 + rnd() * .5, v0: throwV(fast, rnd()) };
  const tr = runTrack(opts), rot = Math.sign(-dir);   // the wheelhead turns opposite to the ball
  let de = null;
  for (let i = 0; i < tries && !de; i++) { const d = runDescent(tr.drop, dir, mulberry((rnd() * 2 ** 32) >>> 0), tr.next); if (d.pocket != null) de = d; }
  const spin = join(tr, de, dir, opts.rotorSpeed);
  spin.opts = opts; spin.k = 0; spin.extra = 0; spin.result = null; spin.fixed = false;
  // pockets run clockwise (pocket i sits i pitches clockwise of zero), so turning the wheelhead by (i_result - i_landed)
  // pitches puts the drawn number under the ball; k counts them in the direction it already turns
  spin.aim = n => { const need = ((WHEEL_INDEX[n] - de.pocket) % POCKETS + POCKETS) % POCKETS; spin.k = rot > 0 ? need : (POCKETS - need) % POCKETS; spin.extra = spin.k * PITCH; spin.result = n; return spin; };
  spin.rotorAt = () => spin.fixed ? rot * spin.extra : 0;
  // "No more bets": as the ball is about to make its last two rounds (one in fast play), as the Monte-Carlo rules have it
  const lapsBefore = fast ? 1.1 : 1.8, end = tr.drop.th; let callAt = 0;
  for (const s of tr.samples) if (Math.abs(end - s[1]) >= lapsBefore * Math.PI * 2) callAt = s[0];
  spin.callAt = callAt;
  if (result != null) { spin.aim(result); spin.fixed = true; }
  return spin;
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
