// One balance for the whole casino. Every game reads and writes it here, so chips won at the
// blackjack table are there at the roulette wheel. Kept in this browser for now; the store is
// the one place to change if the balance moves to the account.
const KEY = 'salonnoir.balance', OLD = 'spader.balance', START = 1000;
const listeners = new Set();
function read() {
  try {
    const v = localStorage.getItem(KEY) ?? localStorage.getItem(OLD);   // carried over from the Spader days
    return v == null ? START : Math.max(0, JSON.parse(v));
  } catch { return START; }
}
let balance = read();
export const wallet = {
  START,
  get balance() { return balance; },
  set(v) {
    v = Math.max(0, Math.round(v * 2) / 2); if (v === balance) return;
    balance = v; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
    for (const f of listeners) f(v);
  },
  reset() { this.set(START); },
  subscribe(f) { listeners.add(f); f(balance); return () => listeners.delete(f); },
};
