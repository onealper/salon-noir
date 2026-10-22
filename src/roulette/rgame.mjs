// The roulette table: your chips on the layout, the spin, the payout. It shares the salon's top bar,
// wallet, sound and settings with blackjack (passed in as `ctx`) and brings its own stage and dock.
//
// A round, as the research laid it out (Evolution / Pragmatic rules texts, the dealer procedure in the
// New Jersey and Singapore filings):
//   betting (no timer)  ·  Spin: the camera glides to the wheel as the ball is launched against the
//   wheelhead  ·  "No more bets" while the ball still runs  ·  push-in as it drops  ·  a beat of quiet,
//   the click, then the croupier's call, the number beside the ball as he says it  ·  a slow-motion replay
//   for a straight up win  ·  back to the layout: the dolly on the number, losing chips swept, winners
//   paid, outside bets first and straights last (your balance moves only now)  ·  the chips go home and
//   the dolly comes up  ·  "Place your bets".
import { createRouletteScene, preloadRouletteArt } from './rscene.mjs';
import { RouletteTable, CHIP_VALUES, SPOTS, describe, draw, colorOf, WHEEL, CALLS, callNumbers, neighbours, SECTIONS, stats, PITCH, WHEEL_INDEX } from './rules.mjs';
import { plan, at, GEO, TUNE } from './physics.mjs';
import { replayShot } from './replay.mjs';
import { createRoller, prepareRoller } from './roller.mjs';
import { Motion, ease } from '../scene/pieces.mjs';
import { CHIP_H, CHIP_R } from '../scene/textures.mjs';
import { wallet, inFlight } from '../core/wallet.mjs';
import { breakDown } from '../core/chips.mjs';
import { fmt, signed } from '../core/format.mjs';
import { chipRack, hintLine, rebetSlot, goLabel, serialQueue, betKey } from '../core/bet-controls.mjs';

// The other players' colour chips: no colour within ΔE76 25 of a value chip (the ½ chip too), of brass #c9a45c or of each
// other (test/roulette-table.test.mjs measures it), and each its own count of edge inserts, to be told apart without colour.
const RIVALS = [
  { name: 'Olu', color: '#7fb3d9', inserts: 4, style: 'straights' },     // sky
  { name: 'Marta', color: '#c25b86', inserts: 8, style: 'outside' },     // rose
  { name: 'Kenji', color: '#1f8f8c', inserts: 12, style: 'sections' },   // teal
  { name: 'Inès', color: '#8b5a2b', inserts: 16, style: 'dozens' },      // caramel
];
const OUT_ORDER = ['column', 'dozen', 'even'];   // paid first, then inside bets toward the wheel, straights last
const H = CHIP_H;   // true size, as the scene draws them
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function createRoulette(ctx) {
  const { app, audio, settings, store, ui, kit, uiSound, sting } = ctx;
  const feel = ctx.feel ?? { tap() {}, cue() {}, confetti() {} };   // haptics and confetti, shared with blackjack
  await preloadRouletteArt();
  // ---- the stage and the dock ----------------------------------------------------------------------------------------
  const stage = document.createElement('section'); stage.className = 'stage rstage'; stage.id = 'rstage'; stage.setAttribute('aria-label', 'Roulette table');
  stage.innerHTML = `<canvas class="rcanvas" aria-hidden="true"></canvas>
    <div class="r-overlay">
      <ol class="r-history" aria-label="Recent numbers"></ol>
      <div class="r-loupe" hidden><b></b><span></span></div>
      <div class="r-bubble" hidden><b></b><small></small></div>
      <div class="r-replay" hidden>Replay</div>
      <div class="r-win" role="status" hidden><small></small><b></b><em></em><span class="r-gross"></span></div>
      <div class="r-tags"></div>
      <div class="r-sheet" id="rRaceSheet" role="region" hidden aria-label="Racetrack"></div>
      <div class="r-sheet" id="rStatsSheet" role="region" hidden aria-label="Statistics"></div>
    </div>
    <p class="hint r-hint" aria-live="polite"><span></span></p>
    <div class="r-fade" aria-hidden="true"></div>`;
  const dock = document.createElement('footer'); dock.className = 'dock rdock';
  dock.innerHTML = `<div class="r-tools">
      <button class="pill r-tool" id="rRace" aria-expanded="false" aria-controls="rRaceSheet" aria-label="Racetrack" aria-keyshortcuts="T"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="5"/><rect x="7.5" y="10.5" width="9" height="3" rx="1.5"/></svg><span class="label">Racetrack</span></button>
      <button class="pill r-tool" id="rStats" aria-expanded="false" aria-controls="rStatsSheet" aria-label="Statistics" aria-keyshortcuts="S"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11M10 19V5M15 19v-6M20 19V8"/></svg><span class="label">Statistics</span></button>
    </div>
    <div class="chips" id="rChips" role="radiogroup" aria-label="Chip value"></div>
    <div class="bet-actions">
      <button class="pill" id="rUndo" aria-keyshortcuts="U" aria-label="Undo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg><span class="label">Undo</span></button>
      <button class="pill" id="rClear" aria-keyshortcuts="C" aria-label="Clear bets"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg><span class="label">Clear</span></button>
      <button class="pill" id="rRebet" aria-keyshortcuts="R" aria-label="Rebet"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg><span class="label">Rebet</span></button>
      <button class="pill" id="rX2" aria-keyshortcuts="X" aria-label="Double bets"><span class="glyph">×2</span><span class="label">Double</span></button>
      <button class="pill gold deal" id="rSpin" aria-keyshortcuts="Space"><span class="label">Spin</span></button>
    </div>`;
  app.append(stage, dock);
  const $ = s => stage.querySelector(s) ?? dock.querySelector(s);
  const canvas = $('.rcanvas'), hintEl = $('.r-hint'), loupe = $('.r-loupe'), bubble = $('.r-bubble'), winEl = $('.r-win'), histEl = $('.r-history'), fadeEl = $('.r-fade'), tagsEl = $('.r-tags');

  const hint = hintLine(hintEl);   // (the words morph in the line's own span: see .hint in app.css)
  const S = createRouletteScene(canvas, { quality: ctx.quality() }), motion = new Motion(S);
  for (const r of RIVALS) S.chipLook(r.color, { inserts: r.inserts });
  // A spin is paid into the wallet the moment bets close (the number is drawn then); the balance on
  // screen (and which chips you can afford) holds back until the ball lands, so the result isn't given away.
  let held = null;   // the balance as shown while a spin is under way
  const bank = { get: () => wallet.balance, set: v => { wallet.set(v); if (held == null) ctx.showBalance(); } };
  const table = new RouletteTable({ bank });
  let history = store.get('rouletteHistory', []).filter(n => Number.isInteger(n) && n >= 0 && n <= 36).slice(0, 500);
  const colorName = n => colorOf(n) === 'green' ? 'Zero' : colorOf(n) === 'red' ? 'Red' : 'Black';
  // a spin a closed or reloaded page left mid-flight was paid when its bets closed: its number joins the
  // history (unless the croupier had called it), and you hear how it went (over the lobby, or as you sit down)
  let welcome = null;
  await inFlight.take('spin', s => {
    if (!Number.isInteger(s?.n) || s.n < 0 || s.n > 36) return;
    if (!s.seen) { history.unshift(s.n); history = history.slice(0, 500); store.set('rouletteHistory', history); }   // (seen: called before the page went, so already written down)
    if (Number.isFinite(s.net)) ctx.record?.({ n: s.n, color: colorName(s.n), staked: s.staked, back: s.back, partage: s.partage, net: s.net });   // in Last hands too
    ctx.notice?.(`Your last spin landed on ${s.n} ${colorName(s.n)}: ${s.back > 0 ? `${fmt(s.back)} was paid to your balance` : 'no win'}.`, t => { welcome = t; });
  });
  let mode = 'betting', dir = store.get('rouletteDir', 1), phi = Math.random() * Math.PI * 2, rotorW = 1, restIdx = null, hurry = 1, active = false;
  const reduced = () => settings.reduced, fast = () => settings.fast;
  Object.assign(motion, { reduced: reduced(), slow: fast() ? .62 : 1 });

  // ---- sound --------------------------------------------------------------------------------------------------------------
  // left and right as you see it: how far a point (world cm) lies to the camera's right, for the pan (sound.mjs: x/70).
  // At the seat that is along the table on the long side and across it at the foot (an upright phone, right = -z).
  const camRight = new S.THREE.Vector3(), camRel = new S.THREE.Vector3();
  const panX = p => { const c = S.camera; camRight.set(1, 0, 0).applyQuaternion(c.quaternion); return camRel.copy(p).sub(c.position).dot(camRight) * .5; };
  const ballW = new S.THREE.Vector3(), ballX = () => panX(ballW.copy(S.wheel.ball.position).add(S.wheel.group.position));   // where the ball is
  // the camera's bearing round the wheel, in the wheel's own angles (physics.mjs): the near side of the bowl
  const camAz = (c = S.camera.position) => { const w = S.wheel.group.position; return Math.atan2(-(c.z - w.z), c.x - w.x); };
  let clickTurn = 0; const click = (gain, rate = 1) => audio.cue(`ball-click-${(clickTurn++ % 6) + 1}`, { gain, rate: rate * (.96 + Math.random() * .08), x: ballX() });
  const say = (line, opts) => audio.say(`voice/james-${line}`, opts);
  const numberClip = n => `voice/james-n${n}`;
  audio.preload([...[1, 2, 3, 4, 5, 6].map(i => `ball-click-${i}`), 'voice/james-place-bets', 'voice/james-no-more-bets', 'voice/james-good-luck', 'voice/james-winning-number', 'voice/james-congrats']);   // not the music: it streams (decoded, it would be 17 MB nobody plays)
  // while you place bets: the rolling sound's loops, and the bytes of the 37 numbers (the drawn one is decoded as bets
  // close, so the croupier's call is never late or lost to a slow first fetch)
  if (audio.available) { const go = () => { prepareRoller(audio.ctx); audio.prefetch(WHEEL.map(numberClip)); }; window.requestIdleCallback ? requestIdleCallback(go, { timeout: 3000 }) : setTimeout(go, 1500); }

  // ---- chips in hand ----------------------------------------------------------------------------------------------------------
  const rack = chipRack($('#rChips'), { store, uiSound });

  // ---- stacks of chips on the layout ------------------------------------------------------------------------------------------
  const stacks = new Map();   // "owner|spot" → meshes, bottom first
  const slotOf = owner => owner === 'you' ? 0 : 1 + RIVALS.findIndex(r => r.name === owner);
  const key = (owner, id) => `${owner}|${id}`;
  const approach = a => S.layout.orient === 'port' ? [S.layout.rect.x1 + 22 - a.x, 22, 0] : [0, 22, S.layout.rect.z1 + 22 - a.z];   // chips come over the armrest on your side
  // One column per spot: every player's chips go on top of what is already there, in the order they come, each layer
  // nudged a few millimetres by its owner's slot so the colours read as separate bets (stacks set side by side 1 cm apart
  // passed through each other, and their faces flickered). A chip taken out lets the ones above it settle.
  const cols = new Map();   // spot → meshes, bottom first, whoever's
  const chipAt = m => { const { owner, id } = m.userData, c = cols.get(id) ?? []; return S.anchor(id, slotOf(owner)).setY(H * (Math.max(0, c.indexOf(m)) + .5)); };
  const seat = m => { const id = m.userData.id; if (!cols.has(id)) cols.set(id, []); cols.get(id).push(m); return chipAt(m); };
  function unseat(ms) { for (const m of ms) { const c = cols.get(m.userData.id), i = c?.indexOf(m) ?? -1; if (i >= 0) c.splice(i, 1); if (c && !c.length) cols.delete(m.userData.id); } }
  function settleCol(id) { for (const m of cols.get(id) ?? []) { if (m.userData.fly) continue; const y0 = m.position.y, y = chipAt(m).y; if (Math.abs(y - y0) > .01) motion.tween(120, t => { m.position.y = y0 + (y - y0) * t; }, ease.out); } }
  async function addChip(owner, id, v, { ms = 300 } = {}) {
    const k = key(owner, id), list = stacks.get(k) ?? []; stacks.set(k, list);
    const a = S.anchor(id, slotOf(owner)), m = S.chipMesh(v), [dx, dy, dz] = approach(a);
    m.userData = { owner, id, v }; list.push(m);
    const from = a.clone().add(new S.THREE.Vector3(dx, dy, dz)), to = seat(m);
    m.position.copy(from); m.rotation.y = Math.random() * 6; m.userData.fly = true;
    await motion.tween(ms, t => { m.position.lerpVectors(from, to, t); m.position.y = to.y + (1 - t) * dy * (1 - t) + Math.sin(t * Math.PI) * 3; }, ease.land);
    delete m.userData.fly; settleCol(id);   // (a chip taken out from under it while it flew)
    audio.play(list.length > 1 ? 'stack' : 'chip', { x: panX(a) });
  }
  async function dropStack(k, { to = null, ms = 260 } = {}) {
    const list = stacks.get(k); if (!list) return; stacks.delete(k); unseat(list);
    await Promise.all(list.map((m, i) => { const from = m.position.clone(), end = to ? to.clone().setY(H * (i + .5)) : from.clone().add(new S.THREE.Vector3(0, 6, 0));
      return motion.tween(ms, t => { m.position.lerpVectors(from, end, t); m.traverse(o => { if (o.material) o.material.opacity = 1; }); m.scale.setScalar(to ? 1 : 1 - t * .9); }, ease.inOut).then(() => { S.chipsG.remove(m); }); }));
    S.requestRender();
  }
  // your stacks follow the table after undo, clear or a removed chip
  async function syncYours() {
    const want = new Map([...table.bets].map(([id, vs]) => [id, vs])), jobs = [];
    // a chip taken off rises 6 cm as it goes (by the tween's time, so at any frame rate) and what stood on it settles
    for (const [k, list] of stacks) { const [owner, id] = k.split('|'); if (owner !== 'you') continue; const w = want.get(id) ?? []; if (list.length > w.length) { const extra = list.splice(w.length); unseat(extra); settleCol(id); for (const m of extra) { const y0 = m.position.y; jobs.push(motion.tween(160, t => { m.position.y = y0 + t * 6; m.scale.setScalar(1 - t); }).then(() => S.chipsG.remove(m))); } if (!list.length) stacks.delete(k); } }
    for (const [id, vs] of want) { const have = stacks.get(key('you', id))?.length ?? 0; for (let i = have; i < vs.length; i++) jobs.push(addChip('you', id, vs[i], { ms: 220 })); }
    await Promise.all(jobs);
  }
  function relayoutStacks() {
    const taken = [];
    for (const [k, list] of stacks) { const id = k.split('|')[1], pay = k.endsWith('|pay'), p = pay ? payAt(id, taken) : null; list.forEach((m, i) => m.position.copy(pay ? p.clone().setY(H * (i + .5)) : chipAt(m))); }
    if (S.dolly.visible && restIdx != null) placeDolly(WHEEL[restIdx], 0);
    if (mode === 'betting' && !hovered) restGlow();   // (a new cloth has its tiles dark)
    S.requestRender();
  }
  S.relayout.add(() => relayoutStacks());

  // ---- pointing at the layout -----------------------------------------------------------------------------------------------
  let hovered = null, press = null, sheetOpen = null;
  const localXY = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function covered(id) { const s = SPOTS.get(id); if (!s) return []; return ['column', 'dozen', 'even'].includes(s.kind) ? [id, ...s.nums] : s.nums; }
  // the last number keeps a soft glow on the layout once the dolly is lifted, until your next chip (lit once: no
  // breathing, which would keep the stage drawing while you think)
  let lastLit = null;
  const restGlow = () => S.highlight(lastLit == null ? [] : [lastLit], { level: .2, color: '#ffe4a6' });
  function hover(id, xy) {
    if (id === hovered && !xy) return; hovered = id;
    if (!id) { loupe.hidden = true; if (mode === 'betting') restGlow(); return; }
    S.highlight(covered(id), { level: .26 });
    const stake = table.on(id); loupe.querySelector('b').textContent = describe(id); loupe.querySelector('span').textContent = stake ? `Your bet ${fmt(stake)}` : `Max ${fmt(SPOTS.get(id).max)}`;
    if (xy) { const [x, y] = xy, touch = press?.touch; loupe.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - (touch ? 74 : 40))}px)`; }
    loupe.hidden = false;
  }
  canvas.addEventListener('pointermove', e => {
    if (mode !== 'betting' || sheetOpen) return; if (e.pointerType !== 'mouse' && !press) return;
    const xy = localXY(e), id = S.pick(...xy); hover(id, xy); if (press) { press.id = id; if (Math.hypot(xy[0] - press.x, xy[1] - press.y) > 12) clearTimeout(press.timer); }
  });
  canvas.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    if (mode !== 'betting') { skip(); return; }
    if (sheetOpen) { closeSheets(); return; }
    const xy = localXY(e), id = S.pick(...xy);
    press = { id, x: xy[0], y: xy[1], touch: e.pointerType !== 'mouse', held: false };
    press.timer = setTimeout(() => { if (press?.id && table.on(press.id)) { press.held = true; takeOff(press.id); } }, 480);
    hover(id, xy);
  });
  const endPress = e => { if (!press) return; clearTimeout(press.timer); const p = press; press = null; if (e.type === 'pointerup' && !p.held && p.id) placeOn([[p.id, 1]]); if (e.pointerType !== 'mouse') hover(null); };
  canvas.addEventListener('pointerup', endPress); canvas.addEventListener('pointercancel', endPress);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hover(null); });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); if (mode !== 'betting') return; const id = S.pick(...localXY(e)); if (id && table.on(id)) takeOff(id); });

  // ---- placing bets ------------------------------------------------------------------------------------------------------------
  const serial = serialQueue(err => console.error(err));
  // units: [[spot, units]]; a call bet is one gesture (one undo)
  // a unit is one chip of the value in hand: a doubled spot takes two real chips, not one chip of a value that doesn't
  // exist. `name`: the call bet asked for, so a refusal says which one and why.
  function placeOn(units, { quiet = false, name = '' } = {}) {
    if (mode !== 'betting') return;
    const adds = units.flatMap(([id, u]) => Array.from({ length: u }, () => [id, rack.value]));
    const why = table.place(adds);
    if (why) { refuse(name ? `${name} at ${fmt(rack.value)} a chip: ${why[0].toLowerCase()}${why.slice(1)}` : why); return; }
    clearResult(); refresh(); if (!quiet) feel.tap('chip'); if (!quiet) othersWake();
    serial(async () => { for (const [id, v] of adds) await Promise.race([addChip('you', id, v), sleep(70)]); });
  }
  // (a result still up gives way, so the reason is seen where it shows on an upright phone)
  function refuse(why, el = $('#rChips')) { clearResult(); hint(why); sheetSay(why); kit.shake(el); audio.cue('ui-click-2', { bus: 'ui', rate: .7, gain: .6 }); feel.tap('refuse'); }
  function takeOff(id) { if (mode !== 'betting' || !table.takeFrom(id)) return; refresh(); serial(syncYours); hover(null); }
  // out of chips with nothing on the layout: the gold button offers a fresh 1,000 (there is nothing left to lose)
  const broke = () => mode === 'betting' && !table.total && wallet.balance < CHIP_VALUES[0] && !!ctx.resetBalance;
  const actions = {
    undo() { if (mode !== 'betting' || !table.undo()) return; refresh(); serial(syncYours); },
    clear() { if (mode !== 'betting' || !table.clear()) return; refresh(); serial(syncYours); },
    rebet() { if (mode !== 'betting') return; const why = table.rebet(); if (why) { refuse(why, $('#rRebet')); return; } clearResult(); refresh(); serial(syncYours); },
    double() { if (mode !== 'betting') return; const why = table.double(); if (why) { hint(why); return; } refresh(); serial(syncYours); },
    spin() {
      if (mode !== 'betting') return; feel.tap('press');
      if (broke()) { ctx.resetBalance(); return; }
      if (!table.bets.size && table.last?.length) { const why = table.rebet(); if (why) { refuse(why, $('#rSpin')); return; } clearResult(); refresh(); serial(syncYours); }
      if (!table.bets.size) { refuse('Place a bet on the layout first.', $('#rSpin')); return; }
      if (table.total > wallet.balance) { refuse('Not enough balance for these bets.', $('#rSpin')); return; }
      // the table is claimed at once: a second press, or a chip tapped before the round starts, finds bets closed
      mode = 'closing'; refresh(); hover(null); closeSheets(); serial(round);
    },
  };
  $('#rUndo').onclick = actions.undo; $('#rClear').onclick = actions.clear; $('#rRebet').onclick = actions.rebet; $('#rX2').onclick = actions.double; $('#rSpin').onclick = actions.spin;
  kit.shimmer($('#rSpin'));

  // ---- the other players --------------------------------------------------------------------------------------------------------
  let rivalJobs = [];
  const rivalsHere = () => RIVALS.slice(0, Math.min(4, settings.players));
  function rivalBets(r) {
    const u = [5, 10, 25][Math.floor(Math.random() * 3)], pick = a => a[Math.floor(Math.random() * a.length)], n = () => Math.floor(Math.random() * 37);
    if (r.style === 'straights') return Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => [`n${n()}`, u]);
    if (r.style === 'outside') return [[pick(['red', 'black']), u * 4], ...(Math.random() < .5 ? [[pick(['odd', 'even', 'low', 'high']), u * 2]] : [])];
    if (r.style === 'dozens') return [[pick(['doz1', 'doz2', 'doz3']), u * 2], [pick(['col1', 'col2', 'col3']), u], ...(Math.random() < .4 ? [[`n${n()}`, 5]] : [])];
    const call = CALLS[pick(['voisins', 'tiers', 'orphelins', 'zero'])]; return call.chips.map(([id, k]) => [id, 5 * k]);
  }
  function othersWake() {
    if (rivalJobs.length || mode !== 'betting' || !active) return;
    rivalJobs = rivalsHere().filter(() => Math.random() < .85).map(r => {
      let fire; const go = new Promise(res => { fire = res; setTimeout(res, 700 + Math.random() * 3800); });
      const job = go.then(async () => { if (mode !== 'betting' || !active) return; for (const [id, v] of rivalBets(r)) { r.bets ??= []; r.bets.push([id, v]); await addChip(r.name, id, r.color, { ms: 280 }); await sleep(60 + Math.random() * 160); } });
      return { hurry: fire, job };
    });
  }
  async function othersReady() { for (const j of rivalJobs) j.hurry(); await Promise.all(rivalJobs.map(j => j.job)); }
  function clearRivals() { for (const r of RIVALS) { r.bets = []; for (const k of [...stacks.keys()]) if (k.startsWith(r.name + '|')) dropStack(k); } rivalJobs = []; for (const id of cols.keys()) settleCol(id); }   // (your chips that stood on theirs come down)

  // ---- the wheel at rest: the wheelhead keeps turning slowly, the last ball riding in its pocket -------------------------
  // The drift is drawn at 30 frames a second (the ticker asks for its own frames), the shadows of the frets, turret
  // and ball refreshed at 15. On the battery saver the wheelhead coasts to a stop and then nothing is drawn; with
  // reduced motion it stands at once. Either way the ball rests in its pocket.
  let idleOn = false, idleWant = false;
  const DRIFT = .63;   // rad/s: the wheelhead's slowest drift between spins
  const settle = { a: 0, r: 0, y: 0 };   // how far the ball still sits off the middle of its pocket after a spin: eased away
  function restBall(dt = 0) {
    if (restIdx == null) return;
    const k = Math.exp(-6 * dt); settle.a *= k; settle.r *= k; settle.y *= k;   // the simulation's own rest easing
    S.wheel.setBall(phi - restIdx * PITCH + settle.a, GEO.restR + settle.r, GEO.pocketY + GEO.ball + settle.y);
  }
  const idle = now => {
    const dt = Math.min(.05, (now - (idle.last ?? now)) / 1000); idle.last = now;
    const stand = S.quality.name === 'saver';
    // the wheelhead coasts on from the spin, slowing as it does in the spin (about 2% a second) down to a slow drift of
    // about 6 rpm, until the croupier spins it again; on the battery saver it runs down over some ten seconds and stands
    if (stand) rotorW -= rotorW * .6 * dt;
    else if (Math.abs(rotorW) > DRIFT) rotorW -= rotorW * TUNE.rotorDecay * dt;
    else rotorW += (Math.sign(rotorW || 1) * DRIFT - rotorW) * .06 * dt;
    phi += rotorW * dt; S.wheel.setRotor(phi); restBall(dt);
    if (stand && Math.abs(rotorW) < .004 && Math.abs(settle.r) < .004) { rotorW = 0; idleOn = false; S.tickers.delete(idle); S.requestRender(); return; }   // at rest: the last frame
    if (now - (idle.drawn ?? -1e9) < 31) return;
    const shade = now - (idle.shaded ?? -1e9) >= 64; idle.drawn = now; if (shade) idle.shaded = now;
    if (bubble.dataset.on) placeBubble();
    S.requestRender(shade);
  };
  idle.lazy = idle.still = true;
  function setIdle(on) {
    idleWant = on; const run = on && !reduced() && (S.quality.name !== 'saver' || Math.abs(rotorW) >= .004);   // a saver wheel already at rest stays at rest
    if (run !== idleOn) { idleOn = run; idle.last = null; if (run) S.tickers.add(idle); else S.tickers.delete(idle); }
    if (!run) { settle.a = settle.r = settle.y = 0; S.wheel.setRotor(phi); restBall(); }   // standing: wheelhead and ball where they belong
    S.requestRender();
  }

  // ---- the round -------------------------------------------------------------------------------------------------------------
  let skipLevel = 0, rigged = null, turbo = false, stageAt = '', spinTick = null, rollLoop = null;   // turbo (slow software-GL browsers) and rigged (a fixed number): for the browser checks, testing sessions only (api.test)
  let running = false, skipWake = null;   // running: the ball is still moving (a tap hurries it)
  function skip() { if (mode === 'spinning') { hurry = hurry === 1 ? 3.5 : 12; } else if (mode === 'paying') motion.finishAll(); skipLevel++; skipWake?.(); }
  // a wait that a tap (or Space) cuts short
  const untilSkip = p => Promise.race([p, new Promise(res => { skipWake = res; })]).finally(() => { skipWake = null; });
  // while the ball drops and in the replay the picture is the wheel's alone: the recent numbers and the hint stand aside
  const wheelOnly = on => stage.classList.toggle('r-wheelonly', on);
  // the croupier calls the number: its bubble shows as he starts to say it, or at once with no voice to wait for (sound
  // off, or the clip not there in time). `done`: the call is over.
  function callNumber(n, onCall) {
    let start; const started = new Promise(res => { start = res; });
    const done = audio.say(numberClip(n), { prio: 4, late: 600, onStart: start });   // (above "the winning number is…": hurried, it cuts that short)
    return { shown: Promise.race([started, done, sleep(700)]).then(() => { onCall(); showBubble(n); }), done };
  }
  async function round() {
    if (mode !== 'closing') return;   // spin() claimed the table: no more chips from here, the rivals finish, then bets close
    let r = null;
    try {
      await othersReady(); rivalJobs = [];
      if (!table.close()) { mode = 'betting'; clearRivals(); refresh(); return; }
      // The number is drawn and paid as bets close, and written down with the stake gone: the spin only
      // shows it, so a reload or a closed tab mid-spin keeps the win and can't undo a loss.
      const n = rigged ?? draw(); rigged = null; held = wallet.balance;
      r = table.settle(n); r.rec = { n, back: r.back, net: r.net, staked: r.staked, partage: r.partage }; inFlight.set('spin', r.rec);
      audio.preload([numberClip(n)]);   // its call decoded while the ball runs
      await spinRound(r);
    } catch (err) {
      console.error('roulette round', err); if (spinTick) S.tickers.delete(spinTick); S.wheel.setTrail(0, 0, 0, 0); rollLoop?.stop(.1);
      const back = table.abandon(); if (r) paid(r); else held = null;   // a stake taken without a number goes back
      clearRivals(); hideBubble(); wheelOnly(false); running = false; await syncYours().catch(() => {}); await cameraTo('seat', 0).catch(() => {});   // your stacks match the table again: cleared once paid, as they were if not
      mode = 'betting'; document.body.dataset.rmode = 'bet'; refresh(); setIdle(true);
      hint(r ? `The wheel stopped on ${r.n} ${colorName(r.n)}: ${r.back > 0 ? `${fmt(r.back)} paid` : 'no win'}.` : back ? 'The spin was void. Your stake is back.' : 'The spin could not start. Your bets are still on.');
    }
  }
  // the croupier has called the number: it goes into the history (the strip shows it)
  function landed(r) {
    if (r.landed) return; r.landed = true;
    history.unshift(r.n); history = history.slice(0, 500); store.set('rouletteHistory', history); renderHistory(true);
    inFlight.set('spin', { ...r.rec, seen: true });
  }
  // the winnings have reached your places: the record of the spin is closed, and the balance and this visit's net on
  // screen catch up (they hold until now, as your stack grows only when the croupier pushes the chips)
  function paid(r) {
    landed(r); if (r.paid) return; r.paid = true;
    if (!inFlight.lost('spin')) ctx.record?.({ n: r.n, color: colorName(r.n), staked: r.staked, back: r.back, partage: r.partage, net: r.net });   // the salon's book of last rounds (a window that took this spin over wrote it already)
    inFlight.set('spin', null); held = null; ctx.showBalance(); refresh();
  }
  async function spinRound(r) {
    mode = 'spinning'; hurry = 1; skipLevel = 0; running = true; clearResult(); refresh();   // "Tap to hurry the ball." while it runs
    document.body.dataset.rmode = 'spin';
    const n = r.n, f = fast(); dir = -dir; store.set('rouletteDir', dir);
    // the croupier releases the ball on his side of the bowl, the far side from the camera's wheel shot
    const p = plan(n, { dir, phiNow: phi, fast: f, theta0: camAz(S.shots.wheel?.pos) + Math.PI + (Math.random() - .5) * .6 });
    S.highlight([]); liftDolly();
    // the camera goes to the wheel as the croupier spins the wheelhead and launches the ball. Broadcast grammar:
    // locked-off shots joined by cuts, never a drifting camera; the wheel turns on until the picture is black and
    // the spin starts in the dip, so the stop and the change of direction are never seen
    let spun; const launch = () => { setIdle(false); restIdx = null; spun = playSpin(p, f); if (Math.random() < .4) say('good-luck', { prio: 1 }); };
    await cutTo('wheel', launch); if (!spun) launch();
    await spun; running = false; refresh();
    // the result: the wheelhead turns on from the spin's own speed, the ball easing into the middle of its pocket
    restIdx = WHEEL_INDEX[n]; rotorW = (p.samples.at(-1)[4] - p.samples.at(-2)[4]) * 60;
    { const b = S.wheel.ball.position, d = Math.atan2(-b.z, b.x) - (phi - restIdx * PITCH); settle.a = d - Math.round(d / (2 * Math.PI)) * 2 * Math.PI; settle.r = Math.hypot(b.x, b.z) - GEO.restR; settle.y = b.y - (GEO.pocketY + GEO.ball); }
    setIdle(true);
    // The call, as the dealer procedure has it: once the ball is at rest, "the winning number is…", then the number, its
    // bubble showing as he starts to say it (nothing on screen gives it away before him). The shot holds until he is done.
    if (!f && !skipLevel) await untilSkip(say('winning-number', { prio: 3 }));
    const call = callNumber(n, () => { landed(r); wheelOnly(false); }); await call.shown;   // (the strip takes the number with him)
    await untilSkip(skipLevel ? sleep(150) : Promise.all([f ? Promise.race([call.done, sleep(1000)]) : call.done.then(() => sleep(150)), sleep(f ? 700 : 1300)]));
    const yourStraight = r.wins.some(w => w.kind === 'straight');
    if (yourStraight && !reduced() && !skipLevel) await replay(p, n);
    hideBubble(); audio.forget(numberClip(n));
    mode = 'paying'; refresh();
    await cutTo('seat');
    await payout(r, n);
    mode = 'betting'; document.body.dataset.rmode = 'bet'; rivalJobs = []; refresh();
    say('place-bets', { prio: 2, fresh: 3000 }); othersWake();
  }
  // play the simulated spin: the wheelhead, the ball and its sound, frame by frame
  function playSpin(p, f) {
    return new Promise(done => {
      const roll = rollLoop = audio.available && audio.enabled ? createRoller(audio.ctx, audio.bus.table) : { update() {}, stop() {} }, dur = p.settledAt + .12, evs = p.events;
      let t = 0, last = performance.now(), ev = 0, called = false, pushed = false;
      const pace = f ? 1.25 : 1;   // fast play: the softer throw, run a little quicker
      S.wheel.ball.visible = true; click(.45, .8); audio.cue('whoosh', { bus: 'table', gain: .18, rate: 1.7 });
      const tick = now => {
        const dt = Math.min(turbo ? .5 : .05, (now - last) / 1000) * hurry * pace; last = now; t = Math.min(dur, t + dt);
        const st = at(p, t); phi = st.phi; S.wheel.setRotor(phi); S.wheel.setBall(st.theta, st.r, st.y);
        S.wheel.setTrail(st.theta, st.r, st.y, st.phase < 2 && hurry === 1 ? st.speed : 0, p.dir);
        while (ev < evs.length && evs[ev].t <= t) {
          const e = evs[ev++], pw = e.power ?? .5;
          if (hurry > 3 && e.type === 'fret') continue;
          if (e.type === 'deflector') click(.35 + .75 * pw, .74);
          else if (e.type === 'land') click(.5 + .4 * pw, .9);
          else if (e.type === 'fret') click(.18 + .62 * pw, 1.04 + Math.random() * .16);
          else if (e.type === 'bounce') click(.12 + .3 * pw, 1.1);
          else if (e.type === 'settle') click(.3, .86);
        }
        // the roll: a smooth whirr that follows the ball, falling in pitch as it slows (made live, see roller.mjs)
        const v = st.speed;
        roll.update({ speed: v, theta: st.theta, phase: st.phase, level: hurry > 1 ? .6 : 1, near: camAz(), pan: Math.max(-.7, Math.min(.7, ballX() / 70)) });
        if (!called && t >= p.callAt) { called = true; say('no-more-bets', { prio: 2 }); }   // as it is about to make its last two rounds
        if (!pushed && p.dropAt && t >= p.dropAt) { pushed = true; wheelOnly(true); if (hurry === 1) cutTo('push'); }
        if (t >= dur) { S.tickers.delete(tick); S.wheel.setTrail(0, 0, 0, 0); roll.stop(.2); done(); }
      };
      spinTick = tick; S.tickers.add(tick); S.requestRender();
    });
  }
  // the last moments again, slowly, close to the pocket, from a camera placed for the screen (replay.mjs)
  async function replay(p, n) {
    const wc = S.wheel.group.position, THREE = S.THREE, V = a => wc.clone().add(new THREE.Vector3(...a));
    const shot = replayShot(p, (pos, look, pts, mx, my) => S.fit(V(pos), V(look), pts.map(V), mx, my)?.fov ?? null), { t0, t1 } = shot, eye = V(shot.pos);
    const m = new THREE.Matrix4().lookAt(eye, V(shot.look), new THREE.Vector3(0, 1, 0)), pose = { pos: eye, quat: new THREE.Quaternion().setFromRotationMatrix(m), fov: shot.fov, name: 'replay' };
    const tag = $('.r-replay'); tag.hidden = false; hideBubble(); setIdle(false); wheelOnly(true);
    await fadeCut(() => S.setPose(pose));
    await new Promise(done => {
      let t = t0, last = performance.now();
      const tick = now => { const dt = Math.min(turbo ? .5 : .05, (now - last) / 1000) * (skipLevel > 1 ? 6 : .34); last = now; t += dt; const st = at(p, Math.min(t, p.settledAt + 2.9)); S.wheel.setRotor(st.phi); S.wheel.setBall(st.theta, st.r, st.y); if (t >= t1) { S.tickers.delete(tick); done(); } };
      S.tickers.add(tick); S.requestRender();
    });
    // back to now: the wheelhead where it would be by now
    phi = at(p, p.settledAt + 2.9).phi; tag.hidden = true;
    await fadeCut(() => { S.setPose(S.shots.push); setIdle(true); wheelOnly(false); }); showBubble(n); await sleep(700);   // in the black: no jump of the wheelhead seen
  }
  // a cut: a dip to black of a few frames, the way a vision mixer cuts between cameras
  // `onCut` runs while the picture is black
  async function cutTo(name, onCut) { const to = S.shots[name]; if (!to) return; fadeEl.classList.add('quick', 'on'); await sleep(reduced() ? 120 : 90); S.setPose(to); onCut?.(); await sleep(30); fadeEl.classList.remove('on'); await sleep(110); fadeEl.classList.remove('quick'); }
  async function fadeCut(fn) { fadeEl.classList.add('on'); await sleep(reduced() ? 120 : 220); fn(); await sleep(40); fadeEl.classList.remove('on'); await sleep(200); }
  function cameraTo(name, ms, easing) {
    const to = S.shots[name]; if (!to) return Promise.resolve();
    if (reduced()) return fadeCut(() => S.setPose(to));
    return S.move(to, ms, easing);
  }

  // ---- the number beside the ball -----------------------------------------------------------------------------------------------
  function showBubble(n) {
    const c = colorOf(n); bubble.className = `r-bubble ${c}`; bubble.querySelector('b').textContent = n; bubble.querySelector('small').textContent = c === 'green' ? 'Zero' : `${c === 'red' ? 'Red' : 'Black'} · ${n % 2 ? 'Odd' : 'Even'} · ${n <= 18 ? '1–18' : '19–36'}`;
    bubble.hidden = false; bubble.dataset.on = '1'; placeBubble(true); ui.pop(bubble, { from: .4 });
  }
  function hideBubble() { bubble.hidden = true; delete bubble.dataset.on; }
  // over the ball, or under it where the bar or the recent numbers would cover it (`measure`: the room is taken again)
  let bubbleRoom = 0;
  function placeBubble(measure = false) {
    if (measure) bubbleRoom = Math.max(ctx.barCover(stage), histEl.offsetHeight ? histEl.offsetTop + histEl.offsetHeight : 0) + 6 + bubble.offsetHeight + 22;
    const b = S.wheel.ball, p = S.project(S.wheelToWorld(b.position.toArray()));
    bubble.classList.toggle('below', p.y < bubbleRoom); bubble.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
  }

  // ---- the dolly and the payout -----------------------------------------------------------------------------------------------------
  // the dolly: in the middle of the number, standing on the tallest stack there (on the felt when it is bare), set down
  // straight; it comes up again with the chips as they go home (payout's end), so it never hovers over an empty cell
  function placeDolly(n, ms = 240) {
    const d = S.dolly, a = S.anchor(`n${n}`); d.visible = true;
    const tall = cols.get(`n${n}`)?.length ?? 0, y = H * tall;   // (every player's chips there are one column)
    if (ms <= 0) { d.position.set(a.x, y, a.z); S.requestRender(); return Promise.resolve(); }
    return motion.tween(ms, t => d.position.set(a.x, y + (1 - t) * 10, a.z), ease.land).then(() => audio.play(tall ? 'stack' : 'chip', { gain: .6, x: panX(a) }));
  }
  function liftDolly() { const d = S.dolly; if (!d.visible) return; const y0 = d.position.y; motion.tween(220, t => { d.position.y = y0 + t * 10; }).then(() => { d.visible = false; S.requestRender(); }); }
  async function payout(r, n) {
    stageAt = 'dolly'; await placeDolly(n); stageAt = 'lose';
    // the number lights from under the cloth, its edge brightest so the numeral keeps its ink, and the outside boxes it
    // wins with more softly (as an LED-lit layout does): one fade up, no pulse to keep the picture redrawing
    S.highlight([n, ...[...SPOTS].filter(([, sp]) => OUT_ORDER.includes(sp.kind) && sp.nums.includes(n)).map(([id]) => [id, .25])], { level: .6, color: '#ffe4a6', fade: reduced() ? 0 : 240 });
    const sweepTo = S.layout.tray ? S.layout.tray.clone() : S.anchor('n0').clone().add(new S.THREE.Vector3(-22, 0, 0)), kindOf = k => SPOTS.get(k.split('|')[1]).kind;   // losing chips go to the croupier's float
    const stakeOf = k => { const [owner, id] = k.split('|'); return stacks.get(k).reduce((a, m) => a + (typeof m.userData.v === 'number' ? m.userData.v : 0), 0) || (RIVALS.find(x => x.name === owner)?.bets ?? []).filter(([b]) => b === id).reduce((a, [, v]) => a + v, 0); };
    // la partage: on zero the even-money stacks go with the losers, and half of each is pushed back from the float
    const halves = n === 0 ? [...stacks.keys()].filter(k => kindOf(k) === 'even').map(k => ({ k, stake: stakeOf(k), count: stacks.get(k).length })) : [];
    // losing chips first, outside bets before inside
    const lose = [...stacks.keys()].filter(k => !SPOTS.get(k.split('|')[1]).nums.includes(n)).sort((a, b) => OUT_ORDER.includes(kindOf(b)) - OUT_ORDER.includes(kindOf(a)));
    if (lose.length) audio.play('collect', { x: panX(sweepTo) });
    await Promise.all(lose.map((k, i) => sleep(i * 35).then(() => dropStack(k, { to: sweepTo, ms: 420 }))));
    stageAt = 'wins';
    // then the winners: outside first, then inside toward the wheel, straights last
    const wins = [...stacks.keys()].sort((a, b) => rank(kindOf(a)) - rank(kindOf(b)));
    function rank(kd) { return OUT_ORDER.includes(kd) ? 0 : kd === 'straight' ? 2 : 1; }
    const paidStacks = [], taken = [];
    for (const [i, k] of wins.entries()) {
      const [owner, id] = k.split('|'), s = SPOTS.get(id), stake = stakeOf(k);
      const pay = stake * s.pays, a = S.anchor(id, slotOf(owner)), pa = payAt(id, taken);
      const chips = owner === 'you' ? breakDown(pay).slice(0, 12) : Array.from({ length: Math.min(8, Math.ceil(pay / 25)) }, () => RIVALS.find(x => x.name === owner).color);
      const pk = `${owner}|${id}|pay`, list = []; stacks.set(pk, list); paidStacks.push(pk);
      await sleep(i ? 90 : 0); audio.play('payout', { x: panX(sweepTo) });   // (cut from the float)
      chips.forEach((v, j) => { const m = S.chipMesh(v), to = pa.clone().setY(H * (j + .5)), from = sweepTo.clone().setY(8); m.userData = { owner, id, v }; list.push(m); m.position.copy(from); motion.tween(480, t => { m.position.lerpVectors(from, to, t); m.position.y += Math.sin(t * Math.PI) * 6; }, ease.out); });
      if (owner !== 'you') tag(owner, `+${fmt(pay)}`, a);
    }
    for (const [i, { k, stake, count }] of halves.entries()) {
      const [owner, id] = k.split('|'), a = S.anchor(id, slotOf(owner)), list = []; stacks.set(k, list);
      const chips = owner === 'you' ? breakDown(stake / 2).slice(0, 12) : Array.from({ length: Math.max(1, Math.ceil(count / 2)) }, () => RIVALS.find(x => x.name === owner).color);
      await sleep(i ? 90 : 120); audio.play('payout', { x: panX(sweepTo) });
      chips.forEach((v, j) => { const m = S.chipMesh(v); m.userData = { owner, id, v }; const to = seat(m), from = sweepTo.clone().setY(8); list.push(m); m.position.copy(from); motion.tween(480, t => { m.position.lerpVectors(from, to, t); m.position.y += Math.sin(t * Math.PI) * 6; }, ease.out); });
      tag(owner === 'you' ? 'La partage' : owner, `${fmt(stake / 2)} back`, a);
    }
    // the winnings down beside their stakes: your balance and this visit catch up, and the result banner says it
    while (motion.live.size) await sleep(40);
    paid(r);
    stageAt = 'banner'; showWin(r, n);
    if (r.net > 0) { if (bigWin(r)) { feel.tap('big'); feel.confetti({ size: r.back >= r.staked * 20 ? 2 : 1, from: { x: .5, y: .3 } }); } else feel.tap('win'); }
    if (r.net > 0) { sting(r.straight ? 'big' : 'small', .8); if (r.back >= r.staked * 20) { audio.cue(`crowd-cheer-${1 + Math.floor(Math.random() * 2)}`, { gain: .45 }); setTimeout(() => say('congrats', { prio: 1 }), 900); } }
    await sleep(skipLevel ? 250 : fast() ? 900 : 1600);
    // everything on the layout goes home: yours toward you, the others' taken up where they stand (they have no seats
    // to go to yet), and the dolly comes up with them: the payout is done, and the table opens for bets
    const home = S.layout.orient === 'port' ? new S.THREE.Vector3(S.layout.rect.x1 + 14, 0, 0) : new S.THREE.Vector3((S.layout.X(0) + S.layout.xEnd) / 2, 0, S.layout.rect.z1 + 14);
    const keys = [...stacks.keys()]; if (keys.length) audio.play('collect', { x: panX(home) });
    stageAt = 'home'; liftDolly();
    await Promise.all(keys.map((k, i) => sleep(i * 25).then(() => dropStack(k, k.startsWith('you|') ? { to: home, ms: 380 } : { ms: 380 }))));
    for (const r2 of RIVALS) r2.bets = [];
    lastLit = n; restGlow();
  }
  // Where a win is paid: pushed to the players' edge of the cloth (+z, the long side) in line with its bet, as dealers at
  // North American tables push it to the player. Set beside the bet it sat on the next line or box and read as a bet of
  // its own (a straight up's on the split line), and a column's ran off the layout. Each payout takes the nearest free
  // place along the edge, a chip and a little apart from the others; a row further out when the edge is full.
  function payAt(id, taken) {
    const L = S.layout, a = S.anchor(id), gap = 2 * CHIP_R + .4, x0 = L.X(-1) + CHIP_R, x1 = L.xEnd - CHIP_R;
    for (const reach of [gap, x1 - x0]) for (let row = 0; row < 3; row++) {   // near its bet in any row before far along the first
      const z = L.zNear + 1.6 + CHIP_R + .5 + row * gap, free = x => taken.every(p => p.z !== z || Math.abs(p.x - x) > gap - .01);
      for (let k = 0; Math.ceil(k / 2) * .5 <= reach; k++) { const x = Math.min(x1, Math.max(x0, a.x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .5)); if (free(x)) { const p = new S.THREE.Vector3(x, 0, z); taken.push(p); return p; } }
    }
    return a.clone();
  }
  function tag(name, text, at3) {
    const p = S.project(at3), t = document.createElement('div'); t.className = 'r-tag'; t.innerHTML = `<b></b><span></span>`; t.firstChild.textContent = name; t.lastChild.textContent = text;
    t.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`; tagsEl.append(t); setTimeout(() => t.remove(), 2600);
  }
  // a straight-up hit, or anything paying back ten times the stake, is a big win: gold foil and confetti
  const bigWin = r => r.straight || r.back >= r.staked * 10;
  // The result reads as the blackjack tag does: what the spin came to for you up front (+45, −15, Even), and under it
  // what the layout paid back against what was on it, la partage included. A spread of bets can pay something and
  // still lose, so 'You win' is said only when you are up. It stays until your next bet, the number glowing softly on
  // the layout; the dolly is lifted as the chips go home, as at a real table, before "Place your bets".
  function showWin(r, n) {
    const c = colorOf(n), net = r.net; winEl.className = `r-win ${net > 0 ? 'up' : net < 0 ? 'down' : 'even'} ${c}${net > 0 && bigWin(r) ? ' gild' : ''}`;
    winEl.querySelector('small').textContent = `${n} ${colorName(n)}`;
    winEl.querySelector('b').textContent = net > 0 ? (bigWin(r) ? 'Big win' : 'You win') : !r.back ? 'No win' : !net ? 'Stakes back' : r.partage === r.back ? 'La partage' : 'Some bets won';
    winEl.querySelector('.r-gross').textContent = r.back ? `Staked ${fmt(r.staked)} · paid back ${fmt(r.back)}${r.partage && r.partage < r.back ? `, ${fmt(r.partage)} of it by la partage` : ''}` : '';
    const em = winEl.querySelector('em'), final = net ? signed(net) : 'Even'; em.textContent = net ? (net > 0 ? '+0' : '−0') : final;
    winEl.hidden = false; void winEl.offsetWidth; winEl.classList.add('show');   // a reflow, then the transition
    if (net) setTimeout(() => ui.morph(em, final), 140);   // the amount rolls up to the result
  }
  function clearResult() {
    if (lastLit != null) { lastLit = null; if (!hovered && mode === 'betting') S.highlight([]); }
    if (winEl.hidden) return; winEl.classList.remove('show'); setTimeout(() => { if (!winEl.classList.contains('show')) winEl.hidden = true; }, 380); if (mode === 'betting') { liftDolly(); }
  }

  // ---- recent numbers ---------------------------------------------------------------------------------------------------------------
  function renderHistory(fresh = false) {
    const count = S.layout?.orient === 'port' ? 11 : 16;
    histEl.replaceChildren(...history.slice(0, count).map((n, i) => { const li = document.createElement('li'); li.className = colorOf(n); li.textContent = n; if (i === 0) li.classList.add('latest'); return li; }));
    if (fresh && histEl.firstChild) ui.pop(histEl.firstChild, { from: .2 });
    reframe();   // the strip's room above the picture: the first number of a fresh table makes it appear (nothing when its height stands)
  }

  // ---- the racetrack and the statistics ------------------------------------------------------------------------------------------------
  const raceSheet = $('#rRaceSheet'), statsSheet = $('#rStatsSheet');
  let nbK = store.get('neighbours', 2), raceAt = 0, raceFit = '';   // raceAt: the number the keyboard is on (one stop on the track for Tab, arrows go round)
  // On a phone the sheets take the whole picture under the bar: the track needs the room, and the layout behind it is
  // not what you are betting on while it is up (see .r-sheet in app.css, which this follows).
  const phoneSheet = matchMedia('(max-width: 760px) and (orientation: portrait), (orientation: landscape) and (max-height: 520px)');
  const raceKey = () => `${stage.clientWidth}x${stage.clientHeight}x${phoneSheet.matches}`;
  const CLOSE = '<button class="icon r-close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
  function buildRace() {
    raceSheet.innerHTML = `<header><h3>Racetrack</h3><div class="rt-nb" role="group" aria-label="Neighbours each side"><span aria-hidden="true">Neighbours</span><button class="pill" data-nb="-1" aria-label="Fewer neighbours">−</button><output aria-live="polite">${nbK}</output><button class="pill" data-nb="1" aria-label="More neighbours">+</button></div>${CLOSE}</header>
      <svg class="rt" role="group" aria-label="Racetrack: a number bets it and its neighbours, a section its call bet"></svg><p class="rt-note">Tap a number to bet it with <b class="nbk">${nbK}</b> neighbours each side; tap a section for its call bet. Chips go on at your chip value.</p><p class="r-say" aria-hidden="true" hidden></p>`;
    // the room the track has: the sheet's height limit (as in app.css) less its own header, note and padding
    const svg = raceSheet.querySelector('.rt'), wasHidden = raceSheet.hidden; raceSheet.hidden = false;
    const maxH = stage.clientHeight - ctx.barCover(stage) - (phoneSheet.matches ? 8 : 70), fit = () => trackShape(svg.getBoundingClientRect().width, Math.max(120, maxH - (raceSheet.offsetHeight - svg.getBoundingClientRect().height)), phoneSheet.matches);
    let g = fit(); if (g.step < 34 && phoneSheet.matches) { raceSheet.querySelector('.rt-note').hidden = true; g = fit(); }   // a small phone: the numbers before the note (the buttons say it too)
    raceSheet.hidden = wasHidden; raceFit = raceKey();
    const at = (u, d = 0) => loopAt(g.s0 + u * g.step, g, d), f1 = v => v.toFixed(1), pts = list => list.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('') + 'Z';
    const cells = WHEEL.map((n, i) => { const [x, y] = at(i); return `<g class="rt-num ${colorOf(n)}" data-n="${n}" role="button" tabindex="${n === raceAt ? 0 : -1}" aria-label="${n} and neighbours"><circle class="hit" cx="${f1(x)}" cy="${f1(y)}" r="${f1(g.step / 2)}"/><circle class="face" cx="${f1(x)}" cy="${f1(y)}" r="${f1(g.rc)}"/><text x="${f1(x)}" y="${f1(y)}">${n}</text></g>`; }).join('');
    const zones = TRACK_ZONES.map(([k, label]) => {
      const poly = trackRuns(zoneNumbers(k)).flatMap(([u0, u1]) => { const n = Math.max(2, Math.ceil((u1 - u0) * g.step / 5)); return Array.from({ length: n + 1 }, (_, i) => at(u0 + (u1 - u0) * i / n, g.d)); });
      const [lx, ly] = labelAt(poly), chips = CALLS[k].chips.reduce((a, [, u]) => a + u, 0);
      return `<g class="rt-zone" data-call="${k}" role="button" tabindex="0" aria-label="${CALLS[k].name}: ${chips} chips"><path d="${pts(poly)}"/><text x="${f1(lx)}" y="${f1(ly)}">${label}</text></g>`;
    }).join('');
    svg.setAttribute('viewBox', `0 0 ${f1(g.w)} ${f1(g.h)}`); svg.style.setProperty('--fs', `${f1(g.rc * .8)}px`); svg.style.setProperty('--zfs', `${g.upright ? 15 : 16}px`);
    svg.innerHTML = `<path class="rt-band" d="${roundRect(g, -g.d)}"/><path class="rt-inner" d="${roundRect(g, g.d)}"/>${zones}${cells}`;
    const nums = n => { const on = new Set(n); for (const e of raceSheet.querySelectorAll('.rt-num')) e.classList.toggle('lit', on.has(+e.dataset.n)); if (n.length) S.highlight(n, { level: .26 }); else restGlow(); };
    // Enter and Space press a number or a section moved to with the keyboard (the salon's key handler leaves them to it);
    // one that was clicked has already had the key taken as Spin, which marks it handled
    const pressed = (e, go) => { if ((e.key === 'Enter' || e.key === ' ') && !e.defaultPrevented) { e.preventDefault(); if (!e.repeat) go(); return true; } return false; };
    const label = () => { for (const e of raceSheet.querySelectorAll('.rt-num')) e.setAttribute('aria-label', `${e.dataset.n} and ${nbK} neighbours each side: ${2 * nbK + 1} chips`); };
    label();
    for (const e of raceSheet.querySelectorAll('.rt-num')) {
      const n = +e.dataset.n, bet = () => { placeOn(neighbours(n, nbK).map(k => [`n${k}`, 1]), { name: `${n} and ${nbK} neighbours` }); nums(neighbours(n, nbK)); };
      e.addEventListener('pointerenter', () => nums(neighbours(n, nbK))); e.addEventListener('pointerleave', () => nums([]));
      e.addEventListener('focus', () => nums(neighbours(n, nbK))); e.addEventListener('blur', () => nums([]));
      e.addEventListener('click', bet);
      e.addEventListener('keydown', ev => {
        if (pressed(ev, bet)) return;
        const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key] ?? (ev.key === 'Home' ? -WHEEL_INDEX[n] : 0); if (!move) return;
        ev.preventDefault(); raceAt = WHEEL[(WHEEL_INDEX[n] + move + WHEEL.length) % WHEEL.length];
        for (const o of raceSheet.querySelectorAll('.rt-num')) o.tabIndex = +o.dataset.n === raceAt ? 0 : -1;
        raceSheet.querySelector(`.rt-num[data-n="${raceAt}"]`).focus();
      });
    }
    for (const e of raceSheet.querySelectorAll('.rt-zone')) {
      const k = e.dataset.call, bet = () => { placeOn(CALLS[k].chips, { name: CALLS[k].name }); nums(callNumbers(k)); };
      e.addEventListener('pointerenter', () => nums(callNumbers(k))); e.addEventListener('pointerleave', () => nums([]));
      e.addEventListener('focus', () => nums(callNumbers(k))); e.addEventListener('blur', () => nums([]));
      e.addEventListener('click', bet); e.addEventListener('keydown', ev => pressed(ev, bet));
    }
    for (const b of raceSheet.querySelectorAll('[data-nb]')) b.onclick = () => { nbK = Math.max(1, Math.min(4, nbK + +b.dataset.nb)); store.set('neighbours', nbK); raceSheet.querySelector('output').textContent = nbK; raceSheet.querySelector('.nbk').textContent = nbK; label(); uiSound('toggle'); };
    raceSheet.querySelector('.r-close').onclick = closeSheets;
  }
  // a refusal while a sheet is up is said in the sheet as well: the hint line is behind it
  let sayTimer = 0;
  function sheetSay(why) { const el = sheetOpen && (sheetOpen === 'race' ? raceSheet : statsSheet).querySelector('.r-say'); if (!el) return; el.textContent = why; el.hidden = false; clearTimeout(sayTimer); sayTimer = setTimeout(() => { el.hidden = true; }, 3200); }
  function buildStats() {
    const N = Math.min(history.length, 100), st = stats(history, 100);
    const chip = x => `<button class="st-n ${colorOf(x.n)}" data-n="${x.n}" aria-label="Bet ${x.n} straight up">${x.n}<small>${x.c}×</small></button>`;
    const z = [st.zero, 'green', '0'];   // every bar has the zero's share in it, as the wheel does: each sums to 100%
    const bar = (label, parts) => `<div class="st-bar"><span>${label}</span><div>${parts.map(([v, cls, t]) => `<i class="${cls}" style="flex:${Math.max(v, .5)}"><em>${t} ${v}%</em></i>`).join('')}</div></div>`;
    statsSheet.innerHTML = `<header><h3>Statistics <small>${N ? `last ${N} spin${N > 1 ? 's' : ''}` : 'no spins yet'}</small></h3>${CLOSE}</header><p class="r-say" aria-hidden="true" hidden></p>
      ${N ? `<div class="st-hc"><div><h4>Hot</h4><div class="st-row">${st.hot.map(chip).join('')}</div></div><div><h4>Cold</h4><div class="st-row">${st.cold.map(chip).join('')}</div></div></div>
      ${bar('Colour', [[st.red, 'red', 'Red'], [st.zero, 'green', '0'], [st.black, 'black', 'Black']])}
      ${bar('Odd · Even', [[st.odd, 'a', 'Odd'], z, [st.even, 'b', 'Even']])}
      ${bar('Low · High', [[st.low, 'a', '1–18'], z, [st.high, 'b', '19–36']])}
      ${bar('Dozens', [z, ...st.dozens.map((v, i) => [v, ['a', 'b', 'c'][i], ['1st', '2nd', '3rd'][i]])])}
      ${bar('Columns', [z, ...st.columns.map((v, i) => [v, ['a', 'b', 'c'][i], `Col ${i + 1}`])])}
      <p class="st-note">Every spin is independent: the wheel has no memory. Tap a number to bet it.</p>` : '<p class="st-note">Numbers you see come out will be counted here.</p>'}`;
    for (const b of statsSheet.querySelectorAll('.st-n')) { b.onclick = () => placeOn([[`n${b.dataset.n}`, 1]]); b.onpointerenter = () => S.highlight([+b.dataset.n], { level: .3 }); b.onpointerleave = restGlow; }
    statsSheet.querySelector('.r-close').onclick = closeSheets;
  }
  // `focus`: opened from the keyboard, so the keyboard goes into the sheet (and comes back to its button on close)
  function openSheet(which, { focus = false } = {}) {
    const el = which === 'race' ? raceSheet : statsSheet, other = which === 'race' ? statsSheet : raceSheet;
    if (sheetOpen === which) { closeSheets(); return; }
    other.hidden = true; if (which === 'race') buildRace(); else buildStats();
    el.hidden = false; sheetOpen = which; uiSound('open'); ui.enter([el], { y: 16 });
    $('#rRace').setAttribute('aria-expanded', which === 'race'); $('#rStats').setAttribute('aria-expanded', which === 'stats');
    if (focus) (el.querySelector('.rt-num[tabindex="0"]') ?? el.querySelector('.st-n') ?? el.querySelector('.r-close'))?.focus();   // onto the track (or the numbers), not the header
  }
  function closeSheets() {
    if (!sheetOpen) return; const back = raceSheet.contains(document.activeElement) ? $('#rRace') : statsSheet.contains(document.activeElement) ? $('#rStats') : null;
    raceSheet.hidden = statsSheet.hidden = true; sheetOpen = null; uiSound('close'); restGlow(); $('#rRace').setAttribute('aria-expanded', false); $('#rStats').setAttribute('aria-expanded', false);
    back?.focus();
  }
  $('#rRace').onclick = e => openSheet('race', { focus: e.detail === 0 }); $('#rStats').onclick = e => openSheet('stats', { focus: e.detail === 0 });   // (a click from the keyboard has no pointer count)

  // ---- the controls and the hint -----------------------------------------------------------------------------------------------------
  function refresh() {
    const betting = mode === 'betting', total = table.total, bal = held ?? wallet.balance, out = broke();
    const down = betting || mode === 'closing' ? total : table.staked ?? 0;   // in play: the layout, then the stake once bets close
    $('#rUndo').disabled = !betting || !table.history.length; $('#rClear').disabled = !betting || !total;
    rebetSlot($('#rRebet'), $('#rX2'), !!down);
    $('#rRebet').disabled = !betting || !table.canRebet; $('#rX2').disabled = !betting || !total || total * 2 > bal;
    $('#rSpin').disabled = !betting || (!total && !table.canRebet && !out) || total > bal;
    goLabel($('#rSpin'), 'Spin', { out, rebet: betting && !total && table.canRebet });   // (once the ball goes the layout is empty: its bets closed)
    rack.fit(bal - (betting ? total : 0));
    for (const b of dock.querySelectorAll('.r-tool')) b.disabled = !betting;
    if (!stage.hidden) ctx.showInPlay(down);
    if (betting && active) {
      if (out) hint(`You are out of chips. Tap Reset for a fresh ${fmt(wallet.START)}.`);
      else if (!total) hint(table.canRebet ? `Place your bets, or rebet ${fmt(table.lastTotal)}.` : 'Choose a chip, then tap the layout.');
      else hint(`Bet ${fmt(total)}. Spin when ready.`);
    } else if (mode === 'spinning') hint(running ? 'Tap to hurry the ball.' : '');   // (not over a ball at rest)
    else if (mode === 'paying' || mode === 'closing') hint('');
  }

  // ---- framing -------------------------------------------------------------------------------------------------------------------
  let framed = '';
  function reframe() {
    if (!active && !S.showcase.on) return;
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    const bar = ctx.barCover(stage), strip = histEl.offsetHeight ? histEl.offsetHeight + 10 : 0, top = bar + strip, k = `${w}x${h}x${top}`;
    stage.style.setProperty('--top-h', `${bar}px`);
    if (k === framed) return; framed = k; const was = S.layout?.orient; S.frame(w, h, top);
    if (was !== S.layout.orient) renderHistory();
    if (bubble.dataset.on) placeBubble(true);
  }
  new ResizeObserver(() => requestAnimationFrame(() => { reframe(); if (sheetOpen === 'race' && raceKey() !== raceFit) buildRace(); })).observe(stage);   // the track is laid out for its room: a turned phone gets it again

  // ---- keys ------------------------------------------------------------------------------------------------------------------------
  // (the salon's key handler has already let a control you moved to with the keyboard keep Space and Enter)
  function onKey(e) {
    const k = e.key.toLowerCase(), go = k === ' ' || k === 'enter';
    if (go && e.target.matches?.('.r-sheet:not([hidden]) :focus-visible')) return false;   // the keyboard is in a sheet (the track opened with T, the numbers with S, or its Close): the press acts there
    if (k === 'escape' && sheetOpen) { closeSheets(); return true; }
    if (mode !== 'betting') { if (go) { e.preventDefault(); skip(); return true; } return false; }   // held, it keeps hurrying the ball
    if (e.repeat) { if (go) e.preventDefault(); return go; }   // a held key acts once: no rebet-and-spin the moment betting reopens
    if (go) { e.preventDefault(); actions.spin(); }
    else if (k === 't') openSheet('race', { focus: true });
    else if (k === 's') openSheet('stats', { focus: true });
    else return betKey(k, { ...actions, chip: rack.select });   // undo, clear, rebet, ×2 and the chips, as at every table
    return true;
  }

  // ---- start ------------------------------------------------------------------------------------------------------------------------
  S.wheel.setRotor(phi); if (history.length) { restIdx = WHEEL_INDEX[history[0]]; S.wheel.ball.visible = true; restBall(); }   // in the last number's pocket, idle or not
  renderHistory();
  // the balance moved while you sit here with nothing riding (the salon in another window, a reset): the
  // bar and the buttons follow, and a layout it no longer covers comes off
  wallet.subscribe(() => {
    if (!active || held != null || mode !== 'betting') return;
    ctx.showBalance();
    if (table.total > wallet.balance) { table.clear(); serial(syncYours); refresh(); hint('Your bets were cleared: your balance changed in another window.'); return; }
    refresh();
  });
  const api = {
    stage, dock, scene: S, table, onKey, hint: t => { if (t) clearResult(); hint(t); },   // a word from the salon (a reset, a refusal) takes the result's place
    get busy() { return mode !== 'betting'; },
    get mode() { return mode; },
    // the room is shown (behind the lobby or at the table)
    show() {
      stage.hidden = dock.hidden = false; S.pause(false); framed = ''; reframe(); setIdle(true);
      ctx.title('EUROPEAN ROULETTE', 'Roulette'); ctx.showBalance(wallet.balance, false);
      // chips spent at another table since you left: the layout can't stay bigger than your balance
      if (mode === 'betting' && table.total > wallet.balance) { table.clear(); serial(syncYours); hint('Your bets were cleared: your balance changed at another table.'); }
      ctx.showInPlay(table.total); refresh();
    },
    hide() { stage.hidden = dock.hidden = true; setIdle(false); S.pause(true); active = false; closeSheets(); hover(null); for (const j of rivalJobs) j.hurry(); rivalJobs = []; },
    showcase: { start(still) { S.showcase.start(still); framed = ''; reframe(); S.requestRender(); }, stop: ms => S.showcase.stop(ms) },
    // you sit down: the camera flies into your chair
    async enter(ms) { active = true; framed = ''; reframe(); await S.showcase.stop(ms); if (!S.current) S.setPose(S.shots.seat); refresh(); if (welcome) { hint(welcome); welcome = null; } if (mode === 'betting') { say('place-bets', { prio: 2, fresh: 3000 }); othersWake(); } },
    leave() { active = false; for (const j of rivalJobs) j.hurry(); rivalJobs = []; },
    toLobby() { api.leave(); api.showcase.start(settings.reduced); },   // the lobby opens over the wheel: it turns slowly behind the menu
    round: 'spin',
    players: () => rivalsHere().map(r => r.name),
    callBets: () => say('place-bets', { prio: 3 }),   // hear the voice level you set
    setReduced(on) { motion.reduced = on; setIdle(idleWant); },   // the drift stops or resumes only where it belongs (never mid-spin)
    setFast(on) { motion.slow = on ? .62 : 1; },
    setQuality(q) { S.setQuality(q); setIdle(idleWant); },   // the battery saver stands the wheel still
    refresh, reframe: () => { framed = ''; reframe(); },
    // for the browser checks, only in a testing session (?test or salonnoir.dev): rig() fixes the next number
    test: ctx.dev ? { plan, at, get history() { return history; }, place: (id, units = 1) => placeOn([[id, units]]), rig: n => { rigged = n; }, set turbo(v) { turbo = v; }, stacks, get skipLevel() { return skipLevel; }, get stageAt() { return stageAt; }, motion, showWin, showBubble } : undefined,
  };
  return api;
}

// ---- the racetrack's shape ---------------------------------------------------------------------------------------------------------
// The wheel's numbers in a loop round a rounded rectangle (a stadium when there is room), zero at one end, and the four
// sections inside. It is laid out in screen pixels for the box it gets, so every number keeps a finger-sized place (at
// least 32 px a number on a phone): on a phone held upright the loop stands on end. Each section is bounded by its own
// numbers: a divider runs from the gap after the last number of one section across to the same gap on the other side,
// as on the felt, and no section reaches into the ring of numbers.
const TRACK_ZONES = [['zero', 'Zéro'], ['voisins', 'Voisins'], ['orphelins', 'Orphelins'], ['tiers', 'Tiers']];
const zoneNumbers = k => k === 'voisins' ? SECTIONS.voisins.filter(n => !SECTIONS.zero.includes(n)) : SECTIONS[k];   // Jeu zéro is the voisins' own heart
// the stretches of the loop a set of numbers takes, counted in places from zero: [from, to], each from the gap before
// its first number to the gap after its last
function trackRuns(nums) {
  const on = new Set(nums.map(n => WHEEL_INDEX[n])), N = WHEEL.length, out = [];
  for (let i = 0; i < N; i++) if (on.has(i) && !on.has((i + N - 1) % N)) { let j = i; while (j < i + N - 1 && on.has((j + 1) % N)) j++; out.push([i - .5, j + .5]); }
  return out;
}
// where a section's name sits: the point inside it farthest from its edges, so a thin section (Zéro, on a phone)
// keeps its name off the dividers; along a strip of even width, the middle of it (not an end, by the numbers)
function labelAt(p) {
  const xs = p.map(q => q[0]), ys = p.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const inside = (x, y) => { let c = false; p.forEach(([ax, ay], i) => { const [bx, by] = p[(i + 1) % p.length]; if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) c = !c; }); return c; };
  const clear = (x, y) => Math.min(...p.map(([ax, ay], i) => { const [bx, by] = p[(i + 1) % p.length], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - ax - t * dx, y - ay - t * dy); }));
  let best = [(x0 + x1) / 2, (y0 + y1) / 2], room = -1;
  for (let i = 1; i < 32; i++) for (let j = 1; j < 32; j++) { const x = x0 + (x1 - x0) * i / 32, y = y0 + (y1 - y0) * j / 32; if (!inside(x, y)) continue; const c = Math.min(clear(x, y), 24) - .03 * Math.hypot(x - (x0 + x1) / 2, y - (y0 + y1) / 2); if (c > room) { room = c; best = [x, y]; } }
  return best;
}
// w x h: the box in px. Returns the loop (centre cx, cy, half sizes a, b, corner R), the number radius rc, the band's
// half width d, the place between numbers (step) and s0, where zero sits on the loop.
function trackShape(w, h, tight = false) {   // tight (a phone): the band runs to the edge of its box, for a pixel or two more per place
  const N = WHEEL.length, upright = h >= w * .85;
  let H = upright ? Math.min(h, w * 1.9) : Math.min(h, w * .42), g = null;
  for (let rc = 17, pass = 0; pass < 5; pass++) {
    const m = rc + (tight ? 3 : 6), d = rc + (tight ? 3 : 4), a = w / 2 - m, b = H / 2 - m, short = Math.min(a, b);
    const per = R => 4 * (a - R) + 4 * (b - R) + 2 * Math.PI * R;
    let R = Math.max(d, upright ? short * .45 : short);
    if (per(R) / N < 34) { if (!upright && H < h) { H = h; continue; } R = Math.max(d, Math.min(short, 36)); }   // short of room: all the height there is, then squarer corners (a longer loop; not so square that numbers crowd round them)
    const step = per(R) / N;
    g = { a, b, R, d, rc, cx: w / 2, cy: H / 2, w, h: H, step, upright };
    if (upright && step > 44.5) { H -= (step - 44) * N / 4; continue; }   // an upright track stands no taller than 44 px places need
    const want = Math.max(11, Math.min(19, step / 2 - 2.5)); if (Math.abs(want - rc) < .5) break; rc = want;   // the numbers fit their places
  }
  g.s0 = g.upright ? 0 : 3 * (g.a - g.R) + 3 * (g.b - g.R) + 1.5 * Math.PI * g.R;   // zero at the top (upright: toward the wheel), or at the left end as on the felt
  return g;
}
// The point at arc length s round the loop, clockwise from the middle of its top edge, `d` in from the line.
function loopAt(s, g, d = 0) {
  const { a, b, R, cx, cy } = g, ex = a - R, ey = b - R, q = Math.PI * R / 2, P = 4 * ex + 4 * ey + 4 * q, r = R - d;
  s = ((s % P) + P) % P;
  const arc = (ox, oy, th) => [ox + r * Math.cos(th), oy + r * Math.sin(th)];
  const legs = [
    [ex, t => [cx + t, cy - b + d]], [q, t => arc(cx + ex, cy - ey, -Math.PI / 2 + t / R)],
    [2 * ey, t => [cx + a - d, cy - ey + t]], [q, t => arc(cx + ex, cy + ey, t / R)],
    [2 * ex, t => [cx + ex - t, cy + b - d]], [q, t => arc(cx - ex, cy + ey, Math.PI / 2 + t / R)],
    [2 * ey, t => [cx - a + d, cy + ey - t]], [q, t => arc(cx - ex, cy - ey, Math.PI + t / R)],
    [ex, t => [cx - ex + t, cy - b + d]],
  ];
  for (const [len, f] of legs) { if (s <= len) return f(s); s -= len; }
  return legs[0][1](0);
}
// the loop's outline `d` in from its line (negative: out), as a path
function roundRect(g, d) {
  const a = g.a - d, b = g.b - d, r = Math.max(0, g.R - d), x0 = g.cx - a, x1 = g.cx + a, y0 = g.cy - b, y1 = g.cy + b, f = v => v.toFixed(1);
  return `M${f(x0 + r)} ${f(y0)}H${f(x1 - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(y0 + r)}V${f(y1 - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x1 - r)} ${f(y1)}H${f(x0 + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x0)} ${f(y1 - r)}V${f(y0 + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x0 + r)} ${f(y0)}Z`;
}
