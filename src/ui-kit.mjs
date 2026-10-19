// Interface pieces ported to plain JavaScript for Spader.
//  - Magic UI (magicui.design, MIT; the originals behind many 21st.dev components):
//    Shimmer Button, Animated Circular Progress Bar.
//  - Kinetics (kinetics.colorion.co by ckissi): Push Button, Hold to Confirm, Switch Spring,
//    Toast Overshoot, Badge Counter, Accordion Spring, Error Shake - timings and curves as published.
// React/Tailwind/motion were replaced with DOM, CSS and the Web Animations API; behaviour matches.

let reduced = false;
export const setReduced = on => { reduced = on; };
const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; parent?.append(e); return e; };

// ---- Magic UI: Shimmer Button ----------------------------------------------------------------------
// A spark of light runs round the rim: a rotating conic gradient, blurred, behind a backdrop inset
// by the rim width, sliding across the button inside a size container.
export function shimmer(button, { color = '#fff6dc', speed = '3s', cut = '2px', spread = '90deg' } = {}) {
  button.classList.add('shimmer');
  for (const [k, v] of [['--shimmer-color', color], ['--speed', speed], ['--cut', cut], ['--spread', spread]]) button.style.setProperty(k, v);
  const wrap = el('span', 'shimmer-spark-wrap'), spark = el('span', 'shimmer-spark', wrap); el('span', 'shimmer-cone', spark);
  button.prepend(wrap, el('span', 'shimmer-backdrop'));
  el('span', 'shimmer-highlight', button);
}

// ---- Magic UI: Animated Circular Progress Bar ---------------------------------------------------------
// A ring split into a filled arc and a track arc with a 5% gap on each side; both ease on change.
const C = 2 * Math.PI * 45, PP = C / 100, GAP = 5;
export function gauge(host, { primary = '#c9a45c', secondary = '#2c2c31', mark = null } = {}) {
  host.classList.add('gauge');
  host.innerHTML = `<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><circle class="g2" cx="50" cy="50" r="45" stroke-width="10" stroke-linecap="round"/><circle class="g1" cx="50" cy="50" r="45" stroke-width="10" stroke-linecap="round"/>${mark != null ? '<circle class="gm" r="5"/>' : ''}</svg>`;
  const g1 = host.querySelector('.g1'), g2 = host.querySelector('.g2');
  g1.style.stroke = primary; g2.style.stroke = secondary;
  if (mark != null) { const a = (-90 + mark * 3.6) * Math.PI / 180, m = host.querySelector('.gm'); m.setAttribute('cx', 50 + Math.cos(a) * 45); m.setAttribute('cy', 50 + Math.sin(a) * 45); }
  return pct => {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    g1.style.display = p > 0 ? '' : 'none'; g2.style.display = p <= 90 ? '' : 'none';
    g1.style.strokeDasharray = `${p * PP} ${C}`; g1.style.transform = 'rotate(-90deg)';
    g2.style.strokeDasharray = `${(90 - p) * PP} ${C}`; g2.style.transform = `rotate(${360 - 90 - GAP * 3.6}deg) scaleY(-1)`;
  };
}

// ---- Kinetics: Hold to Confirm ------------------------------------------------------------------------
// Press and hold: a ring fills over 800 ms; let go early and it drains back.
export function holdToConfirm(button, onConfirm, ms = 800) {
  button.classList.add('hold-btn');
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ring.setAttribute('viewBox', '0 0 70 70'); ring.setAttribute('class', 'hold-ring'); ring.setAttribute('aria-hidden', 'true');
  ring.innerHTML = '<circle class="track" cx="35" cy="35" r="33"/><circle class="prog" cx="35" cy="35" r="33"/>';
  button.prepend(ring);
  let timer = 0;
  const start = e => { if (e.button > 0) return; button.classList.add('holding'); timer = setTimeout(() => { button.classList.remove('holding'); button.classList.add('done'); onConfirm(); setTimeout(() => button.classList.remove('done'), 900); }, ms); };
  const stop = () => { clearTimeout(timer); button.classList.remove('holding'); };
  button.addEventListener('pointerdown', start);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(ev, stop);
  button.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start({ button: 0 }); } });
  button.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') stop(); });
}

// ---- Kinetics: Error Shake -----------------------------------------------------------------------------
export function shake(target) {
  if (reduced || !target) return;
  target.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-1px)', offset: .1 }, { transform: 'translateX(2px)', offset: .2 }, { transform: 'translateX(-4px)', offset: .3 }, { transform: 'translateX(4px)', offset: .4 }, { transform: 'translateX(-4px)', offset: .5 }, { transform: 'translateX(4px)', offset: .6 }, { transform: 'translateX(-4px)', offset: .7 }, { transform: 'translateX(2px)', offset: .8 }, { transform: 'translateX(-1px)', offset: .9 }, { transform: 'translateX(0)' }],
    { duration: 450, easing: 'cubic-bezier(.36,.07,.19,.97)' });
}

// ---- Kinetics: Badge Counter ------------------------------------------------------------------------------
// The count springs up to 1.4x and back each time it changes.
export function badge(target, text) {
  if (target.textContent === text) return;
  target.textContent = text;
  if (reduced || !text) return;
  target.classList.remove('pop'); void target.offsetWidth; target.classList.add('pop');
  clearTimeout(target._pop); target._pop = setTimeout(() => target.classList.remove('pop'), 320);
}

// ---- Kinetics: Accordion Spring -------------------------------------------------------------------------------
// Sections open on a long soft curve; the chevron overshoots as it turns.
export function accordion(details) {
  const summary = details.querySelector('summary'), body = details.querySelector('.acc-body');
  summary.addEventListener('click', e => {
    e.preventDefault();
    if (reduced) { details.open = !details.open; return; }
    if (!details.open) {
      details.open = true; details.classList.add('open');
      const h = body.scrollHeight; body.animate([{ maxHeight: '0px' }, { maxHeight: `${h}px` }], { duration: 450, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    } else {
      details.classList.remove('open');
      const h = body.scrollHeight, a = body.animate([{ maxHeight: `${h}px` }, { maxHeight: '0px' }], { duration: 300, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      a.onfinish = () => { details.open = false; };
    }
  });
  if (details.open) details.classList.add('open');
}
