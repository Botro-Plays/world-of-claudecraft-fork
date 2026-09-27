// High-altitude cloud-sea resolution (Pillai / forever-fall pilai.smd).
//
// PT authors a floating town's surroundings as full-field sheets textured
// with cloud bitmaps (cloud01.bmp / cloud01-1.bmp) carrying the
// sMATS_SCRIPT_WATER wind script - the source reuses that script's slow
// planar sway for cloud drift - plus SCROLL-family TextureFormState. These
// sheets are NOT water: the field's own water classifier reports
// PT_N_WATER = 0 (they are opaque, Transparency 0) and the maplinks graph
// emits sea: null. Rendered as ordinary opaque materials they read as a
// flat blue plate - "water" - around the town.
//
// This module detects the authored cloud sea purely from the generated
// field data so the renderer can give it cloud semantics: brightness lift
// toward sunlit-cloud white, a melt into the fog colour beyond the field
// edge, and a far apron plane under the whole footprint so the horizon
// reads as a continuous cloud ocean.
//
// Detection is data-driven rather than id-keyed: a field qualifies when it
// has water-scripted cloud-textured materials whose faces span the bounds
// and sit below the town (a high cloud canopy would be a different
// feature). Today only pilai satisfies it.

import type { PtCloudSeaSpec, PtFieldModule } from './pt_field';

// sMATS_SCRIPT_WATER (0x200) on WindMeshBottom, masked to the script bits
// the source switch reads (smRend3d.cpp, WindMeshBottom & 0x7FF).
const PT_SCRIPT_WATER = 0x200;
const PT_SCRIPT_MASK = 0x7ff;

// The source names the cloud-sea bitmaps cloud*.bmp - the discriminator
// that separates Pillai's cloud sheets from its real water materials
// (sea_0.BMP pond, water_p.TGA fountains carry the same wind script).
const CLOUD_NAME_RE = /cloud/i;

// A cloud SEA is field-scale: sheets spanning less of the bounds on either
// axis are a local surface (a small cloud-textured prop/pond), not the
// floating-town horizon layer.
const CLOUD_SEA_SPAN_MIN = 0.6;

// The apron sits under the lowest authored cloud vertex so it never
// z-fights or eclipses the sheets it extends. ~0.9 WoC yd.
const APRON_DROP_PT = 24;

interface PtCloudMatStats {
  n: number;
  minY: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

const emptyStats = (): PtCloudMatStats => ({
  n: 0,
  minY: Infinity,
  minX: Infinity,
  maxX: -Infinity,
  minZ: Infinity,
  maxZ: -Infinity,
  minU: Infinity,
  maxU: -Infinity,
  minV: Infinity,
  maxV: -Infinity,
});

/**
 * Resolve a field's authored cloud sea, or null when the field has none.
 * Pure scan over the generated field data; the descriptor load binds the
 * result and the renderer consumes it without re-scanning.
 */
export function ptResolveCloudSea(field: PtFieldModule): PtCloudSeaSpec | null {
  const b = field.PT_BOUNDS;
  const cloudMats = field.PT_MATERIALS.filter(
    (m) =>
      (m.windMeshBottom & PT_SCRIPT_MASK) === PT_SCRIPT_WATER &&
      m.textureNames.some((n) => CLOUD_NAME_RE.test(n)),
  );
  if (cloudMats.length === 0) return null;

  const cloudSet = new Set(cloudMats.map((m) => m.index));
  const faces = field.PT_RENDER_FACES();
  const verts = field.PT_VERTICES();
  const uvs = field.PT_UVS();

  const stats = new Map<number, PtCloudMatStats>();
  let seaMinY = Infinity;
  let seaMinX = Infinity;
  let seaMaxX = -Infinity;
  let seaMinZ = Infinity;
  let seaMaxZ = -Infinity;

  for (let fi = 0; fi < field.PT_N_FACE; fi++) {
    const mi = faces[fi * 4 + 3];
    if (!cloudSet.has(mi)) continue;
    let s = stats.get(mi);
    if (!s) {
      s = emptyStats();
      stats.set(mi, s);
    }
    s.n++;
    for (let k = 0; k < 3; k++) {
      const vi = faces[fi * 4 + k];
      const x = verts[vi * 3];
      const y = verts[vi * 3 + 1];
      const z = verts[vi * 3 + 2];
      const u = uvs[fi * 6 + k];
      const v = uvs[fi * 6 + 3 + k];
      if (y < s.minY) s.minY = y;
      if (x < s.minX) s.minX = x;
      if (x > s.maxX) s.maxX = x;
      if (z < s.minZ) s.minZ = z;
      if (z > s.maxZ) s.maxZ = z;
      if (u < s.minU) s.minU = u;
      if (u > s.maxU) s.maxU = u;
      if (v < s.minV) s.minV = v;
      if (v > s.maxV) s.maxV = v;
      if (y < seaMinY) seaMinY = y;
      if (x < seaMinX) seaMinX = x;
      if (x > seaMaxX) seaMaxX = x;
      if (z < seaMinZ) seaMinZ = z;
      if (z > seaMaxZ) seaMaxZ = z;
    }
  }
  if (stats.size === 0) return null;

  // Field-scale span on BOTH axes: a cloud sea wraps the whole floating
  // field; a localized cloud-textured surface does not.
  const spanX = b.maxX - b.minX;
  const spanZ = b.maxZ - b.minZ;
  if (spanX > 0 && (seaMaxX - seaMinX) / spanX < CLOUD_SEA_SPAN_MIN) return null;
  if (spanZ > 0 && (seaMaxZ - seaMinZ) / spanZ < CLOUD_SEA_SPAN_MIN) return null;

  // A cloud sea lies below the town: its lowest vertex sits in the lower
  // half of the bounds. A canopy (cloud cover above the town) never dips
  // there. The mean is unusable for this: Pillai's sheets undulate hard,
  // so their average sits high even though the layer bottoms out deep.
  if (seaMinY > (b.minY + b.maxY) / 2) return null;

  // The apron texture comes from the dominant sheet (most faces) so the
  // extension continues the layer the eye actually reads.
  let apronMat = cloudMats[0];
  for (const m of cloudMats) {
    const n = stats.get(m.index)?.n ?? 0;
    if (n > (stats.get(apronMat.index)?.n ?? 0)) apronMat = m;
  }
  const ds = stats.get(apronMat.index)!;
  const uSpan = ds.maxX - ds.minX;
  const vSpan = ds.maxZ - ds.minZ;

  return {
    materialIndices: [...cloudSet].sort((a, c) => a - c),
    apronMaterialIndex: apronMat.index,
    apronPtY: seaMinY - APRON_DROP_PT,
    uScale: uSpan > 0 ? (ds.maxU - ds.minU) / uSpan : 0,
    vScale: vSpan > 0 ? (ds.maxV - ds.minV) / vSpan : 0,
    scrollForm: apronMat.textureFormState?.[0] ?? 0,
  };
}
