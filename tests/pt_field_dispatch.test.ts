// PT entity-scoped field dispatch (Phase O2.5).
//
// Covers the two mechanisms that make the realm able to simulate the whole
// PT field set without guessing identity from coordinates:
//
//   - The per-entity floor scope (withPtFieldScope / ptFloorOwnerAt in
//     src/sim/pt_field_active.ts): while an entity operation runs, PT
//     queries resolve through the entity's OWN field module with its
//     live-FieldGate neighbors in the standby slot - CheckNextMove's
//     StageField[0]/[1] model on descriptor-less hosts. This is what lets a
//     walker cross a seam whose footprints overlap (the Ricarten gate road
//     runs ~70yd into fore-1's bounds before its floor ends), and what lets
//     a band island (self-anchored footprint overlapping the continent)
//     serve collision to its residents alone.
//   - Identity-scoped registration: non-continent modules register into the
//     island tier - reachable only by an authoritative ptField, never by a
//     bare positional scan (ptFieldIdAt keeps preferring continent
//     claimants).
//   - The field-aware interest gate (inSamePtField): two entities at the
//     same WoC position in different fields never observe each other.
//
// Registration mirrors server/pt_fields.ts: the continent closure plus the
// island tier (dc1, tcave, ...). The graph comes from the committed
// generated/pt-maps/maplinks.json.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { characterCreationTestSeam } from '../server/main';
import { inSamePtField } from '../server/interest_policy';
import * as FF01_FIELD from '../generated/pt-maps/forever-fall-01/field.generated';
import * as FORE1_FIELD from '../generated/pt-maps/fore-1/field.generated';
import * as FORE2_FIELD from '../generated/pt-maps/fore-2/field.generated';
import * as FORE3_FIELD from '../generated/pt-maps/fore-3/field.generated';
import * as PILAI_FIELD from '../generated/pt-maps/pilai/field.generated';
import * as TOWN1_FIELD from '../generated/pt-maps/town1/field.generated';
import * as DC1_FIELD from '../generated/pt-maps/dc1/field.generated';
import * as TCIVE_FIELD from '../generated/pt-maps/tcave/field.generated';
import * as AD1_FIELD from '../generated/pt-maps/ad1/field.generated';
import {
  activePtField,
  ptFieldIdAt,
  ptFloorOwnerAt,
  ptStaticFieldRegistered,
  registerPtStaticField,
  withPtFieldScope,
} from '../src/sim/pt_field_active';
import {
  ptGraphFieldTransform,
  ptGraphWarpGatesOf,
  registerPtMapGraph,
  type PtMapGraphData,
} from '../src/sim/pt_map_graph';
import { Sim } from '../src/sim/sim';
import { updatePtTransitions } from '../src/sim/pt_transitions';
import type { Entity, PlayerClass, SimEvent } from '../src/sim/types';

registerPtMapGraph(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../generated/pt-maps/maplinks.json', import.meta.url)),
      'utf8',
    ),
  ) as PtMapGraphData,
);
registerPtStaticField(PILAI_FIELD, 'pilai');
registerPtStaticField(TOWN1_FIELD, 'town1');
registerPtStaticField(FORE1_FIELD, 'fore-1');
registerPtStaticField(FORE2_FIELD, 'fore-2');
registerPtStaticField(FORE3_FIELD, 'fore-3');
registerPtStaticField(FF01_FIELD, 'forever-fall-01');
// The island tier: identity-scoped registrations. Positional dispatch must
// never see them; scoped dispatch must always.
registerPtStaticField(DC1_FIELD, 'dc1');
registerPtStaticField(TCIVE_FIELD, 'tcave');
registerPtStaticField(AD1_FIELD, 'ad1');

function makeSim(playerClass: PlayerClass, seed = 7310): Sim {
  return new Sim({ seed, playerClass, autoEquip: true, compulsoryTutorial: true });
}

function seedPtField(sim: Sim): Entity {
  const p = sim.player;
  updatePtTransitions(sim.ctx, p, () => 0.5);
  return p;
}

/** Place the player at an authored PT coordinate of `fieldId`, verbatim. */
function place(sim: Sim, fieldId: string, ptX: number, ptY: number, ptZ: number): Entity {
  const xf = ptGraphFieldTransform(fieldId)!;
  const p = sim.player;
  p.pos = { x: xf.ptXToWoC(ptX), y: xf.ptYToWoC(ptY), z: xf.ptZToWoC(ptZ) };
  p.prevPos = { ...p.pos };
  return p;
}

// The Ricarten -> fore-1 gate road corridor (measured from the generated
// field geometry): Ricarten's floor runs the gate road to z~274 deep inside
// fore-1's bounds claim (which begins ~z261); fore-1's own floor starts at
// z~274. A bounds-only dispatch answers fore-1's void floor inside the
// overlap - the O2 live-E2E stall - while the entity scope keeps the
// Ricarten floor live until the real handoff.
const SEAM = { x: 139514, ricFloorEndZ: 272, f1FloorStartZ: 276 };

// The authored dc1 warp pair (maplinks.json): ricarten's lvl-180 gate out,
// dc1's lvl-0 gate home.
const RIC_DC1 = ptGraphWarpGatesOf('ricarten').find((g) =>
  g.exits.some((e) => e.toId === 'dc1'),
)!;
const DC1_RIC = ptGraphWarpGatesOf('dc1')[0];

/** dc1's authored landing position, in WoC coords. */
function dc1Landing(): { x: number; y: number; z: number } {
  const exit = RIC_DC1.exits.find((e) => e.toId === 'dc1')!;
  const xf = ptGraphFieldTransform('dc1')!;
  return { x: xf.ptXToWoC(exit.x), y: xf.ptYToWoC(exit.y), z: xf.ptZToWoC(exit.z) };
}

describe('identity-scoped registration', () => {
  it('registers a band island into the scoped tier only', () => {
    expect(ptStaticFieldRegistered('dc1')).toBe(true);
    // The positional identity scan must not name an overlapping island:
    // at dc1's own landing (inside its self-anchored footprint) the
    // continent claimant still wins.
    const land = dc1Landing();
    expect(ptFieldIdAt(land.x, land.z)).not.toBe('dc1');
  });

  it('resolves island floors only under the entity scope', () => {
    const land = dc1Landing();
    const refY = land.y + 5;
    const unscoped = activePtField().floorHeight(land.x, land.z, refY);
    const scoped = withPtFieldScope('dc1', () =>
      activePtField().floorHeight(land.x, land.z, refY),
    );
    // dc1 has real geometry at its authored exit; the positional claimant
    // answers a DIFFERENT field's floor (or void) at the same coordinates.
    expect(scoped).not.toBe(-Infinity);
    expect(scoped).not.toBe(unscoped);
  });

  it('an island scope never promotes through floors - islands have no edges', () => {
    const land = dc1Landing();
    // dc1 has no FieldGate edges: there is no standby claimant, so the
    // floor owner can never be another field.
    expect(ptFloorOwnerAt('dc1', land.x, land.z, land.y + 5)).toBeNull();
  });
});

describe('seam floor ownership (the live-E2E stall regression)', () => {
  it('own-field floor answers past the neighbor claim edge', () => {
    // Ricarten-scoped query just inside fore-1's claim: the road floor is
    // real; positional dispatch answered fore-1's void here.
    const scoped = withPtFieldScope('ricarten', () =>
      activePtField().floorHeight(SEAM.x, SEAM.ricFloorEndZ, 20),
    );
    expect(scoped).not.toBe(-Infinity);
    // The floor owner stays ricarten while its floor owns the position.
    expect(ptFloorOwnerAt('ricarten', SEAM.x, SEAM.ricFloorEndZ, 20)).toBeNull();
    // Past the floor handoff the owner is fore-1.
    expect(ptFloorOwnerAt('ricarten', SEAM.x, SEAM.f1FloorStartZ, 16)).toBe('fore-1');
  });

  it('walks ricarten -> fore-1 across the overlapped claim without stalling', () => {
    const sim = makeSim('tempskron_fighter');
    const p = seedPtField(sim);
    expect(p.ptField).toBe('ricarten');
    // Corridor south end, settled onto the floor by a short fall.
    p.pos = { x: SEAM.x, y: 30, z: 252 };
    p.prevPos = { ...p.pos };
    const meta = sim.players.get(p.id)!;
    meta.moveInput.forward = true;
    p.facing = 0; // +z, up the gate road
    for (let i = 0; i < 80 && !p.onGround; i++) sim.tick();
    const z0 = p.pos.z;
    // The whole pre-O2.5 failure mode was a hard stop at the fore-1 claim
    // edge (~261). Give the walk a generous budget, then assert BOTH the
    // traversal and the identity flip happened.
    let sawTransition = false;
    for (let i = 0; i < 600; i++) {
      const events = sim.tick();
      if (
        events.some(
          (e) => e.type === 'pt_transition' && e.kind === 'field' && e.field === 'fore-1',
        )
      ) {
        sawTransition = true;
        break;
      }
    }
    meta.moveInput.forward = false;
    expect(sawTransition).toBe(true);
    expect(p.ptField).toBe('fore-1');
    expect(p.pos.z).toBeGreaterThan(SEAM.ricFloorEndZ);
    expect(p.pos.z).toBeGreaterThan(z0);
  });
});

describe('island warp traversal (dc1)', () => {
  function warpIntoDc1(sim: Sim): Entity {
    const p = seedPtField(sim);
    p.level = 200; // clears the authored lvl-180 gate
    place(sim, 'ricarten', RIC_DC1.x, RIC_DC1.y, RIC_DC1.z);
    const out = sim.requestPtTransition();
    expect(out).toEqual({ ok: true, kind: 'warp', field: 'dc1' });
    expect(p.ptField).toBe('dc1');
    return p;
  }

  it('warps ricarten -> dc1 to the authored island exit, verbatim', () => {
    const sim = makeSim('tempskron_fighter');
    const p = warpIntoDc1(sim);
    const land = dc1Landing();
    expect(p.pos.x).toBe(land.x);
    expect(p.pos.z).toBe(land.z);
    expect(sim.drainEvents()).toContainEqual({
      type: 'pt_transition', pid: p.id, kind: 'warp', field: 'dc1',
    } satisfies SimEvent);
  });

  it('keeps dc1 identity while moving inside the overlapping footprint', () => {
    const sim = makeSim('tempskron_fighter');
    const p = warpIntoDc1(sim);
    const meta = sim.players.get(p.id)!;
    const before = { ...p.pos };
    meta.moveInput.forward = true; // facing 0 = +z: open floor, away from the gate
    for (let i = 0; i < 40; i++) sim.tick();
    meta.moveInput.forward = false;
    // Never flipped to the continent claimant under the same coordinates:
    // the bounds claim is ambiguous, the floor scope is not.
    expect(p.ptField).toBe('dc1');
    // The entity actually STEPPED on the island floor - a void scope would
    // refuse every move (the live-harness failure this regression pins).
    expect(Math.hypot(p.pos.x - before.x, p.pos.z - before.z)).toBeGreaterThan(0.5);
    expect(Number.isFinite(p.pos.y)).toBe(true);
  });

  it('warps back out on the authored dc1 -> ricarten gate', () => {
    const sim = makeSim('tempskron_fighter');
    const p = warpIntoDc1(sim);
    p.ptWarpLockUntil = 0; // expire the re-warp lockout for the return leg
    place(sim, 'dc1', DC1_RIC.x, DC1_RIC.y, DC1_RIC.z);
    const out = sim.requestPtTransition();
    expect(out).toEqual({ ok: true, kind: 'warp', field: 'ricarten' });
    expect(p.ptField).toBe('ricarten');
    const exit = DC1_RIC.exits[0];
    const xf = ptGraphFieldTransform('ricarten')!;
    expect(p.pos.x).toBe(xf.ptXToWoC(exit.x));
    expect(p.pos.z).toBe(xf.ptZToWoC(exit.z));
  });
});

describe('spoof / stale / isolation', () => {
  it('a spoofed island ptField outside its bounds is repaired on tick', () => {
    const sim = makeSim('tempskron_fighter');
    const p = seedPtField(sim);
    p.ptField = 'dc1'; // standing in ricarten town, outside dc1's claim
    sim.tick();
    expect(p.ptField).toBe('ricarten');
  });

  it('rejects a field request with no floor transfer in progress', () => {
    const sim = makeSim('tempskron_fighter');
    const p = seedPtField(sim);
    // Ricarten town interior: no connected claimant, nothing to flip to.
    expect(sim.requestPtTransition()).toEqual({ ok: false, reason: 'no_transition' });
    expect(p.ptField).toBe('ricarten');
  });

  it('a warp to an unregistered field still fails closed', () => {
    const sim = makeSim('tempskron_fighter');
    const p = seedPtField(sim);
    p.level = 200; // clears the authored lvl-135 gate
    // ba4 -> sanc1: sanc1 is registered NOWHERE (not this file, not
    // server/pt_fields.ts), so the resolver answers field_unavailable
    // rather than simulating a floor on the wrong geometry.
    expect(ptStaticFieldRegistered('sanc1')).toBe(false);
    const gate = ptGraphWarpGatesOf('ba4').find((g) =>
      g.exits.some((e) => e.toId === 'sanc1'),
    )!;
    place(sim, 'ba4', gate.x, gate.y, gate.z);
    p.ptField = 'ba4';
    const out = sim.requestPtTransition();
    expect(out).toEqual({ ok: false, reason: 'field_unavailable' });
    expect(p.ptField).toBe('ba4');
  });

  it('two players on the overlapping footprint do not share identity', () => {
    const sim = makeSim('tempskron_fighter');
    const a = seedPtField(sim);
    a.level = 200;
    place(sim, 'ricarten', RIC_DC1.x, RIC_DC1.y, RIC_DC1.z);
    const bState = characterCreationTestSeam.initialCharacterState('tempskron_fighter', 'B', 0);
    const bPid = sim.addPlayer('tempskron_fighter', 'B', { autoEquip: true, state: bState });
    const b = sim.entities.get(bPid)!;
    expect(b.ptField).toBe('ricarten');
    const bPos = { ...b.pos };
    sim.requestPtTransition(a.id);
    expect(a.ptField).toBe('dc1');
    expect(b.ptField).toBe('ricarten');
    expect(b.pos).toEqual(bPos);
    // Field-aware interest: same coordinates, different maps - invisible.
    expect(inSamePtField(a, b)).toBe(false);
    expect(inSamePtField(b, b)).toBe(true);
    expect(inSamePtField(b, a)).toBe(false);
  });
});

describe('save / reconnect into an island', () => {
  it('restores the island field and resolves the island floor', () => {
    const sim = makeSim('tempskron_fighter');
    const p = seedPtField(sim);
    p.level = 200;
    place(sim, 'ricarten', RIC_DC1.x, RIC_DC1.y, RIC_DC1.z);
    sim.requestPtTransition();
    expect(p.ptField).toBe('dc1');
    const state = sim.serializeCharacter(p.id)!;
    expect(state.ptField).toBe('dc1');
    // Reconnect: the persisted field seeds verbatim, and the saved
    // position's floor resolves against dc1's geometry - not the continent
    // claimant's. The scoped spawn read is what makes that true.
    const pid2 = sim.addPlayer('tempskron_fighter', 'Returner', { state });
    const restored = sim.entities.get(pid2)!;
    expect(restored.ptField).toBe('dc1');
    expect(restored.pos.x).toBe(state.pos.x);
    expect(restored.pos.z).toBe(state.pos.z);
    // groundPos -> placementFloorHeight -> groundHeight -> scoped
    // activePtField: the restored Y IS the island's ground.
    const islandGround = withPtFieldScope('dc1', () =>
      activePtField().groundHeight(restored.pos.x, restored.pos.z),
    );
    expect(islandGround).not.toBe(-Infinity);
    expect(restored.pos.y).toBe(islandGround);
  });
});
