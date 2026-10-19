// The roulette table: your chips on the layout, the spin, the payout. It shares the salon's top bar,
// wallet, sound and settings with blackjack (passed in as `ctx`) and brings its own stage and dock.
//
// A round, as the research laid it out (Evolution / Pragmatic rules texts, the dealer procedure in the
// New Jersey and Singapore filings):
//   betting (no timer)  ·  Spin: the camera glides to the wheel as the ball is launched against the
//   wheelhead  ·  "No more bets" while the ball still runs  ·  push-in as it drops  ·  a beat of quiet,
//   the click, the number beside the ball and the croupier's call  ·  a slow-motion replay for a straight
//   up win  ·  back to the layout: the dolly on the number, losing chips swept, winners paid, outside
//   bets first and straights last  ·  "Place your bets".
import { createRouletteScene, preloadRouletteArt } from './rscene.mjs';
import { RouletteTable, CHIP_VALUES, SPOTS, describe, draw, colorOf, WHEEL, CALLS, callNumbers, neighbours, SECTIONS, stats, KINDS, LIMITS, PITCH, WHEEL_INDEX } from './rules.mjs';
import { plan, at, GEO } from './physics.mjs';
import { createRoller } from './roller.mjs';
import { Motion, ease } from '../scene/pieces.mjs';
import { chipFaceTexture, CHIP_H } from '../scene/textures.mjs';

const RIVALS = [
  { name: 'Olu', color: '#2f78c9', style: 'straights' },
  { name: 'Marta', color: '#b8402c', style: 'outside' },
  { name: 'Kenji', color: '#2f9464', style: 'sections' },
  { name: 'Inès', color: '#9b6fd6', style: 'dozens' },
];
const OUT_ORDER = ['column', 'dozen', 'even'];   // paid first, then inside bets toward the wheel, straights last
const H = CHIP_H * .92;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function createRoulette(ctx) {
  const { app, audio, settings, store, ui, kit, wallet, uiSound, sting, fmt, signed } = ctx;
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
      <div class="r-win" role="status" hidden><small></small><b></b><em></em></div>
      <div class="r-tags"></div>
      <div class="r-sheet" id="rRaceSheet" hidden aria-label="Racetrack"></div>
      <div class="r-sheet" id="rStatsSheet" hidden aria-label="Statistics"></div>
    </div>
    <p class="hint r-hint" aria-live="polite"></p>
    <div class="r-fade" aria-hidden="true"></div>`;
  const dock = document.createElement('footer'); dock.className = 'dock rdock';
  dock.innerHTML = `<div class="r-tools">
      <button class="pill r-tool" id="rRace" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="5"/><rect x="7.5" y="10.5" width="9" height="3" rx="1.5"/></svg><span class="label">Racetrack</span></button>
      <button class="pill r-tool" id="rStats" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11M10 19V5M15 19v-6M20 19V8"/></svg><span class="label">Statistics</span></button>
    </div>
    <div class="chips" id="rChips" role="radiogroup" aria-label="Chip value"></div>
    <div class="bet-actions">
      <button class="pill" id="rUndo" aria-keyshortcuts="U"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg><span class="label">Undo</span></button>
      <button class="pill" id="rClear" aria-keyshortcuts="C"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg><span class="label">Clear</span></button>
      <button class="pill" id="rRebet" aria-keyshortcuts="R"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg><span class="label">Rebet</span></button>
      <button class="pill" id="rX2" aria-keyshortcuts="X"><span class="glyph">×2</span><span class="label">Double</span></button>
      <button class="pill gold deal" id="rSpin" aria-keyshortcuts="Space"><span class="label">Spin</span></button>
    </div>`;
  app.append(stage, dock);
  const $ = s => stage.querySelector(s) ?? dock.querySelector(s);
  const canvas = $('.rcanvas'), hintEl = $('.r-hint'), loupe = $('.r-loupe'), bubble = $('.r-bubble'), winEl = $('.r-win'), histEl = $('.r-history'), fadeEl = $('.r-fade'), tagsEl = $('.r-tags');

  const S = createRouletteScene(canvas, { quality: ctx.quality() }), motion = new Motion(S);
  const bank = { get: () => wallet.balance, set: v => { wallet.set(v); ctx.showBalance(); } };
  const table = new RouletteTable({ bank });
  let history = store.get('rouletteHistory', []).filter(n => Number.isInteger(n) && n >= 0 && n <= 36).slice(0, 500);
  let mode = 'betting', dir = store.get('rouletteDir', 1), phi = Math.random() * Math.PI * 2, rotorW = 1, restIdx = null, hurry = 1, active = false;
  const reduced = () => settings.reduced, fast = () => settings.fast;
  Object.assign(motion, { reduced: reduced(), slow: fast() ? .62 : 1 });

  // ---- sound --------------------------------------------------------------------------------------------------------------
  let clickTurn = 0; const click = (gain, rate = 1) => audio.cue(`ball-click-${(clickTurn++ % 6) + 1}`, { gain, rate: rate * (.96 + Math.random() * .08) });
  const say = (line, opts) => audio.say(`voice/james-${line}`, opts);
  audio.preload([...[1, 2, 3, 4, 5, 6].map(i => `ball-click-${i}`), 'voice/james-place-bets', 'voice/james-no-more-bets', 'voice/james-congrats', 'music-roulette']);

  // ---- chips in hand ----------------------------------------------------------------------------------------------------------
  let chipValue = store.get('chip', 5); if (!CHIP_VALUES.includes(chipValue)) chipValue = 5;
  const chipRow = $('#rChips');
  for (const v of CHIP_VALUES) {
    const b = document.createElement('button'); b.className = 'chip'; b.dataset.value = v; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', `${v} chip`);
    const img = document.createElement('img'); img.alt = ''; img.src = chipFaceTexture(v).image.toDataURL('image/png'); img.width = img.height = 128; b.append(img);
    b.addEventListener('click', () => selectChip(v)); chipRow.append(b);
  }
  function selectChip(v) { if (v !== chipValue) uiSound('thock'); chipValue = v; store.set('chip', v); let sel; for (const b of chipRow.children) { const on = +b.dataset.value === v; b.setAttribute('aria-checked', on); b.classList.toggle('selected', on); if (on) sel = b; } ui.lift([...chipRow.children], sel); }
  selectChip(chipValue);

  // ---- stacks of chips on the layout ------------------------------------------------------------------------------------------
  const stacks = new Map();   // "owner|spot" → meshes, bottom first
  const slotOf = owner => owner === 'you' ? 0 : 1 + RIVALS.findIndex(r => r.name === owner);
  const key = (owner, id) => `${owner}|${id}`;
  const approach = a => S.layout.orient === 'port' ? [S.layout.rect.x1 + 22 - a.x, 22, 0] : [0, 22, S.layout.rect.z1 + 22 - a.z];   // chips come over the armrest on your side
  async function addChip(owner, id, v, { ms = 300 } = {}) {
    const k = key(owner, id), list = stacks.get(k) ?? []; stacks.set(k, list);
    const a = S.anchor(id, slotOf(owner)), m = S.chipMesh(v), y = H * (list.length + .5), [dx, dy, dz] = approach(a);
    m.userData = { owner, id, v }; list.push(m);
    const from = a.clone().add(S.THREE ? new S.THREE.Vector3(dx, dy, dz) : null), to = a.clone().setY(y);
    m.position.copy(from); m.rotation.y = Math.random() * 6;
    await motion.tween(ms, t => { m.position.lerpVectors(from, to, t); m.position.y = to.y + (1 - t) * dy * (1 - t) + Math.sin(t * Math.PI) * 3; }, ease.land);
    audio.play(list.length > 1 ? 'stack' : 'chip', { x: a.x * .3 });
  }
  async function dropStack(k, { to = null, ms = 260 } = {}) {
    const list = stacks.get(k); if (!list) return; stacks.delete(k);
    await Promise.all(list.map((m, i) => { const from = m.position.clone(), end = to ? to.clone().setY(H * (i + .5)) : from.clone().add(new S.THREE.Vector3(0, 6, 0));
      return motion.tween(ms, t => { m.position.lerpVectors(from, end, t); m.traverse(o => { if (o.material) o.material.opacity = 1; }); m.scale.setScalar(.92 * (to ? 1 : 1 - t * .9)); }, ease.inOut).then(() => { S.chipsG.remove(m); }); }));
    S.requestRender();
  }
  // your stacks follow the table after undo, clear or a removed chip
  async function syncYours() {
    const want = new Map([...table.bets].map(([id, vs]) => [id, vs])), jobs = [];
    for (const [k, list] of stacks) { const [owner, id] = k.split('|'); if (owner !== 'you') continue; const w = want.get(id) ?? []; if (list.length > w.length) { const extra = list.splice(w.length); for (const m of extra) jobs.push(motion.tween(160, t => { m.position.y += .6; m.scale.setScalar(.92 * (1 - t)); }).then(() => S.chipsG.remove(m))); if (!list.length) stacks.delete(k); } }
    for (const [id, vs] of want) { const have = stacks.get(key('you', id))?.length ?? 0; for (let i = have; i < vs.length; i++) jobs.push(addChip('you', id, vs[i], { ms: 220 })); }
    await Promise.all(jobs);
  }
  function relayoutStacks() {
    for (const [k, list] of stacks) { const [owner, id] = k.split('|'), a = S.anchor(id, slotOf(owner)); list.forEach((m, i) => m.position.set(a.x, H * (i + .5), a.z)); }
    if (S.dolly.visible && restIdx != null) placeDolly(WHEEL[restIdx], 0);
    S.requestRender();
  }
  S.relayout.add(() => relayoutStacks());

  // ---- pointing at the layout -----------------------------------------------------------------------------------------------
  let hovered = null, press = null, sheetOpen = null;
  const localXY = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function covered(id) { const s = SPOTS.get(id); if (!s) return []; return ['column', 'dozen', 'even'].includes(s.kind) ? [id, ...s.nums] : s.nums; }
  function hover(id, xy) {
    if (id === hovered && !xy) return; hovered = id;
    if (!id) { loupe.hidden = true; if (mode === 'betting') S.highlight([]); return; }
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
  let queue = Promise.resolve(); const serial = fn => (queue = queue.then(fn).catch(err => console.error(err)));
  // units: [[spot, units]]; a call bet is one gesture (one undo)
  function placeOn(units, { quiet = false } = {}) {
    if (mode !== 'betting') return;
    const adds = units.map(([id, u]) => [id, u * chipValue]);
    const why = table.place(adds);
    if (why) { hint(why); kit.shake($('#rChips')); audio.cue('ui-click-2', { bus: 'ui', rate: .7, gain: .6 }); feel.tap('refuse'); return; }
    clearResult(); refresh(); if (!quiet) feel.tap('chip'); if (!quiet) othersWake();
    serial(async () => { for (const [id, v] of adds) await Promise.race([addChip('you', id, v), sleep(70)]); });
  }
  function takeOff(id) { if (mode !== 'betting' || !table.takeFrom(id)) return; refresh(); serial(syncYours); hover(null); }
  const actions = {
    undo() { if (mode !== 'betting' || !table.undo()) return; refresh(); serial(syncYours); },
    clear() { if (mode !== 'betting' || !table.clear()) return; refresh(); serial(syncYours); },
    rebet() { if (mode !== 'betting') return; const why = table.rebet(); if (why) { hint(why); return; } clearResult(); refresh(); serial(syncYours); },
    double() { if (mode !== 'betting') return; const why = table.double(); if (why) { hint(why); return; } refresh(); serial(syncYours); },
    spin() { if (mode !== 'betting') return; feel.tap('press'); if (!table.bets.size && table.canRebet) { if (table.rebet()) return; clearResult(); refresh(); serial(syncYours); } serial(round); },
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
  function clearRivals() { for (const r of RIVALS) { r.bets = []; for (const k of [...stacks.keys()]) if (k.startsWith(r.name + '|')) dropStack(k); } rivalJobs = []; }

  // ---- the wheel at rest: the wheelhead keeps turning slowly, the last ball riding in its pocket -------------------------
  let idleOn = false;
  const idle = now => {
    const dt = Math.min(.05, (now - (idle.last ?? now)) / 1000); idle.last = now;
    rotorW += (Math.sign(rotorW || 1) * .45 - rotorW) * .06 * dt; phi += rotorW * dt; S.wheel.setRotor(phi);
    if (restIdx != null) { const a = phi - restIdx * PITCH; S.wheel.setBall(a, GEO.pocketMid, GEO.pocketY + GEO.ball); }
    if (bubble.dataset.on) placeBubble();
  };
  function setIdle(on) { const run = on && !reduced(); if (run === idleOn) return; idleOn = run; idle.last = null; if (run) S.tickers.add(idle); else S.tickers.delete(idle); S.requestRender(); }

  // ---- the round -------------------------------------------------------------------------------------------------------------
  let skipLevel = 0, rigged = null, turbo = false, stageAt = '', spinTick = null, rollLoop = null;   // turbo: the automated checks run slow browsers   // rigged: a result fixed by the automated checks
  function skip() { if (mode === 'spinning') { hurry = hurry === 1 ? 3.5 : 12; } else if (mode === 'paying') motion.finishAll(); skipLevel++; }
  async function round() {
    if (mode !== 'betting') return;
    if (!table.bets.size) { hint('Place a bet on the layout first.'); return; }
    if (table.total > wallet.balance) { hint('Not enough balance for these bets.'); return; }
    mode = 'closing'; refresh(); hover(null); closeSheets();          // no more chips from here: the rivals finish, then bets close
    await othersReady(); rivalJobs = [];
    if (!table.close()) { mode = 'betting'; clearRivals(); refresh(); return; }
    try { await spinRound(); } catch (err) {
      console.error('roulette round', err); if (spinTick) S.tickers.delete(spinTick); rollLoop?.stop(.1);
      if (table.phase === 'spinning') { table.abandon(); ctx.showBalance(); hint('The spin was void. Your chips are back.'); }
      for (const k of [...stacks.keys()]) await dropStack(k); clearRivals(); await cameraTo('seat', 0).catch(() => {});
      mode = 'betting'; document.body.dataset.rmode = 'bet'; refresh(); setIdle(true);
    }
  }
  async function spinRound() {
    mode = 'spinning'; hurry = 1; skipLevel = 0; refresh(); clearResult(); hint(''); setIdle(false);
    document.body.dataset.rmode = 'spin';
    const n = rigged ?? draw(), f = fast(); rigged = null; dir = -dir; store.set('rouletteDir', dir);
    const p = plan(n, { dir, phiNow: phi, fast: f });
    restIdx = null; S.wheel.ball.visible = false; S.highlight([]); liftDolly();
    // the camera goes to the wheel as the croupier spins the wheelhead and launches the ball
    const toWheel = cutTo('wheel');   // broadcast grammar: locked-off shots joined by cuts, never a drifting camera
    await sleep(f ? 200 : 320);
    const spun = playSpin(p, f);
    await Promise.all([toWheel, spun]);
    // the result
    const idx = WHEEL_INDEX[n]; restIdx = idx; rotorW = p.samples.at(-1)[4] - p.samples.at(-2)[4]; rotorW *= 60;
    await sleep(skipLevel ? 60 : 220);
    showBubble(n); say(`n${n}`, { prio: 3 });
    history.unshift(n); history = history.slice(0, 500); store.set('rouletteHistory', history); renderHistory(true);
    setIdle(true);
    const r = table.settle(n); ctx.showBalance(); refresh();
    const yourStraight = r.wins.some(w => w.kind === 'straight');
    await sleep(skipLevel ? 150 : f ? 700 : 1300);
    if (yourStraight && !reduced() && !skipLevel) await replay(p, n);
    hideBubble();
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
      S.wheel.ball.visible = true; click(.45, .8); audio.cue('whoosh', { bus: 'table', gain: .18, rate: 1.7 });
      const tick = now => {
        const dt = Math.min(turbo ? .5 : .05, (now - last) / 1000) * hurry; last = now; t = Math.min(dur, t + dt);
        const st = at(p, t); phi = st.phi; S.wheel.setRotor(phi); S.wheel.setBall(st.theta, st.r, st.y);
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
        roll.update({ speed: v, theta: st.theta, phase: st.phase, level: hurry > 1 ? .6 : 1 });
        if (!called && p.dropAt && t > p.dropAt - (f ? 1.6 : 2.6)) { called = true; say('no-more-bets', { prio: 2 }); }
        if (!pushed && p.dropAt && t >= p.dropAt) { pushed = true; if (hurry === 1) cutTo('push'); }
        if (t >= dur) { S.tickers.delete(tick); roll.stop(.2); done(); }
      };
      spinTick = tick; S.tickers.add(tick); S.requestRender();
    });
  }
  // the last moments again, slowly, close to the pocket
  async function replay(p, n) {
    const t1 = p.settledAt + .35, t0 = Math.max(p.dropAt ?? 0, t1 - 1.6), wc = S.wheel.group.position, THREE = S.THREE;
    const endA = at(p, p.settledAt).theta, eye = wc.clone().add(new THREE.Vector3(...[Math.cos(endA) * 50, 21, -Math.sin(endA) * 50])), look = wc.clone().add(new THREE.Vector3(Math.cos(endA) * 22, -9, -Math.sin(endA) * 22));
    const m = new THREE.Matrix4().lookAt(eye, look, new THREE.Vector3(0, 1, 0)), pose = { pos: eye, quat: new THREE.Quaternion().setFromRotationMatrix(m), fov: 34, name: 'replay' };
    const tag = $('.r-replay'); tag.hidden = false; hideBubble(); setIdle(false);
    await fadeCut(() => S.setPose(pose));
    await new Promise(done => {
      let t = t0, last = performance.now();
      const tick = now => { const dt = Math.min(turbo ? .5 : .05, (now - last) / 1000) * (skipLevel > 1 ? 6 : .34); last = now; t += dt; const st = at(p, Math.min(t, p.settledAt + 2.9)); S.wheel.setRotor(st.phi); S.wheel.setBall(st.theta, st.r, st.y); if (t >= t1) { S.tickers.delete(tick); done(); } };
      S.tickers.add(tick); S.requestRender();
    });
    // back to now: the wheelhead where it would be by now
    phi = at(p, p.settledAt + 2.9).phi; tag.hidden = true;
    await fadeCut(() => S.setPose(S.shots.push)); setIdle(true); showBubble(n); await sleep(700);
  }
  // a cut: a dip to black of a few frames, the way a vision mixer cuts between cameras
  async function cutTo(name) { const to = S.shots[name]; if (!to) return; fadeEl.classList.add('quick', 'on'); await sleep(reduced() ? 120 : 90); S.setPose(to); await sleep(30); fadeEl.classList.remove('on'); await sleep(110); fadeEl.classList.remove('quick'); }
  async function fadeCut(fn) { fadeEl.classList.add('on'); await sleep(reduced() ? 120 : 220); fn(); await sleep(40); fadeEl.classList.remove('on'); await sleep(200); }
  function cameraTo(name, ms, easing) {
    const to = S.shots[name]; if (!to) return Promise.resolve();
    if (reduced()) return fadeCut(() => S.setPose(to));
    return S.move(to, ms, easing);
  }

  // ---- the number beside the ball -----------------------------------------------------------------------------------------------
  function showBubble(n) {
    const c = colorOf(n); bubble.className = `r-bubble ${c}`; bubble.querySelector('b').textContent = n; bubble.querySelector('small').textContent = c === 'green' ? 'Zero' : `${c === 'red' ? 'Red' : 'Black'} · ${n % 2 ? 'Odd' : 'Even'} · ${n <= 18 ? '1–18' : '19–36'}`;
    bubble.hidden = false; bubble.dataset.on = '1'; placeBubble(); ui.pop(bubble, { from: .4 });
  }
  function hideBubble() { bubble.hidden = true; delete bubble.dataset.on; }
  function placeBubble() { const b = S.wheel.ball, p = S.project(S.wheelToWorld(b.position.toArray())); bubble.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`; }

  // ---- the dolly and the payout -----------------------------------------------------------------------------------------------------
  function placeDolly(n, ms = 240) {
    const d = S.dolly, a = S.anchor(`n${n}`); d.visible = true;
    if (ms <= 0) { d.position.set(a.x + 1.4, H, a.z - 1.2); S.requestRender(); return Promise.resolve(); }
    return motion.tween(ms, t => d.position.set(a.x + 1.4, H + (1 - t) * 14, a.z - 1.2), ease.land).then(() => audio.play('chip', { gain: .6 }));
  }
  function liftDolly() { const d = S.dolly; if (!d.visible) return; const y0 = d.position.y; motion.tween(220, t => { d.position.y = y0 + t * 10; }).then(() => { d.visible = false; S.requestRender(); }); }
  async function payout(r, n) {
    stageAt = 'dolly'; await placeDolly(n); stageAt = 'lose';
    S.highlight([n], { level: .5, color: '#ffe4a6' });
    const sweepTo = S.layout.tray ? S.layout.tray.clone() : S.anchor('n0').clone().add(new S.THREE.Vector3(-22, 0, 0)), kindOf = k => SPOTS.get(k.split('|')[1]).kind;   // losing chips go to the croupier's float
    // losing chips first, outside bets before inside
    const lose = [...stacks.keys()].filter(k => !SPOTS.get(k.split('|')[1]).nums.includes(n)).sort((a, b) => OUT_ORDER.includes(kindOf(b)) - OUT_ORDER.includes(kindOf(a)));
    if (lose.length) audio.play('collect');
    await Promise.all(lose.map((k, i) => sleep(i * 35).then(() => dropStack(k, { to: sweepTo, ms: 420 }))));
    stageAt = 'wins';
    // then the winners: outside first, then inside toward the wheel, straights last
    const wins = [...stacks.keys()].sort((a, b) => rank(kindOf(a)) - rank(kindOf(b)));
    function rank(kd) { return OUT_ORDER.includes(kd) ? 0 : kd === 'straight' ? 2 : 1; }
    const paidStacks = [];
    for (const [i, k] of wins.entries()) {
      const [owner, id] = k.split('|'), s = SPOTS.get(id), stake = stacks.get(k).reduce((a, m) => a + (typeof m.userData.v === 'number' ? m.userData.v : 0), 0) || (RIVALS.find(x => x.name === owner)?.bets ?? []).filter(([b]) => b === id).reduce((a, [, v]) => a + v, 0);
      const pay = stake * s.pays, a = S.anchor(id, slotOf(owner)), side = S.layout.orient === 'port' ? new S.THREE.Vector3(0, 0, -3.9) : new S.THREE.Vector3(3.9, 0, 0);
      const chips = owner === 'you' ? breakDown(pay).slice(0, 12) : Array.from({ length: Math.min(8, Math.ceil(pay / 25)) }, () => RIVALS.find(x => x.name === owner).color);
      const pk = `${owner}|${id}|pay`, list = []; stacks.set(pk, list); paidStacks.push(pk);
      await sleep(i ? 90 : 0); audio.play('payout');
      chips.forEach((v, j) => { const m = S.chipMesh(v), to = a.clone().add(side).setY(H * (j + .5)), from = sweepTo.clone().setY(8); m.userData = { owner, id, v }; list.push(m); m.position.copy(from); motion.tween(480, t => { m.position.lerpVectors(from, to, t); m.position.y += Math.sin(t * Math.PI) * 6; }, ease.out); });
      if (owner !== 'you') tag(owner, `+${fmt(pay)}`, a);
    }
    // the result banner
    stageAt = 'banner'; showWin(r, n);
    if (r.net > 0) { if (bigWin(r)) { feel.tap('big'); feel.confetti({ size: r.back >= r.staked * 20 ? 2 : 1, from: { x: .5, y: .3 } }); } else feel.tap('win'); }
    if (r.net > 0) { sting(r.straight ? 'big' : 'small', .8); if (r.back >= r.staked * 20) { audio.cue(`crowd-cheer-${1 + Math.floor(Math.random() * 2)}`, { gain: .45 }); setTimeout(() => say('congrats', { prio: 1 }), 900); } }
    await sleep(skipLevel ? 250 : fast() ? 900 : 1600);
    // everything on the layout goes home: yours toward you, the others' to their places
    const home = S.layout.orient === 'port' ? new S.THREE.Vector3(S.layout.rect.x1 + 14, 0, 0) : new S.THREE.Vector3((S.layout.X(0) + S.layout.xEnd) / 2, 0, S.layout.rect.z1 + 14);
    const keys = [...stacks.keys()]; if (keys.length) audio.play('collect');
    await Promise.all(keys.map((k, i) => sleep(i * 25).then(() => dropStack(k, { to: home, ms: 380 }))));
    for (const r2 of RIVALS) r2.bets = [];
    S.highlight([]);
    setTimeout(() => { if (mode === 'betting' && !table.bets.size) return; }, 0);
  }
  function tag(name, text, at3) {
    const p = S.project(at3), t = document.createElement('div'); t.className = 'r-tag'; t.innerHTML = `<b></b><span></span>`; t.firstChild.textContent = name; t.lastChild.textContent = text;
    t.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`; tagsEl.append(t); setTimeout(() => t.remove(), 2600);
  }
  let winTimer = 0;
  // a straight-up hit, or anything paying back ten times the stake, is a big win: gold foil and confetti
  const bigWin = r => r.straight || r.back >= r.staked * 10;
  function showWin(r, n) {
    clearTimeout(winTimer);
    const c = colorOf(n); winEl.className = `r-win ${r.net > 0 ? 'up' : r.net < 0 ? 'down' : 'even'} ${c}${r.net > 0 && bigWin(r) ? ' gild' : ''}`;
    winEl.querySelector('small').textContent = `${n} ${c === 'green' ? 'Zero' : c === 'red' ? 'Red' : 'Black'}`;
    winEl.querySelector('b').textContent = r.back > 0 ? (r.net > 0 && bigWin(r) ? 'Big win' : 'You win') : 'No win';
    const em = winEl.querySelector('em'); em.textContent = r.back > 0 ? '0' : signed(r.net);
    winEl.hidden = false; void winEl.offsetWidth; winEl.classList.add('show');   // a reflow, then the transition
    if (r.back > 0) setTimeout(() => ui.morph(em, fmt(r.back)), 140);
    winTimer = setTimeout(clearResult, 4200);
  }
  function clearResult() { clearTimeout(winTimer); if (winEl.hidden) return; winEl.classList.remove('show'); setTimeout(() => { if (!winEl.classList.contains('show')) winEl.hidden = true; }, 380); if (mode === 'betting') { liftDolly(); } }

  // ---- recent numbers ---------------------------------------------------------------------------------------------------------------
  function renderHistory(fresh = false) {
    const count = S.layout?.orient === 'port' ? 11 : 16;
    histEl.replaceChildren(...history.slice(0, count).map((n, i) => { const li = document.createElement('li'); li.className = colorOf(n); li.textContent = n; if (i === 0) li.classList.add('latest'); return li; }));
    if (fresh && histEl.firstChild) ui.pop(histEl.firstChild, { from: .2 });
  }

  // ---- the racetrack and the statistics ------------------------------------------------------------------------------------------------
  const raceSheet = $('#rRaceSheet'), statsSheet = $('#rStatsSheet');
  let nbK = store.get('neighbours', 2);
  function buildRace() {
    // a stadium: the wheel's numbers round the outside, zero at the right end; the named sections inside
    const W = 700, Ht = 210, r = 78, x0 = 24 + r, x1 = W - 24 - r, cy = Ht / 2 + 6, straight = x1 - x0, per = 2 * straight + 2 * Math.PI * r, step = per / WHEEL.length;
    // start at zero on the right end, going clockwise round the stadium (top row runs right to left)
    const pointAt = s => { s = ((s % per) + per) % per;
      if (s < Math.PI * r / 2) { const a = s / r; return [x1 + r * Math.cos(-a), cy - r * Math.sin(a) * -1 * -1, a]; }
      return null; };
    void pointAt;
    const pos = [];
    for (let i = 0; i < WHEEL.length; i++) {
      let s = i * step, x, y;
      // right end: from the middle (angle 0) upward... we lay it out clockwise: right end bottom half → bottom row → left end → top row → right end top half
      const q = Math.PI * r / 2;
      if (s < q) { const a = s / r; x = x1 + r * Math.cos(a); y = cy + r * Math.sin(a); }
      else if ((s -= q) < straight) { x = x1 - s; y = cy + r; }
      else if ((s -= straight) < Math.PI * r) { const a = Math.PI / 2 + s / r; x = x0 + r * Math.cos(a); y = cy + r * Math.sin(a); }
      else if ((s -= Math.PI * r) < straight) { x = x0 + s; y = cy - r; }
      else { s -= straight; const a = -Math.PI / 2 + s / r; x = x1 + r * Math.cos(a); y = cy + r * Math.sin(a); }
      pos.push([x, y]);
    }
    const band = (inner) => `M${x0} ${cy - inner} H${x1} A${inner} ${inner} 0 0 1 ${x1} ${cy + inner} H${x0} A${inner} ${inner} 0 0 1 ${x0} ${cy - inner} Z`;
    const cells = WHEEL.map((n, i) => `<g class="rt-num ${colorOf(n)}" data-n="${n}" tabindex="-1"><circle cx="${pos[i][0].toFixed(1)}" cy="${pos[i][1].toFixed(1)}" r="17"/><text x="${pos[i][0].toFixed(1)}" y="${(pos[i][1] + 5.5).toFixed(1)}">${n}</text></g>`).join('');
    const zones = [['tiers', 'Tiers', x0 - 28, 150], ['orphelins', 'Orphelins', x0 + 130, 150], ['voisins', 'Voisins', x0 + 288, 150], ['zero', 'Zéro', x0 + 446, 100]];
    raceSheet.innerHTML = `<header><h3>Racetrack</h3><div class="rt-nb"><span>Neighbours</span><button class="pill" data-nb="-1" aria-label="Fewer neighbours">−</button><output>${nbK}</output><button class="pill" data-nb="1" aria-label="More neighbours">+</button></div><button class="icon r-close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
      <svg class="rt" viewBox="0 0 ${W} ${Ht + 12}" role="group" aria-label="Racetrack: tap a number for a neighbours bet, or a section for its call bet">
        <path class="rt-band" d="${band(r + 20)}"/><path class="rt-inner" d="${band(r - 20)}"/>
        ${zones.map(([k, label, x, w]) => `<g class="rt-zone" data-call="${k}" tabindex="0" role="button" aria-label="${CALLS[k].name}, ${CALLS[k].chips.reduce((a, [, u]) => a + u, 0)} chips"><rect x="${x + 36}" y="${cy - r + 26}" width="${w}" height="${2 * r - 52}" rx="12"/><text x="${x + 36 + w / 2}" y="${cy + 6}">${label}</text></g>`).join('')}
        ${cells}
      </svg><p class="rt-note">Tap a number to bet it with ${'<b class="nbk">'}${nbK}${'</b>'} neighbours each side; tap a section for its call bet. Chips go on at your chip value.</p>`;
    const nums = n => { const on = new Set(n); for (const g of raceSheet.querySelectorAll('.rt-num')) g.classList.toggle('lit', on.has(+g.dataset.n)); S.highlight(n, { level: .26 }); };
    for (const g of raceSheet.querySelectorAll('.rt-num')) {
      const n = +g.dataset.n;
      g.addEventListener('pointerenter', () => nums(neighbours(n, nbK))); g.addEventListener('pointerleave', () => nums([]));
      g.addEventListener('click', () => { placeOn(neighbours(n, nbK).map(k => [`n${k}`, 1])); nums(neighbours(n, nbK)); });
    }
    for (const g of raceSheet.querySelectorAll('.rt-zone')) {
      const k = g.dataset.call;
      g.addEventListener('pointerenter', () => nums(callNumbers(k))); g.addEventListener('pointerleave', () => nums([]));
      g.addEventListener('click', () => { placeOn(CALLS[k].chips); nums(callNumbers(k)); });
    }
    for (const b of raceSheet.querySelectorAll('[data-nb]')) b.onclick = () => { nbK = Math.max(1, Math.min(4, nbK + +b.dataset.nb)); store.set('neighbours', nbK); raceSheet.querySelector('output').textContent = nbK; raceSheet.querySelector('.nbk').textContent = nbK; uiSound('toggle'); };
    raceSheet.querySelector('.r-close').onclick = closeSheets;
  }
  function buildStats() {
    const N = Math.min(history.length, 100), st = stats(history, 100);
    const chip = x => `<button class="st-n ${colorOf(x.n)}" data-n="${x.n}" aria-label="Bet ${x.n} straight up">${x.n}<small>${x.c}×</small></button>`;
    const bar = (label, parts) => `<div class="st-bar"><span>${label}</span><div>${parts.map(([v, cls, t]) => `<i class="${cls}" style="flex:${Math.max(v, .5)}"><em>${t} ${v}%</em></i>`).join('')}</div></div>`;
    statsSheet.innerHTML = `<header><h3>Statistics <small>${N ? `last ${N} spin${N > 1 ? 's' : ''}` : 'no spins yet'}</small></h3><button class="icon r-close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
      ${N ? `<div class="st-hc"><div><h4>Hot</h4><div class="st-row">${st.hot.map(chip).join('')}</div></div><div><h4>Cold</h4><div class="st-row">${st.cold.map(chip).join('')}</div></div></div>
      ${bar('Colour', [[st.red, 'red', 'Red'], [st.zero, 'green', '0'], [st.black, 'black', 'Black']])}
      ${bar('Odd · Even', [[st.odd, 'a', 'Odd'], [st.even, 'b', 'Even']])}
      ${bar('Low · High', [[st.low, 'a', '1–18'], [st.high, 'b', '19–36']])}
      ${bar('Dozens', st.dozens.map((v, i) => [v, ['a', 'b', 'c'][i], ['1st', '2nd', '3rd'][i]]))}
      ${bar('Columns', st.columns.map((v, i) => [v, ['a', 'b', 'c'][i], `Col ${i + 1}`]))}
      <p class="st-note">Every spin is independent: the wheel has no memory. Tap a number to bet it.</p>` : '<p class="st-note">Numbers you see come out will be counted here.</p>'}`;
    for (const b of statsSheet.querySelectorAll('.st-n')) { b.onclick = () => placeOn([[`n${b.dataset.n}`, 1]]); b.onpointerenter = () => S.highlight([+b.dataset.n], { level: .3 }); b.onpointerleave = () => S.highlight([]); }
    statsSheet.querySelector('.r-close').onclick = closeSheets;
  }
  function openSheet(which) {
    const el = which === 'race' ? raceSheet : statsSheet, other = which === 'race' ? statsSheet : raceSheet;
    if (sheetOpen === which) { closeSheets(); return; }
    other.hidden = true; if (which === 'race') buildRace(); else buildStats();
    el.hidden = false; sheetOpen = which; uiSound('open'); ui.enter([el], { y: 16 });
    $('#rRace').setAttribute('aria-expanded', which === 'race'); $('#rStats').setAttribute('aria-expanded', which === 'stats');
  }
  function closeSheets() { if (!sheetOpen) return; raceSheet.hidden = statsSheet.hidden = true; sheetOpen = null; uiSound('close'); S.highlight([]); $('#rRace').setAttribute('aria-expanded', false); $('#rStats').setAttribute('aria-expanded', false); }
  $('#rRace').onclick = () => openSheet('race'); $('#rStats').onclick = () => openSheet('stats');

  // ---- the controls and the hint -----------------------------------------------------------------------------------------------------
  let hintClear = 0;
  function hint(t) { clearTimeout(hintClear); if (t) { hintEl.classList.remove('off'); if (hintEl.dataset.t !== t) { hintEl.dataset.t = t; ui.morph(hintEl, t); } } else hintClear = setTimeout(() => hintEl.classList.add('off'), 260); }
  function swapIn(el, on) { el.classList.toggle('gone', !on); el.inert = !on; el.setAttribute('aria-hidden', !on); }
  function refresh() {
    const betting = mode === 'betting', total = table.total, bal = wallet.balance;
    $('#rUndo').disabled = !betting || !table.history.length; $('#rClear').disabled = !betting || !total;
    swapIn($('#rRebet'), !total); swapIn($('#rX2'), !!total);
    $('#rRebet').disabled = !betting || !table.canRebet; $('#rX2').disabled = !betting || !total || total * 2 > bal;
    $('#rSpin').disabled = !betting || (!total && !table.canRebet) || total > bal;
    ui.morph($('#rSpin').querySelector('.label'), !total && table.canRebet ? 'Rebet & spin' : 'Spin');
    for (const b of chipRow.children) b.disabled = +b.dataset.value > bal - (betting ? total : 0);
    for (const b of dock.querySelectorAll('.r-tool')) b.disabled = !betting;
    if (!stage.hidden) ctx.showInPlay(betting ? total : table.staked ?? 0);
    if (betting && active) {
      if (!total) hint(table.canRebet ? `Place your bets, or rebet ${fmt(table.last.reduce((a, [, v]) => a + v, 0))}.` : 'Choose a chip, then tap the layout.');
      else hint(`Bet ${fmt(total)}. Spin when ready.`);
    } else if (mode === 'spinning') hint('Tap to hurry the ball.');
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
    if (bubble.dataset.on) placeBubble();
  }
  new ResizeObserver(() => requestAnimationFrame(reframe)).observe(stage);

  // ---- keys ------------------------------------------------------------------------------------------------------------------------
  function onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 'escape' && sheetOpen) { closeSheets(); return true; }
    if (mode !== 'betting') { if (k === ' ' || k === 'enter') { e.preventDefault(); skip(); return true; } return false; }
    if ((k === ' ' || k === 'enter') && !e.target.closest?.('button')) { e.preventDefault(); actions.spin(); }
    else if (k === 'u' || k === 'backspace') actions.undo();
    else if (k === 'c') actions.clear();
    else if (k === 'r') actions.rebet();
    else if (k === 'x') actions.double();
    else if (k === 't') openSheet('race');
    else if (k === 's') openSheet('stats');
    else if (/^[1-7]$/.test(k)) selectChip(CHIP_VALUES[+k - 1]);
    else return false;
    return true;
  }

  // ---- start ------------------------------------------------------------------------------------------------------------------------
  S.wheel.setRotor(phi); if (history.length) { restIdx = WHEEL_INDEX[history[0]]; S.wheel.ball.visible = true; }
  renderHistory();
  const api = {
    stage, dock, scene: S, table, onKey,
    get busy() { return mode !== 'betting'; },
    get mode() { return mode; },
    // the room is shown (behind the lobby or at the table)
    show() {
      stage.hidden = dock.hidden = false; S.pause(false); framed = ''; reframe(); setIdle(true);
      // chips spent at another table since you left: the layout can't stay bigger than your balance
      if (mode === 'betting' && table.total > wallet.balance) { table.clear(); serial(syncYours); hint('Your bets were cleared: your balance changed at another table.'); }
      ctx.showInPlay(table.total); refresh();
    },
    hide() { stage.hidden = dock.hidden = true; setIdle(false); S.pause(true); active = false; closeSheets(); hover(null); for (const j of rivalJobs) j.hurry(); rivalJobs = []; },
    showcase: { start(still) { S.showcase.start(still); framed = ''; reframe(); S.requestRender(); }, stop: ms => S.showcase.stop(ms) },
    // you sit down: the camera flies into your chair
    async enter(ms) { active = true; framed = ''; reframe(); await S.showcase.stop(ms); if (!S.current) S.setPose(S.shots.seat); refresh(); if (mode === 'betting') { say('place-bets', { prio: 2, fresh: 3000 }); othersWake(); } },
    leave() { active = false; for (const j of rivalJobs) j.hurry(); rivalJobs = []; },
    setReduced(on) { motion.reduced = on; if (on) setIdle(false); else if (!stage.hidden) setIdle(true); },
    setFast(on) { motion.slow = on ? .62 : 1; },
    setQuality(q) { S.setQuality(q); },
    refresh, reframe: () => { framed = ''; reframe(); },
    // for the automated checks
    test: { plan, at, get history() { return history; }, place: (id, units = 1) => placeOn([[id, units]]), rig: n => { rigged = n; }, set turbo(v) { turbo = v; }, stacks, get skipLevel() { return skipLevel; }, get stageAt() { return stageAt; }, motion, showWin, showBubble },
  };
  return api;
}

// the chips that make up an amount, largest first
function breakDown(amount) { const out = []; for (const v of [...CHIP_VALUES].reverse()) while (amount >= v - 1e-9) { out.push(v); amount -= v; } return out; }
void LIMITS; void KINDS; void SECTIONS;
