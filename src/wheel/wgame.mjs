// The money wheel's room. Rules and odds: wheel/rules.mjs; the wheel's motion: wheel/physics.mjs; the wheel, the
// counter, its chips and the camera's views: wheel/wscene.mjs. The room takes the salon's `ctx` and gives back what
// every room does (app.mjs).
//
// A round: you put chips on any of the six numbers and press Spin. Bets close then, and the round is drawn and
// settled in that same moment (rule 7: money moves as bets close, with a record a closed page leaves for the next
// visit): where the wheel will stop, and, each time that is a multiplier, where it stops next. What follows only
// shows it. The host takes hold of the wheel and pulls: a spin found ahead in the simulation to come to rest in the
// drawn segment, shown as simulated, every peg's clack where the simulation has it. A multiplier keeps every bet on
// the cloth, is called, and the wheel is spun again; the number it ends on pays its spot that number to one, times the
// multipliers before it. The losing chips go to the tray, the winners are paid from it.
import { WheelTable, SEGMENTS, PITCH, SPOTS, SPOT_IDS, NUMBERS, isMultiplier, valueOf, outcome, stats } from './rules.mjs';
import { plan, at, PHYS } from './physics.mjs';
import { createWheelScene, WheelChips } from './wscene.mjs';
import { createPortal } from '../scene/portal.mjs';
import { Motion, createChip, ease } from '../scene/pieces.mjs';
import { Seating } from '../players.mjs';
import { wallet, inFlight } from '../core/wallet.mjs';
import { fmt, signed } from '../core/format.mjs';
import { chipRack, hintLine, rebetSlot, goLabel, serialQueue, betKey } from '../core/bet-controls.mjs';

export const WH_LINES = ['1', '2', '5', '10', '20', '40', 'x2', 'x3', 'x6', 'again'];   // the host's calls: voice/james-wh-*
export const CLACKS = 5;   // wheel-clack-1…: a peg past the flapper
const KEYS = { a: 'n1', s: 'n2', d: 'n5', f: 'n10', g: 'n20', h: 'n40' };   // the six spots, left to right on the home row
const ORDER = [1, 3, 0, 4];   // the other players' seats, nearest you first: their place on a spot and along the rail
// what each of the salon's players likes at the wheel: the numbers they lean to (players.mjs gives them their names, bankrolls and usual stakes)
const TASTE = { steady: [1, 1, 1, 2, 2], careful: [1, 1, 2], hunch: [1, 2, 5, 5, 10, 20], whale: [5, 10, 10, 20, 40], chaser: [10, 20, 20, 40] };

export async function createWheel(ctx) {
  const { app, audio, settings, store, ui, kit, uiSound, sting } = ctx;
  const feel = ctx.feel ?? { tap() {}, cue() {}, confetti() {} };

  // ---- the stage and the dock ----------------------------------------------------------------------------------------
  const stage = document.createElement('section'); stage.className = 'stage wstage'; stage.id = 'wstage'; stage.setAttribute('aria-label', 'Money wheel'); stage.dataset.mode = 'bet'; stage.dataset.view = 'seat';
  stage.innerHTML = `<canvas class="wcanvas" aria-hidden="true"></canvas>
    <div class="overlay w-overlay"></div>
    <ol class="w-trail empty" id="wTrail" aria-label="The last spins"></ol>
    <div class="w-mult" hidden aria-hidden="true"><b class="foil"></b><small>on every bet</small></div>
    <div class="r-win w-win" hidden><small></small><b></b><em></em><span class="r-gross"></span></div>
    <p class="hint w-hint" aria-live="polite"><span></span></p>
    <p class="sr-only" id="wSaid" aria-live="polite"></p>
    <div class="r-fade" aria-hidden="true"></div>`;
  const dock = document.createElement('footer'); dock.className = 'dock tdock wdock'; dock.dataset.mode = 'bet';
  dock.innerHTML = `<div class="dock-blur" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="chips" id="wChips" role="radiogroup" aria-label="Chip value"></div>
    <div class="bet-actions">
      <button class="pill t-undo" id="wUndo" aria-keyshortcuts="U" aria-label="Undo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg><span class="label">Undo</span></button>
      <button class="pill t-clear" id="wClear" aria-keyshortcuts="C" aria-label="Clear bets"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg><span class="label">Clear</span></button>
      <button class="pill t-rebet" id="wRebet" aria-keyshortcuts="R" aria-label="Rebet"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg><span class="label">Rebet</span></button>
      <button class="pill t-x2" id="wX2" aria-keyshortcuts="X" aria-label="Double bets"><span class="glyph">×2</span><span class="label">Double</span></button>
      <button class="pill gold deal t-go" id="wSpin" aria-keyshortcuts="Space"><span class="label">Spin</span></button>
    </div>`;
  app.append(stage, dock);
  const $ = s => stage.querySelector(s) ?? dock.querySelector(s);
  const canvas = $('.wcanvas'), overlay = $('.w-overlay'), trailEl = $('.w-trail'), multEl = $('.w-mult'), winEl = $('.w-win'), said = $('#wSaid'), fadeEl = $('.r-fade');
  const hint = hintLine($('.w-hint'));

  const S = createWheelScene(canvas, { quality: ctx.quality() });
  const portal = createPortal(S, { body: S.table, floorY: S.floorY(), showcase: S.showcase, audio, reduced: () => settings.reduced });   // (the lobby's change of game: scene/portal.mjs)
  const motion = new Motion(S), chips = new WheelChips(S, motion, audio);
  Object.assign(motion, { reduced: settings.reduced, slow: settings.fast ? .62 : 1 });

  // One wallet: the table reads and writes it through `bank`. While a round is shown the balance on the bar is held at
  // what it was as the bets closed (`held`), and let go as the winnings are paid on the cloth.
  let held = null;
  const bank = { get: () => wallet.balance, set: v => { wallet.set(v); if (held == null) ctx.showBalance(); } };
  const table = new WheelTable({ bank, random: ctx.random });
  let mode = 'betting', active = false, welcome = null, hurry = false, rigged = null;   // mode: betting | spinning | paying
  // The camera to one of its views (`S.move`): a glide, or with Reduce motion a short fade through dark with the change
  // under it (as the roulette table's camera does).
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function lookAt(name, ms) {
    if (!settings.reduced) return S.move(name, ms);
    fadeEl.classList.add('on'); await sleep(140); await S.move(name, 0); await sleep(40); fadeEl.classList.remove('on');
  }
  const trail = store.get('wheelHistory', []).filter(r => Array.isArray(r) && r.every(s => SEGMENTS.includes(s))).slice(0, 100);   // the rounds you have seen, newest first: each its segments
  const said1 = o => `${o.x > 1 ? `${o.segs.slice(0, -1).map(s => `times ${valueOf(s)}`).join(', ')}, then ` : ''}${o.n}`;
  // A round a closed page left: its money moved as its bets closed, so it only needs writing down and a word.
  await inFlight.take('wheel', r => {
    if (!Number.isFinite(r?.net) || !NUMBERS.includes(r.n)) return;
    ctx.record?.(r);
    ctx.notice?.(`Your last spin: the wheel stopped on ${r.n}${r.x > 1 ? `, multiplied by ${r.x}` : ''}; ${r.back > 0 ? `${fmt(r.back)} was paid to your balance` : 'no win'}.`, t => { welcome = t; });
  });

  // ---- the host ---------------------------------------------------------------------------------------------------------
  const say = (line, opts) => audio.say(`voice/james-${line}`, opts);
  // a call the picture waits for: at least a beat, and the line when the sound is on
  const call = (line, ms = 620) => Promise.all([say(line, { prio: 2 }), motion.wait(ms)]);
  ctx.warm([...WH_LINES.map(l => `voice/james-wh-${l}`), 'voice/james-place-bets', 'voice/james-no-more-bets', 'voice/james-congrats', ...Array.from({ length: CLACKS }, (_, i) => `wheel-clack-${i + 1}`), 'whoosh']);
  const tell = t => { if (said.textContent !== t) { said.textContent = t; return; } said.textContent = ''; setTimeout(() => { said.textContent = t; }, 60); };

  // ---- the overlay: your six spots, the other players' coins along the rail ------------------------------------------
  const rack = chipRack($('#wChips'), { store, uiSound });
  const serial = serialQueue(err => console.error('wheel bets', err));
  const spotEls = {};
  for (const id of SPOT_IDS) {
    const b = document.createElement('button'); b.className = 'spot w-spot'; b.dataset.spot = id;
    b.innerHTML = '<span class="amount" hidden></span>'; pressable(b, () => placeChip(id), () => removeFrom(id)); overlay.append(b); spotEls[id] = b;
  }
  // Tap adds the chip in hand; press and hold (or right-click) takes the last chip off.
  function pressable(el, tap, hold) {
    let timer = 0, heldDown = false;
    el.addEventListener('pointerdown', e => { if (e.button > 0) return; heldDown = false; clearTimeout(timer); timer = setTimeout(() => { heldDown = true; hold(); navigator.vibrate?.(12); }, 480); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => clearTimeout(timer));
    el.addEventListener('click', e => { if (heldDown) { e.preventDefault(); heldDown = false; return; } tap(); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); clearTimeout(timer); if (!heldDown) hold(); heldDown = false; });
  }
  // The others: a small coin with an initial on the rail, the name and chips coming out of it while its player acts
  // (as at the baccarat table), under the pointer or at a tap.
  const seating = new Seating(); seating.arrange(settings.players);
  const others = () => ORDER.map((seat, i) => ({ seat, i, p: seating.seats[seat] })).filter(o => o.p);
  const keyOf = (i, id) => `o${i}${id}`;
  const seatEls = {}, seatX = {}, openTimers = {}, sayTimers = {};
  // Two of them stand on each side of you (i ^ 2: the other on that side), close together on a phone, where one's
  // name would open over the other's: there the one who acted last has the place, and a coin a name lies over stands
  // aside until the name has closed.
  const spanOf = i => { const w = 40 + Math.min(150, seatEls[i].querySelector('.who').scrollWidth), x = seatX[i] ?? 0; return i % 2 ? [x + 14 - w, x + 14] : [x - 14, x - 14 + w]; };
  const meet = (a, b, gap) => a[0] < b[1] + gap && b[0] < a[1] + gap;
  const shutTag = i => { seatEls[i]?.classList.remove('open'); seatEls[i ^ 2]?.classList.remove('under'); };
  function openTag(i, ms = 2200) {
    const tag = seatEls[i], j = i ^ 2, mate = seatEls[j]; if (!tag) return;
    if (mate) { const a = spanOf(i); if (mate.classList.contains('open') && meet(a, spanOf(j), 6)) shutTag(j); mate.classList.toggle('under', meet(a, [seatX[j] - 14, seatX[j] + 14], 2)); }
    tag.classList.remove('under'); tag.classList.add('open'); clearTimeout(openTimers[i]); openTimers[i] = setTimeout(() => shutTag(i), ms);
  }
  ORDER.forEach((seat, i) => {
    const tag = document.createElement('div'); tag.className = `seat-tag b-seat away${i % 2 ? ' rhs' : ''}`; tag.innerHTML = '<span class="av"></span><span class="who"><b></b><span class="bank"></span></span><span class="say"></span>';
    tag.addEventListener('click', () => openTag(i, 2600)); overlay.append(tag); seatEls[i] = tag;
  });
  function renderSeats() {
    ORDER.forEach((seat, i) => {
      const p = seating.seats[seat], tag = seatEls[i]; tag.classList.toggle('away', !p); if (!p) return;
      tag.querySelector('.av').textContent = p.initial; tag.querySelector('b').textContent = p.name; tag.querySelector('.bank').textContent = fmt(Math.floor(p.bankroll));
    });
  }
  function seatSays(i, text, ms = 1400) {
    const el = seatEls[i]?.querySelector('.say'), mate = seatEls[i ^ 2]?.querySelector('.say'); if (!el) return;
    el.classList.toggle('up', !!mate && mate.classList.contains('show') && !mate.classList.contains('up') && Math.abs((seatX[i] ?? 0) - (seatX[i ^ 2] ?? 1e4)) < 80);   // (beside a word still showing: a line higher)
    clearTimeout(sayTimers[i]); el.textContent = text; el.classList.add('show'); sayTimers[i] = setTimeout(() => el.classList.remove('show'), ms); openTag(i, ms + 500);
  }
  function layoutOverlay() {
    if (S.showcase.on || S.current !== 'seat') return;   // (your place only: the lobby and the spin have the camera elsewhere)
    const L = S.layout, W = stage.clientWidth;
    for (const id of SPOT_IDS) {
      const s = L.spots[id], pts = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => S.project(s.x + a * s.w / 2, 0, s.z + b * s.h / 2));
      const l = Math.min(...pts.map(p => p.x)), r = Math.max(...pts.map(p => p.x)), t = Math.min(...pts.map(p => p.y)), b = Math.max(...pts.map(p => p.y));
      Object.assign(spotEls[id].style, { left: `${l}px`, top: `${t}px`, width: `${r - l}px`, height: `${b - t}px` });
      // the amount, in the spot's far corner beside its number (clear of everyone's chips and of what it pays)
      const a = S.project(s.x + s.w / 2 - 4.8, 0, s.z - s.h / 2 + 4), tag = spotEls[id].querySelector('.amount'); tag.style.left = `${Math.round(a.x - l)}px`; tag.style.top = `${Math.round(a.y - t)}px`;
    }
    const xs = L.orient === 'land' ? [-56, 56, -74, 74] : [-30, 30, -47, 47];
    for (const [i, tag] of Object.entries(seatEls)) { const p = S.project(xs[i], 3, 25.8); seatX[i] = Math.round(Math.min(Math.max(p.x, 18), W - 18)); tag.style.transform = `translate(${seatX[i]}px, ${Math.round(p.y)}px)`; }
  }
  S.afterFrame.add(layoutOverlay);

  // ---- the spins you have seen: a strip of the last results over the table ------------------------------------------------
  function renderTrail() {
    const last = trail.slice(0, 12);
    trailEl.innerHTML = last.map((segs, i) => { const o = outcome(segs.map(s => SEGMENTS.indexOf(s))); return `<li class="n${o.n}${i ? '' : ' latest'}">${o.x > 1 ? `<i>×${o.x}</i>` : ''}${o.n}</li>`; }).join('');
    trailEl.classList.toggle('empty', !last.length);
    const st = stats(trail);
    trailEl.setAttribute('aria-label', last.length ? `The last spins, newest first: ${last.map(segs => said1(outcome(segs.map(s => SEGMENTS.indexOf(s))))).join('; ')}. Of the last ${st.count}: ${NUMBERS.map(n => `${n} came ${st.by[n]} times`).join(', ')}; ${st.multiplied} multiplied.` : 'The last spins');
  }

  // ---- betting ----------------------------------------------------------------------------------------------------------
  const broke = () => mode === 'betting' && !table.total && wallet.balance < 1;
  function refuse(why, el) { hint(why); feel.tap('refuse'); feel.cue('error'); if (el) { if (el.classList.contains('spot')) { el.classList.remove('refused'); void el.offsetWidth; el.classList.add('refused'); } else kit.shake(el); } }
  function placeChip(id) {
    if (mode !== 'betting') return;
    const v = rack.value, why = table.place([[id, v]]); if (why) { refuse(why, spotEls[id]); return; }
    feel.tap('chip'); serial(() => chips.add(id, v)); refresh();
  }
  function removeFrom(id) { if (mode !== 'betting' || !table.takeFrom(id)) return; serial(() => chips.removeTop(id)); refresh(); }
  const syncYours = () => Promise.all(SPOT_IDS.map(id => chips.sync(id, table.bets.get(id) ?? [])));
  const actions = {
    undo() { if (mode !== 'betting') return; const g = table.undo(); if (!g) return; serial(async () => { for (const [id] of [...g].reverse()) await chips.removeTop(id); }); refresh(); },
    clear() { if (mode !== 'betting' || !table.clear()) return; serial(syncYours); refresh(); },
    rebet() { if (mode !== 'betting') return; const why = table.rebet(); if (why) { refuse(why, $('#wRebet')); return; } feel.tap('chip'); serial(syncYours); refresh(); },
    double() { if (mode !== 'betting') return; const why = table.double(); if (why) { refuse(why, $('#wX2')); return; } feel.tap('chip'); serial(syncYours); refresh(); },
    spin() {
      if (mode !== 'betting') return; feel.tap('press');
      if (broke()) { ctx.resetBalance(); return; }
      if (!table.total && table.canRebet) { const why = table.rebet(); if (why) { refuse(why, $('#wSpin')); return; } serial(syncYours); }
      if (!table.total) { refuse('Place a bet on a number first.', $('#wSpin')); return; }
      if (table.total > wallet.balance) { refuse('Not enough balance for these bets.', $('#wSpin')); return; }
      mode = 'spinning'; refresh(); serial(playRound);
    },
  };
  $('#wUndo').onclick = actions.undo; $('#wClear').onclick = actions.clear; $('#wRebet').onclick = actions.rebet; $('#wX2').onclick = actions.double; $('#wSpin').onclick = actions.spin;
  kit.shimmer($('#wSpin'));

  // ---- the other players ---------------------------------------------------------------------------------------------------
  // Each puts a chip or two down in their own time once bets are open; a Spin before they have hurries them.
  const theirs = new Map();   // their place (0 to 3) → [[spot, stake], ...], this round
  let betJobs = [];
  function othersBet() {
    for (const j of betJobs) j.cancel(); betJobs = [];
    if (mode !== 'betting' || !active) return;
    for (const { i, p } of others()) {
      if (theirs.has(i) || p.bankroll < 5) continue;
      let timer = 0, gone = false;
      const go = () => {
        if (gone || mode === 'paying') return; gone = true; clearTimeout(timer);
        const taste = TASTE[p.styleId] ?? TASTE.hunch, picks = [...new Set([taste[Math.floor(Math.random() * taste.length)], ...(Math.random() < .4 ? [taste[Math.floor(Math.random() * taste.length)]] : [])])];
        let left = p.bankroll; const adds = [];
        for (const n of picks) { const stake = Math.max(5, Math.min(SPOTS[`n${n}`].max, Math.round(Math.min(p.base, left / 3) / (n >= 10 ? 10 : 5)) * 5)); if (stake > left) continue; left -= stake; adds.push([`n${n}`, stake]); }
        if (!adds.length) return;
        theirs.set(i, adds); p.bankroll = left; renderSeats(); openTag(i);
        for (const [id, v] of adds) void chips.amount(keyOf(i, id), v);
      };
      timer = setTimeout(go, (500 + Math.random() * 2600) * motion.slow);
      betJobs.push({ hurry: go, cancel: () => { gone = true; clearTimeout(timer); } });
    }
  }
  const othersReady = () => { for (const j of betJobs) j.hurry(); betJobs = []; };
  function clearOthers() { for (const j of betJobs) j.cancel(); betJobs = []; for (const [i, adds] of theirs) { const p = seating.seats[ORDER[i]]; if (p) p.bankroll += adds.reduce((s, [, v]) => s + v, 0); for (const [id] of adds) chips.sync(keyOf(i, id), []); } theirs.clear(); renderSeats(); }

  // ---- the wheel turning ---------------------------------------------------------------------------------------------------
  // A peg past the flapper, heard when the simulation has it (`when` seconds from now): louder and a shade higher the
  // faster the wheel; a peg that only pressed the leather and fell back is a dull knock. At full speed the pegs come
  // quicker than clacks can be told apart, and only as many are played as can be.
  let clackAt = 0, clackTurn = 0;
  function clack(c, when, rate) {
    const due = performance.now() / 1000 + when; if (due - clackAt < (c.soft ? .03 : .034)) return; clackAt = due;
    const fast = Math.min(1, c.w / 7);
    audio.cue(`wheel-clack-${(clackTurn++ % CLACKS) + 1}`, { gain: (c.soft ? .2 : .3 + .42 * fast) * (rate > 2 ? .7 : 1), rate: (c.soft ? .78 : .94 + .14 * fast) * (.97 + Math.random() * .06), delay: Math.max(0, when), x: 0 });
    if (!c.soft && c.w < 2.2) feel.tap('tick');
  }
  // The wheel taken round to rest in segment `k`, from where it stands: a small pull back as the host takes hold, then
  // the spin the simulation found (wheel/physics.mjs), shown as simulated. The camera goes to the wheel, and to its top
  // for the last pegs. Space hurries the middle of it; the last seconds always run at their own pace.
  let glowOn = null;
  async function turnTo(k, again) {
    const from = S.wheel.angle, past = from - Math.floor(from / PITCH) * PITCH, back = Math.max(0, Math.min(.05, past - PHYS.reach - .008));
    const p = plan(k, { from: from - back });
    if (glowOn != null) { const was = glowOn; glowOn = null; void motion.tween(240, t => S.wheel.glow(was, .8 * (1 - t))); }
    stage.dataset.view = 'wheel'; S.mood(true, again ? 0 : 900);
    void lookAt('wheel', again ? 900 : 1000);
    await motion.tween(300, t => S.wheel.set(from - back * t, 0), ease.out);
    audio.cue('whoosh', { gain: .14, rate: .78 });
    hurry = false;
    await new Promise(done => {
      const base = settings.fast ? 1.5 : 1, tail = Math.max(0, p.calm - 2.6); let t = 0, last = 0, ci = 0, closeUp = false;
      const tick = now => {
        const dt = last ? Math.min(.1, (now - last) / 1000) : 0; last = now;
        const rate = t < tail ? base * (hurry ? 6 : 1) : 1; t = Math.min(p.T, t + dt * rate);
        const a = at(p, t); S.wheel.set(a.angle, a.flap);
        while (ci < p.clicks.length && p.clicks[ci].t <= t + .09 * rate) { const c = p.clicks[ci++]; if (c.t >= t - .02) clack(c, (c.t - t) / rate, rate); }
        if (!closeUp && t >= p.calm - 3.3) { closeUp = true; void lookAt('call', 1500); }
        if (t >= p.calm + .12) { S.tickers.delete(tick); S.wheel.set(p.end, 0); done(); }
      };
      tick.still = true; S.tickers.add(tick); S.requestRender(false);
    });
    // read: the segment under the flapper lights up, twice, and stays lit
    glowOn = k;
    await motion.tween(170, t => S.wheel.glow(k, t), ease.out);
    void motion.tween(900, t => S.wheel.glow(k, .8 + .2 * Math.cos(t * Math.PI * 4)));
  }

  // ---- a round ---------------------------------------------------------------------------------------------------------------
  const entryOf = r => ({ game: 'wheel', table: 'wheel', net: r.net, staked: r.staked, back: r.back, n: r.n, x: r.x, segs: r.segs, wins: r.wins, losses: r.losses });
  function paid(r) {
    if (r.paid) return; r.paid = true;
    if (r.rec && !inFlight.lost('wheel')) ctx.record?.(r.rec);   // in Last hands, and counted in the hall of fame
    inFlight.set('wheel', null); held = null; ctx.showBalance(); refresh();
  }
  function setMode(m) { mode = m; stage.dataset.mode = dock.dataset.mode = m === 'betting' ? 'bet' : 'spin'; refresh(); }
  async function playRound() {
    if (mode !== 'spinning') return;
    othersReady();
    if (!table.close()) { mode = 'betting'; refresh(); hint('The wheel could not be spun: your balance changed. Check your bets.'); return; }
    held = wallet.balance;
    const r = table.settle(rigged ?? undefined); rigged = null;   // the round, drawn and paid as the bets close
    r.rec = entryOf(r); inFlight.set('wheel', r.rec);
    trail.unshift(r.segs); trail.length = Math.min(trail.length, 100); store.set('wheelHistory', trail);
    // the other players' bets are settled on the same round
    const seats = [...theirs].map(([i, adds]) => ({ i, p: seating.seats[ORDER[i]], bets: adds.map(([id, stake]) => ({ id, stake, pay: SPOTS[id].n === r.n ? stake * r.n * r.x : 0 })) }));
    for (const s of seats) if (s.p) { s.p.bankroll += s.bets.reduce((a, b) => a + (b.pay ? b.stake + b.pay : 0), 0); s.p.rounds++; }
    setMode('spinning'); clearResult(); hint('');
    try { await show(r, seats); }
    catch (err) {
      console.error('wheel round', err);   // the show broke: the round stands as it was settled, said in words
      chips.clear(); theirs.clear(); renderSeats(); setMult(1); S.mood(false, 0); await S.move('seat', 0); stage.dataset.view = 'seat';
      paid(r); setMode('betting'); renderTrail();
      hint(`The wheel stopped on ${r.n}${r.x > 1 ? `, multiplied by ${r.x}` : ''}. ${r.net > 0 ? `You won ${fmt(r.net)}.` : `You lost ${fmt(-r.net)}.`}`);
    }
  }
  function setMult(x) {
    if (x <= 1) { multEl.hidden = true; multEl.classList.remove('show'); return; }
    const b = multEl.querySelector('b'); b.textContent = `×${x}`; multEl.hidden = false; void multEl.offsetWidth; multEl.classList.add('show'); ui.pop(b, { from: .4 });
  }
  async function show(r, seats) {
    void say('no-more-bets', { prio: 2 });
    let x = 1;
    for (const [i, k] of r.stops.entries()) {
      await turnTo(k, i > 0);
      const seg = r.segs[i];
      if (isMultiplier(seg)) {
        // a multiplier: every bet stays, the wheel is spun again
        x *= valueOf(seg); setMult(x); feel.tap('big'); if (!settings.reduced) S.hold?.(70); sting('side', .6);
        hint(`Times ${valueOf(seg)}. Every bet stays, and the wheel is spun again.`); tell(`Times ${valueOf(seg)}. The wheel is spun again.`);
        await call(`wh-${seg}`, 900); await call('wh-again', hurry ? 300 : 700);
      }
    }
    // the number
    const title = `${r.n}${r.x > 1 ? ` × ${r.x}` : ''}`, mine = r.wins[0];
    tell(`The wheel stops on ${r.n}${r.x > 1 ? `, multiplied by ${r.x}` : ''}. ${r.net > 0 ? `You win ${fmt(r.net)}.` : r.net < 0 ? `You lose ${fmt(-r.net)}.` : 'Your stake comes back.'}`);
    hint(''); showResult(r, title); multEl.classList.remove('show');   // (the result has the picture's head now: the multiplier's line and its badge have said their piece)
    await call(`wh-${r.n}`, 800);
    // back to your place for the chips: the losers to the tray, the winners paid from it
    S.mood(false, 900); await lookAt('seat', 950); stage.dataset.view = 'seat'; setMode('paying');   // (your spots and the others' coins come back once the camera is home)
    const lose = [...r.losses.map(l => l.id), ...seats.flatMap(s => s.bets.filter(b => !b.pay).map(b => keyOf(s.i, b.id)))];
    const win = [...r.wins.map(w => [w.id, w.pay]), ...seats.flatMap(s => s.bets.filter(b => b.pay).map(b => [keyOf(s.i, b.id), b.pay]))];
    await Promise.all(lose.map((key, i) => motion.wait(i * 60).then(() => chips.sweep(key))));
    await Promise.all(win.map(([key, pay], i) => motion.wait(i * 90).then(() => chips.pay(key, pay))));
    for (const w of r.wins) { const el = spotEls[w.id].querySelector('.amount'); el.textContent = `+${fmt(w.pay)}`; el.hidden = false; el.classList.add('won'); }
    for (const s of seats) { const net = s.bets.reduce((a, b) => a + b.pay, 0); if (net > 0) seatSays(s.i, `+${fmt(net)}`, 1800); }
    renderSeats(); paid(r);
    if (r.net > 0) {
      const big = r.n >= 20 || r.x > 1 || r.net >= 500;
      feel.tap(big ? 'big' : 'win'); sting(big ? 'big' : 'small', .7);
      if (mine && (r.n === 40 || r.net >= 1000)) { feel.confetti({ size: r.net >= 5000 ? 2 : 1 }); setTimeout(() => say('congrats', { prio: 1 }), 500); }
    }
    await motion.wait(hurry ? 300 : 1300);
    await chips.toHome();
    theirs.clear(); setMult(1); renderTrail(); for (const id of SPOT_IDS) spotEls[id].querySelector('.amount').classList.remove('won');
    if (glowOn != null) { const was = glowOn; glowOn = null; void motion.tween(500, t => S.wheel.glow(was, .8 * (1 - t))); }
    const ch = [...seating.replaceLeaving(), ...seating.arrange(settings.players)]; if (ch.length) { renderSeats(); for (const c of ch) if (c.joined) seatSays(ORDER.indexOf(c.seat), 'Steps up', 2600); }
    setMode('betting'); say('place-bets', { prio: 2, fresh: 3000 }); othersBet();
  }

  // ---- the result ----------------------------------------------------------------------------------------------------------
  let winTimer = 0;
  function showResult(r, title) {
    winEl.className = `r-win w-win n${r.n} ${r.net > 0 ? 'up' : r.net < 0 ? 'down' : ''}`;
    winEl.querySelector('small').textContent = `The wheel stops on ${title}`; winEl.querySelector('b').hidden = true;
    winEl.querySelector('em').textContent = r.net ? signed(r.net) : 'Even'; winEl.querySelector('.r-gross').textContent = r.back > 0 ? `${fmt(r.back)} back on ${fmt(r.staked)}` : '';
    ui.shown(winEl); winEl.hidden = false; void winEl.offsetWidth; winEl.classList.add('show');
    clearTimeout(winTimer); winTimer = setTimeout(clearResult, 7000);
  }
  function clearResult() { clearTimeout(winTimer); if (winEl.hidden) return; winEl.classList.remove('show'); setTimeout(() => { if (!winEl.classList.contains('show')) winEl.hidden = true; }, 260); }

  // ---- the controls -----------------------------------------------------------------------------------------------------
  function refresh() {
    const betting = mode === 'betting', total = table.total, bal = held ?? wallet.balance, out0 = broke(), down = betting ? total : table.staked ?? 0;
    $('#wUndo').disabled = !betting || !table.history.length; $('#wClear').disabled = !betting || !total;
    rebetSlot($('#wRebet'), $('#wX2'), !!total || !betting);
    $('#wRebet').disabled = !betting || !table.canRebet; $('#wX2').disabled = !betting || !total || total * 2 > bal || SPOT_IDS.some(id => table.on(id) * 2 > SPOTS[id].max);
    $('#wSpin').disabled = !betting || (!total && !table.canRebet && !out0) || total > bal;
    goLabel($('#wSpin'), 'Spin', { out: out0, rebet: betting && !total && table.canRebet });
    rack.fit(bal - (betting ? total : 0));
    for (const id of SPOT_IDS) {
      const el = spotEls[id], on = table.on(id), a = el.querySelector('.amount'); el.disabled = !betting;
      if (!a.classList.contains('won')) { a.hidden = !on; a.textContent = fmt(on); }
      el.setAttribute('aria-label', `${SPOTS[id].n}, pays ${SPOTS[id].n} to 1, up to ${fmt(SPOTS[id].max)}${on ? `, ${fmt(on)} bet` : ''}`);
    }
    if (!stage.hidden && active) ctx.showInPlay(mode === 'paying' ? 0 : down);
    if (betting && active) {
      if (out0) hint(`You are out of chips. Tap Reset for a fresh ${fmt(wallet.START)}.`);
      else if (!total) hint(table.canRebet ? `Place your bets, or rebet ${fmt(table.lastTotal)}.` : 'Choose a chip, then tap a number.');
      else hint(`Bet ${fmt(total)}. Spin when ready.`);
    }
  }
  let framed = '';
  function reframe(force = false) {
    if (!active && !S.showcase.on || document.body.dataset.going === 'wheel') return;   // (leaving through the portal: framed as it stood)
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    const bar = ctx.barCover(stage), strip = trailEl.offsetHeight + 8, top = bar + strip, under = ctx.dockCover(stage), k = `${w}x${h}x${top}x${under}`;
    stage.style.setProperty('--top-h', `${bar}px`); stage.style.setProperty('--under', `${under}px`); stage.style.setProperty('--strip', `${strip}px`);
    if (k === framed && !force) return; framed = k;
    S.frame(w, h + under, top, under ? under + ctx.BLUR_RISE : 0); chips.relay();
  }
  new ResizeObserver(() => requestAnimationFrame(() => reframe())).observe(stage);
  new ResizeObserver(() => requestAnimationFrame(() => reframe())).observe(dock);

  // Space and Enter spin, and hurry the wheel on its way (its last seconds run at their own pace); A S D F G H put the
  // chip in hand on 1, 2, 5, 10, 20 and 40.
  function onKey(e) {
    const k = e.key.toLowerCase(), go = k === ' ' || k === 'enter';
    if (go) {
      e.preventDefault(); if (e.repeat) return true;
      if (mode === 'betting') actions.spin(); else { hurry = true; motion.finishAll(); }
      return true;
    }
    if (e.repeat || mode !== 'betting') return false;
    if (KEYS[k]) { placeChip(KEYS[k]); return true; }
    return betKey(k, { ...actions, chip: rack.select, values: rack.values });
  }

  // (a tap on the picture does as Space does while a round is shown; the other players' coins keep their own tap)
  stage.addEventListener('pointerdown', e => { if (mode === 'betting' || e.button > 0 || e.target.closest?.('.seat-tag')) return; hurry = true; motion.finishAll(); });

  // One wallet: the balance can move under this table (another table, or the salon open in another window).
  wallet.subscribe(() => {
    if (!active || held != null || mode !== 'betting') return;
    ctx.showBalance();
    if (table.total > wallet.balance) { table.clear(); serial(syncYours); refresh(); hint('Your bets were cleared: your balance changed in another window.'); return; }
    refresh();
  });

  // ---- start ---------------------------------------------------------------------------------------------------------------
  S.wheel.set((trail[0] ? SEGMENTS.indexOf(trail[0].at(-1)) : 3) * PITCH + PITCH * .5, 0);   // (it stands where it last stopped)
  renderSeats(); renderTrail(); refresh();
  S.warm({ drawn: [createChip(5)] });
  S.pause(true);   // out of sight until the salon shows the room

  const api = {
    stage, dock, scene: S, table, onKey, hint, round: 'spin',
    get busy() { return mode !== 'betting'; },
    get mode() { return mode; },
    kind: 'wheel', preview: () => Promise.resolve(),
    show() {
      stage.hidden = dock.hidden = false; S.pause(false); framed = ''; reframe();
      ctx.title('MONEY WHEEL', 'Money wheel'); ctx.showBalance(wallet.balance, false);
      if (mode === 'betting' && table.total > wallet.balance) { table.clear(); serial(syncYours); hint('Your bets were cleared: your balance changed at another table.'); }
      ctx.showInPlay(table.total); renderSeats(); refresh();
    },
    hide() { stage.hidden = dock.hidden = true; S.showcase.stop(0); S.pause(true); active = false; for (const j of betJobs) j.cancel(); betJobs = []; },
    showcase: { start(still) { S.showcase.start(still); framed = ''; reframe(); S.requestRender(); }, stop: ms => S.showcase.stop(ms) }, portal,
    toLobby() { active = false; for (const j of betJobs) j.cancel(); betJobs = []; api.showcase.start(settings.reduced); },
    fromLobby() { framed = ''; reframe(); },
    async enter(ms, { direct = false } = {}) {
      active = true; framed = ''; reframe();
      if (!direct) await S.showcase.stop(ms);
      document.body.classList.remove('flying'); layoutOverlay(); refresh();
      if (welcome) { hint(welcome); welcome = null; }
      if (mode === 'betting') { say('place-bets', { prio: 2, fresh: 3000 }); othersBet(); }
    },
    players: () => others().map(o => o.p.name),
    setPlayers() { if (mode !== 'betting') return; clearOthers(); seating.arrange(settings.players); renderSeats(); layoutOverlay(); othersBet(); },
    callBets: () => say('place-bets', { prio: 3 }),
    setReduced(on) { motion.reduced = on; },
    setFast(on) { motion.slow = on ? .62 : 1; },
    setQuality(q) { S.setQuality(q); },
    refresh, reframe: () => { framed = ''; reframe(); },
    // rig([...segments]): the next round stops on these segment indices in turn (the last a number's); place(spot, value)
    test: ctx.dev ? { table, chips, motion, scene: S, seating, trail, plan, at, get mode() { return mode; }, rig(stops) { rigged = stops; }, segmentOf: s => SEGMENTS.indexOf(String(s)), place: (id, v = rack.value) => { rack.select(v); placeChip(id); }, hurry: () => { hurry = true; } } : undefined,
  };
  return api;
}
