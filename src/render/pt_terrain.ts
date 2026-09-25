// PT Ricarten terrain renderer: builds a Three.js mesh from the real PT
// village-2 geometry, textured with the converted PT textures.
//
// The renderer reads the generated geometry data (vertices, faces, UVs,
// materials) and builds BufferGeometry meshes with per-face material
// groups. Each material group gets its own mesh material with the
// corresponding PT texture loaded from public/textures/pt-ricarten/.
//
// Water faces are rendered as a separate transparent mesh. Decorative
// transparent faces are also rendered separately. Neither has collision
// (collision is handled by src/sim/pt_ricarten_field.ts).
//
// Material fidelity follows the PT runtime rules (smTexture.cpp /
// smRend3d.cpp):
//  - Textures authored as .tga/.png carry an opacity map in PT
//    (MapOpacity=TRUE) and render with alpha-test >= 60/255 plus alpha
//    blend. BMP textures are opaque.
//  - Transparency != 0 draws the material in the rear (blended) list;
//    Transparency > 0.2 additionally disables z-write (ZWriteAuto).
//  - useState sMATS_SCRIPT_NOTVIEW (0x400) materials are never drawn
//    (invisible collision walls).
//  - WindMeshBottom script bits drive PT's per-vertex animation:
//    sMATS_SCRIPT_WINDZ1 (0x20) = cosine Z sway, sMATS_SCRIPT_WATER
//    (0x200) = position/time sin ripple. Both run in the vertex shader
//    off the shared uTime clock (see ptApplyVertexScript).
//
// The mesh is placed in the world at the PT band offset (see pt_band.ts).

import * as THREE from 'three';
import * as RICARTEN_FIELD from '../sim/pt_ricarten_field.generated';
import {
  PT_SCALE,
  ptXToWoC,
  ptYToWoC,
  ptZToWoC,
  woCToPtX,
  woCToPtY,
  woCToPtZ,
} from '../sim/pt_band';
import type {
  PtFieldGateLink,
  PtMapDescriptor,
  PtWarpGateLink,
} from '../sim/pt_field';
import { setDefaultPtMap } from '../sim/pt_field_active';
import { loadTexture } from './assets/loader';
import { sharedUniforms } from './gfx';
import {
  buildPtStageObjectsView,
  ptStageBandMatrixFor,
  type PtStageObjectsView,
} from './pt_stage_objects';
import { PT_STAGE_OBJECTS } from './pt_stage_objects.generated';

export interface PtTerrainView {
  group: THREE.Group;
  /** Advance animated stage objects to the shared uTime clock. */
  update(): void;
  dispose(): void;
}

const TEXTURE_BASE = '/textures/pt-ricarten/';

/**
 * The committed Ricarten terrain source: the generated village-2 field
 * module bound to its pt_band transform, its texture root, the compiled
 * v-ani stage objects, and the authored ocean horizon extension. This is
 * the production default; buildPtTerrainView() with no argument resolves
 * to exactly the pre-parameterization path.
 */
// Authored FieldGate/WarpGate records for the default binding, read from
// the generated package manifest so this descriptor is self-describing like
// every loadPtDevMap descriptor. Ricarten authors no outbound FieldGate -
// its fore-1 boundary is the AddGate2 reverse record the runtime
// symmetrizes; what it DOES author are the two WarpGates below (the wing
// gate and the field-57 exit), which go live once this descriptor is the
// default binding.
interface PtRicartenManifestGate {
  targetIndex: number;
  targetId?: string | null;
  x: number;
  z: number;
  y: number;
}
interface PtRicartenManifestWarp {
  x: number;
  z: number;
  y: number;
  size: number;
  height: number;
  limitLevel?: number;
  specialEffect?: number;
  exits?: PtRicartenManifestGate[];
}
interface PtRicartenManifest {
  manifest?: {
    gates?: PtRicartenManifestGate[];
    warpGates?: PtRicartenManifestWarp[];
    posWarpOut?: { x: number; y: number; z: number } | null;
    limitLevel?: number;
  };
}
const RICARTEN_MANIFEST = (
  import.meta.glob('../../generated/pt-maps/ricarten/manifest.json', {
    eager: true,
    import: 'default',
  }) as Record<string, PtRicartenManifest>
)['../../generated/pt-maps/ricarten/manifest.json'];

const RICARTEN_FIELD_GATES: PtFieldGateLink[] = (
  RICARTEN_MANIFEST?.manifest?.gates ?? []
).map((g) => ({
  targetIndex: g.targetIndex,
  targetId: g.targetId ?? null,
  x: g.x,
  z: g.z,
  y: g.y,
}));

const RICARTEN_WARP_GATES: PtWarpGateLink[] = (
  RICARTEN_MANIFEST?.manifest?.warpGates ?? []
).map((g) => ({
  x: g.x,
  z: g.z,
  y: g.y,
  size: g.size,
  height: g.height,
  limitLevel: g.limitLevel ?? 0,
  specialEffect: g.specialEffect ?? 0,
  exits: (g.exits ?? []).map((e) => ({
    targetIndex: e.targetIndex,
    targetId: e.targetId ?? null,
    x: e.x,
    z: e.z,
    y: e.y,
  })),
}));

export const PT_RICARTEN_SOURCE: PtMapDescriptor = {
  id: 'ricarten',
  field: RICARTEN_FIELD,
  transform: { ptXToWoC, ptYToWoC, ptZToWoC, woCToPtX, woCToPtY, woCToPtZ },
  textureBase: TEXTURE_BASE,
  stageObjects: { PT_STAGE_OBJECTS },
  oceanRing: true,
  fieldGates: RICARTEN_FIELD_GATES,
  warpGates: RICARTEN_WARP_GATES,
  posWarpOut: RICARTEN_MANIFEST?.manifest?.posWarpOut ?? null,
  limitLevel: RICARTEN_MANIFEST?.manifest?.limitLevel ?? 0,
};

// The production Ricarten binding is a real field-graph participant: the
// FieldGate watch can preload fore-1 at the authored seam and the WarpGate
// watch honors its authored triggers. Hosts that never import the render
// layer (server, bare sim tests) keep the descriptor-less fallback.
setDefaultPtMap(PT_RICARTEN_SOURCE);

function fieldMaterials(src: PtMapDescriptor): PtMaterialInfo[] {
  return src.field.PT_MATERIALS as unknown as PtMaterialInfo[];
}

// PT stores SMMAT_BLEND_ALPHA (1) as the default BlendType on every field
// material (smTexture.cpp sets it unconditionally unless the ASE overrides
// it), so BlendType cannot classify transparency. The engine's real
// discriminator is smMATERIAL::Transparency: Transparency > 0.1 is the
// translucent/water test used by the stage renderer (smStage3d.cpp).
export const PT_TRANSLUCENT_THRESHOLD = 0.1;

// PT alpha-test threshold: smRend3d sets NATIVE_PIPELINE_ALPHAREF to
// AlphaTestDepth = ALPHATESTDEPTH (60) with NATIVE_COMPARE_GREATEREQUAL.
export const PT_ALPHA_TEST_REF = 60 / 255;

// PT WindMeshBottom script bits (sMATS_SCRIPT_* in smRead3d.h).
export const PT_SCRIPT_WINDZ1 = 0x20;
export const PT_SCRIPT_WATER = 0x200;
// useState sMATS_SCRIPT_NOTVIEW (0x400): "wall:" materials are collision
// only and are never drawn by the PT renderer.
export const PT_SCRIPT_NOTVIEW = 0x400;

interface PtMaterialInfo {
  index: number;
  transparency: number;
  twoSide: boolean;
  useState: number;
  meshState: number;
  windMeshBottom: number;
  textureNames: string[];
}

export function ptMaterialIsTranslucent(
  mat: { transparency: number } | undefined,
): boolean {
  return mat !== undefined && mat.transparency > PT_TRANSLUCENT_THRESHOLD;
}

// PT MapOpacity rule (smTexture.cpp new_smCreateTexture): .tga and .png
// texture files load with an opacity map; the material then renders with
// alpha-test >= 60/255. BMP files are opaque.
export function ptMaterialHasOpacityMap(mat: PtMaterialInfo | undefined): boolean {
  const name = mat?.textureNames[0] ?? '';
  return /\.(tga|png)$/i.test(name);
}

export function ptMaterialIsHidden(mat: PtMaterialInfo | undefined): boolean {
  return mat !== undefined && (mat.useState & PT_SCRIPT_NOTVIEW) !== 0;
}

// ---------------------------------------------------------------------------
// PT vertex animation (smRend3d.cpp ::CalcRendVertex wind/water scripts)
// ---------------------------------------------------------------------------
//
// PT drives these from RendStatTime = wall-clock milliseconds. We reuse the
// renderer's shared uTime clock (seconds) and convert. Angles index into
// PT's 4096-entry sin/cos LUT (ANGLE_360 = 4096, values * 65536 fixed).
//
// WINDZ1 (0x20), smRend3d.cpp:729-737:
//   ttCnt = (t>>2)&0xFF; if (!(t>>10 & 1)) ttCnt = 255-ttCnt;
//   shift = GetCos[ttCnt+256] >> 5;   // +-8 PT units
//   z -= shift;                      // Z is not mirrored, same in WoC
//
// WATER (0x200), smRend3d.cpp:784-790:
//   rx = ((x<<3) + t)>>1;  rz = ((z<<3) + t)>>1;   // x,z = fixed-point vert
//   x += GetSin[rx & 4095] >> 4;                   // +-16 PT units
//   z += GetSin[rz & 4095] >> 4;
//   x is mirrored in WoC, so the x displacement is applied negated.

const PT_WINDZ1_AMPLITUDE_YD = (2048 / 256) * PT_SCALE; // 8 PT units -> yd
const PT_WATER_AMPLITUDE_YD = (4096 / 256) * PT_SCALE; // 16 PT units -> yd
const PT_ANGLE_SCALE = (Math.PI * 2) / 4096;

export type PtVertexScript = 'windz1' | 'water';

// Injects the PT vertex-displacement script into a material's vertex
// shader. `aPtXZ` (PT world x,z, mod-4 folded for fp32 precision) is only
// required by the water script; declare it only when present.
export function ptApplyVertexScript(
  material: THREE.Material,
  script: PtVertexScript,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPtTime = sharedUniforms.uTime;
    let inject: string;
    if (script === 'windz1') {
      inject = `
        float ptTc = mod(floor(uPtTime * 250.0), 256.0);
        float ptTf = mod(floor(uPtTime * 0.9765625), 2.0);
        ptTc = mix(255.0 - ptTc, ptTc, step(0.5, ptTf));
        transformed.z -= cos((ptTc + 256.0) * ${PT_ANGLE_SCALE}) * ${PT_WINDZ1_AMPLITUDE_YD};`;
    } else {
      inject = `
        float ptRx = floor(mod(mod(aPtXZ.x, 4.0) * 2048.0 + mod(uPtTime * 1000.0, 8192.0), 8192.0) * 0.5);
        float ptRz = floor(mod(mod(aPtXZ.y, 4.0) * 2048.0 + mod(uPtTime * 1000.0, 8192.0), 8192.0) * 0.5);
        transformed.x -= sin(mod(ptRx, 4096.0) * ${PT_ANGLE_SCALE}) * ${PT_WATER_AMPLITUDE_YD};
        transformed.z += sin(mod(ptRz, 4096.0) * ${PT_ANGLE_SCALE}) * ${PT_WATER_AMPLITUDE_YD};`;
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uPtTime;${script === 'water' ? '\nattribute vec2 aPtXZ;' : ''}`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${inject}`);
  };
  material.customProgramCacheKey = () => `pt-${script}`;
}

// ---------------------------------------------------------------------------
// Ocean ring horizon fade (visual only)
// ---------------------------------------------------------------------------
//
// The extended ocean ring reuses the real harbor water texture, so its ~22 yd
// tile repeats hundreds of times out to the horizon. The ring is static (its
// eight corner verts cannot carry the water ripple), so the eye catches the
// periodicity long before scene fog swallows it. This fade mixes the sampled
// texel toward the texture's own mean - the 1x1 mip, which is the exact
// baked riy-f030 x riy-w091 average - as box distance beyond the map-edge
// rectangle grows. Anchoring to the shoreline rect (not the camera) keeps the
// band a constant width all around the map: no radial ring, no moving
// gradient, and no seam where the ring meets the real edge water, which stays
// fully textured. The fade saturates below 1 so the far sea keeps a whisper
// of modulation rather than reading as a flat plate, and scene fog still owns
// the horizon beyond it (the band ends well inside the ~700 yd fog far).

const PT_OCEAN_FADE_START_YD = 60;  // yd past the map edge: fade begins
const PT_OCEAN_FADE_END_YD = 420;   // fully faded inside every fog far plane
const PT_OCEAN_FADE_MAX = 0.85;     // residual modulation under the fog

function ptApplyOceanHorizonFade(
  material: THREE.Material,
  center: THREE.Vector2,
  mapHalf: THREE.Vector2,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPtOceanFadeCenter = { value: center };
    shader.uniforms.uPtOceanFadeHalf = { value: mapHalf };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPtOceanXZ;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvPtOceanXZ = (modelMatrix * vec4(position, 1.0)).xz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vPtOceanXZ;
uniform vec2 uPtOceanFadeCenter;
uniform vec2 uPtOceanFadeHalf;`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	vec2 ptEdgeD = abs(vPtOceanXZ - uPtOceanFadeCenter) - uPtOceanFadeHalf;
	float ptOceanFade = smoothstep(${PT_OCEAN_FADE_START_YD.toFixed(1)}, ${PT_OCEAN_FADE_END_YD.toFixed(1)}, length(max(ptEdgeD, 0.0))) * ${PT_OCEAN_FADE_MAX};
	vec4 ptSeaMean = textureLod( map, vMapUv, 16.0 );
	diffuseColor *= vec4(mix(sampledDiffuseColor.rgb, ptSeaMean.rgb, ptOceanFade), sampledDiffuseColor.a);
#endif`,
      );
  };
  material.customProgramCacheKey = () => 'pt-ocean-horizon-fade';
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

// Build a typed-array view over the PT vertices, transformed into WoC
// coordinates through the source's pt_band transform (X mirrored to
// undo the DirectX left-handed -> Three.js right-handed chirality flip).
// The mirror reverses face winding; normals are recomputed post-transform,
// and the winding check against flat walkable faces confirms outward
// normals, so PT single-sided materials map to THREE.FrontSide.
function buildVertexBuffer(src: PtMapDescriptor): Float32Array {
  const vertices = src.field.PT_VERTICES();
  const out = new Float32Array(src.field.PT_N_VERTEX * 3);
  for (let i = 0; i < src.field.PT_N_VERTEX; i++) {
    const px = vertices[i * 3];
    const py = vertices[i * 3 + 1];
    const pz = vertices[i * 3 + 2];
    out[i * 3] = src.transform.ptXToWoC(px);
    out[i * 3 + 1] = src.transform.ptYToWoC(py);
    out[i * 3 + 2] = src.transform.ptZToWoC(pz);
  }
  return out;
}

interface PtFaceEmit {
  // non-indexed positions/uvs in WoC space
  positions: number[];
  uvs: number[];
  // PT world x,z (mod-4 folded) per emitted vertex, for the water script
  ptXZ: number[];
  groups: { material: number; start: number; count: number }[];
}

// Emit faces grouped by material. `faceFilter` selects which face indices
// enter the mesh. Hidden (NOTVIEW) materials are skipped entirely - PT
// never draws them.
function buildGroupedFaces(
  src: PtMapDescriptor,
  positions: Float32Array,
  faceFilter: (fi: number, mat: PtMaterialInfo | undefined) => boolean,
): PtFaceEmit {
  const renderFaces = src.field.PT_RENDER_FACES();
  const uvs = src.field.PT_UVS();
  const vertices = src.field.PT_VERTICES();
  const materials = fieldMaterials(src);
  const matByIdx = new Map(materials.map((m) => [m.index, m]));

  const facesByMaterial = new Map<number, number[]>();
  for (let fi = 0; fi < src.field.PT_N_FACE; fi++) {
    const matIdx = renderFaces[fi * 4 + 3];
    const mat = matByIdx.get(matIdx);
    if (ptMaterialIsHidden(mat)) continue;
    if (!faceFilter(fi, mat)) continue;
    if (!facesByMaterial.has(matIdx)) facesByMaterial.set(matIdx, []);
    facesByMaterial.get(matIdx)!.push(fi);
  }

  const out: PtFaceEmit = { positions: [], uvs: [], ptXZ: [], groups: [] };
  for (const [matIdx, faces] of facesByMaterial) {
    const start = out.positions.length / 3;
    for (const fi of faces) {
      const a = renderFaces[fi * 4];
      const b = renderFaces[fi * 4 + 1];
      const c = renderFaces[fi * 4 + 2];
      out.positions.push(
        positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2],
        positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2],
        positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2],
      );
      // UVs: PT uses V-flipped (v = 1 - v) per the ASE loader
      out.uvs.push(
        uvs[fi * 6], 1 - uvs[fi * 6 + 3],
        uvs[fi * 6 + 1], 1 - uvs[fi * 6 + 4],
        uvs[fi * 6 + 2], 1 - uvs[fi * 6 + 5],
      );
      // PT world x,z folded mod 4 (the water script's spatial phase only
      // depends on x mod 4: (x*2048 + t)>>1 & 4095 has period 4 in x).
      out.ptXZ.push(
        ((vertices[a * 3] % 4) + 4) % 4, ((vertices[a * 3 + 2] % 4) + 4) % 4,
        ((vertices[b * 3] % 4) + 4) % 4, ((vertices[b * 3 + 2] % 4) + 4) % 4,
        ((vertices[c * 3] % 4) + 4) % 4, ((vertices[c * 3 + 2] % 4) + 4) % 4,
      );
    }
    out.groups.push({ material: matIdx, start, count: faces.length * 3 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

// Load a PT texture by material index. The converter
// (scripts/pt-port/convert_pt_textures.ts) lowercases output filenames, so
// the basename must be lowercased here too (e.g. L-VV.tga -> l-vv.png).
// Ricarten-bound convenience kept for existing callers; parameterized
// sources resolve through textureUrlForSource.
export function textureUrlForMaterial(matIdx: number): string | null {
  return textureUrlForSource(PT_RICARTEN_SOURCE, matIdx);
}

function textureUrlForSource(src: PtMapDescriptor, matIdx: number): string | null {
  const mat = fieldMaterials(src).find((m) => m.index === matIdx);
  if (!mat || mat.textureNames.length === 0) return null;
  const name = mat.textureNames[0];
  const fileName = name.replace(/\\/g, '/').split('/').pop() || '';
  const baseName = fileName.replace(/\.[^.]+$/i, '').toLowerCase();
  return src.textureBase + baseName + '.png';
}

function textureUrlsForSource(src: PtMapDescriptor, matIdx: number): string[] {
  const mat = fieldMaterials(src).find((m) => m.index === matIdx);
  if (!mat) return [];
  return mat.textureNames.map((name) => {
    const fileName = name.replace(/\\/g, '/').split('/').pop() || '';
    const baseName = fileName.replace(/\.[^.]+$/i, '').toLowerCase();
    return src.textureBase + baseName + '.png';
  });
}

// PT renders multi-texture materials (SMTEX_TYPE_MULTIMIX) by modulating
// every stage: tex0 x tex1 x ... (smRend3d.cpp SetD3DRendState -> COLOROP
// MODULATE with ARG_CURRENT). Every stage's TexLink chain carries identical
// UVs in village-2 (verified: all 1751 chained pairs match), so the product
// bakes into one canvas texture. This matters most for the sea: its slots
// are riy-f030 (pale sky/cloud sheet) x riy-w091 (teal water). Drawing
// tex0 alone - which a single-texture pipeline does - leaves a washed-out
// cloud layer; the multiply restores the intended dark teal water.
async function bakeMultiTexture(
  textures: (THREE.Texture | null)[],
): Promise<THREE.Texture | null> {
  const imgs = textures
    .map((t) => t?.image as { width: number; height: number } | undefined)
    .filter(
      (im): im is { width: number; height: number } =>
        !!im && im.width > 0,
    ) as (HTMLImageElement | HTMLCanvasElement | ImageBitmap)[];
  if (imgs.length === 0) return null;
  // Single usable image, or no DOM (vitest): caller falls back to textures[0].
  if (imgs.length === 1 || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = imgs[0].width;
  canvas.height = imgs[0].height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(imgs[0], 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 1; i < imgs.length; i++) {
    ctx.drawImage(imgs[i], 0, 0, canvas.width, canvas.height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // CanvasTexture flipY=true matches TextureLoader's default upload
  // orientation, keeping the existing 1-v UV convention.
  return tex;
}

async function loadPtTexture(
  src: PtMapDescriptor,
  matIdx: number,
  textureCache: Map<string, THREE.Texture | null>,
): Promise<THREE.Texture | null> {
  const urls = textureUrlsForSource(src, matIdx);
  if (urls.length === 0) return null;
  const cacheKey = urls.join('|');
  if (!textureCache.has(cacheKey)) {
    const textures = await Promise.all(
      urls.map((u) =>
        loadTexture(u, { srgb: true, repeat: true }).catch(() => null),
      ),
    );
    let tex: THREE.Texture | null = textures.find((t) => t !== null) ?? null;
    if (urls.length > 1 && textures.filter(Boolean).length > 1) {
      const baked = await bakeMultiTexture(textures);
      if (baked) tex = baked;
    }
    textureCache.set(cacheKey, tex);
  }
  return textureCache.get(cacheKey)!;
}

// Build the Three.js material for a PT material group following the PT
// runtime rules documented in the header.
function makePtMaterial(
  ptMat: PtMaterialInfo | undefined,
  texture: THREE.Texture | null,
): THREE.MeshLambertMaterial {
  const transparency = ptMat?.transparency ?? 0;
  const opacityMap = ptMaterialHasOpacityMap(ptMat);
  const mat = new THREE.MeshLambertMaterial({
    side: ptMat?.twoSide === false ? THREE.FrontSide : THREE.DoubleSide,
    map: texture ?? null,
  });
  // MapOpacity -> alpha test at ref 60/255 with alpha blend (PT rear list).
  // Transparency != 0 also blends; Transparency > 0.2 disables z-write.
  if (opacityMap) mat.alphaTest = PT_ALPHA_TEST_REF;
  if (opacityMap || transparency > 0) {
    mat.transparent = true;
    mat.opacity = Math.min(1, Math.max(0, 1 - transparency));
    mat.depthWrite = transparency <= 0.2;
  }
  const script = ptMat?.windMeshBottom ?? 0;
  if ((script & PT_SCRIPT_WATER) !== 0) ptApplyVertexScript(mat, 'water');
  else if ((script & PT_SCRIPT_WINDZ1) !== 0) ptApplyVertexScript(mat, 'windz1');
  return mat;
}

// Build one mesh from grouped faces: one geometry, per-material groups.
async function buildGroupedMesh(
  src: PtMapDescriptor,
  name: string,
  emit: PtFaceEmit,
  textureCache: Map<string, THREE.Texture | null>,
  outMaterials: THREE.Material[],
  needsPtXZ: boolean,
): Promise<THREE.Mesh | null> {
  if (emit.positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(emit.positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(emit.uvs, 2));
  if (needsPtXZ) geo.setAttribute('aPtXZ', new THREE.Float32BufferAttribute(emit.ptXZ, 2));
  geo.computeVertexNormals();

  const materials: THREE.Material[] = [];
  const matByIdx = new Map(fieldMaterials(src).map((m) => [m.index, m]));
  for (const g of emit.groups) {
    const texture = await loadPtTexture(src, g.material, textureCache);
    const m = makePtMaterial(matByIdx.get(g.material), texture);
    m.name = `pt-mat-${g.material}`;
    materials.push(m);
    geo.addGroup(g.start, g.count, materials.length - 1);
  }

  const mesh = new THREE.Mesh(geo, materials);
  mesh.name = name;
  outMaterials.push(...materials);
  return mesh;
}

export async function buildPtTerrainView(
  src: PtMapDescriptor = PT_RICARTEN_SOURCE,
): Promise<PtTerrainView> {
  const group = new THREE.Group();
  group.name = `pt-${src.id}-terrain`;

  const positions = buildVertexBuffer(src);
  const waterSet = new Set<number>();
  const waterIndices = src.field.PT_WATER_FACE_INDICES();
  for (let i = 0; i < waterIndices.length; i++) waterSet.add(waterIndices[i]);
  const decoSet = new Set<number>();
  const decoIndices = src.field.PT_DECORATIVE_FACE_INDICES();
  for (let i = 0; i < decoIndices.length; i++) decoSet.add(decoIndices[i]);

  const textureCache = new Map<string, THREE.Texture | null>();
  const allMaterials: THREE.Material[] = [];
  const meshes: THREE.Mesh[] = [];

  // Solid path: everything PT draws as opaque or cutout (transparency <= 0.1
  // and not water). This covers walkable terrain plus opaque decorative
  // faces; TGA/PNG materials get alpha-test per the MapOpacity rule.
  const solidEmit = buildGroupedFaces(
    src,
    positions,
    (fi, mat) => !waterSet.has(fi) && !ptMaterialIsTranslucent(mat),
  );
  const solidMesh = await buildGroupedMesh(
    src,
    `pt-${src.id}-solid`,
    solidEmit,
    textureCache,
    allMaterials,
    false,
  );
  if (solidMesh) meshes.push(solidMesh);

  // Water path: the KNOWN_WATER_MATS face set. Textured per material,
  // blended with opacity = 1 - transparency, z-write off (>0.2), and the
  // PT water vertex ripple on sMATS_SCRIPT_WATER materials.
  const waterEmit = buildGroupedFaces(src, positions, (fi) => waterSet.has(fi));
  const waterMesh = await buildGroupedMesh(
    src,
    `pt-${src.id}-water`,
    waterEmit,
    textureCache,
    allMaterials,
    true,
  );
  if (waterMesh) meshes.push(waterMesh);

  // Decorative translucent path: non-water faces whose material is
  // translucent (transparency > 0.1).
  const decoEmit = buildGroupedFaces(
    src,
    positions,
    (fi, mat) => !waterSet.has(fi) && decoSet.has(fi) && ptMaterialIsTranslucent(mat),
  );
  const decoMesh = await buildGroupedMesh(
    src,
    `pt-${src.id}-decorative`,
    decoEmit,
    textureCache,
    allMaterials,
    false,
  );
  if (decoMesh) meshes.push(decoMesh);

  for (const m of meshes) group.add(m);

  // Visual ocean extension. Every map-boundary vertex sits exactly at the
  // Ricarten sea level (PT-Y ~102), so the playable map is a sea-bound
  // rectangle: past the edge is void, which is what exposes the map corner
  // and the busy HDRI ocean imagery below the horizon. This ring fills that
  // void with a calm sea surface from the map edge out to beyond any
  // camera-far distance, so the horizon reads as open water dissolving into
  // fog instead of a rectangular cutoff.
  //
  // The ring is a ShapeGeometry with a rectangular hole inset a few yards
  // inside the terrain rect, so it never overlaps the real terrain, harbor
  // seabed, or PT water faces (collision and rendering inside the map are
  // untouched). The surface sits a hair below the real sea surface so the
  // overlap band under the map-edge water cannot z-fight. It is visual only:
  // no collision, no gameplay surface, and its outer edge lands past the fog
  // far plane where it converges to the fog color.
  //
  // Ricarten-only: the ring's sea level (PT-Y ~102) and harbor material are
  // authored for village-2, so dev-harness sources skip this block entirely
  // rather than drawing a fabricated sea under a map that does not declare one.
  if (src.oceanRing) {
    const oceanHalf = 4000; // yd from map center; past every camera far plane
    const holeInset = 3;    // yd: ring overlaps the map-edge water strip
    const seaDrop = 0.2;    // yd below sea level, avoids z-fighting
    const x0 = src.transform.ptXToWoC(src.field.PT_BOUNDS.maxX);
    const x1 = src.transform.ptXToWoC(src.field.PT_BOUNDS.minX);
    const z0 = src.transform.ptZToWoC(src.field.PT_BOUNDS.minZ);
    const z1 = src.transform.ptZToWoC(src.field.PT_BOUNDS.maxZ);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const outer = new THREE.Shape();
    outer.moveTo(-oceanHalf, -oceanHalf);
    outer.lineTo(oceanHalf, -oceanHalf);
    outer.lineTo(oceanHalf, oceanHalf);
    outer.lineTo(-oceanHalf, oceanHalf);
    outer.closePath();
    const hole = new THREE.Path();
    const hx0 = x0 - cx + holeInset;
    const hx1 = x1 - cx - holeInset;
    const hz0 = z0 - cz + holeInset;
    const hz1 = z1 - cz - holeInset;
    hole.moveTo(hx0, hz0);
    hole.lineTo(hx1, hz0);
    hole.lineTo(hx1, hz1);
    hole.lineTo(hx0, hz1);
    hole.closePath();
    outer.holes.push(hole);
    const oceanGeo = new THREE.ShapeGeometry(outer);
    oceanGeo.rotateX(-Math.PI / 2); // XY shape -> flat XZ surface facing up
    // Texture the ring with the real harbor water material (107: the baked
    // riy-f030 x riy-w091 multimix) at the same world-space texel density as
    // the SMD water faces (~0.0017 uv per PT unit, ~22 yd per tile), and the
    // same 1-transparency opacity over the shared deep-sea plane. The
    // distant sea then keeps the water's own modulation and composite tone
    // instead of reading as a flat plate beside textured water. The water
    // vertex ripple is skipped on purpose: eight corner verts thousands of
    // yards apart cannot ripple, and the script would need aPtXZ.
    {
      const posA = oceanGeo.getAttribute('position');
      const uvA = oceanGeo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < posA.count; i++) {
        uvA.setXY(
          i,
          src.transform.woCToPtX(cx + posA.getX(i)) * 0.00163,
          src.transform.woCToPtZ(cz + posA.getZ(i)) * 0.00209,
        );
      }
      uvA.needsUpdate = true;
    }
    const seaMat = fieldMaterials(src).find((m) =>
      m.textureNames.some((n) => n.toLowerCase().endsWith('riy-w091.bmp')),
    );
    // Multimix needs the DOM canvas bake; outside the browser (vitest, SSR)
    // keep the flat fallback color.
    const seaTex =
      seaMat && typeof document !== 'undefined'
        ? await loadPtTexture(src, seaMat.index, textureCache)
        : null;
    const oceanMat = new THREE.MeshLambertMaterial({
      map: seaTex,
      color: seaTex ? 0xffffff : 0x2e6b78,
      transparent: seaMat !== undefined,
      opacity: seaMat ? Math.min(1, Math.max(0, 1 - seaMat.transparency)) : 1,
      depthWrite: false, // transparency > 0.2 disables z-write (ZWriteAuto)
      fog: true,
    });
    // Fade the tiled water texel toward its own mean with distance beyond the
    // map edge (see ptApplyOceanHorizonFade). Only when the sea texture
    // loaded: without a map there is no pattern to fade.
    if (seaTex) {
      seaTex.generateMipmaps = true;
      seaTex.minFilter = THREE.LinearMipmapLinearFilter;
      ptApplyOceanHorizonFade(
        oceanMat,
        new THREE.Vector2(cx, cz),
        new THREE.Vector2(Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2),
      );
    }
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.name = `pt-${src.id}-ocean`;
    oceanMesh.position.set(cx, src.transform.ptYToWoC(102) - seaDrop, cz);
    oceanMesh.matrixAutoUpdate = false;
    oceanMesh.updateMatrix();
    group.add(oceanMesh);
    meshes.push(oceanMesh);
    allMaterials.push(oceanMat);

    // Deep-sea blocker: a second opaque plane covering the whole footprint a
    // half yard below the map's lowest geometry. The real PT water surface
    // is ~71% opaque, so the 29% see-through used to land on the sky dome's
    // cloudy below-horizon imagery wherever no seabed exists - the source of
    // the giant pale cloud formations on the sea. With this underneath, the
    // see-through reads as deep calm water instead. Terrain and the harbor
    // seabed still render above it where they exist, and it stays under the
    // ocean ring outside the map, so it changes nothing collision-wise.
    const deepGeo = new THREE.PlaneGeometry(oceanHalf * 2, oceanHalf * 2);
    deepGeo.rotateX(-Math.PI / 2);
    const deepMat = new THREE.MeshLambertMaterial({
      color: 0x173f52, // deep water: darker shade of the ring color
      fog: true,
    });
    const deepMesh = new THREE.Mesh(deepGeo, deepMat);
    deepMesh.name = `pt-${src.id}-deepsea`;
    deepMesh.position.set(cx, -0.5, cz);
    deepMesh.matrixAutoUpdate = false;
    deepMesh.updateMatrix();
    group.add(deepMesh);
    meshes.push(deepMesh);
    allMaterials.push(deepMat);
  }

  // Stage objects (v-ani01..14: windmills, carts, fountains on Ricarten).
  // field.cpp registers the map's objects for the field; node transforms
  // carry absolute map positions, so they land in place with no extra
  // offset. Maps whose package has no stage_objects.generated.ts report
  // stageObjects=null and skip this block entirely.
  let stageView: PtStageObjectsView | null = null;
  try {
    stageView = await buildPtStageObjectsView(
      src.stageObjects
        ? {
            id: src.id,
            objects: src.stageObjects.PT_STAGE_OBJECTS,
            bandMatrix: ptStageBandMatrixFor(src.transform),
            textureBase: src.textureBase,
          }
        : undefined,
    );
    group.add(stageView.group);
  } catch {
    stageView = null;
  }

  return {
    group,
    update() {
      stageView?.update();
    },
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of mats) mm.dispose();
      }
      for (const t of textureCache.values()) t?.dispose();
      stageView?.dispose();
    },
  };
}
