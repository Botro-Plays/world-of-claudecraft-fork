// Sea-corner resolution (src/sim/pt_sea_corners.ts, Phase 6H-4): where two
// adjacent exposed bounds edges both carry authored sea to their shared
// corner, the diagonal quadrant beyond it needs a filler patch or the sky
// dome shows through as a boxed corner. The resolver decides which corners
// qualify and what level/material the patch inherits - purely from the
// field's bounds and its generated sea.edges (maplinks.json).
//
// Also covers the render-side build (buildPtTerrainView): qualified
// corners produce `pt-<id>-ocean-<xEdge>+<zEdge>` patch meshes plus deep
// backers; unqualified corners produce none.

import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { loadPtDevMap } from '../src/game/pt_dev_maps';
import { buildPtTerrainView } from '../src/render/pt_terrain';
import type { PtBounds, PtSeaEdge } from '../src/sim/pt_field';
import { ptSeaCorners } from '../src/sim/pt_sea_corners';

const B: PtBounds = { minX: 0, maxX: 1000, minY: 0, maxY: 500, minZ: 0, maxZ: 1000 };

const edge = (over: Partial<PtSeaEdge>): PtSeaEdge => ({
  edge: 'minX',
  from: 0,
  to: 1000,
  reach: 111600,
  level: 100,
  materialIndex: 7,
  uScale: 0.001,
  vScale: 0.001,
  ...over,
});

describe('ptSeaCorners', () => {
  it('emits a patch when both adjacent edges carry sea to the corner', () => {
    const corners = ptSeaCorners(B, [
      edge({ edge: 'minX', from: 0, to: 600 }), // z-span covers minZ
      edge({ edge: 'minZ', from: 0, to: 800 }), // x-span covers minX
    ]);
    expect(corners).toHaveLength(1);
    expect(corners[0].xEdge).toBe('minX');
    expect(corners[0].zEdge).toBe('minZ');
  });

  it('emits all four corners for a fully sea-bound field', () => {
    const corners = ptSeaCorners(B, [
      edge({ edge: 'minX' }),
      edge({ edge: 'maxX' }),
      edge({ edge: 'minZ' }),
      edge({ edge: 'maxZ' }),
    ]);
    expect(corners).toHaveLength(4);
    expect(corners.map((c) => `${c.xEdge}+${c.zEdge}`)).toEqual([
      'minX+minZ',
      'minX+maxZ',
      'maxX+minZ',
      'maxX+maxZ',
    ]);
  });

  it('a single-edge coast has no corners', () => {
    expect(ptSeaCorners(B, [edge({ edge: 'minX' })])).toHaveLength(0);
  });

  it('opposite edges never meet - no corners', () => {
    const corners = ptSeaCorners(B, [
      edge({ edge: 'minX' }),
      edge({ edge: 'maxX' }),
    ]);
    expect(corners).toHaveLength(0);
  });

  it('a land corner needs nothing even when both edges have sea elsewhere', () => {
    // minX sector covers only the south half; minZ sector only the east
    // half; maxZ covers the whole edge - but no X-edge partner reaches a
    // maxZ corner, so nothing qualifies anywhere.
    const corners = ptSeaCorners(B, [
      edge({ edge: 'minX', from: 500, to: 800 }),
      edge({ edge: 'minZ', from: 500, to: 800 }),
      edge({ edge: 'maxZ', from: 0, to: 1000 }),
    ]);
    expect(corners).toHaveLength(0);
  });

  it('tolerates unordered sector spans', () => {
    const corners = ptSeaCorners(B, [
      edge({ edge: 'minX', from: 1000, to: 0 }),
      edge({ edge: 'minZ', from: 1000, to: 0 }),
    ]);
    expect(corners).toHaveLength(1);
  });

  it('inherits the LOWER adjacent sector level and its material/uv', () => {
    const corners = ptSeaCorners(B, [
      edge({ edge: 'minX', level: 900, materialIndex: 11, uScale: 0.01, vScale: 0.02 }),
      edge({ edge: 'minZ', level: 300, materialIndex: 22, uScale: 0.03, vScale: 0.04 }),
    ]);
    // Lower sector (minZ, level 300) owns the patch so it can never tower
    // over the shallower water beside it.
    expect(corners[0].level).toBe(300);
    expect(corners[0].materialIndex).toBe(22);
    expect(corners[0].uScale).toBe(0.03);
    expect(corners[0].vScale).toBe(0.04);
  });

  it('equal levels resolve deterministically (x-edge sector wins)', () => {
    const a = ptSeaCorners(B, [
      edge({ edge: 'minX', level: 500, materialIndex: 11 }),
      edge({ edge: 'minZ', level: 500, materialIndex: 22 }),
    ]);
    const b = ptSeaCorners(B, [
      edge({ edge: 'minZ', level: 500, materialIndex: 22 }),
      edge({ edge: 'minX', level: 500, materialIndex: 11 }),
    ]);
    expect(a).toEqual(b);
    expect(a[0].level).toBe(500);
  });

  it('patch reach is the smaller of the corner sector reaches', () => {
    const corners = ptSeaCorners(B, [
      edge({ edge: 'minX', reach: 111600 }),
      edge({ edge: 'minZ', reach: 40000 }), // corridor-capped by a neighbor
    ]);
    expect(corners[0].reach).toBe(40000);
  });

  it('emits a seam curtain for each corner sector above the patch level', () => {
    // minX sea (900) towers over the minZ-sea-level patch (300): the
    // vertical slit under the minX strip-end needs a curtain.
    const corners = ptSeaCorners(B, [
      edge({ edge: 'minX', level: 900, reach: 70000 }),
      edge({ edge: 'minZ', level: 300, reach: 50000 }),
    ]);
    expect(corners[0].level).toBe(300);
    expect(corners[0].curtains).toEqual([
      { seam: 'xEdge', level: 900, reach: 70000 },
    ]);
  });

  it('emits curtains on both seams when both neighbors tower', () => {
    // The patch takes the lowest covering sector (x-edge's 100-sector);
    // both the 900 x-sector and the 800 z-sector leave slits.
    const corners = ptSeaCorners(B, [
      edge({ edge: 'minX', level: 900 }),
      edge({ edge: 'minX', level: 100 }),
      edge({ edge: 'minZ', level: 800 }),
    ]);
    expect(corners[0].level).toBe(100);
    expect(corners[0].curtains).toEqual([
      { seam: 'xEdge', level: 900, reach: 111600 },
      { seam: 'zEdge', level: 800, reach: 111600 },
    ]);
  });

  it('equal adjacent levels emit no curtains', () => {
    const corners = ptSeaCorners(B, [
      edge({ edge: 'minX', level: 500 }),
      edge({ edge: 'minZ', level: 500 }),
    ]);
    expect(corners[0].curtains).toEqual([]);
  });
});

// Real generated data: the shipped sea fields resolve the corners the
// audit derived from their authored edge sectors.
describe('ptSeaCorners on shipped fields', () => {
  it('town1 (Atlantis Town) wraps the minX+minZ corner only', async () => {
    const { descriptor } = await loadPtDevMap('town1');
    const corners = ptSeaCorners(descriptor.field.PT_BOUNDS, descriptor.sea!.edges);
    expect(corners.map((c) => `${c.xEdge}+${c.zEdge}`)).toEqual(['minX+minZ']);
    // Levels 1139.2 / 1157.5: the patch takes the lower (minX sector) and
    // the higher minZ strip's ~0.7yd step still earns a seam curtain.
    expect(corners[0].level).toBeLessThanOrEqual(1140);
    expect(corners[0].curtains).toEqual([
      { seam: 'zEdge', level: expect.closeTo(1157.5, 0), reach: expect.any(Number) },
    ]);
  });

  it('dun-6 wraps all four corners with level-gap curtains', async () => {
    const { descriptor } = await loadPtDevMap('dun-6');
    const corners = ptSeaCorners(descriptor.field.PT_BOUNDS, descriptor.sea!.edges);
    expect(corners).toHaveLength(4);
    // dun-6's sea levels differ per edge (minX ~427, maxX ~317, minZ ~83,
    // maxZ ~258): every corner patch takes the low sector and hangs a
    // curtain under the higher x-edge strip's end.
    const c = corners.find((k) => k.xEdge === 'minX' && k.zEdge === 'minZ')!;
    expect(c.level).toBeLessThanOrEqual(84);
    expect(c.curtains).toEqual([
      { seam: 'xEdge', level: expect.closeTo(426.7, 0), reach: expect.any(Number) },
    ]);
  });

  it('fore-3 (single-edge coast) has no corners', async () => {
    const { descriptor } = await loadPtDevMap('fore-3');
    expect(ptSeaCorners(descriptor.field.PT_BOUNDS, descriptor.sea!.edges)).toHaveLength(0);
  });
});

// Render-side coverage: corner patches actually land in the built view.
describe('corner patch meshes in the terrain view', () => {
  it('town1 builds the corner patch and its deep backer', async () => {
    const { descriptor } = await loadPtDevMap('town1');
    const view = await buildPtTerrainView(descriptor);
    expect(view.group.getObjectByName('pt-town1-ocean-minX+minZ')).toBeDefined();
    expect(view.group.getObjectByName('pt-town1-deepsea-minX+minZ')).toBeDefined();
    // minZ strip (1157.5) towers ~0.7yd over the minX-level patch: the
    // seam curtain under its strip-end must exist.
    const curtain = view.group.getObjectByName(
      'pt-town1-deepsea-minX+minZ-curtain0',
    ) as THREE.Mesh;
    expect(curtain).toBeDefined();
    // The curtain spans vertically between the minZ surface and below the
    // lowest sea level (1139.2 - margin in PT units).
    const top = descriptor.transform.ptYToWoC(1157.5);
    const floor = descriptor.transform.ptYToWoC(1139.2) - 0.8 - 6;
    expect(Math.abs(curtain.position.y - (top + floor) / 2)).toBeLessThan(0.02);
    // The deep tray backstops everything under the sea geometry outside
    // the field rect: it must sit below every sea surface in the field.
    const tray = view.group.getObjectByName('pt-town1-deepsea-tray') as THREE.Mesh;
    expect(tray).toBeDefined();
    const lowestSurf = Math.min(
      ...descriptor.sea!.edges.map((e) => descriptor.transform.ptYToWoC(e.level) - 0.2),
    );
    expect(tray.position.y).toBeLessThan(lowestSurf - 1);
    view.dispose();
  }, 120000);

  it('fore-3 builds no corner patches', async () => {
    const { descriptor } = await loadPtDevMap('fore-3');
    const view = await buildPtTerrainView(descriptor);
    const patches = view.group.children.filter((c) =>
      /-ocean-minX\+|-ocean-minZ\+|-ocean-maxX\+|-ocean-maxZ\+/.test(c.name),
    );
    expect(patches).toHaveLength(0);
    view.dispose();
  }, 120000);
});
