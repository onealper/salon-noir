// The betting layout for the keyboard (src/roulette/rkeys.mjs): every box printed on the cloth is reachable with the
// arrow keys from either view, each box has one place, moves follow the layout as it lies on the screen, and a screen
// reader hears what each box is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spotAt, placeOf, move, edge, speak } from '../src/roulette/rkeys.mjs';
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
