// PT starting-town routing (src/sim/pt_start.ts): a newly created PT
// character enters the world in its tribe's starting town.
//
// Covers:
// - ptStartPosForClass: Tempskron classes -> Ricarten, Morion classes ->
//   Pillai ("pilai", field 21), Atlanteon classes -> Atlantis Town
//   ("town1", field 51); WoC classes -> null.
// - Offline entry: a fresh PT Sim (compulsoryTutorial, the offline default)
//   spawns at its town's source-authentic start point instead of the
//   Proving Shore.
// - Saved-position migration: a character saved inside the PT band keeps
//   that position on re-entry instead of falling through the dungeon
//   threshold to DUNGEON_LIST[0]'s door.
// - Y is resolved from the owning town's collision field, never hardcoded.
//   Tests register the generated pilai/town1 field modules as static
//   fallback fields (the same mechanism the headless realm uses) so the
//   descriptor-less sim resolves the right town's ground.
// - Arrival facing follows the source SetPosi(x,0,z,0,0,0) convention:
//   Angle.y = 0, which is +Z = north under both games' conventions.

import { afterEach, describe, expect, it } from 'vitest';
import * as PILAI_FIELD from '../generated/pt-maps/pilai/field.generated';
import * as TOWN1_FIELD from '../generated/pt-maps/town1/field.generated';
import { bindPtStartField } from '../src/game/pt_start_field';
import { PROVING_SHORE_ARRIVAL } from '../src/sim/content/proving_shore';
import { ptTribeForClass } from '../src/sim/content/pt_tribes';
import { DUNGEON_LIST, DUNGEON_X_THRESHOLD } from '../src/sim/data';
import {
  isPtPos,
  PT_PILAI_SPAWN_FACING,
  PT_PILAI_SPAWN_X,
  PT_PILAI_SPAWN_Z,
  PT_RICARTEN_SPAWN_FACING,
  PT_RICARTEN_SPAWN_X,
  PT_RICARTEN_SPAWN_Z,
  PT_TOWN1_SPAWN_FACING,
  PT_TOWN1_SPAWN_X,
  PT_TOWN1_SPAWN_Z,
} from '../src/sim/pt_band';
import { createPtField, makePtContinentTransform } from '../src/sim/pt_field';
import {
  activePtMapDescriptor,
  registerPtStaticField,
  setActivePtMap,
} from '../src/sim/pt_field_active';
import { ptRicartenGroundHeight } from '../src/sim/pt_ricarten_field';
import { ptStartPosForClass } from '../src/sim/pt_start';
import { Sim } from '../src/sim/sim';
import { ALL_CLASSES, type Entity, type PlayerClass } from '../src/sim/types';

// Register the two new towns as static fallback fields so this suite's bare
// Sims resolve their ground the way the realm sim (server/pt_start_fields)
// and the descriptor-bound client do.
registerPtStaticField(PILAI_FIELD);
registerPtStaticField(TOWN1_FIELD);
const PILAI_GROUND = createPtField(PILAI_FIELD, makePtContinentTransform());
const TOWN1_GROUND = createPtField(TOWN1_FIELD, makePtContinentTransform());

const TEMPSKRON_CLASSES: readonly PlayerClass[] = [
  'tempskron_fighter',
  'tempskron_mechanician',
  'tempskron_pikeman',
  'morion_knight',
];

const MORION_CLASSES: readonly PlayerClass[] = [
  'morion_magician',
  'atlanteon_shaman',
  'morion_priestess',
  'morion_monk',
];

const ATLANTEON_CLASSES: readonly PlayerClass[] = [
  'atlanteon_martial_artist',
  'morion_atalanta',
  'tempskron_archer',
  'atlanteon_assassin',
];

const WOC_CLASSES: readonly PlayerClass[] = ALL_CLASSES.filter(
  (cls) => ptTribeForClass(cls) === null,
);

function makeSim(playerClass: PlayerClass, seed = 4120): Sim {
  // The offline client's live-world shape (offlineWorldConfig): the default
  // world plus the compulsory-tutorial flag that drives fresh-character
  // placement.
  return new Sim({ seed, playerClass, autoEquip: true, compulsoryTutorial: true });
}

function player(sim: Sim, id = sim.playerId): Entity {
  const entity = sim.entities.get(id);
  if (!entity) throw new Error(`missing entity ${id}`);
  return entity;
}

describe('ptStartPosForClass', () => {
  it.each(TEMPSKRON_CLASSES)('routes Tempskron class %s to the Ricarten spawn', (cls) => {
    const start = ptStartPosForClass(cls);
    expect(start).not.toBeNull();
    expect(start?.fieldId).toBe('ricarten');
    expect(start?.x).toBe(PT_RICARTEN_SPAWN_X);
    expect(start?.z).toBe(PT_RICARTEN_SPAWN_Z);
    expect(start?.facing).toBe(PT_RICARTEN_SPAWN_FACING);
  });

  it.each(MORION_CLASSES)('routes Morion class %s to the Pillai spawn', (cls) => {
    const start = ptStartPosForClass(cls);
    expect(start).not.toBeNull();
    expect(start?.fieldId).toBe('pilai');
    expect(start?.x).toBe(PT_PILAI_SPAWN_X);
    expect(start?.z).toBe(PT_PILAI_SPAWN_Z);
    expect(start?.facing).toBe(PT_PILAI_SPAWN_FACING);
  });

  it.each(ATLANTEON_CLASSES)('routes Atlanteon class %s to the Atlantis Town spawn', (cls) => {
    const start = ptStartPosForClass(cls);
    expect(start).not.toBeNull();
    expect(start?.fieldId).toBe('town1');
    expect(start?.x).toBe(PT_TOWN1_SPAWN_X);
    expect(start?.z).toBe(PT_TOWN1_SPAWN_Z);
    expect(start?.facing).toBe(PT_TOWN1_SPAWN_FACING);
  });

  it.each(WOC_CLASSES)('returns null for WoC class %s', (cls) => {
    expect(ptStartPosForClass(cls)).toBeNull();
  });
});

describe('fresh-character entry (the offline path)', () => {
  it.each(TEMPSKRON_CLASSES)('a new %s enters the world in Ricarten', (cls) => {
    const sim = makeSim(cls);
    const p = player(sim);
    expect(p.pos.x).toBeCloseTo(PT_RICARTEN_SPAWN_X, 6);
    expect(p.pos.z).toBeCloseTo(PT_RICARTEN_SPAWN_Z, 6);
    expect(isPtPos(p.pos.x)).toBe(true);
    expect(p.facing).toBeCloseTo(PT_RICARTEN_SPAWN_FACING, 6);
  });

  it('enters Ricarten facing north', () => {
    // Facing convention: radians, 0 = +Z (types.ts). WoC compass: north = +Z
    // (compass.ts; the minimap draws +Z as map-up). The spawn constant and
    // the applied player facing must both be north.
    expect(PT_RICARTEN_SPAWN_FACING).toBe(0);
    const sim = makeSim('tempskron_fighter');
    expect(player(sim).facing).toBe(0);
  });

  it('resolves spawn Y from the Ricarten collision field, not a constant', () => {
    const sim = makeSim('tempskron_fighter');
    const p = player(sim);
    const ground = ptRicartenGroundHeight(PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z);
    expect(Number.isFinite(ground)).toBe(true);
    expect(p.pos.y).toBeCloseTo(ground, 6);
  });

  it('never ferries a Ricarten-spawned character to the Proving Shore', () => {
    const sim = makeSim('tempskron_fighter');
    const p = player(sim);
    // The greeting sweep's instance guard (pos.x > DUNGEON_X_THRESHOLD) already
    // covers the PT band; drive real ticks to prove no ferry displaces the
    // character after entry.
    for (let t = 0; t < 42; t++) sim.tick();
    expect(isPtPos(p.pos.x)).toBe(true);
  });

  it.each(MORION_CLASSES)('a new %s enters the world in Pillai', (cls) => {
    const sim = makeSim(cls);
    const p = player(sim);
    expect(p.pos.x).toBeCloseTo(PT_PILAI_SPAWN_X, 6);
    expect(p.pos.z).toBeCloseTo(PT_PILAI_SPAWN_Z, 6);
    expect(isPtPos(p.pos.x)).toBe(true);
    expect(p.facing).toBeCloseTo(PT_PILAI_SPAWN_FACING, 6);
  });

  it.each(ATLANTEON_CLASSES)('a new %s enters the world in Atlantis Town', (cls) => {
    const sim = makeSim(cls);
    const p = player(sim);
    expect(p.pos.x).toBeCloseTo(PT_TOWN1_SPAWN_X, 6);
    expect(p.pos.z).toBeCloseTo(PT_TOWN1_SPAWN_Z, 6);
    expect(isPtPos(p.pos.x)).toBe(true);
    expect(p.facing).toBeCloseTo(PT_TOWN1_SPAWN_FACING, 6);
  });

  it('resolves the Pillai spawn Y from the pilai collision field', () => {
    const sim = makeSim('morion_magician');
    const p = player(sim);
    const ground = PILAI_GROUND.groundHeight(PT_PILAI_SPAWN_X, PT_PILAI_SPAWN_Z);
    expect(Number.isFinite(ground)).toBe(true);
    expect(p.pos.y).toBeCloseTo(ground, 6);
  });

  it('resolves the Atlantis spawn Y from the town1 collision field', () => {
    const sim = makeSim('atlanteon_martial_artist');
    const p = player(sim);
    const ground = TOWN1_GROUND.groundHeight(PT_TOWN1_SPAWN_X, PT_TOWN1_SPAWN_Z);
    expect(Number.isFinite(ground)).toBe(true);
    expect(p.pos.y).toBeCloseTo(ground, 6);
  });

  it.each(WOC_CLASSES)('a new WoC %s still starts on the Proving Shore', (cls) => {
    const sim = makeSim(cls);
    const p = player(sim);
    expect(p.pos.x).toBeCloseTo(PROVING_SHORE_ARRIVAL.x, 6);
    expect(p.pos.z).toBeCloseTo(PROVING_SHORE_ARRIVAL.z, 6);
    expect(p.facing).toBeCloseTo(PROVING_SHORE_ARRIVAL.facing, 6);
  });

  it('a custom editor world never redirects a Tempskron to Ricarten', () => {
    // Editor play-test maps carry their own world definition and opt out of
    // compulsoryTutorial; a Tempskron must land at that map's own start.
    const sim = new Sim({
      seed: 4120,
      playerClass: 'tempskron_fighter',
      autoEquip: true,
      compulsoryTutorial: false,
    });
    const p = player(sim);
    expect(isPtPos(p.pos.x)).toBe(false);
  });
});

describe('saved-position migration (the online re-entry path)', () => {
  it('preserves a Ricarten saved position instead of ejecting to a dungeon door', () => {
    // PT band X is beyond DUNGEON_X_THRESHOLD: before the explicit isPtPos
    // arm this save fell through to `dungeonAt(x) ?? DUNGEON_LIST[0]` and
    // respawned the character at a WoC dungeon entrance.
    expect(PT_RICARTEN_SPAWN_X).toBeGreaterThan(DUNGEON_X_THRESHOLD);

    const first = makeSim('tempskron_fighter');
    const saved = first.serializeCharacter(first.playerId);
    expect(saved).toBeTruthy();
    expect(saved?.pos.x).toBeCloseTo(PT_RICARTEN_SPAWN_X, 6);
    expect(saved?.pos.z).toBeCloseTo(PT_RICARTEN_SPAWN_Z, 6);

    const second = makeSim('warrior', 4121);
    const pid = second.addPlayer('tempskron_fighter', 'Returner', {
      state: saved ?? undefined,
    });
    const p = player(second, pid);
    expect(p.pos.x).toBeCloseTo(PT_RICARTEN_SPAWN_X, 6);
    expect(p.pos.z).toBeCloseTo(PT_RICARTEN_SPAWN_Z, 6);
    expect(isPtPos(p.pos.x)).toBe(true);
    // Re-entry Y is re-resolved through groundPos -> the Ricarten field.
    const ground = ptRicartenGroundHeight(PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z);
    expect(p.pos.y).toBeCloseTo(ground, 6);
  });

  it('preserves a Pillai saved position and re-resolves Y through the pilai field', () => {
    const first = makeSim('morion_priestess');
    const saved = first.serializeCharacter(first.playerId);
    expect(saved).toBeTruthy();
    expect(saved?.pos.x).toBeCloseTo(PT_PILAI_SPAWN_X, 6);
    expect(saved?.pos.z).toBeCloseTo(PT_PILAI_SPAWN_Z, 6);

    const second = makeSim('warrior', 4121);
    const pid = second.addPlayer('morion_priestess', 'Returner', {
      state: saved ?? undefined,
    });
    const p = player(second, pid);
    expect(p.pos.x).toBeCloseTo(PT_PILAI_SPAWN_X, 6);
    expect(p.pos.z).toBeCloseTo(PT_PILAI_SPAWN_Z, 6);
    expect(isPtPos(p.pos.x)).toBe(true);
    // The static-field dispatch (registered above) routes the re-entry
    // groundPos to the pilai field, not the Ricarten fallback.
    const ground = PILAI_GROUND.groundHeight(PT_PILAI_SPAWN_X, PT_PILAI_SPAWN_Z);
    expect(p.pos.y).toBeCloseTo(ground, 6);
  });

  it('preserves an Atlantis saved position and re-resolves Y through the town1 field', () => {
    const first = makeSim('atlanteon_assassin');
    const saved = first.serializeCharacter(first.playerId);
    expect(saved).toBeTruthy();
    expect(saved?.pos.x).toBeCloseTo(PT_TOWN1_SPAWN_X, 6);
    expect(saved?.pos.z).toBeCloseTo(PT_TOWN1_SPAWN_Z, 6);

    const second = makeSim('warrior', 4121);
    const pid = second.addPlayer('atlanteon_assassin', 'Returner', {
      state: saved ?? undefined,
    });
    const p = player(second, pid);
    expect(p.pos.x).toBeCloseTo(PT_TOWN1_SPAWN_X, 6);
    expect(p.pos.z).toBeCloseTo(PT_TOWN1_SPAWN_Z, 6);
    expect(isPtPos(p.pos.x)).toBe(true);
    const ground = TOWN1_GROUND.groundHeight(PT_TOWN1_SPAWN_X, PT_TOWN1_SPAWN_Z);
    expect(p.pos.y).toBeCloseTo(ground, 6);
  });

  it('still ejects a non-PT position past the dungeon threshold to a dungeon door', () => {
    // The dungeon arm must keep working for genuine dungeon saves; the PT
    // band is the only past-threshold region preserved verbatim.
    const first = makeSim('warrior');
    const saved = first.serializeCharacter(first.playerId);
    expect(saved).toBeTruthy();
    const door = DUNGEON_LIST[0].doorPos;
    saved!.pos = { x: door.x + 1, z: door.z };
    // A save deep inside a real dungeon instance band (not the PT band)
    // must migrate to that dungeon's door as before.
    const instanceX = DUNGEON_X_THRESHOLD + 1;
    if (isPtPos(instanceX)) throw new Error('test premise: PT band overlaps dungeon band');
    saved!.pos = { x: instanceX, z: 0 };

    const second = makeSim('warrior', 4121);
    const pid = second.addPlayer('warrior', 'Delver', { state: saved ?? undefined });
    const p = player(second, pid);
    const migratedToDoor = DUNGEON_LIST.some(
      (d) => Math.abs(p.pos.x - d.doorPos.x) < 1 && Math.abs(p.pos.z - (d.doorPos.z - 4)) < 1,
    );
    expect(migratedToDoor).toBe(true);
    expect(isPtPos(p.pos.x)).toBe(false);
  });
});

describe('bindPtStartField (the entry-flow field install)', () => {
  // Installs mutate the module-level PT binding; clear after each case so
  // the descriptor-less dispatch above keeps its registered fields.
  afterEach(() => setActivePtMap(null));

  it('installs the Pillai field for a Morion class', async () => {
    await bindPtStartField('morion_magician', true);
    expect(activePtMapDescriptor()?.id).toBe('pilai');
  });

  it('installs the Atlantis Town field for an Atlanteon class', async () => {
    await bindPtStartField('atlanteon_assassin', true);
    expect(activePtMapDescriptor()?.id).toBe('town1');
  });

  it('restores the default binding for a Tempskron class', async () => {
    await bindPtStartField('morion_magician', true);
    await bindPtStartField('tempskron_fighter', true);
    // Bare test host: no render-layer default descriptor is registered, so
    // restoring the default leaves the descriptor-less fallback in charge.
    expect(activePtMapDescriptor()).toBeNull();
  });

  it('leaves the binding untouched for WoC classes and custom worlds', async () => {
    await bindPtStartField('warrior', true);
    expect(activePtMapDescriptor()).toBeNull();
    await bindPtStartField('morion_magician', true);
    await bindPtStartField('tempskron_fighter', false); // editor world: no rebind
    expect(activePtMapDescriptor()?.id).toBe('pilai');
  });
});
