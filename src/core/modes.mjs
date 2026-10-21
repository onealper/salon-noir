// The blackjack tables in the salon: the same shoe and dealers, three sets of rules.
// Each table prints its own lines on the felt and brings its own rules card.
export const MODES = {
  classic: {
    id: 'classic', name: 'Classic', title: 'BLACKJACK',
    felt: ['BLACKJACK PAYS 3 TO 2', 'DEALER MUST DRAW TO 16 AND STAND ON ALL 17s', 'INSURANCE PAYS 2 TO 1'],
    rules: [],
  },
  freebet: {
    id: 'freebet', name: 'Free Bet', title: 'FREE BET BLACKJACK',
    felt: ['BLACKJACK PAYS 3 TO 2', 'FREE DOUBLES ON HARD 9, 10, 11 · FREE SPLITS ON ALL PAIRS BUT TENS', 'DEALER 22 PUSHES'],
    rules: [
      'Free doubles: on a hard 9, 10 or 11 in your first two cards the house puts up the double as a free-bet marker. It wins even money with your hand and costs nothing if the hand loses.',
      'Free splits: every pair except tens and face cards splits for free, the new hand played on a marker. Pairs split again the same way, up to four hands; split aces take one card each, and another ace can be split again.',
      'Other doubles and splits are paid as usual: tens split (and resplit) for your own stake.',
      'When the dealer ends on 22, every hand still in play pushes. Blackjacks are paid 3 to 2 before that.',
      'Push 22 takes the Dealer Pairs spot: it pays 11 to 1 when the dealer ends on 22.',
      'Played well (every free double, every free split but fives, and fewer stands on a stiff, since a dealer 22 is no bust here) the house edge is about 0.7%.',
    ],
  },
  lightning: {
    id: 'lightning', name: 'Lightning', title: 'LIGHTNING BLACKJACK',
    felt: ['BLACKJACK PAYS 3 TO 2', 'LIGHTNING FEE 100% OF THE BET · MULTIPLIERS UP TO 25x ON YOUR NEXT WIN', 'INSURANCE PAYS 2 TO 1'],
    rules: [
      'Every hand costs a Lightning fee equal to your main bet, taken when the cards are dealt. Side bets, doubles and splits carry no fee.',
      'With the deal, lightning strikes a multiplier onto each final total: 17 or less (2–3×), 18 (2–4×), 19 (2–5×), 20 (2–6×), 21 (3–10×) and blackjack (5–25×).',
      'Win a hand and the multiplier on its total is yours for the next hand. With split hands, the best one counts.',
      'Win the next hand and your fee from the hand that earned it is paid back times the multiplier, on top of your usual winnings. A push keeps it waiting; a loss ends it.',
      'Even money counts as a win, so a multiplier you carry pays on it; it gives your blackjack up, so it earns no new one.',
      'The main bet pays as at the Classic table. Over time the fee returns about 99.5%.',
    ],
  },
};
