// The roulette table's look, where a test can hold it: the other players' colour chips can't be taken for your value
// chips, for the brass or for each other; the chips are true size; and the statistics' bars count the zero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHIP_VALUES } from '../src/core/chips.mjs';
import { stats } from '../src/roulette/rules.mjs';
import { seeded } from './helpers.mjs';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// CIE76 colour difference, from sRGB hex through CIELAB (D65)
const lab = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  const [X, Y, Z] = [(.4124 * r + .3576 * g + .1805 * b) / .95047, .2126 * r + .7152 * g + .0722 * b, (.0193 * r + .1192 * g + .9505 * b) / 1.08883].map(f);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
};
const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };

test('the other players\' colour chips: ΔE76 25 or more from every value chip, the brass and each other; inserts tell them apart too', () => {
  const src = read('src/roulette/rgame.mjs'), rivals = [...src.slice(src.indexOf('const RIVALS'), src.indexOf('];', src.indexOf('const RIVALS'))).matchAll(/name: '([^']+)', color: '(#[0-9a-f]{6})', inserts: (\d+)/g)].map(([, name, color, n]) => ({ name, color, inserts: +n }));
  assert.equal(rivals.length, 4, 'four players, each with a colour and an insert count');
  const tex = read('src/scene/textures.mjs'), base = v => tex.match(new RegExp(`^\\s*${String(v).replace('.', '\\.')}: \\{ base: '(#[0-9a-f]{6})'`, 'm'))?.[1];
  const value = [.5, ...CHIP_VALUES].map(v => [v, base(v)]);   // (the ½ chip comes back with la partage on an odd stake)
  for (const [v, c] of value) assert.ok(c, `the ${v} chip's colour`);
  for (const r of rivals) {
    for (const [v, c] of value) assert.ok(dE(r.color, c) >= 25, `${r.name} ${r.color} vs the ${v} chip ${c}: ΔE ${dE(r.color, c).toFixed(1)}`);
    assert.ok(dE(r.color, '#c9a45c') >= 25, `${r.name} vs brass: ΔE ${dE(r.color, '#c9a45c').toFixed(1)}`);
  }
  for (let i = 0; i < rivals.length; i++) for (let j = i + 1; j < rivals.length; j++) assert.ok(dE(rivals[i].color, rivals[j].color) >= 25, `${rivals[i].name} vs ${rivals[j].name}`);
  const counts = rivals.map(r => r.inserts), spots = +tex.match(/CHIP_SPOTS = (\d+)/)[1];
  assert.equal(new Set([...counts, spots]).size, counts.length + 1, 'each player has an insert count of their own, none the value chips\'');
});

test('roulette chips are drawn at true size: 39 mm across, CHIP_H thick, no scale on top', () => {
  const tex = read('src/scene/textures.mjs'), [, r, h] = tex.match(/CHIP_R = ([\d.]+), CHIP_H = ([\d.]+)/);
  assert.equal(+r * 2, 3.9); assert.ok(+h >= .33 && +h <= .34, `CHIP_H ${h} cm (a 0.130 in chip is 0.33)`);
  assert.match(read('src/roulette/rgame.mjs'), /const H = CHIP_H;/);
  assert.doesNotMatch(read('src/roulette/rscene.mjs'), /chipMesh = [^\n]*setScalar/, 'no shrinking scale on the layout\'s chips');
});

test('the statistics: with the zero\'s share every bar sums to 100% (to rounding), over any history', () => {
  const rnd = seeded(11);
  for (let k = 0; k < 200; k++) {
    const h = Array.from({ length: 1 + Math.floor(rnd() * 100) }, () => Math.floor(rnd() * 37)), s = stats(h);
    for (const parts of [[s.red, s.black], [s.odd, s.even], [s.low, s.high], s.dozens, s.columns]) {
      const sum = parts.reduce((a, b) => a + b, s.zero); assert.ok(Math.abs(sum - 100) <= 2, `${parts} + zero ${s.zero} = ${sum}`);
    }
  }
});
