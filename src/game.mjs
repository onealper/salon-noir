// The controller: reads the rules engine, drives the table view, runs the controls.
import { Table, total, natural, isTen, CHIP_VALUES, LIMITS, CUT_AT, SHOE_CARDS, SPOTS, BUCKETS } from './engine.mjs';
import { SIDE_BETS, PUSH22 } from './sidebets.mjs';
import { MODES } from './core/modes.mjs';
import { createWorld, LAYOUT, QUALITY, detectQuality, toSeat } from './scene/world.mjs';
import { Seating, SEAT_COUNT, YOU } from './players.mjs';
import { preloadCardArt, chipFaceTexture, medallionCanvas, CARD_W } from './scene/textures.mjs';
import { BRAND, BRAND_TITLE, monogram } from './core/brand.mjs';
import { wallet } from './core/wallet.mjs';
import { lobby } from './core/lobby.mjs';
import { Motion, ease } from './scene/pieces.mjs';
import { TableView, DEALERS } from './scene/view.mjs';
import { TableAudio } from './sound.mjs';
import { createLightning3D } from './scene/lightning3d.mjs';
import * as ui from './ui-motion.mjs';
import * as kit from './ui-kit.mjs';
import { createFeel } from './core/feel.mjs';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const fmt = n => (Math.round(n * 2) / 2).toLocaleString('en-US', { maximumFractionDigits: 1 });
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n));
const store = {
  get(k, d) { try { const v = localStorage.getItem('spader.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('spader.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const SIDE = Object.fromEntries(SIDE_BETS.map(b => [b.id, b])), DPAIRS = SIDE.dpairs;
const SPOT_NAME = { main: 'Main bet', ...Object.fromEntries(SIDE_BETS.map(b => [b.id, b.name])) };
const keyOf = spot => spot === 'main' ? 'h0' : spot;
const maxPays = id => Math.max(...SIDE[id].table.map(r => r[1]));   // the slot's own bet; the Free Bet table repaints the last slot

// ---- a seeded shuffle for testing (?seed=123) --------------------------------------------------
const params = new URLSearchParams(location.search), seed = Number(params.get('seed'));
const random = Number.isFinite(seed) && params.has('seed') ? (() => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })() : Math.random;

// ---- settings --------------------------------------------------------------------------------------
const settings = {
  sound: store.get('sound', true), volume: store.get('volume', .8),
  reduced: store.get('reduced', matchMedia('(prefers-reduced-motion: reduce)').matches),
  haptics: store.get('haptics', true), sides: store.get('sides', true), fast: store.get('fast', false), gfx: store.get('gfx', 'auto'), dealer: store.get('dealer', 'rotate'),
  tray: store.get('tray', !matchMedia('(pointer: coarse)').matches), players: store.get('players', 4),
  mode: MODES[store.get('mode', 'classic')] ? store.get('mode', 'classic') : 'classic',
  mix: { table: 1, voice: 1, music: .7, ...store.get('mix', {}) },
};
let room = 'blackjack', roulette = null, rouletteLoading = null;   // which room of the salon you are in (see the rooms section)
const gfxProfile = g => g === 'auto' ? detectQuality() : QUALITY[g] ?? detectQuality();

// ---- boot --------------------------------------------------------------------------------------------
document.title = `${BRAND_TITLE} · Blackjack`;
await Promise.all(['800 100px "Barlow Condensed"', '700 100px "Barlow Condensed"', '600 16px Inter', '700 16px Inter', '600 100px Cinzel', '700 100px Cinzel', '500 100px "Bodoni Moda"', 'italic 600 100px "Bodoni Moda"', 'italic 400 100px "Bodoni Moda"'].map(f => document.fonts.load(f).catch(() => null)));
await preloadCardArt();
const canvas = $('#table'), stage = $('#stage'), overlay = $('#overlay');
const world = createWorld(canvas, { specs: SIDE_BETS, quality: gfxProfile(settings.gfx), mode: MODES[settings.mode] });
const motion = new Motion(world), audio = new TableAudio(), view = new TableView(world, motion, audio);
const feel = createFeel({ audio, settings });   // haptic taps, gap-filling cues, confetti
const table = new Table({ random, balance: wallet.balance, mode: settings.mode });
if (table.balance < 1) { table.reset(wallet.START); wallet.set(table.balance); }
{ const p = store.get('lightningPending', null); if (p?.m > 0 && p.fee > 0) table.pending = p; }   // a multiplier you earned waits for you across visits
Object.assign(motion, { reduced: settings.reduced, slow: settings.fast ? .62 : 1 });
audio.setEnabled(settings.sound); audio.setVolume(settings.volume); audio.setLevels(settings.mix);

// ---- the sound of the room ------------------------------------------------------------------------
// Menu sounds, stings and the dealer's lines come from the sound kit. Takes alternate so the same
// sound is never heard twice running.
const TAKES = { click: 2, open: 4, toggle: 4, select: 4, thock: 5 };
const turn = {}; const take = (name, n) => { turn[name] = ((turn[name] ?? Math.floor(Math.random() * n)) + 1) % n; return `${name}-${turn[name] + 1}`; };
const uiSound = kind => kind === 'thock' ? audio.cue(take('chip-thock', TAKES.thock), { bus: 'ui', gain: .95, rate: .97 + Math.random() * .06 }) : kind === 'close' ? audio.cue(take('ui-open', TAKES.open), { bus: 'ui', rate: .82, gain: .7 }) : audio.cue(take(`ui-${kind}`, TAKES[kind]), { bus: 'ui' });
const sting = (kind, gain = .8) => audio.cue(take(`win-${kind}`, 2), { gain });
// The dealer's voice: James's recordings for the men, Sofia's for the women.
const dealerSays = (line, opts) => audio.say(`voice/${view.dealer.voice}-bj-${line}`, opts);
const BJ_LINES = ['place-bets', 'insurance', 'blackjack', 'dealer-blackjack', 'dealer-17', 'dealer-18', 'dealer-19', 'dealer-20', 'dealer-21', 'dealer-busts', 'push', 'nicely-played', 'new-shoe'];
function warmSounds() {
  audio.preload([...['james', 'sofia'].flatMap(v => BJ_LINES.map(l => `voice/${v}-bj-${l}`)), ...['small', 'blackjack', 'big', 'side'].flatMap(k => [`win-${k}-1`, `win-${k}-2`]),
    'ui-click-1', 'ui-click-2', ...[1, 2, 3, 4].flatMap(i => [`ui-open-${i}`, `ui-toggle-${i}`, `ui-select-${i}`, `chip-thock-${i}`]), 'chip-thock-5', 'crowd-cheer-1', 'crowd-cheer-2', 'whoosh', 'room-casino-1']);
}
// The room: the table's murmur under everything, lounge music at the table, a lighter tune in the lobby.
function roomFor(inLobby) { audio.ambience('room-casino-1'); audio.music(inLobby ? 'music-lobby' : room === 'roulette' ? 'music-roulette' : 'music-bossa'); }

// ---- the overlay: hit targets over the spots, totals, labels ------------------------------------------
const spotEls = {};
for (const id of SPOTS) {
  const b = document.createElement('button'); b.className = `spot ${id === 'main' ? 'main' : 'side'}`; b.dataset.spot = id;
  b.setAttribute('aria-label', id === 'main' ? 'Main bet' : `${SIDE[id].name} side bet, pays up to ${maxPays(id)} to 1`);
  b.innerHTML = `<span class="amount" hidden></span>`;
  pressable(b, () => placeChip(id), () => removeFrom(id));
  overlay.append(b); spotEls[id] = b;
}
// Tap adds the chip in hand; press and hold (or right-click) takes the last chip off.
function pressable(el, tap, hold) {
  let timer = 0, held = false;
  el.addEventListener('pointerdown', e => { if (e.button > 0) return; held = false; clearTimeout(timer); timer = setTimeout(() => { held = true; hold(); navigator.vibrate?.(12); }, 480); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => clearTimeout(timer));
  el.addEventListener('click', e => { if (held) { e.preventDefault(); held = false; return; } tap(); });
  el.addEventListener('contextmenu', e => { e.preventDefault(); clearTimeout(timer); if (!held) hold(); held = false; });
}
const totals = { 0: mk('hand-total'), 1: mk('hand-total'), dealer: mk('hand-total dealer') };
// ---- the other players -------------------------------------------------------------------------------
const seating = new Seating(); seating.arrange(settings.players);
const others = () => seating.players.filter(x => x.seat !== YOU);
const seatKey = k => `s${k}`;
const seatEls = {};
for (let k = 0; k < SEAT_COUNT; k++) {
  if (k === YOU) continue;
  const tag = document.createElement('div'); tag.className = 'seat-tag away'; tag.innerHTML = '<span class="av"></span><b></b><span class="bank"></span><span class="say"></span>'; overlay.append(tag);
  seatEls[k] = { tag, total: mk('hand-total seat'), totalB: mk('hand-total seat') };
}
function renderSeats() {
  for (const [k, el] of Object.entries(seatEls)) {
    const p = seating.seats[k]; el.tag.classList.toggle('away', !p);
    if (!p) continue;
    el.tag.querySelector('.av').textContent = p.initial; el.tag.querySelector('b').textContent = p.name;
    el.tag.querySelector('.bank').textContent = fmt(p.bankroll); el.tag.title = `${p.name} ${p.note}.`;
  }
}
let sayTimers = {};
function say(k, text, ms = 1300) {
  const el = seatEls[k]?.tag.querySelector('.say'); if (!el) return;
  clearTimeout(sayTimers[k]); el.textContent = text; el.classList.add('show'); sayTimers[k] = setTimeout(() => el.classList.remove('show'), ms);
}
// Whether any other player still has a hand the dealer must play against.
table.othersLive = () => others().some(({ p }) => p.standing);
function mk(cls) { const e = document.createElement('div'); e.className = cls; e.hidden = true; e.append(document.createElement('span')); overlay.append(e); return e; }
// A hand total rolls to its new value and gives a small bump, so a changed count is noticed.
function setTotal(el, text) { const v = el.firstChild; if (el.dataset.v === text) return; const first = !el.dataset.v; el.dataset.v = text; ui.morph(v, text); if (!first) ui.bump(v, 1.2); else ui.pop(v, { from: .5 }); }

function place(el, x, y, z, dx = 0, dy = 0) { const p = world.project(x, y, z); el.style.transform = `translate(${Math.round(p.x + dx)}px, ${Math.round(p.y + dy)}px)`; el.classList.toggle('offscreen', p.behind || p.x < -40 || p.x > stage.clientWidth + 40); return p; }
let lightningLayout = () => {};   // set once the Lightning module exists
function layoutOverlay() {
  for (const id of SPOTS) {
    const s = LAYOUT.spots[id], pts = [[s.x - s.r, s.z], [s.x + s.r, s.z], [s.x, s.z - s.r], [s.x, s.z + s.r]].map(([x, z]) => world.project(x, 0, z));
    const l = Math.min(...pts.map(p => p.x)), r = Math.max(...pts.map(p => p.x)), t = Math.min(...pts.map(p => p.y)), b = Math.max(...pts.map(p => p.y));
    Object.assign(spotEls[id].style, { left: `${l}px`, top: `${t}px`, width: `${r - l}px`, height: `${b - t}px` });
  }
  // the result tag rises off your bet: anchored just above the top of the main circle
  { const m = LAYOUT.spots.main, p = world.project(m.x, 0, m.z - m.r * .55); const b = $('#banner'); b.style.setProperty('--rb-x', `${p.x}px`); b.style.setProperty('--rb-y', `${p.y}px`); }
  layoutTotals(); lightningLayout();
}
function layoutTotals() {
  for (const k of [0, 1]) { const a = view.anchor(k, 0); place(totals[k], a.pos.x + (k === 1 && view.split ? CARD_W * .5 + 3.2 : -CARD_W * .5 - 3.2), 0, a.pos.z + 1); }
  const d = view.anchor('dealer', 0); place(totals.dealer, d.pos.x - CARD_W * .5 - 3.4, 0, d.pos.z);
  for (const [k, el] of Object.entries(seatEls)) {
    const bx = view.seatSplits.has(+k) ? 9.5 : 0;
    const t = toSeat(+k, LAYOUT.player.x - bx - CARD_W * .5 - 3, LAYOUT.player.z + 1), tb = toSeat(+k, LAYOUT.player.x + bx + CARD_W * .5 + 3, LAYOUT.player.z + 1), n = toSeat(+k, 0, 40);
    place(el.total, t.x, 0, t.z); place(el.totalB, tb.x, 0, tb.z); place(el.tag, n.x, 0, n.z);
  }
}
// Re-aim the camera only when the table's box really changes size (rotation, window resize), once per frame.
let framed = '', reframe = 0;
const ro = new ResizeObserver(() => {
  cancelAnimationFrame(reframe);
  reframe = requestAnimationFrame(reframeNow);
}); ro.observe(stage); ro.observe($('.top'));
// The top bar floats over the table; the camera frames the area below it (plus the bar's fade).
function reframeNow() {
  const w = stage.clientWidth, h = stage.clientHeight, bar = barCover(), top = bar + boardCover(bar), k = `${w}x${h}x${top}`; if (k === framed || !w || !h) return;
  framed = k; $('.app').style.setProperty('--top-h', `${bar}px`); $('.app').style.setProperty('--board-h', `${top - bar}px`); world.frame(w, h, top); layoutOverlay();
}
// the Lightning board sits under the bar; the seat is framed below it so it never covers the dealer's cards
function boardCover() { const b = $('#lightning'); return b.hidden || document.body.classList.contains('in-lobby') ? 0 : b.offsetHeight + 12; }
function barCover() { const bar = $('.top'), s = stage.getBoundingClientRect(), b = bar.getBoundingClientRect(); return Math.max(0, Math.round(b.bottom - s.top)); }

// ---- readouts ----------------------------------------------------------------------------------------------
let shownBalance = NaN;
function renderBalance() {
  const target = table.balance; wallet.set(target);
  if (target !== shownBalance) { ui.morph($('#balance'), fmt(target)); if (target > shownBalance) ui.bump($('#balance'), 1.1); } shownBalance = target;   // digits roll by place value
}
function renderBets() {
  const inPlay = table.phase !== 'betting', amount = id => inPlay ? (id === 'main' ? 0 : 0) : table.betOn(id);
  for (const id of SPOTS) { const el = spotEls[id].querySelector('.amount'); if (el.classList.contains('won')) continue; const a = amount(id); el.hidden = !a || id !== 'main'; el.textContent = fmt(a); }
  for (const t of $$('.tile')) { const a = table.phase === 'betting' ? table.betOn(t.dataset.spot) : table.stakes[t.dataset.spot]; kit.badge(t.querySelector('.amt'), a ? fmt(a) : ''); t.classList.toggle('on', !!a); }
  const sides = table.phase === 'betting' ? table.sideBet : 0; kit.badge($('#trayToggle .sum'), sides ? fmt(sides) : '');
  const bet = table.phase === 'betting' ? table.cost : table.stake + table.fee + SPOTS.filter(s => s !== 'main').reduce((s, k) => s + table.stakes[k], 0) + table.insurance;   // the Lightning fee counts as in play
  ui.morph($('#bet'), fmt(bet));
  const main = spotEls.main.querySelector('.amount'); if (!main.hidden && main.textContent !== main.dataset.last) { ui.bump(main, 1.18); main.dataset.last = main.textContent; }
}
// The shoe as a ring gauge: gold is what is left, the dot marks the cut card.
const setGauge = kit.gauge($('#shoeGauge'), { mark: (SHOE_CARDS - CUT_AT) / SHOE_CARDS * 100 });
function renderShoe() {
  const dealt = table.dealt, left = SHOE_CARDS - dealt, toCut = CUT_AT - dealt;
  setGauge(left / SHOE_CARDS * 100);
  $('#shoeText').textContent = toCut > 0 ? `${left} cards · cut in ${toCut}` : `${left} cards · last hand`;
  $('#shoeMeter').title = `8-deck shoe: ${left} of ${SHOE_CARDS} cards left. The cut card is at ${CUT_AT}; the shoe is replaced after the hand it appears in.`;
}
function handLabel(cards, { bj = true } = {}) {
  if (!cards.length) return '';
  const t = total(cards); if (bj && natural(cards)) return 'BJ';
  if (t.value > 21) return String(t.value);
  return t.soft && t.value < 21 ? `${t.value - 10}/${t.value}` : String(t.value);
}
function renderTotals() {
  for (const k of [0, 1]) {
    const h = table.hands[k], el = totals[k]; el.hidden = !h || !h.cards.length || (k === 1 && !table.isSplit) || !view.cards.some(c => c.owner === k);
    if (el.hidden) continue;
    const shown = view.handCards(k).length, cards = h.cards.slice(0, shown);
    setTotal(el, handLabel(cards, { bj: !h.fromSplit })); el.classList.toggle('bust', total(cards).value > 21);
    el.classList.toggle('active', table.isSplit && table.phase === 'player' && table.activeIndex === k);
  }
  for (const [k, el] of Object.entries(seatEls)) for (const [owner, t] of [[seatKey(k), el.total], [seatKey(k) + 'b', el.totalB]]) {
    const shown = view.handCards(owner).map(c => c.card); t.hidden = !shown.length;
    if (!shown.length) { delete t.dataset.v; continue; }
    const split = view.seatSplits.has(+k);
    if (!t.dataset.out) setTotal(t, handLabel(shown, { bj: !split })); t.classList.toggle('bust', total(shown).value > 21);
    t.classList.toggle('active', split && seating.seats[k]?.at === (owner.endsWith('b') ? 1 : 0) && seatEls[k].tag.classList.contains('turn'));
  }
  const dc = view.handCards('dealer').filter(c => !c.hidden).map(c => c.card);
  totals.dealer.hidden = !dc.length; if (dc.length) setTotal(totals.dealer, handLabel(dc)); totals.dealer.classList.toggle('bust', total(dc).value > 21);
  layoutTotals();
}
// The hint line never blinks: clearing waits a moment in case a new line follows at once.
let hintClear = 0;
const hint = t => { clearTimeout(hintClear); const el = $('#hint'); if (t) { el.classList.remove('off'); if (el.dataset.t !== t) { el.dataset.t = t; ui.morph(el, t); } } else hintClear = setTimeout(() => el.classList.add('off'), 260); };

// ---- chips and betting controls --------------------------------------------------------------------------------
let chipValue = store.get('chip', 5); if (!CHIP_VALUES.includes(chipValue)) chipValue = 5;
const chipRow = $('#chips');
for (const v of CHIP_VALUES) {
  const b = document.createElement('button'); b.className = 'chip'; b.dataset.value = v; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', `${v} chip`);
  const img = document.createElement('img'); img.alt = ''; img.src = chipFaceTexture(v).image.toDataURL('image/png'); img.width = img.height = 128; b.append(img);
  b.addEventListener('click', () => selectChip(v)); chipRow.append(b);
}
// picking up a chip answers with a low, woody knock
function selectChip(v) { if (v !== chipValue) uiSound('thock'); chipValue = v; store.set('chip', v); let sel; for (const b of chipRow.children) { const on = +b.dataset.value === v; b.setAttribute('aria-checked', on); b.classList.toggle('selected', on); if (on) sel = b; } ui.lift([...chipRow.children], sel); }
selectChip(chipValue);

// ---- the side-bet tray: names and top payouts you can read on any screen ------------------------------------
// The tray has its own flat line icons, one colour per bet, so each reads at a glance apart from the felt art.
// Side-bet icons, drawn for these bets: each is a line drawing with a soft tint fill (duotone),
// in the bet's own colour, echoing the medallion printed for it on the felt.
const T = 'fill="currentColor" fill-opacity=".22"', SOLID = 'fill="currentColor" stroke="none"';
const leaf = r => `<path transform="rotate(${r} 12 11)" ${T} d="M12 11C10.8 10 7.6 7.9 7.6 5.3a2.2 2.2 0 0 1 4.4-1 2.2 2.2 0 0 1 4.4 1c0 2.6-3.2 4.7-4.4 5.7Z"/>`;
const pip = (x, y, k = 1) => `<path ${SOLID} transform="translate(${x} ${y}) scale(${k})" d="M0-2.6C-1.2-1.3-2.5-.4-2.5.8a1.3 1.3 0 0 0 2.2 1L-.7 3h1.4L.3 1.8a1.3 1.3 0 0 0 2.2-1C2.5-.4 1.2-1.3 0-2.6Z"/>`;
const card = (x, y, r, cx, cy) => `<rect x="${x}" y="${y}" width="8.6" height="12.4" rx="1.6" transform="rotate(${r} ${cx} ${cy})" ${T}/>`;
const TRAY_ICONS = {
  lucky:  { c: '#86c98f', svg: `${leaf(0)}${leaf(90)}${leaf(180)}${leaf(270)}<path d="M12.6 12.4c1.3 2.4 2.4 5 2.8 8.3"/>` },
  pairs:  { c: '#ec9f93', svg: `${card(3.2, 5.6, -12, 7.5, 11.8)}${pip(7.4, 11.4, .9)}${card(11.4, 5.6, 12, 15.7, 11.8)}${pip(15.8, 11.6, .9)}` },
  top3:   { c: '#e7c67f', svg: `<path ${T} d="M4.5 16.5 3.5 8l4.6 3.4L12 5l3.9 6.4L20.5 8l-1 8.5Z"/><path d="M5 19.5h14"/><circle cx="3.5" cy="7.2" r="1.2" ${SOLID}/><circle cx="12" cy="4.2" r="1.2" ${SOLID}/><circle cx="20.5" cy="7.2" r="1.2" ${SOLID}/>` },
  p213:   { c: '#8fb6ea', svg: `<rect x="2.5" y="4.5" width="19" height="15" rx="3.5" ${T}/><text x="10" y="15.6" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="10" ${SOLID}>21</text><text x="16.6" y="12.2" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="6.4" ${SOLID}>+3</text>` },
  buster: { c: '#f0a865', svg: `<path ${T} d="M12.0 1.8L14.0 5.7L18.0 3.7L17.3 8.1L21.7 8.8L18.6 12.0L21.7 15.2L17.3 15.9L18.0 20.3L14.0 18.3L12.0 22.2L10.0 18.3L6.0 20.3L6.7 15.9L2.3 15.2L5.4 12.0L2.3 8.8L6.7 8.1L6.0 3.7L10.0 5.7Z"/><text x="12" y="14.6" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="7.4" ${SOLID}>22</text>` },
  push22: { c: '#7fd0c4', svg: `<rect x="2.5" y="4.5" width="19" height="15" rx="3.5" ${T}/><text x="12" y="13.6" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="9.6" ${SOLID}>22</text><path d="M7 16.4h10M15.4 15l1.6 1.4-1.6 1.4"/>` },
  dpairs: { c: '#bca2ee', svg: `${card(2.6, 6.4, -10, 6.9, 12.6)}<path ${SOLID} d="M7.1 10.6l1.5 2-1.5 2-1.5-2Z"/>${card(9.4, 6.4, 8, 13.7, 12.6)}<path ${SOLID} d="M13.8 11l1.5 2-1.5 2-1.5-2Z"/><circle cx="18.2" cy="6.2" r="3.9" fill="currentColor" stroke="none"/><text x="18.2" y="8.35" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="6.2" fill="#141416" stroke="none">D</text>` },
};
// A tile shows the bet in its slot: on the Free Bet table the Dealer Pairs slot holds Push 22.
function paintTile(t, b) {
  const pays = Math.max(...b.table.map(r => r[1]));
  t.setAttribute('aria-label', `${b.name}, pays up to ${pays} to 1. ${b.cards}.`); t.title = `${b.name}: ${b.cards}. ` + b.table.map(([l, p]) => `${l} ${p}:1`).join(' · ');
  t.style.setProperty('--c', TRAY_ICONS[b.id].c);
  t.innerHTML = `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24">${TRAY_ICONS[b.id].svg}</svg></span><b>${b.name}</b><small><i>up to </i>${pays}:1</small><span class="amt"></span>`;
}
for (const b of SIDE_BETS) {
  const t = document.createElement('button'); t.className = 'tile'; t.dataset.spot = b.id; paintTile(t, b);
  pressable(t, () => placeChip(b.id), () => removeFrom(b.id)); $('#tiles').append(t);
}
// The tray opens with the tiles rising in one after another, and closes by sliding back down.
let trayClosing = 0;
function setTray(open) {
  settings.tray = open; store.set('tray', open); $('#trayToggle').setAttribute('aria-expanded', open);
  const tray = $('#tray'); clearTimeout(trayClosing); tray.classList.remove('closing');
  if (open) { if (!tray.classList.contains('open')) uiSound('open'); tray.classList.add('open'); ui.enter($$('.tile'), { y: 8, gap: 22 }); return; }
  if (!tray.classList.contains('open')) return;
  uiSound('close');
  if (settings.reduced) { tray.classList.remove('open'); return; }
  tray.classList.add('closing'); trayClosing = setTimeout(() => tray.classList.remove('open', 'closing'), 190);
}
$('#trayToggle').onclick = () => setTray(!settings.tray); setTray(settings.tray);
// On an upright phone the tray is a sheet over the rail: a tap anywhere else puts it away.
const sheetMode = matchMedia('(max-width: 760px) and (orientation: portrait)');
addEventListener('pointerdown', e => { if (sheetMode.matches && settings.tray && !e.target.closest('#tray')) setTray(false); }, true);

let busy = false;       // an animation sequence owns the table
let queue = Promise.resolve();
const serial = fn => (queue = queue.then(fn).catch(fail));   // betting gestures run in order

function refusal(spot, value) {
  if (table.phase !== 'betting') return 'Bets are closed for this hand.';
  if (spot !== 'main' && !settings.sides) return 'Side bets are switched off in settings.';
  const fee = table.mode === 'lightning' && spot === 'main' ? value : 0;
  if (table.cost + value + fee > table.balance) return fee ? `Not enough balance for a ${value} chip and its Lightning fee.` : `Not enough balance for a ${value} chip.`;
  const [, max] = spot === 'main' ? LIMITS.main : LIMITS.side;
  if (table.betOn(spot) + value > max) return `${SPOT_NAME[spot]} limit is ${fmt(max)}.`;
  return null;
}
function placeChip(spot) {
  if (busy) return; hideBanner();
  const why = refusal(spot, chipValue); if (why) { hint(why); flash(spotEls[spot]); const t = $(`.tile[data-spot="${spot}"]`); if (t) flash(t); feel.tap('refuse'); feel.cue('error'); return; }
  table.addChip(spot, chipValue); renderBets(); refreshControls(); feel.tap('chip');
  // chips can be tossed in quick succession: the next one only waits a beat, not the whole flight
  serial(() => { const f = view.addChip(keyOf(spot), chipValue); return Promise.race([f, motion.wait(90)]); });
}
function removeFrom(spot) {
  if (busy || table.phase !== 'betting' || !table.betOn(spot)) return;
  // take the last chip placed on this spot
  const i = table.history.lastIndexOf(spot); if (i < 0) return;
  table.history.splice(i, 1); table.bets[spot].pop(); renderBets(); refreshControls();
  serial(() => view.syncStack(keyOf(spot), table.bets[spot]));
}
function syncAllStacks() { return Promise.all(SPOTS.map(s => view.syncStack(keyOf(s), table.bets[s]))); }
function flash(el) { el.classList.remove('refused'); void el.offsetWidth; el.classList.add('refused'); if (!el.classList.contains('spot')) kit.shake(el); }

const actions = {
  undo() { if (busy) return; const u = table.undo(); if (!u) return; renderBets(); refreshControls(); serial(() => view.syncStack(keyOf(u.spot), table.bets[u.spot])); },
  clear() { if (busy || !table.bet) return; table.clear(); renderBets(); refreshControls(); serial(syncAllStacks); },
  rebet() { if (busy || !table.rebet()) return; renderBets(); refreshControls(); serial(syncAllStacks); },
  double() { if (busy || !table.doubleBets()) return; renderBets(); refreshControls(); serial(syncAllStacks); },
  deal() { if (busy) return; feel.tap('press'); hideBanner(); if (!table.bet && table.canRebet) { actions.rebet(); } serial(round); },
};
$('#undo').onclick = actions.undo; $('#clear').onclick = actions.clear; $('#rebet').onclick = actions.rebet; $('#x2').onclick = actions.double; $('#deal').onclick = actions.deal;

// ---- the other players' bets: pushed out while you decide on yours -------------------------------------------------
// Each player puts their chips down at their own moment during betting. Pressing Deal hurries anyone
// still making up their mind.
let betJobs = [];
function othersBet() {
  betJobs = others().filter(({ p }) => !p.stake && p.wantsToPlay()).map(({ seat, p }) => {
    // their chips go down only once you are at the table: nothing clatters while you're in the lobby
    let fire = () => {}, timer = 0, hurried = false;
    const go = whenSeated().then(() => new Promise(r => { fire = r; if (hurried) r(); else timer = setTimeout(r, 450 + Math.random() * 2400); }));
    const job = go.then(async () => {
      if (lobby.isOpen && !hurried) await whenSeated();   // back in the lobby before they bet: they wait too
      if (table.phase !== 'betting' || p.stake) return;
      p.mode = table.mode; const amount = p.chooseBet(); p.placeBet(amount); const sides = p.chooseSides(); renderSeats();
      await view.addAmount(seatKey(seat), amount);
      for (const [id, v] of Object.entries(sides)) await view.addAmount(seatKey(seat) + (id === 'pairs' ? 'p' : 't'), v);
    });
    return { hurry: () => { hurried = true; clearTimeout(timer); fire(); }, job };
  });
}
let seatWaiters = [];
const whenSeated = () => lobby.isOpen || room !== 'blackjack' || !document.body.classList.contains('seated') ? new Promise(r => seatWaiters.push(r)) : Promise.resolve();
function seatedNow() { document.body.classList.add('seated'); const w = seatWaiters; seatWaiters = []; for (const r of w) r(); }
async function othersReady() { for (const b of betJobs) b.hurry(); await Promise.all(betJobs.map(b => b.job)); betJobs = []; }

// ---- the director: your head turns toward whoever is playing ----------------------------------------------------------
let panning = null;
async function lookAt(k) {
  const target = k == null || k === YOU ? 0 : (() => { const a = view.anchor(seatKey(k), 1); return world.panFor(a.pos.x, a.pos.z); })();
  const from = world.pan; if (Math.abs(target - from) < .01) return;
  const job = motion.tween(Math.min(900, 380 + Math.abs(target - from) * 900), t => { world.setPan(from + (target - from) * t); layoutOverlay(); }, ease.inOut);
  panning = job; await job; if (panning === job) panning = null;
}

// ---- the round ------------------------------------------------------------------------------------------------------
let decide = null;     // resolves with the player's choice while the table waits
const choice = () => new Promise(r => { decide = r; refreshControls(); });
function choose(what) { if (!decide) return; const d = decide; decide = null; d(what); }
for (const b of $$('[data-act]')) b.addEventListener('click', () => choose(b.dataset.act));

function stageNext() { view.stageFront(table.cards.at(-1), true); syncShoe(); }
function syncShoe() { view.syncShoe(Math.max(0, table.remaining - 1), CUT_AT - table.dealt); renderShoe(); }
let cutOut = false;
// The first card of every new shoe is burned: dealt face down straight to the discard holder.
async function burn() { const c = table.draw(); await view.burn(c, stageNext); }
async function dealTo(owner, i, card, opts = {}) {
  await view.deal(card, { owner, i, next: stageNext, ...opts });
  if (table.cutReached && !cutOut) { cutOut = true; hint('The cut card is out. This is the last hand of the shoe.'); await view.ejectCut(); }
  renderTotals();
}
let resolved = 0;      // how many of table.results are already on the felt
async function settleSides() {
  const fresh = table.results.slice(resolved); resolved = table.results.length;
  for (const r of fresh) feed(r);
  if (fresh.some(r => r.payout > 0 && r.spot !== 'insurance')) sting('side', .7);
  await Promise.all(fresh.map(async r => {
    const key = r.spot === 'insurance' ? 'ins' : r.spot;
    if (r.payout > 0) { const pill = spotEls[r.spot]?.querySelector('.amount'); if (pill) { pill.textContent = signed(r.net); pill.classList.add('won'); pill.hidden = false; ui.pop(pill, { from: .3 }); } await view.sideWin(key, r.net); }
    else await view.toRack(key);
  }));
  renderBalance();
}
function feed(r) {
  const li = document.createElement('li'); li.className = r.payout > 0 ? 'win' : 'loss';
  li.innerHTML = `<b></b><span></span><em></em>`;
  li.querySelector('b').textContent = r.name; li.querySelector('span').textContent = r.payout > 0 ? `${r.line} · ${r.pays}:1` : r.line; li.querySelector('em').textContent = signed(r.net);
  $('#feed').append(li); requestAnimationFrame(() => requestAnimationFrame(() => li.classList.add('show')));   // toast overshoot
}
function clearFeed() { $('#feed').replaceChildren(); for (const id of SPOTS) spotEls[id].querySelector('.amount').classList.remove('won'); }

async function round() {
  if (table.phase !== 'betting') return;
  if (table.belowMinimum) { hint(table.bet ? 'Side bets ride with a main bet. Put a chip on the main circle.' : 'Place a bet on the main circle to deal.'); flash(spotEls.main); feel.tap('refuse'); feel.cue('error'); return; }
  busy = true; setMode('busy');
  try {
    const layoutBefore = table.layout();
    await othersReady();
    if (!table.start()) { busy = false; setMode('betting'); return; }
    if (table.shuffled) { cutOut = false; changeDealer(); await view.newShoe(SHOE_CARDS - 1, CUT_AT); stageNext(); await burn(); }
    view.rename('main', 'h0'); resolved = 0; renderBalance(); renderBets(); hint('');
    if (table.board) await lightning.strike(table.board);
    void layoutBefore;
    // One card to each player, first base to third, then the dealer's up card; again, with the
    // dealer's second card face down.
    const inPlay = others().filter(({ p }) => p.stake); for (const { p } of inPlay) p.mode = table.mode;
    const order = [...inPlay.map(x => x.seat), YOU].sort((a, b) => a - b);
    for (const i of [0, 1]) {
      for (const k of order) {
        if (k === YOU) { await dealTo(0, i, table.initialCard('player')); continue; }
        const p = seating.seats[k], card = table.draw(); p.hand.cards.push(card); await dealTo(seatKey(k), i, card);
      }
      await dealTo('dealer', i, table.initialCard('dealer'), { hidden: i === 1 });
    }
    let res = table.finishDeal();
    await Promise.all([settleSides(), settleSeatSides(inPlay)]);
    const up = table.upCard;
    if (res === 'insurance') {
      const even = natural(table.player); dealerSays('insurance', { prio: 2 });
      setMode('insurance', even);
      const yes = (await choice()) === 'yes' && table.canInsure;
      setMode('busy');
      const takers = inPlay.filter(({ p }) => !natural(p.hand.cards) && p.wantsInsurance());
      await Promise.all([yes ? view.buildStack('ins', table.insuranceCost) : null, ...takers.map(({ seat, p }) => { say(seat, 'Insurance'); return view.addAmount(seatKey(seat) + 'i', p.insure()); })]);
      renderSeats();
      res = table.insure(yes); renderBalance(); renderBets();
    }
    if (up.rank === 'A' || isTen(up)) { hint('Dealer checks for blackjack…'); await view.peek(); hint(''); }
    await Promise.all([settleSides(), ...inPlay.filter(({ p }) => p.insurance).map(async ({ seat, p }) => {   // insurance
      const r = p.settleInsurance(natural(table.dealer)), key = seatKey(seat) + 'i';
      if (r.payout) await view.payout(key, r.payout - r.stake); else await view.toRack(key);
    })]);
    renderSeats();
    // Everyone plays in turn, first base to third: those on your right before you, then you, then the rest.
    if (res !== 'dealerBlackjack') {
      for (const { seat, p } of inPlay.filter(x => x.seat < YOU)) await otherTurn(seat, p);
      if (inPlay.length) await lookAt(YOU);
      if (res === 'player') await playerTurn();
      for (const { seat, p } of inPlay.filter(x => x.seat > YOU)) await otherTurn(seat, p);
      if (inPlay.length) await lookAt(YOU);
    }
    await dealerTurn();
    await finish();
  } catch (e) { await misdeal(e); }
}

async function playerTurn() {
  while (table.phase === 'player') {
    const h = table.activeIndex; setMode('player'); renderTotals();
    const act = await choice(); setMode('busy'); hint('');
    if (act === 'hit' && table.canHit) { const card = table.hit(); await dealTo(h, table.hands[h].cards.length - 1, card); }
    else if (act === 'stand' && table.canStand) { table.stand(); }
    else if (act === 'double' && table.canDouble) {
      // the double goes on top of the bet - or, when the house pays for it, a free-bet marker beside it
      if (table.freeDouble) await view.addMarker(`h${h}f`); else await view.addAmount(`h${h}`, table.activeHand.base);
      const card = table.double(); renderBalance(); renderBets();
      await dealTo(h, table.hands[h].cards.length - 1, card, { turn: 'across' });
    }
    else if (act === 'split' && table.canSplit) {
      const stake = table.activeHand.stake; table.split(); renderBalance(); renderBets();
      await view.splitHands(); if (table.freeSplitMade) await view.addMarker('h1f'); else await view.buildStack('h1', stake); renderTotals();
      for (const i of [0, 1]) await dealTo(i, 1, table.splitCard(i), { turn: table.hands[i].splitAces ? 'angled' : null });
      table.finishSplit();
    }
    renderTotals();
  }
}
// Other players' side bets are settled with yours, straight after the deal.
async function settleSeatSides(inPlay) {
  await Promise.all(inPlay.map(async ({ seat, p }) => {
    for (const r of p.settleSides(table.upCard)) {
      const key = seatKey(seat) + (r.id === 'pairs' ? 'p' : 't');
      if (r.payout) { say(seat, r.win.label, 1600); await view.payout(key, r.payout - r.stake); } else await view.toRack(key);
    }
  }));
  renderSeats();
}
// Another player's turn: the camera turns to them, they think, they signal, the dealer acts on it.
async function otherTurn(k, p) {
  const key = seatKey(k);
  if (natural(p.hand.cards)) { say(k, 'Blackjack'); return; }
  seatEls[k].tag.classList.add('turn'); await lookAt(k);
  for (p.at = 0; p.at < p.hands.length; p.at++) {
    const h = p.hand, hk = p.at ? `${key}b` : key;
    if (p.hands.length > 1) renderTotals();
    while (!h.done) {
      if (h.cards.length === 1) {   // a split hand takes its second card first
        const c = table.draw(); h.cards.push(c); await dealTo(hk, 1, c, { turn: h.splitAces ? 'angled' : null });
        if (h.splitAces || total(h.cards).value === 21) { h.done = true; break; }
      }
      await motion.wait(p.thinkTime());
      const act = p.decide(table.upCard);
      if (act === 'stand') { say(k, 'Stand'); h.done = true; break; }
      if (act === 'split') {
        const stake = h.stake, free = p.split(); say(k, free ? 'Free split' : 'Split'); renderSeats();
        await view.splitSeat(k); if (free) await view.addMarker(`${key}bf`); else await view.addAmount(`${key}b`, stake); renderTotals(); p.at = -1; break;   // start again at the first split hand
      }
      if (act === 'double') { const free = p.freeDouble; say(k, free ? 'Free double' : 'Double'); if (free) await view.addMarker(`${hk}f`); else await view.addAmount(hk, h.base); p.double(); renderSeats(); const c = table.draw(); h.cards.push(c); await dealTo(hk, h.cards.length - 1, c, { turn: 'across' }); h.done = true; }
      else { say(k, 'Hit', 800); const c = table.draw(); h.cards.push(c); await dealTo(hk, h.cards.length - 1, c); }
      const v = total(h.cards).value;
      if (v >= 21 || h.cards.length >= 10) h.done = true;
    }
    if (p.at >= 0 && total(h.cards).value > 21) { say(k, 'Bust'); await motion.wait(250); await view.toRack(hk); }   // a busted bet is taken at once
  }
  p.at = 0; seatEls[k].tag.classList.remove('turn');
}
async function dealerTurn() {
  if (view.handCards('dealer').some(c => c.hidden)) { await motion.wait(260); await view.reveal(); }
  table.revealHole(); renderTotals(); await settleSides();
  while (!table.dealerDone) { await motion.wait(180); const c = table.dealerHit(); if (!c) break; await dealTo('dealer', table.dealer.length - 1, c); }
  // the dealer calls the hand: blackjack, a bust, or the total they stand on (when anyone was still in)
  const d = total(table.dealer).value;
  if (natural(table.dealer)) dealerSays('dealer-blackjack', { prio: 3 });
  else if (d === 22 && table.mode === 'freebet') dealerSays('push', { prio: 3 });   // 22 pushes at this table
  else if (d > 21) dealerSays('dealer-busts', { prio: 3 });
  else if (d >= 17 && (table.dealer.length > 2 || table.needsDealer)) dealerSays(`dealer-${d}`, { prio: 2 });
}
async function finish() {
  const r = table.settle();
  await settleSides();   // Buster
  // main hands: losing stakes go to the rack, wins are paid onto the stake
  const seatResults = others().filter(({ p }) => p.hands.length && p.hands[0].cards.length).flatMap(({ seat, p }) => p.settle(table.dealer, table.board).map((r, i) => ({ seat, p, r, key: seatKey(seat) + (i ? 'b' : ''), el: i ? seatEls[seat].totalB : seatEls[seat].total })));
  // paid and taken from the dealer's right (your left) round to the dealer's left
  const jobs = [
    ...seatResults.map(x => ({ x: view.stackBase(x.key).x, run: () => Promise.all([x.r.kind === 'loss' ? view.toRack(x.key) : x.r.payout > x.r.stake ? view.payout(x.key, x.r.payout - x.r.stake) : null, x.r.free ? view.toRack(`${x.key}f`) : null]) })),
    ...r.hands.map(h => ({ x: 0, run: () => Promise.all([h.kind === 'loss' ? view.toRack(`h${h.index}`) : h.payout > h.stake ? view.payout(`h${h.index}`, h.payout - h.stake) : null, h.free ? view.toRack(`h${h.index}f`) : null]) })),
  ].sort((a, b) => a.x - b.x);
  await Promise.all(jobs.map((j, i) => motion.wait(i * 160).then(j.run)));
  for (const { el, r: sr } of seatResults) { if (el.hidden) continue; const [text, cls] = outcomeOf({ ...sr, index: 0 }, r); el.dataset.out = '1'; setTotal(el, text); el.classList.remove('bust'); el.classList.add(cls); }
  for (const { seat, p } of others()) if (p.flash) { const f = p.flash; p.flash = null; if (f.bonus) say(seat, `⚡ +${fmt(f.bonus.amount)}`, 2400); else if (f.earned) say(seat, `⚡ ×${f.earned.m}`, 2400); }
  renderSeats();
  renderBalance(); renderTotals(); markOutcomes(r);
  if (table.mode === 'lightning') { store.set('lightningPending', table.pending); await lightning.settle(r); }
  celebrate(r);
  showBanner(r);
  setMode('result');
  await Promise.race([new Promise(r => setTimeout(r, settings.fast ? 1400 : 2100)), choice()]); decide = null;
  await clearUp();
}
async function clearUp() {
  setMode('busy'); hint('');   // the result bar stays up as a summary until you next bet
  clearFeed(); for (const t of [...Object.values(totals), ...Object.values(seatEls).flatMap(e => [e.total, e.totalB])]) { t.hidden = true; t.classList.remove('win', 'push', 'loss', 'bust'); delete t.dataset.out; delete t.dataset.v; }
  await Promise.all([view.toPlayer(), view.collectCards()]);
  table.next(); for (const { p } of others()) p.clear();
  if (table.cutReached) {
    table.newShoe(); cutOut = false; const d = changeDealer(); dealerSays('new-shoe', { prio: 2 });
    const moves = seating.turnover(settings.players).filter(c => c.joined), who = moves.length ? ` ${moves.map(c => c.left ? `${c.joined.name} takes ${c.left.name}'s seat` : `${c.joined.name} sits down`).join('; ')}.` : '';
    renderSeats(); for (const c of moves) say(c.seat, 'Sits down', 2600); hint((d ? `New shoe. ${d.name} takes over the table.` : 'New shoe. Eight decks, freshly shuffled.') + who);
    await view.newShoe(table.remaining - 1, CUT_AT); stageNext(); await burn();
  } else { const ch = seating.arrange(settings.players); if (ch.length) { renderSeats(); for (const c of ch) if (c.joined) say(c.seat, 'Sits down', 2600); } }
  lightning.reset(); busy = false; renderBets(); setMode('betting');
  if (table.balance < LIMITS.main[0]) hint('You are out of chips. Reset your balance in settings to keep playing.');
}
async function misdeal(e) {
  console.error(e); motion.finishAll();
  const back = table.abandon(); decide = null; for (const { p } of others()) p.refund(); renderSeats(); for (const e of Object.values(seatEls)) e.total.hidden = e.totalB.hidden = true; world.setPan(0); layoutOverlay();
  view.clearCards(); view.clearChips(); hideBanner();
  clearFeed(); for (const t of Object.values(totals)) t.hidden = true;
  lightning.reset(); stageNext(); renderBalance(); renderBets(); busy = false; setMode('betting');
  hint(`Misdeal. ${back ? `${fmt(back)} returned to your balance.` : 'Nothing was lost.'}`);
}
function fail(e) { if (table.phase !== 'betting') return misdeal(e); console.error(e); busy = false; setMode('betting'); }

// How the room answers your result: a sting sized to the win, the table cheering a big one, and now
// and then a word from the dealer.
const bigWin = r => r.net >= Math.max(10 * r.hands.reduce((s, h) => s + h.stake, 0), 250) || r.sides.some(x => x.payout > 0 && x.pays >= 25);
function celebrate(r) {
  const main = r.hands.reduce((s, h) => s + h.stake, 0), big = bigWin(r);
  if (r.bonus) { big || r.bonus.m >= 10 ? audio.cue('thunder-mega', { gain: .8 }) : audio.cue(take('thunder', 2), { gain: .7 }); if (r.bonus.m >= 10) setTimeout(() => audio.cue(take('crowd-cheer', 2), { bus: 'room', gain: 5 }), 400); }
  if (r.blackjack || big || r.bonus?.m >= 10) { feel.tap('big'); feel.confetti({ size: big || r.bonus?.m >= 10 ? 2 : 1 }); } else if (r.net > 0) feel.tap('win');
  if (r.blackjack) { sting('blackjack'); dealerSays('blackjack', { prio: 2, fresh: 2500 }); }
  else if (big) { sting('big', .9); setTimeout(() => audio.cue(take('crowd-cheer', 2), { bus: 'room', gain: 5 }), 250); }
  else if (r.mainNet > 0) sting('small', .7);
  if (!r.blackjack && r.hands.length === 1 && r.hands[0].kind === 'push') dealerSays('push', { prio: 1, fresh: 2500 });
  else if (!r.blackjack && r.mainNet >= 2 * main && Math.random() < .5) dealerSays('nicely-played', { prio: 1, fresh: 2500 });
}

// The result: each hand's total turns into its outcome, and a compact bar rises at the foot of the
// table with the headline and the net - the way live tables report a hand - leaving the cards in view.
function outcomeOf(h, r) {
  if (h.kind === 'blackjack') return ['BLACKJACK', 'win'];
  if (h.kind === 'win') return [`${h.total} · WIN`, 'win'];
  if (h.kind === 'push') return [`${h.total} · PUSH`, 'push'];
  return [h.total > 21 ? `${h.total} · BUST` : r.dealerBlackjack ? `${h.total} · LOSE` : `${h.total} · LOSE`, 'loss'];
}
function markOutcomes(r) {
  for (const h of r.hands) { const el = totals[h.index]; if (el.hidden) continue; const [text, cls] = outcomeOf(h, r); setTotal(el, text); el.classList.remove('active', 'bust'); el.classList.add(cls); }
  if (!totals.dealer.hidden && r.dealerTotal > 21) setTotal(totals.dealer, `${r.dealerTotal} · BUST`);
}
function headline(r) {
  if (r.bonus) return `Lightning ×${r.bonus.m}`;
  if (r.blackjack) return 'Blackjack';
  if (r.dealer22 && r.hands.every(h => h.kind === 'push')) return 'Dealer 22 · Push';
  if (r.hands.length > 1) return r.title.replace(/\.$/, '');
  const h = r.hands[0];
  if (h.kind === 'win') return r.dealerTotal > 21 ? 'Dealer busts' : h.title === 'Ten-card Charlie.' ? 'Ten-card Charlie' : 'You win';
  if (h.kind === 'push') return 'Push';
  return r.dealerBlackjack ? 'Dealer blackjack' : h.total > 21 ? 'Bust' : 'Dealer wins';
}
// The result is a small tag that rises off your bet, says what happened in a word and by how much,
// and drifts away on its own after a couple of seconds. Hand totals already read WIN / BUST, and
// side bets have their own list, so the tag stays small.
let bannerTimer = 0;
function showBanner(r) {
  clearTimeout(bannerTimer);
  const b = $('#banner'), tone = r.net > 0 ? 'up' : r.net < 0 ? 'down' : 'even';
  b.className = `banner ${tone}${r.blackjack ? ' bj' : ''}${r.net > 0 && (r.blackjack || r.bonus || bigWin(r)) ? ' gild' : ''}`;   // the big moments read in gold foil
  b.innerHTML = '<span class="rb-label"></span><em></em>';
  b.firstChild.textContent = headline(r);
  const em = b.lastChild, final = r.net ? signed(r.net) : 'Even';
  em.textContent = r.net ? (r.net > 0 ? '+0' : '−0') : final;
  b.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('show')));
  if (r.net) setTimeout(() => ui.morph(em, final), 160);   // the amount rolls up to the result
  bannerTimer = setTimeout(hideBanner, 2600);
  hint('Tap the table or press Space for the next hand.');
}
function hideBanner() {
  clearTimeout(bannerTimer);
  const b = $('#banner'); if (b.hidden || !b.classList.contains('show')) return;
  b.classList.remove('show'); b.classList.add('leave');
  setTimeout(() => { if (!b.classList.contains('show')) { b.hidden = true; b.classList.remove('leave'); } }, 420);
}

// ---- control state -----------------------------------------------------------------------------------------------------
let mode = 'betting', evenMoney = false;
let group = 'bet';
function setMode(m, even = false) {
  const was = mode; mode = m; evenMoney = even; document.body.dataset.mode = m; refreshControls();
  if (m === 'betting' && (was !== 'betting' || !betJobs.length) && !busy) othersBet();
  if (m === 'betting' && was !== 'betting' && !lobby.isOpen) dealerSays('place-bets', { prio: 2, fresh: 4000 });
  const g = m === 'betting' ? 'bet' : 'play';           // the dock's buttons rise in when its set changes
  if (g !== group) { group = g; ui.enter(g === 'bet' ? [...$$('.betting .tray-toggle, .betting .tile'), ...chipRow.children, ...$$('.bet-actions .pill')] : $$('.decisions .act'), { gap: 28 }); }
  if (m === 'insurance') ui.enter($$('#insurance .ins-copy, #insurance .ins-btn'), { y: 12, gap: 60 });
}
function reasonFor(act) {
  if (table.phase !== 'player') return '';
  const h = table.activeHand;
  if (act === 'double') {
    if (h.splitAces) return 'Not on split aces';
    if (h.cards.length !== 2) return 'First two cards only';
    if (table.balance < h.stake) return 'Not enough balance';
  }
  if (act === 'split') {
    if (table.isSplit) return 'One split per hand';
    if (!table.isPair) return 'Needs a pair';
    if (table.balance < h.stake) return 'Not enough balance';
  }
  return '';
}
function swapIn(el, on) { el.classList.toggle('gone', !on); el.inert = !on; el.setAttribute('aria-hidden', !on); }
function refreshControls() {
  const betting = mode === 'betting' && !busy;
  $('#undo').disabled = !betting || !table.history.length;
  $('#clear').disabled = !betting || !table.bet;
  // Rebet and Double bets share one slot, so the row never changes width when a chip goes down.
  const showX2 = !!table.bet;
  swapIn($('#rebet'), !showX2); swapIn($('#x2'), showX2);
  $('#rebet').disabled = !betting || !table.canRebet || showX2; $('#x2').disabled = !betting || !table.canDoubleBets || !showX2;
  $('#deal').disabled = !betting || (!table.bet && !table.canRebet) || (table.bet > 0 && table.belowMinimum);
  ui.morph($('#deal').querySelector('.label'), !table.bet && table.canRebet ? 'Rebet & deal' : 'Deal');
  for (const b of chipRow.children) b.disabled = +b.dataset.value > table.balance - (table.phase === 'betting' ? table.cost : 0);
  for (const id of SPOTS) spotEls[id].disabled = !betting || (id !== 'main' && !settings.sides);
  for (const t of $$('.tile')) t.disabled = !betting;
  const playing = mode === 'player' && !!decide;
  const can = { hit: table.canHit, stand: table.canStand, double: table.canDouble, split: table.canSplit };
  for (const [act, free] of [['double', playing && table.freeDouble], ['split', playing && table.freeSplit]]) {
    const b = $(`#act-${act}`); let tag = b.querySelector('.free-tag');
    if (!tag) { tag = document.createElement('span'); tag.className = 'free-tag'; tag.textContent = 'FREE'; b.append(tag); }
    tag.hidden = !free;
  }
  for (const act of ['hit', 'stand', 'double', 'split']) {
    const b = $(`#act-${act}`); b.disabled = !playing || !can[act];
    b.querySelector('.why').textContent = playing && !can[act] ? reasonFor(act) : '';
  }
  if (mode === 'player' && playing) {
    const h = table.activeHand, t = total(h.cards), up = table.upCard;
    hint(`${table.isSplit ? `Hand ${table.activeIndex + 1}: ` : ''}${handLabel(h.cards, { bj: false })} against the dealer's ${up.rank === 'A' ? 'ace' : total([up]).value}.${t.value === 21 ? '' : ''}`);
  }
  const ins = $('#insurance');
  ins.hidden = mode !== 'insurance';
  if (mode === 'insurance') {
    ins.querySelector('h2').textContent = evenMoney ? 'Even money?' : 'Insurance?';
    ins.querySelector('p').textContent = evenMoney
      ? `Your blackjack against an ace. Take ${fmt(table.stakes.main)} now at 1:1, or play on for 3:2.`
      : `The dealer shows an ace. Insure for ${fmt(table.insuranceCost)}; it pays 2:1 if the dealer has blackjack.`;
    const up = table.upCard; ins.querySelector('.ins-ace i').textContent = up?.suit ?? ''; ins.querySelector('.ins-ace').classList.toggle('red', up?.suit === '♥' || up?.suit === '♦');
    $('#ins-yes').disabled = !table.canInsure; $('#ins-yes').querySelector('.label').textContent = evenMoney ? 'Take even money' : `Insure ${fmt(table.insuranceCost)}`;
    $('#ins-no').querySelector('.label').textContent = evenMoney ? 'Play on' : 'No insurance';
  }
  if (betting) {
    if (!table.bet) hint(table.canRebet ? `Place your bets, or rebet ${fmt(Object.values(table.lastLayout).reduce((a, b) => a + b, 0))}${table.mode === 'lightning' ? ` plus a ${fmt(table.lastLayout.main)} fee` : ''}.` : 'Choose a chip, then tap a circle to bet.');
    else if (table.belowMinimum) hint('Side bets ride with a main bet. Put a chip on the main circle.');
    else hint(`Bet ${fmt(table.bet)}. Deal when ready.`);
  }
}
$('#ins-yes').onclick = () => choose('yes'); $('#ins-no').onclick = () => choose('no');
stage.addEventListener('click', e => { if (mode === 'result' && !e.target.closest('button')) choose('next'); });

// ---- keyboard ------------------------------------------------------------------------------------------------------------
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || $('#settingsDialog').open || lobby.isOpen) return;
  if (e.target.closest?.('input,select,textarea')) return;
  if (room === 'roulette') { roulette?.onKey(e); return; }
  const k = e.key.toLowerCase();
  if (mode === 'player') { const act = { h: 'hit', s: 'stand', d: 'double', p: 'split' }[k]; if (act) { e.preventDefault(); if (!$(`#act-${act}`).disabled) choose(act); } return; }
  if (mode === 'insurance') { if (k === 'y') choose('yes'); if (k === 'n') choose('no'); return; }
  if (mode === 'result' && (k === ' ' || k === 'enter')) { e.preventDefault(); choose('next'); return; }
  if (mode !== 'betting') return;
  if ((k === ' ' || k === 'enter') && !e.target.closest?.('button')) { e.preventDefault(); actions.deal(); }
  else if (k === 'u' || k === 'backspace') actions.undo();
  else if (k === 'c') actions.clear();
  else if (k === 'r') actions.rebet();
  else if (k === 'x') actions.double();
  else if (/^[1-7]$/.test(k)) selectChip(CHIP_VALUES[+k - 1]);
});

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
function bindToggle(id, key, apply) { const el = $(id); el.checked = settings[key]; el.onchange = () => { uiSound('toggle'); settings[key] = el.checked; store.set(key, el.checked); apply(el.checked); }; apply(settings[key]); }
bindToggle('#optSound', 'sound', on => { audio.setEnabled(on); $('#sound').setAttribute('aria-pressed', on); $('#sound').classList.toggle('off', !on); });
let hapticsReady = false;   // a tap when you switch them on, not when the page sets the switch
bindToggle('#optHaptics', 'haptics', on => { if (on && hapticsReady) feel.tap('press'); }); hapticsReady = true;
bindToggle('#optReduced', 'reduced', on => { motion.reduced = on; roulette?.setReduced(on); ui.setReduced(on); kit.setReduced(on); document.body.classList.toggle('reduced', on); });
const gfxSel = $('#optGfx'); gfxSel.value = settings.gfx;
const gfxNote = () => { $('#gfxNote').textContent = `${world.quality.name === 'high' ? 'Sharp' : world.quality.name === 'phone' ? 'Balanced' : 'Battery saver'} · ${world.pixelRatio}× pixels`; };
gfxSel.onchange = () => { settings.gfx = gfxSel.value; store.set('gfx', settings.gfx); world.setQuality(gfxProfile(settings.gfx)); roulette?.setQuality(gfxProfile(settings.gfx)); gfxNote(); };
$('#settings').addEventListener('click', gfxNote);
bindToggle('#optFast', 'fast', on => { motion.slow = on ? .62 : 1; roulette?.setFast(on); });
// How many others sit with you. Changes take effect between hands.
const playersSel = $('#optPlayers'); playersSel.value = String(settings.players);
const playersNote = () => { const n = others().length; $('#playersNote').textContent = n ? others().map(x => x.p.name).join(', ') : 'A private table'; };
playersSel.onchange = () => { settings.players = +playersSel.value; store.set('players', settings.players); if (!busy && table.phase === 'betting') { const ch = seating.arrange(settings.players); for (const c of ch) if (c.left) view.syncStack(seatKey(c.seat), []); renderSeats(); othersBet(); } playersNote(); };
$('#settings').addEventListener('click', playersNote);
// Dealers rotate with each new shoe, as they do on a casino floor, unless one is chosen here.
const dealerSel = $('#optDealer'); dealerSel.value = settings.dealer;
const dealerNote = () => { $('#dealerNote').textContent = `Now dealing: ${view.dealer.name}`; };
function changeDealer() {
  if (settings.dealer !== 'rotate') return null;
  const others = Object.values(DEALERS).filter(d => d !== view.dealer);
  view.dealer = others[Math.floor(Math.random() * others.length)]; dealerNote(); return view.dealer;
}
dealerSel.onchange = () => { settings.dealer = dealerSel.value; store.set('dealer', settings.dealer); if (DEALERS[settings.dealer]) view.dealer = DEALERS[settings.dealer]; dealerNote(); };
view.dealer = DEALERS[settings.dealer] ?? Object.values(DEALERS)[Math.floor(Math.random() * 4)]; dealerNote();
bindToggle('#optSides', 'sides', on => {
  for (const b of SIDE_BETS) { world.spots[b.id].visible = on; spotEls[b.id].hidden = !on; } world.spots.band.visible = on; $('#tray').hidden = !on;
  if (!on && table.phase === 'betting' && table.sideBet) { for (const b of SIDE_BETS) { table.bets[b.id] = []; } table.history = table.history.filter(s => s === 'main'); serial(syncAllStacks); }
  world.requestRender(); renderBets(); refreshControls();
});
for (const [id, k] of [['#mixTable', 'table'], ['#mixVoice', 'voice'], ['#mixMusic', 'music']]) {
  const el = $(id); el.value = settings.mix[k];
  el.oninput = () => { settings.mix[k] = +el.value; store.set('mix', settings.mix); audio.setLevels(settings.mix); };
  if (k === 'voice') el.onchange = () => dealerSays('place-bets', { prio: 3 });   // hear the level you set
}
$('#volume').value = settings.volume; $('#volume').oninput = e => { settings.volume = +e.target.value; store.set('volume', settings.volume); audio.setVolume(settings.volume); };
$('#sound').onclick = () => { $('#optSound').checked = !settings.sound; $('#optSound').onchange(); if (settings.sound) { audio.unlock(); uiSound('toggle'); } };
kit.holdToConfirm($('#resetBalance'), async () => {   // hold, so a stray tap can't wipe your balance
  setTimeout(closeSheet, 350); if (busy) { motion.finishAll(); }
  await misdealQuiet(); table.balance = 1000; table.lastLayout = null; renderBalance(); renderBets(); refreshControls(); roulette?.refresh(); hint('Balance reset to 1,000.');
});
for (const d of $$('.sheet details')) kit.accordion(d);
async function misdealQuiet() { table.abandon(); for (const { p } of others()) p.refund(); renderSeats(); world.setPan(0); decide = null; view.clearCards(); view.clearChips(); hideBanner(); clearFeed(); for (const t of Object.values(totals)) t.hidden = true; busy = false; setMode('betting'); }
// ---- Lightning ------------------------------------------------------------------------------------------------------------
// Modelled on the live game: a black-and-gold board of multipliers over the dealer, struck as the
// cards go out. The house lights dip, and for each total a bolt comes down out of the dark through
// its cell and grounds on the felt in sparks. Win on a struck total and a bolt carries that
// multiplier from the board down to a badge on your bet, where it waits for your next win; cash it
// and a gold bolt hits the badge and the whole table flashes.
const LABEL = { le17: '4–17', 18: '18', 19: '19', 20: '20', 21: '21', bj: 'BJ' };
const lightning = (() => {
  const L = createLightning3D(world, { reduced: () => settings.reduced });
  const box = $('#lightning'), row = box.querySelector('.lb-row'), cells = {};
  for (const b of BUCKETS) { const c = document.createElement('div'); c.className = 'lb-cell'; c.dataset.b = b; c.innerHTML = `<small>${LABEL[b]}</small><b>–</b>`; row.append(c); cells[b] = c; }
  const fx = document.createElement('div'); fx.className = 'zap'; fx.hidden = true; fx.innerHTML = '<div class="flash"></div><div class="splash" hidden><small>Lightning</small><b></b><em></em></div>'; stage.append(fx);
  const flashEl = fx.querySelector('.flash'), splash = fx.querySelector('.splash');
  const badge = document.createElement('div'); badge.className = 'l-badge'; badge.hidden = true; badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 2 4.8 13.4h6l-1.4 8.6 8.8-11.4h-6L13.6 2Z"/></svg><b></b><small></small>'; overlay.append(badge);
  function flash(power = .3) { if (settings.reduced) return; flashEl.animate([{ opacity: power }, { opacity: power * .2, offset: .2 }, { opacity: power * .7, offset: .3 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' }); }
  function shake(px = 4) { if (settings.reduced) return; stage.animate([{ translate: '0 0' }, { translate: `${px}px ${-px / 2}px` }, { translate: `${-px}px ${px / 2}px` }, { translate: `${px / 2}px 0` }, { translate: '0 0' }], { duration: 260 }); }
  const set = (b, text) => { const v = cells[b].querySelector('b'); if (v.textContent !== text) ui.morph(v, text); };
  const blank = () => { for (const b of BUCKETS) { set(b, '–'); cells[b].classList.remove('struck', 'hot', 'lit', 'flash'); } };
  // a board cell in screen terms (NDC): its centre x and its bottom edge
  const ndcOf = el => { const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: ((r.left + r.width / 2 - s.left) / s.width) * 2 - 1, bottom: 1 - ((r.bottom - s.top) / s.height) * 2 }; };
  // your badge sits on the near rim of your main circle, as the live game marks the bet it rides on
  const rim = () => { const m = LAYOUT.spots.main; return new world.THREE.Vector3(m.x, 1.5, m.z + m.r); };
  function renderBadge(fresh) {
    const p = table.pending, on = !!p && table.mode === 'lightning' && !lobby.isOpen;
    badge.hidden = !on; L.charge(on); if (!on) return;   // live current runs round your circle while the multiplier waits
    badge.querySelector('b').textContent = `×${p.m}`; badge.querySelector('small').textContent = `pays ${fmt(p.fee * p.m)}`;
    badge.title = `Lightning ×${p.m}: your next win pays ${fmt(p.fee * p.m)} more`;
    layout(); if (fresh) { badge.classList.remove('arrive'); void badge.offsetWidth; badge.classList.add('arrive'); }
  }
  function layout() { if (!badge.hidden) { const m = LAYOUT.spots.main, q = world.project(m.x, 0, m.z + m.r); badge.style.left = `${Math.round(q.x)}px`; badge.style.top = `${Math.round(q.y)}px`; } }   // left/top, not transform: the arrive and spent animations scale the badge
  return {
    layout, three: L, cellNdc: b => ndcOf(cells[b]),
    show(on) { box.hidden = fx.hidden = !on; if (!on) L.clear(); else if (table.phase === 'betting') blank(); framed = ''; reframeNow(); renderBadge(false); },
    reset() { if (!box.hidden) blank(); renderBadge(false); },
    preview(on) { L.ambient(on); },
    async strike(board) {
      blank(); box.classList.add('charging'); audio.cue('charge', { gain: .55 });
      const fast = settings.fast, gap = motion.reduced ? 0 : fast ? 150 : 230;
      await L.dim(1); await motion.wait(fast ? 180 : 260);
      // strike in a shuffled order, the biggest last, as the live show builds to it
      const order = [...BUCKETS].sort(() => Math.random() - .5).sort((a, b) => board[a] - board[b]);
      for (const [i, b] of order.entries()) {
        const m = board[b], hot = m >= (b === 'bj' ? 15 : 8), c = cells[b], n = ndcOf(c);
        // down through the cell and into the felt; the cell lights as the return stroke lands
        L.hit(L.ground(n.x), { hot, fromX: n.x }).then(() => {
          c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash', 'struck'); c.classList.toggle('hot', hot);
          set(b, `${m}×`); flash(hot ? .45 : .18); if (hot) shake(5);
          audio.cue(hot ? 'strike' : `spark-${(i % 4) + 1}`, { gain: hot ? .8 : .5, rate: .95 + Math.random() * .1 });
          if (hot) setTimeout(() => audio.cue(take('thunder', 2), { gain: .5 }), 140);
        });
        await motion.wait(gap);
      }
      await motion.wait(fast ? 180 : 300);
      box.classList.remove('charging'); await L.dim(0, 600);
    },
    async settle(r) {
      layout();
      if (r.bonus) {   // the multiplier you carried in pays: a gold bolt onto your badge, the table goes white
        const at = rim(); L.charge(false); await L.hit(at, { hot: true, width: 1.9, life: 620, n: 120, size: 60 }); L.flare(at, { color: '#ffe0a0', size: 60, life: 700 });
        flash(.6); shake(8); audio.cue('strike', { gain: .9 });
        splash.querySelector('b').textContent = `×${r.bonus.m}`; splash.querySelector('em').textContent = `+${fmt(r.bonus.amount)}`;
        splash.hidden = false; splash.classList.remove('go'); void splash.offsetWidth; splash.classList.add('go');
        badge.classList.add('spent'); setTimeout(() => { badge.classList.remove('spent'); renderBadge(false); }, 700);
        await motion.wait(settings.fast ? 1100 : 1600); splash.hidden = true;
      } else if (r.lost) { badge.classList.add('lost'); audio.cue(take('zap', 2), { gain: .35 }); await motion.wait(420); badge.classList.remove('lost'); }
      if (r.earned) {   // a bolt carries this hand's multiplier from its cell on the board down to your bet
        const c = cells[r.earned.bucket], n = ndcOf(c), to = rim(); c.classList.add('lit');
        L.hit(to, { from: L.atScreen(n.x, n.bottom, to), width: .9, life: 520, n: 30, size: 26 });
        audio.cue('reveal-sting', { gain: .6 }); setTimeout(() => audio.cue('win-bling', { gain: .5 }), 220);
        await motion.wait(260);
      }
      renderBadge(!!r.earned);
      if (r.bonus) { const li = document.createElement('li'); li.className = 'win bolt'; li.innerHTML = '<b>Lightning</b><span></span><em></em>'; li.querySelector('span').textContent = `×${r.bonus.m} on your ${fmt(r.bonus.amount / r.bonus.m)} fee`; li.querySelector('em').textContent = `+${fmt(r.bonus.amount)}`; $('#feed').append(li); requestAnimationFrame(() => requestAnimationFrame(() => li.classList.add('show'))); }
    },
  };
})();
lightningLayout = lightning.layout;

// Rules and paytables, written from the same data the game settles with.
const slotBets = () => SIDE_BETS.map(b => b.id === 'dpairs' && table.mode === 'freebet' ? PUSH22 : b);
function renderRules() {
  const m = MODES[table.mode];
  $('#paytables').innerHTML = slotBets().map(b => `<section><h4>${b.name}</h4><p>${b.cards}. Limit ${LIMITS.side[0]}–${LIMITS.side[1]}.</p><table>${b.table.map(([l, p]) => `<tr><td>${l}</td><td>${p}:1</td></tr>`).join('')}</table></section>`).join('');
  $('#modeRulesTitle').hidden = $('#modeRules').hidden = !m.rules.length;
  $('#modeRulesTitle').textContent = `At the ${m.name} table`; $('#modeRules').innerHTML = m.rules.map(r => `<li>${r}</li>`).join('');
}
// Moving to another table: its printing on the felt, its side bet in the last slot, its rules and name.
function applyMode(id, { announce = true } = {}) {
  if (!MODES[id] || (busy && id !== table.mode) || table.phase !== 'betting') return false;
  const was = table.mode; table.mode = id; settings.mode = id; store.set('mode', id);
  for (const { p } of seating.players) p.mode = id;
  const slot = id === 'freebet' ? PUSH22 : DPAIRS;
  world.setMode(MODES[id], slot);
  paintTile($('.tile[data-spot="dpairs"]'), slot); SPOT_NAME.dpairs = slot.name;
  spotEls.dpairs.setAttribute('aria-label', `${slot.name} side bet, pays up to ${Math.max(...slot.table.map(r => r[1]))} to 1`);
  if (was !== id && table.betOn('dpairs')) { table.bets.dpairs = []; table.history = table.history.filter(s => s !== 'dpairs'); serial(() => view.syncStack('dpairs', [])); }
  $('#tableName').textContent = MODES[id].title; document.title = `${BRAND_TITLE} · ${MODES[id].name === 'Classic' ? 'Blackjack' : `${MODES[id].name} Blackjack`}`;
  renderRules(); renderBets(); refreshControls();
  document.body.dataset.table = id; lightning.show(id === 'lightning');
  if (announce && was !== id) hint(id === 'freebet' ? 'Free Bet table: free doubles on 9, 10 and 11, free splits on pairs, and a dealer 22 pushes.' : id === 'lightning' ? 'Lightning table: a fee equal to your bet comes off with the deal. Win on a struck total and your next win pays the fee times the multiplier.' : 'The Classic table.');
  return true;
}
applyMode(settings.mode, { announce: false });
addEventListener('pointerdown', () => { audio.unlock(); warmSounds(); roomFor(lobby.isOpen); }, { once: true });
// Every push button answers with a soft tick of its own (chips and bets have their own sounds).
document.addEventListener('click', e => { const b = e.target.closest('.pill, .icon, .act, .tray-toggle'); if (b && !b.disabled && b.id !== 'settings' && b.id !== 'closeSettings' && b.id !== 'trayToggle' && b.id !== 'sound' && !b.classList.contains('seat')) uiSound('click'); }, true);
// A phone on its side has no room over the felt for results: they move into the control column.
const sideways = matchMedia('(orientation: landscape) and (max-height: 520px)');
const placeFeed = () => { const f = $('#feed'); if (sideways.matches) $('.dock').prepend(f); else stage.append(f); };
sideways.addEventListener('change', placeFeed); placeFeed();

// ---- start -----------------------------------------------------------------------------------------------------------------
reframeNow();
// Every control answers the finger. The Deal button and the four decisions are push buttons with a
// real bottom edge (CSS); the rest squash on a spring.
ui.pressable(document, '.pill:not(.deal):not(.hold-btn), .tile, .tray-toggle, .icon'); ui.pressable(document, '.chip', { depth: .88 });
ui.setReduced(settings.reduced); kit.setReduced(settings.reduced);
kit.shimmer($('#deal'));
table.draw(); world.discard.set(1);   // this shoe's burn card
stageNext(); renderBalance(); renderBets(); renderSeats(); setMode('betting');
document.body.classList.add('ready');
// ---- rooms: the blackjack table and the roulette wheel share the salon, its bar, wallet and sound -------------------------------------
const loadRoulette = () => rouletteLoading ??= import('./roulette/rgame.mjs').then(m => m.createRoulette({
  app: $('.app'), audio, settings, store, ui, kit, feel, wallet, uiSound, sting, fmt, signed, quality: () => gfxProfile(settings.gfx),
  showBalance: () => { const v = wallet.balance; if (v !== shownBalance) { ui.morph($('#balance'), fmt(v)); if (v > shownBalance) ui.bump($('#balance'), 1.1); shownBalance = v; } },
  showInPlay: v => ui.morph($('#bet'), fmt(v)),
  barCover: el => { const b = $('.top').getBoundingClientRect(), r = el.getBoundingClientRect(); return Math.max(0, Math.round(b.bottom - r.top)); },
})).then(r => (roulette = r)).catch(err => { rouletteLoading = null; throw err; });
function setRoom(r) {
  if (r === room) return; room = r; store.set('room', r); document.body.dataset.room = r;
  if (r === 'roulette') {
    world.showcase.stop(0); lightning.preview(false); roulette.show();
    $('#tableName').textContent = 'EUROPEAN ROULETTE'; document.title = `${BRAND_TITLE} · Roulette`;
    ui.morph($('#balance'), fmt(wallet.balance)); shownBalance = wallet.balance;
  } else {
    roulette?.hide();
    if (!busy && table.phase === 'betting') { table.balance = wallet.balance; if (table.cost > table.balance) { table.clear(); serial(syncAllStacks); hint('Your bets were cleared: your balance changed at the wheel.'); } }
    applyMode(table.mode, { announce: false }); framed = ''; reframeNow(); renderBalance(); renderBets(); refreshControls();
  }
}
if (store.get('room', 'blackjack') === 'roulette') { try { await loadRoulette(); setRoom('roulette'); } catch (err) { console.error('roulette failed to load', err); rouletteLoading = null; store.set('room', 'blackjack'); } }
document.body.dataset.room = room;
// The lobby: the casino's front room, over the table at every visit; the brand in the bar returns to it.
$('#brandMark').innerHTML = monogram();
lobby.init({
  mode: () => room === 'roulette' ? 'roulette' : table.mode,
  // picking a table in the lobby re-dresses the room behind the menu: the blackjack table, or the wheel
  preview: async mode => {
    uiSound('select');
    if (mode === 'roulette') { await loadRoulette(); if (!lobby.isOpen) return; setRoom('roulette'); roulette.showcase.start(settings.reduced); if (audio.unlocked) roomFor(true); return; }
    if (room !== 'blackjack') { setRoom('blackjack'); world.showcase.start(settings.reduced); }
    if (mode !== table.mode) applyMode(mode, { announce: false }); lightning.preview(mode === 'lightning');
  },
  play: async (game, mode) => {
    audio.unlock(); audio.cue('whoosh', { bus: 'ui', gain: .6 });
    if (game === 'roulette') {
      await loadRoulette(); if (room !== 'roulette') setRoom('roulette'); roomFor(false);
      await roulette.enter(settings.reduced ? 0 : 1400);   // the camera flies down into your chair
      document.body.classList.remove('flying'); return;
    }
    if (room !== 'blackjack') { setRoom('blackjack'); world.showcase.start(true); }
    if (mode && mode !== table.mode) applyMode(mode); roomFor(false); lightning.preview(false); lightning.reset();
    await world.showcase.stop(settings.reduced ? 0 : 1400);   // the camera flies down into your seat
    document.body.classList.remove('flying'); layoutOverlay(); seatedNow();
    if (mode === 'betting' && !busy && !table.bet) dealerSays('place-bets');
  },
  change: open => {
    if (audio.unlocked) roomFor(open);
    if (open) { if (room === 'roulette') { roulette.leave(); roulette.showcase.start(settings.reduced); } else { world.showcase.start(settings.reduced); lightning.preview(table.mode === 'lightning'); } }
    else { document.body.classList.add('flying'); if (room === 'blackjack') { framed = ''; reframeNow(); } }   // reframe for the seat: at Lightning the board now takes the head of the table
  },
});
// the lobby opens between rounds, never with money on a spinning wheel or a hand in play
$('#brandBtn').onclick = () => { if ($('#settingsDialog').open) return; if (room === 'roulette' ? roulette?.busy : busy) { (room === 'roulette' ? null : hint)?.('Finish this hand first.'); kit.shake($('#brandBtn')); return; } lobby.open(); };
if (!params.has('table')) lobby.open(); else if (room === 'roulette') roulette.enter(0); else seatedNow();
// Test hooks (used by the automated checks; harmless in play).
window.__spader = { get roulette() { return roulette; }, feel, settings, loadRoulette, setRoom, table, view, motion, world, audio, choose, seating, lightning, get mode() { return mode; }, get busy() { return busy; }, rig(order) { const c = s => ({ rank: s.slice(0, -1), suit: s.slice(-1) }); table.cards.push(...order.map(c).reverse()); stageNext(); } };
window.done = true;
