import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHIP_VALUES } from '../src/core/chips.mjs';
import { SPOTS } from '../src/roulette/rules.mjs';
import { CHIP_COLUMN_SIZE, CHIP_GROUP_SIZE, payoutChips, chipOffset } from '../src/roulette/chip-stacks.mjs';

const sum = values => values.reduce((total, value) => total + value, 0);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('physical payouts preserve the full amount, including the chips previously lost to the display cap', () => {
  for (const amount of [3465, 2999, 3500, 3000, 35000, 1499.5, .5, 0]) {
    const chips = payoutChips(amount);
    assert.equal(sum(chips), amount);
    assert.ok(chips.every(v => v === .5 || CHIP_VALUES.includes(v)), `${amount}: real value chips`);
  }
  assert.ok(payoutChips(3465).length > 12, 'the 99-chip straight-up win needs all thirteen chips');
  assert.ok(payoutChips(2999).length > 12, 'the even-money win keeps its small change');
  // Every legal whole-chip stake on each bet kind can be paid without losing a chip from the picture.
  const kinds = new Map([...SPOTS.values()].map(s => [s.kind, s]));
  for (const s of kinds.values()) for (let stake = 1; stake <= s.max; stake++) {
    assert.equal(sum(payoutChips(stake * s.pays)), stake * s.pays, `${s.kind}, stake ${stake}`);
  }
});

test('roulette colour chips keep their assigned unit and make exact change for half-unit returns', () => {
  for (const unit of [5, 10, 25]) {
    const chips = payoutChips(unit * 35, unit);
    assert.equal(chips.length, 35);
    assert.ok(chips.every(v => v === unit));
    for (const stake of [unit, unit * 3, unit * 11]) {
      const back = stake / 2, change = payoutChips(back, unit);
      assert.equal(sum(change), back);
      assert.equal(change.filter(v => v === unit).length, Math.floor(back / unit));
      assert.ok(change.every(v => v === unit || v === .5 || CHIP_VALUES.includes(v)));
    }
  }
  assert.deepEqual(payoutChips(2.5, 5), [1, 1, .5]);
  assert.deepEqual(payoutChips(7.5, 5), [5, 1, 1, .5]);
  assert.deepEqual(payoutChips(0, 25), []);
  const first = payoutChips(10, 5); first.pop();
  assert.deepEqual(payoutChips(10, 5), [5, 5], 'calls return independent chip lists');
});

test('chips form columns of twenty, cut into groups of five, without overlapping neighbouring columns', () => {
  assert.equal(CHIP_COLUMN_SIZE, 20); assert.equal(CHIP_GROUP_SIZE, 5);
  const places = Array.from({ length: 105 }, (_, i) => chipOffset(i)), columns = new Map();
  for (const p of places) {
    assert.ok(p.row >= 0 && p.row < 20);
    const list = columns.get(p.column) ?? []; list.push(p); columns.set(p.column, list);
    assert.equal(p.z, 0);
  }
  assert.deepEqual([...columns.values()].map(ps => ps.length), [20, 20, 20, 20, 20, 5]);
  [...columns.values()].forEach((ps, i) => near(ps[0].x, [0, 4.1, -4.1, 8.2, -8.2, 12.3][i]));
  for (const ps of columns.values()) for (let row = 1; row < ps.length; row++) {
    near(ps[row].y - ps[row - 1].y, .34 + (row % 5 === 0 ? .05 : 0));
  }
  near(chipOffset(19).y, 19.5 * .34 + .15);
  near(chipOffset(20).y, .17);
  const custom = chipOffset(25, { height: .333, spacing: 5 });
  assert.equal(custom.column, 1); assert.equal(custom.row, 5); assert.equal(custom.x, 5);
  near(custom.y, 5.5 * .333 + .05);
});

test('invalid chip amounts, units and layout indices fail before constructing a payout', () => {
  for (const bad of [-1, .25, NaN, Infinity, '5', null, undefined, Number.MAX_SAFE_INTEGER]) assert.throws(() => payoutChips(bad), RangeError);
  for (const bad of [0, -5, .25, NaN, Infinity, '5']) assert.throws(() => payoutChips(10, bad), RangeError);
  for (const bad of [-1, .5, NaN, Infinity, '0', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => chipOffset(bad), RangeError);
  for (const options of [{ height: 0 }, { height: Infinity }, { spacing: -1 }, { spacing: NaN }]) assert.throws(() => chipOffset(0, options), RangeError);
});
