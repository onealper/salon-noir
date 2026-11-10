// Punto banco, baccarat as casinos deal it: an eight-deck shoe, two hands (Player and Banker) drawn to fixed rules,
// and you bet on which ends nearer nine. Rules and payouts as in the New Jersey (N.J.A.C. 13:69F-3, 13:69F-4) and
// Macau (DICJ) filings. No DOM in here: the room (baccarat/bgame.mjs) only reads this state.
import { shoe as freshShoe } from '../engine.mjs';
export { CHIP_VALUES } from '../core/chips.mjs';   // the salon's chips, the same at every table

export const DECKS = 8, SHOE_CARDS = DECKS * 52;
// The cut card goes in sixteen cards from the back: a coup takes at most six, so the one begun before it shows is
// always finished from the same shoe, and a shoe gives about eighty coups.
export const CUT_AT = SHOE_CARDS - 16;

// An ace counts one, the two to the nine their pips, tens and court cards nothing; a hand is worth the last digit
// of its sum.
export const valueOf = c => c.rank === 'A' ? 1 : c.rank === '10' || c.rank === 'J' || c.rank === 'Q' || c.rank === 'K' ? 0 : Number(c.rank);
export const points = cards => cards.reduce((s, c) => s + valueOf(c), 0) % 10;

// ---- the tableau -----------------------------------------------------------------------------------------------
// With an eight or a nine in either hand's first two cards (a natural) nobody draws. Otherwise Player draws on 0 to
// 5 and stands on 6 and 7; Banker, when Player stood, does the same, and when Player drew goes by his own total and
// the card Player drew (`third`, its value; null when Player stood).
export const playerDraws = p => p <= 5;
export function bankerDraws(b, third = null) {
  if (third == null) return b <= 5;
  if (b <= 2) return true;
  if (b === 3) return third !== 8;
  if (b === 4) return third >= 2 && third <= 7;
  if (b === 5) return third >= 4 && third <= 7;
  if (b === 6) return third === 6 || third === 7;
  return false;
}
// A coup, from the cards as they leave the shoe (`draw()` gives the next): Player, Banker, Player, Banker, then
// the third cards the tableau calls for, Player's first.
export function coup(draw) {
  const player = [draw()], banker = [draw()]; player.push(draw()); banker.push(draw());
  const natural = points(player) >= 8 || points(banker) >= 8;
  if (!natural) {
    let third = null;
    if (playerDraws(points(player))) { const c = draw(); player.push(c); third = valueOf(c); }
    if (bankerDraws(points(banker), third)) banker.push(draw());
  }
  const p = points(player), b = points(banker);
  return { player, banker, p, b, natural, winner: p > b ? 'player' : b > p ? 'banker' : 'tie', playerPair: player[0].rank === player[1].rank, bankerPair: banker[0].rank === banker[1].rank };
}

// ---- the tables ------------------------------------------------------------------------------------------------
// Two tables, the same game but for what a winning Banker bet is paid. Classic: 19 to 20, which is even money less
// the house's 5% commission, and as the filings allow, a commission that is no whole number of half chips (the
// salon's smallest piece) is taken up to the next one: so a Banker bet in tens is paid exactly, and one of 25 is
// paid 23.5. No commission: Banker is paid even money, but a Banker win with a six pays half.
export const TABLES = {
  classic: {
    id: 'classic', name: 'Classic', title: 'BACCARAT', banker: '19 to 20',
    felt: ['PLAYER PAYS 1 TO 1 · BANKER PAYS 19 TO 20', 'TIE PAYS 8 TO 1 · PAIRS PAY 11 TO 1'],
  },
  nocomm: {
    id: 'nocomm', name: 'No commission', title: 'NO COMMISSION BACCARAT', banker: '1 to 1',
    felt: ['PLAYER AND BANKER PAY 1 TO 1 · BANKER WINNING ON 6 PAYS 1 TO 2', 'TIE PAYS 8 TO 1 · PAIRS PAY 11 TO 1'],
  },
};
// spot → its name, what it pays (to 1) and the most one player may stake on it
export const SPOTS = {
  player: { name: 'Player', pays: 1, max: 1000 },
  banker: { name: 'Banker', pays: .95, max: 1000 },
  tie: { name: 'Tie', pays: 8, max: 100 },
  ppair: { name: 'Player pair', pays: 11, max: 100 },
  bpair: { name: 'Banker pair', pays: 11, max: 100 },
};
export const SPOT_IDS = Object.keys(SPOTS);
export const MIN_BET = 1;
// The commission on a Banker win of `stake` (whole chips): 5%, up to the next half chip.
export const commission = stake => Math.ceil(stake / 10) / 2;
// What a spot's stake comes back as after a coup `c` at table `kind`: 0 for a loss, the stake alone for a push
// (Player and Banker on a tie), stake and winnings for a win.
export function returned(id, stake, c, kind = 'classic') {
  if (id === 'player') return c.winner === 'player' ? stake * 2 : c.winner === 'tie' ? stake : 0;
  if (id === 'banker') return c.winner === 'tie' ? stake : c.winner !== 'banker' ? 0 : kind === 'nocomm' ? stake + (c.b === 6 ? stake / 2 : stake) : stake * 2 - commission(stake);
  if (id === 'tie') return c.winner === 'tie' ? stake * (SPOTS.tie.pays + 1) : 0;
  if (id === 'ppair') return c.playerPair ? stake * (SPOTS.ppair.pays + 1) : 0;
  if (id === 'bpair') return c.bankerPair ? stake * (SPOTS.bpair.pays + 1) : 0;
  return 0;
}

// ---- the table ---------------------------------------------------------------------------------------------------
// Your chips on the five spots, with undo, rebet and double; the shoe; and a coup closed, dealt and settled in one
// go (the room then shows what was dealt). The balance lives in the wallet: `bank` reads and writes it.
export class BaccaratTable {
  constructor({ bank, random = Math.random, kind = 'classic' } = {}) {
    this.bank = bank; this.random = random; this.kind = TABLES[kind] ? kind : 'classic';
    this.bets = new Map();     // spot → chip values, in the order placed
    this.history = [];         // each gesture: [[spot, value], ...]
    this.last = null;          // the last coup's layout, for Rebet
    this.phase = 'betting'; this.staked = 0;
    this.stacked = [];         // cards to deal before the shoe's own (a testing session's rig)
    this.road = [];            // this shoe's coups, the oldest first: { winner, p, b, natural, playerPair, bankerPair }
    this.newShoe();
  }
  // a fresh eight decks, shuffled; the first card is burned (returned, for the show)
  newShoe() { this.cards = freshShoe(this.random, DECKS); this.dealt = 0; this.road = []; return this.draw(); }
  draw() { this.dealt++; return this.stacked.length ? this.stacked.shift() : this.cards.pop(); }
  get remaining() { return this.cards.length; }
  get cutReached() { return this.dealt >= CUT_AT; }
  // the table's rules, between coups only
  setKind(kind) { if (this.phase !== 'betting' || !TABLES[kind]) return false; this.kind = kind; return true; }
  get balance() { return this.bank.get(); }
  get total() { let s = 0; for (const v of this.bets.values()) for (const c of v) s += c; return s; }
  on(id) { return (this.bets.get(id) ?? []).reduce((a, b) => a + b, 0); }
  // Why a set of chips can't go down, or null. `adds`: [[spot, value], ...]
  refuse(adds) {
    if (this.phase !== 'betting') return 'Bets are closed.';
    const sum = adds.reduce((a, [, v]) => a + v, 0);
    if (sum > this.balance - this.total) return 'Not enough balance.';
    const per = new Map(); for (const [id, v] of adds) per.set(id, (per.get(id) ?? 0) + v);
    for (const [id, v] of per) { const s = SPOTS[id]; if (!s) return 'Not a bet.'; if (this.on(id) + v > s.max) return `${s.name} limit is ${s.max.toLocaleString('en-US')}.`; }
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
  // Rebet only when the last layout still fits the balance, so the Deal button never offers what it can't do.
  get lastTotal() { return (this.last ?? []).reduce((a, [, v]) => a + v, 0); }
  get canRebet() { return !!this.last?.length && !this.bets.size && this.lastTotal <= this.balance; }
  rebet() { if (!this.canRebet) return this.last?.length && !this.bets.size ? `Not enough balance to rebet ${this.lastTotal.toLocaleString('en-US')}.` : 'Nothing to rebet.'; return this.place(this.last); }
  double() { if (!this.bets.size) return 'Nothing to double.'; return this.place(this.layout()); }
  // Bets close: the stake leaves the balance.
  close() { if (this.phase !== 'betting' || !this.bets.size || this.total > this.balance) return false; this.phase = 'dealing'; this.staked = this.total; this.last = this.layout(); this.bank.set(this.balance - this.staked); return true; }
  // The coup is dealt from the shoe and every spot settled on it: wins (with what each pays), pushes (Player and
  // Banker on a tie) and losses, the commission taken on a Banker win at the Classic table, and the net.
  settle() {
    if (this.phase !== 'dealing') return null;   // only a coup whose bets closed is dealt
    const c = coup(() => this.draw()), wins = [], pushes = [], losses = []; let back = 0, fee = 0;
    for (const [id, vs] of this.bets) {
      const stake = vs.reduce((a, b) => a + b, 0), got = returned(id, stake, c, this.kind);
      if (got > stake) { wins.push({ id, stake, pay: got - stake }); if (id === 'banker' && this.kind === 'classic') fee += stake * 2 - got; }
      else if (got === stake) pushes.push({ id, stake });
      else losses.push({ id, stake });
      back += got;
    }
    this.bank.set(this.balance + back);
    this.road.push({ winner: c.winner, p: c.p, b: c.b, natural: c.natural, playerPair: c.playerPair, bankerPair: c.bankerPair });
    const r = { ...c, kind: this.kind, staked: this.staked, back, net: back - this.staked, wins, pushes, losses, commission: fee };
    this.bets.clear(); this.history = []; this.phase = 'betting'; return r;
  }
  // A coup that couldn't be dealt hands the stake back; the chips stay on the layout as they were.
  abandon() { if (this.phase !== 'dealing') return 0; const back = this.staked; this.bank.set(this.balance + back); this.staked = 0; this.phase = 'betting'; return back; }
}

// ---- the roads -------------------------------------------------------------------------------------------------
// The big road, as the scoreboards draw it: a column for each run of the same winner, six cells deep; a run longer
// than its column has room for turns along the row (the dragon's tail); a tie is marked on the cell before it (the
// first cell's own, when the shoe opens on ties). Returns the cells: { col, row, winner, ties, natural, pair }.
export function bigRoad(road, rows = 6) {
  const cells = [], taken = new Set(), key = (c, r) => `${c},${r}`;
  let col = -1, row = 0, start = -1, last = null, lead = 0;
  for (const r of road) {
    if (r.winner === 'tie') { if (cells.length) cells.at(-1).ties++; else lead++; continue; }
    if (r.winner !== last) { do start++; while (taken.has(key(start, 0))); col = start; row = 0; last = r.winner; }   // a new column, past any tail lying in its way
    else if (col === start && row + 1 < rows && !taken.has(key(col, row + 1))) row++;
    else do col++; while (taken.has(key(col, row)));   // the tail: along the row
    taken.add(key(col, row));
    cells.push({ col, row, winner: r.winner, ties: lead, natural: !!r.natural, pair: (r.playerPair ? 1 : 0) + (r.bankerPair ? 2 : 0) }); lead = 0;
  }
  return cells;
}
// What a shoe has given so far.
export function tally(road) {
  const t = { player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0, natural: 0, coups: road.length };
  for (const r of road) { t[r.winner]++; if (r.playerPair) t.playerPair++; if (r.bankerPair) t.bankerPair++; if (r.natural) t.natural++; }
  return t;
}

// ---- the other players -------------------------------------------------------------------------------------------
// How a player at another seat bets a coup: which side (by temperament: with the Banker, with the run, against it,
// or as it comes), how much, and now and then a chip on the tie. `rng` in [0, 1).
export const TEMPERS = ['banker', 'run', 'against', 'whim'];
export function rivalBet({ temper = 'whim', base = 10 }, road, rng = Math.random) {
  const lastWin = [...road].reverse().find(r => r.winner !== 'tie')?.winner ?? null, other = s => s === 'player' ? 'banker' : 'player';
  let side = rng() < .5 ? 'player' : 'banker';
  if (temper === 'banker') side = rng() < .85 ? 'banker' : 'player';
  else if (temper === 'run' && lastWin) side = rng() < .8 ? lastWin : other(lastWin);
  else if (temper === 'against' && lastWin) side = rng() < .75 ? other(lastWin) : lastWin;
  const k = rng(), stake = Math.min(SPOTS[side].max, base * (k < .6 ? 1 : k < .88 ? 2 : 4));
  const adds = [[side, stake]];
  if (rng() < .1) adds.push(['tie', Math.max(1, Math.min(SPOTS.tie.max, Math.round(base / 5)))]);
  return adds;
}
