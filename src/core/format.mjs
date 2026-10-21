// Chip amounts as the salon writes them: to the half chip, with thousands grouped; a net with its sign. No DOM.
export const fmt = n => (Math.round(n * 2) / 2).toLocaleString('en-US', { maximumFractionDigits: 1 });
export const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n));
// text into HTML
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
