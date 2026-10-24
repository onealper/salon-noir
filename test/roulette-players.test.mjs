import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoulettePlayer, ROULETTE_PLAYERS, COLOUR_RESERVE_LIMIT } from '../src/roulette/players.mjs';
import { RouletteTable, SPOTS, LIMITS } from '../src/roulette/rules.mjs';
import { seeded } from './helpers.mjs';

const sum = values => values.reduce((a, b) => a + b, 0);
const player = (unit = 5, bankroll = 1000) => new RoulettePlayer({ ...ROULETTE_PLAYERS[0], unit }, { bankroll });
const reference = (bets, n, bankroll) => {
  let balance = bankroll;
  const table = new RouletteTable({ bank: { get: () => balance, set: value => { balance = value; } } });
  assert.equal(table.place(bets), null); assert.ok(table.close());
  return { result: table.settle(n), get balance() { return balance; } };
};

test('roulette players have stable identities and a reserve of colour chips plus real value change', () => {
  assert.equal(new Set(ROULETTE_PLAYERS.map(p => p.id)).size, 4);
  const p = player(5, 12.5);
  assert.equal(p.id, 'olu'); assert.equal(p.name, 'Olu'); assert.equal(p.color, ROULETTE_PLAYERS[0].color);
  assert.equal(p.inserts, 4); assert.equal(p.style, 'straights');
  assert.deepEqual(p.inventory, { colour: 2, change: [1, 1, .5], count: 5, amount: 12.5, unit: 5 });
  assert.deepEqual(p.reserveValues, [5, 5, 1, 1, .5]); assert.equal(p.reserveCount, 5);
  assert.equal(sum(p.reserveValues), p.bankroll);
  const reserve = p.reserveValues; reserve.pop(); assert.equal(sum(p.reserveValues), 12.5);
  assert.ok(p.place('n17', 1)); assert.equal(p.bankroll, 11.5); assert.equal(p.staked, 1);
  assert.equal(sum(p.reserveValues) + p.staked, 12.5);
  assert.throws(() => p.bets.push(['red', 100]), TypeError);
  assert.throws(() => { p.bets[0][1] = 100; }, TypeError);
  assert.equal(p.staked, 1);
});

test('chips leave the reserve at placement and cannot exceed bankroll or roulette limits', () => {
  const p = player(25, 10000);
  for (let i = 0; i < 4; i++) assert.ok(p.place('n17'));
  assert.equal(p.bankroll, 9900); assert.equal(p.on('n17'), 100); assert.equal(p.staked, 100);
  assert.equal(p.place('n17'), false, 'straight-up limit is enforced against all chips already down');
  assert.equal(p.place('red', 50), false, 'a value not in this colour-chip reserve cannot be invented');
  for (let i = 0; i < 120; i++) assert.ok(p.place('red'));
  assert.equal(p.place('red'), false, 'even-money limit');
  for (const id of ['black', 'odd']) for (let i = 0; i < 120; i++) assert.ok(p.place(id));
  for (let i = 0; i < 36; i++) assert.ok(p.place('even'));
  assert.equal(p.staked, LIMITS.table); assert.equal(p.bankroll, 0);
  assert.equal(p.place('even'), false); assert.equal(p.cancel(), 10000); assert.equal(p.bankroll, 10000);
  const poor = player(10, 10);
  assert.ok(poor.place('n0')); assert.equal(poor.bankroll, 0); assert.equal(poor.reserveCount, 0);
  assert.equal(poor.place('red'), false); assert.equal(poor.beginRound(), 0, 'no rebuy with an unclosed wager');
});

test('large reserves exchange excess colour chips into cash while preserving the full bank', () => {
  assert.equal(COLOUR_RESERVE_LIMIT, 200);
  const p = player(5, 1000000);
  assert.equal(p.inventory.colour, 200);
  assert.equal(p.inventory.change.length, 1998);
  assert.ok(p.inventory.change.every(value => value === 500));
  assert.equal(p.reserveCount, 2198);
  assert.equal(sum(p.reserveValues), 1000000);
  assert.equal(p.bankroll, 1000000);
  assert.ok(p.place('red', 500), 'cash value chips really belong to the reserve and can be wagered');
  assert.equal(p.bankroll, 999500); assert.equal(p.staked, 500);
  assert.equal(sum(p.reserveValues) + p.staked, 1000000);
  assert.equal(p.cancel(), 500); assert.equal(p.bankroll, 1000000);
  // A denomination equal to the colour unit must never appear as a separate cash-chip type.
  for (const unit of [5, 10, 25]) {
    const q = player(unit, COLOUR_RESERVE_LIMIT * unit + unit + 2.5);
    assert.equal(q.inventory.colour, 201);
    assert.ok(q.inventory.change.every(value => value !== unit));
    assert.equal(sum(q.reserveValues), q.bankroll);
    const before = q.bankroll;
    q.place('n17'); q.close(); q.settle(17);
    assert.equal(q.bankroll, before + 35 * unit);
    assert.equal(sum(q.reserveValues), q.bankroll, 'the entire win remains in the composed reserve');
  }
});

test('closing, settlement and cancellation cannot double-credit or undo a closed wager', () => {
  const p = player(5, 15.5);
  assert.ok(p.place('n17')); assert.equal(p.cancel(), 5); assert.equal(p.cancel(), 0);
  assert.equal(p.bankroll, 15.5); assert.equal(p.settle(17), null);
  assert.ok(p.place('n17')); assert.ok(p.place('red')); assert.ok(p.close());
  assert.equal(p.close(), false); assert.equal(p.busy, true); assert.equal(p.cancel(), 0);
  assert.equal(p.beginRound(), 0); assert.equal(p.place('red'), false);
  const result = p.settle(17);
  assert.equal(result.staked, 10); assert.equal(result.back, 180); assert.equal(result.net, 170);
  assert.equal(p.bankroll, 185.5); assert.equal(p.busy, false); assert.equal(p.rounds, 1);
  assert.equal(p.settle(0), result, 'a repeated or changed result cannot settle again');
  assert.equal(p.bankroll, 185.5); assert.equal(p.cancel(), 0); assert.equal(p.place('red'), false);
  assert.equal(p.beginRound(), 0); assert.equal(p.staked, 0); assert.deepEqual(p.bets, []);
  assert.equal(p.phase, 'betting'); assert.equal(p.result, null); assert.ok(p.place('red'));
});

test('zero gives exact la partage, including half-chip change, and a rebuy only happens at a boundary', () => {
  const p = player(5, 5.5);
  assert.ok(p.place('red')); assert.ok(p.close());
  const result = p.settle(0);
  assert.equal(result.back, 2.5); assert.equal(result.partage, 2.5); assert.equal(result.net, -2.5);
  assert.equal(p.bankroll, 3); assert.deepEqual(p.reserveValues, [1, 1, 1]);
  assert.equal(p.buyIns, 0); assert.equal(p.beginRound(), 2.5);
  assert.equal(p.bankroll, 5.5); assert.equal(p.buyIns, 2.5); assert.equal(p.rebuys, 1);
  assert.equal(p.beginRound(), 0, 'no repeated rebuy');
  assert.ok(p.place('n17')); assert.ok(p.close()); p.settle(0);
  assert.equal(p.bankroll, .5); assert.deepEqual(p.reserveValues, [.5]);
  assert.equal(p.beginRound(), 5); assert.equal(p.buyIns, 7.5); assert.equal(p.rebuys, 2);
});

test('AI payouts match the game table for every spot and winning number', () => {
  for (const id of SPOTS.keys()) for (let n = 0; n < 37; n++) {
    const p = player(5, 1000);
    assert.ok(p.place(id)); assert.ok(p.close());
    const expected = reference([ [id, 5] ], n, 1000), actual = p.settle(n);
    for (const key of ['staked', 'back', 'partage', 'net']) assert.equal(actual[key], expected.result[key], `${id} / ${n} / ${key}`);
    assert.equal(p.bankroll, expected.balance, `${id} / ${n} bankroll`);
  }
});

test('eight thousand seeded rounds conserve every AI bankroll, refunds and tracked rebuys', () => {
  const rng = seeded(302), players = ROULETTE_PLAYERS.map(profile => new RoulettePlayer(profile)), spots = [...SPOTS.keys()];
  const net = new Map(players.map(p => [p, 0]));
  for (let round = 0; round < 2000; round++) for (const p of players) {
    p.beginRound(); const before = p.bankroll;
    const want = 1 + Math.floor(rng() * 8);
    for (let i = 0; i < want; i++) p.place(spots[Math.floor(rng() * spots.length)]);
    assert.equal(p.bankroll + p.staked, before, 'debits move reserve chips to the layout');
    assert.equal(sum(p.reserveValues), p.bankroll);
    if (round % 13 === 0) {
      const pending = p.staked, back = p.cancel(); assert.equal(back, pending); assert.equal(p.bankroll, before);
      assert.equal(p.cancel(), 0);
    } else if (p.close()) {
      const n = Math.floor(rng() * 37), expected = reference(p.bets, n, before), result = p.settle(n);
      assert.equal(p.bankroll, expected.balance); assert.equal(result.net, expected.result.net);
      net.set(p, net.get(p) + result.net);
      assert.equal(p.settle(n), result); assert.equal(p.cancel(), 0);
    }
    assert.equal(p.bankroll, p.initialBankroll + p.buyIns + net.get(p));
    assert.ok(p.bankroll >= 0 && Number.isSafeInteger(p.bankroll * 2));
    assert.equal(sum(p.reserveValues), p.bankroll);
  }
  assert.ok(players.some(p => p.rebuys > 0), 'the run exercises tracked rebuys');
});

test('invalid money, chips and results cannot corrupt a player bank', () => {
  for (const bankroll of [-1, NaN, Infinity, .25, '1000', Number.MAX_SAFE_INTEGER]) assert.throws(() => player(5, bankroll), RangeError);
  for (const unit of [0, -5, .5, 1.5, NaN, Infinity, .25, '5']) assert.throws(() => player(unit), RangeError);
  assert.throws(() => player(25, 10), RangeError);
  const p = player();
  for (const value of [-5, 0, .5, .25, NaN, Infinity, '5', 1001]) assert.equal(p.place('red', value), false);
  assert.equal(p.place('missing'), false); assert.equal(p.bankroll, 1000); assert.equal(p.staked, 0);
  p.place('red'); p.close();
  for (const n of [-1, 37, .5, NaN, Infinity, '17']) assert.throws(() => p.settle(n), RangeError);
  assert.equal(p.bankroll, 995); assert.equal(p.busy, true); assert.equal(p.rounds, 0);
});
