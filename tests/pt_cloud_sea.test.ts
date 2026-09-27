// High-altitude cloud-sea resolution (src/sim/pt_cloud_sea.ts): Pillai's
// authored full-field cloud sheets (cloud01/cloud01-1, WATER wind script,
// opaque) must render as a cloud ocean, not as a water plate. The resolver
// detects them purely from field data: water-scripted cloud-textured
// materials whose faces span the bounds and sit below the town.
//
// Also covers the render-side build (buildPtTerrainView): a field with a
// resolved cloud sea mounts the `pt-<id>-cloudsea` apron and gives the
// sheet materials the cloud shader, without producing any ocean geometry.

import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { loadPtDevMap } from '../src/game/pt_dev_maps';
import { buildPtTerrainView } from '../src/render/pt_terrain';
import type { PtFieldModule, PtMaterialLike } from '../src/sim/pt_field';
import { ptResolveCloudSea } from '../src/sim/pt_cloud_sea';

const mat = (over: Partial<PtMaterialLike>): PtMaterialLike => ({
  index: 0,
  isWalkable: false,
  transparency: 0,
  blendType: 1,
  shade: 0,
  twoSide: false,
  useState: 0,
  meshState: 0,
  windMeshBottom: 0,
  mapOpacity: 0,
  textureType: 0,
  textureNames: [],
  ...over,
});

interface FakeFieldInit {
  bounds?: Partial<PtFieldModule['PT_BOUNDS']>;
  materials?: PtMaterialLike[];
  vertices?: number[];
  faces?: number[];
  uvs?: number[];
}

const fakeField = (init: FakeFieldInit): PtFieldModule => ({
  PT_BOUNDS: { minX: 0, maxX: 1000, minY: -2000, maxY: 1500, minZ: 0, maxZ: 1000, ...init.bounds },
  PT_N_VERTEX: (init.vertices?.length ?? 0) / 3,
  PT_N_FACE: (init.faces?.length ?? 0) / 4,
  PT_N_WATER: 0,
  PT_N_DECORATIVE: 0,
  PT_GRID_SIZE: 0,
  PT_CELL_SIZE: 256,
  PT_MATERIALS: init.materials ?? [],
  PT_VERTICES: () => new Float32Array(init.vertices ?? []),
  PT_RENDER_FACES: () => new Uint16Array(init.faces ?? []),
  PT_UVS: () => new Float32Array(init.uvs ?? []),
  PT_WALKABLE_FACES: () => new Uint16Array(),
  PT_CELL_OFFSETS: () => new Int32Array(),
  PT_CELL_COUNTS: () => new Int16Array(),
  PT_CELL_FACE_INDICES: () => new Uint16Array(),
  PT_WATER_FACE_INDICES: () => new Uint16Array(),
  PT_DECORATIVE_FACE_INDICES: () => new Uint16Array(),
});

// One cloud-sheet face near (x,z)=(cx,cz) at height py. `face` packs the
// tri indices + material the way PT_RENDER_FACES does.
const fieldSpanningCloudField = (): PtFieldModule =>
  fakeField({
    materials: [
      mat({ index: 7, windMeshBottom: 0x200, textureNames: ['cloud01-1.bmp'], textureFormState: [9] }),
      mat({ index: 9, windMeshBottom: 0x200, textureNames: ['sea_0.bmp'] }),
    ],
    // Two quads spanning the bounds: sheet mat 7 covers 0..900 in x/z.
    vertices: [
      50, -900, 50, 900, -800, 50, 900, -950, 900,
      50, -900, 50, 900, -950, 900, 50, -880, 900,
      100, -100, 100, 200, -100, 100, 200, -100, 200, // pond tri on mat 9
    ],
    faces: [
      0, 1, 2, 7,
      3, 4, 5, 7,
      6, 7, 8, 9,
    ],
    uvs: [
      0, 1, 1, 0, 0.5, 0.5, // per-face u0,u1,u2,v0,v1,v2
      0, 1, 1, 0, 0.5, 0.5,
      0, 0.1, 0.1, 0, 0.05, 0.05,
    ],
  });

describe('ptResolveCloudSea', () => {
  it('detects field-spanning water-scripted cloud sheets', () => {
    const spec = ptResolveCloudSea(fieldSpanningCloudField());
    expect(spec).not.toBeNull();
    expect(spec!.materialIndices).toEqual([7]);
    expect(spec!.apronMaterialIndex).toBe(7);
    expect(spec!.scrollForm).toBe(9);
    // Apron sits below the lowest authored cloud vertex (-950 - 24).
    expect(spec!.apronPtY).toBeCloseTo(-974, 5);
    // UV density from the sheet faces: u span 1 over x span 850.
    expect(spec!.uScale).toBeCloseTo(1 / 850, 6);
    expect(spec!.vScale).toBeCloseTo(0.5 / 850, 6);
  });

  it('rejects fields with no cloud-textured materials', () => {
    const f = fakeField({
      materials: [mat({ index: 3, windMeshBottom: 0x200, textureNames: ['sea_0.bmp'] })],
      vertices: [0, 0, 0, 1000, 0, 0, 1000, 0, 1000],
      faces: [0, 1, 2, 3],
      uvs: [0, 1, 1, 0, 0.5, 0.5],
    });
    expect(ptResolveCloudSea(f)).toBeNull();
  });

  it('rejects cloud textures without the water wind script', () => {
    const f = fieldSpanningCloudField();
    (f.PT_MATERIALS as PtMaterialLike[])[0] = mat({
      index: 7,
      windMeshBottom: 0,
      textureNames: ['cloud01.bmp'],
    });
    expect(ptResolveCloudSea(f)).toBeNull();
  });

  it('rejects a localized cloud surface (not field-spanning)', () => {
    const f = fakeField({
      materials: [mat({ index: 7, windMeshBottom: 0x200, textureNames: ['cloud01.bmp'] })],
      // A 100x100 patch in one corner - under the 60% span floor.
      vertices: [0, -900, 0, 100, -900, 0, 100, -900, 100],
      faces: [0, 1, 2, 7],
      uvs: [0, 1, 1, 0, 0.5, 0.5],
    });
    expect(ptResolveCloudSea(f)).toBeNull();
  });

  it('rejects a cloud canopy above the town', () => {
    const f = fakeField({
      materials: [mat({ index: 7, windMeshBottom: 0x200, textureNames: ['cloud01.bmp'] })],
      // Field-spanning but high (mean y ~1200 > bounds midpoint -250).
      vertices: [0, 1200, 0, 1000, 1200, 0, 1000, 1200, 1000],
      faces: [0, 1, 2, 7],
      uvs: [0, 1, 1, 0, 0.5, 0.5],
    });
    expect(ptResolveCloudSea(f)).toBeNull();
  });
});

describe('ptResolveCloudSea on shipped fields', () => {
  it('pilai resolves mats 231/232 with cloud01-1 as the apron texture', async () => {
    const { descriptor } = await loadPtDevMap('pilai');
    const spec = descriptor.cloudSea;
    expect(spec).not.toBeNull();
    expect(spec!.materialIndices).toEqual([231, 232]);
    // cloud01-1 (mat 231) has the most faces -> dominant apron texture.
    expect(spec!.apronMaterialIndex).toBe(231);
    expect(spec!.scrollForm).toBe(9);
    // Below the lowest cloud vertex (~-2219.5) minus the drop.
    expect(spec!.apronPtY).toBeLessThan(-2230);
    // Authored tiling density (~18u x ~15v wraps over the field span).
    expect(spec!.uScale).toBeGreaterThan(0.0015);
    expect(spec!.uScale).toBeLessThan(0.003);
    expect(spec!.vScale).toBeGreaterThan(0.001);
    expect(spec!.vScale).toBeLessThan(0.002);
  }, 60000);

  it('sea-edge and inland fields resolve no cloud sea', async () => {
    for (const id of ['town1', 'ricarten', 'fore-3']) {
      const { descriptor } = await loadPtDevMap(id);
      expect(descriptor.cloudSea ?? null).toBeNull();
    }
  }, 60000);
});

describe('buildPtTerrainView cloud sea', () => {
  it('pilai mounts the cloud apron, no ocean geometry', async () => {
    const { descriptor } = await loadPtDevMap('pilai');
    const view = await buildPtTerrainView(descriptor);
    const names = view.group.children.map((c) => c.name);
    expect(names).toContain('pt-pilai-cloudsea');
    expect(names.some((n) => n.includes('ocean') || n.includes('deepsea'))).toBe(false);
    const apron = view.group.getObjectByName('pt-pilai-cloudsea')!;
    const expectedY = descriptor.transform.ptYToWoC(descriptor.cloudSea!.apronPtY);
    expect(apron.position.y).toBeCloseTo(expectedY, 4);
    // The cloud sheets carry the cloud shader (distinct program key).
    const solid = view.group.getObjectByName('pt-pilai-solid')!;
    const mats = Array.isArray((solid as THREE.Mesh).material)
      ? ((solid as THREE.Mesh).material as THREE.Material[])
      : [(solid as THREE.Mesh).material as THREE.Material];
    const cloud231 = mats.find((m) => m.name === 'pt-mat-231')!;
    const cloud232 = mats.find((m) => m.name === 'pt-mat-232')!;
    expect(cloud231.customProgramCacheKey()).toContain('-cloud');
    expect(cloud232.customProgramCacheKey()).toContain('-cloud');
    // The in-town sea_0 pond materials keep the ordinary water path.
    const pond = mats.find((m) => m.name === 'pt-mat-180')!;
    expect(pond.customProgramCacheKey()).not.toContain('-cloud');
    view.dispose();
  }, 120000);
});
