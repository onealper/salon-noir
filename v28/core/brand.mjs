// Salon Noir: the casino's name and mark, shared by every game.
export const BRAND = 'SALON NOIR';
export const BRAND_TITLE = 'Salon Noir';
// The mark: a brass spade that is also a door into the salon - a keyhole cut through it, lit warm
// from the room behind. Paths live in a 100 x 100 box so the felt can paint the same shape.
export const SPADE = 'M50 5C61 21 91 36 90 60C89 75 74 81 61 72C59 70.5 57 68.5 55.5 66.5C56.5 77 60.5 86 69 93H31C39.5 86 43.5 77 44.5 66.5C43 68.5 41 70.5 39 72C26 81 11 75 10 60C9 36 39 21 50 5Z';
export const INLAY = 'M50 13C60 27 84 40 83.5 59.5C83 70 72.5 74.5 63 67.5C60.5 65.5 57.5 62.5 55.8 60M50 13C40 27 16 40 16.5 59.5C17 70 27.5 74.5 37 67.5C39.5 65.5 42.5 62.5 44.2 60';
export const KEYHOLE = 'M55.4 50.6A9 9 0 1 0 44.6 50.6L41.8 66H58.2Z';
export const KEYLIGHT = 'M54.1 50.2A7.3 7.3 0 1 0 45.9 50.2L43.6 64.4H56.4Z';
let uid = 0;
export function mark({ title = '', glow = true } = {}) {
  const i = ++uid, g = `snG${i}`, l = `snL${i}`;
  return `<svg viewBox="0 0 100 100" role="${title ? 'img' : 'presentation'}"${title ? ` aria-label="${title}"` : ' aria-hidden="true"'}>`
    + `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3dea6"/><stop offset=".45" stop-color="#c9a45c"/><stop offset="1" stop-color="#8d6a30"/></linearGradient>`
    + `<radialGradient id="${l}" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#fff6d8"/><stop offset=".45" stop-color="#ffc766"/><stop offset="1" stop-color="#b3601a"/></radialGradient></defs>`
    + `<path fill="url(#${g})" d="${SPADE}"/><path fill="none" stroke="#0c0b0a" stroke-opacity=".45" stroke-width="1.1" d="${INLAY}"/>`
    + `<path fill="#0c0b0a" d="${KEYHOLE}"/>${glow ? `<path class="keylight" fill="url(#${l})" d="${KEYLIGHT}"/>` : ''}</svg>`;
}
// Kept for callers of the old name.
export const monogram = mark;
// The wordmark: "Salon" in a Didone roman, "Noir" in its italic, in brass.
export const wordmark = (cls = '') => `<span class="wordmark ${cls}"><span>Salon</span> <i>Noir</i></span>`;
