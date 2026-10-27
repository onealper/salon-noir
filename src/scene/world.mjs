// The table as a real scene, in centimetres. One camera sits in your seat.
// Layout, measured outward from the dealer's straight edge (z = -40):
//   chip rack · dealer's cards · wordmark · printed arcs · your cards ·
//   side-bet crown · your main circle · padded armrest (radius 100).
import * as THREE from '../vendor/three.module.min.js';
import { createStage, detectQuality, leatherMaterial, brassMaterial, fitFov, salonWall, carpetFloor, salonEnvironment } from './stage.mjs';
import { artImage, paintFelt, paintSpot, paintBand, medallionTexture, edgeTexture, backTexture, setFaceDetail, onArtLanded, CARD_W, CARD_H, CHIP_R, CHIP_H, chipFaceTexture, chipEdgeTexture, chipBumpTexture } from './textures.mjs';

export const EDGE_Z = -40, R = 100, CARD_T = .03;
// Your eye is placed per screen shape (see frame()): seated height and distance are searched
// within a realistic range, and the closest view that still shows everything needed wins.
// Seated at a real table the eye is 40-60 cm over the felt and 30-60 cm behind the rail (z 60).
// Upright phones get a higher, more overhead seat so the narrow screen still holds the layout.
export const CAMERA = { land: { y: [42, 60], z: [90, 130], x: [0] }, port: { y: [56, 110], z: [80, 130], x: [0, 3, 6] } };
export const LAYOUT = {
  dealer: { x: 0, z: -26 },
  player: { x: 0, z: 29 },   // first card just above the side-bet arc; later cards climb toward the insurance line
  spots: { main: { x: 0, z: 49, r: 6 } },
  rack: { x: 0, z: -36.5 },
  discard: { x: -50, z: -29, yaw: .3 },
  shoe: { x: 28, z: -27, yaw: .27 },   // mouth point; the body runs back toward the dealer's left corner
};
// Six small side circles hug the top of the main circle in one arc, left to right as in
// All Bets Blackjack: Buster, Top 3, Lucky Lucky, Perfect Pairs, 21+3, Dealer Pairs.
['buster', 'top3', 'lucky', 'pairs', 'p213', 'dpairs'].forEach((id, i) => {
  const a = Math.PI * (1 - i / 5), m = LAYOUT.spots.main, D = 12;
  LAYOUT.spots[id] = { x: +(m.x + Math.cos(a) * D).toFixed(2), z: +(m.z - Math.sin(a) * D).toFixed(2), r: 3.55, lift: .24 };   // raised medallions
});
// Five seats round the curve, 29 degrees apart, in deal order: first base (the dealer's left, your
// right) to third base. You sit in the middle. Everything laid out for your seat is carried to another
// seat by turning it about the centre of the dealer's edge.
export const SEAT_STEP = 29 * Math.PI / 180, YOU_SEAT = 2;
export const seatAngle = k => (YOU_SEAT - k) * SEAT_STEP;
export function toSeat(k, x, z) {
  const a = seatAngle(k), zr = z - EDGE_Z, c = Math.cos(a), s = Math.sin(a);
  return { x: x * c + zr * s, z: -x * s + zr * c + EDGE_Z };
}

export function createWorld(canvas, { specs, quality = detectQuality(), mode }) {
  // the renderer, its loop and frame watcher, the scene and the camera (stage.mjs: the same for the wheel)
  const st = createStage(canvas, { quality, background: '#0c0c0d', environment: .42, fov: 42, far: 900, lights: () => [key], restored: () => reflectSalon() });
  const { renderer, scene, camera, view, tickers, requestRender, maxTex, aniso } = st;
  setChipDetail(quality.chipSegments); setFaceDetail(quality.face);
  onArtLanded(() => requestRender());

  // ---- light: a warm pendant over the table, a cool fill, a dim back glow ----
  const key = new THREE.SpotLight('#fff0d8', 5200, 0, .78, .85, 1.6);
  key.position.set(-8, 150, 22); key.target.position.set(0, 0, -2); key.castShadow = true;
  key.shadow.mapSize.set(quality.shadow, quality.shadow); key.shadow.bias = -.00012; key.shadow.normalBias = .02; key.shadow.radius = 5;
  key.shadow.camera.near = 60; key.shadow.camera.far = 220;
  const hemi = new THREE.HemisphereLight('#58606c', '#0b0b0c', .55);
  scene.add(key, key.target, hemi);
  const glow = new THREE.PointLight('#ffb866', 900, 260, 1.6); glow.position.set(0, 60, -130); scene.add(glow);

  // ---- the room: the card salon round the table, out of focus (stage.mjs), the carpet underfoot. From the seat only a
  // thin band of it shows past the chip tray, so the wall stands close behind the dealer (1.2 m past his edge, the
  // circle's middle out past your seat) and hangs low, its row of sconces (a third of the way down the picture) in that
  // band; its panelling meets the carpet. The lobby's sweep round the table sees it all round. Without the picture: a
  // dark wall with two warm lamps.
  const roomArt = artImage('table:salon'), FLOOR_Y = -78; let backdrop = null, roomLight = null;
  if (roomArt) {   // (its light mask lets the Lightning table's storm flash the mirrors and windows and flicker the lamps)
    const salon = salonWall(roomArt, { radius: 380, horizon: .59, eye: -140, floorY: FLOOR_Y, aniso, light: artImage('table:salon-light') });
    salon.place(0, EDGE_Z - 120 + 380, 0, -1); scene.add(salon.mesh); backdrop = salon.mesh; roomLight = salon.light;
  } else {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(700, 320), new THREE.MeshStandardMaterial({ color: '#15130f', roughness: .9 }));
    wall.position.set(0, 60, -190); scene.add(wall);
    for (const [x, y] of [[-95, 88], [120, 72]]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,200,130,.95)', 'rgba(255,170,90,0)'), transparent: true, depthWrite: false }));
      s.position.set(x, y, -180); s.scale.set(70, 70, 1); scene.add(s);
    }
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.MeshStandardMaterial({ color: '#0e0d0c', roughness: 1 }));
  if (artImage('table:carpet')) carpetFloor(floor, artImage('table:carpet'), { aniso });
  floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; scene.add(floor);

  // ---- the table ------------------------------------------------------------------
  const table = new THREE.Group(); scene.add(table);
  const feltTex = paintFelt(Math.min(maxTex, quality.felt), mode); feltTex.anisotropy = aniso;
  const felt = new THREE.Mesh(new THREE.CircleGeometry(R, 160, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ map: feltTex, roughness: .96, metalness: 0 }));
  felt.geometry.rotateX(-Math.PI / 2); felt.geometry.translate(0, 0, EDGE_Z); remapFeltUV(felt.geometry);
  felt.receiveShadow = true; table.add(felt);
  // Body under the felt and a dark workstation behind the dealer's edge.
  const body = new THREE.Mesh(extrudeHalfDisc(R + 7, 10), new THREE.MeshStandardMaterial({ color: '#16120f', roughness: .7 }));
  body.position.set(0, -.05, EDGE_Z); table.add(body);
  const station = new THREE.Mesh(new THREE.BoxGeometry(240, 4, 40), new THREE.MeshStandardMaterial({ color: '#100f0e', roughness: .85 }));
  station.position.set(0, -2.4, EDGE_Z - 20.5); station.receiveShadow = true; if (!roomArt) table.add(station);
  // Padded leather armrest along the curve, with a brass line where it meets the felt.
  const arc = (r, y) => new ArcXZ(r, y);
  const leather = leatherMaterial();
  const grainArt = artImage('table:leather'); let grainTex = null;
  const grain = (u, v) => {
    // The drawn leather's grain as a bump map, about one 10 cm tile at a time. Clones share one image
    // (one upload); only the tiling differs.
    if (!grainTex) { grainTex = new THREE.Texture(grainArt); grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping; grainTex.anisotropy = aniso; grainTex.needsUpdate = true; }
    const t = grainTex.clone(); t.repeat.set(u, v); return t;
  };
  const railLen = Math.PI * (R + 5.4), railRound = 2 * Math.PI * 5.6;
  const railMat = grainArt ? leather.clone() : leather, capMat = grainArt ? leather.clone() : leather;
  if (grainArt) {
    railMat.bumpMap = grain(Math.round(railLen / 10), Math.round(railRound / 10)); railMat.bumpScale = 1.8;
    capMat.bumpMap = grain(4, 2); capMat.bumpScale = 1.8;
  }
  const rail = new THREE.Mesh(new THREE.TubeGeometry(arc(R + 5.4, 2.4), 200, 5.6, 28, false), railMat); rail.castShadow = rail.receiveShadow = true; table.add(rail);
  for (const x of [-(R + 5.4), R + 5.4]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(5.6, 28, 16), capMat); cap.position.set(x, 2.4, EDGE_Z); table.add(cap); }
  const brass = brassMaterial();
  table.add(new THREE.Mesh(new THREE.TubeGeometry(arc(R - .3, .35), 200, .42, 10, false), brass));
  const lip = new THREE.Mesh(new THREE.BoxGeometry(2 * R + 22, 1.1, 1.4), brass); lip.position.set(0, .2, EDGE_Z - .7); table.add(lip);

  // ---- betting positions: the main circle printed on the cloth; the six side bets as raised
  // medallions set in a recessed band that hugs it ---------------------------------------------
  const spots = {}, mainSpot = LAYOUT.spots.main;
  {
    const t = paintSpot({ main: true }); t.anisotropy = aniso;
    const m = new THREE.Mesh(new THREE.CircleGeometry(mainSpot.r, 64), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: .95, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.position.set(mainSpot.x, .02, mainSpot.z); m.receiveShadow = true; table.add(m); spots.main = m;
  }
  // the other four seats: a main circle each, no side bets
  spots.seats = [];
  {
    const t = paintSpot({ main: true }); t.anisotropy = aniso;
    const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: .95, polygonOffset: true, polygonOffsetFactor: -2 });
    const pairsTex = paintSpot({ short: 'PP' }), p213Tex = paintSpot({ short: '21+3' }); pairsTex.anisotropy = p213Tex.anisotropy = aniso;
    for (let k = 0; k < 5; k++) {
      if (k === YOU_SEAT) { spots.seats.push(spots.main); continue; }
      const p = toSeat(k, mainSpot.x, mainSpot.z), m = new THREE.Mesh(new THREE.CircleGeometry(mainSpot.r, 64), mat);
      m.rotation.set(-Math.PI / 2, 0, seatAngle(k)); m.position.set(p.x, .02, p.z); m.receiveShadow = true; table.add(m); spots.seats.push(m);
      // two small printed circles beside it: Perfect Pairs on the left, 21+3 on the right
      for (const [dx, t] of [[-10.5, pairsTex], [10.5, p213Tex]]) {
        const q = toSeat(k, dx, 43), c = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: .95, polygonOffset: true, polygonOffsetFactor: -2 }));
        c.rotation.set(-Math.PI / 2, 0, seatAngle(k)); c.position.set(q.x, .02, q.z); c.receiveShadow = true; table.add(c);
      }
    }
  }
  const B = { w: 37, h: 23.5, cx: 18.5, cy: 17.4, r0: 7.6, r1: 16.4 };
  const bandTex = paintBand(B); bandTex.anisotropy = aniso;
  const band = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), new THREE.MeshStandardMaterial({ map: bandTex, transparent: true, roughness: .95, polygonOffset: true, polygonOffsetFactor: -1, depthWrite: false }));
  band.rotation.x = -Math.PI / 2; band.position.set(mainSpot.x, .012, mainSpot.z - B.cy + B.h / 2); band.receiveShadow = true; table.add(band);
  const medalSide = new THREE.MeshStandardMaterial({ color: '#8a6d34', metalness: .85, roughness: .32 });
  const medals = new Map(), medallion = spec => { if (!medals.has(spec.id)) { const t = medallionTexture(spec); t.anisotropy = aniso; medals.set(spec.id, t); } return medals.get(spec.id); };   // one per bet: a table change swaps, never repaints
  for (const spec of specs) {
    const s = LAYOUT.spots[spec.id]; if (!s) continue;
    const g = new THREE.Group(); g.position.set(s.x, 0, s.z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r + .08, s.lift, 64, 1, true), medalSide); body.position.y = s.lift / 2; body.castShadow = body.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.CircleGeometry(s.r, 64), new THREE.MeshStandardMaterial({ map: medallion(spec), roughness: .5, metalness: .15 }));
    top.rotation.x = -Math.PI / 2; top.position.y = s.lift + .002; top.receiveShadow = true;
    g.add(body, top); table.add(g); spots[spec.id] = g;
  }
  spots.band = band;

  // ---- dealer's chip rack: ten troughs of chips lying on edge ----------------------------
  const rackGroup = new THREE.Group(); rackGroup.position.set(LAYOUT.rack.x, 0, LAYOUT.rack.z); table.add(rackGroup);
  const rackBody = new THREE.Mesh(new THREE.BoxGeometry(48, 2.2, 7.4), new THREE.MeshStandardMaterial({ color: '#0f0f10', roughness: .4, metalness: .2 }));
  rackBody.position.y = .6; rackBody.receiveShadow = true; rackGroup.add(rackBody);
  const troughs = [500, 100, 100, 50, 25, 25, 10, 5, 5, 1];
  troughs.forEach((v, i) => {
    const count = 16, geo = chipGeometry(quality.chipSegments);
    const mats = chipMaterials(v), mesh = new THREE.InstancedMesh(geo, mats, count), m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    for (let k = 0; k < count; k++) { m4.compose(new THREE.Vector3(-21.6 + i * 4.8, 1.75, -3.2 + k * (CHIP_H + .02)), q, new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(k, m4); }
    mesh.castShadow = true; rackGroup.add(mesh);
  });

  // ---- discard holder: clear acrylic like the shoe, low at the front, dealer's right ---------------------------------------
  const glass = glassMaterials();
  function reflectSalon() { const env = salonEnvironment(renderer, roomArt); for (const m of Object.values(glass)) { m.envMap = env; m.needsUpdate = true; } }
  reflectSalon();
  const discard = new THREE.Group(); discard.position.set(LAYOUT.discard.x, 0, LAYOUT.discard.z); discard.rotation.y = LAYOUT.discard.yaw; table.add(discard);
  const box = (w, h, d, x, y, z) => { const m = glassBox(w, h, d, glass); m.position.set(x, y, z); m.receiveShadow = true; return m; };
  discard.add(box(11, .6, 8.4, 0, .3, 0), box(11, 8, .5, 0, 4, -4.1), box(11, 3.2, .5, 0, 1.6, 4.1), box(.5, 8, 8.4, -5.4, 4, 0), box(.5, 8, 8.4, 5.4, 4, 0));
  const edgeTex = edgeTexture(true), flatEdge = edgeTexture(false);
  const discardStack = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, 1, CARD_H), [edgeMat(flatEdge), edgeMat(flatEdge), new THREE.MeshStandardMaterial({ map: backTexture(), roughness: .45 }), edgeMat(flatEdge), edgeMat(flatEdge), edgeMat(flatEdge)]);
  discardStack.castShadow = true; discard.add(discardStack);
  let discarded = 0;
  function setDiscards(n) { discarded = n; const h = Math.max(.001, n * CARD_T); discardStack.scale.y = h; discardStack.position.y = .6 + h / 2; discardStack.visible = n > 0; }
  setDiscards(0);

  // ---- the shoe -----------------------------------------------------------------------
  const key0 = key.intensity, shoe = buildShoe({ edgeTex, glass, light: () => key.intensity / key0 });   // the edges' glow follows the pendant (down with the house lights)
  // the reader lights as each card slides over it, and dies back
  let readAt = -1e9; const readTick = () => { const k = (performance.now() - readAt) / 520; shoe.glow(k >= 1 ? 0 : (1 - k) ** 2); if (k >= 1) tickers.delete(readTick); requestRender(false); };
  readTick.still = true; shoe.read = () => { readAt = performance.now(); tickers.add(readTick); requestRender(false); };
  shoe.group.position.set(LAYOUT.shoe.x, 0, LAYOUT.shoe.z); shoe.group.rotation.y = LAYOUT.shoe.yaw; table.add(shoe.group);

  // ---- camera: your seat --------------------------------------------------------------
  // Keep the essentials in frame: your main circle and the side-bet arc, the dealer's edge, and
  // (on wide screens) the whole shoe and discard holder; upright, the shoe's mouth.
  const scratch = new THREE.Vector3();
  let head = .94;   // how high in the frame (NDC) the essentials may reach: upright, below the hint's line under the bar
  function mustSee(portrait, compact) {
    const sp = LAYOUT.spots, m = sp.main;
    return [[m.x, 0, m.z + m.r + 1], [sp.buster.x - sp.buster.r - 1, 0, sp.buster.z + sp.buster.r], [sp.dpairs.x + sp.dpairs.r + 1, 0, sp.dpairs.z + sp.dpairs.r], [0, 3, EDGE_Z - 3], [-24, 3, EDGE_Z - 2]]
      .concat(portrait || compact ? [[LAYOUT.shoe.x + 7, SHOE.topAt(7) + .2, LAYOUT.shoe.z - 3]].concat(compact ? [[LAYOUT.discard.x + 5, 4, LAYOUT.discard.z]] : []) : [[LAYOUT.shoe.x + 30, SHOE.hgt + .2, LAYOUT.shoe.z - 9], [LAYOUT.discard.x - 7, 8, LAYOUT.discard.z]]).concat(extraSee);
  }
  // Point the camera from `eye` at the pitch-middle of the points and open the lens just enough.
  function aim(eye, must) {
    const pitch = p => Math.atan2(eye.y - p[1], eye.z - p[2]), ps = must.map(pitch), mid = (Math.min(...ps) + Math.max(...ps)) / 2;
    const yaw = Math.atan2(-eye.x * .6, 100);
    camera.position.copy(eye); camera.lookAt(eye.x + Math.sin(yaw) * 100 * Math.cos(mid), eye.y - Math.sin(mid) * 100, eye.z - Math.cos(mid) * 100);
    camera.updateMatrixWorld();   // project() reads the world matrix, which render() would otherwise refresh too late
    const fits = fov => { camera.fov = fov; camera.updateProjectionMatrix(); return must.every(p => { scratch.set(...p).project(camera); return Math.abs(scratch.x) < .96 && scratch.y < head && scratch.y > -.94 && scratch.z < 1; }); };
    const fov = fitFov(fits, 16, 70, .25); if (fov == null) return null;
    fits(fov); return fov;
  }
  const pxOf = (a, b) => { scratch.set(...a).project(camera); const x0 = scratch.x, y0 = scratch.y; scratch.set(...b).project(camera); return Math.hypot((scratch.x - x0) * view.w, (scratch.y - y0) * view.h) / 2; };
  // The padded rail must not hide the near edge of your main circle (checked in the centre plane).
  function clearsRail(eye) {
    const m = LAYOUT.spots.main, pz = m.z + m.r + .5, cy = 2.4, cz = EDGE_Z + R + 5.4, rr = 5.6 + .6;
    const dz = eye.z - pz, dy = eye.y, len = Math.hypot(dz, dy);
    return Math.abs(dy * (cz - pz) - dz * (cy - 0)) / len > rr || cz < pz;
  }
  // `top`: pixels at the top of the canvas covered by the (translucent) top bar. The view is framed
  // for the area below it, then the lens is extended upward over those pixels (an off-centre
  // frustum), so the room shows through the bar without anything important sitting under it.
  function frame(w, h, top = 0) {
    st.size(w, h);
    const vh = Math.max(1, h - top); view.w = w; view.h = vh;
    camera.clearViewOffset(); camera.aspect = w / vh;
    const portrait = w / vh < .9, compact = !portrait && vh < 460, cfg = portrait ? CAMERA.port : CAMERA.land, must = mustSee(portrait, compact);   // compact: a phone on its side
    head = portrait ? .94 - Math.min(.2, 2 * 40 / vh) : .94;   // (the hint is about 35 px from the top: on a short phone the dealer's rack sat under it)
    // Search seat height and distance for the view where the cards read largest - yours and the
    // dealer's, taken together - with a mild cost for a wide lens.
    let best = null;
    for (const x of cfg.x) for (let y = cfg.y[0]; y <= cfg.y[1]; y += 2) for (let z = cfg.z[0]; z <= cfg.z[1]; z += 3) {
      const eye = new THREE.Vector3(x, y, z);
      if (!clearsRail(eye)) continue;                               // see over the rail to the near edge of your circle
      const fov = aim(eye, must); if (fov == null) continue;
      const score = Math.sqrt(pxOf([-3, 0, LAYOUT.player.z], [3, 0, LAYOUT.player.z]) * pxOf([-3, 0, LAYOUT.dealer.z], [3, 0, LAYOUT.dealer.z])) * (1 - Math.max(0, fov - 38) * .008) - Math.abs(x) * .4;
      if (!best || score > best.score) best = { eye, score };
    }
    aim(best ? best.eye : new THREE.Vector3(0, 51, 108), must);
    baseQuat.copy(camera.quaternion); applyPan(); seatPos.copy(camera.position);
    view.h = h; if (top > 0) camera.setViewOffset(w, vh, 0, -top, w, h);
    for (const f of afterFrame) f(w, h, top);
    if (show.on) placeShowcase(performance.now());   // the lobby keeps its own camera
    requestRender();
  }
  const seatPos = new THREE.Vector3(), afterFrame = new Set();
  let extraSee = [];   // points a table asks the seat's view to include (the Lightning marquee)
  // ---- the showcase: in the lobby the camera circles the table slowly, like a film opening on the
  // room; taking a seat flies it down into your chair. ---------------------------------------------
  const show = { on: false, fly: null }, orbitEye = new THREE.Vector3(), orbitAt = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
  function placeShowcase(now) {
    const portrait = camera.aspect < .9, t = now / 1000;
    const a = Math.sin(t * .075) * .62 + Math.sin(t * .031) * .12;          // a slow sweep around the table
    // framed for the lobby's layout: the table floats in the band between the title and the rail
    const r = portrait ? 300 : 200, y = (portrait ? 190 : 118) + Math.sin(t * .11) * 6;
    orbitEye.set(Math.sin(a) * r, y, 10 + Math.cos(a) * r);
    orbitAt.set(Math.sin(a) * 8, portrait ? -120 : -44, portrait ? -8 : 0);
    camera.position.copy(orbitEye); camera.up.set(0, 1, 0); camera.lookAt(orbitAt); camera.updateMatrixWorld();
  }
  // The orbit is a slow drift: drawn at 30 frames a second (`lazy`, it asks for its own frames) and,
  // moving only the camera, never redraws the shadows (`still`). The fly-in takes every frame.
  let shown = 0;
  function showTick(now) {
    if (show.fly) {
      const f = show.fly, k = Math.min(1, (now - f.t0) / f.ms), e = k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
      camera.position.lerpVectors(f.fromPos, seatPos, e);
      camera.quaternion.slerpQuaternions(f.fromQuat, tmpQ.setFromAxisAngle(UPV, pan).multiply(baseQuat), e); camera.updateMatrixWorld();
      if (k >= 1) { tickers.delete(showTick); show.on = false; show.fly = null; applyPan(); f.done(); }
      return;
    }
    if (now - shown < 31) return;
    shown = now; placeShowcase(now); requestRender(false);
  }
  showTick.still = true;
  const showcase = {
    get on() { return show.on; },
    start(still = false) { show.on = true; show.fly = null; showTick.lazy = true; if (still) { tickers.delete(showTick); placeShowcase(9000); } else tickers.add(showTick); requestRender(false); },   // `still`: reduced motion holds one pose
    // fly from wherever the orbit is to your seat; resolves when you are sitting
    stop(ms = 1300) {
      if (!show.on) return Promise.resolve();
      if (ms <= 0) { tickers.delete(showTick); show.on = false; camera.position.copy(seatPos); applyPan(); requestRender(false); return Promise.resolve(); }
      showTick.lazy = false; tickers.add(showTick);
      return new Promise(done => { show.fly = { t0: performance.now(), ms, fromPos: camera.position.clone(), fromQuat: camera.quaternion.clone(), done }; requestRender(); });
    },
  };
  // The director's pan: from your seat the head turns toward whoever is playing, then back.
  // `pan` is a turn about the vertical (radians, positive looks left) on top of the framed view.
  const baseQuat = new THREE.Quaternion(), panQ = new THREE.Quaternion(); let pan = 0;
  function applyPan() { if (show.on) return; camera.quaternion.copy(panQ.setFromAxisAngle(UPV, pan).multiply(baseQuat)); camera.updateMatrixWorld(); }
  function setPan(a) { pan = a; applyPan(); requestRender(false); }
  // How far to turn so the point (x, z) on the felt sits comfortably inside the picture: if it is
  // already well inside, don't turn at all; otherwise turn until it sits `to` (in screen halves) off centre.
  function panFor(x, z, to = .3) {
    const keep = pan, ndc = a => { pan = a; applyPan(); scratch.set(x, 0, z).project(camera); return scratch.x; };
    const at0 = ndc(0);
    let out = 0;
    if (Math.abs(at0) > .6) {
      const goal = Math.sign(at0) * to; let lo = -1.3, hi = 1.3;   // a left turn (larger pan) moves things right on screen
      for (let k = 0; k < 28; k++) { const mid = (lo + hi) / 2; if (ndc(mid) > goal) hi = mid; else lo = mid; }
      out = (lo + hi) / 2;
    }
    pan = keep; applyPan(); return out;
  }
  const UPV = new THREE.Vector3(0, 1, 0);
  // A preset applies at once: pixels, shadow size and softness (the stage), the cloth, the chips' detail and the card faces.
  function setQuality(q) {
    const was = quality; quality = q; st.setQuality(q);
    if (q.felt !== was.felt) paintMode(mode);
    setChipDetail(q.chipSegments); swapChipGeometry(scene); setFaceDetail(q.face);
    requestRender();
  }
  // Another table's rules: its printing on the felt, and the medallion in the last side-bet spot. The cloth
  // is repainted only when the table really changes (it is the largest picture in the room).
  let slot = specs.find(s => s.id === 'dpairs') ?? null;
  function paintMode(m) {
    mode = m; const t = paintFelt(Math.min(maxTex, quality.felt), m); t.anisotropy = aniso;
    felt.material.map.dispose(); felt.material.map.image.width = 0; felt.material.map = t;   // width 0 frees the old canvas's pixels now, not at the next collection
    requestRender();
  }
  function setMode(m, slotSpec) {
    if (m !== mode) paintMode(m);
    const top = spots.dpairs?.children[1];
    if (top && slotSpec && slotSpec !== slot) { slot = slotSpec; top.material.map = medallion(slotSpec); requestRender(); }
  }
  const project = st.project;

  return {
    THREE, renderer, scene, camera, table, spots, shoe, frame, requestRender, tickers, project, setQuality, setPan, panFor, get pan() { return pan; },
    lights: { key, hemi, glow, get backdrop() { return backdrop; }, get room() { return roomLight; } }, showcase, afterFrame, radialTexture, setExtraSee(pts) { extraSee = pts; },
    setMode, pause: st.pause, get paused() { return st.paused; },
    get quality() { return quality; }, get pixelRatio() { return st.pixelRatio; },
    discard: { group: discard, get count() { return discarded; }, set: setDiscards, topY: () => .6 + discarded * CARD_T },
    edgeTex,
  };
}

// ---- the shoe, in its own frame: origin at the mouth, +x runs back to the roller -------------
// Clear acrylic, after the real 8-deck shoes: a trough whose floor climbs 14 degrees to a tall back, standing on its own
// side panels; the cards lean back on that floor at 58 degrees, their backs to the dealer, in a frame open at the bottom
// for the mouth; a weighted roller behind the stack; a shallow tray in front for the tongue. The walls stand a little over
// the cards (`over`, from the floor). The stack is a prism whose depth is the number of cards times their thickness.
// `foot`: where the front card stands on the floor; `top`, `topY`: the front of the walls' top edge, `topAt(x)` along it;
// `hgt`: the back's height.
export const SHOE = { len: 29, wid: 10.2, wall: .35, slope: 58 * Math.PI / 180, floor: 14 * Math.PI / 180, foot: { x: 1.6, y: 1.2 }, over: 5.6 };
{
  const { foot, slope, floor, over } = SHOE, up = over / Math.sin(slope - floor);   // along the front edge, floor to top
  SHOE.top = foot.x + up * Math.cos(slope); SHOE.topY = foot.y + up * Math.sin(slope);
  SHOE.topAt = x => SHOE.topY + (x - SHOE.top) * Math.tan(floor); SHOE.hgt = SHOE.topAt(SHOE.len);
}
// Clear acrylic as it looks, lit like everything else at the table. Its faces are next to nothing straight on and fuller as
// they turn from you, and what they reflect (the salon: `env`, salonEnvironment) is added whole rather than faded with
// them, as glass does: premultiplied, the shader weighing the body by its cover and the blend adding the rest. Its cut
// edges are the pale green of acrylic end on, and glow: the room's light runs through the sheet and out at its edges,
// whichever way they face (`emissive`, kept in step with the pendant: see buildShoe), brighter still where it catches them. The reader's lens is a dark coated glass with a cyan light behind it and the rainbow sheen of
// its coating.
function glassMaterials() {
  const face = new THREE.MeshPhysicalMaterial({ color: '#c2d0cc', roughness: .03, metalness: 0, ior: 1.49, clearcoat: 1, clearcoatRoughness: .02, transparent: true, opacity: .07, depthWrite: false, envMapIntensity: 1.6,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  face.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `float cover = mix(diffuseColor.a, .45, pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 3.0));
    outgoingLight = totalDiffuse * cover + (outgoingLight - totalDiffuse); diffuseColor.a = cover;
    #include <opaque_fragment>`); };
  face.customProgramCacheKey = () => 'salon-glass';
  const edge = new THREE.MeshPhysicalMaterial({ color: '#d4ebe4', emissive: '#a9d6cb', emissiveIntensity: .32, roughness: .1, metalness: 0, ior: 1.49, transparent: true, opacity: .88, depthWrite: false, envMapIntensity: 1.4 });
  const lens = new THREE.MeshPhysicalMaterial({ color: '#06100f', emissive: '#38e8d8', emissiveIntensity: .35, roughness: .06, clearcoat: 1, clearcoatRoughness: .03, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [220, 560], envMapIntensity: 2 });
  return { face, edge, lens };
}
// A sheet of it: a box whose two broad faces are clear and whose four narrow ones are cut edges (BoxGeometry's faces run
// +x, -x, +y, -y, +z, -z); and a sheet cut to an outline (x, y), `t` thick from z 0.
function glassBox(w, h, d, { face, edge }) {
  const dims = [w, h, d], t = Math.min(...dims);
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [0, 0, 1, 1, 2, 2].map(a => dims[a] === t ? face : edge));
}
const glassSheet = (outline, t, { face, edge }) =>
  new THREE.Mesh(new THREE.ExtrudeGeometry(outline instanceof THREE.Shape ? outline : new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y))), { depth: t, bevelEnabled: false }), [face, edge]);
function buildShoe({ edgeTex, glass, light = () => 1 }) {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const { len, wid, wall, foot, top, topY, hgt } = SHOE, sin = Math.sin(SHOE.slope), cos = Math.cos(SHOE.slope);
  const V = (x, y, z = 0) => new THREE.Vector3(x, y, z), u = V(Math.cos(SHOE.floor), Math.sin(SHOE.floor)), n = V(-u.y, u.x), on = (p, along, out = 0) => p.clone().addScaledVector(u, along).addScaledVector(n, out);
  const add = m => { m.receiveShadow = true; g.add(m); return m; };
  const B = V(foot.x, foot.y), W = wid / 2 - wall;   // the front card's foot; the inside half-width
  // the side panels: the trough's walls and the stand under it in one sheet, leaning back at the front with the cards
  const side = [[foot.x - foot.y / Math.tan(SHOE.slope), 0], [len, 0], [len, hgt], [top, topY]];
  for (const z of [W, -wid / 2]) add(glassSheet(side, wall, glass)).position.z = z;
  // the floor, from the front card's foot to the back
  const fl = (len - wall - foot.x) / u.x, floor = add(glassBox(fl, wall, 2 * W, glass)); floor.position.copy(on(B, fl / 2, -wall / 2)); floor.rotation.z = SHOE.floor;
  add(glassBox(wall, hgt, 2 * W, glass)).position.set(len - wall / 2, hgt / 2, 0);                                   // back
  const lid = add(glassBox(8, wall, wid, glass)); lid.position.copy(on(V(top, topY), 4, wall / 2)); lid.rotation.z = SHOE.floor;   // a cover over the front
  // the frame round the front card, open at the foot for the mouth: in the card's plane, just in front of it
  const fu = SHOE.over / Math.sin(SHOE.slope - SHOE.floor), b = 1.05, frame = add(glassSheet([[1.5, -wid / 2], [fu, -wid / 2], [fu, wid / 2], [1.5, wid / 2], [1.5, wid / 2 - b], [fu - .9, wid / 2 - b], [fu - .9, -wid / 2 + b], [1.5, -wid / 2 + b]], wall, glass));
  frame.matrixAutoUpdate = false; frame.matrix.makeBasis(V(cos, sin), V(0, 0, 1), V(sin, -cos)).setPosition(B.clone().add(V(-sin, cos).multiplyScalar(.05 + wall))); frame.updateMatrixWorld?.();
  // The tongue: a shallow tray in front of the mouth, where a drawn card first lands, rimmed at the front and sides.
  const tray = (w, h, d, x, y, z) => add(glassBox(w, h, d, glass)).position.set(x, y, z);
  tray(7.3, .5, 10, -3.35, .25, 0); tray(.4, .45, 10, -6.8, .72, 0); for (const z of [-4.8, 4.8]) tray(6.9, .45, .4, -3.15, .72, z);
  // The card reader at the mouth, as live tables have: a dark glass block under the front of the floor, its lens across the
  // mouth, and a green light on the side that faces the table. `glow(v)`: 0 at rest, 1 as a card slides over it.
  const reader = add(new THREE.Mesh(new THREE.BoxGeometry(2, .7, 2 * W - .1), new THREE.MeshPhysicalMaterial({ color: '#0b0e0f', roughness: .2, metalness: .3, clearcoat: 1, clearcoatRoughness: .05 })));
  reader.position.set(1.35, .35, 0); reader.castShadow = true;
  const piped = glass.edge.emissiveIntensity; reader.onBeforeRender = () => { glass.edge.emissiveIntensity = piped * light(); };   // (the reader is opaque, drawn before any glass)
  const lens = add(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2 * W - 1), glass.lens)); lens.rotation.x = -Math.PI / 2; lens.position.set(1.2, .705, 0);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(120,255,240,1)', 'rgba(60,220,210,0)'), color: '#5ff0e2', transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  halo.position.set(1.2, 1, 0); halo.scale.set(9, 4, 1); g.add(halo);
  const led = add(new THREE.Mesh(new THREE.CircleGeometry(.14, 16), new THREE.MeshBasicMaterial({ color: '#1f5a2c', toneMapped: false }))); led.position.set(.7, .4, W - .04);
  const glow = v => { glass.lens.emissiveIntensity = .35 + 2.4 * v; halo.material.opacity = .22 + .55 * v; led.material.color.set(v > .05 ? '#5dff84' : '#1f5a2c'); };
  // Weighted roller behind the stack, a dark hub at its ends.
  const roller = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 8.4, 32), new THREE.MeshStandardMaterial({ color: '#7d8185', roughness: .45, metalness: .35 })); roller.rotation.x = Math.PI / 2; roller.castShadow = true; g.add(roller);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, 8.8, 20), new THREE.MeshStandardMaterial({ color: '#2a2c2f', roughness: .4, metalness: .5 })); roller.add(axle);   // inherits the roller's turn
  // The stack: a prism leaning with the slope on the climbing floor, card-edge texture on its sides.
  const stackMats = edgeMat(edgeTex, THREE.DoubleSide);   // one material: an array would need geometry groups
  const stack = new THREE.Mesh(new THREE.BufferGeometry(), stackMats); stack.castShadow = true; g.add(stack);
  const cut = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#f2c417', roughness: .4, emissive: '#3a2c00', side: THREE.DoubleSide })); g.add(cut);
  const card = V(cos, sin).multiplyScalar(CARD_W);
  // A card's foot at depth d (cm, perpendicular to the cards): along the floor, as far as the cards lean over it.
  const shift = d => d / Math.sin(SHOE.slope - SHOE.floor), footAt = d => on(B, shift(d));
  function prism(geo, d0, d1, pad = 0) {
    const zs = [-CARD_H / 2 - pad, CARD_H / 2 + pad], f0 = footAt(d0), f1 = footAt(d1), lift = V(cos, sin).multiplyScalar(CARD_W + pad);
    const P = [f0, f0.clone().add(lift), f1.clone().add(lift), f1].map(p => [p.x, p.y]);
    const pos = [], uv = [], idx = [];
    const quad = (p0, p1, p2, p3, w) => { const i = pos.length / 3; for (const p of [p0, p1, p2, p3]) pos.push(...p); uv.push(0, 0, w, 0, w, 1, 0, 1); idx.push(i, i + 1, i + 2, i, i + 2, i + 3); };
    const Q = (p, z) => [p[0], p[1], z], L = Math.max(.2, shift(d1) - shift(d0));
    quad(Q(P[1], zs[0]), Q(P[2], zs[0]), Q(P[2], zs[1]), Q(P[1], zs[1]), L * 2);   // top edges
    quad(Q(P[0], zs[1]), Q(P[3], zs[1]), Q(P[2], zs[1]), Q(P[1], zs[1]), L * 2);   // near side
    quad(Q(P[3], zs[0]), Q(P[0], zs[0]), Q(P[1], zs[0]), Q(P[2], zs[0]), L * 2);   // far side
    quad(Q(P[2], zs[0]), Q(P[3], zs[0]), Q(P[3], zs[1]), Q(P[2], zs[1]), 1);       // back face
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
  }
  function setStack(remaining, untilCut) {
    const depth = Math.max(.02, (remaining - 1) * CARD_T);
    prism(stack.geometry, CARD_T, depth); stack.visible = remaining > 1;
    cut.visible = untilCut > 0 && untilCut < remaining;
    if (cut.visible) prism(cut.geometry, untilCut * CARD_T, untilCut * CARD_T + .06, .12);
    // The roller rests on the floor, square against the back of the leaning stack.
    const r = 2, a = SHOE.slope - SHOE.floor; roller.position.copy(on(footAt(depth), r * (1 + Math.cos(a)) / Math.sin(a) + .05, r));
  }
  // Pose of the front card: lying on the slope, back facing out of the shoe (for the card mesh,
  // whose face is +z and whose long side runs along y).
  const frontPose = () => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    // Card local: x across the short side, y along the long side, face +z. In the shoe the long side
    // runs across (shoe z), the short side runs up the slope, and the back faces out (-x, +y normal).
    const xAxis = new THREE.Vector3(cos, sin, 0), yAxis = new THREE.Vector3(0, 0, 1), zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
    m.makeBasis(xAxis, yAxis, zAxis); q.setFromRotationMatrix(m);
    const pos = new THREE.Vector3(foot.x + card.x / 2 - .02 * sin, foot.y + card.y / 2 + .02 * cos, 0);
    return { pos, quat: q };
  };
  // Where a drawn card lies once it has slid out onto the tongue: flat, face down.
  const exitPose = () => {
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0));
    return { pos: new THREE.Vector3(-3.4, .62, 0), quat: new THREE.Quaternion().setFromRotationMatrix(m) };
  };
  return { group: g, setStack, frontPose, exitPose, roller, stack, cut, glow };
}

class ArcXZ extends THREE.Curve {
  constructor(r, y) { super(); this.r = r; this.y = y; }
  getPoint(t, out = new THREE.Vector3()) { const a = Math.PI * t; return out.set(-Math.cos(a) * this.r, this.y, EDGE_Z + Math.sin(a) * this.r); }
}
function extrudeHalfDisc(r, depth) {
  const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI, false); s.lineTo(r, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 96 }); g.rotateX(Math.PI / 2); return g;
}
function remapFeltUV(geo) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 100) / 200, 1 - (p.getZ(i) - EDGE_Z) / 100);
  uv.needsUpdate = true;
}
function edgeMat(tex, side = THREE.FrontSide) { return new THREE.MeshStandardMaterial({ map: tex, roughness: .8, side }); }
const chipMats = new Map();
export function chipMaterials(v) {
  if (chipMats.has(v)) return chipMats.get(v);
  const side = new THREE.MeshStandardMaterial({ map: chipEdgeTexture(v), roughness: .5 });
  const top = new THREE.MeshStandardMaterial({ map: chipFaceTexture(v), bumpMap: chipBumpTexture(v), bumpScale: .9, roughness: .46 });
  const mats = [side, top]; chipMats.set(v, mats); return mats;
}
// A clay chip: a rim with softly rounded edges and two flat faces. Groups: 0 the rim, 1 both faces (one
// material, so one draw call for the pair). Both faces and the rim share one angle convention, so the edge
// spots line up.
let chipGeo, chipDetail = 48;
export const setChipDetail = n => { chipDetail = n; };
// After a change of detail, chips already in a scene take the new shape (the old one is freed).
export function swapChipGeometry(scene) {
  const geo = chipGeometry(), old = new Set();
  scene.traverse(o => { if (o.geometry?.userData.chip && o.geometry !== geo) { old.add(o.geometry); o.geometry = geo; } });
  for (const g of old) g.dispose();
}
export function chipGeometry(segments = chipDetail) {
  if (chipGeo?.userData.segments === segments) return chipGeo;
  const r = CHIP_R, h = CHIP_H / 2, b = .045, pos = [], nor = [], uv = [], idx = [], groups = [];
  const ring = [[r - b, -h, -.7], [r - b * .3, -h + b * .3, -.25], [r, -h + b, 0], [r, h - b, 0], [r - b * .3, h - b * .3, .25], [r - b, h, .7]];
  let start = 0;
  for (let j = 0; j < ring.length; j++) for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2, [rr, y, ny] = ring[j], c = Math.cos(a), s = Math.sin(a), l = Math.hypot(1, ny);
    pos.push(rr * c, y, rr * s); nor.push(c / l, ny / l, s / l); uv.push(i / segments, j / (ring.length - 1));
  }
  for (let j = 0; j < ring.length - 1; j++) for (let i = 0; i < segments; i++) {
    const a = j * (segments + 1) + i, d = a + segments + 1; idx.push(a, d, a + 1, a + 1, d, d + 1);
  }
  groups.push([start, idx.length, 0]); start = idx.length;
  for (const [y, sgn] of [[h, 1], [-h, -1]]) {
    const base = pos.length / 3; pos.push(0, y, 0); nor.push(0, sgn, 0); uv.push(.5, .5);
    for (let i = 0; i <= segments; i++) { const a = i / segments * Math.PI * 2, x = (r - b) * Math.cos(a), z = (r - b) * Math.sin(a); pos.push(x, y, z); nor.push(0, sgn, 0); uv.push(x / (2 * r) + .5, .5 - z / (2 * r)); }
    for (let i = 0; i < segments; i++) sgn > 0 ? idx.push(base, base + i + 2, base + i + 1) : idx.push(base, base + i + 1, base + i + 2);
  }
  groups.push([start, idx.length - start, 1]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); for (const [s0, n, m] of groups) geo.addGroup(s0, n, m); geo.computeBoundingSphere();
  geo.userData.segments = segments; geo.userData.chip = true; return chipGeo = geo;
}
function radialTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, inner); g.addColorStop(.25, inner.replace(/[\d.]+\)$/, '.55)')); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
