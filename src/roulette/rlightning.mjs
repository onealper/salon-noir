// The Lightning roulette tables' lightning (rules and odds: lightning.mjs), made for this table and its studio, with
// sounds of its own (sounds/kit/lr-*.mp3). After "No more bets", while the ball makes its last rounds:
//  - the charge: the studio darkens round the layout, static runs over the number grid, a hum builds to a cut-off;
//  - each strike, quicker and quicker: a dim stepped leader feels its way down out of the dark above the picture, and
//    the return stroke lights the whole channel many times brighter, restrikes along the same path (one to three times,
//    never the same) and leaves a violet afterimage on the eye. The crack of its sound lands with the return stroke.
//    Where it grounds the cloth takes the hit: a flash on the screen at the point, the picture held for a breath (the
//    hit-stop), a shake, a shockwave over the cloth, a branching burn cooling from blue-white to ember, sparks thrown up
//    and falling back, a breath of smoke, and the number's own light;
//  - the multiplier forged onto the number's square: a plaque that lands white-hot, rolls through the ladder like a reel
//    and settles on its figure, cooling to gold, with live current crawling round its edge while the ball runs;
//  - Mega Lightning's chain lightning leaps across the cloth from the last number struck in red-orange; its double strike
//    comes last, after a held breath in a deeper dark, the biggest bolt there is, and reforges the plaque;
//  - your struck number paying: a gold bolt into its plaque; and as the round ends the plaques' charge dies away (they
//    cool to ember and ash and are gone).
// Flashing effects: Soft keeps each strike to one swell, at least 360 ms apart, with a faint flash and no shake; Off, and
// Reduce motion, stamp the numbers with no bolts, flashes or shake. Everything here is light or decal: nothing casts a
// shadow, so its frames redraw no shadow map.
import { MODES } from './lightning.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const LADDER = [...new Set([...MODES.lightning.mults, ...MODES.mega.mults, ...MODES.mega.double.mults].map(([v]) => v))];

const BOLT_VS = `
attribute float side; attribute float along; attribute float wid; attribute float trunk; attribute vec3 tang;
uniform float uWide;
varying float vSide; varying float vAlong; varying float vMain;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 t = normalize((modelViewMatrix * vec4(tang, 0.0)).xyz);
  mv.xyz += normalize(cross(t, normalize(mv.xyz))) * side * wid * uWide;   // a ribbon turned to face the eye
  vSide = side; vAlong = along; vMain = trunk;
  gl_Position = projectionMatrix * mv;
}`;
// White-hot at the core, a coloured sheath round it, and a wide faint glow; `uLead`: how far down the channel has reached
// (the leader), with a bright tip; `uBranch`: the forks against the main channel (a restroke runs the main channel only).
const BOLT_FS = `
uniform vec3 uCore; uniform vec3 uHalo; uniform float uI; uniform float uLead; uniform float uTip; uniform float uBranch;
varying float vSide; varying float vAlong; varying float vMain;
void main() {
  if (vAlong > uLead) discard;
  float d = abs(vSide);
  float core = exp(-d * d * 70.0), sheath = exp(-d * d * 9.0) * 0.55, air = exp(-d * d * 1.6) * 0.16;
  float tip = exp(-pow((uLead - vAlong) * 34.0, 2.0)) * uTip;
  vec3 col = uCore * core * 1.5 + uHalo * (sheath + air);
  gl_FragColor = vec4(col * (uI + tip * 1.6) * mix(uBranch, 1.0, vMain), 1.0);
}`;
const DECAL_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// the shockwave: a ring racing out over the cloth with a pool of light under the strike
const WAVE_FS = `
uniform float uR; uniform float uI; uniform vec3 uC; varying vec2 vUv;
void main() { vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  float ring = exp(-pow((r - uR) * 12.0, 2.0)) * (1.0 - r), pool = exp(-r * r * 16.0);
  gl_FragColor = vec4(uC * (ring * 1.2 + pool * 0.5) * uI, 1.0); }`;
// the burn: the branching figure, hot blue-white cooling to ember
const BURN_FS = `
uniform sampler2D uMap; uniform float uGrow; uniform float uHeat; uniform float uFade; uniform vec3 uHot; uniform vec3 uEmber; varying vec2 vUv;
void main() { vec2 p = vUv * 2.0 - 1.0; float f = texture2D(uMap, vUv).r * smoothstep(uGrow, uGrow - 0.2, length(p));
  gl_FragColor = vec4(mix(uEmber, uHot, uHeat) * f * (0.35 + 0.65 * uHeat) * uFade, 1.0); }`;
// static on the number grid while the air charges: sparkles flickering cell by cell, and current running along the lines
const STATIC_FS = `
uniform float uT; uniform float uI; uniform vec2 uCells; varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float tick = floor(uT * 24.0);
  float spark = step(0.972, h(floor(vUv * uCells * 5.0) + tick * vec2(1.7, 9.2)));
  vec2 g = fract(vUv * uCells); float line = smoothstep(0.05, 0.0, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)));
  float run = step(0.86, h(floor(vUv * uCells) + floor(uT * 14.0) * 3.1)) * line;
  gl_FragColor = vec4(vec3(0.55, 0.7, 1.0) * (spark * 0.9 + run * 1.3 + line * 0.06) * uI, 1.0);
}`;
// live current round a plaque's edge: a wavering line and sparks running round it
const EDGE_FS = `
uniform float uT; uniform float uI; uniform vec3 uC; uniform vec2 uSize; uniform float uR; varying vec2 vUv;
float h(float x) { return fract(sin(x * 91.7) * 43758.5); }
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = (vUv - 0.5) * uSize; float d = box(p, uSize * 0.5 / 1.16, uR), a = atan(p.y, p.x);
  float n = sin(a * 13.0 + uT * 9.0) * 0.5 + sin(a * 29.0 - uT * 15.0) * 0.3 + sin(a * 7.0 + uT * 4.0) * 0.2;
  float line = exp(-pow((d - n * 0.22) * 3.6, 2.0)), spark = step(0.965, h(floor(a * 36.0) + floor(uT * 18.0))) * exp(-pow(d * 1.8, 2.0));
  gl_FragColor = vec4(uC * (line * 0.8 + spark * 1.4) * uI, 1.0);
}`;

export function createLightning(S, { audio, settings, stage, canvas, pan = () => 0 }) {
  const { THREE, scene, camera, tickers, requestRender } = S;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const quiet = () => settings.reduced || settings.flash === 'off', soft = () => settings.flash === 'soft';
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false };
  const sound = (name, o = {}, at) => audio.cue(name, { ...o, ...(at ? { x: pan(at) } : {}) });
  const radial = (inner, outer, size = 64) => {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, size, size); return new THREE.CanvasTexture(c);
  };
  const glowTex = radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), smokeTex = radial('rgba(255,255,255,.55)', 'rgba(255,255,255,0)');
  // a job for the frames to come; `still`: it moves nothing that casts a shadow
  function run(ms, step, end) {
    return new Promise(res => {
      const t0 = performance.now();
      const f = now => { const k = Math.min(1, (now - t0) / ms); step(k, now - t0); if (k >= 1) { tickers.delete(f); end?.(); requestRender(false); res(); } };
      f.still = true; tickers.add(f); requestRender(false);
    });
  }

  // ---- on the screen: the room darkening, the flash, the shake --------------------------------------------------------
  const dark = document.createElement('div'), flashEl = document.createElement('div'); dark.className = 'r-dark'; flashEl.className = 'r-flash';
  for (const el of [dark, flashEl]) el.setAttribute('aria-hidden', 'true');
  canvas.after(dark, flashEl);
  const setDark = level => { dark.classList.toggle('on', level > 0); dark.classList.toggle('deep', level > 1); };
  function flash(v, at, hot) {
    const k = quiet() ? 0 : soft() ? .2 : .55; if (!k) return;
    if (at) { const p = S.project(at); flashEl.style.setProperty('--fx', `${(p.x / stage.clientWidth * 100).toFixed(1)}%`); flashEl.style.setProperty('--fy', `${(p.y / stage.clientHeight * 100).toFixed(1)}%`); }
    flashEl.classList.toggle('hot', !!hot); flashEl.style.opacity = (Math.min(1, v) * k).toFixed(3);
  }
  let shakeJob = 0;
  function shake(px, ms = 320) {
    if (quiet() || soft()) return; const id = ++shakeJob;
    run(ms, k => { if (id !== shakeJob) return; const a = px * (1 - k) ** 2; canvas.style.translate = `${(rnd(-1, 1) * a).toFixed(1)}px ${(rnd(-1, 1) * a).toFixed(1)}px`; }, () => { if (id === shakeJob) canvas.style.translate = ''; });
  }
  const hold = ms => { if (!quiet() && !soft()) S.hold?.(ms); };
  // the strike's own light on the table, in the room only at the Lightning tables (a light at zero still costs a pass)
  const lamp = new THREE.PointLight('#c4d2ff', 0, 220, 1.2); lamp.visible = false; scene.add(lamp);

  // ---- the channel ------------------------------------------------------------------------------------------------------
  // A jagged path by midpoint displacement: each midpoint pushed off the line, at right angles to it, by a share of the
  // segment's own length, so it jags at every scale as lightning does. `flat`: keep it low over the cloth (an arc).
  function jag(a, b, rough, depth, flat = false) {
    let pts = [a.clone(), b.clone()]; const up = V(0, 1, 0), s = V(0, 0, 0), q = V(0, 0, 0);
    for (let d = 0; d < depth; d++) {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], e = pts[i], len = p.distanceTo(e), m = p.clone().add(e).multiplyScalar(.5), dir = e.clone().sub(p).normalize();
        s.crossVectors(dir, Math.abs(dir.y) > .9 ? V(1, 0, 0) : up).normalize(); q.crossVectors(dir, s).normalize();
        m.addScaledVector(s, rnd(-.5, .5) * rough * len).addScaledVector(q, rnd(-.5, .5) * rough * len * (flat ? .25 : 1));
        if (flat) m.y = Math.max(m.y, .25);
        out.push(m, e);
      }
      pts = out;
    }
    return pts;
  }
  // The bolt's ribbons: the main channel and its forks, each fork thinning and dimming as it goes, a few forking again.
  function boltGeometry(top, end, { forks = 4, rough = .34, width = 1, flat = false } = {}) {
    const main = jag(top, end, rough, flat ? 6 : 7, flat), L = top.distanceTo(end), strokes = [{ pts: main, a0: 0, a1: 1, w0: 1.5 * width, w1: 1.1 * width, main: 1 }];
    for (let k = 0; k < forks; k++) {
      const i = Math.floor(rnd(.12, .72) * (main.length - 1)), p = main[i], dir = main[Math.min(main.length - 1, i + 2)].clone().sub(p).normalize();
      dir.add(V(rnd(-.9, .9), flat ? 0 : rnd(-.5, .1), rnd(-.9, .9))).normalize();
      const len = L * rnd(.1, .28), e = p.clone().addScaledVector(dir, len), a0 = i / (main.length - 1);
      if (!flat) e.y = Math.max(e.y, end.y + 2);
      strokes.push({ pts: jag(p, e, .5, 5, flat), a0, a1: a0 + len / L, w0: .75 * width, w1: .12 * width, main: 0 });
      if (Math.random() < .35) { const sub = strokes.at(-1).pts, j = Math.floor(sub.length * rnd(.3, .7)), e2 = sub[j].clone().addScaledVector(dir.clone().add(V(rnd(-1, 1), -.2, rnd(-1, 1))).normalize(), len * .45), b0 = a0 + (j / (sub.length - 1)) * len / L;
        strokes.push({ pts: jag(sub[j], e2, .55, 4, flat), a0: b0, a1: b0 + len * .45 / L, w0: .4 * width, w1: .08 * width, main: 0 }); }
    }
    let n = 0; for (const s of strokes) n += s.pts.length;
    const pos = new Float32Array(n * 6), tang = new Float32Array(n * 6), side = new Float32Array(n * 2), along = new Float32Array(n * 2), wid = new Float32Array(n * 2), mainA = new Float32Array(n * 2), idx = [];
    let o = 0; const t = V(0, 0, 0);
    for (const s of strokes) {
      const P = s.pts, m = P.length;
      for (let i = 0; i < m; i++) {
        const k = i / (m - 1); t.subVectors(P[Math.min(m - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
        for (let j = 0; j < 2; j++) { const q = (o + i) * 2 + j; pos.set([P[i].x, P[i].y, P[i].z], q * 3); tang.set([t.x, t.y, t.z], q * 3); side[q] = j ? 1 : -1; along[q] = s.a0 + (s.a1 - s.a0) * k; wid[q] = s.w0 + (s.w1 - s.w0) * k; mainA[q] = s.main; }
        if (i < m - 1) { const a = (o + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      o += m;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('tang', new THREE.BufferAttribute(tang, 3));
    for (const [k, a] of Object.entries({ side, along, wid, trunk: mainA })) g.setAttribute(k, new THREE.BufferAttribute(a, 1));
    g.setIndex(idx); return { geo: g, main };
  }
  const COLORS = { cold: ['#ffffff', '#7f96ff'], hot: ['#fff6e2', '#ff8a3d'], gold: ['#fffaf0', '#ffc35a'] };
  const boltMat = tone => new THREE.ShaderMaterial({ vertexShader: BOLT_VS, fragmentShader: BOLT_FS, ...additive, side: THREE.DoubleSide,
    uniforms: { uCore: { value: new THREE.Color(COLORS[tone][0]) }, uHalo: { value: new THREE.Color(COLORS[tone][1]) }, uI: { value: 0 }, uLead: { value: 0 }, uTip: { value: 0 }, uBranch: { value: 1 }, uWide: { value: 1 } } });
  // Where a bolt falls from: just past the top of the picture over its target, at the target's depth, so the whole
  // channel crosses the screen.
  const skyV = V(0, 0, 0);
  const sky = to => { camera.updateMatrixWorld(); skyV.copy(to).project(camera); return V(Math.max(-1.05, Math.min(1.05, skyV.x + rnd(-.3, .3))), 1.15, skyV.z).unproject(camera); };

  // The light of a strike over time (ms from the return stroke): its strokes, each a flash decaying in tens of
  // milliseconds, and the channel's glow under them dying away. → { ms, at(t) 0..1+, last }
  function strokes(count, big) {
    const hits = [0]; for (let i = 1; i < count; i++) hits.push(hits.at(-1) + rnd(45, 115));
    const amp = hits.map((_, i) => i ? rnd(.6, .9) * (1 - i * .1) : 1), ms = hits.at(-1) + (big ? 420 : 300);
    return { ms, last: hits.at(-1), at: t => { let v = .22 * Math.max(0, 1 - t / ms) ** 1.5; for (let i = 0; i < hits.length; i++) if (t >= hits[i]) v = Math.max(v, amp[i] * Math.exp(-(t - hits[i]) / 36)); return v; } };
  }

  // One bolt from `from` (or the dark above) to `to`. Resolves { landed, done }: landed as the return stroke grounds.
  function bolt(to, { from, tone = 'cold', width = 1, forks, big = false, flat = false, lead } = {}) {
    const start = from ?? sky(to), { geo, main } = boltGeometry(start, to, { forks: forks ?? (big ? 6 : 4), width, flat, rough: flat ? .22 : .34 });
    const mat = boltMat(tone), mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 8; scene.add(mesh);
    // the air round the channel lit: soft glows strung along it
    const gp = []; for (let i = 0; i < main.length; i += 5) gp.push(main[i].x, main[i].y, main[i].z);
    const glowGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    const air = new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: glowTex, color: COLORS[tone][1], size: big ? 16 : 11, opacity: 0, ...additive })); air.frustumCulled = false; air.renderOrder = 7; scene.add(air);
    const u = mat.uniforms, LEAD = lead ?? (big ? 200 : 150), sh = strokes(soft() ? 1 : big ? 3 : 1 + Math.floor(rnd(1, 3.99)), big);
    let landedRes; const landed = new Promise(r => { landedRes = r; });
    const done = (async () => {
      // the stepped leader: dim, bright-tipped, feeling its way down in jerks, its forks reaching out with it
      await run(LEAD, k => { u.uLead.value = Math.floor(k * 10) / 10 + rnd(0, .07); u.uI.value = .26; u.uTip.value = 1.5; u.uWide.value = .7; air.material.opacity = .04; });
      // the return stroke: the whole channel, many times brighter, then its restrikes along the main channel
      u.uLead.value = 2; u.uTip.value = 0; lamp.position.set(to.x, to.y + 26, to.z); landedRes(sh);
      const top = soft() ? 1.2 : big ? 3 : 2.3;
      await run(sh.ms, (k, t) => {
        const v = sh.at(t); u.uI.value = v * top; u.uWide.value = .9 + .45 * Math.min(1, v); u.uBranch.value = t < 40 ? 1 : .22;
        air.material.opacity = Math.min(.55, v * .5); flash(v, to, tone !== 'cold'); lamp.intensity = v * (big ? 900 : tone === 'cold' ? 420 : 560);
      });
      flash(0); lamp.intensity = 0; scene.remove(air); glowGeo.dispose(); air.material.dispose();
      // the afterimage: the channel stays on the eye, dim and violet, for most of a second
      u.uCore.value.set(tone === 'cold' ? '#c7bcff' : '#ffd9c0'); u.uHalo.value.set(tone === 'cold' ? '#4c3ec8' : '#8a3f7c'); u.uBranch.value = .5;
      await run(900, k => { u.uI.value = .13 * (1 - k) ** 2; u.uWide.value = 1.4; });
      scene.remove(mesh); geo.dispose(); mat.dispose();
    })();
    return { landed, done };
  }

  // ---- the cloth takes the hit -------------------------------------------------------------------------------------------
  // Branching burns: grown once on a canvas (a random walk that forks), three of them, reused.
  function figure() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    const segs = [];
    const grow = (x, y, ang, len, w, depth) => {
      for (let s = 0; s < len / 3; s++) {
        ang += rnd(-.6, .6); const nx = x + Math.cos(ang) * 3, ny = y + Math.sin(ang) * 3; segs.push([x, y, nx, ny, w]); x = nx; y = ny; w *= .96;
        if (Math.hypot(x - 128, y - 128) > 120) break;
        if (depth < 4 && Math.random() < .12) grow(x, y, ang + (Math.random() < .5 ? -1 : 1) * rnd(.4, 1), len * rnd(.3, .55), w * .7, depth + 1);
      }
    };
    const arms = 6 + Math.floor(rnd(0, 4)); for (let k = 0; k < arms; k++) grow(128, 128, k * Math.PI * 2 / arms + rnd(-.3, .3), rnd(60, 120), 3.2, 0);
    g.lineCap = 'round'; g.strokeStyle = '#fff';
    for (const [alpha, mul, blur] of [[.35, 2.6, 6], [1, 1, 0]]) { g.globalAlpha = alpha; g.shadowColor = '#fff'; g.shadowBlur = blur; for (const [x0, y0, x1, y1, w] of segs) { g.lineWidth = Math.max(.6, w * mul); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); } }
    return new THREE.CanvasTexture(c);
  }
  let figures = null; const figureTex = () => (figures ??= [0, 1, 2].map(figure))[Math.floor(rnd(0, 3))];
  const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  function impact(at, { tone = 'cold', big = false } = {}) {
    if (quiet()) return;
    const hot = tone !== 'cold', C = new THREE.Color(hot ? '#ffd9a0' : '#cdd8ff'), size = big ? 46 : 28;
    // the shockwave
    const wave = new THREE.Mesh(flatGeo, new THREE.ShaderMaterial({ vertexShader: DECAL_VS, fragmentShader: WAVE_FS, ...additive, uniforms: { uR: { value: 0 }, uI: { value: 1 }, uC: { value: C } } }));
    wave.position.set(at.x, .2, at.z); wave.scale.setScalar(size); wave.renderOrder = 6; scene.add(wave);
    run(big ? 620 : 460, k => { wave.material.uniforms.uR.value = k * 1.05; wave.material.uniforms.uI.value = (1 - k) ** 1.4; }, () => { scene.remove(wave); wave.material.dispose(); });
    // the burn
    const burn = new THREE.Mesh(flatGeo, new THREE.ShaderMaterial({ vertexShader: DECAL_VS, fragmentShader: BURN_FS, ...additive,
      uniforms: { uMap: { value: figureTex() }, uGrow: { value: 0 }, uHeat: { value: 1 }, uFade: { value: 1 }, uHot: { value: new THREE.Color(hot ? '#ffe7b8' : '#d6e0ff') }, uEmber: { value: new THREE.Color('#ff5a1c') } } }));
    burn.position.set(at.x, .18, at.z); burn.rotation.y = rnd(0, Math.PI * 2); burn.scale.setScalar(size * .8); burn.renderOrder = 5; scene.add(burn);
    const bu = burn.material.uniforms, life = big ? 2200 : 1600;
    run(life, (k, t) => { bu.uGrow.value = Math.min(1.2, t / 110 * 1.2); bu.uHeat.value = Math.max(0, 1 - t / 600); bu.uFade.value = t < 450 ? 1 : Math.max(0, 1 - (t - 450) / (life - 450)) ** 1.5; }, () => { scene.remove(burn); burn.material.dispose(); });
    sparks(at, { n: big ? 70 : 34, color: hot ? '#ffe2a8' : '#dfe7ff', speed: big ? 120 : 85 });
    smoke(at, big ? 7 : 4);
  }
  // sparks thrown up, falling back to the cloth and skipping once
  function sparks(at, { n = 30, color = '#dfe7ff', speed = 85, life = 900, up = 1 } = {}) {
    if (quiet()) return;
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos.set([at.x, at.y + .4, at.z], i * 3); const a = rnd(0, Math.PI * 2), r = rnd(.2, 1); vel.push(V(Math.cos(a) * r, rnd(.5, 1.3) * up, Math.sin(a) * r).multiplyScalar(speed * rnd(.4, 1))); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: glowTex, color, size: 1.1, ...additive }), pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 9; scene.add(pts);
    let last = performance.now();
    run(life, k => {
      const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
      for (let i = 0; i < n; i++) { const v = vel[i]; v.y -= 520 * dt; pos[i * 3] += v.x * dt; pos[i * 3 + 2] += v.z * dt; pos[i * 3 + 1] += v.y * dt; if (pos[i * 3 + 1] < .15) { pos[i * 3 + 1] = .15; v.y *= -.3; v.x *= .5; v.z *= .5; } }
      geo.attributes.position.needsUpdate = true; mat.opacity = 1 - k * k; mat.size = 1.1 * (1 - k * .5);
    }, () => { scene.remove(pts); geo.dispose(); mat.dispose(); });
  }
  // a breath of smoke rising off the burn and spreading
  function smoke(at, n) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: '#9aa1b2', opacity: 0, transparent: true, depthWrite: false }));
      const ox = rnd(-3, 3), oz = rnd(-3, 3), drift = rnd(8, 16), life = rnd(1300, 1900); s.position.set(at.x + ox, 1, at.z + oz); s.renderOrder = 6; scene.add(s);
      run(life, k => { s.position.y = 1 + drift * k; s.position.x = at.x + ox * (1 + k); s.scale.setScalar(3 + 12 * k); s.material.opacity = .16 * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k); }, () => { scene.remove(s); s.material.dispose(); });
    }
  }

  // ---- static on the grid, while the air charges -----------------------------------------------------------------------
  let grid = null, gridTick = null;
  function staticOn(level, ms = 300) {
    const L = S.layout; if (!L) return;
    if (!grid) {
      grid = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: DECAL_VS, fragmentShader: STATIC_FS, ...additive, uniforms: { uT: { value: 0 }, uI: { value: 0 }, uCells: { value: new THREE.Vector2(12, 3) } } }));
      grid.renderOrder = 4; scene.add(grid);
    }
    // over the numbers 1 to 36 (twelve rows of three: the zero has a cell of its own size), wherever the layout lies
    const xs = [L.X(0), L.X(12)], zs = [L.Z(0), L.Z(3)], u = grid.material.uniforms;
    grid.position.set((xs[0] + xs[1]) / 2, .12, (zs[0] + zs[1]) / 2); grid.scale.set(Math.abs(xs[1] - xs[0]), 1, Math.abs(zs[1] - zs[0]));
    if (!gridTick && level > 0 && !quiet()) { const t0 = performance.now(); let drawn = 0; gridTick = now => { if (now - drawn < 33) return; drawn = now; u.uT.value = (now - t0) / 1000; requestRender(false); }; gridTick.still = gridTick.lazy = true; tickers.add(gridTick); }
    const from = u.uI.value, to = quiet() ? 0 : level;
    run(ms, k => { u.uI.value = from + (to - from) * k; }, () => { if (to === 0 && gridTick) { tickers.delete(gridTick); gridTick = null; } });
  }

  // ---- the plaques ------------------------------------------------------------------------------------------------------
  // Dark, rimmed in gold (red-orange for chain lightning and the double strike), the number small at its head and the
  // multiplier large in gold under it, at the square's own proportions.
  function plaqueCanvas(n, x, hot, aspect, c = document.createElement('canvas')) {
    const H = 192, W = Math.round(H * aspect); c.width = W; c.height = H; const g = c.getContext('2d'); g.clearRect(0, 0, W, H);
    const rim = hot ? ['#ffd2b8', '#ff6a3d', '#9e2a14'] : ['#fff3c9', '#e2c483', '#8d6a2c'], r = 22, i = 7;
    const round = (x0, y0, x1, y1, rr) => { g.beginPath(); g.moveTo(x0 + rr, y0); g.arcTo(x1, y0, x1, y1, rr); g.arcTo(x1, y1, x0, y1, rr); g.arcTo(x0, y1, x0, y0, rr); g.arcTo(x0, y0, x1, y0, rr); g.closePath(); };
    g.shadowColor = hot ? 'rgba(255,100,50,.95)' : 'rgba(255,214,120,.95)'; g.shadowBlur = 16; round(i, i, W - i, H - i, r); g.fillStyle = 'rgba(12,10,8,.94)'; g.fill(); g.shadowBlur = 0;
    const gr = g.createLinearGradient(0, 0, 0, H); rim.forEach((col, k) => gr.addColorStop(k / 2, col)); g.lineWidth = 6; g.strokeStyle = gr; round(i, i, W - i, H - i, r); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 46px "Barlow Condensed", sans-serif'; g.fillStyle = 'rgba(236,228,208,.85)'; g.fillText(String(n), W / 2, H * .27);
    const text = `${x}x`; let size = 92; const fit = () => { g.font = `900 ${size}px "Bodoni Moda", Georgia, serif`; }; fit(); while (g.measureText(text).width > W - 34 && size > 40) { size -= 4; fit(); }
    const tg = g.createLinearGradient(0, H * .44, 0, H * .84); (hot ? ['#fff1d6', '#ffa36b', '#ff6a3d'] : ['#fff6d8', '#f0d48c', '#d9b469']).forEach((col, k) => tg.addColorStop(k / 2, col));
    g.fillStyle = tg; g.shadowColor = hot ? 'rgba(255,90,50,.8)' : 'rgba(255,214,120,.7)'; g.shadowBlur = 12; g.fillText(text, W / 2, H * .64);
    return c;
  }
  document.fonts?.load('900 92px "Bodoni Moda"').catch(() => {});   // (the plaques' figures: loaded before the first is drawn)
  const plaques = new Map();   // number → { group, text, glow, edge, canvas, tex, at, hot, w, h }
  let edgeTick = null;
  const edgesLive = () => {
    if (edgeTick || quiet()) return; const t0 = performance.now(); let drawn = 0;
    edgeTick = now => { if (!plaques.size) { tickers.delete(edgeTick); edgeTick = null; return; } if (now - drawn < 33) return; drawn = now; for (const p of plaques.values()) p.edge.material.uniforms.uT.value = (now - t0) / 1000; requestRender(false); };
    edgeTick.still = edgeTick.lazy = true; tickers.add(edgeTick);
  };
  // the square, turned to read from your seat (its head away from you, square to the grid)
  function square(n) {
    const at = S.anchor(`n${n}`), turn = Math.round(Math.atan2(camera.position.x - at.x, camera.position.z - at.z) / (Math.PI / 2));
    let w = S.layout.s.cu, h = S.layout.s.cv; if (turn % 2 !== 0) [w, h] = [h, w];
    return { at, rot: turn * Math.PI / 2, w: w * .96, h: h * .96 };
  }
  // Forged onto its square: it lands white-hot and big, rolls through the ladder like a reel and settles on its figure,
  // cooling to gold, and the current starts round its edge. `lift`: the double strike reforging it, harder.
  function forge(n, x, { hot = false, lift = false } = {}) {
    let p = plaques.get(n);
    const { at, rot, w, h } = square(n);
    if (!p) {
      const group = new THREE.Group(); group.position.set(at.x, .2, at.z); group.rotation.y = rot;
      const canvasEl = plaqueCanvas(n, x, hot, w / h), tex = new THREE.CanvasTexture(canvasEl); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const text = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, color: hot ? '#ff6a3d' : '#ffd27a', opacity: .5, ...additive })); glow.scale.set(w * 2.4, 1, h * 2.4);
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.16, h * 1.16).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: DECAL_VS, fragmentShader: EDGE_FS, ...additive,
        uniforms: { uT: { value: 0 }, uI: { value: quiet() ? 0 : .7 }, uC: { value: new THREE.Color(hot ? '#ff8a4d' : '#ffd98a') }, uSize: { value: new THREE.Vector2(w * 1.16, h * 1.16) }, uR: { value: Math.min(w, h) * .12 } } }));
      glow.renderOrder = 6; text.renderOrder = 7; edge.renderOrder = 8; text.position.y = .04; edge.position.y = .06; group.add(glow, text, edge); scene.add(group);
      p = { group, text, glow, edge, canvas: canvasEl, tex, at, hot, w, h }; plaques.set(n, p); edgesLive();
    } else if (hot && !p.hot) { p.hot = true; p.glow.material.color.set('#ff6a3d'); p.edge.material.uniforms.uC.value.set('#ff8a4d'); }
    const paint = v => { plaqueCanvas(n, v, p.hot, p.w / p.h, p.canvas); p.tex.needsUpdate = true; };
    if (settings.reduced) { paint(x); p.text.material.color.setScalar(1); requestRender(false); return; }
    // the reel: random rungs of the ladder, slowing, then the figure
    const rolls = lift ? 7 : 5; let r = 0, next = 0;
    const from = lift ? 2.2 : 1.6;
    return run(lift ? 900 : 700, (k, t) => {
      if (t >= next && r < rolls) { r++; next = t + 40 + r * 16; paint(r === rolls ? x : LADDER[Math.floor(rnd(0, LADDER.length))]); }
      const e = 1 - (1 - Math.min(1, k * 2.4)) ** 3; p.group.scale.setScalar(from + (1 - from) * e);
      const heat = Math.max(0, 1 - k * 1.3); p.text.material.color.setRGB(1 + 2.4 * heat, 1 + 2.1 * heat, 1 + 1.6 * heat);   // white-hot, cooling to its gold
      p.glow.material.opacity = .5 + 1.4 * heat;
    }, () => { if (r < rolls) paint(x); });
  }

  // ---- the show -----------------------------------------------------------------------------------------------------------
  let job = 0;
  // strikes: lightning.mjs's, in the order they fall. budget (ms): the time there is before the camera goes to the
  // wheel. onStrike(i): the i-th has landed. hurried(): a tap asks to skip, so the rest land at once.
  async function show(strikes, { budget = 3200, onStrike = () => {}, hurried = () => false } = {}) {
    const id = ++job, live = () => id === job;
    const dbl = strikes.find(s => s.double), first = strikes.map(s => s.double ? { ...s, x: s.was } : s);
    // the charge: the room darkens round the layout, static runs over the grid and the hum builds to its cut-off,
    // which falls as the first crack lands
    const chargeMs = quiet() || hurried() ? 0 : soft() ? 500 : 800;
    setDark(1);
    if (chargeMs) { staticOn(.9, chargeMs); sound('lr-charge', { gain: .5, from: Math.max(0, 1.85 - (chargeMs + 150) / 1000) }); await sleep(chargeMs); if (!live()) return; }
    const n = first.length, room = Math.max(400, budget - chargeMs - (dbl ? 1100 : 0)), minGap = soft() ? 360 : 120, gap0 = Math.min(820, Math.max(minGap, room / (n + .2)));
    let prev = null;
    for (let i = 0; i < n; i++) {
      const s = first[i], at = S.anchor(`n${s.n}`), chained = !!s.chain && prev, tone = s.chain ? 'hot' : 'cold';
      if (i) { await sleep(hurried() ? 0 : Math.max(minGap, gap0 * (1.2 - .55 * i / Math.max(1, n - 1)))); if (!live()) return; }   // quicker and quicker
      if (!quiet() && !hurried()) {
        if (chained) {   // chain lightning: an arc leaping low over the cloth from the last number struck
          sound('lr-chain', { gain: .5 }, at);
          const b = bolt(at.clone().setY(.3), { from: prev.clone().setY(.6), tone, flat: true, width: .7, forks: 2, lead: 70 }); await b.landed;
        } else {
          sound(`lr-strike-${1 + (i % 3)}`, { gain: .55, rate: rnd(.94, 1.06) }, at);   // (its crack lands with the return stroke, 150 ms on)
          const b = bolt(at, { tone, width: s.chain ? .9 : 1 }); await b.landed;
        }
        if (!live()) return;
        impact(at, { tone }); hold(45); shake(chained ? 3 : 6);
      }
      forge(s.n, s.x, { hot: !!s.chain }); onStrike(i); prev = at;
      staticOn(i === n - 1 && !dbl ? 0 : .35);
    }
    if (dbl && live()) {
      // the double strike: a held breath in a deeper dark, the plaque's current racing, then the biggest bolt there is
      const at = S.anchor(`n${dbl.n}`), p = plaques.get(dbl.n);
      setDark(2); staticOn(.6, 400);
      if (!hurried()) {
        if (p && !quiet()) run(soft() ? 600 : 700, k => { p.edge.material.uniforms.uI.value = .7 + 2.3 * k; });
        await sleep(soft() ? 600 : 700); if (!live()) return;
      }
      if (!quiet() && !hurried()) {
        sound('lr-double', { gain: .7 }, at);
        const b = bolt(at, { tone: 'hot', width: 1.6, big: true, lead: 200 }); await b.landed; if (!live()) return;
        impact(at, { tone: 'hot', big: true }); hold(80); shake(11, 480);
      }
      if (p) p.edge.material.uniforms.uI.value = quiet() ? 0 : .9;
      forge(dbl.n, dbl.x, { hot: true, lift: true }); onStrike(n);
      staticOn(0, 500);
    }
    await sleep(soft() ? 300 : 500); if (live()) setDark(0);
  }
  // Your struck number paying: a gold bolt into its plaque, which flares. Resolves as it lands.
  async function payoff(n) {
    const p = plaques.get(n), at = p?.at ?? S.anchor(`n${n}`);
    sound('lr-payoff', { gain: .7 }, at);
    if (!quiet()) { const b = bolt(at, { tone: 'gold', width: 1.5, big: true, lead: 60 }); await b.landed; impact(at, { tone: 'gold', big: true }); hold(80); shake(9, 420); }
    if (p && !settings.reduced) run(1000, k => { const v = Math.sin(Math.PI * Math.min(1, k * 1.4)); p.group.scale.setScalar(1 + .3 * v); p.glow.material.opacity = .5 + 2 * v; p.text.material.color.setScalar(1 + 1.2 * v); });
  }
  // The round over: the plaques' charge dies away. They cool to ember and ash and are gone, a few last sparks rising.
  function clear({ quietly = false } = {}) {
    job++; setDark(0); staticOn(0, 200);
    if (!plaques.size) return;
    if (!quietly) sound('lr-fizzle', { gain: .45 });
    for (const [n, p] of [...plaques]) {
      plaques.delete(n);
      const done = () => { scene.remove(p.group); p.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); p.tex.dispose(); requestRender(false); };
      if (quietly || settings.reduced) { done(); continue; }
      sparks(p.at, { n: 8, color: '#ffb36b', speed: 30, life: 900, up: 1.4 });
      const e0 = p.edge.material.uniforms.uI.value, g0 = p.glow.material.opacity;
      run(rnd(700, 900), k => {
        const ember = Math.min(1, k * 2.2); p.text.material.color.setRGB(1 - .1 * ember, 1 - .6 * ember, 1 - .8 * ember);
        p.text.material.opacity = 1 - Math.max(0, (k - .35) / .65) ** 1.2; p.edge.material.uniforms.uI.value = e0 * (1 - k) ** 2 * (Math.random() < .3 ? .3 : 1); p.glow.material.opacity = g0 * (1 - k);
      }, done);
    }
  }
  return {
    show, payoff, clear,
    setTable(on) { lamp.visible = on; if (!on) clear({ quietly: true }); requestRender(false); },
    get struck() { return [...plaques.keys()]; },
  };
}
