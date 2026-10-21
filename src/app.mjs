// The salon: the shell both rooms share. Settings, the sound of the room, the settings sheet, the top bar's
// readouts, the lobby and the move between rooms, and one key handler. The rooms are the blackjack table
// (blackjack/controller.mjs) and the roulette wheel (roulette/rgame.mjs); each is loaded and built the first time
// you go to it, so a visit that is all roulette never builds the blackjack table, and the other way round.
import { MODES } from './core/modes.mjs';
import { QUALITY, detectQuality } from './scene/stage.mjs';
import { preloadCardArt } from './scene/textures.mjs';
import { BRAND_TITLE, mark } from './core/brand.mjs';
import { wallet, inFlight } from './core/wallet.mjs';
import { ledger } from './core/ledger.mjs';
import { lobby } from './core/lobby.mjs';
import { fmt, signed, esc } from './core/format.mjs';
import { mulberry } from './core/rng.mjs';
import { playOutHand, handEntry } from './blackjack/book.mjs';
import { TableAudio } from './sound.mjs';
import * as ui from './ui-motion.mjs';
import * as kit from './ui-kit.mjs';
import { createFeel } from './core/feel.mjs';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('spader.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('spader.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// ---- testing aids ----------------------------------------------------------------------------------
// A seeded shoe (?seed=123), window.__spader and the roulette's rig() answer only with ?test in the address or
// salonnoir.dev = '1' in this browser: from the console at a friend's table, nobody reads the shoe or fixes the next number.
const params = new URLSearchParams(location.search), seed = Number(params.get('seed'));
const dev = params.has('test') || (() => { try { return localStorage.getItem('salonnoir.dev') === '1'; } catch { return false; } })();
const random = dev && Number.isFinite(seed) && params.has('seed') ? mulberry(seed) : Math.random;

// ---- settings --------------------------------------------------------------------------------------
const settings = {
  sound: store.get('sound', true), volume: store.get('volume', .8),
  reduced: store.get('reduced', matchMedia('(prefers-reduced-motion: reduce)').matches),
  // Lightning's flashes: full, soft (one gentle peak a strike, under 3 a second) or off. Soft for anyone whose
  // device asks for less motion, so the photosensitive guest never sees the full storm by default.
  flash: ['full', 'soft', 'off'].includes(store.get('flash')) ? store.get('flash') : matchMedia('(prefers-reduced-motion: reduce)').matches ? 'soft' : 'full',
  haptics: store.get('haptics', true), sides: store.get('sides', true), fast: store.get('fast', false), gfx: store.get('gfx', 'auto'), dealer: store.get('dealer', 'rotate'),
  tray: store.get('tray', !matchMedia('(pointer: coarse)').matches), players: store.get('players', 4),
  mode: MODES[store.get('mode', 'classic')] ? store.get('mode', 'classic') : 'classic',
  mix: { table: 1, voice: 1, music: .7, ...store.get('mix', {}) },
};
const rooms = { blackjack: null, roulette: null };   // each built the first time you go there (see the rooms section)
let room = null;   // which room of the salon you are in
const gfxProfile = g => g === 'auto' ? detectQuality() : QUALITY[g] ?? detectQuality();

// ---- boot --------------------------------------------------------------------------------------------
document.title = `${BRAND_TITLE} · Blackjack`;
await Promise.all(['800 100px "Barlow Condensed"', '700 100px "Barlow Condensed"', '600 16px Inter', '700 16px Inter', '600 100px Cinzel', '700 100px Cinzel', '500 100px "Bodoni Moda"', 'italic 600 100px "Bodoni Moda"', 'italic 400 100px "Bodoni Moda"'].map(f => document.fonts.load(f).catch(() => null)));
await preloadCardArt();   // the felt, leather, card back and room: both rooms draw with them
const audio = new TableAudio(), feel = createFeel({ audio, settings });   // haptic taps, gap-filling cues, confetti
audio.setEnabled(settings.sound); audio.setVolume(settings.volume); audio.setLevels(settings.mix);
// A blackjack hand this browser lost mid-play is played out now, whichever room you go to (blackjack/book.mjs), so
// the balance is right at the wheel as well. Its last layout waits for the table's Rebet; its multiplier is saved.
let welcome = '';   // what happened, said over the lobby (or as you sit down)
const carried = { lastLayout: null };
try { if (sessionStorage.getItem('salonnoir.lost')) { sessionStorage.removeItem('salonnoir.lost'); welcome = 'Your last hand was finished in another window of the salon.'; } } catch { /* storage unavailable */ }
for (const rec of await inFlight.take('hand')) {
  const done = playOutHand(rec, random); if (!done) continue;
  wallet.set(wallet.balance + done.delta); carried.lastLayout = done.t.lastLayout; store.set('lightningPending', done.t.pending);
  welcome = done.text; if (done.t.result) ledger.add(handEntry(done.t, done.t.result));   // in the book of last hands too
}
// A window opened while this page slept (a phone in a pocket, where there are no locks) took this hand over and
// settled it: this copy is dropped unpaid, and the page starts again from the wallet as that window left it.
inFlight.onLost('hand', () => { try { sessionStorage.setItem('salonnoir.lost', '1'); } catch { /* storage unavailable */ } location.reload(); });
if (wallet.balance < 1) { wallet.set(wallet.START); store.set('lightningPending', null); carried.lastLayout = null; }   // a clean start: no multiplier carried over either

// ---- the sound of the room ------------------------------------------------------------------------
// Menu sounds, stings and the dealer's lines come from the sound kit. Takes alternate so the same
// sound is never heard twice running.
const TAKES = { click: 2, open: 4, toggle: 4, select: 4, thock: 5 };
const turn = {}; const take = (name, n) => { turn[name] = ((turn[name] ?? Math.floor(Math.random() * n)) + 1) % n; return `${name}-${turn[name] + 1}`; };
const uiSound = kind => kind === 'thock' ? audio.cue(take('chip-thock', TAKES.thock), { bus: 'ui', gain: .95, rate: .97 + Math.random() * .06 }) : kind === 'close' ? audio.cue(take('ui-open', TAKES.open), { bus: 'ui', rate: .82, gain: .7 }) : audio.cue(take(`ui-${kind}`, TAKES[kind]), { bus: 'ui' });
const sting = (kind, gain = .8) => audio.cue(take(`win-${kind}`, 2), { gain });
// Fetched at the first touch: the salon's own sounds, and the lines a room adds as it is built (warm()).
const warmList = [...['small', 'blackjack', 'big', 'side'].flatMap(k => [`win-${k}-1`, `win-${k}-2`]),
  'ui-click-1', 'ui-click-2', ...[1, 2, 3, 4].flatMap(i => [`ui-open-${i}`, `ui-toggle-${i}`, `ui-select-${i}`, `chip-thock-${i}`]), 'chip-thock-5', 'crowd-cheer-1', 'crowd-cheer-2', 'whoosh', 'room-casino-1'];
let warmed = false;
const warm = list => { if (warmed) audio.preload(list); else warmList.unshift(...list); };
// The room: the table's murmur under everything, lounge music at the table, a lighter tune in the lobby.
function roomFor(inLobby) { audio.ambience('room-casino-1'); audio.music(inLobby ? 'music-lobby' : room === 'roulette' ? 'music-roulette' : 'music-bossa'); }

// ---- the top bar ---------------------------------------------------------------------------------------------
// The balance and what is in play, for whichever room you are in; digits roll by place value.
let shownBalance = NaN;
function showBalance(v = wallet.balance, bump = true) { if (v === shownBalance) return; ui.morph($('#balance'), fmt(v)); if (bump && v > shownBalance) ui.bump($('#balance'), 1.1); shownBalance = v; }
const showInPlay = v => ui.morph($('#bet'), fmt(v));
const title = (name, page) => { $('#tableName').textContent = name; document.title = `${BRAND_TITLE} · ${page}`; };
// how far the bar reaches down over a room's stage
const barCover = el => { const b = $('.top').getBoundingClientRect(), r = el.getBoundingClientRect(); return Math.max(0, Math.round(b.bottom - r.top)); };

// ---- settings -------------------------------------------------------------------------------------------------------------
const dlg = $('#settingsDialog');
// The sheet rises in and sinks out (Esc, the close button and a tap outside all animate).
function closeSheet() {
  if (!dlg.open || dlg.classList.contains('closing')) return;
  uiSound('close');
  if (settings.reduced) { dlg.close(); return; }
  dlg.classList.add('closing'); setTimeout(() => { dlg.classList.remove('closing'); dlg.close(); }, 200);
}
$('#settings').onclick = () => { uiSound('open'); dlg.showModal(); };
$('#closeSettings').onclick = closeSheet;
dlg.addEventListener('click', e => { if (e.target === dlg) closeSheet(); });
dlg.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
const each = f => { for (const r of Object.values(rooms)) if (r) f(r); };   // a setting applies in every room built so far (a room built later reads `settings`)
function bindToggle(id, key, apply) { const el = $(id); el.checked = settings[key]; el.onchange = () => { uiSound('toggle'); settings[key] = el.checked; store.set(key, el.checked); apply(el.checked); }; apply(settings[key]); }
bindToggle('#optSound', 'sound', on => { audio.setEnabled(on); $('#sound').setAttribute('aria-pressed', on); $('#sound').classList.toggle('off', !on); });
let hapticsReady = false;   // a tap when you switch them on, not when the page sets the switch
bindToggle('#optHaptics', 'haptics', on => { if (on && hapticsReady) feel.tap('press'); }); hapticsReady = true;
bindToggle('#optReduced', 'reduced', on => { each(r => r.setReduced(on)); ui.setReduced(on); kit.setReduced(on); document.body.classList.toggle('reduced', on); });
// Flashing effects: full, soft or off (the Lightning table's strikes; see blackjack/lightning-ui.mjs)
const flashSel = $('#optFlash'); flashSel.value = settings.flash; document.body.dataset.flash = settings.flash;
flashSel.onchange = () => { uiSound('toggle'); settings.flash = flashSel.value; store.set('flash', settings.flash); document.body.dataset.flash = settings.flash; };
const gfxSel = $('#optGfx'); gfxSel.value = settings.gfx;
const gfxNote = () => { const s = rooms[room]?.scene; if (s) $('#gfxNote').textContent = `${s.quality.name === 'high' ? 'Sharp' : s.quality.name === 'phone' ? 'Balanced' : 'Battery saver'} · ${s.pixelRatio}× pixels`; };   // the room you see (each fits its own pixel budget)
gfxSel.onchange = () => { settings.gfx = gfxSel.value; store.set('gfx', settings.gfx); each(r => r.setQuality(gfxProfile(settings.gfx))); gfxNote(); };
$('#settings').addEventListener('click', gfxNote);
bindToggle('#optFast', 'fast', on => each(r => r.setFast(on)));
// How many others sit with you. Changes take effect between hands. The note names the blackjack table's players
// (once it is built; before that, the wheel's).
const playersSel = $('#optPlayers'); playersSel.value = String(settings.players);
const playersNote = () => { const names = (rooms.blackjack ?? rooms.roulette)?.players() ?? []; $('#playersNote').textContent = names.length ? names.join(', ') : 'A private table'; };
playersSel.onchange = () => { settings.players = +playersSel.value; store.set('players', settings.players); rooms.blackjack?.setPlayers(); playersNote(); };
$('#settings').addEventListener('click', playersNote);
$('#settings').addEventListener('click', () => renderBook());   // Last hands, drawn fresh as the sheet opens
// Open the sheet at one of its sections (the side-bet tray's (i) opens it at the paytables).
function openSheetAt(details, focus = false) {
  if (!dlg.open) { uiSound('open'); dlg.showModal(); gfxNote(); playersNote(); renderBook(); }
  if (!details.open) { details.open = true; details.classList.add('open'); }
  requestAnimationFrame(() => { details.scrollIntoView({ block: 'start', behavior: settings.reduced ? 'auto' : 'smooth' }); if (focus) details.querySelector('summary').focus({ preventScroll: true }); });
}
for (const [id, k] of [['#mixTable', 'table'], ['#mixVoice', 'voice'], ['#mixMusic', 'music']]) {
  const el = $(id); el.value = settings.mix[k];
  el.oninput = () => { settings.mix[k] = +el.value; store.set('mix', settings.mix); audio.setLevels(settings.mix); };
  if (k === 'voice') el.onchange = () => (rooms.blackjack ?? rooms.roulette)?.callBets();   // hear the level you set
}
$('#volume').value = settings.volume; $('#volume').oninput = e => { settings.volume = +e.target.value; store.set('volume', settings.volume); audio.setVolume(settings.volume); };
$('#sound').onclick = () => { $('#optSound').checked = !settings.sound; $('#optSound').onchange(); if (settings.sound) { audio.unlock(); uiSound('toggle'); } };
const anyBusy = () => Object.values(rooms).some(r => r?.busy);
kit.holdToConfirm($('#resetBalance'), () => {   // hold, so a stray tap can't wipe your balance
  // never mid-hand or mid-spin: the round would be cut off from under the table (and its stakes counted twice)
  if (anyBusy()) { const l = $('#resetBalance .label'); kit.shake($('#resetBalance')); feel.tap('refuse'); l.textContent = `Finish this ${rooms[room].round} first`; setTimeout(() => { l.textContent = 'Hold to reset balance'; }, 1800); return; }
  setTimeout(closeSheet, 350); resetBalance();
});
// A fresh 1,000 and a clean start: no rebet, no Lightning multiplier carried over. From the hold in settings, or
// one tap on Deal or Spin once you are out of chips.
function resetBalance() {
  if (anyBusy()) return;
  if (rooms.blackjack) rooms.blackjack.reset(); else { wallet.set(wallet.START); store.set('lightningPending', null); carried.lastLayout = null; showBalance(); }   // (the table's reset shows its own)
  rooms.roulette?.refresh();
  rooms[room].hint(`Balance reset to ${fmt(wallet.START)}.`); feel.tap('press');
}
for (const d of $$('.sheet details')) kit.accordion(d);

// ---- Last hands: the book of rounds (core/ledger.mjs), shown in the settings, with this visit's net ---------------------------
// A blackjack hand is written down whole as it is paid (blackjack/book.mjs): the cards and totals, how each hand of
// yours ended (up to four after resplits), every side bet with what it saw, the Lightning fee and bonus, and the net.
const TABLE_NAME = { classic: 'Classic', freebet: 'Free Bet', lightning: 'Lightning' };
const ENDED = h => h.even ? 'Even money' : h.kind === 'blackjack' ? 'Blackjack' : h.kind === 'win' ? 'Win' : h.kind === 'push' ? 'Push' : h.total > 21 ? 'Bust' : 'Lose';
function entryHTML(e) {
  const tone = e.net > 0 ? 'up' : e.net < 0 ? 'down' : 'even', when = new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), line = (a, b, cls = '') => `<li class="${cls}"><span>${esc(a)}</span>${b == null ? '' : `<em>${esc(b)}</em>`}</li>`;
  let rows = '';
  if (e.game === 'roulette') {
    rows = line(`${e.n} ${e.color ?? ''} · ${e.back ? `returned ${fmt(e.back)} of ${fmt(e.staked)}` : `staked ${fmt(e.staked)}`}`, null) + (e.partage ? line('La partage: half of each even-money bet back', `+${fmt(e.partage)}`, 'side') : '');
  } else {
    rows = line(`Dealer ${(e.dealer ?? []).join(' ')} · ${e.dealerBJ ? 'blackjack' : e.dealerTotal}`, null)
      + (e.hands ?? []).map((h, i) => line(`${e.hands.length > 1 ? `Hand ${i + 1}` : 'You'} ${h.cards.join(' ')} · ${h.total} · ${ENDED(h)}`, signed(h.net))).join('')
      + (e.sides ?? []).map(s => line(`${s.name}: ${s.line}`, signed(s.net), 'side')).join('')
      + (e.fee ? line('Lightning fee', signed(-e.fee), 'side') : '') + (e.bonus ? line(`Lightning ×${e.bonus.m} on your fee`, signed(e.bonus.amount), 'side bolt') : '') + (e.earned ? line(`Earned ×${e.earned} for your next win`, null, 'side bolt') : '');
  }
  return `<li class="bk ${tone}"><div class="bk-head"><b>${e.game === 'roulette' ? 'Roulette' : `${TABLE_NAME[e.table] ?? 'Blackjack'} blackjack`}</b><time>${when}</time><em>${e.net ? signed(e.net) : 'Even'}</em></div><ul>${rows}</ul></li>`;
}
function renderBook() {
  const v = ledger.visit, net = v.rounds ? signed(v.net) : '±0', tone = v.net > 0 ? 'up' : v.net < 0 ? 'down' : '';
  for (const el of [$('#session'), $('#bookNet')]) { el.textContent = net; el.dataset.tone = tone; }
  $('#bookNet').setAttribute('aria-label', `This visit ${net}`);
  if (!$('#settingsDialog').open) return;   // the list is drawn when the sheet opens
  const list = ledger.rounds;
  $('#book').innerHTML = list.length ? list.map(entryHTML).join('') : '<li class="none">Your hands and spins at every table are kept here, the newest first.</li>';
}
ledger.subscribe(renderBook); renderBook();

// ---- keyboard ------------------------------------------------------------------------------------------------------------
// Space and Enter belong to the table (deal, next hand, spin, hurry the ball) wherever focus is, except on a
// control you moved to with the keyboard, which takes them as its own press. A bet spot, tile or chip you
// clicked keeps focus in most browsers; it must not take Space as another chip. The rest is the room's (onKey).
let tabbed = false;   // focus last moved by Tab, not by a pointer
addEventListener('pointerdown', () => { tabbed = false; }, true);
const ownsKey = e => { const c = tabbed && e.target.closest?.('button, [role=button], summary, a[href]'); return !!c && !c.disabled; };
// (capture phase: the table decides before a focused control acts on the key)
addEventListener('keydown', e => {
  if (e.key === 'Tab') { tabbed = true; return; }
  if (e.metaKey || e.ctrlKey || e.altKey || $('#settingsDialog').open || lobby.isOpen) return;
  if (e.target.closest?.('input,select,textarea')) return;
  const k = e.key.toLowerCase(), go = k === ' ' || k === 'enter';
  if (go && ownsKey(e)) return;
  rooms[room]?.onKey(e);
}, true);
// Sound starts on a gesture (on iOS a lift of the finger or a click, not the touch itself) and any later gesture wakes
// it again if it has stopped since (a call, Siri, another app taking the audio). The first also fetches the sounds
// and starts the room.
const wake = () => { if (audio.running) return; audio.unlock(); if (!warmed && audio.available) { warmed = true; audio.preload(warmList); roomFor(lobby.isOpen); } };
for (const t of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(t, wake, true);
// Every push button answers with a soft tick of its own (chips and bets have their own sounds).
document.addEventListener('click', e => { const b = e.target.closest('.pill, .icon, .act, .tray-toggle'); if (b && !b.disabled && b.id !== 'settings' && b.id !== 'closeSettings' && b.id !== 'trayToggle' && b.id !== 'sound' && !b.classList.contains('seat')) uiSound('click'); }, true);
// Every control answers the finger. The Deal button and the four decisions are push buttons with a
// real bottom edge (CSS); the rest squash on a spring.
ui.pressable(document, '.pill:not(.deal):not(.hold-btn), .tile, .tray-toggle, .icon'); ui.pressable(document, '.chip', { depth: .88 });
ui.setReduced(settings.reduced); kit.setReduced(settings.reduced);

// ---- rooms: the blackjack table and the roulette wheel share the salon, its bar, wallet and sound -------------------------------------
// A word about what happened while you were away: over the lobby, or on the table when the page opens straight to it.
const notice = (text, show) => { if (params.has('table')) show(text); else lobby.note(text); };
if (welcome && !params.has('table')) lobby.note(welcome);   // (a spin the wheel finds as it is built says its word after this)
// What a room is given: the same for both.
const ctx = {
  app: $('.app'), audio, settings, store, ui, kit, feel, uiSound, sting, take, random, dev, carried, warm,
  quality: () => gfxProfile(settings.gfx), resetBalance, notice, record: e => ledger.add({ game: 'roulette', ...e }),
  showBalance, showInPlay, title, barCover, openSheetAt, bindToggle,
};
const ROOMS = { blackjack: () => import('./blackjack/controller.mjs').then(m => m.createBlackjack(ctx)), roulette: () => import('./roulette/rgame.mjs').then(m => m.createRoulette(ctx)) };
const loading = {};
const load = r => loading[r] ??= ROOMS[r]().then(x => (rooms[r] = x)).catch(err => { loading[r] = null; throw err; });
function setRoom(r) {
  if (r === room) return; const was = rooms[room]; room = r; store.set('room', r); document.body.dataset.room = r;
  was?.hide(); rooms[r].show();   // the hidden room draws nothing while you are in the other
}
{ let first = store.get('room', 'blackjack') === 'roulette' ? 'roulette' : 'blackjack';
  if (first === 'roulette') { try { await load('roulette'); } catch (err) { console.error('roulette failed to load', err); first = 'blackjack'; } }
  if (first === 'blackjack') await load('blackjack');
  setRoom(first); }
document.body.classList.add('ready');
if (welcome && params.has('table')) rooms[room].hint(welcome);
// The lobby: the casino's front room, over the table at every visit; the brand in the bar returns to it.
$('#brandMark').innerHTML = mark();
let previewTurn = 0;
const couldNotLoad = game => lobby.note(`The ${game} table could not be loaded. Check the connection and try again.`);
lobby.init({
  mode: () => room === 'roulette' ? 'roulette' : settings.mode,
  // picking a table in the lobby re-dresses the room behind the menu: the blackjack table, or the wheel. Only the
  // latest pick counts: a room still loading when you have moved on (or sat down) stays out of the room.
  preview: async tableMode => {
    const turn = ++previewTurn, game = tableMode === 'roulette' ? 'roulette' : 'blackjack'; uiSound('select');
    if (!rooms[game]) {
      try { await load(game); } catch (err) { console.error(`${game} failed to load`, err); if (turn === previewTurn) couldNotLoad(game); return; }
      if (turn !== previewTurn || !lobby.isOpen) return;
    }
    if (game === 'roulette') { setRoom('roulette'); rooms.roulette.showcase.start(settings.reduced); if (audio.unlocked) roomFor(true); return; }
    if (room !== 'blackjack') { setRoom('blackjack'); rooms.blackjack.showcase.start(settings.reduced); }
    rooms.blackjack.preview(tableMode);
  },
  play: async (game, tableMode) => {
    previewTurn++; audio.unlock(); audio.cue('whoosh', { bus: 'ui', gain: .6 });
    try {
      await load(game); const r = rooms[game];
      if (game === 'roulette') { if (room !== 'roulette') setRoom('roulette'); roomFor(false); }
      else { if (room !== 'blackjack') { setRoom('blackjack'); r.showcase.start(true); } roomFor(false); }
      await r.enter(settings.reduced ? 0 : 1400, { tableMode });   // the camera flies down into your chair
    } catch (err) {   // the table could not be reached (a module that failed to load on a poor connection): back to the lobby, with a word
      console.error('could not take the seat', err); lobby.open(); lobby.note('That table could not be opened. Check the connection and try again.');
    } finally { document.body.classList.remove('flying'); }
  },
  refuse: el => { kit.shake(el); feel.tap('refuse'); audio.cue('ui-click-2', { bus: 'ui', rate: .7, gain: .6 }); },
  change: open => {
    if (audio.unlocked) roomFor(open);
    if (open) rooms[room].toLobby(); else { document.body.classList.add('flying'); rooms[room].fromLobby?.(); }
  },
});
// the lobby opens between rounds, never with money on a spinning wheel or a hand in play
$('#brandBtn').onclick = () => { if ($('#settingsDialog').open) return; const r = rooms[room]; if (r.busy) { r.hint(`Finish this ${r.round} first.`); kit.shake($('#brandBtn')); feel.tap('refuse'); return; } lobby.open(); };
if (!params.has('table')) lobby.open(); else rooms[room].enter(0, { direct: true });
// The browser took the 3D view away (iOS does, under memory pressure) and has not given it back: a reload does.
addEventListener('salonnoir:gpulost', () => {
  if ($('#gpuLost')) return;
  const b = document.createElement('button'); b.id = 'gpuLost'; b.className = 'pill gold'; b.innerHTML = '<span class="label">The table lost its picture. Tap to reload</span>';
  b.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:30'; b.onclick = () => location.reload();
  (rooms[room]?.stage ?? $('#stage')).append(b);   // over the table you are looking at
});
addEventListener('salonnoir:gpurestored', () => $('#gpuLost')?.remove());
// Test hooks for the browser checks (see the testing aids above): the salon's, and the blackjack table's once it is built.
if (dev) {
  const hooks = { get roulette() { return rooms.roulette; }, get blackjack() { return rooms.blackjack; }, feel, settings, audio, loadRoulette: () => load('roulette'), load, setRoom: r => rooms[r] ? setRoom(r) : load(r).then(() => setRoom(r)) };
  for (const k of ['table', 'view', 'motion', 'world', 'choose', 'seating', 'lightning', 'mode', 'busy', 'rig']) Object.defineProperty(hooks, k, { get: () => rooms.blackjack?.test[k], enumerable: true });
  window.__spader = hooks;
}
window.done = true;
