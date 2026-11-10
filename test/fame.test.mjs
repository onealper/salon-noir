// The hall of fame's book: what each kind of round adds to it, the records and the milestones, a store that takes
// anything it finds in it, two windows writing the one record, and every round of the ledger passing through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshStorage, fresh } from './helpers.mjs';

freshStorage();
const { tally, raise, blank, MARKS, TABLES } = await import('../src/core/fame.mjs');
const bj = (net, extra = {}) => ({ game: 'blackjack', table: 'classic', net, hands: [{ cards: ['10♠', '9♥'], total: 19, kind: net > 0 ? 'win' : net < 0 ? 'loss' : 'push', net }], ...extra });
const names = news => news.map(n => `${n.kind}:${n.id}`);

test('rounds, wins and the run of wins: a push neither breaks a run nor adds to it', () => {
  const f = blank(); let news = [];
  for (const net of [10, 10, 0, 10, -5, 10, 10, 10, 10, 10]) news = tally(f, bj(net, { at: 1000 }));
  assert.deepEqual([f.rounds, f.won, f.streak, f.bestStreak, f.since], [10, 8, 5, 5, 1000]);
  assert.ok(names(news).includes('mark:streak5') && names(news).includes('record:streak'));
  assert.equal(f.marks.streak5, 1000); assert.equal(f.marks.streak10, undefined);
  tally(f, bj(-1)); assert.equal(f.streak, 0); assert.equal(f.bestStreak, 5);
});

test('the biggest win is the best net of one round, with its table', () => {
  const f = blank();
  assert.deepEqual(names(tally(f, bj(50, { at: 5 }))), ['record:best']); assert.deepEqual(f.best, { net: 50, game: 'blackjack', table: 'classic', at: 5 });
  assert.deepEqual(names(tally(f, bj(20))), []); assert.equal(f.best.net, 50);
  const news = tally(f, { game: 'roulette', table: 'mega', n: 17, net: 12500, x: 500, at: 9 });
  assert.deepEqual(f.best, { net: 12500, game: 'roulette', table: 'mega', at: 9 });
  assert.deepEqual(names(news).sort(), ['mark:bolt', 'mark:bolt500', 'mark:win1000', 'mark:win10000', 'record:best', 'record:bolt', 'record:streak']);   // (its third win running, too)
  assert.deepEqual(f.bolt, { x: 500, game: 'roulette', table: 'mega', at: 9 }); assert.deepEqual(f.numbers, [17]);
  tally(f, { game: 'blackjack', table: 'lightning', net: 300, hands: [], bonus: { m: 25, amount: 250 } }); assert.equal(f.bolt.x, 500, 'a lower multiplier leaves the record');
});

test('blackjacks, even money and ten-card Charlies are counted hand by hand', () => {
  const f = blank();
  tally(f, { game: 'blackjack', table: 'freebet', net: 40, hands: [{ cards: ['A♠', 'K♥'], kind: 'blackjack', net: 15 }, { cards: ['A♦', 'Q♥'], kind: 'win', even: true, net: 10 }, { cards: ['2♠', '2♥', '2♦', '2♣', 'A♠', 'A♥', 'A♦', 'A♣', '3♠', '3♥'], kind: 'win', net: 15 }] });
  assert.deepEqual([f.blackjacks, f.charlies], [2, 1]); assert.ok(f.marks.charlie);
  tally(f, { game: 'blackjack', table: 'classic', net: -10, hands: [{ cards: ['2♠', '2♥', '2♦', '2♣', 'A♠', 'A♥', 'A♦', 'A♣', '3♠', '9♥'], kind: 'loss', net: -10 }] }); assert.equal(f.charlies, 1, 'ten cards that bust are no Charlie');
});

test('roulette: the numbers won straight up, each once; baccarat and the wheel keep their own', () => {
  const f = blank();
  tally(f, { game: 'roulette', n: 7, net: 35, straight: true }); tally(f, { game: 'roulette', n: 7, net: 35, straight: true }); tally(f, { game: 'roulette', n: 3, net: 10 }); tally(f, { game: 'roulette', n: 0, net: -5, straight: false });
  assert.deepEqual(f.numbers, [7]);
  for (let n = 0; n <= 36; n++) tally(f, { game: 'roulette', n, net: 35, straight: true });
  assert.equal(f.numbers.length, 37); assert.ok(f.marks.numbers);
  tally(f, { game: 'baccarat', table: 'nocomm', net: 90, winner: 'tie', natural: false, wins: [{ id: 'tie', stake: 10, pay: 80 }, { id: 'ppair', stake: 1, pay: 11 }] });
  tally(f, { game: 'baccarat', table: 'classic', net: 100, winner: 'player', natural: true, wins: [{ id: 'player', stake: 100, pay: 100 }] });
  tally(f, { game: 'baccarat', table: 'classic', net: -100, winner: 'banker', natural: true, wins: [], losses: [{ id: 'player', stake: 100 }] });
  assert.deepEqual([f.ties, f.pairs, f.naturals], [1, 1, 1]); assert.ok(f.marks.tie);
  tally(f, { game: 'wheel', net: 2400, n: 40, x: 6, segs: ['x6', '40'], wins: [{ id: 'n40', stake: 10, pay: 2400 }] }); tally(f, { game: 'wheel', net: -10, n: 40, x: 36, wins: [] });
  assert.deepEqual([f.forties, f.spun], [1, 6]); assert.ok(f.marks.forty);
  assert.deepEqual(f.tables, ['roulette:european', 'baccarat:classic', 'baccarat:nocomm', 'wheel:wheel']);
});

test('a seat at every table, a hundred rounds, and the balance held', () => {
  const f = blank();
  for (const t of TABLES) { const [game, table] = t.split(':'); assert.equal(f.marks.tables, undefined); tally(f, { game, table: game === 'roulette' && table === 'european' ? undefined : table, net: -1, hands: [] }); }
  assert.ok(f.marks.tables); assert.equal(f.tables.length, 9);
  for (let i = 0; i < 91; i++) tally(f, bj(-1)); assert.ok(f.marks.rounds100); assert.equal(f.marks.rounds1000, undefined);
  assert.deepEqual(raise(f, 1000), []); assert.equal(f.peak, 1000); assert.deepEqual(raise(f, 900), []); assert.equal(f.peak, 1000);
  assert.deepEqual(names(raise(f, 12000)), ['mark:balance10000']); assert.deepEqual(names(raise(f, 250000)), ['mark:balance100000']); assert.equal(f.peak, 250000);
  assert.deepEqual(raise(f, NaN), []);
  for (const m of MARKS) assert.ok(m.id && m.name && m.hint);
});

test('cheat mode counts for nothing; a round without a net is no round', () => {
  const f = blank();
  assert.deepEqual(tally(f, bj(5000, { cheat: true })), []); assert.deepEqual(tally(f, { game: 'roulette' }), []); assert.deepEqual(tally(f, null), []);
  assert.deepEqual(f, blank());
});

test('the record in the browser: kept, shared by two windows, fed by the ledger, and whole whatever the store holds', async () => {
  freshStorage({ 'salonnoir.fame': JSON.stringify({ rounds: 'many', best: { net: -5 }, numbers: [3, 3, 99, 'x'], tables: ['nowhere', 'wheel:wheel'], marks: { bolt: 7, made: 1 }, blackjacks: 4 }) });
  const a = await fresh('../src/core/fame.mjs');
  assert.deepEqual([a.fame.state.rounds, a.fame.state.best, a.fame.state.numbers, a.fame.state.tables, a.fame.state.marks, a.fame.state.blackjacks], [0, null, [3], ['wheel:wheel'], { bolt: 7 }, 4]);
  let told = 0; a.fame.subscribe(() => told++);
  assert.deepEqual(names(a.fame.add(bj(75))), ['record:best']); assert.equal(told, 1); assert.equal(JSON.parse(localStorage.getItem('salonnoir.fame')).best.net, 75);
  // a second window: its round goes on top of the first's, and the first then adds to both
  const b = await fresh('../src/core/fame.mjs'); assert.equal(b.fame.state.rounds, 1);
  b.fame.add(bj(200)); a.fame.add(bj(10)); assert.equal(a.fame.state.rounds, 3); assert.equal(a.fame.state.best.net, 200); assert.equal(a.fame.state.streak, 3);
  assert.deepEqual(a.fame.balance(500), []); assert.equal(a.fame.state.peak, 500); a.fame.balance(400); assert.equal(JSON.parse(localStorage.getItem('salonnoir.fame')).peak, 500);
  a.fame.add(bj(9999, { cheat: true })); assert.equal(a.fame.state.rounds, 3);
  // every round of the ledger passes through
  const { ledger } = await fresh('../src/core/ledger.mjs');
  const news = ledger.add({ game: 'roulette', n: 5, net: 3500, straight: true });
  assert.ok(names(news).includes('record:best')); assert.deepEqual(ledger.add({ game: 'roulette' }), []);
  const c = await fresh('../src/core/fame.mjs'); assert.equal(c.fame.state.rounds, 4); assert.deepEqual(c.fame.state.numbers, [3, 5]); assert.equal(c.fame.state.best.table, 'european');
  // a store that can't be read or written: the record lives in memory
  globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const d = await fresh('../src/core/fame.mjs'); d.fame.add(bj(5)); assert.equal(d.fame.state.rounds, 1);
  freshStorage({ 'salonnoir.fame': '{not json' }); const e = await fresh('../src/core/fame.mjs'); assert.deepEqual(e.fame.state, blank());
});
