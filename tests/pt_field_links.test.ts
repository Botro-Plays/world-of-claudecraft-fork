// FieldGate connected-world tests: the seamless-boundary runtime over the
// real generated/pt-maps packages.
//
// Covers the PT client's PlayNearGateField semantics ported into
// src/game/pt_field_links.ts plus the two-slot active/standby field model
// in src/sim/pt_field_active.ts:
//   - authored gate records reach descriptors verbatim (incl. the
//     absolute-index AddGate targets the registry fix added),
//   - AddGate's bidirectional-by-construction rule (mirrored edges),
//   - the DIST_TRANSLEVEL_CONNECT (0x120000 squared) preload trigger,
//   - preload never touches the player position,
//   - ownership flips only when the destination floor resolves, and
//   - source-anomaly edges (ff-01 -> pilai dead point, SeaA self-loop)
//     degrade to safe no-ops.

import { afterEach, describe, expect, it } from 'vitest';
import {
  activePtField,
  activePtMapDescriptor,
  setActivePtMap,
  setStandbyPtMap,
  standbyPtMapDescriptor,
} from '../src/sim/pt_field_active';
import { loadPtDevMap } from '../src/game/pt_dev_maps';
import {
  ptFieldEdgeCount,
  ptFieldEdgesOf,
  tickPtFieldGates,
} from '../src/game/pt_field_links';
import { createPtField } from '../src/sim/pt_field';

// One full scan cadence: the module scans every 48th call.
const SCAN_CALLS = 48;

afterEach(() => {
  setActivePtMap(null);
});

/** Drive one scan cadence of frames at (x, z). */
function tickWatch(x: number, z: number, ticks = SCAN_CALLS): void {
  for (let i = 0; i < ticks; i++) tickPtFieldGates(x, z);
}

/** Wait for an in-flight standby package load to land (or fail). */
async function flushWatch(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (standbyPtMapDescriptor() === null && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('FieldGate descriptor records', () => {
  it('carries the authored AddGate record verbatim on the loaded package', async () => {
    const { descriptor } = await loadPtDevMap('fore-3');
    expect(descriptor.fieldGates).toEqual([
      { targetIndex: 1, targetId: 'fore-2', x: -8508, z: -10576, y: 0 },
    ]);
  });

  it('resolves absolute psField[N] targets to destination package ids', async () => {
    const ruin2 = await loadPtDevMap('ruin-2');
    const byTarget = new Map(ruin2.descriptor.fieldGates!.map((g) => [g.targetIndex, g]));
    // Authored as AddGate(psField[17],...), AddGate(psField[34],...): the
    // absolute-index forms the old relative-only parser dropped.
    expect(byTarget.get(17)?.targetId).toBe('forever-fall-04');
    expect(byTarget.get(34)?.targetId).toBe('greedy');
    expect(byTarget.get(7)?.targetId).toBe('ruin-1');

    const iron2 = await loadPtDevMap('iron-2');
    const iron4Gate = iron2.descriptor.fieldGates!.find((g) => g.targetIndex === 60);
    expect(iron4Gate?.targetId).toBe('iron4');
  });
});

describe('FieldGate edge table', () => {
  it('holds all 37 authored records as undirected edges', () => {
    // 36 unique field pairs (incl. the double-authored ice1<->ice2 and
    // iron-2<->iron4 pairs, which are distinct boundary points) plus the
    // SeaA self-loop.
    expect(ptFieldEdgeCount()).toBe(37);
  });

  it('is bidirectional by construction: a gate authored by A appears on B', async () => {
    // village-2 (ricarten) authors no AddGate; the fore-1 -> village-2 edge
    // must still be reachable FROM ricarten's side.
    const ricartenEdges = ptFieldEdgesOf('ricarten');
    expect(
      ricartenEdges.some(
        (e) => (e.aId === 'ricarten' ? e.bId : e.aId) === 'fore-1',
      ),
    ).toBe(true);

    const fore1Edges = ptFieldEdgesOf('fore-1').map((e) =>
      e.aId === 'fore-1' ? e.bId : e.aId,
    );
    expect(fore1Edges).toEqual(expect.arrayContaining(['fore-2', 'ruin-4', 'ricarten']));
  });

  it('excludes phantom fields (stemple/swamp are comment-block artifacts)', () => {
    expect(ptFieldEdgesOf('stemple')).toHaveLength(0);
    expect(ptFieldEdgesOf('swamp')).toHaveLength(0);
  });
});

describe('FieldGate preload watch', () => {
  it('does nothing while the default Ricarten binding is active', async () => {
    // No dev map installed: the watch only runs over the field graph.
    tickWatch(0, 0);
    expect(standbyPtMapDescriptor()).toBeNull();
  });

  it('preloads the destination when the player nears the gate point', async () => {
    const f3 = await loadPtDevMap('fore-3');
    setActivePtMap(f3.descriptor);
    // Stand right on the authored fore-3 -> fore-2 gate point, converted to
    // WoC through the active map's own atlas transform.
    const g = f3.descriptor.fieldGates![0];
    const x = f3.descriptor.transform.ptXToWoC(g.x);
    const z = f3.descriptor.transform.ptZToWoC(g.z);
    tickWatch(x, z);
    await flushWatch();
    expect(standbyPtMapDescriptor()?.id).toBe('fore-2');
  });

  it('does NOT preload outside the DIST_TRANSLEVEL_CONNECT radius', async () => {
    const f3 = await loadPtDevMap('fore-3');
    setActivePtMap(f3.descriptor);
    const g = f3.descriptor.fieldGates![0];
    // 4000 PT units off the gate point: sqrt(0x120000) ~= 1086 is the real
    // threshold, so 4000 must miss it.
    const x = f3.descriptor.transform.ptXToWoC(g.x + 4000);
    const z = f3.descriptor.transform.ptZToWoC(g.z);
    tickWatch(x, z);
    expect(standbyPtMapDescriptor()).toBeNull();
  });

  it('preload never moves the player position (it is a watch, not a warp)', async () => {
    const f3 = await loadPtDevMap('fore-3');
    setActivePtMap(f3.descriptor);
    const g = f3.descriptor.fieldGates![0];
    const x = f3.descriptor.transform.ptXToWoC(g.x);
    const z = f3.descriptor.transform.ptZToWoC(g.z);
    // The API takes coordinates and mutates nothing; assert the inputs are
    // irrelevant to any stored state beyond the standby slot.
    const before = activePtMapDescriptor();
    tickWatch(x, z);
    await flushWatch();
    expect(activePtMapDescriptor()).toBe(before); // still fore-3, only standby added
    expect(standbyPtMapDescriptor()?.id).toBe('fore-2');
  });
});

describe('FieldGate ownership switch', () => {
  it('promotes the standby field only when its floor resolves at the position', async () => {
    const f3 = await loadPtDevMap('fore-3');
    const f2 = await loadPtDevMap('fore-2');
    setActivePtMap(f3.descriptor);
    setStandbyPtMap(f2.descriptor);
    expect(standbyPtMapDescriptor()?.id).toBe('fore-2');

    // Still standing on fore-3's floor: active stays fore-3.
    const s3 = f3.spawn!;
    expect(Number.isFinite(activePtField().floorHeight(s3.x, s3.z, s3.y))).toBe(true);
    expect(activePtMapDescriptor()).toBe(f3.descriptor);

    // A point deep inside fore-2 (its resolved spawn): fore-3 has no floor
    // there, fore-2 does -> floor ownership promotes fore-2.
    const s2 = f2.spawn!;
    const before = { x: s2.x, z: s2.z };
    const gh = activePtField().groundHeight(s2.x, s2.z);
    expect(Number.isFinite(gh)).toBe(true);
    const fh = activePtField().floorHeight(s2.x, s2.z, gh);
    expect(Number.isFinite(fh)).toBe(true);
    expect(activePtMapDescriptor()).toBe(f2.descriptor);
    // The old active becomes the standby (the PT slot swap).
    expect(standbyPtMapDescriptor()).toBe(f3.descriptor);
    // Position untouched by the ownership transfer.
    expect(before).toEqual({ x: s2.x, z: s2.z });
  });

  it('does not switch on preload-radius entry alone (needs floor failure)', async () => {
    const f3 = await loadPtDevMap('fore-3');
    const f2 = await loadPtDevMap('fore-2');
    setActivePtMap(f3.descriptor);
    setStandbyPtMap(f2.descriptor);

    // Inside the gate's preload radius but still on fore-3 floor: the
    // active map must not flip just because the trigger zone was entered.
    const g = f3.descriptor.fieldGates![0];
    const x = f3.descriptor.transform.ptXToWoC(g.x);
    const z = f3.descriptor.transform.ptZToWoC(g.z);
    const gy = activePtField().groundHeight(x, z);
    if (Number.isFinite(gy)) {
      // The gate point itself is on fore-3's side of the boundary.
      expect(activePtField().floorHeight(x, z, gy)).not.toBe(-Infinity);
      expect(activePtMapDescriptor()).toBe(f3.descriptor);
    } else {
      // Some gate points sit just past the walkable edge; that is still
      // safe: floor ownership resolves to fore-2 and promotes, but never
      // on the mere fact of a standby being installed.
      expect(activePtMapDescriptor()).toBe(f3.descriptor);
    }
  });

  it('a same-id standby request is ignored (SeaA self-loop safe)', async () => {
    const sea = await loadPtDevMap('seaa');
    setActivePtMap(sea.descriptor);
    setStandbyPtMap(sea.descriptor);
    expect(standbyPtMapDescriptor()).toBeNull();
    // The self-loop can never produce a standby through the watch either.
    const s = sea.spawn!;
    tickWatch(s.x, s.z);
    expect(standbyPtMapDescriptor()).toBeNull();
  });

  it('rides the higher floor when the two fields diverge past 8 PT units', async () => {
    // PT evaluates smGameStage[0] and [1] CheckNextMove in parallel; when
    // their floors diverge by >=8 units the higher result wins the step.
    // The Ricarten gate road sits ~47 units above fore-1's moat lip at the
    // seam overlap - without the divergence rule the walker descends into
    // the moat instead of stepping onto the destination field's road.
    const f1 = await loadPtDevMap('fore-1');
    const ric = await loadPtDevMap('ricarten');
    setActivePtMap(f1.descriptor);
    setStandbyPtMap(ric.descriptor);
    const field = activePtField();

    // Inside the palisade opening (PT ~2440,-14814): fore-1's own floor at
    // the seam edge is the moat lip while ricarten's road deck rides ~47
    // PT units higher.
    const xf = f1.descriptor.transform;
    const x = xf.ptXToWoC(2440.4);
    const z = xf.ptZToWoC(-14813.9);
    const refY = xf.ptYToWoC(174.4);
    const fA = createPtField(f1.descriptor.field, f1.descriptor.transform);
    const fB = createPtField(ric.descriptor.field, ric.descriptor.transform);
    const a = fA.floorHeight(x, z, refY);
    const b = fB.floorHeight(x, z, refY);
    expect(Number.isFinite(a)).toBe(true);
    expect(Number.isFinite(b)).toBe(true);
    expect(b - a).toBeGreaterThan(8 * 0.036);

    const h = field.floorHeight(x, z, refY);
    expect(h).toBeCloseTo(b, 3);
    expect(activePtMapDescriptor()).toBe(ric.descriptor);
    expect(standbyPtMapDescriptor()).toBe(f1.descriptor);
  });

  it('keeps the active field when both floors are within the 8-unit band', async () => {
    const f1 = await loadPtDevMap('fore-1');
    const ric = await loadPtDevMap('ricarten');
    setActivePtMap(f1.descriptor);
    setStandbyPtMap(ric.descriptor);
    const field = activePtField();

    // The gate-road overlap south of the seam (PT ~2440,-14772): fore-1's
    // deck and ricarten's deck are the same surface continuing, well inside
    // the 8-unit (0.288yd) divergence band.
    const xf = f1.descriptor.transform;
    const x = xf.ptXToWoC(2440.4);
    const z = xf.ptZToWoC(-14772.2);
    const refY = xf.ptYToWoC(177.2);
    const fA = createPtField(f1.descriptor.field, f1.descriptor.transform);
    const fB = createPtField(ric.descriptor.field, ric.descriptor.transform);
    const a = fA.floorHeight(x, z, refY);
    const b = fB.floorHeight(x, z, refY);
    expect(Number.isFinite(a)).toBe(true);
    expect(Number.isFinite(b)).toBe(true);
    expect(Math.abs(a - b)).toBeLessThan(8 * 0.036);

    const h = field.floorHeight(x, z, refY);
    expect(h).toBeCloseTo(a, 3);
    expect(activePtMapDescriptor()).toBe(f1.descriptor);
  });

  it('the dead ff-01 -> pilai edge cannot trigger from inside ff-01', async () => {
    const ff1 = await loadPtDevMap('forever-fall-01');
    setActivePtMap(ff1.descriptor);
    // The authored gate point is a copy of fore-3's (-8508,-10576), ~82k PT
    // units away from the field. No position on ff-01 can be within 1086u.
    const s = ff1.spawn!;
    tickWatch(s.x, s.z);
    expect(standbyPtMapDescriptor()).toBeNull();
  });
});

describe('default Ricarten binding', () => {
  it('preloads fore-1 at the authored seam once a default descriptor is registered', async () => {
    // Production flow: pt_terrain registers PT_RICARTEN_SOURCE as the
    // default binding, making the starting town a real graph participant
    // (the fix for the dead production seam). Simulating that here.
    const { PT_RICARTEN_SOURCE } = await import('../src/render/pt_terrain');
    const { setDefaultPtMap } = await import('../src/sim/pt_field_active');
    setDefaultPtMap(PT_RICARTEN_SOURCE);
    expect(activePtMapDescriptor()?.id).toBe('ricarten');

    // Stand on the authored fore-1 -> ricarten gate point PT(2275,-14828),
    // converted through the shared continent transform.
    const xf = PT_RICARTEN_SOURCE.transform;
    tickWatch(xf.ptXToWoC(2275), xf.ptZToWoC(-14828));
    await flushWatch();
    expect(standbyPtMapDescriptor()?.id).toBe('fore-1');
  });
});
