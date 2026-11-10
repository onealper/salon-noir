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
import { fame, marks } from './core/fame.mjs';
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
// a level from the store, 0 to 1 (a hand-edited or corrupted one would reach the audio graph as NaN, which throws there)
const level = (v, d) => Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d;
const settings = {
  sound: store.get('sound', true), volume: level(store.get('volume', .8), .8),
  reduced: store.get('reduced', matchMedia('(prefers-reduced-motion: reduce)').matches),
  // Lightning's flashes: full, soft (one gentle peak a strike, under 3 a second) or off. Soft for anyone whose
  // device asks for less motion, so the photosensitive guest never sees the full storm by default.
  flash: ['full', 'soft', 'off'].includes(store.get('flash')) ? store.get('flash') : matchMedia('(prefers-reduced-motion: reduce)').matches ? 'soft' : 'full',
  haptics: store.get('haptics', true), sides: store.get('sides', true), fast: store.get('fast', false), gfx: store.get('gfx', 'auto'), dealer: store.get('dealer', 'rotate'),
  tray: store.get('tray', !matchMedia('(pointer: coarse)').matches), players: store.get('players', 4),
  replays: ['mine', 'all', 'off'].includes(store.get('replays')) ? store.get('replays') : 'mine',   // roulette's slow-motion replays
  mode: MODES[store.get('mode', 'classic')] ? store.get('mode', 'classic') : 'classic',
  cheat: store.get('cheat', false),   // blackjack's cheat mode: the next card and the hole card shown, a higher main bet
  mix: (m => ({ table: level(m?.table, 1), voice: level(m?.voice, 1), music: level(m?.music, .7) }))(store.get('mix', {})),
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
await inFlight.take('hand', rec => {   // each paid as it leaves the store
  const done = playOutHand(rec, random); if (!done) return;
  wallet.set(wallet.balance + done.delta); carried.lastLayout = done.t.lastLayout; store.set('lightningPending', done.t.pending);
  welcome = done.text; if (done.t.result) ledger.add(handEntry(done.t, done.t.result));   // in the book of last hands too
});
// A window opened while this page slept (a phone in a pocket, where there are no locks) took this hand over and
// settled it: this copy is dropped unpaid, and the page starts again from the wallet as that window left it.
inFlight.onLost('hand', () => { try { sessionStorage.setItem('salonnoir.lost', '1'); } catch { /* storage unavailable */ } location.reload(); });
// Out of chips: a clean start, with no multiplier carried over either; but not while a hand open in another window
// has your chips on it (its payout would land on top of the fresh 1,000).
if (wallet.balance < 1 && !await inFlight.held('hand')) { wallet.reset(); store.set('lightningPending', null); carried.lastLayout = null; }

// ---- the sound of the room ------------------------------------------------------------------------
// Menu sounds, stings and the dealer's lines come from the sound kit. Takes alternate so the same
// sound is never heard twice running.
const TAKES = { click: 2, open: 4, toggle: 4, select: 4, thock: 5 };
const turn = {}; const take = (name, n) => { turn[name] = ((turn[name] ?? Math.floor(Math.random() * n)) + 1) % n; return `${name}-${turn[name] + 1}`; };
const uiSound = kind => kind === 'thock' ? audio.cue(take('chip-thock', TAKES.thock), { bus: 'ui', gain: .95, rate: .97 + Math.random() * .06 }) : kind === 'close' ? audio.cue(take('ui-open', TAKES.open), { bus: 'ui', rate: .82, gain: .7 }) : audio.cue(take(`ui-${kind}`, TAKES[kind]), { bus: 'ui' });
const sting = (kind, gain = .8) => audio.cue(take(`win-${kind}`, 2), { gain });
// Fetched at the first touch: the salon's own sounds, and the lines a room adds as it is built (warm()).
const warmList = [...['small', 'blackjack', 'big', 'side'].flatMap(k => [`win-${k}-1`, `win-${k}-2`]),
  'ui-click-1', 'ui-click-2', ...[1, 2, 3, 4].flatMap(i => [`ui-open-${i}`, `ui-toggle-${i}`, `ui-select-${i}`, `chip-thock-${i}`]), 'chip-thock-5', 'crowd-cheer-1', 'crowd-cheer-2', 'whoosh', 'room-casino-1', 'portal-open', 'portal-drop', 'portal-land'];
let warmed = false;
const warm = list => { if (warmed) audio.preload(list); else warmList.unshift(...list); };
// The room: the table's murmur under everything, lounge music at the table, a lighter tune in the lobby.
function roomFor(inLobby) { audio.ambience('room-casino-1'); audio.music(inLobby ? 'music-lobby' : room === 'roulette' ? 'music-roulette' : 'music-bossa'); }

// ---- the top bar ---------------------------------------------------------------------------------------------
// The balance and what is in play, for whichever room you are in; digits roll by place value.
let shownBalance = NaN;
function showBalance(v = wallet.balance, bump = true) { if (v === shownBalance) return; ui.morph($('#balance'), fmt(v)); if (bump && v > shownBalance) ui.bump($('#balance'), 1.1); shownBalance = v; }
const showInPlay = v => ui.morph($('#bet'), fmt(v));
// the table's name under the logo, as a name is written (the felt prints it in capitals: modes.mjs, rgame's TABLES)
const NAMES = new Set(['european', 'free', 'bet', 'lightning', 'mega']);
const named = s => s.toLowerCase().split(' ').map((w, i) => i === 0 || NAMES.has(w) ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
const title = (name, page) => { $('#tableName').textContent = named(name); document.title = `${BRAND_TITLE} · ${page}`; };
// how far the bar reaches down over a room's stage
const barCover = el => { const b = $('.top').getBoundingClientRect(), r = el.getBoundingClientRect(); return Math.max(0, Math.round(b.bottom - r.top)); };
// How tall the dock is where it runs along the foot of a room's picture, full width (the picture goes on under it,
// behind its blur); 0 where it stands beside it (a phone on its side) or the room isn't showing.
const dockCover = el => { const r = el.getBoundingClientRect(); if (!r.width) return 0;
  for (const d of $$('.dock')) { const q = d.getBoundingClientRect(); if (q.height && Math.abs(q.top - r.bottom) < 2 && q.left <= r.left + 1 && q.right >= r.right - 1) return Math.round(q.height); }
  return 0; };
const BLUR_RISE = 40;   // px the dock's blur rises over the picture (.dock-blur's top in app.css): the table is framed clear of it

// ---- settings -------------------------------------------------------------------------------------------------------------
const dlg = $('#settingsDialog');
// The sheet rises in and sinks out (Esc, the close button and a tap outside all animate).
function closeSheet() {
  if (!dlg.open || dlg.classList.contains('closing')) return;
  uiSound('close');
  if (settings.reduced) { dlg.close(); return; }
  dlg.classList.add('closing'); setTimeout(() => { dlg.classList.remove('closing'); dlg.close(); }, 350);   // (.sheet.closing in app.css)
}
$('#settings').onclick = () => { uiSound('open'); dlg.showModal(); };
// More below: a fade at the sheet's foot while it scrolls on, gone at its end. Its parts change size as they open and
// close (and as the sheet opens), so each is watched.
const sheetFoot = () => dlg.classList.toggle('more', dlg.open && dlg.scrollTop + dlg.clientHeight < dlg.scrollHeight - 4);
dlg.addEventListener('scroll', sheetFoot, { passive: true });
{ const ro = new ResizeObserver(sheetFoot); for (const part of dlg.children) ro.observe(part); }
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
const replaysSel = $('#optReplays'); replaysSel.value = settings.replays; replaysSel.onchange = () => { uiSound('toggle'); settings.replays = replaysSel.value; store.set('replays', settings.replays); };
const flashSel = $('#optFlash'); flashSel.value = settings.flash; document.body.dataset.flash = settings.flash;
flashSel.onchange = () => { uiSound('toggle'); settings.flash = flashSel.value; store.set('flash', settings.flash); document.body.dataset.flash = settings.flash; };
const gfxSel = $('#optGfx'); gfxSel.value = settings.gfx;
const gfxNote = () => { const s = rooms[room]?.scene; if (s) $('#gfxNote').textContent = `${{ high: 'Sharp', laptop: 'Sharp, for a laptop', phone: 'Balanced', saver: 'Battery saver' }[s.quality.name]} · ${s.pixelRatio}× pixels`; };   // the room you see (each fits its own pixel budget)
document.body.dataset.gfx = gfxProfile(settings.gfx).name;   // (the battery saver goes without the blur under the dock)
gfxSel.onchange = () => { settings.gfx = gfxSel.value; store.set('gfx', settings.gfx); document.body.dataset.gfx = gfxProfile(settings.gfx).name; each(r => r.setQuality(gfxProfile(settings.gfx))); gfxNote(); };
$('#settings').addEventListener('click', gfxNote);
bindToggle('#optFast', 'fast', on => each(r => r.setFast(on)));
// How many others sit with you. Changes take effect between hands. The note names the blackjack table's players
// (once it is built; before that, the wheel's).
const playersSel = $('#optPlayers'); playersSel.value = String(settings.players);
const playersNote = () => { const names = (rooms.blackjack ?? rooms.roulette)?.players() ?? []; $('#playersNote').textContent = names.length ? names.join(', ') : 'A private table'; };
playersSel.onchange = () => { settings.players = +playersSel.value; store.set('players', settings.players); rooms.blackjack?.setPlayers(); rooms.roulette?.setPlayers(); playersNote(); };
$('#settings').addEventListener('click', playersNote);
$('#settings').addEventListener('click', () => { renderBook(); renderFame(); });   // Last hands and the hall of fame, drawn fresh as the sheet opens
// Open the sheet at one of its sections (the side-bet tray's (i) opens it at the paytables).
function openSheetAt(details, focus = false) {
  if (!dlg.open) { uiSound('open'); dlg.showModal(); gfxNote(); playersNote(); renderBook(); renderFame(); }
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
// never mid-hand or mid-spin: the round would be cut off from under the table (and its stakes counted twice); nor
// while a hand in another window of the salon rides (its payout would land on the fresh balance)
const holdUp = async () => { await rooms.blackjack?.moveOn(); return anyBusy() ? `Finish this ${rooms[room].round} first` : await inFlight.held('hand') ? 'Finish the hand in your other window first' : ''; };   // (a result waiting on you moves on)
kit.holdToConfirm($('#resetBalance'), async () => {   // hold, so a stray tap can't wipe your balance
  const why = await holdUp();
  if (why) { const l = $('#resetBalance .label'); kit.shake($('#resetBalance')); feel.tap('refuse'); l.textContent = why; setTimeout(() => { l.textContent = 'Hold to reset balance'; }, 1800); return; }
  setTimeout(closeSheet, 350); resetBalance();
});
// A fresh 1,000 and a clean start: no rebet, no Lightning multiplier carried over. From the hold in settings, or
// one tap on Deal or Spin once you are out of chips.
async function resetBalance() {
  const why = await holdUp(); if (why) { rooms[room].hint(`${why}.`); feel.tap('refuse'); return; }
  if (rooms.blackjack) rooms.blackjack.reset(); else { wallet.reset(); store.set('lightningPending', null); carried.lastLayout = null; showBalance(); }   // (the table's reset shows its own)
  rooms.roulette?.refresh();
  rooms[room].hint(`Balance reset to ${fmt(wallet.START)}.`); feel.tap('press');
}
for (const d of $$('.sheet details')) kit.accordion(d);

// ---- Last hands: the book of rounds (core/ledger.mjs), shown in the settings, with this visit's net ---------------------------
// A blackjack hand is written down whole as it is paid (blackjack/book.mjs): the cards and totals, how each hand of
// yours ended (up to four after resplits), every side bet with what it saw, the Lightning fee and bonus, and the net.
const TABLE_NAME = { classic: 'Classic', freebet: 'Free Bet', lightning: 'Lightning' }, WHEEL_NAME = { lightning: 'Lightning roulette', mega: 'Mega Lightning roulette' };
const ENDED = h => h.even ? 'Even money' : h.kind === 'blackjack' ? 'Blackjack' : h.kind === 'win' ? 'Win' : h.kind === 'push' ? 'Push' : h.total > 21 ? 'Bust' : 'Lose';
function entryHTML(e) {
  const tone = e.net > 0 ? 'up' : e.net < 0 ? 'down' : 'even', when = new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), line = (a, b, cls = '') => `<li class="${cls}"><span>${esc(a)}</span>${b == null ? '' : `<em>${esc(b)}</em>`}</li>`;
  let rows = '';
  if (e.game === 'roulette') {
    rows = line(`${e.n} ${e.color ?? ''} · ${e.back ? `returned ${fmt(e.back)} of ${fmt(e.staked)}` : `staked ${fmt(e.staked)}`}`, null) + (e.partage ? line('La partage: half of each even-money bet back', `+${fmt(e.partage)}`, 'side') : '') + (e.x ? line(`Lightning ${fmt(e.x)}× on your straight up`, null, 'side bolt') : '');
  } else {
    rows = line(`Dealer ${(e.dealer ?? []).join(' ')} · ${e.dealerBJ ? 'Blackjack' : e.dealerTotal}`, null)
      + (e.hands ?? []).map((h, i) => line(`${e.hands.length > 1 ? `Hand ${i + 1}` : 'You'} ${h.cards.join(' ')} · ${h.total} · ${ENDED(h)}`, signed(h.net))).join('')
      + (e.sides ?? []).map(s => line(`${s.name}: ${s.line}`, signed(s.net), 'side')).join('')
      + (e.fee ? line('Lightning fee', signed(-e.fee), 'side') : '') + (e.bonus ? line(`Lightning ${e.bonus.m}× on your fee`, signed(e.bonus.amount), 'side bolt') : '') + (e.earned ? line(`Earned ${e.earned}× for your next win`, null, 'side bolt') : '');
  }
  return `<li class="bk ${tone}"><div class="bk-head"><b>${e.game === 'roulette' ? WHEEL_NAME[e.table] ?? 'Roulette' : `${TABLE_NAME[e.table] ?? 'Blackjack'} blackjack`}</b><span class="bk-meta">${e.cheat ? 'Cheat mode · ' : ''}<time>${when}</time></span><em>${e.net ? signed(e.net) : 'Even'}</em></div><ul>${rows}</ul></li>`;
}
function renderBook() {
  const v = ledger.visit, net = v.rounds ? signed(v.net) : '±0', tone = v.net > 0 ? 'up' : v.net < 0 ? 'down' : '';
  for (const el of [$('#session'), $('#bookNet')]) { el.textContent = net; el.dataset.tone = tone; }
  $('#bookNet').setAttribute('aria-label', `This visit ${net}`);
  if (!$('#settingsDialog').open) return;   // the list is drawn when the sheet opens
  const list = ledger.rounds;
  // (an entry this version can't read, from an older one or a hand-edited store, is left out rather than take the list with it)
  const html = list.map(e => { try { return entryHTML(e); } catch { return ''; } }).join('');
  $('#book').innerHTML = html || '<li class="none">Your hands and spins at every table are kept here, the newest first.</li>';
}
ledger.subscribe(renderBook); renderBook();

// ---- the hall of fame (core/fame.mjs): what you have done at the tables, kept for good; in the settings, under Last hands ----
const AT_TABLE = { blackjack: t => `${TABLE_NAME[t] ?? 'Classic'} blackjack`, roulette: t => WHEEL_NAME[t] ?? 'European roulette' };
const day = at => { if (!at) return ''; const d = new Date(at); return d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) }); };
function renderFame() {
  const f = fame.state, all = marks(), got = all.filter(m => f.marks[m.id] != null);
  $('#fameNote').innerHTML = f.rounds ? `Milestones <b>${got.length}/${all.length}</b>` : '';
  if (!dlg.open) return;   // drawn when the sheet opens
  const card = (k, v, sub = '', cls = '') => `<div class="fm-card ${cls}"><span class="k">${k}</span><b class="${v.length > 15 ? 'xl' : v.length > 13 ? 'lg' : v.length > 11 ? 'md' : ''}">${v}</b><small>${esc(sub)}</small></div>`;
  const row = (k, v, sub = '') => `<li><span>${k}${sub ? `<small>${esc(sub)}</small>` : ''}</span><em>${v}</em></li>`;
  const hit = n => f.numbers.includes(n) ? ' class="hit"' : '';
  $('#fame').innerHTML = (f.rounds ? `<div class="fm-top">
      ${card('Biggest win', f.best ? `+${fmt(f.best.net)}` : '–', f.best ? `${AT_TABLE[f.best.game]?.(f.best.table) ?? ''} · ${day(f.best.at)}` : 'Still to come', f.best ? 'best' : '')}
      ${card('Best run', fmt(f.bestStreak), f.bestStreak === 1 ? 'win' : 'wins in a row')}
      ${card('Highest balance', fmt(f.peak), 'chips')}
    </div>
    <ul class="fm-list">
      ${row('Rounds played', fmt(f.rounds), `${fmt(f.won)} won · since ${day(f.since)}`)}
      ${row('Blackjacks', fmt(f.blackjacks))}
      ${row('Ten-card Charlies', fmt(f.charlies))}
      ${row('Highest Lightning multiplier paid', f.bolt ? `${fmt(f.bolt.x)}×` : '–', f.bolt ? `${AT_TABLE[f.bolt.game]?.(f.bolt.table) ?? ''} · ${day(f.bolt.at)}` : '')}
      ${row('Numbers won straight up', `${f.numbers.length} of 37`)}
    </ul>
    <div class="fm-nums" role="img" aria-label="${f.numbers.length ? `Won so far: ${f.numbers.join(', ')}` : 'None won yet'}"><span${hit(0)}>0</span><ol>${[3, 2, 1].flatMap(r => Array.from({ length: 12 }, (_, c) => { const n = c * 3 + r; return `<li${hit(n)}>${n}</li>`; })).join('')}</ol></div>`
    : '<p class="fm-none">Your records start with your first round.</p>')
    + `<h3 class="fm-h"><span>Milestones</span><em>${got.length} of ${all.length}</em></h3>
    <ul class="fm-marks">${all.map(m => f.marks[m.id] != null ? `<li class="got"><span>${esc(m.name)}</span><time>${day(f.marks[m.id])}</time></li>` : `<li><span>${esc(m.name)}<small>${esc(m.hint)}</small></span></li>`).join('')}</ul>
    <p class="fm-foot">Kept in this browser only. Hands played in cheat mode are not counted.</p>`;
}
fame.subscribe(renderFame); renderFame();
// Something new in it is said in a line under the bar, one after another: a milestone always, a record once it is
// worth the word (the first small wins are each a record).
const fameToast = $('#fameToast'), fameLine = []; let fameTurn = null;
function sayFame() {
  if (fameTurn || !fameLine.length) return;
  if (lobby.isOpen || dlg.open) { fameLine.length = 0; return; }
  fameToast.innerHTML = `<span class="k">Hall of fame</span><b>${esc(fameLine.shift())}</b>`;
  fameToast.style.top = `${Math.round($('.top').getBoundingClientRect().bottom) + 8}px`;
  fameToast.classList.remove('show'); void fameToast.offsetWidth; fameToast.classList.add('show');
  fameTurn = setTimeout(() => { fameToast.classList.remove('show'); fameToast.textContent = ''; fameTurn = null; sayFame(); }, 4200);
}
fame.listen(news => {
  const f = fame.state;
  for (const n of news) {
    if (n.kind === 'mark') fameLine.push(n.name);
    else if (n.id === 'best' && f.best.net >= 500 && f.rounds >= 10) fameLine.push(`Your biggest win yet, +${fmt(f.best.net)}`);
    else if (n.id === 'streak' && f.bestStreak >= 6) fameLine.push(`${f.bestStreak} wins running, your best run`);
    else if (n.id === 'bolt') fameLine.push(`Lightning ${fmt(f.bolt.x)}×, your highest yet`);
  }
  fameLine.splice(3); sayFame();
});

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
ui.pressable(document, '.pill:not(.deal):not(.hold-btn), .tile, .tray-toggle, .icon, .game, .st-n'); ui.pressable(document, '.chip', { depth: .88 });   // (on pointerdown: a phone's only answer before the tap lands; iOS gives :active its due through stage.mjs's touchstart listener)
ui.setReduced(settings.reduced); kit.setReduced(settings.reduced);

// ---- rooms: the blackjack table and the roulette wheel share the salon, its bar, wallet and sound -------------------------------------
// A word about what happened while you were away: over the lobby, or on the table when the page opens straight to it.
const notice = (text, show) => { if (params.has('table')) show(text); else lobby.note(text); };
if (welcome && !params.has('table')) lobby.note(welcome);   // (a spin the wheel finds as it is built says its word after this)
// What a room is given: the same for both.
const ctx = {
  app: $('.app'), audio, settings, store, ui, kit, feel, uiSound, sting, take, random, dev, carried, warm,
  quality: () => gfxProfile(settings.gfx), resetBalance, notice, record: e => ledger.add({ game: 'roulette', ...e }),
  showBalance, showInPlay, title, barCover, dockCover, BLUR_RISE, openSheetAt, bindToggle,
};
const ROOMS = { blackjack: () => import('./blackjack/controller.mjs').then(m => m.createBlackjack(ctx)), roulette: () => import('./roulette/rgame.mjs').then(m => m.createRoulette(ctx)) };
const loading = {};
const load = r => loading[r] ??= ROOMS[r]().then(x => (rooms[r] = x));   // a failure is kept: the browser keeps a module that failed to load failed until the page reloads
function setRoom(r) {
  if (r === room) return; const was = rooms[room]; room = r; store.set('room', r); document.body.dataset.room = r;
  was?.hide(); rooms[r].show();   // the hidden room draws nothing while you are in the other
}
{ let first = store.get('room', 'blackjack') === 'roulette' ? 'roulette' : 'blackjack';
  if (first === 'roulette') { try { await load('roulette'); } catch (err) { console.error('roulette failed to load', err); first = 'blackjack'; } }
  if (first === 'blackjack') await load('blackjack');
  setRoom(first); }
document.body.classList.add('ready');
setTimeout(() => { const s = document.getElementById('splash'); if (s && !s.classList.contains('failed')) s.remove(); }, 1500);   // once faded: a hidden splash would keep its animations running
if (welcome && params.has('table')) rooms[room].hint(welcome);
// The lobby: the casino's front room, over the table at every visit; the brand in the bar returns to it.
$('#brandMark').innerHTML = mark();
let previewTurn = 0, previewing = Promise.resolve();
// the lobby's roulette tables, and the roulette room's own names for them (rgame.mjs, TABLES)
const WHEELS = { roulette: 'european', 'roulette-lightning': 'lightning', 'roulette-mega': 'mega' }, wheelMode = k => Object.keys(WHEELS).find(m => WHEELS[m] === k) ?? 'roulette';
const couldNotLoad = game => lobby.note(`The ${game} table could not be loaded. Check the connection, then reload the page.`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// From one game to the other in the lobby: the table you are looking at goes down through the floor and you after it,
// and you come down out of the air in the other room, its table falling ahead of you (each room's portal). The room
// coming in is shown at once, out of sight behind this one (body[data-coming]), dressed for the table picked and its
// shaders built, while this table goes down. The two rooms meet inside the vortex, which fills the picture alike in
// both: there the room coming in is laid over this one in a moment, and this one is let go once you have landed. With
// reduced motion (or a room without a portal) the rooms simply change.
// an element faded in over `ms`, frame by frame (on the page's clock, as the rooms are)
const fadeIn = (el, ms) => new Promise(done => { const t0 = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - t0) / ms); el.style.opacity = k < 1 ? k.toFixed(3) : ''; if (k < 1) requestAnimationFrame(f); else done(); }; el.style.opacity = '0'; requestAnimationFrame(f); });
async function crossRooms(game, tableMode) {
  const from = rooms[room], to = rooms[game];
  if (game === 'roulette') await to.preview(WHEELS[tableMode], { sweep: false });
  if (settings.reduced || !from?.portal || !to.portal) {
    setRoom(game); to.showcase.start(settings.reduced); if (game === 'blackjack') to.preview(tableMode, { sweep: false });
    return;
  }
  // The page is the new room's from the start (its dock in place, so it is framed once, as it will stand), the room it
  // leaves kept on show under it and framed as it was (its picture must not change size or lens mid-dive)
  const b = document.body.dataset; b.coming = game; b.going = room; b.room = game;
  to.show(); to.showcase.start(false); if (game === 'blackjack') to.preview(tableMode, { sweep: false });
  const ready = to.portal.prime();
  const way = await from.portal.out(); await Promise.race([ready, sleep(2500)]);
  // the cut, inside the vortex: the room coming in, its picture the same, laid over this one
  const landing = to.portal.into(way), st = to.stage;
  st.style.zIndex = '1'; st.style.opacity = '0'; delete b.coming;
  room = game; store.set('room', game);
  await fadeIn(st, 170);
  from.portal.settle();
  await landing;
  st.style.zIndex = ''; delete b.going; from.hide();   // (its buffers let go once you have landed: done mid-flight, it would hold a frame)
}
// While you look over the tables, the other room is built and made ready out of sight (it warms itself: scene/stage.mjs),
// so the portal finds it ready to drop in rather than building it in the middle of the crossing; not on the battery saver.
let otherTimer = 0;
function readyOther() {
  const other = room === 'roulette' ? 'blackjack' : 'roulette';
  if (rooms[other] || loading[other] || gfxProfile(settings.gfx).name === 'saver') return;
  clearTimeout(otherTimer);
  otherTimer = setTimeout(() => {
    if (!lobby.isOpen || rooms[other] || loading[other]) return;
    const go = () => load(other).then(r => { if (room !== other) r.hide(); }).catch(err => console.warn(`${other} could not be made ready`, err));
    window.requestIdleCallback ? requestIdleCallback(go, { timeout: 4000 }) : go();
  }, 2500);
}
// picking a table in the lobby re-dresses the room behind the menu: the blackjack table, or the wheel. The picks are
// shown one after another, and only the latest waiting counts: a pick made while a table is changing, or a room still
// loading, is passed over if another has come since (or you have sat down).
async function showTable(tableMode, turn) {
  const game = WHEELS[tableMode] ? 'roulette' : 'blackjack', live = () => turn === previewTurn && lobby.isOpen;
  if (!rooms[game]) {
    try { await load(game); } catch (err) { console.error(`${game} failed to load`, err); if (turn === previewTurn) couldNotLoad(game); return; }
    if (!live()) return;
  }
  if (game !== room) await crossRooms(game, tableMode);
  else if (game === 'roulette') await rooms.roulette.preview(WHEELS[tableMode]);
  else await rooms.blackjack.preview(tableMode);
}
lobby.init({
  mode: () => room === 'roulette' ? wheelMode(rooms.roulette?.kind) : settings.mode,
  preview: tableMode => {
    const turn = ++previewTurn; uiSound('select');
    previewing = previewing.then(() => turn === previewTurn && lobby.isOpen ? showTable(tableMode, turn) : null).catch(err => console.error('could not show the table', err));
  },
  play: async (game, tableMode) => {
    previewTurn++; audio.unlock(); await previewing; audio.cue('whoosh', { bus: 'ui', gain: .6 });   // (a table on its way through the portal arrives first)
    try {
      await load(game); const r = rooms[game];
      if (game === 'roulette') { if (room !== 'roulette') setRoom('roulette'); roomFor(false); }
      else { if (room !== 'blackjack') { setRoom('blackjack'); r.showcase.start(true); } roomFor(false); }
      await r.enter(settings.reduced ? 0 : 1400, { tableMode: WHEELS[tableMode] ?? tableMode });   // the camera flies down into your chair
    } catch (err) {   // the table could not be reached (a module that failed to load on a poor connection): back to the lobby, with a word
      console.error('could not take the seat', err); lobby.open(); lobby.note('That table could not be opened. Check the connection, then reload the page.');
    } finally { document.body.classList.remove('flying'); }
  },
  refuse: el => { kit.shake(el); feel.tap('refuse'); audio.cue('ui-click-2', { bus: 'ui', rate: .7, gain: .6 }); },
  fame: () => openSheetAt($('#fameSec'), true),
  change: open => {
    if (audio.unlocked) roomFor(open);
    if (open) { rooms[room].toLobby(); readyOther(); } else { document.body.classList.add('flying'); rooms[room].fromLobby?.(); }
  },
});
// the lobby opens between rounds, never with money on a spinning wheel or a hand in play
$('#brandBtn').onclick = async () => { if ($('#settingsDialog').open) return; const r = rooms[room]; if (r.busy && !await r.moveOn?.()) { r.hint(`Finish this ${r.round} first.`); kit.shake($('#brandBtn')); feel.tap('refuse'); return; } lobby.open(); };   // a result waiting on you moves on first
if (!params.has('table')) { lobby.open(); readyOther(); } else rooms[room].enter(0, { direct: true });
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
