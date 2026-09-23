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

import {
  PT_GRID_SIZE,
  PT_CELL_SIZE,
  PT_VERTICES,
  PT_WALKABLE_FACES,
  PT_RENDER_FACES,
  PT_CELL_OFFSETS,
  PT_CELL_COUNTS,
  PT_CELL_FACE_INDICES,
  PT_WATER_FACE_INDICES,
} from './pt_ricarten_field.generated';
import {
  woCToPtX,
  woCToPtY,
  woCToPtZ,
  ptYToWoC,
} from './pt_band';

// ---------------------------------------------------------------------------
// Triangle containment and height interpolation (XZ plane, barycentric)
// ---------------------------------------------------------------------------
//
// PT's own containment test (smStage3d.cpp GetPolyHeight) uses INCLUSIVE
// fixed-point scanline bounds: a point exactly on a shared edge belongs to
// the triangle. Our strict float64 barycentric test plus the WoC<->PT
// coordinate round-trip jitter (a few thousandths of a PT unit at this
// band's magnitude) would reject such edge-exact points from BOTH triangles
// sharing the edge, opening hairline holes a walker falls through on narrow
// stair strips. The tolerance below restores PT's inclusive edge behavior
// with a bounded margin: 1 PT unit = 0.036 WoC yd (~3.6 cm), far under the
// player radius and far under genuine geometry gaps, so it seals float
// precision seams without bridging authored holes (water channels, T-
// junction slivers several units wide stay holes).
const PT_EDGE_TOLERANCE = 1.0;

/**
 * If the point (px, pz) falls inside triangle (ax,az)-(bx,bz)-(cx,cz) in the
 * XZ plane, or within PT_EDGE_TOLERANCE of its boundary, returns the
 * interpolated Y; otherwise returns -Infinity.
 */
function triangleHeightAt(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  px: number, pz: number,
): number {
  const v0x = bx - ax, v0z = bz - az;
  const v1x = cx - ax, v1z = cz - az;
  const v2x = px - ax, v2z = pz - az;

  const d00 = v0x * v0x + v0z * v0z;
  const d01 = v0x * v1x + v0z * v1z;
  const d11 = v1x * v1x + v1z * v1z;
  const d20 = v2x * v0x + v2z * v0z;
  const d21 = v2x * v1x + v2z * v1z;

  const denom = d00 * d11 - d01 * d01;
  // XZ-degenerate faces (vertical walls, duplicated points) have no height.
  if (denom <= 0) return -Infinity;

  const v = (d11 * d20 - d01 * d21) / denom;
  const w = (d00 * d21 - d01 * d20) / denom;
  const u = 1 - v - w;

  // Fast path: strictly inside (u+v+w=1, so >=0 on all three implies <=1).
  if (u >= 0 && v >= 0 && w >= 0) return u * ay + v * by + w * cy;

  // Edge tolerance: a negative barycentric coordinate means the point lies
  // just past the opposite edge. Convert the deficit to a world-space
  // distance: u = -dist / altitudeA where altitudeA = |cross| / |BC|, so
  // dist = -u * |cross| / |BC| and the bound is u >= -EPS * |BC| / |cross|.
  // The per-coordinate bound is exactly "within EPS of the edge line",
  // independent of triangle shape.
  const cross = Math.sqrt(denom); // |v0 x v1| = twice the XZ area
  const lenAB = Math.sqrt(d00); // |AB|, opposite w
  const lenCA = Math.sqrt(d11); // |CA|, opposite v
  const lenBC = Math.sqrt((cx - bx) * (cx - bx) + (cz - bz) * (cz - bz));
  if (
    u < (-PT_EDGE_TOLERANCE * lenBC) / cross ||
    v < (-PT_EDGE_TOLERANCE * lenCA) / cross ||
    w < (-PT_EDGE_TOLERANCE * lenAB) / cross
  ) {
    return -Infinity;
  }

  // Clamp the slightly-outside point onto the triangle boundary and
  // interpolate the height there.
  const cu = u > 0 ? u : 0;
  const cv = v > 0 ? v : 0;
  const cw = w > 0 ? w : 0;
  const sum = cu + cv + cw;
  if (sum <= 0) return -Infinity;
  return (cu * ay + cv * by + cw * cy) / sum;
}

// ---------------------------------------------------------------------------
// StageArea cell lookup
// ---------------------------------------------------------------------------
//
// The PT source computes cell indices as:
//   sx = (x >> (FLOATNS+6)) & 0xFF   // x in fixed-point, cell = x_world / 64
//   sz = (z >> (FLOATNS+6)) & 0xFF
//
// The cell size is a FIXED 64 world units, not derived from map bounds.
// The & 0xFF mask wraps negative coordinates into the 0-255 grid.
// StageArea[x][z] is stored as cell index x * 256 + z in the generated data.

function stageAreaCellX(ptX: number): number {
  // ptX is in PT world units; cell = ptX / 64, wrapped to 0-255.
  return Math.floor(ptX / PT_CELL_SIZE) & (PT_GRID_SIZE - 1);
}

function stageAreaCellZ(ptZ: number): number {
  return Math.floor(ptZ / PT_CELL_SIZE) & (PT_GRID_SIZE - 1);
}

// ---------------------------------------------------------------------------
// Walkable face vertex lookup (cached typed arrays)
// ---------------------------------------------------------------------------

let _vertices: Float32Array | null = null;
let _walkFaces: Uint16Array | null = null;
let _cellOffsets: Int32Array | null = null;
let _cellCounts: Int16Array | null = null;
let _cellFaceIndices: Uint16Array | null = null;

function ensureData(): void {
  if (_vertices === null) _vertices = PT_VERTICES();
  if (_walkFaces === null) _walkFaces = PT_WALKABLE_FACES();
  if (_cellOffsets === null) _cellOffsets = PT_CELL_OFFSETS();
  if (_cellCounts === null) _cellCounts = PT_CELL_COUNTS();
  if (_cellFaceIndices === null) _cellFaceIndices = PT_CELL_FACE_INDICES();
}

// ---------------------------------------------------------------------------
// Height queries
// ---------------------------------------------------------------------------

/**
 * The lowest walkable surface height at WoC (x, z), in WoC Y.
 * Returns -Infinity if no walkable triangle covers the point.
 *
 * This is the groundHeight for the PT Ricarten band: the dominant (lowest)
 * walkable surface. Upper-level surfaces are returned by ptRicartenSupportHeight.
 */
export function ptRicartenGroundHeight(x: number, z: number): number {
  ensureData();
  const vertices = _vertices!;
  const walkFaces = _walkFaces!;
  const cellOffsets = _cellOffsets!;
  const cellCounts = _cellCounts!;
  const cellFaceIndices = _cellFaceIndices!;

  const ptX = woCToPtX(x);
  const ptZ = woCToPtZ(z);

  const cx = stageAreaCellX(ptX);
  const cz = stageAreaCellZ(ptZ);
  const cellIdx = cx * PT_GRID_SIZE + cz;
  const offset = cellOffsets[cellIdx];
  if (offset < 0) return -Infinity;

  const count = cellCounts[cellIdx];
  let best = Infinity;

  for (let i = 0; i < count; i++) {
    const wi = cellFaceIndices[offset + i];
    const ai = walkFaces[wi * 3];
    const bi = walkFaces[wi * 3 + 1];
    const ci = walkFaces[wi * 3 + 2];

    const h = triangleHeightAt(
      vertices[ai * 3], vertices[ai * 3 + 1], vertices[ai * 3 + 2],
      vertices[bi * 3], vertices[bi * 3 + 1], vertices[bi * 3 + 2],
      vertices[ci * 3], vertices[ci * 3 + 1], vertices[ci * 3 + 2],
      ptX, ptZ,
    );
    // Lowest containing surface: groundHeight is the base terrain floor in
    // WoC's floorHeightAt = max(ground, support) model. Upper surfaces in a
    // multi-level cell are reached through ptRicartenSupportHeight (which
    // filters by the player's maxY reach), so returning the top surface here
    // would snap a player on a lower floor up onto the overhang above them.
    if (h !== -Infinity && h < best) best = h;
  }

  if (best === Infinity) return -Infinity;
  return ptYToWoC(best);
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
  _r: number,
  maxY: number,
): number {
  ensureData();
  const vertices = _vertices!;
  const walkFaces = _walkFaces!;
  const cellOffsets = _cellOffsets!;
  const cellCounts = _cellCounts!;
  const cellFaceIndices = _cellFaceIndices!;

  const ptX = woCToPtX(x);
  const ptZ = woCToPtZ(z);
  // Convert maxY from WoC Y to PT world Y for comparison.
  const ptMaxY = woCToPtY(maxY);

  const cx = stageAreaCellX(ptX);
  const cz = stageAreaCellZ(ptZ);
  const cellIdx = cx * PT_GRID_SIZE + cz;
  const offset = cellOffsets[cellIdx];
  if (offset < 0) return -Infinity;

  const count = cellCounts[cellIdx];
  let best = -Infinity;

  for (let i = 0; i < count; i++) {
    const wi = cellFaceIndices[offset + i];
    const ai = walkFaces[wi * 3];
    const bi = walkFaces[wi * 3 + 1];
    const ci = walkFaces[wi * 3 + 2];

    const h = triangleHeightAt(
      vertices[ai * 3], vertices[ai * 3 + 1], vertices[ai * 3 + 2],
      vertices[bi * 3], vertices[bi * 3 + 1], vertices[bi * 3 + 2],
      vertices[ci * 3], vertices[ci * 3 + 1], vertices[ci * 3 + 2],
      ptX, ptZ,
    );
    if (h === -Infinity) continue;
    // Only surfaces at or below maxY (in PT world Y).
    if (h <= ptMaxY && h > best) best = h;
  }

  if (best === -Infinity) return -Infinity;
  return ptYToWoC(best);
}

// PT's own step allowance (smStage3d.cpp): `Stage_StepHeight = 10*fONE`,
// ten PT world units. Both floor queries in the original engine filter
// candidate faces with `hy = he - refY; if (hy < Stage_StepHeight)`.
const PT_STEP_HEIGHT_UNITS = 10;

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
  ensureData();
  const vertices = _vertices!;
  const walkFaces = _walkFaces!;
  const cellOffsets = _cellOffsets!;
  const cellCounts = _cellCounts!;
  const cellFaceIndices = _cellFaceIndices!;

  const ptX = woCToPtX(x);
  const ptZ = woCToPtZ(z);
  const ptRef = woCToPtY(refY);

  const cx = stageAreaCellX(ptX);
  const cz = stageAreaCellZ(ptZ);
  const cellIdx = cx * PT_GRID_SIZE + cz;
  const offset = cellOffsets[cellIdx];
  if (offset < 0) return -Infinity;

  const count = cellCounts[cellIdx];
  let best = -Infinity;

  for (let i = 0; i < count; i++) {
    const wi = cellFaceIndices[offset + i];
    const ai = walkFaces[wi * 3];
    const bi = walkFaces[wi * 3 + 1];
    const ci = walkFaces[wi * 3 + 2];

    const h = triangleHeightAt(
      vertices[ai * 3], vertices[ai * 3 + 1], vertices[ai * 3 + 2],
      vertices[bi * 3], vertices[bi * 3 + 1], vertices[bi * 3 + 2],
      vertices[ci * 3], vertices[ci * 3 + 1], vertices[ci * 3 + 2],
      ptX, ptZ,
    );
    if (h === -Infinity) continue;
    // hy = he - refY; qualified when hy < Stage_StepHeight (PT units).
    if (h - ptRef < PT_STEP_HEIGHT_UNITS && h > best) best = h;
  }

  if (best === -Infinity) return -Infinity;
  return ptYToWoC(best);
}

// ---------------------------------------------------------------------------
// Wall collision (smStage3d.cpp CheckNextMove -> smMakeTLine/GetTriangleImact)
// ---------------------------------------------------------------------------
//
// A floor under the destination is only half of PT's move acceptance. The
// other half is a swept-capsule test: CheckNextMove builds four line
// segments (smMakeTLine) and rejects the move when ANY CHECK_FACE triangle
// intersects ANY of them (GetTriangleImact). The lines form a "goalpost":
//   L0: pos -> pos + dir*(dist+12) at feet + 12 units
//   L1: same span at feet + 0.75*ObjHeight
//   L2: lateral +-ObjWidth/4 across the lookahead point at feet + 12
//   L3: same lateral at feet + 0.75*ObjHeight
// The low line sits just above Stage_StepHeight (10u), so stair risers pass
// under it while real walls (ship hull, tree trunks, fences, building
// sides) straddle it and block.
//
// Player body size in PT units: CheckNextMove is called with
// Pattern->SizeWidth/SizeHeight — the character model's bounding extents.
// The converted Tempskron fighter measures x/z +-9.2, y 0..51.1 PT units,
// so ObjWidth ~= 9.2 and ObjHeight ~= 51. PosiMaxY is ObjHeight -
// ObjHeight/4 and the goalpost half-width is ObjWidth/4 (~2.3u): the sweep
// is nearly a line test, threading the narrow pillar gaps an authored
// ~10u opening leaves.
const PT_WALL_LOW_UNITS = 12;
const PT_BODY_HEIGHT_UNITS = 51.1;
const PT_BODY_WIDTH_UNITS = 9.2;
const PT_WALL_TOP_UNITS =
  PT_BODY_HEIGHT_UNITS - Math.floor(PT_BODY_HEIGHT_UNITS / 4);
const PT_WALL_HALF_UNITS = PT_BODY_WIDTH_UNITS / 4; // ObjWidth>>2
const PT_WALL_LOOKAHEAD_UNITS = 12;

// Dedup stamp: faces register into every cell their bbox touches, so the
// 2x2 cell window can list one face up to four times (PT uses face->CalcSum
// for the same purpose).
let _wallStamp: Int32Array | null = null;
let _wallStampCnt = 0;

/**
 * Oriented-plane sign of `s` against the plane through `p` spanned by edge
 * `p->q` and vector `v` (the extrusion direction). Equivalent to PT's
 * smGetPlaneProduct(p, q, p+v, s) with all fixed-point shifts dropped —
 * only the sign is consumed.
 */
function edgePlaneSign(
  px: number, py: number, pz: number,
  qx: number, qy: number, qz: number,
  vx: number, vy: number, vz: number,
  sx: number, sy: number, sz: number,
): number {
  const ux = qx - px, uy = qy - py, uz = qz - pz;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  return nx * (sx - px) + ny * (sy - py) + nz * (sz - pz);
}

/**
 * smSTAGE3D::GetTriangleImact face test, ported literally: does segment
 * (sx,sy,sz)->(ex,ey,ez) cross triangle abc? PT skips the face when both
 * endpoints sit strictly outside the whole vertex-Y band (either side),
 * then requires the segment to straddle the face plane, then checks the
 * start point inside the triangle extruded along the segment direction.
 */
function faceImactsLine(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  ex: number, ey: number, ez: number,
): boolean {
  const loY = Math.min(ay, by, cy);
  const hiY = Math.max(ay, by, cy);
  const spOut = sy < loY || sy > hiY;
  const epOut = ey < loY || ey > hiY;
  if (spOut && epOut) return false;

  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const c1 = nx * (sx - ax) + ny * (sy - ay) + nz * (sz - az);
  const c2 = nx * (ex - ax) + ny * (ey - ay) + nz * (ez - az);
  if ((c1 <= 0 && c2 <= 0) || (c1 > 0 && c2 > 0)) return false;

  // Extrusion vector: PT scales by <<8, which only rescales the (sign-only)
  // edge tests, so the unscaled direction is equivalent. The else branch
  // carries an upstream quirk — vy/vz are written as (ep-ep) = 0 instead of
  // (sp-ep) — reproduced verbatim so wall asymmetry matches the original.
  let ix: number, iy: number, iz: number;
  if (c1 <= 0) {
    ix = ex - sx; iy = ey - sy; iz = ez - sz;
  } else {
    ix = sx - ex; iy = 0; iz = 0;
  }

  // sp must sit on the non-positive side of all three edge planes of the
  // extruded triangle; any positive sign means the segment misses.
  if (edgePlaneSign(ax, ay, az, bx, by, bz, ix, iy, iz, sx, sy, sz) > 0) return false;
  if (edgePlaneSign(bx, by, bz, cx, cy, cz, ix, iy, iz, sx, sy, sz) > 0) return false;
  if (edgePlaneSign(cx, cy, cz, ax, ay, az, ix, iy, iz, sx, sy, sz) > 0) return false;
  return true;
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
): boolean {
  ensureData();
  const vertices = _vertices!;
  const walkFaces = _walkFaces!;
  const cellOffsets = _cellOffsets!;
  const cellCounts = _cellCounts!;
  const cellFaceIndices = _cellFaceIndices!;

  const px = woCToPtX(sx);
  const py = woCToPtY(sy);
  const pz = woCToPtZ(sz);
  const qx = woCToPtX(ex);
  const qz = woCToPtZ(ez);

  let dx = qx - px;
  let dz = qz - pz;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return false;
  dx /= dist;
  dz /= dist;

  const d2 = dist + PT_WALL_LOOKAHEAD_UNITS;
  const tx = px + dx * d2;
  const tz = pz + dz * d2;
  // Lateral axis across the lookahead point (sign-free: spans both sides).
  const lx = -dz * PT_WALL_HALF_UNITS;
  const lz = dx * PT_WALL_HALF_UNITS;

  const lowY = py + PT_WALL_LOW_UNITS;
  const topY = py + PT_WALL_TOP_UNITS;
  const lines = [
    [px, lowY, pz, tx, lowY, tz],
    [px, topY, pz, tx, topY, tz],
    [tx - lx, lowY, tz - lz, tx + lx, lowY, tz + lz],
    [tx - lx, topY, tz - lz, tx + lx, topY, tz + lz],
  ];

  if (_wallStamp === null) _wallStamp = new Int32Array(walkFaces.length / 3);
  _wallStampCnt++;
  const stamp = _wallStamp;
  const stampCnt = _wallStampCnt;

  const cx0 = Math.floor((px - PT_CELL_SIZE) / PT_CELL_SIZE) & (PT_GRID_SIZE - 1);
  const cz0 = Math.floor((pz - PT_CELL_SIZE) / PT_CELL_SIZE) & (PT_GRID_SIZE - 1);

  for (let ci = 0; ci < 2; ci++) {
    for (let cj = 0; cj < 2; cj++) {
      const cellIdx =
        ((cx0 + ci) & (PT_GRID_SIZE - 1)) * PT_GRID_SIZE +
        ((cz0 + cj) & (PT_GRID_SIZE - 1));
      const offset = cellOffsets[cellIdx];
      if (offset < 0) continue;
      const count = cellCounts[cellIdx];
      for (let i = 0; i < count; i++) {
        const wi = cellFaceIndices[offset + i];
        if (stamp[wi] === stampCnt) continue;
        stamp[wi] = stampCnt;
        const ai = walkFaces[wi * 3];
        const bi = walkFaces[wi * 3 + 1];
        const ci2 = walkFaces[wi * 3 + 2];
        const ax = vertices[ai * 3], ay = vertices[ai * 3 + 1], az = vertices[ai * 3 + 2];
        const bx = vertices[bi * 3], by = vertices[bi * 3 + 1], bz = vertices[bi * 3 + 2];
        const cxv = vertices[ci2 * 3], cyv = vertices[ci2 * 3 + 1], czv = vertices[ci2 * 3 + 2];
        for (let l = 0; l < 4; l++) {
          const L = lines[l];
          if (
            faceImactsLine(
              ax, ay, az, bx, by, bz, cxv, cyv, czv,
              L[0], L[1], L[2], L[3], L[4], L[5],
            )
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Resolve the spawn Y for a PT start point: queries the walkable surface
 * at the given WoC (x, z) and returns the ground height. Falls back to
 * the second start point if the first has no walkable surface.
 */
export function ptRicartenSpawnY(x: number, z: number): number {
  const h = ptRicartenGroundHeight(x, z);
  if (Number.isFinite(h)) return h;
  // Fallback: use a small offset above 0 if no surface found.
  return 0;
}

// ---------------------------------------------------------------------------
// Water surface query (harbor / fountain faces)
// ---------------------------------------------------------------------------
//
// PT characters swim in the Ricarten harbor: the water faces (materials
// classified non-walkable) carry a real surface height (~102 PT units for
// the harbor sheet). Without a water level, a seam hairline or an authored
// channel reads as a bottomless hole in our movement kernel and the player
// falls into the void. This index rasterizes each water face's XZ bounding
// box into the same fixed 64-unit StageArea grid PT uses (smStage3d.cpp
// getPolyAreas registers every face into all cells its bbox touches), so a
// single-cell query is complete for containment.

let _waterCellOffsets: Int32Array | null = null;
let _waterCellCounts: Int16Array | null = null;
let _waterCellFaces: Uint16Array | null = null;

function ensureWaterIndex(): void {
  if (_waterCellOffsets !== null) return;
  ensureData();
  const vertices = _vertices!;
  const renderFaces = PT_RENDER_FACES();
  const waterFaces = PT_WATER_FACE_INDICES();

  const counts = new Int32Array(PT_GRID_SIZE * PT_GRID_SIZE);
  const register = (pass: 'count' | 'fill') => {
    for (let i = 0; i < waterFaces.length; i++) {
      const fi = waterFaces[i];
      const ai = renderFaces[fi * 4];
      const bi = renderFaces[fi * 4 + 1];
      const ci = renderFaces[fi * 4 + 2];
      const minX = Math.min(vertices[ai * 3], vertices[bi * 3], vertices[ci * 3]);
      const maxX = Math.max(vertices[ai * 3], vertices[bi * 3], vertices[ci * 3]);
      const minZ = Math.min(vertices[ai * 3 + 2], vertices[bi * 3 + 2], vertices[ci * 3 + 2]);
      const maxZ = Math.max(vertices[ai * 3 + 2], vertices[bi * 3 + 2], vertices[ci * 3 + 2]);
      const cx0 = Math.floor(minX / PT_CELL_SIZE) & (PT_GRID_SIZE - 1);
      const cx1 = Math.floor(maxX / PT_CELL_SIZE) & (PT_GRID_SIZE - 1);
      const cz0 = Math.floor(minZ / PT_CELL_SIZE) & (PT_GRID_SIZE - 1);
      const cz1 = Math.floor(maxZ / PT_CELL_SIZE) & (PT_GRID_SIZE - 1);
      for (let cx = cx0; ; cx = (cx + 1) & (PT_GRID_SIZE - 1)) {
        for (let cz = cz0; ; cz = (cz + 1) & (PT_GRID_SIZE - 1)) {
          if (pass === 'count') counts[cx * PT_GRID_SIZE + cz]++;
          else _waterCellFaces![_waterCellOffsets![cx * PT_GRID_SIZE + cz] + --counts[cx * PT_GRID_SIZE + cz]] = i;
          if (cz === cz1) break;
        }
        if (cx === cx1) break;
      }
    }
  };

  register('count');
  _waterCellOffsets = new Int32Array(PT_GRID_SIZE * PT_GRID_SIZE).fill(-1);
  _waterCellCounts = new Int16Array(PT_GRID_SIZE * PT_GRID_SIZE);
  let total = 0;
  for (let c = 0; c < counts.length; c++) {
    if (counts[c] > 0) {
      _waterCellOffsets[c] = total;
      _waterCellCounts[c] = counts[c];
      total += counts[c];
    }
  }
  _waterCellFaces = new Uint16Array(total);
  register('fill');
}

/**
 * The water surface height at WoC (x, z) in the PT Ricarten band, in WoC Y.
 * Returns -Infinity where no water-material face covers the point.
 */
export function ptRicartenWaterLevel(x: number, z: number): number {
  ensureWaterIndex();
  const vertices = _vertices!;
  const renderFaces = PT_RENDER_FACES();
  const waterFaces = PT_WATER_FACE_INDICES();

  const ptX = woCToPtX(x);
  const ptZ = woCToPtZ(z);
  const cellIdx = stageAreaCellX(ptX) * PT_GRID_SIZE + stageAreaCellZ(ptZ);
  const offset = _waterCellOffsets![cellIdx];
  if (offset < 0) return -Infinity;

  const count = _waterCellCounts![cellIdx];
  let best = Infinity;
  for (let i = 0; i < count; i++) {
    const fi = waterFaces[_waterCellFaces![offset + i]];
    const ai = renderFaces[fi * 4];
    const bi = renderFaces[fi * 4 + 1];
    const ci = renderFaces[fi * 4 + 2];
    const h = triangleHeightAt(
      vertices[ai * 3], vertices[ai * 3 + 1], vertices[ai * 3 + 2],
      vertices[bi * 3], vertices[bi * 3 + 1], vertices[bi * 3 + 2],
      vertices[ci * 3], vertices[ci * 3 + 1], vertices[ci * 3 + 2],
      ptX, ptZ,
    );
    // Lowest covering water face: overlapping sheets (harbor + fountain)
    // resolve to the lower surface, matching groundHeight's convention.
    if (h !== -Infinity && h < best) best = h;
  }
  if (best === Infinity) return -Infinity;
  return ptYToWoC(best);
}
