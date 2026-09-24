// Tests for the /ptmap development map-test harness: manifest enumeration,
// package loading, spawn resolution, the active-map registry swap, and the
// generic band transform. Uses the real generated/pt-maps/ packages (the
// manifests and field modules are the committed conversion output).

import { afterEach, describe, expect, it } from 'vitest';
import * as RICARTEN_FIELD from '../src/sim/pt_ricarten_field.generated';
import {
  PT_BAND_X_MIN,
  PT_BAND_Z,
  PT_RICARTEN_MAX_X,
  PT_RICARTEN_MIN_Y,
  PT_RICARTEN_MIN_Z,
  PT_SCALE,
  ptXToWoC,
  ptYToWoC,
  ptZToWoC,
  woCToPtX,
  woCToPtY,
  woCToPtZ,
} from '../src/sim/pt_band';
import { makePtBandTransform } from '../src/sim/pt_field';
import {
  activePtField,
  activePtMapDescriptor,
  ptRicartenField,
  setActivePtMap,
} from '../src/sim/pt_field_active';
import { ptStageBandMatrixFor } from '../src/render/pt_stage_objects';
import { PT_STAGE_BAND_MATRIX } from '../src/render/pt_stage_objects';
import {
  listPtDevMaps,
  loadPtDevMap,
  resolvePtDevSpawn,
} from '../src/game/pt_dev_maps';

const RICARTEN_TRANSFORM = {
  ptXToWoC,
  ptYToWoC,
  ptZToWoC,
  woCToPtX,
  woCToPtY,
  woCToPtZ,
};

afterEach(() => {
  setActivePtMap(null); // never leave a dev map installed across suites
});

describe('makePtBandTransform', () => {
  it('round-trips PT <-> WoC coordinates for an arbitrary map', () => {
    const xf = makePtBandTransform({ minX: -15384, maxX: -8000, minY: -500, maxY: 900, minZ: -24310, maxZ: -15000 });
    for (const [px, py, pz] of [[-15384, -500, -24310], [-12000, 100, -20000], [-8000, 900, -15000]]) {
      expect(xf.woCToPtX(xf.ptXToWoC(px))).toBeCloseTo(px, 6);
      expect(xf.woCToPtY(xf.ptYToWoC(py))).toBeCloseTo(py, 6);
      expect(xf.woCToPtZ(xf.ptZToWoC(pz))).toBeCloseTo(pz, 6);
    }
    // PT +X mirrors to WoC -X, anchored so the map's east edge sits at the
    // band origin; Z maps 1:1 from the map's minZ at the band plane.
    expect(xf.ptXToWoC(-8000)).toBeCloseTo(PT_BAND_X_MIN, 6);
    expect(xf.ptZToWoC(-24310)).toBeCloseTo(PT_BAND_Z, 6);
    expect(xf.ptYToWoC(-500)).toBeCloseTo(0, 6);
  });

  it('reproduces the pt_band Ricarten transform within the bound rounding', () => {
    // The generated Ricarten package carries TIGHT vertex bounds while
    // pt_band holds the rounded authored constants (maxX 5584.6875 vs 5585),
    // so the generic transform matches the production one only up to the
    // bounds delta (~0.4 PT unit ~= 0.012 yd). The math shape is identical.
    const xf = makePtBandTransform(RICARTEN_FIELD.PT_BOUNDS);
    for (const px of [RICARTEN_FIELD.PT_BOUNDS.minX, 0, RICARTEN_FIELD.PT_BOUNDS.maxX]) {
      expect(xf.ptXToWoC(px)).toBeCloseTo(ptXToWoC(px), 1);
    }
    for (const py of [RICARTEN_FIELD.PT_BOUNDS.minY, 0, RICARTEN_FIELD.PT_BOUNDS.maxY]) {
      expect(xf.ptYToWoC(py)).toBeCloseTo(ptYToWoC(py), 1);
    }
    for (const pz of [RICARTEN_FIELD.PT_BOUNDS.minZ, -17000, RICARTEN_FIELD.PT_BOUNDS.maxZ]) {
      expect(xf.ptZToWoC(pz)).toBeCloseTo(ptZToWoC(pz), 1);
    }
  });
});

describe('ptStageBandMatrixFor', () => {
  it('reproduces the committed Ricarten band matrix', () => {
    const m = ptStageBandMatrixFor(RICARTEN_TRANSFORM);
    // Sampling an affine map at f(0)/f(1) carries ~1e-13 cancellation noise
    // on the near-zero diagonal entries; irrelevant to a render matrix but
    // below bit-exact, so compare elementwise with a tight epsilon.
    for (let i = 0; i < 16; i++) {
      expect(m.elements[i]).toBeCloseTo(PT_STAGE_BAND_MATRIX.elements[i], 9);
    }
  });
});

describe('listPtDevMaps (manifest enumeration)', () => {
  it('enumerates all 72 packages sorted by id with QA columns', () => {
    const maps = listPtDevMaps();
    expect(maps.length).toBe(72);
    const ids = maps.map((m) => m.id);
    expect([...ids].sort()).toEqual(ids);

    const ricarten = maps.find((m) => m.id === 'ricarten')!;
    expect(ricarten.fieldIndex).toBe(3);
    expect(ricarten.mapName).toBe('village-2');
    expect(ricarten.startCount).toBe(2);
    expect(ricarten.minimap).toBe('Field/map/village-2.tga');
    expect(ricarten.verts).toBeGreaterThan(0);
    expect(ricarten.faces).toBeGreaterThan(0);

    const dun1 = maps.find((m) => m.id === 'dun-1')!;
    expect(dun1.startCount).toBe(0);

    const ancientw = maps.find((m) => m.id === 'ancientw')!;
    expect(ancientw.hasStageModule).toBe(true);
    expect(ancientw.stageObjectFiles).toBe(10);

    // No package reports a negative warning count; ids are unique.
    for (const m of maps) expect(m.warningCount).toBeGreaterThanOrEqual(0);
    expect(new Set(ids).size).toBe(72);
  });
});

describe('loadPtDevMap', () => {
  it('rejects an unknown map id instead of substituting anything', async () => {
    await expect(loadPtDevMap('not-a-map')).rejects.toThrow(/not-a-map/);
  });

  it('loads a non-Ricarten package with its own field, transform, and stage objects', async () => {
    const { descriptor, manifest, spawn } = await loadPtDevMap('ancientw');

    // Own generated field module, never the committed Ricarten one.
    expect(descriptor.field).not.toBe(RICARTEN_FIELD);
    expect(descriptor.field.PT_N_VERTEX).toBe(manifest.field?.vertices);
    expect(descriptor.field.PT_N_FACE).toBe(manifest.field?.faces);
    expect(descriptor.field.PT_BOUNDS).not.toEqual(RICARTEN_FIELD.PT_BOUNDS);

    // Own texture root and own stage-object module.
    expect(descriptor.textureBase).toBe('/textures/pt-ancientw/');
    expect(descriptor.stageObjects).not.toBeNull();
    expect(descriptor.stageObjects!.PT_STAGE_OBJECTS.length).toBeGreaterThan(0);

    // No Ricarten-specific visual extensions ride along.
    expect(descriptor.oceanRing).toBe(false);

    // Authored start resolves to a finite floor in the map's own band space.
    expect(spawn).not.toBeNull();
    expect(spawn!.kind).toBe('start');
    expect(Number.isFinite(spawn!.x)).toBe(true);
    expect(Number.isFinite(spawn!.y)).toBe(true);
    expect(spawn!.x).toBeGreaterThanOrEqual(PT_BAND_X_MIN);
  });

  it('resolves a TEST-ONLY spawn for a map with no authored start points', async () => {
    const { spawn } = await loadPtDevMap('dun-1');
    expect(spawn).not.toBeNull();
    expect(['center', 'fallback']).toContain(spawn!.kind);
    expect(Number.isFinite(spawn!.y)).toBe(true);
  });
});

describe('active PT map registry', () => {
  it('defaults to the committed Ricarten field', () => {
    expect(activePtMapDescriptor()).toBeNull();
    expect(activePtField()).toBe(ptRicartenField());
  });

  it('routes collision to the installed dev map and restores Ricarten on clear', async () => {
    const { descriptor, spawn } = await loadPtDevMap('ancientw');
    expect(spawn).not.toBeNull();

    // Ricarten query at the same WoC point before the swap.
    const before = activePtField().groundHeight(spawn!.x, spawn!.z);

    setActivePtMap(descriptor);
    expect(activePtMapDescriptor()).toBe(descriptor);
    const dev = activePtField().groundHeight(spawn!.x, spawn!.z);
    // The dev map's own floor resolves at its authored start (a finite
    // height the Ricarten field could not produce at these coordinates).
    expect(Number.isFinite(dev)).toBe(true);
    expect(dev).toBe(spawn!.y);

    setActivePtMap(null);
    expect(activePtMapDescriptor()).toBeNull();
    expect(activePtField()).toBe(ptRicartenField());
    expect(activePtField().groundHeight(spawn!.x, spawn!.z)).toBe(before);
  });

  it('resolvePtDevSpawn prefers authored starts over the center', async () => {
    const { descriptor, manifest, spawn } = await loadPtDevMap('village-1');
    expect(spawn!.kind).toBe('start');
    const again = resolvePtDevSpawn(descriptor.field, descriptor.transform, manifest);
    expect(again).toEqual(spawn);
  });
});
