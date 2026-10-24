// The chips a payout contains, and their places in dealer-sized columns. Pure layout: no scene or money changes.
import { breakDown, CHIP_VALUES } from '../core/chips.mjs';

export const CHIP_COLUMN_SIZE = 20, CHIP_GROUP_SIZE = 5;

function money(value, name, positive = false) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value * 2) || value < 0 || (positive && value === 0)) {
    throw new RangeError(`${name} must be a ${positive ? 'positive' : 'nonnegative'} half-chip amount.`);
  }
}

// Value chips use the salon's denominations. A roulette colour keeps its assigned unit, with change for a
// remainder (la partage can return half a unit). Never trim a payout's chips to fit the picture.
export function payoutChips(amount, unit = null) {
  money(amount, 'amount');
  if (unit !== null) money(unit, 'unit', true);
  const largest = unit ?? CHIP_VALUES.at(-1), count = Math.floor(amount / largest);
  if (count > 0xffffffff - CHIP_VALUES.length * 5) throw new RangeError('The payout needs too many chips.');
  if (unit === null) return breakDown(amount);
  return [...Array(count).fill(unit), ...breakDown(amount - count * unit)];
}

// Twenty to a column, with a small break every five. Extra columns alternate right and left of the first.
// The caller supplies its real chip thickness; the defaults are centimetres for the salon's regulation chips.
export function chipOffset(index, { height = .34, spacing = 4.1 } = {}) {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('index must be a nonnegative safe integer.');
  if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(spacing) || spacing <= 0) throw new RangeError('height and spacing must be positive finite lengths.');
  const column = Math.floor(index / CHIP_COLUMN_SIZE), row = index % CHIP_COLUMN_SIZE;
  const x = column ? (column % 2 ? 1 : -1) * Math.ceil(column / 2) * spacing : 0;
  return { x, y: (row + .5) * height + Math.floor(row / CHIP_GROUP_SIZE) * .05, z: 0, column, row };
}
