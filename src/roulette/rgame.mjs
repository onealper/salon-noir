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
import { createRouletteScene, preloadRouletteArt, preloadStudioArt, RAKE_W } from './rscene.mjs';
import { MODES, strike, multipliers } from './lightning.mjs';
import { createLightning } from './rlightning.mjs';
import { RouletteTable, CHIP_VALUES, SPOTS, describe, draw, colorOf, WHEEL, CALLS, callNumbers, neighbours, SECTIONS, stats, PITCH, WHEEL_INDEX } from './rules.mjs';
import { plan, at, GEO, TUNE } from './physics.mjs';
import { replayShot } from './replay.mjs';
import { createRoller, prepareRoller } from './roller.mjs';
import { Motion, ease, chipToss } from '../scene/pieces.mjs';
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
// The tables this room deals: the European, and the two Lightning tables (lightning.mjs) in their own studio. A Lightning
// table cuts the straight-up's price and has no la partage, and its croupier calls "No more bets" earlier (`lead`, laps
// before the drop, normal and fast play) to leave the lightning its time.
const TABLES = {
  european: { title: 'EUROPEAN ROULETTE', name: 'European' },
  lightning: { title: 'LIGHTNING ROULETTE', name: 'Lightning', lead: [3.4, 2.2] },
  mega: { title: 'MEGA LIGHTNING ROULETTE', name: 'Mega Lightning', lead: [3.4, 2.2] },
};
const rulesOf = k => TABLES[k].lead ? { straight: MODES[k].straight, partage: false } : {};

export async function createRoulette(ctx) {
  const { app, audio, settings, store, ui, kit, uiSound, sting } = ctx;
  const feel = ctx.feel ?? { tap() {}, cue() {}, confetti() {} };   // haptics and confetti, shared with blackjack
  await preloadRouletteArt();
  let kind = TABLES[store.get('rouletteTable')] ? store.get('rouletteTable') : 'european';
  if (kind !== 'european') await preloadStudioArt().catch(() => { kind = 'european'; });
  const lit = () => !!TABLES[kind].lead;
  // ---- the stage and the dock ----------------------------------------------------------------------------------------
  const stage = document.createElement('section'); stage.className = 'stage rstage'; stage.id = 'rstage'; stage.setAttribute('aria-label', 'Roulette table');
  stage.innerHTML = `<canvas class="rcanvas" aria-hidden="true"></canvas>
    <div class="r-vignette" aria-hidden="true"></div>
    <div class="r-overlay">
      <ol class="r-history" aria-label="Recent numbers"></ol>
      <div class="r-loupe" hidden><b></b><span></span></div>
      <div class="r-bubble" hidden><b></b><small></small></div>
      <div class="r-replay" hidden>Replay</div>
      <div class="r-slam" aria-hidden="true" hidden><small>Lightning strikes</small><b></b><em></em></div>
      <div class="r-win" role="status" hidden><small></small><b></b><em></em><span class="r-gross"></span></div>
      <div class="r-tags"></div>
      <div class="r-sheet" id="rRaceSheet" role="region" hidden aria-label="Racetrack"></div>
      <div class="r-sheet" id="rStatsSheet" role="region" hidden aria-label="Statistics"></div>
    </div>
    <p class="hint r-hint" aria-live="polite"><span></span></p>
    <div class="r-fade" aria-hidden="true"></div>`;
  const dock = document.createElement('footer'); dock.className = 'dock rdock';
  dock.innerHTML = `<div class="dock-blur" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="r-tools">
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
  const S = createRouletteScene(canvas, { quality: ctx.quality(), dressing: kind }), motion = new Motion(S);
  const bolts = createLightning(S, { audio, settings, stage, canvas, pan: p => panX(p) }); bolts.setTable(lit()); document.body.dataset.rtable = kind;
  // the Lightning tables' own sounds (rlightning.mjs), fetched once a Lightning table is sat at
  const litSounds = () => { if (lit()) audio.preload(['lr-charge', 'lr-strike-1', 'lr-strike-2', 'lr-strike-3', 'lr-chain', 'lr-double', 'lr-fizzle', 'lr-payoff', 'voice/james-bj-lightning']); };
  litSounds();
  for (const r of RIVALS) S.chipLook(r.color, { inserts: r.inserts });
  // A spin is paid into the wallet the moment bets close (the number is drawn then); the balance on
  // screen (and which chips you can afford) holds back until the ball lands, so the result isn't given away.
  let held = null;   // the balance as shown while a spin is under way
  const bank = { get: () => wallet.balance, set: v => { wallet.set(v); if (held == null) ctx.showBalance(); } };
  const table = new RouletteTable({ bank, ...rulesOf(kind) });
  let history = store.get('rouletteHistory', []).filter(n => Number.isInteger(n) && n >= 0 && n <= 36).slice(0, 500);
  const colorName = n => colorOf(n) === 'green' ? 'Zero' : colorOf(n) === 'red' ? 'Red' : 'Black';
  // a spin a closed or reloaded page left mid-flight was paid when its bets closed: its number joins the
  // history (unless the croupier had called it), and you hear how it went (over the lobby, or as you sit down)
  let welcome = null;
  await inFlight.take('spin', s => {
    if (!Number.isInteger(s?.n) || s.n < 0 || s.n > 36) return;
    if (!s.seen) { history.unshift(s.n); history = history.slice(0, 500); store.set('rouletteHistory', history); }   // (seen: called before the page went, so already written down)
    if (Number.isFinite(s.net)) ctx.record?.({ n: s.n, color: colorName(s.n), staked: s.staked, back: s.back, partage: s.partage, net: s.net, ...(s.table ? { table: s.table, x: s.x } : {}) });   // in Last hands too
    ctx.notice?.(`Your last spin landed on ${s.n} ${colorName(s.n)}: ${s.back > 0 ? `${fmt(s.back)} was paid to your balance` : 'no win'}.`, t => { welcome = t; });
  });
  let mode = 'betting', dir = store.get('rouletteDir', 1), phi = Math.random() * Math.PI * 2, rotorW = 1, restIdx = null, hurry = 1, active = false;
  const reduced = () => settings.reduced, fast = () => settings.fast;
  // chips can still go down: before the spin, and while the ball runs until the croupier calls "No more bets" ('running')
  const open = () => mode === 'betting' || mode === 'running';
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
  // the croupier's own sounds (his hand on the wheelhead, the launch, the rake, the dolly): their takes in turn
  const turns = {}, pick = (name, n) => (turns[name] = ((turns[name] ?? Math.floor(Math.random() * n)) + 1) % n) + 1;
  const say = (line, opts) => audio.say(`voice/james-${line}`, opts);
  const numberClip = n => `voice/james-n${n}`;
  audio.preload([...[1, 2, 3, 4, 5, 6].map(i => `ball-click-${i}`), 'ball-launch-1', 'ball-launch-2', 'wheelhead-1', 'wheelhead-2', 'rake-1', 'rake-2', 'rake-3', 'dolly-1', 'dolly-2', 'voice/james-place-bets', 'voice/james-last-bets', 'voice/james-no-more-bets', 'voice/james-good-luck', 'voice/james-winning-number', 'voice/james-congrats']);   // not the music: it streams (decoded, it would be 17 MB nobody plays)
  // while you place bets: the rolling sound's loops, and the bytes of the 37 numbers (the drawn one is decoded as bets
  // close, so the croupier's call is never late or lost to a slow first fetch)
  if (audio.available) { const go = () => { prepareRoller(audio.ctx); audio.prefetch(WHEEL.map(numberClip)); }; window.requestIdleCallback ? requestIdleCallback(go, { timeout: 3000 }) : setTimeout(go, 1500); }

  // ---- chips in hand ----------------------------------------------------------------------------------------------------------
  const rack = chipRack($('#rChips'), { store, uiSound });

  // ---- stacks of chips on the layout ------------------------------------------------------------------------------------------
  const stacks = new Map();   // "owner|spot" → meshes, bottom first ("owner|spot|pay": a payout, in its columns, list.cols)
  const slotOf = owner => owner === 'you' ? 0 : 1 + RIVALS.findIndex(r => r.name === owner);
  const key = (owner, id) => `${owner}|${id}`;
  const V = (x, y, z) => new S.THREE.Vector3(x, y, z);
  // Where each player sits: you in the middle of the players' side, two others either side of you and two round the
  // foot (on an upright phone your side is the foot). Their chips come from their places and go back there.
  function seatAt(owner) {
    const L = S.layout, R = L.rect, i = Math.max(0, slotOf(owner));
    if (L.orient === 'port') { const x = R.x1 + 12; return [V(x, 0, 0), V(x, 0, -30), V(x, 0, 30), V(R.x1 - 34, 0, R.z0 - 10), V(R.x1 - 34, 0, R.z1 + 10)][i]; }
    const z = R.z1 + 12, xm = (L.X(0) + L.xEnd) / 2, cz = (L.zFar + L.zNear) / 2;
    return [V(xm, 0, z), V(xm - 50, 0, z), V(xm + 50, 0, z), V(R.x1 + 10, 0, cz + 14), V(R.x1 + 10, 0, cz - 14)][i];
  }
  // the hand that sets a chip down: just over the rail at the player's place, reaching toward the spot
  const handAt = (owner, a) => { const s = seatAt(owner), d = a.clone().sub(s).setY(0), n = d.length(); return s.clone().addScaledVector(d, n > 8 ? 6 / n : 0).setY(8); };
  // the tallest column within a chip's width of a straight path across the cloth (a chip carried over must clear it)
  function tallestAlong(p, q, r = 2 * CHIP_R + .2) {
    let top = 0; const dx = q.x - p.x, dz = q.z - p.z, len2 = dx * dx + dz * dz || 1;
    for (const c of cols.values()) { const a = c[0]?.position; if (!a) continue; const u = Math.max(0, Math.min(1, ((a.x - p.x) * dx + (a.z - p.z) * dz) / len2)); if (Math.hypot(p.x + u * dx - a.x, p.z + u * dz - a.z) < r) top = Math.max(top, c.length * H); }
    return top;
  }
  // One column per spot: every player's chips go on top of what is already there, in the order they come, each layer
  // nudged a few millimetres by its owner's slot so the colours read as separate bets (stacks set side by side 1 cm apart
  // passed through each other, and their faces flickered). A chip taken out lets the ones above it settle. A chip at rest
  // is drawn with all the others of its kind at once (rscene: S.chips), and taken out of that batch to move.
  const cols = new Map();   // spot → meshes, bottom first, whoever's
  const chipAt = m => { const { owner, id } = m.userData, c = cols.get(id) ?? []; return S.anchor(id, slotOf(owner)).setY(H * (Math.max(0, c.indexOf(m)) + .5)); };
  const seat = m => { const id = m.userData.id; if (!cols.has(id)) cols.set(id, []); cols.get(id).push(m); return chipAt(m); };
  function unseat(ms) { for (const m of ms) { const c = cols.get(m.userData.id), i = c?.indexOf(m) ?? -1; if (i >= 0) c.splice(i, 1); if (c && !c.length) cols.delete(m.userData.id); } }
  function settleCol(id) { for (const m of cols.get(id) ?? []) { if (m.userData.fly) continue; const y0 = m.position.y, y = chipAt(m).y; if (Math.abs(y - y0) > .01) { S.chips.free(m); motion.tween(120, t => { m.position.y = y0 + (y - y0) * t; }, ease.out).then(() => { if (m.parent) S.chips.rest(m); }); } } }
  // A chip set down from a player's hand, the toss the blackjack table uses (pieces.mjs): a gravity arc high enough to
  // clear the columns on its way, the click as it lands, one small settle.
  // An announced bet (a call bet from the racetrack) is placed by the croupier: `croupier` slides each chip out from his
  // side of the cloth, flat on the felt and lifted only over the columns in its way.
  async function addChip(owner, id, v, { ms = 360, croupier = false } = {}) {
    const k = key(owner, id), list = stacks.get(k) ?? []; stacks.set(k, list);
    const a = S.anchor(id, slotOf(owner)), m = S.chipMesh(v); m.userData = { owner, id, v }; list.push(m);
    const to = seat(m), onStack = cols.get(id).length > 1, land = () => audio.play(onStack ? 'stack' : 'chip', { x: panX(a) });
    m.userData.fly = true;
    if (croupier) {
      const start = gatherAt().setY(H / 2), clear = Math.max(0, tallestAlong(start, to) + .4 - (to.y - H / 2)); m.position.copy(start); m.rotation.set(0, Math.random() * Math.PI * 2, 0);
      await motion.tween(ms * 1.4, t => { const e = ease.inOut(t); m.position.lerpVectors(start, to, e); m.position.y += clear * bump(t); }); m.position.copy(to); land();
    } else { const start = handAt(owner, a), toss = chipToss(m, start, to, { top: Math.max(Math.max(start.y, to.y) + 3.4, tallestAlong(start, to) + 4), onLand: land }); await motion.tween(ms, toss); toss.finish(); }
    delete m.userData.fly;
    if (m.parent) { S.chips.rest(m); settleCol(id); }   // (a chip taken out from under it while it flew lets it settle)
  }
  // Chips moved together as one stack, the way a croupier pushes a stack or lifts one over another: they glide low,
  // lifted only as far as the columns on their way need (flat where the way is clear), and are set down as a neat stack
  // at `to` (its foot `ground` above the felt). `lift`: at least this much (a stack cut from the float comes up first).
  const bump = t => Math.min(1, ease.smooth(Math.min(1, t / .18)), ease.smooth(Math.min(1, (1 - t) / .18)));
  function moveStack(list, to, { ms = 420, lift = 0, ground = 0 } = {}) {
    if (!list.length) return Promise.resolve();
    for (const m of list) S.chips.free(m);
    const from = list.map(m => m.position.clone()), end = list.map((m, i) => V(to.x, ground + H * (i + .5), to.z));
    const low = Math.min(from[0].y, end[0].y) - H / 2, clear = Math.max(lift, tallestAlong(from[0], to) + .4 - low);
    return motion.tween(ms, t => { const e = ease.inOut(t), b = clear * bump(t); list.forEach((m, i) => { m.position.lerpVectors(from[i], end[i], e); m.position.y += b; }); });
  }
  // a stack leaves the layout: carried to `to` (the float, a player's place) and put away there, or, with nowhere to go
  // (a void spin), lifted and faded where it stands
  async function dropStack(k, { to = null, ms = 260 } = {}) {
    const list = stacks.get(k); if (!list) return; stacks.delete(k); unseat(list);
    if (to) { const parts = list.cols ?? [list]; await Promise.all(parts.map((c, j) => moveStack(c, to.clone().add(V((j % 3 - 1) * 4.2, 0, (Math.floor(j / 3) % 2) * 4.2)), { ms }))); }
    else { for (const m of list) S.chips.free(m); await Promise.all(list.map(m => { const y0 = m.position.y; return motion.tween(ms, t => { m.position.y = y0 + t * 6; m.scale.setScalar(1 - t * .9); }, ease.inOut); })); }
    for (const m of list) S.chips.drop(m);
    S.requestRender();
  }
  // your stacks follow the table after undo, clear or a removed chip
  async function syncYours() {
    const want = new Map([...table.bets].map(([id, vs]) => [id, vs])), jobs = [];
    // a chip taken off rises 6 cm as it goes (by the tween's time, so at any frame rate) and what stood on it settles
    for (const [k, list] of stacks) { const [owner, id] = k.split('|'); if (owner !== 'you') continue; const w = want.get(id) ?? []; if (list.length > w.length) { const extra = list.splice(w.length); unseat(extra); settleCol(id); for (const m of extra) { S.chips.free(m); const y0 = m.position.y; jobs.push(motion.tween(160, t => { m.position.y = y0 + t * 6; m.scale.setScalar(1 - t); }).then(() => S.chips.drop(m))); } if (!list.length) stacks.delete(k); } }
    for (const [id, vs] of want) { const have = stacks.get(key('you', id))?.length ?? 0; for (let i = have; i < vs.length; i++) jobs.push(addChip('you', id, vs[i], { ms: 260 })); }
    await Promise.all(jobs);
  }
  function relayoutStacks() {
    const taken = [];
    for (const [k, list] of stacks) {
      const id = k.split('|')[1];
      if (list.cols) for (const c of list.cols) { const p = payAt(id, taken); c.forEach((m, i) => { m.position.copy(p).setY(H * (i + .5)); S.chips.sync(m); }); }
      else for (const m of list) { m.position.copy(chipAt(m)); S.chips.sync(m); }
    }
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
  // the printed racetrack (scene.pick): 'race:17' bets 17 and its neighbours, as many each side as the Racetrack sheet is
  // set to; 'call:tiers' a section's call bet. Placed by the croupier, as at the sheet.
  const onTrack = id => /^(race|call):/.test(id ?? '');
  function trackBet(id) {
    const [k, v] = id.split(':');
    if (k === 'race') { const ns = neighbours(+v, nbK); return { nums: ns, units: ns.map(x => [`n${x}`, 1]), name: `${v} and ${nbK} neighbours` }; }
    return { nums: callNumbers(v), units: CALLS[v].chips, name: CALLS[v].name };
  }
  function hover(id, xy) {
    if (id === hovered && !xy) return; hovered = id;
    if (!id) { loupe.hidden = true; if (open()) restGlow(); return; }
    if (onTrack(id)) {
      const b = trackBet(id), c = b.units.reduce((a, [, u]) => a + u, 0); S.highlight(b.nums, { level: .26 });
      loupe.querySelector('b').textContent = b.name; loupe.querySelector('span').textContent = `${c} chips · ${fmt(c * rack.value)}`;
    } else {
      S.highlight(covered(id), { level: .26 });
      const stake = table.on(id); loupe.querySelector('b').textContent = describe(id); loupe.querySelector('span').textContent = stake ? `Your bet ${fmt(stake)}` : `Max ${fmt(SPOTS.get(id).max)}`;
    }
    if (xy) { const [x, y] = xy, touch = press?.touch; loupe.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - (touch ? 74 : 40))}px)`; }
    loupe.hidden = false;
  }
  canvas.addEventListener('pointermove', e => {
    if (!open() || sheetOpen) return; if (e.pointerType !== 'mouse' && !press) return;
    const xy = localXY(e), id = S.pick(...xy); hover(id, xy); if (press) { press.id = id; if (Math.hypot(xy[0] - press.x, xy[1] - press.y) > 12) clearTimeout(press.timer); }
  });
  canvas.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    if (!open()) { skip(); return; }
    if (sheetOpen) { closeSheets(); return; }
    const xy = localXY(e), id = S.pick(...xy);
    if (!id && mode === 'running') { skip(); return; }   // off the layout while the ball runs: hurry it
    press = { id, x: xy[0], y: xy[1], touch: e.pointerType !== 'mouse', held: false };
    press.timer = setTimeout(() => { if (press?.id && table.on(press.id)) { press.held = true; takeOff(press.id); } }, 480);
    hover(id, xy);
  });
  const endPress = e => {
    if (!press) return; clearTimeout(press.timer); const p = press; press = null;
    if (e.type === 'pointerup' && !p.held && p.id) { if (onTrack(p.id)) { const b = trackBet(p.id); placeOn(b.units, { name: b.name, call: true }); } else placeOn([[p.id, 1]]); }
    if (e.pointerType !== 'mouse') hover(null);
  };
  canvas.addEventListener('pointerup', endPress); canvas.addEventListener('pointercancel', endPress);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hover(null); });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); if (mode !== 'betting') return; const id = S.pick(...localXY(e)); if (id && table.on(id)) takeOff(id); });

  // ---- placing bets ------------------------------------------------------------------------------------------------------------
  const serial = serialQueue(err => console.error(err));
  // units: [[spot, units]]; a call bet is one gesture (one undo)
  // a unit is one chip of the value in hand: a doubled spot takes two real chips, not one chip of a value that doesn't
  // exist. `name`: the call bet asked for, so a refusal says which one and why.
  function placeOn(units, { quiet = false, name = '', call = false } = {}) {
    if (!open()) return;
    const adds = units.flatMap(([id, u]) => Array.from({ length: u }, () => [id, rack.value]));
    const why = table.place(adds);
    if (why) { refuse(name ? `${name} at ${fmt(rack.value)} a chip: ${why[0].toLowerCase()}${why.slice(1)}` : why); return; }
    clearResult(); refresh(); if (!quiet) feel.tap('chip'); if (!quiet && mode === 'betting') othersWake();
    serial(async () => { for (const [id, v] of adds) await Promise.race([addChip('you', id, v, { croupier: call }), sleep(70)]); });
  }
  // (a result still up gives way, so the reason is seen where it shows on an upright phone)
  function refuse(why, el = $('#rChips')) { clearResult(); hint(why); sheetSay(why); kit.shake(el); audio.cue('ui-click-2', { bus: 'ui', rate: .7, gain: .6 }); feel.tap('refuse'); }
  // (a chip comes off only before the spin: once the ball goes, bets may be added until the call but not taken back)
  function takeOff(id) { if (mode !== 'betting' || !table.takeFrom(id)) return; refresh(); serial(syncYours); hover(null); }
  // out of chips with nothing on the layout: the gold button offers a fresh 1,000 (there is nothing left to lose)
  const broke = () => mode === 'betting' && !table.total && wallet.balance < CHIP_VALUES[0] && !!ctx.resetBalance;
  const actions = {
    undo() { if (mode !== 'betting' || !table.undo()) return; refresh(); serial(syncYours); },
    clear() { if (mode !== 'betting' || !table.clear()) return; refresh(); serial(syncYours); },
    rebet() { if (mode !== 'betting') return; const why = table.rebet(); if (why) { refuse(why, $('#rRebet')); return; } clearResult(); refresh(); serial(syncYours); },
    double() { if (!open()) return; const why = table.double(); if (why) { hint(why); return; } refresh(); serial(syncYours); },
    spin() {
      if (mode !== 'betting') return; feel.tap('press');
      if (broke()) { ctx.resetBalance(); return; }
      if (!table.bets.size && table.last?.length) { const why = table.rebet(); if (why) { refuse(why, $('#rSpin')); return; } clearResult(); refresh(); serial(syncYours); }
      if (!table.bets.size) { refuse('Place a bet on the layout first.', $('#rSpin')); return; }
      if (table.total > wallet.balance) { refuse('Not enough balance for these bets.', $('#rSpin')); return; }
      // the croupier spins: the bets stay open while the ball runs, until he calls "No more bets"
      mode = 'running'; refresh(); hover(null); closeSheets(); round();
    },
  };
  $('#rUndo').onclick = actions.undo; $('#rClear').onclick = actions.clear; $('#rRebet').onclick = actions.rebet; $('#rX2').onclick = actions.double; $('#rSpin').onclick = actions.spin;
  kit.shimmer($('#rSpin'));

  // ---- the other players --------------------------------------------------------------------------------------------------------
  let rivalJobs = [];
  const rivalsHere = () => RIVALS.slice(0, Math.min(4, settings.players));
  // Each buys in with chips of their own colour, each worth a set amount for the visit (shown by the marker on the wood
  // beside the wheel), and bets in whole chips: a call bet is as many chips as it has parts. [[spot, chips]]
  for (const r of RIVALS) r.unit = [5, 10, 25][Math.floor(Math.random() * 3)];
  const markRivals = () => S.setMarkers(rivalsHere().map(r => ({ color: r.color, unit: r.unit })));
  function rivalBets(r) {
    const pick = a => a[Math.floor(Math.random() * a.length)], n = () => Math.floor(Math.random() * 37), u = 1 + Math.floor(Math.random() * 2);
    if (r.style === 'straights') return Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => [`n${n()}`, u]);
    if (r.style === 'outside') return [[pick(['red', 'black']), 2 + Math.floor(Math.random() * 3)], ...(Math.random() < .5 ? [[pick(['odd', 'even', 'low', 'high']), 2]] : [])];
    if (r.style === 'dozens') return [[pick(['doz1', 'doz2', 'doz3']), 2], [pick(['col1', 'col2', 'col3']), 1], ...(Math.random() < .4 ? [[`n${n()}`, 1]] : [])];
    return CALLS[pick(['voisins', 'tiers', 'orphelins', 'zero'])].chips;
  }
  function othersWake() {
    if (rivalJobs.length || mode !== 'betting' || !active) return;   // (they sit down to bet as you do)
    rivalJobs = rivalsHere().filter(() => Math.random() < .85).map(r => {
      let fire; const go = new Promise(res => { fire = res; setTimeout(res, 700 + Math.random() * 3800); });
      const job = go.then(async () => {
        const call = r.style === 'sections';   // (Kenji calls a section of the wheel: the croupier places it)
        for (const [id, chips] of rivalBets(r)) { if (!open() || !active) return; r.bets ??= []; r.bets.push([id, chips * r.unit]); for (let i = 0; i < chips; i++) await Promise.race([addChip(r.name, id, r.color, { ms: 320, croupier: call }), sleep(call ? 70 : 110)]); await sleep(call ? 40 : 80 + Math.random() * 160); }
      });
      return { hurry: fire, job };
    });
  }
  // once the ball runs, now and then one of them reaches in with a late chip on a number before the call
  function lateBets(window) {
    for (const r of rivalsHere()) if (Math.random() < .3) setTimeout(() => {
      if (mode !== 'running' || !active) return; const id = `n${Math.floor(Math.random() * 37)}`;
      r.bets ??= []; r.bets.push([id, r.unit]); addChip(r.name, id, r.color, { ms: 320 });
    }, (.25 + Math.random() * .6) * window);
  }
  function clearRivals() { for (const r of RIVALS) { r.bets = []; for (const k of [...stacks.keys()]) if (k.startsWith(r.name + '|')) dropStack(k); } rivalJobs = []; for (const id of cols.keys()) settleCol(id); }   // (your chips that stood on theirs come down)

  // ---- the wheel at rest: the wheelhead keeps turning slowly, the last ball riding in its pocket -------------------------
  // The drift is drawn every frame the screen shows (a wheel turning at 30 frames a second judders on a 60 or 120 Hz
  // screen); it moves nothing that casts a shadow, so no shadow is drawn again for it. On the battery saver the
  // wheelhead coasts to a stop and then nothing is drawn; with reduced motion it stands at once. Either way the ball
  // rests in its pocket. It drifts only while someone is at the table: with the window out of focus, or no touch, click
  // or key for a minute, it coasts to a stop as on the battery saver (a laptop left on the table stays cool), and the
  // next touch has it pick up its drift again. In the lobby the orbit's own 30 frames a second draw it.
  let idleOn = false, idleWant = false, seen = performance.now(), driftSign = 1;
  const AWAY = 60000, away = () => !document.hasFocus() || performance.now() - seen > AWAY;
  const back = () => { seen = performance.now(); if (idleWant && !idleOn) setIdle(true); };
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'focus']) addEventListener(ev, back, { passive: true });
  const DRIFT = .63;   // rad/s: the wheelhead's slowest drift between spins
  const settle = { a: 0, r: 0, y: 0 };   // how far the ball still sits off the middle of its pocket after a spin: eased away
  function restBall(dt = 0) {
    if (restIdx == null) return;
    const k = Math.exp(-6 * dt); settle.a *= k; settle.r *= k; settle.y *= k;   // the simulation's own rest easing
    S.wheel.setBall(phi - restIdx * PITCH + settle.a, GEO.restR + settle.r, GEO.pocketY + GEO.ball + settle.y);
  }
  const idle = now => {
    const dt = Math.min(.05, (now - (idle.last ?? now)) / 1000); idle.last = now;
    const stand = S.quality.name === 'saver' || away(); idle.lazy = S.showcase.on;
    if (rotorW) driftSign = Math.sign(rotorW);
    // the wheelhead coasts on from the spin, slowing as it does in the spin (about 2% a second) down to a slow drift of
    // about 6 rpm, until the croupier spins it again; on the battery saver it runs down over some ten seconds and stands
    if (stand) rotorW -= rotorW * .6 * dt;
    else if (Math.abs(rotorW) > DRIFT) rotorW -= rotorW * TUNE.rotorDecay * dt;
    else rotorW += (driftSign * DRIFT - rotorW) * .06 * dt;
    phi += rotorW * dt; S.wheel.setRotor(phi); restBall(dt);
    if (stand && Math.abs(rotorW) < .004 && Math.abs(settle.r) < .004) { rotorW = 0; idleOn = false; S.tickers.delete(idle); S.requestRender(false); return; }   // at rest: the last frame
    if (bubble.dataset.on) placeBubble();
  };
  idle.still = true;
  function setIdle(on) {
    idleWant = on; const run = on && !reduced() && ((S.quality.name !== 'saver' && !away()) || Math.abs(rotorW) >= .004);   // a saver wheel (or one left alone) already at rest stays at rest
    if (run !== idleOn) { idleOn = run; idle.last = null; if (run) S.tickers.add(idle); else S.tickers.delete(idle); }
    if (!run) { settle.a = settle.r = settle.y = 0; S.wheel.setRotor(phi); restBall(); }   // standing: wheelhead and ball where they belong
    S.requestRender();
  }

  // ---- the round -------------------------------------------------------------------------------------------------------------
  let skipLevel = 0, rigged = null, riggedStrikes = null, turbo = false, stageAt = '', spinTick = null, rollLoop = null;   // turbo (slow software-GL browsers) and rigged (a fixed number): for the browser checks, testing sessions only (api.test)
  let running = false, skipWake = null;   // running: the ball is still moving (a tap hurries it)
  function skip() { if (mode === 'spinning' || mode === 'running') { hurry = hurry === 1 ? 3.5 : 12; } else if (mode === 'paying') motion.finishAll(); skipLevel++; skipWake?.(); }
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
  // The round: the croupier spins and the ball runs with the bets still open; at his call they close, the number is drawn
  // and paid as they do (the spin only shows it, so a reload or a closed tab from there keeps the win and can't undo a
  // loss). Before the call nothing has left your balance: a page closed then simply loses the layout.
  async function round() {
    if (mode !== 'running') return;
    const ctl = { r: null };
    try { await spinRound(ctl); }
    catch (err) {
      const { r } = ctl;
      console.error('roulette round', err); hush(false); if (spinTick) S.tickers.delete(spinTick); S.wheel.setTrail(0, 0, 0, 0); rollLoop?.stop(.1);
      const back = table.abandon(); if (r?.rec) paid(r); else held = null;   // a stake taken without a number goes back
      clearRivals(); hideBubble(); wheelOnly(false); S.wheel.mark(null); S.mood(false, 0); running = false; await syncYours().catch(() => {}); await cameraTo('seat', 0).catch(() => {});   // your stacks match the table again: cleared once paid, as they were if not
      mode = 'betting'; document.body.dataset.rmode = 'bet'; refresh(); setIdle(true);
      hint(r?.rec ? `The wheel stopped on ${r.n} ${colorName(r.n)}: ${r.back > 0 ? `${fmt(r.back)} paid` : 'no win'}.` : back ? 'The spin was void. Your stake is back.' : 'The spin could not finish. Your bets are still on.');
    }
  }
  // every number your layout covers, at its strongest: 3 straight up, 2 another inside bet, 1 an outside one
  function coverage() {
    const m = new Map();
    for (const id of table.bets.keys()) { const sp = SPOTS.get(id), k = sp.kind === 'straight' ? 3 : sp.nums.length <= 6 ? 2 : 1; for (const n of sp.nums) m.set(n, Math.max(k, m.get(n) ?? 0)); }
    return m;
  }
  // "No more bets": the layout closes, the number is drawn and the bets settle, all at once (rule 7: money moves as bets
  // close). A layout the balance no longer covers (spent in another window while the ball ran) is void and comes off.
  function closeBets(p, ctl) {
    mode = 'spinning'; hover(null); closeSheets(); for (const j of rivalJobs) j.hurry(); rivalJobs = [];
    const n = rigged ?? draw(); rigged = null;
    const struck = ctl.struck = lit() ? riggedStrikes ?? strike(kind) : null; riggedStrikes = null;   // at a Lightning table, drawn with the number (the two don't know each other)
    if (table.close()) {
      S.wheel.mark(coverage());   // what you have riding, lit on the wheel's numbers for the last rounds and the drop
      held = wallet.balance;
      const r = ctl.r = table.settle(n, struck && multipliers(struck)); r.rec = { n, back: r.back, net: r.net, staked: r.staked, partage: r.partage, ...(struck ? { table: kind, x: r.x } : {}) }; inFlight.set('spin', r.rec);
    } else {
      ctl.r = { n, staked: 0, back: 0, net: 0, partage: 0, wins: [], losses: [], void: true };
      table.clear(); serial(syncYours);
    }
    p.aim(n); audio.preload([numberClip(n)]);   // its call decoded while the ball makes its last rounds
    document.body.dataset.rmode = 'spin'; refresh();
    if (struck) strikeShow(p, struck);
  }
  // The Lightning tables' strikes (rlightning.mjs), from the call while the ball makes its last rounds, in the time there is
  // before the camera goes to the wheel: the board by the wheel fills as they land (a double strike first shows the
  // multiplier it lifts). A tap hurries them, as it hurries the ball.
  function strikeShow(p, struck) {
    const f = fast(), budget = Math.max(800, (p.dropAt - p.callAt - (f ? 1.5 : 2) - .3) * 1000 / (f ? 1.25 : 1));
    const upTo = i => i >= struck.length ? struck : struck.slice(0, i + 1).map(s => s.double ? { ...s, x: s.was, double: false } : s);
    S.setBoard(history, []);
    bolts.show(struck, { budget, hurried: () => hurry > 1 || skipLevel > 0, onStrike: i => { const now = upTo(i); S.setBoard(history, now); S.wheel.strike(new Map(now.map(s => [s.n, s.x]))); } }).catch(err => console.error('strikes', err));
  }
  // Moving to another of the room's tables (the lobby, between spins): the room is re-dressed and the prices change. Chips
  // on the layout come off first (nothing is staked before the spin), the other players' too.
  async function setKind(k) {
    if (!TABLES[k] || k === kind) return true; if (mode !== 'betting') return false;
    if (TABLES[k].lead && !await preloadStudioArt().then(() => true, () => false)) return false;
    if (mode !== 'betting') return false;
    if (table.total) { table.clear(); serial(syncYours); }
    clearRivals(); kind = k; store.set('rouletteTable', k); table.setRules(rulesOf(k)); bolts.clear({ quietly: true }); S.wheel.strike(null); bolts.setTable(lit()); document.body.dataset.rtable = k; litSounds();
    S.setStudio(k); framed = ''; reframe(); renderHistory(); if (!stage.hidden) ctx.title(TABLES[k].title, 'Roulette'); refresh();
    return true;
  }
  // the croupier has called the number: it goes into the history (the strip shows it)
  function landed(r) {
    if (r.landed) return; r.landed = true;
    history.unshift(r.n); history = history.slice(0, 500); store.set('rouletteHistory', history); renderHistory(true);
    if (r.rec) inFlight.set('spin', { ...r.rec, seen: true });   // (a void layout staked nothing: there is no record)
  }
  // the winnings have reached your places: the record of the spin is closed, and the balance and this visit's net on
  // screen catch up (they hold until now, as your stack grows only when the croupier pushes the chips)
  function paid(r) {
    landed(r); if (r.paid) return; r.paid = true;
    if (r.rec && !inFlight.lost('spin')) ctx.record?.({ n: r.n, color: colorName(r.n), staked: r.staked, back: r.back, partage: r.partage, net: r.net, ...(r.rec.table ? { table: r.rec.table, x: r.rec.x } : {}) });   // the salon's book of last rounds (a window that took this spin over wrote it already)
    inFlight.set('spin', null); held = null; ctx.showBalance(); refresh();
  }
  let hushed = false; const hush = on => { if (hushed !== on) { hushed = on; audio.hold?.(on); } };
  async function spinRound(ctl) {
    hurry = 1; skipLevel = 0; running = true; clearResult(); refresh();   // "Bets are open until the call." while the ball runs to it
    const f = fast(); dir = -dir; store.set('rouletteDir', dir);
    // from your seat you see the croupier stop the wheelhead and spin it the other way (it changes direction every spin),
    // then release the ball on his side of the bowl, the far side from the camera's wheel shot
    const speed = 1.6 + Math.random() * .5, pre = preroll(rotorW, Math.sign(-dir) * speed);
    const p = plan(null, { dir, phiNow: phi + pre.angle, fast: f, rotorSpeed: speed, theta0: camAz(S.shots.wheel?.pos) + Math.PI + (Math.random() - .5) * .6, lead: TABLES[kind].lead?.[f ? 1 : 0] ?? null });
    bolts.clear({ quietly: true }); S.wheel.strike(null);   // (cleared as the last round ended: this is in case it was cut short)
    S.highlight([]); liftDolly(); setIdle(false);
    lateBets((pre.T + p.callAt) * 1000 / (f ? 1.25 : 1));
    handOnWheel(pre, f ? 1.25 : 1);
    await playSpin(p, f, pre, () => closeBets(p, ctl)); running = false; refresh();
    const r = ctl.r, n = r.n;
    // the result: the wheelhead turns on from the spin's own speed, the ball easing into the middle of its pocket
    restIdx = WHEEL_INDEX[n]; rotorW = (p.samples.at(-1)[4] - p.samples.at(-2)[4]) * 60;
    { const b = S.wheel.ball.position, d = Math.atan2(-b.z, b.x) - (phi - restIdx * PITCH); settle.a = d - Math.round(d / (2 * Math.PI)) * 2 * Math.PI; settle.r = Math.hypot(b.x, b.z) - GEO.restR; settle.y = b.y - (GEO.pocketY + GEO.ball); }
    setIdle(true);
    // The call, as the dealer procedure has it: once the ball is at rest, "the winning number is…", then the number, its
    // bubble showing as he starts to say it (nothing on screen gives it away before him). The shot holds until he is done.
    if (!f && !skipLevel) await untilSkip(say('winning-number', { prio: 3 }));
    const call = callNumber(n, () => { landed(r); wheelOnly(false); ringPulse(n); }); await call.shown;   // (the strip and the ring light take the number with him)
    await untilSkip(skipLevel ? sleep(150) : Promise.all([f ? Promise.race([call.done, sleep(1000)]) : call.done.then(() => sleep(150)), sleep(f ? 700 : 1300)]));
    hush(false);
    // the replay (Settings: your straight-up wins, every spin, or none): your straight up gets the camera that rides behind
    // the ball, any other spin the slow look from beside the pocket
    const yourStraight = r.wins.some(w => w.kind === 'straight'), want = settings.replays ?? 'mine';
    if ((want === 'all' || (want === 'mine' && yourStraight)) && !reduced() && !skipLevel) await replay(p, n, { chase: yourStraight });
    hideBubble(); audio.forget(numberClip(n));
    mode = 'paying'; refresh();
    S.mood(false, 1300); await cameraTo('seat', 1300);
    if (r.x && !r.void) await lightningPays(r);
    await payout(r, n);
    mode = 'betting'; document.body.dataset.rmode = 'bet'; rivalJobs = []; refresh();
    say('place-bets', { prio: 2, fresh: 3000 }); othersWake();
  }
  // Your straight up on a struck number, the biggest moment at the Lightning tables: the dealer calls it, a gold bolt
  // drives into its plaque on the cloth, the multiplier slams onto the screen; then the croupier pays it as he pays any win.
  async function lightningPays(r) {
    const x = r.x, big = x >= 200, slam = $('.r-slam'), num = slam.querySelector('b'), amt = slam.querySelector('em'), win = r.wins.find(w => w.x)?.pay ?? 0;
    say('bj-lightning', { prio: 3 }); feel.tap(big ? 'strike-big' : 'strike');   // "Lightning strikes!"
    await bolts.payoff(r.n);   // (its own peal: lr-payoff)
    // the multiplier, figure by figure (app.css, .r-slam): each lands with a knock, the × last
    const figs = [...String(x)], span = (cls, t, i) => { const e = document.createElement('span'); e.className = cls; e.textContent = t; e.style.setProperty('--i', i); return e; };
    num.replaceChildren(...figs.map((c, i) => span('d', c, i)), span('x', 'x', figs.length)); amt.textContent = '';
    slam.style.setProperty('--n', figs.length); slam.classList.toggle('big', big);
    ui.shown(slam); slam.classList.remove('go'); void slam.offsetWidth; slam.classList.add('go');
    if (!reduced()) figs.forEach((_, i) => setTimeout(() => audio.blip(180 + 45 * i, { gain: .16 }), i * 70 + 160));
    await untilSkip(sleep(skipLevel || reduced() ? 0 : figs.length * 70 + 520));
    await countUp(amt, win, skipLevel || reduced() ? 0 : Math.min(1300, 600 + figs.length * 150));
    await untilSkip(sleep(skipLevel ? 150 : 1100));
    ui.leave(slam, { scale: .96, ms: 220 });
  }
  // The win under it, counted up: quick at first and slowing onto its figure, a tick a step, each a little higher (as the
  // blackjack table counts its Lightning bonus).
  function countUp(el, to, ms) {
    if (ms <= 0) { el.textContent = `+${fmt(to)}`; return Promise.resolve(); }
    const steps = Math.max(8, Math.min(26, Math.round(ms / 40)));
    return new Promise(res => {
      let i = 0;
      const step = () => {
        i++; const k = i / steps; el.textContent = `+${fmt(i >= steps ? to : Math.round(to * (1 - (1 - k) ** 2.4)))}`;
        audio.blip(560 * 2 ** (1.3 * k), { gain: .1 + .08 * k }); if (i % 3 === 0) feel.tap('tick');
        if (i >= steps || skipLevel) { el.textContent = `+${fmt(to)}`; res(); return; }
        setTimeout(step, ms / steps * (.55 + 1.1 * k));
      };
      step();
    });
  }
  // The ring light answers the number as the croupier calls it: a flash in its colour (red, a cold white for black, green
  // for zero) fading back to the gold over a second and a bit. With Flashing effects on Soft, only a gentle tint; Off, none.
  function ringPulse(n) {
    const f = settings.flash; if (f === 'off') return;
    const C = S.THREE.Color, base = new C(S.wheel.glow.base), hit = new C({ red: '#ff2a3a', black: '#e4ecff', green: '#2be27a' }[colorOf(n)]), c = new C(), soft = f === 'soft', t0 = performance.now(), ms = 1300;
    const tick = now => {
      const k = Math.min(1, (now - t0) / ms), a = soft ? .45 * Math.sin(Math.PI * k) : k < .1 ? k / .1 : 1 - (k - .1) / .9;
      S.wheel.glow.set(c.copy(base).lerp(hit, a), 1 + (soft ? 0 : .7 * a)); if (k >= 1) { S.tickers.delete(tick); S.wheel.glow.set(base); }
    };
    tick.still = true; S.tickers.add(tick); S.requestRender(false);
  }
  // The croupier's hand on the wheelhead before the throw: it turns at w0 (rad/s) and is to turn at w1, the other way, so
  // he stops it (the ball comes out of its pocket meanwhile) and pushes it round. T: how long that takes; angle: how far it
  // turns meanwhile; at(s): how far it has turned s seconds in.
  function preroll(w0, w1) {
    const T1 = w0 * w1 < 0 ? .3 + Math.min(.25, Math.abs(w0) * .12) : 0, v1 = T1 ? 0 : w0, T2 = .35, a1 = w0 * T1 / 2;
    return { T: T1 + T2, T1, angle: a1 + (v1 + w1) * T2 / 2, at: s => s < T1 ? w0 * s - w0 * s * s / (2 * T1) : a1 + v1 * (s - T1) + (w1 - v1) * (s - T1) ** 2 / (2 * T2) };
  }
  // ...and heard: his palm on the wood, then the push. Each take's push (s into wheelhead-1, -2) lands as the wheelhead
  // starts its new turn, T1 into the pre-roll (`pace`: fast play runs it quicker)
  const PUSH = [.16, .24];
  function handOnWheel(pre, pace) {
    const k = pick('wheelhead', 2), lead = PUSH[k - 1], t1 = pre.T1 / pace;
    audio.cue(`wheelhead-${k}`, { gain: .45, x: panX(S.wheel.group.position), delay: Math.max(0, t1 - lead), from: Math.max(0, lead - t1) });
  }
  // play the spin, frame by frame: the croupier's hand on the wheelhead, then the simulated throw (the wheelhead, the ball
  // and its sound). Until the call each frame also tries one more way the spin can end (physics.mjs, warm), so the aim
  // at the call is ready at once. `onCall`: "No more bets" (the bets close and the number is drawn: the spin takes the
  // ending that brings it under the ball); the camera glides down to the wheel then, and to the pocket at the drop.
  function playSpin(p, f, pre, onCall) {
    return new Promise(done => {
      let roll = { update() {}, stop() {} }; const phi0 = phi;   // (p.settledAt and p.events are read as they stand: the aim replaces them)
      let t = -pre.T, last = performance.now(), ev = 0, launched = false, warned = false, called = false, pushed = false, glided = false;
      const pace = f ? 1.25 : 1;   // fast play: the softer throw, run a little quicker
      const tick = now => {
        const dur = p.settledAt + .12, evs = p.events;
        const dt = Math.min(turbo ? .5 : .05, (now - last) / 1000) * hurry * pace; last = now; t = Math.min(dur, t + dt);
        if (!called) p.warm();
        if (t < 0) {   // his hand on the wheelhead: the ball rides in its pocket until he stops it, then he takes it out
          phi = phi0 + pre.at(t + pre.T); S.wheel.setRotor(phi);
          if (t + pre.T < pre.T1) restBall(); else if (restIdx != null) { restIdx = null; S.wheel.ball.visible = false; }
          return;
        }
        if (!launched) {   // the throw
          launched = true; restIdx = null; S.wheel.ball.visible = true; audio.cue(`ball-launch-${pick('ball-launch', 2)}`, { gain: .5, rate: .96 + Math.random() * .08, x: ballX() });
          roll = rollLoop = audio.available && audio.enabled ? createRoller(audio.ctx, audio.bus.table) : roll;
          if (Math.random() < .4) say('good-luck', { prio: 1 });
        }
        const st = at(p, t); phi = st.phi; S.wheel.setRotor(phi); S.wheel.setBall(st.theta, st.r, st.y);
        S.wheel.setTrail(st.theta, st.r, st.y, st.phase < 2 && hurry === 1 ? st.speed : 0, p.dir);
        while (ev < evs.length && evs[ev].t <= t) {
          const e = evs[ev++], pw = e.power ?? .5;
          if (hurry > 3 && e.type === 'fret') continue;
          if (e.type === 'deflector') { click(.35 + .75 * pw, .74); if (pw > .6 && hurry < 3) feel.tap('knock'); }
          else if (e.type === 'land') click(.5 + .4 * pw, .9);
          else if (e.type === 'fret') click(.18 + .62 * pw, 1.04 + Math.random() * .16);
          else if (e.type === 'bounce') click(.12 + .3 * pw, 1.1);
          else if (e.type === 'settle') { click(.3, .86); feel.tap('chip'); }   // (in your hand, on a phone: the ball drops into its pocket)
        }
        // the roll: a smooth whirr that follows the ball, falling in pitch as it slows (made live, see roller.mjs)
        const v = st.speed;
        roll.update({ speed: v, theta: st.theta, phase: st.phase, level: hurry > 1 ? .6 : 1, near: camAz(), pan: Math.max(-.7, Math.min(.7, ballX() / 70)) });
        if (!warned && t >= p.callAt - (f ? 2.6 : 3.5)) { warned = true; say('last-bets', { prio: 1, fresh: 400 }); }   // "Last bets, please": a few seconds' warning
        if (!called && t >= p.callAt) {   // as it is about to make its last two rounds
          called = true; hush(true); S.mood(true); say('no-more-bets', { prio: 2 }); onCall();   // the room and the music stay down until the number is called: the rattle is heard
          if (!lit()) { glided = true; cameraTo(hurry === 1 ? 'wheel' : 'push', hurry === 1 ? 1500 : 700); }
        }
        // at a Lightning table the camera holds on the layout while the lightning strikes, and goes to the wheel for the last round
        if (called && !glided && t >= p.dropAt - (f ? 1.5 : 2)) { glided = true; cameraTo(hurry === 1 ? 'wheel' : 'push', hurry === 1 ? 1300 : 700); }
        if (!pushed && p.dropAt && t >= p.dropAt) { pushed = true; wheelOnly(true); if (hurry === 1 && S.current !== S.shots.push) cameraTo('push', 1100); }
        if (t >= dur) { S.tickers.delete(tick); S.wheel.setTrail(0, 0, 0, 0); roll.stop(.2); done(); }
      };
      tick.still = true; spinTick = tick; S.tickers.add(tick); S.requestRender();   // (the wheelhead and the ball cast no shadow: see wheel3d.mjs)
    });
  }
  // The last moments again, slowly: from a camera placed for the screen beside the pocket (replay.mjs), or, `chase`, from
  // one riding 12 cm behind the ball and 6 cm above it, looking along its path (eased, so a bounce doesn't shake it). The
  // clicks play again, slower and softer, and the ring light is turned down.
  async function replay(p, n, { chase = false } = {}) {
    const wc = S.wheel.group.position, THREE = S.THREE, V = a => wc.clone().add(new THREE.Vector3(...a));
    const shot = replayShot(p, (pos, look, pts, mx, my) => S.fit(V(pos), V(look), pts.map(V), mx, my)?.fov ?? null), { t0, t1 } = shot, eye = V(shot.pos);
    const poseAt = (pos, look, fov) => ({ pos, quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, look, new THREE.Vector3(0, 1, 0))), fov, name: 'replay' });
    const ballAt = t => { const st = at(p, Math.min(t, p.settledAt + 2.9)); S.wheel.setBall(st.theta, st.r, st.y); return S.wheel.ball.position.clone().add(wc); };
    const ride = { dir: null, pos: null }, rider = t => {
      const b = ballAt(t), d = b.clone().sub(ballAt(t - .12)).setY(0); ballAt(t);
      if (d.length() > .3) { d.normalize(); ride.dir = ride.dir ? ride.dir.lerp(d, .12).normalize() : d; }
      const dir = ride.dir ?? new THREE.Vector3(1, 0, 0), want = b.clone().addScaledVector(dir, -12).add(new THREE.Vector3(0, 6, 0));
      ride.pos = ride.pos ? ride.pos.lerp(want, .18) : want;
      return poseAt(ride.pos.clone(), b.clone().addScaledVector(dir, 5).add(new THREE.Vector3(0, -1.5, 0)), 52);
    };
    const tag = $('.r-replay'); ui.shown(tag); hideBubble(); setIdle(false); wheelOnly(true); S.wheel.glow.set(S.wheel.glow.base, .5);
    await fadeCut(() => { const st = at(p, t0); S.wheel.setRotor(st.phi); S.setPose(chase ? rider(t0) : poseAt(eye, V(shot.look), shot.fov)); });
    await new Promise(done => {
      let t = t0, last = performance.now(), ev = p.events.findIndex(e => e.t >= t0); if (ev < 0) ev = p.events.length;
      const tick = now => {
        const dt = Math.min(turbo ? .5 : .05, (now - last) / 1000) * (skipLevel > 1 ? 6 : chase ? .3 : .34); last = now; t += dt;
        const st = at(p, Math.min(t, p.settledAt + 2.9)); S.wheel.setRotor(st.phi); S.wheel.setBall(st.theta, st.r, st.y);
        if (chase) S.setPose(rider(t));
        while (ev < p.events.length && p.events[ev].t <= t) { const e = p.events[ev++], pw = e.power ?? .5; if (skipLevel < 2 && e.type !== 'launch' && e.type !== 'drop') click(.15 + .45 * pw, .6); }
        if (t >= t1) { S.tickers.delete(tick); done(); }
      };
      tick.still = true; S.tickers.add(tick); S.requestRender();
    });
    // back to now: the wheelhead where it would be by now
    phi = at(p, p.settledAt + 2.9).phi; ui.leave(tag, { y: -6, ms: 200 });
    await fadeCut(() => { S.setPose(S.shots.push); setIdle(true); wheelOnly(false); S.wheel.glow.set(S.wheel.glow.base); }); showBubble(n); await sleep(700);   // in the black: no jump of the wheelhead seen
  }
  async function fadeCut(fn) { fadeEl.classList.add('on'); await sleep(reduced() ? 120 : 220); fn(); await sleep(40); fadeEl.classList.remove('on'); await sleep(200); }
  function cameraTo(name, ms, easing) {
    const to = S.shots[name]; if (!to) return Promise.resolve();
    if (reduced()) return fadeCut(() => S.setPose(to));
    return S.move(to, ms, easing);
  }

  // ---- the number beside the ball -----------------------------------------------------------------------------------------------
  function showBubble(n) {
    const c = colorOf(n); bubble.className = `r-bubble ${c}`; bubble.querySelector('b').textContent = n; bubble.querySelector('small').textContent = c === 'green' ? 'Zero' : `${c === 'red' ? 'Red' : 'Black'} · ${n % 2 ? 'Odd' : 'Even'} · ${n <= 18 ? '1–18' : '19–36'}`;
    ui.shown(bubble); bubble.dataset.on = '1'; placeBubble(true); ui.pop(bubble, { from: .4 });
  }
  function hideBubble() { ui.leave(bubble, { scale: .85, ms: 160 }); delete bubble.dataset.on; }
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
    return motion.tween(ms, t => d.position.set(a.x, y + (1 - t) * 10, a.z), ease.land).then(() => {
      audio.cue(`dolly-${pick('dolly', 2)}`, { gain: .55, rate: .96 + Math.random() * .08, x: panX(a) }); if (tall) audio.play('stack', { gain: .3, x: panX(a) });
    });
  }
  function liftDolly() { const d = S.dolly; if (!d.visible) return; const y0 = d.position.y; motion.tween(220, t => { d.position.y = y0 + t * 10; }).then(() => { d.visible = false; S.requestRender(); }); }
  async function payout(r, n) {
    stageAt = 'dolly'; await placeDolly(n); stageAt = 'lose';
    // the number lights from under the cloth, its edge brightest so the numeral keeps its ink, and the outside boxes it
    // wins with more softly (as an LED-lit layout does): one fade up, no pulse to keep the picture redrawing
    S.highlight([n, ...[...SPOTS].filter(([, sp]) => OUT_ORDER.includes(sp.kind) && sp.nums.includes(n)).map(([id]) => [id, .25])], { level: .6, color: '#ffe4a6', fade: reduced() ? 0 : 240 });
    const float = S.layout.tray ? S.layout.tray.clone() : S.anchor('n0').clone().add(V(-22, 0, 0)), kindOf = k => SPOTS.get(k.split('|')[1]).kind;   // the croupier's float
    const stakeOf = k => { const [owner, id] = k.split('|'); return stacks.get(k).reduce((a, m) => a + (typeof m.userData.v === 'number' ? m.userData.v : 0), 0) || (RIVALS.find(x => x.name === owner)?.bets ?? []).filter(([b]) => b === id).reduce((a, [, v]) => a + v, 0); };
    // la partage: on zero each even-money stake is halved where it lies
    const halves = n === 0 ? [...stacks.keys()].filter(k => kindOf(k) === 'even') : [];
    // the losing bets first, outside before inside: drawn across the cloth to the croupier's corner, then into the float
    const lose = [...stacks.keys()].filter(k => !halves.includes(k) && !SPOTS.get(k.split('|')[1]).nums.includes(n)).sort((a, b) => OUT_ORDER.includes(kindOf(b)) - OUT_ORDER.includes(kindOf(a)));
    if (lose.length) { audio.play('collect', { x: panX(gatherAt()) }); await gather(lose, float); }
    stageAt = 'wins';
    // your straight up has come in: the camera goes down low over the cloth to watch the croupier cut your winnings (the
    // stacks of twenty pushed out, then the cuts of five), and back to your seat once they are down
    const big = r.wins.find(w => w.kind === 'straight'), low = big && !reduced() && !skipLevel && !fast() ? lowShot(S.anchor(big.id)) : null;
    if (low) await S.move(low, 900);
    // then the winners: outside first, then inside toward the wheel, straights last, each payout a moment after the last
    const wins = [...stacks.keys()].filter(k => !halves.includes(k)).sort((a, b) => rank(kindOf(a)) - rank(kindOf(b)));
    function rank(kd) { return OUT_ORDER.includes(kd) ? 0 : kd === 'straight' ? 2 : 1; }
    const taken = [], jobs = [];
    wins.forEach((k, i) => {
      const [owner, id] = k.split('|'), pay = stakeOf(k) * SPOTS.get(id).pays;
      jobs.push(sleep(i * 180).then(() => payStack(owner, id, payChips(owner, pay), float, taken, i)).then(() => { if (owner !== 'you') tag(owner, `+${fmt(pay)}`, S.anchor(id, slotOf(owner))); }));
    });
    halves.forEach((k, i) => jobs.push(sleep((wins.length + i) * 180 + 120).then(() => halve(k, stakeOf(k), float))));
    await Promise.all(jobs);
    // the winnings down beside their stakes: your balance and this visit catch up, and the result banner says it
    while (motion.live.size) await sleep(40);
    if (low) { await sleep(skipLevel ? 0 : 500); await S.move(S.shots.seat, skipLevel ? 300 : 800); }
    paid(r);
    stageAt = 'banner'; if (!r.void) showWin(r, n); else hint('Your bets were void: your balance changed in another window.');
    if (r.net > 0) { if (bigWin(r)) { feel.tap('big'); feel.confetti({ size: r.back >= r.staked * 20 ? 2 : 1, from: { x: .5, y: .3 } }); } else feel.tap('win'); }
    if (r.net > 0) { sting(r.straight ? 'big' : 'small', .8); if (r.back >= r.staked * 20) { audio.cue(`crowd-cheer-${1 + Math.floor(Math.random() * 2)}`, { gain: .45 }); setTimeout(() => say('congrats', { prio: 1 }), 900); } }
    await sleep(skipLevel ? 250 : fast() ? 900 : 1600);
    // everything on the layout goes home, each player's chips back to their own place (yours toward you), and the dolly
    // comes up with them: the payout is done, and the table opens for bets
    const keys = [...stacks.keys()]; if (keys.length) audio.play('collect', { x: panX(seatAt('you')) });
    stageAt = 'home'; liftDolly(); S.wheel.mark(null);
    // the round is over at a Lightning table: the struck numbers' charge dies away, on the cloth, the wheel and the board
    if (bolts.struck.length) { bolts.clear(); S.wheel.strike(null); S.setBoard(history, []); }
    await Promise.all(keys.map((k, i) => sleep(i * 25).then(() => dropStack(k, { to: seatAt(k.split('|')[0]), ms: 420 }))));
    for (const r2 of RIVALS) r2.bets = [];
    lastLit = n; restGlow();
  }
  // low over the cloth from your side: on the payout at the players' edge (payAt), the winning bet and the dolly behind it
  function lowShot(a) {
    const L = S.layout, look = V(a.x, 2, L.zNear + 3), c = S.shots.seat.pos, d = V(c.x - look.x, 0, c.z - look.z).normalize();
    const pos = look.clone().addScaledVector(d, 30).setY(19), m = new S.THREE.Matrix4().lookAt(pos, look.clone().add(V(0, 0, -(L.zNear + 3 - a.z) * .3)), V(0, 1, 0));
    return { pos, quat: new S.THREE.Quaternion().setFromRotationMatrix(m), fov: 46, name: 'low' };
  }
  // the croupier's corner of the cloth, by the wheel and the float: where losing chips are drawn together
  function gatherAt() { const L = S.layout, R = L.rect, t = L.tray ?? S.anchor('n0'); return V(Math.max(R.x0 + 8, Math.min(R.x1 - 8, t.x)), 0, Math.max(R.z0 + 8, Math.min(R.z1 - 8, t.z))); }
  // The losing bets come off: the croupier rakes them in toward his side of the layout, then lifts the piles into the
  // float. With reduced motion (or hurried) each stack is drawn straight into a loose heap at the corner instead (lifted
  // over any column in its way, flat where the way is clear), and the heap into the float in one move.
  async function gather(keys, float) {
    const lists = keys.map(k => { const list = stacks.get(k); if (!list) return null; stacks.delete(k); unseat(list); return list; }).filter(Boolean);
    let piles = lists;
    if (!reduced() && !skipLevel) await rake(lists);
    else {
      const g = gatherAt(); piles = [];
      await Promise.all(lists.map((list, i) => sleep(i * 70).then(async () => {
        const j = i % 16, spot = g.clone().add(V((j % 4 - 1.5) * 4.2 + (Math.random() - .5) * .8, 0, (Math.floor(j / 4) - 1.5) * 4.2 + (Math.random() - .5) * .8));
        await moveStack(list, spot, { ms: 320, ground: Math.floor(i / 16) * 2 }); piles.push(list);
      })));
    }
    await Promise.all(piles.map((list, j) => sleep(j * 18).then(() => moveStack(list, float.clone().add(V((j % 4 - 1.5) * 3, 0, (Math.floor(j / 4) % 3 - 1) * 3)), { ms: 280 }))));
    for (const m of piles.flat()) S.chips.drop(m);
  }
  // The rake: the layout in strips a rake's head wide, the far end of the table first. For each, the head is lifted over
  // the cloth and set down just behind the strip's nearest stack, then drawn toward the croupier past the layout's far line:
  // each stack slides flat ahead of the head once it reaches it, and pushes on any stack in front of it (every player's
  // chips on one spot are one column and move as one). A tap hurries the rest straight to the line.
  async function rake(lists) {
    if (!lists.length) return;
    const L = S.layout, R = S.rake, line = L.zFar - 2.4, reach = L.zFar - 70, gap = 2 * CHIP_R + .05;
    for (const list of lists) for (const m of list) S.chips.free(m);
    const spots = new Map(); for (const list of lists) { const id = list[0].userData.id; if (!spots.has(id)) spots.set(id, { x: list[0].position.x, z: list[0].position.z, lists: [] }); spots.get(id).lists.push(list); }
    const strips = new Map(), w = RAKE_W - 4, x0 = L.X(-1);
    for (const c of spots.values()) { const b = Math.floor((c.x - x0) / w); if (!strips.has(b)) strips.set(b, []); strips.get(b).push(c); }
    const put = (c, z) => { const dz = z - c.z; c.z = z; for (const list of c.lists) for (const m of list) m.position.z += dz; };
    R.position.set((x0 + L.xEnd) / 2, 6, reach); R.rotation.set(0, 0, 0); R.visible = true;
    for (const [, cs] of [...strips].sort((a, b) => b[0] - a[0])) {
      if (skipLevel) { for (const c of cs) if (c.z > line - CHIP_R) put(c, line - CHIP_R - .6); continue; }
      const xs = cs.map(c => c.x), cx = (Math.min(...xs) + Math.max(...xs)) / 2, z0 = Math.max(...cs.map(c => c.z)) + CHIP_R + .8;
      const from = R.position.clone(), to = V(cx, 0, z0), over = Math.max(4, ...cs.map(c => c.lists.reduce((a, l) => a + l.length, 0) * H + 1.5));
      await motion.tween(200, t => { const e = ease.inOut(t); R.position.lerpVectors(from, to, e); R.position.y = (1 - e) * from.y + over * Math.sin(Math.PI * Math.min(1, t * 1.15)); });
      R.position.copy(to); audio.play('chip', { gain: .25, x: panX(to) });
      const order = cs.sort((a, b) => b.z - a.z), starts = order.map(c => c.z), d = z0 - line, ms = 220 + d * 4;
      // the stroke heard: wood and chips over the cloth, louder for more stacks, quicker for a short stroke
      audio.cue(`rake-${pick('rake', 3)}`, { gain: Math.min(.5, .26 + .02 * cs.reduce((a, c) => a + c.lists.length, 0)), rate: Math.max(.9, Math.min(1.25, .5 / (ms / 1000 + .08))), x: panX(to) });
      await motion.tween(ms, t => {
        const zh = z0 - d * ease.inOut(t), face = zh - .55, done = []; R.position.z = zh;
        order.forEach((c, i) => {
          let z = Math.min(starts[i], face - CHIP_R);
          for (const q of done) { const dx = Math.abs(q.x - c.x); if (dx < gap) z = Math.min(z, q.z - Math.sqrt(gap * gap - dx * dx)); }
          put(c, z); done.push(c);
        });
      });
      audio.play('stack', { gain: .3, x: panX(R.position) });
      const up = R.position.clone(); await motion.tween(70, t => { R.position.y = up.y + t * 3; });
    }
    const from = R.position.clone(); await motion.tween(260, t => { R.position.lerpVectors(from, V(from.x, 6, reach), ease.inOut(t)); });
    R.visible = false; S.requestRender();
  }
  // A payout in chips. Yours in the salon's values, largest at the bottom. Another player's in their colour, as many of
  // their chips as it is worth, cut the way a croupier cuts them: stacks of twenty, then fives (four full stacks at most
  // are drawn). Columns, bottom first.
  function payChips(owner, amount) {
    const out = [];
    if (owner === 'you') { const v = breakDown(amount); for (let i = 0; i < v.length && out.length < 3; i += 20) out.push(v.slice(i, i + 20)); return out; }
    const r = RIVALS.find(x => x.name === owner); let left = Math.round(amount / r.unit);
    while (left >= 20 && out.length < 4) { out.push(Array(20).fill(r.color)); left -= 20; }
    while (left > 0 && out.length < 8) { const c = Math.min(5, left); out.push(Array(c).fill(r.color)); left -= c; }
    return out;
  }
  // The payout cut at the float and pushed out as one: lifted, carried low over the cloth (clearing the columns on its
  // way) and set down at the players' edge in line with the bet, the click as it lands; its columns side by side.
  async function payStack(owner, id, chipsCols, float, taken, j) {
    const pk = `${owner}|${id}|pay`, list = []; list.cols = []; stacks.set(pk, list);
    const from = float.clone().add(V((j % 3 - 1) * 4.2, 0, (Math.floor(j / 3) % 2) * 4.2));   // each from its own working stack in the float
    await Promise.all(chipsCols.map((vals, c) => {
      const col = vals.map((v, i) => { const m = S.chipMesh(v); m.userData = { owner, id, v }; list.push(m); m.position.set(from.x + c * (2 * CHIP_R + .3), H * (i + .5), from.z); return m; });
      list.cols.push(col); return moveStack(col, payAt(id, taken), { ms: 520, lift: 1.5 });
    }));
    audio.play('payout', { x: panX(list[0].position) });
    for (const m of list) S.chips.rest(m);
  }
  // La partage, done where the stake lies: the croupier takes the top half of the stack to the float. A stake that won't
  // halve in whole chips is exchanged: taken in, and its half pushed back as one stack.
  async function halve(k, stake, float) {
    const [owner, id] = k.split('|'), list = stacks.get(k), a = S.anchor(id, slotOf(owner)); if (!list) return;
    if (list.length % 2 === 0 && list.every(m => m.userData.v === list[0].userData.v)) {
      const top = list.splice(list.length / 2); unseat(top); settleCol(id);
      await moveStack(top, float, { ms: 360 }); for (const m of top) S.chips.drop(m);
    } else {
      stacks.delete(k); unseat(list); settleCol(id); await moveStack(list, float, { ms: 360 }); for (const m of list) S.chips.drop(m);
      const back = owner === 'you' ? breakDown(stake / 2) : Array(Math.max(1, Math.floor(list.length / 2))).fill(RIVALS.find(x => x.name === owner).color);
      const nl = back.map((v, i) => { const m = S.chipMesh(v); m.userData = { owner, id, v }; m.position.set(float.x, H * (i + .5), float.z); return m; }); stacks.set(k, nl);
      const ground = (cols.get(id)?.length ?? 0) * H; nl.forEach(seat);
      await moveStack(nl, a, { ms: 480, lift: 1.5, ground }); audio.play('payout', { x: panX(a) }); for (const m of nl) S.chips.rest(m);
    }
    tag(owner === 'you' ? 'La partage' : owner, `${fmt(stake / 2)} back`, a);
  }
  // Where a win is paid: pushed to the players' edge of the cloth (+z, the long side) in line with its bet, as dealers at
  // North American tables push it to the player. Set beside the bet it sat on the next line or box and read as a bet of
  // its own (a straight up's on the split line), and a column's ran off the layout. Each payout takes the nearest free
  // place along the edge, a chip and a little apart from the others; a row further out when the edge is full.
  function payAt(id, taken) {
    const L = S.layout, a = S.anchor(id), gap = 2 * CHIP_R + .4, x0 = L.X(-1) + CHIP_R, x1 = L.xEnd - CHIP_R;
    for (let row = 0; row < 3; row++) for (const reach of [gap, x1 - x0]) {   // along the first row (near its bet if it can) before a row further out
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
    winEl.querySelector('b').textContent = net > 0 ? (r.x ? `Lightning ${r.x}×` : bigWin(r) ? 'Big win' : 'You win') : !r.back ? 'No win' : !net ? 'Stakes back' : r.partage === r.back ? 'La partage' : 'Some bets won';
    winEl.querySelector('.r-gross').textContent = r.back ? `Staked ${fmt(r.staked)} · paid back ${fmt(r.back)}${r.partage && r.partage < r.back ? `, ${fmt(r.partage)} of it by la partage` : ''}` : '';
    const em = winEl.querySelector('em'), final = net ? signed(net) : 'Even'; em.textContent = net ? (net > 0 ? '+0' : '−0') : final;
    winEl.hidden = false; void winEl.offsetWidth; winEl.classList.add('show');   // a reflow, then the transition
    if (net) setTimeout(() => ui.morph(em, final), 380);   // the amount rolls up to the result, once the pill has come in
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
    S.setBoard(history);   // and the board by the wheel
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
      const n = +e.dataset.n, bet = () => { placeOn(neighbours(n, nbK).map(k => [`n${k}`, 1]), { name: `${n} and ${nbK} neighbours`, call: true }); nums(neighbours(n, nbK)); };
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
      const k = e.dataset.call, bet = () => { placeOn(CALLS[k].chips, { name: CALLS[k].name, call: true }); nums(callNumbers(k)); };
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
    ui.leave(other, { ms: 150 }); if (which === 'race') buildRace(); else buildStats();
    ui.shown(el); sheetOpen = which; uiSound('open'); ui.enter([el], { y: 16 });
    $('#rRace').setAttribute('aria-expanded', which === 'race'); $('#rStats').setAttribute('aria-expanded', which === 'stats');
    if (focus) (el.querySelector('.rt-num[tabindex="0"]') ?? el.querySelector('.st-n') ?? el.querySelector('.r-close'))?.focus();   // onto the track (or the numbers), not the header
  }
  function closeSheets() {
    if (!sheetOpen) return; const back = raceSheet.contains(document.activeElement) ? $('#rRace') : statsSheet.contains(document.activeElement) ? $('#rStats') : null;
    for (const s of [raceSheet, statsSheet]) ui.leave(s, { y: 12, ms: 300 }); sheetOpen = null;   // (down and out, a little quicker than it came) uiSound('close'); restGlow(); $('#rRace').setAttribute('aria-expanded', false); $('#rStats').setAttribute('aria-expanded', false);
    back?.focus();
  }
  $('#rRace').onclick = e => openSheet('race', { focus: e.detail === 0 }); $('#rStats').onclick = e => openSheet('stats', { focus: e.detail === 0 });   // (a click from the keyboard has no pointer count)

  // ---- the controls and the hint -----------------------------------------------------------------------------------------------------
  function refresh() {
    const betting = mode === 'betting', live = open(), total = table.total, bal = held ?? wallet.balance, out = broke();
    const down = live ? total : table.staked ?? 0;   // in play: the layout, then the stake once bets close
    $('#rUndo').disabled = !betting || !table.history.length; $('#rClear').disabled = !betting || !total;
    rebetSlot($('#rRebet'), $('#rX2'), !!down);
    $('#rRebet').disabled = !betting || !table.canRebet; $('#rX2').disabled = !live || !total || total * 2 > bal;
    $('#rSpin').disabled = !betting || (!total && !table.canRebet && !out) || total > bal;
    goLabel($('#rSpin'), 'Spin', { out, rebet: betting && !total && table.canRebet });   // (once the ball goes the layout is empty: its bets closed)
    rack.fit(bal - (live ? total : 0));
    for (const b of dock.querySelectorAll('.r-tool')) b.disabled = !live;
    if (!stage.hidden) ctx.showInPlay(down);
    if (betting && active) {
      if (out) hint(`You are out of chips. Tap Reset for a fresh ${fmt(wallet.START)}.`);
      else if (!total) hint(table.canRebet ? `Place your bets, or rebet ${fmt(table.lastTotal)}.` : 'Choose a chip, then tap the layout.');
      else hint(`Bet ${fmt(total)}. Spin when ready.`);
    } else if (mode === 'running') hint('Bets are open until “No more bets”.');
    else if (mode === 'spinning') hint(running ? 'Tap to hurry the ball.' : '');   // (not over a ball at rest)
    else if (mode === 'paying') hint('');
  }

  // ---- framing -------------------------------------------------------------------------------------------------------------------
  let framed = '';
  function reframe() {
    if (!active && !S.showcase.on) return;
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    const bar = ctx.barCover(stage), strip = histEl.offsetHeight ? histEl.offsetHeight + 10 : 0, top = bar + strip;
    const under = ctx.dockCover(stage);   // a dock along the foot of the picture: the canvas runs on under it, blurred
    stage.style.setProperty('--top-h', `${bar}px`); stage.style.setProperty('--under', `${under}px`);
    const k = `${w}x${h}x${top}x${under}`;
    if (k === framed) return; framed = k; const was = S.layout?.orient; S.frame(w, h + under, top, under ? under + ctx.BLUR_RISE : 0);   // (framed clear of the blur's rise, so no spot is softened)
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
    if (mode !== 'betting' && (go || mode !== 'running')) { if (go) { e.preventDefault(); skip(); return true; } return false; }   // held, it keeps hurrying the ball (while bets are open the other keys still bet)
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
      ctx.title(TABLES[kind].title, 'Roulette'); ctx.showBalance(wallet.balance, false);
      // chips spent at another table since you left: the layout can't stay bigger than your balance
      if (mode === 'betting' && table.total > wallet.balance) { table.clear(); serial(syncYours); hint('Your bets were cleared: your balance changed at another table.'); }
      ctx.showInPlay(table.total); markRivals(); refresh();
    },
    hide() { stage.hidden = dock.hidden = true; setIdle(false); S.pause(true); active = false; closeSheets(); hover(null); for (const j of rivalJobs) j.hurry(); rivalJobs = []; },
    showcase: { start(still) { S.showcase.start(still); framed = ''; reframe(); S.requestRender(); }, stop: ms => S.showcase.stop(ms) },
    // you sit down: the camera flies into your chair
    async enter(ms, { tableMode } = {}) { if (tableMode) await setKind(tableMode); active = true; framed = ''; reframe(); await S.showcase.stop(ms); if (!S.current) S.setPose(S.shots.seat); refresh(); if (welcome) { hint(welcome); welcome = null; } if (mode === 'betting') { say('place-bets', { prio: 2, fresh: 3000 }); othersWake(); } },
    leave() { active = false; for (const j of rivalJobs) j.hurry(); rivalJobs = []; },
    toLobby() { api.leave(); api.showcase.start(settings.reduced); },   // the lobby opens over the wheel: it turns slowly behind the menu
    round: 'spin',
    get kind() { return kind; }, setKind, preview: k => setKind(k),   // European, Lightning or Mega Lightning (TABLES)
    players: () => rivalsHere().map(r => r.name),
    setPlayers: () => markRivals(),   // (the others join at the next round; their markers show at once)
    callBets: () => say('place-bets', { prio: 3 }),   // hear the voice level you set
    setReduced(on) { motion.reduced = on; setIdle(idleWant); },   // the drift stops or resumes only where it belongs (never mid-spin)
    setFast(on) { motion.slow = on ? .62 : 1; },
    setQuality(q) { S.setQuality(q); setIdle(idleWant); },   // the battery saver stands the wheel still
    refresh, reframe: () => { framed = ''; reframe(); },
    // for the browser checks, only in a testing session (?test or salonnoir.dev): rig() fixes the next number
    test: ctx.dev ? { plan, at, get history() { return history; }, place: (id, units = 1) => placeOn([[id, units]]), rig: n => { rigged = n; }, rigStrikes: s => { riggedStrikes = s; }, bolts, set turbo(v) { turbo = v; }, stacks, get skipLevel() { return skipLevel; }, get stageAt() { return stageAt; }, motion, showWin, showBubble } : undefined,
  };
  return api;
}

// ---- the racetrack's shape ---------------------------------------------------------------------------------------------------------
// The wheel's numbers in a loop round a rounded rectangle (a stadium when there is room), zero at one end, and the four
// sections inside. It is laid out in screen pixels for the box it gets, so every number keeps a finger-sized place (at
// least 32 px a number on a phone): on a phone held upright the loop stands on end. Each section is bounded by its own
// numbers: a divider runs from the gap after the last number of one section across to the same gap on the other side,
// as on the felt, and no section reaches into the ring of numbers.
const TRACK_ZONES = [['zero', 'Zero'], ['voisins', 'Voisins'], ['orphelins', 'Orphelins'], ['tiers', 'Tiers']];
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
