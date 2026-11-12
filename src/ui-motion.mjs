// Motion for the screen chrome (not the table): spring physics from anime.js for touch feedback, the Web Animations
// API for what comes and goes, and Torph for text and numbers that morph in place instead of blinking.
// The 3D table keeps its own motion engine; this only moves DOM.
import { animate, spring as createSpring, utils } from './vendor/anime.mjs';
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
// ---- things coming and going --------------------------------------------------------------------------
// Entrances and exits run on the Web Animations API, not on script: opacity, translate and scale are then the
// compositor's, so they stay smooth while the main thread is drawing the table (a deal, the cards swept away), and a
// `backwards` fill has the first keyframe on the element in the very frame it is shown (set from script it came a frame
// late: the finished state flashed first). The fade and the movement are two animations: the movement on one of the
// stylesheet's springs (app.css: `linear()` curves, or the nearest cubic curve in an older browser), the fade on a
// plain ease-out, as a spring is front-loaded and would have a third of the fade done in its first frame.
const curve = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'cubic-bezier(.22, 1, .36, 1)';
const FADE = 'cubic-bezier(.3, 0, .4, 1)';
const running = new WeakMap();   // element → the animations of its entrance or exit, so the next one takes over from them
const stop = el => { for (const a of running.get(el) ?? []) a.cancel(); running.delete(el); };
function play(el, list) {
  const made = list.map(([frames, opts]) => { try { return el.animate(frames, opts); } catch { return el.animate(frames, { ...opts, easing: 'ease-out' }); } });
  running.set(el, [...(running.get(el) ?? []), ...made]);
  Promise.all(made.map(a => a.finished)).then(() => { const left = (running.get(el) ?? []).filter(a => !made.includes(a)); if (left.length) running.set(el, left); else running.delete(el); }, () => {});
  return made;
}
// Something appearing: grows in with a small overshoot.
export function pop(el, { from = .6, delay = 0 } = {}) {
  if (!el) return; stop(el); if (reduced) return;
  play(el, [[[{ offset: 0, opacity: 0 }], { duration: 200, delay, easing: FADE, fill: 'backwards' }],
    [[{ offset: 0, scale: String(from) }], { duration: 460, delay, easing: curve('--spring-pop'), fill: 'backwards' }]]);
}
// A group entering: each item rises into place a beat after the one before (an item may be a list of elements that
// rise on the same beat). Only where it starts is given (clear, and `y` px low): where it ends is whatever the
// stylesheet has for it at that moment, so a control that enters disabled arrives dimmed and stays so, a transform of
// the item's own (the chip in hand stands lifted) is left alone, and nothing is left on the element afterwards.
// (An element moved this way is, while it moves, what its absolutely placed descendants are laid out against: give
// the parts of such a block, not the block.)
export function enter(els, { y = 14, gap = 35, delay = 0, ms = 320 } = {}) {
  const beats = [...els].map(item => [].concat(item).filter(e => e && e.offsetParent !== null)).filter(b => b.length); if (!beats.length) return;
  for (const e of beats.flat()) stop(e);
  if (reduced) return;
  const spring = curve('--spring-press');
  beats.forEach((beat, i) => { const d = delay + i * gap; for (const e of beat) play(e, [[[{ offset: 0, opacity: 0 }], { duration: ms * .8, delay: d, easing: FADE, fill: 'backwards' }],
    [[{ offset: 0, translate: `0 ${y}px` }], { duration: ms, delay: d, easing: spring, fill: 'backwards' }]]); });
}
// Something going: it fades and softens out (dropping `y` px, or shrinking to `scale`) from wherever it stands and is
// then hidden, instead of vanishing in a frame (transitions.dev's panel and tooltip closes: quicker out than in).
// `shown` puts it back at once, cancelling an exit still running.
export function leave(el, { y = 0, scale = 1, ms = 220 } = {}) {
  if (!el || el.hidden || el.dataset.leaving) return;
  if (reduced) { el.hidden = true; return; }
  const mark = el.dataset.leaving = String(Math.random());
  const [a] = play(el, [[[{ offset: 1, opacity: 0, filter: 'blur(2px)', ...(y ? { translate: `0 ${y}px` } : {}), ...(scale !== 1 ? { scale: String(scale) } : {}) }], { duration: ms, easing: 'cubic-bezier(.4, 0, .7, 1)', fill: 'forwards' }]]);
  a.finished.then(() => { if (el.dataset.leaving !== mark) return; el.hidden = true; delete el.dataset.leaving; stop(el); }, () => {});
}
export function shown(el) { if (!el) return; if (el.dataset.leaving) { delete el.dataset.leaving; stop(el); } el.hidden = false; }
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
