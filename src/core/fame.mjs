// The hall of fame: what you have done at the salon's tables, kept for good in this browser (the book of last hands
// only keeps thirty rounds). Every round a table writes in the book (core/ledger.mjs) passes through here too, so a new
// game's rounds count without being asked: the biggest win, the longest run of wins, the highest balance, blackjacks
// and ten-card Charlies, the highest Lightning multiplier paid, the roulette numbers won straight up, and a few quiet
// milestones. A hand played in cheat mode counts for nothing. `tally` and `raise` are plain data in, plain data out.
const KEY = 'salonnoir.fame';

// The milestones, in the order shown. `at`: the count that reaches it.
export const MARKS = [
  { id: 'rounds100', name: 'A hundred rounds', hint: 'Play 100 rounds' },
  { id: 'rounds1000', name: 'A thousand rounds', hint: 'Play 1,000 rounds' },
  { id: 'streak5', name: 'Five wins running', hint: 'Win five rounds in a row' },
  { id: 'streak10', name: 'Ten wins running', hint: 'Win ten rounds in a row' },
  { id: 'win1000', name: 'A thousand in one round', hint: 'Win 1,000 or more in a single round' },
  { id: 'win10000', name: 'Ten thousand in one round', hint: 'Win 10,000 or more in a single round' },
  { id: 'balance10000', name: 'A stack of ten thousand', hint: 'Hold a balance of 10,000' },
  { id: 'balance100000', name: 'A stack of a hundred thousand', hint: 'Hold a balance of 100,000' },
  { id: 'charlie', name: 'Ten-card Charlie', hint: 'Draw ten cards without busting' },
  { id: 'bolt', name: 'Struck by lightning', hint: 'Be paid a Lightning multiplier' },
  { id: 'bolt500', name: 'The big strike', hint: 'Be paid a Lightning multiplier of 500× or more' },
  { id: 'numbers', name: 'Every number', hint: 'Win a straight up on each of the 37 numbers' },
  { id: 'tie', name: 'Égalité', hint: 'Win the Tie at baccarat' },
  { id: 'forty', name: 'The forty', hint: 'Win on 40 at the money wheel' },
  { id: 'tables', name: 'A seat at every table', hint: 'Play a round at each of the salon\'s tables' },
];
// every table of the salon, as a round names it (game:table)
export const TABLES = ['blackjack:classic', 'blackjack:freebet', 'blackjack:lightning', 'roulette:european', 'roulette:lightning', 'roulette:mega', 'baccarat:classic', 'baccarat:nocomm', 'wheel:wheel'];
export const blank = () => ({ v: 1, since: 0, rounds: 0, won: 0, best: null, streak: 0, bestStreak: 0, peak: 0, blackjacks: 0, charlies: 0, bolt: null, numbers: [], ties: 0, pairs: 0, naturals: 0, forties: 0, spun: 0, tables: [], marks: {} });
// what was read from the store, made whole: a field missing, of the wrong kind or hand-edited is as blank
function whole(f) {
  const b = blank(); if (!f || typeof f !== 'object') return b;
  for (const k of ['since', 'rounds', 'won', 'streak', 'bestStreak', 'peak', 'blackjacks', 'charlies', 'ties', 'pairs', 'naturals', 'forties', 'spun']) if (Number.isFinite(f[k]) && f[k] >= 0) b[k] = f[k];
  if (Number.isFinite(f.best?.net) && f.best.net > 0) b.best = { net: f.best.net, game: String(f.best.game ?? ''), table: String(f.best.table ?? ''), at: +f.best.at || 0 };
  if (Number.isFinite(f.bolt?.x) && f.bolt.x > 0) b.bolt = { x: f.bolt.x, game: String(f.bolt.game ?? ''), table: String(f.bolt.table ?? ''), at: +f.bolt.at || 0 };
  if (Array.isArray(f.numbers)) b.numbers = [...new Set(f.numbers.filter(n => Number.isInteger(n) && n >= 0 && n <= 36))].sort((x, y) => x - y);
  if (Array.isArray(f.tables)) b.tables = TABLES.filter(t => f.tables.includes(t));
  if (f.marks && typeof f.marks === 'object') for (const m of MARKS) if (Number.isFinite(f.marks[m.id])) b.marks[m.id] = f.marks[m.id];
  return b;
}
const tableOf = e => `${e.game}:${e.game === 'roulette' ? e.table ?? 'european' : e.game === 'wheel' ? 'wheel' : e.table ?? 'classic'}`;
const mark = (f, id, at, news) => { if (f.marks[id] == null) { f.marks[id] = at; news.push({ kind: 'mark', id, name: MARKS.find(m => m.id === id)?.name ?? id }); } };

// A round written into the record `f` (changed in place). Returns what is new: records broken and milestones reached,
// each { kind: 'record' | 'mark', id, name }.
export function tally(f, e) {
  const news = []; if (!e || !Number.isFinite(e.net) || e.cheat) return news;
  const at = e.at ?? Date.now(); f.since ||= at; f.rounds++;
  if (e.net > 0) { f.won++; f.streak++; if (f.streak > f.bestStreak) { f.bestStreak = f.streak; if (f.streak >= 3) news.push({ kind: 'record', id: 'streak', name: `${f.streak} wins running` }); } }
  else if (e.net < 0) f.streak = 0;
  if (e.net > (f.best?.net ?? 0)) { f.best = { net: e.net, game: e.game, table: tableOf(e).split(':')[1], at }; news.push({ kind: 'record', id: 'best', name: 'Your biggest win' }); }
  const t = tableOf(e); if (TABLES.includes(t) && !f.tables.includes(t)) { f.tables = TABLES.filter(x => x === t || f.tables.includes(x)); }
  let x = 0;   // a Lightning multiplier paid this round
  if (e.game === 'blackjack') {
    for (const h of e.hands ?? []) { if (h.kind === 'blackjack' || h.even) f.blackjacks++; if (h.kind === 'win' && (h.cards?.length ?? 0) >= 10) { f.charlies++; mark(f, 'charlie', at, news); } }
    if (e.bonus?.amount > 0) x = e.bonus.m;
  } else if (e.game === 'roulette') {
    if ((e.straight || e.x) && Number.isInteger(e.n) && !f.numbers.includes(e.n)) { f.numbers = [...f.numbers, e.n].sort((p, q) => p - q); if (f.numbers.length === 37) mark(f, 'numbers', at, news); }
    if (e.x > 0) x = e.x;
  } else if (e.game === 'baccarat') {
    const won = id => (e.wins ?? []).some(w => w.id === id);
    if (won('tie')) { f.ties++; mark(f, 'tie', at, news); }
    f.pairs += (won('ppair') ? 1 : 0) + (won('bpair') ? 1 : 0);
    if (e.natural && (won('player') && e.winner === 'player' || won('banker') && e.winner === 'banker')) f.naturals++;
  } else if (e.game === 'wheel') {
    if (e.net > 0 && e.n === 40) { f.forties++; mark(f, 'forty', at, news); }
    if (e.net > 0 && e.x > (f.spun || 1)) f.spun = e.x;
  }
  if (x > 0) { mark(f, 'bolt', at, news); if (x >= 500) mark(f, 'bolt500', at, news); if (x > (f.bolt?.x ?? 0)) { f.bolt = { x, game: e.game, table: t.split(':')[1], at }; news.push({ kind: 'record', id: 'bolt', name: `Lightning ${x}×` }); } }
  if (f.rounds >= 100) mark(f, 'rounds100', at, news); if (f.rounds >= 1000) mark(f, 'rounds1000', at, news);
  if (f.streak >= 5) mark(f, 'streak5', at, news); if (f.streak >= 10) mark(f, 'streak10', at, news);
  if (e.net >= 1000) mark(f, 'win1000', at, news); if (e.net >= 10000) mark(f, 'win10000', at, news);
  if (f.tables.length === TABLES.length) mark(f, 'tables', at, news);
  return news;
}
// The balance as it stands, for the highest held: returns what is new, as tally does.
export function raise(f, balance, at = Date.now()) {
  const news = []; if (!Number.isFinite(balance) || balance <= f.peak) return news;
  f.peak = balance;
  if (balance >= 10000) mark(f, 'balance10000', at, news); if (balance >= 100000) mark(f, 'balance100000', at, news);
  return news;
}

// ---- the record in this browser ------------------------------------------------------------------------------------
const read = () => { try { return whole(JSON.parse(localStorage.getItem(KEY))); } catch { return blank(); } };
const write = f => { try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* storage unavailable: the record lives in memory */ } };
let state = read(); const subs = new Set(), tell = () => { for (const s of subs) s(); };
// another window may have written since: its record is taken up before this page adds to it, when storage can be read
const fresh = () => { try { const v = localStorage.getItem(KEY); if (v != null) state = whole(JSON.parse(v)); } catch { /* keep what this page has */ } return state; };
export const fame = {
  get state() { return state; },
  add(entry) { const f = fresh(), news = tally(f, entry); if (!entry?.cheat && Number.isFinite(entry?.net)) { write(f); tell(); } return news; },
  // (the balance moves at every chip: only a new high is written)
  balance(v) { if (!(v > state.peak)) return []; const f = fresh(), was = f.peak, news = raise(f, v); if (f.peak !== was) { write(f); tell(); } return news; },
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
};
globalThis.addEventListener?.('storage', e => { if (e.key !== KEY && e.key !== null) return; state = read(); tell(); });
