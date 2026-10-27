// The wheel, a live-studio wheel (a TCS John Huxley Saturn, as filmed for bet365) in piano-black lacquer: an 83 cm
// bowl with a brass inlay round its rim, a ball track of polished black stone washed by a ring light hidden under the
// rim (warm gold here, where bet365's glows green), the stator cone with its eight chrome canoes (four across the
// ball's path, four along it), and the wheelhead: a wide number ring with the numbers standing outward, deep pockets in
// their colours parted by solid chrome frets, a black cone rising to a chrome French-cross turret, the croupier's
// handle for spinning it.
// Depth comes from ambient occlusion painted into the surfaces (the pockets darken into their corners, the track into
// the crease at the wall, the cone round the turret), so nothing on the wheel needs a shadow map: the wheelhead and the
// ball turn every frame and no shadow is drawn again for them. The ball carries its own soft contact shadow.
// Fine chrome is given real widths and a little roughness, so its glints hold steady as the wheel turns rather than
// sparkle from pixel to pixel.
// Units are centimetres; y = 0 is the rim of the bowl. Angles follow the simulation (physics.mjs): a point at angle a
// sits at (r cos a, -r sin a), and pocket i is i pitches clockwise of zero.
import { GEO, TRACK, floorY } from './physics.mjs';
import { WHEEL, PITCH, POCKETS, colorOf } from './rules.mjs';

export const polar = (r, a, y = 0) => [r * Math.cos(a), y, -r * Math.sin(a)];
const INK = { red: '#a8131f', black: '#111214', green: '#0d6a3b', ivory: '#f5eedf' };
const FLOOR = { red: '#8a111b', black: '#0d0e10', green: '#0b5a33' };

export function createWheel(THREE, { aniso = 8, env = null, glow = '#ffb85a' }) {
  const wheel = new THREE.Group(), rotor = new THREE.Group(); wheel.add(rotor);
  // its own studio light for reflections (rscene.mjs: a ring light overhead, soft boxes), so the lacquer and chrome carry
  // the arcs and streaks of light a filmed wheel shows
  const shine = m => { if (env) { m.envMap = env; m.envMapIntensity = m.envMapIntensity ?? 1; } return m; };
  const canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
  const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; };
  // occlusion along a surface of revolution: a ramp down its profile (v), [v, light] stops
  const ramp = stops => tex(canvas(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); for (const [o, a] of stops) gr.addColorStop(o, `rgb(${a * 255 | 0},${a * 255 | 0},${a * 255 | 0})`); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), false);
  const lacquerM = (color = '#060606', rough = .16, ao = null) => shine(new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, specularIntensity: .2, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.25, aoMap: ao, aoMapIntensity: 1 }));
  const chrome = shine(new THREE.MeshStandardMaterial({ color: '#eef0f2', metalness: 1, roughness: .16, envMapIntensity: 1.7 }));
  const brass = shine(new THREE.MeshStandardMaterial({ color: '#d9b265', metalness: 1, roughness: .2, envMapIntensity: 1.4 }));
  const lathe = (pts, segs = 192) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  // several pieces of one material as one geometry (one draw): each geometry moved by its matrix, then joined
  const merged = parts => {
    const pos = [], nor = [], uv = [], idx = []; let base = 0;
    for (const [geo, m] of parts) {
      const g = geo.clone().applyMatrix4(m), p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0); }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base); else for (let i = 0; i < p.count; i++) idx.push(i + base);
      base += p.count; g.dispose();
    }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); out.setIndex(idx); return out;
  };
  const torus = (r, w, y, mat, parent = wheel, tube = 10) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, tube, 220), mat); m.rotation.x = Math.PI / 2; m.position.y = y; parent.add(m); return m; };

  // ---- the bowl ---------------------------------------------------------------------------------------------------
  const W = GEO.wallR, WY = GEO.wallY, R = GEO.rimR;   // the wall's foot, where the ball rides; the bowl's outer edge
  // the rim: up the wall from the track, a rounded lip, the flat top and down the skirt into the table
  const rim = new THREE.Mesh(lathe([[W, WY], [W + .25, WY + 1.2], [W + .35, -.05], [W + .55, .5], [W + .85, .78], [R - .35, .82], [R - .05, .62], [R, .25], [R, -3], [R, -15]]),
    lacquerM('#060606', .14, ramp([[0, .55], [.18, 1], [1, 1]])));
  rim.material.side = THREE.DoubleSide; rim.castShadow = true; wheel.add(rim);
  torus(W + 1.05, .1, .84, brass);   // the brass inlay round the top
  // the ball track: polished black stone (a fine speckle in its roughness), its flare curving up into the wall (the
  // simulation's own profile); darker where it meets the wall and down at the cone
  const speck = tex(canvas(512, 64, (g, w, h) => {
    g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = 90 + Math.random() * 90 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random(), 1 + Math.random()); }
  }), false);
  speck.wrapS = speck.wrapT = THREE.RepeatWrapping; speck.repeat.set(48, 3);
  const trackGeo = lathe(TRACK.filter((_, i) => i % 3 === 0 || i === TRACK.length - 1));
  const track = new THREE.Mesh(trackGeo, shine(new THREE.MeshPhysicalMaterial({ color: '#0c0c0d', roughness: .5, roughnessMap: speck, metalness: 0, clearcoat: .85, clearcoatRoughness: .06, envMapIntensity: 1.1,
    aoMap: ramp([[0, .6], [.15, .95], [.88, 1], [1, .5]]) })));
  track.material.side = THREE.DoubleSide; wheel.add(track);
  // the stator cone, the same lacquer as the bowl, down to the wheelhead, darkening into the gap at its foot
  const coneGeo = lathe([[GEO.coneR1 - .2, GEO.coneY1 - .1], [GEO.coneR1, GEO.coneY1], [GEO.coneR0, GEO.coneY0]]);
  const cone = new THREE.Mesh(coneGeo, lacquerM('#0a0a0b', .2, ramp([[0, .35], [.12, .8], [.3, 1], [1, 1]]))); cone.material.envMapIntensity = .85; cone.material.side = THREE.DoubleSide; wheel.add(cone);
  // chrome beads where the track meets the cone and round the wheelhead
  torus(GEO.coneR0, .14, GEO.coneY0 + .06, chrome); torus(GEO.coneR1 + .1, .18, GEO.coneY1 + .06, chrome);
  // the ring light: an LED strip hidden under the rim's lip, its glow washing across the track and down the cone
  const glowC = new THREE.Color(glow);
  const glowing = [];   // each lit material and how bright it takes the light's colour, so the colour can change (glow.set)
  const lit = (m, k) => { m.color.copy(glowC).multiplyScalar(k); glowing.push([m, k]); return m; };
  { const strip = new THREE.Mesh(new THREE.TorusGeometry(W + .1, .2, 8, 220), lit(new THREE.MeshBasicMaterial({ toneMapped: false }), 2.2)); strip.rotation.x = Math.PI / 2; strip.position.y = WY + .5; wheel.add(strip);
    // its bloom: a soft halo either side of the strip
    const hc = canvas(4, 128, (g) => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); });
    const h0 = W - .5, h1 = R - .6, halo = new THREE.Mesh(new THREE.RingGeometry(h0, h1, 220, 1), lit(new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), .8));
    { const uv = halo.geometry.attributes.uv, pos = halo.geometry.attributes.position; for (let i = 0; i < uv.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, .5, (r - h0) / (h1 - h0)); } }
    halo.material.map = new THREE.CanvasTexture(hc); halo.rotation.x = -Math.PI / 2; halo.position.y = WY + .3; halo.renderOrder = 3; wheel.add(halo); }
  const alphaRamp = stops => tex(canvas(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), false);
  const wash = (geo, stops, k) => { const m = new THREE.Mesh(geo, lit(new THREE.MeshBasicMaterial({ map: alphaRamp(stops), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false, side: THREE.DoubleSide }), k)); m.renderOrder = 2; wheel.add(m); return m; };
  wash(trackGeo, [[0, .04], [.55, .18], [.85, .55], [1, 1]], .55); wash(coneGeo, [[0, 0], [.6, .05], [1, .22]], .5);
  // the eight canoes: chrome ball stops 5.2 cm long and 1 cm wide (US 6,047,965), a pointed hull with a rounded crown,
  // alternately lying across the ball's path (radial) and along it (tangential), as in the simulation
  const hull = new THREE.SphereGeometry(1, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  { const p = hull.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), k = Math.pow(Math.max(0, 1 - x * x), .35); p.setZ(i, p.getZ(i) * k); } hull.computeVertexNormals(); }
  hull.scale(GEO.deflLen / 2, .95, .7);   // (drawn 1.4 cm wide, as the makers' canoes are: the simulation's 1 cm is where the ball meets it)
  const coneY = r => GEO.coneY1 + (r - GEO.coneR1) / (GEO.coneR0 - GEO.coneR1) * (GEO.coneY0 - GEO.coneY1);
  const slope = Math.atan2(GEO.coneY0 - GEO.coneY1, GEO.coneR0 - GEO.coneR1);
  const canoes = [];
  for (let j = 0; j < GEO.deflectors; j++) {
    const a = (j + .5) * Math.PI * 2 / GEO.deflectors, d = new THREE.Object3D();
    d.position.set(...polar(GEO.deflR, a, coneY(GEO.deflR) - .05));
    d.rotation.order = 'YXZ';
    if (j % 2 === 0) { d.rotation.y = a; d.rotateZ(slope); } else { d.rotation.y = a + Math.PI / 2; d.rotateX(-slope); }   // radial: its length up the cone; tangential: along the path
    d.updateMatrix(); canoes.push([hull, d.matrix]);
  }
  wheel.add(new THREE.Mesh(merged(canoes), chrome));

  // ---- the wheelhead ----------------------------------------------------------------------------------------------
  // a ring whose texture u runs clockwise from zero: pocket i spans u in [i, i+1] / 37
  function ringGeo(r0, y0, r1, y1, segs = POCKETS * 8) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs, a = PITCH / 2 - u * Math.PI * 2;
      pos.push(...polar(r0, a, y0), ...polar(r1, a, y1)); uv.push(u, 0, u, 1);
      if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // the number ring: coloured cells, ivory numbers in a tall condensed face, tops toward the rim. `marks` (number → 1-3)
  // lights the numbers your bets cover while the ball runs: a faint gold wash for an outside bet, a brass frame for an
  // inside one, a bright frame for a straight up (the emissive map carries them, so they glow a little in the dark bowl)
  const numC = canvas(4096, 192, () => {});
  const numTex = tex(numC);
  let marks = null;
  const paintNumbers = () => {
    const g = numC.getContext('2d'), w = numC.width / POCKETS, H = numC.height;
    WHEEL.forEach((n, i) => {
      g.fillStyle = INK[colorOf(n)]; g.fillRect(i * w, 0, w + 1, H);
      const k = marks?.get(n) ?? 0; if (k) { g.fillStyle = `rgba(255,214,128,${[0, .16, .22, .3][k]})`; g.fillRect(i * w, 0, w + 1, H); }
      // a soft shade toward the pockets, where the ring dips
      const sh = g.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(.7, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = sh; g.fillRect(i * w, 0, w + 1, H);
      g.save(); g.translate(i * w + w / 2, H * .5);
      g.fillStyle = INK.ivory; g.font = `700 ${n > 9 ? 122 : 130}px "Barlow Condensed", Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.scale(n > 9 ? .78 : .95, 1); g.fillText(String(n), 0, 3); g.restore();
    });
    g.fillStyle = 'rgba(232,206,150,.85)'; for (let i = 0; i <= POCKETS; i++) g.fillRect(i * w - 2, 0, 4, H);   // fine brass lines between
    g.fillStyle = 'rgba(217,178,101,.95)'; g.fillRect(0, 0, numC.width, 8); g.fillRect(0, H - 8, numC.width, 8);
    if (marks) WHEEL.forEach((n, i) => { const k = marks.get(n) ?? 0; if (k < 2) return; const t = k === 3 ? 16 : 10; g.strokeStyle = k === 3 ? '#ffe7a8' : 'rgba(226,190,112,.95)'; g.lineWidth = t; g.strokeRect(i * w + t / 2 + 3, t / 2 + 10, w - t - 6, H - 20 - t); });
    numTex.needsUpdate = true;
  };
  paintNumbers(); document.fonts?.load('700 100px "Barlow Condensed"').then(paintNumbers, () => {});
  const ring = new THREE.Mesh(ringGeo(GEO.ringR1, GEO.ringY1, GEO.ringR0, GEO.ringY0), shine(new THREE.MeshPhysicalMaterial({ map: numTex, emissiveMap: numTex, emissive: '#ffffff', emissiveIntensity: .1, roughness: .32, specularIntensity: .3, clearcoat: .6, clearcoatRoughness: .1, envMapIntensity: .5, side: THREE.DoubleSide })));
  rotor.add(ring);
  // the pockets: each in its number's colour, darkening into its corners (the frets either side, the walls in and out),
  // painted once; the outer wall drops from the number ring to the floor in the same colour
  const PX = 96, pocketPaint = (h, shade) => canvas(PX * POCKETS, h, (g, w) => {
    WHEEL.forEach((n, i) => {
      g.fillStyle = FLOOR[colorOf(n)]; g.fillRect(i * PX, 0, PX, h);
      const side = g.createLinearGradient(i * PX, 0, (i + 1) * PX, 0);   // into the frets
      side.addColorStop(0, 'rgba(0,0,0,.6)'); side.addColorStop(.16, 'rgba(0,0,0,.12)'); side.addColorStop(.84, 'rgba(0,0,0,.12)'); side.addColorStop(1, 'rgba(0,0,0,.6)');
      g.fillStyle = side; g.fillRect(i * PX, 0, PX, h);
    });
    shade(g, w, h);
  });
  const floorTex = tex(pocketPaint(64, (g, w, h) => { const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,.55)'); v.addColorStop(.25, 'rgba(0,0,0,.05)'); v.addColorStop(.75, 'rgba(0,0,0,.05)'); v.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = v; g.fillRect(0, 0, w, h); }));
  const floor = new THREE.Mesh(ringGeo(GEO.pocketR1, GEO.pocketY, GEO.pocketR0, GEO.pocketY), shine(new THREE.MeshPhysicalMaterial({ map: floorTex, roughness: .45, specularIntensity: .25, clearcoat: .4, clearcoatRoughness: .2, envMapIntensity: .35, side: THREE.DoubleSide })));
  rotor.add(floor);
  const wallTex = tex(pocketPaint(32, (g, w, h) => { const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,.1)'); v.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = v; g.fillRect(0, 0, w, h); }));
  const wallOut = new THREE.Mesh(ringGeo(GEO.pocketR0, GEO.pocketY, GEO.pocketR0, GEO.ringY1), shine(new THREE.MeshPhysicalMaterial({ map: wallTex, roughness: .4, clearcoat: .4, clearcoatRoughness: .2, envMapIntensity: .3, side: THREE.DoubleSide })));
  rotor.add(wallOut);
  const lipH = GEO.fretTop + .15, wallIn = new THREE.Mesh(new THREE.CylinderGeometry(GEO.pocketR1, GEO.pocketR1, lipH, 192, 1, true), chrome); wallIn.position.y = GEO.pocketY + lipH / 2; rotor.add(wallIn);
  torus(GEO.pocketR1 + .02, .14, GEO.pocketY + lipH, chrome, rotor); torus(GEO.pocketR0, .1, GEO.ringY1 + .02, chrome, rotor);   // chrome edges, in and out
  // frets: 37 solid chrome separators, wider at the foot (7 mm) than the crown (4 mm), the crown rounded, as tall as the
  // simulation's (fretTop) and running the pocket's length
  const fretLen = GEO.pocketR0 - GEO.pocketR1, ft = GEO.fretTop, fs = new THREE.Shape();
  fs.moveTo(-.35, 0); fs.lineTo(.35, 0); fs.lineTo(.22, ft - .18); fs.quadraticCurveTo(.2, ft, 0, ft); fs.quadraticCurveTo(-.2, ft, -.22, ft - .18); fs.closePath();
  const fretGeo = new THREE.ExtrudeGeometry(fs, { depth: fretLen - .2, bevelEnabled: true, bevelThickness: .1, bevelSize: .04, bevelSegments: 2, curveSegments: 6 });
  fretGeo.translate(0, 0, GEO.pocketR1 + .1); fretGeo.rotateY(Math.PI / 2); fretGeo.translate(0, GEO.pocketY, 0);
  const frets = new THREE.InstancedMesh(fretGeo, chrome, POCKETS), m4 = new THREE.Matrix4();
  for (let i = 0; i < POCKETS; i++) { m4.makeRotationY(-(i + .5) * PITCH); frets.setMatrixAt(i, m4); }
  rotor.add(frets);
  // the cone of the wheelhead: black lacquer rising from the pockets to the turret, with a chrome ring part-way up
  const capY = GEO.pocketY + lipH, top = -6.75;
  // its lacquer laid over a fine sunburst (as on the makers' engine-turned cones): the ring light and the studio
  // lamps draw out in its radial grain as the wheelhead turns
  const burst = tex(canvas(2048, 8, (g, w, h) => { const d = g.createImageData(w, h); let x = 0; for (let i = 0; i < w; i++) { x = x * .55 + (Math.random() - .5) * .9; const v = 128 + 70 * Math.max(-1, Math.min(1, x)); for (let j = 0; j < h; j++) { const k = (j * w + i) * 4; d.data[k] = v; d.data[k + 1] = 128; d.data[k + 2] = 255; d.data[k + 3] = 255; } } g.putImageData(d, 0, 0); }), false);
  const capM = lacquerM('#0b0c0d', .2, ramp([[0, .4], [.12, .85], [.3, 1], [.85, 1], [1, .55]]));
  Object.assign(capM, { normalMap: burst, normalScale: new THREE.Vector2(.35, .35), specularIntensity: .55, clearcoatRoughness: .03 });
  const cap = new THREE.Mesh(lathe([[GEO.pocketR1, capY], [16.2, capY + .3], [12.5, -8.75], [8.5, -7.6], [5.2, -7.0], [3.7, top], [0, top]], 384), capM);
  rotor.add(cap);
  torus(8.6, .09, -7.56, chrome, rotor);
  // the turret: a chrome French cross, the croupier's handle: a fluted base on the cone, a column, and four arms ending
  // in polished knobs, with a finial on top
  const turret = new THREE.Group(); rotor.add(turret);
  turret.add(new THREE.Mesh(lathe([[0, top], [3.7, top], [3.55, top + .3], [2.7, top + .55], [1.6, top + .95], [1.05, top + 1.6], [.82, top + 3.1], [.95, top + 3.6], [1.35, top + 4.1], [1.45, top + 4.5], [1.2, top + 4.85], [.62, top + 5.15], [.5, top + 5.7], [.78, top + 6.05], [.8, top + 6.35], [.45, top + 6.6], [0, top + 6.7]], 64), chrome));
  { const armY = top + 4.4, arm = new THREE.CylinderGeometry(.46, .3, 7.6, 20); arm.rotateZ(Math.PI / 2); arm.translate(1.2 + 3.8, armY, 0);
    const knob = new THREE.SphereGeometry(.8, 28, 18); knob.translate(9.5, armY, 0);
    const collar = new THREE.TorusGeometry(.46, .13, 8, 20); collar.rotateY(Math.PI / 2); collar.translate(8.6, armY, 0);
    turret.add(new THREE.Mesh(merged([0, 1, 2, 3].flatMap(k => [arm, knob, collar].map(g => [g, new THREE.Matrix4().makeRotationY(k * Math.PI / 2)]))), chrome)); }

  // ---- the ball ---------------------------------------------------------------------------------------------------
  const ball = new THREE.Mesh(new THREE.SphereGeometry(GEO.ball, 32, 20), shine(new THREE.MeshPhysicalMaterial({ color: '#f7f3e8', roughness: .16, clearcoat: 1, clearcoatRoughness: .04, emissive: '#fff1d6', emissiveIntensity: .12 })));
  wheel.add(ball);
  // its contact shadow: a soft dark disc on whatever it rolls over, tilted to that surface, fading as the ball leaves it
  const blob = new THREE.Mesh(new THREE.CircleGeometry(GEO.ball * 1.7, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false,
    alphaMap: tex(canvas(64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(.45, '#888'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }), false) }));
  blob.visible = false; blob.renderOrder = 4; wheel.add(blob);
  { let shown = false; Object.defineProperty(ball, 'visible', { get: () => shown, set: v => { shown = v; if (!v) blob.visible = false; } }); }   // (the shadow goes with the ball)
  const up = new THREE.Vector3(0, 0, 1), nrm = new THREE.Vector3();
  function placeBlob(theta, r, y) {
    const fy = floorY(r), h = y - fy, dy = (floorY(r + .15) - floorY(r - .15)) / .3, c = Math.cos(theta), s = -Math.sin(theta);
    blob.visible = ball.visible && h < 3; if (!blob.visible) return;
    nrm.set(-dy * c, 1, -dy * s).normalize(); blob.quaternion.setFromUnitVectors(up, nrm);
    blob.position.set(r * c, fy - GEO.ball + .03, r * s); blob.material.opacity = .62 * Math.max(0, 1 - h / 3);
  }
  // its trail: at launch the ball covers three of its own widths a frame, which on a screen reads as a strobe; a
  // camera's shutter (and the eye) smear it into a streak. A few faint copies behind it along its path do the same.
  const ghostGeo = new THREE.SphereGeometry(GEO.ball, 16, 10), ghosts = [.42, .26, .14, .07].map(o => { const g = new THREE.Mesh(ghostGeo, new THREE.MeshBasicMaterial({ color: '#f7f3e8', transparent: true, opacity: o, depthWrite: false })); g.visible = false; g.userData.o = o; wheel.add(g); return g; });

  return {
    group: wheel, rotor, ball,
    // the ring light's colour (its strip, bloom and the washes across the track and down the cone)
    glow: { set(c, gain = 1) { glowC.set(c); for (const [m, k] of glowing) m.color.copy(glowC).multiplyScalar(k * gain); }, base: glow },
    // light the numbers your bets cover (number → 1 outside, 2 inside, 3 straight up), or clear them (null): one repaint
    mark(m) { if (!m && !marks) return; marks = m?.size ? m : null; paintNumbers(); },
    setRotor(phi) { rotor.rotation.y = phi; },
    setBall(theta, r, y) { ball.position.set(...polar(r, theta, y)); placeBlob(theta, r, y); },
    // the streak behind a fast ball: the arc it covered in the last frame, shown only while it runs fast
    setTrail(theta, r, y, speed = 0, dir = 1) {
      const on = speed > 80; const span = Math.min(7, speed / 60) / r;
      ghosts.forEach((g, i) => { g.visible = on; if (on) { g.position.set(...polar(r, theta - dir * span * (i + 1) / ghosts.length, y)); g.material.opacity = g.userData.o * Math.min(1, (speed - 80) / 120); } });
    },
    // where a pocket's centre is, in the wheel's frame, for a given wheelhead angle
    pocketAt(i, phi, y = GEO.pocketY + GEO.ball) { return polar(GEO.restR, phi - i * PITCH, y); },
  };
}
