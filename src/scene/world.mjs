// The table as a real scene, in centimetres. One camera sits in your seat.
// Layout, measured outward from the dealer's straight edge (z = -40):
//   chip rack · dealer's cards · wordmark · printed arcs · your cards ·
//   side-bet crown · your main circle · padded armrest (radius 100).
import * as THREE from '../vendor/three.module.min.js';
import { createStage, detectQuality, leatherMaterial, brassMaterial, fitFov, salonWall, carpetFloor, orbitPace } from './stage.mjs';
import { acrylic, frosted, sheet, sheetBox, reflectionProbe, groundDecal } from './glass.mjs';
import { artImage, paintFelt, paintSpot, paintBand, medallionTexture, edgeTexture, stackEdgeTexture, STACK_TILE, backTexture, setFaceDetail, onArtLanded, CARD_W, CARD_H, CARD_R, CHIP_R, CHIP_H, chipFaceTexture, chipEdgeTexture, chipBumpTexture } from './textures.mjs';

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
  const st = createStage(canvas, { quality, background: '#0c0c0d', environment: .42, fov: 42, far: 900, lights: () => [key], restored: () => reflect() });
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
  table.add(tableBase({ brass, floorY: FLOOR_Y }));   // what holds it up, seen from the lobby

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
  // (glass.mjs: the shoe's acrylic, its tongue's (lit red by the reader), the holder's, the frosted floor, and the fittings)
  const glass = { shoe: acrylic(), tongue: acrylic({ piped: '#ff4658', glow: .22 }), holder: acrylic({ thick: .5 }), frost: frosted(null), ...shoeFittings() };
  const discard = new THREE.Group(); discard.position.set(LAYOUT.discard.x, 0, LAYOUT.discard.z); discard.rotation.y = LAYOUT.discard.yaw; table.add(discard);
  const box = (w, h, d, x, y, z, order) => { const m = sheetBox(w, h, d, glass.holder); m.position.set(x, y, z); m.receiveShadow = true; m.renderOrder = order; return m; };   // (drawn far to near from the seat)
  discard.add(box(11, .6, 8.4, 0, .3, 0, 1), box(11, 8, .5, 0, 4, -4.1, 1), box(.5, 8, 8.4, -5.4, 4, 0, 2), box(.5, 8, 8.4, 5.4, 4, 0, 2), box(11, 3.2, .5, 0, 1.6, 4.1, 3));
  const edgeTex = edgeTexture(true), flatEdge = edgeTexture(false);
  const discardStack = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, 1, CARD_H), [edgeMat(flatEdge), edgeMat(flatEdge), new THREE.MeshStandardMaterial({ map: backTexture(), roughness: .45 }), edgeMat(flatEdge), edgeMat(flatEdge), edgeMat(flatEdge)]);
  discardStack.castShadow = true; discard.add(discardStack);
  let discarded = 0;
  function setDiscards(n) { discarded = n; const h = Math.max(.001, n * CARD_T); discardStack.scale.y = h; discardStack.position.y = .6 + h / 2; discardStack.visible = n > 0; }
  setDiscards(0);

  // ---- the shoe -----------------------------------------------------------------------
  // the light the acrylic carries to its edges follows the pendant, down with the house lights (the reader's red does not)
  const key0 = key.intensity, piped = glass.shoe.edge.emissiveIntensity, shoe = buildShoe({ stackTex: stackEdgeTexture(), glass });
  shoe.beforeGlass(() => { const k = key.intensity / key0; glass.shoe.edge.emissiveIntensity = glass.holder.edge.emissiveIntensity = piped * k; });
  // the reader lights as each card slides over it, and dies back
  let readAt = -1e9; const readTick = () => { const k = (performance.now() - readAt) / 520; shoe.glow(k >= 1 ? 0 : (1 - k) ** 2); if (k >= 1) tickers.delete(readTick); requestRender(false); };
  readTick.still = true; shoe.read = () => { readAt = performance.now(); tickers.add(readTick); requestRender(false); };
  shoe.group.position.set(LAYOUT.shoe.x, 0, LAYOUT.shoe.z); shoe.group.rotation.y = LAYOUT.shoe.yaw; table.add(shoe.group);
  // What the glass reflects: the table as seen from the shoe and from the holder, the pendant drawn in (glass.mjs). Again after
  // a lost context, and for a new cloth.
  const lamp = { at: key.position, size: 16, color: '#ffe2b8', power: 30 }, probes = [];
  function reflect() {
    scene.updateMatrixWorld(); for (const t of probes.splice(0)) t.dispose();
    const look = (group, local) => group.localToWorld(local.clone());
    const [atShoe, atHolder] = [look(shoe.group, new THREE.Vector3(14, 6, 0)), look(discard, new THREE.Vector3(0, 4, 0))].map(at => { const t = reflectionProbe(renderer, scene, at, { hide: [shoe.group, discard], lamp }); probes.push(t); return t; });
    for (const m of [glass.shoe.face, glass.shoe.edge, glass.tongue.face, glass.tongue.edge, glass.frost, glass.bed, glass.steel, glass.black]) { m.envMap = atShoe; m.needsUpdate = true; }
    for (const m of [glass.holder.face, glass.holder.edge]) { m.envMap = atHolder; m.needsUpdate = true; }
    requestRender();
  }
  reflect();

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
  // `bottom`: pixels at the foot covered by the dock and its blur, framed out the same way (the canvas runs on under them).
  function frame(w, h, top = 0, bottom = 0) {
    st.size(w, h);
    const vh = Math.max(1, h - top - bottom); view.w = w; view.h = vh;
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
    view.h = h; if (top > 0 || bottom > 0) camera.setViewOffset(w, vh, 0, -top, w, h);
    for (const f of afterFrame) f(w, h, top);
    if (show.on) placeShowcase(performance.now());   // the lobby keeps its own camera
    requestRender();
  }
  const seatPos = new THREE.Vector3(), afterFrame = new Set();
  let extraSee = [];   // points a table asks the seat's view to include (the Lightning marquee)
  // ---- the showcase: in the lobby the camera circles the table slowly, like a film opening on the
  // room; taking a seat flies it down into your chair. ---------------------------------------------
  // `lag`: how long the orbit has stood still (a change of table, the portal), so it goes on from where it stopped; `frozen`:
  // since when it stands; `driven`: the portal has the camera.
  const show = { on: false, fly: null, lag: 0, frozen: 0, driven: false }, orbitEye = new THREE.Vector3(), orbitAt = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
  function orbitPose(now) {
    const portrait = camera.aspect < .9, t = ((show.frozen || now) - show.lag) / 1000;
    const a = Math.sin(t * .075) * .62 + Math.sin(t * .031) * .12;          // a slow sweep around the table
    // framed for the lobby's layout: the table floats in the band between the title and the rail
    const r = portrait ? 300 : 200, y = (portrait ? 190 : 118) + Math.sin(t * .11) * 6;
    orbitEye.set(Math.sin(a) * r, y, 10 + Math.cos(a) * r);
    orbitAt.set(Math.sin(a) * 8, portrait ? -120 : -44, portrait ? -8 : 0);
  }
  function placeShowcase(now) {
    if (show.driven) return; orbitPose(now);
    camera.position.copy(orbitEye); camera.up.set(0, 1, 0); camera.lookAt(orbitAt); camera.updateMatrixWorld();
  }
  // The orbit is a slow drift: drawn at the stage's 60 frames a second (`lazy`, it asks for its own frames) and,
  // moving only the camera, never redraws the shadows (`still`). Left alone for a while, or out of focus, it glides to
  // rest and nothing is drawn (orbitPace in stage.mjs). The fly-in takes every frame.
  const pace = orbitPace(); let ticked = 0;
  function showTick(now) {
    if (show.fly) {
      const f = show.fly, k = Math.min(1, (now - f.t0) / f.ms), e = k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
      camera.position.lerpVectors(f.fromPos, seatPos, e);
      camera.quaternion.slerpQuaternions(f.fromQuat, tmpQ.setFromAxisAngle(UPV, pan).multiply(baseQuat), e); camera.updateMatrixWorld();
      if (k >= 1) { tickers.delete(showTick); show.on = false; show.fly = null; applyPan(); f.done(); }
      return;
    }
    const dt = ticked ? Math.min(100, now - ticked) : 0; ticked = now; if (show.frozen) return;
    show.lag += pace.step(dt);
    if (pace.still) { tickers.delete(showTick); pace.wake(() => { if (show.on && !show.frozen) { ticked = 0; tickers.add(showTick); requestRender(false); } }); return; }   // (left alone, or out of focus, the orbit comes to rest: nothing is drawn, nothing asked for)
    placeShowcase(now); requestRender(false);
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
    // the orbit stands still (true) or goes on from where it stood (false); `drive`: the camera is someone else's meanwhile
    freeze(on, drive = false) {
      const now = performance.now();
      if (on) { show.frozen ||= now; show.driven = drive; } else { if (show.frozen) show.lag += now - show.frozen; show.frozen = 0; show.driven = false; if (show.on) placeShowcase(now); requestRender(false); }
    },
    // where the orbit has the camera now (standing still: where it stopped)
    pose() { orbitPose(performance.now()); return { eye: orbitEye.clone(), at: orbitAt.clone(), fov: camera.fov }; },
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
    if (m !== mode) { paintMode(m); reflect(); }
    const top = spots.dpairs?.children[1];
    if (top && slotSpec && slotSpec !== slot) { slot = slotSpec; top.material.map = medallion(slotSpec); requestRender(); }
  }
  const project = st.project;

  return {
    THREE, renderer, scene, camera, table, spots, shoe, frame, requestRender, tickers, project, setQuality, setPan, panFor, get pan() { return pan; },
    lights: { key, hemi, glow, get backdrop() { return backdrop; }, get room() { return roomLight; } }, showcase, afterFrame, radialTexture, setExtraSee(pts) { extraSee = pts; },
    setMode, pause: st.pause, hold: st.hold, get paused() { return st.paused; },
    // a change of table in the lobby, swept in by a band of light (stage.swap), the orbit standing still meanwhile
    swap(apply, o) { showcase.freeze(true); return st.swap(apply, o).finally(() => showcase.freeze(false)); },
    compile: () => renderer.compileAsync(scene, camera), floorY: () => FLOOR_Y,
    get quality() { return quality; }, get pixelRatio() { return st.pixelRatio; },
    discard: { group: discard, get count() { return discarded; }, set: setDiscards, topY: () => .6 + discarded * CARD_T },
    edgeTex,
  };
}

// ---- the shoe, in its own frame: origin at the mouth, +x runs back to the roller -------------
// Clear acrylic, after the real 8-deck shoes: a trough whose floor (frosted) climbs 14 degrees to a tall back, standing on
// its own side panels, lidded its whole length with the lid bent down over the back; the cards lean back on that floor at
// 58 degrees, their backs to the dealer, behind a frame open at the foot for the mouth; behind them the weight, a black
// wedge on steel rollers with a knob to draw it back by; in front, the frosted chin and the tongue with the card reader in it.
// The walls stand a little over the cards (`over`, from the floor). The stack is a prism whose depth is the number of cards
// times their thickness.
// `foot`: where the front card stands on the floor; `top`, `topY`: the front of the walls' top edge, `topAt(x)` along it;
// `hgt`: the back's height.
export const SHOE = { len: 29, wid: 10.2, wall: .35, slope: 58 * Math.PI / 180, floor: 14 * Math.PI / 180, foot: { x: 1.6, y: 1.2 }, over: 5.6 };
{
  const { foot, slope, floor, over } = SHOE, up = over / Math.sin(slope - floor);   // along the front edge, floor to top
  SHOE.top = foot.x + up * Math.cos(slope); SHOE.topY = foot.y + up * Math.sin(slope);
  SHOE.topAt = x => SHOE.topY + (x - SHOE.top) * Math.tan(floor); SHOE.hgt = SHOE.topAt(SHOE.len);
}
// The shoe's fittings besides its acrylic (glass.mjs), all reflecting the table from the shoe (reflect): the reader's bed,
// a dark coated glass with the rainbow sheen of its coating; brushed steel, which takes the lamp and not only the dark room;
// and the weight's black.
function shoeFittings() {
  const bed = new THREE.MeshPhysicalMaterial({ color: '#07080a', emissive: '#ff2a3c', emissiveIntensity: .015, roughness: .06, clearcoat: 1, clearcoatRoughness: .03, iridescence: .35, iridescenceIOR: 1.8, iridescenceThicknessRange: [220, 560], envMapIntensity: .7 });
  const steel = new THREE.MeshStandardMaterial({ color: '#cfd3d7', metalness: .55, roughness: .3, envMapIntensity: 2 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#0d0e10', roughness: .28, metalness: .2, clearcoat: 1, clearcoatRoughness: .05 });
  return { bed, steel, black };
}
function buildShoe({ stackTex, glass }) {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const { len, wid, wall, foot, top, topY, hgt } = SHOE, sin = Math.sin(SHOE.slope), cos = Math.cos(SHOE.slope);
  const V = (x, y, z = 0) => new THREE.Vector3(x, y, z), u = V(Math.cos(SHOE.floor), Math.sin(SHOE.floor)), n = V(-u.y, u.x), on = (p, along, out = 0) => p.clone().addScaledVector(u, along).addScaledVector(n, out);
  const add = (m, order) => { m.receiveShadow = true; if (order) m.renderOrder = order; g.add(m); return m; };   // (glass drawn far to near from the seat: 1 to 5)
  const A = glass.shoe;
  const B = V(foot.x, foot.y), W = wid / 2 - wall;   // the front card's foot; the inside half-width
  // the side panels: the trough's walls and the stand under it in one sheet, leaning back at the front with the cards
  const side = [[foot.x - foot.y / Math.tan(SHOE.slope), 0], [len, 0], [len, hgt], [top, topY]];
  for (const z of [W, -wid / 2]) add(sheet(side, wall, A), z > 0 ? 5 : 1).position.z = z;
  // the floor, frosted, from the front card's foot to the back
  const fl = (len - wall - foot.x) / u.x, floor = add(sheetBox(fl, wall, 2 * W, { face: glass.frost, edge: A.edge }), 2); floor.position.copy(on(B, fl / 2, -wall / 2)); floor.rotation.z = SHOE.floor;
  add(sheetBox(wall, hgt, 2 * W, A), 2).position.set(len - wall / 2, hgt / 2, 0);                                   // back
  // the lid, its whole length, and bent down over the back
  const ll = (len + .3 - top) / u.x, lid = add(sheetBox(ll, wall, wid, A), 4); lid.position.copy(on(V(top, topY), ll / 2, wall / 2)); lid.rotation.z = SHOE.floor;
  const bend = SHOE.floor - 1.05, lip = add(sheetBox(2.6, wall, wid, A), 4); lip.rotation.z = bend;
  lip.position.copy(on(V(top, topY), ll, wall)).add(V(Math.cos(bend), Math.sin(bend)).multiplyScalar(1.3)).add(V(Math.sin(bend), -Math.cos(bend)).multiplyScalar(wall / 2));
  // clear fasteners where the floor is fixed to the side panels
  const screw = new THREE.CircleGeometry(.13, 14);
  for (const along of [3, 11.5, 20]) for (const z of [1, -1]) { const m = add(new THREE.Mesh(screw, A.edge), z > 0 ? 5 : 1); m.position.copy(on(B, along, -wall / 2)).setZ(z * (wid / 2 + .006)); if (z < 0) m.rotation.y = Math.PI; }
  // the frame round the front card, open at the foot for the mouth: in the card's plane, just in front of it, clear of the
  // card's edges so a drawn card passes it
  const fu = SHOE.over / Math.sin(SHOE.slope - SHOE.floor), b = .55, frame = add(sheet([[1.5, -wid / 2], [fu, -wid / 2], [fu, wid / 2], [1.5, wid / 2], [1.5, wid / 2 - b], [fu - .9, wid / 2 - b], [fu - .9, -wid / 2 + b], [1.5, -wid / 2 + b]], wall, A), 3);
  frame.matrixAutoUpdate = false; frame.matrix.makeBasis(V(cos, sin), V(0, 0, 1), V(sin, -cos)).setPosition(B.clone().add(V(-sin, cos).multiplyScalar(.05 + wall))); frame.updateMatrixWorld?.();
  // The chin: the frosted floor carried out of the mouth and down to the tongue, for the card to slide over.
  const TT = .35, chin = add(sheetBox(1.75, .3, 2 * W, { face: glass.frost, edge: A.edge }), 2), slope = Math.atan2(foot.y - TT, foot.x + .05);
  chin.rotation.z = slope; chin.position.set((foot.x - .05) / 2 + Math.sin(slope) * .15, (foot.y + TT) / 2 - Math.cos(slope) * .15, 0);
  // The tongue, and the card reader in it, as on the real shoes: a narrow strip of thick clear acrylic the width of the
  // mouth, 4 cm deep, raised a little at its ends; set in it, a slot of a window across the mouth (7 x 1.5 cm) over a dark
  // coated bed, framed by a thin clear rim with small clips at its ends and a maker's label at one end, and along it a red
  // light guide lit from one end (brightest there). The red runs through the acrylic, so the tongue's edges glow with it.
  // The frame and clips lie all but flush, under a card going over. `glow(v)`: 0 at rest, 1 as a card goes over (world.read).
  const tg = glass.tongue, part = (w, h, d, x, y, z) => { const p = add(sheetBox(w, h, d, tg, .03), 3); p.position.set(x, y, z); return p; };
  part(4, TT, 2 * SHOE.wid / 2, -2, TT / 2, 0); for (const z of [-1, 1]) part(4, .1, .14, -2, TT + .05, z * (SHOE.wid / 2 - .07));
  const WX = -2, WL = 1.5, WZ = 3.4;   // the window: its middle, its depth along the card's way out, its half-length across
  const bed = add(new THREE.Mesh(new THREE.BoxGeometry(WL, .05, 2 * WZ), glass.bed)); bed.position.set(WX, .14, 0);
  let before = null; bed.onBeforeRender = () => before?.();   // (the bed is opaque, drawn before any glass: the owner's chance to set it)
  for (const x of [WX - WL / 2, WX + WL / 2]) part(.1, .05, 2 * WZ + .2, x, TT + .025, 0);
  for (const z of [-WZ, WZ]) part(WL, .05, .1, WX, TT + .025, z);
  for (const z of [-1, 1]) { part(WL + .7, .07, .16, WX, TT + .035, z * (WZ + .12)); for (const x of [WX - WL / 2 - .2, WX + WL / 2 + .2]) part(.16, .07, .5, x, TT + .035, z * (WZ - .05)); }   // clips: a bar across each end, over the rim
  const LED = new THREE.Color('#ff2e42'), guide = add(new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 2 * WZ - .4, 12).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: LED, map: ledGuide(), toneMapped: false })));
  guide.position.set(WX + .1, .22, 0);
  // its light on the window: a soft red band along the guide, over the bed, under the glass
  const spill = add(new THREE.Mesh(new THREE.PlaneGeometry(WL, 2 * WZ), new THREE.MeshBasicMaterial({ map: lightBand(), color: '#ff3a50', transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  spill.rotation.x = -Math.PI / 2; spill.position.set(WX, .2, 0);
  const label = add(new THREE.Mesh(new THREE.PlaneGeometry(.95, .36), new THREE.MeshBasicMaterial({ map: readerLabel(), transparent: true }))); label.rotation.x = -Math.PI / 2; label.position.set(WX - .3, .17, -WZ + .6);
  // the bloom at the guide's lit end, and a smaller one where it ends
  // (lying in the window, not facing the eye: a card going over covers it, as it covers the light)
  const bloom = (z, size, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,90,110,1)', 'rgba(255,40,60,0)'), color: '#ff4a60', transparent: true, opacity: k, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.set(WX + .1, .24, z); m.scale.set(size, size, 1); g.add(m); return m; };
  const blooms = [bloom(WZ - .25, 2.4, .55), bloom(-WZ + .25, 1.3, .3)];
  const glow = v => { guide.material.color.copy(LED).multiplyScalar(.9 + 1.2 * v); spill.material.opacity = .55 + .45 * v; blooms[0].material.opacity = .55 + .4 * v; blooms[1].material.opacity = .3 + .3 * v; glass.tongue.edge.emissiveIntensity = .22 + .7 * v; glass.bed.emissiveIntensity = .015 + .12 * v; reddened.material.opacity = .5 + .5 * v; };
  // What the glass does to the cloth under it (the pendant is high and to the seat's left, so the light comes down a little
  // toward the back and the far side): a faint shade where it passes through the sheets, darker in a line beside each side
  // panel's foot, a bright caustic line where a panel's thickness gathers it, the same round the tongue's rim; and the
  // reader's red spilling onto the felt round the tongue (stronger as a card goes over).
  const x0 = foot.x - foot.y / Math.tan(SHOE.slope);
  g.add(groundDecal(-5, len + 4, -wid / 2 - 4, wid / 2 + 2, (c, px, k) => {
    c.filter = `blur(${k * .6}px)`; c.fillStyle = 'rgba(0,0,0,.16)'; const [a, b] = px(x0, -wid / 2 - .6), [e, f] = px(len + 1.2, wid / 2 - .4); c.fillRect(a, b, e - a, f - b);
    c.fillStyle = 'rgba(0,0,0,.3)'; for (const z of [wid / 2 - .5, -wid / 2 - 1.1]) { const [p, q] = px(x0, z), [r] = px(len + 1.5, z); c.fillRect(p, q, r - p, k * .55); }
    const [t0, t1] = px(-4.2, -wid / 2 - .3), [t2, t3] = px(.2, wid / 2 + .3); c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(t0, t1, t2 - t0, t3 - t1);
  }, { y: .015 }));
  g.add(groundDecal(-5, len + 4, -wid / 2 - 4, wid / 2 + 2, (c, px, k) => {
    c.filter = `blur(${k * .12}px)`; c.fillStyle = 'rgba(255,246,226,.5)';
    for (const z of [wid / 2 - .15, -wid / 2 - .45]) { const [p, q] = px(x0 + .4, z), [r] = px(len + .6, z); c.fillRect(p, q, r - p, k * .14); }
    c.strokeStyle = 'rgba(255,246,226,.42)'; c.lineWidth = k * .12; const [t0, t1] = px(-4.15, -wid / 2 - .15), [t2, t3] = px(.1, wid / 2 + .15); c.strokeRect(t0, t1, t2 - t0, t3 - t1);
  }, { additive: true, opacity: .6, y: .018 }));
  const reddened = groundDecal(-8, 1.5, -wid / 2 - 3, wid / 2 + 3, (c, px, k) => {
    const [cx, cz] = px(-2, 0), grad = c.createRadialGradient(cx, cz, 0, cx, cz, k * 6.5); grad.addColorStop(0, 'rgba(255,40,64,.5)'); grad.addColorStop(.45, 'rgba(255,40,64,.18)'); grad.addColorStop(1, 'rgba(255,40,64,0)');
    c.save(); c.translate(cx, cz); c.scale(.62, 1.15); c.translate(-cx, -cz); c.fillStyle = grad; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
  }, { additive: true, opacity: .5, y: .021 }); g.add(reddened);
  // The weight behind the stack (`roller`), after the real ones: a black acrylic wedge, its face leaning on the last card,
  // its top level with the floor and its back square, riding on two steel rollers across its width (one under its face, one
  // under its back) with a chrome knob on top to draw it back by. Its origin is where the last card stands on the floor
  // (setStack); the rollers keep it RR off the floor.
  const roller = new THREE.Group(); g.add(roller);
  const RR = .45, PD = 4.4, PH = 5, al = SHOE.slope - SHOE.floor, d = V(cos, sin), V2 = (x, y) => new THREE.Vector2(x, y), BW = W - .8;
  const P0 = d.clone().multiplyScalar(RR / Math.sin(al)), P1 = d.clone().multiplyScalar(PH), P3 = on(V(0, 0), PD, RR), P2 = P1.clone().addScaledVector(u, (P3.x - P1.x) / u.x);
  const block = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([P0, P3, P2, P1].map(p => V2(p.x, p.y))),
    { depth: 2 * BW, bevelEnabled: true, bevelThickness: .14, bevelSize: .14, bevelOffset: -.14, bevelSegments: 3 }).translate(0, 0, -BW), glass.black);
  block.castShadow = true; roller.add(block);
  const rod = new THREE.CylinderGeometry(RR, RR, 2 * BW + .3, 24).rotateX(Math.PI / 2), nut = new THREE.CylinderGeometry(.3, .3, .2, 6).rotateX(Math.PI / 2);
  for (const along of [RR / Math.tan(al / 2) + .1, PD - .75]) {
    const at = on(V(0, 0), along, RR), r = new THREE.Mesh(rod, glass.steel); r.position.copy(at); r.castShadow = true; roller.add(r);
    for (const z of [1, -1]) { const m = new THREE.Mesh(nut, glass.steel); m.position.copy(at).setZ(z * (BW + .25)); roller.add(m); }
  }
  { const mid = P1.clone().lerp(P2, .5), post = new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, 1, 16), glass.steel), knob = new THREE.Mesh(new THREE.SphereGeometry(.62, 24, 16), glass.steel);
    post.quaternion.setFromUnitVectors(V(0, 1), n); post.position.copy(mid).addScaledVector(n, .6); knob.position.copy(mid).addScaledVector(n, 1.35); post.castShadow = knob.castShadow = true; roller.add(post, knob); }
  // The stack: the cards leaning with the slope on the climbing floor, built a few at a time (SLAB) so that it reads as
  // cards and not as a block: each few stands a little higher or lower than the next, a little to one side, leans a
  // little its own way and is a shade of its own (decks shuffled together never make one smooth block), and their tops
  // are rounded at the corners as a card's are. What each few is like goes with the cards, counted from the back of the
  // shoe, so it stays with them as the stack is drawn down and pushed on toward the mouth. Each card's edge is a line of
  // the texture.
  const stackMats = new THREE.MeshStandardMaterial({ map: stackTex, roughness: .78, vertexColors: true, side: THREE.DoubleSide });
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
    const Q = (p, z) => [p[0], p[1], z], L = Math.max(.002, (d1 - d0) / (STACK_TILE * CARD_T));   // (in tiles of the edge texture: a line a card)
    quad(Q(P[1], zs[0]), Q(P[2], zs[0]), Q(P[2], zs[1]), Q(P[1], zs[1]), L);   // top edges
    quad(Q(P[0], zs[1]), Q(P[3], zs[1]), Q(P[2], zs[1]), Q(P[1], zs[1]), L);   // near side
    quad(Q(P[3], zs[0]), Q(P[0], zs[0]), Q(P[1], zs[0]), Q(P[2], zs[0]), L);   // far side
    quad(Q(P[2], zs[0]), Q(P[3], zs[0]), Q(P[3], zs[1]), Q(P[2], zs[1]), 1);       // back face
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
  }
  // The top of a card seen end on, round from one side to the other: [across, height, normal across, normal up], from the
  // foot of one side, round its top corner, along the top and round the other corner to the foot of the other side.
  const PROFILE = [[-1, 0]].concat(...[-1, 1].map(s => Array.from({ length: 5 }, (_, k) => (s < 0 ? 4 - k : k) / 4 * Math.PI / 2).map(a => [s, a])), [[1, 0]])
    .map(([s, a], i, all) => i === 0 || i === all.length - 1
      ? [s * CARD_H / 2, 0, s, 0]
      : [s * (CARD_H / 2 - CARD_R + CARD_R * Math.sin(a)), CARD_W - CARD_R + CARD_R * Math.cos(a), s * Math.sin(a), Math.cos(a)]);
  const SLAB = 4, hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const noise = x => { const i = Math.floor(x), f = x - i, e = f * f * (3 - 2 * f); return hash(i) + (hash(i + 1) - hash(i)) * e; };
  const slabOf = s => ({   // the few cards s from the back: their rise, their shift across, their lean, their shade
    rise: .09 * (noise(s / 3) - .5) * 2 + .05 * (noise(s / 13 + 40) - .5) * 2 + .02 * (hash(s + 9) - .5),
    across: .06 * (noise(s / 4 + 20) - .5) * 2,
    lean: .06 * (hash(s + 7) - .5) * 2,
    shade: .91 + .05 * (noise(s / 5 + 90) - .5) * 2 + .025 * (hash(s + 3) - .5),
  });
  const cardUp = V(cos, sin), cardOut = V(-sin, cos);   // up a card, and out of its back toward the mouth
  function buildStack(geo, n, d0, d1) {
    const pos = [], nor = [], col = [], uv = [], idx = [], P = new THREE.Vector3(), N = new THREE.Vector3();
    const vert = (d, row, sl, k) => {   // a point of the profile at depth d, for the cards k from the back (u: one card a line)
      const [z, h, nz, nh] = PROFILE[row], up = h > 0 ? sl.rise : 0;
      P.copy(footAt(d)).addScaledVector(cardUp, h + up); pos.push(P.x, P.y, z + (h > 0 ? sl.across : 0));
      N.copy(cardUp).multiplyScalar(nh).addScaledVector(cardOut, nh * sl.lean); nor.push(N.x, N.y, nz);
      const c = sl.shade * (h > 0 ? 1 : .9); col.push(c, c * .985, c * .955); uv.push(k / STACK_TILE, row / (PROFILE.length - 1));
    };
    const L = PROFILE.length, row = (d, sl, k, face) => {   // one profile's points; `face`: a flat face's normal for them all
      const i = pos.length / 3; for (let r = 0; r < L; r++) vert(d, r, sl, k);
      if (face) for (let r = 0; r < L; r++) nor.splice(3 * (i + r), 3, face.x, face.y, 0);
      return i;
    };
    const strip = (a, b) => { for (let r = 0; r < L - 1; r++) idx.push(a + r, b + r + 1, b + r, a + r, a + r + 1, b + r + 1); };   // a in front of b, or below it
    const fan = (i, out) => { for (let r = 1; r < L - 1; r++) out ? idx.push(i, i + r + 1, i + r) : idx.push(i, i + r, i + r + 1); };
    const back = cardOut.clone().negate();
    let prev = null;
    // card p from the front stands at depth p * CARD_T: the back one is n - 1 from the front, 0 from the back
    for (let s = 0; s * SLAB < n; s++) {
      const kb = s * SLAB, kf = Math.min(n, kb + SLAB), b = Math.min(d1, (n - kb) * CARD_T), f = Math.max(d0, (n - kf) * CARD_T);
      if (b - f < 1e-5) continue;
      const sl = slabOf(s);
      strip(row(f, sl, kf), row(b, sl, kb));
      if (!prev) fan(row(b, sl, kb, back), false);   // the back of the stack, against the weight
      else {   // the step between these and the few behind, facing the mouth where those stand higher
        const up = prev.rise > sl.rise, face = up ? cardOut : back, lo = row(b, sl, kb, face), hi = row(b, prev, kb, face);
        up ? strip(lo, hi) : strip(hi, lo);
      }
      prev = sl;
    }
    if (prev) fan(row(d0, prev, n, cardOut), true);   // the front of the stack, behind the front card
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeBoundingSphere();
  }
  function setStack(remaining, untilCut) {
    const depth = Math.max(.02, (remaining - 1) * CARD_T);
    buildStack(stack.geometry, remaining, CARD_T, depth); stack.visible = remaining > 1;
    cut.visible = untilCut > 0 && untilCut < remaining;
    if (cut.visible) prism(cut.geometry, untilCut * CARD_T, untilCut * CARD_T + .06, .25);
    roller.position.copy(on(footAt(depth), .03));   // the weight, square against the last card
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
    return { pos: new THREE.Vector3(-3.4, .44, 0), quat: new THREE.Quaternion().setFromRotationMatrix(m) };   // (over the tongue, clear of the reader's rim)
  };
  // The card on its way out, as a dealer draws it: two fingers on its back through the frame push it down the front of
  // the stack and out through the mouth, so the whole card travels - its top edge sinks down the face, uncovering the
  // next card from the top, its foot goes round the edge of the floor, down the chin and round the lip onto the tongue,
  // where it lies flat. A card can't stretch, so it runs along that way like a strip through a channel (`lane`), bent
  // where the way bends. `lane(f)`, f from 0 (the front card in its place) to 1 (flat on the tongue, at exitPose):
  // where each point of the card is, in the shoe's frame, for pieces.shapeCard. `outLength`: how far it travels.
  const TY = .42, lane = (() => {
    const F = V(foot.x, foot.y), corners = [F.clone().addScaledVector(d, CARD_W), F, V(-.05, TY), V(-30, TY)], radius = [0, .6, 1, 0];
    const pts = [corners[0]];
    for (let i = 1; i < corners.length - 1; i++) {   // each corner rounded: an arc between the points where it meets the straight runs
      const a = corners[i - 1].clone().sub(corners[i]).normalize(), b = corners[i + 1].clone().sub(corners[i]).normalize(), phi = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
      const tl = radius[i] / Math.tan(phi / 2), A = corners[i].clone().addScaledVector(a, tl), Bp = corners[i].clone().addScaledVector(b, tl), mid = a.clone().add(b).normalize();
      const C = corners[i].clone().addScaledVector(mid, radius[i] / Math.sin(phi / 2)), a0 = Math.atan2(A.y - C.y, A.x - C.x), a1 = Math.atan2(Bp.y - C.y, Bp.x - C.x);
      let da = a1 - a0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      for (let k = 0; k <= 16; k++) { const t = a0 + da * k / 16; pts.push(V(C.x + radius[i] * Math.cos(t), C.y + radius[i] * Math.sin(t))); }
    }
    pts.push(corners.at(-1));
    const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const at = (sg, P, T) => {   // the point sg along the way, and the way's direction there
      let i = 1, j = pts.length - 1; sg = Math.max(0, Math.min(acc[j], sg)); while (j - i > 0) { const m = (i + j) >> 1; if (acc[m] < sg) i = m + 1; else j = m; }
      const f = (sg - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1); P.lerpVectors(pts[i - 1], pts[i], f); T.copy(pts[i]).sub(pts[i - 1]).normalize();
    };
    // how far the card goes: until its top edge is past the lip, lying where exitPose has it (centre at x = -3.4)
    const P = V(0, 0), T = V(0, 0); let lo = 0, hi = acc.at(-1);
    for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; at(mid + CARD_W / 2, P, T); if (P.x > -3.4) lo = mid; else hi = mid; }
    return { at, length: lo };
  })();
  const outLength = lane.length;
  const laneAt = f => {
    const L = Math.max(0, Math.min(1, f)) * outLength, P = V(0, 0), T = V(0, 0);
    return (x, y, z, out) => {   // the card's own x runs up the card from its foot: its top edge is L along the way, its foot L + CARD_W
      lane.at(L + CARD_W / 2 - x, P, T); const nx = -T.y, ny = T.x, o = z - .02;   // its face's normal, and the card a hair off the way
      out.set(P.x + nx * o, P.y + ny * o, y);
    };
  };
  return { group: g, setStack, frontPose, exitPose, lane: laneAt, outLength, roller, stack, cut, glow, beforeGlass: f => { before = f; } };
}

class ArcXZ extends THREE.Curve {
  constructor(r, y) { super(); this.r = r; this.y = y; }
  getPoint(t, out = new THREE.Vector3()) { const a = Math.PI * t; return out.set(-Math.cos(a) * this.r, this.y, EDGE_Z + Math.sin(a) * this.r); }
}
// The table below its top, down to the carpet: a lacquered apron under the rail with two lines of warm light run round it
// and brass at its foot; set back beneath it a pedestal, its top washed by the light from under the apron; and a plinth
// on the floor, edged in brass, with a line of light at its foot throwing a warm pool onto the carpet. All of it follows
// the table's half round, closed flat on the dealer's side. The lines are lit, not lights: they glow as they are, the
// house lights up or down.
function tableBase({ brass, floorY }) {
  const g = new THREE.Group(), HALF = [-Math.PI / 2, Math.PI];   // (a cylinder's theta: the half toward the players)
  const lacquer = new THREE.MeshPhysicalMaterial({ color: '#17120e', roughness: .38, metalness: 0, clearcoat: .8, clearcoatRoughness: .12 });
  const glow = new THREE.MeshBasicMaterial({ color: '#ffd9a6', toneMapped: false });
  const shell = (r, h, y, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 160, 1, true, ...HALF), mat); m.position.set(0, y, EDGE_Z); g.add(m); return m; };
  const back = (w, h, y, mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.y = Math.PI; m.position.set(0, y, EDGE_Z); g.add(m); };
  const under = (r0, r1, y, mat) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 160, 1, 0, Math.PI), mat); m.rotation.x = Math.PI / 2; m.position.set(0, y, EDGE_Z); g.add(m); };
  // the apron: from under the top (-10) to -27
  const RA = R + 4, RP = 64, RB = 74, A0 = -10, A1 = -27, P1 = floorY + 4;
  shell(RA, A0 - A1, (A0 + A1) / 2, lacquer); back(2 * RA, A0 - A1, (A0 + A1) / 2, lacquer); under(RP, RA, A1, lacquer);
  for (const y of [-14.5, -21.5]) shell(RA + .15, .45, y, glow);
  shell(RA + .3, 1.2, A1 + .6, brass);
  // the pedestal, its top in the apron's light
  const wash = document.createElement('canvas'); wash.width = 4; wash.height = 128; const w = wash.getContext('2d'), grad = w.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#fff'); grad.addColorStop(.35, '#3a3a3a'); grad.addColorStop(1, '#000'); w.fillStyle = grad; w.fillRect(0, 0, 4, 128);
  const washTex = new THREE.CanvasTexture(wash); washTex.colorSpace = THREE.SRGBColorSpace;
  const pedestal = new THREE.MeshStandardMaterial({ color: '#100d0b', roughness: .55, emissive: '#ffcf96', emissiveMap: washTex, emissiveIntensity: .32 });
  shell(RP, A1 - P1, (A1 + P1) / 2, pedestal); back(2 * RP, A1 - P1, (A1 + P1) / 2, pedestal);
  // the plinth, its brass edge and the line of light at its foot
  const plinth = new THREE.Mesh(extrudeHalfDisc(RB, 4), lacquer); plinth.position.set(0, P1, EDGE_Z); g.add(plinth);
  shell(RB + .12, 1, P1 - .6, brass); shell(RB + .2, .4, floorY + .5, glow);
  // its light on the carpet: a warm pool round the plinth, strongest at its edge
  const pool = document.createElement('canvas'); pool.width = pool.height = 256; const q = pool.getContext('2d'), rg = q.createRadialGradient(128, 128, 0, 128, 128, 128), k = RB / (RB + 34);
  rg.addColorStop(0, 'rgba(255,200,140,0)'); rg.addColorStop(k - .01, 'rgba(255,200,140,0)'); rg.addColorStop(k, 'rgba(255,205,150,.9)'); rg.addColorStop(k + (1 - k) * .3, 'rgba(255,190,130,.35)'); rg.addColorStop(1, 'rgba(255,180,120,0)');
  q.fillStyle = rg; q.fillRect(0, 0, 256, 256);
  const light = new THREE.Mesh(new THREE.CircleGeometry(RB + 34, 96, Math.PI, Math.PI), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pool), transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  light.rotation.x = -Math.PI / 2; light.position.set(0, floorY + .15, EDGE_Z); light.renderOrder = 1; g.add(light);
  g.traverse(o => { if (o.isMesh && o.material !== glow && o !== light) o.receiveShadow = true; });
  return g;
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
// The light guide along the reader's window, lit from one end: bright there, fading along it.
function ledGuide() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(.12, '#d8d8d8'); grad.addColorStop(1, '#5a5a5a'); g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// A soft band of light, bright down its middle (along v) and gone at its sides.
function lightBand() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 4; const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(.5, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grad; g.fillRect(0, 0, 64, 4);
  return new THREE.CanvasTexture(c);
}
// The maker's label on the reader's bed: small white type on black, as such parts carry.
function readerLabel() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, 256, 96); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.strokeRect(5, 5, 246, 86);
  g.fillStyle = 'rgba(240,240,236,.85)'; g.font = '700 30px Inter, system-ui, sans-serif'; g.fillText('CARD READER', 18, 44);
  g.font = '500 18px Inter, system-ui, sans-serif'; g.fillStyle = 'rgba(240,240,236,.55)'; g.fillText('SN-8 · OPTICAL · 12V', 18, 74);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function radialTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, inner); g.addColorStop(.25, inner.replace(/[\d.]+\)$/, '.55)')); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
