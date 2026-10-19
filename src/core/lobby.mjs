// The Salon Noir lobby: the front room, played live. The real table sits under its pendant light
// behind the menu while the camera circles it slowly, like the opening shot of a film; each table
// you pick re-dresses it on the spot (its felt, and at Lightning the plaques and the storm), and
// "Take a seat" flies the camera down into your chair. Games still being built wait behind a
// velvet rope so the casino reads as one place from the start.
import { BRAND_TITLE, mark } from './brand.mjs';
import { wallet } from './wallet.mjs';

const fmt = n => (Math.round(n * 2) / 2).toLocaleString('en-US', { maximumFractionDigits: 1 });
const ICON = {
  classic: '<svg viewBox="0 0 24 24"><path d="M12 2.5c2.6 3.8 8.4 6.6 8.2 11-.1 3.2-3.4 4.4-6 2.5.3 2.3 1.2 4 3 5.5H6.8c1.8-1.5 2.7-3.2 3-5.5-2.6 1.9-5.9.7-6-2.5C3.6 9.1 9.4 6.3 12 2.5Z"/></svg>',
  freebet: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="6.2" class="cut"/><path d="M10.2 9h4M10.2 9v6M10.2 12h3.2" class="cut"/></svg>',
  lightning: '<svg viewBox="0 0 24 24"><path d="M13.6 2 4.8 13.4h6l-1.4 8.6 8.8-11.4h-6L13.6 2Z"/></svg>',
  roulette: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" class="ring"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v6.3M12 15.2v6.3M2.5 12h6.3M15.2 12h6.3" class="cut"/></svg>',
};
// Every table in the salon, as the rail shows them.
const TABLES = [
  { game: 'blackjack', mode: 'classic', kicker: 'Blackjack', name: 'Classic', line: 'The house game, with six side bets.', stat: 'Pays 3:2' },
  { game: 'blackjack', mode: 'freebet', kicker: 'Blackjack', name: 'Free Bet', line: 'Free doubles and splits. A dealer 22 pushes.', stat: 'Free doubles' },
  { game: 'blackjack', mode: 'lightning', kicker: 'Blackjack', name: 'Lightning', line: 'Multipliers up to 25× on your next win', stat: 'Up to 25×' },
  { game: 'roulette', mode: 'roulette', kicker: 'Roulette', name: 'European', line: 'Single zero, the racetrack and every call bet.', stat: 'Pays 35:1' },
  { game: 'roulette', mode: 'soon', kicker: 'Roulette', name: 'Lightning', line: 'Lightning and Mega Lightning. Opening next.', stat: 'Opening soon', soon: true },
];

const gameOf = mode => TABLES.find(t => t.mode === mode)?.game ?? 'blackjack';
let root, onPlay = () => {}, onChange = () => {}, onPreview = () => {}, currentMode = () => 'classic', unsub = null, isOpen = false, picked = 'classic';
function pick(mode, { preview = true } = {}) {
  const t = TABLES.find(x => x.mode === mode && !x.soon); if (!t) return;
  picked = mode; root.dataset.mode = mode;
  for (const c of root.querySelectorAll('.tcard[data-mode]')) { const on = c.dataset.mode === mode; c.setAttribute('aria-checked', on); if (on && preview) c.scrollIntoView({ inline: 'center', block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  root.querySelector('.seat .which').textContent = t.game === 'roulette' ? `${t.name} ${t.kicker}` : `${t.name} ${t.kicker}`;
  if (preview) onPreview(mode);
}
export const lobby = {
  init({ play, change, mode, preview }) {
    onPlay = play; if (change) onChange = change; if (mode) currentMode = mode; if (preview) onPreview = preview; root = document.querySelector('#lobby');
    root.innerHTML = `<div class="lobby-shade" aria-hidden="true"></div>
    <div class="lobby-inner">
      <header class="lobby-head">
        <span class="lobby-mark">${mark({ title: BRAND_TITLE })}</span>
        <h1 class="lobby-word"><small>Salon</small><span>Noir</span></h1>
        <p class="lobby-tag">Private tables · play chips only</p>
        <div class="lobby-balance wallet big"><span class="coin" aria-hidden="true"></span><div class="w-seg"><span class="k">Your chips</span><output id="lobbyBalance"></output></div></div>
      </header>
      <section class="rail" aria-label="Tables">
        <p class="rail-title">Choose your table</p>
        <div class="tcards" role="radiogroup" aria-label="Tables">${TABLES.map(t => t.soon
          ? `<div class="tcard soon" aria-disabled="true"><span class="t-ico">${ICON.lightning}</span><span class="t-kick">${t.kicker}</span><b>${t.name}</b><span class="t-line">${t.line}</span><span class="rope" aria-hidden="true"></span></div>`
          : `<button class="tcard" role="radio" data-mode="${t.mode}" aria-checked="false"><span class="t-ico">${ICON[t.game === 'roulette' ? 'roulette' : t.mode]}</span><span class="t-kick">${t.kicker}</span><b>${t.name}</b><span class="t-line">${t.line}</span><span class="t-stat">${t.stat}</span></button>`).join('')}</div>
        <button class="pill gold seat" data-play><span class="label">Take a seat</span><span class="which"></span></button>
      </section>
    </div>`;
    root.addEventListener('click', e => {
      const c = e.target.closest('.tcard[data-mode]'); if (c) { pick(c.dataset.mode); return; }
      const b = e.target.closest('[data-play]'); if (b) { this.close(); onPlay(gameOf(picked), picked); }
    });
    // arrow keys move along the rail; Enter takes the seat
    addEventListener('keydown', e => {
      if (!isOpen) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const live = TABLES.filter(t => !t.soon), i = live.findIndex(t => t.mode === picked), n = live[(i + (e.key === 'ArrowRight' ? 1 : live.length - 1)) % live.length]; pick(n.mode); root.querySelector(`.tcard[data-mode="${n.mode}"]`)?.focus({ preventScroll: true }); e.preventDefault(); }
      else if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('.tcard')) { e.preventDefault(); e.stopImmediatePropagation(); this.close(); onPlay(gameOf(picked), picked); }
    }, true);
  },
  open() {
    if (isOpen) return; isOpen = true;
    unsub = wallet.subscribe(v => { root.querySelector('#lobbyBalance').textContent = fmt(v); });
    root.hidden = false; root.classList.remove('leaving'); document.body.classList.add('in-lobby');
    pick(currentMode(), { preview: false });
    requestAnimationFrame(() => root.querySelector('.seat')?.focus({ preventScroll: true })); onChange(true);
  },
  close() {
    if (!isOpen) return; isOpen = false; unsub?.(); document.body.classList.remove('in-lobby');
    root.classList.add('leaving'); setTimeout(() => { if (!isOpen) { root.hidden = true; root.classList.remove('leaving'); } }, 700); onChange(false);
  },
  get isOpen() { return isOpen; },
};
