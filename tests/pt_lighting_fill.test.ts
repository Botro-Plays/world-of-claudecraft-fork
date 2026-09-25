// Phase 5D: the PT Lambert fill lift. PT terrain/stage materials are
// MeshLambertMaterial, which never samples the scene IBL, so under the
// standard-materials rig they rendered on the rig's deliberately weak
// hemisphere alone (the connected world read far darker than WoC ground).
// ptApplyShaderHooks binds the SAME shared uTerrainFillBoost uniform the
// WoC Lambert terrain uses, so the fill is identical by construction:
// 1 under the Lambert rig or an interior state, the eased Lambert/standard
// hemisphere ratio under the standard rig. Values/rig semantics live in
// tests/outdoor_light_rig_core.test.ts; this file pins the PT wiring.

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../src/render/assets/loader', () => ({
  loadTexture: vi.fn(async (url: string) => {
    const tex = new THREE.Texture();
    tex.name = url;
    return tex;
  }),
}));

import { buildPtTerrainView, ptApplyShaderHooks } from '../src/render/pt_terrain';
import { sharedUniforms } from '../src/render/gfx';
import { loadPtDevMap } from '../src/game/pt_dev_maps';
import {
  HEMI_INTENSITY_COMPOSER,
  LAMBERT_RIG_HEMI_INTENSITY,
  lambertTerrainFillBoost,
} from '../src/render/outdoor_light_rig_core';

interface FakeShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

function fakeShader(): FakeShader {
  return {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <lights_fragment_begin>',
  };
}

function compileWith(mat: THREE.Material): FakeShader {
  const sh = fakeShader();
  (mat.onBeforeCompile as unknown as (s: FakeShader, r: null) => void)(sh, null);
  return sh;
}

// PT-source materials are named pt-mat-<index> by the factories; the
// WoC-added decorative ocean/deep-sea materials are intentionally outside
// the fill scope and are filtered out here.
function materialsOf(root: THREE.Object3D): THREE.MeshLambertMaterial[] {
  const mats: THREE.MeshLambertMaterial[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of list) {
      if (/^pt-(obj-)?mat-/.test(m.name)) mats.push(m as THREE.MeshLambertMaterial);
    }
  });
  return mats;
}

// ---------------------------------------------------------------------------
// The patch itself
// ---------------------------------------------------------------------------

describe('ptApplyShaderHooks', () => {
  it('binds the shared WoC terrain fill uniform (same object, not a copy)', () => {
    const mat = new THREE.MeshLambertMaterial();
    ptApplyShaderHooks(mat, null);
    const sh = compileWith(mat);
    expect(sh.uniforms.uWocFillBoost).toBe(sharedUniforms.uTerrainFillBoost);
  });

  it('lifts hemisphere irradiance only (RE_IndirectDiffuse guarded)', () => {
    const mat = new THREE.MeshLambertMaterial();
    ptApplyShaderHooks(mat, null);
    const sh = compileWith(mat);
    expect(sh.fragmentShader).toContain('uniform float uWocFillBoost;');
    expect(sh.fragmentShader).toContain('irradiance *= uWocFillBoost;');
    expect(sh.fragmentShader).toContain('#if defined( RE_IndirectDiffuse )');
    // The lift lands AFTER lights_fragment_begin accumulates the hemisphere,
    // so the sun term inside the chunk is untouched.
    expect(sh.fragmentShader.indexOf('irradiance *= uWocFillBoost')).toBeGreaterThan(
      sh.fragmentShader.indexOf('#include <lights_fragment_begin>'),
    );
  });

  it('does not displace vertices when the script is null', () => {
    const mat = new THREE.MeshLambertMaterial();
    ptApplyShaderHooks(mat, null);
    const sh = compileWith(mat);
    expect(mat.customProgramCacheKey()).toBe('pt-flat');
    expect(sh.vertexShader).not.toContain('ptWindShift');
    expect(sh.vertexShader).not.toContain('transformed.x');
  });

  it('keeps the wind script path while adding the fill', () => {
    const mat = new THREE.MeshLambertMaterial();
    ptApplyShaderHooks(mat, 'windz1');
    const sh = compileWith(mat);
    expect(mat.customProgramCacheKey()).toBe('pt-windz1');
    expect(sh.vertexShader).toContain('ptWindShift');
    expect(sh.uniforms.uPtTime).toBe(sharedUniforms.uTime);
    expect(sh.uniforms.uWocFillBoost).toBe(sharedUniforms.uTerrainFillBoost);
    expect(sh.fragmentShader).toContain('irradiance *= uWocFillBoost;');
  });

  it('is deterministic: two materials produce identical patches', () => {
    const a = new THREE.MeshLambertMaterial();
    const b = new THREE.MeshLambertMaterial();
    ptApplyShaderHooks(a, 'water');
    ptApplyShaderHooks(b, 'water');
    const sha = compileWith(a);
    const shb = compileWith(b);
    expect(sha.vertexShader).toBe(shb.vertexShader);
    expect(sha.fragmentShader).toBe(shb.fragmentShader);
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
  });
});

// ---------------------------------------------------------------------------
// Fill value semantics (the "expected default" and the live rig ratio)
// ---------------------------------------------------------------------------

describe('PT fill parameter', () => {
  it('defaults to 1 (neutral) before the renderer eases it to the rig target', () => {
    // sharedUniforms.uTerrainFillBoost is created at value 1 in gfx.ts; the
    // renderer eases it toward terrainFillBoostTarget() per frame. PT never
    // writes the value itself.
    expect(sharedUniforms.uTerrainFillBoost.value).toBe(1);
  });

  it('matches the WoC Lambert fill ratio under the standard rig', () => {
    // The boost is the Lambert rig's daylight hemisphere divided by the
    // standard rig's weak hemisphere - PT binds the same uniform, so its
    // fill cannot drift from the WoC terrain's.
    const composer = lambertTerrainFillBoost({
      composer: true,
      gradePass: true,
      standardMaterials: true,
    });
    expect(composer).toBeCloseTo(LAMBERT_RIG_HEMI_INTENSITY / HEMI_INTENSITY_COMPOSER, 10);
    expect(composer).toBeGreaterThan(3);
    expect(
      lambertTerrainFillBoost({ composer: false, gradePass: false, standardMaterials: false }),
    ).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Coverage: every material in a built PT view carries the fill
// ---------------------------------------------------------------------------

describe('built PT views', () => {
  it('every ricarten terrain material receives the PT fill', async () => {
    const view = await buildPtTerrainView();
    const mats = materialsOf(view.group);
    expect(mats.length).toBeGreaterThan(0);
    for (const m of mats) {
      const sh = compileWith(m);
      expect(sh.uniforms.uWocFillBoost).toBe(sharedUniforms.uTerrainFillBoost);
      expect(sh.fragmentShader).toContain('irradiance *= uWocFillBoost;');
      expect(m.customProgramCacheKey()).toMatch(/^pt-/);
    }
    view.dispose();
  });

  it('sod-1 stage-object materials receive the same fill as terrain', async () => {
    const { descriptor } = await loadPtDevMap('sod-1');
    const view = await buildPtTerrainView(descriptor);
    const stageGroup = view.group.getObjectByName('pt-sod-1-stage-objects')!;
    const mats = materialsOf(stageGroup);
    expect(mats.length).toBeGreaterThan(0);
    for (const m of mats) {
      const sh = compileWith(m);
      expect(sh.uniforms.uWocFillBoost).toBe(sharedUniforms.uTerrainFillBoost);
      expect(sh.fragmentShader).toContain('irradiance *= uWocFillBoost;');
    }
    view.dispose();
  });

  it('Phase 5C vertex colors stay enabled alongside the fill', async () => {
    const view = await buildPtTerrainView();
    const solid = view.group.getObjectByName('pt-ricarten-solid') as THREE.Mesh;
    for (const m of solid.material as THREE.MeshLambertMaterial[]) {
      expect(m.vertexColors).toBe(true);
    }
    view.dispose();
  });
});

// ---------------------------------------------------------------------------
// State safety: the fill is a shared uniform reference, never a mutation
// ---------------------------------------------------------------------------

describe('fill state safety', () => {
  it('building and disposing views never mutates the shared uniform', async () => {
    const before = sharedUniforms.uTerrainFillBoost;
    const beforeValue = before.value;
    // Install, dispose, install a different field: the uniform object and
    // its value must be identical afterwards (no multiplyScalar-style
    // accumulation is possible - the patch only binds a reference).
    const v1 = await buildPtTerrainView();
    v1.dispose();
    const { descriptor } = await loadPtDevMap('fore-1');
    const v2 = await buildPtTerrainView(descriptor);
    v2.dispose();
    expect(sharedUniforms.uTerrainFillBoost).toBe(before);
    expect(sharedUniforms.uTerrainFillBoost.value).toBe(beforeValue);
  });

  it('a non-PT Lambert material is untouched by the PT hook', () => {
    // Non-PT materials never pass through ptApplyShaderHooks; the default
    // THREE onBeforeCompile is a no-op, so nothing injects uWocFillBoost.
    const plain = new THREE.MeshLambertMaterial();
    const sh = fakeShader();
    (plain.onBeforeCompile as unknown as (s: FakeShader, r: null) => void)(sh, null);
    expect(sh.uniforms.uWocFillBoost).toBeUndefined();
    expect(sh.fragmentShader).not.toContain('irradiance *= uWocFillBoost');
  });
});
