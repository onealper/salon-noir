// The money wheel: a big upright wheel of 55 segments, a peg between each pair, and a leather flapper at the top
// that reads the one it stops in. You bet on a number; where the wheel stops pays that number to one. Three
// segments are multipliers (2x, 3x and 6x: the salon's own): the bets stay, the wheel is spun again, and what the
// next number pays is multiplied (and again, if another multiplier comes first). No DOM in here: the room
// (wheel/wgame.mjs) only reads this state.
export { CHIP_VALUES } from '../core/chips.mjs';   // the salon's chips, the same at every table

// The segments in order round the wheel (as the flapper reads them while it turns): the rare ones spread evenly,
// a one on every other segment of the rest, twos and fives between, and no two neighbours alike.
export const SEGMENTS = ['40', '1', '2', '1', '5', '1', '10', '2', '1', '2', '1', 'x2', '5', '1', '2', '1', '2', '20', '1', '5', '1', '2', '10', '1', '2', '1', '2', '1', 'x6', '5', '1', '2', '1', '10', '2', '1', '5', '1', '2', '20', '1', '2', '1', '5', 'x3', '1', '2', '1', '2', '1', '10', '5', '1', '2', '1'];
export const COUNT = SEGMENTS.length, PITCH = Math.PI * 2 / COUNT;
export const NUMBERS = [1, 2, 5, 10, 20, 40];
export const isMultiplier = s => s[0] === 'x';
export const valueOf = s => Number(isMultiplier(s) ? s.slice(1) : s);
export const MULTIPLIERS = SEGMENTS.filter(isMultiplier).map(valueOf).sort((a, b) => a - b);
export const countOf = n => SEGMENTS.filter(s => s === String(n)).length;

// spot → the number it bets on, what it pays (to 1) and the most one player may stake on it (each spot can win
// 2,000 before a multiplier)
export const SPOTS = Object.fromEntries(NUMBERS.map(n => [`n${n}`, { n, pays: n, max: 2000 / n, name: `${n}` }]));
export const SPOT_IDS = Object.keys(SPOTS);
export const MIN_BET = 1;

// What a chip on `n` returns over time, exactly. A bet now worth k times its number returns, where the wheel stops:
// on its number (c of the T segments), the stake and k·n; on a multiplier x, itself at k·x. That is linear in k,
// V(k) = a + b·k, with a = c/(T - m) and b = c·n/(T - S), for m multiplier segments whose multipliers sum to S.
export function returnOf(n) {
  const c = countOf(n), m = MULTIPLIERS.length, S = MULTIPLIERS.reduce((a, b) => a + b, 0);
  return c / (COUNT - m) + c * n / (COUNT - S);
}

// A fair draw of where the wheel stops: one of its segments, each as likely as the next.
export function draw(random = Math.random) {
  if (random === Math.random && globalThis.crypto?.getRandomValues) { const a = new Uint32Array(1); let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= 4294967296 - 4294967296 % COUNT); return x % COUNT; }
  return Math.floor(random() * COUNT);
}
// A round: the spins it takes to reach a number (each one before it a multiplier), as segment indices.
export function round(random = Math.random) { const stops = []; do stops.push(draw(random)); while (isMultiplier(SEGMENTS[stops.at(-1)])); return stops; }
// What a round came to: the number, and the multipliers before it multiplied together.
export function outcome(stops) {
  const segs = stops.map(i => SEGMENTS[i]), n = valueOf(segs.at(-1));
  return { stops, segs, n, x: segs.slice(0, -1).reduce((k, s) => k * valueOf(s), 1) };
}

// ---- the table ---------------------------------------------------------------------------------------------------
// Your chips on the six numbers, with undo, rebet and double. The balance lives in the wallet: `bank` reads and
// writes it.
export class WheelTable {
  constructor({ bank, random = Math.random } = {}) {
    this.bank = bank; this.random = random;
    this.bets = new Map();     // spot → chip values, in the order placed
    this.history = [];         // each gesture: [[spot, value], ...]
    this.last = null;          // the last round's layout, for Rebet
    this.phase = 'betting'; this.staked = 0;
  }
  get balance() { return this.bank.get(); }
  get total() { let s = 0; for (const v of this.bets.values()) for (const c of v) s += c; return s; }
  on(id) { return (this.bets.get(id) ?? []).reduce((a, b) => a + b, 0); }
  // Why a set of chips can't go down, or null. `adds`: [[spot, value], ...]
  refuse(adds) {
    if (this.phase !== 'betting') return 'Bets are closed.';
    const sum = adds.reduce((a, [, v]) => a + v, 0);
    if (sum > this.balance - this.total) return 'Not enough balance.';
    const per = new Map(); for (const [id, v] of adds) per.set(id, (per.get(id) ?? 0) + v);
    for (const [id, v] of per) { const s = SPOTS[id]; if (!s) return 'Not a bet.'; if (this.on(id) + v > s.max) return `The limit on ${s.name} is ${s.max.toLocaleString('en-US')}.`; }
    return null;
  }
  place(adds) {
    const why = this.refuse(adds); if (why) return why;
    for (const [id, v] of adds) { if (!this.bets.has(id)) this.bets.set(id, []); this.bets.get(id).push(v); }
    this.history.push(adds); return null;
  }
  undo() {
    const g = this.history.pop(); if (!g) return null;
    for (const [id] of [...g].reverse()) { const a = this.bets.get(id); a.pop(); if (!a.length) this.bets.delete(id); }
    return g;
  }
  // take the last chip off one spot (press and hold)
  takeFrom(id) {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const g = this.history[i], j = g.findLastIndex(([s]) => s === id); if (j < 0) continue;
      g.splice(j, 1); if (!g.length) this.history.splice(i, 1);
      const a = this.bets.get(id); a.pop(); if (!a.length) this.bets.delete(id); return true;
    }
    return false;
  }
  clear() { if (!this.bets.size) return false; this.bets.clear(); this.history = []; return true; }
  layout() { return [...this.bets].flatMap(([id, vs]) => vs.map(v => [id, v])); }
  // Rebet only when the last layout still fits the balance, so the Spin button never offers what it can't do.
  get lastTotal() { return (this.last ?? []).reduce((a, [, v]) => a + v, 0); }
  get canRebet() { return !!this.last?.length && !this.bets.size && this.lastTotal <= this.balance; }
  rebet() { if (!this.canRebet) return this.last?.length && !this.bets.size ? `Not enough balance to rebet ${this.lastTotal.toLocaleString('en-US')}.` : 'Nothing to rebet.'; return this.place(this.last); }
  double() { if (!this.bets.size) return 'Nothing to double.'; return this.place(this.layout()); }
  // Bets close: the stake leaves the balance.
  close() { if (this.phase !== 'betting' || !this.bets.size || this.total > this.balance) return false; this.phase = 'spinning'; this.staked = this.total; this.last = this.layout(); this.bank.set(this.balance - this.staked); return true; }
  // The round is drawn (or given, as `stops`) and settled: the spot on its number wins the number to one, times
  // the multipliers that came before it; every other spot loses.
  settle(stops = round(this.random)) {
    if (this.phase !== 'spinning') return null;   // only a round whose bets closed is paid
    const o = outcome(stops), wins = [], losses = []; let back = 0;
    for (const [id, vs] of this.bets) {
      const stake = vs.reduce((a, b) => a + b, 0);
      if (SPOTS[id].n === o.n) { const pay = stake * o.n * o.x; wins.push({ id, stake, pay }); back += stake + pay; }
      else losses.push({ id, stake });
    }
    this.bank.set(this.balance + back);
    const r = { ...o, staked: this.staked, back, net: back - this.staked, wins, losses };
    this.bets.clear(); this.history = []; this.phase = 'betting'; return r;
  }
  // A round that couldn't be spun hands the stake back; the chips stay on the layout as they were.
  abandon() { if (this.phase !== 'spinning') return 0; const back = this.staked; this.bank.set(this.balance + back); this.staked = 0; this.phase = 'betting'; return back; }
}

// ---- the spins you have seen ---------------------------------------------------------------------------------------
// How often each number and the multipliers have come in the last `n` rounds (each a list of segments, newest first).
export function stats(history, n = 100) {
  const h = history.slice(0, n), count = h.length, by = Object.fromEntries(NUMBERS.map(k => [k, 0])); let multiplied = 0;
  for (const segs of h) { by[valueOf(segs.at(-1))]++; if (segs.length > 1) multiplied++; }
  return { count, by, multiplied };
}
