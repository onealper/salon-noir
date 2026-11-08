// The betting layout for the keyboard (src/roulette/rkeys.mjs): every box printed on the cloth is reachable with the
// arrow keys from either view, and with Shift every inside bet too (each spot of the rules, none left out); each spot has
// one place, moves follow the layout as it lies on the screen, and a screen reader hears what each spot is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spotAt, placeOf, move, edge, speak, named } from '../src/roulette/rkeys.mjs';
import { SPOTS } from '../src/roulette/rules.mjs';

const BOXES = [...Array.from({ length: 37 }, (_, n) => `n${n}`), 'col1', 'col2', 'col3', 'doz1', 'doz2', 'doz3', 'low', 'even', 'red', 'black', 'odd', 'high'];
const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const walk = (from, keys, orient) => keys.reduce((p, k) => move(p, k, orient), placeOf(from));
const at = (from, keys, orient) => spotAt(walk(from, keys, orient));

test('every box printed on the cloth is a spot of the rules, and has a place of its own', () => {
  for (const id of BOXES) { assert.ok(SPOTS.has(id), id); assert.equal(spotAt(placeOf(id)), id, id); }
});

test('from either view, the arrow keys reach every box from the zero, and never leave the layout', () => {
  for (const orient of ['land', 'port']) {
    const seen = new Set(), todo = [placeOf('n0')], key = p => `${p.c},${p.r}`, places = new Set();
    while (todo.length) {
      const p = todo.pop(); if (places.has(key(p))) continue; places.add(key(p));
      const id = spotAt(p); assert.ok(SPOTS.has(id), `${orient}: ${key(p)} is ${id}`); seen.add(id);
      for (const k of KEYS) todo.push(move(p, k, orient));
    }
    assert.deepEqual([...seen].sort(), [...BOXES].sort(), orient);
  }
});

test('from the long side: along the table to the right, the column upward, the outside boxes below', () => {
  assert.equal(at('n1', ['ArrowRight'], 'land'), 'n4');
  assert.equal(at('n1', ['ArrowUp'], 'land'), 'n2');
  assert.equal(at('n1', ['ArrowUp', 'ArrowUp', 'ArrowUp'], 'land'), 'n3');   // the top row is the edge
  assert.equal(at('n34', ['ArrowRight'], 'land'), 'col1');
  assert.equal(at('n36', ['ArrowRight'], 'land'), 'col3');
  assert.equal(at('col1', ['ArrowDown'], 'land'), 'col1');                   // the "2 to 1"s end at the number rows
  assert.equal(at('n1', ['ArrowLeft'], 'land'), 'n0');
  assert.equal(at('n1', ['ArrowDown'], 'land'), 'doz1');
  assert.equal(at('n1', ['ArrowDown', 'ArrowDown'], 'land'), 'low');
  assert.equal(at('low', ['ArrowRight', 'ArrowRight'], 'land'), 'red');
  assert.equal(at('doz1', ['ArrowRight'], 'land'), 'doz2');
  assert.equal(at('doz3', ['ArrowRight'], 'land'), 'doz3');
});

test('from the foot: 1 2 3 left to right, down the table toward 36, the outside boxes to the left', () => {
  assert.equal(at('n1', ['ArrowRight'], 'port'), 'n2');
  assert.equal(at('n1', ['ArrowRight', 'ArrowRight'], 'port'), 'n3');
  assert.equal(at('n1', ['ArrowDown'], 'port'), 'n4');
  assert.equal(at('n34', ['ArrowDown'], 'port'), 'col1');
  assert.equal(at('n1', ['ArrowUp'], 'port'), 'n0');
  assert.equal(at('n1', ['ArrowLeft'], 'port'), 'doz1');
  assert.equal(at('n1', ['ArrowLeft', 'ArrowLeft'], 'port'), 'low');
  assert.equal(at('low', ['ArrowDown', 'ArrowDown'], 'port'), 'red');
});

test('through a box that spans several places, the way back leads where it began', () => {
  for (const [from, there, back, orient] of [['n3', 'ArrowLeft', 'ArrowRight', 'land'], ['n1', 'ArrowLeft', 'ArrowRight', 'land'], ['n7', 'ArrowDown', 'ArrowUp', 'land'], ['n9', 'ArrowUp', 'ArrowDown', 'port']]) {
    assert.equal(at(from, [there, back], orient), from, `${from} ${there} ${back}`);
  }
});

test('Home and End: the ends of the row', () => {
  assert.equal(spotAt(edge(placeOf('n17'), false)), 'n0');
  assert.equal(spotAt(edge(placeOf('n17'), true)), 'col2');
  assert.equal(spotAt(edge(placeOf('black'), false)), 'low');
  assert.equal(spotAt(edge(placeOf('doz2'), true)), 'doz3');
});

test('a screen reader hears the number, its colour and what it pays', () => {
  assert.equal(speak('n17'), '17, black. Straight up, pays 35 to 1');
  assert.equal(speak('n0'), '0, green. Straight up, pays 35 to 1');
  assert.equal(speak('red'), 'Red. Pays 1 to 1');
  assert.equal(speak('doz2'), '2nd 12. Pays 2 to 1');
  assert.equal(speak('col3'), 'Column 3. Pays 2 to 1');
});

test('with Shift, every spot of the rules is reachable from either view, and every place reached is a real spot', () => {
  for (const orient of ['land', 'port']) {
    const seen = new Set(), places = new Set(), todo = [placeOf('n0')], key = p => `${p.c},${p.r}`;
    while (todo.length) {
      const p = todo.pop(); if (places.has(key(p))) continue; places.add(key(p));
      const id = spotAt(p); assert.ok(SPOTS.has(id), `${orient}: ${key(p)} is ${id}`); seen.add(id);
      for (const k of KEYS) { todo.push(move(p, k, orient)); todo.push(move(p, k, orient, true)); }
    }
    assert.deepEqual([...seen].sort(), [...SPOTS.keys()].sort(), orient);
  }
});

test('every spot of the rules has a place of its own, and the chips go there on the cloth', () => {
  for (const id of SPOTS.keys()) assert.equal(spotAt(placeOf(id)), id, id);
});

test('half steps from the long side: the splits beside a number, the corner between four, the street and six line at the edge, the zero\'s bets', () => {
  const fine = (from, keys) => spotAt(keys.reduce((p, k) => move(p, k, 'land', true), placeOf(from)));
  assert.equal(fine('n17', ['ArrowRight']), 'sp17-20');
  assert.equal(fine('n17', ['ArrowRight', 'ArrowRight']), 'n20');
  assert.equal(fine('n17', ['ArrowUp']), 'sp17-18');
  assert.equal(fine('n17', ['ArrowUp', 'ArrowRight']), 'co17');
  assert.equal(fine('n16', ['ArrowUp', 'ArrowRight']), 'co16');
  assert.equal(fine('n1', ['ArrowDown']), 'st1');
  assert.equal(fine('n1', ['ArrowDown', 'ArrowRight']), 'sl1');
  assert.equal(fine('n1', ['ArrowDown', 'ArrowLeft']), 'ff');
  assert.equal(fine('n2', ['ArrowLeft']), 'sp0-2');
  assert.equal(fine('n2', ['ArrowLeft', 'ArrowUp']), 'tr0-2-3');
  assert.equal(fine('n2', ['ArrowLeft', 'ArrowDown']), 'tr0-1-2');
  assert.equal(fine('n34', ['ArrowRight']), 'col1');
  assert.equal(fine('n1', ['ArrowDown', 'ArrowDown']), 'doz1');
  assert.equal(fine('doz2', ['ArrowUp']), 'st13');
});

test('half steps from the foot follow the screen: across a row to the right, down the table, the outside boxes to the left', () => {
  const fine = (from, keys) => spotAt(keys.reduce((p, k) => move(p, k, 'port', true), placeOf(from)));
  assert.equal(fine('n1', ['ArrowRight']), 'sp1-2');
  assert.equal(fine('n1', ['ArrowDown']), 'sp1-4');
  assert.equal(fine('n1', ['ArrowRight', 'ArrowDown']), 'co1');
  assert.equal(fine('n1', ['ArrowLeft']), 'st1');
  assert.equal(fine('n1', ['ArrowUp']), 'sp0-1');
});

test('a whole step from a line or a crossing lands on a box, never off the layout', () => {
  for (const id of SPOTS.keys()) for (const orient of ['land', 'port']) for (const k of KEYS) {
    const to = spotAt(move(placeOf(id), k, orient));
    assert.ok(SPOTS.has(to), `${id} ${k} (${orient}) -> ${to}`);
    const inside = x => /^(sp|st|sl|co\d|tr|ff)/.test(x);   // (co and a figure: a corner, not a column)
    assert.ok(!inside(to) || inside(id) && to === id, `${id} ${k} (${orient}) lands on ${to}, not a box`);
  }
  assert.equal(spotAt(move(placeOf('ff'), 'ArrowDown')), 'doz1');
  assert.equal(spotAt(move(placeOf('co17'), 'ArrowRight')), 'n21');   // (the other half rounded toward the croupier: 21 of 20 and 21)
});

test('the inside bets are spoken by name, with the numbers they cover', () => {
  assert.equal(speak('sp17-20'), 'Split 17 and 20. Pays 17 to 1');
  assert.equal(speak('co17'), 'Corner 17, 18, 20 and 21. Pays 8 to 1');
  assert.equal(speak('st1'), 'Street 1 to 3. Pays 11 to 1');
  assert.equal(speak('sl1'), 'Six line 1 to 6. Pays 5 to 1');
  assert.equal(speak('tr0-1-2'), 'Trio 0, 1 and 2. Pays 11 to 1');
  assert.equal(speak('ff'), 'First four 0, 1, 2 and 3. Pays 8 to 1');
});

test('in a sentence, a bet is called by what it is: a number, a box, or the kind and its numbers', () => {
  assert.equal(named('n17'), '17');
  assert.equal(named('red'), 'Red');
  assert.equal(named('sp17-20'), 'split 17 and 20');
  assert.equal(named('ff'), 'first four 0, 1, 2 and 3');
  assert.equal(named('sl31'), 'six line 31 to 36');
});
