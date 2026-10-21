// The betting controls every table shares (blackjack and roulette): the chips in hand, the hint line, the Rebet/×2
// slot and the gold button's words, the queue that keeps betting gestures in order, and the betting keys.
import { CHIP_VALUES } from './chips.mjs';
import { fmt } from './format.mjs';
import { wallet } from './wallet.mjs';
import { chipIcon } from '../scene/textures.mjs';
import * as ui from '../ui-motion.mjs';

// The chip rack: a radio button a value; the chip in hand is remembered across tables (spader.chip).
export function chipRack(row, { store, uiSound }) {
  let value = store.get('chip', 5); if (!CHIP_VALUES.includes(value)) value = 5;
  for (const v of CHIP_VALUES) {
    const b = document.createElement('button'); b.className = 'chip'; b.dataset.value = v; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', `${v} chip`);
    const img = document.createElement('img'); img.alt = ''; img.src = chipIcon(v); img.width = img.height = 128; b.append(img);
    b.addEventListener('click', () => select(v)); row.append(b);
  }
  // picking up a chip answers with a low, woody knock
  function select(v) { if (v !== value) uiSound('thock'); value = v; store.set('chip', v); let sel; for (const b of row.children) { const on = +b.dataset.value === v; b.setAttribute('aria-checked', on); b.classList.toggle('selected', on); if (on) sel = b; } ui.lift([...row.children], sel); }
  select(value);
  return {
    get value() { return value; }, select,
    fit(left) { for (const b of row.children) b.disabled = +b.dataset.value > left; },   // a chip the balance left over can't cover is out of reach
  };
}
// The hint line never blinks: clearing waits a moment in case a new line follows at once. Its words morph in the
// line's own span, so the line keeps its place (see .hint in app.css).
export function hintLine(el) {
  let clear = 0;
  return t => { clearTimeout(clear); if (t) { el.classList.remove('off'); if (el.dataset.t !== t) { el.dataset.t = t; ui.morph(el.firstElementChild, t); } } else clear = setTimeout(() => el.classList.add('off'), 260); };
}
// A control that shares its slot with another: the one out of play is out of sight, of the tab order and of the
// accessibility tree.
export function swapIn(el, on) { el.classList.toggle('gone', !on); el.inert = !on; el.setAttribute('aria-hidden', !on); }
// Rebet and Double bets share one slot, so the row never changes width when a chip goes down.
export function rebetSlot(rebet, x2, down) { swapIn(rebet, !down); swapIn(x2, down); }
// The gold button's words: a fresh stack when you are out of chips, the last bets again on an empty layout, or its verb.
export function goLabel(button, verb, { out, rebet }) { ui.morph(button.querySelector('.label'), out ? `Reset to ${fmt(wallet.START)}` : rebet ? `Rebet & ${verb.toLowerCase()}` : verb); }
// Betting gestures run in order (a chip's flight, an undo, a clear); a failure goes to `onError`.
export function serialQueue(onError) { let queue = Promise.resolve(); return fn => (queue = queue.then(fn).catch(onError)); }
// The betting keys, the same at every table: U or Backspace undoes, C clears, R rebets, X doubles the bets, 1 to 7 pick
// up a chip. False when the key is none of them.
export function betKey(k, { undo, clear, rebet, double, chip }) {
  const f = { u: undo, backspace: undo, c: clear, r: rebet, x: double }[k];
  if (f) f(); else if (/^[1-7]$/.test(k)) chip(CHIP_VALUES[+k - 1]); else return false;
  return true;
}
