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
// The number is drawn at the croupier's call, while the ball still runs: from the ball's drop, descents are tried
// until one comes to rest within a pocket or two of the drawn number, and the wheelhead makes up that pocket or two
// by running a touch quicker or slower between the call and the ball reaching it (a smooth swell in its speed, a
// few per cent, gone before the ball lands). The frets repeat every pocket, so the ball's own path is unchanged:
// nothing is ever pushed, and nothing is hidden.
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

// The track stage: deterministic from the throw. Returns the samples and the state at the drop. `stopAt`: stop at
// that time and return the state there instead (`state`), for `from` to run on from it; `drag`: the track's slowing
// scaled by this much (a few per cent either way, after the call: see plan).
function runTrack({ dir, theta0, phi0, rotorSpeed, v0 }, { from = null, drag = 1, stopAt = Infinity } = {}) {
  const st = from ? { ...from.st } : { t: 0, th: theta0, v: v0, phi: phi0, wr: -dir * Math.abs(rotorSpeed), r: 0, y: 0, u: 1 };
  if (!from) [st.r, st.y, st.u] = onTrack(v0);
  const samples = [], { tilt, tiltAt } = TUNE, A = TUNE.trackA * drag, K = TUNE.trackK * drag; let next = from ? from.next : 0;
  for (let i = 0; i < 120 / DT; i++) {
    if (st.t >= stopAt) return { samples, state: { st: { ...st }, next } };
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
// `quick`: only where it comes to rest (no samples, and it stops there), for trying descents.
function runDescent(drop, dir, rnd, next, quick = false) {
  let t = drop.t, th = drop.th, r = drop.r, y = drop.y, phi = drop.phi, wr = drop.wr;
  let phase = 'cone', L = r * drop.v, vr = -(6 + rnd() * 10), h = 0, vh = 0, psi = 0, psiRate = 0, bounced = 0;
  const hit = new Set(), samples = [], events = [{ t, type: 'drop' }];
  let settledAt = null, pocket = null, fretCount = 0, crossed = 0, lastFret = null, defl = 0, landAt = null;
  const half = GEO.deflLen / 2, w2 = GEO.deflW / 2, b = GEO.ball;
  for (let i = 0; i < (quick ? 9 : 40) / DT; i++) {   // (a try that hasn't come to rest in 9 s is given up)
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
      if (r <= GEO.rotorR) { phase = 'rotor'; landAt = t; psi = th - phi; psiRate = dir * (L / (r * r)) - wr; events.push({ t, type: 'land', power: Math.min(1, Math.abs(psiRate) * r / 150) }); vh = Math.max(vh, 14 + rnd() * 16); }
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
        if (quick) break;
      }
    } else {
      // resting: the ball eases to the middle of its pocket, out against the outer wall, and rides round with the wheelhead
      const c = -pocket * PITCH, goal = c + Math.round((psi - c) / (Math.PI * 2)) * Math.PI * 2;
      psi += (goal - psi) * Math.min(1, 6 * DT); th = phi + psi; r += (GEO.restR - r) * Math.min(1, 6 * DT); y = floorY(r);
      if (t - settledAt > 3) break;
    }
    if (!quick && t >= next) { samples.push([t, th, r, y, phi, phase === 'cone' ? 1 : phase === 'rotor' ? 2 : 3, phase === 'cone' ? L / r : Math.abs(psiRate) * r]); next += SAMPLE; }
    t += DT;
  }
  return { samples, events, pocket, settledAt, landAt, frets: fretCount, crossed, deflectors: defl };
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
  return { samples: tr.samples.concat(de.samples), events: [{ t: 0, type: 'launch' }, ...de.events], pocket: de.pocket, settledAt: de.settledAt, landAt: de.landAt, dir, rotorSpeed, crossed: de.crossed, frets: de.frets, deflectors: de.deflectors, dropAt: tr.drop.t, laps, drop: tr.drop };
}
// The croupier's throw: a strong one in normal play (about 1.7-1.9 revolutions a second, 13-15 laps), a softer
// one in fast play (5-6 laps, still past every regulator's four).
export const THROW = { normal: [1.7, 1.9], fast: [1.0, 1.1] };
const throwV = (fast, x) => { const [a, b] = THROW[fast ? 'fast' : 'normal']; return (a + (b - a) * x) * 2 * Math.PI * (GEO.wallR - GEO.ball); };

// A spin. The throw is made once; the number is drawn apart from it. At a real wheel the bets close while the ball
// still runs, at the croupier's call, so the number is aimed at then. Everything up to the call is fixed by the throw;
// what follows is tried several ways ahead: the last rounds on the track with its slowing a few per cent either way
// (`DRAGS`: the ball drops a little sooner or later, a pocket or two round), and from each drop, descents with their
// own small chances. `aim(n)` takes one that comes to rest in n's pocket, or failing that within a pocket of it (`m`
// pockets off), and the wheelhead makes up that pocket between the call and the ball landing on it by a smooth swell
// in its speed that starts and ends at the speed it had (`rotorAt`). Until the call the spin plays its first resting
// descent. `warm()` tries one more: the controller calls it a frame at a time while the ball runs, so the aim at the
// call is ready at once. With `result` the spin is aimed from the launch. `phiNow`: the wheelhead's angle when the
// ball is launched; `theta0`: where the croupier releases it; `rotorSpeed`: its speed then (rad/s), when the
// controller has already spun it up.
export const DRAGS = [0, -.015, .015, -.03, .03, -.045, .045];
export const AIM = { tries: 96, most: 192 };   // tried ahead while the ball runs; at most this many to find one within a pocket
export function plan(result = null, { dir = 1, phiNow = 0, fast = false, seed = (Math.random() * 2 ** 32) >>> 0, theta0 = null, rotorSpeed = null } = {}) {
  const rnd = mulberry(seed);
  const opts = { dir, theta0: theta0 ?? rnd() * Math.PI * 2, phi0: phiNow, rotorSpeed: rotorSpeed ?? 1.6 + rnd() * .5, v0: throwV(fast, rnd()) };
  // "No more bets": as the ball is about to make its last two rounds (one in fast play), as the Monte-Carlo rules have it
  const whole = runTrack(opts), lapsBefore = fast ? 1.1 : 1.8, end = whole.drop.th; let callAt = 0;
  let callTh = 0; for (const s of whole.samples) if (Math.abs(end - s[1]) >= lapsBefore * Math.PI * 2) [callAt, callTh] = s;
  let head = null; const tails = new Map([[0, whole]]);   // the track to the call, run again only when a varied drag is first tried
  const track = drag => {
    if (!tails.has(drag)) { head ??= runTrack(opts, { stopAt: callAt }); const t = runTrack(opts, { from: head.state, drag: 1 + drag }); tails.set(drag, { samples: head.samples.concat(t.samples), drop: t.drop, next: t.next }); }
    return tails.get(drag);
  };
  const tried = [];   // ways it can go after the call that came to rest: { drag, seed, pocket }
  const warm = () => {
    if (tried.length >= AIM.most) return;
    const drag = DRAGS[tried.length % DRAGS.length], tr = track(drag), s = (rnd() * 2 ** 32) >>> 0, d = runDescent(tr.drop, dir, mulberry(s), tr.next, true);
    tried.push({ drag, seed: s, pocket: d.pocket, laps: Math.abs(tr.drop.th - callTh) / (2 * Math.PI) });   // (one that never came to rest counts as tried)
  };
  const resting = () => tried.filter(d => d.pocket != null);
  while (!resting().length) warm();
  const build = d => { const tr = track(d.drag); return join(tr, runDescent(tr.drop, dir, mulberry(d.seed), tr.next), dir, opts.rotorSpeed); };
  const spin = Object.assign(build(resting()[0]), { opts, m: 0, result: null, warm, callAt, from: callAt });
  // pockets run clockwise (pocket i sits i pitches clockwise of zero), so turning the wheelhead on by m pitches more
  // than it would have turned puts pocket (landed + m) under the ball; m is the nearer way round
  const off = (n, pocket) => { const need = ((WHEEL_INDEX[n] - pocket) % POCKETS + POCKETS) % POCKETS; return need > POCKETS / 2 ? need - POCKETS : need; };
  spin.aim = n => {
    // the nearest; of equals, the one whose last rounds after the call run closest to the throw's own (and never one
    // that leaves the call too close to the drop, or too far from it)
    const cost = d => Math.abs(off(n, d.pocket)) * 10 + Math.abs(d.laps - lapsBefore) + (d.laps < lapsBefore - .45 || d.laps > lapsBefore + .6 ? 100 : 0);
    const best = () => resting().reduce((a, d) => cost(d) < cost(a) ? d : a);
    while (cost(best()) >= 20 && tried.length < AIM.most) warm();   // (warmed ahead, the best is mostly exact)
    const d = best(), sp = build(d);
    Object.assign(spin, sp, { m: off(n, sp.pocket), result: n, drag: d.drag });
    return spin;
  };
  // the wheelhead's lead over its own coasting: none until the call, then m pitches gained by the landing along
  // x - sin(2πx)/2π (its speed swells and settles back, with no jolt either end)
  spin.rotorAt = t => {
    if (!spin.m || t <= spin.from) return 0;
    const x = Math.min(1, (t - spin.from) / Math.max(.5, spin.landAt - spin.from));
    return spin.m * PITCH * (x - Math.sin(2 * Math.PI * x) / (2 * Math.PI));
  };
  if (result != null) spin.aim(result);
  return spin;
}
// Where things are at time t (seconds since launch), interpolated from the samples.
export function at(spin, t) {
  const S = spin.samples, i = Math.min(S.length - 2, Math.max(0, Math.floor(t * 60))), a = S[i], b = S[i + 1], f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1)));
  const lerp = (x, y) => x + (y - x) * f;
  const phi = lerp(a[4], b[4]) + spin.rotorAt(t);
  // the ball keeps its own path: the wheelhead's lead is whole pockets by the time the ball lands, so the frets it meets are where they were
  return { theta: lerp(a[1], b[1]), r: lerp(a[2], b[2]), y: lerp(a[3], b[3]), phi, phase: a[5], speed: lerp(a[6], b[6]) };
}
export const duration = spin => spin.samples.at(-1)[0];
