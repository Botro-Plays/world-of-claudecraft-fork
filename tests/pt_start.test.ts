// PT starting-town routing (src/sim/pt_start.ts): a newly created Tempskron
// character enters the world in Ricarten, the Tempskron starting town.
//
// Covers:
// - ptStartPosForClass: Tempskron classes -> the existing PT Ricarten spawn
//   constants from pt_band.ts; every other class (Morion, Atlanteon, WoC)
//   -> null.
// - Offline entry: a fresh Tempskron Sim (compulsoryTutorial, the offline
//   default) spawns at the Ricarten spawn instead of the Proving Shore.
// - Saved-position migration: a character saved inside the PT band keeps
//   that position on re-entry instead of falling through the dungeon
//   threshold to DUNGEON_LIST[0]'s door.
// - Y is resolved from the Ricarten collision field
//   (ptRicartenGroundHeight), never a hardcoded constant.

import { describe, expect, it } from 'vitest';
import { PROVING_SHORE_ARRIVAL } from '../src/sim/content/proving_shore';
import { ptTribeForClass } from '../src/sim/content/pt_tribes';
import { DUNGEON_LIST, DUNGEON_X_THRESHOLD } from '../src/sim/data';
import {
  isPtPos,
  PT_RICARTEN_SPAWN_FACING,
  PT_RICARTEN_SPAWN_X,
  PT_RICARTEN_SPAWN_Z,
} from '../src/sim/pt_band';
import { ptRicartenGroundHeight } from '../src/sim/pt_ricarten_field';
import { ptStartPosForClass } from '../src/sim/pt_start';
import { Sim } from '../src/sim/sim';
import { ALL_CLASSES, type Entity, type PlayerClass } from '../src/sim/types';

const TEMPSKRON_CLASSES: readonly PlayerClass[] = [
  'tempskron_fighter',
  'tempskron_mechanician',
  'tempskron_pikeman',
  'morion_knight',
];

const OTHER_PT_CLASSES: readonly PlayerClass[] = [
  'tempskron_archer',
  'morion_atalanta',
  'morion_priestess',
  'morion_magician',
  'atlanteon_assassin',
  'atlanteon_martial_artist',
  'atlanteon_shaman',
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
    expect(start?.x).toBe(PT_RICARTEN_SPAWN_X);
    expect(start?.z).toBe(PT_RICARTEN_SPAWN_Z);
    expect(start?.facing).toBe(PT_RICARTEN_SPAWN_FACING);
  });

  it.each(OTHER_PT_CLASSES)('returns null for non-Tempskron PT class %s', (cls) => {
    expect(ptStartPosForClass(cls)).toBeNull();
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

  it.each(WOC_CLASSES)('a new WoC %s still starts on the Proving Shore', (cls) => {
    const sim = makeSim(cls);
    const p = player(sim);
    expect(p.pos.x).toBeCloseTo(PROVING_SHORE_ARRIVAL.x, 6);
    expect(p.pos.z).toBeCloseTo(PROVING_SHORE_ARRIVAL.z, 6);
    expect(p.facing).toBeCloseTo(PROVING_SHORE_ARRIVAL.facing, 6);
  });

  it.each(OTHER_PT_CLASSES)(
    'a new non-Tempskron PT %s keeps the Proving Shore flow until its town exists',
    (cls) => {
      const sim = makeSim(cls);
      const p = player(sim);
      expect(p.pos.x).toBeCloseTo(PROVING_SHORE_ARRIVAL.x, 6);
      expect(p.pos.z).toBeCloseTo(PROVING_SHORE_ARRIVAL.z, 6);
    },
  );

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
