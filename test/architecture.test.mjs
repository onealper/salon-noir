// The house rules from PROJECT.md that a test can hold: the rules engines stay free of the page, nothing is
// fetched from elsewhere, and the offline worker knows every code module (or the first visit can't play offline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url), read = p => fs.readFileSync(new URL(p, root), 'utf8');
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');   // comments out
const modules = dir => fs.readdirSync(new URL(`src/${dir}`, root)).filter(f => f.endsWith('.mjs')).map(f => f.slice(0, -4));

test('the rules engines and the helpers they share have no DOM: no document, window, storage or browser timing in them', () => {
  for (const f of ['engine', 'sidebets', 'players', 'roulette/rules', 'roulette/physics', 'roulette/lightning', 'roulette/rkeys', 'core/modes', 'core/chips', 'core/format', 'core/rng', 'blackjack/book']) {
    const hits = code(read(`src/${f}.mjs`)).match(/\b(document|window|localStorage|sessionStorage|navigator|location|requestAnimationFrame|addEventListener|fetch)\b/g);
    assert.equal(hits, null, `${f}.mjs uses ${hits}`);
  }
});

test('everything is self-hosted: every import is a relative path', () => {
  for (const dir of ['', 'core/', 'scene/', 'blackjack/', 'roulette/']) for (const f of modules(dir)) {
    for (const [, spec] of code(read(`src/${dir}${f}.mjs`)).matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"`]([^'"`]+)['"`]/g)) assert.match(spec, /^\.{1,2}\//, `${dir}${f}.mjs imports ${spec}`);
  }
  assert.doesNotMatch(read('index.html').replace(/<a [^>]*>/g, ''), /<(script|link)[^>]+(src|href)="(https?:)?\/\//, 'index.html loads nothing from elsewhere');
});

test('the service worker precaches every code module', () => {
  const sw = read('sw.js');
  for (const dir of ['', 'core/', 'scene/', 'blackjack/', 'roulette/']) {
    const m = sw.match(new RegExp(`\\[([^\\[\\]]*)\\]\\.map\\(f => \`src/${dir}\\$\\{f\\}\\.mjs\`\\)`)); assert.ok(m, `sw.js lists src/${dir}`);
    assert.deepEqual(m[1].match(/'[^']+'/g).map(s => s.slice(1, -1)).sort(), modules(dir).sort(), `sw.js CODE for src/${dir}`);
  }
});

test('the page\'s security policy keeps it to its own files, and allows exactly its inline scripts', async () => {
  const { createHash } = await import('node:crypto');
  const html = read('index.html'), csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
  assert.ok(csp, 'index.html has a Content-Security-Policy meta tag');
  const rule = name => csp.split(';').map(d => d.trim().split(/\s+/)).find(([n]) => n === name)?.slice(1) ?? [];
  assert.deepEqual(rule('default-src'), ["'self'"]);
  for (const d of ['script-src', 'connect-src', 'img-src', 'media-src', 'font-src', 'worker-src']) assert.ok(rule(d).every(v => !/^(https?:|\*|'unsafe-eval')/.test(v)), `${d} reaches outside: ${rule(d)}`);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  const allowed = rule('script-src').filter(v => v.startsWith("'sha256-"));
  assert.deepEqual(allowed.sort(), inline.sort(), 'the hashes in script-src are the inline scripts as they stand: an edited inline script needs its new hash there');
  assert.equal(/\son[a-z]+="/i.test(html), false, 'no inline event handlers (the policy refuses them)');
});
