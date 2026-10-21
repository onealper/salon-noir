// The side-bet tray's icons (blackjack: see paintTile in controller.mjs).
// The tray has its own flat line icons, one colour per bet, so each reads at a glance apart from the felt art.
// Side-bet icons, drawn for these bets: each is a line drawing with a soft tint fill (duotone),
// in the bet's own colour, echoing the medallion printed for it on the felt.
const T = 'fill="currentColor" fill-opacity=".22"', SOLID = 'fill="currentColor" stroke="none"';
const leaf = r => `<path transform="rotate(${r} 12 11)" ${T} d="M12 11C10.8 10 7.6 7.9 7.6 5.3a2.2 2.2 0 0 1 4.4-1 2.2 2.2 0 0 1 4.4 1c0 2.6-3.2 4.7-4.4 5.7Z"/>`;
const pip = (x, y, k = 1) => `<path ${SOLID} transform="translate(${x} ${y}) scale(${k})" d="M0-2.6C-1.2-1.3-2.5-.4-2.5.8a1.3 1.3 0 0 0 2.2 1L-.7 3h1.4L.3 1.8a1.3 1.3 0 0 0 2.2-1C2.5-.4 1.2-1.3 0-2.6Z"/>`;
const card = (x, y, r, cx, cy) => `<rect x="${x}" y="${y}" width="8.6" height="12.4" rx="1.6" transform="rotate(${r} ${cx} ${cy})" ${T}/>`;
export const TRAY_ICONS = {
  lucky:  { c: '#86c98f', svg: `${leaf(0)}${leaf(90)}${leaf(180)}${leaf(270)}<path d="M12.6 12.4c1.3 2.4 2.4 5 2.8 8.3"/>` },
  pairs:  { c: '#ec9f93', svg: `${card(3.2, 5.6, -12, 7.5, 11.8)}${pip(7.4, 11.4, .9)}${card(11.4, 5.6, 12, 15.7, 11.8)}${pip(15.8, 11.6, .9)}` },
  top3:   { c: '#e7c67f', svg: `<path ${T} d="M4.5 16.5 3.5 8l4.6 3.4L12 5l3.9 6.4L20.5 8l-1 8.5Z"/><path d="M5 19.5h14"/><circle cx="3.5" cy="7.2" r="1.2" ${SOLID}/><circle cx="12" cy="4.2" r="1.2" ${SOLID}/><circle cx="20.5" cy="7.2" r="1.2" ${SOLID}/>` },
  p213:   { c: '#8fb6ea', svg: `<rect x="2.5" y="4.5" width="19" height="15" rx="3.5" ${T}/><text x="10" y="15.6" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="10" ${SOLID}>21</text><text x="16.6" y="12.2" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="6.4" ${SOLID}>+3</text>` },
  buster: { c: '#f0a865', svg: `<path ${T} d="M12.0 1.8L14.0 5.7L18.0 3.7L17.3 8.1L21.7 8.8L18.6 12.0L21.7 15.2L17.3 15.9L18.0 20.3L14.0 18.3L12.0 22.2L10.0 18.3L6.0 20.3L6.7 15.9L2.3 15.2L5.4 12.0L2.3 8.8L6.7 8.1L6.0 3.7L10.0 5.7Z"/><text x="12" y="14.6" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="7.4" ${SOLID}>22</text>` },
  push22: { c: '#7fd0c4', svg: `<rect x="2.5" y="4.5" width="19" height="15" rx="3.5" ${T}/><text x="12" y="13.6" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="9.6" ${SOLID}>22</text><path d="M7 16.4h10M15.4 15l1.6 1.4-1.6 1.4"/>` },
  dpairs: { c: '#bca2ee', svg: `${card(2.6, 6.4, -10, 6.9, 12.6)}<path ${SOLID} d="M7.1 10.6l1.5 2-1.5 2-1.5-2Z"/>${card(9.4, 6.4, 8, 13.7, 12.6)}<path ${SOLID} d="M13.8 11l1.5 2-1.5 2-1.5-2Z"/><circle cx="18.2" cy="6.2" r="3.9" fill="currentColor" stroke="none"/><text x="18.2" y="8.35" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="6.2" fill="#141416" stroke="none">D</text>` },
};
