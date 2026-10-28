// Single-zero (European) roulette: the wheel, every bet on the layout, the call bets, and a table that
// takes chips and settles them. Rules and payouts from the New Jersey (N.J.A.C. 13:69F-5), Singapore GRA
// and Monte-Carlo SBM rule filings; every bet returns 36/37 of its stake over the 37 numbers, except that the table
// plays la partage, as Monte-Carlo does: on zero an even-money bet loses only half, so it returns 36.5/37 (98.65%).

// The wheel, clockwise from zero, and the red numbers.
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const POCKETS = WHEEL.length, PITCH = Math.PI * 2 / POCKETS;
export const WHEEL_INDEX = Object.fromEntries(WHEEL.map((n, i) => [n, i]));
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = n => n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black';
export { CHIP_VALUES } from '../core/chips.mjs';   // the salon's chips, the same at every table

// On the layout: numbers run in rows of three away from the wheel; a number's row and column.
export const rowOf = n => Math.ceil(n / 3), colOf = n => (n - 1) % 3 + 1;

// ---- every bet spot on the layout -------------------------------------------------------------------
// kind → what it pays (to 1) and the most one player may stake on it.
export const KINDS = {
  straight: { pays: 35, max: 100, name: 'Straight up' },
  split:    { pays: 17, max: 200, name: 'Split' },
  street:   { pays: 11, max: 300, name: 'Street' },
  trio:     { pays: 11, max: 300, name: 'Trio' },
  corner:   { pays: 8,  max: 400, name: 'Corner' },
  four:     { pays: 8,  max: 400, name: 'First four' },
  line:     { pays: 5,  max: 600, name: 'Six line' },
  column:   { pays: 2,  max: 1500, name: 'Column' },
  dozen:    { pays: 2,  max: 1500, name: 'Dozen' },
  even:     { pays: 1,  max: 3000, name: 'Even money' },
};
export const LIMITS = { min: 1, table: 10000 };
const OUTSIDE = {
  col1: { nums: n => n > 0 && colOf(n) === 1, label: 'Column 1', short: '2 to 1' },
  col2: { nums: n => n > 0 && colOf(n) === 2, label: 'Column 2', short: '2 to 1' },
  col3: { nums: n => n > 0 && colOf(n) === 3, label: 'Column 3', short: '2 to 1' },
  doz1: { nums: n => n >= 1 && n <= 12, label: '1st 12' },
  doz2: { nums: n => n >= 13 && n <= 24, label: '2nd 12' },
  doz3: { nums: n => n >= 25, label: '3rd 12' },
  low:  { nums: n => n >= 1 && n <= 18, label: '1 to 18' },
  even: { nums: n => n > 0 && n % 2 === 0, label: 'Even' },
  red:  { nums: n => REDS.has(n), label: 'Red' },
  black:{ nums: n => n > 0 && !REDS.has(n), label: 'Black' },
  odd:  { nums: n => n % 2 === 1, label: 'Odd' },
  high: { nums: n => n >= 19, label: '19 to 36' },
};
const ALL = Array.from({ length: 37 }, (_, i) => i);
export const SPOTS = new Map();
function add(id, kind, nums, label) { SPOTS.set(id, { id, kind, nums: [...nums].sort((a, b) => a - b), pays: KINDS[kind].pays, max: KINDS[kind].max, label }); }
for (const n of ALL) add(`n${n}`, 'straight', [n], `${n}`);
for (let n = 1; n <= 36; n++) {
  if (colOf(n) < 3) add(`sp${n}-${n + 1}`, 'split', [n, n + 1], `${n}/${n + 1}`);
  if (n <= 33) add(`sp${n}-${n + 3}`, 'split', [n, n + 3], `${n}/${n + 3}`);
  if (colOf(n) === 1) add(`st${n}`, 'street', [n, n + 1, n + 2], `${n}–${n + 2}`);
  if (colOf(n) < 3 && n <= 32) add(`co${n}`, 'corner', [n, n + 1, n + 3, n + 4], `${n}/${n + 1}/${n + 3}/${n + 4}`);
  if (colOf(n) === 1 && n <= 31) add(`sl${n}`, 'line', [n, n + 1, n + 2, n + 3, n + 4, n + 5], `${n}–${n + 5}`);
}
for (const k of [1, 2, 3]) add(`sp0-${k}`, 'split', [0, k], `0/${k}`);
add('tr0-1-2', 'trio', [0, 1, 2], '0/1/2'); add('tr0-2-3', 'trio', [0, 2, 3], '0/2/3');
add('ff', 'four', [0, 1, 2, 3], '0/1/2/3');
for (const [id, o] of Object.entries(OUTSIDE)) add(id, id.startsWith('col') ? 'column' : id.startsWith('doz') ? 'dozen' : 'even', ALL.filter(o.nums), o.label);
export const spot = id => SPOTS.get(id);
// What a spot is called in the interface: "Split 17/20 · 17:1".
export function describe(id) {
  const s = SPOTS.get(id); if (!s) return '';
  const k = KINDS[s.kind], head = s.kind === 'straight' ? `Straight ${s.label}` : ['column', 'dozen', 'even', 'four'].includes(s.kind) ? s.label : `${k.name} ${s.label}`;
  return `${head} · ${s.pays}:1`;
}

// ---- call bets (the racetrack) ----------------------------------------------------------------------
// Each is a set of chips, one unit each unless doubled, on ordinary spots (Singapore GRA racetrack rules).
export const CALLS = {
  voisins: { name: 'Voisins du zéro', short: 'Voisins', chips: [['tr0-2-3', 2], ['sp4-7', 1], ['sp12-15', 1], ['sp18-21', 1], ['sp19-22', 1], ['sp32-35', 1], ['co25', 2]] },
  tiers: { name: 'Tiers du cylindre', short: 'Tiers', chips: [['sp5-8', 1], ['sp10-11', 1], ['sp13-16', 1], ['sp23-24', 1], ['sp27-30', 1], ['sp33-36', 1]] },
  orphelins: { name: 'Orphelins', short: 'Orphelins', chips: [['n1', 1], ['sp6-9', 1], ['sp14-17', 1], ['sp17-20', 1], ['sp31-34', 1]] },
  zero: { name: 'Jeu zéro', short: 'Zero', chips: [['sp0-3', 1], ['sp12-15', 1], ['sp32-35', 1], ['n26', 1]] },
};
// Numbers a call bet covers (for highlighting).
export const callNumbers = key => [...new Set(CALLS[key].chips.flatMap(([id]) => SPOTS.get(id).nums))].sort((a, b) => a - b);
// A neighbours bet: the number and `k` pockets either side of it on the wheel, a chip on each.
export function neighbours(n, k = 2) { const i = WHEEL_INDEX[n]; return Array.from({ length: 2 * k + 1 }, (_, j) => WHEEL[(i - k + j + POCKETS * 2) % POCKETS]); }
// The racetrack's sections, as runs of the wheel (for drawing).
export const SECTIONS = {
  tiers: [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33],
  orphelins: [1, 20, 14, 31, 9, 17, 34, 6],
  voisins: [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25],
  zero: [12, 35, 3, 26, 0, 32, 15],
};

// ---- the table ---------------------------------------------------------------------------------------
// Your chips on the layout, spot by spot, with undo (a call bet undoes as one), rebet and double. The
// balance lives in the wallet: `bank` reads and writes it. A Lightning table (roulette/lightning.mjs) prices an
// unstruck straight-up lower (`straight`, to 1) and plays no la partage.
export class RouletteTable {
  constructor({ bank, random = Math.random, straight = KINDS.straight.pays, partage = true } = {}) {
    this.bank = bank; this.random = random; this.straight = straight; this.partage = partage;
    this.bets = new Map();     // spot id → chip values, in the order placed
    this.history = [];         // each gesture: [[spot, value], ...]
    this.last = null;          // the layout of the last spin, for Rebet
    this.phase = 'betting';
  }
  // the table's prices (a Lightning table cuts the straight-up and has no la partage), between spins only
  setRules({ straight = KINDS.straight.pays, partage = true } = {}) { if (this.phase !== 'betting') return false; this.straight = straight; this.partage = partage; return true; }
  get balance() { return this.bank.get(); }
  get total() { let s = 0; for (const v of this.bets.values()) for (const c of v) s += c; return s; }
  on(id) { return (this.bets.get(id) ?? []).reduce((a, b) => a + b, 0); }
  // Why a set of chips can't go down, or null. `adds`: [[spot, value], ...]
  refuse(adds) {
    if (this.phase !== 'betting') return 'Bets are closed.';
    const sum = adds.reduce((a, [, v]) => a + v, 0);
    if (sum > this.balance - this.total) return 'Not enough balance.';
    if (this.total + sum > LIMITS.table) return `The table maximum is ${LIMITS.table.toLocaleString('en-US')}.`;
    const per = new Map(); for (const [id, v] of adds) per.set(id, (per.get(id) ?? 0) + v);
    for (const [id, v] of per) { const s = SPOTS.get(id); if (!s) return 'Not a bet.'; if (this.on(id) + v > s.max) return `${KINDS[s.kind].name} limit is ${s.max}.`; }
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
  // Settle on the winning number: each spot wins or loses whole, except la partage: on zero, red, black, odd, even,
  // 1-18 and 19-36 lose half and the other half comes back (`back` on that loss). At a Lightning table `struck`
  // (number → multiplier) prices a straight-up on a struck number at its multiplier (`x` on that win). Returns the
  // wins, the losses, what came back on zero (`partage`) and the net.
  settle(n, struck = null) {
    if (this.phase !== 'spinning') return null;   // only a spin whose bets closed is paid
    const wins = [], losses = []; let back = 0, partage = 0;
    for (const [id, vs] of this.bets) {
      const s = SPOTS.get(id), stake = vs.reduce((a, b) => a + b, 0);
      if (s.nums.includes(n)) { const x = s.kind === 'straight' ? struck?.get(n) : undefined, pay = stake * (x ?? (s.kind === 'straight' ? this.straight : s.pays)); wins.push({ id, stake, pay, kind: s.kind, ...(x ? { x } : {}) }); back += stake + pay; }
      else if (n === 0 && s.kind === 'even' && this.partage) { const half = stake / 2; losses.push({ id, stake, kind: s.kind, back: half }); back += half; partage += half; }
      else losses.push({ id, stake, kind: s.kind });
    }
    this.bank.set(this.balance + back);
    const r = { n, color: colorOf(n), staked: this.staked, back, net: back - this.staked, wins, losses, partage, straight: wins.some(w => w.kind === 'straight'), x: wins.find(w => w.x)?.x ?? 0 };
    this.bets.clear(); this.history = []; this.phase = 'betting'; return r;
  }
  // A spin that couldn't finish hands the stake back; the chips stay on the layout as they were.
  abandon() { if (this.phase !== 'spinning') return 0; const back = this.staked; this.bank.set(this.balance + back); this.staked = 0; this.phase = 'betting'; return back; }
}

// The result of a spin: a fair draw from 37 pockets.
export function draw(random = Math.random) {
  if (random === Math.random && globalThis.crypto?.getRandomValues) { const a = new Uint32Array(1); let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= 4294967296 - 4294967296 % 37); return x % 37; }
  return Math.floor(random() * 37);
}

// ---- statistics over the spins you have seen ------------------------------------------------------
export function stats(history, n = 100) {
  const h = history.slice(0, n), count = h.length, freq = new Array(37).fill(0);
  for (const x of h) freq[x]++;
  const pct = f => count ? Math.round(h.filter(f).length / count * 100) : 0;
  const since = ALL.map(k => { const i = h.indexOf(k); return i < 0 ? count : i; });
  const byFreq = ALL.map(k => ({ n: k, c: freq[k], since: since[k] }));
  const hot = [...byFreq].filter(x => x.c > 0).sort((a, b) => b.c - a.c || a.since - b.since).slice(0, 5);
  const cold = [...byFreq].sort((a, b) => a.c - b.c || b.since - a.since).slice(0, 5);
  return {
    count, hot, cold,
    red: pct(x => REDS.has(x)), black: pct(x => x > 0 && !REDS.has(x)), zero: pct(x => x === 0),
    odd: pct(x => x % 2 === 1), even: pct(x => x > 0 && x % 2 === 0),
    low: pct(x => x >= 1 && x <= 18), high: pct(x => x >= 19),
    dozens: [pct(x => x >= 1 && x <= 12), pct(x => x >= 13 && x <= 24), pct(x => x >= 25)],
    columns: [1, 2, 3].map(c => pct(x => x > 0 && colOf(x) === c)),
  };
}
