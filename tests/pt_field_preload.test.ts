// Phase 6A: PT 3D world visual preload.
//
// Before this phase a PT field build resolved textures serially: each
// material group awaited its own load, the three terrain passes ran one
// after another, and stage objects only started after all terrain finished
// - a ~276-texture Ricarten build effectively fetched at concurrency 1, so
// the field surfaced to the player seconds late and the standby field was
// rarely dressed by the time the player reached a FieldGate.
//
// The build now kicks every referenced texture fetch in one synchronous
// pass (ptFetchTexture/stageFetchTexture insert the promise into the view
// cache eagerly, so the shared loader's queue fills before the first
// await), the stage view does the same, and the view only resolves once
// every referenced texture has SETTLED: "visually ready" before "visible".
// These tests pin the fan-out, the atomicity, the missing-texture latch,
// and the request dedup; the gate pins data-ready vs visual-ready.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/render/assets/loader', () => ({
  loadTexture: vi.fn(),
}));

import { loadTexture } from '../src/render/assets/loader';
import { buildPtStageObjectsView } from '../src/render/pt_stage_objects';
import { buildPtTerrainView, loadPtTextureUrl, PT_RICARTEN_SOURCE } from '../src/render/pt_terrain';
import { PtTerrainGate } from '../src/render/pt_terrain_gate';

const loadTextureMock = vi.mocked(loadTexture);

interface Deferred {
  url: string;
  resolve: (t: THREE.Texture) => void;
  reject: (e: unknown) => void;
}
let deferred: Deferred[] = [];

// Loader where every fetch parks until the test resolves it. Calling a
// build function records every URL the build would fetch; resolving later
// releases the build.
function deferredLoader(): void {
  deferred = [];
  loadTextureMock.mockReset();
  loadTextureMock.mockImplementation(
    (url: string) =>
      new Promise<THREE.Texture>((resolve, reject) => {
        deferred.push({ url, resolve, reject });
      }),
  );
}

function immediateLoader(): void {
  loadTextureMock.mockReset();
  loadTextureMock.mockImplementation(async (url: string) => {
    const t = new THREE.Texture();
    t.name = url;
    return t;
  });
}

function resolvePending(except?: Deferred): void {
  for (const d of deferred) {
    if (d === except) continue;
    const t = new THREE.Texture();
    t.name = d.url;
    d.resolve(t);
  }
}

async function flush(turns = 12): Promise<void> {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}

function meshMaterialNames(view: { group: THREE.Group }): string[][] {
  const out: string[][] = [];
  view.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    out.push(mats.map((m) => m.name));
  });
  return out;
}

describe('terrain build texture fan-out', () => {
  it('requests every referenced texture before the first one resolves', async () => {
    deferredLoader();
    let resolved = false;
    const p = buildPtTerrainView().then((v) => {
      resolved = true;
      return v;
    });
    // The warm pass is synchronous: by the time the build hits its first
    // await, every terrain AND stage-object texture is already in flight.
    expect(deferred.length).toBeGreaterThan(276);
    await flush();
    expect(resolved).toBe(false);
    resolvePending();
    await p;
    expect(resolved).toBe(true);
  });

  it('stays pending while even one referenced texture is unresolved', async () => {
    deferredLoader();
    let resolved = false;
    const p = buildPtTerrainView().then(() => {
      resolved = true;
    });
    const holdout = deferred[deferred.length - 1];
    resolvePending(holdout);
    await flush();
    expect(resolved).toBe(false);
    holdout.resolve(new THREE.Texture());
    await p;
    expect(resolved).toBe(true);
  });
});

describe('stage-object build texture fan-out', () => {
  it('requests every object texture before the first one resolves', async () => {
    deferredLoader();
    let resolved = false;
    const p = buildPtStageObjectsView().then(() => {
      resolved = true;
    });
    expect(deferred.length).toBeGreaterThan(10);
    await flush();
    expect(resolved).toBe(false);
    resolvePending();
    await p;
    expect(resolved).toBe(true);
  });

  it('fetches each distinct stage texture URL at most once per view', async () => {
    immediateLoader();
    await buildPtStageObjectsView();
    const counts = new Map<string, number>();
    for (const c of loadTextureMock.mock.calls) {
      const url = c[0] as string;
      counts.set(url, (counts.get(url) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThan(10);
    for (const [url, n] of counts) {
      expect(n, `duplicate fetch for ${url}`).toBe(1);
    }
  });
});

describe('texture request dedup', () => {
  it('concurrent callers of one URL share a single in-flight request', async () => {
    immediateLoader();
    const url = '/textures/pt-ricarten/zzz_phase6a_dedupe.png';
    const [a, b] = await Promise.all([loadPtTextureUrl(url), loadPtTextureUrl(url)]);
    expect(loadTextureMock.mock.calls.filter((c) => c[0] === url).length).toBe(1);
    expect(a).toBe(b);
  });
});

describe('missing texture latch', () => {
  it('a rejected URL resolves null once and is never requested again', async () => {
    const url = '/textures/pt-ricarten/zzz_phase6a_missing.png';
    loadTextureMock.mockRejectedValueOnce(new Error('404'));
    await expect(loadPtTextureUrl(url)).resolves.toBeNull();
    loadTextureMock.mockClear();
    // The latch answers before the loader is even consulted.
    await expect(loadPtTextureUrl(url)).resolves.toBeNull();
    expect(loadTextureMock).not.toHaveBeenCalled();
  });

  it('a missing field texture is not refetched on a view rebuild', async () => {
    loadTextureMock.mockImplementation(async (url: string) => {
      if (url.endsWith('tem_wall04.png')) throw new Error('missing');
      return new THREE.Texture();
    });
    await buildPtTerrainView();
    const first = loadTextureMock.mock.calls.filter((c) =>
      (c[0] as string).endsWith('tem_wall04.png'),
    ).length;
    expect(first).toBeGreaterThanOrEqual(1);
    loadTextureMock.mockClear();
    await buildPtTerrainView();
    const second = loadTextureMock.mock.calls.filter((c) =>
      (c[0] as string).endsWith('tem_wall04.png'),
    ).length;
    expect(second).toBe(0);
  });

  it('missing textures never block the build: the view still resolves', async () => {
    loadTextureMock.mockImplementation(async (url: string) => {
      if (url.endsWith('tem_wall04.png')) throw new Error('missing');
      const t = new THREE.Texture();
      t.name = url;
      return t;
    });
    const view = await buildPtTerrainView();
    expect(view.group.children.length).toBeGreaterThan(0);
  });
});

describe('deterministic build ordering', () => {
  it('parallel passes preserve mesh and material-group order across builds', async () => {
    immediateLoader();
    const a = await buildPtTerrainView();
    const b = await buildPtTerrainView();
    expect(meshMaterialNames(a)).toEqual(meshMaterialNames(b));
  });

  it('every mesh group maps to a material slot sequentially', async () => {
    immediateLoader();
    const view = await buildPtTerrainView();
    view.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry as THREE.BufferGeometry;
      // Single-material decorative meshes (ocean ring, deep-sea plane)
      // carry no explicit groups; grouped meshes must map 1:1.
      if (geo.groups.length === 0) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      expect(geo.groups.length).toBe(mats.length);
      geo.groups.forEach((g, i) => {
        expect(g.materialIndex).toBe(i);
      });
    });
  });
});

describe('gate: data-ready vs visual-ready', () => {
  it('the gate exposes no view until textures have settled', async () => {
    deferredLoader();
    let attached = 0;
    const gate = new PtTerrainGate(
      (src) => buildPtTerrainView(src),
      () => {
        attached++;
      },
    );
    const pending = gate.ensure(PT_RICARTEN_SOURCE);
    expect(pending).not.toBeNull();
    await flush();
    // The descriptor is bound (build in flight) but nothing is visible.
    expect(gate.source).toBe(PT_RICARTEN_SOURCE);
    expect(gate.current).toBeNull();
    expect(attached).toBe(0);
    resolvePending();
    await pending;
    expect(gate.current).not.toBeNull();
    expect(attached).toBe(1);
  });
});
