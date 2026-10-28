// Salon Noir's service worker: the salon opens with no connection, and installs to a home screen.
// index.html registers it only in a secure context (https, or localhost), so a phone on the owner's
// Wi-Fi at http://<ip>:8000 plays without it; ?nosw on the address turns it off and removes it.
//
// Pages and code (HTML, JS, CSS, the manifest): network first, revalidated with the server on every
// load, so an update you publish shows on the next reload. The cache answers only when the network
// can't, which is what makes offline play work.
// Media (sounds, images, fonts): cache first. They are large and don't change in place: if you
// replace one under the same name, bump VERSION, or friends who installed the game keep the old one.
// (A new worker re-fills fresh caches and deletes the old ones when it takes over.)
const VERSION = '5';
const SHELL = `salon-noir-shell-${VERSION}`, MEDIA = `salon-noir-media-${VERSION}`;

// Fetched as the worker installs, so the first visit is enough to play offline. Anything not listed
// (a new file) is still kept the first time it loads while the worker is running.
const n = (name, ...takes) => takes.map(t => `${name}-${t}`), to = k => Array.from({ length: k }, (_, i) => i + 1);
const CODE = ['./', 'manifest.webmanifest', 'src/app.css', 'src/fonts.css',
  ...['app', 'engine', 'sidebets', 'players', 'sound', 'ui-kit', 'ui-motion'].map(f => `src/${f}.mjs`),
  ...['bet-controls', 'brand', 'chips', 'feel', 'format', 'ledger', 'lobby', 'modes', 'rng', 'wallet'].map(f => `src/core/${f}.mjs`),
  ...['stage', 'world', 'view', 'pieces', 'textures', 'glass', 'lightning3d'].map(f => `src/scene/${f}.mjs`),
  ...['controller', 'book', 'lightning-ui', 'storm', 'tray-icons'].map(f => `src/blackjack/${f}.mjs`),
  ...['rgame', 'rules', 'lightning', 'physics', 'replay', 'rscene', 'rstrikes', 'wheel3d', 'roller'].map(f => `src/roulette/${f}.mjs`),
  ...['three.module.min.js', 'RoomEnvironment.js', 'anime.mjs', 'confetti.mjs', 'torph.mjs', 'web-haptics.mjs', 'cuelume/index.js', 'cuelume/audio/engine.js',
    'cuelume/interactions/bind.js', ...['bubble', 'context', 'mech', 'press', 'recipes', 'themes'].map(f => `cuelume/sounds/${f}.js`)].map(f => `src/vendor/${f}`)];
const BJ = ['place-bets', 'insurance', 'even-money', 'lightning', 'dealer-ace', 'blackjack', 'dealer-blackjack', ...n('dealer', 17, 18, 19, 20, 21), 'dealer-busts', 'push', 'nicely-played', 'new-shoe'];
const KIT = [...n('ball-click', ...to(6)), ...n('ball-launch', 1, 2), ...n('wheelhead', 1, 2), ...n('rake', ...to(3)), ...n('dolly', 1, 2), ...n('chip-thock', ...to(5)), ...n('crowd-cheer', 1, 2), ...n('spark', ...to(4)), ...n('zap', 1, 2), ...n('thunder', 1, 2, 'mega', 'rumble'),
  'charge', 'strike', 'rain-window', 'whoosh', 'reveal-sting', 'win-bling', 'room-casino-1', ...['big', 'blackjack', 'side', 'small'].flatMap(k => n(`win-${k}`, 1, 2)),
  ...n('ui-click', 1, 2), ...['open', 'select', 'toggle'].flatMap(k => n(`ui-${k}`, ...to(4))),
  ...['james', 'sofia'].flatMap(v => BJ.map(l => `voice/${v}-bj-${l}`)), ...['place-bets', 'last-bets', 'no-more-bets', 'good-luck', 'winning-number', 'congrats', ...to(37).map(i => `n${i - 1}`)].map(l => `voice/james-${l}`)];
const WAV = [...n('card-slide', 3, 4, 7, 8), ...n('card-place', ...to(4)), ...n('card-shove', ...to(4)), 'card-fan-1', 'card-shuffle', ...n('chip-lay', ...to(3)), ...n('chips-collide', ...to(4)),
  ...n('chips-handle', 1, 3, 4, 6), ...n('chips-stack', 1, 2, 4, 5, 6), 'hael-draw'];
const FONTS = [...n('barlow-condensed-latin', '600-normal', '700-normal', '800-normal'), ...n('bodoni-moda-latin', '400-italic', '500-italic', '500-normal', '600-italic', '700-normal'),
  ...n('cinzel-latin', '600-normal', '700-normal'), ...n('inter-latin', '500-normal', '600-normal', '700-normal', '800-normal')];
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const FILES = [...['icon-192', 'icon-512', 'maskable-192', 'maskable-512', 'apple-touch-icon'].map(f => `icons/${f}.png`), ...FONTS.map(f => `src/fonts/${f}.woff2`),
  ...['back', 'felt', 'leather', 'salon', 'salon-light', 'carpet'].map(f => `assets/table/${f}.webp`), ...SUITS.flatMap(s => ['jack', 'queen', 'king'].map(r => `assets/cards/court-belt/${r}_of_${s}.webp`)),
  'assets/cards/ace_of_spades_2.webp', 'assets/roulette/macassar.webp', 'assets/roulette/salon.webp', 'assets/roulette/stone.webp', 'assets/roulette/cloth.webp', 'assets/roulette/leather.webp', 'assets/roulette/studio.webp', ...WAV.map(f => `src/sounds/${f}.wav`), ...KIT.map(f => `src/sounds/kit/${f}.mp3`)];
// (the music, 7 MB, is kept the first time it plays rather than up front)

const MEDIA_RE = /\.(mp3|wav|webp|png|jpe?g|woff2)$/i;
const ROOT = new URL('./', self.location).href;
const good = r => r && r.ok && r.status === 200 && r.type === 'basic';   // never an opaque, partial or error response
const get = url => fetch(url, { cache: 'no-cache', credentials: 'same-origin' });   // past the browser's own cache: revalidated with the server

async function fill(name, paths, skipKept) {
  const cache = await caches.open(name);
  await Promise.all(paths.map(async p => {
    const url = new URL(p, ROOT).href;
    if (skipKept && await cache.match(url)) return;
    try { const r = await get(url); if (good(r)) await cache.put(url, r); } catch { /* offline or missing: kept on first use instead */ }
  }));
}
self.addEventListener('install', e => e.waitUntil(Promise.all([fill(SHELL, CODE), fill(MEDIA, FILES, true)]).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('salon-noir-') && k !== SHELL && k !== MEDIA) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.href === self.location.href) return;   // not ours: the browser handles it
  e.respondWith(MEDIA_RE.test(url.pathname) ? media(e, url) : code(e, url));
});

// Pages and code: the network (revalidated), else the copy kept last time.
async function code(e, url) {
  const req = e.request, nav = req.mode === 'navigate', cache = await caches.open(SHELL);
  // every visit to the game is the one page, whatever its query (?nosw, ?debug): keep it once, under the folder
  const key = nav && (url.pathname === new URL(ROOT).pathname || url.href.split(/[?#]/)[0] === new URL('index.html', ROOT).href) ? ROOT : url.href.split('#')[0];
  let res = null;
  try {
    res = await get(url.href);
    if (good(res)) { if (nav && res.redirected) res = new Response(res.body, res); e.waitUntil(cache.put(key, res.clone())); return res; }
    if (res.status < 500) return res;   // a real 404 stays a 404; a server error falls back to the kept copy
  } catch { /* offline */ }
  const kept = await cache.match(key);
  if (kept) return kept;
  return res ?? Response.error();
}

// Media: the kept copy, else the network (kept for next time). A streamed track (the music) asks for byte
// ranges: those are answered by slicing the kept file, and the first time from the network while the
// whole file is fetched into the cache behind it, once.
const storing = new Map();
async function media(e, url) {
  const req = e.request, cache = await caches.open(MEDIA), key = url.href.split('#')[0];
  const kept = await cache.match(key);
  if (kept) return req.headers.has('range') ? slice(req, kept) : kept;
  if (req.headers.has('range')) {
    if (!storing.has(key)) storing.set(key, fetch(key, { credentials: 'same-origin' }).then(r => good(r) ? cache.put(key, r) : null).catch(() => {}).finally(() => storing.delete(key)));
    e.waitUntil(storing.get(key));
    return fetch(req);
  }
  const res = await fetch(req);
  if (good(res)) e.waitUntil(cache.put(key, res.clone()));
  return res;
}
// A 206 for "Range: bytes=a-b" (or "a-", or "-n") out of a whole kept file; Safari plays media only this way.
async function slice(req, whole) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range').trim()), blob = await whole.blob(), size = blob.size;
  if (!m || (m[1] === '' && m[2] === '')) return new Response(blob, { status: 200, headers: whole.headers });
  const a = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]), b = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (a > b || a >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(blob.slice(a, b + 1), { status: 206, statusText: 'Partial Content', headers: {
    'Content-Type': whole.headers.get('Content-Type') || '', 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': String(b - a + 1), 'Accept-Ranges': 'bytes' } });
}
