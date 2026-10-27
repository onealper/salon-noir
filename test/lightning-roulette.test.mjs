// Lightning roulette: the strikes (how many, which, what multiplier; Mega's chain lightning and double strike), the
// return of a straight-up at each mode worked out exactly and checked by simulation, every other bet at 36/37 with no
// la partage, and a Lightning table paying a struck number its multiplier and an unstruck one its cut price.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, MAX_STRUCK, strike, multipliers, expected } from '../src/roulette/lightning.mjs';
import { RouletteTable, SPOTS, KINDS } from '../src/roulette/rules.mjs';
import { seeded } from './helpers.mjs';

const bankOf = (v = 100000) => { const b = { v, get: () => b.v, set: x => { b.v = x; } }; return b; };
const tableFor = mode => new RouletteTable({ bank: bankOf(), straight: MODES[mode].straight, partage: false });

test('a straight-up returns about 97.1% at both Lightning tables, every other bet 36/37 (no la partage)', () => {
  for (const mode of ['lightning', 'mega']) {
    const e = expected(mode);
    assert.ok(Math.abs(e.straight - .971) < .0006, `${mode}: straight-up returns ${(e.straight * 100).toFixed(3)}%`);
    assert.equal(e.others, 36 / 37);
  }
  assert.equal(MODES.lightning.straight, 29); assert.equal(MODES.mega.straight, 19);
  assert.equal(expected('lightning').max, 500); assert.equal(expected('mega').max, 2000);
});

test('the exact return agrees with the lightning as it is drawn (a simulation, 400,000 rounds a table)', () => {
  for (const mode of ['lightning', 'mega']) {
    const rnd = seeded(mode === 'mega' ? 99 : 7), P = MODES[mode].straight + 1, N = 400000; let sum = 0, sq = 0;
    for (let i = 0; i < N; i++) { const m = multipliers(strike(mode, rnd)); let r = P * (37 - m.size); for (const x of m.values()) r += x + 1; r /= 37 * 37; sum += r; sq += r * r; }
    const mean = sum / N, se = Math.sqrt((sq / N - mean * mean) / N), e = expected(mode).straight;
    assert.ok(Math.abs(mean - e) < 4 * se, `${mode}: simulated ${(mean * 100).toFixed(3)}% against ${(e * 100).toFixed(3)}% (se ${(se * 100).toFixed(3)})`);
  }
});

test('Lightning strikes 1 to 5 different numbers, each at 50x to 500x, with no chain or double strike', () => {
  const rnd = seeded(3), counts = new Map(), xs = new Set(MODES.lightning.mults.map(([v]) => v));
  for (let i = 0; i < 20000; i++) {
    const s = strike('lightning', rnd), ns = s.map(t => t.n);
    assert.equal(new Set(ns).size, ns.length, 'never the same number twice'); assert.ok(ns.every(n => Number.isInteger(n) && n >= 0 && n <= 36));
    assert.ok(s.length >= 1 && s.length <= 5); assert.ok(s.every(t => xs.has(t.x) && !t.chain && !t.double));
    counts.set(s.length, (counts.get(s.length) ?? 0) + 1);
  }
  assert.deepEqual([...counts.keys()].sort(), [1, 2, 3, 4, 5]);
  // the low multipliers come far more often than the high ones
  const tally = new Map(); for (let i = 0; i < 20000; i++) for (const t of strike('lightning', rnd)) tally.set(t.x, (tally.get(t.x) ?? 0) + 1);
  assert.ok(tally.get(50) > 5 * tally.get(500));
});

test('Mega Lightning: chain lightning strikes more numbers (never past 10), and a double strike lifts one to 600x-2,000x', () => {
  const rnd = seeded(5); let chains = 0, doubles = 0, most = 0;
  for (let i = 0; i < 20000; i++) {
    const s = strike('mega', rnd), ns = s.map(t => t.n);
    assert.equal(new Set(ns).size, ns.length); assert.ok(s.length >= 1 && s.length <= MAX_STRUCK); most = Math.max(most, s.length);
    const first = s.findIndex(t => t.chain); if (first >= 0) { chains++; assert.ok(s.slice(first).every(t => t.chain), 'the chained numbers come after the first strike'); assert.ok(first >= 1 && first <= 5); }
    else assert.ok(s.length <= 5);
    const d = s.filter(t => t.double); assert.ok(d.length <= 1);
    if (d.length) { doubles++; assert.ok(d[0].x >= 600 && d[0].x <= 2000); assert.ok(d[0].was >= 50 && d[0].was <= 500); }
    assert.ok(s.every(t => t.double || (t.x >= 50 && t.x <= 500)));
  }
  assert.equal(most, MAX_STRUCK);
  assert.ok(chains > 20000 * .3 && chains < 20000 * .55, `chain lightning in ${chains} rounds`);
  assert.ok(doubles > 20000 * .1 && doubles < 20000 * .23, `a double strike in ${doubles} rounds`);
});

test('a Lightning table pays a struck straight-up its multiplier, an unstruck one 29:1 (19:1 at Mega), the rest as usual', () => {
  const struck = new Map([[17, 300], [4, 50]]);
  const t = tableFor('lightning');
  t.place([['n17', 10], ['n4', 5], ['n20', 5], ['sp17-20', 10], ['red', 20], ['black', 20], ['col2', 10]]); assert.ok(t.close());
  const r = t.settle(17, struck), pay = id => r.wins.find(w => w.id === id)?.pay;
  assert.equal(pay('n17'), 3000); assert.equal(r.wins.find(w => w.id === 'n17').x, 300); assert.equal(r.x, 300);
  assert.equal(pay('sp17-20'), 170); assert.equal(pay('black'), 20); assert.equal(pay('col2'), 20);
  assert.ok(!r.wins.some(w => w.id === 'n4' || w.id === 'n20' || w.id === 'red'));
  assert.equal(r.net, (3000 + 10) + (170 + 10) + (20 + 20) + (20 + 10) - 80);
  // unstruck: the cut price, at each table
  for (const [mode, price] of [['lightning', 29], ['mega', 19]]) {
    const u = tableFor(mode); u.place([['n8', 10]]); u.close(); const ru = u.settle(8, struck);
    assert.equal(ru.wins[0].pay, 10 * price); assert.equal(ru.x, 0); assert.equal(ru.wins[0].x, undefined);
  }
  // a multiplier is only for a straight-up: a split on a struck number pays 17:1
  const s = tableFor('mega'); s.place([['sp16-17', 10]]); s.close(); assert.equal(s.settle(17, struck).wins[0].pay, 170);
});

test('no la partage at a Lightning table: zero takes the even-money bets whole', () => {
  const t = tableFor('lightning'); t.place([['red', 10], ['odd', 10], ['n0', 5]]); t.close();
  const r = t.settle(0, new Map()); assert.equal(r.partage, 0); assert.equal(r.back, 5 + 5 * 29); assert.equal(r.net, 5 * 29 - 20);
  assert.ok(r.losses.every(l => !l.back));
});

test('the European table is as it was: straight-ups 35:1 and la partage on zero', () => {
  const t = new RouletteTable({ bank: bankOf() }); t.place([['n17', 10], ['red', 10]]); t.close();
  const r = t.settle(17); assert.equal(r.wins.find(w => w.id === 'n17').pay, 10 * KINDS.straight.pays); assert.equal(r.x, 0);
  const e = new RouletteTable({ bank: bankOf() }); e.place([['red', 10]]); e.close(); assert.equal(e.settle(0).partage, 5);
  assert.equal(SPOTS.get('n17').pays, 35);
});
