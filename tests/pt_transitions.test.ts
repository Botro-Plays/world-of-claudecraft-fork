// PT authoritative field transitions (Phase O2).
//
// Covers the realm-side authority (src/sim/pt_transitions.ts running on a
// descriptor-less host - which is exactly what a bare Sim is - plus the
// shared graph (src/sim/pt_map_graph.ts) both hosts resolve against):
//
//   - FieldGate ownership flips: position-continuous, only ptField changes;
//     approved only when the claimant is reachable through a LIVE edge AND
//     registered on this host; a spoofed ptField is re-derived, never trusted.
//   - WarpGate triggers: the authored cylinder test verbatim (axis limit,
//     radial size, height check disabled at y=0, LimitLevel, exits-required,
//     first-match order).
//   - SE0 immediate warps: server-side exit pick, verbatim authored landing
//     (no floor re-resolve), lockout arm, pid-scoped pt_transition event.
//   - SE1 delayed warps: arm, gate-center pin, release on the authority's
//     clock, pending/lockout rejections, drop-on-death.
//   - SE2 wing warps: rejected 'wing_unsupported' - no online destination
//     protocol exists, so the request fails closed rather than silently
//     trusting the client.
//   - Offline/dev preservation: on a descriptor host the whole resolver is
//     inert - pt_field_links.ts / pt_warp_gates.ts keep owning traversal.
//
// Registration mirrors server/pt_fields.ts's continent closure. 'ruin-3' -
// gate-connected to ruin-4 but outside the closure - supplies the
// field_unavailable rejection's live-edge destination. Band islands
// (tcave, dc1, ...) are not registered in THIS file: the identity-scoped
// tier they occupy on the realm is covered by tests/pt_field_dispatch.test.ts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { characterCreationTestSeam } from '../server/main';
import * as FF01_FIELD from '../generated/pt-maps/forever-fall-01/field.generated';
import * as FORE1_FIELD from '../generated/pt-maps/fore-1/field.generated';
import * as FORE2_FIELD from '../generated/pt-maps/fore-2/field.generated';
import * as FORE3_FIELD from '../generated/pt-maps/fore-3/field.generated';
import * as FO1_FIELD from '../generated/pt-maps/fo1/field.generated';
import * as PILAI_FIELD from '../generated/pt-maps/pilai/field.generated';
import * as TOWN1_FIELD from '../generated/pt-maps/town1/field.generated';
import * as FF02_FIELD from '../generated/pt-maps/forever-fall-02/field.generated';
import { makePtContinentTransform, type PtMapDescriptor } from '../src/sim/pt_field';
import {
  activePtMapDescriptor,
  ptFieldIdAt,
  ptStaticFieldRegistered,
  registerPtStaticField,
  setActivePtMap,
} from '../src/sim/pt_field_active';
import {
  ptFieldClaimsWocPos,
  ptGateEdgeBetween,
  ptGraphFieldTransform,
  ptGraphWarpGatesOf,
  ptStickyFieldAt,
  ptWarpTriggerIn,
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
registerPtStaticField(FF02_FIELD, 'forever-fall-02');
registerPtStaticField(FO1_FIELD, 'fo1');
// 'ruin-3' stays unregistered (see header); band islands (tcave, dc1, ...)
// go unregistered HERE on purpose so the field_unavailable path keeps a
// live-edge destination - their identity-scoped tier is exercised by
// tests/pt_field_dispatch.test.ts.

function makeSim(playerClass: PlayerClass, seed = 7310): Sim {
  return new Sim({ seed, playerClass, autoEquip: true, compulsoryTutorial: true });
}

/**
 * Run ONE authority pass so the tracker seeds p.ptField from the spawn
 * position. A fresh Sim's own player is relocated to the PT start AFTER
 * addPlayer ran (the constructor's freshArrival step), so the entity-level
 * seed in addPlayer never saw a PT-band position - the tracker's first pass
 * is what names the field, exactly as it does on the realm for a pre-O1 save.
 */
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

/** The graph's authored warp gates for a field (PT-frame records). */
function warpGates(fieldId: string) {
  return ptGraphWarpGatesOf(fieldId);
}

// Authored records used below (generated/pt-maps/maplinks.json):
const PILAI_SE0 = warpGates('pilai').find((g) => g.specialEffect === 0)!;
const PILAI_SE2 = warpGates('pilai').find((g) => g.specialEffect === 2)!;
const FF01_SE1 = warpGates('forever-fall-01')[0];
const RICARTEN_LV180 = warpGates('ricarten').find((g) => g.limitLevel === 180)!;

describe('shared map graph', () => {
  it('loads the generated artifact with bounds on every field', () => {
    const xf = ptGraphFieldTransform('pilai');
    expect(xf).not.toBeNull();
    expect(ptFieldIdAt(0, 0)).toBeNull();
  });

  it('round-trips WoC <-> PT coordinates through the graph transform', () => {
    const xf = ptGraphFieldTransform('fore-1')!;
    const wx = xf.ptXToWoC(4000);
    const wz = xf.ptZToWoC(-8000);
    expect(xf.woCToPtX(wx)).toBeCloseTo(4000, 3);
    expect(xf.woCToPtZ(wz)).toBeCloseTo(-8000, 3);
  });

  it('resolves the authored ricarten<->fore-1 FieldGate edge', () => {
    const e = ptGateEdgeBetween('ricarten', 'fore-1');
    expect(e).not.toBeNull();
    expect(e!.bidirectional).toBe(true);
    expect(e!.dead).toBeUndefined();
  });

  it('sticky identity prefers a live-edge claimant the current field lost', () => {
    const xf = ptGraphFieldTransform('fore-1')!;
    const wx = xf.ptXToWoC(4000);
    const wz = xf.ptZToWoC(-8000);
    // Fore-1 claims it; ricarten (the recorded field) does not.
    expect(ptFieldClaimsWocPos('fore-1', wx, wz)).toBe(true);
    expect(ptFieldClaimsWocPos('ricarten', wx, wz)).toBe(false);
    expect(ptStickyFieldAt('ricarten', wx, wz)).toBe('fore-1');
  });
});

describe('ptWarpTriggerIn (authored cylinder)', () => {
  const gate = {
    x: 1000, z: 2000, y: 500, size: 64, height: 32, limitLevel: 0,
    exits: [{ to: 1, toId: 'x', x: 0, z: 0, y: 0 }],
  };

  it('hits inside the cylinder and misses outside the radius', () => {
    expect(ptWarpTriggerIn([gate], 1000, 500, 2000, 1)).not.toBeNull();
    expect(ptWarpTriggerIn([gate], 1000, 500, 2000 + 64, 1)).toBeNull();
    // The per-axis bound is a hard 1024 regardless of radius.
    const wide = { ...gate, size: 2000 };
    expect(ptWarpTriggerIn([wide], 1000 + 1024, 500, 2000, 1)).toBeNull();
  });

  it('a y==0 gate disables the height check; nonzero heights enforce it', () => {
    const noY = { ...gate, y: 0 };
    expect(ptWarpTriggerIn([noY], 1000, 99999, 2000, 1)).not.toBeNull();
    expect(ptWarpTriggerIn([gate], 1000, 500 + 32, 2000, 1)).toBeNull();
  });

  it('level-gates and requires at least one exit', () => {
    const lv = { ...gate, limitLevel: 55 };
    expect(ptWarpTriggerIn([lv], 1000, 500, 2000, 1)).toBeNull();
    expect(ptWarpTriggerIn([lv], 1000, 500, 2000, 55)).not.toBeNull();
    const noExit = { ...gate, exits: [] };
    expect(ptWarpTriggerIn([noExit], 1000, 500, 2000, 99)).toBeNull();
  });
});

describe('authoritative FieldGate transitions', () => {
  it('flips ptField across a live edge without moving the player', () => {
    const sim = makeSim('tempskron_fighter');
    const p = seedPtField(sim);
    expect(p.ptField).toBe('ricarten');
    // fore-1 interior, unclaimed by ricarten, reachable via the live edge.
    place(sim, 'fore-1', 4000, 0, -8000);
    const before = { ...p.pos };
    const out = sim.requestPtTransition();
    expect(out).toEqual({ ok: true, kind: 'field', field: 'fore-1' });
    expect(p.ptField).toBe('fore-1');
    expect(p.pos).toEqual(before); // position-continuous: never a teleport
    const events = sim.drainEvents();
    expect(events).toContainEqual({
      type: 'pt_transition', pid: p.id, kind: 'field', field: 'fore-1',
    } satisfies SimEvent);
  });

  it('the passive tracker performs the same flip on tick', () => {
    const sim = makeSim('tempskron_fighter');
    const p = seedPtField(sim); // seeds 'ricarten' at the spawn
    place(sim, 'fore-1', 4000, 0, -8000);
    const events = sim.tick();
    expect(p.ptField).toBe('fore-1');
    expect(events).toContainEqual({
      type: 'pt_transition', pid: p.id, kind: 'field', field: 'fore-1',
    } satisfies SimEvent);
  });

  it('rejects when no connected field claims the position', () => {
    const sim = makeSim('tempskron_fighter');
    const p = seedPtField(sim);
    expect(sim.requestPtTransition()).toEqual({ ok: false, reason: 'no_transition' });
    expect(p.ptField).toBe('ricarten');
  });

  it('refuses a flip into an unregistered field (field_unavailable)', () => {
    const sim = makeSim('tempskron_fighter');
    const p = sim.player;
    // ruin-3 is gate-connected to ruin-4 but registered NOWHERE - not here
    // and not in server/pt_fields.ts (it is outside the O2 closure). Deep
    // interior: claimed by ruin-3 alone (ruin-4's claim ends ~1011).
    expect(ptStaticFieldRegistered('ruin-3')).toBe(false);
    p.ptField = 'ruin-4';
    p.pos = { x: 139500, y: 0, z: 1200 };
    p.prevPos = { ...p.pos };
    expect(ptStickyFieldAt('ruin-4', p.pos.x, p.pos.z)).toBe('ruin-3');
    const out = sim.requestPtTransition();
    expect(out).toEqual({ ok: false, reason: 'field_unavailable' });
    expect(p.ptField).toBe('ruin-4');
    // The passive tracker refuses the same flip.
    sim.tick();
    expect(p.ptField).toBe('ruin-4');
  });

  it('a spoofed ptField never names the destination - the resolver re-derives', () => {
    const sim = makeSim('tempskron_fighter');
    const p = sim.player;
    // Claim 'pilai' while physically standing at the Ricarten spawn: pilai
    // has no live edge to ricarten, so no transition can be forced. The
    // tracker repairs the lie on the next tick.
    p.ptField = 'pilai';
    expect(sim.requestPtTransition()).toEqual({ ok: false, reason: 'no_transition' });
    sim.tick();
    expect(p.ptField).toBe('ricarten');
  });

  it('returns not_pt outside the PT band', () => {
    const sim = makeSim('warrior');
    expect(sim.requestPtTransition()).toEqual({ ok: false, reason: 'not_pt' });
  });
});

describe('authoritative WarpGate transitions', () => {
  it('warps pilai -> forever-fall-01 on the authored exit, verbatim landing', () => {
    const sim = makeSim('morion_magician');
    const p = seedPtField(sim);
    expect(p.ptField).toBe('pilai');
    place(sim, 'pilai', PILAI_SE0.x, PILAI_SE0.y, PILAI_SE0.z);
    const out = sim.requestPtTransition();
    expect(out).toEqual({ ok: true, kind: 'warp', field: 'forever-fall-01' });
    expect(p.ptField).toBe('forever-fall-01');
    // Landing is the authored exit verbatim through the DESTINATION field's
    // transform - no floor re-resolve (ptField.ts CheckWarpGate does the
    // same; the AncientW no-floor exit relies on it).
    const exit = PILAI_SE0.exits[0];
    const dxf = ptGraphFieldTransform('forever-fall-01')!;
    expect(p.pos.x).toBe(dxf.ptXToWoC(exit.x));
    expect(p.pos.y).toBe(dxf.ptYToWoC(exit.y));
    expect(p.pos.z).toBe(dxf.ptZToWoC(exit.z));
    // prevPos == pos: the position-discontinuity sentinel the wire layer
    // turns into a hard snap (movementOverrideEpoch bump on v2).
    expect(p.prevPos).toEqual(p.pos);
    expect(p.ptWarpLockUntil).toBeGreaterThan(0);
    expect(sim.drainEvents()).toContainEqual({
      type: 'pt_transition', pid: p.id, kind: 'warp', field: 'forever-fall-01',
    } satisfies SimEvent);
  });

  it('the passive scan fires the same warp without a request', () => {
    const sim = makeSim('morion_magician');
    const p = seedPtField(sim); // 'pilai' - the scan needs seeded identity
    place(sim, 'pilai', PILAI_SE0.x, PILAI_SE0.y, PILAI_SE0.z);
    const events = sim.tick();
    expect(p.ptField).toBe('forever-fall-01');
    expect(events).toContainEqual({
      type: 'pt_transition', pid: p.id, kind: 'warp', field: 'forever-fall-01',
    } satisfies SimEvent);
  });

  it('arms a delayed (SE1) warp, holds at the gate, releases on the clock', () => {
    const sim = makeSim('morion_magician');
    const p = seedPtField(sim);
    // Arrive the honest way: SE0 warp into forever-fall-01.
    place(sim, 'pilai', PILAI_SE0.x, PILAI_SE0.y, PILAI_SE0.z);
    expect(sim.requestPtTransition()).toEqual({
      ok: true, kind: 'warp', field: 'forever-fall-01',
    });
    // The global re-warp lockout now holds: a nudge inside the ff-01 return
    // trigger reports it instead of double-firing.
    place(sim, 'forever-fall-01', FF01_SE1.x, FF01_SE1.y, FF01_SE1.z);
    expect(sim.requestPtTransition()).toEqual({ ok: false, reason: 'warp_locked' });
    p.ptWarpLockUntil = 0; // expire for the next step
    const armed = sim.requestPtTransition();
    expect(armed).toEqual({ ok: true, kind: 'warp', field: 'forever-fall-01', delayed: true });
    expect(p.ptWarpPending).toBeDefined();
    // A second request while armed is idempotent.
    expect(sim.requestPtTransition()).toEqual({ ok: false, reason: 'warp_pending' });
    // Still in forever-fall-01 - the release owns the move, not the request.
    expect(p.ptField).toBe('forever-fall-01');
    const exit = FF01_SE1.exits[0];
    const pxf = ptGraphFieldTransform('pilai')!;
    // Tick past the 2s release window (DT steps of 50ms). The earlier
    // pilai->forever-fall-01 event is still queued in the buffer, so match
    // the RETURN warp specifically rather than any warp event.
    let sawReturn = false;
    for (let i = 0; i < 60; i++) {
      for (const ev of sim.tick()) {
        if (ev.type === 'pt_transition' && ev.kind === 'warp' && ev.field === 'pilai') {
          sawReturn = true;
        }
      }
    }
    expect(sawReturn).toBe(true);
    expect(p.ptField).toBe('pilai');
    expect(p.pos.x).toBe(pxf.ptXToWoC(exit.x));
    expect(p.pos.z).toBe(pxf.ptZToWoC(exit.z));
  });

  it('rejects a wing warp (SE2) closed - no online destination protocol', () => {
    const sim = makeSim('morion_magician');
    const p = seedPtField(sim);
    place(sim, 'pilai', PILAI_SE2.x, PILAI_SE2.y, PILAI_SE2.z);
    const before = { ...p.pos };
    expect(sim.requestPtTransition()).toEqual({ ok: false, reason: 'wing_unsupported' });
    expect(p.pos).toEqual(before);
    expect(p.ptField).toBe('pilai');
    // And the passive scan must not arm it either (silently skipped there).
    sim.tick();
    expect(p.ptField).toBe('pilai');
    expect(p.ptWarpPending).toBeUndefined();
  });

  it('rejects below LimitLevel as low_level, distinctly from no trigger', () => {
    const sim = makeSim('tempskron_fighter');
    const p = seedPtField(sim);
    p.level = 1;
    place(sim, 'ricarten', RICARTEN_LV180.x, RICARTEN_LV180.y, RICARTEN_LV180.z);
    expect(sim.requestPtTransition()).toEqual({ ok: false, reason: 'low_level' });
    expect(p.ptField).toBe('ricarten');
  });

  it('rejects a warp whose exit field has no collision (field_unavailable)', () => {
    const sim = makeSim('tempskron_fighter');
    const p = seedPtField(sim);
    p.level = 200; // clears the level gate; sanc1 is registered NOWHERE.
    // ba4 -> sanc1 (lvl 135): ba4 is registered (it is the ad-chain's
    // continent endpoint), but the exit field is not, so the resolver
    // refuses rather than simulating a floor on the wrong geometry.
    const gate = warpGates('ba4').find((g) => g.exits.some((e) => e.toId === 'sanc1'))!;
    expect(ptStaticFieldRegistered('sanc1')).toBe(false);
    place(sim, 'ba4', gate.x, gate.y, gate.z);
    p.ptField = 'ba4';
    expect(sim.requestPtTransition()).toEqual({ ok: false, reason: 'field_unavailable' });
    expect(p.ptField).toBe('ba4');
  });

  it('drops a delayed arm when the player dies before release', () => {
    const sim = makeSim('morion_magician');
    const p = sim.player;
    place(sim, 'forever-fall-01', FF01_SE1.x, FF01_SE1.y, FF01_SE1.z);
    p.ptField = 'forever-fall-01';
    const armed = sim.requestPtTransition();
    expect(armed).toEqual({ ok: true, kind: 'warp', field: 'forever-fall-01', delayed: true });
    p.dead = true;
    sim.tick();
    expect(p.ptWarpPending).toBeUndefined();
    expect(p.ptField).toBe('forever-fall-01'); // no warp fired
  });

  it('leaves a second player untouched when one player warps', () => {
    const sim = makeSim('morion_magician');
    const a = sim.player;
    // The online create path: the newborn row carries the pilai spawn and
    // its stamped ptField, so addPlayer seeds 'pilai' verbatim.
    const bState = characterCreationTestSeam.initialCharacterState('morion_magician', 'B', 0);
    const bPid = sim.addPlayer('morion_magician', 'B', { autoEquip: true, state: bState });
    const b = sim.entities.get(bPid)!;
    const bPos = { ...b.pos };
    place(sim, 'pilai', PILAI_SE0.x, PILAI_SE0.y, PILAI_SE0.z);
    sim.requestPtTransition(a.id);
    expect(a.ptField).toBe('forever-fall-01');
    expect(b.ptField).toBe('pilai');
    expect(b.pos).toEqual(bPos);
  });
});

describe('save / reconnect', () => {
  it('serializeCharacter carries the post-warp field and position', () => {
    const sim = makeSim('morion_magician');
    const p = sim.player;
    place(sim, 'pilai', PILAI_SE0.x, PILAI_SE0.y, PILAI_SE0.z);
    sim.requestPtTransition();
    const state = sim.serializeCharacter(p.id)!;
    expect(state.ptField).toBe('forever-fall-01');
    expect(state.pos.x).toBe(p.pos.x);
    expect(state.pos.z).toBe(p.pos.z);
    // A reconnecting sim restores the persisted field verbatim (the bounds
    // scan cannot disambiguate the warp-island overlap with pilai on its own).
    const pid2 = sim.addPlayer('morion_magician', 'Returner', { state });
    const restored = sim.entities.get(pid2)!;
    expect(restored.ptField).toBe('forever-fall-01');
    expect(restored.pos.x).toBe(state.pos.x);
  });
});

describe('offline/dev preservation (descriptor hosts)', () => {
  it('the whole resolver is inert while a map descriptor is bound', () => {
    const desc: PtMapDescriptor = {
      id: 'pilai',
      field: PILAI_FIELD,
      transform: makePtContinentTransform(),
      textureBase: '',
      stageObjects: null,
      oceanRing: false,
    };
    setActivePtMap(desc);
    try {
      expect(activePtMapDescriptor()).not.toBeNull();
      const sim = makeSim('morion_magician');
      const p = sim.player;
      // The request path cannot force a transition on a descriptor host -
      // pt_field_links.ts / pt_warp_gates.ts own traversal there.
      place(sim, 'pilai', PILAI_SE0.x, PILAI_SE0.y, PILAI_SE0.z);
      expect(sim.requestPtTransition()).toEqual({ ok: false, reason: 'not_pt' });
      const atGate = { ...p.pos };
      const events = sim.tick();
      // The tracker never ran, so the entity's ptField is still the
      // constructor-time unset state (a descriptor host's field identity
      // lives in the binding, not on the entity), and no warp fired.
      // (floor resolution may re-settle Y; the warp's XZ jump is what must
      // NOT happen.)
      expect(p.ptField).toBeUndefined();
      expect(p.pos.x).toBe(atGate.x);
      expect(p.pos.z).toBe(atGate.z);
      expect(events.some((e) => e.type === 'pt_transition')).toBe(false);
    } finally {
      setActivePtMap(null);
      expect(activePtMapDescriptor()).toBeNull();
    }
  });
});
