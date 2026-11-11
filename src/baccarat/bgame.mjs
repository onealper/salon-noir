// The baccarat room: punto banco at the salon's card table. Rules: baccarat/rules.mjs; the table, its dealer and the
// camera's lean over your cards: baccarat/bscene.mjs; the squeeze: baccarat/squeeze.mjs. The room takes the salon's
// `ctx` and gives back what every room does (app.mjs).
//
// A coup: you put chips on Player, Banker, the Tie or a pair and press Deal. Bets close then, and the coup is drawn
// from the shoe and settled in that same moment (rule 7: money moves as bets close, with a record a closed page
// leaves for the next visit); what follows only shows it. The four cards come out of the shoe, Player, Banker,
// Player, Banker. The side your bigger bet is on is yours to turn: its cards come to you face down and the camera
// leans in over them (the squeeze), the other side's being turned by the dealer first, so you know what you need.
// Third cards follow by the tableau, squeezed the same way when they are yours. Then the call, the chips (the losing
// ones to the rack, the winners paid from it, the Banker's less the commission at the Classic table), and the cards
// to the discard holder.
import { BaccaratTable, TABLES, SPOTS, SPOT_IDS, CUT_AT, SHOE_CARDS, points, returned, bigRoad, tally, rivalBet, TEMPERS } from './rules.mjs';
import { createBaccaratWorld, BaccaratView, createDirector, BL, outline, seatKey } from './bscene.mjs';
import { createSqueeze } from './squeeze.mjs';
import { createPortal } from '../scene/portal.mjs';
import { Motion, createCard, createChip } from '../scene/pieces.mjs';
import { DEALERS } from '../scene/view.mjs';
import { toSeat } from '../scene/world.mjs';
import { loadCourtArt } from '../scene/textures.mjs';
import { Seating, SEAT_COUNT, YOU } from '../players.mjs';
import { wallet, inFlight } from '../core/wallet.mjs';
import { fmt, signed } from '../core/format.mjs';
import { chipRack, hintLine, rebetSlot, goLabel, serialQueue, betKey } from '../core/bet-controls.mjs';
import { cardText, cardWords, handWords } from '../blackjack/book.mjs';

export const BC_LINES = [...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(n => [`player-${n}`, `banker-${n}`]), 'player-wins', 'banker-wins', 'tie', 'card-player', 'card-banker'];
const NAME = { player: 'Player', banker: 'Banker', tie: 'Tie', ppair: 'Player pair', bpair: 'Banker pair' };
const PAYS = { player: '1 to 1', tie: '8 to 1', ppair: '11 to 1', bpair: '11 to 1' };
// how each of the salon's players takes to baccarat (players.mjs gives them their names, bankrolls and usual stakes)
const TEMPER_OF = { steady: 'banker', careful: 'banker', hunch: 'whim', whale: 'run', chaser: 'against' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function createBaccarat(ctx) {
  const { app, audio, settings, store, ui, kit, uiSound, sting } = ctx;
  const feel = ctx.feel ?? { tap() {}, cue() {}, confetti() {} };
  let kind = TABLES[store.get('baccaratTable')] ? store.get('baccaratTable') : 'classic';
  if (settings.squeeze == null) settings.squeeze = store.get('squeeze', true);   // you turn your side's cards yourself (Settings, at this table)

  // ---- the stage and the dock ----------------------------------------------------------------------------------------
  const stage = document.createElement('section'); stage.className = 'stage bstage'; stage.id = 'bstage'; stage.setAttribute('aria-label', 'Baccarat table'); stage.dataset.mode = 'bet';
  stage.innerHTML = `<canvas class="bcanvas" aria-hidden="true"></canvas>
    <div class="b-vignette" aria-hidden="true"></div>
    <div class="overlay b-overlay"></div>
    <button class="b-road empty" id="bRoad" aria-expanded="false" aria-controls="bRoads" aria-label="This shoe so far" disabled><ol></ol></button>
    <div class="b-roads" id="bRoads" role="region" aria-label="The roads" hidden></div>
    <div class="r-win b-win" hidden><small></small><b></b><em></em><span class="r-gross"></span></div>
    <p class="hint b-hint" aria-live="polite"><span></span></p>
    <p class="sr-only" id="bSaid" aria-live="polite"></p>`;
  const dock = document.createElement('footer'); dock.className = 'dock tdock bdock'; dock.dataset.mode = 'bet';
  dock.innerHTML = `<div class="dock-blur" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="chips" id="bChips" role="radiogroup" aria-label="Chip value"></div>
    <div class="bet-actions">
      <button class="pill t-undo" id="bUndo" aria-keyshortcuts="U" aria-label="Undo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg><span class="label">Undo</span></button>
      <button class="pill t-clear" id="bClear" aria-keyshortcuts="C" aria-label="Clear bets"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg><span class="label">Clear</span></button>
      <button class="pill t-rebet" id="bRebet" aria-keyshortcuts="R" aria-label="Rebet"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg><span class="label">Rebet</span></button>
      <button class="pill t-x2" id="bX2" aria-keyshortcuts="X" aria-label="Double bets"><span class="glyph">×2</span><span class="label">Double</span></button>
      <button class="pill gold deal t-go" id="bDeal" aria-keyshortcuts="Space"><span class="label">Deal</span></button>
    </div>
    <div class="b-turn"><button class="pill gold" id="bTurn" aria-keyshortcuts="Space"><span class="label">Turn over</span><kbd>Space</kbd></button></div>`;
  app.append(stage, dock);
  const $ = s => stage.querySelector(s) ?? dock.querySelector(s);
  const canvas = $('.bcanvas'), overlay = $('.b-overlay'), roadEl = $('.b-road'), roadsEl = $('.b-roads'), winEl = $('.b-win'), said = $('#bSaid');
  const hint = hintLine($('.b-hint'));

  const world = createBaccaratWorld(canvas, { quality: ctx.quality(), kind });
  const portal = createPortal(world, { body: world.table, floorY: world.floorY(), showcase: world.showcase, audio, reduced: () => settings.reduced });   // (the lobby's change of game: scene/portal.mjs)
  const motion = new Motion(world), view = new BaccaratView(world, motion, audio), director = createDirector(world, motion);
  const squeeze = createSqueeze({ world, view, el: canvas, motion, audio, feel });
  Object.assign(motion, { reduced: settings.reduced, slow: settings.fast ? .62 : 1 });
  document.body.dataset.btable = kind;

  // One wallet: the table reads and writes it through `bank`. While a coup is shown the balance on the bar is held at
  // what it was as the bets closed (`held`), and let go as the winnings are paid on the cloth.
  let held = null;
  const bank = { get: () => wallet.balance, set: v => { wallet.set(v); if (held == null) ctx.showBalance(); } };
  const table = new BaccaratTable({ bank, random: ctx.random, kind });
  let mode = 'betting', active = false, welcome = null, hurry = 0;   // mode: betting | dealing | squeeze | paying
  // A coup a closed page left: its money moved as its bets closed, so it only needs writing down and a word.
  await inFlight.take('coup', c => {
    if (!Number.isFinite(c?.net) || !['player', 'banker', 'tie'].includes(c.winner)) return;
    ctx.record?.(c);
    ctx.notice?.(`Your last coup: ${c.winner === 'tie' ? `a tie, ${c.p} all` : `${NAME[c.winner]} won, ${Math.max(c.p, c.b)} to ${Math.min(c.p, c.b)}`}; ${c.back > 0 ? `${fmt(c.back)} was paid to your balance` : 'no win'}.`, t => { welcome = t; });
  });

  // ---- the dealer and the voice -------------------------------------------------------------------------------------------
  // The salon's four dealers deal here too (Settings › Dealer; a new one each shoe when it says so), in their two voices.
  const dealerSel = document.querySelector('#optDealer'), dealerNote = () => { const n = document.querySelector('#dealerNote'); if (n && active) n.textContent = `Now dealing: ${view.dealer.name}`; };
  view.dealer = DEALERS[settings.dealer] ?? Object.values(DEALERS)[Math.floor(Math.random() * 4)];
  dealerSel?.addEventListener('change', () => { if (DEALERS[dealerSel.value]) view.dealer = DEALERS[dealerSel.value]; dealerNote(); });
  function changeDealer() { if (settings.dealer !== 'rotate') return null; const o = Object.values(DEALERS).filter(d => d !== view.dealer); view.dealer = o[Math.floor(Math.random() * o.length)]; dealerNote(); return view.dealer; }
  const says = (line, opts) => audio.say(`voice/${view.dealer.voice}-${line}`, opts);
  // a call the picture waits for: at least a beat, and the line when the sound is on
  const call = (line, ms = 620) => Promise.all([says(`bc-${line}`, { prio: 2 }), motion.wait(ms)]);
  ctx.warm(['james', 'sofia'].flatMap(v => BC_LINES.map(l => `voice/${v}-bc-${l}`)));
  const tell = t => { if (said.textContent !== t) { said.textContent = t; return; } said.textContent = ''; setTimeout(() => { said.textContent = t; }, 60); };

  // ---- the overlay: your five spots, the hands' totals, the other players' names ---------------------------------------
  const rack = chipRack($('#bChips'), { store, uiSound });
  const serial = serialQueue(err => console.error('baccarat bets', err));
  const spotEls = {};
  for (const id of SPOT_IDS) {
    const b = document.createElement('button'); b.className = `spot b-spot ${SPOTS[id].max > 100 ? 'b-box' : ''}`; b.dataset.spot = id;
    b.innerHTML = '<span class="amount" hidden></span>'; pressable(b, () => placeChip(id), () => removeFrom(id)); overlay.append(b); spotEls[id] = b;
  }
  const paysOf = id => id === 'banker' ? (kind === 'nocomm' ? '1 to 1, half on a winning six' : '19 to 20') : PAYS[id];
  // Tap adds the chip in hand; press and hold (or right-click) takes the last chip off.
  function pressable(el, tap, hold) {
    let timer = 0, heldDown = false;
    el.addEventListener('pointerdown', e => { if (e.button > 0) return; heldDown = false; clearTimeout(timer); timer = setTimeout(() => { heldDown = true; hold(); navigator.vibrate?.(12); }, 480); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => clearTimeout(timer));
    el.addEventListener('click', e => { if (heldDown) { e.preventDefault(); heldDown = false; return; } tap(); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); clearTimeout(timer); if (!heldDown) hold(); heldDown = false; });
  }
  const mk = cls => { const e = document.createElement('div'); e.className = cls; e.hidden = true; e.append(document.createElement('span')); overlay.append(e); return e; };
  const totals = { player: mk('hand-total b-total'), banker: mk('hand-total b-total') };
  const seating = new Seating(); seating.arrange(settings.players);
  const others = () => seating.players.filter(x => x.seat !== YOU);
  const seatEls = {};
  // A neighbour is a small coin with their initial by their spots; their name and chips come out of it while they act
  // (a bet put down, a win, sitting down), under the pointer, or at a tap: the cloth's printing is left clear.
  const openTimers = {};
  function openTag(k, ms = 2200) { const tag = seatEls[k]; if (!tag) return; tag.classList.add('open'); clearTimeout(openTimers[k]); openTimers[k] = setTimeout(() => tag.classList.remove('open'), ms); }
  for (let k = 0; k < SEAT_COUNT; k++) {
    if (k === YOU) continue;
    const tag = document.createElement('div'); tag.className = `seat-tag b-seat away${toSeat(k, 0, 30).x > 0 ? ' rhs' : ''}`; tag.innerHTML = '<span class="av"></span><span class="who"><b></b><span class="bank"></span></span><span class="say"></span>';
    tag.addEventListener('click', () => openTag(k, 2600)); overlay.append(tag); seatEls[k] = tag;
  }
  function renderSeats() {
    for (const [k, tag] of Object.entries(seatEls)) {
      const p = seating.seats[k]; tag.classList.toggle('away', !p); if (!p) continue;
      tag.querySelector('.av').textContent = p.initial; tag.querySelector('b').textContent = p.name; tag.querySelector('.bank').textContent = fmt(Math.floor(p.bankroll));   // (whole chips: a commission's half chip is not shown here)
    }
  }
  const sayTimers = {};
  function seatSays(k, text, ms = 1400) { const el = seatEls[k]?.querySelector('.say'); if (!el) return; clearTimeout(sayTimers[k]); el.textContent = text; el.classList.add('show'); sayTimers[k] = setTimeout(() => el.classList.remove('show'), ms); openTag(k, ms + 500); }
  // shown whole or not at all: a tag at the picture's very edge slides in rather than be cut
  function place(el, x, y, z, dx = 0, dy = 0) {
    const p = world.project(x, y, z), W = stage.clientWidth; let px = p.x + dx;
    if (px < 90 || px > W - 90) { const half = el.offsetWidth / 2 + 4; if (half < W / 2) px = Math.min(Math.max(px, half), W - half); }
    el.style.transform = `translate(${Math.round(px)}px, ${Math.round(p.y + dy)}px)`; el.classList.toggle('offscreen', p.behind || p.x < 0 || p.x > W); return p;
  }
  function layoutOverlay() {
    if (world.showcase.on || director.over) return;   // (the seat's view only: the lobby and the squeeze have the camera elsewhere)
    for (const id of SPOT_IDS) {
      const pts = outline(id).map(([x, z]) => world.project(x, 0, z)), l = Math.min(...pts.map(p => p.x)), r = Math.max(...pts.map(p => p.x)), t = Math.min(...pts.map(p => p.y)), b = Math.max(...pts.map(p => p.y));
      Object.assign(spotEls[id].style, { left: `${l}px`, top: `${t}px`, width: `${r - l}px`, height: `${b - t}px` });
    }
    place(totals.player, -BL.total.x, 0, BL.total.z); place(totals.banker, BL.total.x, 0, BL.total.z);   // side by side between the hands, each next to its own
    // A neighbour's coin stands just inside their Tie circle, toward the middle of the table (the rail by their seat is
    // out of the picture), clear of their spots and of the printing.
    const T = BL.seat.tie;
    for (const [k, tag] of Object.entries(seatEls)) {
      const edge = toSeat(+k, T.x, T.z - T.r), far = toSeat(+k, T.x, T.z - T.r - 12), a = world.project(edge.x, 0, edge.z), b = world.project(far.x, 0, far.z), d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      place(tag, edge.x, 0, edge.z, (b.x - a.x) / d * 19, (b.y - a.y) / d * 19);
    }
  }
  function setTotal(side, n, cls = '') { const el = totals[side], v = el.firstChild, text = String(n); el.hidden = false; el.className = `hand-total b-total ${cls}`; if (el.dataset.v === text) return; const first = !el.dataset.v; el.dataset.v = text; ui.morph(v, text); if (first) ui.pop(v, { from: .5 }); else ui.bump(v, 1.2); }
  function clearTotals() { for (const el of Object.values(totals)) { el.hidden = true; el.className = 'hand-total b-total'; delete el.dataset.v; } }

  // ---- the road: this shoe's coups as beads over the table, and behind them the big road ---------------------------------
  const BEAD = { player: 'P', banker: 'B', tie: 'T' };
  function renderRoad() {
    const road = table.road, last = road.slice(-14), list = roadEl.firstElementChild;
    list.innerHTML = last.map((r, i) => `<li class="${r.winner}${i === last.length - 1 ? ' latest' : ''}${r.playerPair ? ' pp' : ''}${r.bankerPair ? ' bp' : ''}">${BEAD[r.winner]}</li>`).join('');
    roadEl.classList.toggle('empty', !road.length); roadEl.disabled = !road.length; if (!road.length) setRoads(false);   // (its place over the table is kept while it is empty: nothing moves as the first bead comes)
    const t = tally(road); roadEl.setAttribute('aria-label', road.length ? `This shoe so far: Player ${t.player}, Banker ${t.banker}, ties ${t.tie}. Open the roads` : 'This shoe so far');
    if (!roadsEl.hidden) renderRoads();
  }
  function renderRoads() {
    const cells = bigRoad(table.road), cols = Math.max(14, ...cells.map(c => c.col + 1)), t = tally(table.road);
    roadsEl.innerHTML = `<header><h3>Big road</h3><p>${t.coups} coup${t.coups === 1 ? '' : 's'} · ${CUT_AT - table.dealt > 0 ? `the cut card in ${CUT_AT - table.dealt} cards` : 'the last of this shoe'}</p></header>
      <div class="br-scroll"><div class="br-grid" style="--cols:${cols}" role="img" aria-label="${cells.length ? `The runs so far: ${runsSaid()}` : 'No coups yet'}">${cells.map(c => `<i class="${c.winner}${c.natural ? ' nat' : ''}" style="grid-column:${c.col + 1};grid-row:${c.row + 1}">${c.ties ? `<b>${c.ties > 1 ? c.ties : ''}</b>` : ''}</i>`).join('')}</div></div>
      <dl class="br-tally"><div class="player"><dt>Player</dt><dd>${t.player}</dd></div><div class="banker"><dt>Banker</dt><dd>${t.banker}</dd></div><div class="tie"><dt>Tie</dt><dd>${t.tie}</dd></div><div><dt>Naturals</dt><dd>${t.natural}</dd></div><div><dt>Pairs</dt><dd>${t.playerPair + t.bankerPair}</dd></div></dl>`;
    const sc = roadsEl.querySelector('.br-scroll'); sc.scrollLeft = sc.scrollWidth;
  }
  function runsSaid() { const runs = []; for (const r of table.road) { if (r.winner === 'tie') continue; const l = runs.at(-1); if (l && l[0] === r.winner) l[1]++; else runs.push([r.winner, 1]); } return runs.slice(-8).map(([w, n]) => `${NAME[w]} ${n}`).join(', '); }
  function setRoads(open) { if (open === !roadsEl.hidden) return; if (open) { renderRoads(); ui.shown(roadsEl); roadsEl.hidden = false; uiSound('open'); } else { roadsEl.hidden = true; } roadEl.setAttribute('aria-expanded', open); }
  roadEl.addEventListener('click', () => setRoads(roadsEl.hidden));

  // ---- betting ----------------------------------------------------------------------------------------------------------
  const broke = () => mode === 'betting' && !table.total && wallet.balance < 1;
  function refuse(why, el) { hint(why); feel.tap('refuse'); feel.cue('error'); if (el) { if (el.classList.contains('spot')) { el.classList.remove('refused'); void el.offsetWidth; el.classList.add('refused'); } else kit.shake(el); } }
  function placeChip(id) {
    if (mode !== 'betting') return;
    const v = rack.value, why = table.place([[id, v]]); if (why) { refuse(why, spotEls[id]); return; }
    feel.tap('chip'); serial(() => view.addChip(id, v)); refresh();
  }
  function removeFrom(id) { if (mode !== 'betting' || !table.takeFrom(id)) return; serial(() => view.removeTop(id)); refresh(); }
  const syncYours = () => Promise.all(SPOT_IDS.map(id => view.syncStack(id, table.bets.get(id) ?? [])));
  const actions = {
    undo() { if (mode !== 'betting') return; const g = table.undo(); if (!g) return; serial(async () => { for (const [id] of [...g].reverse()) await view.removeTop(id); }); refresh(); },
    clear() { if (mode !== 'betting' || !table.clear()) return; serial(syncYours); refresh(); },
    rebet() { if (mode !== 'betting') return; const why = table.rebet(); if (why) { refuse(why, $('#bRebet')); return; } feel.tap('chip'); serial(syncYours); refresh(); },
    double() { if (mode !== 'betting') return; const why = table.double(); if (why) { refuse(why, $('#bX2')); return; } feel.tap('chip'); serial(syncYours); refresh(); },
    deal() {
      if (mode !== 'betting') return; feel.tap('press');
      if (broke()) { ctx.resetBalance(); return; }
      if (!table.total && table.canRebet) { const why = table.rebet(); if (why) { refuse(why, $('#bDeal')); return; } serial(syncYours); }
      if (!table.total) { refuse('Place a bet on Player, Banker or the Tie first.', $('#bDeal')); return; }
      if (table.total > wallet.balance) { refuse('Not enough balance for these bets.', $('#bDeal')); return; }
      mode = 'dealing'; refresh(); setRoads(false); serial(round);
    },
  };
  $('#bUndo').onclick = actions.undo; $('#bClear').onclick = actions.clear; $('#bRebet').onclick = actions.rebet; $('#bX2').onclick = actions.double; $('#bDeal').onclick = actions.deal;
  $('#bTurn').onclick = () => { if (squeeze.turn()) feel.tap('press'); };
  kit.shimmer($('#bDeal'));

  // ---- the other players ---------------------------------------------------------------------------------------------------
  // Each puts a bet down in their own time once bets are open, on their own spots; a Deal before they have hurries them.
  const theirs = new Map();   // seat → [[spot, stake], ...], this coup
  let betJobs = [];
  function othersBet() {
    for (const j of betJobs) j.cancel(); betJobs = [];
    if (mode !== 'betting' || !active) return;
    for (const { seat, p } of others()) {
      if (theirs.has(seat) || p.bankroll < 5) continue;
      let timer = 0, gone = false;
      const go = () => {
        if (gone || mode === 'paying') return; gone = true; clearTimeout(timer);
        const adds = rivalBet({ temper: TEMPER_OF[p.styleId] ?? 'whim', base: Math.min(p.base, Math.max(5, Math.floor(p.bankroll / 4))) }, table.road).filter(([, v]) => v <= p.bankroll);
        if (!adds.length) return; let left = p.bankroll; const fit = adds.filter(([, v]) => (left -= v) >= 0);
        theirs.set(seat, fit); p.bankroll -= fit.reduce((s, [, v]) => s + v, 0); renderSeats(); openTag(seat);
        for (const [id, v] of fit) void view.addAmount(seatKey(seat, id), v);
      };
      timer = setTimeout(go, (500 + Math.random() * 2600) * motion.slow);
      betJobs.push({ hurry: go, cancel: () => { gone = true; clearTimeout(timer); } });
    }
  }
  const othersReady = () => { for (const j of betJobs) j.hurry(); betJobs = []; };
  function clearOthers() { for (const j of betJobs) j.cancel(); betJobs = []; for (const [seat, adds] of theirs) { const p = seating.seats[seat]; if (p) p.bankroll += adds.reduce((s, [, v]) => s + v, 0); for (const [id] of adds) view.syncStack(seatKey(seat, id), []); } theirs.clear(); renderSeats(); }

  // ---- the shoe ------------------------------------------------------------------------------------------------------------
  // The coup's cards are drawn as its bets close, so the shoe on the table runs behind the rules' shoe by the cards still
  // to come out (`queue`, in the order they do).
  let queue = [], cutOut = false;
  const coming = () => [...queue, ...table.cards.slice(-2).reverse()];
  const syncShoe = () => view.syncShoe(Math.max(0, table.remaining + queue.length - 1), CUT_AT - (table.dealt - queue.length));
  function stageNext(how = 'settle') { view.stageFront(coming()[0] ?? null, how); syncShoe(); }
  async function out(owner, i, { more = false, ...opts } = {}) {
    const card = queue.shift(), next = coming();
    await view.deal(card, { owner, i, next: stageNext, follow: more ? next[1] ?? null : null, ...opts });
    if (table.dealt - queue.length >= CUT_AT && !cutOut) { cutOut = true; hint('The cut card is out. This is the last coup of the shoe.'); await view.ejectCut(); }
    return view.cards.at(-1);
  }
  async function newShoe() {
    const burnt = table.newShoe(), d = changeDealer(); cutOut = false; says('bj-new-shoe', { prio: 2 }); renderRoad();
    hint(d ? `New shoe. ${d.name} takes over the table.` : 'New shoe. Eight decks, freshly shuffled.');
    await view.newShoe(SHOE_CARDS - 1, CUT_AT); view.stageFront(burnt); await view.burn(burnt, stageNext);
  }

  // ---- a coup ----------------------------------------------------------------------------------------------------------------
  const cap = s => s[0].toUpperCase() + s.slice(1);
  const entryOf = r => ({ game: 'baccarat', table: r.kind, net: r.net, staked: r.staked, back: r.back, winner: r.winner, p: r.p, b: r.b, natural: r.natural, player: r.player.map(cardText), banker: r.banker.map(cardText),
    wins: r.wins, pushes: r.pushes, losses: r.losses, commission: r.commission, playerPair: r.playerPair, bankerPair: r.bankerPair });
  function paid(r) {
    if (r.paid) return; r.paid = true;
    if (r.rec && !inFlight.lost('coup')) ctx.record?.(r.rec);   // in Last hands, and counted in the hall of fame
    inFlight.set('coup', null); held = null; ctx.showBalance(); refresh();
  }
  async function round() {
    if (mode !== 'dealing') return;
    othersReady();
    const mine = !settings.squeeze ? null : table.on('player') >= table.on('banker') ? (table.on('player') ? 'player' : null) : 'banker';
    if (!table.close()) { mode = 'betting'; refresh(); hint('The cards could not be dealt: your balance changed. Check your bets.'); return; }
    held = wallet.balance;
    const r = table.settle();   // the coup, drawn and paid as the bets close
    r.rec = entryOf(r); inFlight.set('coup', r.rec);
    queue = [r.player[0], r.banker[0], r.player[1], r.banker[1], ...r.player.slice(2), ...r.banker.slice(2)];
    // the other players' bets are settled on the same coup
    const seats = [...theirs].map(([seat, adds]) => ({ seat, p: seating.seats[seat], bets: adds.map(([id, stake]) => ({ id, stake, got: returned(id, stake, r, r.kind) })) }));
    for (const s of seats) if (s.p) s.p.bankroll += s.bets.reduce((a, b) => a + b.got, 0);
    hurry = 0; refresh(); clearResult(); hint('');
    try { await show(r, mine, seats); }
    catch (err) {
      console.error('baccarat coup', err);   // the show broke: the coup stands as it was settled, said in words
      squeeze.end(); director.reset(); queue = []; view.clearCards(); view.clearChips(); theirs.clear(); clearTotals(); renderSeats(); stage.dataset.mode = dock.dataset.mode = 'bet';
      paid(r); mode = 'betting'; world.frame && reframe(true); stageNext(); renderRoad(); refresh();
      hint(`${r.winner === 'tie' ? 'A tie' : `${NAME[r.winner]} won`}, ${r.p} to ${r.b}. ${r.net > 0 ? `You won ${fmt(r.net)}.` : r.net < 0 ? `You lost ${fmt(-r.net)}.` : 'Your stake is back.'}`);
    }
  }
  const sayTotal = (side, n) => call(`${side}-${n}`);
  function setMode(m) { mode = m; const d = m === 'squeeze' ? 'squeeze' : m === 'betting' ? 'bet' : 'deal'; stage.dataset.mode = dock.dataset.mode = d; refresh(); }
  // Your cards come to you, the camera leans in, and you turn them; then they go back to their place.
  async function squeezeThem(side, cards, places) {
    setMode('squeeze'); stage.classList.add('b-close');
    await Promise.all([view.slide(cards.map((c, n) => ({ c, owner: 'squeeze', i: cards.length === 1 ? 2 : n })), 520), director.lean(true)]);
    hint(cards.length > 1 ? 'Draw a card up by its edge to squeeze it, or turn it over.' : 'Your third card: draw it up by its edge, or turn it over.');
    $('#bTurn').focus({ preventScroll: true });
    await squeeze.begin(cards, c => { tell(`${cap(cardWords(c.card))}.`); hint(squeeze.left ? 'And the other.' : ''); });
    await motion.wait(520);   // a breath with both in view
    stage.classList.remove('b-close'); setMode('dealing');
    await Promise.all([view.slide(cards.map((c, n) => ({ c, owner: side, i: places[n] }))), director.lean(false)]);
    layoutOverlay();
  }
  async function show(r, mine, seats) {
    const first = { player: points(r.player.slice(0, 2)), banker: points(r.banker.slice(0, 2)) }, hid = side => side === mine;
    const a = await out('player', 0, { hidden: hid('player'), more: true }), b = await out('banker', 0, { hidden: hid('banker'), more: true });
    const c = await out('player', 1, { hidden: hid('player'), more: true }), d = await out('banker', 1, { hidden: hid('banker'), more: queue.length > 0 });
    if (!mine) { setTotal('player', first.player); await sayTotal('player', first.player); setTotal('banker', first.banker); await sayTotal('banker', first.banker); }
    else {
      const other = mine === 'player' ? 'banker' : 'player'; setTotal(other, first[other]); await sayTotal(other, first[other]);   // the other side first: you know what you need
      await squeezeThem(mine, mine === 'player' ? [a, c] : [b, d], [0, 1]);
      setTotal(mine, first[mine]); await sayTotal(mine, first[mine]);
    }
    if (r.natural) { tell(`A natural. Player ${r.p}, Banker ${r.b}.`); await motion.wait(260); }
    for (const side of ['player', 'banker']) {
      if (r[side].length < 3) continue;
      const callIt = call(`card-${side}`, 360); hint(`A card for the ${NAME[side]}.`);
      if (side === mine) { const t = await out('squeeze', 2, { hidden: true, more: queue.length > 0 }); await callIt; await squeezeThem(side, [t], [2]); }
      else { await Promise.all([out(side, 2, { more: queue.length > 0 }), callIt]); }
      setTotal(side, r[side === 'player' ? 'p' : 'b']); await sayTotal(side, r[side === 'player' ? 'p' : 'b']);
    }
    // the call
    hint(''); setMode('paying');
    for (const side of ['player', 'banker']) setTotal(side, r[side === 'player' ? 'p' : 'b'], r.winner === side ? 'win' : r.winner === 'tie' ? 'push' : 'loss');
    const title = r.winner === 'tie' ? `Tie, ${r.p} all` : `${NAME[r.winner]} wins, ${Math.max(r.p, r.b)} to ${Math.min(r.p, r.b)}`;
    tell(`Player ${handWords(r.player)}: ${r.p}. Banker ${handWords(r.banker)}: ${r.b}. ${title}. ${r.net > 0 ? `You win ${fmt(r.net)}.` : r.net < 0 ? `You lose ${fmt(-r.net)}.` : 'Your stake comes back.'}`);
    showResult(r, title);
    await call(r.winner === 'tie' ? 'tie' : `${r.winner}-wins`, 700);
    // the chips: the losers to the rack, the winners paid from it, every seat at once
    const mineKeys = { lose: r.losses.map(l => l.id), win: r.wins.map(w => [w.id, w.pay]) };
    const lose = [...mineKeys.lose, ...seats.flatMap(s => s.bets.filter(x => x.got === 0).map(x => seatKey(s.seat, x.id)))];
    const win = [...mineKeys.win, ...seats.flatMap(s => s.bets.filter(x => x.got > x.stake).map(x => [seatKey(s.seat, x.id), x.got - x.stake]))];
    await Promise.all(lose.map((k, i) => motion.wait(i * 60).then(() => view.toRack(k))));
    await Promise.all(win.map(([k, pay], i) => motion.wait(i * 90).then(() => view.payout(k, pay))));
    for (const w of r.wins) { const el = spotEls[w.id].querySelector('.amount'); el.textContent = `+${fmt(w.pay)}`; el.hidden = false; el.classList.add('won'); }
    for (const s of seats) { const net = s.bets.reduce((x, y) => x + y.got - y.stake, 0); if (net > 0) seatSays(s.seat, `+${fmt(net)}`, 1800); }
    renderSeats(); paid(r);
    if (r.net > 0) { feel.tap(r.net >= 500 ? 'big' : 'win'); sting(r.net >= 500 || r.wins.some(w => w.id !== 'player' && w.id !== 'banker') ? 'big' : 'small', .7); if (r.net >= 1000) feel.confetti({ size: r.net >= 5000 ? 2 : 1 }); }
    await motion.wait(hurry ? 250 : 1250);
    await Promise.all([view.toPlayer(), view.collectCards()]);
    theirs.clear(); clearTotals(); renderRoad(); for (const id of SPOT_IDS) spotEls[id].querySelector('.amount').classList.remove('won');
    if (table.cutReached) await newShoe();
    else { const ch = [...seating.replaceLeaving(), ...seating.arrange(settings.players)]; if (ch.length) { renderSeats(); for (const x of ch) if (x.joined) seatSays(x.seat, 'Sits down', 2600); } }
    setMode('betting'); says('bj-place-bets', { prio: 2, fresh: 3000 }); othersBet();
  }

  // ---- the result ----------------------------------------------------------------------------------------------------------
  let winTimer = 0;
  function showResult(r, title) {
    winEl.className = `r-win b-win ${r.winner} ${r.net > 0 ? 'up' : r.net < 0 ? 'down' : ''}`;
    const extra = [r.natural ? 'A natural' : '', r.playerPair ? 'Player pair' : '', r.bankerPair ? 'Banker pair' : '', r.commission ? `commission ${fmt(r.commission)}` : ''].filter(Boolean).join(' · ');
    winEl.querySelector('small').textContent = title; winEl.querySelector('b').textContent = extra; winEl.querySelector('b').hidden = !extra;
    winEl.querySelector('em').textContent = r.net ? signed(r.net) : 'Even'; winEl.querySelector('.r-gross').textContent = r.back > 0 && r.net !== r.back - 0 && r.staked ? `${fmt(r.back)} back on ${fmt(r.staked)}` : '';
    ui.shown(winEl); winEl.hidden = false; void winEl.offsetWidth; winEl.classList.add('show');
    clearTimeout(winTimer); winTimer = setTimeout(clearResult, 6500);
  }
  function clearResult() { clearTimeout(winTimer); if (winEl.hidden) return; winEl.classList.remove('show'); setTimeout(() => { if (!winEl.classList.contains('show')) winEl.hidden = true; }, 260); }

  // ---- the controls -----------------------------------------------------------------------------------------------------
  function refresh() {
    const betting = mode === 'betting', total = table.total, bal = held ?? wallet.balance, out0 = broke(), down = betting ? total : table.staked ?? 0;
    $('#bUndo').disabled = !betting || !table.history.length; $('#bClear').disabled = !betting || !total;
    rebetSlot($('#bRebet'), $('#bX2'), !!total || !betting);
    $('#bRebet').disabled = !betting || !table.canRebet; $('#bX2').disabled = !betting || !total || total * 2 > bal || SPOT_IDS.some(id => table.on(id) * 2 > SPOTS[id].max);
    $('#bDeal').disabled = !betting || (!total && !table.canRebet && !out0) || total > bal;
    goLabel($('#bDeal'), 'Deal', { out: out0, rebet: betting && !total && table.canRebet });
    rack.fit(bal - (betting ? total : 0));
    for (const id of SPOT_IDS) {
      const el = spotEls[id], on = table.on(id), a = el.querySelector('.amount'); el.disabled = !betting;
      if (!a.classList.contains('won')) { a.hidden = !on; a.textContent = fmt(on); }
      el.setAttribute('aria-label', `${NAME[id]}, pays ${paysOf(id)}${on ? `, ${fmt(on)} bet` : ''}`);
    }
    if (!stage.hidden && active) ctx.showInPlay(mode === 'paying' ? 0 : down);
    if (betting && active) {
      if (out0) hint(`You are out of chips. Tap Reset for a fresh ${fmt(wallet.START)}.`);
      else if (!total) hint(table.canRebet ? `Place your bets, or rebet ${fmt(table.lastTotal)}.` : 'Choose a chip, then tap Player, Banker or the Tie.');
      else hint(`Bet ${fmt(total)}. Deal when ready.`);
    }
  }
  let framed = '';
  function reframe(force = false) {
    if (!active && !world.showcase.on || document.body.dataset.going === 'baccarat') return;   // (leaving through the portal: framed as it stood)
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    const bar = ctx.barCover(stage), strip = roadEl.offsetHeight + 8, top = bar + strip, under = ctx.dockCover(stage), k = `${w}x${h}x${top}x${under}`;
    stage.style.setProperty('--top-h', `${bar}px`); stage.style.setProperty('--under', `${under}px`); stage.style.setProperty('--strip', `${strip}px`);
    if (k === framed && !force) return; framed = k;
    world.frame(w, h + under, top, under ? under + ctx.BLUR_RISE : 0); layoutOverlay();
  }
  new ResizeObserver(() => requestAnimationFrame(() => reframe())).observe(stage);
  new ResizeObserver(() => requestAnimationFrame(() => reframe())).observe(dock);

  // Space and Enter deal, turn your card over, and hurry what is being shown; P, B and T put the chip in hand on
  // Player, Banker and the Tie (with Shift, on that side's pair).
  function onKey(e) {
    const k = e.key.toLowerCase(), go = k === ' ' || k === 'enter';
    if (k === 'escape' && !roadsEl.hidden) { setRoads(false); roadEl.focus(); return true; }
    if (go) {
      e.preventDefault(); if (e.repeat) return true;
      if (mode === 'betting') actions.deal(); else if (mode === 'squeeze') { if (squeeze.turn()) feel.tap('press'); } else { hurry++; motion.finishAll(); }
      return true;
    }
    if (e.repeat || mode !== 'betting') return false;
    const spot = { p: e.shiftKey ? 'ppair' : 'player', b: e.shiftKey ? 'bpair' : 'banker', t: 'tie' }[k];
    if (spot) { placeChip(spot); return true; }
    return betKey(k, { ...actions, chip: rack.select, values: rack.values });
  }

  // One wallet: the balance can move under this table (another table, or the salon open in another window).
  wallet.subscribe(() => {
    if (!active || held != null || mode !== 'betting') return;
    ctx.showBalance();
    if (table.total > wallet.balance) { table.clear(); serial(syncYours); refresh(); hint('Your bets were cleared: your balance changed in another window.'); return; }
    refresh();
  });

  // ---- the table's two sets of rules ---------------------------------------------------------------------------------------
  async function setKind(k, { sweep = false } = {}) {
    if (!TABLES[k] || k === kind || mode !== 'betting') return;
    const dress = () => { kind = k; table.setKind(k); store.set('baccaratTable', k); document.body.dataset.btable = k; world.setMode(TABLES[k]); if (!stage.hidden) ctx.title(TABLES[k].title, 'Baccarat'); refresh(); };
    if (sweep && !stage.hidden && world.showcase.on) await world.swap(dress, { tone: 'gold', calm: settings.reduced }); else dress();
  }

  // ---- start ---------------------------------------------------------------------------------------------------------------
  world.discard.set(1);   // this shoe's burn card
  stageNext(); renderSeats(); renderRoad(); refresh();
  world.warm({ drawn: [createCard({ rank: 'A', suit: '♠' }, view.deck), createChip(5)] });
  world.pause(true);   // out of sight until the salon shows the room
  requestAnimationFrame(() => requestAnimationFrame(loadCourtArt));

  const api = {
    stage, dock, scene: world, table, onKey, hint, round: 'coup',
    get busy() { return mode !== 'betting'; },
    get mode() { return mode; },
    get kind() { return kind; }, setKind, preview: (k, { sweep = true } = {}) => setKind(k, { sweep }),
    show() {
      stage.hidden = dock.hidden = false; world.pause(false); framed = ''; reframe();
      ctx.title(TABLES[kind].title, 'Baccarat'); ctx.showBalance(wallet.balance, false);
      if (mode === 'betting' && table.total > wallet.balance) { table.clear(); serial(syncYours); hint('Your bets were cleared: your balance changed at another table.'); }
      ctx.showInPlay(table.total); renderSeats(); refresh();
    },
    hide() { stage.hidden = dock.hidden = true; world.showcase.stop(0); world.pause(true); active = false; setRoads(false); for (const j of betJobs) j.cancel(); betJobs = []; },
    showcase: { start(still) { world.showcase.start(still); framed = ''; reframe(); world.requestRender(); }, stop: ms => world.showcase.stop(ms) }, portal,
    toLobby() { active = false; for (const j of betJobs) j.cancel(); betJobs = []; setRoads(false); api.showcase.start(settings.reduced); },
    fromLobby() { framed = ''; reframe(); },
    async enter(ms, { tableMode, direct = false } = {}) {
      if (tableMode) await setKind(tableMode);
      active = true; framed = ''; reframe();
      if (!direct) await world.showcase.stop(ms);
      document.body.classList.remove('flying'); layoutOverlay(); dealerNote(); refresh();
      if (welcome) { hint(welcome); welcome = null; }
      if (mode === 'betting') { says('bj-place-bets', { prio: 2, fresh: 3000 }); othersBet(); }
    },
    players: () => others().map(x => x.p.name),
    setPlayers() { if (mode !== 'betting') return; clearOthers(); seating.arrange(settings.players); renderSeats(); layoutOverlay(); othersBet(); },
    callBets: () => says('bj-place-bets', { prio: 3 }),
    setReduced(on) { motion.reduced = on; },
    setFast(on) { motion.slow = on ? .62 : 1; },
    setQuality(q) { world.setQuality(q); },
    setSqueeze(on) { settings.squeeze = on; },
    refresh, reframe: () => { framed = ''; reframe(); },
    test: ctx.dev ? { table, view, motion, world, director, squeeze, seating, get mode() { return mode; }, rig(order) { const c = s => ({ rank: s.slice(0, -1), suit: s.slice(-1) }); table.stacked.push(...order.map(c)); stageNext(); }, place: (id, v = rack.value) => { rack.select(v); placeChip(id); } } : undefined,
  };
  return api;
}
