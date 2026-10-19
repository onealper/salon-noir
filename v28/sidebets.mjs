// Side-bet evaluation. Paytables are the Nevada Gaming Control Board's filing
// for All Bets Blackjack; straight definitions follow New Jersey's 21+3 text
// (ace high or low, K-A-2 is not a straight). Every function returns the single
// best qualifying line — { key, label, pays } where pays is "to 1" — or null.

export const SIDE_BETS = [
  { id: 'lucky', name: 'Lucky Lucky', short: 'Lucky\nLucky', cards: 'Your two cards and the dealer’s up card',
    table: [['Suited 7-7-7', 200], ['Suited 6-7-8', 100], ['7-7-7', 50], ['6-7-8', 25], ['Suited 21', 15], ['Any 21', 3], ['Any 20', 2], ['Any 19', 2]] },
  { id: 'pairs', name: 'Perfect Pairs', short: 'Perfect\nPairs', cards: 'Your first two cards',
    table: [['Perfect pair', 25], ['Coloured pair', 12], ['Red/black pair', 6]] },
  { id: 'top3', name: 'Top 3', short: 'Top 3', cards: 'Your two cards and the dealer’s up card',
    table: [['Suited three of a kind', 270], ['Straight flush', 180], ['Three of a kind', 90]] },
  { id: 'p213', name: '21+3', short: '21+3', cards: 'Your two cards and the dealer’s up card',
    table: [['Suited three of a kind', 100], ['Straight flush', 40], ['Three of a kind', 30], ['Straight', 10], ['Flush', 5]] },
  { id: 'buster', name: 'Buster Blackjack', short: 'Buster', cards: 'The dealer’s final hand',
    table: [['Bust with 8+ cards and your blackjack', 2000], ['Bust with 7 cards and your blackjack', 800], ['Bust with 8+ cards', 250], ['Bust with 7 cards', 50], ['Bust with 6 cards', 18], ['Bust with 5 cards', 4], ['Bust with 3 or 4 cards', 2]] },
  { id: 'dpairs', name: 'Dealer Pairs', short: 'Dealer\nPairs', cards: 'The dealer’s first two cards',
    table: [['Perfect pair', 25], ['Coloured pair', 12], ['Red/black pair', 6]] },
];

// On the Free Bet table the last side-bet slot holds Push 22 instead of Dealer Pairs: the one bet
// that wins on the dealer's 22, the total that pushes every other hand there.
export const PUSH22 = { id: 'push22', slot: 'dpairs', name: 'Push 22', short: 'Push\n22', cards: 'The dealer’s final hand', table: [['Dealer ends on 22', 11]] };
export const push22 = dealerTotal => dealerTotal === 22 ? { key: 'push22', label: 'Dealer 22', pays: 11 } : null;

const RED = new Set(['♥', '♦']);
const rankValue = r => r === 'A' ? 1 : r === 'J' ? 11 : r === 'Q' ? 12 : r === 'K' ? 13 : Number(r);

export function pairOf(a, b) {
  if (!a || !b || a.rank !== b.rank) return null;
  if (a.suit === b.suit) return { key: 'perfect', label: 'Perfect pair', pays: 25 };
  if (RED.has(a.suit) === RED.has(b.suit)) return { key: 'coloured', label: 'Coloured pair', pays: 12 };
  return { key: 'mixed', label: 'Red/black pair', pays: 6 };
}

// Three-card poker features, as used by 21+3 and Top 3.
export function threeCard(cards) {
  const suited = cards.every(c => c.suit === cards[0].suit);
  const trips = cards.every(c => c.rank === cards[0].rank);
  const v = cards.map(c => rankValue(c.rank)).sort((x, y) => x - y);
  const consecutive = s => s[1] === s[0] + 1 && s[2] === s[1] + 1;
  // Ace low (A-2-3) or ace high (Q-K-A). K-A-2 wraps and does not count.
  const straight = !trips && (consecutive(v) || (v[0] === 1 && consecutive([v[1], v[2], 14].sort((x, y) => x - y))));
  return { suited, trips, straight };
}

export function twentyOnePlus3(p1, p2, up) {
  const h = threeCard([p1, p2, up]);
  if (h.trips && h.suited) return { key: 'suitedTrips', label: 'Suited three of a kind', pays: 100 };
  if (h.straight && h.suited) return { key: 'straightFlush', label: 'Straight flush', pays: 40 };
  if (h.trips) return { key: 'trips', label: 'Three of a kind', pays: 30 };
  if (h.straight) return { key: 'straight', label: 'Straight', pays: 10 };
  if (h.suited) return { key: 'flush', label: 'Flush', pays: 5 };
  return null;
}

export function top3(p1, p2, up) {
  const h = threeCard([p1, p2, up]);
  if (h.trips && h.suited) return { key: 'suitedTrips', label: 'Suited three of a kind', pays: 270 };
  if (h.straight && h.suited) return { key: 'straightFlush', label: 'Straight flush', pays: 180 };
  if (h.trips) return { key: 'trips', label: 'Three of a kind', pays: 90 };
  return null;
}

// Best blackjack total of up to three cards, aces 1 or 11; null when over 21.
function bestTotal(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { if (c.rank === 'A') { aces++; t += 1; } else t += ['J', 'Q', 'K'].includes(c.rank) ? 10 : Number(c.rank); }
  if (aces && t + 10 <= 21) t += 10;
  return t <= 21 ? t : null;
}

export function luckyLucky(p1, p2, up) {
  const cards = [p1, p2, up], suited = cards.every(c => c.suit === p1.suit);
  const ranks = cards.map(c => c.rank).sort().join(',');
  const sevens = ranks === '7,7,7', sixSevenEight = ranks === '6,7,8';
  if (sevens && suited) return { key: 'suited777', label: 'Suited 7-7-7', pays: 200 };
  if (sixSevenEight && suited) return { key: 'suited678', label: 'Suited 6-7-8', pays: 100 };
  if (sevens) return { key: '777', label: '7-7-7', pays: 50 };
  if (sixSevenEight) return { key: '678', label: '6-7-8', pays: 25 };
  const t = bestTotal(cards);
  if (t === 21) return suited ? { key: 'suited21', label: 'Suited 21', pays: 15 } : { key: '21', label: 'Any 21', pays: 3 };
  if (t === 20) return { key: '20', label: 'Any 20', pays: 2 };
  if (t === 19) return { key: '19', label: 'Any 19', pays: 2 };
  return null;
}

// Dealer busts: pays by the number of cards in the busted hand.
export function buster(dealerCards, dealerTotal, playerBlackjack) {
  if (dealerTotal <= 21) return null;
  const n = dealerCards.length;
  if (n >= 8) return playerBlackjack ? { key: 'bust8bj', label: 'Bust with 8+ cards and your blackjack', pays: 2000 } : { key: 'bust8', label: 'Bust with 8+ cards', pays: 250 };
  if (n === 7) return playerBlackjack ? { key: 'bust7bj', label: 'Bust with 7 cards and your blackjack', pays: 800 } : { key: 'bust7', label: 'Bust with 7 cards', pays: 50 };
  if (n === 6) return { key: 'bust6', label: 'Bust with 6 cards', pays: 18 };
  if (n === 5) return { key: 'bust5', label: 'Bust with 5 cards', pays: 4 };
  return { key: 'bust34', label: 'Bust with 3 or 4 cards', pays: 2 };
}
