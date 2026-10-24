import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reserveLayout } from '../src/roulette/reserve-layout.mjs';

test('the full reserve fits its seat, stays clear of the cloth and uses twenty-chip columns', () => {
  for (const [orient, span] of [['land', 28], ['port', 12]]) {
    for (const count of [0, 1, 19, 20, 21, 200, 207, 1000, 2401]) {
      const bank = reserveLayout(count, { orient, center: 42, edge: 60, span });
      assert.equal(bank.positions.length, count);
      if (!count) { assert.equal(bank.footprint, null); continue; }
      const f = bank.footprint, columns = new Map();
      for (const p of bank.positions) {
        assert.ok(p.x - 1.95 >= f.x0 && p.x + 1.95 <= f.x1);
        assert.ok(p.z - 1.95 >= f.z0 && p.z + 1.95 <= f.z1);
        assert.ok(p.y - .17 >= f.y0 && p.y + .17 <= f.y1 + 1e-12);
        assert.ok((orient === 'land' ? p.z : p.x) - 1.95 > 60, 'the reserve never spreads back onto the betting cloth');
        if (!columns.has(p.column)) columns.set(p.column, []);
        columns.get(p.column).push(p);
      }
      for (const stack of columns.values()) {
        assert.ok(stack.length <= 20);
        assert.ok(stack.every(p => p.x === stack[0].x && p.z === stack[0].z));
      }
      const stack = columns.get(0);
      if (stack.length > 5) assert.ok(Math.abs(stack[5].y - stack[4].y - .39) < 1e-12, 'a visible break every five chips');
      const width = orient === 'land' ? f.x1 - f.x0 : f.z1 - f.z0;
      assert.ok(width <= span, 'banks at neighbouring seats cannot overlap sideways');
    }
  }
});

test('normal and cash-exchanged banks fit the padded rail on desktop and phone', () => {
  for (const [orient, span] of [['land', 28], ['port', 12]]) {
    const bank = reserveLayout(207, { orient, span });
    const f = bank.footprint, depth = orient === 'land' ? f.z1 - f.z0 : f.x1 - f.x0;
    assert.ok(depth <= 26, `${orient}: the reserve's tray needs ${depth} cm`);
    assert.equal(bank.columns, 11);
  }
});

test('empty and invalid reserve requests cannot leave phantom chips or nonfinite positions', () => {
  assert.deepEqual(reserveLayout(0).positions, []);
  for (const n of [-1, .5, NaN, Infinity]) assert.throws(() => reserveLayout(n), RangeError);
  for (const options of [{ orient: 'other' }, { span: 0 }, { radius: -1 }, { center: NaN }]) assert.throws(() => reserveLayout(1, options), RangeError);
});
