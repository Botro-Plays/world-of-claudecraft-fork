// Probe: find an XZ point covered by BOTH a low and a high walkable
// triangle (a true overhang), then report what the runtime queries return.
import {
  PT_GRID_SIZE,
  PT_VERTICES,
  PT_WALKABLE_FACES,
  PT_CELL_OFFSETS,
  PT_CELL_COUNTS,
  PT_CELL_FACE_INDICES,
} from '../../src/sim/pt_ricarten_field.generated';
import {
  PT_RICARTEN_MIN_Y,
  PT_SCALE,
  ptXToWoC,
  ptZToWoC,
} from '../../src/sim/pt_band';
import {
  ptRicartenGroundHeight,
  ptRicartenSupportHeight,
} from '../../src/sim/pt_ricarten_field';

const vertices = PT_VERTICES();
const walkFaces = PT_WALKABLE_FACES();
const cellOffsets = PT_CELL_OFFSETS();
const cellCounts = PT_CELL_COUNTS();
const cellFaceIndices = PT_CELL_FACE_INDICES();

function triHeight(
  wi: number, px: number, pz: number,
): number {
  const ai = walkFaces[wi * 3], bi = walkFaces[wi * 3 + 1], ci = walkFaces[wi * 3 + 2];
  const ax = vertices[ai * 3], ay = vertices[ai * 3 + 1], az = vertices[ai * 3 + 2];
  const bx = vertices[bi * 3], by = vertices[bi * 3 + 1], bz = vertices[bi * 3 + 2];
  const cx = vertices[ci * 3], cy = vertices[ci * 3 + 1], cz = vertices[ci * 3 + 2];
  const v0x = bx - ax, v0z = bz - az, v1x = cx - ax, v1z = cz - az, v2x = px - ax, v2z = pz - az;
  const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z;
  const d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
  const denom = d00 * d11 - d01 * d01;
  if (denom === 0) return -Infinity;
  const v = (d11 * d20 - d01 * d21) / denom, w = (d00 * d21 - d01 * d20) / denom, u = 1 - v - w;
  if (u < 0 || v < 0 || w < 0 || u > 1 || v > 1 || w > 1) return -Infinity;
  return u * ay + v * by + w * cy;
}

// For each cell, sample each face's centroid; at each centroid that is
// inside >=2 triangles at different heights, record the levels.
let found = 0;
const samples: { ptX: number; ptZ: number; levels: number[] }[] = [];

for (let cellIdx = 0; cellIdx < PT_GRID_SIZE * PT_GRID_SIZE && samples.length < 8; cellIdx++) {
  const offset = cellOffsets[cellIdx];
  if (offset < 0) continue;
  const count = cellCounts[cellIdx];
  if (count < 2) continue;

  // Centroid of each face as a sample point (guaranteed inside that face)
  for (let i = 0; i < count && samples.length < 8; i++) {
    const wi = cellFaceIndices[offset + i];
    const ai = walkFaces[wi * 3], bi = walkFaces[wi * 3 + 1], ci = walkFaces[wi * 3 + 2];
    const px = (vertices[ai * 3] + vertices[bi * 3] + vertices[ci * 3]) / 3;
    const pz = (vertices[ai * 3 + 2] + vertices[bi * 3 + 2] + vertices[ci * 3 + 2]) / 3;

    // Collect heights of ALL triangles in this cell containing the point
    const hits: number[] = [];
    for (let j = 0; j < count; j++) {
      const h = triHeight(cellFaceIndices[offset + j], px, pz);
      if (h !== -Infinity) hits.push(h);
    }
    // distinct levels (>100 PT units apart = a real second storey)
    const uniq = [...new Set(hits.map(h => Math.round(h)))].sort((a, b) => a - b);
    if (uniq.length >= 2 && uniq[uniq.length - 1] - uniq[0] > 100) {
      samples.push({ ptX: px, ptZ: pz, levels: uniq });
    }
  }
}

console.log(`overhang sample points found: ${samples.length}`);
for (const s of samples) {
  const wocX = ptXToWoC(s.ptX);
  const wocZ = ptZToWoC(s.ptZ);
  const gh = ptRicartenGroundHeight(wocX, wocZ);
  const ghPt = gh === -Infinity ? -Infinity : gh / PT_SCALE + PT_RICARTEN_MIN_Y;
  const lowWocY = (s.levels[0] + 5 - PT_RICARTEN_MIN_Y) * PT_SCALE;
  const highWocY = (s.levels[s.levels.length - 1] + 5 - PT_RICARTEN_MIN_Y) * PT_SCALE;
  const supLow = ptRicartenSupportHeight(wocX, wocZ, 0.5, lowWocY);
  const supHigh = ptRicartenSupportHeight(wocX, wocZ, 0.5, highWocY);
  const supLowPt = supLow === -Infinity ? -Infinity : supLow / PT_SCALE + PT_RICARTEN_MIN_Y;
  const supHighPt = supHigh === -Infinity ? -Infinity : supHigh / PT_SCALE + PT_RICARTEN_MIN_Y;
  const floorLow = Math.max(gh, supLow);
  console.log(`\npt(${s.ptX.toFixed(0)}, ${s.ptZ.toFixed(0)}) levels: ${s.levels.join(', ')}`);
  console.log(`  groundHeight      -> PT ${ghPt === -Infinity ? '-Inf' : ghPt.toFixed(1)}`);
  console.log(`  support(low maxY) -> PT ${supLowPt === -Infinity ? '-Inf' : supLowPt.toFixed(1)}`);
  console.log(`  support(high maxY)-> PT ${supHighPt === -Infinity ? '-Inf' : supHighPt.toFixed(1)}`);
  console.log(`  floorHeightAt(low player) = PT ${floorLow === -Infinity ? '-Inf' : (floorLow / PT_SCALE + PT_RICARTEN_MIN_Y).toFixed(1)}${floorLow === gh && s.levels.length > 1 && ghPt > s.levels[0] + 100 ? '  <-- PLAYER ON LOW FLOOR SNAPS TO TOP LEVEL' : ''}`);
}
