// Sea-corner sectors for the generalized ocean treatment (Phase 6H-4).
//
// The Phase 6G sea edges (maplinks.json `sea.edges`, PtSeaEdge) are
// axis-aligned strips: each covers the exposed bounds edge's water sector
// plus an outward corridor. Where TWO ADJACENT edges both carry sea to
// their shared corner, the diagonal quadrant beyond the corner is covered
// by neither strip - the "boxed corner": sky-dome imagery shows through
// the gap where the sea should continue around the headland.
//
// This module resolves which corners need a filler patch. A corner
// qualifies only when BOTH adjacent edges have a sea sector whose
// along-axis span reaches the corner coordinate - i.e. authored water
// demonstrably wraps the corner on both axes. Land-wrapped or
// single-sea corners keep their natural termination (the terrain corner
// itself masks the void).
//
// Pure deterministic resolution from shipped data (field bounds +
// generated sea edges); the renderer maps the quadrant to WoC the same
// way it maps the strips.

import type { PtBounds, PtSeaEdge } from './pt_field';

/** A vertical level-gap to close along one patch seam. `seam` names the
 *  adjacent edge the higher sector sits on; the curtain runs along the
 *  OTHER edge's boundary line under that sector's strip-end. */
export interface PtSeaCurtain {
  seam: 'xEdge' | 'zEdge';
  /** Authored PT level of the higher sector (curtain top). */
  level: number;
  /** That sector's outward reach (PT units) - the curtain spans the strip's
   *  full corridor so the slit is closed past the patch's own extent too. */
  reach: number;
}

/** The two bounds edges meeting at a corner plus the fill parameters the
 *  renderer needs (all in the field's authored PT frame). */
export interface PtSeaCorner {
  /** X-axis edge the corner sits on. */
  xEdge: 'minX' | 'maxX';
  /** Z-axis edge the corner sits on. */
  zEdge: 'minZ' | 'maxZ';
  /** Outward extent of the patch on both axes (PT units). */
  reach: number;
  /** Sea surface PT-Y for the patch: the LOWER of the two corner sectors'
   *  levels, so the patch can never tower over an adjacent strip (a
   *  higher plate would clip over the lower strip's edge and read as a
   *  floating slab; reading low reads as deep water under the strips). */
  level: number;
  /** Boundary-water material the patch textures with - the level-owning
   *  (lower) sector's, so surface and texture describe the same water. */
  materialIndex: number;
  /** Authored UV density (uv per PT unit) of that sector's faces. */
  uScale: number;
  vScale: number;
  /** Seam curtains: corner sectors whose strip sits ABOVE the patch level
   *  leave a vertical void slit along the seam (dun-6: a 12yd gap); the
   *  renderer hangs an opaque deep-water curtain under each. Empty when
   *  the adjacent levels match. */
  curtains: PtSeaCurtain[];
}

const X_EDGES = ['minX', 'maxX'] as const;
const Z_EDGES = ['minZ', 'maxZ'] as const;

// Along-axis coordinate jitter between independent parses (same tolerance
// the analyzer uses for edge coverage).
const CORNER_TOL = 8;

// Level difference (PT units) below which a seam needs no curtain: sub-
// centimeter gaps in WoC are not resolvable. Any authored level step is
// far larger than this.
const CURTAIN_EPS = 1;

/** Sectors on `edge` whose along-axis span contains `coord`. `from`/`to`
 *  arrive ordered, but normalize anyway - the data is generated, not
 *  contract-checked. */
function sectorsCovering(
  edges: readonly PtSeaEdge[],
  edge: PtSeaEdge['edge'],
  coord: number,
): PtSeaEdge[] {
  return edges.filter((e) => {
    if (e.edge !== edge) return false;
    const lo = Math.min(e.from, e.to);
    const hi = Math.max(e.from, e.to);
    return coord >= lo - CORNER_TOL && coord <= hi + CORNER_TOL;
  });
}

/**
 * The corner patches a field's sea edges need, in deterministic order
 * (minX+minZ, minX+maxZ, maxX+minZ, maxX+maxZ). Empty when no corner has
 * sea wrapping both adjacent edges - single-edge coasts and land corners
 * need nothing.
 */
export function ptSeaCorners(
  b: PtBounds,
  edges: readonly PtSeaEdge[],
): PtSeaCorner[] {
  const out: PtSeaCorner[] = [];
  for (const xe of X_EDGES) {
    for (const ze of Z_EDGES) {
      const cx = b[xe];
      const cz = b[ze];
      // The corner qualifies when a sector on EACH adjacent edge reaches
      // the corner coordinate along its own span. `covering` returns the
      // reaching sector(s); the nearest span's sector wins on ties.
      const xeSecs = sectorsCovering(edges, xe, cz);
      const zeSecs = sectorsCovering(edges, ze, cx);
      if (xeSecs.length === 0 || zeSecs.length === 0) continue;
      // Level: the lower of the two corner sectors (see PtSeaCorner.level).
      // With several reaching sectors per edge use the lowest-level one -
      // the patch fills the quadrant under ALL of them.
      const lowX = xeSecs.reduce((a, s) => (s.level < a.level ? s : a));
      const lowZ = zeSecs.reduce((a, s) => (s.level < a.level ? s : a));
      const low = lowX.level <= lowZ.level ? lowX : lowZ;
      const curtains: PtSeaCurtain[] = [
        ...xeSecs
          .filter((s) => s.level > low.level + CURTAIN_EPS)
          .map((s) => ({ seam: 'xEdge' as const, level: s.level, reach: s.reach })),
        ...zeSecs
          .filter((s) => s.level > low.level + CURTAIN_EPS)
          .map((s) => ({ seam: 'zEdge' as const, level: s.level, reach: s.reach })),
      ];
      out.push({
        xEdge: xe,
        zEdge: ze,
        reach: Math.min(
          ...xeSecs.map((s) => s.reach),
          ...zeSecs.map((s) => s.reach),
        ),
        level: low.level,
        materialIndex: low.materialIndex,
        uScale: low.uScale,
        vScale: low.vScale,
        curtains,
      });
    }
  }
  return out;
}
