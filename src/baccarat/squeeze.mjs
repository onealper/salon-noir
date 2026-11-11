// The squeeze: your cards lie face down in front of you, and you turn them yourself. Put a finger (or the pointer) on
// a card and draw it across: the edge behind the finger comes up, round a tight fold and over onto the card's back,
// showing the pips under it a row or a column at a time, as a baccarat player peels a card up by its edge. Let go and
// it falls back; draw it half over (or let go of a card well begun, or flick it) and it turns right over and lies face
// up. A tap on the card lifts its edge and drops it, to show the way; the Turn over button and Space turn the next
// card at once. The fold's geometry is baccarat/fold.mjs; the card bends in scene/pieces.mjs (bendCard).
import * as THREE from '../vendor/three.module.min.js';
import { CARD_W, CARD_H } from '../scene/textures.mjs';
import { bendCard, cardQuat, ease } from '../scene/pieces.mjs';
import { FOLD_R, peel, reach, turnOver } from './fold.mjs';

const BEND = { k: -1 / FOLD_R, L: Math.PI * FOLD_R };   // up off the cloth (the face is under it), half a turn, then flat on its back
const LONG = new THREE.Vector3(0, 1, 0), SHORT = new THREE.Vector3(1, 0, 0);

export function createSqueeze({ world, view, el, motion, audio, feel }) {
  const cam = world.camera, ray = new THREE.Raycaster(), cloth = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), ndc = new THREE.Vector2();
  let cards = [], drag = null, done = null, onTurn = null, busy = new Set();
  const down = () => cards.filter(c => c.hidden && !busy.has(c));
  // the pointer on the cloth, in a card's own frame
  function at(e, c) {
    const r = el.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
    ray.setFromCamera(ndc, cam); cloth.constant = -c.mesh.getWorldPosition(hit).y; if (!ray.ray.intersectPlane(cloth, hit)) return null;
    return c.mesh.worldToLocal(hit.clone());
  }
  const fold = (c, p) => { bendCard(c.mesh, p ? { dir: p.dir, s0: p.s0, ...BEND } : null); world.requestRender(); };
  const part = p => (reach(p.dir, CARD_W, CARD_H) - p.s0) / (2 * reach(p.dir, CARD_W, CARD_H));   // how much of the card is over, 0 to 1

  // A card turned right over from the fold it is in (or from flat, by the dealer's own turn), then told about.
  async function finish(c, p) {
    busy.add(c);
    if (!p) await view.turnOver(c, 300 * view.dealer.speed);
    else {
      const m = c.mesh, base = m.position.clone(), q0 = m.quaternion.clone(), way = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      let snapped = false;
      await motion.tween(Math.max(150, 330 * (1 - part(p) * .5)), e => {
        const t = turnOver(p, e, { w: CARD_W, h: CARD_H });
        bendCard(m, { dir: t.dir, s0: t.s0, ...BEND });
        way.set(t.to[0], t.to[1], 0).applyQuaternion(q0);   // the square way, on the cloth
        m.position.copy(base).addScaledVector(way, t.back).addScaledVector(up, -t.down);
        if (!snapped && e > .7) { snapped = true; audio?.play('turn', { x: base.x }); }
      }, ease.inOut);
      // flat again, face up, exactly where the fold left it: turned about the square way's own axis through its middle
      const t = turnOver(p, 1, { w: CARD_W, h: CARD_H });
      bendCard(m, null); m.position.copy(base); m.quaternion.copy(q0).multiply(new THREE.Quaternion().setFromAxisAngle(t.to[0] ? LONG : SHORT, Math.PI));
    }
    view.turned(c); busy.delete(c); feel?.tap('chip'); world.requestRender();
    onTurn?.(c);
    if (!cards.some(x => x.hidden)) { const d = done; done = null; d?.(); }
  }
  // let go too soon: the edge falls back
  async function fall(c, p0) {
    busy.add(c); const D0 = p0.D;
    await motion.tween(170, t => { const D = D0 * (1 - t), p = D > .03 ? peel(p0.x0, p0.y0, p0.x0 + p0.ux * D, p0.y0 + p0.uy * D, { w: CARD_W, h: CARD_H }) : null; fold(c, p); }, ease.out);
    fold(c, null); busy.delete(c);
  }
  // a tap: the edge nearest you lifts and drops, to show the way
  async function nudge(c, y0 = -CARD_H / 2 + .2) {
    busy.add(c);
    await motion.tween(420, t => fold(c, peel(0, y0, 0, y0 + Math.sin(Math.PI * t) * 1.1, { w: CARD_W, h: CARD_H })), ease.inOut);
    fold(c, null); busy.delete(c);
  }

  function onDown(e) {
    if (!done || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    for (const c of down()) {
      const p = at(e, c); if (!p || Math.abs(p.x) > CARD_W / 2 + .9 || Math.abs(p.y) > CARD_H / 2 + .9) continue;
      drag = { c, id: e.pointerId, x0: p.x, y0: p.y, t0: performance.now(), far: 0, p: null, v: 0, tLast: performance.now(), dLast: 0 };
      try { el.setPointerCapture(e.pointerId); } catch { /* a pointer already gone */ }
      audio?.play('slide', { x: c.mesh.position.x, gain: .35 }); e.preventDefault(); return;
    }
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const q = at(e, drag.c); if (!q) return;
    const p = peel(drag.x0, drag.y0, q.x, q.y, { w: CARD_W, h: CARD_H }), now = performance.now(), D = p?.D ?? 0;
    if (now > drag.tLast) { drag.v = drag.v * .5 + (D - drag.dLast) / (now - drag.tLast) * 500; drag.tLast = now; drag.dLast = D; }   // its speed, cm a second, smoothed
    drag.far = Math.max(drag.far, D); drag.p = p && { ...p, x0: drag.x0, y0: drag.y0, ux: -p.dir[0], uy: -p.dir[1] };
    if (p?.turned) { const { c, p: at0 } = drag; release(e); finish(c, at0); return; }
    fold(drag.c, p);
  }
  function release(e) { try { el.releasePointerCapture(e.pointerId); } catch { /* not held */ } drag = null; }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const { c, p, far, t0, v } = drag; release(e);
    if (far < .25 && performance.now() - t0 < 350) { fold(c, null); nudge(c); return; }   // a tap
    if (p && (part(p) > .34 || (v > 22 && part(p) > .1))) finish(c, p);   // well begun, or flicked: over it goes
    else if (p) fall(c, p); else fold(c, null);
  }
  function onCancel(e) { if (!drag || e.pointerId !== drag.id) return; const { c, p } = drag; release(e); if (p) fall(c, p); else fold(c, null); }
  el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onCancel);

  return {
    get active() { return !!done; },
    get left() { return cards.filter(c => c.hidden).length; },
    // `list`: the cards to turn (as the dealer's view holds them, lying face down); `turned(c)` as each is. Resolves once all are face up.
    begin(list, turned) { cards = list; onTurn = turned; return new Promise(r => { done = r; if (!cards.some(c => c.hidden)) { done = null; r(); } }); },
    // the next card still face down turned at once (the button, Space): the one being held, else the left one
    turn() { if (!done) return false; const c = drag?.c ?? down()[0]; if (!c) return false; if (drag) { try { el.releasePointerCapture(drag.id); } catch { /* not held */ } drag = null; fold(c, null); } finish(c, null); return true; },
    nudge() { const c = down()[0]; if (done && c && !drag) nudge(c); },
    // (a round cut short: whatever is folded lies flat again)
    end() { for (const c of cards) if (c.hidden) bendCard(c.mesh, null); cards = []; drag = null; busy.clear(); const d = done; done = null; d?.(); },
  };
}
