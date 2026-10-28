// Motion for the screen chrome (not the table): spring physics from anime.js for touch feedback
// and entrances, and Torph for text and numbers that morph in place instead of blinking.
// The 3D table keeps its own motion engine; this only moves DOM.
import { animate, stagger, spring as createSpring, utils } from './vendor/anime.mjs';
import { TextMorph } from './vendor/torph.mjs';

let reduced = false;
export const setReduced = on => { reduced = on; };

// Springs tuned like physical controls: a press is quick and firm, a release overshoots a little.
const S = {
  press: createSpring({ stiffness: 520, damping: 26 }),
  release: createSpring({ bounce: .45, duration: 380 }),
  pop: createSpring({ bounce: .38, duration: 460 }),
  soft: createSpring({ bounce: .18, duration: 420 }),
};

// ---- touch feedback -----------------------------------------------------------------------------------
// Buttons squash under the finger and spring back when let go.
export function pressable(root, selector, { depth = .93, target = el => el } = {}) {
  root.addEventListener('pointerdown', e => {
    const el = e.target.closest(selector); if (!el || el.disabled || reduced) return;
    const t = target(el); animate(t, { scale: depth, ease: S.press, duration: 140 });
    const up = () => { animate(t, { scale: 1, ease: S.release }); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
}
// A refused tap: a short sideways shake, like a head shake.
export function shake(el) {
  if (reduced || !el) return;
  animate(el, { translateX: [0, -6, 6, -4, 3, 0], duration: 380, ease: 'outQuad' });
}
// Something appearing: grows in with a small overshoot.
export function pop(el, { from = .6, delay = 0 } = {}) {
  if (!el) return; if (reduced) { utils.set(el, { opacity: 1, scale: 1 }); return; }
  animate(el, { opacity: [0, 1], scale: [from, 1], ease: S.pop, delay });
}
// A group entering: each item rises into place a beat after the one before. It moves on the `translate` property and
// lets go of its inline opacity and offset once in place, so the stylesheet rules again: a disabled control looks
// disabled, and a transform of the item's own (the chip in hand stands lifted) is left alone.
const release = els => { for (const e of els) { e.style.removeProperty('opacity'); e.style.removeProperty('translate'); } };
export function enter(els, { y = 14, gap = 35, from = 'first' } = {}) {
  els = [...els].filter(e => e && e.offsetParent !== null); if (!els.length) return;
  if (reduced) { utils.remove(els, null, 'opacity'); utils.remove(els, null, 'translate'); release(els); return; }
  animate(els, { opacity: [0, 1], translate: [`0px ${y}px`, '0px 0px'], ease: S.soft, delay: stagger(gap, { from }), onComplete: () => release(els) });
}
// Something going: it fades and softens out (dropping `y` px, or shrinking to `scale`) and is then hidden, instead of
// vanishing in a frame (transitions.dev's panel and tooltip closes: quicker out than in). `shown` puts it back at once,
// cancelling an exit still running.
const settle = el => { delete el.dataset.leaving; for (const p of ['opacity', 'filter', 'translate', 'scale']) el.style.removeProperty(p); };
export function leave(el, { y = 0, scale = 1, ms = 220 } = {}) {
  if (!el || el.hidden) return;
  if (reduced) { el.hidden = true; settle(el); return; }
  const mark = el.dataset.leaving = String(Math.random());
  animate(el, { opacity: [1, 0], filter: ['blur(0px)', 'blur(2px)'], ...(y ? { translate: ['0px 0px', `0px ${y}px`] } : {}), ...(scale !== 1 ? { scale: [1, scale] } : {}),
    duration: ms, ease: 'outQuad', onComplete: () => { if (el.dataset.leaving === mark) { el.hidden = true; settle(el); } } });
}
export function shown(el) { if (!el) return; if (el.dataset.leaving) { utils.remove(el); settle(el); } el.hidden = false; }
// A value that changed: a quick bump so the eye catches it.
export function bump(el, k = 1.14) {
  if (reduced || !el) return;
  animate(el, { scale: [k, 1], ease: S.pop });
}
// The chip in hand stands up out of the row; the others settle.
export function lift(chips, selected) {
  for (const c of chips) {
    const on = c === selected;
    if (reduced) { utils.set(c, { translateY: on ? -7 : 0 }); continue; }
    animate(c, { translateY: on ? -7 : 0, ease: on ? S.pop : S.soft });
  }
}
// ---- text that morphs in place -------------------------------------------------------------------------
// Numbers roll by place value; words change letter by letter where they share letters.
const morphs = new WeakMap();
export function morph(el, value) {
  if (!el) return; value = String(value);
  let m = morphs.get(el);
  if (reduced) { if (m) { m.destroy(); morphs.delete(el); } el.textContent = value; return; }
  if (!m) { el.textContent = ''; m = new TextMorph({ element: el, ease: { stiffness: 260, damping: 26 } }); morphs.set(el, m); }
  m.update(value);
}
