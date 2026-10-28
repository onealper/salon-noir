// The blackjack room: the controller between the rules engine (engine.mjs), the table view (scene/) and the
// controls. It reads the engine, drives the table view and runs the dock. It shares the salon's top bar, wallet,
// sound and settings with the roulette room (passed in as `ctx` by app.mjs) and has the same lifecycle: show/hide,
// toLobby/fromLobby, enter, onKey, setFast/setReduced/setQuality, refresh, busy.
import { Table, record, total, natural, isTen, LIMITS, CUT_AT, SHOE_CARDS, SPOTS } from '../engine.mjs';
import { SIDE_BETS, PUSH22 } from '../sidebets.mjs';
import { MODES } from '../core/modes.mjs';
import { createWorld, LAYOUT, toSeat } from '../scene/world.mjs';
import { createPortal } from '../scene/portal.mjs';
import { Seating, SEAT_COUNT, YOU } from '../players.mjs';
import { loadCourtArt, CARD_W, CARD_H } from '../scene/textures.mjs';
import { wallet, inFlight } from '../core/wallet.mjs';
import { ledger } from '../core/ledger.mjs';
import { lobby } from '../core/lobby.mjs';
import { Motion, ease } from '../scene/pieces.mjs';
import { TableView, DEALERS, handKey, handX } from '../scene/view.mjs';
import { fmt, signed } from '../core/format.mjs';
import { chipRack, hintLine, rebetSlot, goLabel, serialQueue, betKey } from '../core/bet-controls.mjs';
import { TRAY_ICONS } from './tray-icons.mjs';
import { createLightningUI } from './lightning-ui.mjs';
import { handEntry, sideLine } from './book.mjs';
import * as ui from '../ui-motion.mjs';
import * as kit from '../ui-kit.mjs';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const SIDE = Object.fromEntries(SIDE_BETS.map(b => [b.id, b])), DPAIRS = SIDE.dpairs;
const SPOT_NAME = { main: 'Main bet', ...Object.fromEntries(SIDE_BETS.map(b => [b.id, b.name])) };
const keyOf = spot => spot === 'main' ? 'h0' : spot;
const maxPays = id => Math.max(...SIDE[id].table.map(r => r[1]));   // the slot's own bet; the Free Bet table repaints the last slot
// The dealer's lines (both voices), fetched with the salon's sounds.
const BJ_LINES = ['place-bets', 'dealer-ace', 'insurance', 'even-money', 'lightning', 'blackjack', 'dealer-blackjack', 'dealer-17', 'dealer-18', 'dealer-19', 'dealer-20', 'dealer-21', 'dealer-busts', 'push', 'nicely-played', 'new-shoe'];

export function createBlackjack(ctx) {
  const { settings, store, audio, feel, uiSound, sting, take } = ctx;
  const canvas = $('#table'), stage = $('#stage'), overlay = $('#overlay');
  const world = createWorld(canvas, { specs: SIDE_BETS, quality: ctx.quality(), mode: MODES[settings.mode] });
  const portal = createPortal(world, { body: world.table, floorY: world.floorY(), showcase: world.showcase, audio, reduced: () => settings.reduced });   // (the lobby's change of game: scene/portal.mjs)
  const motion = new Motion(world), view = new TableView(world, motion, audio);
  const table = new Table({ random: ctx.random, balance: wallet.balance, mode: settings.mode });
  { const p = store.get('lightningPending', null); if (p?.m > 0 && p.fee > 0) table.pending = p; }   // a multiplier you earned waits for you across visits
  if (ctx.carried?.lastLayout) table.lastLayout = ctx.carried.lastLayout;   // a hand the salon played out as it opened (app.mjs) can be rebet
  let visible = false;   // the room is in view (behind the lobby or at the table); it starts out of sight, and show() brings it in
  // Every move of a hand is written down as it happens, with the balance and the Lightning multiplier in the same
  // moment (one task, so a reload can't fall between them), and the record goes once the hand is settled. The record
  // leaves out the order of the shoe and the hole card (engine.mjs record), so storage can't tell you the next card.
  let saving = false, synced = wallet.balance;   // synced: the wallet as this table last wrote or read it
  function save() {
    if (inFlight.lost('hand')) return;   // settled in another window; the page is reloading
    saving = true; try { wallet.set(table.balance); } finally { saving = false; } table.balance = synced = wallet.balance;   // another window's change, added in by the wallet, joins the table too
    store.set('lightningPending', table.pending);
    inFlight.set('hand', table.phase === 'betting' || table.phase === 'result' ? null : record(table));
  }
  for (const m of ['start', 'draw', 'initialCard', 'finishDeal', 'insure', 'hit', 'stand', 'double', 'split', 'splitCard', 'finishSplit', 'revealHole', 'dealerHit', 'settle', 'next', 'abandon']) {
    const f = table[m]; if (typeof f === 'function') table[m] = (...a) => { const v = f.apply(table, a); save(); return v; };
  }
  Object.assign(motion, { reduced: settings.reduced, slow: settings.fast ? .62 : 1 });

  // The dealer's voice: James's recordings for the men, Sofia's for the women.
  const dealerSays = (line, opts) => audio.say(`voice/${view.dealer.voice}-bj-${line}`, opts);
  ctx.warm(['james', 'sofia'].flatMap(v => BJ_LINES.map(l => `voice/${v}-bj-${l}`)));   // fetched with the salon's sounds at the first touch

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
  const HANDS = [0, 1, 2, 3];   // up to four hands of yours (Free Bet resplits)
  const totals = { 0: mk('hand-total'), 1: mk('hand-total'), 2: mk('hand-total'), 3: mk('hand-total'), dealer: mk('hand-total dealer') };
  // ---- the other players -------------------------------------------------------------------------------
  const seating = new Seating(); seating.arrange(settings.players);
  const others = () => seating.players.filter(x => x.seat !== YOU);
  const seatKey = k => `s${k}`;
  const seatEls = {};
  for (let k = 0; k < SEAT_COUNT; k++) {
    if (k === YOU) continue;
    const tag = document.createElement('div'); tag.className = 'seat-tag away'; tag.innerHTML = '<span class="av"></span><b></b><span class="bank"></span><span class="say"></span>'; overlay.append(tag);
    seatEls[k] = { tag, totals: HANDS.map(() => mk('hand-total seat')) };
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
    // beside a hand: left of it, or right of the second of two; three or four hands sit too close, so under each one
    const beside = (j, n, gap) => { const x = LAYOUT.player.x + handX(j, n); return n > 2 ? [x, LAYOUT.player.z + CARD_H * .5 + 2.4] : [j && n === 2 ? x + CARD_W * .5 + gap : x - CARD_W * .5 - gap, LAYOUT.player.z + 1]; };
    for (const k of HANDS) { const [x, z] = beside(k, view.handCount, 3.2); place(totals[k], x, 0, z); }
    const d = view.anchor('dealer', 0); place(totals.dealer, d.pos.x - CARD_W * .5 - 3.4, 0, d.pos.z);
    for (const [k, el] of Object.entries(seatEls)) {
      el.totals.forEach((t, j) => { const p = toSeat(+k, ...beside(j, view.seatHands(+k), 3)); place(t, p.x, 0, p.z); });
      const n = toSeat(+k, 0, 40); place(el.tag, n.x, 0, n.z);
    }
  }
  // Re-aim the camera only when the table's box really changes size (rotation, window resize), once per frame.
  let framed = '', reframe = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(reframe);
    reframe = requestAnimationFrame(reframeNow);
  }); ro.observe(stage); ro.observe($('.top')); ro.observe($('.dock'));
  // The top bar floats over the table; the camera frames the area below it (plus the bar's fade). A dock along the foot
  // of the picture is floated over it too: the canvas runs on under it, blurred, and the seat is framed clear of the blur.
  function reframeNow() {
    const w = stage.clientWidth, h = stage.clientHeight, bar = barCover(), top = bar + boardCover(bar), under = ctx.dockCover(stage), k = `${w}x${h}x${top}x${under}`; if (k === framed || !w || !h) return;
    framed = k; $('.app').style.setProperty('--top-h', `${bar}px`); $('.app').style.setProperty('--board-h', `${top - bar}px`); stage.style.setProperty('--under', `${under}px`);
    world.frame(w, h + under, top, under ? under + ctx.BLUR_RISE : 0); layoutOverlay();
  }
  // the Lightning board sits under the bar; the seat is framed below it so it never covers the dealer's cards
  function boardCover() { const b = $('#lightning'); return b.hidden || document.body.classList.contains('in-lobby') ? 0 : b.offsetHeight + 12; }
  const barCover = () => ctx.barCover(stage);   // how far the bar reaches down over the table
  // ---- readouts ----------------------------------------------------------------------------------------------
  function renderBalance(less = 0) { save(); ctx.showBalance(table.balance - less); }   // (`less`: shown later, as a Lightning bonus counts up)
  function renderBets() {
    const inPlay = table.phase !== 'betting', amount = id => inPlay ? 0 : table.betOn(id);
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
    for (const k of HANDS) {
      const h = table.hands[k], el = totals[k]; el.hidden = !h || !h.cards.length || k >= view.handCount || !view.cards.some(c => c.owner === k);
      if (el.hidden) continue;
      const shown = view.handCards(k).length, cards = h.cards.slice(0, shown);
      setTotal(el, handLabel(cards, { bj: !h.fromSplit })); el.classList.toggle('bust', total(cards).value > 21);
      el.classList.toggle('active', table.isSplit && table.phase === 'player' && table.activeIndex === k);
    }
    for (const [k, el] of Object.entries(seatEls)) el.totals.forEach((t, j) => {
      const shown = view.handCards(handKey(+k, j)).map(c => c.card); t.hidden = !shown.length;
      if (!shown.length) { delete t.dataset.v; return; }
      const split = view.seatHands(+k) > 1;
      if (!t.dataset.out) setTotal(t, handLabel(shown, { bj: !split })); t.classList.toggle('bust', total(shown).value > 21);
      t.classList.toggle('active', split && seating.seats[k]?.at === j && seatEls[k].tag.classList.contains('turn'));
    });
    const dc = view.handCards('dealer').filter(c => !c.hidden).map(c => c.card);
    totals.dealer.hidden = !dc.length; if (dc.length) setTotal(totals.dealer, handLabel(dc)); totals.dealer.classList.toggle('bust', total(dc).value > 21);
    layoutTotals();
  }
  // The hint line never blinks: clearing waits a moment in case a new line follows at once. Its words morph in the
  // line's own span, so the line keeps its place (see .hint in app.css).
  const hint = hintLine($('#hint'));

  // ---- chips and betting controls --------------------------------------------------------------------------------
  const chipRow = $('#chips'), rack = chipRack(chipRow, { store, uiSound });

  // ---- the side-bet tray: names and top payouts you can read on any screen ------------------------------------
  // A tile shows the bet in its slot: on the Free Bet table the Dealer Pairs slot holds Push 22.
  function paintTile(t, b) {
    const pays = Math.max(...b.table.map(r => r[1]));
    t.setAttribute('aria-label', `${b.name}, pays up to ${pays} to 1. ${b.cards}.`); t.title = `${b.name}: ${b.cards}. ` + b.table.map(([l, p]) => `${l} ${p}:1`).join(' · ') + `. House edge ${b.edge.toFixed(1)}%.`;
    t.style.setProperty('--c', TRAY_ICONS[b.id].c);
    t.innerHTML = `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24">${TRAY_ICONS[b.id].svg}</svg></span><b>${b.name.length > 13 && b.short ? b.short : b.name}</b><small><i>up to </i>${pays}:1</small><span class="amt"></span>`;
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
  const serial = serialQueue(fail);   // betting gestures run in order

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
    const why = refusal(spot, rack.value) ?? (table.addChip(spot, rack.value) ? null : 'That chip can’t go on this bet.');   // the engine has the last word: no chip is shown that wasn't bet
    if (why) { hint(why); flash(spotEls[spot]); const t = $(`.tile[data-spot="${spot}"]`); if (t) flash(t); feel.tap('refuse'); feel.cue('error'); return; }
    renderBets(); refreshControls(); feel.tap('chip');
    // chips can be tossed in quick succession: the next one only waits a beat, not the whole flight
    serial(() => { const f = view.addChip(keyOf(spot), rack.value); return Promise.race([f, motion.wait(90)]); });
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
    rebet() { if (busy || !table.rebet()) return; hideBanner(); renderBets(); refreshControls(); serial(syncAllStacks); },
    double() { if (busy || !table.doubleBets()) return; renderBets(); refreshControls(); serial(syncAllStacks); },
    deal() {
      if (busy) return; feel.tap('press'); hideBanner();
      if (broke()) { ctx.resetBalance(); return; }   // out of chips: the gold button deals a fresh stack instead
      if (!table.bet && table.canRebet) actions.rebet();
      const why = dealRefusal(); if (why) { hint(why); flash(spotEls.main); feel.tap('refuse'); feel.cue('error'); return; }
      busy = true; setMode('busy'); serial(round);   // claimed at once: a second press, or a chip tapped before the cards go out, finds the table busy
    },
  };
  // Why the bets on the felt can't be dealt as they stand, or null.
  const dealRefusal = () => table.belowMinimum ? (table.bet ? 'Side bets ride with a main bet. Put a chip on the main circle.' : 'Place a bet on the main circle to deal.')
    : table.cost > table.balance ? (table.mode === 'lightning' ? 'Not enough balance for this bet and its Lightning fee.' : 'Not enough balance for this bet.') : null;
  // Out of chips with nothing on the felt: no bet is possible, so one tap gives a fresh 1,000 (there is nothing to lose).
  const broke = () => table.phase === 'betting' && !table.bet && table.balance < table.costOf({ main: LIMITS.main[0] });
  // Bets the balance no longer covers come off, with a word why (it moved under them, or this table's fee makes them dearer).
  function fitBets(why) { if (busy || table.phase !== 'betting' || table.cost <= table.balance) return false; table.clear(); renderBets(); refreshControls(); serial(syncAllStacks); hint(why); return true; }
  const feeCleared = () => table.mode === 'lightning' ? 'Your bets were cleared: at the Lightning table each main bet also costs a fee of the same size.' : 'Your bets were cleared: they came to more than your balance.';
  $('#undo').onclick = actions.undo; $('#clear').onclick = actions.clear; $('#rebet').onclick = actions.rebet; $('#x2').onclick = actions.double; $('#deal').onclick = actions.deal;

  // ---- the other players' bets: pushed out while you decide on yours -------------------------------------------------
  // Each player puts their chips down at their own moment during betting. Pressing Deal hurries anyone
  // still making up their mind.
  let betJobs = [];
  function othersBet() {
    for (const b of betJobs) b.cancel();   // jobs from before (the table was re-seated): they must not bet for a seat that has changed
    betJobs = others().filter(({ p }) => !p.stake && p.wantsToPlay()).map(({ seat, p }) => {
      // their chips go down only once you are at the table: nothing clatters while you're in the lobby
      let fire = () => {}, timer = 0, hurried = false, cancelled = false;
      const go = whenSeated().then(() => new Promise(r => { fire = r; if (hurried || cancelled) r(); else timer = setTimeout(r, 450 + Math.random() * 2400); }));
      const job = go.then(async () => {
        if (lobby.isOpen && !hurried && !cancelled) await whenSeated();   // back in the lobby before they bet: they wait too
        if (cancelled || seating.seats[seat] !== p || table.phase !== 'betting' || p.stake) return;
        p.mode = table.mode; if (!p.wantsToPlay()) return;
        const amount = p.chooseBet(); p.placeBet(amount); const sides = p.chooseSides(); renderSeats();
        await view.addAmount(seatKey(seat), amount);
        for (const [id, v] of Object.entries(sides)) await view.addAmount(seatKey(seat) + (id === 'pairs' ? 'p' : 't'), v);
      });
      return { hurry: () => { hurried = true; clearTimeout(timer); fire(); }, cancel: () => { cancelled = true; clearTimeout(timer); fire(); }, job };
    });
  }
  let seatWaiters = [];
  const whenSeated = () => lobby.isOpen || !visible || !document.body.classList.contains('seated') ? new Promise(r => seatWaiters.push(r)) : Promise.resolve();
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
    li.querySelector('b').textContent = r.name; li.querySelector('span').textContent = r.payout > 0 ? `${r.line} · ${r.pays}:1` : (r.seen ??= sideLine(r, table)); li.querySelector('em').textContent = signed(r.net);
    $('#feed').append(li); requestAnimationFrame(() => requestAnimationFrame(() => li.classList.add('show')));   // toast overshoot
  }
  function clearFeed() { $('#feed').replaceChildren(); $('#feed').classList.remove('stay'); for (const id of SPOTS) spotEls[id].querySelector('.amount').classList.remove('won'); }

  async function round() {   // actions.deal() has claimed the table (busy)
    const why = table.phase === 'betting' ? dealRefusal() : 'The cards are already out.';   // asked again: the balance can move while the chips land
    if (why) { busy = false; setMode('betting'); hint(why); flash(spotEls.main); feel.tap('refuse'); feel.cue('error'); return; }
    busy = true; setMode('busy');
    try {
      await othersReady();
      if (!table.start()) { busy = false; setMode('betting'); hint(dealRefusal() ?? 'The cards could not be dealt. Try again.'); return; }
      if (table.shuffled) { cutOut = false; changeDealer(); await view.newShoe(SHOE_CARDS - 1, CUT_AT); stageNext(); await burn(); }
      view.rename('main', 'h0'); resolved = 0; renderBalance(); renderBets(); hint('');
      if (table.board) await lightning.strike(table.board);
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
        const even = table.canEvenMoney; dealerSays('dealer-ace', { prio: 2 }).then(() => { if (mode === 'insurance') dealerSays(even ? 'even-money' : 'insurance', { prio: 2 }); });   // the ace, then the offer while you still decide (even money on your blackjack)
        setMode('insurance', even);
        const yes = (await choice()) === 'yes' && (even ? table.canEvenMoney : table.canInsure), stake = table.stakes.main;
        setMode('busy');
        // the others: insurance on their hands, and even money on a blackjack (paid onto the bet there and then)
        const takers = inPlay.filter(({ p }) => !natural(p.hand.cards) && p.wantsInsurance()), evens = inPlay.filter(({ p }) => natural(p.hand.cards) && p.wantsEvenMoney());
        await Promise.all([yes ? even ? view.payout('h0', stake) : view.buildStack('ins', table.insuranceCost) : null, ...takers.map(({ seat, p }) => { say(seat, 'Insurance'); return view.addAmount(seatKey(seat) + 'i', p.insure()); }),
          ...evens.map(({ seat, p }) => { say(seat, 'Even money'); return view.payout(seatKey(seat), p.evenMoney()); })]);
        renderSeats();
        res = table.insure(yes); renderBalance(); renderBets();
        if (yes && even) feed({ name: 'Even money', payout: stake * 2, net: stake, pays: 1, line: 'Your blackjack against an ace' });
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
      else if (act === 'split' && table.canSplit) {   // the new hand goes beside this one (Free Bet resplits up to four)
        const base = table.activeHand.base; table.split(); renderBalance(); renderBets();
        const at = table.splitAt; await view.splitHands(at, table.hands.length); if (table.freeSplitMade) await view.addMarker(`h${at + 1}f`); else await view.buildStack(`h${at + 1}`, base); renderTotals();
        for (const i of [at, at + 1]) {   // a split ace's card lies turned (no more cards), unless it is an ace that can split again
          const c = table.splitCard(i), again = table.hands[i].splitAces && c.rank === 'A' && table.mode === 'freebet' && table.hands.length < table.maxHands;
          await dealTo(i, 1, c, { turn: table.hands[i].splitAces && !again ? 'angled' : null });
        }
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
    if (natural(p.hand.cards)) { if (!p.hand.evenMoney) say(k, 'Blackjack'); return; }
    seatEls[k].tag.classList.add('turn'); await lookAt(k);
    for (p.at = 0; p.at < p.hands.length; p.at++) {
      const h = p.hand, hk = handKey(k, p.at);
      if (p.hands.length > 1) renderTotals();
      while (!h.done) {
        if (h.cards.length === 1) {   // a split hand takes its second card first; on a split ace, another ace may split again
          const c = table.draw(); h.cards.push(c); const again = h.splitAces && p.canResplit; await dealTo(hk, 1, c, { turn: h.splitAces && !again ? 'angled' : null });
          if (h.splitAces && !again || total(h.cards).value === 21) { h.done = true; break; }
        }
        await motion.wait(p.thinkTime());
        const act = p.decide(table.upCard);
        if (act === 'stand') { say(k, 'Stand'); h.done = true; break; }
        if (act === 'split') {
          const at = p.at, free = p.split(), nk = handKey(k, at + 1); say(k, free ? 'Free split' : 'Split'); renderSeats();
          await view.splitSeat(k, at, p.hands.length); if (free) await view.addMarker(`${nk}f`); else await view.addAmount(nk, h.base); renderTotals(); p.at--; break;   // this hand again: it takes its second card first
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
    ledger.add(handEntry(table, r));   // the hand goes in the book (settings, Last hands) in the moment it is paid
    await settleSides();   // Buster
    // main hands: losing stakes go to the rack, wins are paid onto the stake
    const seatResults = others().filter(({ p }) => p.hands.length && p.hands[0].cards.length).flatMap(({ seat, p }) => p.settle(table.dealer, table.board).map((r, i) => ({ seat, p, r, key: handKey(seat, i), el: seatEls[seat].totals[i] })));
    // paid and taken from the dealer's right (your left) round to the dealer's left
    const jobs = [
      ...seatResults.map(x => ({ x: view.stackBase(x.key).x, run: () => Promise.all([x.r.kind === 'loss' ? view.toRack(x.key) : x.r.payout > x.r.stake && !x.r.evenMoney ? view.payout(x.key, x.r.payout - x.r.stake) : null, x.r.free ? view.toRack(`${x.key}f`) : null]) })),
      ...r.hands.map(h => ({ x: 0, run: () => Promise.all([h.kind === 'loss' ? view.toRack(`h${h.index}`) : h.payout > h.stake && !h.evenMoney ? view.payout(`h${h.index}`, h.payout - h.stake) : null, h.free ? view.toRack(`h${h.index}f`) : null]) })),   // even money was paid at the offer
    ].sort((a, b) => a.x - b.x);
    await Promise.all(jobs.map((j, i) => motion.wait(i * 160).then(j.run)));
    for (const { el, r: sr } of seatResults) { if (el.hidden) continue; const [text, cls] = outcomeOf({ ...sr, index: 0 }, r); el.dataset.out = '1'; setTotal(el, text); el.classList.remove('bust'); el.classList.add(cls); }
    for (const { seat, p } of others()) if (p.flash) { const f = p.flash; p.flash = null; if (f.bonus) say(seat, `⚡ +${fmt(f.bonus.amount)}`, 2400); else if (f.earned) say(seat, `⚡ ×${f.earned.m}`, 2400); }
    renderSeats();
    renderBalance(r.bonus?.amount ?? 0); renderTotals(); markOutcomes(r);
    if (table.mode === 'lightning') await lightning.settle(r);   // (the multiplier was saved with the balance as the hand settled)
    ctx.showBalance(table.balance);
    celebrate(r);
    showBanner(r);
    // with side bets settled this hand the result (and their lines) waits for your tap or Space; otherwise it moves on
    const sides = r.sides.length > 0; $('#feed').classList.toggle('stay', sides);
    setMode('result');
    await (sides ? choice() : Promise.race([new Promise(r => setTimeout(r, settings.fast ? 1400 : 2100)), choice()])); decide = null;
    await clearUp();
  }
  async function clearUp() {
    setMode('busy'); hint('');   // the result bar stays up as a summary until you next bet
    clearFeed(); for (const t of [...Object.values(totals), ...Object.values(seatEls).flatMap(e => e.totals)]) { t.hidden = true; t.classList.remove('win', 'push', 'loss', 'bust'); delete t.dataset.out; delete t.dataset.v; }
    await Promise.all([view.toPlayer(), view.collectCards()]);
    table.next(); for (const { p } of others()) p.clear();
    if (table.cutReached) {
      table.newShoe(); cutOut = false; const d = changeDealer(); dealerSays('new-shoe', { prio: 2 });
      const moves = seating.turnover(settings.players).filter(c => c.joined), who = moves.length ? ` ${moves.map(c => c.left ? `${c.joined.name} takes ${c.left.name}'s seat` : `${c.joined.name} sits down`).join('; ')}.` : '';
      renderSeats(); for (const c of moves) say(c.seat, 'Sits down', 2600); hint((d ? `New shoe. ${d.name} takes over the table.` : 'New shoe. Eight decks, freshly shuffled.') + who);
      await view.newShoe(table.remaining - 1, CUT_AT); stageNext(); await burn();
    } else {   // between hands: anyone who can't make their bet gets up, and the table fills to the size you chose
      const ch = [...seating.replaceLeaving(), ...seating.arrange(settings.players)];
      if (ch.length) { renderSeats(); for (const c of ch) if (c.joined) say(c.seat, 'Sits down', 2600); }
    }
    lightning.reset(); busy = false; renderBets(); setMode('betting');   // out of chips? the betting hint and the Deal button offer a reset
    cleared?.(); cleared = null;
  }
  // A result waiting on you (the lobby, a reset): on to the next hand, done once the table is clear. false if none is.
  let cleared = null;
  const moveOn = () => mode === 'result' && decide ? new Promise(r => { cleared = () => r(true); choose('next'); }) : Promise.resolve(false);
  async function misdeal(e) {
    console.error(e); motion.finishAll();
    const back = table.abandon(); decide = null; for (const { p } of others()) p.refund(); renderSeats(); for (const e of Object.values(seatEls)) for (const t of e.totals) t.hidden = true; world.setPan(0); layoutOverlay();
    view.clearCards(); view.clearChips(); hideBanner();
    clearFeed(); for (const t of Object.values(totals)) t.hidden = true;
    lightning.reset(); stageNext(); renderBalance(); renderBets(); busy = false; setMode('betting'); cleared?.(); cleared = null;
    hint(`Misdeal. ${back ? `${fmt(back)} returned to your balance.` : 'Nothing was lost.'}`);
  }
  function fail(e) { if (table.phase !== 'betting') return misdeal(e); console.error(e); busy = false; setMode('betting'); }

  // How the room answers your result: a sting sized to the win, the table cheering a big one, and now
  // and then a word from the dealer.
  const bigWin = r => r.net >= Math.max(10 * r.hands.reduce((s, h) => s + h.stake, 0), 250) || r.sides.some(x => x.payout > 0 && x.pays >= 25);
  function celebrate(r) {
    const main = r.hands.reduce((s, h) => s + h.stake, 0), big = bigWin(r);
    if (r.bonus?.m >= 10) setTimeout(() => audio.cue(take('crowd-cheer', 2), { bus: 'room', gain: 5 }), 400);   // (its thunder came with the payoff: lightning-ui)
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
    if (h.evenMoney) return ['EVEN MONEY', 'win'];
    if (h.kind === 'blackjack') return ['BLACKJACK', 'win'];
    if (h.kind === 'win') return [`${h.total} · WIN`, 'win'];
    if (h.kind === 'push') return [`${h.total} · PUSH`, 'push'];
    return [h.total > 21 ? `${h.total} · BUST` : `${h.total} · LOSE`, 'loss'];
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
    if (h.evenMoney) return 'Even money';
    if (h.kind === 'win') return r.dealerTotal > 21 ? 'Dealer busts' : h.title === 'Ten-card Charlie.' ? 'Ten-card Charlie' : 'You win';
    if (h.kind === 'push') return 'Push';
    return r.dealerBlackjack ? 'Dealer blackjack' : h.total > 21 ? 'Bust' : 'Dealer wins';
  }
  // The result is a small tag that rises off your bet and says what happened in a word and by how much. It stays
  // (through the next hand's betting) until you put a chip down or deal, so a look away doesn't lose it; every line of
  // the hand, side bets and Lightning included, is in Last hands in the settings. Hand totals already read WIN / BUST,
  // and side bets have their own list, so the tag stays small.
  let bannerTimer = 0;
  function showBanner(r) {
    clearTimeout(bannerTimer);
    const b = $('#banner'), tone = r.net > 0 ? 'up' : r.net < 0 ? 'down' : 'even';
    b.className = `banner ${tone}${r.blackjack ? ' bj' : ''}${r.net > 0 && (r.blackjack || r.bonus || bigWin(r)) ? ' gild' : ''}`;   // the big moments read in gold foil
    b.innerHTML = '<span class="rb-label"></span><em></em>';
    b.firstChild.textContent = headline(r) + (r.fee && r.net <= 0 && r.hands.some(h => h.payout > h.stake) ? ' · less the fee' : '');   // a won hand the Lightning fee leaves even (or down) says why
    const em = b.lastChild, final = r.net ? signed(r.net) : 'Even';
    em.textContent = r.net ? (r.net > 0 ? '+0' : '−0') : final;
    b.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('show')));
    if (r.net) setTimeout(() => ui.morph(em, final), 160);   // the amount rolls up to the result
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
    if (act === 'hit' && h.splitAces) return 'One card on split aces';
    // a paid double or split costs the hand's bet (`base`), which a hand on a free-bet marker doesn't have on it
    if (act === 'double') {
      if (h.splitAces) return 'Not on split aces';
      if (h.cards.length !== 2) return 'First two cards only';
      if (!table.freeDouble && table.balance < h.base) return 'Not enough balance';
    }
    if (act === 'split') {
      if (table.hands.length >= table.maxHands) return table.maxHands > 2 ? 'Four hands at most' : 'One split per hand';
      if (!table.isPair) return 'Needs a pair';
      if (!table.freeSplit && table.balance < h.base) return 'Not enough balance';
    }
    return '';
  }
  function refreshControls() {
    const betting = mode === 'betting' && !busy;
    $('#undo').disabled = !betting || !table.history.length;
    $('#clear').disabled = !betting || !table.bet;
    // Rebet and Double bets share one slot, so the row never changes width when a chip goes down.
    const showX2 = !!table.bet;
    rebetSlot($('#rebet'), $('#x2'), showX2);
    $('#rebet').disabled = !betting || !table.canRebet || showX2; $('#x2').disabled = !betting || !table.canDoubleBets || !showX2;
    const out = broke();
    $('#deal').disabled = !betting || (!table.bet && !table.canRebet && !out) || (table.bet > 0 && (table.belowMinimum || table.cost > table.balance));
    goLabel($('#deal'), 'Deal', { out, rebet: !table.bet && table.canRebet });
    rack.fit(table.balance - (table.phase === 'betting' ? table.cost : 0));
    for (const id of SPOTS) spotEls[id].disabled = !betting || (id !== 'main' && !settings.sides);
    for (const t of $$('.tile')) t.disabled = !betting;
    const playing = mode === 'player' && !!decide;
    const can = { hit: table.canHit, stand: table.canStand, double: table.canDouble, split: table.canSplit };
    for (const [act, free] of [['double', playing && table.canDouble && table.freeDouble], ['split', playing && table.canSplit && table.freeSplit]]) {   // FREE only on a move you can make
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
      hint(`${table.isSplit ? `Hand ${table.activeIndex + 1}: ` : ''}${handLabel(h.cards, { bj: false })} against the dealer's ${up.rank === 'A' ? 'ace' : total([up]).value}.`);
    }
    const ins = $('#insurance');
    ins.hidden = mode !== 'insurance';
    if (mode === 'insurance') {
      ins.querySelector('h2').textContent = evenMoney ? 'Even money?' : 'Insurance?';
      ins.querySelector('p').textContent = evenMoney
        ? `Your blackjack against an ace. Take ${fmt(table.stakes.main)} now at 1:1, or play on for 3:2.`
        : table.canInsure ? `The dealer shows an ace. Insure for ${fmt(table.insuranceCost)}; it pays 2:1 if the dealer has blackjack.` : `The dealer shows an ace. Insurance costs ${fmt(table.insuranceCost)}, more than your balance.`;
      const up = table.upCard; ins.querySelector('.ins-ace i').textContent = up?.suit ?? ''; ins.querySelector('.ins-ace').classList.toggle('red', up?.suit === '♥' || up?.suit === '♦');
      $('#ins-yes').disabled = evenMoney ? !table.canEvenMoney : !table.canInsure; $('#ins-yes').querySelector('.label').textContent = evenMoney ? 'Take even money' : `Insure ${fmt(table.insuranceCost)}`;   // even money needs no chips
      $('#ins-no').querySelector('.label').textContent = evenMoney ? 'Play on' : 'No insurance';
    }
    if (betting) {
      if (out) hint(`You are out of chips. Tap Reset for a fresh ${fmt(wallet.START)}.`);
      else if (!table.bet) hint(table.canRebet ? `Place your bets, or rebet ${fmt(Object.values(table.lastLayout).reduce((a, b) => a + b, 0))}${table.mode === 'lightning' ? ` plus a ${fmt(table.lastLayout.main)} fee` : ''}.` : 'Choose a chip, then tap a circle to bet.');
      else if (table.belowMinimum) hint('Side bets ride with a main bet. Put a chip on the main circle.');
      else hint(`Bet ${fmt(table.bet)}. Deal when ready.`);
    }
  }
  $('#ins-yes').onclick = () => choose('yes'); $('#ins-no').onclick = () => choose('no');
  stage.addEventListener('click', e => { if (mode === 'result' && !e.target.closest('button')) choose('next'); });

  // ---- keys -----------------------------------------------------------------------------------------------------------------
  // (the salon's key handler has already let a control you moved to with the keyboard keep Space and Enter)
  function onKey(e) {
    const k = e.key.toLowerCase(), go = k === ' ' || k === 'enter';
    if (e.repeat) { if (go) e.preventDefault(); return; }   // a held key acts once: no extra cards, no hand dealt behind the result
    if (mode === 'player') { const act = { h: 'hit', s: 'stand', d: 'double', p: 'split' }[k]; if (act || go) e.preventDefault(); if (act && !$(`#act-${act}`).disabled) choose(act); return; }
    if (mode === 'insurance') { if (go) e.preventDefault(); if (k === 'y') choose('yes'); if (k === 'n') choose('no'); return; }
    if (mode === 'result' && go) { e.preventDefault(); choose('next'); return; }
    if (mode !== 'betting') { if (go) e.preventDefault(); return; }
    if (go) { e.preventDefault(); actions.deal(); } else betKey(k, { ...actions, chip: rack.select });
  }

  // ---- this table's part of the settings (Rules, Side-bet paytables, Dealer and Side bets show only here) -----------------------
  $('#sideInfo').onclick = e => ctx.openSheetAt($('#paytables').closest('details'), e.detail === 0);
  // Dealers rotate with each new shoe, as they do on a casino floor, unless one is chosen here.
  const dealerSel = $('#optDealer'); dealerSel.value = settings.dealer;
  const dealerNote = () => { $('#dealerNote').textContent = `Now dealing: ${view.dealer.name}`; };
  function changeDealer() {
    if (settings.dealer !== 'rotate') return null;
    const others = Object.values(DEALERS).filter(d => d !== view.dealer);
    view.dealer = others[Math.floor(Math.random() * others.length)]; dealerNote(); return view.dealer;
  }
  dealerSel.onchange = () => { settings.dealer = dealerSel.value; store.set('dealer', settings.dealer); if (DEALERS[settings.dealer]) view.dealer = DEALERS[settings.dealer]; dealerNote(); };
  view.dealer = DEALERS[settings.dealer] ?? Object.values(DEALERS)[Math.floor(Math.random() * Object.keys(DEALERS).length)]; dealerNote();
  ctx.bindToggle('#optSides', 'sides', on => {
    for (const b of SIDE_BETS) { world.spots[b.id].visible = on; spotEls[b.id].hidden = !on; } world.spots.band.visible = on; $('#tray').hidden = !on;
    if (!on && table.phase === 'betting' && table.sideBet) { for (const b of SIDE_BETS) { table.bets[b.id] = []; } table.history = table.history.filter(s => s === 'main'); serial(syncAllStacks); }
    if (!on && table.lastLayout) for (const b of SIDE_BETS) table.lastLayout[b.id] = 0;   // and Rebet brings back only the main bet
    world.requestRender(); renderBets(); refreshControls();
  });
  // A fresh stack and a clean start: no rebet, no Lightning multiplier carried over (app.mjs resetBalance).
  function reset() { misdealQuiet(); table.clear(); wallet.reset(); table.balance = synced = wallet.START; table.pending = null; table.lastLayout = null; renderBalance(); lightning.reset(); renderBets(); refreshControls(); othersBet(); }
  async function misdealQuiet() { table.abandon(); for (const { p } of others()) p.refund(); renderSeats(); world.setPan(0); decide = null; view.clearCards(); view.clearChips(); hideBanner(); clearFeed(); for (const t of Object.values(totals)) t.hidden = true; busy = false; setMode('betting'); }
  // ---- Lightning ------------------------------------------------------------------------------------------------------------
  const lightning = createLightningUI({ world, table, view, motion, audio, feel, settings, take, stage, overlay, call: line => dealerSays(line, { prio: 3, fresh: 1500 }), paid: () => ctx.showBalance(table.balance), inView: () => visible && !lobby.isOpen, shown: () => visible, reframe: () => { framed = ''; reframeNow(); } });
  lightningLayout = lightning.layout;

  // Rules and paytables, written from the same data the game settles with.
  const slotBets = () => SIDE_BETS.map(b => b.id === 'dpairs' && table.mode === 'freebet' ? PUSH22 : b);
  function renderRules() {
    const m = MODES[table.mode];
    const terms = b => { const t = [...new Set(b.table.map(([l]) => l))].filter(l => TERMS[l]); return t.length || NOTES[b.id] ? `<ul class="terms">${NOTES[b.id] ? `<li>${NOTES[b.id]}</li>` : ''}${t.map(l => `<li><b>${l}</b>: ${TERMS[l]}</li>`).join('')}</ul>` : ''; };
    $('#paytables').innerHTML = slotBets().map(b => `<section id="pt-${b.id}"><h4>${b.name}</h4><p>${b.cards}. Limit ${LIMITS.side[0]}–${LIMITS.side[1]}. House edge ${b.edge.toFixed(1)}%: over time it returns ${(100 - b.edge).toFixed(1)}% of what is bet.</p><table>${b.table.map(([l, p]) => `<tr><td>${l}</td><td>${p}:1</td></tr>`).join('')}</table>${terms(b)}</section>`).join('');
    $('#modeRulesTitle').hidden = $('#modeRules').hidden = !m.rules.length;
    $('#modeRulesTitle').textContent = `At the ${m.name} table`; $('#modeRules').innerHTML = m.rules.map(r => `<li>${r}</li>`).join('');
  }
  // What the paytables' words mean, a line each, for a friend new to side bets (the three cards: your two and the dealer's up card).
  const TERMS = {
    'Perfect pair': 'two of a rank in the same suit (8♥ 8♥)', 'Coloured pair': 'two of a rank in the same colour, different suits (8♥ 8♦)', 'Red/black pair': 'two of a rank, one red and one black (8♥ 8♠)',
    'Suited three of a kind': 'three of a rank, all in one suit', 'Straight flush': 'three in a row, all in one suit', 'Three of a kind': 'three of a rank',
    'Straight': 'three in a row; an ace is high or low, but K-A-2 is not one', 'Flush': 'three of one suit',
    'Suited 7-7-7': 'three sevens in one suit', 'Suited 6-7-8': 'six, seven and eight in one suit', '7-7-7': 'three sevens', '6-7-8': 'a six, a seven and an eight',
    'Suited 21': 'the three cards make 21, all in one suit', 'Any 21': 'the three cards make 21 (an ace counts 1 or 11)', 'Any 20': 'they make 20', 'Any 19': 'they make 19',
    'Dealer ends on 22': 'the dealer draws to exactly 22 (where every other hand at this table pushes)',
  };
  const NOTES = { buster: 'Wins when the dealer busts; the more cards in the busted hand, the more it pays. With your blackjack as well, the top two lines pay more.' };

  // Moving to another table: its printing on the felt, its side bet in the last slot, its rules and name.
  function applyMode(id, { announce = true } = {}) {
    if (!MODES[id] || (busy && id !== table.mode) || table.phase !== 'betting') return false;
    const was = table.mode; table.mode = id; settings.mode = id; store.set('mode', id); if (was !== id) hideBanner();   // (the last result belongs to the last table)
    for (const { p } of seating.players) p.mode = id;
    const slot = id === 'freebet' ? PUSH22 : DPAIRS;
    world.setMode(MODES[id], slot);
    paintTile($('.tile[data-spot="dpairs"]'), slot); SPOT_NAME.dpairs = slot.name;
    spotEls.dpairs.setAttribute('aria-label', `${slot.name} side bet, pays up to ${Math.max(...slot.table.map(r => r[1]))} to 1`);
    if (was !== id && table.betOn('dpairs')) { table.bets.dpairs = []; table.history = table.history.filter(s => s !== 'dpairs'); serial(() => view.syncStack('dpairs', [])); }
    if (was !== id && table.lastLayout?.dpairs) table.lastLayout.dpairs = 0;   // nor does Rebet carry it over (Dealer Pairs would come back as Push 22)
    ctx.title(MODES[id].title, MODES[id].name === 'Classic' ? 'Blackjack' : `${MODES[id].name} Blackjack`);
    renderRules(); renderBets(); refreshControls();
    document.body.dataset.table = id; lightning.show(id === 'lightning');
    if (announce && was !== id) hint(id === 'freebet' ? 'Free Bet table: free doubles on 9, 10 and 11, free splits on pairs, and a dealer 22 pushes.' : id === 'lightning' ? 'Lightning table: a fee equal to your bet comes off with the deal. Win on a struck total and your next win pays the fee times the multiplier.' : 'The Classic table.');
    if (announce) fitBets(feeCleared());   // (a lobby preview leaves them: lobby.play checks once you sit down)
    return true;
  }
  // A phone on its side has no room over the felt for results: they move into the control column.
  const sideways = matchMedia('(orientation: landscape) and (max-height: 520px)');
  const placeFeed = () => { const f = $('#feed'); if (sideways.matches) $('.dock').prepend(f); else stage.append(f); };
  sideways.addEventListener('change', placeFeed); placeFeed();

  // One wallet: the balance can move under this table (at the wheel, or in the salon open in another window). The
  // table takes up the change by the amount it moved, so a hand in play keeps its stake, and bets the new balance
  // no longer covers come off.
  wallet.subscribe(v => {
    if (saving || v === synced) return;
    table.balance = Math.max(0, table.balance + v - synced); synced = v;
    if (!visible) return;   // the wheel shows its own balance; show() brings this table up to date
    renderBalance(); if (!fitBets('Your bets were cleared: your balance changed in another window.')) { renderBets(); refreshControls(); }
  });

  // ---- start -----------------------------------------------------------------------------------------------------------------
  kit.shimmer($('#deal'));
  table.draw(); world.discard.set(1);   // this shoe's burn card
  stageNext(); renderBets(); renderSeats(); setMode('betting');
  world.pause(true);   // out of sight until the salon shows the room
  requestAnimationFrame(() => requestAnimationFrame(loadCourtArt));   // the J, Q, K and ace art follows the first frame (see textures.mjs)

  return {
    stage, scene: world, table, onKey, hint, round: 'hand',
    get busy() { return busy; },
    get mode() { return mode; },
    moveOn,
    // the room is shown (behind the lobby or at the table): the balance may have moved at the wheel
    show() {
      if (visible) return; visible = true; world.pause(false);
      if (!busy && table.phase === 'betting') { table.balance = wallet.balance; if (table.cost > table.balance) { table.clear(); serial(syncAllStacks); hint('Your bets were cleared: your balance changed at the wheel.'); } }
      applyMode(table.mode, { announce: false }); renderBalance(); renderBets(); refreshControls();   // (applyMode frames the seat)
      lightning.badge();   // the Lightning show sees the room is in sight (applyMode stands aside mid-hand): its storm starts
    },
    hide() { visible = false; world.showcase.stop(0); lightning.preview(false); lightning.badge(); world.pause(true); },   // the hidden table draws nothing while you are at the wheel
    showcase: world.showcase, portal,
    // the lobby opens over the table, or closes for the seat (at Lightning the board then takes the head of the table)
    toLobby() { world.showcase.start(settings.reduced); lightning.preview(table.mode === 'lightning'); lightning.badge(); },
    fromLobby() { framed = ''; reframeNow(); },
    // picking a blackjack table in the lobby dresses this one for it, swept in by a band of light (`sweep`: false when the
    // table has just come through the portal, dressed before it is seen)
    preview(tableMode, { sweep = true } = {}) {
      const dress = () => { if (tableMode !== table.mode) applyMode(tableMode, { announce: false }); lightning.preview(tableMode === 'lightning'); };
      if (!sweep || !visible || tableMode === table.mode || busy || table.phase !== 'betting') { dress(); return Promise.resolve(); }
      return world.swap(dress, { tone: tableMode === 'lightning' ? 'lightning' : 'gold', calm: settings.reduced });
    },
    // you sit down: the camera flies down into your seat (`direct`: the page opened at the table, ?table)
    async enter(ms, { tableMode, direct = false } = {}) {
      if (direct) { seatedNow(); return; }
      if (tableMode && tableMode !== table.mode) applyMode(tableMode); lightning.preview(false); lightning.reset();
      await world.showcase.stop(ms);
      document.body.classList.remove('flying'); layoutOverlay(); seatedNow();
      if (!fitBets(feeCleared()) && mode === 'betting' && !busy && !table.bet) dealerSays('place-bets');   // chips that fit the last table may not cover this one's fee
      if (table.mode === 'lightning' && !store.get('flashNoted', false)) { store.set('flashNoted', true); hint('This table flashes as lightning strikes. Settings › Flashing effects softens it or turns it off.'); }   // said once, the first time you sit here
    },
    setReduced(on) { motion.reduced = on; },
    setFast(on) { motion.slow = on ? .62 : 1; },
    setQuality(q) { world.setQuality(q); },
    refresh() { renderBets(); refreshControls(); },
    reset,
    // How many others sit with you changes between hands: whoever leaves takes their chips (main and side bets) with
    // them; othersBet() calls off their pending bets.
    setPlayers() {
      if (busy || table.phase !== 'betting') return;
      const ch = seating.arrange(settings.players); for (const c of ch) if (c.left) { c.left.refund(); for (const s of ['', 'p', 't']) view.syncStack(seatKey(c.seat) + s, []); }
      renderSeats(); othersBet();
    },
    players: () => others().map(x => x.p.name),
    callBets: () => dealerSays('place-bets', { prio: 3 }),   // hear the voice level you set
    // for the browser checks, only in a testing session (?test or salonnoir.dev)
    test: ctx.dev ? { table, view, motion, world, choose, seating, lightning, get mode() { return mode; }, get busy() { return busy; }, rig(order) { const c = s => ({ rank: s.slice(0, -1), suit: s.slice(-1) }); table.cards.push(...order.map(c).reverse()); stageNext(); } } : undefined,
  };
}
