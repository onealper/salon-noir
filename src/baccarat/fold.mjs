// The squeeze's geometry: a card lying face down, a finger put on it and drawn across, and the card's edge coming up
// behind the finger, round a tight fold and over onto its own back, face up. Paper neither stretches nor tears, so
// where the fold lies follows from how far the edge has been drawn. All in the card's own frame (x across its short
// side, y along its long side, centimetres from its middle), as scene/pieces.mjs bendCard takes a fold. No DOM.
export const FOLD_R = .42;   // the fold's radius: half a turn round it takes π·r of the card's length

// How far from the edge the fold lies once the edge has been drawn D across the card. Up to half a turn the edge is
// still on the round of the fold (it has risen, and come in D by the time s of it is wrapped: s - r·sin(s/r) = D);
// past that it lies flat on the card's back, and each centimetre it is drawn moves the fold half a centimetre.
export function foldAt(D, r = FOLD_R) {
  const half = Math.PI * r; if (D >= half) return (D + half) / 2;
  let lo = 0, hi = half; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (m - r * Math.sin(m / r) < D) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// The point of the card's edge behind a finger at (x, y) moving along (ux, uy): where the peel starts from.
export function edgeBehind(x, y, ux, uy, w = 6.35, h = 8.89) {
  const hx = w / 2, hy = h / 2; x = Math.max(-hx, Math.min(hx, x)); y = Math.max(-hy, Math.min(hy, y));
  let t = Infinity;
  if (ux > 1e-9) t = Math.min(t, (x + hx) / ux); else if (ux < -1e-9) t = Math.min(t, (x - hx) / ux);
  if (uy > 1e-9) t = Math.min(t, (y + hy) / uy); else if (uy < -1e-9) t = Math.min(t, (y - hy) / uy);
  return { x: x - ux * t, y: y - uy * t };
}
// The fold for a finger put down at (x0, y0) and now at (x, y): `dir`, across the fold toward the part that comes
// up; `s0`, where the fold lies along it from the card's middle; `at`, the point of the fold the edge was drawn
// through; `turned`, once the fold has reached the card's middle (half of it is over). Null while the finger has
// barely moved.
export function peel(x0, y0, x, y, { w = 6.35, h = 8.89, r = FOLD_R } = {}) {
  const vx = x - x0, vy = y - y0, D = Math.hypot(vx, vy); if (D < .02) return null;
  const ux = vx / D, uy = vy / D, g = edgeBehind(x0, y0, ux, uy, w, h), f = foldAt(D, r), dir = [-ux, -uy];
  const s0 = g.x * dir[0] + g.y * dir[1] - f;
  return { dir, s0, D, from: g, at: { x: g.x + ux * f, y: g.y + uy * f }, turned: s0 <= 0 };
}
// How far the card reaches along a direction, from its middle.
export const reach = (dir, w = 6.35, h = 8.89) => Math.abs(dir[0]) * w / 2 + Math.abs(dir[1]) * h / 2;
// The square way nearest a direction: along the card's short side or its long side.
export const squared = dir => Math.abs(dir[0]) >= Math.abs(dir[1]) ? [Math.sign(dir[0]) || 1, 0] : [0, Math.sign(dir[1]) || 1];
// The card turned right over from a fold, in `e` from 0 (the fold as it stands) to 1 (flat, face up, where it lay):
// the fold swings to the square way nearest it and runs on past the far edge (by the half turn still on its round),
// while the card is drawn back by as much as the turn carries it over and let down the height of the fold.
// → { dir, s0, to, back, down }: the fold, the square way, how far the whole card has moved along it, and how far it
// has come down.
export function turnOver(p, e, { w = 6.35, h = 8.89, r = FOLD_R } = {}) {
  const to = squared(p.dir), a = Math.min(1, e / .4), k = a * a * (3 - 2 * a);
  let dx = p.dir[0] + (to[0] - p.dir[0]) * k, dy = p.dir[1] + (to[1] - p.dir[1]) * k; const n = Math.hypot(dx, dy); dx /= n; dy /= n;
  const dir = [dx, dy], es = e * e * (3 - 2 * e), s0 = (1 - es) * (p.at.x * dx + p.at.y * dy) + es * -(reach(dir, w, h) + Math.PI * r);
  const last = Math.max(0, (e - .55) / .45), el = last * last * (3 - 2 * last);
  return { dir, s0, to, back: e * e * (2 * reach(to, w, h) + Math.PI * r), down: el * 2 * r };
}
