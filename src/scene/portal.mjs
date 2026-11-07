// The portal between the salon's rooms: picking the other game in the lobby (blackjack ↔ roulette) sends the table you
// are looking at down through a ring in the floor, and you after it, and brings you down out of a ring in the other
// room's ceiling with its table falling ahead of you. One dive, looking down all the way: the two rooms meet inside the
// vortex, which fills the picture in both at the same size, turning at the same pace (the page's clock), seen the same
// way up, so the salon (app.mjs) can cross from one room's picture to the other's in a moment with nothing to see.
//  - out(): a ring of gold light opens in the carpet round the table, a vortex turning in it, sparks spiralling in. The
//    table rises a breath as it feels the pull, then is drawn down into it, turning with the swirl, while the camera
//    follows it over the ring and down, quicker and quicker, until the vortex is all there is. It goes on turning
//    there (settle() stops it). Resolves with the way up the picture was, for the other room to take.
//  - into(way): the other room's camera, high over a ring in the dark above its table, looking down into the same
//    vortex; the vortex clears as it comes down through the ring, the room below and its table falling ahead of it. The
//    table lands with a squash and a thud that shakes the picture and throws a ring of dust over the floor, and the
//    camera slows and swings round into the lobby's orbit, which goes on from where it stood.
// The table is the room's own group (`body`), moved and turned about its foot and put back as it was; the floor hides
// what sinks below it. Units are centimetres, like every scene here.
const ease = {
  inOut: k => k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2,
  out: k => 1 - (1 - k) ** 3,
  out2: k => 1 - (1 - k) ** 2,
  in: k => k ** 3,
  in2: k => k * k,
  back: k => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2,   // a little past, and back
};
const clamp01 = k => Math.max(0, Math.min(1, k));
const span = (t, a, b) => clamp01((t - a) / (b - a));
const clock = () => performance.now() / 1000;   // the vortex's time: one clock for both rooms, so they turn as one

const VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// The portal: a vortex inside a ring of gold light. `uOpen`: the ring's radius (0 shut, 1 open); `uGlow`: its light;
// `uFill`: the vortex itself (1, the swirl over all within the ring; 0, clear: the rim alone, what lies beyond seen
// through it). Streaks wind into the dark heart along a log spiral and bands run in toward it, so it reads as depth.
const PORTAL_FS = `
uniform float uT; uniform float uOpen; uniform float uGlow; uniform float uFill; varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  if (uOpen < 0.002) discard;
  vec2 p = vUv * 2.0 - 1.0; float r = length(p) / (0.74 * uOpen);
  if (r > 1.35) discard;
  float a = atan(p.y, p.x), lr = log(max(r, 0.02));
  float sw = a + 2.6 * lr + uT * 2.2;
  float streak = pow(0.5 + 0.5 * sin(sw * 5.0 + n(vec2(r * 5.0, sw * 1.3)) * 2.6), 5.0);
  float bands = 0.5 + 0.5 * sin(lr * 9.0 + uT * 5.5);   // rings running in, toward the heart
  float deep = smoothstep(0.0, 1.0, r);
  vec3 inside = mix(vec3(0.012, 0.008, 0.02), vec3(0.42, 0.29, 0.1), streak * deep * (0.7 + 0.3 * bands)) + vec3(1.0, 0.78, 0.38) * pow(deep, 8.0) * 0.7;
  float flick = 0.85 + 0.15 * n(vec2(a * 6.0, uT * 9.0));
  float rim = exp(-pow((r - 1.0) * 16.0, 2.0)) * flick, halo = r > 1.0 ? exp(-(r - 1.0) * 8.0) : 0.0;
  vec3 light = vec3(1.0, 0.83, 0.48) * (rim * 2.4 + halo * 0.5) * uGlow;
  vec3 col = (r < 1.0 ? inside : vec3(0.0)) + light;   // (blended by alpha alone: a straight fade to what lies beyond, no dip)
  float alpha = r < 1.0 ? max(uFill, clamp(rim, 0.0, 1.0)) : clamp(rim + halo * 0.7, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}`;
// the dust a landing throws: a ring running out over the floor
const DUST_FS = `
uniform float uR; uniform float uI; varying vec2 vUv;
void main() { vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  float ring = exp(-pow((r - uR) * 7.0, 2.0)) * (1.0 - r);
  gl_FragColor = vec4(vec3(0.62, 0.55, 0.44), ring * uI * 0.55); }`;

export function createPortal(S, { body, floorY, showcase, canvas = S.renderer.domElement, audio = null, reduced = () => false }) {
  const { THREE, scene, camera, tickers, requestRender } = S;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
  const cue = (name, o) => audio?.cue?.(name, o);
  // a job for the frames to come; `still`: it moves no shadow caster
  const run = (ms, step, still = false) => new Promise(res => {
    const t0 = performance.now();
    const f = now => { const t = Math.min(ms, now - t0); step(t); if (t >= ms) { tickers.delete(f); requestRender(); res(); } };
    f.still = still; tickers.add(f); requestRender();
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: PORTAL_FS, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uOpen: { value: 0 }, uGlow: { value: 1 }, uFill: { value: 1 } } }));
  ring.visible = false; ring.renderOrder = 20;   // (last: it writes no depth, so whatever came after it would be drawn over the vortex)
  ring.frustumCulled = false; scene.add(ring);
  const dust = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, uniforms: { uR: { value: 0 }, uI: { value: 0 } } }));
  dust.visible = false; dust.renderOrder = 3; scene.add(dust);
  // sparks spiralling into the vortex
  const N = 70, sparkPos = new Float32Array(N * 3), sparkA = new Float32Array(N), sparkR = new Float32Array(N);
  const glow = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: glow, color: '#ffd38a', size: 2.4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sparks.visible = false; sparks.frustumCulled = false; sparks.renderOrder = 21; scene.add(sparks);
  for (let i = 0; i < N; i++) { sparkA[i] = Math.random() * Math.PI * 2; sparkR[i] = Math.random(); }

  // The table's place: its middle and its reach over the floor, taken at rest.
  const box = new THREE.Box3();
  function measure() {
    body.updateMatrixWorld(true); box.setFromObject(body);
    const c = box.getCenter(V()), s = box.getSize(V());
    return { c, foot: V(c.x, floorY, c.z), rx: s.x / 2, rz: s.z / 2, top: box.max.y, height: box.max.y - floorY };
  }
  // the table moved and turned about its foot: up `dy`, turned `turn`, squashed or stretched `sy` (and `sxz` across)
  const scaleV = V(), pivot = V();
  function pose(foot, dy, turn = 0, sy = 1, sxz = 1) {
    body.scale.set(sxz, sy, sxz); body.rotation.set(0, turn, 0);
    pivot.copy(foot).multiply(scaleV.set(sxz, sy, sxz)).applyAxisAngle(UP, turn);
    body.position.set(foot.x - pivot.x, foot.y - pivot.y + dy, foot.z - pivot.z);
  }
  const rest = () => { body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); body.scale.set(1, 1, 1); body.visible = true; };
  // The vortex filling the picture, as both rooms meet in it: a ring of radius `R` (cm) seen from straight over its middle,
  // the way up the picture `way` (a level direction), from the height where it reaches past the picture's corners.
  // Worked from each room's own lens and the picture's shape, so it fills the frame alike in both.
  // The lobby frames the view round its menu with an offset lens: the middle of the picture is not where the camera
  // points. `mid`: the turn that brings the picture's middle onto what the camera is aimed at (a portal shot is aimed at
  // the ring, or the table, to be seen in the middle of the picture); the corners measured from that middle.
  const corner = V(), mid = new THREE.Quaternion(), FWD = V(0, 0, -1);
  const lens = () => { camera.updateProjectionMatrix(); corner.set(0, 0, .5).applyMatrix4(camera.projectionMatrixInverse).normalize(); mid.setFromUnitVectors(corner, FWD); return mid; };
  const fillHeight = R => {
    const q = lens(); let far = 0;
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { corner.set(x, y, .5).applyMatrix4(camera.projectionMatrixInverse).applyQuaternion(q); far = Math.max(far, Math.hypot(corner.x, corner.y) / -corner.z); }
    return .92 * R / far;
  };
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), m4 = new THREE.Matrix4(), tv = V();
  // a camera at `eye` with `at` in the middle of the picture (`raw`: on the lens's axis, as the orbit has it)
  const lookQ = (q, eye, at, up, raw = false) => { q.setFromRotationMatrix(m4.lookAt(eye, at, up)); return raw ? q : q.multiply(lens()); };
  const place = (eye, q) => { camera.position.copy(eye); camera.quaternion.copy(q); camera.updateMatrixWorld(); };
  function shake(px, ms = 340) {
    if (reduced()) return; const t0 = performance.now();
    const f = () => { const k = (performance.now() - t0) / ms; if (k >= 1) { canvas.style.translate = ''; return; } const a = px * (1 - k) ** 2; canvas.style.translate = `${((Math.random() - .5) * 2 * a).toFixed(1)}px ${((Math.random() - .5) * 2 * a).toFixed(1)}px`; requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }
  // the ring at (x, y, z), its radii across x and z (an ellipse round a long table, a circle when it fills the picture)
  const placeRing = (x, y, z, rx, rz) => { ring.position.set(x, y, z); ring.scale.set(rx * 2 / .74, 1, rz * 2 / .74); ring.visible = true; };
  function spin(open, m, y) {
    const u = ring.material.uniforms; u.uT.value = clock(); u.uOpen.value = open;
    sparks.visible = open > .05 && !!m;
    if (!sparks.visible) return;
    for (let i = 0; i < N; i++) {
      sparkA[i] += (.04 + .06 / Math.max(.08, sparkR[i])); sparkR[i] -= .012 + Math.random() * .008;
      if (sparkR[i] < .06) { sparkR[i] = 1 + Math.random() * .25; sparkA[i] = Math.random() * Math.PI * 2; }
      const r = sparkR[i] * open; sparkPos.set([m.c.x + Math.cos(sparkA[i]) * r * m.rx * 1.3, y + .5 + (1 - r) * 2, m.c.z + Math.sin(sparkA[i]) * r * m.rz * 1.3], i * 3);
    }
    sparkGeo.attributes.position.needsUpdate = true; sparks.material.opacity = Math.min(1, open * 1.4);
  }

  // ---- out: down through the floor, and after it ---------------------------------------------------------------------
  const OUT = 1150, SINK = [260, 860];
  let swirling = null;   // the vortex turning on, filling the picture, until settle()
  async function out() {
    const m = measure(), from = showcase.pose() ?? { eye: camera.position.clone(), at: m.c.clone() };
    showcase.freeze(true, true);
    // the way up the picture as you go down: the way you were looking, laid level (no roll as the camera turns over)
    const way = V(from.at.x - from.eye.x, 0, from.at.z - from.eye.z); if (way.lengthSq() < 1e-6) way.set(0, 0, -1); way.normalize();
    const R = Math.max(m.rx, m.rz) * 1.2, yRing = floorY + .4, low = V(m.c.x, yRing + fillHeight(R), m.c.z), c = V(m.c.x, yRing, m.c.z);
    lookQ(qA, from.eye, from.at, UP, true); lookQ(qB, low, c, way);
    placeRing(m.c.x, yRing, m.c.z, m.rx * 1.2, m.rz * 1.2); ring.material.uniforms.uGlow.value = 1; ring.material.uniforms.uFill.value = 1;
    cue('portal-open', { gain: .6 }); let dropped = false;
    await run(OUT, t => {
      // the ring opens round the table, then widens to a circle as you come over it
      const w = ease.inOut(span(t, 500, OUT));
      placeRing(m.c.x, yRing, m.c.z, m.rx * 1.2 + (R - m.rx * 1.2) * w, m.rz * 1.2 + (R - m.rz * 1.2) * w);
      spin(ease.back(span(t, 0, 300)), m, yRing); ring.material.uniforms.uGlow.value = 1 - .5 * ease.inOut(span(t, 500, OUT));   // (the rim softer as it sweeps past, close)
      // a breath up as it feels the pull, then drawn down into it, turning with the swirl, quicker and quicker
      if (t >= SINK[0] && !dropped) { dropped = true; cue('portal-drop', { gain: .75 }); }
      if (t < SINK[0]) pose(m.foot, 3.5 * ease.out(span(t, 110, SINK[0])));
      else { const k = span(t, SINK[0], SINK[1]); pose(m.foot, 3.5 - (m.height + 30) * ease.in(k), .95 * ease.in2(k)); body.visible = k < 1; }
      // you after it: from where you stood, over the ring and down into it, gathering speed, the picture turning over
      const k = span(t, 180, OUT), e = ease.in2(k) * (1.6 - .6 * k);   // (slow to start, quick at the end: the dive)
      tv.lerpVectors(from.eye, low, e); camera.position.copy(tv); camera.quaternion.slerpQuaternions(qA, qB, ease.inOut(span(t, 180, OUT * .92))); camera.updateMatrixWorld();
    });
    place(low, qB);
    // the vortex, all there is now, turning on until the other room has taken over
    swirling = () => { ring.material.uniforms.uT.value = clock(); requestRender(false); }; swirling.still = swirling.lazy = true; tickers.add(swirling); sparks.visible = false;
    return { way };
  }
  // after the cut, out of sight: the vortex stopped, the table back where it stands, the camera back to the orbit
  function settle() { if (swirling) { tickers.delete(swirling); swirling = null; } rest(); ring.visible = sparks.visible = false; showcase.freeze(false); requestRender(); }

  // ---- into: down out of the air -------------------------------------------------------------------------------------------
  let arrival = null;
  // Before the room's first frame: the ring in the dark above the table, the table just under it, and the camera high
  // over the ring, looking down into the vortex. Resolves once the room's shaders are ready, so the cut can be made.
  function prime() {
    rest(); const m = measure();
    const orbit = showcase.pose() ?? { eye: camera.position.clone(), at: m.c.clone() };
    showcase.freeze(true, true);
    // the ring well over where the orbit will stand, so you come down through it; the table's foot just under it
    const R = Math.max(m.rx, m.rz) * 1.2, sky = Math.max(m.top + 70, orbit.eye.y + 60), start = sky - 6 - m.height;
    placeRing(m.c.x, sky, m.c.z, R, R); ring.material.uniforms.uOpen.value = 1; ring.material.uniforms.uFill.value = 1; ring.material.uniforms.uGlow.value = 1;
    pose(m.foot, start - floorY, -.95);
    arrival = { m, orbit, R, sky, start };
    aim(V(0, 0, -1));
    S.hold?.(4000);   // nothing drawn until into(): unseen behind the other room, it would only double the GPU's work
    return S.compiled ? S.compiled().catch(() => {}) : Promise.resolve();
  }
  // the camera over the ring, the picture's top the way `way` points
  function aim(way) { const { m, R, sky } = arrival, high = V(m.c.x, sky + fillHeight(R), m.c.z); arrival.high = high; arrival.way = way; place(high, lookQ(qA, high, V(m.c.x, sky, m.c.z), way)); ring.material.uniforms.uT.value = clock(); }
  const IN = 1650, LAND = 720;
  async function into({ way } = {}) {
    if (!arrival) prime();
    if (way) aim(way);
    S.hold?.(0);
    const { m, orbit, sky, start, high } = arrival, drop = start - floorY, g = 2 * drop / (LAND / 1000) ** 2, v0 = V(m.c.x, sky - 2, m.c.z);
    lookQ(qB, orbit.eye, orbit.at, UP, true); const qOn = new THREE.Quaternion(), on = V(); let dy = drop;
    // the way down: from high over the ring, down through it, and round into the orbit (a curve through v0, the ring's middle)
    const p0 = high, p1 = v0.clone().setY(sky - 30), p2 = V(orbit.eye.x, orbit.eye.y + 30, orbit.eye.z), p3 = orbit.eye;
    const bez = (u, out) => { const a = 1 - u; return out.set(0, 0, 0).addScaledVector(p0, a * a * a).addScaledVector(p1, 3 * a * a * u).addScaledVector(p2, 3 * a * u * u).addScaledVector(p3, u * u * u); };
    cue('portal-open', { gain: .38, rate: 1.12 }); let landed = false;
    await run(IN, t => {
      // the vortex clears as you come to it; the ring, passed, is above you and out of the picture
      const u = ring.material.uniforms; u.uT.value = clock(); u.uFill.value = 1 - ease.inOut(span(t, 170, 470));   // (full through the salon's crossfade: app.mjs)
      ring.visible = t < 700;
      // the table falls ahead of you, unwinding the turn it went down with; then the squash, and back
      if (t < LAND) { const s = t / 1000; dy = Math.max(0, drop - .5 * g * s * s); pose(m.foot, dy, -.95 * (1 - ease.out(t / LAND))); }
      else {
        if (!landed) { landed = true; cue('portal-land', { gain: .8 }); shake(7); dustRun(m); }
        const s = (t - LAND) / 1000, w = Math.exp(-s * 7) * Math.cos(s * 26);   // a damped bounce
        dy = 0; pose(m.foot, 0, 0, 1 - .08 * w, 1 + .03 * w);
      }
      // you: quick through the ring, slowing as you come round into the orbit; your eyes on the table as it falls away,
      // then lifting to the orbit's view
      bez(ease.out2(t / IN), tv); camera.position.copy(tv);
      lookQ(qOn, tv, on.set(m.c.x, m.c.y + dy, m.c.z), way ?? arrival.way);
      camera.quaternion.slerpQuaternions(qOn, qB, ease.inOut(span(t, 420, IN))); camera.updateMatrixWorld();
    });
    pose(m.foot, 0); rest(); ring.visible = sparks.visible = false; arrival = null; showcase.freeze(false);
  }
  function dustRun(m) {
    dust.position.set(m.c.x, floorY + .3, m.c.z); dust.scale.set(m.rx * 4, 1, m.rz * 4); dust.visible = true;
    run(900, t => { const k = t / 900; dust.material.uniforms.uR.value = .3 + .65 * ease.out(k); dust.material.uniforms.uI.value = (1 - k) ** 1.5; }, true).then(() => { dust.visible = false; });
  }
  return { out, settle, prime, into };
}
