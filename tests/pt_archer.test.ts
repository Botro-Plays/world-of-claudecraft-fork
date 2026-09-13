// Focused tests for the Tempskron Archer PT character conversion proof-of-concept.
// Verifies the Archer visual definition, GLB asset, and animation clip mappings
// are wired correctly for use as a PLAYER character (not a mob).
//
// Also pins the player-state-to-animation mapping: the PT Archer must use the
// same desiredBaseState() path as every other player class, selecting STAND when
// stationary, WALK when moving, RUN when sprinting, and ATTACK on attack input.
// Combat stance is selected ONLY if the GLB ships a real combat-idle clip.
//
// The Archer uses its own motion file (m2.smb / M2Bip.inx, 108 motions, 67
// bones), NOT the Fighter's (m1.smb / M1Bip.inx, 150 motions, 66 bones) or the
// Pikeman's (m4.smb / M4Bip.inx, 102 motions, 58 bones). All Tempskron classes
// share the Bip01 skeleton hierarchy, but each has class-specific frame ranges
// and skill animations. The body and head meshes are distinct (tfbD01.smd vs
// tmbB01.smd vs tmbA01.smd vs tmbC01.smd, Tfh-D01.smd vs tmh-B01.smd vs
// tmh-A01.smd vs tmh-C01.smd).
//
// FEMALE CHARACTER: The Archer is female (BROOD_CODE_WOMAN, GetSex returns 2
// in sinSubMain.cpp:4087-4092). The asset prefix is 'tf' (Tempskron Female)
// instead of the male 'tm' prefix used by Fighter/Mechanician/Pikeman.
//
// NO MESH FILTERING: Unlike the Pikeman (whose body SMD contained multiple
// armor tiers), the Archer body SMD (tfbD01.smd) contains only 3 objects
// (TBHD01, TBMD01, TBLD01) exactly matching the D001.inx model groups. No
// mesh filter is needed.

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { desiredBaseState, type AnimState } from '../src/render/characters/anim_state';
import { ALL_CLASSES, type Entity } from '../src/sim/types';
import { CLASSES } from '../src/sim/content/classes';

const GLB_PATH = 'public/models/creatures/pt_archer.glb';
const GLB_HAIR2_PATH = 'public/models/creatures/pt_archer_hair2.glb';
const GLB_HAIR3_PATH = 'public/models/creatures/pt_archer_hair3.glb';

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

describe('Tempskron Archer visual definition (player character)', () => {
  it('registers player_tempskron_archer in VISUALS', () => {
    const def = VISUALS.player_tempskron_archer;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_archer.glb');
    expect(def.height).toBeGreaterThan(0);
  });

  it('declares the required player animation clip mappings', () => {
    const def = VISUALS.player_tempskron_archer;
    // The Archer uses its own M2Bip.inx (108 motions) with Archer-specific
    // frame ranges, but the INX state names match their visual content:
    // STAND = standing pose, WALK = walking, RUN = running
    expect(def.clips.idle).toBe('STAND');
    expect(def.clips.walk).toBe('WALK');
    expect(def.clips.run).toBe('RUN');
    expect(def.clips.attack).toContain('ATTACK');
    expect(def.clips.death).toBe('DEAD');
    expect(def.clips.hit).toContain('DAMAGE');
  });

  it('maps a combatIdle clip to the PT field STAND (combat stance)', () => {
    const def = VISUALS.player_tempskron_archer;
    // PT ships village (mapPos=1) and field (mapPos=2) STAND variants. The
    // field STAND is a braced combat stance exported as STAND_COMBAT, and the
    // manifest maps combatIdle to it so desiredBaseState picks it when the
    // Archer is engaged and stationary.
    expect(def.clips.combatIdle).toBe('STAND_COMBAT');
  });

  it('maps jump/fall/land clips', () => {
    const def = VISUALS.player_tempskron_archer;
    // Jump uses reversed FALLSTAND (crouch down to spring up), fall uses
    // FALLDOWN (falling pose), and land uses normal FALLSTAND (stand up
    // from crouch). Same clip names as Fighter, Mechanician, and Pikeman
    // since all share the Bip01 skeleton, but the Archer's frame ranges come
    // from its own M2Bip.inx / m2.smb motion data.
    expect(def.clips.jump).toBe('FALLSTAND_REVERSED');
    expect(def.clips.fall).toBe('FALLDOWN');
    expect(def.clips.land).toBe('FALLSTAND');
  });

  it('the GLB asset file exists', () => {
    expect(existsSync(GLB_PATH), `${GLB_PATH} is missing`).toBe(true);
  });

  it('is distinct from the Combat Mech cosmetic body', () => {
    // The Archer is a fixed PT GLB, not the KayKit-rigged Combat Mech.
    expect(VISUALS.player_tempskron_archer.url).not.toBe(VISUALS.player_mech.url);
  });

  it('is distinct from the Fighter visual', () => {
    // The Archer must NOT reuse the Fighter GLB. Different body (tfbD01
    // vs tmbB01) and different head (Tfh-D01 vs tmh-B01).
    expect(VISUALS.player_tempskron_archer.url).not.toBe(VISUALS.player_tempskron_fighter.url);
  });

  it('is distinct from the Mechanician visual', () => {
    // The Archer must NOT reuse the Mechanician GLB. Different body (tfbD01
    // vs tmbA01) and different head (Tfh-D01 vs tmh-A01).
    expect(VISUALS.player_tempskron_archer.url).not.toBe(VISUALS.player_tempskron_mechanician.url);
  });

  it('is distinct from the Pikeman visual', () => {
    // The Archer must NOT reuse the Pikeman GLB. Different body (tfbD01
    // vs tmbC01) and different head (Tfh-D01 vs tmh-C01).
    expect(VISUALS.player_tempskron_archer.url).not.toBe(VISUALS.player_tempskron_pikeman.url);
  });
});

describe('Tempskron Archer is a player class, not a mob or NPC', () => {
  it('is listed in ALL_CLASSES', () => {
    expect(ALL_CLASSES).toContain('tempskron_archer');
  });

  it('has a CLASSES entry with the authentic Archer identity', () => {
    expect(CLASSES.tempskron_archer).toBeDefined();
    expect(CLASSES.tempskron_archer.id).toBe('tempskron_archer');
    expect(CLASSES.tempskron_archer.name).toBe('Tempskron Archer');
  });

  it('visualKeyFor resolves a player entity to player_tempskron_archer', () => {
    const e = {
      kind: 'player',
      templateId: 'tempskron_archer',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_tempskron_archer');
  });

  it('visualKeyFor does not resolve a mob to the Archer visual', () => {
    const e = {
      kind: 'mob',
      templateId: 'tempskron_archer',
    } as unknown as Entity;
    // A mob with the same templateId must NOT get the player visual; it falls
    // through to the mob-family lookup.
    expect(visualKeyFor(e)).not.toBe('player_tempskron_archer');
  });
});

// Phase A: authentic class foundation. The Archer's stats, resource
// type, and growth are derived from the MagicPT-Chinese source, not copied
// from the Fighter, Mechanician, or Pikeman. Source: PT-Source\HoBaram\HoLogin.cpp:94
//   {3, 17, 11, 21, 27, 23}  // JobCode, Str, Spirit, Talent, Defence, Health
// and PT-Source\fileread.cpp:6444 (LifeFunction=3, ManaFunction=3,
// StaminaFunction=2).
describe('Tempskron Archer class foundation (Phase A)', () => {
  const def = CLASSES.tempskron_archer;

  it('uses mana, not rage (the Fighter resource)', () => {
    expect(def.resourceType).toBe('mana');
    expect(def.resourceType).not.toBe('rage');
  });

  it('has authentic PT starting stats mapped to WoC attributes', () => {
    // PT Strength (17) -> WoC str
    expect(def.baseStats.str).toBe(17);
    // PT Spirit (11) -> WoC int (mana pool driver)
    expect(def.baseStats.int).toBe(11);
    // PT Spirit (11) -> WoC spi (mana regen)
    expect(def.baseStats.spi).toBe(11);
    // PT Talent (21) -> WoC agi
    expect(def.baseStats.agi).toBe(21);
    // PT Defence (27) -> WoC armor
    expect(def.baseStats.armor).toBe(27);
    // PT Health (23) -> WoC sta
    expect(def.baseStats.sta).toBe(23);
  });

  it('is distinct from the Fighter starting stats', () => {
    const fighter = CLASSES.tempskron_fighter;
    // Fighter reuses Warrior: str 23, agi 20, sta 22, int 10, spi 11, armor 50.
    // Archer: str 17, agi 21, sta 23, int 11, spi 11, armor 27.
    expect(def.baseStats).not.toEqual(fighter.baseStats);
  });

  it('is distinct from the Mechanician starting stats', () => {
    const mechanician = CLASSES.tempskron_mechanician;
    // Mechanician: str 24, agi 25, sta 24, int 8, spi 8, armor 18.
    // Archer: str 17, agi 21, sta 23, int 11, spi 11, armor 27.
    expect(def.baseStats).not.toEqual(mechanician.baseStats);
  });

  it('is distinct from the Pikeman starting stats', () => {
    const pikeman = CLASSES.tempskron_pikeman;
    // Pikeman: str 26, agi 20, sta 25, int 9, spi 9, armor 19.
    // Archer: str 17, agi 21, sta 23, int 11, spi 11, armor 27.
    expect(def.baseStats).not.toEqual(pikeman.baseStats);
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

  it('has HP values appropriate for a ranged class (between mage and warrior)', () => {
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

describe('Tempskron Archer GLB animation clips', () => {
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
    // The PT Archer head model (Tfh-D01.smd) combines face and hair into
    // multiple material/texture groups, so the GLB has at least 2 material
    // groups: body (TfbD01.bmp) and head/hair (TfhD01a.bmp + TfhD01b.tga).
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

  it('has the Archer Bip01 skeleton (67 joints from m2.smb)', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const skins = root.listSkins();
    // The Archer uses m2.smb (its own motion file), which contains a
    // 67-bone Bip01 skeleton. This is distinct from the Fighter's m1.smb
    // (66 bones) and the Pikeman's m4.smb (58 bones). The Archer skeleton
    // includes female-specific hair bones (Bip-hair01-15), bow weapon bones
    // (Bip in01-04, in-cro, in-bow), and tail bones (Bip01 Tailba1-6).
    expect(skins[0].listJoints().length).toBe(67);
  });
});

describe('Tempskron Archer hair variants', () => {
  it('Archer GLB uses its own skeleton (m2.smb), not the Fighter skeleton', async () => {
    // The Archer uses M2Bip.inx (108 motions) and m2.smb (67 bones), NOT the
    // Fighter's M1Bip.inx (150 motions) and m1.smb (66 bones). Both share the
    // core Bip01 hierarchy, but the Archer skeleton has female-specific hair
    // bones (Bip-hair01-15) and bow weapon bones (Bip in01-04) that the
    // Fighter lacks. This test verifies the joint sets differ, confirming the
    // Archer uses its own motion file rather than the Fighter's.
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const archerDoc = await io.read(GLB_PATH);
    const fightDoc = await io.read('public/models/creatures/pt_fighter.glb');
    const archerJoints = new Set(archerDoc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()));
    const fightJoints = new Set(fightDoc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()));
    // Both should have the core Bip01 hierarchy.
    expect(archerJoints.has('Bip01')).toBe(true);
    expect(fightJoints.has('Bip01')).toBe(true);
    // The Archer should have Bip-hair bones (female-specific hair bones).
    expect([...archerJoints].some((n) => n.includes('Bip-hair'))).toBe(true);
    // The joint sets should differ.
    expect(archerJoints.size).not.toBe(fightJoints.size);
  });

  it('Archer GLB uses its own skeleton (m2.smb), not the Pikeman skeleton', async () => {
    // The Archer uses M2Bip.inx (108 motions) and m2.smb (67 bones), NOT the
    // Pikeman's M4Bip.inx (102 motions) and m4.smb (58 bones). The Archer
    // skeleton has 67 bones vs the Pikeman's 58, with different auxiliary
    // bones (Bip-hair01-15 and Bip in01-04 vs the Pikeman's bbong01-06).
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const archerDoc = await io.read(GLB_PATH);
    const pikeDoc = await io.read('public/models/creatures/pt_pikeman.glb');
    const archerJoints = new Set(archerDoc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()));
    const pikeJoints = new Set(pikeDoc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()));
    // Both should have the core Bip01 hierarchy.
    expect(archerJoints.has('Bip01')).toBe(true);
    expect(pikeJoints.has('Bip01')).toBe(true);
    // The Archer should have Bip-hair bones (female-specific hair bones).
    expect([...archerJoints].some((n) => n.includes('Bip-hair'))).toBe(true);
    // The Pikeman should have bbong bones (different skeleton).
    expect([...pikeJoints].some((n) => n.includes('bbong'))).toBe(true);
    // The joint sets should differ.
    expect(archerJoints.size).not.toBe(pikeJoints.size);
  });

  it('registers player_tempskron_archer_hair2 in VISUALS', () => {
    const def = VISUALS.player_tempskron_archer_hair2;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_archer_hair2.glb');
  });

  it('registers player_tempskron_archer_hair3 in VISUALS', () => {
    const def = VISUALS.player_tempskron_archer_hair3;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_archer_hair3.glb');
  });

  it('hair2 GLB file exists', () => {
    expect(existsSync(GLB_HAIR2_PATH), `${GLB_HAIR2_PATH} is missing`).toBe(true);
  });

  it('hair3 GLB file exists', () => {
    expect(existsSync(GLB_HAIR3_PATH), `${GLB_HAIR3_PATH} is missing`).toBe(true);
  });

  it('hair variants have the same clips as the default', () => {
    const def = VISUALS.player_tempskron_archer;
    const hair2 = VISUALS.player_tempskron_archer_hair2;
    const hair3 = VISUALS.player_tempskron_archer_hair3;
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
    const def = VISUALS.player_tempskron_archer;
    const hair2 = VISUALS.player_tempskron_archer_hair2;
    const hair3 = VISUALS.player_tempskron_archer_hair3;
    expect(def.rawHeight).toBeDefined();
    expect(hair2.rawHeight).toBeDefined();
    expect(hair3.rawHeight).toBeDefined();
    expect(def.rawHeight).toBe(hair2.rawHeight);
    expect(def.rawHeight).toBe(hair3.rawHeight);
  });

  it('visualKeyFor resolves hair override to the correct variant', () => {
    const e = {
      kind: 'player',
      templateId: 'tempskron_archer',
      visualKeyOverride: 'player_tempskron_archer_hair2',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_tempskron_archer_hair2');
  });
});

describe('Tempskron Archer player-state-to-animation mapping', () => {
  // The PT Archer uses the same desiredBaseState() path as every other
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

  it('combat stance is selected when the Archer is engaged and stationary', () => {
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

describe('Tempskron Archer modular body skip', () => {
  it('does not have a player_tempskron_archer_modular visual', () => {
    // PT characters use their own Bip01 skeleton, not the KayKit mixamorig
    // skeleton. The modular body system must skip them.
    expect(VISUALS.player_tempskron_archer_modular).toBeUndefined();
  });
});
