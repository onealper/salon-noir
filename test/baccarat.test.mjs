// Baccarat's rules held to the book: the tableau, every payout, the exact odds of an eight-deck shoe (counted over
// every way six cards can leave it), the commission, money conservation at the table, and the roads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, H, seeded } from './helpers.mjs';
import { valueOf, points, playerDraws, bankerDraws, coup, returned, commission, SPOTS, SPOT_IDS, TABLES, BaccaratTable, bigRoad, tally, rivalBet, TEMPERS, DECKS, SHOE_CARDS, CUT_AT } from '../src/baccarat/rules.mjs';

const from = str => { const cards = H(str); return () => cards.shift(); };
const bankOf = v => { const b = { v, get: () => b.v, set: x => { b.v = x; } }; return b; };

test('card values: an ace is one, tens and court cards nothing, a hand its last digit', () => {
  assert.deepEqual(['As', '2h', '9d', '10c', 'Js', 'Qh', 'Kd'].map(s => valueOf(C(s))), [1, 2, 9, 0, 0, 0, 0]);
  assert.equal(points(H('7s 8h')), 5); assert.equal(points(H('Ks 9h')), 9); assert.equal(points(H('5s 5h Kd')), 0); assert.equal(points(H('As 2h 3d')), 6);
});

test('the tableau: Player draws to five; Banker goes by his total and the card Player drew', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(playerDraws), [true, true, true, true, true, true, false, false]);
  // Player stood: Banker draws to five
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(b => bankerDraws(b, null)), [true, true, true, true, true, true, false, false]);
  // Player drew: the chart every baccarat table prints (rows: Banker's total; columns: Player's third card 0-9)
  const chart = { 0: 'DDDDDDDDDD', 1: 'DDDDDDDDDD', 2: 'DDDDDDDDDD', 3: 'DDDDDDDDSD', 4: 'SSDDDDDDSS', 5: 'SSSSDDDDSS', 6: 'SSSSSSDDSS', 7: 'SSSSSSSSSS' };
  for (const [b, row] of Object.entries(chart)) for (let t = 0; t <= 9; t++) assert.equal(bankerDraws(+b, t), row[t] === 'D', `Banker ${b} against a ${t}`);
});

test('a coup: naturals stand, third cards as the tableau says, pairs seen in the first two cards', () => {
  let c = coup(from('9s Kh Kd 7c'));   // Player 9: a natural
  assert.deepEqual([c.p, c.b, c.natural, c.winner, c.player.length, c.banker.length], [9, 7, true, 'player', 2, 2]);
  c = coup(from('2s 3h 3d Kc 8s 4h'));   // Player 5 draws an 8 (3); Banker 3 against an 8 stands
  assert.deepEqual([c.p, c.b, c.player.length, c.banker.length, c.winner], [3, 3, 3, 2, 'tie']);
  c = coup(from('Ks 2h Qd 3c 4s 9h'));   // Player 0 draws a 4; Banker 5 against a 4 draws a 9
  assert.deepEqual([c.p, c.b, c.player.length, c.banker.length, c.winner], [4, 4, 3, 3, 'tie']);
  c = coup(from('6s 2h Ad 3c 7h'));   // Player 7 stands; Banker 5 draws
  assert.deepEqual([c.p, c.b, c.player.length, c.banker.length, c.winner], [7, 2, 2, 3, 'player']);
  c = coup(from('7s 7h 7d 7c 2s 3h'));   // two pairs of sevens: four each, and both draw
  assert.deepEqual([c.p, c.b, c.player.length, c.banker.length], [6, 7, 3, 3]);
  assert.equal(c.playerPair, true); assert.equal(c.bankerPair, true);
  c = coup(from('Ks Qh Qd Kc 2s 5h'));   // court cards of different ranks are no pair
  assert.equal(c.playerPair, false); assert.equal(c.bankerPair, false);
});

// Every ordered way six cards can leave an eight-deck shoe, by value (128 tens and courts, 32 of each other value),
// weighted by how many ways the cards can be chosen: the game's exact odds.
test('the exact odds of an eight-deck shoe, and the house edge of every bet', () => {
  const left = [128, 32, 32, 32, 32, 32, 32, 32, 32, 32], seq = [], n = { player: 0n, banker: 0n, tie: 0n, banker6: 0n };
  const card = v => ({ rank: v === 0 ? 'K' : v === 1 ? 'A' : String(v), suit: '♠' });
  let total = 0n;
  const go = (i, w) => {
    if (i === 6) { let k = 0; const c = coup(() => card(seq[k++])); n[c.winner] += w; if (c.winner === 'banker' && c.b === 6) n.banker6 += w; total += w; return; }
    for (let v = 0; v <= 9; v++) { if (!left[v]) continue; const ways = BigInt(left[v]); left[v]--; seq[i] = v; go(i + 1, w * ways); left[v]++; }
  };
  go(0, 1n);
  assert.equal(total, 416n * 415n * 414n * 413n * 412n * 411n);
  // the counts every analysis of the game gives (Thorp; Griffin; the Wizard of Odds' eight-deck table)
  assert.equal(n.banker, 2292252566437888n); assert.equal(n.player, 2230518282592256n); assert.equal(n.tie, 475627426473216n);
  const P = k => Number(n[k]) / Number(total), edge = (win, pays, lose) => -(win * pays - lose);
  const near = (x, want, name) => assert.ok(Math.abs(x - want) < 5e-7, `${name}: ${x}`);
  near(edge(P('player'), 1, P('banker')), .012351, 'Player 1.2351%');
  near(edge(P('banker'), .95, P('player')), .010579, 'Banker 1.0579% at 19 to 20');
  near(edge(P('tie'), 8, 1 - P('tie')), .143596, 'Tie 14.3596% at 8 to 1');
  // no commission: a Banker win on six pays half
  near(-(P('banker') - P('banker6') / 2 - P('player')), .014581, 'Banker 1.4581% without commission');
  // a pair: the second card of the first's rank, 31 of the 415 left; at 11 to 1 the house keeps 43/415
  near(1 - 12 * 31 / 415, .103614, 'pairs 10.3614%');
  assert.equal(SPOTS.tie.pays, 8); assert.equal(SPOTS.ppair.pays, 11); assert.equal(SPOTS.bpair.pays, 11); assert.equal(SPOTS.player.pays, 1); assert.equal(SPOTS.banker.pays, .95);
});

test('what each spot is paid, at both tables', () => {
  const pw = coup(from('9s Kh Kd 7c')), bw = coup(from('2s 4h 3d 4c Ks')), b6 = coup(from('2s 3h 2d 3c Ks')), tie = coup(from('9s 9h Kd Kc'));
  assert.deepEqual([pw.winner, bw.winner, bw.b, b6.winner, b6.b, tie.winner], ['player', 'banker', 8, 'banker', 6, 'tie']);
  for (const kind of ['classic', 'nocomm']) {
    assert.equal(returned('player', 100, pw, kind), 200); assert.equal(returned('player', 100, bw, kind), 0); assert.equal(returned('player', 100, tie, kind), 100);
    assert.equal(returned('banker', 100, pw, kind), 0); assert.equal(returned('banker', 100, tie, kind), 100);
    assert.equal(returned('tie', 10, tie, kind), 90); assert.equal(returned('tie', 10, pw, kind), 0);
    assert.equal(returned('ppair', 10, tie, kind), 0); assert.equal(returned('bpair', 10, bw, kind), 120); assert.equal(returned('ppair', 10, coup(from('8s 2h 8d 3c Ks')), kind), 120);
  }
  // Classic: 19 to 20, the commission up to the next half chip
  assert.equal(returned('banker', 100, bw, 'classic'), 195); assert.equal(returned('banker', 100, b6, 'classic'), 195);
  assert.equal(returned('banker', 10, bw, 'classic'), 19.5); assert.equal(returned('banker', 30, bw, 'classic'), 58.5); assert.equal(returned('banker', 70, bw, 'classic'), 136.5);
  assert.equal(returned('banker', 25, bw, 'classic'), 48.5); assert.equal(returned('banker', 1, bw, 'classic'), 1.5); assert.equal(returned('banker', 5, bw, 'classic'), 9.5);
  // No commission: even money, half on a winning six
  assert.equal(returned('banker', 100, bw, 'nocomm'), 200); assert.equal(returned('banker', 100, b6, 'nocomm'), 150); assert.equal(returned('banker', 5, b6, 'nocomm'), 7.5);
});

test('the commission: 5%, exact on a bet in tens, never under, never more than half a chip over, always on the half-chip grid', () => {
  for (let s = 1; s <= 1000; s++) {
    const c = commission(s);
    assert.ok(c * 2 === Math.round(c * 2), `commission on ${s} is on the grid`);
    assert.ok(c >= s * .05 - 1e-9 && c < s * .05 + .5, `commission on ${s}: ${c}`);
    if (s % 10 === 0) assert.equal(c, s / 20);
  }
});

test('the table: chips go down within the limits and the balance, undo and rebet, and the money adds up', () => {
  const bank = bankOf(5000), t = new BaccaratTable({ bank, random: seeded(11) });
  assert.equal(t.remaining, SHOE_CARDS - 1, 'a new shoe burns its first card'); assert.equal(DECKS, 8);
  assert.equal(t.place([['player', 100], ['tie', 25]]), null); assert.equal(t.total, 125); assert.equal(t.on('player'), 100);
  assert.match(t.place([['tie', 100]]), /Tie limit is 100/); assert.match(t.place([['nowhere', 5]]), /Not a bet/);
  assert.match(t.place([['banker', 5000]]), /Not enough balance|limit/);
  assert.equal(t.place([['banker', 500]]), null); assert.equal(t.place([['banker', 500]]), null); assert.match(t.place([['banker', 1]]), /Banker limit is 1,000/);
  assert.deepEqual(t.undo(), [['banker', 500]]); assert.equal(t.on('banker'), 500);
  assert.equal(t.takeFrom('tie'), true); assert.equal(t.on('tie'), 0); assert.equal(t.takeFrom('tie'), false);
  assert.equal(t.double(), null); assert.equal(t.on('player'), 200); assert.equal(t.on('banker'), 1000);
  t.clear(); assert.equal(t.total, 0); assert.equal(t.close(), false, 'no bets, no coup'); assert.equal(t.settle(), null);
  assert.match(t.rebet(), /Nothing to rebet/);
  // a few hundred coups with every spot bet: each result's parts agree, and the balance moves by its net
  const rng = seeded(5); let coups = 0, shoes = 0;
  for (let i = 0; i < 400; i++) {
    if (t.cutReached) { t.newShoe(); shoes++; assert.equal(t.road.length, 0, 'a new shoe, new roads'); }
    const adds = SPOT_IDS.filter(() => rng() < .7).map(id => [id, [1, 5, 10, 25, 50, 100][Math.floor(rng() * 6)]]); if (!adds.length) adds.push(['player', 5]);
    if (t.kind !== (i % 2 ? 'nocomm' : 'classic')) assert.equal(t.setKind(i % 2 ? 'nocomm' : 'classic'), true);
    if (bank.v < 400) bank.v = 5000;
    assert.equal(t.place(adds), null);
    const before = bank.v, staked = t.total; assert.equal(t.close(), true); assert.equal(bank.v, before - staked);
    assert.equal(t.setKind('classic'), false, 'no change of rules mid-coup'); assert.match(t.place([['player', 1]]), /closed/);
    const r = t.settle(); coups++;
    assert.equal(bank.v, before + r.net); assert.equal(r.staked, staked); assert.equal(r.back, r.wins.reduce((s, w) => s + w.stake + w.pay, 0) + r.pushes.reduce((s, w) => s + w.stake, 0));
    assert.equal(r.wins.length + r.pushes.length + r.losses.length, adds.length);
    assert.equal(r.player.length >= 2 && r.player.length <= 3 && r.banker.length >= 2 && r.banker.length <= 3, true);
    assert.equal(r.p, points(r.player)); assert.equal(r.b, points(r.banker)); assert.equal(r.back * 2, Math.round(r.back * 2), 'paid on the half-chip grid');
    if (r.winner === 'tie') assert.equal(r.losses.some(l => l.id === 'player' || l.id === 'banker'), false, 'Player and Banker push on a tie');
    assert.equal(t.phase, 'betting'); assert.equal(t.total, 0); assert.equal(t.canRebet, t.lastTotal <= bank.v);
  }
  assert.ok(shoes >= 4, `the cut card came out ${shoes} times in ${coups} coups`); assert.equal(CUT_AT, 400);
});

test('the shoe: a coup begun before the cut card always has its cards; a rigged card is dealt first', () => {
  const bank = bankOf(1e6), t = new BaccaratTable({ bank, random: seeded(3) });
  let least = Infinity;
  for (let i = 0; i < 3000; i++) { if (t.cutReached) t.newShoe(); t.place([['banker', 10]]); t.close(); const r = t.settle(); assert.ok(r.player.every(Boolean) && r.banker.every(Boolean)); least = Math.min(least, t.remaining); }
  assert.ok(least >= 10, `never fewer than ${least} cards left`);
  t.stacked.push(...H('9s Kh Kd 7c')); t.place([['player', 10]]); t.close(); const r = t.settle();
  assert.deepEqual([r.p, r.b, r.winner, r.natural], [9, 7, 'player', true]);
});

test('a coup that could not be dealt hands the stake back', () => {
  const bank = bankOf(1000), t = new BaccaratTable({ bank, random: seeded(2) });
  t.place([['player', 100], ['ppair', 10]]); t.close(); assert.equal(bank.v, 890);
  assert.equal(t.abandon(), 110); assert.equal(bank.v, 1000); assert.equal(t.phase, 'betting'); assert.equal(t.on('player'), 100, 'the chips stay where they were');
  assert.equal(t.abandon(), 0);
});

test('the big road: a column a run, six deep, the tail turning along the row; ties marked on the cell before', () => {
  const R = s => [...s].map(ch => ({ winner: { P: 'player', B: 'banker', T: 'tie' }[ch] }));
  let cells = bigRoad(R('PPBTBP'));
  assert.deepEqual(cells.map(c => [c.col, c.row, c.winner[0], c.ties]), [[0, 0, 'p', 0], [0, 1, 'p', 0], [1, 0, 'b', 1], [1, 1, 'b', 0], [2, 0, 'p', 0]]);
  cells = bigRoad(R('TTP'));   // a shoe opening on ties: counted on the first cell
  assert.deepEqual(cells.map(c => [c.col, c.row, c.ties]), [[0, 0, 2]]);
  cells = bigRoad(R('BBBBBBBBB'));   // nine in a row: six down, then three along the bottom
  assert.deepEqual(cells.map(c => [c.col, c.row]), [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 5], [3, 5]]);
  cells = bigRoad(R('BBBBBBBBPPPPPPP'));   // the next run stops above the tail and turns there
  assert.deepEqual(cells.slice(8).map(c => [c.col, c.row]), [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4]]);
  const seen = new Set(); for (const c of bigRoad(R('BBBBBBBBPPPPPPPBBBBBBBPBPBPPPPPPPPPP'))) { const k = `${c.col},${c.row}`; assert.equal(seen.has(k), false, `cell ${k} used once`); seen.add(k); assert.ok(c.row < 6); }
  assert.deepEqual(tally([{ winner: 'player', natural: true, playerPair: true }, { winner: 'tie' }, { winner: 'banker', bankerPair: true }]), { player: 1, banker: 1, tie: 1, playerPair: 1, bankerPair: 1, natural: 1, coups: 3 });
});

test('the other players bet a side within the limits, by temperament', () => {
  const rng = seeded(9), road = [{ winner: 'banker' }, { winner: 'tie' }];
  for (const temper of TEMPERS) {
    let withRun = 0;
    for (let i = 0; i < 400; i++) {
      const adds = rivalBet({ temper, base: [5, 10, 25, 100, 500][i % 5] }, road, rng);
      assert.ok(['player', 'banker'].includes(adds[0][0])); if (adds[0][0] === 'banker') withRun++;
      for (const [id, v] of adds) { assert.ok(SPOTS[id] && v >= 1 && v <= SPOTS[id].max && Number.isInteger(v), `${id} ${v}`); }
    }
    if (temper === 'banker' || temper === 'run') assert.ok(withRun > 280, `${temper}: ${withRun} of 400 on the Banker`);
    if (temper === 'against') assert.ok(withRun < 140, `${temper}: ${withRun} of 400 on the Banker`);
  }
  assert.ok(rivalBet({ temper: 'run', base: 10 }, [], rng).length >= 1, 'an empty road is no trouble');
  assert.deepEqual(Object.keys(TABLES), ['classic', 'nocomm']);
});
