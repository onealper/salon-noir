// The other players at the table. Each is a person with a bankroll, a way of betting and a way of
// playing - from textbook basic strategy to gut feel - and a pace. No DOM, no scene: the controller
// deals their cards from the same shoe and the view moves their chips.
import { total, natural, isTen, CHIP_VALUES, LIMITS, bucketOf } from './engine.mjs';
import { pairOf, twentyOnePlus3 } from './sidebets.mjs';

// Seats in deal order, first base (the dealer's left, your right) to third base. You sit in the middle.
export const SEAT_COUNT = 5, YOU = 2;

// Basic strategy for eight decks, dealer stands on soft 17, double after split (the house rules).
// Returns 'hit' | 'stand' | 'double' | 'split'. `canDouble`, `canSplit` narrow what is allowed.
// `freebet`: the Free Bet table's own chart (below); `free`: the hand rides on a free-bet marker alone.
export function basicStrategy(cards, up, { canDouble = true, canSplit = true, freebet = false, free = false } = {}) {
  const d = up.rank === 'A' ? 11 : isTen(up) ? 10 : Number(up.rank), t = total(cards);
  if (canSplit && cards.length === 2 && cards[0].rank === cards[1].rank) {
    const r = cards[0].rank === 'A' ? 11 : isTen(cards[0]) ? 10 : Number(cards[0].rank);
    // at Free Bet every pair but fives is split (free, so it always gains); tens are never split
    const split = freebet ? r !== 5 && r !== 10 : { 11: true, 10: false, 9: d !== 7 && d < 10, 8: true, 7: d <= 7, 6: d <= 6, 5: false, 4: d === 5 || d === 6, 3: d <= 7, 2: d <= 7 }[r];
    if (split) return 'split';
  }
  const dbl = act => canDouble && cards.length === 2 ? 'double' : act;
  if (freebet) return freeBetPlay(t, d, dbl, free);
  if (t.soft && t.value <= 21) {
    const v = t.value;
    if (v >= 19) return 'stand';   // soft 19 doubles against a 6 only where the dealer hits soft 17
    if (v === 18) return d >= 3 && d <= 6 ? dbl('stand') : d <= 8 ? 'stand' : 'hit';
    if (v === 17) return d >= 3 && d <= 6 ? dbl('hit') : 'hit';
    if (v >= 15) return d >= 4 && d <= 6 ? dbl('hit') : 'hit';
    return d >= 5 && d <= 6 ? dbl('hit') : 'hit';
  }
  const v = t.value;
  if (v >= 17) return 'stand';
  if (v >= 13) return d <= 6 ? 'stand' : 'hit';
  if (v === 12) return d >= 4 && d <= 6 ? 'stand' : 'hit';
  if (v === 11) return d <= 10 ? dbl('hit') : 'hit';   // against an ace only a dealer hitting soft 17 makes it a double
  if (v === 10) return d <= 9 ? dbl('hit') : 'hit';
  if (v === 9) return d >= 3 && d <= 6 ? dbl('hit') : 'hit';
  return 'hit';
}
// Free Bet: the same shoe and dealer, but a dealer 22 pushes, so a dealer bust is worth less: stiffs are stood on
// less, paid soft doubles rarely pay, and a hard 9-11 is always doubled (free). Worked out for these rules (S17, 22
// pushes) by exact infinite-deck analysis. A hand on a marker alone costs nothing to lose, so it is played for the
// best chance to win (`free`).
function freeBetPlay({ value: v, soft }, d, dbl, free) {
  if (soft && v <= 21) {
    if (v >= 19) return free && (d === 6 || v === 19 && d === 5) ? dbl('stand') : 'stand';
    if (v === 18) return d === 5 || d === 6 || free && d === 4 ? dbl('stand') : d >= 9 || free && (d === 2 || d === 8) ? 'hit' : 'stand';
    if (v === 17) return d === 6 ? dbl('hit') : 'hit';
    return 'hit';
  }
  if (v >= 17) return free && v === 17 && (d >= 7 && d <= 9 || d === 11) ? 'hit' : 'stand';
  if (v >= 15) return d <= 6 ? 'stand' : 'hit';
  if (v >= 13) return d >= 3 && d <= 6 ? 'stand' : 'hit';
  if (v === 12) return free && (d === 5 || d === 6) ? 'stand' : 'hit';
  return v >= 9 ? dbl('hit') : 'hit';
}

// Ways of playing. `think` is how long they take over a decision (ms), `sway` how often they
// ignore the book and play a hunch, `bets` their usual stake range, `press` how they size the next bet.
// `insure`: how often they take insurance; `sides`: how often they put a chip on Perfect Pairs or
// 21+3 (their seat has those two circles), and how much.
const STYLES = {
  steady:  { label: 'plays by the book', think: [650, 1100], sway: 0, bets: [10, 25], press: 'flat', doubles: true, splits: true, insure: 0, sides: [.08, 5] },
  careful: { label: 'never risks a bust', think: [900, 1600], sway: 0, bets: [5, 10], press: 'flat', doubles: false, splits: false, careful: true, insure: .45, sides: [0, 0] },
  hunch:   { label: 'plays on feel', think: [500, 1400], sway: .3, bets: [5, 50], press: 'mood', doubles: true, splits: true, insure: .3, sides: [.4, 5] },
  whale:   { label: 'bets big', think: [450, 800], sway: .05, bets: [100, 300], press: 'flat', doubles: true, splits: true, insure: .1, sides: [.25, 25] },
  chaser:  { label: 'doubles up after a loss', think: [550, 950], sway: .1, bets: [10, 10], press: 'martingale', doubles: true, splits: true, insure: 0, sides: [.15, 5] },
};
const PEOPLE = [
  ['Marta', 'steady'], ['Kenji', 'whale'], ['Olu', 'hunch'], ['Viktor', 'careful'], ['Priya', 'steady'],
  ['Luca', 'chaser'], ['Hana', 'hunch'], ['Sam', 'careful'], ['Inès', 'whale'], ['Theo', 'steady'], ['Amara', 'chaser'], ['Jonas', 'hunch'],
];
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const between = (rng, [lo, hi]) => lo + rng() * (hi - lo);
// A bet made up of real chip values, as a player would push out.
const roundBet = v => { const c = [...CHIP_VALUES].reverse().find(x => x <= v / 2) ?? 1; return Math.max(LIMITS.main[0], Math.round(v / c) * c); };

export class Player {
  constructor(name, styleId, rng = Math.random) {
    this.name = name; this.styleId = styleId; this.style = STYLES[styleId]; this.rng = rng;
    this.bankroll = Math.round(between(rng, styleId === 'whale' ? [3000, 8000] : [400, 1600]) / 50) * 50;
    this.base = roundBet(between(rng, this.style.bets)); this.nextBet = this.base; this.mood = 1;
    this.rounds = 0; this.mode = 'classic'; this.pending = null; this.clear();
  }
  clear() { this.hands = []; this.at = 0; this.stake = 0; this.side = {}; this.insurance = 0; this.fee = 0; this.flash = null; }
  get initial() { return this.name[0]; }
  get note() { return this.style.label; }
  thinkTime() { return between(this.rng, this.style.think); }
  // ---- betting ----
  wantsToPlay() { return this.bankroll >= LIMITS.main[0] * (this.mode === 'lightning' ? 2 : 1); }
  chooseBet() {
    let b = this.nextBet;
    if (this.style.press === 'mood') b = roundBet(this.base * this.mood * between(this.rng, [.6, 1.6]));
    const reach = this.mode === 'lightning' ? Math.floor(this.bankroll / 2 / 5) * 5 : this.bankroll;   // the Lightning fee matches the bet
    return Math.min(LIMITS.main[1], Math.max(LIMITS.main[0], Math.min(b, reach)));
  }
  placeBet(amount) { this.fee = this.mode === 'lightning' ? amount : 0; this.bankroll -= amount + this.fee; this.stake = amount; this.hands = [{ cards: [], stake: amount, base: amount, free: 0, doubled: false, done: false }]; this.at = 0; }
  // Now and then a chip on Perfect Pairs ('pairs') or 21+3 ('p213'). Returns what they put down.
  chooseSides() {
    const [often, size] = this.style.sides, out = {};
    if (this.rng() < often && this.bankroll >= size) { const id = this.rng() < .5 ? 'pairs' : 'p213'; out[id] = size; this.bankroll -= size; }
    this.side = { ...out }; return out;
  }
  // The side bets are decided on their first two cards and the dealer's up card.
  settleSides(up) {
    const [a, b] = this.hands[0].cards, out = [];
    for (const [id, stake] of Object.entries(this.side)) {
      const win = id === 'pairs' ? pairOf(a, b) : twentyOnePlus3(a, b, up), payout = win ? stake * (win.pays + 1) : 0;
      this.bankroll += payout; out.push({ id, stake, payout, win });
    }
    this.side = {}; return out;
  }
  wantsInsurance() { return this.rng() < this.style.insure && this.bankroll >= this.stake / 2; }
  insure() { this.insurance = this.stake / 2; this.bankroll -= this.insurance; return this.insurance; }
  // With a blackjack against an ace, the same appetite takes even money: paid 1 to 1 at once, no chips needed.
  wantsEvenMoney() { return this.rng() < this.style.insure; }
  evenMoney() { const h = this.hands[0]; h.evenMoney = h.done = true; this.bankroll += h.stake * 2; return h.stake; }
  settleInsurance(dealerBJ) { const paid = dealerBJ ? this.insurance * 3 : 0; this.bankroll += paid; const r = { stake: this.insurance, payout: paid }; this.insurance = 0; return r; }
  // ---- playing ----
  get hand() { return this.hands[this.at]; }
  // hands the dealer must still play against: not bust, not a blackjack, not a ten-card Charlie
  get standing() { return this.hands.some(h => { const v = total(h.cards).value; return h.cards.length && v <= 21 && !(natural(h.cards) && !h.fromSplit) && h.cards.length < 10; }); }
  // Free Bet: a double on a hard 9-11 and a split of any pair but tens cost nothing.
  get freeDouble() { const h = this.hand, t = total(h.cards); return this.mode === 'freebet' && h.cards.length === 2 && !h.splitAces && !t.soft && t.value >= 9 && t.value <= 11; }
  // A pair that can still be split: one split, or at Free Bet up to four hands (aces too).
  get canResplit() { const c = this.hand.cards; return c.length === 2 && c[0].rank === c[1].rank && this.hands.length < (this.mode === 'freebet' ? 4 : 2); }
  get freeSplit() { return this.mode === 'freebet' && this.canResplit && !isTen(this.hand.cards[0]); }
  decide(up) {
    const h = this.hand, free = this.freeDouble, canDouble = this.style.doubles && h.cards.length === 2 && !h.splitAces && (free || this.bankroll >= h.base);
    const canSplit = this.style.splits && this.canResplit && (this.freeSplit || this.bankroll >= h.base);
    if (h.splitAces) return canSplit ? 'split' : 'stand';   // a split ace takes one card; another ace may split again
    // anything free is taken (a free split of fives would throw away a free double on ten)
    if (this.freeSplit && this.style.splits && h.cards[0].rank !== '5') return 'split';
    if (free && canDouble) return 'double';
    let act = basicStrategy(h.cards, up, { canDouble, canSplit, freebet: this.mode === 'freebet', free: !h.stake });
    if (act === 'split') return act;
    const v = total(h.cards).value, soft = total(h.cards).soft;
    if (this.style.careful && !soft && v >= 12) act = 'stand';
    if (this.rng() < this.style.sway) act = v <= 11 ? 'hit' : v >= 17 ? 'stand' : this.rng() < .5 ? 'hit' : 'stand';   // a hunch
    return act;
  }
  double() { const h = this.hand; if (this.freeDouble) { h.free += h.base; h.freeDoubled = true; } else { this.bankroll -= h.base; h.stake += h.base; } h.doubled = true; }
  // A split, as the house allows: the hand in play becomes two of one card each (at `at` and `at + 1`), the first
  // keeping its stake (or marker), the same stake again on the second - or, when free, a marker.
  split() {
    const h = this.hand, [a, b] = h.cards, aces = a.rank === 'A', free = this.freeSplit; if (!free) this.bankroll -= h.base;
    this.hands.splice(this.at, 1, { cards: [a], stake: h.stake, base: h.base, free: h.free, fromSplit: true, splitAces: aces, done: false }, { cards: [b], stake: free ? 0 : h.base, base: h.base, free: free ? h.base : 0, fromSplit: true, splitAces: aces, done: false });
    return free;
  }
  // ---- settling (same rules as yours: 3:2 blackjack, ten-card Charlie) ----
  // Returns one result per hand, in hand order.
  // At the Lightning table `board` is the round's struck multipliers; `this.flash` then says what
  // happened to theirs ({ bonus, earned, lost }), same rules as yours.
  settle(dealer, board) {
    if (!this.hands.length) return [];
    const d = total(dealer).value, db = natural(dealer), push22 = this.mode === 'freebet' && d === 22;
    const out = this.hands.map(h => {
      const p = total(h.cards).value, pb = natural(h.cards) && !h.fromSplit, charlie = h.cards.length >= 10 && p <= 21;
      let payout = 0, kind = 'loss';
      if (h.evenMoney) { payout = h.stake * 2; kind = 'win'; }   // paid already, at the offer
      else if (pb && db) { payout = h.stake; kind = 'push'; }
      else if (db) kind = 'loss';
      else if (pb) { payout = h.stake * 2.5; kind = 'blackjack'; }
      else if (p > 21) kind = 'loss';
      else if (push22 && !charlie) { payout = h.stake; kind = 'push'; }
      else if (charlie || d > 21 || p > d) { payout = h.stake * 2 + h.free; kind = 'win'; }
      else if (p === d) { payout = h.stake; kind = 'push'; }
      if (!h.evenMoney) this.bankroll += payout;
      return { payout, net: payout - h.stake, kind, total: p, stake: h.stake, free: h.free, evenMoney: !!h.evenMoney };
    });
    this.rounds++;
    let net = out.reduce((s, r) => s + r.net, 0);
    if (this.mode === 'lightning' && board) {
      const won = out.some(r => r.kind === 'win' || r.kind === 'blackjack'), pushed = out.every(r => r.kind === 'push'), f = {};
      if (this.pending && won) { f.bonus = { m: this.pending.m, amount: this.pending.fee * this.pending.m }; this.bankroll += f.bonus.amount; net += f.bonus.amount; this.pending = null; }
      else if (this.pending && !pushed) { f.lost = this.pending; this.pending = null; }
      for (const r of out) if ((r.kind === 'win' || r.kind === 'blackjack') && !r.evenMoney) { const b = bucketOf(r), m = board[b]; if (!f.earned || m > f.earned.m) f.earned = { m, bucket: b, fee: this.fee }; }
      if (f.earned) this.pending = f.earned;
      this.flash = f;
    }
    // how they size the next one
    if (this.style.press === 'martingale') this.nextBet = net < 0 ? Math.min(this.base * 8, this.nextBet * 2) : this.base;
    if (this.style.press === 'mood') this.mood = Math.min(2.5, Math.max(.5, this.mood * (net > 0 ? 1.25 : net < 0 ? .85 : 1)));
    return out;
  }
  // A voided round gives back what is still on the felt.
  refund() { const back = this.fee + this.hands.reduce((s, h) => s + (h.evenMoney ? 0 : h.stake), 0) + Object.values(this.side).reduce((s, v) => s + v, 0) + this.insurance; this.bankroll += back; this.clear(); return back; }
  // After a shoe, some people move on; anyone short of a bet leaves at once.
  get leaving() { return !this.wantsToPlay() || this.bankroll < this.base; }
}

// Who is sitting where. `size` is how many other players you want at the table (0-4).
export class Seating {
  constructor(rng = Math.random) { this.rng = rng; this.seats = Array(SEAT_COUNT).fill(null); this.used = new Set(); }
  static order(size) { return [[], [1], [1, 3], [0, 1, 3], [0, 1, 3, 4]][Math.max(0, Math.min(4, size))]; }
  newcomer() {
    const free = PEOPLE.filter(([n]) => !this.used.has(n) && !this.seats.some(p => p?.name === n));
    const [name, style] = pick(this.rng, free.length ? free : PEOPLE); this.used.add(name);
    return new Player(name, style, this.rng);
  }
  // Fill (or empty) seats to match the wanted size. Returns the changes, for the table to announce.
  arrange(size) {
    const want = new Set(Seating.order(size)), changes = [];
    for (let k = 0; k < SEAT_COUNT; k++) {
      if (k === YOU) continue;
      if (!want.has(k) && this.seats[k]) { changes.push({ seat: k, left: this.seats[k] }); this.seats[k] = null; }
      if (want.has(k) && !this.seats[k]) { const p = this.newcomer(); this.seats[k] = p; changes.push({ seat: k, joined: p }); }
    }
    return changes;
  }
  // Between hands: anyone short of their bet gets up at once and someone new takes the seat, so a
  // seat never sits idle for the rest of the shoe.
  replaceLeaving() {
    const changes = [];
    for (let k = 0; k < SEAT_COUNT; k++) {
      const p = this.seats[k]; if (!p || k === YOU || !p.leaving) continue;
      const q = this.newcomer(); q.mode = p.mode; this.seats[k] = q; changes.push({ seat: k, left: p, joined: q });
    }
    return changes;
  }
  // Between shoes: people who are broke or done leave; now and then someone just moves on.
  turnover(size) {
    const changes = [];
    for (let k = 0; k < SEAT_COUNT; k++) {
      const p = this.seats[k]; if (!p || k === YOU) continue;
      if (p.leaving || (p.rounds > 12 && this.rng() < .25)) { const q = this.newcomer(); this.seats[k] = q; changes.push({ seat: k, left: p, joined: q }); }
    }
    return changes.concat(this.arrange(size));
  }
  get players() { return this.seats.map((p, k) => p && { seat: k, p }).filter(Boolean); }
}
