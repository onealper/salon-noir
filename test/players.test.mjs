// The players at the table: basic strategy for a dealer who stands on soft 17 (and the Free Bet chart), their
// bankrolls through splits and even money, and their hands paid exactly as the engine pays yours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basicStrategy, Player } from '../src/players.mjs';
import { Table, total } from '../src/engine.mjs';
import { H, C, DECK, seeded } from './helpers.mjs';

const bs = (cards, up, o) => basicStrategy(H(cards), C(up), o);

test('basic strategy, dealer stands on soft 17: hard, soft and pair spot checks', () => {
  const chart = [
    ['10s 2h', '3d', 'hit'], ['10s 2h', '4d', 'stand'], ['10s 6h', '7d', 'hit'], ['10s 6h', '6d', 'stand'], ['10s 7h', 'Ad', 'stand'], ['9s 3h', '2d', 'hit'],
    ['6s 5h', 'Ad', 'hit'], ['6s 5h', 'Kd', 'double'], ['6s 4h', 'Kd', 'hit'], ['5s 4h', '3d', 'double'], ['5s 4h', '2d', 'hit'], ['5s 3h', '6d', 'hit'],
    ['As 8h', '6d', 'stand'], ['As 7h', '2d', 'stand'], ['As 7h', '3d', 'double'], ['As 7h', '9d', 'hit'], ['As 7h', '8d', 'stand'], ['As 6h', '3d', 'double'], ['As 2h', '5d', 'double'], ['As 2h', '4d', 'hit'],
    ['As Ah', '10d', 'split'], ['8s 8h', 'Ad', 'split'], ['9s 9h', '7d', 'stand'], ['9s 9h', '8d', 'split'], ['10s 10h', '6d', 'stand'], ['5s 5h', '6d', 'double'], ['4s 4h', '5d', 'split'], ['4s 4h', '4d', 'hit'],
    ['7s 7h', '7d', 'split'], ['7s 7h', '8d', 'hit'], ['6s 6h', '2d', 'split'], ['2s 2h', '8d', 'hit'],
  ];
  for (const [cards, up, want] of chart) assert.equal(bs(cards, up), want, `${cards} v ${up}`);
  assert.equal(bs('6s 5h', 'Kd', { canDouble: false }), 'hit', 'no double: hit'); assert.equal(bs('As 7h', '3d', { canDouble: false }), 'stand', 'soft 18, no double: stand');
  assert.equal(bs('8s 8h', '10d', { canSplit: false }), 'hit'); assert.equal(bs('6s 5h 2c', '6d'), 'stand', 'three cards never double');
});

test('the Free Bet chart: free splits of every pair but fives and tens, push-22 hits, free hands played to the free bet', () => {
  const fb = (cards, up, free = false) => bs(cards, up, { freebet: true, free });
  assert.equal(fb('10s 2h', '6d'), 'hit'); assert.equal(fb('10s 3h', '2d'), 'hit'); assert.equal(fb('10s 3h', '3d'), 'stand');
  assert.equal(fb('As 2h', '5d'), 'hit'); assert.equal(fb('As 7h', '5d'), 'double'); assert.equal(fb('As 7h', '3d'), 'stand');
  assert.equal(fb('9s 9h', '7d'), 'split'); assert.equal(fb('5s 5h', '6d'), 'double'); assert.equal(fb('10s 10h', '6d'), 'stand'); assert.equal(fb('2s 2h', 'Ad'), 'split');
  assert.equal(fb('10s 7h', '9d', true), 'hit'); assert.equal(fb('10s 7h', 'Kd', true), 'stand'); assert.equal(fb('10s 2h', '6d', true), 'stand');
});

test('their bankrolls stay straight through resplits and even money', () => {
  const p = new Player('Test', 'steady', () => .5); p.mode = 'freebet'; p.bankroll = 100; p.placeBet(10);
  p.hand.cards.push(C('8s'), C('8h')); assert.equal(p.decide(C('6d')), 'split'); assert.equal(p.split(), true);
  p.hands[0].cards.push(C('8d')); assert.ok(p.canResplit && p.freeSplit); p.split(); assert.equal(p.hands.length, 3); assert.equal(p.bankroll, 90, 'free splits');
  p.at = 0; p.hands[0].cards.push(C('10s')); p.hands[1].cards.push(C('9s')); p.hands[2].cards.push(C('Js'));
  const out = p.settle(H('6d 10c 7h')); assert.deepEqual(out.map(r => r.kind), ['win', 'win', 'win']); assert.equal(p.bankroll, 90 + 20 + 10 + 10);
  const q = new Player('Q', 'careful', () => .1); q.bankroll = 100; q.placeBet(10); q.hand.cards.push(C('As'), C('Kh'));
  assert.equal(q.evenMoney(), 10); assert.equal(q.bankroll, 110); const o = q.settle(H('Ad Kc')); assert.equal(o[0].kind, 'win'); assert.equal(o[0].evenMoney, true); assert.equal(q.bankroll, 110);
});

test('a player\'s hand is paid exactly as the engine pays yours: 12,000 random hands, Lightning multipliers included', () => {
  const rnd = seeded(3), draw = () => DECK[Math.floor(rnd() * 52)], board = { le17: 2, 18: 3, 19: 4, 20: 5, 21: 6, bj: 10 };
  for (const mode of ['classic', 'freebet', 'lightning']) for (let i = 0; i < 4000; i++) {
    const n = mode === 'freebet' && i % 3 === 0 ? 2 + Math.floor(rnd() * 3) : 1, dh = [draw(), draw()];
    const hands = Array.from({ length: n }, (_, k) => { const ph = [draw(), draw()]; while (total(ph).value < 13 && rnd() < .85) ph.push(draw()); return { cards: ph, stake: k && mode === 'freebet' ? 0 : 10, free: k && mode === 'freebet' ? 10 : rnd() < .1 ? 10 : 0, fromSplit: n > 1 }; });
    while (total(dh).value < 17) dh.push(draw());
    const pending = mode === 'lightning' && rnd() < .5 ? { m: 4, fee: 10, bucket: '19' } : null;
    const t = new Table({ mode }); t.phase = 'dealer'; t.stakes.main = 10; t.dealer = dh; t.revealed = true;
    t.hands = hands.map(h => Object.assign(t.newHand(h.cards, h.stake, h.fromSplit, false, 10, h.free), { done: true, charlie: h.cards.length >= 10 && total(h.cards).value <= 21 }));
    if (mode === 'lightning') { t.fee = 10; t.board = board; t.pending = pending && { ...pending }; }
    const e = t.settle();
    const p = new Player('X', 'steady'); p.mode = mode; p.fee = mode === 'lightning' ? 10 : 0; p.pending = pending && { ...pending };
    p.hands = hands.map(h => ({ cards: h.cards, stake: h.stake, base: 10, free: h.free, fromSplit: h.fromSplit }));
    const q = p.settle(dh, mode === 'lightning' ? board : undefined), at = `${mode} ${hands.map(h => h.cards.map(c => c.rank).join('')).join('|')} v ${dh.map(c => c.rank).join('')}`;
    assert.deepEqual(q.map(r => [r.kind, r.payout]), e.hands.map(h => [h.kind, h.payout]), at);
    if (mode === 'lightning') { assert.equal(p.flash.bonus?.amount ?? 0, e.bonus?.amount ?? 0, at); assert.deepEqual(p.pending, t.pending, at); }
  }
});
