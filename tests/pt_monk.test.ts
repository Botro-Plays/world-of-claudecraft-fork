// Focused tests for the Morion Monk PT character (Phase A, fork-added class).
// Verifies the Monk visual definition, GLB asset, animation clip mappings,
// class foundation, and single-variant (bald) presentation are wired
// correctly for use as a PLAYER character (not a mob).
//
// The Monk is NOT an original MagicPT class — the source job list ends at
// JOBCODE_MARTIALARTIST = 11, so there is no authentic Monk mesh/skeleton/
// motion file. The GLB is a static Tripo source mesh rigid-skinned onto the
// Shaman's m7 Bip01 skeleton and clip set by scripts/pt-port/monk_assembler.ts.
// Stats/resource copy the Shaman baseline (Morion male magic class;
// MorNewCharacterInit Str 15 / Spi 27 / Talent 20 / Def 15 / Health 22).

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { ALL_CLASSES, type Entity } from '../src/sim/types';
import { CLASSES } from '../src/sim/content/classes';
import { PT_TRIBES, ptTribeForClass, PT_CLASS_DISPLAY_NAMES } from '../src/sim/content/pt_tribes';
import { ptStartPosForClass } from '../src/sim/pt_start';

const GLB_PATH = 'public/models/creatures/pt_monk.glb';
const SRC_GLB_PATH = 'scripts/pt-port/pt_monk_source.glb';

describe('Morion Monk visual definition (player character)', () => {
  it('registers player_morion_monk in VISUALS', () => {
    const def = VISUALS.player_morion_monk;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_monk.glb');
    expect(def.height).toBeGreaterThan(0);
  });

  it('declares the required player animation clip mappings', () => {
    const def = VISUALS.player_morion_monk;
    expect(def.clips.idle).toBe('STAND');
    expect(def.clips.walk).toBe('WALK');
    expect(def.clips.run).toBe('RUN');
    expect(def.clips.attack).toContain('ATTACK');
    expect(def.clips.death).toBe('DEAD');
    expect(def.clips.hit).toContain('DAMAGE');
  });

  it('maps a combatIdle clip to STAND_COMBAT', () => {
    expect(VISUALS.player_morion_monk.clips.combatIdle).toBe('STAND_COMBAT');
  });

  it('maps jump/fall/land clips', () => {
    const def = VISUALS.player_morion_monk;
    expect(def.clips.jump).toBe('FALLSTAND_REVERSED');
    expect(def.clips.fall).toBe('FALLDOWN');
    expect(def.clips.land).toBe('FALLSTAND');
  });

  it('pins rawHeight for stable body scale', () => {
    expect(VISUALS.player_morion_monk.rawHeight).toBeDefined();
    expect(VISUALS.player_morion_monk.rawHeight).toBeGreaterThan(0);
  });

  it('the GLB asset file exists', () => {
    expect(existsSync(GLB_PATH), `${GLB_PATH} is missing`).toBe(true);
  });

  it('the recoverable Tripo source GLB exists', () => {
    expect(existsSync(SRC_GLB_PATH), `${SRC_GLB_PATH} is missing`).toBe(true);
  });

  it('is distinct from every other PT player visual', () => {
    const url = VISUALS.player_morion_monk.url;
    for (const key of [
      'player_tempskron_fighter',
      'player_tempskron_mechanician',
      'player_tempskron_pikeman',
      'player_tempskron_archer',
      'player_morion_knight',
      'player_morion_atalanta',
      'player_morion_priestess',
      'player_morion_magician',
      'player_atlanteon_assassin',
      'player_atlanteon_martial_artist',
      'player_atlanteon_shaman',
    ]) {
      expect(url, `monk shares a GLB with ${key}`).not.toBe(VISUALS[key].url);
    }
  });

  it('ships a single bald variant: no hair2/hair3 visuals registered', () => {
    expect(VISUALS.player_morion_monk_hair2).toBeUndefined();
    expect(VISUALS.player_morion_monk_hair3).toBeUndefined();
  });
});

describe('Morion Monk is a player class, not a mob or NPC', () => {
  it('is listed in ALL_CLASSES', () => {
    expect(ALL_CLASSES).toContain('morion_monk');
  });

  it('has a CLASSES entry with the Monk identity', () => {
    expect(CLASSES.morion_monk).toBeDefined();
    expect(CLASSES.morion_monk.id).toBe('morion_monk');
    expect(CLASSES.morion_monk.name).toBe('Morion Monk');
  });

  it('visualKeyFor resolves a player entity to player_morion_monk', () => {
    const e = {
      kind: 'player',
      templateId: 'morion_monk',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_morion_monk');
  });

  it('visualKeyFor does not resolve a mob to the Monk visual', () => {
    const e = {
      kind: 'mob',
      templateId: 'morion_monk',
    } as unknown as Entity;
    expect(visualKeyFor(e)).not.toBe('player_morion_monk');
  });

  it('is registered in the Morion tribe roster as an implemented class', () => {
    const morion = PT_TRIBES.find((t) => t.id === 'morion');
    expect(morion?.classIds).toContain('morion_monk');
    expect(morion?.implementedClassIds).toContain('morion_monk');
    expect(ptTribeForClass('morion_monk')?.id).toBe('morion');
  });

  it('has a tribe-roster display name', () => {
    expect(PT_CLASS_DISPLAY_NAMES.morion_monk).toBe('Monk');
  });

  it('spawns in the Morion starting town (Pillai)', () => {
    expect(ptStartPosForClass('morion_monk')?.fieldId).toBe('pilai');
  });
});

describe('Morion Monk class foundation (Shaman magic baseline)', () => {
  const def = CLASSES.morion_monk;

  it('uses mana, not rage', () => {
    expect(def.resourceType).toBe('mana');
  });

  it('copies the Shaman baseline stats (Morion magic-type)', () => {
    // Shaman baseline: PT Str 15 / Spi 27 / Talent 20 / Def 15 / Health 22.
    expect(def.baseStats).toEqual(CLASSES.atlanteon_shaman.baseStats);
    expect(def.baseStats).toEqual({ str: 15, agi: 20, sta: 22, int: 27, spi: 27, armor: 15 });
  });

  it('has a mana pool (baseMana > 0 and manaPerLevel > 0)', () => {
    expect(def.baseMana).toBeGreaterThan(0);
    expect(def.manaPerLevel).toBeGreaterThan(0);
  });

  it('carries water rations (mana class starter items)', () => {
    expect(def.startItems.length).toBe(2);
  });
});

describe('Morion Monk GLB (m7 rig graft)', () => {
  it('contains the full m7 clip set', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const animNames = new Set(doc.getRoot().listAnimations().map((a) => a.getName()));
    for (const clip of [
      'STAND', 'STAND_COMBAT', 'WALK', 'RUN', 'ATTACK', 'DAMAGE', 'DEAD',
      'FALLDOWN', 'FALLSTAND', 'FALLSTAND_REVERSED',
      'SKILL', 'EAT', 'YAHOO', 'RESTART', 'FALLDAMAGE',
    ]) {
      expect(animNames.has(clip), `${clip} animation missing`).toBe(true);
    }
  });

  it('has a skinned mesh with rigid PT weights', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const skins = root.listSkins();
    expect(skins.length).toBe(1);
    const joints = skins[0].listJoints();
    expect(joints.length).toBe(50);
    const prim = root.listMeshes()[0].listPrimitives()[0];
    const jn = prim.getAttribute('JOINTS_0');
    const wt = prim.getAttribute('WEIGHTS_0');
    expect(jn).not.toBeNull();
    expect(wt).not.toBeNull();
    // PT rigid skinning: every vertex weight 1.0 to a single bone.
    const w = wt!.getArray()!;
    for (let i = 0; i < Math.min(w.length / 4, 200); i++) {
      expect(w[i * 4]).toBe(1);
      expect(w[i * 4 + 1]).toBe(0);
    }
  });

  it('uses the PT Bip01 skeleton (not KayKit mixamorig)', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const joints = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName());
    expect(joints.some((n) => n.startsWith('Bip01'))).toBe(true);
    expect(joints.some((n) => n.startsWith('mixamorig'))).toBe(false);
  });

  it('carries the Tripo monk texture', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    expect(prim.getMaterial()?.getBaseColorTexture()).not.toBeNull();
  });
});
