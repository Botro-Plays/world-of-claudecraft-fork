// PT field identity (Phase O1, online-integration groundwork): the realm
// must NAME which PT field a position belongs to, not only resolve its
// floor. Covers:
// - ptFieldIdAt: id-tagged static registrations resolve by bounds;
//   Ricarten answers from its committed bounds without a registration;
//   unclaimed positions (inside the band but in no known field, or outside
//   the band entirely) return null instead of inheriting the Ricarten
//   floor fallback; a bound descriptor (client hosts) names its own field.
// - CharacterState.ptField: serializeCharacter writes the resolved id only
//   for PT-band positions, so non-PT and unresolvable saves stay
//   byte-equal.
//
// Static registration mirrors the realm boot (server/pt_start_fields.ts):
// pilai and town1 carry their package ids; Ricarten needs none.

import { describe, expect, it } from 'vitest';
import * as PILAI_FIELD from '../generated/pt-maps/pilai/field.generated';
import * as TOWN1_FIELD from '../generated/pt-maps/town1/field.generated';
import { characterCreationTestSeam } from '../server/main';
import {
  PT_BAND_X_MAX,
  PT_PILAI_SPAWN_X,
  PT_PILAI_SPAWN_Z,
  PT_RICARTEN_SPAWN_X,
  PT_RICARTEN_SPAWN_Z,
  PT_TOWN1_SPAWN_X,
  PT_TOWN1_SPAWN_Z,
} from '../src/sim/pt_band';
import {
  ptFieldIdAt,
  registerPtStaticField,
} from '../src/sim/pt_field_active';
import { Sim } from '../src/sim/sim';
import type { PlayerClass } from '../src/sim/types';

registerPtStaticField(PILAI_FIELD, 'pilai');
registerPtStaticField(TOWN1_FIELD, 'town1');

function makeSim(playerClass: PlayerClass, seed = 4120): Sim {
  // Same shape as pt_start.test.ts: the offline client's live-world config.
  return new Sim({ seed, playerClass, autoEquip: true, compulsoryTutorial: true });
}

describe('ptFieldIdAt', () => {
  it('resolves id-tagged static fields by WoC bounds', () => {
    expect(ptFieldIdAt(PT_PILAI_SPAWN_X, PT_PILAI_SPAWN_Z)).toBe('pilai');
    expect(ptFieldIdAt(PT_TOWN1_SPAWN_X, PT_TOWN1_SPAWN_Z)).toBe('town1');
  });

  it('names Ricarten from its committed bounds without a registration', () => {
    expect(ptFieldIdAt(PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z)).toBe('ricarten');
  });

  it('returns null outside every known field instead of claiming Ricarten', () => {
    // Deep inside the PT band but far from every registered footprint -
    // the floor fallback would answer Ricarten here; identity must not.
    expect(ptFieldIdAt(PT_BAND_X_MAX - 1, 20000)).toBeNull();
  });

  it('returns null outside the PT band', () => {
    expect(ptFieldIdAt(0, 0)).toBeNull();
    expect(ptFieldIdAt(-94, -58)).toBeNull(); // PLAYER_START (Eastbrook)
  });
});

describe('CharacterState.ptField', () => {
  it('names the owning field on a Morion (Pillai) save', () => {
    const sim = makeSim('morion_magician');
    const state = sim.serializeCharacter(sim.playerId)!;
    expect(state.pos.x).toBeCloseTo(PT_PILAI_SPAWN_X, 3);
    expect(state.pos.z).toBeCloseTo(PT_PILAI_SPAWN_Z, 3);
    expect(state.ptField).toBe('pilai');
  });

  it('names the owning field on a Tempskron (Ricarten) save', () => {
    const sim = makeSim('tempskron_fighter');
    const state = sim.serializeCharacter(sim.playerId)!;
    expect(state.ptField).toBe('ricarten');
  });

  it('names the owning field on an Atlanteon (Atlantis Town) save', () => {
    const sim = makeSim('atlanteon_martial_artist');
    const state = sim.serializeCharacter(sim.playerId)!;
    expect(state.ptField).toBe('town1');
  });

  it('omits the key entirely for a WoC spawn (byte-equal saves)', () => {
    const sim = makeSim('warrior');
    const state = sim.serializeCharacter(sim.playerId)!;
    expect('ptField' in state).toBe(false);
  });
});

describe('server initialCharacterState', () => {
  // The create path stamps the id verbatim from pt_start.ts so the FIRST
  // persisted row names the field rather than waiting for a live save.
  it.each([
    ['tempskron_fighter', 'ricarten'],
    ['morion_magician', 'pilai'],
    ['atlanteon_martial_artist', 'town1'],
  ] as const)('stamps ptField %s -> %s on the newborn row', (cls, fieldId) => {
    const state = characterCreationTestSeam.initialCharacterState(cls, 'Newborn', 0);
    expect(state.ptField).toBe(fieldId);
    expect(ptFieldIdAt(state.pos.x, state.pos.z)).toBe(fieldId);
  });

  it('leaves the key off a WoC newborn row', () => {
    const state = characterCreationTestSeam.initialCharacterState('warrior', 'Newborn', 0);
    expect('ptField' in state).toBe(false);
  });
});
