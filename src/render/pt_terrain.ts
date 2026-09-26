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
//  - A material with no texture and no anim frames is never drawn at all
//    (RenderD3D returns FALSE); an authored-but-missing texture file still
//    registers a handle and is drawn untextured.
//  - WindMeshBottom drives per-vertex scripts via an exact-value switch on
//    (WindMeshBottom & 0x7FF): WINDZ1 0x20 and WINDX1 0x80 sway +-8 PT
//    units; WINDZ2 0x40 and WINDX2 0x100 sway +-32; WATER 0x200 is a
//    position/time sin ripple (see ptVertexScriptFor/ptApplyShaderHooks).
//    Composite ASE tag residues (0x9, 0xb) match no case and stay rigid.
//  - SMTEX_TYPE_ANIMATION materials bind the smAnimTexture flipbook at
//    stage 0, frame = (RendStatTime >> Shift_FrameSpeed) & FrameMask,
//    advanced per frame inside the shared texture cache (no refetch,
//    no decode, no material churn - see ptTickTextureAnims).
//  - Authored sDef_Color vertex colors bake once with the field gouraud
//    shade (SetVertexShade: n.VectLight/Contrast + Bright) into a color
//    attribute that modulates the texture, matching PT's bCol stream
//    slot (see pt_vertex_shade.ts).
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
} from './pt_stage_objects';
import { PT_STAGE_OBJECTS } from './pt_stage_objects.generated';
import { ptBakeVertexShade, ptVertexColorsOnly } from './pt_vertex_shade';

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

// PT WindMeshBottom script bits (sMATS_SCRIPT_* in smRead3d.h). The source
// renderer switches on the exact value (WindMeshBottom & 0x7FF), so
// composite residues like the ASE anim-tag bits (0x9, 0xb) produce no
// vertex displacement at all.
export const PT_SCRIPT_WINDZ1 = 0x20;
export const PT_SCRIPT_WINDZ2 = 0x40;
export const PT_SCRIPT_WINDX1 = 0x80;
export const PT_SCRIPT_WINDX2 = 0x100;
export const PT_SCRIPT_WATER = 0x200;
// smMATERIAL::TextureType (smTexture.cpp): multimix modulates every stage;
// ANIMATION binds smAnimTexture[cnt] alone.
export const PT_TEX_TYPE_ANIMATION = 0x1;
// smMATERIAL::AnimationFrame marker for self-playing flipbooks.
export const PT_ANIM_AUTO = 0x100;
// useState sMATS_SCRIPT_NOTVIEW (0x400): "wall:" materials are collision
// only and are never drawn by the PT renderer.
export const PT_SCRIPT_NOTVIEW = 0x400;
// smMATERIAL::BlendType SMMAT_BLEND_LAMP (0x04): SRCBLEND=SRCALPHA /
// DESTBLEND=ONE additive glow (smRend3d.cpp SetD3DRendStateBlend). PT
// stores SMMAT_BLEND_ALPHA (1) as the default on every field material.
export const PT_BLEND_LAMP = 0x04;
// smTEXSTATE_FS_* TextureFormState codes (smType.h) the stage renderer
// honours. NONE/FORMX/FORMY/FORMZ emit plain u,v; REFLEX is an env-map
// projection no converted field uses; the SCROLL family adds a time ramp
// to u (v never scrolls). SCROLL2..10 multiply the ramp by (state-4);
// SCROLLSLOW1..4 restretch it over a 16-bit mask period.
export const PT_FORM_SCROLL = 4;
export const PT_FORM_SCROLL2_MIN = 6;
export const PT_FORM_SCROLL10_MAX = 14;
export const PT_FORM_SCROLLSLOW_MIN = 15;
export const PT_FORM_SCROLLSLOW_MAX = 18;
// TextureStageState ops that reach the renderer: 0/absent = MODULATE
// (tex_n x current), 7 = NATIVE_TEXTURE_OP_ADD (tex_n + current).
export const PT_STAGE_OP_ADD = 7;

interface PtMaterialInfo {
  index: number;
  transparency: number;
  blendType?: number;
  twoSide: boolean;
  useState: number;
  meshState: number;
  windMeshBottom: number;
  textureType?: number;
  textureNames: string[];
  textureStageState?: number[];
  textureFormState?: number[];
  animTexCounter?: number;
  animTextureNames?: string[];
  frameMask?: number;
  shiftFrameSpeed?: number;
  animationFrame?: number;
}

export function ptMaterialIsTranslucent(
  mat: { transparency: number } | undefined,
): boolean {
  return mat !== undefined && mat.transparency > PT_TRANSLUCENT_THRESHOLD;
}

// PT MapOpacity rule (smTexture.cpp new_smCreateTexture): .tga and .png
// texture files load with an opacity map; the material then renders with
// alpha-test >= 60/255. BMP files are opaque. For animated materials the
// bound stage-0 texture is the animation frame (SMTEX_TYPE_ANIMATION),
// so the anim frame's own format decides, not the base slot.
export function ptMaterialHasOpacityMap(
  mat: PtMaterialInfo | { textureNames: string[]; animTextureNames?: string[]; textureType?: number } | undefined,
): boolean {
  const name =
    mat?.textureType === PT_TEX_TYPE_ANIMATION && (mat.animTextureNames?.length ?? 0) > 0
      ? mat.animTextureNames![0]
      : mat?.textureNames[0] ?? '';
  return /\.(tga|png)$/i.test(name);
}

export function ptMaterialIsHidden(mat: PtMaterialInfo | undefined): boolean {
  return mat !== undefined && (mat.useState & PT_SCRIPT_NOTVIEW) !== 0;
}

// smMATERIAL::RenderD3D first line: `if (!TextureCounter && !AnimTexCounter)
// return FALSE;` - a material with no base texture and no animation frames
// is never drawn by the PT renderer at all. Distinct from an authored-but-
// missing texture file, which still registers a texture handle at load and
// IS drawn (the ~1560 client-copy gaps keep their geometry, flat-shaded).
export function ptMaterialIsUndrawn(
  mat: { textureNames: string[]; animTextureNames?: string[] } | undefined,
): boolean {
  return (
    mat !== undefined &&
    mat.textureNames.length === 0 &&
    (mat.animTextureNames?.length ?? 0) === 0
  );
}

// smRend3d.cpp case SMTEX_TYPE_ANIMATION: the material binds
// smAnimTexture[cnt] instead of the base texture slots.
export function ptMaterialIsAnimated(
  mat:
    | { textureType?: number; animTexCounter?: number; animTextureNames?: string[] }
    | undefined,
): boolean {
  return (
    mat !== undefined &&
    mat.textureType === PT_TEX_TYPE_ANIMATION &&
    (mat.animTexCounter ?? mat.animTextureNames?.length ?? 0) > 0
  );
}

// ---------------------------------------------------------------------------
// PT vertex animation (smRend3d.cpp ::CalcRendVertex wind/water scripts)
// ---------------------------------------------------------------------------
//
// PT drives these from RendStatTime = wall-clock milliseconds. We reuse the
// renderer's shared uTime clock (seconds) and convert. Angles index into
// PT's 4096-entry sin/cos LUT (ANGLE_360 = 4096, values * 65536 fixed).
//
// WIND channels share one triangle wave (smRend3d.cpp AddStageVertex,
// switch on WindMeshBottom & 0x7FF):
//   ttCnt = (t>>2)&0xFF; if (!(t>>10 & 1)) ttCnt = 255-ttCnt;
//   shift = GetCos[ttCnt+256] >> 5;   // *1 variants: +-8 PT units
//   shift = GetCos[ttCnt+256] >> 3;   // *2 variants: +-32 PT units
//   WINDX*: x -= shift;   WINDZ*: z -= shift;
// PT x is mirrored into WoC, so the X displacement lands positive.
//
// WATER (0x200), smRend3d.cpp:784-790:
//   rx = ((x<<3) + t)>>1;  rz = ((z<<3) + t)>>1;   // x,z = fixed-point vert
//   x += GetSin[rx & 4095] >> 4;                   // +-16 PT units
//   z += GetSin[rz & 4095] >> 4;
//   x is mirrored in WoC, so the x displacement is applied negated.

const PT_WIND1_AMPLITUDE_YD = (2048 / 256) * PT_SCALE; // >>5: 8 PT units -> yd
const PT_WIND2_AMPLITUDE_YD = (8192 / 256) * PT_SCALE; // >>3: 32 PT units -> yd
const PT_WATER_AMPLITUDE_YD = (4096 / 256) * PT_SCALE; // 16 PT units -> yd
const PT_ANGLE_SCALE = (Math.PI * 2) / 4096;

export type PtVertexScript = 'windz1' | 'windz2' | 'windx1' | 'windx2' | 'water';

// smRend3d.cpp switches on the exact WindMeshBottom value (masked to the
// 0x7FF script bits); composite residues like 0x9 (ASE WIND|ANIM8) hit no
// case and stay rigid, so this is an equality table, not a bitmask test.
export function ptVertexScriptFor(script: number): PtVertexScript | null {
  switch (script & 0x7ff) {
    case PT_SCRIPT_WINDZ1:
      return 'windz1';
    case PT_SCRIPT_WINDZ2:
      return 'windz2';
    case PT_SCRIPT_WINDX1:
      return 'windx1';
    case PT_SCRIPT_WINDX2:
      return 'windx2';
    case PT_SCRIPT_WATER:
      return 'water';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// PT texture-form UV scroll (smRend3d.cpp ::SetD3DRendBuff, TextureFormState)
// ---------------------------------------------------------------------------
//
// Per texture stage the source adds a sawtooth ramp to u before sampling
// (v never scrolls), with RendStatTime = wall-clock milliseconds:
//   wtime  = (RendStatTime >> 6) & 0xFF
//   fwtime = wtime / 256                          (~16.4 s period)
//   SCROLL          (4):     u += fwtime
//   SCROLL2..10     (6..14): u += fwtime * (state - 4)
//   SCROLLSLOW1..4  (15..18): mask = 0xFFFF >> (22 - state);
//                             u += ((RendStatTime>>6) & mask) / mask
// Each stage samples through its own offset, so a two-stage MULTIMIX with
// [SCROLL3, SCROLL5] (fore-2's river) produces the differential
// interference PT authored. Every converted field's chained texlink pairs
// share identical per-stage UVs (verified), so one uv attribute plus
// per-stage offsets reproduces the motion with no extra vertex data.

/** Pure scroll rule: the u offset a TextureFormState code produces at
 *  `timeMs` (wall-clock ms, matching RendStatTime). Exported for tests. */
export function ptFormScrollU(formState: number, timeMs: number): number {
  const t = Math.floor(timeMs) >> 6;
  if (formState === PT_FORM_SCROLL) return (t & 0xff) / 256;
  if (formState >= PT_FORM_SCROLL2_MIN && formState <= PT_FORM_SCROLL10_MAX) {
    return ((t & 0xff) / 256) * (formState - PT_FORM_SCROLL);
  }
  if (formState >= PT_FORM_SCROLLSLOW_MIN && formState <= PT_FORM_SCROLLSLOW_MAX) {
    const mask = 0xffff >>> (PT_FORM_SCROLLSLOW_MAX + 4 - formState);
    return (t & mask) / mask;
  }
  return 0;
}

// The GLSL twin of ptFormScrollU with the per-material form code baked in.
// uPtTime is the shared seconds clock; (ms >> 6) = floor(uPtTime * 15.625).
function ptScrollUOffsetGlsl(formState: number): string {
  const ramp = 'mod(floor(uPtTime * 15.625), 256.0)';
  if (formState === PT_FORM_SCROLL) return `((${ramp}) * 0.00390625)`;
  if (formState >= PT_FORM_SCROLL2_MIN && formState <= PT_FORM_SCROLL10_MAX) {
    return `((${ramp}) * ${(formState - PT_FORM_SCROLL) / 256})`;
  }
  if (formState >= PT_FORM_SCROLLSLOW_MIN && formState <= PT_FORM_SCROLLSLOW_MAX) {
    const mask = 0xffff >>> (PT_FORM_SCROLLSLOW_MAX + 4 - formState);
    return `(mod(floor(uPtTime * 15.625), ${mask + 1}.0) * ${1 / mask})`;
  }
  return '0.0';
}

/**
 * The texture-stage split a material's shader carries. `map` is the first
 * (or only) stage contribution; `stage1` binds to the uPtMap1 sampler when
 * a second contribution must sample independently (a live scroll/op stage,
 * or the baked product of the static stages around one). Ops follow the
 * PT stage ops: 0 = modulate (tex x current), PT_STAGE_OP_ADD = add.
 */
export interface PtUvFormBinding {
  stage1: THREE.Texture | null;
  scroll0: number;
  op0: number;
  scroll1: number;
  op1: number;
}

// A stage is "live" when its contribution cannot bake into the static
// multimix product: a nonzero TextureFormState (scroll) or a nonzero
// TextureStageState (non-modulate mix op). Returns the live stage indices
// in order, [] for fully static materials, and null when the two-sampler
// runtime path cannot express the set (a live stage at index >= 2, more
// than two live stages, or two live stages plus static stages left over -
// none of which any converted field authors).
export function ptLiveStages(
  mat:
    | { textureNames: string[]; textureStageState?: number[]; textureFormState?: number[] }
    | undefined,
): number[] | null {
  const n = mat?.textureNames.length ?? 0;
  const live: number[] = [];
  for (let i = 0; i < n; i++) {
    if ((mat?.textureFormState?.[i] ?? 0) !== 0 || (mat?.textureStageState?.[i] ?? 0) !== 0) {
      live.push(i);
    }
  }
  if (live.length === 0) return [];
  const statics = n - live.length;
  if (live.length > 2 || live[live.length - 1] > 1 || (live.length === 2 && statics > 0)) {
    return null;
  }
  return live;
}

// The shared wind triangle wave: ttCnt (ms>>2)&0xFF counts up then down on
// the (ms>>10)&1 toggle. Injected once per wind material.
const PT_WIND_TRIANGLE_GLSL = `
        float ptTc = mod(floor(uPtTime * 250.0), 256.0);
        float ptTf = mod(floor(uPtTime * 0.9765625), 2.0);
        ptTc = mix(255.0 - ptTc, ptTc, step(0.5, ptTf));
        float ptWindShift = cos((ptTc + 256.0) * ${PT_ANGLE_SCALE});`;

// Installs the shared PT Lambert shader patch: the optional vertex
// displacement script plus the hemisphere fill lift. Every PT material is a
// MeshLambertMaterial, which never samples the scene IBL, so under the
// standard-materials rig it would sit on that rig's deliberately weak
// hemisphere alone. The WoC Lambert terrain fixes exactly that with
// uWocFillBoost (terrain.ts buildLambertMaterial), riding the eased
// uTerrainFillBoost the renderer derives from outdoor_light_rig_core.ts.
// PT materials bind the SAME uniform object, so the connected world gets
// the identical Lambert fill the WoC ground does: 1 under the Lambert rig
// or an interior state, the Lambert/standard hemisphere ratio under the
// standard rig. The lift multiplies hemisphere irradiance only, so the sun
// term, shadows, and the Phase 5C vertex shading stay untouched, and being
// a uniform (not a material-color mutation) it cannot accumulate across
// field installs.
// `aPtXZ` (PT world x,z, mod-4 folded for fp32 precision) is only
// required by the water script; declare it only when present.
export function ptApplyShaderHooks(
  material: THREE.Material,
  script: PtVertexScript | null,
  uvFx?: PtUvFormBinding,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPtTime = sharedUniforms.uTime;
    shader.uniforms.uWocFillBoost = sharedUniforms.uTerrainFillBoost;
    if (uvFx?.stage1) shader.uniforms.uPtMap1 = { value: uvFx.stage1 };
    let inject = '';
    if (script === 'water') {
      inject = `
        float ptRx = floor(mod(mod(aPtXZ.x, 4.0) * 2048.0 + mod(uPtTime * 1000.0, 8192.0), 8192.0) * 0.5);
        float ptRz = floor(mod(mod(aPtXZ.y, 4.0) * 2048.0 + mod(uPtTime * 1000.0, 8192.0), 8192.0) * 0.5);
        transformed.x -= sin(mod(ptRx, 4096.0) * ${PT_ANGLE_SCALE}) * ${PT_WATER_AMPLITUDE_YD};
        transformed.z += sin(mod(ptRz, 4096.0) * ${PT_ANGLE_SCALE}) * ${PT_WATER_AMPLITUDE_YD};`;
    } else if (script === 'windz1') {
      inject = `${PT_WIND_TRIANGLE_GLSL}
        transformed.z -= ptWindShift * ${PT_WIND1_AMPLITUDE_YD};`;
    } else if (script === 'windz2') {
      inject = `${PT_WIND_TRIANGLE_GLSL}
        transformed.z -= ptWindShift * ${PT_WIND2_AMPLITUDE_YD};`;
    } else if (script === 'windx1') {
      inject = `${PT_WIND_TRIANGLE_GLSL}
        transformed.x += ptWindShift * ${PT_WIND1_AMPLITUDE_YD};`;
    } else if (script === 'windx2') {
      inject = `${PT_WIND_TRIANGLE_GLSL}
        transformed.x += ptWindShift * ${PT_WIND2_AMPLITUDE_YD};`;
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uPtTime;${script === 'water' ? '\nattribute vec2 aPtXZ;' : ''}`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>${inject ? `\n${inject}` : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uWocFillBoost;${
          uvFx
            ? `\nuniform float uPtTime;${uvFx.stage1 ? '\nuniform sampler2D uPtMap1;' : ''}`
            : ''
        }`,
      )
      .replace(
        '#include <lights_fragment_begin>',
        `#include <lights_fragment_begin>
        #if defined( RE_IndirectDiffuse )
        irradiance *= uWocFillBoost;
        #endif`,
      );
    if (uvFx) {
      // Live texture stages sample through their own u-offset; the second
      // contribution binds uPtMap1. Modulate multiplies rgb+a; ADD adds
      // rgb while alpha still modulates (the source ALPHAOP stays
      // MODULATE for every stage).
      const stageOp = (t: string, code: number) =>
        code === PT_STAGE_OP_ADD
          ? `diffuseColor.rgb += ${t}.rgb; diffuseColor.a *= ${t}.a;`
          : `diffuseColor *= ${t};`;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
vec4 ptTex0 = texture2D( map, vMapUv + vec2(${ptScrollUOffsetGlsl(uvFx.scroll0)}, 0.0) );
${stageOp('ptTex0', uvFx.op0)}${
          uvFx.stage1
            ? `vec4 ptTex1 = texture2D( uPtMap1, vMapUv + vec2(${ptScrollUOffsetGlsl(uvFx.scroll1)}, 0.0) );
${stageOp('ptTex1', uvFx.op1)}`
            : ''
        }
#endif`,
      );
    }
  };
  material.customProgramCacheKey = () =>
    `pt-${script ?? 'flat'}${
      uvFx ? `-s${uvFx.scroll0}.${uvFx.scroll1}o${uvFx.op0}.${uvFx.op1}${uvFx.stage1 ? 'x' : ''}` : ''
    }`;
}

// ---------------------------------------------------------------------------
// Animated textures (SMTEX_TYPE_ANIMATION flipbooks)
// ---------------------------------------------------------------------------
//
// smRend3d.cpp SetD3DRendState case SMTEX_TYPE_ANIMATION: the material binds
// smAnimTexture[cnt] alone (all other stages disabled), where
//   cnt = (RendStatTime >> Shift_FrameSpeed) & FrameMask   (auto, 0x100)
//   cnt = AnimationFrame                                 (fixed frame)
// FrameMask = AnimTexCounter - 1; RendStatTime is wall-clock milliseconds.

/** The animated-texture binding for one material slot. */
export interface PtTextureAnim {
  material: THREE.MeshLambertMaterial;
  /** Preloaded frame textures (null = frame failed to convert/load). */
  frames: readonly (THREE.Texture | null)[];
  frameMask: number;
  shiftFrameSpeed: number;
  /** Fixed frame when animationFrame != PT_ANIM_AUTO. */
  animationFrame: number;
  /** Base texture fallback for frames that failed to load. */
  fallback: THREE.Texture | null;
}

// Pure frame-index rule (source-faithful; milliseconds in, frame out).
export function ptAnimFrameIndex(
  timeMs: number,
  shiftFrameSpeed: number,
  frameMask: number,
  animationFrame: number,
): number {
  if (animationFrame !== PT_ANIM_AUTO) return animationFrame;
  return (Math.floor(timeMs) >> shiftFrameSpeed) & frameMask;
}

// Advance every animated material to the current clock. Only swaps the
// already-loaded texture reference - no fetches, decodes, or allocations.
export function ptTickTextureAnims(anims: readonly PtTextureAnim[], timeMs: number): void {
  for (const a of anims) {
    const idx = ptAnimFrameIndex(
      timeMs,
      a.shiftFrameSpeed,
      a.frameMask,
      a.animationFrame,
    );
    const tex = (idx >= 0 && idx < a.frames.length ? a.frames[idx] : null) ?? a.fallback;
    if (a.material.map !== tex) a.material.map = tex;
  }
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
  // Per-corner RGB vertex colors (authored sDef_Color x gouraud shade),
  // matching PT's bCol render-stream slot. Empty when the field has none.
  colors: number[];
  groups: { material: number; start: number; count: number }[];
}

// Emit faces grouped by material. `faceFilter` selects which face indices
// enter the mesh. Hidden (NOTVIEW) and undrawn (no texture of any kind,
// RenderD3D returns FALSE) materials are skipped entirely - PT never draws
// them; the walkable face set is unchanged, so collision is unaffected.
function buildGroupedFaces(
  src: PtMapDescriptor,
  positions: Float32Array,
  faceFilter: (fi: number, mat: PtMaterialInfo | undefined) => boolean,
  vertRGB: Float32Array | null,
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
    if (ptMaterialIsHidden(mat) || ptMaterialIsUndrawn(mat)) continue;
    if (!faceFilter(fi, mat)) continue;
    if (!facesByMaterial.has(matIdx)) facesByMaterial.set(matIdx, []);
    facesByMaterial.get(matIdx)!.push(fi);
  }

  const out: PtFaceEmit = { positions: [], uvs: [], ptXZ: [], colors: [], groups: [] };
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
      if (vertRGB) {
        out.colors.push(
          vertRGB[a * 3], vertRGB[a * 3 + 1], vertRGB[a * 3 + 2],
          vertRGB[b * 3], vertRGB[b * 3 + 1], vertRGB[b * 3 + 2],
          vertRGB[c * 3], vertRGB[c * 3 + 1], vertRGB[c * 3 + 2],
        );
      }
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

function animTextureUrlsForSource(src: PtMapDescriptor, matIdx: number): string[] {
  const mat = fieldMaterials(src).find((m) => m.index === matIdx);
  if (!mat?.animTextureNames) return [];
  return mat.animTextureNames.map((name) => {
    const fileName = name.replace(/\\/g, '/').split('/').pop() || '';
    const baseName = fileName.replace(/\.[^.]+$/i, '').toLowerCase();
    return src.textureBase + baseName + '.png';
  });
}

// One promise map owns every texture fetch for a field build: base slots
// (keyed by their joined URL list, so multimix bakes stay grouped) and
// animation frames (keyed per URL) dedupe against each other - a texture
// that appears both as a base slot and an anim frame is fetched once.
type PtTextureCache = Map<string, Promise<THREE.Texture | null>>;

// The shared loader evicts rejected loads, so without a latch a genuinely
// missing source texture (the ~1,560 Phase 5A gaps) would refetch on every
// field install and every view rebuild. A 404'd URL is a static-file miss:
// it stays missing for the session. The in-flight map bridges the
// concurrent-burst window: the warm pass kicks every material's fetch in
// one synchronous sweep, and a texture referenced by a base slot and an
// anim frame under different per-view cache keys would otherwise enter the
// loader twice before either settles (the loader's own global cache only
// dedupes what it has already seen). Settled loads evict - repeat requests
// are answered by the loader's resolved-entry cache instead. Shared with
// the stage-object loader.
const ptMissingTexUrls = new Set<string>();
const ptTexInFlight = new Map<string, Promise<THREE.Texture | null>>();

/** One PT texture URL through the shared loader: one in-flight request per
 *  URL, missing state latched across field installs. Exported for
 *  pt_stage_objects. */
export function loadPtTextureUrl(url: string): Promise<THREE.Texture | null> {
  if (ptMissingTexUrls.has(url)) return Promise.resolve(null);
  let p = ptTexInFlight.get(url);
  if (p === undefined) {
    p = loadTexture(url, { srgb: true, repeat: true }).catch(() => {
      ptMissingTexUrls.add(url);
      return null;
    });
    ptTexInFlight.set(url, p);
    void p.then(() => {
      if (ptTexInFlight.get(url) === p) ptTexInFlight.delete(url);
    });
  }
  return p;
}

function ptFetchTexture(
  cache: PtTextureCache,
  key: string,
  fetcher: () => Promise<THREE.Texture | null>,
): Promise<THREE.Texture | null> {
  if (!cache.has(key)) cache.set(key, fetcher());
  return cache.get(key)!;
}

async function loadPtTexture(
  src: PtMapDescriptor,
  matIdx: number,
  textureCache: PtTextureCache,
): Promise<THREE.Texture | null> {
  const urls = textureUrlsForSource(src, matIdx);
  if (urls.length === 0) return null;
  return ptFetchTexture(textureCache, urls.join('|'), async () => {
    const textures = await Promise.all(urls.map(loadPtTextureUrl));
    let tex: THREE.Texture | null = textures.find((t) => t !== null) ?? null;
    if (urls.length > 1 && textures.filter(Boolean).length > 1) {
      const baked = await bakeMultiTexture(textures);
      if (baked) tex = baked;
    }
    return tex;
  });
}

/** A material's resolved texture binding: the `map` slot, the optional
 *  uPtMap1 stage texture, and the uvFx the shader hook carries. */
interface PtStageBinding {
  map: THREE.Texture | null;
  stage1: THREE.Texture | null;
  uvFx: PtUvFormBinding | null;
}

// Per-view binding cache: the warm pass and the mesh build join the same
// promise per material, so a scrolling material's texture URLs are
// fetched exactly once per view. This mirrors the static path's
// ptFetchTexture dedup - ptTexInFlight evicts settled entries, so without
// this latch a live material would issue a second loadTexture call when
// the mesh build re-resolves it after the textures settled.
type PtBindingCache = Map<number, Promise<PtStageBinding>>;

function loadPtStageBinding(
  src: PtMapDescriptor,
  matIdx: number,
  textureCache: PtTextureCache,
  bindingCache: PtBindingCache,
): Promise<PtStageBinding> {
  // Keyed by material index: two materials may share a texture list with
  // different form/op state, so the URL list is not a safe key.
  let p = bindingCache.get(matIdx);
  if (p === undefined) {
    p = resolvePtStageBinding(src, matIdx, textureCache);
    bindingCache.set(matIdx, p);
  }
  return p;
}

// Resolve which texture feeds each shader slot. Fully static materials
// keep the established single-map path (multimix bakes once into a
// canvas). A material with live stages (scroll or non-modulate op)
// cannot bake - the product is not constant - so its live stage(s)
// sample through per-slot offsets in the fragment shader while the
// remaining static stages still bake into the other slot.
async function resolvePtStageBinding(
  src: PtMapDescriptor,
  matIdx: number,
  textureCache: PtTextureCache,
): Promise<PtStageBinding> {
  const mat = fieldMaterials(src).find((m) => m.index === matIdx);
  const urls = textureUrlsForSource(src, matIdx);
  const live = ptLiveStages(mat);
  if (urls.length === 0 || live === null || live.length === 0) {
    // live === null: a stage set the two-sampler path cannot express -
    // fall back to the static bake so the material still renders.
    return {
      map: await loadPtTexture(src, matIdx, textureCache),
      stage1: null,
      uvFx: null,
    };
  }
  const form = (i: number) => mat?.textureFormState?.[i] ?? 0;
  const op = (i: number) => mat?.textureStageState?.[i] ?? 0;
  const statics = urls.map((_, i) => i).filter((i) => !live.includes(i));
  const textures = await Promise.all(urls.map(loadPtTextureUrl));
  // The product of the given static stages: the single texture itself,
  // or a cached multimix bake when more than one contributes.
  const staticProduct = async (slots: number[]): Promise<THREE.Texture | null> => {
    if (slots.length === 0) return null;
    if (slots.length === 1) return textures[slots[0]] ?? null;
    return ptFetchTexture(textureCache, `mix|${slots.join('.')}|${urls.join('|')}`, async () =>
      bakeMultiTexture(slots.map((i) => textures[i])),
    );
  };
  const stage0Live = live.includes(0);
  const map = stage0Live ? textures[0] ?? null : await staticProduct(statics);
  const stage1 = live.includes(1)
    ? textures[1] ?? null
    : stage0Live
      ? await staticProduct(statics)
      : null;
  const uvFx: PtUvFormBinding = {
    stage1,
    scroll0: stage0Live ? form(0) : 0,
    op0: stage0Live ? op(0) : 0,
    scroll1: live.includes(1) ? form(1) : 0,
    op1: live.includes(1) ? op(1) : 0,
  };
  return { map, stage1, uvFx };
}

// Load every converted animation frame for an SMTEX_TYPE_ANIMATION
// material. Frames are deduped per URL through the shared cache, so each
// frame is fetched and decoded at most once per field build. A missing
// frame resolves to null and latches - no repeated fetches, no fabricated
// substitute.
async function loadPtAnimFrames(
  src: PtMapDescriptor,
  matIdx: number,
  textureCache: PtTextureCache,
): Promise<(THREE.Texture | null)[]> {
  const urls = animTextureUrlsForSource(src, matIdx);
  return Promise.all(
    urls.map((u) =>
      ptFetchTexture(textureCache, u, () => loadPtTextureUrl(u)),
    ),
  );
}

// SMMAT_BLEND_LAMP materials render SRCALPHA x src + 1 x dst (additive
// glow) instead of the default alpha blend; every other authored blend
// type in the converted fields keeps the normal blend path.
export function ptMaterialBlendingFor(
  ptMat: { blendType?: number } | undefined,
): THREE.Blending {
  return (ptMat?.blendType ?? 0) === PT_BLEND_LAMP
    ? THREE.AdditiveBlending
    : THREE.NormalBlending;
}

// Build the Three.js material for a PT material group following the PT
// runtime rules documented in the header.
function makePtMaterial(
  ptMat: PtMaterialInfo | undefined,
  texture: THREE.Texture | null,
  vertexColors: boolean,
  uvFx?: PtUvFormBinding,
): THREE.MeshLambertMaterial {
  const transparency = ptMat?.transparency ?? 0;
  const opacityMap = ptMaterialHasOpacityMap(ptMat);
  const mat = new THREE.MeshLambertMaterial({
    side: ptMat?.twoSide === false ? THREE.FrontSide : THREE.DoubleSide,
    map: texture ?? null,
    // bCol is the render-stream diffuse slot in PT: texture is modulated by
    // the per-vertex color (authored sDef_Color x gouraud shade).
    vertexColors,
  });
  // MapOpacity -> alpha test at ref 60/255 with alpha blend (PT rear list).
  // Transparency != 0 also blends; Transparency > 0.2 disables z-write.
  if (opacityMap) mat.alphaTest = PT_ALPHA_TEST_REF;
  if (opacityMap || transparency > 0) {
    mat.transparent = true;
    mat.opacity = Math.min(1, Math.max(0, 1 - transparency));
    mat.depthWrite = transparency <= 0.2;
  }
  // SMMAT_BLEND_LAMP: SRCALPHA x src + 1 x dst additive glow (the waterfall
  // foam sheets and other lamp materials). The source enables alpha
  // blending for the lamp path unconditionally, so transparent must be on
  // even at Transparency == 0.
  const blending = ptMaterialBlendingFor(ptMat);
  if (blending !== THREE.NormalBlending) {
    mat.blending = blending;
    mat.transparent = true;
  }
  ptApplyShaderHooks(mat, ptVertexScriptFor(ptMat?.windMeshBottom ?? 0), uvFx);
  return mat;
}

// Build one mesh from grouped faces: one geometry, per-material groups.
async function buildGroupedMesh(
  src: PtMapDescriptor,
  name: string,
  emit: PtFaceEmit,
  textureCache: PtTextureCache,
  bindingCache: PtBindingCache,
  outMaterials: THREE.Material[],
  outAnims: PtTextureAnim[],
  needsPtXZ: boolean,
): Promise<THREE.Mesh | null> {
  if (emit.positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(emit.positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(emit.uvs, 2));
  if (needsPtXZ) geo.setAttribute('aPtXZ', new THREE.Float32BufferAttribute(emit.ptXZ, 2));
  const hasColors = emit.colors.length === emit.positions.length;
  if (hasColors) geo.setAttribute('color', new THREE.Float32BufferAttribute(emit.colors, 3));
  geo.computeVertexNormals();

  const materials: THREE.Material[] = [];
  const matByIdx = new Map(fieldMaterials(src).map((m) => [m.index, m]));
  for (const g of emit.groups) {
    const ptMat = matByIdx.get(g.material);
    const binding = await loadPtStageBinding(src, g.material, textureCache, bindingCache);
    const base = binding.map;
    const uvFx = binding.uvFx ?? undefined;
    let texture = base;
    if (ptMaterialIsAnimated(ptMat)) {
      // SMTEX_TYPE_ANIMATION: stage-0 binds the animation frame list
      // (smAnimTexture), NOT the base smTexture slots. The base texture
      // only fills frames that failed to convert.
      const frames = await loadPtAnimFrames(src, g.material, textureCache);
      texture = frames[0] ?? base;
      const m = makePtMaterial(ptMat, texture, hasColors, uvFx);
      m.name = `pt-mat-${g.material}`;
      materials.push(m);
      outAnims.push({
        material: m,
        frames,
        frameMask: ptMat!.frameMask ?? frames.length - 1,
        shiftFrameSpeed: ptMat!.shiftFrameSpeed ?? 0,
        animationFrame: ptMat!.animationFrame ?? PT_ANIM_AUTO,
        fallback: base,
      });
    } else {
      const m = makePtMaterial(ptMat, texture, hasColors, uvFx);
      m.name = `pt-mat-${g.material}`;
      materials.push(m);
    }
    geo.addGroup(g.start, g.count, materials.length - 1);
  }

  const mesh = new THREE.Mesh(geo, materials);
  mesh.name = name;
  outMaterials.push(...materials);
  return mesh;
}

// Kick every texture load the emitted groups will need before the first
// await: ptFetchTexture inserts the promise synchronously, so the loader's
// queue fills in one pass and the per-material awaits inside
// buildGroupedMesh join in-flight work instead of starting a new fetch per
// group. Hidden/undrawn materials stay unfetched (PT never draws them).
function warmPtFieldTextures(
  src: PtMapDescriptor,
  materialIndices: Iterable<number>,
  textureCache: PtTextureCache,
  bindingCache: PtBindingCache,
): void {
  const matByIdx = new Map(fieldMaterials(src).map((m) => [m.index, m]));
  for (const mi of materialIndices) {
    const ptMat = matByIdx.get(mi);
    if (ptMaterialIsHidden(ptMat) || ptMaterialIsUndrawn(ptMat)) continue;
    void loadPtStageBinding(src, mi, textureCache, bindingCache);
    if (ptMaterialIsAnimated(ptMat)) {
      void loadPtAnimFrames(src, mi, textureCache);
    }
  }
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

  // Authored sDef_Color x the field's gouraud shade (SetVertexShade), baked
  // once into a per-vertex RGB buffer: PT's render stream writes these as
  // the vertex diffuse, modulating the texture.
  let vertRGB: Float32Array | null = null;
  const vertColors = src.field.PT_VERTEX_COLORS?.();
  if (vertColors) {
    const lighting = src.field.PT_FIELD_LIGHTING;
    vertRGB = lighting
      ? ptBakeVertexShade({
          vertices: src.field.PT_VERTICES(),
          faces: src.field.PT_RENDER_FACES(),
          colors: vertColors,
          contrast: lighting.contrast,
          bright: lighting.bright,
          vectLight: lighting.vectLight as unknown as readonly [number, number, number],
        })
      : ptVertexColorsOnly(vertColors, src.field.PT_N_VERTEX);
  }

  const textureCache: PtTextureCache = new Map();
  const bindingCache: PtBindingCache = new Map();
  const allMaterials: THREE.Material[] = [];
  const anims: PtTextureAnim[] = [];
  const meshes: THREE.Mesh[] = [];

  // All three face emits are synchronous, so compute them up front. That
  // lets every texture the field references start fetching immediately -
  // the per-material awaits inside buildGroupedMesh then join in-flight
  // work at the loader's queue width instead of serializing one material
  // group at a time (the pre-6A build effectively fetched at concurrency 1).
  // Solid path: everything PT draws as opaque or cutout (transparency <=
  // 0.1 and not water). This covers walkable terrain plus opaque decorative
  // faces; TGA/PNG materials get alpha-test per the MapOpacity rule.
  const solidEmit = buildGroupedFaces(
    src,
    positions,
    (fi, mat) => !waterSet.has(fi) && !ptMaterialIsTranslucent(mat),
    vertRGB,
  );
  // Water path: the KNOWN_WATER_MATS face set. Textured per material,
  // blended with opacity = 1 - transparency, z-write off (>0.2), and the
  // PT water vertex ripple on sMATS_SCRIPT_WATER materials.
  const waterEmit = buildGroupedFaces(src, positions, (fi) => waterSet.has(fi), vertRGB);
  // Decorative translucent path: non-water faces whose material is
  // translucent (transparency > 0.1).
  const decoEmit = buildGroupedFaces(
    src,
    positions,
    (fi, mat) => !waterSet.has(fi) && decoSet.has(fi) && ptMaterialIsTranslucent(mat),
    vertRGB,
  );

  // The ocean ring's sea material (multimix bake target) may be referenced
  // by no render face at all; warm it with the rest so the ring is not the
  // straggler of the build.
  const seaMat = src.oceanRing
    ? fieldMaterials(src).find((m) =>
        m.textureNames.some((n) => n.toLowerCase().endsWith('riy-w091.bmp')),
      )
    : undefined;
  const usedMats = new Set<number>();
  for (const emit of [solidEmit, waterEmit, decoEmit]) {
    for (const g of emit.groups) usedMats.add(g.material);
  }
  if (seaMat) usedMats.add(seaMat.index);
  warmPtFieldTextures(src, usedMats, textureCache, bindingCache);

  // Stage objects fetch/build in parallel with the terrain meshes: their
  // own warm pass fires before the node loop for the same reason.
  const stagePromise = (
    src.stageObjects
      ? buildPtStageObjectsView({
          id: src.id,
          objects: src.stageObjects.PT_STAGE_OBJECTS,
          bandMatrix: ptStageBandMatrixFor(src.transform),
          textureBase: src.textureBase,
        })
      : Promise.resolve(null)
  ).catch(() => null);

  const [solidMesh, waterMesh, decoMesh] = await Promise.all([
    buildGroupedMesh(
      src,
      `pt-${src.id}-solid`,
      solidEmit,
      textureCache,
      bindingCache,
      allMaterials,
      anims,
      false,
    ),
    buildGroupedMesh(
      src,
      `pt-${src.id}-water`,
      waterEmit,
      textureCache,
      bindingCache,
      allMaterials,
      anims,
      true,
    ),
    buildGroupedMesh(
      src,
      `pt-${src.id}-decorative`,
      decoEmit,
      textureCache,
      bindingCache,
      allMaterials,
      anims,
      false,
    ),
  ]);
  for (const m of [solidMesh, waterMesh, decoMesh]) {
    if (m) meshes.push(m);
  }
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
  const stageView = await stagePromise;
  if (stageView) group.add(stageView.group);

  return {
    group,
    update() {
      stageView?.update();
      if (anims.length > 0) {
        ptTickTextureAnims(anims, sharedUniforms.uTime.value * 1000);
      }
    },
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of mats) mm.dispose();
      }
      void Promise.all(textureCache.values()).then((textures) => {
        for (const t of textures) t?.dispose();
      });
      stageView?.dispose();
    },
  };
}
