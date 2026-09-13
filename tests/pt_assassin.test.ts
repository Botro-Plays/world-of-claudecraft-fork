// Focused tests for the Atlanteon Assassin PT character (Phase A).
// Verifies the Assassin visual definition, GLB asset, animation clip mappings,
// class foundation, and hair variants are wired correctly for use as a PLAYER
// character (not a mob).
//
// Source: MagicPT-Chinese
//   JOBCODE_ASSASSIN = 9, Tempskron female (reassigned to Atlanteon in Botro),
//   body e001.ini (TfbE01.smd), heads TfhE01/E02/E03.smd,
//   motion m6.smb / M6Bip.inx (88 motions).
//   Stats: Str 25, Spirit 10, Talent 22, Defence 20, Health 22.
//   LifeFunction=3 (medium HP tier), ManaFunction=3 (lowest mana tier).

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { ALL_CLASSES, type Entity } from '../src/sim/types';
import { CLASSES } from '../src/sim/content/classes';

const GLB_PATH = 'public/models/creatures/pt_assassin.glb';
const GLB_HAIR2_PATH = 'public/models/creatures/pt_assassin_hair2.glb';
const GLB_HAIR3_PATH = 'public/models/creatures/pt_assassin_hair3.glb';

describe('Atlanteon Assassin visual definition (player character)', () => {
  it('registers player_atlanteon_assassin in VISUALS', () => {
    const def = VISUALS.player_atlanteon_assassin;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_assassin.glb');
    expect(def.height).toBeGreaterThan(0);
  });

  it('declares the required player animation clip mappings', () => {
    const def = VISUALS.player_atlanteon_assassin;
    expect(def.clips.idle).toBe('STAND');
    expect(def.clips.walk).toBe('WALK');
    expect(def.clips.run).toBe('RUN');
    expect(def.clips.attack).toContain('ATTACK');
    expect(def.clips.death).toBe('DEAD');
    expect(def.clips.hit).toContain('DAMAGE');
  });

  it('maps a combatIdle clip to STAND_COMBAT', () => {
    const def = VISUALS.player_atlanteon_assassin;
    expect(def.clips.combatIdle).toBe('STAND_COMBAT');
  });

  it('maps jump/fall/land clips', () => {
    const def = VISUALS.player_atlanteon_assassin;
    expect(def.clips.jump).toBe('FALLSTAND_REVERSED');
    expect(def.clips.fall).toBe('FALLDOWN');
    expect(def.clips.land).toBe('FALLSTAND');
  });

  it('the GLB asset file exists', () => {
    expect(existsSync(GLB_PATH), `${GLB_PATH} is missing`).toBe(true);
  });

  it('is distinct from the Fighter visual', () => {
    expect(VISUALS.player_atlanteon_assassin.url).not.toBe(VISUALS.player_tempskron_fighter.url);
  });

  it('is distinct from the Archer visual', () => {
    expect(VISUALS.player_atlanteon_assassin.url).not.toBe(VISUALS.player_tempskron_archer.url);
  });

  it('is distinct from the Atalanta visual', () => {
    expect(VISUALS.player_atlanteon_assassin.url).not.toBe(VISUALS.player_morion_atalanta.url);
  });
});

describe('Atlanteon Assassin is a player class, not a mob or NPC', () => {
  it('is listed in ALL_CLASSES', () => {
    expect(ALL_CLASSES).toContain('atlanteon_assassin');
  });

  it('has a CLASSES entry with the authentic Assassin identity', () => {
    expect(CLASSES.atlanteon_assassin).toBeDefined();
    expect(CLASSES.atlanteon_assassin.id).toBe('atlanteon_assassin');
    expect(CLASSES.atlanteon_assassin.name).toBe('Atlanteon Assassin');
  });

  it('visualKeyFor resolves a player entity to player_atlanteon_assassin', () => {
    const e = {
      kind: 'player',
      templateId: 'atlanteon_assassin',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_atlanteon_assassin');
  });

  it('visualKeyFor does not resolve a mob to the Assassin visual', () => {
    const e = {
      kind: 'mob',
      templateId: 'atlanteon_assassin',
    } as unknown as Entity;
    expect(visualKeyFor(e)).not.toBe('player_atlanteon_assassin');
  });
});

describe('Atlanteon Assassin class foundation (Phase A)', () => {
  const def = CLASSES.atlanteon_assassin;

  it('uses mana, not rage', () => {
    expect(def.resourceType).toBe('mana');
    expect(def.resourceType).not.toBe('rage');
  });

  it('has authentic PT starting stats mapped to WoC attributes', () => {
    // PT Strength (25) -> WoC str (high)
    expect(def.baseStats.str).toBe(25);
    // PT Spirit (10) -> WoC int (low)
    expect(def.baseStats.int).toBe(10);
    // PT Spirit (10) -> WoC spi (low)
    expect(def.baseStats.spi).toBe(10);
    // PT Talent (22) -> WoC agi (highest Tempskron)
    expect(def.baseStats.agi).toBe(22);
    // PT Defence (20) -> WoC armor
    expect(def.baseStats.armor).toBe(20);
    // PT Health (22) -> WoC sta
    expect(def.baseStats.sta).toBe(22);
  });

  it('is distinct from the Fighter starting stats', () => {
    const fighter = CLASSES.tempskron_fighter;
    expect(def.baseStats).not.toEqual(fighter.baseStats);
  });

  it('is distinct from the Archer starting stats', () => {
    const archer = CLASSES.tempskron_archer;
    expect(def.baseStats).not.toEqual(archer.baseStats);
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

describe('Atlanteon Assassin GLB animation clips', () => {
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

describe('Atlanteon Assassin hair variants', () => {
  it('registers player_atlanteon_assassin_hair2 in VISUALS', () => {
    const def = VISUALS.player_atlanteon_assassin_hair2;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_assassin_hair2.glb');
  });

  it('registers player_atlanteon_assassin_hair3 in VISUALS', () => {
    const def = VISUALS.player_atlanteon_assassin_hair3;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_assassin_hair3.glb');
  });

  it('hair2 GLB file exists', () => {
    expect(existsSync(GLB_HAIR2_PATH), `${GLB_HAIR2_PATH} is missing`).toBe(true);
  });

  it('hair3 GLB file exists', () => {
    expect(existsSync(GLB_HAIR3_PATH), `${GLB_HAIR3_PATH} is missing`).toBe(true);
  });

  it('hair variants have the same clips as the default', () => {
    const def = VISUALS.player_atlanteon_assassin;
    const hair2 = VISUALS.player_atlanteon_assassin_hair2;
    const hair3 = VISUALS.player_atlanteon_assassin_hair3;
    expect(hair2.clips.idle).toBe(def.clips.idle);
    expect(hair2.clips.walk).toBe(def.clips.walk);
    expect(hair2.clips.run).toBe(def.clips.run);
    expect(hair3.clips.idle).toBe(def.clips.idle);
    expect(hair3.clips.walk).toBe(def.clips.walk);
    expect(hair3.clips.run).toBe(def.clips.run);
  });

  it('all variants share the same rawHeight for consistent body scale', () => {
    const def = VISUALS.player_atlanteon_assassin;
    const hair2 = VISUALS.player_atlanteon_assassin_hair2;
    const hair3 = VISUALS.player_atlanteon_assassin_hair3;
    expect(def.rawHeight).toBeDefined();
    expect(hair2.rawHeight).toBeDefined();
    expect(hair3.rawHeight).toBeDefined();
    expect(def.rawHeight).toBe(hair2.rawHeight);
    expect(def.rawHeight).toBe(hair3.rawHeight);
  });

  it('visualKeyFor resolves hair override to the correct variant', () => {
    const e = {
      kind: 'player',
      templateId: 'atlanteon_assassin',
      visualKeyOverride: 'player_atlanteon_assassin_hair2',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_atlanteon_assassin_hair2');
  });
});
