// Focused tests for the Morion Magician PT character (Phase A).
// Verifies the Magician visual definition, GLB asset, animation clip mappings,
// class foundation, and hair variants are wired correctly for use as a PLAYER
// character (not a mob).
//
// Source: MagicPT-Chinese
//   JOBCODE_MAGICIAN = 7, Morion male, body md001.ini (MmbD01.smd),
//   heads MmhD01/D02/D03.smd, motion m3.smb / M3Bip.inx (75 motions).
//   Stats: Str 16, Spirit 29, Talent 19, Defence 14, Health 21.
//   LifeFunction=5 (lowest HP tier), ManaFunction=1 (highest mana tier).

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { ALL_CLASSES, type Entity } from '../src/sim/types';
import { CLASSES } from '../src/sim/content/classes';

const GLB_PATH = 'public/models/creatures/pt_magician.glb';
const GLB_HAIR2_PATH = 'public/models/creatures/pt_magician_hair2.glb';
const GLB_HAIR3_PATH = 'public/models/creatures/pt_magician_hair3.glb';

describe('Morion Magician visual definition (player character)', () => {
  it('registers player_morion_magician in VISUALS', () => {
    const def = VISUALS.player_morion_magician;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_magician.glb');
    expect(def.height).toBeGreaterThan(0);
  });

  it('declares the required player animation clip mappings', () => {
    const def = VISUALS.player_morion_magician;
    expect(def.clips.idle).toBe('STAND');
    expect(def.clips.walk).toBe('WALK');
    expect(def.clips.run).toBe('RUN');
    expect(def.clips.attack).toContain('ATTACK');
    expect(def.clips.death).toBe('DEAD');
    expect(def.clips.hit).toContain('DAMAGE');
  });

  it('maps a combatIdle clip to STAND_COMBAT', () => {
    const def = VISUALS.player_morion_magician;
    expect(def.clips.combatIdle).toBe('STAND_COMBAT');
  });

  it('maps jump/fall/land clips', () => {
    const def = VISUALS.player_morion_magician;
    expect(def.clips.jump).toBe('FALLSTAND_REVERSED');
    expect(def.clips.fall).toBe('FALLDOWN');
    expect(def.clips.land).toBe('FALLSTAND');
  });

  it('the GLB asset file exists', () => {
    expect(existsSync(GLB_PATH), `${GLB_PATH} is missing`).toBe(true);
  });

  it('is distinct from the Fighter visual', () => {
    expect(VISUALS.player_morion_magician.url).not.toBe(VISUALS.player_tempskron_fighter.url);
  });

  it('is distinct from the Knight visual', () => {
    expect(VISUALS.player_morion_magician.url).not.toBe(VISUALS.player_morion_knight.url);
  });

  it('is distinct from the Priestess visual', () => {
    expect(VISUALS.player_morion_magician.url).not.toBe(VISUALS.player_morion_priestess.url);
  });
});

describe('Morion Magician is a player class, not a mob or NPC', () => {
  it('is listed in ALL_CLASSES', () => {
    expect(ALL_CLASSES).toContain('morion_magician');
  });

  it('has a CLASSES entry with the authentic Magician identity', () => {
    expect(CLASSES.morion_magician).toBeDefined();
    expect(CLASSES.morion_magician.id).toBe('morion_magician');
    expect(CLASSES.morion_magician.name).toBe('Morion Magician');
  });

  it('visualKeyFor resolves a player entity to player_morion_magician', () => {
    const e = {
      kind: 'player',
      templateId: 'morion_magician',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_morion_magician');
  });

  it('visualKeyFor does not resolve a mob to the Magician visual', () => {
    const e = {
      kind: 'mob',
      templateId: 'morion_magician',
    } as unknown as Entity;
    expect(visualKeyFor(e)).not.toBe('player_morion_magician');
  });
});

describe('Morion Magician class foundation (Phase A)', () => {
  const def = CLASSES.morion_magician;

  it('uses mana, not rage', () => {
    expect(def.resourceType).toBe('mana');
    expect(def.resourceType).not.toBe('rage');
  });

  it('has authentic PT starting stats mapped to WoC attributes', () => {
    // PT Strength (16) -> WoC str
    expect(def.baseStats.str).toBe(16);
    // PT Spirit (29) -> WoC int (mana pool driver, highest in game)
    expect(def.baseStats.int).toBe(29);
    // PT Spirit (29) -> WoC spi (mana regen)
    expect(def.baseStats.spi).toBe(29);
    // PT Talent (19) -> WoC agi
    expect(def.baseStats.agi).toBe(19);
    // PT Defence (14) -> WoC armor (lowest Morion)
    expect(def.baseStats.armor).toBe(14);
    // PT Health (21) -> WoC sta
    expect(def.baseStats.sta).toBe(21);
  });

  it('is distinct from the Fighter starting stats', () => {
    const fighter = CLASSES.tempskron_fighter;
    expect(def.baseStats).not.toEqual(fighter.baseStats);
  });

  it('is distinct from the Priestess starting stats', () => {
    const priestess = CLASSES.morion_priestess;
    expect(def.baseStats).not.toEqual(priestess.baseStats);
  });

  it('has a mana pool (baseMana > 0 and manaPerLevel > 0)', () => {
    expect(def.baseMana).toBeGreaterThan(0);
    expect(def.manaPerLevel).toBeGreaterThan(0);
  });

  it('does not use the Warrior rage cap', () => {
    expect(def.manaPerLevel).toBeGreaterThan(0);
  });

  it('carries water rations (mana class starter items)', () => {
    expect(def.startItems.length).toBe(2);
  });
});

describe('Morion Magician GLB animation clips', () => {
  it('contains STAND, WALK, RUN, ATTACK, DEAD, and DAMAGE animations', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const animNames = new Set<string>();
    for (const anim of root.listAnimations()) {
      animNames.add(anim.getName());
    }
    expect(animNames.has('STAND'), 'STAND animation missing').toBe(true);
    expect(animNames.has('WALK'), 'WALK animation missing').toBe(true);
    expect(animNames.has('RUN'), 'RUN animation missing').toBe(true);
    expect(animNames.has('ATTACK'), 'ATTACK animation missing').toBe(true);
    expect(animNames.has('DEAD'), 'DEAD animation missing').toBe(true);
    expect(animNames.has('DAMAGE'), 'DAMAGE animation missing').toBe(true);
  });

  it('contains STAND_COMBAT and FALLSTAND_REVERSED clips', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const animNames = new Set<string>();
    for (const anim of root.listAnimations()) {
      animNames.add(anim.getName());
    }
    expect(animNames.has('STAND_COMBAT'), 'STAND_COMBAT animation missing').toBe(true);
    expect(animNames.has('FALLSTAND_REVERSED'), 'FALLSTAND_REVERSED animation missing').toBe(true);
    expect(animNames.has('FALLDOWN'), 'FALLDOWN animation missing').toBe(true);
    expect(animNames.has('FALLSTAND'), 'FALLSTAND animation missing').toBe(true);
  });

  it('has a skinned mesh with joints', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const skins = root.listSkins();
    expect(skins.length).toBeGreaterThan(0);
    expect(skins[0].listJoints().length).toBeGreaterThan(10);
  });

  it('uses the PT Bip01 skeleton (not KayKit mixamorig)', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const skins = root.listSkins();
    const joints = skins[0].listJoints().map((j) => j.getName());
    expect(joints.some((n) => n.startsWith('Bip01'))).toBe(true);
    expect(joints.some((n) => n.startsWith('mixamorig'))).toBe(false);
  });
});

describe('Morion Magician hair variants', () => {
  it('registers player_morion_magician_hair2 in VISUALS', () => {
    const def = VISUALS.player_morion_magician_hair2;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_magician_hair2.glb');
  });

  it('registers player_morion_magician_hair3 in VISUALS', () => {
    const def = VISUALS.player_morion_magician_hair3;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_magician_hair3.glb');
  });

  it('hair2 GLB file exists', () => {
    expect(existsSync(GLB_HAIR2_PATH), `${GLB_HAIR2_PATH} is missing`).toBe(true);
  });

  it('hair3 GLB file exists', () => {
    expect(existsSync(GLB_HAIR3_PATH), `${GLB_HAIR3_PATH} is missing`).toBe(true);
  });

  it('hair variants have the same clips as the default', () => {
    const def = VISUALS.player_morion_magician;
    const hair2 = VISUALS.player_morion_magician_hair2;
    const hair3 = VISUALS.player_morion_magician_hair3;
    expect(hair2.clips.idle).toBe(def.clips.idle);
    expect(hair2.clips.walk).toBe(def.clips.walk);
    expect(hair2.clips.run).toBe(def.clips.run);
    expect(hair3.clips.idle).toBe(def.clips.idle);
    expect(hair3.clips.walk).toBe(def.clips.walk);
    expect(hair3.clips.run).toBe(def.clips.run);
  });

  it('all variants share the same rawHeight for consistent body scale', () => {
    const def = VISUALS.player_morion_magician;
    const hair2 = VISUALS.player_morion_magician_hair2;
    const hair3 = VISUALS.player_morion_magician_hair3;
    expect(def.rawHeight).toBeDefined();
    expect(hair2.rawHeight).toBeDefined();
    expect(hair3.rawHeight).toBeDefined();
    expect(def.rawHeight).toBe(hair2.rawHeight);
    expect(def.rawHeight).toBe(hair3.rawHeight);
  });

  it('visualKeyFor resolves hair override to the correct variant', () => {
    const e = {
      kind: 'player',
      templateId: 'morion_magician',
      visualKeyOverride: 'player_morion_magician_hair2',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_morion_magician_hair2');
  });
});
