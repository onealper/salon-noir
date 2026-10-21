// What a blackjack hand leaves behind: its entry in the book of last hands (core/ledger.mjs), the words for a side
// bet that lost, and the notice for a hand a closed page left unfinished. No DOM: the salon (app.mjs) plays such a hand
// out as it opens, whichever room you go to, and the table (controller.mjs) books each hand it pays.
import { total, playOut } from '../engine.mjs';
import { fmt, signed } from '../core/format.mjs';

export function sideLine(r, t) {
  const p = t.hands[0]?.cards ?? [], three = [p[0], p[1], t.dealer[0]].filter(Boolean), show = cs => cs.map(cardText).join(' ');
  if (r.line === 'Dealer did not bust') return `Dealer stood on ${total(t.dealer).value}`;
  if (r.payout > 0 || r.line !== 'No win') return r.line;
  if (r.spot === 'pairs') return `No pair · ${show(p.slice(0, 2))}`;
  if (r.spot === 'dpairs') return `No pair · ${show(t.dealer.slice(0, 2))}`;
  if (r.spot === 'lucky') return `${total(three).value} · ${show(three)}`;
  if (r.spot === 'p213' || r.spot === 'top3') return `No hand · ${show(three)}`;
  return r.line;
}
export function cardText(c) { return `${c.rank}${c.suit}`; }

// A hand is written down whole as it is paid: the cards and totals, how each hand of yours ended (up to four after
// resplits), every side bet with what it saw, the Lightning fee and bonus, and the net.
export function handEntry(t, r) {
  return { game: 'blackjack', table: t.mode, net: r.net, dealer: t.dealer.map(cardText), dealerTotal: r.dealerTotal, dealerBJ: !!r.dealerBlackjack,
    hands: r.hands.map(h => ({ cards: (t.hands[h.index]?.cards ?? []).map(cardText), total: h.total, kind: h.kind, even: !!h.evenMoney, net: h.net })),
    sides: r.sides.map(s => ({ name: s.name, line: s.payout > 0 ? `${s.line} · ${s.pays}:1` : s.seen ?? sideLine(s, t), net: s.net })),
    fee: r.fee || 0, bonus: r.bonus ? { m: r.bonus.m, amount: r.bonus.amount } : null, earned: r.earned?.m ?? 0 };
}

// A hand this browser lost mid-play (a reload, a closed tab, a phone dropping the page in the background) is
// finished as live tables finish a dropped seat: you stand, insurance is declined, the dealer plays out and the
// hand is paid (engine.mjs playOut). So leaving can't undo a bad hand, and a dropped page never eats a good one.
export function playOutHand(rec, random) {
  const done = playOut(rec, random), r = done?.result; if (!done) return null;
  return { ...done, text: r ? `Your unfinished hand was played out for you (stand, no insurance): ${r.hands.map(h => h.evenMoney ? 'even money on your blackjack' : h.kind === 'blackjack' ? 'blackjack' : h.total).join(' and ')} against the dealer's ${r.dealerBlackjack ? 'blackjack' : r.dealerTotal}, ${r.net ? signed(r.net) : 'even'}.`
    : done.back ? `Your last hand was voided: ${fmt(done.back)} returned to your balance.` : '' };   // one that couldn't be played out is voided like a misdeal
}
