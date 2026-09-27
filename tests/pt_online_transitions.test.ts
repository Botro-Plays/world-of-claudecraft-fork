// Online PT transitions (phase O2): the CLIENT glue in
// src/game/pt_online_transitions.ts - nudge cadence, the WarpGate presence
// probe, the ptf reconcile hysteresis, and the pt_transition event bind.
// The module is presentation-only: it never moves the player and never
// trusts a client-side field name, so every assertion here is about WHEN a
// bind or a nudge happens, never about destination data (there is none).

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  handlePtTransitionEvent,
  resetPtOnlineTransitions,
  setPtOnlineTransitionsClock,
  tickPtOnlineTransitions,
} from '../src/game/pt_online_transitions';
import { loadPtDevMap } from '../src/game/pt_dev_maps';
import {
  activePtMapDescriptor,
  setActivePtMap,
  setDefaultPtMap,
  setStandbyPtMap,
} from '../src/sim/pt_field_active';
import { PT_RICARTEN_SOURCE } from '../src/render/pt_terrain';
import {
  ptXToWoC,
  ptZToWoC,
  PT_RICARTEN_START_X,
  PT_RICARTEN_START_Z,
} from '../src/sim/pt_band';
import type { Entity } from '../src/sim/types';
import type { IWorld } from '../src/world_api';
import type { SimEvent } from '../src/sim/types';

// A WoC position inside the Ricarten footprint (the authored start point).
const RICARTEN_WOC = {
  x: ptXToWoC(PT_RICARTEN_START_X),
  y: 0,
  z: ptZToWoC(PT_RICARTEN_START_Z),
};

let clockNow = 0;

function fakePlayer(x = RICARTEN_WOC.x, z = RICARTEN_WOC.z, y = 0): Entity {
  return {
    id: 7,
    pos: { x, y, z },
    level: 1,
  } as unknown as Entity;
}

function fakeWorld(ptField: string | null) {
  const requests: number[] = [];
  const world = {
    ptField,
    requestPtFieldTransition: () => {
      requests.push(clockNow);
      return Promise.resolve(true);
    },
  } as unknown as IWorld;
  return { world, requests };
}

/** Wait until the bound field's package id matches (loadPtDevMap is a real
 *  async import inside bindAuthoritativeField). */
async function boundId(id: string): Promise<void> {
  await vi.waitFor(() => {
    expect(activePtMapDescriptor()?.id).toBe(id);
  });
}

beforeAll(() => {
  // The render layer normally registers the Ricarten default at boot; a
  // headless test host must do it explicitly or no PT map is bound at all.
  setDefaultPtMap(PT_RICARTEN_SOURCE);
});

afterEach(() => {
  resetPtOnlineTransitions();
  setPtOnlineTransitionsClock(null);
  setActivePtMap(null);
  setStandbyPtMap(null);
});

describe('online PT transitions (client glue)', () => {
  it('is a no-op outside the PT band and without a bound PT map', () => {
    const { world, requests } = fakeWorld(null);
    tickPtOnlineTransitions(world, fakePlayer(0, 0));
    setActivePtMap(null); // the ricarten default binding IS a PT map
    expect(requests).toHaveLength(0);
    // Undefined self (pre-first-snapshot) is likewise inert.
    tickPtOnlineTransitions(world, undefined);
    expect(requests).toHaveLength(0);
  });

  it('nudges once when the bound field flips, then throttles', async () => {
    setPtOnlineTransitionsClock(() => clockNow);
    const { world, requests } = fakeWorld('ricarten');
    const player = fakePlayer();
    tickPtOnlineTransitions(world, player); // seeds _lastBoundId='ricarten'
    expect(requests).toHaveLength(0); // first observation never nudges

    // The local floor promotion flips the bound map (same authored seam the
    // server watches) - the next frame asks the authority to confirm now.
    const fore1 = await loadPtDevMap('fore-1');
    setActivePtMap(fore1.descriptor);
    tickPtOnlineTransitions(world, player);
    expect(requests).toEqual([clockNow]);

    // Inside the 800ms cooldown the same flip state cannot re-request.
    clockNow += 100;
    tickPtOnlineTransitions(world, player);
    expect(requests).toHaveLength(1);
    clockNow += 800;
    tickPtOnlineTransitions(world, player);
    // No NEW flip, no warp trigger at this spot -> still no request.
    expect(requests).toHaveLength(1);
  });

  it('nudges while standing inside an authored WarpGate trigger', async () => {
    setPtOnlineTransitionsClock(() => clockNow);
    const pilai = await loadPtDevMap('pilai');
    setActivePtMap(pilai.descriptor);
    const gate = pilai.descriptor.warpGates?.find(
      (g) => g.specialEffect === 0 && g.exits.length > 0,
    );
    expect(gate).toBeDefined();
    const player = fakePlayer(
      pilai.descriptor.transform.ptXToWoC(gate!.x),
      pilai.descriptor.transform.ptZToWoC(gate!.z),
      pilai.descriptor.transform.ptYToWoC(gate!.y),
    );
    const { world, requests } = fakeWorld('pilai');
    tickPtOnlineTransitions(world, player);
    expect(requests).toEqual([clockNow]);
    // Still inside the trigger: the throttle, not the trigger, gates resends.
    clockNow += 200;
    tickPtOnlineTransitions(world, player);
    expect(requests).toHaveLength(1);
    clockNow += 800;
    tickPtOnlineTransitions(world, player);
    expect(requests).toHaveLength(2);
  });

  it('rejects a trigger when the player stands outside its cylinder', async () => {
    setPtOnlineTransitionsClock(() => clockNow);
    const pilai = await loadPtDevMap('pilai');
    setActivePtMap(pilai.descriptor);
    const gate = pilai.descriptor.warpGates?.find((g) => g.exits.length > 0);
    const player = fakePlayer(
      pilai.descriptor.transform.ptXToWoC(gate!.x + (gate!.size + 500)),
      pilai.descriptor.transform.ptZToWoC(gate!.z),
      pilai.descriptor.transform.ptYToWoC(gate!.y),
    );
    const { world, requests } = fakeWorld('pilai');
    tickPtOnlineTransitions(world, player);
    tickPtOnlineTransitions(world, player);
    expect(requests).toHaveLength(0);
  });

  it('binds the authoritative ptf field on first sighting of a mismatch', async () => {
    const { world, requests } = fakeWorld('pilai');
    tickPtOnlineTransitions(world, fakePlayer());
    // The realm's field disagrees with the bound ricarten -> load pilai.
    await boundId('pilai');
    expect(requests).toHaveLength(0); // a reconcile is a bind, not a request
  });

  it('waits out the hysteresis before undoing an unconfirmed local flip', async () => {
    setPtOnlineTransitionsClock(() => clockNow);
    const { world } = fakeWorld('ricarten');
    const player = fakePlayer();
    tickPtOnlineTransitions(world, player); // bound ricarten, ptf ricarten

    const fore1 = await loadPtDevMap('fore-1');
    setActivePtMap(fore1.descriptor);
    tickPtOnlineTransitions(world, player); // local flip; ptf still 'ricarten'

    // The unchanged ptf disagrees but is not new: mismatch timing starts.
    clockNow += 500;
    tickPtOnlineTransitions(world, player);
    expect(activePtMapDescriptor()?.id).toBe('fore-1'); // still local within 1.5s

    clockNow += 1200; // 1.7s of disagreement -> adopt the authority's answer
    tickPtOnlineTransitions(world, player);
    await boundId('ricarten');
  });

  it('handlePtTransitionEvent binds the destination for this player only', async () => {
    const ev: SimEvent = {
      type: 'pt_transition',
      pid: 7,
      kind: 'warp',
      field: 'pilai',
    };
    handlePtTransitionEvent(ev, 99); // another player's transition
    await new Promise((r) => setTimeout(r, 0));
    expect(activePtMapDescriptor()?.id).toBe('ricarten');

    handlePtTransitionEvent(ev, 7);
    await boundId('pilai');
  });

  it('ignores non-transition events and never issues requests from them', () => {
    const { world, requests } = fakeWorld('ricarten');
    handlePtTransitionEvent(
      { type: 'unstuck', pid: 7, phase: 'completed' } as SimEvent,
      7,
    );
    expect(requests).toHaveLength(0);
    expect(activePtMapDescriptor()?.id).toBe('ricarten');
  });
});
