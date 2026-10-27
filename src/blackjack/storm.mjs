// The storm outside the card salon, while you sit at (or look in on) the Lightning table: rain on the windows, lightning
// seen through them (scene/lightning3d.mjs windowFlash) and its thunder after it. How near it is follows the multiplier
// riding on your bet: with none, a storm miles off, a flash now and then and its roll seconds later, low and muffled;
// a ×2 brings it closer; a ×12 puts it overhead, flash and crack almost together and the rain heavy. Cashing a
// multiplier brings it right over the table, and then it rolls away over half a minute. It holds off while the table's own
// lightning has the room (the board being struck, a multiplier paying). Presentation only: it reads the table, never
// changes it.
const lerp = (a, b, k) => a + (b - a) * k, rnd = (a, b) => a + Math.random() * (b - a);

export function createStorm({ three, audio, settings, take }) {
  let on = false, held = 0, timer = 0, near = .12, peakAt = -1e9, lastFlash = -1e9;
  // 0 (miles off) to 1 (overhead): the multiplier's pull, or the cash-out's, fading back
  const level = () => Math.max(near, 1 - (performance.now() - peakAt) / 30000);
  const rain = () => { if (on) audio.weather('rain-window', lerp(.5, 1.3, level())); };
  // the next flash: every half minute or so far off, every 7 s or so overhead; it waits for a drawn frame, so a tab in the
  // background queues nothing to let off all at once on return
  function next(soon) {
    clearTimeout(timer); if (!on) return;
    timer = setTimeout(() => requestAnimationFrame(strike), (soon ? rnd(2, 5) : rnd(.75, 1.3) * lerp(26, 7, level())) * 1000);
  }
  function strike() {
    if (!on) return;
    if (held || document.hidden) { next(true); return; }
    const L = level(), now = performance.now();
    // the light: not within a second and a half of another (with the table's own strikes, under three flashes a second),
    // none with Flashing effects off or Reduce motion; the thunder comes regardless
    if (!settings.reduced && settings.flash !== 'off' && now - lastFlash > 1500) { lastFlash = now; three.windowFlash({ power: Math.min(1, lerp(.3, 1, L) * rnd(.85, 1.1)) }); }
    // the thunder: as many seconds behind the flash as the storm is far (3 s a kilometre, folded into the table's time),
    // its highs taken by the distance and the walls (far, only the low roll is left); near, the crack leads it
    const clip = L > .85 && Math.random() < .4 ? 'thunder-mega' : L > .55 ? take('thunder', 2) : 'thunder-rumble';
    audio.cue(clip, { bus: 'room', gain: lerp(1.4, 3.2, L), lowpass: lerp(280, 2800, L ** 1.5), delay: lerp(5.5, .3, L) * rnd(.8, 1.2), rate: rnd(.92, 1.04) });
    rain(); next();
  }
  return {
    // `want`: the Lightning table is in sight
    run(want) {
      if (want === on) return; on = want;
      if (on) { rain(); next(true); } else { clearTimeout(timer); audio.weather(null); }
    },
    // the multiplier waiting on your bet (0 or none: no pull)
    pull(m) { near = m > 0 ? lerp(.35, 1, Math.min(1, Math.max(0, (m - 2) / 10))) : .12; rain(); },
    // the table's own lightning has the room: no flash from outside until a moment after
    hold(h) { held = Math.max(0, held + (h ? 1 : -1)); lastFlash = performance.now(); },
    // a multiplier was cashed: the storm comes right over the table, its next strike close behind
    peak() { peakAt = performance.now(); rain(); next(true); },
  };
}
