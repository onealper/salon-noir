// The Lightning tables' strikes (rules and odds: lightning.mjs). After "No more bets", while the ball makes its last
// rounds, lightning strikes its numbers one after another, quicker and quicker: a bolt out of the dark above onto the
// number's square on the layout, the cloth taking the hit (a burn, crawling arcs, sparks, the room's light), and the
// multiplier stamped on the square in gold, where it stays until the next spin. Mega Lightning's chain lightning leaps
// from the last struck number to the next in red-orange, and its double strike comes last, after a held breath: the
// same number hit again, harder, its stamp lifted to the new multiplier. The bolts and the burns are the blackjack
// table's (scene/lightning3d.mjs), on this room through a small adapter. Flashing effects: Soft keeps each strike to one
// swell, at least 360 ms apart; Off, and Reduce motion, stamp the numbers with no bolts.
import { createLightning3D } from '../scene/lightning3d.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function createStrikes(S, { audio, settings }) {
  const { THREE, scene, camera, tickers, requestRender } = S;
  const quiet = () => settings.reduced || settings.flash === 'off', soft = () => settings.flash === 'soft';
  const radialTexture = (inner, outer) => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  };
  const L3 = createLightning3D({ THREE, scene, camera, tickers, requestRender, renderer: S.renderer, radialTexture, lights: S.lights }, { reduced: quiet, soft });
  const glowTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false };
  function animate(life, step, end) {
    const t0 = performance.now();
    const f = () => { const k = (performance.now() - t0) / life; if (k >= 1) { tickers.delete(f); step(1); end?.(); requestRender(false); return; } step(k); };
    f.still = true; tickers.add(f); requestRender(false);
  }

  // ---- the stamps --------------------------------------------------------------------------------------------------------
  // A plaque laid over the number's square, as the studio's layout lights a struck number: dark, rimmed in gold (in
  // red-orange for chain lightning and the double strike), the number small at its head and the multiplier large in gold
  // under it, over a soft glow. Drawn at the square's own proportions.
  function plaque(n, x, hot, aspect) {
    const H = 192, W = Math.round(H * aspect), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const rim = hot ? ['#ffd2b8', '#ff6a3d', '#9e2a14'] : ['#fff3c9', '#e2c483', '#8d6a2c'], r = 22, i = 7;
    const round = (x0, y0, x1, y1, rr) => { g.beginPath(); g.moveTo(x0 + rr, y0); g.arcTo(x1, y0, x1, y1, rr); g.arcTo(x1, y1, x0, y1, rr); g.arcTo(x0, y1, x0, y0, rr); g.arcTo(x0, y0, x1, y0, rr); g.closePath(); };
    g.shadowColor = hot ? 'rgba(255,100,50,.95)' : 'rgba(255,214,120,.95)'; g.shadowBlur = 16;
    round(i, i, W - i, H - i, r); g.fillStyle = 'rgba(12,10,8,.94)'; g.fill(); g.shadowBlur = 0;
    const gr = g.createLinearGradient(0, 0, 0, H); rim.forEach((col, k) => gr.addColorStop(k / 2, col));
    g.lineWidth = 6; g.strokeStyle = gr; round(i, i, W - i, H - i, r); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 46px "Barlow Condensed", sans-serif'; g.fillStyle = 'rgba(236,228,208,.85)'; g.fillText(String(n), W / 2, H * .27);
    const text = `${x}×`; let size = 96; const fit = () => { g.font = `800 ${size}px "Barlow Condensed", sans-serif`; };
    fit(); while (g.measureText(text).width > W - 34 && size > 40) { size -= 4; fit(); }
    const tg = g.createLinearGradient(0, H * .44, 0, H * .84); (hot ? ['#fff1d6', '#ffa36b', '#ff6a3d'] : ['#fff6d8', '#f0d48c', '#d9b469']).forEach((col, k) => tg.addColorStop(k / 2, col));
    g.fillStyle = tg; g.shadowColor = hot ? 'rgba(255,90,50,.8)' : 'rgba(255,214,120,.7)'; g.shadowBlur = 12; g.fillText(text, W / 2, H * .64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  const stamps = new Map();   // number → { group, mats, at }
  const cell = () => { const s = S.layout.s; return { w: s.cu, h: s.cv }; };
  function stamp(n, x, { hot = false, lift = false } = {}) {
    const old = stamps.get(n); if (old) drop(n, 0);
    const at = S.anchor(`n${n}`), g = new THREE.Group(); g.position.set(at.x, .16, at.z);
    // square to the grid, its head away from you (the nearest quarter turn toward your seat), so it reads from where you sit
    const turn = Math.round(Math.atan2(camera.position.x - at.x, camera.position.z - at.z) / (Math.PI / 2)), across = turn % 2 !== 0;
    g.rotation.y = turn * Math.PI / 2;
    let { w, h } = cell(); if (across) [w, h] = [h, w]; w *= .96; h *= .96;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, color: hot ? '#ff6a3d' : '#ffd27a', opacity: 0, ...additive }));
    glow.scale.set(w * 2.4, 1, h * 2.4);
    const text = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: plaque(n, x, hot, w / h), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    text.position.y = .05; glow.renderOrder = 6; text.renderOrder = 7; g.add(glow, text); scene.add(g);
    const st = { group: g, mats: [glow.material, text.material], at }; stamps.set(n, st);
    if (settings.reduced) { glow.material.opacity = .55; text.material.opacity = 1; requestRender(false); return; }
    // it lands as a slam: big and bright, settling to its place; a lifted stamp (the double strike) flares harder
    const from = lift ? 2.2 : 1.7;
    animate(lift ? 420 : 300, k => { const e = 1 - (1 - k) ** 3; g.scale.setScalar(from + (1 - from) * e); text.material.opacity = Math.min(1, k * 2.2); glow.material.opacity = .55 + (lift ? 1.4 : .9) * (1 - k) ** 2; });
  }
  function drop(n, ms = 320) {
    const st = stamps.get(n); if (!st) return; stamps.delete(n);
    const done = () => { scene.remove(st.group); st.group.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose?.(); o.material?.dispose?.(); }); requestRender(false); };
    if (!ms || settings.reduced) { done(); return; }
    const o = st.mats.map(m => m.opacity); animate(ms, k => st.mats.forEach((m, i) => { m.opacity = o[i] * (1 - k); }), done);
  }

  // ---- the show ----------------------------------------------------------------------------------------------------------
  let job = 0;
  // strikes: lightning.mjs's, in the order they fall. budget: the time there is (ms) before the camera has to go to the
  // wheel. onStrike(i): the i-th has landed (the board shows it). hurried(): a tap asks to skip, so the rest land at once.
  async function show(strikes, { budget = 3200, onStrike = () => {}, hurried = () => false } = {}) {
    const id = ++job;
    const dbl = strikes.find(s => s.double), first = strikes.map(s => s.double ? { ...s, x: s.was, doubled: true } : s);
    const n = first.length + (dbl ? 1 : 0), gap0 = Math.min(780, budget / (n + .6)), minGap = soft() ? 360 : 140;
    audio.cue('charge', { gain: .5 });
    let prev = null;
    for (let i = 0; i < first.length; i++) {
      if (id !== job) return;
      const s = first[i], at = S.anchor(`n${s.n}`), hot = !!s.chain;
      // quicker and quicker: the first has the room to itself, the last come close
      const wait = hurried() ? 0 : Math.max(minGap, gap0 * (1.25 - .6 * i / Math.max(1, first.length - 1)));
      await sleep(wait); if (id !== job) return;
      const from = hot && prev ? prev.clone().add(new THREE.Vector3(0, 9, 0)) : undefined;   // chain lightning leaps from the last number struck
      if (!quiet() && !hurried()) {
        audio.cue(`zap-${1 + (i % 2)}`, { gain: hot ? .55 : .45, rate: .95 + Math.random() * .1 });
        await L3.hit(at, { hot, from, width: hot ? .8 : .7, size: hot ? 20 : 16, n: 22, lamp: hot ? 420 : 320 });   // (the studio's black cloth shows a lamp the felt would swallow)
        audio.cue(`spark-${1 + (i % 4)}`, { gain: .35 });
      }
      if (id !== job) return;
      stamp(s.n, s.x, { hot }); onStrike(i); prev = at;
    }
    if (dbl && id === job) {
      // the double strike: a held breath in the dark, then the same number again, harder
      if (!hurried()) await sleep(soft() ? 600 : 520); if (id !== job) return;
      const at = S.anchor(`n${dbl.n}`);
      if (!quiet() && !hurried()) { audio.cue('strike', { gain: .6 }); await L3.hit(at, { hot: true, width: 1.3, size: 30, n: 60, near: true, lamp: 700 }); audio.cue('thunder-mega', { gain: .55, delay: .25 }); }
      if (id !== job) return;
      stamp(dbl.n, dbl.x, { hot: true, lift: true }); onStrike(first.length);
    } else if (first.length && !quiet() && !hurried()) audio.cue(`thunder-${1 + Math.floor(Math.random() * 2)}`, { gain: .4, delay: .35 });
  }
  // Your straight up on a struck number, paying: a gold bolt into its plaque, which flares and swells as it lands.
  // Resolves as it lands (at once with no bolts).
  function payoff(n) {
    const st = stamps.get(n), at = st?.at ?? S.anchor(`n${n}`);
    const pulse = () => { if (!st || settings.reduced) return; const g = st.group; animate(900, k => { const p = Math.sin(Math.PI * Math.min(1, k * 1.5)); g.scale.setScalar(1 + .3 * p); st.mats[0].opacity = .55 + 1.8 * p; }); };
    if (quiet()) { pulse(); return Promise.resolve(); }
    return L3.hit(at, { hot: true, width: 1.4, size: 34, n: 70, near: true, lamp: 800 }).then(pulse);
  }
  // the next spin: the stamps lift off the cloth
  function clear() { job++; for (const k of [...stamps.keys()]) drop(k); }
  return { show, payoff, clear, setTable: on => L3.setTable(on), get struck() { return [...stamps.keys()]; }, stampAt: n => stamps.get(n)?.at ?? null };
}
