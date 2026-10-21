// The blackjack rules engine: the shoe, the deal, the dealer, every way a hand is paid, and money kept straight
// over thousands of seeded rounds (and over hands a page lost mid-play, as the next visit plays them out).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Table, record, playOut, total, natural, shoe, breakDown, SPOTS, SHOE_CARDS, CUT_AT, BUCKETS } from '../src/engine.mjs';
import { basicStrategy } from '../src/players.mjs';
import { H, C, seeded } from './helpers.mjs';

const DEAL = ['player', 'dealer', 'player', 'dealer'];   // player up, dealer up, player up, dealer down
// A table dealing `order` (player, dealer up, player, dealer hole, then every card drawn after), first four out.
function rig(order, { balance = 1000, mode = 'classic', main = 10, sides = {} } = {}) {
  const t = new Table({ balance, mode, cards: H(order).reverse() }); t.dealt = 0;   // a short rigged shoe, not past the cut
  t.bets.main = [main]; for (const [s, v] of Object.entries(sides)) t.bets[s] = [v];
  assert.ok(t.start(), 'start'); for (const w of DEAL) t.initialCard(w);
  return t;
}
const finish = t => { t.revealHole(); while (t.dealerHit()); return t.settle(); };
const onGrid = v => Number.isFinite(v) && v >= 0 && Math.round(v * 2) === v * 2;

test('hand totals: aces soft then hard, naturals only on two cards', () => {
  assert.deepEqual(total(H('As Kh')), { value: 21, soft: true });
  assert.deepEqual(total(H('As Ah 9d')), { value: 21, soft: true });
  assert.deepEqual(total(H('As 6h 9d')), { value: 16, soft: false });
  assert.equal(total(H('Ks Qh 2d')).value, 22);
  assert.ok(natural(H('As 10h'))); assert.ok(!natural(H('As 5h 5d')));
});

test('the shoe: eight full decks, a seeded shuffle, the cut at three quarters', () => {
  const s = shoe(seeded(1));
  assert.equal(s.length, SHOE_CARDS); assert.equal(SHOE_CARDS, 416);
  const count = new Map(); for (const c of s) count.set(c.rank + c.suit, (count.get(c.rank + c.suit) ?? 0) + 1);
  assert.equal(count.size, 52); assert.ok([...count.values()].every(n => n === 8));
  assert.deepEqual(new Set(s.map(c => c.id)).size, 416);
  assert.deepEqual(shoe(seeded(1)).map(c => c.rank + c.suit), s.map(c => c.rank + c.suit), 'same seed, same shoe');
  assert.notDeepEqual(shoe(seeded(2)).map(c => c.rank + c.suit), s.map(c => c.rank + c.suit));
  const t = new Table({ random: seeded(3) }); assert.equal(CUT_AT, 312);
  t.dealt = CUT_AT; t.bets.main = [10]; assert.ok(t.start()); assert.equal(t.shuffled, true); assert.equal(t.dealt, 0, 'past the cut: a fresh shoe before the deal');
  const u = new Table({ random: seeded(4) }); u.cards = []; u.draw(); assert.equal(u.cards.length, SHOE_CARDS - 1, 'an empty shoe refills');
});

test('betting: limits, the cost of a Lightning hand, rebet and double', () => {
  const t = new Table({ balance: 100 }); t.addChip('pairs', 5); assert.equal(t.start(), false, 'side bets ride only with a main bet');
  t.clear(); assert.ok(t.addChip('main', 100)); assert.ok(!t.addChip('main', 1), 'not more than the balance');
  const l = new Table({ balance: 30, mode: 'lightning' }); l.addChip('main', 10); assert.equal(l.cost, 20, 'the fee matches the main bet');
  assert.ok(l.addChip('main', 5)); assert.ok(!l.addChip('main', 1), '15 + 15 fee = 30');
  const r = new Table({ balance: 1000 }); r.addChip('main', 25); r.addChip('lucky', 5); assert.ok(r.canDoubleBets); r.doubleBets();
  assert.deepEqual([r.betOn('main'), r.betOn('lucky')], [50, 10]);
  r.start(); for (const w of DEAL) r.initialCard(w); r.abandon(); assert.equal(r.balance, 1000);
  assert.ok(r.canRebet); r.rebet(); assert.deepEqual([r.betOn('main'), r.betOn('lucky')], [50, 10]);
});

test('the dealer stands on all 17s, soft 17 included, and hits 16', () => {
  let t = rig('10s 6h 9c Ac'); assert.equal(t.finishDeal(), 'player'); t.stand();
  assert.equal(t.dealerHit(), null, 'soft 17 stands'); let r = t.settle(); assert.equal(r.dealerTotal, 17); assert.equal(r.net, 10);
  t = rig('10s 6h 9c 10c 5d'); t.finishDeal(); t.stand(); r = finish(t); assert.equal(r.dealerTotal, 21, 'hard 16 hits'); assert.equal(r.net, -10);
  t = rig('10s 5h 9c Ac 2d'); t.finishDeal(); t.stand(); r = finish(t); assert.equal(r.dealerTotal, 18, 'soft 16 hits'); assert.equal(r.net, 10);
});

test('the peek: a dealer blackjack ends the hand before you play; insurance pays 2:1', () => {
  let t = rig('9s Kh 9c Ad'); assert.equal(t.finishDeal(), 'dealerBlackjack', 'a ten up is peeked'); let r = finish(t);
  assert.equal(r.dealerBlackjack, true); assert.equal(r.net, -10); assert.equal(t.balance, 990);
  t = rig('9s Ad 9c Kh'); assert.equal(t.finishDeal(), 'insurance'); assert.ok(t.canInsure); assert.equal(t.insure(true), 'dealerBlackjack');
  r = finish(t); assert.equal(r.net, 0, 'insured: -10 on the hand, +10 on the insurance'); assert.equal(t.balance, 1000);
  t = rig('10s Ad 9c 7h'); t.finishDeal(); assert.equal(t.insure(true), 'player'); t.stand(); r = finish(t);
  assert.equal(r.sides.find(s => s.spot === 'insurance').net, -5); assert.equal(r.net, -5 + 10, 'insurance lost, 19 beats soft 18');
  t = rig('9s Ad 9c 7h', { balance: 14 }); t.finishDeal(); assert.equal(t.canInsure, false, 'insurance needs half the bet in chips');
});

test('blackjack pays 3:2, odd bets on the half chip; two blackjacks push', () => {
  for (const [main, net] of [[10, 15], [5, 7.5], [1, 1.5], [25, 37.5], [15, 22.5]]) {
    const t = rig('As 9h Kc 7d', { main }); assert.equal(t.finishDeal(), 'playerBlackjack'); const r = finish(t);
    assert.equal(r.net, net); assert.equal(r.hands[0].kind, 'blackjack'); assert.ok(onGrid(t.balance)); assert.equal(t.balance, 1000 + net);
  }
  const t = rig('As Kh Kc Ad'); assert.equal(t.finishDeal(), 'dealerBlackjack'); const r = finish(t); assert.equal(r.hands[0].kind, 'push'); assert.equal(r.net, 0);
  const s = rig('As 8h 5c 9d 5s'); s.finishDeal(); assert.ok(s.canHit); s.hit(); assert.equal(total(s.player).value, 21); const q = finish(s);
  assert.equal(q.hands[0].kind, 'win', 'three-card 21 is no blackjack'); assert.equal(q.net, 10);
});

test('even money on a blackjack against an ace: paid 1:1 at the offer, whatever the hole card', () => {
  for (const hole of ['7c', 'Kc']) {
    const t = rig(`As Ad Kh ${hole}`, { balance: 10 });
    assert.equal(t.finishDeal(), 'insurance'); assert.equal(t.canInsure, false); assert.equal(t.canEvenMoney, true, 'no chips needed');
    t.insure(true); assert.equal(t.balance, 20); const r = finish(t);
    assert.equal(r.net, 10); assert.equal(t.balance, 20); assert.equal(r.hands[0].evenMoney, true); assert.ok(!r.sides.some(s => s.spot === 'insurance'));
  }
  const t = rig('As Ad Kh 7c'); t.finishDeal(); t.insure(false); assert.equal(finish(t).net, 15, 'declined: 3:2 as usual');
});

test('Classic splits: one split, aces take one card, double after split', () => {
  let t = rig('8s 6d 8h 10c 8d 3c'); t.finishDeal(); assert.ok(t.canSplit); assert.ok(t.split()); assert.equal(t.balance, 980);
  t.splitCard(0); t.splitCard(1); t.finishSplit(); assert.equal(t.hands.length, 2);
  assert.equal(t.isPair, true); assert.equal(t.canSplit, false, 'no resplit at Classic'); assert.equal(t.freeSplit, false);
  t.stand(); assert.ok(t.canDouble, '8-3 doubles after the split'); t.double(); assert.equal(t.balance, 970);
  t = rig('As 6d Ah 7c Kd 9c 5h'); t.finishDeal(); t.split(); t.splitCard(0); t.splitCard(1); t.finishSplit();
  assert.equal(t.phase, 'dealer', 'split aces take one card'); let r = finish(t);
  assert.equal(r.hands[0].kind, 'win'); assert.equal(r.hands[0].payout, 20, 'A-K after a split is 21, paid 1:1, not blackjack');
  t = rig('As 6d Ah 7c Ad 9c'); t.finishDeal(); t.split(); t.splitCard(0); t.splitCard(1); t.finishSplit(); assert.equal(t.phase, 'dealer', 'even on another ace');
  t = rig('8s 6d 8h 10c', { balance: 15 }); t.finishDeal(); assert.equal(t.canSplit, false, 'a split needs the bet again');
});

test('Free Bet: free doubles on hard 9-11, free splits of any pair but tens, resplits to four hands', () => {
  let t = rig('5s 6d 6h 10c 9d Kh', { mode: 'freebet', balance: 10 }); t.finishDeal(); assert.equal(t.balance, 0);
  assert.ok(t.freeDouble && t.canDouble, 'hard 11, all in: still free'); t.double(); let r = finish(t);
  assert.equal(r.hands[0].free, 10); assert.equal(r.net, 20, '20 against 16 busting to 25: the bet and the free double are paid'); assert.equal(t.balance, 30);
  for (const [cards, free] of [['As 6d 8h 10c', false], ['7s 6d 5h 10c', false], ['4s 6d 5h 10c', true], ['10s 6d 2h 10c', false]]) {
    t = rig(cards, { mode: 'freebet' }); t.finishDeal(); assert.equal(t.freeDouble, free, cards);
  }
  t = rig('8s 6d 8h 10c 8d 8c 8h 8s 2c 3c 4c 5c', { mode: 'freebet', balance: 10 }); t.finishDeal();
  for (let n = 2; n <= 4; n++) { assert.ok(t.freeSplit && t.canSplit); t.split(); t.splitCard(t.splitAt); t.splitCard(t.splitAt + 1); t.finishSplit(); assert.equal(t.hands.length, n); }
  assert.equal(t.balance, 0, 'every split free'); assert.deepEqual(t.hands.map(h => [h.stake, h.free]), [[10, 0], [0, 10], [0, 10], [0, 10]]);
  while (t.phase === 'player') { if (t.isPair) { assert.equal(t.canSplit, false, 'four hands is the most'); assert.equal(t.freeSplit, false); } t.stand(); }
  r = finish(t); assert.equal(r.hands.length, 4); assert.equal(t.balance, r.hands.reduce((s, h) => s + h.payout, 0));
  assert.equal(r.net, r.hands.reduce((s, h) => s + h.payout, 0) - 10);
  t = rig('Ks 6d Kh 7c Kd Qc Qh Qs 2c 3c', { mode: 'freebet', balance: 100 }); t.finishDeal(); assert.equal(t.freeSplit, false, 'tens split at a price');
  t.split(); t.splitCard(0); t.splitCard(1); t.finishSplit(); assert.equal(t.balance, 80); assert.ok(t.canSplit, 'and resplit at a price');
  t = rig('As 6d Ah 7c Ad 9c Kc 5h', { mode: 'freebet' }); t.finishDeal(); t.split(); t.splitCard(0); t.splitCard(1); t.finishSplit();
  assert.equal(t.canHit, false); assert.ok(t.canSplit && t.freeSplit, 'a split ace drawing an ace splits again'); t.split(); t.splitCard(0); t.splitCard(1); t.finishSplit();
  assert.equal(t.hands.length, 3); assert.equal(t.phase, 'dealer');
});

test('Free Bet: a dealer 22 pushes every live hand; blackjack and Charlie still win; Push 22 pays 11:1', () => {
  let t = rig('10s 6d 9c 6h Kc', { mode: 'freebet', sides: { dpairs: 5 } }); t.finishDeal(); t.stand(); let r = finish(t);
  assert.equal(r.dealerTotal, 22); assert.equal(r.dealer22, true); assert.equal(r.hands[0].kind, 'push');
  assert.equal(r.sides.find(s => s.spot === 'dpairs').payout, 60); assert.equal(r.net, 55);
  t = rig('10s 6d 9c 6h Kc'); t.finishDeal(); t.stand(); assert.equal(finish(t).net, 10, 'at Classic 22 is a bust');
  t = rig('10s 6d 6c 6h 7d Kc', { mode: 'freebet', sides: { dpairs: 5 } }); t.finishDeal(); t.hit(); r = finish(t);
  assert.equal(r.dealerTotal, 22); assert.equal(r.hands[0].kind, 'loss', 'your bust still loses');
  t = rig('As 6d Kc 6h', { mode: 'freebet' }); t.finishDeal(); assert.equal(finish(t).net, 15);
});

test('ten-card Charlie wins outright, whatever the dealer holds', () => {
  const t = rig('As Kd Ah 9c Ad Ac 2s 2h 2d 2c 3s 3h'); t.finishDeal();
  while (t.phase === 'player') t.hit();
  assert.equal(t.hands[0].cards.length, 10); assert.equal(t.hands[0].charlie, true); assert.equal(t.dealerHit(), null, 'nothing left to play against');
  const r = t.settle(); assert.equal(r.hands[0].kind, 'win'); assert.equal(r.hands[0].title, 'Ten-card Charlie.'); assert.equal(r.net, 10);
});

test('Lightning: the fee, a struck board, and a multiplier that pays the next win, waits on a push, goes on a loss', () => {
  let t = rig('10s 7h 10c 10d', { mode: 'lightning', balance: 100 }); assert.equal(t.balance, 80, 'stake and fee');
  assert.deepEqual(Object.keys(t.board).sort(), [...BUCKETS].sort()); assert.ok(Object.values(t.board).every(m => Number.isInteger(m) && m >= 2 && m <= 25));
  const board = t.board; t.finishDeal(); t.stand(); let r = finish(t);
  assert.deepEqual(r.earned, { m: board['20'], bucket: '20', fee: 10 }); assert.equal(r.net, 0, 'win 10, fee 10');
  const pending = t.pending; assert.equal(pending.bucket, '20'); t.next();
  t = rig('10s 7h 9c 10d', { mode: 'lightning', balance: 100 }); t.pending = { ...pending }; t.finishDeal(); t.stand(); r = finish(t);
  assert.equal(r.bonus.amount, 10 * pending.m); assert.equal(r.net, 10 - 10 + 10 * pending.m, '19 beats 17: the win, less the fee, plus the multiplied fee');
  assert.equal(t.pending.bucket, '19', 'and the win earns the next one');
  t = rig('10s 7h 7c 10d', { mode: 'lightning', balance: 100 }); t.pending = { ...pending }; t.finishDeal(); t.stand(); r = finish(t);
  assert.equal(r.hands[0].kind, 'push'); assert.deepEqual(t.pending, pending, 'a push keeps it waiting');
  t = rig('10s 7h 6c 10d', { mode: 'lightning', balance: 100 }); t.pending = { ...pending }; t.finishDeal(); t.stand(); r = finish(t);
  assert.deepEqual(r.lost, pending); assert.equal(t.pending, null); assert.equal(r.net, -20);
});

test('breakDown makes up any amount, largest chips first', () => {
  for (const v of [1, 7, 12.5, 99, 1234, 2500]) { const b = breakDown(v); assert.equal(b.reduce((a, c) => a + c, 0), v); assert.deepEqual(b, [...b].sort((x, y) => y - x)); }
});

// ---- money kept straight -------------------------------------------------------------------------------------
// A shoe rich in pairs and aces, so splits, resplits to four hands and doubles all come up often.
const pairShoe = random => { const R = ['A', 'A', '8', '8', '8', '9', 'K', '10', '3', '2', '6', '5'], S = ['♠', '♥', '♦', '♣']; return Array.from({ length: 300 }, (_, i) => ({ rank: R[Math.floor(random() * R.length)], suit: S[Math.floor(random() * 4)], id: i })); };
// One round, played by basic strategy with some wild moves. `abandonAt`: give up at that step instead. With `keep`,
// one step of the hand, picked at random, is kept as the page writes it down (record, as JSON), for the play-out test.
function playRound(t, random, { abandonAt = -1, keep = false } = {}) {
  const mode = t.mode, before = t.balance; let kept = null, seen = 0;
  t.addChip('main', [5, 10, 25][Math.floor(random() * 3)]); for (const s of SPOTS) if (s !== 'main' && random() < .25) t.addChip(s, 5);
  if (!t.start()) return null;
  const snap = () => { if (keep && random() * ++seen < 1) kept = JSON.parse(JSON.stringify(record(t))); };   // each step equally likely
  let k = 0; const stop = () => k++ === abandonAt;
  for (const w of DEAL) { t.initialCard(w); snap(); if (stop()) return { abandoned: true, before }; }
  if (t.finishDeal() === 'insurance') { snap(); t.insure(random() < .5); } snap();
  for (let g = 0; g < 60 && (t.phase === 'player' || t.phase === 'splitting'); g++) {
    if (stop()) return { abandoned: true, before };
    if (t.phase === 'splitting') { t.hands.forEach((h, i) => { if (h.cards.length === 1) t.splitCard(i); }); t.finishSplit(); snap(); continue; }
    const a = random() < .7 ? basicStrategy(t.player, t.upCard, { canDouble: t.canDouble, canSplit: t.canSplit, freebet: mode === 'freebet', free: t.activeHand.free > 0 }) : ['hit', 'stand', 'double', 'split'][Math.floor(random() * 4)];
    if (a === 'split' && t.canSplit) t.split(); else if (a === 'double' && t.canDouble) t.double(); else if (a === 'hit' && t.canHit) t.hit(); else t.stand();
    snap();
  }
  t.revealHole(); snap(); while (t.dealerHit()) snap();
  return { before, kept, result: t.settle() };
}

test('money is conserved over 9,000 seeded rounds: balance change = reported net, at every table, with resplits', () => {
  let fourHands = 0, doubles = 0, evenMoney = 0, insured = 0;
  for (const mode of ['classic', 'freebet', 'lightning']) {
    const random = seeded(mode.length * 7919), t = new Table({ random, balance: 1e6, mode });
    for (let i = 0; i < 3000; i++) {
      if (mode === 'freebet' && i % 2) { t.cards = pairShoe(random); t.dealt = 0; }   // every other Free Bet round from a pair-rich shoe
      const o = playRound(t, random); assert.ok(o?.result, `${mode} ${i}: dealt and settled`);
      const r = o.result; assert.equal(t.balance - o.before, r.net, `${mode} round ${i}: balance change equals the net`);
      assert.ok(onGrid(t.balance), 'never NaN, never negative, on the half-chip grid');
      assert.equal(r.net, r.mainNet + r.sideNet);
      fourHands += r.hands.length === 4; doubles += r.hands.some(h => h.free > 0 || h.stake > 25); evenMoney += r.hands[0].evenMoney; insured += r.sides.some(s => s.spot === 'insurance');
      assert.ok(t.next());
    }
  }
  assert.ok(fourHands > 10 && doubles > 500 && evenMoney > 5 && insured > 20, JSON.stringify({ fourHands, doubles, evenMoney, insured }));
});

test('a voided round (abandon) returns everything not yet settled, once', () => {
  for (const mode of ['classic', 'freebet', 'lightning']) {
    const random = seeded(99 + mode.length), t = new Table({ random, balance: 1e6, mode });
    for (let i = 0; i < 1500; i++) {
      if (mode === 'freebet' && i % 2) { t.cards = pairShoe(random); t.dealt = 0; }
      const o = playRound(t, random, { abandonAt: i % 9 }); if (!o.abandoned) { t.next(); continue; }
      const expect = t.results.reduce((s, x) => s + x.net, 0) + (t.hands[0].evenMoney ? t.stakes.main : 0);   // paid side bets stay paid; even money was a settlement
      const back = t.abandon(); assert.ok(back >= 0); assert.equal(t.phase, 'betting');
      assert.equal(t.balance - o.before, expect, `${mode} ${i}`); assert.equal(t.abandon(), 0, 'twice gives nothing more');
    }
  }
});

test('even money stays settled: a void gives it back no second time, and it earns no Lightning multiplier', () => {
  let t = rig('As Ad Kh 7c'); t.finishDeal(); t.insure(true); assert.equal(t.balance, 1010);
  assert.equal(t.abandon(), 0, 'nothing left to return'); assert.equal(t.balance, 1010, 'the even money stands, the stake is not refunded on top');
  t = rig('As Ad Kh 7c', { mode: 'lightning', balance: 100 }); t.finishDeal(); t.insure(true); let r = finish(t);
  assert.equal(r.earned, null); assert.equal(t.pending, null, 'it gave the blackjack up');
  t = rig('As Ad Kh 7c', { mode: 'lightning', balance: 100 }); t.pending = { m: 5, fee: 10, bucket: '20' }; t.finishDeal(); t.insure(true); r = finish(t);
  assert.equal(r.bonus.amount, 50, 'a waiting multiplier pays on it'); assert.equal(t.pending, null, 'and none takes its place');
});

test('the play-out policy: a lost hand stands where it is and declines insurance and even money', () => {
  for (let s = 1; s <= 20; s++) {
    let t = rig('As Ad Kh 7c'); assert.equal(t.finishDeal(), 'insurance'); let done = playOut(record(t), seeded(s));
    assert.ok(!done.result.hands[0].evenMoney && done.result.net !== 10, 'even money declined: 3:2, or a push on a dealer blackjack');
    t = rig('10s Ad 9h 7c'); assert.equal(t.finishDeal(), 'insurance'); done = playOut(record(t), seeded(s));
    assert.ok(!done.result.sides.some(x => x.spot === 'insurance') && done.t.insurance === 0, 'no insurance taken');
    t = rig('10s 10d 2h 7c'); assert.equal(t.finishDeal(), 'player'); done = playOut(record(t), seeded(s));
    assert.equal(done.t.hands[0].cards.length, 2, 'stood on 12: no card drawn'); assert.equal(done.result.hands[0].total, 12);
  }
});

test('a hand a page lost is played out on the next visit (stand, no insurance), money conserved, at every step', () => {
  let n = 0, voided = 0; const phases = new Set(), errors = [], error = console.error; console.error = (...a) => errors.push(a);
  try {
    for (const mode of ['classic', 'freebet', 'lightning']) {
      const random = seeded(4242 + mode.length), t = new Table({ random, balance: 5000, mode });
      for (let i = 0; i < 1500; i++) {
        if (mode === 'freebet' && i % 2) { t.cards = pairShoe(random); t.dealt = 0; }
        if (mode === 'lightning' && random() < .4) t.pending = { m: 5, fee: 10, bucket: '20' };
        const o = playRound(t, random, { keep: true }); t.next();
        const rec = o.kept; phases.add(rec.phase);
        assert.ok(!('cards' in rec) && rec.rest.every((c, k) => !k || rec.rest[k - 1] <= c), 'the shoe is written down sorted: the cards left, not their order');
        const acting = ['dealing', 'insurance', 'player', 'splitting'].includes(rec.phase); if (rec.dealer.length > 1) assert.equal(rec.dealer[1] === null, acting, `${rec.phase}: the hole card is left out while you can act`);
        const done = playOut(rec, random); assert.ok(done, 'a record the table wrote'); n++;
        if (!done.result) { voided++; continue; }
        if (rec.peeked && acting) assert.ok(!done.result.dealerBlackjack, 'a hole card dealt again after the peek never gives the dealer blackjack');
        assert.equal(done.t.phase, 'result');
        assert.equal(rec.balance + done.delta - o.before, done.result.net, `${mode} ${i} from ${rec.phase}: the snapshot plus the play-out equals the round's net`);
        if (mode !== 'lightning') assert.deepEqual(done.t.pending, rec.pending);
      }
    }
  } finally { console.error = error; }
  assert.deepEqual(errors, []); assert.equal(voided, 0, 'every snapshot could be played out');
  assert.ok(['dealing', 'insurance', 'player', 'splitting', 'dealer'].every(p => phases.has(p)), [...phases].join());
  for (const g of [null, {}, { phase: 'player' }, { hands: 'x', rest: [], balance: 1 }, { hands: [], cards: [], balance: 1 }, 42, 'abc']) assert.equal(playOut(g), null);
  assert.ok(n >= 4500);
});
