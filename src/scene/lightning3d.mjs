// Lightning in the room itself. The multipliers live on the board over the table; this is the weather
// around it, all drawn with our own shaders so it reads as light, not geometry:
//  - bolts are camera-facing ribbons with a white-hot core and a soft sheath. A dim stepped leader
//    feels its way down first, then the return stroke lights the whole channel, restrikes, and dies;
//  - where a bolt grounds, the felt takes the hit: a branching Lichtenberg burn flashes out from the
//    point, cools from blue-white to ember and fades, under a shockwave ring, with small arcs crawling
//    over the cloth and sparks thrown up;
//  - while a multiplier waits on your bet, an arc of live current runs round your circle.
import { EDGE_Z, LAYOUT } from './world.mjs';

export const GROUND_Z = EDGE_Z + 44;                        // where the board's bolts ground: the printed band in front of the dealer

const RIBBON_VS = `
attribute float side; attribute float along; attribute float wid; attribute float bright; attribute vec3 tang;
uniform float uWide;
varying float vSide; varying float vAlong; varying float vBright;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
#ifdef FLAT
  vec3 perpW = normalize(cross(normalize(tang), vec3(0.0, 1.0, 0.0)));
  mv = modelViewMatrix * vec4(position + perpW * side * wid * uWide, 1.0);
#else
  vec3 vt = normalize((modelViewMatrix * vec4(tang, 0.0)).xyz);
  vec3 perp = normalize(cross(vt, normalize(mv.xyz)));
  mv.xyz += perp * side * wid * uWide;
#endif
  vSide = side; vAlong = along; vBright = bright;
  gl_Position = projectionMatrix * mv;
}`;
const RIBBON_FS = `
uniform vec3 uCore; uniform vec3 uTint; uniform float uI; uniform float uLead; uniform float uTip;
varying float vSide; varying float vAlong; varying float vBright;
void main() {
  float d = abs(vSide);
  float core = exp(-d * d * 80.0);
  float glow = exp(-d * d * 7.0) * 0.5 + exp(-d * d * 1.6) * 0.16;
  float shown = step(vAlong, uLead);
  float tip = exp(-pow((uLead - vAlong) * 26.0, 2.0)) * uTip;
  float a = (core * 1.5 + glow) * vBright * shown * (uI + tip * 2.0);
  vec3 col = mix(uTint, uCore, clamp(core * 1.3 + tip, 0.0, 1.0));
  gl_FragColor = vec4(col * a, 1.0);
}`;
const DECAL_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BURN_FS = `
uniform sampler2D uMap; uniform float uGrow; uniform float uHeat; uniform float uFade; uniform float uRing; uniform float uRingI; uniform float uPool;
uniform vec3 uHot; uniform vec3 uEmber;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  float fig = texture2D(uMap, vUv).r * smoothstep(uGrow, uGrow - 0.18, r);
  vec3 col = mix(uEmber, uHot, uHeat);
  float ring = exp(-pow((r - uRing) * 16.0, 2.0)) * uRingI * max(0.0, 1.0 - r);
  float pool = exp(-r * r * 22.0) * uPool;
  gl_FragColor = vec4(col * fig * (0.3 + 0.6 * uHeat) * uFade + uHot * (ring * 0.6 + pool), 1.0);
}`;
const CHARGE_FS = `
uniform float uTime; uniform float uI; uniform float uR; uniform float uS;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 p = (vUv - 0.5) * uS; float r = length(p); vec2 u = p / max(r, 0.001);
  float t = uTime;
  float n1 = noise(u * 2.2 + vec2(t * 5.0, t * 1.3)) - 0.5, n2 = noise(u * 9.0 + vec2(-t * 17.0, t * 5.0)) - 0.5, n4 = noise(u * 34.0 + vec2(t * 45.0, -t * 21.0)) - 0.5;
  float rr = uR + n1 * 1.2 + n2 * 0.5 + n4 * 0.28;
  float line = exp(-pow((r - rr) * 10.0, 2.0)) + exp(-pow((r - rr) * 3.0, 2.0)) * 0.25;
  float seg = smoothstep(0.38, 0.62, noise(u * 3.0 + vec2(t * 2.5, -t * 1.7)));
  float n3 = noise(u * 2.6 + vec2(-t * 6.0, t * 2.0)) - 0.5, n5 = noise(u * 28.0 + vec2(-t * 38.0, t * 9.0)) - 0.5;
  float line2 = exp(-pow((r - uR - n3 * 1.6 - n5 * 0.3) * 10.0, 2.0)) * smoothstep(0.5, 0.75, noise(u * 3.4 + vec2(-t * 3.1, t)));
  float glow = exp(-pow((r - uR) * 0.9, 2.0)) * 0.22;
  vec3 blue = vec3(0.55, 0.68, 1.0), gold = vec3(1.0, 0.82, 0.45), white = vec3(1.0);
  vec3 c = gold * glow + mix(blue, white, 0.3) * line * seg * 1.7 + mix(gold, white, 0.3) * line2 * 1.1;
  gl_FragColor = vec4(c * uI, 1.0);
}`;

export function createLightning3D(world, { reduced = () => false } = {}) {
  const { THREE, scene, camera, tickers, requestRender, lights } = world;
  const glowTex = world.radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false };

  function animate(obj, life, step, end) {
    const t0 = performance.now();
    const f = () => { const k = (performance.now() - t0) / life; if (k >= 1) { tickers.delete(f); end?.(); requestRender(); return; } step(k); };
    tickers.add(f); requestRender(); return f;
  }
  // Screen to room: the point on the felt under a screen x (NDC), on the band in front of the dealer,
  // and the point at a given screen position (NDC) at the depth of another point.
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), v = new THREE.Vector3();
  function ground(nx) {
    camera.updateMatrixWorld(); v.set(0, 0, GROUND_Z).project(camera);
    ray.setFromCamera({ x: nx, y: v.y }, camera); const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out) ?? new THREE.Vector3(0, 0, GROUND_Z);
  }
  function atScreen(nx, ny, depthOf) { camera.updateMatrixWorld(); v.copy(depthOf).project(camera); return new THREE.Vector3(nx, ny, v.z).unproject(camera); }

  // ---- the channel ---------------------------------------------------------------------------------
  // A jagged path by midpoint displacement; `flat` keeps it on the felt.
  function channel(a, b, spread, depth, flat = false) {
    let pts = [a.clone(), b.clone()];
    for (let d = 0; d < depth; d++) {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i], len = p.distanceTo(q), m = p.clone().add(q).multiplyScalar(.5);
        m.x += rnd(-.5, .5) * spread * len; m.z += rnd(-.5, .5) * spread * len * (flat ? 1 : .6); if (!flat) m.y += rnd(-.15, .15) * spread * len;
        out.push(m, q);
      }
      pts = out;
    }
    return pts;
  }
  // Ribbon geometry for several strokes at once. Each stroke: { pts, a0, a1, w0, w1, bright }.
  function ribbon(strokes) {
    let n = 0; for (const s of strokes) n += s.pts.length;
    const pos = new Float32Array(n * 6), tang = new Float32Array(n * 6), side = new Float32Array(n * 2), along = new Float32Array(n * 2), wid = new Float32Array(n * 2), bright = new Float32Array(n * 2), idx = [];
    let o = 0; const t = new THREE.Vector3();
    for (const s of strokes) {
      const L = s.pts.length;
      for (let i = 0; i < L; i++) {
        const p = s.pts[i], k = i / (L - 1);
        t.subVectors(s.pts[Math.min(L - 1, i + 1)], s.pts[Math.max(0, i - 1)]).normalize();
        for (let j = 0; j < 2; j++) {
          const q = (o + i) * 2 + j;
          pos.set([p.x, p.y, p.z], q * 3); tang.set([t.x, t.y, t.z], q * 3); side[q] = j ? 1 : -1;
          along[q] = s.a0 + (s.a1 - s.a0) * k; wid[q] = s.w0 + (s.w1 - s.w0) * k; bright[q] = s.bright;
        }
        if (i < L - 1) { const a = (o + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      o += L;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('tang', new THREE.BufferAttribute(tang, 3));
    for (const [k, a] of Object.entries({ side, along, wid, bright })) g.setAttribute(k, new THREE.BufferAttribute(a, 1));
    g.setIndex(idx); return g;
  }
  const ribbonMat = ({ hot = false, flat = false } = {}) => new THREE.ShaderMaterial({
    vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS, defines: flat ? { FLAT: '' } : {}, ...additive, side: THREE.DoubleSide,
    uniforms: { uCore: { value: new THREE.Color(hot ? '#fff8e6' : '#ffffff') }, uTint: { value: new THREE.Color(hot ? '#ffae3d' : '#6f8cff') }, uI: { value: 0 }, uLead: { value: 0 }, uTip: { value: 0 }, uWide: { value: 1 } },
  });

  // ---- bolts ------------------------------------------------------------------------------------------
  // Where a bolt falls from: just past the top edge of the picture, at the target's own depth, so the
  // whole channel crosses the screen (the seat's view shows little sky above the table).
  const skyV = new THREE.Vector3();
  const sky = (to, nx) => { skyV.copy(to).project(camera); const x = Math.max(-1.1, Math.min(1.1, nx ?? skyV.x + rnd(-.45, .45))); return new THREE.Vector3(x, 1.12, skyV.z).unproject(camera); };
  // A bolt from the dark above (or `from`) down to `to`. Resolves when the return stroke lands.
  function bolt(to, { from, fromX, hot = false, width = 1, life = 520, branches } = {}) {
    if (reduced()) return Promise.resolve();
    const start = from ?? sky(to, fromX), main = channel(start, to, .32, 7), W = 1.9 * width;
    const strokes = [{ pts: main, a0: 0, a1: 1, w0: W, w1: W * .8, bright: 1 }], len = start.distanceTo(to);
    for (let k = 0; k < (branches ?? (hot ? 5 : 3)); k++) {
      const i = 12 + Math.floor(Math.random() * (main.length * .7 - 12)), p = main[i];
      const bl = p.distanceTo(to) * rnd(.2, .45), end = p.clone().add(new THREE.Vector3(rnd(-1, 1), rnd(-.9, -.2), rnd(-.4, .4)).normalize().multiplyScalar(bl));
      const a0 = i / (main.length - 1);
      strokes.push({ pts: channel(p, end, .45, 5), a0, a1: a0 + bl / len, w0: W * .55, w1: W * .12, bright: rnd(.45, .75) });
    }
    const mat = ribbonMat({ hot }), mesh = new THREE.Mesh(ribbon(strokes), mat); mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh);
    const u = mat.uniforms, LEAD = 90;
    return new Promise(res => {
      // the stepped leader: a dim, bright-tipped channel feeling its way down
      animate(mesh, LEAD, k => { u.uLead.value = Math.floor(k * 9) / 9 + rnd(0, .08); u.uI.value = .4; u.uTip.value = 1.2; u.uWide.value = .6; }, () => {
        res();
        // the return stroke: the whole channel at once, then restrikes, then it bleeds away
        u.uLead.value = 2; u.uTip.value = 0;
        animate(mesh, life, k => {
          const o = k < .07 ? 1.25 : k < .15 ? .25 : k < .24 ? 1 : k < .31 ? .4 : k < .37 ? .85 : Math.max(0, 1 - (k - .37) / .63) ** 1.6;
          u.uI.value = o; u.uWide.value = .8 + .5 * Math.min(1, o);
        }, () => { scene.remove(mesh); mesh.geometry.dispose(); mat.dispose(); });
      });
    });
  }

  // ---- the felt takes the hit ---------------------------------------------------------------------
  // Lichtenberg figures: branching burns, grown once on a canvas and reused.
  function lichtenberg() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); const segs = [];
    function grow(x, y, ang, len, w, depth) {
      for (let s = 0; s < len / 3.2; s++) {
        ang += rnd(-.55, .55); const nx = x + Math.cos(ang) * 3.2, ny = y + Math.sin(ang) * 3.2; segs.push([x, y, nx, ny, w]); x = nx; y = ny; w *= .965;
        if (Math.hypot(x - 128, y - 128) > 118) break;
        if (depth < 4 && Math.random() < .13) grow(x, y, ang + (Math.random() < .5 ? -1 : 1) * rnd(.35, .9), len * rnd(.3, .55), w * .7, depth + 1);
      }
    }
    const arms = 5 + Math.floor(Math.random() * 4); for (let k = 0; k < arms; k++) grow(128, 128, k * Math.PI * 2 / arms + rnd(-.3, .3), rnd(70, 118), 3.4, 0);
    g.lineCap = 'round'; g.strokeStyle = '#fff';
    for (const [pass, alpha, mul, blur] of [[0, .35, 2.6, 6], [1, 1, 1, 0]]) {
      g.globalAlpha = alpha; g.shadowColor = '#fff'; g.shadowBlur = blur;
      for (const [x0, y0, x1, y1, w] of segs) { g.lineWidth = Math.max(.6, w * mul); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  let burns = null; const burnTex = () => (burns ??= [0, 1, 2, 3].map(lichtenberg))[Math.floor(Math.random() * 4)];
  const decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  function burn(at, { hot = false, size = 34, life = 2400 } = {}) {
    if (reduced()) return;
    const mat = new THREE.ShaderMaterial({ vertexShader: DECAL_VS, fragmentShader: BURN_FS, ...additive,
      uniforms: { uMap: { value: burnTex() }, uGrow: { value: 0 }, uHeat: { value: 1 }, uFade: { value: 1 }, uRing: { value: 0 }, uRingI: { value: 1 }, uPool: { value: 1 },
        uHot: { value: new THREE.Color(hot ? '#ffe4a8' : '#c9d6ff') }, uEmber: { value: new THREE.Color(hot ? '#ff7a1c' : '#ff6a2a') } } });
    const m = new THREE.Mesh(decalGeo, mat); m.position.set(at.x, .12, at.z); m.rotation.y = rnd(0, Math.PI * 2); m.scale.setScalar(size); m.renderOrder = 4; scene.add(m);
    const u = mat.uniforms;
    animate(m, life, k => {
      const t = k * life;
      u.uGrow.value = Math.min(1.2, t / 130 * 1.2);                     // the burn races outward
      u.uHeat.value = Math.max(0, 1 - t / 650);                         // blue-white to ember
      u.uFade.value = t < 500 ? 1 : Math.max(0, 1 - (t - 500) / (life - 500)) ** 1.4;
      u.uRing.value = Math.min(1.1, t / 420); u.uRingI.value = Math.max(0, 1 - t / 420);
      u.uPool.value = Math.max(0, 1 - t / 220) * .5;
    }, () => { scene.remove(m); mat.dispose(); });
  }
  // Short arcs that crawl over the cloth around the strike, flickering to new paths.
  const crawlGeos = []; const crawlGeo = () => { if (crawlGeos.length < 12) crawlGeos.push(ribbon([{ pts: channel(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), .55, 4, true), a0: 0, a1: 1, w0: .07, w1: .015, bright: 1 }])); return crawlGeos[Math.floor(Math.random() * crawlGeos.length)]; };
  function crawl(at, { hot = false, n = 5, life = 460, reach = 13 } = {}) {
    if (reduced()) return;
    const mat = ribbonMat({ hot, flat: true }); mat.uniforms.uLead.value = 2; mat.uniforms.uI.value = 1;
    const arcs = Array.from({ length: n }, () => { const m = new THREE.Mesh(crawlGeo(), mat); m.frustumCulled = false; m.position.set(at.x, .2, at.z); m.renderOrder = 5; scene.add(m); return m; });
    let next = 0;
    animate(arcs, life, k => {
      const t = k * life; mat.uniforms.uI.value = (1 - k) ** 1.3 * (Math.random() < .2 ? .4 : 1);
      if (t >= next) { next = t + 45; for (const m of arcs) { m.geometry = crawlGeo(); m.rotation.y = rnd(0, Math.PI * 2); m.scale.setScalar(reach * rnd(.35, 1) * (.6 + k * .6)); } }
    }, () => { for (const m of arcs) scene.remove(m); mat.dispose(); });
  }
  function sparks(at, { color = '#cfdcff', n = 36, speed = 40, life = 700 } = {}) {
    if (reduced()) return;
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos.set([at.x, at.y + .3, at.z], i * 3); const a = rnd(0, Math.PI * 2), up = rnd(.2, 1); vel.push(new THREE.Vector3(Math.cos(a) * rnd(.3, 1), up, Math.sin(a) * rnd(.3, 1)).multiplyScalar(speed * rnd(.4, 1))); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: glowTex, color, size: .8, ...additive });
    const pts = new THREE.Points(geo, mat); scene.add(pts); let last = performance.now();
    animate(pts, life, k => {
      const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
      for (let i = 0; i < n; i++) { const v = vel[i]; v.y -= 110 * dt; pos[i * 3] += v.x * dt; pos[i * 3 + 1] = Math.max(.1, pos[i * 3 + 1] + v.y * dt); if (pos[i * 3 + 1] <= .1) { v.y *= -.35; v.x *= .6; v.z *= .6; } pos[i * 3 + 2] += v.z * dt; }
      geo.attributes.position.needsUpdate = true; mat.opacity = 1 - k * k;
    }, () => { scene.remove(pts); geo.dispose(); mat.dispose(); });
  }
  function flare(at, { color = '#bcd0ff', size = 16, life = 380 } = {}) {
    if (reduced()) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, ...additive }));
    s.position.copy(at); s.position.y += 1; s.scale.setScalar(size); scene.add(s);
    animate(s, life, k => { s.material.opacity = .45 * (1 - k) ** 2; s.scale.setScalar(size * (1 + k * .5)); }, () => { scene.remove(s); s.material.dispose(); });
  }
  // The room's light answers each strike: a cold lamp over the felt.
  const lamp = new THREE.PointLight('#bccaff', 0, 420, 1.1); lamp.position.set(0, 95, -30); scene.add(lamp);
  let lampJob = 0;
  function lampFlash(peak, at, hot = false) {
    if (reduced()) return; const id = ++lampJob; if (at) lamp.position.set(at.x, Math.max(45, at.y + 45), at.z + 8); lamp.color.set(hot ? '#ffdca0' : '#bccaff');
    animate(lamp, 480, k => { if (id !== lampJob) return; lamp.intensity = peak * (k < .06 ? k / .06 : k < .14 ? .3 : k < .22 ? .9 : (1 - k) ** 2); }, () => { if (id === lampJob) lamp.intensity = 0; });
  }
  // The house lights dip while lightning is in the air.
  const base = { key: lights.key.intensity, hemi: lights.hemi.intensity, glow: lights.glow.intensity };
  let dimLevel = 0, dimJob = 0;
  function dim(to, ms = 450) {
    const from = dimLevel, id = ++dimJob;
    const bd = lights.backdrop; base.bd ??= bd?.material.color.clone();
    const set = v => { dimLevel = v; lights.key.intensity = base.key * (1 - .66 * v); lights.hemi.intensity = base.hemi * (1 - .72 * v); lights.glow.intensity = base.glow * (1 - .5 * v); if (bd) bd.material.color.copy(base.bd).multiplyScalar(1 - .75 * v); };
    if (reduced() || ms <= 0) { set(to); requestRender(); return Promise.resolve(); }
    return new Promise(res => animate(lights, ms, k => { if (id === dimJob) set(from + (to - from) * (k * (2 - k))); }, () => { if (id === dimJob) set(to); res(); }));
  }

  // ---- live current round your bet while a multiplier waits on it ---------------------------------
  const m0 = LAYOUT.spots.main, CS = (m0.r + 4) * 2;
  const chargeMat = new THREE.ShaderMaterial({ vertexShader: DECAL_VS, fragmentShader: CHARGE_FS, ...additive,
    uniforms: { uTime: { value: 0 }, uI: { value: 0 }, uR: { value: m0.r + .6 }, uS: { value: CS } } });
  const charge = new THREE.Mesh(decalGeo, chargeMat); charge.scale.setScalar(CS); charge.position.set(m0.x, .14, m0.z); charge.visible = false; charge.renderOrder = 4; scene.add(charge);
  let chargeTick = null, chargeJob = 0;
  function setCharge(on) {
    const id = ++chargeJob, u = chargeMat.uniforms;
    if (on) {
      charge.visible = true;
      if (!chargeTick) { const t0 = performance.now(); chargeTick = () => { u.uTime.value = reduced() ? 0 : (performance.now() - t0) / 1000; }; tickers.add(chargeTick); }
      const from = u.uI.value; animate(charge, 500, k => { if (id === chargeJob) u.uI.value = from + (1 - from) * k; }, () => { if (id === chargeJob) u.uI.value = 1; });
    } else if (charge.visible) {
      const from = u.uI.value; animate(charge, 350, k => { if (id === chargeJob) u.uI.value = from * (1 - k); }, () => { if (id !== chargeJob) return; charge.visible = false; if (chargeTick) { tickers.delete(chargeTick); chargeTick = null; } });
    }
    requestRender();
  }

  // One strike on the felt: the bolt, and where it grounds the burn, the crawling arcs, sparks and the lamp.
  function hit(at, { hot = false, fromX, from, width, life, n, size } = {}) {
    const landed = bolt(at, { hot, fromX, from, width: width ?? (hot ? 1.3 : 1), life });
    landed.then(() => {
      burn(at, { hot, size: size ?? (hot ? 36 : 26) }); crawl(at, { hot, n: hot ? 7 : 5, reach: hot ? 18 : 12 });
      flare(at, { color: hot ? '#ffd98a' : '#bcd0ff', size: hot ? 16 : 10 });
      sparks(at, { color: hot ? '#ffe2a0' : '#cfdcff', n: n ?? (hot ? 60 : 30), speed: hot ? 45 : 32 });
      lampFlash(hot ? 3000 : 1400, at, hot);
    });
    return landed;
  }
  let amb = 0;
  return {
    bolt, sparks, flare, burn, crawl, lampFlash, dim, hit, ground, atScreen, charge: setCharge,
    // the lobby's preview: now and then a bolt finds the table
    ambient(on) {
      clearInterval(amb); amb = 0; if (!on) return;
      amb = setInterval(() => hit(ground(rnd(-.55, .55)), { hot: Math.random() < .2, width: 1.2 }), 1700);
    },
    clear() { clearInterval(amb); amb = 0; dim(0, 0); setCharge(false); },
  };
}
