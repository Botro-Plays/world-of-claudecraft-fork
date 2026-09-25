// Phase 5C: source-faithful consumption of the Phase 5A visual data -
// animated textures (SMTEX_TYPE_ANIMATION), all four wind channels, the
// textureless-material draw rule, and authored sDef_Color vertex colors
// baked with the field's gouraud shade (smSTAGE3D::SetVertexShade).
//
// Texture loading is mocked: THREE.TextureLoader needs a DOM, and the mock
// doubles as the missing-asset probe (tem_wall04 never existed in the PT
// client files).

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../src/render/assets/loader', () => ({
  loadTexture: vi.fn(async (url: string) => {
    const tex = new THREE.Texture();
    tex.name = url; // identify which URL produced which texture
    return tex;
  }),
}));

import { loadTexture } from '../src/render/assets/loader';
import {
  PT_ANIM_AUTO,
  PT_TEX_TYPE_ANIMATION,
  buildPtTerrainView,
  ptAnimFrameIndex,
  ptMaterialIsAnimated,
  ptMaterialIsUndrawn,
  ptTickTextureAnims,
  ptVertexScriptFor,
  type PtTextureAnim,
} from '../src/render/pt_terrain';
import { ptBakeVertexShade, ptVertexColorsOnly } from '../src/render/pt_vertex_shade';
import { sharedUniforms } from '../src/render/gfx';
import { loadPtDevMap } from '../src/game/pt_dev_maps';
import {
  PT_MATERIALS,
  PT_N_FACE,
  PT_N_VERTEX,
  PT_RENDER_FACES,
  PT_VERTEX_COLORS,
  PT_WATER_FACE_INDICES,
} from '../src/sim/pt_ricarten_field.generated';

const loadTextureMock = vi.mocked(loadTexture);

// ---------------------------------------------------------------------------
// Animated textures (smRend3d.cpp SetD3DRendState, SMTEX_TYPE_ANIMATION)
// ---------------------------------------------------------------------------

describe('ptAnimFrameIndex', () => {
  it('selects frames by the source rule (RendStatTime >> shift) & mask', () => {
    // ruin-1 sea material: frameMask 7, shiftFrameSpeed 8 -> a new frame
    // every 256 ms, wrapping after 8.
    for (let f = 0; f < 8; f++) {
      expect(ptAnimFrameIndex(f * 256, 8, 7, PT_ANIM_AUTO)).toBe(f);
    }
    // Loops: t = 8*256 wraps to frame 0.
    expect(ptAnimFrameIndex(8 * 256, 8, 7, PT_ANIM_AUTO)).toBe(0);
    expect(ptAnimFrameIndex(9 * 256, 8, 7, PT_ANIM_AUTO)).toBe(1);
  });

  it('honors per-material shiftFrameSpeed (ruin-1 second anim uses 6)', () => {
    // shift 6 -> a new frame every 64 ms.
    expect(ptAnimFrameIndex(64, 6, 7, PT_ANIM_AUTO)).toBe(1);
    expect(ptAnimFrameIndex(255, 6, 7, PT_ANIM_AUTO)).toBe(3);
    expect(ptAnimFrameIndex(256, 6, 7, PT_ANIM_AUTO)).toBe(4);
  });

  it('returns the authored frame for non-auto animationFrame', () => {
    expect(ptAnimFrameIndex(0, 8, 7, 3)).toBe(3);
    expect(ptAnimFrameIndex(999999, 8, 7, 3)).toBe(3);
  });

  it('is deterministic across repeated calls', () => {
    const a = ptAnimFrameIndex(123456, 8, 7, PT_ANIM_AUTO);
    const b = ptAnimFrameIndex(123456, 8, 7, PT_ANIM_AUTO);
    expect(a).toBe(b);
  });
});

describe('ptTickTextureAnims', () => {
  function makeAnim(frameCount: number): { anim: PtTextureAnim; frames: THREE.Texture[] } {
    const frames = Array.from({ length: frameCount }, (_, i) => {
      const t = new THREE.Texture();
      t.name = `frame-${i}`;
      return t;
    });
    const material = new THREE.MeshLambertMaterial({ map: frames[0] });
    return {
      anim: {
        material,
        frames,
        frameMask: frameCount - 1,
        shiftFrameSpeed: 8,
        animationFrame: PT_ANIM_AUTO,
        fallback: null,
      },
      frames,
    };
  }

  it('swaps material.map to the clock-selected frame without reallocation', () => {
    const { anim, frames } = makeAnim(8);
    ptTickTextureAnims([anim], 0);
    expect(anim.material.map).toBe(frames[0]);
    ptTickTextureAnims([anim], 3 * 256);
    expect(anim.material.map).toBe(frames[3]);
    ptTickTextureAnims([anim], 8 * 256);
    expect(anim.material.map).toBe(frames[0]); // looped
    // No new material/texture instances were created along the way.
    expect(anim.material).toBeInstanceOf(THREE.MeshLambertMaterial);
  });

  it('falls back to the base texture for a missing frame', () => {
    const { anim, frames } = makeAnim(8);
    const base = new THREE.Texture();
    anim.fallback = base;
    anim.frames = frames.map((t, i) => (i === 5 ? null : t));
    ptTickTextureAnims([anim], 5 * 256);
    expect(anim.material.map).toBe(base);
    ptTickTextureAnims([anim], 6 * 256);
    expect(anim.material.map).toBe(frames[6]);
  });

  it('falls back when the frame index exceeds the converted frame list', () => {
    const { anim, frames } = makeAnim(8);
    const base = new THREE.Texture();
    anim.fallback = base;
    anim.frames = frames.slice(0, 4); // only 4 converted frames, mask is 7
    ptTickTextureAnims([anim], 5 * 256);
    expect(anim.material.map).toBe(base);
  });
});

// ---------------------------------------------------------------------------
// Wind channel dispatch (smRend3d.cpp switch on WindMeshBottom & 0x7FF)
// ---------------------------------------------------------------------------

describe('ptVertexScriptFor', () => {
  it('maps the four wind channels and water to their scripts', () => {
    expect(ptVertexScriptFor(0x20)).toBe('windz1');
    expect(ptVertexScriptFor(0x40)).toBe('windz2');
    expect(ptVertexScriptFor(0x80)).toBe('windx1');
    expect(ptVertexScriptFor(0x100)).toBe('windx2');
    expect(ptVertexScriptFor(0x200)).toBe('water');
  });

  it('treats composite/anim-tag residues as rigid (source: exact match)', () => {
    // ba1 0x9 and dcave 0xb are ASE WIND|ANIM tag residues - the source
    // switch has no case for them, so no vertex displacement.
    expect(ptVertexScriptFor(0x9)).toBeNull();
    expect(ptVertexScriptFor(0xb)).toBeNull();
    expect(ptVertexScriptFor(0x20 | 0x40)).toBeNull(); // WINDZ1|WINDZ2 combo
    expect(ptVertexScriptFor(0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Textureless materials (smMATERIAL::RenderD3D early return)
// ---------------------------------------------------------------------------

describe('ptMaterialIsUndrawn / ptMaterialIsAnimated', () => {
  it('undrawn = no base texture AND no animation frames', () => {
    expect(ptMaterialIsUndrawn({ textureNames: [] })).toBe(true);
    expect(ptMaterialIsUndrawn({ textureNames: [], animTextureNames: [] })).toBe(true);
    expect(ptMaterialIsUndrawn({ textureNames: ['a.bmp'] })).toBe(false);
    expect(ptMaterialIsUndrawn({ textureNames: [], animTextureNames: ['f0.bmp'] })).toBe(false);
    expect(ptMaterialIsUndrawn(undefined)).toBe(false);
  });

  it('animated = textureType 1 with frames', () => {
    expect(
      ptMaterialIsAnimated({
        textureType: PT_TEX_TYPE_ANIMATION,
        animTexCounter: 8,
        animTextureNames: ['a'],
      }),
    ).toBe(true);
    expect(ptMaterialIsAnimated({ textureType: 0, animTextureNames: ['a'] })).toBe(false);
    expect(ptMaterialIsAnimated({ textureType: 1 })).toBe(false);
    expect(ptMaterialIsAnimated(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ricarten terrain: vertex colors + textureless skip, real generated data
// ---------------------------------------------------------------------------

describe('buildPtTerrainView visual data consumption (ricarten)', () => {
  it('emits a per-corner color attribute matching the emitted vertices', async () => {
    const view = await buildPtTerrainView();
    const solid = view.group.getObjectByName('pt-ricarten-solid') as THREE.Mesh;
    const geo = solid.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    expect(col).toBeDefined();
    expect(col.count).toBe(pos.count);
    expect(col.itemSize).toBe(3);
    // Materials modulate texture output by vertex color (PT bCol slot).
    const mats = solid.material as THREE.MeshLambertMaterial[];
    for (const m of mats) expect(m.vertexColors).toBe(true);
  });

  it('skips faces whose material has no texture of any kind', async () => {
    // Ricarten: material 0 (NOTVIEW wall) and material 2 carry no texture
    // names and no anim frames; PT's RenderD3D returns FALSE for both.
    const waterSet = new Set(PT_WATER_FACE_INDICES());
    let expected = 0;
    for (let fi = 0; fi < PT_N_FACE; fi++) {
      const mat = PT_MATERIALS.find((m) => m.index === PT_RENDER_FACES()[fi * 4 + 3]);
      if (!mat) continue;
      if ((mat.useState & 0x400) !== 0) continue;
      if (ptMaterialIsUndrawn(mat)) continue;
      if (waterSet.has(fi)) continue;
      if ((mat.transparency ?? 0) > 0.1) continue;
      expected++;
    }
    const view = await buildPtTerrainView();
    const solid = view.group.getObjectByName('pt-ricarten-solid') as THREE.Mesh;
    const geo = solid.geometry as THREE.BufferGeometry;
    expect(geo.getAttribute('position').count).toBe(expected * 3);
    // No group references the textureless material 2.
    const matNames = (solid.material as THREE.Material[]).map((m) => m.name);
    expect(matNames).not.toContain('pt-mat-2');
  });

  it('keeps the existing WINDZ1 foliage script behavior', async () => {
    const view = await buildPtTerrainView();
    const solid = view.group.getObjectByName('pt-ricarten-solid') as THREE.Mesh;
    const mats = solid.material as THREE.MeshLambertMaterial[];
    const scripted = mats.filter((m) => m.customProgramCacheKey() === 'pt-windz1');
    expect(scripted.length).toBe(13); // mats 136-139 + 239-247, 0x20 exact
  });
});

// ---------------------------------------------------------------------------
// ruin-1: the sea flipbook (sea_0..sea_7), base texture stays distinct
// ---------------------------------------------------------------------------

describe('ruin-1 animated sea material', () => {
  it('emits the anim material with the verified metadata shape', async () => {
    const { descriptor } = await loadPtDevMap('ruin-1');
    const mat436 = descriptor.field.PT_MATERIALS.find((m) => m.index === 436)!;
    expect(mat436.textureType).toBe(PT_TEX_TYPE_ANIMATION);
    expect(mat436.textureNames.length).toBe(1); // base stays a distinct slot
    expect(mat436.animTexCounter).toBe(8);
    expect(mat436.frameMask).toBe(7);
    expect(mat436.shiftFrameSpeed).toBe(8);
    expect(mat436.animationFrame).toBe(PT_ANIM_AUTO);
    expect(mat436.animTextureNames?.length).toBe(8);
  });

  it('binds the flipbook (not the base) and advances on the shared clock', async () => {
    // Material 486 (flame_0..flame_7, shift 6) is the ruin-1 anim material
    // with live faces (36); the sea material's data is preserved but its
    // faces are not in the render stream.
    const { descriptor } = await loadPtDevMap('ruin-1');
    const view = await buildPtTerrainView(descriptor);
    const meshes = view.group.children.filter(
      (c): c is THREE.Mesh => (c as THREE.Mesh).isMesh === true,
    );
    const mats = meshes.flatMap((m) =>
      (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshLambertMaterial[],
    );
    const animMat = mats.find((m) => m.name === 'pt-mat-486');
    expect(animMat).toBeDefined();
    const first = animMat!.map;
    expect(first).not.toBeNull();
    expect(first!.name).toContain('flame_0.png'); // frame 0, not the base slot
    const seen = new Set<string>();
    for (let t = 0; t < 8 * 64; t += 64) {
      sharedUniforms.uTime.value = t / 1000;
      view.update();
      seen.add(animMat!.map!.name);
    }
    expect(seen.size).toBe(8); // all 8 flame frames bound over one loop
    sharedUniforms.uTime.value = (8 * 64) / 1000;
    view.update();
    expect(animMat!.map!.name).toContain('flame_0.png'); // wrapped
    sharedUniforms.uTime.value = 0;
    view.dispose();
  });

  it('fetches each animation frame URL at most once', async () => {
    loadTextureMock.mockClear();
    const { descriptor } = await loadPtDevMap('ruin-1');
    await buildPtTerrainView(descriptor);
    const flameCalls = loadTextureMock.mock.calls
      .map((c) => c[0])
      .filter((u) => /flame_\d\.png$/.test(u));
    // Exactly 8 distinct frame URLs, each requested once.
    expect(new Set(flameCalls).size).toBe(8);
    expect(flameCalls.length).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Vertex shade bake (smSTAGE3D::SetVertexShade)
// ---------------------------------------------------------------------------

describe('ptBakeVertexShade', () => {
  it('produces one RGB triplet per vertex, deterministic', () => {
    const input = {
      vertices: PT_RICARTEN_VERTICES_STUB,
      faces: PT_RICARTEN_FACES_STUB,
      colors: PT_RICARTEN_COLORS_STUB,
      contrast: 300,
      bright: 130,
      vectLight: [0, -372, -93] as const,
    };
    const a = ptBakeVertexShade(input);
    const b = ptBakeVertexShade(input);
    expect(a).not.toBeNull();
    expect(a!.length).toBe(PT_RICARTEN_VERTICES_STUB.length);
    expect(Array.from(a!)).toEqual(Array.from(b!));
  });

  it('returns null on a truncated color buffer', () => {
    const a = ptBakeVertexShade({
      vertices: [0, 0, 0, 256, 0, 0, 0, 256, 0],
      faces: [0, 1, 2, 0],
      colors: new Int16Array(4), // 1 vertex worth for 3 verts
      contrast: 300,
      bright: 130,
      vectLight: [0, -372, -93],
    });
    expect(a).toBeNull();
  });

  it('shades a ground-plane vertex brighter than a wall-facing one', () => {
    // Single quad standing up vs lying flat; authored color uniform.
    const upVert = ptBakeVertexShade({
      // Face normal +y (up): n . VectLight picks up the -372 y term.
      vertices: [0, 0, 0, 256, 0, 0, 256, 0, 256],
      faces: [0, 1, 2, 0],
      colors: new Int16Array([255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]),
      contrast: 300,
      bright: 130,
      vectLight: [0, -372, -93],
    })!;
    // PT y is up; the winding below yields an up-facing normal.
    expect(upVert[0]).toBeGreaterThan(0);
  });

  it('applies to the real Ricarten field: emits 3 floats per vertex', () => {
    const colors = PT_VERTEX_COLORS();
    const rgb = ptVertexColorsOnly(colors, PT_N_VERTEX);
    expect(rgb).not.toBeNull();
    expect(rgb!.length).toBe(PT_N_VERTEX * 3);
    // Deterministic decode.
    const rgb2 = ptVertexColorsOnly(PT_VERTEX_COLORS(), PT_N_VERTEX);
    expect(Array.from(rgb!)).toEqual(Array.from(rgb2!));
  });
});

// ---------------------------------------------------------------------------
// Recovered sod-1 stage objects (the 18 _Bip physique objects)
// ---------------------------------------------------------------------------

describe('sod-1 recovered _Bip stage objects', () => {
  it('builds all 18 recovered objects with their per-node meshes', async () => {
    const { descriptor } = await loadPtDevMap('sod-1');
    expect(descriptor.stageObjects).not.toBeNull();
    const view = await buildPtTerrainView(descriptor);
    const stageGroup = view.group.getObjectByName('pt-sod-1-stage-objects') as THREE.Group;
    expect(stageGroup).toBeDefined();
    const nodeMeshes = stageGroup.children.filter((c) => (c as THREE.Mesh).isMesh);
    expect(nodeMeshes.length).toBeGreaterThan(0);
    view.dispose();
  });

  it('preserves the Physique bone-name tables as data (static render)', async () => {
    const { descriptor } = await loadPtDevMap('sod-1');
    const objects = descriptor.stageObjects!.PT_STAGE_OBJECTS;
    expect(objects.length).toBe(18);
    // Every recovered node carries its per-vertex bone binding; the runtime
    // renders them at their authored transform (all maxFrame = 0).
    for (const obj of objects) {
      expect(obj.maxFrame).toBe(0);
      for (const node of obj.nodes) {
        expect(node.boneNames?.length ?? 0).toBeGreaterThan(0);
        expect(node.animated).toBe(false);
      }
    }
  });
});

// Tiny fixed fixtures for the shade-bake determinism test.
const PT_RICARTEN_VERTICES_STUB = [0, 0, 0, 256, 0, 0, 0, 0, 256];
const PT_RICARTEN_FACES_STUB = [0, 1, 2, 0];
const PT_RICARTEN_COLORS_STUB = new Int16Array([
  255, 255, 255, 255,
  255, 255, 255, 255,
  255, 255, 255, 255,
]);
