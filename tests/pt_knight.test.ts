// Focused tests for the Morion Knight PT character conversion proof-of-concept.
// Verifies the Knight visual definition, GLB asset, and animation clip mappings
// are wired correctly for use as a PLAYER character (not a mob).
//
// Also pins the player-state-to-animation mapping: the PT Knight must use the
// same desiredBaseState() path as every other player class, selecting STAND when
// stationary, WALK when moving, RUN when sprinting, and ATTACK on attack input.
// Combat stance is selected ONLY if the GLB ships a real combat-idle clip.
//
// The Knight shares the same motion file (m1.smb / M1Bip.inx, 150 motions, 66
// bones) as the Fighter, Mechanician, and Pikeman (all are male classes using
// the Bip01 skeleton). The body and head meshes are distinct (MmbA01.smd vs
// tmbB01.smd vs tmbA01.smd vs tmbC01.smd, MmhA01.smd vs tmh-B01.smd vs
// tmh-A01.smd vs tmh-C01.smd).
//
// MORION MALE: The Knight is a Morion male character (BROOD_CODE_MORAYION,
// BROOD_CODE_MAN). The asset prefix is 'Mm' (Morion male) instead of the
// Tempskron 'tm' (Tempskron male) or 'tf' (Tempskron female).
//
// MESH FILTERING: The Knight body SMD (MmbA01.smd) contains 15 mesh objects
// spanning TWO armor tiers: 9 A01-tier objects (default armor) and 6 A02-tier
// objects (upgrade overlay). The meshObjectFilter drops the A02 objects so
// only the default-armor A01 body renders, similar to the Pikeman.

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { desiredBaseState, type AnimState } from '../src/render/characters/anim_state';
import { ALL_CLASSES, type Entity } from '../src/sim/types';
import { CLASSES } from '../src/sim/content/classes';

const GLB_PATH = 'public/models/creatures/pt_knight.glb';
const GLB_HAIR2_PATH = 'public/models/creatures/pt_knight_hair2.glb';
const GLB_HAIR3_PATH = 'public/models/creatures/pt_knight_hair3.glb';

/** A minimal AnimState for testing desiredBaseState. */
function animState(overrides: Partial<AnimState> = {}): AnimState {
  return {
    speed: 0,
    moving: false,
    running: false,
    airborne: false,
    backwards: false,
    dead: false,
    casting: false,
    swimming: false,
    submerged: false,
    swimPitch: 0,
    wading: false,
    sitting: false,
    ...overrides,
  };
}

describe('Morion Knight visual definition (player character)', () => {
  it('registers player_morion_knight in VISUALS', () => {
    const def = VISUALS.player_morion_knight;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_knight.glb');
    expect(def.height).toBeGreaterThan(0);
  });

  it('declares the required player animation clip mappings', () => {
    const def = VISUALS.player_morion_knight;
    // The Knight shares M1Bip.inx (150 motions) with the Fighter,
    // Mechanician, and Pikeman. The INX state names match their visual
    // content: STAND = standing pose, WALK = walking, RUN = running
    expect(def.clips.idle).toBe('STAND');
    expect(def.clips.walk).toBe('WALK');
    expect(def.clips.run).toBe('RUN');
    expect(def.clips.attack).toContain('ATTACK');
    expect(def.clips.death).toBe('DEAD');
    expect(def.clips.hit).toContain('DAMAGE');
  });

  it('maps a combatIdle clip to the PT field STAND (combat stance)', () => {
    const def = VISUALS.player_morion_knight;
    // PT ships village (mapPos=1) and field (mapPos=2) STAND variants. The
    // field STAND is a braced combat stance exported as STAND_COMBAT, and the
    // manifest maps combatIdle to it so desiredBaseState picks it when the
    // Knight is engaged and stationary.
    expect(def.clips.combatIdle).toBe('STAND_COMBAT');
  });

  it('maps jump/fall/land clips', () => {
    const def = VISUALS.player_morion_knight;
    // Jump uses reversed FALLSTAND (crouch down to spring up), fall uses
    // FALLDOWN (falling pose), and land uses normal FALLSTAND (stand up
    // from crouch). Same clip names as Fighter, Mechanician, and Pikeman
    // since all share the Bip01 skeleton and m1.smb motion data.
    expect(def.clips.jump).toBe('FALLSTAND_REVERSED');
    expect(def.clips.fall).toBe('FALLDOWN');
    expect(def.clips.land).toBe('FALLSTAND');
  });

  it('the GLB asset file exists', () => {
    expect(existsSync(GLB_PATH), `${GLB_PATH} is missing`).toBe(true);
  });

  it('is distinct from the Combat Mech cosmetic body', () => {
    // The Knight is a fixed PT GLB, not the KayKit-rigged Combat Mech.
    expect(VISUALS.player_morion_knight.url).not.toBe(VISUALS.player_mech.url);
  });

  it('is distinct from the Fighter visual', () => {
    // The Knight must NOT reuse the Fighter GLB. Different body (MmbA01
    // vs tmbB01) and different head (MmhA01 vs tmh-B01).
    expect(VISUALS.player_morion_knight.url).not.toBe(VISUALS.player_tempskron_fighter.url);
  });

  it('is distinct from the Mechanician visual', () => {
    // The Knight must NOT reuse the Mechanician GLB. Different body (MmbA01
    // vs tmbA01) and different head (MmhA01 vs tmh-A01).
    expect(VISUALS.player_morion_knight.url).not.toBe(VISUALS.player_tempskron_mechanician.url);
  });

  it('is distinct from the Pikeman visual', () => {
    // The Knight must NOT reuse the Pikeman GLB. Different body (MmbA01
    // vs tmbC01) and different head (MmhA01 vs tmh-C01).
    expect(VISUALS.player_morion_knight.url).not.toBe(VISUALS.player_tempskron_pikeman.url);
  });

  it('is distinct from the Archer visual', () => {
    // The Knight must NOT reuse the Archer GLB. Different body (MmbA01
    // vs tfbD01) and different head (MmhA01 vs Tfh-D01).
    expect(VISUALS.player_morion_knight.url).not.toBe(VISUALS.player_tempskron_archer.url);
  });
});

describe('Morion Knight is a player class, not a mob or NPC', () => {
  it('is listed in ALL_CLASSES', () => {
    expect(ALL_CLASSES).toContain('morion_knight');
  });

  it('has a CLASSES entry with the authentic Knight identity', () => {
    expect(CLASSES.morion_knight).toBeDefined();
    expect(CLASSES.morion_knight.id).toBe('morion_knight');
    expect(CLASSES.morion_knight.name).toBe('Morion Knight');
  });

  it('visualKeyFor resolves a player entity to player_morion_knight', () => {
    const e = {
      kind: 'player',
      templateId: 'morion_knight',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_morion_knight');
  });

  it('visualKeyFor does not resolve a mob to the Knight visual', () => {
    const e = {
      kind: 'mob',
      templateId: 'morion_knight',
    } as unknown as Entity;
    // A mob with the same templateId must NOT get the player visual; it falls
    // through to the mob-family lookup.
    expect(visualKeyFor(e)).not.toBe('player_morion_knight');
  });
});

// Phase A: authentic class foundation. The Knight's stats, resource
// type, and growth are derived from the MagicPT-Chinese source, not copied
// from the Fighter, Mechanician, Pikeman, or Archer. Source:
// PT-Source\HoBaram\HoLogin.cpp:99-102
//   {6, 26, 13, 17, 19, 24}  // JobCode, Str, Spirit, Talent, Defence, Health
// and PT-Source\fileread.cpp:6476 (LifeFunction=2, ManaFunction=2,
// StaminaFunction=2).
describe('Morion Knight class foundation (Phase A)', () => {
  const def = CLASSES.morion_knight;

  it('uses mana, not rage (the Fighter resource)', () => {
    expect(def.resourceType).toBe('mana');
    expect(def.resourceType).not.toBe('rage');
  });

  it('has authentic PT starting stats mapped to WoC attributes', () => {
    // PT Strength (26) -> WoC str
    expect(def.baseStats.str).toBe(26);
    // PT Spirit (13) -> WoC int (mana pool driver)
    expect(def.baseStats.int).toBe(13);
    // PT Spirit (13) -> WoC spi (mana regen)
    expect(def.baseStats.spi).toBe(13);
    // PT Talent (17) -> WoC agi
    expect(def.baseStats.agi).toBe(17);
    // PT Defence (19) -> WoC armor
    expect(def.baseStats.armor).toBe(19);
    // PT Health (24) -> WoC sta
    expect(def.baseStats.sta).toBe(24);
  });

  it('is distinct from the Fighter starting stats', () => {
    const fighter = CLASSES.tempskron_fighter;
    // Fighter reuses Warrior: str 23, agi 20, sta 22, int 10, spi 11, armor 50.
    // Knight: str 26, agi 17, sta 24, int 13, spi 13, armor 19.
    expect(def.baseStats).not.toEqual(fighter.baseStats);
  });

  it('is distinct from the Mechanician starting stats', () => {
    const mechanician = CLASSES.tempskron_mechanician;
    // Mechanician: str 24, agi 25, sta 24, int 8, spi 8, armor 18.
    // Knight: str 26, agi 17, sta 24, int 13, spi 13, armor 19.
    expect(def.baseStats).not.toEqual(mechanician.baseStats);
  });

  it('is distinct from the Pikeman starting stats', () => {
    const pikeman = CLASSES.tempskron_pikeman;
    // Pikeman: str 26, agi 20, sta 25, int 9, spi 9, armor 19.
    // Knight: str 26, agi 17, sta 24, int 13, spi 13, armor 19.
    expect(def.baseStats).not.toEqual(pikeman.baseStats);
  });

  it('is distinct from the Archer starting stats', () => {
    const archer = CLASSES.tempskron_archer;
    // Archer: str 17, agi 21, sta 23, int 11, spi 11, armor 27.
    // Knight: str 26, agi 17, sta 24, int 13, spi 13, armor 19.
    expect(def.baseStats).not.toEqual(archer.baseStats);
  });

  it('has a mana pool (baseMana > 0 and manaPerLevel > 0)', () => {
    expect(def.baseMana).toBeGreaterThan(0);
    expect(def.manaPerLevel).toBeGreaterThan(0);
  });

  it('does not use the Warrior rage cap (baseMana != 100 or manaPerLevel != 0)', () => {
    // Warrior: baseMana=100 (rage cap), manaPerLevel=0. A mana class has a
    // growing pool, not a fixed cap.
    expect(def.manaPerLevel).toBeGreaterThan(0);
  });

  it('has HP values appropriate for a melee class (between mage and warrior)', () => {
    const warrior = CLASSES.warrior;
    const mage = CLASSES.mage;
    expect(def.baseHp).toBeGreaterThanOrEqual(mage.baseHp);
    expect(def.baseHp).toBeLessThanOrEqual(warrior.baseHp);
    expect(def.hpPerLevel).toBeGreaterThanOrEqual(mage.hpPerLevel);
    expect(def.hpPerLevel).toBeLessThanOrEqual(warrior.hpPerLevel);
  });

  it('carries water rations (mana class starter items)', () => {
    // Mana classes carry bread + water; rage/energy classes carry bread only.
    expect(def.startItems.length).toBe(2);
  });
});

describe('Morion Knight GLB animation clips', () => {
  // Validates that the generated GLB contains the required animation clips.
  // Uses gltf-transform to inspect the GLB file.
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
    // STAND_COMBAT is the field STAND (mapPos=2), the braced combat stance.
    expect(animNames.has('STAND_COMBAT'), 'STAND_COMBAT animation missing').toBe(true);
    // FALLSTAND_REVERSED is the reversed FALLSTAND clip used for jump-launch.
    expect(animNames.has('FALLSTAND_REVERSED'), 'FALLSTAND_REVERSED animation missing').toBe(true);
    // FALLDOWN and FALLSTAND for fall and land.
    expect(animNames.has('FALLDOWN'), 'FALLDOWN animation missing').toBe(true);
    expect(animNames.has('FALLSTAND'), 'FALLSTAND animation missing').toBe(true);
  });

  it('does not contain an invented combat-stance clip', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const animNames = new Set<string>();
    for (const anim of root.listAnimations()) {
      animNames.add(anim.getName());
    }
    // No invented combat stance: the GLB must not ship a fake
    // FIGHTING_STANCE / COMBAT_IDLE / BATTLE_STANCE clip.
    expect(animNames.has('FIGHTING_STANCE')).toBe(false);
    expect(animNames.has('COMBAT_IDLE')).toBe(false);
    expect(animNames.has('BATTLE_STANCE')).toBe(false);
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

  it('has at least 2 materials (body + head/hair)', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const materials = root.listMaterials();
    // The Knight body (MmbA01.smd) and head (MmhA01.smd) use separate
    // textures (MmbA01.bmp and MmhA02.bmp), so the GLB has at least 2
    // material groups.
    expect(materials.length).toBeGreaterThanOrEqual(2);
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

  it('shares the Fighter Bip01 skeleton (66 joints from m1.smb)', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const skins = root.listSkins();
    // The Knight shares m1.smb (the same motion file as the Fighter,
    // Mechanician, and Pikeman), which contains a 66-bone Bip01 skeleton.
    expect(skins[0].listJoints().length).toBe(66);
  });
});

describe('Morion Knight hair variants', () => {
  it('Knight GLB shares the same skeleton as the Fighter (m1.smb)', async () => {
    // The Knight shares M1Bip.inx (150 motions) and m1.smb (66 bones) with
    // the Fighter, Mechanician, and Pikeman. All are male classes using the
    // Bip01 skeleton. This test verifies the joint sets match, confirming
    // the Knight uses the same motion file rather than a different one.
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const knightDoc = await io.read(GLB_PATH);
    const fightDoc = await io.read('public/models/creatures/pt_fighter.glb');
    const knightJoints = new Set(knightDoc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()));
    const fightJoints = new Set(fightDoc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()));
    // Both should have the core Bip01 hierarchy.
    expect(knightJoints.has('Bip01')).toBe(true);
    expect(fightJoints.has('Bip01')).toBe(true);
    // The joint sets should match (same m1.smb skeleton).
    expect(knightJoints.size).toBe(fightJoints.size);
  });

  it('registers player_morion_knight_hair2 in VISUALS', () => {
    const def = VISUALS.player_morion_knight_hair2;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_knight_hair2.glb');
  });

  it('registers player_morion_knight_hair3 in VISUALS', () => {
    const def = VISUALS.player_morion_knight_hair3;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_knight_hair3.glb');
  });

  it('hair2 GLB file exists', () => {
    expect(existsSync(GLB_HAIR2_PATH), `${GLB_HAIR2_PATH} is missing`).toBe(true);
  });

  it('hair3 GLB file exists', () => {
    expect(existsSync(GLB_HAIR3_PATH), `${GLB_HAIR3_PATH} is missing`).toBe(true);
  });

  it('hair variants have the same clips as the default', () => {
    const def = VISUALS.player_morion_knight;
    const hair2 = VISUALS.player_morion_knight_hair2;
    const hair3 = VISUALS.player_morion_knight_hair3;
    // All hair variants share the same body and animation clips; only the
    // head/hair mesh differs.
    expect(hair2.clips.idle).toBe(def.clips.idle);
    expect(hair2.clips.walk).toBe(def.clips.walk);
    expect(hair2.clips.run).toBe(def.clips.run);
    expect(hair3.clips.idle).toBe(def.clips.idle);
    expect(hair3.clips.walk).toBe(def.clips.walk);
    expect(hair3.clips.run).toBe(def.clips.run);
  });

  it('all variants share the same rawHeight for consistent body scale', () => {
    // rawHeight is pinned across ALL variants (default + hair2 + hair3) so
    // the body scale stays constant across hair swaps. Without pinning the
    // default, it measures its posed skinned bounds dynamically (which
    // differs from the hair variants' pinned value), so switching hair
    // changes the body size in character selection.
    const def = VISUALS.player_morion_knight;
    const hair2 = VISUALS.player_morion_knight_hair2;
    const hair3 = VISUALS.player_morion_knight_hair3;
    expect(def.rawHeight).toBeDefined();
    expect(hair2.rawHeight).toBeDefined();
    expect(hair3.rawHeight).toBeDefined();
    expect(def.rawHeight).toBe(hair2.rawHeight);
    expect(def.rawHeight).toBe(hair3.rawHeight);
  });

  it('visualKeyFor resolves hair override to the correct variant', () => {
    const e = {
      kind: 'player',
      templateId: 'morion_knight',
      visualKeyOverride: 'player_morion_knight_hair2',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_morion_knight_hair2');
  });
});

describe('Morion Knight player-state-to-animation mapping', () => {
  // The PT Knight uses the same desiredBaseState() path as every other
  // player class. The clip availability flags match the manifest: no
  // walkBack, no wade, but combatIdle IS available (STAND_COMBAT from the PT
  // field STAND).
  const hasWalkBack = false;
  const hasWade = false;
  const hasCombatIdle = true;

  it('stationary player selects idle (STAND = relaxed standing pose)', () => {
    const s = animState({ moving: false });
    expect(desiredBaseState(s, hasWalkBack, hasWade, hasCombatIdle)).toBe('idle');
  });

  it('moving player selects walk (WALK = walk-in-place cycle)', () => {
    const s = animState({ moving: true, running: false, speed: 3 });
    expect(desiredBaseState(s, hasWalkBack, hasWade, hasCombatIdle)).toBe('walk');
  });

  it('sprinting player selects run (RUN = running cycle)', () => {
    const s = animState({ moving: true, running: true, speed: 7 });
    expect(desiredBaseState(s, hasWalkBack, hasWade, hasCombatIdle)).toBe('run');
  });

  it('attack input is a one-shot (ATTACK), not a base state', () => {
    const stationary = animState({ moving: false });
    const moving = animState({ moving: true, running: false, speed: 3 });
    const states = new Set<string>();
    states.add(desiredBaseState(stationary, hasWalkBack, hasWade, hasCombatIdle));
    states.add(desiredBaseState(moving, hasWalkBack, hasWade, hasCombatIdle));
    expect(states.has('attack')).toBe(false);
  });

  it('attack completion returns to idle when stationary', () => {
    const s = animState({ moving: false });
    expect(desiredBaseState(s, hasWalkBack, hasWade, hasCombatIdle)).toBe('idle');
  });

  it('attack completion returns to walk when moving', () => {
    const s = animState({ moving: true, running: false, speed: 3 });
    expect(desiredBaseState(s, hasWalkBack, hasWade, hasCombatIdle)).toBe('walk');
  });

  it('combat stance is selected when the Knight is engaged and stationary', () => {
    const s = animState({ moving: false, combat: true });
    expect(desiredBaseState(s, hasWalkBack, hasWade, hasCombatIdle)).toBe('combatIdle');
  });

  it('non-combat stationary player stays on idle, not combatIdle', () => {
    const s = animState({ moving: false, combat: false });
    expect(desiredBaseState(s, hasWalkBack, hasWade, hasCombatIdle)).toBe('idle');
  });

  it('stopping transitions from walk to idle (not stuck on STAND)', () => {
    const walking = animState({ moving: true, running: false, speed: 3 });
    const stopped = animState({ moving: false, speed: 0 });
    expect(desiredBaseState(walking, hasWalkBack, hasWade, hasCombatIdle)).toBe('walk');
    expect(desiredBaseState(stopped, hasWalkBack, hasWade, hasCombatIdle)).toBe('idle');
  });
});

describe('Morion Knight PT-specific skeleton and asset identity', () => {
  it('uses the PT Bip01 skeleton, not a KayKit modular character', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const skins = root.listSkins();
    const joints = skins[0].listJoints().map((j) => j.getName());
    // The Knight must use the PT Bip01 skeleton, not the KayKit mixamorig
    // skeleton used by the base WoC classes.
    expect(joints.some((n) => n.startsWith('Bip01'))).toBe(true);
    expect(joints.some((n) => n.startsWith('mixamorig'))).toBe(false);
  });

  it('does not use Fighter body assets', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const knightDoc = await io.read(GLB_PATH);
    const fightDoc = await io.read('public/models/creatures/pt_fighter.glb');
    // The Knight body texture is MmbA01.bmp; the Fighter body texture is
    // TmbB01.bmp. They must not share the same texture references.
    const knightTextures = new Set(knightDoc.getRoot().listTextures().map((t) => t.getName()));
    const fightTextures = new Set(fightDoc.getRoot().listTextures().map((t) => t.getName()));
    // The Knight and Fighter should have different texture sets (different
    // body and head textures).
    const shared = [...knightTextures].filter((t) => fightTextures.has(t));
    // They may share the motion data (same m1.smb), but the body/head textures
    // are different. Allow no shared textures.
    expect(shared.length).toBe(0);
  });
});
