// PT (Priston Tale) world band placement and coordinate transform.
//
// PT maps live in an isolated X band far past every existing WoC band
// (overworld strip, dungeons, arena, delve, rift, yumi maze, battleground).
// The band is descriptor-driven so future PT maps can reuse the same system
// without hard-coding coordinate transforms across unrelated files.
//
// PT SMD coordinates are fixed-point integers divided by fONE=256 to get
// world units. The ASE axis swap (X->X, Y->Z, Z->Y) is already baked into
// the SMD, so we do NOT re-swap. We subtract the map's min bounds to get
// local coordinates, then scale into WoC yards and offset into the band.
//
// Orientation: PT is a DirectX left-handed world (north=+Z, east=+X, per
// FullZoomMap's minimap projection and MoveAngle2's facing math). WoC is a
// Three.js right-handed world whose compass reads north=+Z, east=-X
// (minimap_markers draws +X as map-left). A verbatim copy therefore renders
// the map mirrored east-west, so ptXToWoC inverts X about the band: PT +X
// (east) lands at WoC -X (east). Z maps 1:1 because both games agree on
// north=+Z. PT facing angle t maps to WoC facing -t under this mirror; the
// Ricarten spawn facing (pi, toward town at -Z) is unaffected.
//
// Scale: 1 PT world unit = PT_SCALE WoC yards. The calibration anchor is
// the PT character itself: the posed Tempskron character models measure
// ~70-75 PT world units tall (GLB assembler writes v/FONE, preserving PT
// units). WoC renders humanoids at HUMANOID_H ~= 2.6 yd, so
// 2.6 / 72 ~= 0.036 keeps the character-to-map proportion identical to
// the original game (~1:126 char heights across Ricarten). PT's 10-unit
// step height becomes 0.36 yd, still under the movement kernel's 0.9 yd
// step allowance, so stairs and slopes remain navigable.

import { INSTANCE_X_BASE } from './data';

// Band placement: east of the battleground band (which ends at
// INSTANCE_X_BASE + 34_000). 4000 yards wide, enough for any PT town map
// at PT_SCALE (Ricarten is ~330 yd across).
export const PT_BAND_X_MIN = INSTANCE_X_BASE + 40_000;
export const PT_BAND_X_MAX = INSTANCE_X_BASE + 44_000;
export const PT_BAND_Z = 0;

// 1 PT world unit = 0.036 WoC yards (see the scale note in the header).
export const PT_SCALE = 0.036;

// Ricarten map bounds in PT world units (from village-2.smd vertex bounds).
export const PT_RICARTEN_MIN_X = -3498;
export const PT_RICARTEN_MAX_X = 5585;
export const PT_RICARTEN_MIN_Y = -259;
export const PT_RICARTEN_MAX_Y = 1013;
export const PT_RICARTEN_MIN_Z = -22373;
export const PT_RICARTEN_MAX_Z = -13194;

// Ricarten validated player start points from field.cpp (PT world units).
// Start point 1 is the primary spawn; start point 2 is the fallback.
export const PT_RICARTEN_START_X = 2592;
export const PT_RICARTEN_START_Z = -18566;
export const PT_RICARTEN_START2_X = -1047;
export const PT_RICARTEN_START2_Z = -16973;

/** True when WoC x falls inside the PT band. */
export function isPtPos(x: number): boolean {
  return x >= PT_BAND_X_MIN && x < PT_BAND_X_MAX;
}

// -- Coordinate transforms: PT world units <-> WoC band coordinates --

/** PT world X -> WoC band X, mirrored about the band so PT east (+X) maps
 *  to WoC east (-X). The map still occupies [PT_BAND_X_MIN, PT_BAND_X_MIN +
 *  (PT_RICARTEN_MAX_X - PT_RICARTEN_MIN_X) * PT_SCALE]. */
export function ptXToWoC(ptX: number): number {
  return PT_BAND_X_MIN + (PT_RICARTEN_MAX_X - ptX) * PT_SCALE;
}

/** PT world Z -> WoC band Z. */
export function ptZToWoC(ptZ: number): number {
  return PT_BAND_Z + (ptZ - PT_RICARTEN_MIN_Z) * PT_SCALE;
}

/** PT world Y -> WoC Y. */
export function ptYToWoC(ptY: number): number {
  return (ptY - PT_RICARTEN_MIN_Y) * PT_SCALE;
}

/** WoC band X -> PT world X (inverse of the mirrored ptXToWoC). */
export function woCToPtX(x: number): number {
  return PT_RICARTEN_MAX_X - (x - PT_BAND_X_MIN) / PT_SCALE;
}

/** WoC band Z -> PT world Z. */
export function woCToPtZ(z: number): number {
  return (z - PT_BAND_Z) / PT_SCALE + PT_RICARTEN_MIN_Z;
}

/** WoC band Y -> PT world Y. */
export function woCToPtY(y: number): number {
  return y / PT_SCALE + PT_RICARTEN_MIN_Y;
}

// -- Ricarten spawn position in WoC coordinates (X/Z; Y resolved at runtime) --

/** WoC X for the primary Ricarten start point. */
export const PT_RICARTEN_SPAWN_X = ptXToWoC(PT_RICARTEN_START_X);
/** WoC Z for the primary Ricarten start point. */
export const PT_RICARTEN_SPAWN_Z = ptZToWoC(PT_RICARTEN_START_Z);
/** Arrival facing at the Ricarten spawn: the start point sits north of the
 *  town center (PT 2596,-18738), so facing -Z (pi = south, per the compass
 *  convention facing 0 = +Z) looks into town. */
export const PT_RICARTEN_SPAWN_FACING = Math.PI;
