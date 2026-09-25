// WarpGate connected-world tests: the proximity-teleport runtime over the
// real generated/pt-maps packages.
//
// Covers the PT client's sFIELD::CheckWarpGate semantics ported into
// src/game/pt_warp_gates.ts:
//   - authored AddWarpGate/AddWarpOutGate records reach descriptors
//     verbatim (cylinder trigger, exits, LimitLevel, SpecialEffect),
//   - the trigger cylinder (XZ radius + height band + level gate +
//     OutGateCount),
//   - SpecialEffect 0 immediate warp to a random exit,
//   - SpecialEffect 1 delayed warp (~2s, player held at the gate),
//   - SpecialEffect 2 wing-warp arm + destination PosWarpOut arrival,
//   - the 3s global re-trigger lockout (dwWarpDelayTime),
//   - destination coordinates transformed through the DESTINATION
//     field's atlas transform, and
//   - source anomalies (dead zero-exit gates, the AncientW no-floor exit)
//     preserved verbatim.

import { afterEach, describe, expect, it } from 'vitest';
import type { Entity } from '../src/sim/types';
import {
  activePtMapDescriptor,
  setActivePtMap,
  setStandbyPtMap,
  standbyPtMapDescriptor,
} from '../src/sim/pt_field_active';
import { createPtField } from '../src/sim/pt_field';
import { loadPtDevMap, ptDevWarpFields } from '../src/game/pt_dev_maps';
import {
  ptWarpState,
  ptWingWarpSelect,
  resetPtWarpState,
  setPtWarpRng,
  tickPtWarpGates,
} from '../src/game/pt_warp_gates';

/** A minimal Entity stub: the warp runtime only reads pos/prevPos/level. */
function makePlayer(level = 1): Entity {
  return {
    pos: { x: 0, y: 0, z: 0 },
    prevPos: { x: 0, y: 0, z: 0 },
    level,
  } as unknown as Entity;
}

/** Place the player at an authored PT coordinate via a descriptor's
 *  atlas transform. */
function placeAt(
  player: Entity,
  desc: { transform: { ptXToWoC(x: number): number; ptYToWoC(y: number): number; ptZToWoC(z: number): number } },
  x: number,
  y: number,
  z: number,
): void {
  player.pos.x = desc.transform.ptXToWoC(x);
  player.pos.y = desc.transform.ptYToWoC(y);
  player.pos.z = desc.transform.ptZToWoC(z);
  player.prevPos.x = player.pos.x;
  player.prevPos.y = player.pos.y;
  player.prevPos.z = player.pos.z;
}

/** Wait for an in-flight warp's destination load + SetPosi to land. */
async function flushWarp(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (ptWarpState().warpInFlight && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

function warpFieldsById() {
  return new Map(ptDevWarpFields().map((f) => [f.id, f]));
}

afterEach(() => {
  resetPtWarpState();
  setActivePtMap(null);
});

describe('WarpGate descriptor records', () => {
  it('carries the authored warp records verbatim on the loaded package', async () => {
    const { descriptor } = await loadPtDevMap('ricarten');
    // psField[3] (village-2): the wing-warp self-gate and the level-180
    // dc1 gate, exactly as field.cpp authors them.
    expect(descriptor.warpGates).toEqual([
      {
        x: 734,
        z: -20119,
        y: 312,
        size: 64,
        height: 32,
        limitLevel: 0,
        specialEffect: 2,
        exits: [{ targetIndex: 3, targetId: 'ricarten', x: 822, z: -19956, y: 254 }],
      },
      {
        x: 2597,
        z: -18243,
        y: 236,
        size: 32,
        height: 32,
        limitLevel: 180,
        specialEffect: 0,
        exits: [{ targetIndex: 57, targetId: 'dc1', x: 198282, z: 240400, y: 1502 }],
      },
    ]);
    expect(descriptor.posWarpOut).toEqual({ x: 822, y: 254, z: -19956 });
    expect(descriptor.limitLevel).toBe(0);
  });

  it('holds every authored trigger and exit across the registry (68/73)', () => {
    let triggers = 0;
    let exits = 0;
    for (const f of ptDevWarpFields()) {
      triggers += f.warpGates.length;
      for (const g of f.warpGates) exits += g.exits.length;
    }
    expect(triggers).toBe(68);
    expect(exits).toBe(73);
  });

  it('keeps a multiple-exit gate as multiple exits (dun-4 -> dun-5 x3)', () => {
    const d4 = warpFieldsById().get('dun-4')!;
    const gate = d4.warpGates.find((g) => g.exits.length > 1)!;
    expect(gate.exits).toHaveLength(3);
    // All three exits target the same field at three authored points.
    for (const e of gate.exits) expect(e.targetId).toBe('dun-5');
    const pts = new Set(gate.exits.map((e) => `${e.x},${e.z}`));
    expect(pts.size).toBe(3);
  });
});

describe('WarpGate trigger cylinder', () => {
  it('does nothing while the default Ricarten binding is active', () => {
    const p = makePlayer();
    tickPtWarpGates(p, 0);
    expect(ptWarpState().lastWarpFieldId).toBeNull();
  });

  it('triggers inside the cylinder and warps SpecialEffect 0 immediately', async () => {
    const src = await loadPtDevMap('dun-1');
    setActivePtMap(src.descriptor);
    // dun-1's second gate (y=1, h=2: a tight floor band) exits to dun-2.
    const gate = src.descriptor.warpGates!.find((g) =>
      g.exits.some((e) => e.targetId === 'dun-2'))!;
    const p = makePlayer(200);
    placeAt(p, src.descriptor, gate.x, gate.y, gate.z);
    setPtWarpRng(() => 0);
    tickPtWarpGates(p, 1000);
    await flushWarp();
    expect(activePtMapDescriptor()?.id).toBe('dun-2');
    // Landed on the FIRST authored exit coordinate (rng -> 0).
    const e = gate.exits[0];
    const dest = standbyPtMapDescriptor(); // old active stays loaded
    const destDesc = activePtMapDescriptor()!;
    expect(p.pos.x).toBeCloseTo(destDesc.transform.ptXToWoC(e.x), 5);
    expect(p.pos.y).toBeCloseTo(destDesc.transform.ptYToWoC(e.y), 5);
    expect(p.pos.z).toBeCloseTo(destDesc.transform.ptZToWoC(e.z), 5);
    expect(dest?.id).toBe('dun-1');
  });

  it('ignores a player outside the XZ radius', async () => {
    const src = await loadPtDevMap('dun-1');
    setActivePtMap(src.descriptor);
    const gate = src.descriptor.warpGates!.find((g) => g.specialEffect === 0)!;
    const p = makePlayer(200);
    // size + 1 PT unit outside the cylinder radius.
    placeAt(p, src.descriptor, gate.x + gate.size + 1, gate.y, gate.z);
    tickPtWarpGates(p, 1000);
    expect(ptWarpState().warpInFlight).toBe(false);
    expect(activePtMapDescriptor()?.id).toBe('dun-1');
  });

  it('enforces LimitLevel: below level no warp, at level warp', async () => {
    const src = await loadPtDevMap('ricarten');
    setActivePtMap(src.descriptor);
    const gate = src.descriptor.warpGates!.find((g) => g.limitLevel === 180)!;
    const p = makePlayer(179);
    placeAt(p, src.descriptor, gate.x, gate.y, gate.z);
    tickPtWarpGates(p, 1000);
    expect(ptWarpState().warpInFlight).toBe(false);
    expect(activePtMapDescriptor()?.id).toBe('ricarten');
    p.level = 180;
    tickPtWarpGates(p, 2000);
    await flushWarp();
    expect(activePtMapDescriptor()?.id).toBe('dc1');
  });

  it('a zero-exit gate never triggers (commented exits stay dead)', async () => {
    const src = await loadPtDevMap('iron-2');
    setActivePtMap(src.descriptor);
    const gate = src.descriptor.warpGates![0];
    expect(gate.exits).toHaveLength(0);
    const p = makePlayer(200);
    placeAt(p, src.descriptor, gate.x, gate.y, gate.z);
    tickPtWarpGates(p, 1000);
    expect(ptWarpState().lastWarpFieldId).toBeNull();
    expect(activePtMapDescriptor()?.id).toBe('iron-2');
  });
});

describe('WarpGate delayed + wing effects', () => {
  it('SpecialEffect 1 arms, holds the player at the gate, warps ~2s later', async () => {
    // AncientW's first gate is an authored SE1 self-exit (the player snaps
    // to the gate, then lands on the field's own WarpOut coordinate).
    const src = await loadPtDevMap('ancientw');
    setActivePtMap(src.descriptor);
    const gate = src.descriptor.warpGates!.find((g) => g.specialEffect === 1)!;
    const p = makePlayer(200);
    placeAt(p, src.descriptor, gate.x, gate.y, gate.z);
    tickPtWarpGates(p, 1000);
    // Armed: no teleport yet, player snapped to the gate center.
    const st = ptWarpState();
    expect(st.nextWarpDelay).toBe(true);
    expect(st.armedGate).toBe(gate);
    expect(p.pos.x).toBeCloseTo(src.descriptor.transform.ptXToWoC(gate.x), 5);
    // Still inside the 2s window: pinned at the gate, no warp.
    tickPtWarpGates(p, 2500);
    expect(p.pos.x).toBeCloseTo(src.descriptor.transform.ptXToWoC(gate.x), 5);
    // Past dwPlayTime-1000+3000: the armed gate fires its exit. The exit is
    // self-field: same map, new position at the authored exit coordinate.
    setPtWarpRng(() => 0);
    tickPtWarpGates(p, 3100);
    await flushWarp();
    expect(activePtMapDescriptor()?.id).toBe('ancientw');
    const e = gate.exits[0];
    const d = activePtMapDescriptor()!;
    expect(p.pos.x).toBeCloseTo(d.transform.ptXToWoC(e.x), 5);
    expect(p.pos.y).toBeCloseTo(d.transform.ptYToWoC(e.y), 5);
    expect(p.pos.z).toBeCloseTo(d.transform.ptZToWoC(e.z), 5);
  });

  it('SpecialEffect 2 arms the wing gate and blocks until selection', async () => {
    const src = await loadPtDevMap('ricarten');
    setActivePtMap(src.descriptor);
    const gate = src.descriptor.warpGates!.find((g) => g.specialEffect === 2)!;
    const p = makePlayer(200);
    placeAt(p, src.descriptor, gate.x, gate.y, gate.z);
    tickPtWarpGates(p, 1000);
    const st = ptWarpState();
    expect(st.nextWarpDelay).toBe(true);
    expect(st.warpDelayUntil).toBe(Infinity);
    expect(p.pos.x).toBeCloseTo(src.descriptor.transform.ptXToWoC(gate.x), 5);
    // Ticking while armed does nothing (dwWarpDelayTime = 0xFFFF0000).
    tickPtWarpGates(p, 60_000);
    expect(activePtMapDescriptor()?.id).toBe('ricarten');
    // Wing select: field 1 (fore-2, FieldLimitLevel 0, PosWarpOut set)
    // -> warps to fore-2's PosWarpOut after the ~2s effect delay.
    expect(ptWingWarpSelect(1, p, 60_100)).toBe(true);
    tickPtWarpGates(p, 62_200);
    await flushWarp();
    expect(activePtMapDescriptor()?.id).toBe('fore-2');
    const po = warpFieldsById().get('fore-2')!.posWarpOut!;
    const d = activePtMapDescriptor()!;
    expect(p.pos.x).toBeCloseTo(d.transform.ptXToWoC(po.x), 5);
    expect(p.pos.y).toBeCloseTo(d.transform.ptYToWoC(po.y), 5);
    expect(p.pos.z).toBeCloseTo(d.transform.ptZToWoC(po.z), 5);
  });

  it('wing select rejects a field above the player level', async () => {
    const src = await loadPtDevMap('ricarten');
    setActivePtMap(src.descriptor);
    const gate = src.descriptor.warpGates!.find((g) => g.specialEffect === 2)!;
    const p = makePlayer(1);
    placeAt(p, src.descriptor, gate.x, gate.y, gate.z);
    tickPtWarpGates(p, 1000);
    expect(ptWarpState().warpDelayUntil).toBe(Infinity);
    // dc1 (field 57) has FieldLimitLevel_Table[57] = 180 > level 1.
    expect(ptWingWarpSelect(57, p, 1100)).toBe(false);
    expect(ptWarpState().wingFieldIndex).toBe(-1);
  });
});

describe('WarpGate re-trigger lockout', () => {
  it('blocks any second warp within the 3s dwWarpDelayTime window', async () => {
    // dun-1's first gate exits to ruin-1; ruin-1's own gate exits back.
    const src = await loadPtDevMap('dun-1');
    setActivePtMap(src.descriptor);
    const gate = src.descriptor.warpGates!.find((g) =>
      g.exits.some((e) => e.targetId === 'ruin-1'))!;
    const p = makePlayer(200);
    placeAt(p, src.descriptor, gate.x, gate.y, gate.z);
    setPtWarpRng(() => 0);
    tickPtWarpGates(p, 1000);
    await flushWarp();
    expect(activePtMapDescriptor()?.id).toBe('ruin-1');
    // Park on ruin-1's return gate inside the 3s lockout: nothing fires.
    const r1 = activePtMapDescriptor()!;
    const g2 = r1.warpGates![0];
    placeAt(p, r1, g2.x, g2.y, g2.z);
    tickPtWarpGates(p, 2000);
    expect(ptWarpState().warpInFlight).toBe(false);
    expect(activePtMapDescriptor()?.id).toBe('ruin-1');
    // After the lockout the same gate fires the reciprocal warp.
    tickPtWarpGates(p, 5000);
    await flushWarp();
    expect(activePtMapDescriptor()?.id).toBe('dun-1');
  });
});

describe('WarpGate routes', () => {
  it('keeps reciprocal routes bidirectional (dun-1 <-> dun-2)', () => {
    const byId = warpFieldsById();
    const d1 = byId.get('dun-1')!;
    const d2 = byId.get('dun-2')!;
    expect(d1.warpGates.some((g) => g.exits.some((e) => e.targetId === 'dun-2'))).toBe(true);
    expect(d2.warpGates.some((g) => g.exits.some((e) => e.targetId === 'dun-1'))).toBe(true);
  });

  it('keeps one-way routes one-way (ba1 -> town1, no reverse)', () => {
    const byId = warpFieldsById();
    const ba1 = byId.get('ba1')!;
    const town1 = byId.get('town1')!;
    expect(ba1.warpGates.some((g) => g.exits.some((e) => e.targetId === 'town1'))).toBe(true);
    expect(town1.warpGates.some((g) => g.exits.some((e) => e.targetId === 'ba1'))).toBe(false);
  });

  it('keeps the commented-out routes absent (iron-2 -> iron4, HeartOfFire)', () => {
    const byId = warpFieldsById();
    const iron2 = byId.get('iron-2')!;
    expect(iron2.warpGates.every((g) => g.exits.every((e) => e.targetId !== 'iron4'))).toBe(true);
    expect(iron2.warpGates.every((g) => g.exits.every((e) => e.targetId !== 'heart-of-fire'))).toBe(true);
  });

  it('preserves the AncientW exits verbatim (the no-floor record included)', () => {
    const byId = warpFieldsById();
    const aw = byId.get('ancientw')!;
    // Three authored gates: two SE1 self-exits + the level-130 Slab gate.
    expect(aw.warpGates).toHaveLength(3);
    expect(aw.warpGates[2]).toMatchObject({
      limitLevel: 130,
      specialEffect: 0,
      exits: [{ targetIndex: 45, targetId: 'slab', x: -12000, z: -54309, y: 374 }],
    });
    // The self-exits stamp AncientW's own PosWarpOut (last one wins).
    expect(aw.posWarpOut).toEqual({ x: 12700, y: 510, z: -62387 });
  });

  it('teleports to the AncientW no-floor exit verbatim (source SetPosi)', async () => {
    // AncientW's first SE1 gate exits to its own field at
    // (12772,-59917,562): the authored coordinate has NO walkable surface
    // in the converted field (the audit's known no-floor exit). The source
    // CheckWarpGate/SetPosi performs no floor validation - it teleports to
    // the authored coordinate verbatim - so the record is kept and the
    // runtime reproduces the verbatim teleport.
    const aw = await loadPtDevMap('ancientw');
    const field = createPtField(aw.descriptor.field, aw.descriptor.transform);
    const gate = aw.descriptor.warpGates![0];
    const ex = gate.exits[0];
    const wocX = aw.descriptor.transform.ptXToWoC(ex.x);
    const wocZ = aw.descriptor.transform.ptZToWoC(ex.z);
    expect(field.groundHeight(wocX, wocZ)).toBe(-Infinity);

    setActivePtMap(aw.descriptor);
    const p = makePlayer(200);
    placeAt(p, aw.descriptor, gate.x, gate.y, gate.z);
    // SE1: arm on the first pass, fire ~2s later.
    tickPtWarpGates(p, 1000);
    tickPtWarpGates(p, 3200);
    await flushWarp();
    // The verbatim teleport lands on the authored coordinate, floor or not.
    expect(activePtMapDescriptor()?.id).toBe('ancientw');
    const d = activePtMapDescriptor()!;
    expect(p.pos.x).toBeCloseTo(d.transform.ptXToWoC(ex.x), 5);
    expect(p.pos.y).toBeCloseTo(d.transform.ptYToWoC(ex.y), 5);
    expect(p.pos.z).toBeCloseTo(d.transform.ptZToWoC(ex.z), 5);
  });
});
