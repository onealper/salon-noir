// The slow-motion replay's camera, worked out from the planned spin alone (no DOM, so the tests can hold it to keeping
// the ball in the picture). It shows the last 1.6 s of the ball's path, down the cone and over the frets into its pocket,
// from a camera that stands still (a locked-off shot, as everywhere at this table) facing the middle of that path. The
// lens fits the path to the screen it plays on: a close-up on a wide screen, and on a phone held upright, whose picture
// is narrow, a higher camera, nearer overhead, that lays the path down the picture's height rather than across it.
import { at } from './physics.mjs';

const polar = (r, a, y) => [r * Math.cos(a), y, -r * Math.sin(a)];
// where the camera may stand, [out from the wheel's centre, up] in cm: the low close-up first, then higher, to nearly overhead
const EYES = [[50, 21], [54, 30], [46, 40], [40, 52], [34, 62]];
const CLOSE = 40, LENS = [30, 62];   // a lens this long or longer is a close-up: no need to climb further; the lenses allowed

// `fit(pos, look, pts, mx, my)`: the narrowest lens (vertical, degrees) from `pos` looking at `look` that keeps every point
// within mx, my of the picture's edges (1 = the edge), or null if none does. Points are [x, y, z] in cm from the wheel's
// centre. Returns the stretch replayed (t0 to t1, s of the spin) and the camera: pos, look, fov.
export function replayShot(p, fit) {
  const t1 = p.settledAt + .35, t0 = Math.max(p.dropAt ?? 0, t1 - 1.6), pts = [];
  for (let t = t0; t <= t1 + 1e-9; t += 1 / 30) { const s = at(p, t); pts.push(polar(s.r, s.theta, s.y)); }
  const sx = pts.reduce((a, q) => a + q[0], 0) / pts.length, sz = pts.reduce((a, q) => a + q[2], 0) / pts.length, bearing = Math.atan2(-sz, sx), look = [sx, -9, sz];
  let best = null;
  for (const [d, h] of EYES) {
    const pos = polar(d, bearing, h), fov = fit(pos, look, pts, .9, .85); if (fov == null) continue;
    if (!best || fov < best.fov) best = { pos, fov };
    if (fov <= CLOSE) break;
  }
  best ??= { pos: polar(EYES.at(-1)[0], bearing, EYES.at(-1)[1]), fov: LENS[1] };   // nothing fits: the widest, from the top
  return { t0, t1, pos: best.pos, look, fov: Math.min(LENS[1], Math.max(LENS[0], best.fov)) };
}
