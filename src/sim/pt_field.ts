// Generic PT (Priston Tale) field collision and height queries.
//
// This is the parameterized form of src/sim/pt_ricarten_field.ts: the same
// math (StageArea cell lookup, barycentric triangle height, PT wall sweep,
// water index) driven by an injected generated field module plus a PT<->WoC
// band transform. Ricarten runs through this code bound to its committed
// generated module; the development map-test harness binds it to any of the
// generated/pt-maps/<id>/field.generated.ts packages at runtime.
//
// The collision source is the map's CHECK_FACE triangle set, spatially
// indexed by the PT StageArea 256x256 grid. At query time we:
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
  PT_BAND_X_MIN,
  PT_BAND_X_MAX,
  PT_BAND_Z,
  PT_FIELD_ANCHOR_X,
  PT_RICARTEN_MAX_X,
  PT_RICARTEN_MIN_Y,
  PT_RICARTEN_MIN_Z,
  PT_SCALE,
} from './pt_band';

// ---------------------------------------------------------------------------
// Field data + transform contracts
// ---------------------------------------------------------------------------

/** PT-space axis bounds of a converted field (generated PT_BOUNDS). */
export interface PtBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** WoC <-> PT coordinate transforms for one map placed in the PT band. */
export interface PtFieldTransform {
  ptXToWoC(ptX: number): number;
  ptZToWoC(ptZ: number): number;
  ptYToWoC(ptY: number): number;
  woCToPtX(x: number): number;
  woCToPtY(y: number): number;
  woCToPtZ(z: number): number;
}

/**
 * Build the band transform for a map with the given PT-space bounds. Same
 * math as src/sim/pt_band.ts with the Ricarten constants replaced by the
 * map's own bounds: PT +X (east) mirrors to WoC -X (east), Z maps 1:1, and
 * the map's southwest corner anchors at the band origin.
 */
export function makePtBandTransform(b: PtBounds): PtFieldTransform {
  return {
    ptXToWoC: (ptX) => PT_FIELD_ANCHOR_X + (b.maxX - ptX) * PT_SCALE,
    ptZToWoC: (ptZ) => PT_BAND_Z + (ptZ - b.minZ) * PT_SCALE,
    ptYToWoC: (ptY) => (ptY - b.minY) * PT_SCALE,
    woCToPtX: (x) => b.maxX - (x - PT_FIELD_ANCHOR_X) / PT_SCALE,
    woCToPtY: (y) => y / PT_SCALE + b.minY,
    woCToPtZ: (z) => (z - PT_BAND_Z) / PT_SCALE + b.minZ,
  };
}

/**
 * Build the shared CONTINENT transform: every connected PT map keeps its
 * authored absolute PT coordinates, anchored to Ricarten's bounds so the
 * production Ricarten placement is the continent anchor (see
 * PT_FIELD_ANCHOR_X in pt_band.ts). Same mirrored-X math as
 * makePtBandTransform, but the anchor is the shared continent rather than
 * one map's own bounds, so two adjacent fields occupy adjacent WoC
 * positions exactly as their authored coordinates abut. This is what makes
 * a FieldGate boundary physically walkable: crossing a map's edge lands on
 * the neighbor's edge with no teleport. For Ricarten itself this transform
 * is numerically identical to the production pt_band transform.
 */
export function makePtContinentTransform(): PtFieldTransform {
  return {
    ptXToWoC: (ptX) => PT_FIELD_ANCHOR_X + (PT_RICARTEN_MAX_X - ptX) * PT_SCALE,
    ptZToWoC: (ptZ) => PT_BAND_Z + (ptZ - PT_RICARTEN_MIN_Z) * PT_SCALE,
    ptYToWoC: (ptY) => (ptY - PT_RICARTEN_MIN_Y) * PT_SCALE,
    woCToPtX: (x) => PT_RICARTEN_MAX_X - (x - PT_FIELD_ANCHOR_X) / PT_SCALE,
    woCToPtY: (y) => y / PT_SCALE + PT_RICARTEN_MIN_Y,
    woCToPtZ: (z) => (z - PT_BAND_Z) / PT_SCALE + PT_RICARTEN_MIN_Z,
  };
}

/**
 * True when a field's authored bounds land inside the PT band under the
 * shared continent transform. Fields that fail this (warp-only islands
 * whose authored absolute coordinates sit outside the band, e.g. dc1 west
 * of the battleground band) keep the per-map makePtBandTransform fallback:
 * they are never floor-adjacent to the continent, so their seams cannot
 * break.
 */
export function ptFieldFitsContinent(b: PtBounds): boolean {
  const xf = makePtContinentTransform();
  return xf.ptXToWoC(b.maxX) >= PT_BAND_X_MIN && xf.ptXToWoC(b.minX) < PT_BAND_X_MAX;
}

/**
 * Structural mirror of a generated field module's PT_MATERIALS row
 * (smMATERIAL fields the renderer consumes; collision never reads it).
 */
export interface PtMaterialLike {
  index: number;
  isWalkable: boolean;
  transparency: number;
  blendType: number;
  shade: number;
  twoSide: boolean;
  useState: number;
  meshState: number;
  windMeshBottom: number;
  /** smMATERIAL::MapOpacity (source float, texture-level opacity). */
  mapOpacity: number;
  /** smMATERIAL::TextureType (SMTEX_TYPE_ANIMATION = 0x1). */
  textureType: number;
  /** Base texture slots (smTexture[]). NOT animation frame 0 - animated
   *  materials keep a distinct smAnimTexture[] list (see animTextureNames). */
  textureNames: string[];
  /** smAnimTexture flipbook, present only when the material animates. */
  animTexCounter?: number;
  animTextureNames?: string[];
  /** Frame index mask (numFrames - 1). */
  frameMask?: number;
  /** Playback: frame = (RendStatTime >> shiftFrameSpeed) & frameMask. */
  shiftFrameSpeed?: number;
  /** SMTEX_AUTOANIMATION (0x100) when the flipbook self-plays. */
  animationFrame?: number;
}

/**
 * Structural shape of a generated/pt-maps/<id>/field.generated.ts module
 * (also satisfied by src/sim/pt_ricarten_field.generated.ts). Declared here
 * so sim code can consume any compiled field without importing the
 * generated files directly.
 */
/** smLIGHT3D record (field-level dynamic/object light), PT world units. */
export interface PtFieldLight {
  type: number;
  x: number;
  y: number;
  z: number;
  range: number;
  r: number;
  g: number;
  b: number;
}

/** smSTAGE3D lighting header fields, emitted for later renderer phases. */
export interface PtFieldLighting {
  /** smSTAGE3D::nVertColor - count of authored vertex-color inputs. */
  nVertColor: number;
  /** smSTAGE3D::Contrast (shade saturation scalar). */
  contrast: number;
  /** smSTAGE3D::Bright (shade brightness scalar). */
  bright: number;
  /** smSTAGE3D::VectLight (POINT3D light direction, PT units). */
  vectLight: number[];
  lights: PtFieldLight[];
}

export interface PtFieldModule {
  readonly PT_BOUNDS: PtBounds;
  readonly PT_N_VERTEX: number;
  readonly PT_N_FACE: number;
  readonly PT_N_WATER: number;
  readonly PT_N_DECORATIVE: number;
  readonly PT_GRID_SIZE: number;
  readonly PT_CELL_SIZE: number;
  readonly PT_MATERIALS: readonly PtMaterialLike[];
  readonly PT_FIELD_LIGHTING?: PtFieldLighting;
  /** Converted minimap raster URL (covers PT_STAGE_MAP_RECT), or null. */
  readonly PT_MINIMAP?: { png: string } | null;
  PT_VERTICES(): Float32Array;
  PT_RENDER_FACES(): Uint16Array;
  PT_UVS(): Float32Array;
  /** Authored sDef_Color per vertex (RGBA int16, baked gouraud shade). */
  PT_VERTEX_COLORS?(): Int16Array;
  PT_WALKABLE_FACES(): Uint16Array;
  PT_CELL_OFFSETS(): Int32Array;
  PT_CELL_COUNTS(): Int16Array;
  PT_CELL_FACE_INDICES(): Uint16Array;
  PT_WATER_FACE_INDICES(): Uint16Array;
  PT_DECORATIVE_FACE_INDICES(): Uint16Array;
}

// ---------------------------------------------------------------------------
// Dev-map descriptor (harness-facing; collision reads only `field`+`transform`)
// ---------------------------------------------------------------------------

// Structural mirror of the generated stage-object interfaces
// (PtStageObjectMaterial/PtStageObjectNode/PtStageObject in the emitted
// stage_objects.generated.ts modules). Restated here so sim can hold a
// whole-map descriptor without importing render-layer generated data.
export interface PtStageObjectMaterialLike {
  index: number;
  textureNames: string[];
  twoSide: boolean;
  transparency: number;
  useState: number;
  meshState: number;
  windMeshBottom: number;
  mapOpacity: number;
  textureType: number;
  animTexCounter?: number;
  animTextureNames?: string[];
  frameMask?: number;
  shiftFrameSpeed?: number;
  animationFrame?: number;
}

export interface PtStageObjectNodeLike {
  name: string;
  parent: string;
  nVertex: number;
  nFace: number;
  verts: Float32Array;
  faces: Uint16Array;
  uvs: Float32Array;
  localMatrix: Float32Array;
  rotKeys: Float32Array;
  posKeys: Float32Array;
  scaleKeys: Float32Array;
  rotFrameTable: Int32Array;
  posFrameTable: Int32Array;
  scaleFrameTable: Int32Array;
  /** _Bip files: per-vertex bone node names (Physique[] trailer). */
  boneNames?: string[];
  tmFrameCnt: number;
  baseRotQuat: number[];
  basePos: number[];
  animated: boolean;
}

export interface PtStageObjectLike {
  name: string;
  maxFrame: number;
  nodes: PtStageObjectNodeLike[];
  materials: PtStageObjectMaterialLike[];
}

export interface PtStageObjectsModule {
  readonly PT_STAGE_OBJECTS: readonly PtStageObjectLike[];
}

/**
 * One authored FieldGate adjacency record (field.cpp AddGate). In the
 * source engine AddGate is a seamless-boundary preload hint, NOT a
 * teleport: the gate coordinate is a shared point near the boundary
 * between the two fields, and PlayNearGateField loads the destination
 * when the player gets within DIST_TRANSLEVEL_CONNECT of it. AddGate also
 * registers the reverse edge on the destination (AddGate2), so each
 * record describes one bidirectional boundary.
 *
 * Coordinates are PT world units in the shared absolute PT space.
 */
export interface PtFieldGateLink {
  /** Destination field registration index (psField[N]). */
  targetIndex: number;
  /** Destination package id (generated/pt-maps/<targetId>), null when the
   *  target index names no registered field. */
  targetId: string | null;
  /** Shared gate point, PT world coordinates. */
  x: number;
  z: number;
  y: number;
}

/**
 * One authored WarpGate exit record (field.cpp AddWarpOutGate, the
 * sFGATE OutGate[] slot): a destination field plus the exact PT world
 * coordinate the player is SetPosi'd to. Coordinates are PT world units in
 * the shared absolute PT space (the source stores them <<FLOATNS; these
 * are the authored integers).
 */
export interface PtWarpOutExit {
  /** Destination field registration index (psField[N]). */
  targetIndex: number;
  /** Destination package id, null when the target names no registered
   *  field. */
  targetId: string | null;
  /** Exit position in the destination field's PT space. */
  x: number;
  z: number;
  y: number;
}

/**
 * One authored WarpGate trigger (field.cpp AddWarpGate, sWARPGATE). A
 * proximity-triggered TELEPORT, not a FieldGate seam: CheckWarpGate tests
 * the player against the trigger cylinder each frame (dx*dx+dz*dz <
 * size*size, |dy| < height with the height check disabled when the
 * authored y is 0), enforces limitLevel, then warps to a randomly chosen
 * exit. specialEffect mirrors the source: 0 = immediate warp, 1 = the
 * ~2s delayed return-effect warp, 2 = the wing-warp UI gate.
 */
export interface PtWarpGateLink {
  /** Trigger center, PT world coordinates. */
  x: number;
  z: number;
  y: number;
  /** Trigger cylinder radius, PT units. */
  size: number;
  /** Trigger height, PT units. */
  height: number;
  /** Minimum player level (resolved from FieldLimitLevel_Table). */
  limitLevel: number;
  /** 0 immediate, 1 delayed return effect, 2 wing warp. */
  specialEffect: number;
  /** Authored exit records; CheckWarpGate requires at least one. */
  exits: readonly PtWarpOutExit[];
}

/**
 * One loaded PT map package: the generated field module, its band
 * transform, its texture URL root, and the optional stage-object module.
 * Everything collision and rendering need, nothing more.
 *
 * `oceanRing` opts into the Ricarten-only visual ocean extension (the
 * horizon ring + deep-sea blocker keyed to that map's authored sea level
 * and harbor material). Dev-harness maps leave it off: faking a sea level
 * for a map that does not declare one would misreport the conversion.
 *
 * `fieldGates` carries the field's authored AddGate records verbatim
 * (including source anomalies like the ff-01 -> pilai dead coordinate and
 * the SeaA self-loop). The connected-world runtime treats each record as
 * one undirected boundary edge; see src/game/pt_field_links.ts.
 *
 * `warpGates` carries the field's authored AddWarpGate/AddWarpOutGate
 * records verbatim (sWARPGATE): proximity teleports evaluated only while
 * the field owns the player; see src/game/pt_warp_gates.ts. `posWarpOut`
 * is the field's own warp-out point (sFIELD::PosWarpOut), stamped by the
 * last self-targeting AddWarpOutGate - the wing-warp arrival coordinate.
 * `limitLevel` is the field-level limit (FieldLimitLevel_Table[index]),
 * consulted only by the wing-warp destination check.
 */
export interface PtMapDescriptor {
  id: string;
  field: PtFieldModule;
  transform: PtFieldTransform;
  textureBase: string;
  stageObjects: PtStageObjectsModule | null;
  oceanRing: boolean;
  fieldGates?: readonly PtFieldGateLink[];
  warpGates?: readonly PtWarpGateLink[];
  posWarpOut?: { x: number; y: number; z: number } | null;
  limitLevel?: number;
}

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
// Wall collision (smStage3d.cpp CheckNextMove -> smMakeTLine/GetTriangleImact)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// PtField: one field module bound to one band transform
// ---------------------------------------------------------------------------

export interface PtField {
  /** Lowest walkable surface at WoC (x, z), WoC Y, or -Infinity. */
  groundHeight(x: number, z: number): number;
  /** Highest walkable surface at WoC (x, z) at or below maxY (WoC Y). */
  supportHeight(x: number, z: number, r: number, maxY: number): number;
  /** PT CheckNextMove floor rule: highest surface within Stage_StepHeight of refY. */
  floorHeight(x: number, z: number, refY: number): number;
  /** PT swept-capsule wall test for a move (sx,sy,sz) -> (ex,ez), WoC space.
   *  When the move already passed the floor rule, pass the accepted
   *  destination floor (WoC Y) so step-aware filtering can tell stair
   *  faces from real walls; omit it for floorless moves (swimmers). */
  wallHit(
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ez: number,
    destFloorY?: number,
  ): boolean;
  /** Ground height for a spawn point, 0 when no surface exists there. */
  spawnY(x: number, z: number): number;
  /** Water surface height at WoC (x, z), WoC Y, or -Infinity. */
  waterLevel(x: number, z: number): number;
}

// PT's own step allowance (smStage3d.cpp): `Stage_StepHeight = 10*fONE`,
// ten PT world units. Both floor queries in the original engine filter
// candidate faces with `hy = he - refY; if (hy < Stage_StepHeight)`.
const PT_STEP_HEIGHT_UNITS = 10;

export function createPtField(mod: PtFieldModule, xf: PtFieldTransform): PtField {
  const GRID = mod.PT_GRID_SIZE;
  const CELL = mod.PT_CELL_SIZE;

  // Lazy decoded arrays (the generated getters decode base64 on first call).
  let _vertices: Float32Array | null = null;
  let _walkFaces: Uint16Array | null = null;
  let _cellOffsets: Int32Array | null = null;
  let _cellCounts: Int16Array | null = null;
  let _cellFaceIndices: Uint16Array | null = null;

  function ensureData(): void {
    if (_vertices === null) _vertices = mod.PT_VERTICES();
    if (_walkFaces === null) _walkFaces = mod.PT_WALKABLE_FACES();
    if (_cellOffsets === null) _cellOffsets = mod.PT_CELL_OFFSETS();
    if (_cellCounts === null) _cellCounts = mod.PT_CELL_COUNTS();
    if (_cellFaceIndices === null) _cellFaceIndices = mod.PT_CELL_FACE_INDICES();
  }

  // The PT source computes cell indices as:
  //   sx = (x >> (FLOATNS+6)) & 0xFF   // x in fixed-point, cell = x_world / 64
  //   sz = (z >> (FLOATNS+6)) & 0xFF
  //
  // The cell size is a FIXED 64 world units, not derived from map bounds.
  // The & 0xFF mask wraps negative coordinates into the 0-255 grid.
  // StageArea[x][z] is stored as cell index x * 256 + z in the generated data.
  function stageAreaCellX(ptX: number): number {
    // ptX is in PT world units; cell = ptX / CELL, wrapped to 0-(GRID-1).
    return Math.floor(ptX / CELL) & (GRID - 1);
  }
  function stageAreaCellZ(ptZ: number): number {
    return Math.floor(ptZ / CELL) & (GRID - 1);
  }

  function groundHeight(x: number, z: number): number {
    ensureData();
    const vertices = _vertices!;
    const walkFaces = _walkFaces!;
    const cellOffsets = _cellOffsets!;
    const cellCounts = _cellCounts!;
    const cellFaceIndices = _cellFaceIndices!;

    const ptX = xf.woCToPtX(x);
    const ptZ = xf.woCToPtZ(z);

    const cx = stageAreaCellX(ptX);
    const cz = stageAreaCellZ(ptZ);
    const cellIdx = cx * GRID + cz;
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
      // multi-level cell are reached through supportHeight (which
      // filters by the player's maxY reach), so returning the top surface here
      // would snap a player on a lower floor up onto the overhang above them.
      if (h !== -Infinity && h < best) best = h;
    }

    if (best === Infinity) return -Infinity;
    return xf.ptYToWoC(best);
  }

  function supportHeight(
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

    const ptX = xf.woCToPtX(x);
    const ptZ = xf.woCToPtZ(z);
    // Convert maxY from WoC Y to PT world Y for comparison.
    const ptMaxY = xf.woCToPtY(maxY);

    const cx = stageAreaCellX(ptX);
    const cz = stageAreaCellZ(ptZ);
    const cellIdx = cx * GRID + cz;
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
    return xf.ptYToWoC(best);
  }

  function floorHeight(x: number, z: number, refY: number): number {
    ensureData();
    const vertices = _vertices!;
    const walkFaces = _walkFaces!;
    const cellOffsets = _cellOffsets!;
    const cellCounts = _cellCounts!;
    const cellFaceIndices = _cellFaceIndices!;

    const ptX = xf.woCToPtX(x);
    const ptZ = xf.woCToPtZ(z);
    const ptRef = xf.woCToPtY(refY);

    const cx = stageAreaCellX(ptX);
    const cz = stageAreaCellZ(ptZ);
    const cellIdx = cx * GRID + cz;
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
    return xf.ptYToWoC(best);
  }

  // Dedup stamp: faces register into every cell their bbox touches, so the
  // 2x2 cell window can list one face up to four times (PT uses face->CalcSum
  // for the same purpose).
  let _wallStamp: Int32Array | null = null;
  let _wallStampCnt = 0;

  function wallHit(
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ez: number,
    destFloorY?: number,
  ): boolean {
    ensureData();
    const vertices = _vertices!;
    const walkFaces = _walkFaces!;
    const cellOffsets = _cellOffsets!;
    const cellCounts = _cellCounts!;
    const cellFaceIndices = _cellFaceIndices!;

    const px = xf.woCToPtX(sx);
    const py = xf.woCToPtY(sy);
    const pz = xf.woCToPtZ(sz);
    // Accepted destination floor in PT units (-Infinity when the move had
    // no legal floor, e.g. the swimmer path): activates step-aware
    // filtering below. PT never needed it — its ~1-2u per-frame dist kept
    // the sweep ~14u ahead, so a stair face past the destination was next
    // frame's problem. Our 20Hz tick sweeps ~10u plus the same 12u
    // lookahead, so the low/top lines cross (a) the accepted floor face
    // itself where it rises past feet+12 further uphill and (b) the next
    // step's faces in the brake zone — without filtering, every tick of a
    // stair climb reads as a wall and the walker zigzags up on the
    // half-distance slide retries.
    const floorPt =
      destFloorY !== undefined ? xf.woCToPtY(destFloorY) : -Infinity;
    const stepRef = Math.max(floorPt, py);
    const qx = xf.woCToPtX(ex);
    const qz = xf.woCToPtZ(ez);

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

    const cx0 = Math.floor((px - CELL) / CELL) & (GRID - 1);
    const cz0 = Math.floor((pz - CELL) / CELL) & (GRID - 1);

    for (let ci = 0; ci < 2; ci++) {
      for (let cj = 0; cj < 2; cj++) {
        const cellIdx =
          ((cx0 + ci) & (GRID - 1)) * GRID +
          ((cz0 + cj) & (GRID - 1));
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
          if (floorPt !== -Infinity) {
            const loY = Math.min(ay, by, cyv);
            const hiY = Math.max(ay, by, cyv);
            // A BOUNDED face rooted more than one Stage_StepHeight above
            // the level being moved at is the next flight's riser or a
            // low overhang lip, never a wall for this move. Taller spans
            // (bridge arches, hull tops, real ceilings) keep blocking —
            // their deflections are load-bearing for the path a walker
            // takes past stacked structures. Observed stair stringer faces
            // span up to ~1.6 step heights; structural blockers start at
            // ~1.9, so the bound sits between them.
            if (
              loY - stepRef > PT_STEP_HEIGHT_UNITS &&
              hiY - loY <= PT_STEP_HEIGHT_UNITS + 7
            ) {
              continue;
            }
            // While stepping up (accepted destination floor strictly above
            // the feet), a BOUNDED face whose top stays within one step
            // height (plus the authored-face slack observed in stair
            // strips) of that floor is the stair/terrain surface being
            // climbed — the same surface the floor rule just accepted —
            // not a wall. Two guards keep this from opening walls: on
            // level ground (floor == feet) bounded faces are curbs, banks
            // and guide rails whose deflections keep the walker on open
            // lanes, so the clause stays off; and a tall face rooted
            // below the floor whose top happens to crest near an elevated
            // floor (bridge edge ramps, parapet footings) is a wall, so
            // the span is bounded too. Walls, hulls, trunks, parapets and
            // cliffs fail one bound or the other and keep blocking.
            if (
              floorPt > py &&
              hiY - floorPt <= PT_STEP_HEIGHT_UNITS + 4 &&
              hiY - loY <= PT_STEP_HEIGHT_UNITS + 7
            ) {
              continue;
            }
          }
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

  function spawnY(x: number, z: number): number {
    const h = groundHeight(x, z);
    if (Number.isFinite(h)) return h;
    // Fallback: use a small offset above 0 if no surface found.
    return 0;
  }

  // -------------------------------------------------------------------------
  // Water surface query
  // -------------------------------------------------------------------------
  //
  // PT characters swim in authored water faces: the water faces (materials
  // classified non-walkable) carry a real surface height (~102 PT units for
  // the Ricarten harbor sheet). Without a water level, a seam hairline or an
  // authored channel reads as a bottomless hole in our movement kernel and
  // the player falls into the void. This index rasterizes each water face's
  // XZ bounding box into the same fixed 64-unit StageArea grid PT uses
  // (smStage3d.cpp getPolyAreas registers every face into all cells its bbox
  // touches), so a single-cell query is complete for containment.

  let _waterCellOffsets: Int32Array | null = null;
  let _waterCellCounts: Int16Array | null = null;
  let _waterCellFaces: Uint16Array | null = null;

  function ensureWaterIndex(): void {
    if (_waterCellOffsets !== null) return;
    ensureData();
    const vertices = _vertices!;
    const renderFaces = mod.PT_RENDER_FACES();
    const waterFaces = mod.PT_WATER_FACE_INDICES();

    const counts = new Int32Array(GRID * GRID);
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
        const cx0 = Math.floor(minX / CELL) & (GRID - 1);
        const cx1 = Math.floor(maxX / CELL) & (GRID - 1);
        const cz0 = Math.floor(minZ / CELL) & (GRID - 1);
        const cz1 = Math.floor(maxZ / CELL) & (GRID - 1);
        for (let cx = cx0; ; cx = (cx + 1) & (GRID - 1)) {
          for (let cz = cz0; ; cz = (cz + 1) & (GRID - 1)) {
            if (pass === 'count') counts[cx * GRID + cz]++;
            else _waterCellFaces![_waterCellOffsets![cx * GRID + cz] + --counts[cx * GRID + cz]] = i;
            if (cz === cz1) break;
          }
          if (cx === cx1) break;
        }
      }
    };

    register('count');
    _waterCellOffsets = new Int32Array(GRID * GRID).fill(-1);
    _waterCellCounts = new Int16Array(GRID * GRID);
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

  function waterLevel(x: number, z: number): number {
    ensureWaterIndex();
    const vertices = _vertices!;
    const renderFaces = mod.PT_RENDER_FACES();
    const waterFaces = mod.PT_WATER_FACE_INDICES();

    const ptX = xf.woCToPtX(x);
    const ptZ = xf.woCToPtZ(z);
    const cellIdx = stageAreaCellX(ptX) * GRID + stageAreaCellZ(ptZ);
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
    return xf.ptYToWoC(best);
  }

  return {
    groundHeight,
    supportHeight,
    floorHeight,
    wallHit,
    spawnY,
    waterLevel,
  };
}
