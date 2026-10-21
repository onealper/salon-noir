// The salon's chips: one set of values at every table, and how a dealer makes up an amount from them. No DOM.
export const CHIP_VALUES = [1, 5, 10, 25, 50, 100, 500];

// Largest chips first, as a dealer would make up an amount; what no chip covers (half a chip: a 3:2 blackjack on an
// odd bet, la partage on an odd stake) comes last, as itself.
export function breakDown(amount, values = [...CHIP_VALUES].reverse()) {
  const out = []; let left = Math.round(amount * 2) / 2;
  for (const v of values) while (left >= v) { out.push(v); left -= v; }
  if (left > 0) out.push(left);
  return out;
}
