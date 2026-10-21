// Shared by the tests (no tests in here): cards from short names, a seeded random, and stand-ins for the
// browser's storage, so the pure modules and the wallet run under plain `node --test`.
export const C = s => { const m = s.match(/^(10|[2-9AJQK])([shdc])$/); return { rank: m[1], suit: { s: '♠', h: '♥', d: '♦', c: '♣' }[m[2]] }; };
export const H = str => str.trim().split(/\s+/).map(C);
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], SUITS = ['♠', '♥', '♦', '♣'];
export const DECK = SUITS.flatMap(suit => RANKS.map(rank => ({ rank, suit })));
// mulberry32, as the game's ?seed shoe uses
export const seeded = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export class MemoryStorage {
  #m = new Map();
  get length() { return this.#m.size; }
  key(i) { return [...this.#m.keys()][i] ?? null; }
  getItem(k) { return this.#m.has(k) ? this.#m.get(k) : null; }
  setItem(k, v) { this.#m.set(k, String(v)); }
  removeItem(k) { this.#m.delete(k); }
  clear() { this.#m.clear(); }
}
// a fresh localStorage and sessionStorage for the modules imported next
export function freshStorage(seed = {}) {
  globalThis.localStorage = new MemoryStorage(); globalThis.sessionStorage = new MemoryStorage();
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  return localStorage;
}
// a module imported anew (its own state), as a second page of the salon would have it
let n = 0;
export const fresh = path => import(`${new URL(path, import.meta.url).href}?page=${++n}`);
