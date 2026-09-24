// Runtime collision and height queries for the PT Ricarten field.
//
// This module provides the hybrid collision surface that the WoC movement
// kernel queries through groundHeight (lowest walkable surface) and
// supportHeightAt (upper-level walkable surfaces within step reach).
//
// The collision source is the 42,408 CHECK_FACE triangles from village-2.smd,
// spatially indexed by the PT StageArea 256x256 grid. At query time we:
//   1. Convert WoC coordinates to PT world coordinates.
//   2. Look up the StageArea cell.
//   3. Test each walkable triangle in the cell for containment in XZ.
//   4. Interpolate Y via barycentric coordinates.
//   5. Return the lowest Y (groundHeight) or the highest Y below maxY
//      (supportHeightAt), preserving multi-level surface selection.
//
// Non-CHECK_FACE faces (water, decorative) are never queried for collision.
// They are rendered separately by src/render/pt_terrain.ts.
//
// The query math itself lives in src/sim/pt_field.ts (createPtField), bound
// to the committed Ricarten generated module and the existing pt_band
// transform in src/sim/pt_field_active.ts. These delegates keep the
// original exported surface so every caller and test resolves identically.

import { ptRicartenField } from './pt_field_active';

/**
 * The lowest walkable surface height at WoC (x, z), in WoC Y.
 * Returns -Infinity if no walkable triangle covers the point.
 *
 * This is the groundHeight for the PT Ricarten band: the dominant (lowest)
 * walkable surface. Upper-level surfaces are returned by ptRicartenSupportHeight.
 */
export function ptRicartenGroundHeight(x: number, z: number): number {
  return ptRicartenField().groundHeight(x, z);
}

/**
 * The highest walkable surface height at WoC (x, z) that is at or below
 * `maxY` (in WoC Y). Returns -Infinity if no surface qualifies.
 *
 * This is the supportHeightAt for the PT Ricarten band: upper-level walkable
 * surfaces that the movement kernel can step onto when within reach.
 * `maxY` is the player's feet height (grounded) or feet + mantle reach
 * (airborne), so a surface far above the player is never returned.
 */
export function ptRicartenSupportHeight(
  x: number,
  z: number,
  r: number,
  maxY: number,
): number {
  return ptRicartenField().supportHeight(x, z, r, maxY);
}

/**
 * The floor PT's movement would stand on at WoC (x, z) for a body whose
 * reference (feet, or feet plus a mantle/step reach) is at `refY` WoC Y:
 * the HIGHEST walkable surface strictly less than Stage_StepHeight above
 * that reference, or -Infinity when no face qualifies.
 *
 * This is smStage3d.cpp's GetFloorHeight/CheckNextMove rule verbatim. It
 * differs from the (lowest-surface, capped-support) pair in three ways that
 * matter on stacked geometry (the canal bridge, the warp gate steps):
 *  - a surface slightly ABOVE the reference still counts, so PT-legal kerb
 *    steps seat instead of being skipped over by the lowest surface;
 *  - a surface far BELOW always counts (stepping down never fails);
 *  - where nothing qualifies, the point is floorless: CheckNextMove
 *    returns NULL and the move never happens. The horizontal gate in
 *    player_motion relies on the -Infinity result for exactly that.
 */
export function ptRicartenFloorHeight(x: number, z: number, refY: number): number {
  return ptRicartenField().floorHeight(x, z, refY);
}

/**
 * PT's CheckNextMove wall test: would the swept player capsule moving from
 * WoC (sx, sz) to (ex, ez) — at feet height sy — intersect any CHECK_FACE
 * triangle? True means the move is rejected.
 *
 * Face candidates come from the same StageArea window PT uses:
 * MakeAreaFaceList(Posi-64u, Posi-64u, 128u, 128u), i.e. the 2x2 cells
 * anchored at the position minus one cell. The per-tick stride (~10u) plus
 * the 12u lookahead never leaves that window.
 */
export function ptRicartenWallHit(
  sx: number,
  sy: number,
  sz: number,
  ex: number,
  ez: number,
  destFloorY?: number,
): boolean {
  return ptRicartenField().wallHit(sx, sy, sz, ex, ez, destFloorY);
}

/**
 * Resolve the spawn Y for a PT start point: queries the walkable surface
 * at the given WoC (x, z) and returns the ground height. Falls back to
 * the second start point if the first has no walkable surface.
 */
export function ptRicartenSpawnY(x: number, z: number): number {
  return ptRicartenField().spawnY(x, z);
}

/**
 * The water surface height at WoC (x, z) in the PT Ricarten band, in WoC Y.
 * Returns -Infinity where no water-material face covers the point.
 */
export function ptRicartenWaterLevel(x: number, z: number): number {
  return ptRicartenField().waterLevel(x, z);
}
