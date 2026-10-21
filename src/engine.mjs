// Blackjack rules — Nevada's All Bets Blackjack filing: eight decks, dealer
// stands on all 17s, hole card with insurance on an ace, blackjack 3:2, one
// split to two hands (resplits to four at the Free Bet table), one card on split
// aces, double after split, ten-card Charlie. No DOM in here; the scene and the
// controls only read this state.
import { pairOf, twentyOnePlus3, top3, luckyLucky, buster, push22 } from './sidebets.mjs';
import { CHIP_VALUES, breakDown } from './core/chips.mjs';
export { CHIP_VALUES, breakDown };   // the salon's chips (core/chips.mjs), the same at the wheel

export const DECKS = 8, SHOE_CARDS = DECKS * 52, CUT_AT = Math.round(SHOE_CARDS * .75);
export const SPOTS = ['main', 'lucky', 'pairs', 'top3', 'p213', 'buster', 'dpairs'];
export const LIMITS = { main: [1, 1000], side: [1, 100] };
const limitOf = spot => spot === 'main' ? LIMITS.main : LIMITS.side;
const sum = a => a.reduce((s, v) => s + v, 0);

export function total(cards) {
  let value = 0, aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') { value += 11; aces++; }
    else value += ['K', 'Q', 'J'].includes(c.rank) ? 10 : Number(c.rank);
  }
  while (value > 21 && aces > 0) { value -= 10; aces--; }
  return { value, soft: aces > 0 };
}
export const natural = cards => cards.length === 2 && total(cards).value === 21;
export const isTen = card => ['10', 'J', 'Q', 'K'].includes(card?.rank);

export function shoe(random = Math.random, decks = DECKS) {
  const cards = [];
  for (let d = 0; d < decks; d++)
    for (const suit of ['♠', '♥', '♦', '♣'])
      for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'])
        cards.push({ rank, suit });
  return shuffle(cards, random);
}
function shuffle(cards, random) {
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  cards.forEach((c, i) => c.id = i);
  return cards;
}

const emptyBets = () => Object.fromEntries(SPOTS.map(s => [s, []]));

// Lightning: before each deal a multiplier is struck for every winning total. Win with a struck
// total and that multiplier is yours for the next hand: win it and your Lightning fee comes back
// multiplied; push and it waits; lose and it is gone. Weights are tuned (by simulation over
// basic strategy) so the fee returns about 99% over time.
export const BUCKETS = ['le17', '18', '19', '20', '21', 'bj'];
const STRIKES = { le17: [2, 2, 3, 3], 18: [2, 3, 3, 4, 4], 19: [2, 3, 4, 5], 20: [2, 3, 4, 5, 6], 21: [3, 4, 5, 6, 8, 10], bj: [5, 10, 15, 20, 25] };
export const bucketOf = (h) => h.kind === 'blackjack' ? 'bj' : h.total <= 17 ? 'le17' : String(h.total);

export class Table {
  // mode: 'classic' | 'freebet' | 'lightning' — changed only between rounds.
  constructor({ random = Math.random, cards, balance = 1000, mode = 'classic' } = {}) {
    this.random = random; this.startBalance = balance; this.mode = mode; this.reset(balance);
    if (cards) { this.cards = [...cards]; this.dealt = SHOE_CARDS - this.cards.length; }
  }
  reset(balance = this.startBalance) {
    this.balance = balance; this.bets = emptyBets(); this.history = []; this.lastLayout = null; this.pending = null; this.board = null; this.fee = 0;
    this.newShoe(); this.clearRound(); this.phase = 'betting';
  }
  newShoe() { this.cards = shoe(this.random); this.dealt = 0; this.shuffled = true; }
  clearRound() {
    this.hands = [this.newHand()]; this.activeIndex = 0; this.dealer = []; this.stakes = emptyStakes();
    this.insurance = 0; this.insuranceOffered = false; this.results = []; this.result = null; this.peeked = false; this.revealed = false;
    this.early = 0;   // main-bet money already paid before the settle (even money)
  }
  // stake: your money on the hand · base: the bet a double or split adds · free: free-bet markers
  newHand(cards = [], stake = 0, fromSplit = false, splitAces = false, base = stake, free = 0) { return { cards, stake, base, free, fromSplit, splitAces, doubled: false, done: false }; }
  get activeHand() { return this.hands[this.activeIndex]; }
  get player() { return this.activeHand.cards; }
  get isSplit() { return this.hands.length > 1; }
  // Free Bet resplits to four hands (aces too, one card each, as its Nevada rules of play); elsewhere one split.
  get maxHands() { return this.mode === 'freebet' ? 4 : 2; }
  get stake() { return this.hands.reduce((s, h) => s + h.stake, 0); }
  get cutReached() { return this.dealt >= CUT_AT; }
  get remaining() { return this.cards.length; }

  // ---- betting ------------------------------------------------------------
  betOn(spot) { return sum(this.bets[spot]); }
  get bet() { return SPOTS.reduce((s, k) => s + this.betOn(k), 0); }
  get sideBet() { return this.bet - this.betOn('main'); }
  // What a layout costs to deal: the bets, plus at the Lightning table a fee equal to the main bet.
  costOf(layout) { return sum(Object.values(layout)) + (this.mode === 'lightning' ? layout.main ?? 0 : 0); }
  get cost() { return this.costOf(this.layout()); }
  canAdd(spot, value) {
    if (this.phase !== 'betting' || !SPOTS.includes(spot)) return false;
    return this.betOn(spot) + value <= limitOf(spot)[1] && this.cost + value * (this.mode === 'lightning' && spot === 'main' ? 2 : 1) <= this.balance;
  }
  addChip(spot, value) { if (!this.canAdd(spot, value)) return false; this.bets[spot].push(value); this.history.push(spot); return true; }
  undo() { if (this.phase !== 'betting' || !this.history.length) return null; const spot = this.history.pop(); return { spot, value: this.bets[spot].pop() }; }
  clear() { if (this.phase === 'betting') { this.bets = emptyBets(); this.history = []; } }
  layout() { return Object.fromEntries(SPOTS.map(s => [s, this.betOn(s)])); }
  applyLayout(layout) {
    if (this.phase !== 'betting' || !layout) return false;
    const need = this.costOf(layout);
    if (!need || need > this.balance || SPOTS.some(s => layout[s] > limitOf(s)[1])) return false;
    this.clear();
    for (const s of SPOTS) for (const v of breakDown(layout[s])) { this.bets[s].push(v); this.history.push(s); }
    return true;
  }
  get canRebet() { return this.phase === 'betting' && !this.bet && !!this.lastLayout && this.costOf(this.lastLayout) <= this.balance; }
  rebet() { return this.canRebet && this.applyLayout(this.lastLayout); }
  get canDoubleBets() { const l = this.layout(); return this.phase === 'betting' && this.bet > 0 && this.cost * 2 <= this.balance && SPOTS.every(s => l[s] * 2 <= limitOf(s)[1]); }
  doubleBets() { if (!this.canDoubleBets) return false; const l = this.layout(); return this.applyLayout(Object.fromEntries(SPOTS.map(s => [s, l[s] * 2]))); }
  get belowMinimum() { const m = this.betOn('main'); return m < LIMITS.main[0]; }

  // ---- the deal -----------------------------------------------------------
  // Side bets ride only with a main bet, as at a real table.
  start() {
    if (this.phase !== 'betting' || this.belowMinimum || this.cost > this.balance) return false;
    this.shuffled = false; if (this.cutReached) this.newShoe();
    this.lastLayout = this.layout(); this.clearRound();
    for (const s of SPOTS) this.stakes[s] = this.betOn(s);
    this.balance -= this.bet; this.bets = emptyBets(); this.history = [];
    this.fee = 0; this.board = null;
    if (this.mode === 'lightning') { this.fee = this.stakes.main; this.balance -= this.fee; this.board = this.strike(); }
    this.hands = [this.newHand([], this.stakes.main)];
    this.phase = 'dealing'; return true;
  }
  draw() { if (!this.cards.length) this.newShoe(); this.dealt++; return this.cards.pop(); }
  strike() { return Object.fromEntries(BUCKETS.map(b => { const w = STRIKES[b]; return [b, w[Math.floor(this.random() * w.length)]]; })); }
  // Deal order from the filing: player up, dealer up, player up, dealer down.
  initialCard(who) { if (this.phase !== 'dealing') return null; const c = this.draw(); (who === 'dealer' ? this.dealer : this.player).push(c); return c; }
  get upCard() { return this.dealer[0]; }
  get playerNatural() { return !this.hands[0].fromSplit && natural(this.hands[0].cards); }

  // After four cards: settle the bets that are already decided, then either
  // offer insurance (ace up), or check for dealer blackjack.
  finishDeal() {
    if (this.phase !== 'dealing' || this.player.length !== 2 || this.dealer.length !== 2) return null;
    const [p1, p2] = this.player, up = this.upCard;
    this.settleSide('pairs', pairOf(p1, p2));
    this.settleSide('p213', twentyOnePlus3(p1, p2, up));
    this.settleSide('top3', top3(p1, p2, up));
    this.settleSide('lucky', luckyLucky(p1, p2, up));
    if (up.rank === 'A') { this.phase = 'insurance'; this.insuranceOffered = true; return 'insurance'; }
    return this.peek();
  }
  get insuranceCost() { return this.stakes.main / 2; }
  get canInsure() { return this.phase === 'insurance' && !this.playerNatural && this.balance >= this.insuranceCost; }
  // With your blackjack against an ace the offer is even money: the bet is paid 1 to 1 at once, before the dealer
  // looks. It is its own settlement, not an insurance bet, so it needs no chips (all-in included).
  get canEvenMoney() { return this.phase === 'insurance' && this.playerNatural; }
  insure(accept) {
    if (this.phase !== 'insurance') return null;
    if (accept && this.canEvenMoney) { const h = this.hands[0]; h.evenMoney = h.done = true; this.early = h.stake * 2; this.balance += this.early; }
    else if (accept && this.canInsure) { this.insurance = this.insuranceCost; this.balance -= this.insurance; }
    return this.peek();
  }
  // The dealer checks the hole card when showing an ace or a ten.
  peek() {
    this.peeked = true;
    const dealerBJ = natural(this.dealer);
    if (this.insurance) this.results.push(dealerBJ
      ? this.pay('insurance', 'Insurance', this.insurance, 2, 'Dealer blackjack')
      : { spot: 'insurance', name: 'Insurance', stake: this.insurance, payout: 0, net: -this.insurance, line: 'No dealer blackjack' });
    if (dealerBJ || this.playerNatural) { this.phase = 'dealer'; return dealerBJ ? 'dealerBlackjack' : 'playerBlackjack'; }
    this.phase = 'player'; return 'player';
  }
  settleSide(spot, win, lineIfLost = 'No win') {
    const stake = this.stakes[spot]; if (!stake) return;
    const name = { lucky: 'Lucky Lucky', pairs: 'Perfect Pairs', top3: 'Top 3', p213: '21+3', buster: 'Buster Blackjack', dpairs: this.mode === 'freebet' ? 'Push 22' : 'Dealer Pairs' }[spot];
    this.results.push(win ? this.pay(spot, name, stake, win.pays, win.label) : { spot, name, stake, payout: 0, net: -stake, line: lineIfLost });
  }
  pay(spot, name, stake, pays, line) { const payout = stake * (pays + 1); this.balance += payout; return { spot, name, stake, payout, net: payout - stake, pays, line }; }

  // ---- player decisions ---------------------------------------------------
  // a split ace takes one card: it can only stand, or (at Free Bet) be split again when that card is another ace
  get canHit() { return this.canStand && !this.activeHand.splitAces; }
  get canStand() { return this.phase === 'player' && !this.activeHand.done; }
  get canDouble() { return this.canHit && this.player.length === 2 && (this.freeDouble || this.balance >= this.activeHand.base); }
  get isPair() { return this.player.length === 2 && this.player[0].rank === this.player[1].rank; }
  get canResplit() { return this.isPair && this.hands.length < this.maxHands; }
  get canSplit() { return this.canStand && this.canResplit && (this.freeSplit || this.balance >= this.activeHand.base); }
  // Free Bet: the house stakes a double on a hard 9, 10 or 11, and a split (and resplit) of any pair but tens.
  get freeDouble() { if (this.mode !== 'freebet' || this.player.length !== 2 || this.activeHand.splitAces) return false; const t = total(this.player); return !t.soft && t.value >= 9 && t.value <= 11; }
  get freeSplit() { return this.mode === 'freebet' && this.canResplit && !isTen(this.player[0]); }
  hit() {
    if (!this.canHit) return null;
    const card = this.draw(); this.player.push(card); const v = total(this.player).value;
    if (v >= 21 || this.player.length >= 10) { this.activeHand.done = true; this.activeHand.charlie = v <= 21 && this.player.length >= 10; this.advance(); }
    return card;
  }
  stand() { if (this.canStand) { this.activeHand.done = true; this.advance(); } }
  double() {
    if (!this.canDouble) return null;
    const h = this.activeHand;
    if (this.freeDouble) { h.free += h.base; h.freeDoubled = true; } else { this.balance -= h.base; h.stake += h.base; }
    h.doubled = true;
    const card = this.draw(); this.player.push(card); this.activeHand.done = true; this.advance(); return card;
  }
  // The active hand becomes two, side by side (`splitAt`, `splitAt + 1`), each to take a second card: the first
  // keeps its stake (or its free-bet marker), the second is staked again, or played on a marker when free.
  split() {
    if (!this.canSplit) return false;
    const i = this.activeIndex, h = this.activeHand, [a, b] = h.cards, aces = a.rank === 'A', free = this.freeSplit;
    if (!free) this.balance -= h.base;
    this.hands.splice(i, 1, this.newHand([a], h.stake, true, aces, h.base, h.free), free ? this.newHand([b], 0, true, aces, h.base, h.base) : this.newHand([b], h.base, true, aces));
    this.freeSplitMade = free; this.splitAt = i;
    this.phase = 'splitting'; return true;
  }
  splitCard(i) { if (this.phase !== 'splitting' || this.hands[i]?.cards.length !== 1) return null; const c = this.draw(); this.hands[i].cards.push(c); return c; }
  finishSplit() {
    if (this.phase !== 'splitting' || this.hands.some(h => h.cards.length < 2)) return false;
    for (const h of this.hands) if (!h.done && total(h.cards).value === 21) h.done = true;
    this.advance(); return true;
  }
  // Split aces are done once they have their card, unless it is another ace that can still be split again.
  advance() {
    for (const h of this.hands) if (h.splitAces && h.cards.length === 2 && !(this.mode === 'freebet' && h.cards[1].rank === 'A' && this.hands.length < this.maxHands)) h.done = true;
    const next = this.hands.findIndex(h => !h.done); if (next < 0) this.phase = 'dealer'; else { this.activeIndex = next; this.phase = 'player'; }
  }

  // ---- the dealer ---------------------------------------------------------
  // The dealer draws when a hand is still live against them - yours or another player's (the
  // controller sets `othersLive`) - and always plays
  // out while a Buster bet is riding, so that bet can be decided.
  get needsDealer() {
    if (natural(this.dealer)) return false;
    return this.stakes.buster > 0 || !!this.othersLive?.() || this.stakes.dpairs > 0 && this.mode === 'freebet' || this.hands.some(h => h.stake + h.free > 0 && total(h.cards).value <= 21 && !h.charlie && (h.fromSplit || !natural(h.cards)));
  }
  dealerHit() { if (this.phase !== 'dealer' || total(this.dealer).value >= 17 || !this.needsDealer) return null; const c = this.draw(); this.dealer.push(c); return c; }
  get dealerDone() { return !this.needsDealer || total(this.dealer).value >= 17; }

  // Dealer Pairs is decided as soon as the hole card is seen.
  revealHole() { if (!this.revealed) { this.revealed = true; if (this.mode !== 'freebet') this.settleSide('dpairs', pairOf(this.dealer[0], this.dealer[1])); } }

  settle() {
    if (this.phase !== 'dealer' || !this.dealerDone) return this.result;
    this.revealHole();
    const d = total(this.dealer).value, db = natural(this.dealer);
    this.settleSide('buster', db ? null : buster(this.dealer, d, this.playerNatural), db ? 'Dealer blackjack' : d > 21 ? 'No win' : 'Dealer did not bust');
    if (this.mode === 'freebet') this.settleSide('dpairs', db ? null : push22(d), db ? 'Dealer blackjack' : `Dealer ${d > 21 ? 'bust on' : 'stood on'} ${d}`);
    const push22s = this.mode === 'freebet' && d === 22;
    const hands = this.hands.map((h, index) => {
      const p = total(h.cards).value, pb = !h.fromSplit && natural(h.cards), stake = h.stake;
      let payout = 0, title = 'Dealer wins.', kind = 'loss';
      if (h.evenMoney) { payout = stake * 2; title = 'Even money.'; kind = 'win'; }   // paid already, at the offer
      else if (pb && db) { payout = stake; title = 'Two blackjacks. Push.'; kind = 'push'; }
      else if (db) title = 'Dealer blackjack.';
      else if (pb) { payout = stake * 2.5; title = 'Blackjack!'; kind = 'blackjack'; }
      else if (p > 21) title = 'Bust.';
      else if (h.charlie) { payout = stake * 2 + h.free; title = 'Ten-card Charlie.'; kind = 'win'; }
      else if (push22s) { payout = stake; title = 'Dealer 22. Push.'; kind = 'push'; }
      else if (d > 21 || p > d) { payout = stake * 2 + h.free; title = d > 21 ? 'Dealer busts. You win.' : 'You win.'; kind = 'win'; }
      else if (p === d) { payout = stake; title = 'Push.'; kind = 'push'; }
      return { index, stake, free: h.free, payout, net: payout - stake, title, kind, total: p, evenMoney: !!h.evenMoney };
    });
    const mainPayout = sum(hands.map(h => h.payout)); this.balance += mainPayout - this.early;
    // Lightning: last hand's multiplier pays on a win, waits on a push, is lost on a loss; then this
    // hand's best winning total earns its struck multiplier for the next one. Even money is a win (a waiting
    // multiplier pays on it), but it gives the blackjack up, so it earns none.
    let bonus = null, earned = null, lost = null;
    if (this.mode === 'lightning') {
      const won = hands.some(h => h.kind === 'win' || h.kind === 'blackjack'), pushed = hands.every(h => h.kind === 'push');
      if (this.pending && won) { bonus = { m: this.pending.m, amount: this.pending.fee * this.pending.m }; this.balance += bonus.amount; this.pending = null; }
      else if (this.pending && !pushed) { lost = this.pending; this.pending = null; }
      for (const h of hands) if ((h.kind === 'win' || h.kind === 'blackjack') && !h.evenMoney && this.board) {
        const b = bucketOf(h), m = this.board[b]; if (!earned || m > earned.m) earned = { m, bucket: b, fee: this.fee };
      }
      if (earned) this.pending = { m: earned.m, fee: earned.fee, bucket: earned.bucket };
    }
    const mainNet = mainPayout - this.stake + (bonus?.amount ?? 0) - this.fee, sideNet = sum(this.results.map(r => r.net));
    const two = hands.length === 2, title = push22s && hands.every(h => h.kind === 'push') ? 'Dealer 22. Push.' : this.isSplit
      ? hands.every(h => h.kind === 'win') ? (two ? 'Both hands win.' : 'All hands win.') : hands.every(h => h.kind === 'loss') ? (two ? 'Dealer wins both.' : 'Dealer wins all.') : hands.every(h => h.kind === 'push') ? (two ? 'Both hands push.' : 'All hands push.') : 'Split hands settled.'
      : hands[0].title;
    this.revealed = false; this.phase = 'result';
    this.result = { hands, title, mainNet, sideNet, net: mainNet + sideNet, sides: [...this.results], blackjack: hands.some(h => h.kind === 'blackjack'), dealerTotal: d, dealerBlackjack: db, dealer22: push22s, fee: this.fee, bonus, earned, lost };
    return this.result;
  }
  next() { if (this.phase !== 'result') return false; this.clearRound(); this.phase = 'betting'; return true; }
  // An interrupted round is voided like a misdeal: everything the round took
  // and has not already settled is returned. Side bets that were paid stay paid.
  abandon() {
    if (this.phase === 'betting') return 0;
    if (this.phase === 'result') { this.next(); return 0; }
    const settled = new Set(this.results.map(r => r.spot));
    let refund = sum(this.hands.filter(h => !h.evenMoney).map(h => h.stake)) + this.fee + (settled.has('insurance') ? 0 : this.insurance); this.fee = 0; this.board = null;   // even money was paid at the offer
    for (const s of SPOTS) if (s !== 'main' && this.stakes[s] && !settled.has(s)) refund += this.stakes[s];
    this.balance += refund; this.clearRound(); this.bets = emptyBets(); this.history = []; this.phase = 'betting';
    return refund;
  }
}

// A hand under way as a page writes it down (core/wallet.mjs inFlight): the Table as it stands, less its future.
// The shoe goes in sorted (which cards are left, not their order) and, while you can still act, the hole card
// stays in it (null in its place), so the next card or the dealer's hole can't be read from storage (the testing
// aids are kept out of reach for the same reason, app.mjs); playOut deals both from a fresh shuffle.
export function record(t) {
  const hole = t.dealer.length > 1 && !t.revealed && t.phase !== 'dealer';
  return { ...t, cards: undefined, rest: [...t.cards, ...hole ? [t.dealer[1]] : []].map(c => c.rank + c.suit).sort(), dealer: hole ? [t.dealer[0], null] : t.dealer };
}
// A hand a page lost mid-play (`rec`, as record() wrote it) is finished as live tables finish a dropped seat:
// the player stands, insurance (or even money) is declined, the dealer plays out and the hand is paid. One that
// can't be played out is voided like a misdeal. Returns { t, delta, result } or, voided, { t, delta, back };
// null for a record that is not a hand this table wrote.
export function playOut(rec, random = Math.random) {
  if (!Array.isArray(rec?.hands) || !Array.isArray(rec.rest) || !Number.isFinite(rec.balance)) return null;
  try {
    const { rest, ...state } = rec, t = new Table({ random, balance: rec.balance, mode: rec.mode }); Object.assign(t, state);
    t.cards = shuffle(rest.map(s => ({ rank: s.slice(0, -1), suit: s.slice(-1) })), random);
    // the hole card, from the cards still unseen: after the peek, one that doesn't give the dealer blackjack
    if (t.dealer[1] === null) t.dealer[1] = t.cards.splice(t.cards.findLastIndex(c => !t.peeked || !natural([t.dealer[0], c])), 1)[0];
    const before = t.balance;
    try {
      for (let i = 0; i < 200 && t.phase !== 'result'; i++) {
        if (t.phase === 'dealing') { if (t.player.length < 2 || t.dealer.length < 2) t.initialCard(t.player.length > t.dealer.length ? 'dealer' : 'player'); else t.finishDeal(); }
        else if (t.phase === 'insurance') t.insure(false);
        else if (t.phase === 'player') t.stand();
        else if (t.phase === 'splitting') { t.hands.forEach((h, k) => { if (h.cards.length === 1) t.splitCard(k); }); t.finishSplit(); }
        else if (t.phase === 'dealer') { t.revealHole(); while (t.dealerHit()); t.settle(); }
        else break;
      }
      if (t.phase === 'result' && t.result) return { t, delta: t.balance - before, result: t.result };
    } catch (e) { console.error('the last hand could not be played out', e); }
    const back = t.abandon();
    return { t, delta: t.balance - before, back };
  } catch (e) { console.error('the last hand could not be read', e); return null; }
}

function emptyStakes() { return Object.fromEntries([...SPOTS].map(s => [s, 0])); }
