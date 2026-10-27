// Clear acrylic, for any room that has some (at blackjack: the shoe, its tongue and the discard holder). What makes a few
// millimetres of polished sheet read as acrylic is not the slight shift of what is seen through it but what it reflects,
// how its cut edges carry light, and how it sits on the cloth. So, rather than three's transmission (which draws the whole
// room again, full size and multisampled, every frame the glass is in sight, and can't see one sheet through another):
//  - reflectionProbe: the real table seen from where the glass stands, the lamp over it drawn in, made once (again after a
//    lost context or a new cloth), so the glass reflects the felt, the rail, the chips and the pendant where they are;
//  - acrylic(): the broad faces as acrylic is, Schlick's Fresnel for n = 1.49 at both of the sheet's surfaces: what they
//    reflect added whole, what is behind dimmed by what is reflected and what the way through absorbs (longer at a slant,
//    Beer-Lambert), drawn premultiplied (the shader weighs its own light, the blend lets the rest through); and the cut
//    edges, which look into the sheet: the probe bent through them, a little more for blue than for red (a faint rainbow),
//    and the light the sheet carries to its edges (`emissive`: whoever owns the glass keeps it in step with the room's
//    light);
//  - sheet / sheetBox: sheets with polished edges, rounded so each catches a line of light, faces and edges told apart;
//  - groundDecal: what the glass does to the cloth under it (a faint shadow, the bright lines light makes through it).
import * as THREE from '../vendor/three.module.min.js';

export const IOR = 1.49;   // PMMA
const F0 = ((IOR - 1) / (IOR + 1)) ** 2;
const PREMULTIPLIED = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };

// Both shaders run in place of the end of three's physical shading, where `outgoingLight` holds the lit result: its diffuse
// part (`totalDiffuse`) and the rest, the reflections of the lights and the probe, which carry three's own Fresnel.
const FACE = /* glsl */`{
  vec3 V = normalize(vViewPosition);
  float cosI = clamp(abs(dot(normal, V)), 1e-3, 1.0), F = ${F0.toFixed(4)} + ${(1 - F0).toFixed(4)} * pow(1.0 - cosI, 5.0);
  float R = 2.0 * F / (1.0 + F);                                    // reflected by the sheet: its front and its back
  float sinT = sqrt(1.0 - cosI * cosI) / ${IOR.toFixed(2)}, cosT = sqrt(1.0 - sinT * sinT);
  float through = (1.0 - R) * exp(-uAbsorb * uThick / cosT);        // what comes through from behind
  outgoingLight = (outgoingLight - totalDiffuse) * (R / F) + totalDiffuse * (1.0 - through);   // its reflections, and a haze
  diffuseColor.a = 1.0 - through;
}
`;
const EDGE = /* glsl */`{
  vec3 V = normalize(vViewPosition);
  float cosI = clamp(abs(dot(normal, V)), 1e-3, 1.0), F = ${F0.toFixed(4)} + ${(1 - F0).toFixed(4)} * pow(1.0 - cosI, 5.0);
  vec3 inside = vec3(0.0);
#ifdef ENVMAP_TYPE_CUBE_UV
  vec3 Nw = inverseTransformDirection(normal, viewMatrix), Iw = -inverseTransformDirection(V, viewMatrix);
  inside.r = textureCubeUV(envMap, envMapRotation * refract(Iw, Nw, 1.0 / 1.482), .22).r;
  inside.g = textureCubeUV(envMap, envMapRotation * refract(Iw, Nw, 1.0 / 1.490), .22).g;
  inside.b = textureCubeUV(envMap, envMapRotation * refract(Iw, Nw, 1.0 / 1.502), .22).b;
  inside *= envMapIntensity;
#endif
  outgoingLight = (outgoingLight - totalDiffuse) + (1.0 - F) * inside * uTint;   // reflected, the piped light, and the room bent through
  diffuseColor.a = .9;
}
`;
function inject(m, code, uniforms, key) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = Object.entries(uniforms).map(([k, u]) => `uniform ${u.value.isColor ? 'vec3' : 'float'} ${k};\n`).join('') + sh.fragmentShader.replace('#include <opaque_fragment>', code + '#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => key;
  return m;
}
// `env`: the probe; `piped`: the colour the edges glow (their light, scaled by `emissiveIntensity`); `thick`: the sheet (cm).
export function acrylic({ env = null, piped = '#b8ddd2', glow = .3, thick = .35 } = {}) {
  const face = inject(new THREE.MeshPhysicalMaterial({ color: '#141817', roughness: .025, metalness: 0, ior: IOR, envMap: env, envMapIntensity: 1, ...PREMULTIPLIED }),
    FACE, { uAbsorb: { value: .06 }, uThick: { value: thick } }, 'acrylic-face');
  const edge = inject(new THREE.MeshPhysicalMaterial({ color: '#000000', emissive: piped, emissiveIntensity: glow, roughness: .07, metalness: 0, ior: IOR, envMap: env, envMapIntensity: 1, ...PREMULTIPLIED }),
    EDGE, { uTint: { value: new THREE.Color('#d6eee6') } }, 'acrylic-edge');
  return { face, edge };
}
// Frosted acrylic (a shoe's floor): milky, its light scattered.
export const frosted = env => new THREE.MeshPhysicalMaterial({ color: '#e7ecea', roughness: .5, metalness: 0, transparent: true, opacity: .72, depthWrite: false, envMap: env, envMapIntensity: .6 });

// A sheet cut to an outline (x, y), `t` thick from z 0, its edges polished round by `r`; its broad faces take `mats.face`, its
// cut edges `mats.edge`. sheetBox: the same as a box w x h x d about its middle, its thinnest side the sheet's thickness.
export function sheet(outline, t, mats, r = .05) {
  r = Math.min(r, t / 3);   // (a thin piece gets a finer round)
  const shape = outline instanceof THREE.Shape ? outline : new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelOffset: -r, bevelSegments: 3, curveSegments: 12 });
  return new THREE.Mesh(geo.translate(0, 0, r), [mats.face, mats.edge]);
}
export function sheetBox(w, h, d, mats, r = .05) {
  const t = Math.min(w, h, d), rect = (a, b) => [[-a / 2, -b / 2], [a / 2, -b / 2], [a / 2, b / 2], [-a / 2, b / 2]];
  const m = t === d ? sheet(rect(w, h), d, mats, r) : t === h ? sheet(rect(w, d), h, mats, r) : sheet(rect(d, h), w, mats, r);
  m.geometry.translate(0, 0, -t / 2);
  if (t === h && t !== d) m.geometry.rotateX(Math.PI / 2); else if (t === w && t !== d) m.geometry.rotateY(Math.PI / 2);
  return m;
}

// The table as its glass sees it from `at` (world): a cube of the scene with `hide` hidden and the lamp over the table drawn in
// as a disc far brighter than white (`lamp`: { at, size, color, power }), filtered for every roughness. Made once, cheaply
// (six small renders); the caller frees the last one.
export function reflectionProbe(renderer, scene, at, { hide = [], lamp = null, size = 256 } = {}) {
  const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType }), cam = new THREE.CubeCamera(1, 3000, rt);
  cam.position.copy(at); scene.add(cam);
  const shown = hide.map(o => o.visible); for (const o of hide) o.visible = false;
  let disc = null;
  if (lamp) {
    disc = new THREE.Mesh(new THREE.CircleGeometry(lamp.size, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(lamp.color).multiplyScalar(lamp.power), side: THREE.DoubleSide }));
    disc.position.copy(lamp.at); disc.rotation.x = Math.PI / 2; scene.add(disc);
  }
  cam.update(renderer, scene);
  hide.forEach((o, i) => { o.visible = shown[i]; }); scene.remove(cam);
  if (disc) { scene.remove(disc); disc.geometry.dispose(); disc.material.dispose(); }
  const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromCubemap(rt.texture).texture;
  pmrem.dispose(); rt.dispose();
  return env;
}

// Something drawn on the cloth under the glass: a canvas over x0..x1, z0..z1 (cm, in the parent's frame) at 20 px a cm,
// `draw(g, px)` painting it (px(x, z) → canvas point). `additive`: light (caustics, a lamp's spill); otherwise shade.
export function groundDecal(x0, x1, z0, z1, draw, { additive = false, opacity = 1, y = .02 } = {}) {
  const k = 20, c = document.createElement('canvas'); c.width = Math.round((x1 - x0) * k); c.height = Math.round((z1 - z0) * k);
  draw(c.getContext('2d'), (x, z) => [(x - x0) * k, (z - z0) * k], k);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity, depthWrite: false, toneMapped: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.renderOrder = 0;
  return m;
}
