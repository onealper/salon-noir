// The one wallet, the money in flight (a hand or spin a page was running when it went), and the book of last
// rounds, against a stand-in localStorage. Each `fresh` import is a page of the salon with its own state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshStorage, fresh } from './helpers.mjs';

const WALLET = '../src/core/wallet.mjs', LEDGER = '../src/core/ledger.mjs';
const json = k => JSON.parse(localStorage.getItem(k));
const quiet = (ms = 20000) => { const p = json('salonnoir.pulse') ?? {}; for (const k in p) p[k] -= ms; localStorage.setItem('salonnoir.pulse', JSON.stringify(p)); };   // as if frozen that long

test('the balance: 1,000 to start, carried over from the Spader key, on the half-chip grid, never NaN or negative', async () => {
  freshStorage(); assert.equal((await fresh(WALLET)).wallet.balance, 1000);
  freshStorage({ 'spader.balance': '250' }); assert.equal((await fresh(WALLET)).wallet.balance, 250);
  freshStorage({ 'salonnoir.balance': '12.3', 'spader.balance': '250' }); assert.equal((await fresh(WALLET)).wallet.balance, 12.5);
  for (const bad of ['{', '{}', '1e400', '"abc"', '[1,2]']) { freshStorage({ 'salonnoir.balance': bad }); assert.equal((await fresh(WALLET)).wallet.balance, 1000, bad); }
  freshStorage({ 'salonnoir.balance': '-5' }); assert.equal((await fresh(WALLET)).wallet.balance, 0);
  freshStorage(); const { wallet } = await fresh(WALLET), seen = []; wallet.subscribe(v => seen.push(v));
  wallet.set(NaN); wallet.set(Infinity); wallet.set(10.26); wallet.set(10.5); wallet.set(-3);
  assert.deepEqual(seen, [1000, 10.5, 0], 'told once per change'); assert.equal(localStorage.getItem('salonnoir.balance'), '0');
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  const blocked = (await fresh(WALLET)).wallet; assert.equal(blocked.balance, 1000); blocked.set(20); assert.equal(blocked.balance, 20, 'storage blocked: the balance lives in memory');
});

test('another window moving the balance is taken up here (the storage event)', async () => {
  freshStorage(); const on = {}; globalThis.addEventListener = (type, f) => { (on[type] ??= []).push(f); }; const tell = e => on.storage.forEach(f => f(e));
  try {
    const { wallet } = await fresh(WALLET), seen = []; wallet.subscribe(v => seen.push(v));
    localStorage.setItem('salonnoir.balance', '640'); tell({ key: 'salonnoir.balance' }); tell({ key: 'spader.sound' });
    assert.equal(wallet.balance, 640); assert.deepEqual(seen, [1000, 640]);
  } finally { delete globalThis.addEventListener; }
});

test('two windows settling before either hears the other: both changes count, and a reset is a fresh stack', async () => {
  freshStorage(); const A = (await fresh(WALLET)).wallet, B = (await fresh(WALLET)).wallet;
  B.set(B.balance + 100); A.set(A.balance + 50);   // A's storage event from B is still on the way
  assert.equal(A.balance, 1150); assert.equal(localStorage.getItem('salonnoir.balance'), '1150', 'not 1050: B\'s win kept');
  A.set(A.balance - 30); assert.equal(A.balance, 1120, 'and no change counted twice');
  B.set(B.balance); assert.equal(localStorage.getItem('salonnoir.balance'), '1120', 'a stale save adds nothing');
  B.reset(); assert.equal(B.balance, 1000); assert.equal(localStorage.getItem('salonnoir.balance'), '1000');
});

test('money in flight: a live page keeps its hand; a quiet one is taken once, by one of two pages opening at once', async () => {
  freshStorage(); const A = (await fresh(WALLET)).inFlight, B = (await fresh(WALLET)).inFlight, C = (await fresh(WALLET)).inFlight;
  let told = 0; A.onLost('hand', () => told++);
  A.set('hand', { n: 1 }); A.set('hand', { n: 2 }); assert.equal(Object.keys(json('salonnoir.inflight')).length, 1, 'one record per page and kind, as it stands');
  assert.deepEqual(await B.take('hand'), [], 'its page is beating: left alone'); assert.deepEqual(await B.take('spin'), []);
  quiet();   // A's page froze in the background (no Locks API: plain http on the LAN)
  const [b, c] = await Promise.all([B.take('hand'), C.take('hand')]);
  assert.deepEqual([...b, ...c], [{ n: 2 }], 'taken once'); assert.equal(localStorage.getItem('salonnoir.inflight'), null);
  assert.equal(A.lost('hand'), true, 'A wakes to find it settled elsewhere'); assert.equal(told, 1);
  A.set('hand', { n: 3 }); assert.equal(localStorage.getItem('salonnoir.inflight'), null, 'and never writes its copy again');
  A.set('hand', null); assert.equal(A.lost('hand'), false); A.set('hand', { n: 4 }); assert.equal(Object.keys(json('salonnoir.inflight')).length, 1, 'its next round is written as usual');
  A.set('hand', null); assert.equal(localStorage.getItem('salonnoir.inflight'), null, 'settled: the record goes');
});

test('money in flight: each record is settled as it leaves the store, never neither stored nor paid; a live one is held', async () => {
  freshStorage({ 'salonnoir.inflight': JSON.stringify({ 'hand.deadA.1': { n: 1 }, 'hand.deadB.1': { n: 2 } }) });
  const B = (await fresh(WALLET)).inFlight, paid = [], gap = [];
  const watch = setInterval(() => { const stored = Object.values(json('salonnoir.inflight') ?? {}); for (const n of [1, 2]) if (!paid.includes(n) && !stored.some(r => r.n === n)) gap.push(n); }, 5);
  try { await B.take('hand', r => paid.push(r.n)); } finally { clearInterval(watch); }
  assert.deepEqual(paid, [1, 2]); assert.deepEqual(gap, [], 'a reload at any moment of the take loses nothing'); assert.equal(localStorage.getItem('salonnoir.inflight'), null);
  const A = (await fresh(WALLET)).inFlight; A.set('hand', { n: 3 });
  assert.equal(await B.held('hand'), true, 'another page is mid-hand'); assert.equal(await B.held('spin'), false); assert.equal(await A.held('hand'), false, 'its own hand is not another\'s');
  quiet(); assert.equal(await B.held('hand'), false, 'a page gone quiet holds nothing: its hand is played out on the next visit');
});

test('money in flight: a page that beats again while another claims its record keeps it', async () => {
  freshStorage(); const A = (await fresh(WALLET)).inFlight, B = (await fresh(WALLET)).inFlight;
  A.set('spin', { n: 7 }); quiet();
  const taking = B.take('spin'); await new Promise(r => setTimeout(r, 20)); A.set('spin', { n: 8 });   // A wakes within the claim
  assert.deepEqual(await taking, []); assert.equal(A.lost('spin'), false); assert.deepEqual(Object.values(json('salonnoir.inflight')), [{ n: 8 }]);
  assert.deepEqual(json('salonnoir.claim'), null, 'the claim is withdrawn');
});

test('money in flight: a page going (pagehide) lets its records go at once; one back from the cache finds them taken', async () => {
  freshStorage(); let cur = null; globalThis.addEventListener = (type, f) => { (cur[type] ??= []).push(f); };
  const page = async () => { cur = {}; const m = await fresh(WALLET); return { inFlight: m.inFlight, on: cur }; };   // each page's own listeners
  try {
    const A = await page(), B = await page();
    A.inFlight.set('hand', { n: 1 }); assert.deepEqual(await B.inFlight.take('hand'), []);
    A.on.pagehide.forEach(f => f({ persisted: true }));
    assert.deepEqual(await B.inFlight.take('hand'), [{ n: 1 }], 'gone: taken without waiting for the pulse to fade');
    A.on.pageshow.forEach(f => f({ persisted: true })); assert.equal(A.inFlight.lost('hand'), true, 'back from the back-forward cache: settled elsewhere');
  } finally { delete globalThis.addEventListener; }
  freshStorage({ 'salonnoir.inflight': JSON.stringify({ 'hand.oldpage1': { n: 9 }, 'spin.oldpage1': { n: 3 } }) }); const B = (await fresh(WALLET)).inFlight;
  assert.deepEqual(await B.take('hand'), [{ n: 9 }], 'a record written before pulses existed'); assert.deepEqual(Object.keys(json('salonnoir.inflight')), ['spin.oldpage1']);
});

test('the book of last rounds: newest first, the last 30, this visit\'s net, corrupt storage starts empty', async () => {
  freshStorage(); const { ledger } = await fresh(LEDGER); let told = 0; ledger.subscribe(() => told++);
  assert.deepEqual(ledger.rounds, []); assert.deepEqual(ledger.visit, { net: 0, rounds: 0 });
  ledger.add({ game: 'blackjack', net: 15 }); ledger.add({ game: 'roulette', net: -5 }); ledger.add({ game: 'roulette', net: NaN }); ledger.add(null);
  assert.equal(told, 2); assert.deepEqual(ledger.rounds.map(r => r.net), [-5, 15]); assert.ok(Number.isFinite(ledger.rounds[0].at)); assert.deepEqual(ledger.visit, { net: 10, rounds: 2 });
  for (let i = 0; i < 35; i++) ledger.add({ game: 'roulette', net: i });
  assert.equal(ledger.rounds.length, 30); assert.equal(ledger.rounds[0].net, 34); assert.equal(ledger.visit.rounds, 37);
  const again = (await fresh(LEDGER)).ledger; assert.equal(again.rounds.length, 30); assert.equal(again.visit.net, ledger.visit.net, 'a reload keeps the visit');
  freshStorage({ 'salonnoir.ledger': '{"a":1}' }); sessionStorage.setItem('salonnoir.visit', '{"net":"x"}');
  const bad = (await fresh(LEDGER)).ledger; assert.deepEqual(bad.rounds, []); assert.deepEqual(bad.visit, { net: 0, rounds: 0 });
});
