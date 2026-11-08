// The betting layout for the keyboard: a cursor over the boxes printed on the cloth, moved with the arrow keys the way
// the layout lies on the screen (rgame.mjs draws it with the scene's own highlight and tells a screen reader where it
// is). No DOM.
//
// The cursor is a place on the layout as printed for the long side: `c` runs along the table (0 the zero, 1..12 the
// columns of three numbers, 13 the "2 to 1" boxes), `r` across it from the croupier's side (0..2 the number rows, 3 the
// dozens, 4 the even-money boxes). The zero spans the three number rows, a dozen four columns, an even-money box two; a
// move through one keeps the column it came in at, so the way back leads where it began.
//
// With Shift the cursor moves half a box at a time, onto the lines where the inside bets lie, as the chips do on the
// cloth (anchorUV in rscene.mjs): a half on `c` is the line between two columns of three (a split across), a half on `r`
// the line between two rows (a split along), both halves a crossing (a corner); `r` 2.5 is the edge the numbers share
// with the dozens (a street at a column, a six line between two), and `c` 0.5 the zero's edge (a split with 1, 2 or 3,
// the trios at its crossings, the first four at its foot).
import { spot, colorOf, KINDS } from './rules.mjs';

const EVEN = ['low', 'even', 'red', 'black', 'odd', 'high'];
const whole = Number.isInteger;
// the spot under a place on the layout
export function spotAt({ c, r }) {
  if (r >= 3) return r === 3 ? `doz${Math.ceil(c / 4)}` : EVEN[Math.ceil(c / 2) - 1];
  if (c === 0) return 'n0';
  if (c === 13) return `col${3 - r}`;
  if (c === .5) return r === 2.5 ? 'ff' : whole(r) ? `sp0-${3 - r}` : r === .5 ? 'tr0-2-3' : 'tr0-1-2';
  const k = Math.floor(c), j = Math.floor(r);   // the column of three on the zero's side, the row on the croupier's
  if (r === 2.5) return whole(c) ? `st${3 * c - 2}` : `sl${3 * k - 2}`;
  if (whole(c) && whole(r)) return `n${3 * c - r}`;
  if (whole(r)) { const n = 3 * k - r; return `sp${n}-${n + 3}`; }
  if (whole(c)) { const n = 3 * c - j - 1; return `sp${n}-${n + 1}`; }
  return `co${3 * k - j - 1}`;
}
// the place a spot is first reached at
export function placeOf(id) {
  let m = /^n(\d+)$/.exec(id);
  if (m) { const n = +m[1]; return n === 0 ? { c: 0, r: 1 } : { c: Math.ceil(n / 3), r: 2 - (n - 1) % 3 }; }
  if (/^col[123]$/.test(id)) return { c: 13, r: 3 - +id[3] };
  if (/^doz[123]$/.test(id)) return { c: 4 * +id[3] - 3, r: 3 };
  const i = EVEN.indexOf(id); if (i >= 0) return { c: 2 * i + 1, r: 4 };
  if ((m = /^sp(\d+)-(\d+)$/.exec(id))) {
    const a = +m[1], b = +m[2]; if (a === 0) return { c: .5, r: 3 - b };
    const p = placeOf(`n${a}`); return b - a === 1 ? { c: p.c, r: p.r - .5 } : { c: p.c + .5, r: p.r };
  }
  if ((m = /^st(\d+)$/.exec(id))) return { c: placeOf(`n${m[1]}`).c, r: 2.5 };
  if ((m = /^sl(\d+)$/.exec(id))) return { c: placeOf(`n${m[1]}`).c + .5, r: 2.5 };
  if ((m = /^co(\d+)$/.exec(id))) { const p = placeOf(`n${m[1]}`); return { c: p.c + .5, r: p.r - .5 }; }
  if (id === 'tr0-1-2') return { c: .5, r: 1.5 };
  if (id === 'tr0-2-3') return { c: .5, r: .5 };
  if (id === 'ff') return { c: .5, r: 2.5 };
  return { c: 0, r: 1 };
}
// one step along the table (dc) or across it (dr), as printed for the long side: box to box. From a line or a crossing
// the step lands on the box beyond it, the other half rounded toward the zero and the croupier.
function step(pos, dc, dr) {
  let { c, r } = pos;
  if (!whole(c) || !whole(r)) {
    if (dc && !whole(c)) return { c: dc > 0 ? Math.ceil(c) : Math.floor(c), r: Math.min(2, Math.floor(r)) };
    if (dr && !whole(r)) { const nr = dr > 0 ? Math.ceil(r) : Math.floor(r); return { c: nr >= 3 ? Math.max(1, Math.floor(c)) : Math.floor(c), r: nr }; }
    c = Math.floor(c); r = Math.min(2, Math.floor(r));
  }
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
// half a step (Shift): onto the line or crossing beside, where the inside bets lie; the outside boxes and the "2 to 1"s
// are whole boxes still
function half(pos, dc, dr) {
  const { c, r } = pos;
  if (c === 13) return dc < 0 ? { c: 12, r } : dr ? step(pos, 0, dr) : pos;
  if (r >= 3) return dr < 0 && r === 3 ? { c: Math.max(1, Math.min(12, c)), r: 2.5 } : step(pos, dc, dr);
  if (dc) {
    const nc = c + dc / 2;
    if (nc > 12) return whole(r) && r <= 2 ? { c: 13, r } : pos;   // past the last column: its "2 to 1", from a number
    if (nc < 0) return pos;
    if (nc === 0) return { c: 0, r: Math.min(2, Math.floor(r)) };   // onto the zero, from its edge
    return { c: nc, r };
  }
  const nr = r + dr / 2;
  if (nr < 0) return pos;
  if (c === 0) return nr > 2 ? pos : { c, r: nr };   // the zero spans its three rows: no street beside it
  if (nr > 2.5) return { c: Math.max(1, Math.round(c)), r: 3 };   // off the street edge, onto the dozens
  return { c, r: nr };
}
// the arrow keys, as the layout lies on the screen: from the long side ('land') it lies across, the numbers running left
// to right with 3 at the top of each column; from the foot ('port') it runs up the screen, 1 2 3 left to right in each
// row, the zero at the top and the outside boxes down the left. `fine`: half a step (Shift held).
export function move(pos, key, orient = 'land', fine = false) {
  const land = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const port = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, 1], ArrowRight: [0, -1] };
  const d = (orient === 'port' ? port : land)[key]; if (!d) return pos;
  return (fine ? half : step)(pos, d[0], d[1]);
}
// Home and End: the first and last box of the row (or the zero and the "2 to 1"s of the number rows)
export function edge(pos, end) {
  if (pos.r < 3) return { c: end ? 13 : 0, r: Math.min(2, Math.floor(pos.r)) };
  return { c: end ? 12 : 1, r: pos.r };
}
// what the spot is, for a screen reader: "17, black. Straight up, pays 35 to 1", "Corner 17, 18, 20 and 21. Pays 8 to 1"
const listed = label => {
  if (label.includes('–')) return label.replace('–', ' to ');
  const parts = label.split('/'); return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : label;
};
// what a bet is called in a sentence ("Your bet 5 on split 17 and 20"): a number alone, a box by its label
export function named(id) {
  const s = spot(id); if (!s) return '';
  if (s.kind === 'straight' || ['column', 'dozen', 'even'].includes(s.kind)) return s.label;
  return `${KINDS[s.kind].name.toLowerCase()} ${listed(s.label)}`;
}
export function speak(id) {
  const s = spot(id); if (!s) return '';
  if (s.kind === 'straight') { const n = s.nums[0]; return `${n}, ${colorOf(n)}. Straight up, pays ${s.pays} to 1`; }
  if (['column', 'dozen', 'even'].includes(s.kind)) return `${s.label}. Pays ${s.pays} to 1`;
  return `${KINDS[s.kind].name} ${listed(s.label)}. Pays ${s.pays} to 1`;
}
