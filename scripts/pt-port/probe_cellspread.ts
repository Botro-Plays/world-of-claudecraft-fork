import { PT_GRID_SIZE, PT_VERTICES, PT_WALKABLE_FACES, PT_CELL_OFFSETS, PT_CELL_COUNTS, PT_CELL_FACE_INDICES } from '../../src/sim/pt_ricarten_field.generated';
const V = PT_VERTICES(), W = PT_WALKABLE_FACES(), O = PT_CELL_OFFSETS(), C = PT_CELL_COUNTS(), F = PT_CELL_FACE_INDICES();
let cells = 0, deep = 0, widest = 0;
const spreads: number[] = [];
for (let ci = 0; ci < PT_GRID_SIZE * PT_GRID_SIZE; ci++) {
  const off = O[ci]; if (off < 0) continue; const n = C[ci]; cells++;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const wi = F[off + i];
    const a = W[wi * 3], b = W[wi * 3 + 1], c = W[wi * 3 + 2];
    const y = (V[a * 3 + 1] + V[b * 3 + 1] + V[c * 3 + 1]) / 3;
    if (y < lo) lo = y; if (y > hi) hi = y;
  }
  const spread = hi - lo;
  spreads.push(spread);
  if (spread > widest) widest = spread;
  if (spread > 200) deep++;
}
console.log('nonempty cells:', cells, '| cells with >200 PT-unit spread:', deep, '| widest:', widest.toFixed(1));
