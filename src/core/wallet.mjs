// One balance for the whole casino. Every game reads and writes it here, so chips won at the
// blackjack table are there at the roulette wheel. Kept in this browser for now; the store is
// the one place to change if the balance moves to the account.
const KEY = 'salonnoir.balance', OLD = 'spader.balance', START = 1000;
const listeners = new Set();
const clean = v => Math.max(0, Math.round(v * 2) / 2);   // never below zero, on the half-chip grid
function read() {
  try {
    const v = localStorage.getItem(KEY) ?? localStorage.getItem(OLD);   // carried over from the Spader days
    const n = v == null ? START : Number(JSON.parse(v));
    return Number.isFinite(n) ? clean(n) : START;   // a corrupted or hand-edited value ('{}', 1e400) starts over, never NaN or endless chips
  } catch { return START; }
}
let balance = read();
const tell = () => { for (const f of listeners) f(balance); };
export const wallet = {
  START,
  get balance() { return balance; },
  set(v) {
    if (!Number.isFinite(v)) return;   // a NaN or ∞ never reaches the store
    v = clean(v); if (v === balance) return;
    balance = v; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
    tell();
  },
  subscribe(f) { listeners.add(f); f(balance); return () => listeners.delete(f); },
};
// The salon open in another tab or window moved the balance: take it up here too, so the two don't
// overwrite each other's chips (the browser sends this event only to the other pages).
globalThis.addEventListener?.('storage', e => { if (e.key !== KEY && e.key !== null) return; const v = read(); if (v !== balance) { balance = v; tell(); } });

// ---- money in flight ---------------------------------------------------------------------------------
// A hand or a spin under way is written down by the table running it, in the same moment as the balance,
// so one the page loses (a reload, a closed tab, a phone dropping it in the background) is settled on the
// next visit instead of taking the stake with it. A page opened meanwhile leaves a live page's record alone:
// the live page holds a lock named for it, or, where the Locks API is missing (plain http on the LAN, as
// friends play on their phones), keeps a pulse beside it, beating every few seconds and let go on pagehide;
// only a record whose page has gone quiet is taken. A take is claimed and read back first, so of two pages
// opening at once one takes it; and a page frozen past its pulse (a phone in a pocket) that wakes to find its
// record taken drops its copy (onLost), so a hand is settled once.
const FLIGHT = 'salonnoir.inflight', PULSE = 'salonnoir.pulse', CLAIM = 'salonnoir.claim', BEAT = 3000, QUIET = 15000, WEEK = 6048e5;
const PAGE = Math.random().toString(36).slice(2, 10), held = new Map(), mine = {}, lost = new Set(), onLost = {};
let turn = 0, beating = null, going = false;   // going: past pagehide, when nothing may beat again (the hidden state that follows included)
const get = k => { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const put = (k, v) => { try { if (Object.keys(v).length) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch { /* storage unavailable */ } };
const flights = () => get(FLIGHT), keep = all => put(FLIGHT, all), pageOf = id => id.split('.')[1];
function lock(id, on) {
  const name = `salonnoir.${id}`, locks = globalThis.navigator?.locks;
  if (!on) { held.get(name)?.(); held.delete(name); return; }
  if (held.has(name) || !locks) return;
  let release = null, done = false; held.set(name, () => { done = true; release?.(); });
  locks.request(name, () => new Promise(r => { release = r; if (done) r(); })).catch(() => {});
}
// this page's pulse: the time of its last beat, gone once the page is (pulses and claims a week old are dropped)
function beat(at = Date.now()) { if (going && at) return; const p = get(PULSE), old = Date.now() - WEEK; for (const k in p) if (p[k] < old) delete p[k]; if (at) p[PAGE] = at; else delete p[PAGE]; put(PULSE, p); }
const pulse = () => { const on = Object.keys(mine).length > 0; if (on && !beating) { beating = setInterval(() => { check(); if (Object.keys(mine).length) beat(); }, BEAT); beating.unref?.(); } else if (!on && beating) { clearInterval(beating); beating = null; beat(0); } };   // no records: no pulse
const left = id => globalThis.navigator?.locks ? navigator.locks.request(`salonnoir.${id}`, { ifAvailable: true }, l => !!l).catch(() => true)
  : Promise.resolve(!(get(PULSE)[pageOf(id)] > Date.now() - QUIET));   // no pulse, or none for a while
async function claim(id) {
  const c = get(CLAIM), old = Date.now() - WEEK; for (const k in c) if (!(c[k]?.[1] > old)) delete c[k]; c[id] = [PAGE, Date.now()]; put(CLAIM, c);
  await new Promise(r => setTimeout(r, 150));   // a page opening at the same moment writes its own claim: the last one written stands
  if (get(CLAIM)[id]?.[0] === PAGE && await left(id)) return true;
  const d = get(CLAIM); if (d[id]?.[0] === PAGE) { delete d[id]; put(CLAIM, d); }   // its page beat again: it is alive, leave it be
  return false;
}
// a record of this page's that another page claimed and removed was settled there
function check() {
  for (const kind of Object.keys(mine)) {
    const id = mine[kind], c = get(CLAIM)[id];
    if (!c || c[0] === PAGE || id in flights()) continue;
    lost.add(kind); delete mine[kind]; lock(id, false); onLost[kind]?.();
  }
  pulse();
}
export const inFlight = {
  // This page's record of its `kind` ('hand', 'spin'), written as it stands; null when it is settled.
  set(kind, rec) {
    check(); if (lost.has(kind)) { if (!rec) lost.delete(kind); return; }   // settled by another page: this copy is not written again; its end clears the way for the next
    let id = mine[kind]; if (!rec && !id) return;
    const all = flights();
    if (!rec) { delete mine[kind]; if (id in all) { delete all[id]; keep(all); } lock(id, false); pulse(); return; }
    id ??= mine[kind] = `${kind}.${PAGE}.${++turn}`;
    beat(); all[id] = rec; keep(all); lock(id, true); pulse();
  },
  // Records of `kind` that other pages left behind, each removed from the store as it is handed over.
  async take(kind) {
    const out = [];
    for (const id of Object.keys(flights())) {
      if (!id.startsWith(`${kind}.`) || pageOf(id) === PAGE || !await left(id) || !await claim(id)) continue;   // its page is alive and will settle it
      const all = flights(); if (!(id in all)) continue;   // settled meanwhile
      out.push(all[id]); delete all[id]; keep(all);
    }
    return out;
  },
  // true once another page took this page's record of `kind` (and settled it): this page must not settle it too
  lost(kind) { check(); return lost.has(kind); },
  onLost(kind, f) { onLost[kind] = f; },
};
const wake = () => { check(); if (Object.keys(mine).length) beat(); };
globalThis.addEventListener?.('pagehide', () => { going = true; beat(0); });   // going: the next page may take the records at once
globalThis.addEventListener?.('pageshow', e => { if (e.persisted) { going = false; wake(); } });   // back from the back-forward cache
globalThis.document?.addEventListener('visibilitychange', wake);
globalThis.addEventListener?.('storage', e => { if (e.key === FLIGHT || e.key === CLAIM) check(); });
