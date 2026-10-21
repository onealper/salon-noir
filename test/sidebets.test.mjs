// Side bets: each line on a crafted hand, every result a row of its printed paytable, and the house edge each
// paytable shows worked out exactly over the eight-deck shoe (the two- and three-card bets over every ordered
// draw; Buster and Push 22 over every way the dealer can draw out, standing on all 17s).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIDE_BETS, PUSH22, pairOf, twentyOnePlus3, top3, luckyLucky, buster, push22 } from '../src/sidebets.mjs';
import { H, C, DECK } from './helpers.mjs';

const bet = id => id === 'push22' ? PUSH22 : SIDE_BETS.find(b => b.id === id);
const row = (id, label) => bet(id).table.find(([l]) => l === label)?.[1];
const label = w => w?.label ?? null;
const three = (f, s) => f(...H(s));

test('Perfect Pairs and Dealer Pairs', () => {
  assert.equal(label(pairOf(C('8s'), C('8s'))), 'Perfect pair');
  assert.equal(label(pairOf(C('8h'), C('8d'))), 'Coloured pair');
  assert.equal(label(pairOf(C('8s'), C('8c'))), 'Coloured pair');
  assert.equal(label(pairOf(C('8s'), C('8h'))), 'Red/black pair');
  assert.equal(pairOf(C('Ks'), C('Qs')), null, 'tens of different ranks are no pair');
});

test('21+3 and Top 3: three-card poker on your cards and the up card', () => {
  const cases = [['7s 7s 7s', 'Suited three of a kind', 'Suited three of a kind'], ['7s 8s 9s', 'Straight flush', 'Straight flush'], ['7s 7h 7d', 'Three of a kind', 'Three of a kind'],
    ['Qh Kd As', 'Straight', null], ['Ah 2d 3s', 'Straight', null], ['Kh Ad 2s', null, null], ['2s 9s Js', 'Flush', null], ['Qs Ks As', 'Straight flush', 'Straight flush'], ['2s 9h Jd', null, null]];
  for (const [cards, p213, t3] of cases) { assert.equal(label(three(twentyOnePlus3, cards)), p213, `21+3 ${cards}`); assert.equal(label(three(top3, cards)), t3, `Top 3 ${cards}`); }
});

test('Lucky Lucky: 7-7-7, 6-7-8 (30:1 unsuited), then 21, 20 and 19 on your cards and the up card', () => {
  const cases = [['7s 7s 7s', 'Suited 7-7-7', 200], ['6s 7s 8s', 'Suited 6-7-8', 100], ['7s 7h 7d', '7-7-7', 50], ['6s 7h 8d', '6-7-8', 30], ['8d 6s 7h', '6-7-8', 30],
    ['As Ks 10s', 'Suited 21', 15], ['As Kh 10s', 'Any 21', 3], ['10s Kh Qd', null, null], ['Ks Qh Ad', 'Any 21', 3], ['9s 9h 2d', 'Any 20', 2], ['As 8h Kd', 'Any 19', 2], ['As Ah 7d', 'Any 19', 2], ['5s 5h 5d', null, null]];
  for (const [cards, l, pays] of cases) { const w = three(luckyLucky, cards); assert.equal(label(w), l, cards); assert.equal(w?.pays ?? null, pays ?? null, cards); }
  assert.equal(row('lucky', '6-7-8'), 30, 'the paytable shows 30:1 too');
});

test('Buster Blackjack pays by the cards in the dealer\'s bust, more with your blackjack; Push 22 on a dealer 22', () => {
  const n = k => Array(k).fill(C('2s'));
  assert.equal(buster(n(2), 21, false), null); assert.equal(buster(n(3), 17, false), null);
  assert.deepEqual([3, 4, 5, 6, 7, 8, 9].map(k => buster(n(k), 23, false).pays), [2, 2, 4, 18, 50, 250, 250]);
  assert.deepEqual([3, 6, 7, 8].map(k => buster(n(k), 23, true).pays), [2, 18, 800, 2000]);
  assert.equal(push22(22).pays, 11); assert.equal(push22(23), null); assert.equal(push22(21), null);
});

test('every result any hand can give is a row of its printed paytable, at the price shown', () => {
  const check = (id, w) => { if (w) assert.equal(row(id, w.label), w.pays, `${id}: ${w.label}`); };
  for (const a of DECK) for (const b of DECK) {
    check('pairs', pairOf(a, b)); check('dpairs', pairOf(a, b));
    for (const u of DECK) { check('p213', twentyOnePlus3(a, b, u)); check('top3', top3(a, b, u)); check('lucky', luckyLucky(a, b, u)); }
  }
  for (let k = 3; k <= 9; k++) for (const bj of [false, true]) check('buster', buster(Array(k).fill(C('5s')), 25, bj));
  check('push22', { ...push22(22), label: 'Dealer ends on 22' });
});

// ---- exact house edges ---------------------------------------------------------------------------------------
const D = 8, N = 52 * D;
// every ordered draw of k cards from the shoe, with its probability
function edgeOf(k, f) {
  let ev = 0, p = 0; const idx = Array(k).fill(0);
  (function go(d, prob) {
    if (d === k) { const w = f(...idx.map(i => DECK[i])); ev += prob * (w ? w.pays : -1); p += prob; return; }
    for (let i = 0; i < 52; i++) { const used = idx.slice(0, d).filter(j => j === i).length; idx[d] = i; go(d + 1, prob * (D - used) / (N - d)); }
  })(0, 1);
  assert.ok(Math.abs(p - 1) < 1e-9); return -ev * 100;
}
// the dealer's final hands from a shoe (counts by value, 1 = ace, 10 = tens), S17, with their probabilities
function dealerOutcomes(counts) {
  const out = []; let left = counts.reduce((a, b) => a + b, 0);
  (function go(hard, aces, n, p) {
    const v = aces && hard + 10 <= 21 ? hard + 10 : hard;
    if (n >= 2 && v >= 17) { out.push({ n, total: v, natural: n === 2 && v === 21, p }); return; }
    for (let r = 1; r <= 10; r++) { if (!counts[r]) continue; const q = p * counts[r] / left; counts[r]--; left--; go(hard + r, aces + (r === 1), n + 1, q); counts[r]++; left++; }
  })(0, 0, 0, 1);
  return out;
}
const fullShoe = () => { const c = Array(11).fill(4 * D); c[0] = 0; c[10] = 16 * D; return c; };

test('the house edge each paytable shows is exact to its last digit (two- and three-card bets)', () => {
  for (const [id, k, f] of [['pairs', 2, pairOf], ['dpairs', 2, pairOf], ['p213', 3, twentyOnePlus3], ['top3', 3, top3], ['lucky', 3, luckyLucky]]) {
    const e = edgeOf(k, f); assert.ok(Math.abs(e - bet(id).edge) <= .05, `${id}: exact ${e.toFixed(3)}%, shown ${bet(id).edge}%`);
  }
});

test('the house edge shown for Buster Blackjack and Push 22 is exact to its last digit', () => {
  // your blackjack takes an ace and a ten out of the dealer's shoe (the cards are otherwise exchangeable): the
  // dealer's hands over the full shoe mix both cases, so the blackjack share is swapped for its own paytable
  const pBJ = 2 * (4 * D / N) * (16 * D / (N - 1)), all = dealerOutcomes(fullShoe()), bjShoe = fullShoe(); bjShoe[1]--; bjShoe[10]--;
  const pay = (o, bj) => { const w = o.natural ? null : buster(Array(o.n), o.total, bj); return w ? w.pays : -1; };
  const ev = all.reduce((s, o) => s + o.p * pay(o, false), 0) + pBJ * dealerOutcomes(bjShoe).reduce((s, o) => s + o.p * (pay(o, true) - pay(o, false)), 0);
  const busterEdge = -ev * 100, p22 = -all.reduce((s, o) => s + o.p * (push22(o.total) ? push22(o.total).pays : -1), 0) * 100;
  assert.ok(Math.abs(busterEdge - bet('buster').edge) <= .05, `Buster: exact ${busterEdge.toFixed(3)}%, shown ${bet('buster').edge}%`);
  assert.ok(Math.abs(p22 - PUSH22.edge) <= .05, `Push 22: exact ${p22.toFixed(3)}%, shown ${PUSH22.edge}%`);
  assert.ok(Math.abs(all.reduce((s, o) => s + o.p, 0) - 1) < 1e-9);
});
