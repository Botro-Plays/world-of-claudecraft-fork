// Tests for the PT Ricarten terrain renderer material routing.
//
// Regression guard for the browser hang/black-terrain bug: every Ricarten
// SMD material carries BlendType === SMMAT_BLEND_ALPHA (1), which is PT's
// unconditional default for field materials, not a translucency flag. The
// renderer must classify faces by smMATERIAL::Transparency (> 0.1 is the
// engine's own translucent/water test) so the 42k+ solid faces actually
// render instead of being skipped.
//
// Texture loading is mocked: THREE.TextureLoader needs a DOM, and the mock
// also pins the missing-source behavior for tem_wall04.png (the one texture
// that genuinely does not exist in the PT client files).

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../src/render/assets/loader', () => ({
  loadTexture: vi.fn(async (url: string) => {
    if (url.endsWith('tem_wall04.png')) throw new Error(`missing: ${url}`);
    return new THREE.Texture();
  }),
}));

import { loadTexture } from '../src/render/assets/loader';
import {
  PT_ALPHA_TEST_REF,
  PT_TRANSLUCENT_THRESHOLD,
  buildPtTerrainView,
  ptMaterialHasOpacityMap,
  ptMaterialIsHidden,
  ptMaterialIsTranslucent,
  ptMaterialIsUndrawn,
  ptVertexScriptFor,
  textureUrlForMaterial,
} from '../src/render/pt_terrain';
import {
  PT_DECORATIVE_FACE_INDICES,
  PT_MATERIALS,
  PT_N_FACE,
  PT_RENDER_FACES,
  PT_WATER_FACE_INDICES,
} from '../src/sim/pt_ricarten_field.generated';

const loadTextureMock = vi.mocked(loadTexture);

function matForFace(fi: number) {
  return PT_MATERIALS.find(m => m.index === PT_RENDER_FACES()[fi * 4 + 3]);
}

function countSolidFaces(): number {
  const waterSet = new Set(PT_WATER_FACE_INDICES());
  let n = 0;
  for (let fi = 0; fi < PT_N_FACE; fi++) {
    const mat = matForFace(fi);
    if (ptMaterialIsHidden(mat)) continue;
    // smMATERIAL::RenderD3D returns FALSE for materials with no texture of
    // any kind - those faces never reach the render mesh.
    if (ptMaterialIsUndrawn(mat)) continue;
    if (waterSet.has(fi)) continue;
    if (ptMaterialIsTranslucent(mat)) continue;
    n++;
  }
  return n;
}

function countTranslucentDecoFaces(): number {
  let n = 0;
  const deco = PT_DECORATIVE_FACE_INDICES();
  for (let i = 0; i < deco.length; i++) {
    if (ptMaterialIsTranslucent(matForFace(deco[i]))) n++;
  }
  return n;
}

describe('ptMaterialIsTranslucent classification', () => {
  it('routes blendType=1 materials with low/zero transparency to the solid mesh', () => {
    // Every one of these must be SOLID: blendType is always 1 (SMMAT_BLEND_ALPHA
    // is PT's default), so transparency is the only valid discriminator.
    for (const transparency of [0, 0.01, 0.05, 0.1]) {
      expect(ptMaterialIsTranslucent({ transparency })).toBe(false);
    }
  });

  it('routes only genuinely translucent materials to the transparent path', () => {
    expect(PT_TRANSLUCENT_THRESHOLD).toBe(0.1);
    for (const transparency of [0.100001, 0.11, 0.25, 0.29, 1]) {
      expect(ptMaterialIsTranslucent({ transparency })).toBe(true);
    }
    expect(ptMaterialIsTranslucent(undefined)).toBe(false);
  });

  it('pins the data condition that made blendType classification wrong', () => {
    // All 288 Ricarten materials are SMMAT_BLEND_ALPHA. If a future field
    // changes this, the renderer still keys on transparency, not blendType.
    expect(PT_MATERIALS.every(m => m.blendType === 1)).toBe(true);
  });

  it('classifies real materials: ground solid, water translucent', () => {
    const ground = PT_MATERIALS.find(m => m.textureNames.includes('Field\\Ricarten\\riy-w001.bmp'));
    expect(ground).toBeDefined();
    expect(ptMaterialIsTranslucent(ground)).toBe(false);
    for (const waterIdx of [107, 140, 232]) {
      expect(ptMaterialIsTranslucent(PT_MATERIALS[waterIdx])).toBe(true);
    }
  });
});

describe('textureUrlForMaterial', () => {
  it('builds lowercase png URLs under /textures/pt-ricarten/', () => {
    const riy = PT_MATERIALS.find(m => m.textureNames.includes('Field\\Ricarten\\riy-w001.bmp'))!;
    expect(textureUrlForMaterial(riy.index)).toBe('/textures/pt-ricarten/riy-w001.png');
  });

  it('normalizes uppercase stems and non-png extensions (L-VV.tga -> l-vv.png)', () => {
    const lvv = PT_MATERIALS.find(m => m.textureNames.some(t => t.includes('L-VV.tga')))!;
    expect(textureUrlForMaterial(lvv.index)).toBe('/textures/pt-ricarten/l-vv.png');
    const ttem = PT_MATERIALS.find(m => m.textureNames.some(t => t.includes('Ttem.tga')))!;
    expect(textureUrlForMaterial(ttem.index)).toBe('/textures/pt-ricarten/ttem.png');
  });

  it('returns null for materials with no texture', () => {
    const noTex = PT_MATERIALS.find(m => m.textureNames.length === 0)!;
    expect(textureUrlForMaterial(noTex.index)).toBeNull();
  });
});

describe('buildPtTerrainView mesh routing', () => {
  it('builds a non-empty solid mesh for the walkable/decorative faces', async () => {
    const view = await buildPtTerrainView();
    const solid = view.group.getObjectByName('pt-ricarten-solid') as THREE.Mesh;
    expect(solid).toBeDefined();

    const geo = solid.geometry as THREE.BufferGeometry;
    // Before the fix every face was skipped: zero groups, zero vertices.
    expect(geo.groups.length).toBeGreaterThan(0);
    const expectedSolid = countSolidFaces();
    expect(geo.getAttribute('position').count).toBe(expectedSolid * 3);
    expect(geo.getAttribute('uv').count).toBe(expectedSolid * 3);
  });

  it('excludes NOTVIEW (useState 0x400) collision-only faces from the render mesh', () => {
    // sMATS_SCRIPT_NOTVIEW ("wall:") materials are invisible collision in PT.
    // Material 0 is Ricarten's only NOTVIEW material.
    let hidden = 0;
    for (let fi = 0; fi < PT_N_FACE; fi++) {
      if (ptMaterialIsHidden(matForFace(fi))) hidden++;
    }
    expect(hidden).toBe(47);
    // 78 more faces use material 2, which carries no texture at all - PT's
    // RenderD3D returns FALSE for it, so those faces are never drawn.
    expect(countSolidFaces()).toBe(49888 - 1658 - hidden - 78);
  });

  it('keeps water on the dedicated transparent mesh with PT material fidelity', async () => {
    const view = await buildPtTerrainView();
    const water = view.group.getObjectByName('pt-ricarten-water') as THREE.Mesh;
    expect(water).toBeDefined();
    const geo = water.geometry as THREE.BufferGeometry;
    expect(geo.getAttribute('position').count).toBe(PT_WATER_FACE_INDICES().length * 3);
    // Water carries the aPtXZ attribute for the PT water-ripple vertex script.
    expect(geo.getAttribute('aPtXZ')).toBeDefined();
    const mats = water.material as THREE.MeshLambertMaterial[];
    expect(Array.isArray(mats)).toBe(true);
    for (const m of mats) {
      expect(m.transparent).toBe(true);
      // All Ricarten water materials have transparency > 0.2 -> no z-write.
      expect(m.depthWrite).toBe(false);
    }
  });

  it('only routes genuinely translucent decorative faces to the decorative mesh', async () => {
    const view = await buildPtTerrainView();
    const deco = view.group.getObjectByName('pt-ricarten-decorative') as THREE.Mesh | undefined;
    const expected = countTranslucentDecoFaces();
    if (expected === 0) {
      // Ricarten: every translucent material is water, so no decorative faces
      // qualify. Foliage (transparency 0.01-0.05) belongs to the solid mesh.
      expect(deco).toBeUndefined();
    } else {
      expect(deco).toBeDefined();
      expect((deco!.geometry as THREE.BufferGeometry).getAttribute('position').count)
        .toBe(expected * 3);
    }
  });

  it('requests one texture per distinct solid material url, all lowercase', async () => {
    loadTextureMock.mockClear();
    await buildPtTerrainView();

    const waterSet = new Set(PT_WATER_FACE_INDICES());
    const expectedUrls = new Set<string>();
    for (let fi = 0; fi < PT_N_FACE; fi++) {
      if (waterSet.has(fi)) continue;
      const mat = matForFace(fi);
      if (ptMaterialIsTranslucent(mat)) continue;
      const url = textureUrlForMaterial(PT_RENDER_FACES()[fi * 4 + 3]);
      if (url) expectedUrls.add(url);
    }

    const requested = new Set(loadTextureMock.mock.calls.map(c => c[0]));
    // Water + decorative meshes now load their own material textures too, so
    // the request set is a superset of the solid URLs. tem_wall04 is
    // excluded: a rejected load latches in the session missing-URL set, so
    // builds after the first legitimately never re-request it.
    for (const url of expectedUrls) {
      if (url.endsWith('tem_wall04.png')) continue;
      expect(requested.has(url)).toBe(true);
    }
    for (const url of requested) {
      expect(url.startsWith('/textures/pt-ricarten/')).toBe(true);
      expect(url).toBe(url.toLowerCase());
    }
    expect(requested.size).toBeGreaterThan(200);
  });

  it('requests every texture slot of multi-texture (multimix) materials', async () => {
    // PT SMTEX_TYPE_MULTIMIX modulates all texture stages. The sea materials
    // carry two slots (e.g. riy-f030 cloud x riy-w091 teal); loading only
    // slot 0 renders the pale cloud sheet alone, which is the regression
    // this pins against.
    loadTextureMock.mockClear();
    await buildPtTerrainView();
    const requested = new Set(loadTextureMock.mock.calls.map(c => c[0]));
    for (const idx of [107, 140, 232]) {
      const mat = PT_MATERIALS.find(m => m.index === idx)!;
      expect(mat.textureNames.length).toBe(2);
      for (const name of mat.textureNames) {
        const stem = name.split('\\').pop()!.replace(/\.[^.]+$/i, '').toLowerCase();
        expect(requested.has(`/textures/pt-ricarten/${stem}.png`)).toBe(true);
      }
    }
    // In Node (no DOM) the bake is skipped and the material falls back to
    // the first loaded texture, so the map must still be set.
    const view = await buildPtTerrainView();
    const water = view.group.getObjectByName('pt-ricarten-water') as THREE.Mesh;
    const m107 = (water.material as THREE.MeshLambertMaterial[])
      .find(m => m.name === 'pt-mat-107')!;
    expect(m107.map).not.toBeNull();
  });

  it('falls back to an untextured material for the genuinely missing tem_wall04', async () => {
    const view = await buildPtTerrainView();
    const solid = view.group.getObjectByName('pt-ricarten-solid') as THREE.Mesh;
    const mats = solid.material as THREE.MeshLambertMaterial[];
    const missing = mats.filter(m => m.map == null).length;
    // Materials end up untextured only when an authored texture genuinely
    // failed to load (tem_wall04.png in the mock). Textureless materials
    // produce no draw at all (RenderD3D FALSE), never a flat material.
    const waterSet = new Set(PT_WATER_FACE_INDICES());
    const expectedMissing = new Set<number>();
    let sawTemWall04 = false;
    for (let fi = 0; fi < PT_N_FACE; fi++) {
      if (waterSet.has(fi)) continue;
      const mat = matForFace(fi);
      if (ptMaterialIsHidden(mat)) continue;
      if (ptMaterialIsUndrawn(mat)) continue;
      if (ptMaterialIsTranslucent(mat)) continue;
      const matIdx = PT_RENDER_FACES()[fi * 4 + 3];
      const url = textureUrlForMaterial(matIdx);
      if (url?.endsWith('tem_wall04.png')) {
        expectedMissing.add(matIdx);
        sawTemWall04 = true;
      }
    }
    expect(sawTemWall04).toBe(true);
    expect(missing).toBe(expectedMissing.size);
  });
});

describe('PT material fidelity (P2-A)', () => {
  it('applies the PT MapOpacity rule: .tga/.png alpha-test, .bmp opaque', () => {
    // smTexture.cpp new_smCreateTexture: TGA/PNG -> MapOpacity=TRUE.
    const railing = PT_MATERIALS.find(m => m.index === 197)!; // eye_railing.TGA
    expect(ptMaterialHasOpacityMap(railing)).toBe(true);
    const bmpRailing = PT_MATERIALS.find(m => m.index === 210)!; // eye_railing03.bmp
    expect(ptMaterialHasOpacityMap(bmpRailing)).toBe(false);
    const water = PT_MATERIALS.find(m => m.index === 107)!; // riy-f030.bmp
    expect(ptMaterialHasOpacityMap(water)).toBe(false);
    // PT alpha-test threshold: ALPHATESTDEPTH 60, compare >=.
    expect(PT_ALPHA_TEST_REF).toBeCloseTo(60 / 255, 5);
  });

  it('sets alphaTest + transparency on cutout materials (railings/foliage)', async () => {
    const view = await buildPtTerrainView();
    const solid = view.group.getObjectByName('pt-ricarten-solid') as THREE.Mesh;
    const mats = solid.material as THREE.MeshLambertMaterial[];
    const byName = new Map(mats.map(m => [m.name, m]));
    // eye_railing.TGA (mat 197) is the visible white-grill regression: PT
    // alpha-tests it at 60/255, so WoC must alphaTest, not render it opaque.
    const railing = byName.get('pt-mat-197')!;
    expect(railing.alphaTest).toBeCloseTo(60 / 255, 5);
    expect(railing.transparent).toBe(true);
    // Transparency 0 -> opacity 1, z-write stays on (PT ZWriteAuto > 0.2).
    expect(railing.opacity).toBe(1);
    expect(railing.depthWrite).toBe(true);
    // BMP railing (mat 210) stays opaque - no alpha test in PT either.
    const bmpRailing = byName.get('pt-mat-210')!;
    expect(bmpRailing.alphaTest).toBe(0);
    expect(bmpRailing.transparent).toBe(false);
  });

  it('renders PT single-sided materials FrontSide and double-sided DoubleSide', async () => {
    const view = await buildPtTerrainView();
    const solid = view.group.getObjectByName('pt-ricarten-solid') as THREE.Mesh;
    const mats = solid.material as THREE.MeshLambertMaterial[];
    const byName = new Map(mats.map(m => [m.name, m]));
    // Mat 210 (eye_railing03.bmp) is TwoSide=false in the SMD.
    expect(byName.get('pt-mat-210')!.side).toBe(THREE.FrontSide);
    // Mat 197 (eye_railing.TGA) is TwoSide=true.
    expect(byName.get('pt-mat-197')!.side).toBe(THREE.DoubleSide);
  });

  it('attaches the PT WINDZ1 vertex script to the 12 foliage materials only', async () => {
    const view = await buildPtTerrainView();
    const solid = view.group.getObjectByName('pt-ricarten-solid') as THREE.Mesh;
    const mats = solid.material as THREE.MeshLambertMaterial[];
    const windMats = new Set([136, 137, 138, 139, 239, 240, 241, 242, 243, 244, 245, 246, 247]);
    let windCount = 0;
    for (const m of mats) {
      const idx = Number(m.name.replace('pt-mat-', ''));
      const ptMat = PT_MATERIALS.find(x => x.index === idx)!;
      const scripted = m.customProgramCacheKey() === 'pt-windz1';
      expect(scripted).toBe(ptVertexScriptFor(ptMat.windMeshBottom) === 'windz1');
      if (scripted) {
        windCount++;
        expect(windMats.has(idx)).toBe(true);
        expect(typeof m.onBeforeCompile).toBe('function');
      }
    }
    expect(windCount).toBe(windMats.size);
  });

  it('attaches the PT water ripple script to water-flagged materials only', async () => {
    const view = await buildPtTerrainView();
    const water = view.group.getObjectByName('pt-ricarten-water') as THREE.Mesh;
    const mats = water.material as THREE.MeshLambertMaterial[];
    // Mats 107 + 232 carry sMATS_SCRIPT_WATER; mat 140 is translucent only.
    const scripted = new Set(mats.filter(m => m.customProgramCacheKey() === 'pt-water').map(m => m.name));
    expect(scripted).toEqual(new Set(['pt-mat-107', 'pt-mat-232']));
    // Real textures, real opacity (1 - transparency), no z-write.
    const m107 = mats.find(m => m.name === 'pt-mat-107')!;
    expect(m107.map).not.toBeNull();
    expect(m107.opacity).toBeCloseTo(1 - 0.29, 2);
  });
});
