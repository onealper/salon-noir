// European roulette: the wheel, every bet on the layout against every number, the call bets, la partage, the
// return of each kind of bet, the limits, a table's whole betting cycle, and a fair draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL, WHEEL_INDEX, POCKETS, REDS, colorOf, KINDS, LIMITS, SPOTS, CALLS, callNumbers, neighbours, SECTIONS, RouletteTable, draw, stats } from '../src/roulette/rules.mjs';
import { seeded } from './helpers.mjs';

const bankOf = (v = 1000) => { const b = { v, get: () => b.v, set: x => { b.v = x; } }; return b; };
const spinOn = (adds, n, start = 100000) => { const bank = bankOf(start), t = new RouletteTable({ bank }); assert.equal(t.place(adds), null); assert.ok(t.close()); return { r: t.settle(n), bank }; };

test('the wheel: 37 pockets in the single-zero order, red and black alternating', () => {
  assert.deepEqual(WHEEL.slice(0, 6), [0, 32, 15, 19, 4, 21]); assert.equal(POCKETS, 37); assert.deepEqual([...WHEEL].sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i));
  for (let i = 1; i < 37; i++) { assert.equal(WHEEL_INDEX[WHEEL[i]], i); if (i > 1) assert.notEqual(colorOf(WHEEL[i]), colorOf(WHEEL[i - 1])); }
  assert.equal(REDS.size, 18); assert.equal(colorOf(0), 'green');
});

// what each bet covers, worked out afresh from the layout (three columns, 1-2-3 across the first row)
const row = n => Math.ceil(n / 3), col = n => (n - 1) % 3 + 1;
function covers(id) {
  let m;
  if ((m = id.match(/^n(\d+)$/))) return [+m[1]];
  if ((m = id.match(/^sp(\d+)-(\d+)$/))) return [+m[1], +m[2]];
  if ((m = id.match(/^st(\d+)$/))) return [0, 1, 2].map(k => +m[1] + k);
  if ((m = id.match(/^co(\d+)$/))) return [0, 1, 3, 4].map(k => +m[1] + k);
  if ((m = id.match(/^sl(\d+)$/))) return [0, 1, 2, 3, 4, 5].map(k => +m[1] + k);
  if ((m = id.match(/^tr0-(\d)-(\d)$/))) return [0, +m[1], +m[2]];
  if (id === 'ff') return [0, 1, 2, 3];
  const all = Array.from({ length: 36 }, (_, i) => i + 1);
  if ((m = id.match(/^col(\d)$/))) return all.filter(n => col(n) === +m[1]);
  if ((m = id.match(/^doz(\d)$/))) return all.filter(n => row(n) > (m[1] - 1) * 4 && row(n) <= m[1] * 4);
  return all.filter({ red: n => REDS.has(n), black: n => !REDS.has(n), odd: n => n % 2, even: n => n % 2 === 0, low: n => n <= 18, high: n => n >= 19 }[id]);
}
const touching = (a, b) => a === 0 ? b <= 3 : (b - a === 1 && row(a) === row(b)) || b - a === 3;

test('157 bets on the layout, each covering what it says, each touching on the felt', () => {
  const count = {}; for (const s of SPOTS.values()) count[s.kind] = (count[s.kind] ?? 0) + 1;
  assert.deepEqual(count, { straight: 37, split: 60, street: 12, corner: 22, line: 11, trio: 2, four: 1, column: 3, dozen: 3, even: 6 }); assert.equal(SPOTS.size, 157);
  for (const [id, s] of SPOTS) {
    assert.deepEqual(s.nums, covers(id).sort((a, b) => a - b), id);
    if (s.kind === 'split') assert.ok(touching(...s.nums), id);
    if (s.kind === 'street' || s.kind === 'corner' || s.kind === 'line') { assert.equal(col(s.nums[0]), 1 + (s.kind === 'corner' && col(s.nums[0]) === 2), id); }
    assert.equal(s.pays, KINDS[s.kind].pays); assert.equal(s.max, KINDS[s.kind].max);
    if (['column', 'dozen', 'even'].includes(s.kind)) assert.ok(!s.nums.includes(0), `${id}: no outside bet covers zero`);
  }
});

test('every bet against every number: wins pay to the printed odds, even money gets half back on zero', () => {
  for (const [id, s] of SPOTS) for (let n = 0; n <= 36; n++) {
    const { r, bank } = spinOn([[id, 2]], n), hit = s.nums.includes(n), partage = !hit && n === 0 && s.kind === 'even';
    assert.equal(r.back, hit ? 2 * (s.pays + 1) : partage ? 1 : 0, `${id} on ${n}`); assert.equal(r.net, r.back - 2); assert.equal(bank.v, 100000 - 2 + r.back);
    assert.equal(r.partage, partage ? 1 : 0);
  }
});

test('the return of each kind of bet, exact over the 37 numbers: 36/37, and 73/74 for even money with la partage', () => {
  for (const [id, s] of SPOTS) {
    let back = 0; for (let n = 0; n <= 36; n++) back += spinOn([[id, 1]], n).r.back;
    assert.equal(back / 37, s.kind === 'even' ? 36.5 / 37 : 36 / 37, id);
  }
  for (const key of Object.keys(CALLS)) { let back = 0, units = 0; for (let n = 0; n <= 36; n++) { const { r } = spinOn(CALLS[key].chips, n); back += r.back; units = r.staked; } assert.ok(Math.abs(back / 37 / units - 36 / 37) < 1e-12, key); }
});

test('the call bets: chips as printed, the numbers of their sector of the wheel; neighbours wrap round', () => {
  const units = k => CALLS[k].chips.reduce((a, [, u]) => a + u, 0);
  assert.deepEqual(['voisins', 'tiers', 'orphelins', 'zero'].map(units), [9, 6, 5, 4]);
  const arc = (from, to) => { const out = []; for (let i = WHEEL_INDEX[from]; ; i = (i + 1) % 37) { out.push(WHEEL[i]); if (WHEEL[i] === to) return out.sort((a, b) => a - b); } };
  assert.deepEqual(callNumbers('voisins'), arc(22, 25)); assert.deepEqual(callNumbers('tiers'), arc(27, 33)); assert.deepEqual(callNumbers('zero'), arc(12, 15));
  assert.deepEqual(callNumbers('orphelins'), [1, 6, 9, 14, 17, 20, 31, 34], 'the two arcs left over');
  for (const k of ['voisins', 'zero', 'orphelins']) assert.deepEqual([...SECTIONS[k]].sort((a, b) => a - b), callNumbers(k), k);
  const seen = new Set([...callNumbers('voisins'), ...callNumbers('tiers'), ...callNumbers('orphelins')]); assert.equal(seen.size, 37, 'the three sectors make the wheel');
  assert.deepEqual(neighbours(0, 2), [3, 26, 0, 32, 15]); assert.deepEqual(neighbours(26, 1), [3, 26, 0]);
  for (let n = 0; n <= 36; n++) for (let k = 1; k <= 4; k++) { const nb = neighbours(n, k); assert.equal(new Set(nb).size, 2 * k + 1); assert.equal(nb[k], n); }
});

test('la partage: half of each even-money bet back on zero; zero itself still pays', () => {
  const { r, bank } = spinOn([['red', 100], ['odd', 5], ['n0', 1], ['doz1', 10]], 0, 1000);
  assert.equal(r.partage, 52.5); assert.equal(bank.v, 1000 - 116 + 52.5 + 36); assert.equal(r.net, -116 + 52.5 + 36);
  assert.equal(r.losses.find(l => l.id === 'red').back, 50); assert.equal(r.losses.find(l => l.id === 'doz1').back, undefined);
  assert.equal(spinOn([['red', 100]], 3, 100).bank.v, 200);
});

test('limits: per bet, the table maximum and the balance, counting chips already down', () => {
  const t = new RouletteTable({ bank: bankOf(100000) });
  for (const [kind, k] of Object.entries(KINDS)) { const id = [...SPOTS.values()].find(s => s.kind === kind).id; assert.equal(t.place([[id, k.max]]), null, kind); assert.match(t.place([[id, 1]]), /limit is/, kind); }
  t.clear(); for (const id of ['red', 'black', 'odd']) t.place([[id, 3000]]); assert.equal(t.place([['even', 1000]]), null); assert.match(t.place([['low', 1]]), /table maximum/); assert.equal(LIMITS.table, 10000);
  const u = new RouletteTable({ bank: bankOf(30) }); assert.equal(u.place([['red', 20]]), null); assert.match(u.place([['black', 11]]), /Not enough balance/); assert.equal(u.place([['black', 10]]), null);
  assert.equal(new RouletteTable({ bank: bankOf(10) }).place([['nope', 1]]), 'Not a bet.');
});

test('a table\'s cycle: place, undo, take a chip off, double, close, settle once, rebet, void', () => {
  const bank = bankOf(1000), t = new RouletteTable({ bank });
  t.place([['n17', 10]]); t.place(CALLS.voisins.chips.map(([id, u]) => [id, u * 5])); assert.equal(t.total, 55);
  assert.equal(t.undo().length, 7, 'a call bet undoes as one'); assert.equal(t.total, 10);
  t.place([['red', 5], ['n17', 5]]); assert.ok(t.takeFrom('n17')); assert.equal(t.on('n17'), 10); assert.equal(t.double(), null); assert.equal(t.total, 30);
  assert.equal(t.settle(17), null, 'nothing is paid before bets close');
  assert.ok(t.close()); assert.equal(bank.v, 970); assert.equal(t.place([['n1', 1]]), 'Bets are closed.'); assert.equal(t.close(), false);
  const r = t.settle(17); assert.equal(r.back, 20 * 36); assert.equal(bank.v, 970 + 720); assert.equal(t.settle(17), null, 'and only once'); assert.equal(bank.v, 1690);
  assert.ok(t.canRebet); assert.equal(t.rebet(), null); assert.equal(t.total, 30);
  assert.ok(t.close()); assert.equal(t.abandon(), 30); assert.equal(bank.v, 1690); assert.equal(t.total, 30, 'a void hands the stake back and leaves the chips'); assert.equal(t.abandon(), 0);
  const poor = new RouletteTable({ bank: bankOf(40) }); poor.place([['red', 40]]); poor.close(); poor.settle(2); assert.equal(poor.canRebet, false); assert.match(poor.rebet(), /Not enough balance to rebet 40/);
});

test('the draw: a fair number from 0 to 36 (chi-squared over 370,000 draws), seeded when asked', () => {
  const f = new Array(37).fill(0), N = 370000; for (let i = 0; i < N; i++) f[draw()]++;
  const chi = f.reduce((s, x) => s + (x - N / 37) ** 2 / (N / 37), 0); assert.ok(chi < 80, `chi-squared ${chi.toFixed(1)} on 36 degrees of freedom`);   // p < 0.00004 by chance
  const r = seeded(5), r2 = seeded(5); for (let i = 0; i < 100; i++) { const n = draw(r); assert.equal(n, Math.floor(r2() * 37)); assert.ok(n >= 0 && n <= 36); }
  const s = stats([0, 1, 1, 2, 36]); assert.equal(s.count, 5); assert.equal(s.hot[0].n, 1); assert.equal(s.zero, 20);
});
