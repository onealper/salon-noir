// The wheel, modelled on the live-studio wheels (a TCS John Huxley Saturn, as filmed for bet365): an 83 cm bowl in
// piano-black lacquer, a wide glassy ball track washed by a ring light hidden under the rim (warm gold here, where
// bet365's glows green), eight small chrome ball stops, and the wheelhead in the proportions measured off that film:
// a wide number band with the numbers standing outward, long coloured pockets with chrome frets, a dark glossy cone
// and a squat black turret with the house mark in its top.
// Units are centimetres; y = 0 is the rim of the bowl. Angles follow the simulation (physics.mjs): a
// point at angle a sits at (r cos a, -r sin a), and pocket i is i pitches clockwise of zero.
import { GEO } from './physics.mjs';
import { WHEEL, PITCH, POCKETS, colorOf } from './rules.mjs';

export const polar = (r, a, y = 0) => [r * Math.cos(a), y, -r * Math.sin(a)];
const INK = { red: '#a8131f', black: '#111214', green: '#0d6a3b', ivory: '#f5eedf' };
const FLOOR = { red: '#7e0f18', black: '#0a0b0c', green: '#0a5130' };

export function createWheel(THREE, { aniso = 8, env = null, glow = '#ffb85a' }) {
  const wheel = new THREE.Group(), rotor = new THREE.Group(); wheel.add(rotor);
  // a studio environment of its own (a ring light overhead, soft boxes), so the lacquer and chrome carry the arcs
  // and streaks of light a filmed wheel shows
  const shine = m => { if (env) { m.envMap = env; m.envMapIntensity = m.envMapIntensity ?? 1; } return m; };
  const lacquerM = (color = '#060606', rough = .18) => shine(new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, specularIntensity: .18, clearcoat: 1, clearcoatRoughness: .03, envMapIntensity: 1.25 }));
  const chrome = shine(new THREE.MeshStandardMaterial({ color: '#f1f3f5', metalness: 1, roughness: .07, envMapIntensity: 1.6 }));
  const brass = shine(new THREE.MeshStandardMaterial({ color: '#d9b265', metalness: 1, roughness: .16, envMapIntensity: 1.4 }));
  const lathe = (pts, segs = 160) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);

  // ---- the bowl: piano-black lacquer from the skirt over the rim and down the stator cone ------------------
  const rim = new THREE.Mesh(lathe([[40.4, -1.4], [40.9, .35], [41.6, .8], [43.2, .9], [44.6, .55], [45.3, -.4], [45.6, -3], [45.6, -15]]), lacquerM('#070707', .16));
  rim.material.side = THREE.DoubleSide; rim.receiveShadow = rim.castShadow = true; wheel.add(rim);
  { const inlay = new THREE.Mesh(new THREE.TorusGeometry(43.3, .09, 6, 200), brass); inlay.rotation.x = Math.PI / 2; inlay.position.y = .93; wheel.add(inlay); }
  // the ball track: a wide, glassy black running surface
  const trackGeo = lathe([[35.6, GEO.coneY0], [37.6, -2.5], [39.3, -1.95], [40.1, -1.6], [40.4, -1.4]]);
  const track = new THREE.Mesh(trackGeo, lacquerM('#0a0a0a', .1)); track.material.side = THREE.DoubleSide; track.receiveShadow = true; wheel.add(track);
  // the stator cone, the same lacquer, down to the wheelhead
  const coneGeo = lathe([[GEO.coneR1 - .2, GEO.coneY1 - .1], [GEO.coneR1, GEO.coneY1], [GEO.coneR0, GEO.coneY0]]);
  const cone = new THREE.Mesh(coneGeo, lacquerM('#0b0b0c', .22)); cone.material.envMapIntensity = .8; cone.material.side = THREE.DoubleSide; cone.receiveShadow = true; wheel.add(cone);
  // fine chrome beads where the track meets the cone and round the wheelhead
  const bead = (r, y, w = .12) => { const b = new THREE.Mesh(new THREE.TorusGeometry(r, w, 8, 200), chrome); b.rotation.x = Math.PI / 2; b.position.y = y; wheel.add(b); };
  bead(GEO.coneR0, GEO.coneY0 + .05); bead(GEO.coneR1 + .08, GEO.coneY1 + .05, .16);
  // the ring light: an LED strip hidden under the rim's lip, its glow washing across the track and down the cone
  const glowC = new THREE.Color(glow);
  { const strip = new THREE.Mesh(new THREE.TorusGeometry(40.5, .2, 8, 220), new THREE.MeshBasicMaterial({ color: glowC.clone().multiplyScalar(2.2), toneMapped: false })); strip.rotation.x = Math.PI / 2; strip.position.y = -1.25; wheel.add(strip);
    // its bloom: a soft halo either side of the strip
    const hc = document.createElement('canvas'); hc.width = 4; hc.height = 128; const hg = hc.getContext('2d'), gr = hg.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); hg.fillStyle = gr; hg.fillRect(0, 0, 4, 128);
    const halo = new THREE.Mesh(new THREE.RingGeometry(38.6, 42.4, 220, 1), new THREE.MeshBasicMaterial({ color: glowC.clone().multiplyScalar(.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    { const uv = halo.geometry.attributes.uv, pos = halo.geometry.attributes.position; for (let i = 0; i < uv.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, .5, (r - 38.6) / 3.8); } }
    halo.material.map = new THREE.CanvasTexture(hc); halo.rotation.x = -Math.PI / 2; halo.position.y = -1.1; halo.renderOrder = 3; wheel.add(halo); }
  const ramp = (stops) => { const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 256, 0, 0); for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); return t; };
  const wash = (geo, stops, k) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: glowC.clone().multiplyScalar(k), map: ramp(stops), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false, side: THREE.DoubleSide })); m.renderOrder = 2; wheel.add(m); return m; };
  const glowTrack = wash(trackGeo, [[0, .04], [.55, .18], [.85, .55], [1, 1]], .55), glowCone = wash(coneGeo, [[0, 0], [.6, .05], [1, .22]], .5);
  // the eight ball stops: small chrome lenses lying along the ball's path
  const stopGeo = new THREE.SphereGeometry(1, 20, 10); stopGeo.scale(GEO.deflLen * .3, .32, .5);
  const coneY = r => GEO.coneY1 + (r - GEO.coneR1) / (GEO.coneR0 - GEO.coneR1) * (GEO.coneY0 - GEO.coneY1);
  const slope = Math.atan2(GEO.coneY0 - GEO.coneY1, GEO.coneR0 - GEO.coneR1);
  for (let j = 0; j < GEO.deflectors; j++) {
    const a = (j + .5) * Math.PI * 2 / GEO.deflectors, d = new THREE.Mesh(stopGeo, chrome);
    d.position.set(...polar(GEO.deflR, a, coneY(GEO.deflR) + .2));
    d.rotation.order = 'YXZ'; d.rotation.y = a + Math.PI / 2; d.rotateX(-slope);
    d.castShadow = true; wheel.add(d);
  }

  // ---- the wheelhead -------------------------------------------------------------------------------------
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
  // the number ring: coloured cells, ivory numbers in a tall condensed face, tops toward the rim
  const numC = document.createElement('canvas'); numC.width = 4096; numC.height = 160;
  const numTex = new THREE.CanvasTexture(numC); numTex.colorSpace = THREE.SRGBColorSpace; numTex.anisotropy = aniso;
  const paintNumbers = () => {
    const g = numC.getContext('2d'), w = numC.width / POCKETS;
    WHEEL.forEach((n, i) => {
      g.fillStyle = INK[colorOf(n)]; g.fillRect(i * w, 0, w + 1, 160);
      g.save(); g.translate(i * w + w / 2, 84);
      g.fillStyle = INK.ivory; g.font = `700 ${n > 9 ? 104 : 112}px "Barlow Condensed", Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.scale(n > 9 ? .8 : .95, 1); g.fillText(String(n), 0, 2); g.restore();
    });
    g.fillStyle = 'rgba(232,206,150,.85)'; for (let i = 0; i <= POCKETS; i++) g.fillRect(i * w - 1.5, 0, 3, 160);   // fine lines between
    g.fillStyle = 'rgba(217,178,101,.95)'; g.fillRect(0, 0, numC.width, 7); g.fillRect(0, 153, numC.width, 7);
    numTex.needsUpdate = true;
  };
  paintNumbers(); document.fonts?.load('700 100px "Barlow Condensed"').then(paintNumbers, () => {});
  const ring = new THREE.Mesh(ringGeo(GEO.ringR1, GEO.ringY1, GEO.ringR0, GEO.ringY0), shine(new THREE.MeshPhysicalMaterial({ map: numTex, emissiveMap: numTex, emissive: '#ffffff', emissiveIntensity: .12, roughness: .35, specularIntensity: .3, clearcoat: .45, clearcoatRoughness: .12, envMapIntensity: .45, side: THREE.DoubleSide })));
  ring.receiveShadow = true; rotor.add(ring);
  // pockets: the floors coloured like their numbers, a brass wall at the outer edge and a brass lip inside
  const pocC = document.createElement('canvas'); pocC.width = 2048; pocC.height = 16;
  { const g = pocC.getContext('2d'), w = pocC.width / POCKETS; WHEEL.forEach((n, i) => { g.fillStyle = FLOOR[colorOf(n)]; g.fillRect(i * w, 0, w + 1, 16); }); }
  const pocTex = new THREE.CanvasTexture(pocC); pocTex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(ringGeo(GEO.pocketR1, GEO.pocketY, GEO.pocketR0, GEO.pocketY), shine(new THREE.MeshPhysicalMaterial({ map: pocTex, roughness: .55, specularIntensity: .2, clearcoat: .35, clearcoatRoughness: .25, envMapIntensity: .35, side: THREE.DoubleSide }))); floor.receiveShadow = true; rotor.add(floor);
  const wallOut = new THREE.Mesh(new THREE.CylinderGeometry(GEO.pocketR0, GEO.pocketR0, GEO.ringY1 - GEO.pocketY, 148, 1, true), chrome.clone()); wallOut.material.side = THREE.BackSide; wallOut.position.y = (GEO.ringY1 + GEO.pocketY) / 2; rotor.add(wallOut);
  const lipH = GEO.fretTop + .15, wallIn = new THREE.Mesh(new THREE.CylinderGeometry(GEO.pocketR1, GEO.pocketR1, lipH, 148, 1, true), chrome); wallIn.position.y = GEO.pocketY + lipH / 2; rotor.add(wallIn);
  // frets: 37 brass separators with rounded tops
  const fretLen = GEO.pocketR0 - GEO.pocketR1, fretGeo = new THREE.CapsuleGeometry(.12, fretLen, 2, 6);
  fretGeo.rotateZ(Math.PI / 2); fretGeo.scale(1, GEO.fretTop / .24, 1); fretGeo.translate((GEO.pocketR0 + GEO.pocketR1) / 2, GEO.pocketY + GEO.fretTop / 2, 0);
  const frets = new THREE.InstancedMesh(fretGeo, chrome, POCKETS), m4 = new THREE.Matrix4();
  for (let i = 0; i < POCKETS; i++) { m4.makeRotationY(-(i + .5) * PITCH); frets.setMatrixAt(i, m4); }
  frets.castShadow = true; rotor.add(frets);
  // the cone of the wheelhead: dark glass-black, rising gently to a squat turret
  const cap = new THREE.Mesh(lathe([[GEO.pocketR1, GEO.pocketY + lipH], [15.8, GEO.pocketY + lipH + .2], [9, -7.3], [4.4, -6.6], [0, -6.6]], 160), lacquerM('#0d0f10', .14));
  cap.receiveShadow = true; rotor.add(cap);
  { const ringC = new THREE.Mesh(new THREE.TorusGeometry(GEO.pocketR1 - .35, .1, 6, 180), chrome); ringC.rotation.x = Math.PI / 2; ringC.position.y = GEO.pocketY + lipH + .15; rotor.add(ringC); }
  // the turret: a short black cylinder with a brass band, the house mark inlaid in its top
  const turret = new THREE.Group(); rotor.add(turret);
  { const body = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.55, 5.2, 48), lacquerM('#080808', .12)); body.position.y = -4.0; turret.add(body);
    const band = new THREE.Mesh(new THREE.TorusGeometry(3.29, .13, 8, 64), brass); band.rotation.x = Math.PI / 2; band.position.y = -2.15; turret.add(band);
    const tc = document.createElement('canvas'); tc.width = tc.height = 256; const g = tc.getContext('2d');
    g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#c9a45c'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#d9b265'; g.font = 'italic 600 56px "Bodoni Moda", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Salon', 128, 100); g.fillText('Noir', 128, 158);
    const tt = new THREE.CanvasTexture(tc); tt.colorSpace = THREE.SRGBColorSpace;
    const top = new THREE.Mesh(new THREE.CircleGeometry(3.24, 48), shine(new THREE.MeshPhysicalMaterial({ map: tt, roughness: .2, clearcoat: 1, clearcoatRoughness: .05 }))); top.rotation.x = -Math.PI / 2; top.position.y = -1.38; turret.add(top);
    document.fonts?.load('italic 600 56px "Bodoni Moda"').then(() => { g.fillStyle = '#0a0a0a'; g.fillRect(14, 50, 228, 150); g.fillStyle = '#d9b265'; g.fillText('Salon', 128, 100); g.fillText('Noir', 128, 158); tt.needsUpdate = true; }, () => {});
  }
  turret.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // ---- the ball ------------------------------------------------------------------------------------------
  const ball = new THREE.Mesh(new THREE.SphereGeometry(GEO.ball, 32, 20), shine(new THREE.MeshPhysicalMaterial({ color: '#f7f3e8', roughness: .16, clearcoat: 1, clearcoatRoughness: .04, emissive: '#fff1d6', emissiveIntensity: .12 })));
  ball.castShadow = true; ball.visible = false; wheel.add(ball);

  return {
    group: wheel, rotor, ball, glow: { set(c) { glowC.set(c); } },
    setRotor(phi) { rotor.rotation.y = phi; },
    setBall(theta, r, y) { ball.position.set(...polar(r, theta, y)); },
    // where a pocket's centre is, in the wheel's frame, for a given wheelhead angle
    pocketAt(i, phi, y = GEO.pocketY + GEO.ball) { return polar(GEO.pocketMid, phi - i * PITCH, y); },
  };
}
