// Lightning roulette: after bets close, lightning strikes some of the 37 numbers and gives each a multiplier; a
// straight-up on a struck number that wins is paid the multiplier (to 1) in place of the table's straight-up price,
// which is cut to pay for it. Every other bet pays as at the European table, with no la partage. No DOM.
//
// After Evolution's Lightning Roulette (1 to 5 numbers, 50x to 500x, straight-ups otherwise 29:1) and XXXtreme
// Lightning Roulette, our Mega Lightning (chain lightning strikes more numbers, up to 10; a double strike lifts a
// struck number to between 600x and 2,000x; straight-ups otherwise 19:1). Neither house publishes how often each
// multiplier comes, only the return: about 97.1% on a straight-up, 97.3% on everything else. The tables below are
// ours, set to that return; `expected` works it out exactly and the tests hold it there.

export const MODES = {
  lightning: {
    name: 'Lightning', straight: 29,
    count: [[1, 15], [2, 31], [3, 31], [4, 16], [5, 7]],                       // how many numbers are struck, by weight
    mults: [[50, 139], [100, 124], [150, 21], [200, 21], [250, 5], [300, 4], [400, 3], [500, 12]],
    chain: null, double: null,
  },
  mega: {
    name: 'Mega Lightning', straight: 19,
    count: [[1, 10], [2, 26], [3, 32], [4, 20], [5, 12]],
    mults: [[50, 120], [100, 118], [150, 30], [200, 28], [250, 12], [300, 10], [350, 6], [400, 6], [450, 4], [500, 14]],
    chain: { p: .42, more: [[1, 30], [2, 28], [3, 20], [4, 12], [5, 10]] },   // in some rounds more numbers are struck, up to 10
    double: { p: .165, mults: [[600, 34], [700, 22], [800, 15], [1000, 14], [1500, 9], [2000, 6]] },   // and one struck number is struck again
  },
};
export const MAX_STRUCK = 10;

const total = w => w.reduce((a, [, c]) => a + c, 0);
const pick = (w, random) => { let r = random() * total(w); for (const [v, c] of w) { if ((r -= c) < 0) return v; } return w[w.length - 1][0]; };
const mean = w => w.reduce((a, [v, c]) => a + v * c, 0) / total(w);

// One round's lightning: the struck numbers in the order they fall, each { n, x } (x: the multiplier), the chained
// ones marked `chain`, the one struck twice marked `double` with the multiplier it had before (`was`).
export function strike(mode = 'lightning', random = Math.random) {
  const m = MODES[mode], free = Array.from({ length: 37 }, (_, i) => i), out = [];
  const take = chain => { const n = free.splice(Math.floor(random() * free.length), 1)[0]; out.push({ n, x: pick(m.mults, random), ...(chain ? { chain: true } : {}) }); };
  const k = pick(m.count, random); for (let i = 0; i < k; i++) take(false);
  if (m.chain && random() < m.chain.p) { const c = Math.min(pick(m.chain.more, random), MAX_STRUCK - out.length); for (let i = 0; i < c; i++) take(true); }
  if (m.double && random() < m.double.p) { const s = out[Math.floor(random() * out.length)]; s.was = s.x; s.x = pick(m.double.mults, random); s.double = true; }
  return out;
}
// The struck numbers as a Map number → multiplier (what a table settles with).
export const multipliers = strikes => new Map((strikes ?? []).map(s => [s.n, s.x]));

// The exact return of a straight-up at a mode (any number: the ball and the lightning don't know each other). For a
// round with K struck numbers whose multipliers sum to S, a chip on every number returns 30·(37 − K) + (S + K) of
// 37·37 staked over the 37 equally likely results; so the return is (P·(37 − E[K]) + E[S] + E[K]) / 37², P the
// straight-up price plus the stake.
export function expected(mode = 'lightning') {
  const m = MODES[mode], k0 = mean(m.count), x0 = mean(m.mults);
  const kc = m.chain ? m.chain.p * chainMean(m) : 0;                       // numbers chain lightning adds, on average
  const K = k0 + kc, lift = m.double ? m.double.p * (mean(m.double.mults) - x0) : 0;   // (the double strike replaces a multiplier: a struck number's own is the plain mean)
  const S = K * x0 + lift, P = m.straight + 1;
  return { K, S, straight: (P * (37 - K) + S + K) / (37 * 37), others: 36 / 37, max: Math.max(...(m.double ?? m).mults.map(([v]) => v)) };
}
// What chain lightning adds, on average, given it never takes the count past MAX_STRUCK.
function chainMean(m) {
  let s = 0; const tc = total(m.count), tm = total(m.chain.more);
  for (const [k, ck] of m.count) for (const [c, cc] of m.chain.more) s += ck / tc * cc / tm * Math.min(c, MAX_STRUCK - k);
  return s;
}
