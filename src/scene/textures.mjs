// Everything that is printed, painted or inked is drawn here on canvases:
// card faces (jumbo index, as casinos and camera tables use), the card back,
// the felt layout, the betting circles and the clay chips.
import * as THREE from '../vendor/three.module.min.js';

export const INK = { red: '#c4122b', black: '#131416', ivory: '#ece4d2', brass: '#c9a45c', felt: '#2b2d2f' };
import { BRAND, SPADE, INLAY, KEYHOLE, KEYLIGHT } from '../core/brand.mjs';
import { MODES } from '../core/modes.mjs';
const RED_SUITS = new Set(['♥', '♦']);
const SUIT_NAME = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };

// ---- suits as vector paths in a 100 x 100 box ------------------------------
const SUIT_PATH = {
  '♥': new Path2D('M50 94C22 72 0 52 0 30C0 12 13 0 28 0C39 0 47 7 50 15C53 7 61 0 72 0C87 0 100 12 100 30C100 52 78 72 50 94Z'),
  '♦': new Path2D('M50 0C61 19 77 37 92 50C77 63 61 81 50 100C39 81 23 63 8 50C23 37 39 19 50 0Z'),
  '♠': new Path2D('M50 0C63 21 100 38 100 62C100 78 88 88 74 88C64 88 56 82 52 74C54 86 58 94 67 100H33C42 94 46 86 48 74C44 82 36 88 26 88C12 88 0 78 0 62C0 38 37 21 50 0Z'),
  '♣': (() => { const p = new Path2D(); for (const [x, y] of [[50, 25], [24, 58], [76, 58]]) { p.moveTo(x + 24, y); p.arc(x, y, 24, 0, Math.PI * 2); } p.rect(40, 34, 20, 26); p.moveTo(46, 60); p.bezierCurveTo(46, 82, 40, 93, 31, 100); p.lineTo(69, 100); p.bezierCurveTo(60, 93, 54, 82, 54, 60); return p; })(),
};
export function drawSuit(ctx, suit, cx, cy, size, color, rotate = 0) {
  ctx.save(); ctx.translate(cx, cy); if (rotate) ctx.rotate(rotate); const s = size / 100; ctx.scale(s, s); ctx.translate(-50, -50);
  ctx.fillStyle = color; ctx.fill(SUIT_PATH[suit]); ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texture(c, { srgb = true, aniso = 16, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ---- cards: poker size 63.5 x 88.9 mm -----------------------------------------
export const CARD_W = 6.35, CARD_H = 8.89, CARD_R = .32;
// Faces are drawn in a 512-wide frame and painted at `faceK` of that (a preset's `face`): a card on a
// phone is about 100 device pixels wide, so half size there loses nothing and saves most of the memory.
const CW = 512, CH = Math.round(512 * CARD_H / CARD_W), CR = Math.round(512 * CARD_R / CARD_W);
let faceK = 1;
const art = new Map();
// Drawn art (generated for this table; see CREDITS.md): double-headed court panels, the ace of spades,
// the card back, and the felt, leather and room images. The classic court cards in assets/cards
// (Howard Yeh, MIT: assets/cards/LICENSE.txt) stay as the fallback if a panel fails to load.
const COURT_NAMES = Object.values(SUIT_NAME).flatMap(s => ['jack', 'queen', 'king'].map(r => `${r}_of_${s}`));
export const artImage = key => art.get(key);
const load = (key, src) => new Promise(res => { const i = new Image(); i.onload = () => { art.set(key, i); res(true); }; i.onerror = () => res(false); i.src = src; });
// The table's own art is awaited before the room is built. The court panels and the ace (most of the bytes)
// are fetched once the room is on screen (loadCourtArt, after the first frame): no J, Q, K or ace of spades
// is dealt in the lobby, and a face made before they land (the card waiting in the shoe) is painted plainly
// and repainted when they do.
let courtArt = null, courtDone = false, courtLanded;
const courtReady = new Promise(r => { courtLanded = r; });
export function preloadCardArt() { return Promise.all(['back', 'felt', 'leather', 'room'].map(n => load('table:' + n, `./assets/table/${n}.webp`))); }
export function loadCourtArt() {
  return courtArt ??= Promise.all([
    ...COURT_NAMES.map(async n => { if (!await load('panel:' + n, `./assets/cards/court-belt/${n}.webp`)) await load(n, `./assets/cards/${n}.webp`); }),
    load('ace', './assets/cards/ace_of_spades_2.webp'),
  ]).then(() => { courtDone = true; courtLanded(); });
}
// Standard pip positions in a 3-column grid; y 0 top, 1 bottom.
const PIPS = {
  2: [[.5, 0], [.5, 1]], 3: [[.5, 0], [.5, .5], [.5, 1]],
  4: [[0, 0], [1, 0], [0, 1], [1, 1]], 5: [[0, 0], [1, 0], [.5, .5], [0, 1], [1, 1]],
  6: [[0, 0], [1, 0], [0, .5], [1, .5], [0, 1], [1, 1]], 7: [[0, 0], [1, 0], [.5, .25], [0, .5], [1, .5], [0, 1], [1, 1]],
  8: [[0, 0], [1, 0], [.5, .25], [0, .5], [1, .5], [.5, .75], [0, 1], [1, 1]],
  9: [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [.5, .5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
  10: [[0, 0], [1, 0], [.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [.5, 5 / 6], [0, 1], [1, 1]],
};
function drawIndex(ctx, rank, suit, color) {
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = '800 150px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  ctx.save(); ctx.translate(66, 150); if (rank === '10') { ctx.scale(.74, 1); ctx.letterSpacing = '-6px'; } ctx.fillText(rank, 0, 0); ctx.restore();
  drawSuit(ctx, suit, 66, 205, 78, color);
}
export function paintFace(card) { return texture(drawFace(canvas(1, 1), card)); }
// Paints a face onto `c` (sized here, at faceK), so a cached texture can be repainted in place.
function drawFace(c, card) {
  c.width = Math.round(CW * faceK); c.height = Math.round(CH * faceK);
  const ctx = c.getContext('2d'), color = RED_SUITS.has(card.suit) ? INK.red : INK.black; ctx.scale(faceK, faceK);
  roundRect(ctx, 0, 0, CW, CH, CR); ctx.fillStyle = '#fbfaf6'; ctx.fill(); ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 3; roundRect(ctx, 1.5, 1.5, CW - 3, CH - 3, CR); ctx.stroke();
  drawIndex(ctx, card.rank, card.suit, color);
  ctx.save(); ctx.translate(CW, CH); ctx.rotate(Math.PI); drawIndex(ctx, card.rank, card.suit, color); ctx.restore();
  const court = { J: 'jack', Q: 'queen', K: 'king' }[card.rank];
  const panel = court && art.get(`panel:${court}_of_${SUIT_NAME[card.suit]}`);
  const ace = card.rank === 'A' && card.suit === '♠' && art.get('ace');
  const img = court ? art.get(`${court}_of_${SUIT_NAME[card.suit]}`) : null;
  ctx.globalCompositeOperation = 'multiply';   // the art's white becomes the card's white
  if (panel) {
    // A double-headed panel (two halves turned about the waist, joined under a belt: the court-belt/
    // art) inside a thin suit-colour frame.
    const w = 272, h = Math.round(w * panel.height / panel.width), x = (CW - w) / 2, y = (CH - h) / 2;
    ctx.drawImage(panel, x, y, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color === INK.red ? 'rgba(179,18,46,.7)' : 'rgba(23,23,26,.72)'; ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, w, h);
  } else if (img && court) {
    // The classic (fallback) portrait inside its printed frame; the art's own small indices stay hidden.
    const sx = 44, sy = 44, sw = 246, sh = 399, w = 270, h = w * sh / sw, x = (CW - w) / 2, y = (CH - h) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    ctx.strokeStyle = color === INK.red ? 'rgba(196,18,43,.55)' : 'rgba(19,20,22,.6)'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
  } else if (ace) {
    const w = 320, h = w * ace.height / ace.width; ctx.drawImage(ace, (CW - w) / 2, (CH - h) / 2, w, h);
  } else if (card.rank === 'A') {
    drawSuit(ctx, card.suit, CW / 2, CH / 2, 190, color);
  } else if (court) {
    // its art is still on the way (or failed): a printed frame round the suit, until it arrives
    const w = 270, h = 438, x = (CW - w) / 2, y = (CH - h) / 2;
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = color; ctx.globalAlpha = .6; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h); ctx.globalAlpha = 1;
    drawSuit(ctx, card.suit, CW / 2, CH / 2, 150, color);
  } else {
    const box = { x: 168, y: 132, w: 176, h: 452 }, size = card.rank === '10' ? 60 : 66;
    for (const [px, py] of PIPS[card.rank]) drawSuit(ctx, card.suit, box.x + px * box.w, box.y + py * box.h, size, color, py > .5 ? Math.PI : 0);
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.restore(); return c;
}
export function paintBack() { return texture(drawBack(canvas(1, 1))); }
function drawBack(c) {
  const art = artImage('table:back');
  if (art) {
    // The drawn back at twice the face resolution (one texture, shared by every card): an ivory
    // border and the art inset with rounded corners.
    c.width = Math.round(CW * 2 * faceK); c.height = Math.round(CH * 2 * faceK);
    const k = 2, W = CW * k, H = CH * k, m = 20 * k, ctx = c.getContext('2d'); ctx.scale(faceK, faceK);
    roundRect(ctx, 0, 0, W, H, CR * k); ctx.fillStyle = '#f4efe2'; ctx.fill();
    ctx.save(); roundRect(ctx, m, m, W - 2 * m, H - 2 * m, CR * k * .55); ctx.clip();
    ctx.drawImage(art, m, m, W - 2 * m, H - 2 * m); ctx.restore();
    return c;
  }
  c.width = Math.round(CW * faceK); c.height = Math.round(CH * faceK);
  const ctx = c.getContext('2d'), m = 24; ctx.scale(faceK, faceK);
  roundRect(ctx, 0, 0, CW, CH, CR); ctx.fillStyle = '#f7f4ec'; ctx.fill();
  roundRect(ctx, m, m, CW - 2 * m, CH - 2 * m, CR * .6); ctx.fillStyle = '#1b1c1f'; ctx.fill(); ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(201,164,92,.28)'; ctx.lineWidth = 2;
  for (let d = -CH; d < CW + CH; d += 22) { ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + CH, CH); ctx.moveTo(d, CH); ctx.lineTo(d + CH, 0); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = INK.brass; ctx.lineWidth = 3; roundRect(ctx, m + 14, m + 14, CW - 2 * m - 28, CH - 2 * m - 28, 10); ctx.stroke();
  ctx.beginPath(); ctx.arc(CW / 2, CH / 2, 86, 0, Math.PI * 2); ctx.fillStyle = '#1b1c1f'; ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.arc(CW / 2, CH / 2, 74, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.stroke();
  drawSuit(ctx, '♠', CW / 2, CH / 2 - 4, 92, INK.brass);
  return c;
}
const faceCache = new Map();
const needsArt = card => !courtDone && (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || (card.rank === 'A' && card.suit === '♠'));
export function faceTexture(card) {
  const k = card.rank + card.suit; if (faceCache.has(k)) return faceCache.get(k);
  const t = paintFace(card); faceCache.set(k, t);
  if (needsArt(card)) courtReady.then(() => { drawFace(t.image, card); t.needsUpdate = true; artLanded(); });   // same size: an in-place upload
  return t;
}
let backTex; export const backTexture = () => backTex ??= paintBack();
// Called when court art lands on a face already dealt (the scene asks for a frame).
let artLanded = () => {}; export const onArtLanded = f => { artLanded = f; };
// A preset's card detail: every face and the back painted so far is repainted at the new size. A texture
// that changes size must be freed first (its storage is fixed); the materials keep the same objects.
export function setFaceDetail(k = 1) {
  if (k === faceK) return; faceK = k;
  for (const [key, t] of faceCache) { t.dispose(); drawFace(t.image, { rank: key.slice(0, -1), suit: key.slice(-1) }); t.needsUpdate = true; }
  if (backTex) { backTex.dispose(); drawBack(backTex.image); backTex.needsUpdate = true; }
}
// Card edges seen in a stack: paper-white with a fine line per card. Standing cards (the shoe)
// stripe across u; cards lying flat (the discard holder) stripe across v.
export function edgeTexture(standing = true) {
  const c = canvas(standing ? 256 : 64, standing ? 64 : 256), ctx = c.getContext('2d'); ctx.fillStyle = '#ebe8e1'; ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 256; i += 4) { ctx.fillStyle = `rgba(92,90,86,${.2 + Math.random() * .22})`; standing ? ctx.fillRect(i, 0, 1, 64) : ctx.fillRect(0, i, 64, 1); }
  return texture(c, { repeat: true });
}

// ---- felt: 200 x 100 cm, the dealer's straight edge at the top of the image -----
export const FELT = { w: 200, d: 100, zTop: -40 };
export function paintFelt(px = 2048, mode = MODES.classic) {
  const W = px, H = px / 2, k = W / FELT.w, c = canvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = INK.felt; ctx.fillRect(0, 0, W, H);
  const cloth = artImage('table:felt');
  if (cloth) {
    // The drawn baize, tiled: one tile covers 32 cm of cloth.
    const t = 32 * k;
    for (let y = 0; y < H; y += t) for (let x = 0; x < W; x += t) ctx.drawImage(cloth, x, y, t, t);
  } else {
    // A woven nap: fine luminance noise plus a faint diagonal twill.
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const x = p % W, y = (p / W) | 0, n = (Math.random() - .5) * 14 + (((x + y) % 6) < 3 ? 2 : -2);
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }
  const X = x => (x + FELT.w / 2) * k, Y = z => (z - FELT.zTop) * k, cx = X(0), cy = Y(FELT.zTop);
  const arcLine = (r, width, color, a0 = .16, a1 = .84) => { ctx.beginPath(); ctx.arc(cx, cy, r * k, Math.PI * a0, Math.PI * a1); ctx.strokeStyle = color; ctx.lineWidth = width * k; ctx.stroke(); };
  arcLine(52.5, .25, 'rgba(236,228,210,.8)'); arcLine(61, .25, 'rgba(236,228,210,.8)');
  // the table's own printing: its payout line, its rule line, and the line on the insurance arc
  const [lineA, lineB, lineC] = mode.felt;
  arcText(ctx, lineA, cx, cy, 44 * k, `700 ${3.4 * k}px Cinzel, Georgia, serif`, .7 * k, 'rgba(201,164,92,.95)');
  arcText(ctx, lineB, cx, cy, 49.3 * k, `700 ${lineB.length > 48 ? 1.45 * k : 1.75 * k}px Inter, system-ui, sans-serif`, (lineB.length > 48 ? .26 : .38) * k, 'rgba(236,228,210,.82)');
  arcText(ctx, lineC, cx, cy, 58.2 * k, `700 ${2.3 * k}px Inter, system-ui, sans-serif`, .6 * k, 'rgba(236,228,210,.88)');
  // Wordmark between the dealer's cards and the printing.
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(201,164,92,.9)';
  { // the Salon Noir mark: a brass spade with a lit keyhole, and the wordmark in Bodoni
    const size = 6.4 * k, x = X(0) - size / 2, y = Y(-21.4);
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
    const g = ctx.createLinearGradient(0, 0, 0, 100); g.addColorStop(0, 'rgba(243,222,166,.95)'); g.addColorStop(.45, 'rgba(201,164,92,.95)'); g.addColorStop(1, 'rgba(141,106,48,.95)');
    ctx.fillStyle = g; ctx.fill(new Path2D(SPADE));
    ctx.strokeStyle = 'rgba(12,11,10,.4)'; ctx.lineWidth = 1.2; ctx.stroke(new Path2D(INLAY));
    ctx.fillStyle = '#16140f'; ctx.fill(new Path2D(KEYHOLE));
    const l = ctx.createRadialGradient(50, 47, 0, 50, 50, 14); l.addColorStop(0, 'rgba(255,240,200,.95)'); l.addColorStop(.5, 'rgba(255,190,90,.9)'); l.addColorStop(1, 'rgba(170,90,25,.85)');
    ctx.fillStyle = l; ctx.fill(new Path2D(KEYLIGHT));
    ctx.restore();
    ctx.fillStyle = 'rgba(236,228,210,.92)'; ctx.textBaseline = 'alphabetic';
    const a = `500 ${4.6 * k}px "Bodoni Moda", Georgia, serif`, b = `italic 600 ${4.6 * k}px "Bodoni Moda", Georgia, serif`;
    ctx.font = a; const wa = ctx.measureText('Salon ').width; ctx.font = b; const wb = ctx.measureText('Noir').width;
    const x0 = X(0) - (wa + wb) / 2, yb = Y(-9.2);
    ctx.textAlign = 'left'; ctx.font = a; ctx.fillText('Salon ', x0, yb); ctx.font = b; ctx.fillStyle = 'rgba(226,196,131,.95)'; ctx.fillText('Noir', x0 + wa, yb);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  }
  ctx.font = `700 ${1.4 * k}px Inter, system-ui, sans-serif`; ctx.letterSpacing = `${.8 * k}px`; ctx.fillStyle = mode.id === 'classic' ? 'rgba(236,228,210,.62)' : 'rgba(226,196,131,.85)'; ctx.fillText(mode.title, X(0) + .4 * k, Y(-5.6));
  ctx.letterSpacing = '0px';
  const t = texture(c, { aniso: 16 }); return t;
}
// Letters sit on the arc with their tops toward the dealer, reading left to right from the seat.
function arcText(ctx, text, cx, cy, r, font, spacing, color) {
  ctx.save(); ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const widths = [...text].map(ch => ctx.measureText(ch).width + spacing), total = widths.reduce((a, b) => a + b, 0) - spacing;
  let a = Math.PI / 2 + total / r / 2;
  [...text].forEach((ch, i) => {
    const w = widths[i] - spacing, mid = a - w / 2 / r;
    ctx.save(); ctx.translate(cx + r * Math.cos(mid), cy + r * Math.sin(mid)); ctx.rotate(mid - Math.PI / 2); ctx.fillText(ch, 0, 0); ctx.restore();
    a -= widths[i] / r;
  });
  ctx.restore();
}

// ---- betting circles ---------------------------------------------------------
export function paintSpot(spec) {
  const S = 512, c = canvas(S, S), ctx = c.getContext('2d'), m = S / 2;
  const ring = (r, w, col) => { ctx.beginPath(); ctx.arc(m, m, r, 0, Math.PI * 2); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); };
  if (spec.main) {
    ctx.beginPath(); ctx.arc(m, m, 246, 0, Math.PI * 2); ctx.fillStyle = 'rgba(12,12,13,.22)'; ctx.fill();
    ring(244, 7, 'rgba(201,164,92,.95)'); ring(222, 2.5, 'rgba(201,164,92,.7)');
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; ctx.beginPath(); ctx.arc(m + Math.cos(a) * 233, m + Math.sin(a) * 233, 2.4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(201,164,92,.55)'; ctx.fill(); }
    ctx.fillStyle = 'rgba(236,228,210,.5)'; ctx.font = '700 44px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.letterSpacing = '10px';
    ctx.fillText('BET', m + 5, m); ctx.letterSpacing = '0px';
  } else {
    // Side circles are small, so they carry only the name; payouts live in the side-bet tray.
    ctx.beginPath(); ctx.arc(m, m, 246, 0, Math.PI * 2); ctx.fillStyle = 'rgba(12,12,13,.34)'; ctx.fill();
    ring(240, 9, 'rgba(236,228,210,.8)'); ring(206, 3, 'rgba(201,164,92,.6)');
    ctx.fillStyle = 'rgba(236,228,210,.94)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = spec.short.split('\n'), size = lines.length > 1 ? 96 : spec.short.length > 5 ? 100 : 132;
    ctx.font = `800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; ctx.letterSpacing = '3px';
    lines.forEach((l, i) => ctx.fillText(l.toUpperCase(), m + 1.5, m + 6 + (i - (lines.length - 1) / 2) * size * .9));
    ctx.letterSpacing = '0px';
  }
  return texture(c);
}

// ---- side-bet medallions -----------------------------------------------------------------
// Raised discs with their own emblem, the name round the top and the top payout round the
// bottom - the way live tables print their side bets, in Spader's charcoal and brass.
function curved(ctx, text, m, r, top, font, color, spacing = 0) {
  ctx.save(); ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = [...text].map(ch => ctx.measureText(ch).width + spacing), total = w.reduce((a, b) => a + b, 0) - spacing;
  let a = top ? -Math.PI / 2 - total / r / 2 : Math.PI / 2 + total / r / 2;
  [...text].forEach((ch, i) => {
    const half = (w[i] - spacing) / 2 / r, mid = top ? a + half : a - half;
    ctx.save(); ctx.translate(m + Math.cos(mid) * r, m + Math.sin(mid) * r); ctx.rotate(top ? mid + Math.PI / 2 : mid - Math.PI / 2); ctx.fillText(ch, 0, 0); ctx.restore();
    a = top ? a + w[i] / r : a - w[i] / r;
  });
  ctx.restore();
}
const GOLD = (ctx, y0, y1) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#f0d79a'); g.addColorStop(.5, '#c9a45c'); g.addColorStop(1, '#8d7038'); return g; };
function miniCard(ctx, x, y, rot, suit, rank, w = 74) {
  const h = w * 1.4; ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  roundRect(ctx, -w / 2, -h / 2, w, h, w * .1); ctx.fillStyle = '#f3eee2'; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2; ctx.strokeStyle = '#b8954f'; ctx.stroke();
  const col = RED_SUITS.has(suit) ? INK.red : INK.black;
  ctx.fillStyle = col; ctx.font = `800 ${w * .34}px "Barlow Condensed", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(rank, -w * .27, -h * .33); drawSuit(ctx, suit, 0, h * .06, w * .5, col);
  ctx.restore();
}
const EMBLEM = {
  buster(ctx, m) {   // the dealer's hand bursting
    ctx.save(); ctx.translate(m, m + 6); ctx.beginPath();
    for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 58 : (i % 4 ? 96 : 116); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fillStyle = GOLD(ctx, -110, 110); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 54, 0, Math.PI * 2); ctx.fillStyle = '#17171a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#f0d79a'; ctx.stroke();
    ctx.fillStyle = '#f3eee2'; ctx.font = '800 58px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('22+', 2, 4);
    ctx.restore();
  },
  top3(ctx, m) {     // three of a kind under a crown
    miniCard(ctx, m - 46, m + 22, -.28, '♦', 'K', 70); miniCard(ctx, m + 46, m + 22, .28, '♣', 'K', 70); miniCard(ctx, m, m + 12, 0, '♥', 'K', 74);
    ctx.save(); ctx.translate(m, m - 78); ctx.beginPath();
    ctx.moveTo(-44, 22); ctx.lineTo(-50, -16); ctx.lineTo(-22, 4); ctx.lineTo(0, -26); ctx.lineTo(22, 4); ctx.lineTo(50, -16); ctx.lineTo(44, 22); ctx.closePath();
    ctx.fillStyle = GOLD(ctx, -26, 22); ctx.fill(); ctx.restore();
  },
  lucky(ctx, m) {    // a clover of four hearts over a seven
    ctx.save(); ctx.translate(m, m - 4);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; drawSuit(ctx, '♥', Math.cos(a) * 56, Math.sin(a) * 56, 118, i % 2 ? '#2f8a55' : '#3fa36a', a - Math.PI / 2 + Math.PI); }
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fillStyle = '#17171a'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#f0d79a'; ctx.stroke();
    ctx.fillStyle = GOLD(ctx, -30, 30); ctx.font = '800 66px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('7', 1, 3);
    ctx.restore();
  },
  pairs(ctx, m) { miniCard(ctx, m - 30, m + 6, -.2, '♠', 'A', 88); miniCard(ctx, m + 30, m + 6, .2, '♠', 'A', 88); },
  p213(ctx, m) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 120px "Barlow Condensed", sans-serif'; ctx.fillStyle = GOLD(ctx, m - 60, m + 40); ctx.fillText('21', m - 30, m - 14);
    ctx.font = '800 84px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#f3eee2'; ctx.fillText('+3', m + 62, m - 6);
    ['♥', '♠', '♦'].forEach((su, i) => drawSuit(ctx, su, m - 48 + i * 48, m + 76, 34, RED_SUITS.has(su) ? '#d8454f' : '#f3eee2'));
    ctx.restore();
  },
  push22(ctx, m) {   // the dealer's 22, with the push arrows under it
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 150px "Barlow Condensed", sans-serif'; ctx.fillStyle = GOLD(ctx, m - 80, m + 40); ctx.fillText('22', m, m - 16);
    ctx.strokeStyle = '#f3eee2'; ctx.fillStyle = '#f3eee2'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    for (const [y, dir] of [[m + 70, 1], [m + 100, -1]]) {
      ctx.beginPath(); ctx.moveTo(m - 52, y); ctx.lineTo(m + 52, y); ctx.stroke();
      const tip = m + 60 * dir; ctx.beginPath(); ctx.moveTo(tip, y); ctx.lineTo(tip - 20 * dir, y - 14); ctx.lineTo(tip - 20 * dir, y + 14); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },
  dpairs(ctx, m) {   // a pair with the dealer button
    miniCard(ctx, m - 28, m + 8, -.2, '♥', 'Q', 82); miniCard(ctx, m + 28, m + 8, .2, '♦', 'Q', 82);
    ctx.save(); ctx.translate(m + 58, m - 58); ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fillStyle = '#f3eee2'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#8d7038'; ctx.stroke();
    ctx.fillStyle = '#17171a'; ctx.font = '800 38px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('D', 0, 2); ctx.restore();
  },
};
const medallions = new Map();
export function medallionCanvas(spec) {
  if (medallions.has(spec.id)) return medallions.get(spec.id);
  const S = 512, c = canvas(S, S), ctx = c.getContext('2d'), m = S / 2;
  const g = ctx.createRadialGradient(m, m * .8, 20, m, m, m); g.addColorStop(0, '#2c2c31'); g.addColorStop(1, '#121214');
  ctx.beginPath(); ctx.arc(m, m, m, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.arc(m, m, m - 7, 0, Math.PI * 2); ctx.lineWidth = 12; ctx.strokeStyle = GOLD(ctx, 0, S); ctx.stroke();
  ctx.beginPath(); ctx.arc(m, m, 168, 0, Math.PI * 2); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(201,164,92,.55)'; ctx.stroke();
  curved(ctx, spec.name.toUpperCase().replace('BLACKJACK', '').trim(), m, 206, true, '800 58px "Barlow Condensed", sans-serif', '#f3eee2', 4);
  curved(ctx, `${Math.max(...spec.table.map(r => r[1]))}:1`, m, 208, false, '800 46px "Barlow Condensed", sans-serif', '#d9b86c', 3);
  ctx.save(); ctx.beginPath(); ctx.arc(m, m, 166, 0, Math.PI * 2); ctx.clip(); ctx.translate(m, m + 4); ctx.scale(1.18, 1.18); ctx.translate(-m, -m); EMBLEM[spec.id]?.(ctx, m); ctx.restore();
  medallions.set(spec.id, c); return c;
}
export const medallionTexture = spec => texture(medallionCanvas(spec), { aniso: 8 });
// The recessed band the medallions sit in: an arc hugging the main circle (drawn from above,
// 1 px = 1 mm), darker than the cloth with a soft inner shadow and a brass edge.
export function paintBand({ w, h, cx, cy, r0, r1 }) {
  const k = 10, c = canvas(w * k, h * k), ctx = c.getContext('2d'), X = cx * k, Y = cy * k;
  const band = () => { ctx.beginPath(); ctx.arc(X, Y, r1 * k, Math.PI, 0); ctx.arc(X + (r0 + r1) / 2 * k, Y, (r1 - r0) / 2 * k, 0, Math.PI); ctx.arc(X, Y, r0 * k, 0, Math.PI, true); ctx.arc(X - (r0 + r1) / 2 * k, Y, (r1 - r0) / 2 * k, 0, Math.PI); ctx.closePath(); };
  band(); ctx.fillStyle = 'rgba(6,6,7,.5)'; ctx.fill();
  ctx.save(); band(); ctx.clip(); ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 24; ctx.lineWidth = 30; ctx.strokeStyle = 'rgba(0,0,0,.6)'; band(); ctx.stroke(); ctx.restore();
  band(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(201,164,92,.75)'; ctx.stroke();
  return texture(c, { aniso: 16 });
}

// ---- chips: 39 mm, 10 g clay --------------------------------------------------
// Anatomy of a casino chip: coloured clay body; edge spots (inserts) that run over the
// rim onto both faces; a moulded ring pressed into the clay; a printed inlay in the
// centre with the value. Colours are the casino standard, deepened for the charcoal felt.
export const CHIP_R = 1.95, CHIP_H = .34, CHIP_SPOTS = 6;
export const CHIP_STYLE = {
  0.5: { base: '#8c8781', spot: ['#f1ece0', '#5a5650'], text: '#3f3c38' },   // the half chip, for 3:2 on odd bets
  1: { base: '#e9e3d5', spot: ['#2c5aa8', '#e9e3d5'], text: '#23519a', mould: '#d9d1bf' },
  5: { base: '#b01f2c', spot: ['#f3eee2', '#1f4d9a'], text: '#a61e29' },
  10: { base: '#1f4d98', spot: ['#f3eee2', '#e2b53f'], text: '#1e4b93' },
  25: { base: '#1b6b3f', spot: ['#f3eee2', '#d23a3a'], text: '#1c6a3e' },
  50: { base: '#d8731f', spot: ['#f3eee2', '#1b5b3a'], text: '#b35a12' },
  100: { base: '#1a1a1c', spot: ['#f3eee2', '#c9a45c'], text: '#19191b' },
  500: { base: '#5b2a8a', spot: ['#f3eee2', '#e2b53f'], text: '#5a2987' },
  1000: { base: '#d9a62a', spot: ['#1d1d1f', '#f3eee2'], text: '#7c5a0c' },
};
export const chipStyle = v => CHIP_STYLE[v] ?? { base: '#8a8580', spot: ['#f1ece0', '#4b4844'], text: '#4b4844' };
const chipLabel = v => v >= 1000 ? `${v / 1000}K` : v < 1 ? '½' : String(v);
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c + (k > 0 ? (255 - c) * k : c * k)))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
// One edge spot: three bars, outer colour / accent / outer colour.
function spotBars(ctx, st, x, w, y, h, horizontal = true) {
  const [a, b] = st.spot, parts = [[0, .36, a], [.36, .28, b], [.64, .36, a]];
  for (const [o, l, col] of parts) { ctx.fillStyle = col; if (horizontal) ctx.fillRect(x + o * w, y, l * w + .5, h); else ctx.fillRect(x, y + o * h, w, l * h + .5); }
}
const chipTop = new Map(), chipSide = new Map(), chipBump = new Map();
export function chipFaceTexture(v) {
  if (chipTop.has(v)) return chipTop.get(v);
  const S = 512, c = canvas(S, S), ctx = c.getContext('2d'), m = S / 2, st = chipStyle(v), label = chipLabel(v);
  // clay body with a faint radial sheen
  const g = ctx.createRadialGradient(m * .8, m * .7, 20, m, m, m); g.addColorStop(0, shade(st.base, .1)); g.addColorStop(1, shade(st.base, -.08));
  ctx.beginPath(); ctx.arc(m, m, m, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  // edge spots, running in from the rim
  for (let i = 0; i < CHIP_SPOTS; i++) { ctx.save(); ctx.translate(m, m); ctx.rotate(i / CHIP_SPOTS * Math.PI * 2); spotBars(ctx, st, -30, 60, -m, 50); ctx.restore(); }
  // moulded ring: suits pressed into the clay between the spots
  ctx.fillStyle = st.mould ?? shade(st.base, .16);
  for (let i = 0; i < CHIP_SPOTS * 3; i++) {
    if (i % 3 === 0) continue;
    const a = i / (CHIP_SPOTS * 3) * Math.PI * 2; drawSuit(ctx, '♠♥♣♦'[i % 4], m + Math.cos(a) * 186, m + Math.sin(a) * 186, 34, st.mould ?? shade(st.base, .18), a + Math.PI / 2);
  }
  ctx.beginPath(); ctx.arc(m, m, 204, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = shade(st.base, -.22); ctx.stroke();
  ctx.beginPath(); ctx.arc(m, m, 168, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = shade(st.base, -.22); ctx.stroke();
  // printed inlay
  const ig = ctx.createRadialGradient(m, m - 40, 10, m, m, 160); ig.addColorStop(0, '#f8f4ea'); ig.addColorStop(1, '#e6dfcf');
  ctx.beginPath(); ctx.arc(m, m, 158, 0, Math.PI * 2); ctx.fillStyle = ig; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#b8954f'; ctx.stroke();
  ctx.beginPath(); ctx.arc(m, m, 142, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = st.text; ctx.stroke();
  ctx.fillStyle = st.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${label.length > 2 ? 132 : label.length > 1 ? 160 : 176}px "Barlow Condensed", "Arial Narrow", sans-serif`; ctx.fillText(label, m, m + 8);
  ctx.font = '700 18px Inter, system-ui, sans-serif'; ctx.letterSpacing = '4px'; ctx.fillStyle = shade(st.text, .15);
  ctx.fillText(BRAND, m + 2, m - 98); ctx.letterSpacing = '0px';
  { const sz = 34; ctx.save(); ctx.translate(m - sz / 2, m + 104 - sz / 2); ctx.scale(sz / 100, sz / 100); ctx.fillStyle = '#b8954f'; ctx.fill(new Path2D(SPADE)); ctx.fillStyle = '#f3eee2'; ctx.fill(new Path2D(KEYHOLE)); ctx.restore(); }   // the house mark
  const t = texture(c); chipTop.set(v, t); return t;
}
// The chip's face as a small picture for the chip row (shown at about 50 CSS px): a 160 px copy encodes in
// a tenth of the time of the full face.
export function chipIcon(v, px = 160) { const c = canvas(px, px); c.getContext('2d').drawImage(chipFaceTexture(v).image, 0, 0, px, px); return c.toDataURL('image/png'); }
// Height map for the face: spots flush, mould ring raised, inlay slightly recessed.
export function chipBumpTexture(v) {
  if (chipBump.has(v)) return chipBump.get(v);
  const S = 256, c = canvas(S, S), ctx = c.getContext('2d'), m = S / 2, k = S / 512;
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#9a9a9a';
  for (let i = 0; i < CHIP_SPOTS * 3; i++) { if (i % 3 === 0) continue; const a = i / (CHIP_SPOTS * 3) * Math.PI * 2; drawSuit(ctx, '♠♥♣♦'[i % 4], m + Math.cos(a) * 186 * k, m + Math.sin(a) * 186 * k, 34 * k, '#a8a8a8', a + Math.PI / 2); }
  for (const r of [204, 168]) { ctx.beginPath(); ctx.arc(m, m, r * k, 0, Math.PI * 2); ctx.lineWidth = 3 * k; ctx.strokeStyle = '#5a5a5a'; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(m, m, 158 * k, 0, Math.PI * 2); ctx.fillStyle = '#707070'; ctx.fill(); ctx.lineWidth = 4 * k; ctx.strokeStyle = '#8c8c8c'; ctx.stroke();
  const t = new THREE.CanvasTexture(c); chipBump.set(v, t); return t;
}
// The rim: u runs once round the chip, v across its thickness. Spots line up with the face.
export function chipEdgeTexture(v) {
  if (chipSide.has(v)) return chipSide.get(v);
  const W = 1024, H = 64, c = canvas(W, H), ctx = c.getContext('2d'), st = chipStyle(v);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, shade(st.base, -.25)); g.addColorStop(.18, st.base); g.addColorStop(.82, st.base); g.addColorStop(1, shade(st.base, -.25));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // face angle a sits at u = a / 2pi; the face draws spot i centred at angle i*60deg - 90deg
  for (let i = 0; i < CHIP_SPOTS; i++) {
    let u = ((i / CHIP_SPOTS) - .25 + 1) % 1; const w = W * (60 / (2 * Math.PI * 256)) * 1.02;
    for (const x of [u * W - w / 2, u * W - w / 2 - W, u * W - w / 2 + W]) spotBars(ctx, st, x, w, 0, H);
  }
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(0, 0, W, 3); ctx.fillRect(0, H - 3, W, 3);
  const t = texture(c); t.wrapS = THREE.RepeatWrapping; chipSide.set(v, t); return t;
}

// A free-bet marker ("lammer"): a brass-rimmed disc the house puts down in place of chips.
let markerTex;
export function markerFaceTexture() {
  if (markerTex) return markerTex;
  const S = 256, c = canvas(S, S), ctx = c.getContext('2d'), m = S / 2;
  const g = ctx.createRadialGradient(m, m * .8, 10, m, m, m); g.addColorStop(0, '#f6d777'); g.addColorStop(1, '#c79a2e');
  ctx.beginPath(); ctx.arc(m, m, m, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.arc(m, m, m - 10, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = '#17130b'; ctx.stroke();
  ctx.fillStyle = '#17130b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '800 92px "Barlow Condensed", sans-serif'; ctx.fillText('FREE', m, m - 16);
  ctx.font = '800 44px "Barlow Condensed", sans-serif'; ctx.letterSpacing = '6px'; ctx.fillText('BET', m + 3, m + 50); ctx.letterSpacing = '0px';
  return markerTex = texture(c, { aniso: 8 });
}
