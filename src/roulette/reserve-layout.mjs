// A player's bank is counted in twenty-chip columns beside their seat, with a small break every five.
// The narrow foot rail on a phone uses two columns across; the long rail can use the full seat width.
// No bank is trimmed to fit: an unusual amount can extend its tray away from the betting cloth.
export function reserveLayout(count, { orient = 'land', center = 0, edge = 0, span = 28, base = 9.2, radius = 1.95, height = .34 } = {}) {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('A reserve needs a nonnegative safe chip count.');
  if (!['land', 'port'].includes(orient) || ![center, edge, span, base, radius, height].every(Number.isFinite) || span <= 0 || radius <= 0 || height <= 0) throw new RangeError('A reserve needs a valid seat and positive chip dimensions.');
  if (!count) return { positions: [], columns: 0, across: 0, rows: 0, footprint: null };
  const pitch = radius * 2 + .3, padding = .3, columns = Math.ceil(count / 20);
  const across = Math.min(columns, Math.max(1, Math.floor((span - padding * 2) / pitch))), rows = Math.ceil(columns / across);
  const positions = Array.from({ length: count }, (_, index) => {
    const column = Math.floor(index / 20), row = index % 20;
    const along = center + (column % across - (across - 1) / 2) * pitch, out = edge + padding + radius + Math.floor(column / across) * pitch;
    return { x: orient === 'land' ? along : out, y: base + (row + .5) * height + Math.floor(row / 5) * .05, z: orient === 'land' ? out : along, column, row };
  });
  const a0 = center - (across - 1) * pitch / 2 - radius - padding, a1 = center + (across - 1) * pitch / 2 + radius + padding;
  const b0 = edge, b1 = edge + padding * 2 + radius * 2 + (rows - 1) * pitch, highest = Math.min(20, count);
  const footprint = {
    x0: orient === 'land' ? a0 : b0, x1: orient === 'land' ? a1 : b1,
    z0: orient === 'land' ? b0 : a0, z1: orient === 'land' ? b1 : a1,
    y0: base - .35, y1: base + highest * height + Math.floor((highest - 1) / 5) * .05,
  };
  return { positions, columns, across, rows, footprint };
}
