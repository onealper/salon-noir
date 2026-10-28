// The portal between the salon's rooms: picking the other game in the lobby (blackjack ↔ roulette) sends the table
// you are looking at down through the floor and drops the other one out of the air. Each room's stage has one; the
// salon (app.mjs) runs the two halves one after the other, with a flash of the portal's light between them.
//  - out(): a ring of gold light opens in the carpet round the table, a vortex turning in it and sparks spiralling in.
//    The table gives a little hop, as if it felt the pull, then is drawn down into it, turning with the swirl, while the
//    camera leans over to watch it go; the ring snaps shut on it.
//  - into(): the camera low by the floor, looking up: a ring opens in the dark above, the table drops out of it (cut off
//    at the ring, as through a hole: a clipping plane on its materials), unwinding its turn as it falls. It lands with
//    a squash and a thud that shakes the picture and throws a ring of dust over the floor, the ring closes over it, and
//    the camera cranes up into the lobby's orbit, which goes on from where it stood.
// The table is the room's own group (`body`), moved and turned about its foot and put back as it was; the floor hides
// what sinks below it. Units are centimetres, like every scene here.
const ease = {
  inOut: k => k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2,
  out: k => 1 - (1 - k) ** 3,
  in: k => k ** 3,
  back: k => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2,   // a little past, and back
};
const clamp01 = k => Math.max(0, Math.min(1, k));
const span = (t, a, b) => clamp01((t - a) / (b - a));

const VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// The portal: a dark vortex inside a ring of gold light. `uOpen`: the ring's radius (0 shut, 1 open); `uGlow`: its light.
const PORTAL_FS = `
uniform float uT; uniform float uOpen; uniform float uGlow; varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  if (uOpen < 0.002) discard;
  vec2 p = vUv * 2.0 - 1.0; float r = length(p) / (0.74 * uOpen);
  if (r > 1.35) discard;
  float a = atan(p.y, p.x);
  // streaks winding into the middle along a log spiral, turning; the deep dark at the heart
  float sw = a + 2.6 * log(max(r, 0.03)) + uT * 2.2;
  float streak = pow(0.5 + 0.5 * sin(sw * 5.0 + n(vec2(r * 5.0, sw * 1.3)) * 2.6), 5.0);
  float deep = smoothstep(0.0, 1.0, r);
  vec3 inside = mix(vec3(0.012, 0.008, 0.02), vec3(0.42, 0.29, 0.1), streak * deep * 0.85) + vec3(1.0, 0.78, 0.38) * pow(deep, 8.0) * 0.7;
  float flick = 0.85 + 0.15 * n(vec2(a * 6.0, uT * 9.0));
  float rim = exp(-pow((r - 1.0) * 16.0, 2.0)) * flick, halo = r > 1.0 ? exp(-(r - 1.0) * 8.0) : 0.0;
  vec3 col = (r < 1.0 ? inside : vec3(0.0)) + vec3(1.0, 0.83, 0.48) * (rim * 2.4 + halo * 0.5) * uGlow;
  gl_FragColor = vec4(col, r < 1.0 ? 1.0 : clamp(rim + halo * 0.7, 0.0, 1.0));
}`;
// the dust a landing throws: a ring running out over the floor
const DUST_FS = `
uniform float uR; uniform float uI; varying vec2 vUv;
void main() { vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  float ring = exp(-pow((r - uR) * 7.0, 2.0)) * (1.0 - r);
  gl_FragColor = vec4(vec3(0.62, 0.55, 0.44), ring * uI * 0.55); }`;

export function createPortal(S, { body, floorY, showcase, canvas = S.renderer.domElement, audio = null, reduced = () => false }) {
  const { THREE, scene, camera, renderer, tickers, requestRender } = S;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
  const cue = (name, o) => audio?.cue?.(name, o);
  // a job for the frames to come; `still`: it moves no shadow caster
  const run = (ms, step, still = false) => new Promise(res => {
    const t0 = performance.now();
    const f = now => { const t = Math.min(ms, now - t0); step(t); if (t >= ms) { tickers.delete(f); requestRender(); res(); } };
    f.still = still; tickers.add(f); requestRender();
  });
  const disc = () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: PORTAL_FS, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uOpen: { value: 0 }, uGlow: { value: 1 } } }));
    m.visible = false; m.renderOrder = 3; m.frustumCulled = false; scene.add(m); return m;
  };
  const ring = disc(), dust = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, uniforms: { uR: { value: 0 }, uI: { value: 0 } } }));
  dust.visible = false; dust.renderOrder = 3; scene.add(dust);
  // sparks spiralling into the vortex
  const N = 70, sparkPos = new Float32Array(N * 3), sparkA = new Float32Array(N), sparkR = new Float32Array(N);
  const glow = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: glow, color: '#ffd38a', size: 2.4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sparks.visible = false; sparks.frustumCulled = false; sparks.renderOrder = 4; scene.add(sparks);
  for (let i = 0; i < N; i++) { sparkA[i] = Math.random() * Math.PI * 2; sparkR[i] = Math.random(); }

  // The table's place: its middle and its reach over the floor, taken at rest.
  const box = new THREE.Box3();
  function measure() {
    body.updateMatrixWorld(true); box.setFromObject(body);
    const c = box.getCenter(V()), s = box.getSize(V());
    return { c, foot: V(c.x, floorY, c.z), rx: s.x / 2, rz: s.z / 2, top: box.max.y };
  }
  // the table moved and turned about its foot: up `dy`, turned `turn`, squashed or stretched `sy` (and `sxz` across)
  const scaleV = V(), pivot = V();
  function pose(foot, dy, turn = 0, sy = 1, sxz = 1) {
    body.scale.set(sxz, sy, sxz); body.rotation.set(0, turn, 0);
    pivot.copy(foot).multiply(scaleV.set(sxz, sy, sxz)).applyAxisAngle(UP, turn);
    body.position.set(foot.x - pivot.x, foot.y - pivot.y + dy, foot.z - pivot.z);
  }
  const rest = () => { body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); body.scale.set(1, 1, 1); body.visible = true; };
  // the camera from (eye, at) toward (eye2, at2), k of the way
  const eyeV = V(), atV = V();
  const look = (eye, at, eye2, at2, k) => { eyeV.lerpVectors(eye, eye2, k); atV.lerpVectors(at, at2, k); camera.position.copy(eyeV); camera.up.copy(UP); camera.lookAt(atV); camera.updateMatrixWorld(); };
  function shake(px, ms = 340) {
    if (reduced()) return; const t0 = performance.now();
    const f = () => { const k = (performance.now() - t0) / ms; if (k >= 1) { canvas.style.translate = ''; return; } const a = px * (1 - k) ** 2; canvas.style.translate = `${((Math.random() - .5) * 2 * a).toFixed(1)}px ${((Math.random() - .5) * 2 * a).toFixed(1)}px`; requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }
  const placeRing = (y, rx, rz, x, z) => { ring.position.set(x, y, z); ring.scale.set(rx * 2 / .74, 1, rz * 2 / .74); ring.visible = true; };
  function spin(t, open, m) {
    const u = ring.material.uniforms; u.uT.value = t / 1000; u.uOpen.value = open;
    sparks.visible = open > .05;
    if (!sparks.visible) return;
    for (let i = 0; i < N; i++) {
      sparkA[i] += (.04 + .06 / Math.max(.08, sparkR[i])); sparkR[i] -= .012 + Math.random() * .008;
      if (sparkR[i] < .06) { sparkR[i] = 1 + Math.random() * .25; sparkA[i] = Math.random() * Math.PI * 2; }
      const r = sparkR[i] * open; sparkPos.set([m.c.x + Math.cos(sparkA[i]) * r * m.rx * 1.3, ring.position.y + .5 + (1 - r) * 2, m.c.z + Math.sin(sparkA[i]) * r * m.rz * 1.3], i * 3);
    }
    sparkGeo.attributes.position.needsUpdate = true; sparks.material.opacity = Math.min(1, open * 1.4);
  }

  // ---- out: down through the floor ----------------------------------------------------------------------------------------
  const OUT = 1250;
  async function out() {
    const m = measure(), from = showcase.pose() ?? { eye: camera.position.clone(), at: m.c.clone() };
    showcase.freeze(true, true);
    // the camera leans over the ring to watch the table go: in a little, up a little, its eye going down to the floor under it
    const eye2 = m.c.clone().lerp(from.eye, .86).add(V(0, 25, 0)), at2 = from.at.clone().lerp(V(m.c.x, floorY + 25, m.c.z), .6);
    placeRing(floorY + .4, m.rx * 1.25, m.rz * 1.25, m.c.x, m.c.z); ring.material.uniforms.uGlow.value = 1;
    cue('portal-open', { gain: .6 }); let dropped = false;
    await run(OUT, t => {
      const open = t < 1000 ? ease.back(span(t, 0, 420)) : 1 - ease.in(span(t, 1000, 1180));
      ring.material.uniforms.uGlow.value = 1 + 1.6 * span(t, 1000, 1180);
      spin(t, open, m);
      look(from.eye, from.at, eye2, at2, ease.inOut(span(t, 0, 1000)));
      // the hop, as it feels the pull; then down, turning with the swirl and drawn in
      if (t >= 330 && !dropped) { dropped = true; cue('portal-drop', { gain: .75 }); }   // (its whoomp peaks as the ring snaps shut)
      if (t < 330) pose(m.foot, 0);
      else if (t < 480) { const k = ease.out(span(t, 330, 480)); pose(m.foot, 9 * k, 0, 1 + .05 * k, 1 - .015 * k); }
      else {
        const s = (t - 480) / 1000, k = span(t, 480, 1000);
        pose(m.foot, 9 - .5 * 1500 * s * s, 1.1 * ease.in(k), 1.05 - .1 * k, .985 - .1 * k);
        body.visible = t < 1000;
      }
    });
    ring.visible = sparks.visible = false;
  }
  // after the cut, out of sight: the table back where it stands, the camera back to the orbit
  function settle() { rest(); ring.visible = sparks.visible = false; showcase.freeze(false); requestRender(); }

  // ---- into: out of the air -------------------------------------------------------------------------------------------------
  const clip = new THREE.Plane(V(0, -1, 0), 1e6);   // keeps what is below the ring: far above anything, it keeps it all
  let clipped = false;
  // the table's materials cut at the ring (once: the plane then stays on them, far out of the way, so no material has to
  // be built again for it)
  function clipOn() {
    renderer.localClippingEnabled = true;
    body.traverse(o => { for (const mat of [o.material ?? []].flat()) if (mat.clippingPlanes?.[0] !== clip) { mat.clippingPlanes = [clip]; mat.clipShadows = true; } });
    clipped = true;
  }
  let arrival = null;
  // Before the room's first frame: the table up above the ring, out of sight, and the camera down by the floor, looking
  // up at where the ring will open. Resolves once its materials are built (cut at the ring), so the flash can lift.
  function prime() {
    rest(); const m = measure(); clipOn();
    const orbit = showcase.pose() ?? { eye: camera.position.clone(), at: m.c.clone() };
    showcase.freeze(true, true);
    const sky = m.top + Math.max(95, (m.top - floorY) * 1.1), fall = sky - floorY;   // the ring in the dark above, the table's foot at it
    const flat = V(orbit.eye.x - m.c.x, 0, orbit.eye.z - m.c.z), dist = flat.length() * 1.08;
    const low = V(m.c.x, m.top + 6, m.c.z).add(flat.normalize().multiplyScalar(dist)), up = V(m.c.x, sky, m.c.z);
    clip.constant = sky; pose(m.foot, fall); placeRing(sky, m.rx * 1.12, m.rz * 1.12, m.c.x, m.c.z); ring.material.uniforms.uOpen.value = 0;
    look(low, up, low, up, 0); requestRender();
    arrival = { m, orbit, low, up, sky, fall };
    return Promise.resolve(renderer.compileAsync?.(scene, camera)).catch(() => {});
  }
  const IN = 2300, LAND = 1000;
  async function into() {
    if (!arrival) prime();
    const { m, orbit, low, up, fall } = arrival, g = 2 * fall / ((LAND - 380) / 1000) ** 2, focus = V();
    cue('portal-open', { gain: .5, rate: 1.08 }); let landed = false;
    await run(IN, t => {
      const open = t < LAND + 120 ? ease.back(span(t, 0, 380)) : 1 - ease.in(span(t, LAND + 120, LAND + 420));
      spin(t, open, m);
      // the fall: from the ring to the floor, unwinding the turn it went down with; then the squash, and back
      if (t < 380) pose(m.foot, fall, -1.1);
      else if (t < LAND) { const s = (t - 380) / 1000; pose(m.foot, Math.max(0, fall - .5 * g * s * s), -1.1 * (1 - ease.out(span(t, 380, LAND)))); }
      else {
        if (!landed) { landed = true; clip.constant = 1e6; cue('portal-land', { gain: .8 }); shake(9); dustRun(m); }
        const s = (t - LAND) / 1000, w = Math.exp(-s * 7) * Math.cos(s * 26);   // a damped bounce
        pose(m.foot, 0, 0, 1 - .1 * w, 1 + .04 * w);
      }
      // the camera: looking up at the ring, following the table down, then craning up into the orbit
      const fallen = ease.inOut(span(t, 380, LAND)); focus.lerpVectors(up, m.c, fallen);
      const crane = ease.inOut(span(t, LAND + 150, IN));
      look(low, focus, orbit.eye, orbit.at, crane);
    });
    pose(m.foot, 0); rest(); ring.visible = sparks.visible = false; arrival = null; showcase.freeze(false);
  }
  function dustRun(m) {
    dust.position.set(m.c.x, floorY + .3, m.c.z); dust.scale.set(m.rx * 4, 1, m.rz * 4); dust.visible = true;
    run(900, t => { const k = t / 900; dust.material.uniforms.uR.value = .3 + .65 * ease.out(k); dust.material.uniforms.uI.value = (1 - k) ** 1.5; }, true).then(() => { dust.visible = false; });
  }
  return { out, settle, prime, into, get clipped() { return clipped; } };
}
