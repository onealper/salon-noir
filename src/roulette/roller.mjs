// The ball rolling round the wheel, made live rather than played from a recording: recordings (and generated
// takes) of a ball on a track carry the grit of the track, every speck a click, while the sound wanted here is
// a ball rolling on wood: a round, hollow roll with the low ring of a wooden bowl under it and nothing sharp
// on top. Built from soft noise ringing a handful of wood modes, it speeds up and brightens with the
// simulated ball and swells gently once a lap as the ball passes the near side.
//
//   const roll = createRoller(audioContext, destinationNode)
//   roll.update({ speed, theta, phase }, when)   // each frame; speed in cm/s, theta in radians, phase 0–3
//   roll.stop(fade)
// The two loops are made once per audio context (about a million samples: a frame or more of work on a
// phone, just as the ball is launched); each spin starts them at a random point, so no two sound alike.
const loops = new WeakMap();
function buffers(ctx) {
  if (loops.has(ctx)) return loops.get(ctx);
  const rate = ctx.sampleRate, len = Math.floor(rate * 2.5), buf = ctx.createBuffer(1, len, rate), d = buf.getChannelData(0);
  // pink-ish noise (Paul Kellet's filter), so the loop has no hiss edge to repeat; the loop seam is crossfaded
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * .1848) * .2; }
  const fade = Math.floor(rate * .25);
  for (let i = 0; i < fade; i++) { const k = i / fade; d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k; }
  // the rolling grain: a smooth, slightly uneven swell (a few slow sines at odd rates), never a click
  const glen = Math.floor(rate * 4), gbuf = ctx.createBuffer(1, glen, rate), gd = gbuf.getChannelData(0);
  const parts = [[4, .5], [7, .35], [11, .25], [17, .16], [23, .1]].map(([f, a]) => [f, a, Math.random() * 6.28]);   // whole cycles per 4 s loop: seamless
  let gr = 0;
  for (let i = 0; i < glen; i++) { let v = 0; for (const [f, a, ph] of parts) v += a * Math.sin(6.2832 * f * i / glen + ph); gd[i] = v; gr += v * v; }
  gr = Math.sqrt(gr / glen); for (let i = 0; i < glen; i++) gd[i] /= gr;
  const out = { noise: buf, fade: fade / rate, grain: gbuf }; loops.set(ctx, out); return out;
}
export const prepareRoller = ctx => void buffers(ctx);   // ahead of the first spin, at a quiet moment
export function createRoller(ctx, dest) {
  const B = buffers(ctx);
  const src = ctx.createBufferSource(); src.buffer = B.noise; src.loop = true; src.loopStart = B.fade; src.loopEnd = B.noise.duration;

  const node = (type, f, q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
  const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  // the grain plays faster the faster the ball runs, like the ball's surface turning over on the wood
  const grain = ctx.createBufferSource(); grain.buffer = B.grain; grain.loop = true;
  const grainDepth = gain(0);
  // the source: noise rounded off at the top, a ball rolling on wood has no hiss in it
  const soft = node('lowpass', 1200, .5), soft2 = node('lowpass', 1600, .5);
  const tex = gain(1);                                                     // the grain rides on this
  // the wood: a hollow bowl rings at a handful of low modes, plus the deep rumble of the table under it
  const modes = [[150, 6, .3], [255, 7, .55], [410, 8, .7], [640, 8, .6], [980, 7, .4], [1450, 2, .12]].map(([f, q, g]) => { const n = node('bandpass', f, q), G = gain(g); return [n, G]; });
  const rumble = node('lowpass', 200, .9), rumbleG = gain(.2);
  const bowl = gain(1), lap = gain(1), out = gain(0);
  const top = node('lowpass', 2600, .6);                                   // keep it round: nothing sharp above
  src.connect(soft).connect(soft2).connect(tex);
  for (const [n, G] of modes) tex.connect(n).connect(G).connect(bowl);
  tex.connect(rumble).connect(rumbleG).connect(bowl);
  bowl.connect(lap).connect(top).connect(out).connect(dest);
  grain.connect(grainDepth).connect(tex.gain);
  src.start(0, Math.random() * 2); grain.start(0, Math.random() * 4);

  const K = 1;                                                            // overall level, matched to the rest of the table
  const to = (p, v, t, tc = .05) => p.setTargetAtTime(v, t, tc);
  let stopped = false;
  return {
    update({ speed = 0, theta = 0, phase = 0, level = 1 }, when = ctx.currentTime) {
      if (stopped) return;
      const t = when, s = Math.max(0, Math.min(1.15, speed / 380));
      if (phase === 0) {                       // round the rim: a full wooden roll, a touch brighter and quicker when fast
        to(soft.frequency, 700 + 900 * s, t); to(top.frequency, 1600 + 1400 * s, t);
        to(grain.playbackRate, .6 + 1.6 * s, t, .1); to(grainDepth.gain, .14, t, .1); to(rumbleG.gain, .18 + .1 * s, t);
        to(out.gain, level * K * (.5 + 1.1 * s), t, .08);
      } else if (phase === 1) {                // down the cone: deeper, more of the bowl and the table
        to(soft.frequency, 520 + 500 * s, t, .12); to(top.frequency, 1400, t, .12);
        to(grain.playbackRate, .5 + 1.2 * s, t, .12); to(grainDepth.gain, .18, t, .12); to(rumbleG.gain, .35, t, .12);
        to(out.gain, level * K * 1.1, t, .1);
      } else if (phase === 2) {                // skittering on the wheelhead: the clicks carry it, the roll fades under
        to(out.gain, level * K * Math.min(.35, 1.2 * s), t, .12);
      } else to(out.gain, 0, t, .05);
      // once a lap the ball passes the near side of the bowl: a soft swell
      to(lap.gain, 1 + .14 * Math.cos(theta), t, .03);
    },
    stop(f = .25) {
      if (stopped) return; stopped = true; const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0, t, f / 3);
      try { src.stop(t + f * 3); grain.stop(t + f * 3); } catch { /* already stopped */ }
      setTimeout(() => out.disconnect(), f * 3000 + 50);   // the spent filters leave the table bus
    },
  };
}
