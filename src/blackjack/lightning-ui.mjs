// The Lightning table's show (blackjack). Modelled on the live game: a black-and-gold board of multipliers over the
// dealer, struck as the cards go out. The house lights dip, and for each total a bolt comes down out of the dark through
// its cell and grounds on the felt in sparks. Win on a struck total and a bolt carries that multiplier from the board
// down to a badge on your bet, where it waits for your next win; cash it and a gold bolt hits the badge and the whole
// table flashes. Outside, a storm comes nearer as a bigger multiplier rides on your bet (storm.mjs). The bolts, burns
// and lamp are scene/lightning3d.mjs; the multipliers are the engine's.
import { BUCKETS } from '../engine.mjs';
import { LAYOUT } from '../scene/world.mjs';
import { createLightning3D } from '../scene/lightning3d.mjs';
import { createStorm } from './storm.mjs';
import { fmt } from '../core/format.mjs';
import * as ui from '../ui-motion.mjs';

const LABEL = { le17: '4–17', 18: '18', 19: '19', 20: '20', 21: '21', bj: 'BJ' };
// `inView`: you can see the table (not the lobby, not the wheel); `shown`: the room is in sight (behind the lobby too);
// `reframe`: the seat is framed again (the board takes the head of the table)
export function createLightningUI({ world, table, motion, audio, settings, take, stage, overlay, inView, shown, reframe }) {
  const L = createLightning3D(world, { reduced: () => settings.reduced || settings.flash === 'off', soft: () => settings.flash === 'soft' }); let rumbleAt = -Infinity;
  const storm = createStorm({ three: L, audio, settings, take });
  const box = document.querySelector('#lightning'), row = box.querySelector('.lb-row'), cells = {};
  for (const b of BUCKETS) { const c = document.createElement('div'); c.className = 'lb-cell'; c.dataset.b = b; c.innerHTML = `<small>${LABEL[b]}</small><b>–</b>`; row.append(c); cells[b] = c; }
  const fx = document.createElement('div'); fx.className = 'zap'; fx.hidden = true; fx.innerHTML = '<div class="flash"></div><div class="splash" hidden><small>Lightning</small><b></b><em></em></div>'; stage.append(fx);
  const flashEl = fx.querySelector('.flash'), splash = fx.querySelector('.splash');
  const badge = document.createElement('div'); badge.className = 'l-badge'; badge.hidden = true; badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 2 4.8 13.4h6l-1.4 8.6 8.8-11.4h-6L13.6 2Z"/></svg><b></b><small></small>'; overlay.append(badge);
  // the stage flash: two peaks at full; at soft one low peak (the strikes come no faster than three a second); none when off
  function flash(power = .3) {
    if (settings.reduced || settings.flash === 'off') return;
    if (settings.flash === 'soft') {   // (a slow frame can land two bolts close together: they share one flash)
      if (performance.now() - (flash.at ?? -1e9) < 330) return; flash.at = performance.now();
      flashEl.animate([{ opacity: Math.min(.2, power * .45) }, { opacity: 0 }], { duration: 420, easing: 'ease-out' }); return;
    }
    flashEl.animate([{ opacity: power }, { opacity: power * .2, offset: .2 }, { opacity: power * .7, offset: .3 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' });
  }
  function shake(px = 4) { if (settings.reduced) return; stage.animate([{ translate: '0 0' }, { translate: `${px}px ${-px / 2}px` }, { translate: `${-px}px ${px / 2}px` }, { translate: `${px / 2}px 0` }, { translate: '0 0' }], { duration: 260 }); }
  const set = (b, text) => { const v = cells[b].querySelector('b'); if (v.textContent !== text) ui.morph(v, text); };
  const blank = () => { for (const b of BUCKETS) { set(b, '–'); cells[b].classList.remove('struck', 'hot', 'lit', 'flash'); } };
  // a board cell in screen terms (NDC): its centre x and its bottom edge
  const ndcOf = el => { const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: ((r.left + r.width / 2 - s.left) / s.width) * 2 - 1, bottom: 1 - ((r.bottom - s.top) / s.height) * 2 }; };
  // your badge sits on the near rim of your main circle, as the live game marks the bet it rides on
  const rim = () => { const m = LAYOUT.spots.main; return new world.THREE.Vector3(m.x, 1.5, m.z + m.r); };
  function renderBadge(fresh) {
    const p = table.pending, on = !!p && table.mode === 'lightning' && inView();   // the current runs only where you can see it
    storm.pull(table.mode === 'lightning' ? p?.m : 0);   // the storm comes as near as the multiplier is big
    badge.hidden = !on; L.charge(on); if (!on) return;   // live current runs round your circle while the multiplier waits
    badge.querySelector('b').textContent = `×${p.m}`; badge.querySelector('small').textContent = `pays ${fmt(p.fee * p.m)}`;
    badge.title = `Lightning ×${p.m}: your next win pays ${fmt(p.fee * p.m)} more`;
    layout(); if (fresh) { badge.classList.remove('arrive'); void badge.offsetWidth; badge.classList.add('arrive'); }
  }
  function layout() { if (!badge.hidden) { const m = LAYOUT.spots.main, q = world.project(m.x, 0, m.z + m.r); badge.style.left = `${Math.round(q.x)}px`; badge.style.top = `${Math.round(q.y)}px`; } }   // left/top, not transform: the arrive and spent animations scale the badge
  return {
    layout, three: L, cellNdc: b => ndcOf(cells[b]),
    show(on) { box.hidden = fx.hidden = !on; L.setTable(on); if (!on) L.clear(); else if (table.phase === 'betting') blank(); reframe(); renderBadge(false); storm.run(on && shown()); },
    reset() { if (!box.hidden) blank(); renderBadge(false); },
    badge: () => { renderBadge(false); storm.run(!box.hidden && shown()); },   // the lobby or the other room came or went
    preview(on) {   // the lobby's look at the table: bolts now and then, and a storm rolling far off (not again within half a minute)
      L.ambient(on);
      if (on && audio.live && performance.now() - rumbleAt > 30000) { rumbleAt = performance.now(); audio.cue('thunder-rumble', { bus: 'room', gain: 2.5 }); }
    },
    async strike(board) {
      storm.hold(true); try { await strikeBoard(board); } finally { storm.hold(false); }
    },
    async settle(r) {
      if (r.bonus) storm.hold(true);
      try { await settleShow(r); } finally { if (r.bonus) { storm.hold(false); storm.peak(); } }   // a multiplier paid: the storm comes right over
    },
  };
  async function strikeBoard(board) {
    blank(); box.classList.add('charging'); audio.cue('charge', { gain: .55 });
    const fast = settings.fast, gap = motion.reduced ? 0 : settings.flash === 'soft' ? 360 / motion.slow : fast ? 150 : 230;   // soft: a strike each 360 ms (fast play or not), under three flashes a second
    await L.dim(1); await motion.wait(fast ? 180 : 260);
    // strike in a shuffled order, the biggest last, as the live show builds to it
    const order = [...BUCKETS].sort(() => Math.random() - .5).sort((a, b) => board[a] - board[b]);
    for (const [i, b] of order.entries()) {
      const m = board[b], hot = m >= (b === 'bj' ? 15 : 8), c = cells[b], n = ndcOf(c);
      // down through the cell and into the felt; the cell lights as the return stroke lands
      L.hit(L.ground(n.x), { hot, fromX: n.x }).then(() => {
        c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash', 'struck'); c.classList.toggle('hot', hot);
        set(b, `${m}×`); flash(hot ? .45 : .18); if (hot) shake(5);
        audio.cue(hot ? 'strike' : `spark-${(i % 4) + 1}`, { gain: hot ? .8 : .5, rate: .95 + Math.random() * .1 });
        if (hot) setTimeout(() => audio.cue(take('thunder', 2), { gain: .5 }), 140);
      });
      await motion.wait(gap);
    }
    await motion.wait(fast ? 180 : 300);
    box.classList.remove('charging'); await L.dim(0, 600);
  }
  async function settleShow(r) {
    layout();
    if (r.bonus) {   // the multiplier you carried in pays: a gold bolt onto your badge, the table goes white
      const at = rim(); L.charge(false); await L.hit(at, { hot: true, width: 1.9, life: 620, n: 120, size: 60 }); L.flare(at, { color: '#ffe0a0', size: 60, life: 700 });
      flash(.6); shake(8); audio.cue('strike', { gain: .9 });
      splash.querySelector('b').textContent = `×${r.bonus.m}`; splash.querySelector('em').textContent = `+${fmt(r.bonus.amount)}`;
      splash.hidden = false; splash.classList.remove('go'); void splash.offsetWidth; splash.classList.add('go');
      badge.classList.add('spent'); setTimeout(() => { badge.classList.remove('spent'); renderBadge(false); }, 700);
      await motion.wait(settings.fast ? 1100 : 1600); splash.hidden = true;
    } else if (r.lost) { badge.classList.add('lost'); audio.cue(take('zap', 2), { gain: .35 }); await motion.wait(420); badge.classList.remove('lost'); }
    if (r.earned) {   // a bolt carries this hand's multiplier from its cell on the board down to your bet
      const c = cells[r.earned.bucket], n = ndcOf(c), to = rim(); c.classList.add('lit');
      L.hit(to, { from: L.atScreen(n.x, n.bottom, to), width: .9, life: 520, n: 30, size: 26 });
      audio.cue('reveal-sting', { gain: .6 }); setTimeout(() => audio.cue('win-bling', { gain: .5 }), 220);
      await motion.wait(260);
    }
    renderBadge(!!r.earned);
    if (r.bonus) { const li = document.createElement('li'); li.className = 'win bolt'; li.innerHTML = '<b>Lightning</b><span></span><em></em>'; li.querySelector('span').textContent = `×${r.bonus.m} on your ${fmt(r.bonus.amount / r.bonus.m)} fee`; li.querySelector('em').textContent = `+${fmt(r.bonus.amount)}`; document.querySelector('#feed').append(li); requestAnimationFrame(() => requestAnimationFrame(() => li.classList.add('show'))); }
  }
}
