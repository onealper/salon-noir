// The salon's chips: one set of values at every table, and how a dealer makes up an amount from them. No DOM.
export const CHIP_VALUES = [1, 5, 10, 25, 50, 100, 500];
// a high roller's rack (blackjack's cheat mode, its main bet up to 10,000): the 10 and the 50 make way for 1K and 5K
export const HIGH_ROLLER_CHIPS = [1, 5, 25, 100, 500, 1000, 5000];
// the chip of a rack nearest a remembered value: itself, else the largest below it, else the smallest
export const nearestChip = (values, v) => values.includes(v) ? v : [...values].reverse().find(x => x <= v) ?? values[0];

// Largest chips first, as a dealer would make up an amount; what no chip covers (half a chip: a 3:2 blackjack on an
// odd bet, la partage on an odd stake) comes last, as itself.
export function breakDown(amount, values = [...CHIP_VALUES].reverse()) {
  const out = []; let left = Math.round(amount * 2) / 2;
  for (const v of values) while (left >= v) { out.push(v); left -= v; }
  if (left > 0) out.push(left);
  return out;
}
