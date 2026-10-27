// The table's physical choreography. Reads nothing from the rules engine: the controller
// tells it what happened, and it moves cards and chips the way a dealer would.
import * as THREE from '../vendor/three.module.min.js';
import { LAYOUT, CARD_T, SHOE, toSeat, seatAngle } from './world.mjs';
import { CARD_W, CARD_H, CHIP_H } from './textures.mjs';
import { createCard, createChip, createMarker, cardQuat, headingOf, ease, chipToss } from './pieces.mjs';
import { breakDown } from '../engine.mjs';

export const TIMING = { dealPlayer: 720, dealDealer: 640, reveal: 620, peek: 560, chip: 300, chipToss: 440, chipMove: 460, payout: 500, square: 180, gather: 300, discard: 620, toPlayer: 560, split: 440, shoeFill: 1100 };
// Dealers don't all deal alike. Each keeps the same technique (out of the shoe, turned, slid across
// on the cloth) but with their own pace and hand: how quickly the card leaves the shoe and turns,
// how wide the sweep, how high the page-turn lifts, how much it settles, and how exactly it lands.
// Sofia slides the card across face down and turns it over at its spot instead. `voice`: whose
// recorded lines they speak (two voices for now: James's and Sofia's).
export const DEALERS = {
  james: { name: 'James', voice: 'james', style: 'Classic', speed: 1, out: .17, turn: .42, reach: .34, lift: .92, hop: .12, jitter: 0, flip: 'shoe' },
  marco: { name: 'Marco', voice: 'james', style: 'Brisk', speed: .74, out: .12, turn: .31, reach: .26, lift: .78, hop: .05, jitter: 1, flip: 'shoe' },
  elena: { name: 'Elena', voice: 'sofia', style: 'Smooth', speed: 1.28, out: .21, turn: .48, reach: .44, lift: 1.05, hop: .2, jitter: 0, flip: 'shoe' },
  sofia: { name: 'Sofia', voice: 'sofia', style: 'Turns at the spot', speed: .92, out: .16, turn: .24, reach: .3, lift: 0, hop: .1, jitter: .5, flip: 'spot' },
};
const clamp01 = x => Math.min(1, Math.max(0, x)), smooth = x => x * x * (3 - 2 * x);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const UP = V(0, 1, 0), CHIPS = [1000, 500, 100, 50, 25, 10, 5, 1], PER_COLUMN = 20;
const turnAbout = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);

// A smooth, monotone speed profile through keyframes (t, s): Fritsch–Carlson cubic. The card
// starts from rest, never stops in between, and comes to rest at the end.
function profile(keys) {
  const n = keys.length, d = [], m = new Array(n).fill(0);
  for (let k = 0; k < n - 1; k++) d.push((keys[k + 1][1] - keys[k][1]) / (keys[k + 1][0] - keys[k][0]));
  for (let k = 1; k < n - 1; k++) if (d[k - 1] * d[k] > 0) m[k] = 2 / (1 / d[k - 1] + 1 / d[k]);   // harmonic mean keeps it monotone
  return t => {
    let k = 0; while (k < n - 2 && t > keys[k + 1][0]) k++;
    const [t0, s0] = keys[k], [t1, s1] = keys[k + 1], h = t1 - t0, u = clamp01((t - t0) / h), u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * s0 + (u3 - 2 * u2 + u) * h * m[k] + (-2 * u3 + 3 * u2) * s1 + (u3 - u2) * h * m[k + 1];
  };
}
// A polyline sampled from any curve, walked by distance.
function track(points) {
  const acc = [0]; for (let k = 1; k < points.length; k++) acc.push(acc[k - 1] + points[k].distanceTo(points[k - 1]));
  const length = acc.at(-1);
  const at = d => { d = Math.min(Math.max(d, 0), length); let lo = 1, hi = points.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (acc[mid] < d) lo = mid + 1; else hi = mid; }
    const f = (d - acc[lo - 1]) / ((acc[lo] - acc[lo - 1]) || 1); return points[lo - 1].clone().lerp(points[lo], f); };
  return { length, at };
}
const bezier = (p0, p1, p2, p3, n = 48) => Array.from({ length: n + 1 }, (_, k) => { const u = k / n, v = 1 - u; return V(0, 0, 0).addScaledVector(p0, v * v * v).addScaledVector(p1, 3 * v * v * u).addScaledVector(p2, 3 * v * u * u).addScaledVector(p3, u * u * u); });

// Where each stake sits. Split hands share the main circle. Everything paid on a bet - a double,
// winnings - is stacked on top of it; tall stacks are cut into columns of twenty, as dealers do.
const STACKS = { ...LAYOUT.spots, ins: { x: -13, z: 17.2 } };
// Another player's things carry the key 's<seat>' (their hand and stake), then a letter for the
// rest: 'b', 'c', 'd' the second to fourth hands after splits, 'i' insurance, 'p' Perfect Pairs, 't' 21+3.
// Your hands are 'h0'-'h3'. A trailing 'f' is the free-bet marker beside that hand's stake ('h0f', 's3f', 's3bf').
const seatOf = key => typeof key === 'string' && /^s\d(b|c|d|i|p|t)?f?$/.test(key) ? +key[1] : null;
const partOf = key => key.slice(2).replace(/f$/, '');
const HAND_PARTS = ['', 'b', 'c', 'd'];
export const handKey = (seat, j) => seat == null ? `h${j}` : `s${seat}${HAND_PARTS[j]}`;
const MARKER = { dx: 0, dz: -4.4 };   // where a marker sits: just above its stake, toward the dealer
// Split hands side by side, in your seat's frame: two well apart; three or four (Free Bet resplits) a card's width
// and a little apart, the row shifted left so the stair-stepped cards sit centred on the seat.
export const handX = (j, n) => n <= 1 ? 0 : n === 2 ? (j ? 9.5 : -9.5) : (j - (n - 1) / 2) * (n === 3 ? 9.5 : 9) - .9;
// Their stakes in the main circle: one in the middle, two side by side; three or four in a row across it, set a
// little toward the dealer, with their markers in a row below them (above would run into the side-bet arc).
function stakeAt(j, n) { const m = LAYOUT.spots.main; return n <= 1 ? { x: m.x, z: m.z } : n === 2 ? { x: m.x + (j ? 2.3 : -2.3), z: m.z } : { x: m.x + (j - (n - 1) / 2) * 4, z: m.z - 1.6 }; }
function markerAt(j, n) { const s = stakeAt(j, n); return n <= 2 ? { x: s.x + MARKER.dx, z: s.z + MARKER.dz } : { x: s.x, z: s.z + 4.2 }; }
// Where those sit, in your seat's frame (carried round to theirs).
export const SEAT_SPOTS = { p: { x: -10.5, z: 43, r: 3 }, t: { x: 10.5, z: 43, r: 3 }, i: { x: -13, z: 17.2 } };
export class TableView {
  constructor(world, motion, audio) {
    Object.assign(this, { world, motion, audio }); this.T = world.table;
    this.front = null; this.cards = []; this.stacks = new Map(); this.handCount = 1; this.cutOnFelt = null; this.dealer = DEALERS.james; this.seatSplits = new Map();
  }
  get split() { return this.handCount > 1; }
  seatHands(k) { return this.seatSplits.get(k) ?? 1; }   // how many hands that seat is playing
  // ---- stack geometry ------------------------------------------------------------------------
  // A hand's stake, or (a trailing 'f') the free-bet marker beside it; side bets and insurance have their own spots.
  stackBase(key) {
    const k = seatOf(key);
    if (/^h\df?$/.test(key)) { const j = +key[1], n = this.handCount; return key.endsWith('f') ? markerAt(j, n) : stakeAt(j, n); }
    if (k == null) return STACKS[key];
    const part = partOf(key), spot = SEAT_SPOTS[part];
    if (spot) return toSeat(k, spot.x, spot.z);
    const j = HAND_PARTS.indexOf(part), n = this.seatHands(k), p = key.endsWith('f') ? markerAt(j, n) : stakeAt(j, n);
    return toSeat(k, p.x, p.z);
  }
  // Where a player's hand rests on the rail: chips come from here and go back here.
  home(key, x = 0, y = 9, z = 70) { const k = seatOf(key); if (k == null) return V(x, y, z); const p = toSeat(k, x, z); return V(p.x, y, p.z); }
  chipsOf(key) { if (!this.stacks.has(key)) this.stacks.set(key, []); return this.stacks.get(key); }
  chipSlot(key, i) {
    const b = this.stackBase(key), col = Math.floor(i / PER_COLUMN), row = i % PER_COLUMN, j = (i * 7.31) % 1 - .5;
    const dx = col ? (col % 2 ? 1 : -1) * Math.ceil(col / 2) * 4.05 : 0;   // extra columns alternate right, left
    return V(b.x + dx + j * .09, (b.lift ?? 0) + CHIP_H / 2 + .02 + row * (CHIP_H + .004), b.z + ((i * 3.7) % 1 - .5) * .09);
  }

  // ---- chips -----------------------------------------------------------------------------
  // A chip placed from your hand is tossed from your side: it decelerates across the felt on a
  // gravity arc, lands flat with a click, and settles with one small bounce and a fading wobble.
  addChip(key, value, from = null) {
    const chips = this.chipsOf(key), c = createChip(value), to = this.chipSlot(key, chips.length);
    const k = seatOf(key), start = from ?? (k == null ? V(to.x * .5 + (Math.random() - .5) * 2, 9, 70) : this.home(key, (Math.random() - .5) * 2));
    this.T.add(c); chips.push(c);
    const onStack = chips.length > 1, toss = chipToss(c, start, to, { onLand: () => this.audio?.play(onStack ? 'stack' : 'chip', { x: to.x }) });   // (pieces.mjs, shared with the roulette table)
    const flight = this.motion.tween(TIMING.chipToss, toss).then(() => { toss.finish(); c.userData.flight = null; });
    c.userData.flight = flight; return flight;
  }
  // Chips for an amount, largest first, dropped one after another on top of the stack.
  async addAmount(key, amount, source = 'player') {
    const vals = breakDown(amount, CHIPS);
    for (const [i, v] of vals.entries()) {
      const from = source === 'rack' ? V(LAYOUT.rack.x + (this.stackBase(key).x) * .15, 2.5, LAYOUT.rack.z + 3) : null;
      const p = source === 'rack' ? this.flyChip(key, v, from, i === 0) : this.addChip(key, v);
      if (i === vals.length - 1) await p; else await this.motion.wait(source === 'rack' ? 70 : 60);
    }
  }
  // Winnings travel from the dealer's rack in a low arc and land on your stack.
  async flyChip(key, value, from, audible = true) {
    const chips = this.chipsOf(key), c = createChip(value), to = this.chipSlot(key, chips.length);
    c.rotation.y = Math.random() * Math.PI * 2; c.position.copy(from); this.T.add(c); chips.push(c);
    await this.motion.tween(TIMING.payout, t => { const e = ease.inOut(t); c.position.lerpVectors(from, to, e); c.position.y += Math.sin(Math.PI * e) * 4; });
    c.position.copy(to); if (audible) this.audio?.play('payout', { x: to.x });
  }
  async buildStack(key, amount) { for (const c of this.chipsOf(key)) this.T.remove(c); this.stacks.set(key, []); await this.addAmount(key, amount); }
  async removeTop(key) {
    const c = this.chipsOf(key).pop(); if (!c) return; if (c.userData.flight) await c.userData.flight; const from = c.position.clone(), to = seatOf(key) == null ? V(from.x * .5, 20, 90) : this.home(key, 0, 20, 90);
    await this.motion.tween(TIMING.chip, t => c.position.lerpVectors(from, to, t), ease.in); this.T.remove(c);
  }
  // Losing chips are drawn off the felt into the dealer's rack, top chip first.
  async toRack(key) {
    const chips = this.chipsOf(key); if (!chips.length) return; this.stacks.set(key, []); this.audio?.play('collect', { x: this.stackBase(key).x });
    const base = this.stackBase(key), rack = V(LAYOUT.rack.x + base.x * .3, 1.4, LAYOUT.rack.z + 2.6);
    await Promise.all(chips.map((c, i) => { const from = c.position.clone(), to = rack.clone().add(V(0, i * CHIP_H, 0));
      return this.motion.wait((chips.length - 1 - i) * 18).then(() => this.motion.tween(TIMING.chipMove, t => { c.position.lerpVectors(from, to, t); c.position.y += Math.sin(Math.PI * t) * 1.2; }, ease.inOut)); }));
    for (const c of chips) this.T.remove(c); this.world.requestRender();
  }
  // Winnings are paid onto the bet itself.
  async payout(key, amount) { await this.addAmount(key, amount, 'rack'); }
  // At the end of a round every stack slides back to you, each moving as one piece.
  async toPlayer() {
    const entries = [...this.stacks.entries()].filter(([, a]) => a.length), stacks = entries.map(([, a]) => a); this.stacks.clear(); if (!stacks.length) return; this.audio?.play('collect', { gain: .8 });
    await Promise.all(entries.map(([key, chips], k) => {
      const from = chips.map(c => c.position.clone()), b = from[0], to = seatOf(key) == null ? V(b.x * .6, 10, 84) : this.home(key, 0, 10, 84), dest = from.map(f => to.clone().add(f).sub(b));
      return this.motion.wait(k * 40).then(() => this.motion.tween(TIMING.toPlayer, t => chips.forEach((c, i) => c.position.lerpVectors(from[i], dest[i], t)), ease.in));
    }));
    for (const c of stacks.flat()) this.T.remove(c);
  }
  // Make a stack show exactly these chips (bottom first). Chips already there stay put;
  // extra chips drop in, chips no longer bet lift back to your hand.
  async syncStack(key, values) {
    const chips = this.chipsOf(key); let keep = 0;
    while (keep < chips.length && keep < values.length && chips[keep].userData.value === values[keep]) keep++;
    const jobs = [];
    while (chips.length > keep) jobs.push(this.removeTop(key));
    await Promise.all(jobs);
    for (let i = keep; i < values.length; i++) { const p = this.addChip(key, values[i]); if (i === values.length - 1) await p; else await this.motion.wait(55); }
  }
  sideWin(key, amount) { return this.payout(key, amount); }
  // The dealer sets a free-bet marker down beside the stake (it comes from the dealer's side).
  async addMarker(key) {
    const chips = this.chipsOf(key), c = createMarker(), to = this.chipSlot(key, chips.length); to.y += CHIP_H * .3;
    const from = V(LAYOUT.rack.x + this.stackBase(key).x * .2, 3, LAYOUT.rack.z + 4);
    c.rotation.y = Math.random() * Math.PI * 2; c.position.copy(from); this.T.add(c); chips.push(c);
    await this.motion.tween(TIMING.payout, t => { c.position.lerpVectors(from, to, t); c.position.y += Math.sin(Math.PI * t) * 3.5; }, ease.inOut);
    c.position.copy(to); this.audio?.play('chip', { x: to.x, gain: .8 });
  }
  rename(from, to) { if (!this.stacks.has(from)) return; this.stacks.set(to, this.stacks.get(from)); this.stacks.delete(from); }
  clearChips() { for (const c of [...this.stacks.values()].flat()) this.T.remove(c); this.stacks.clear(); this.world.requestRender(); }

  // ---- the shoe ------------------------------------------------------------------------------
  syncShoe(remaining, untilCut) { this.world.shoe.setStack(remaining, untilCut); this.world.requestRender(); }
  // The next card sits face down on the front slope. `settle` slides it down into the mouth,
  // as the weighted stack pushes it in a real shoe.
  stageFront(card, settle = false) {
    if (this.front?.userData.card === card) return;
    if (this.front) this.world.shoe.group.remove(this.front);
    this.front = null; if (!card) return;
    const m = createCard(card), p = this.world.shoe.frontPose(); m.quaternion.copy(p.quat); m.position.copy(p.pos); this.world.shoe.group.add(m); this.front = m;
    if (settle && !this.motion.reduced) {
      const up = V(Math.cos(SHOE.slope), Math.sin(SHOE.slope), 0).multiplyScalar(1.4), from = p.pos.clone().add(up);
      void this.motion.tween(180, t => m.position.lerpVectors(from, p.pos, t), ease.out);
    }
    this.world.requestRender();
  }
  shoeToTable(pose) { // a pose in the shoe's frame, expressed on the table
    const g = this.world.shoe.group; g.updateMatrixWorld();
    return { pos: pose.pos.clone().applyMatrix4(g.matrix), quat: g.quaternion.clone().multiply(pose.quat) };
  }

  // ---- cards: placement ---------------------------------------------------------------------
  // Stair-stepped as dealers place them: each card up and to the right of the last, the corner
  // index of every card left showing. Doubles lie across the hand; the second card on a split
  // ace is turned 45 degrees (no more cards). Split hands sit side by side.
  anchor(owner, i, turn = null) {
    if (owner === 'dealer') { const d = LAYOUT.dealer; return { pos: V(d.x - 3.6 + i * 4.4, .05 + i * CARD_T, d.z), heading: 0 }; }
    const k = seatOf(owner);
    if (k != null) {   // another seat: your layout, turned to face them
      const a = this.anchorAt(handX(HAND_PARTS.indexOf(partOf(owner)), this.seatHands(k)), i, turn), p = toSeat(k, a.pos.x, a.pos.z);
      return { pos: V(p.x, a.pos.y, p.z), heading: a.heading + seatAngle(k), seat: k };
    }
    return this.anchorAt(handX(owner, this.handCount), i, turn);
  }
  anchorAt(bx, i, turn) {
    const base = LAYOUT.player;
    const x = base.x + bx + Math.min(i, 5) * 1.8 + Math.max(0, i - 5) * 1.2, z = base.z - Math.min(i, 5) * 2.5 - Math.max(0, i - 5) * 1.7;
    if (turn === 'across') return { pos: V(x - .5, .06 + i * CARD_T, z + .9), heading: Math.PI / 2 };
    if (turn === 'angled') return { pos: V(x + .2, .06 + i * CARD_T, z + .3), heading: -Math.PI / 4 };
    return { pos: V(x, .05 + i * CARD_T, z), heading: 0 };
  }
  handCards(owner) { return this.cards.filter(c => c.owner === owner).sort((a, b) => a.i - b.i); }

  // ---- cards: the draw -------------------------------------------------------------------------
  // How it is done at a shoe table (NY 9 NYCRR 5324.11; dealer-school practice; the recordings):
  // the left hand slides the card out of the mouth face down; it is turned face up right beside
  // the shoe, over its long edge like a page, the leading edge staying on the felt; the right hand
  // then slides it across the layout to its place - on the cloth, never tossed. One continuous
  // speed curve: quick out of the shoe, easing through the turn, fast across, settling at the end.
  async deal(card, { owner, i, hidden = false, turn = null, next }) {
    const D = this.dealer, atSpot = D.flip === 'spot' && !hidden;   // turned over where it lands
    const faceDown = hidden || atSpot;
    if (!this.front || this.front.userData.card !== card) this.stageFront(card);
    const m = this.front; this.front = null; this.T.attach(m); this.world.shoe.read?.();   // out over the reader at the mouth
    const q0 = m.quaternion.clone(), p0 = m.position.clone(), exit = this.shoeToTable(this.world.shoe.exitPose()), pE = exit.pos;
    const tgt = this.anchor(owner, i, turn), total = (owner === 'dealer' ? TIMING.dealDealer : TIMING.dealPlayer) * D.speed;
    // a less exact hand lands a touch off the mark and off square
    const jx = (Math.random() - .5) * .5 * D.jitter, jz = (Math.random() - .5) * .5 * D.jitter, jh = (Math.random() - .5) * .09 * D.jitter;
    const p3 = tgt.pos.clone().add(V(jx, 0, jz));
    // out of the mouth, then a curve that leaves in the same direction and arrives settling in
    const d1 = V(pE.x - p0.x, 0, pE.z - p0.z).normalize(), flat = V(p3.x, pE.y, p3.z);
    const reach = Math.max(CARD_W * 1.5, flat.distanceTo(pE) * D.reach), c1 = pE.clone().addScaledVector(d1, reach);
    const inDir = flat.clone().sub(c1).setY(0).normalize(), c2 = flat.clone().addScaledVector(inDir, -Math.min(8, flat.distanceTo(pE) * .25));
    const outLeg = track([p0, pE]), curve = track(bezier(pE, c1, c2, flat)), LA = outLeg.length, S = LA + curve.length;
    const at = s => s <= LA ? outLeg.at(s) : curve.at(s - LA);
    const turnLen = CARD_W * 1.25, sF = LA + turnLen;
    const speed = profile([[0, 0], [D.out, LA], [D.turn, sF], [1, S]]);
    // the turn: about the card's long axis, trailing edge rising (axis = up x direction of travel)
    const axis = V(0, 0, 0).crossVectors(UP, d1).normalize(), flipped = turnAbout(axis, Math.PI).multiply(exit.quat);
    const qFlat = faceDown ? exit.quat : flipped;
    const h0 = headingOf(qFlat); let h1 = tgt.heading + jh; if (Math.abs(wrap(h1 - h0)) > Math.PI / 2) h1 += Math.PI;   // half a turn looks the same
    // The face is turned so its top always points at the dealer - or to the left for a card laid across.
    const ch = Math.cos(h1), flipFace = ch < -.1 || (Math.abs(ch) <= .1 && Math.sin(h1) < 0);
    m.children[0].rotation.z = flipFace ? Math.PI : 0;
    const qT = cardQuat(h1, faceDown ? 0 : 1), yT = p3.y;
    this.audio?.play('slide', { x: p0.x });
    let staged = false, snapped = faceDown;
    await this.motion.tween(total, t => {
      const s = speed(t), p = at(s);
      // sounds on the frames they happen: the snap as the face lands, the slide across the cloth
      if (!snapped && s > LA + turnLen * .9) { snapped = true; this.audio?.play('turn', { x: p.x }); }
      if (s <= LA) { const q = this.shoeToTable(this.world.shoe.slidePose(s / (LA || 1))); m.quaternion.copy(q.quat); p.copy(q.pos); }   // drawn out of the mouth (world.mjs)
      else {
        if (!staged) { staged = true; next?.(); }    // the next card settles into the mouth
        const f = clamp01((s - LA) / turnLen), th = Math.PI * smooth(f);
        const qTurn = faceDown ? exit.quat : turnAbout(axis, th).multiply(exit.quat);
        const w = smooth(clamp01((s - LA - turnLen * .6) / (S - LA - turnLen * .6) * 1.15));   // square up to the spot on the way
        m.quaternion.slerpQuaternions(qTurn, qT, w);
        const down = smooth(clamp01((s - LA) / (turnLen * 1.1)));
        p.y = pE.y + (yT - pE.y) * down + (faceDown ? 0 : Math.sin(th) * CARD_W * .5 * D.lift) + Math.sin(Math.PI * clamp01((s - sF) / (S - sF))) * D.hop;
      }
      m.position.copy(p);
    });
    m.position.copy(p3); m.quaternion.copy(qT);
    if (!staged) next?.();
    const c = { card, mesh: m, owner, i, turn, hidden, heading: h1, flipFace, yaw: tgt.seat != null ? seatAngle(tgt.seat) : 0 }; this.cards.push(c);
    if (atSpot) await this.turnOver(c, 300 * D.speed);
  }
  // After a new shoe the first card is burned: out face down, straight into the discard holder.
  async burn(card, next) {
    if (!this.front || this.front.userData.card !== card) this.stageFront(card);
    const m = this.front; this.front = null; this.T.attach(m); this.world.shoe.read?.();   // out over the reader at the mouth
    const p0 = m.position.clone(), q0 = m.quaternion.clone(), exit = this.shoeToTable(this.world.shoe.exitPose());
    const d = this.world.discard.group; d.updateMatrixWorld();
    const into = V(0, this.world.discard.topY() + .3, 0).applyMatrix4(d.matrix), qD = cardQuat(d.rotation.y + Math.PI / 2, 0);
    this.audio?.play('slide', { x: p0.x });
    await this.motion.tween(300, t => { const q = this.shoeToTable(this.world.shoe.slidePose(t)); m.position.copy(q.pos); m.quaternion.copy(q.quat); }, ease.in);
    next?.();
    const a = exit.pos.clone();
    await this.motion.tween(620, t => { m.position.lerpVectors(a, into, t); m.position.y += Math.sin(Math.PI * t) * 7; m.quaternion.slerpQuaternions(exit.quat, qD, smooth(t)); }, ease.inOut);
    this.T.remove(m); this.world.discard.set(this.world.discard.count + 1);
  }
  // Checking the hole card: the dealer bends up its near corner, looks, lays it flat.
  async peek() {
    const c = this.handCards('dealer')[1]; if (!c) return; const m = c.mesh, base = m.position.clone();
    await this.motion.tween(TIMING.peek * this.dealer.speed, t => { const a = Math.sin(Math.PI * t) * .3; m.quaternion.copy(cardQuat(c.heading, 0, -a)); m.position.set(base.x, base.y + Math.sin(a) * CARD_H * .22, base.z); }, ease.inOut);
    m.position.copy(base); m.quaternion.copy(cardQuat(c.heading, 0));
  }
  // The reveal as dealers do it: the up card's corner slides under the hole card and levers it
  // over. It pivots on its far long edge while that edge slides back, so it lands where it lay.
  async reveal() {
    const c = this.handCards('dealer').find(x => x.hidden); if (!c) return; c.hidden = false;
    await this.turnOver(c, TIMING.reveal * this.dealer.speed);
  }
  // Turn a face-down card over where it lies: it pivots on its far long edge while that edge slides
  // back, so it lands where it lay.
  async turnOver(c, ms) {
    const m = c.mesh, base = m.position.clone(), q0 = m.quaternion.clone();
    const across = V(1, 0, 0).applyAxisAngle(UP, c.heading), axis = V(0, 0, 0).crossVectors(UP, across).normalize(), half = CARD_W / 2;
    let snapped = false;
    await this.motion.tween(ms, t => {
      if (!snapped && t > .82) { snapped = true; this.audio?.play('turn', { x: base.x }); }
      const th = Math.PI * t, hinge = base.clone().addScaledVector(across, half - CARD_W * smooth(t));
      const off = across.clone().multiplyScalar(-half).applyAxisAngle(axis, th);
      m.position.copy(hinge).add(off); m.position.y = base.y + Math.max(0, off.y) + .02;
      m.quaternion.copy(turnAbout(axis, th).multiply(q0));
    }, ease.inOut);
    m.position.copy(base); m.quaternion.copy(cardQuat(c.heading, 1));
  }
  // Split: hand `at`'s second card slides across to become a new hand beside it (`at + 1`; the hands after it move
  // up one), and every hand and stake shuffles over to its place for `n` hands. `seat`: another player's, else yours.
  async splitHands(at = 0, n = 2, seat = null) {
    const key = j => handKey(seat, j), owner = j => seat == null ? j : key(j);
    const second = this.handCards(owner(at))[1];
    for (let j = n - 2; j > at; j--) {   // the hands after the split move up one, last first
      for (const c of this.handCards(owner(j))) c.owner = owner(j + 1);
      for (const s of ['', 'f']) { this.stacks.delete(key(j + 1) + s); this.rename(key(j) + s, key(j + 1) + s); }
    }
    second.owner = owner(at + 1); second.i = 0;
    if (seat == null) this.handCount = n; else this.seatSplits.set(seat, n);
    const cards = this.cards.filter(c => seat == null ? typeof c.owner === 'number' : seatOf(c.owner) === seat);
    const moves = cards.map(c => { const from = c.mesh.position.clone(), to = this.anchor(c.owner, c.i, c.turn).pos;
      return this.motion.tween(TIMING.split, t => { c.mesh.position.lerpVectors(from, to, t); c.mesh.position.y += Math.sin(Math.PI * t) * .8; }, ease.inOut); });
    for (let j = 0; j < n; j++) for (const s of ['', 'f']) {   // stakes and markers slide to their new spots, each chip at its height
      const k = key(j) + s, chips = this.chipsOf(k), from = chips.map(c => c.position.clone());
      if (chips.length) moves.push(this.motion.tween(TIMING.split, t => chips.forEach((c, i) => { const to = this.chipSlot(k, i); c.position.set(from[i].x + (to.x - from[i].x) * t, from[i].y, from[i].z + (to.z - from[i].z) * t); }), ease.inOut));
    }
    this.audio?.play('slide', { gain: seat == null ? .6 : .5, x: second.mesh.position.x }); await Promise.all(moves);
  }
  // Another player splits: the same moves as yours, at their seat.
  splitSeat(k, at = 0, n = 2) { return this.splitHands(at, n, k); }

  // ---- the clear-up ------------------------------------------------------------------------------
  // Right to left, as regulations ask: each hand is squared up onto its first card, the piles are
  // slid to the dealer and joined with the dealer's cards, the packet is turned face down and
  // lowered into the discard holder.
  async collectCards() {
    if (!this.cards.length) return;
    // every player's hand, taken up from the dealer's right (your left) to the dealer's left
    const owners = [...new Set(this.cards.map(c => c.owner))].filter(o => o !== 'dealer');
    const hands = owners.map(o => this.handCards(o)).filter(h => h.length).sort((a, b) => a[0].mesh.position.x - b[0].mesh.position.x), dealer = this.handCards('dealer');
    this.audio?.play('square', { x: 0 });
    // square each hand up (stays on the cloth)
    await Promise.all([...hands, dealer].map(h => { const b = h[0].mesh.position.clone();
      return Promise.all(h.map((c, k) => { const from = c.mesh.position.clone(), q0 = c.mesh.quaternion.clone(), q1 = cardQuat((c.yaw ?? 0) + (c.flipFace ? Math.PI : 0), 1), to = V(b.x, .05 + k * CARD_T, b.z);
        return this.motion.tween(TIMING.square * this.dealer.speed, t => { c.mesh.position.lerpVectors(from, to, t); c.mesh.quaternion.slerpQuaternions(q0, q1, t); }, ease.inOut); })); }));
    const G = V(LAYOUT.dealer.x + 10, .05, LAYOUT.dealer.z + 8), order = [...hands.flat(), ...dealer];
    let height = 0;
    for (const h of [...hands, dealer]) {       // one pile after another slides in and lands on the packet
      const y0 = height; height += h.length * CARD_T; this.audio?.play('gather', { x: h[0].mesh.position.x });
      await Promise.all(h.map((c, k) => { const from = c.mesh.position.clone(), to = V(G.x, .05 + y0 + k * CARD_T, G.z), q0 = c.mesh.quaternion.clone(), q1 = cardQuat(c.flipFace ? Math.PI : 0, 1);
        return this.motion.tween(TIMING.gather * this.dealer.speed, t => { c.mesh.position.lerpVectors(from, to, t); c.mesh.position.y += Math.sin(Math.PI * t) * .25; if (c.yaw) c.mesh.quaternion.slerpQuaternions(q0, q1, t); }, ease.inOut); }));
    }
    // turn the packet over its long edge, then into the holder
    const n = order.length, packet = new THREE.Group(); packet.position.copy(G); this.T.add(packet);
    for (const c of order) packet.attach(c.mesh);
    const edge = CARD_W / 2;
    await this.motion.tween(320, t => { const th = Math.PI * t; packet.rotation.z = -th; packet.position.x = G.x + edge - Math.cos(th) * edge; packet.position.y = G.y + Math.sin(th) * edge + t * n * CARD_T; }, ease.inOut);
    const d = this.world.discard.group; d.updateMatrixWorld();
    const into = V(0, this.world.discard.topY() + .3, 0).applyMatrix4(d.matrix), from = packet.position.clone(), r0 = packet.rotation.y;
    await this.motion.tween(TIMING.discard * this.dealer.speed, t => { packet.position.lerpVectors(from, into, t); packet.position.y += Math.sin(Math.PI * t) * 8; packet.rotation.y = r0 + (d.rotation.y - r0) * smooth(t); }, ease.inOut);
    this.T.remove(packet); this.cards = []; this.handCount = 1; this.seatSplits.clear();
    this.world.discard.set(this.world.discard.count + n); this.audio?.play('land', { x: into.x, gain: 1.6 });
  }
  clearCards() { for (const c of this.cards) c.mesh.parent?.remove(c.mesh); this.cards = []; this.handCount = 1; this.seatSplits.clear(); this.world.requestRender(); }

  // ---- the cut card and a new shoe -------------------------------------------------------------------
  // When the cut card reaches the front the dealer takes it out and lays it beside the shoe:
  // this round finishes, then the shoe is replaced.
  async ejectCut() {
    const g = this.cutCard ??= new THREE.Mesh(new THREE.BoxGeometry(CARD_W, CARD_T * 2, CARD_H), new THREE.MeshStandardMaterial({ color: '#f2c417', roughness: .4 }));   // one card, every shoe
    const from = this.shoeToTable(this.world.shoe.frontPose()), to = V(LAYOUT.shoe.x + 6, .06, LAYOUT.shoe.z + 12);
    g.position.copy(from.pos); g.castShadow = true; this.T.add(g); this.cutOnFelt = g;
    const q0 = from.quat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))), q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, .5, 0));
    this.audio?.play('slide', { x: LAYOUT.shoe.x });
    await this.motion.tween(520, t => { g.position.lerpVectors(from.pos, to, t); g.position.y += Math.sin(Math.PI * t) * 4; g.quaternion.slerpQuaternions(q0, q1, t); }, ease.inOut);
  }
  async newShoe(total, untilCut) {
    if (this.cutOnFelt) { this.T.remove(this.cutOnFelt); this.cutOnFelt = null; }
    if (this.front) { this.world.shoe.group.remove(this.front); this.front = null; }
    this.audio?.play('shuffle', { x: LAYOUT.shoe.x });
    const had = this.world.discard.count;
    await this.motion.tween(TIMING.shoeFill, t => { this.world.discard.set(Math.round(had * (1 - t))); this.world.shoe.setStack(Math.max(2, Math.round(total * t)), t > .7 ? untilCut : 0); }, ease.inOut);
    this.world.discard.set(0); this.syncShoe(total, untilCut);
  }
}
