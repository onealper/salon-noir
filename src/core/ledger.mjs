// The salon's book: the last rounds played at any table, what each was and what it came to, and the net of this
// visit. One book for both games, as there is one wallet. The rounds keep across visits (the last 30, in this
// browser); the visit's net lasts as long as the tab, so a reload (or iOS bringing a dropped page back) keeps it.
// Plain data in, plain data out: the tables write their own entries, the settings sheet reads them.
const KEY = 'salonnoir.ledger', VISIT = 'salonnoir.visit', MAX = 30;
const read = (where, k, d) => { try { const v = JSON.parse(where().getItem(k)); return v ?? d; } catch { return d; } };
const write = (where, k, v) => { try { where().setItem(k, JSON.stringify(v)); } catch { /* storage unavailable: the book lives in memory */ } };
const local = () => localStorage, tab = () => sessionStorage;

let rounds = read(local, KEY, []); if (!Array.isArray(rounds)) rounds = [];
let visit = read(tab, VISIT, null); if (!Number.isFinite(visit?.net) || !Number.isFinite(visit?.rounds)) visit = { net: 0, rounds: 0 };
const subs = new Set();
const tell = () => { for (const f of subs) f(); };

export const ledger = {
  // `round`: { game, net, ... } as the table describes it; stamped with the time
  add(round) {
    if (!Number.isFinite(round?.net)) return;
    rounds = [{ at: Date.now(), ...round }, ...rounds].slice(0, MAX); visit = { net: visit.net + round.net, rounds: visit.rounds + 1 };
    write(local, KEY, rounds); write(tab, VISIT, visit); tell();
  },
  get rounds() { return rounds; },
  get visit() { return visit; },
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
};
// another window of the salon wrote a round: its list is ours too (the visit's net stays this tab's own)
globalThis.addEventListener?.('storage', e => { if (e.key !== KEY) return; const v = read(local, KEY, null); if (Array.isArray(v)) { rounds = v; tell(); } });
