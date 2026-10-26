// How the salon answers your hand, beyond the picture: a tap you feel on the iPhone, a soft synthesised
// cue where the screen would otherwise refuse you in silence, and gold confetti for the moments that
// deserve it. One module, so blackjack and roulette feel the same.
//
//  - Haptics: web-haptics (MIT). Phones with the Vibration API get a real pattern; Safari on the iPhone has
//    none, so the library flips a hidden iOS switch, which the system answers with its own tap. iOS only
//    does that for a press the player just made, so a tap that comes long after a press (a win at the end
//    of a spin) may stay silent there; nothing breaks either way.
//  - Cues: cuelume (MIT), its sounds synthesised on the game's own AudioContext into the UI bus, so the mute
//    switch, the volume sliders and the iOS unlock all apply. The kit's recorded menu sounds stay; these
//    only fill the gaps (a refused bet, a confirmation).
//  - Confetti: canvas-confetti (ISC) on its own canvas over the table, in brass, ivory and a little red.
//    Short bursts only: the iPhone pays for every particle.
import { WebHaptics } from '../vendor/web-haptics.mjs';
import confettiLib from '../vendor/confetti.mjs';
import * as cuelume from '../vendor/cuelume/index.js';

const PATTERNS = {
  chip: 'selection',                                   // a chip lands on the layout
  press: 'light',                                      // deal, spin, a decision
  win: 'success',                                      // a win
  big: [{ duration: 30, intensity: .6 }, { delay: 70, duration: 30, intensity: .8 }, { delay: 70, duration: 60, intensity: 1 }],   // blackjack, a big win
  refuse: 'error',                                     // a bet the table won't take
  knock: [{ duration: 14, intensity: .45 }],             // the roulette ball striking a canoe
};
const GOLD = ['#e2c483', '#c9a45c', '#f6e7b8', '#8d7038', '#ece4d2'];

export function createFeel({ audio, settings }) {
  const haptics = new WebHaptics();
  let cueBound = false;
  function tap(kind) {
    if (!settings.haptics) return;
    try { void haptics.trigger(PATTERNS[kind] ?? kind)?.catch?.(() => {}); } catch { /* a tap is never worth an error */ }
  }
  function cue(name, options) {
    if (!audio?.available || !audio.live) return;
    if (!cueBound) { cuelume.useAudio(audio.ctx, audio.bus.ui); cueBound = true; }
    try { cuelume.play(name, options); } catch { /* as above */ }
  }

  // the confetti canvas sits over everything but the sheets, and lets every touch through
  let fire = null;
  function cannon() {
    if (fire) return fire;
    const c = document.createElement('canvas'); c.className = 'confetti'; c.setAttribute('aria-hidden', 'true');
    document.body.append(c);
    fire = confettiLib.create(c, { resize: true, useWorker: false, disableForReducedMotion: true });
    return fire;
  }
  // `size`: 1 for a blackjack or a good win, 2 for a big one. `from`: where on screen it bursts, 0-1.
  function confetti({ size = 1, from = { x: .5, y: .62 } } = {}) {
    if (settings.reduced) return;
    const f = cannon(), base = { colors: GOLD, origin: from, ticks: 170, gravity: 1.05, scalar: .9, disableForReducedMotion: true };
    f({ ...base, particleCount: 46 * size, spread: 62, startVelocity: 38 });
    if (size > 1) setTimeout(() => {
      f({ ...base, particleCount: 34, angle: 60, spread: 55, startVelocity: 46, origin: { x: .08, y: .75 } });
      f({ ...base, particleCount: 34, angle: 120, spread: 55, startVelocity: 46, origin: { x: .92, y: .75 } });
    }, 180);
  }
  return { tap, cue, confetti };
}
