// The betting layout for the keyboard: a cursor over the boxes printed on the cloth, moved with the arrow keys the way
// the layout lies on the screen (rgame.mjs draws it with the scene's own highlight and tells a screen reader where it
// is). No DOM.
//
// The cursor is a place on the layout as printed for the long side: `c` runs along the table (0 the zero, 1..12 the
// columns of three numbers, 13 the "2 to 1" boxes), `r` across it from the croupier's side (0..2 the number rows, 3 the
// dozens, 4 the even-money boxes). The zero spans the three number rows, a dozen four columns, an even-money box two; a
// move through one keeps the column it came in at, so the way back leads where it began.
import { spot, colorOf } from './rules.mjs';

const EVEN = ['low', 'even', 'red', 'black', 'odd', 'high'];
// the box under a place on the layout
export function spotAt({ c, r }) {
  if (r <= 2) return c === 0 ? 'n0' : c === 13 ? `col${3 - r}` : `n${3 * c - r}`;
  if (r === 3) return `doz${Math.ceil(c / 4)}`;
  return EVEN[Math.ceil(c / 2) - 1];
}
// the place a box is first reached at
export function placeOf(id) {
  const m = /^n(\d+)$/.exec(id);
  if (m) { const n = +m[1]; return n === 0 ? { c: 0, r: 1 } : { c: Math.ceil(n / 3), r: 2 - (n - 1) % 3 }; }
  if (/^col[123]$/.test(id)) return { c: 13, r: 3 - +id[3] };
  if (/^doz[123]$/.test(id)) return { c: 4 * +id[3] - 3, r: 3 };
  const i = EVEN.indexOf(id); return i >= 0 ? { c: 2 * i + 1, r: 4 } : { c: 0, r: 1 };
}
// one step along the table (dc) or across it (dr), as printed for the long side
function step({ c, r }, dc, dr) {
  if (dc) {
    if (r >= 3) {   // a dozen or an even-money box: on to the next box along
      const span = r === 3 ? 4 : 2, box = Math.ceil(c / span) - 1, next = box + dc, boxes = 12 / span;
      if (next < 0 || next >= boxes) return { c, r };
      return { c: dc > 0 ? next * span + 1 : next * span + span, r };
    }
    return { c: Math.max(0, Math.min(13, c + dc)), r };
  }
  if (c === 0) return dr > 0 ? { c: 1, r: 3 } : { c, r };   // the zero: on to the dozens below it, nothing above
  if (c === 13) { const nr = r + dr; return nr < 0 || nr > 2 ? { c, r } : { c, r: nr }; }   // the "2 to 1" boxes end at the number rows
  return { c, r: Math.max(0, Math.min(4, r + dr)) };
}
// the arrow keys, as the layout lies on the screen: from the long side ('land') it lies across, the numbers running left
// to right with 3 at the top of each column; from the foot ('port') it runs up the screen, 1 2 3 left to right in each
// row, the zero at the top and the outside boxes down the left
export function move(pos, key, orient = 'land') {
  const land = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const port = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, 1], ArrowRight: [0, -1] };
  const d = (orient === 'port' ? port : land)[key]; if (!d) return pos;
  return step(pos, d[0], d[1]);
}
// Home and End: the first and last box of the row (or the zero and the "2 to 1"s of the number rows)
export function edge(pos, end) {
  if (pos.r <= 2) return { c: end ? 13 : 0, r: pos.r };
  return { c: end ? 12 : 1, r: pos.r };
}
// what the box is, for a screen reader: "17, red. Straight up, pays 35 to 1"
export function speak(id) {
  const s = spot(id); if (!s) return '';
  if (s.kind === 'straight') { const n = s.nums[0]; return `${n}, ${colorOf(n)}. Straight up, pays ${s.pays} to 1`; }
  return `${s.label}. Pays ${s.pays} to 1`;
}
