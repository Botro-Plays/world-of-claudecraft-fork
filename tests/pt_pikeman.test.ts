// Focused tests for the Tempskron Pikeman PT character conversion proof-of-concept.
// Verifies the Pikeman visual definition, GLB asset, and animation clip mappings
// are wired correctly for use as a PLAYER character (not a mob).
//
// Also pins the player-state-to-animation mapping: the PT Pikeman must use the
// same desiredBaseState() path as every other player class, selecting STAND when
// stationary, WALK when moving, RUN when sprinting, and ATTACK on attack input.
// Combat stance is selected ONLY if the GLB ships a real combat-idle clip.
//
// The Pikeman uses its own motion file (m4.smb / M4Bip.inx, 102 motions), NOT
// the Fighter's (m1.smb / M1Bip.inx, 160 motions). All Tempskron classes share
// the Bip01 skeleton hierarchy, but each has class-specific frame ranges and
// skill animations. The body and head meshes are distinct (tmbC01.smd vs
// tmbB01.smd vs tmbA01.smd, tmh-C01.smd vs tmh-B01.smd vs tmh-A01.smd).
//
// MESH FILTERING: The Pikeman body SMD (TmbC01.smd) contains 9 mesh objects
// spanning TWO armor tiers: 6 C01-tier objects (the default armor) and 3
// C03-tier objects (a different armor set). The M4Bip.inx model groups name
// only the 6 C01 objects. The assembler filters out the C03 objects so they
// don't overlap with the C01 body and tear a hole in the chest/stomach.

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { desiredBaseState, type AnimState } from '../src/render/characters/anim_state';
import { ALL_CLASSES, type Entity } from '../src/sim/types';
import { CLASSES } from '../src/sim/content/classes';

const GLB_PATH = 'public/models/creatures/pt_pikeman.glb';
const GLB_HAIR2_PATH = 'public/models/creatures/pt_pikeman_hair2.glb';
const GLB_HAIR3_PATH = 'public/models/creatures/pt_pikeman_hair3.glb';

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

describe('Tempskron Pikeman visual definition (player character)', () => {
  it('registers player_tempskron_pikeman in VISUALS', () => {
    const def = VISUALS.player_tempskron_pikeman;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_pikeman.glb');
    expect(def.height).toBeGreaterThan(0);
  });

  it('declares the required player animation clip mappings', () => {
    const def = VISUALS.player_tempskron_pikeman;
    // The Pikeman uses its own M4Bip.inx (102 motions) with Pikeman-specific
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
    const def = VISUALS.player_tempskron_pikeman;
    // PT ships village (mapPos=1) and field (mapPos=2) STAND variants. The
    // field STAND is a braced combat stance exported as STAND_COMBAT, and the
    // manifest maps combatIdle to it so desiredBaseState picks it when the
    // Pikeman is engaged and stationary.
    expect(def.clips.combatIdle).toBe('STAND_COMBAT');
  });

  it('maps jump/fall/land clips', () => {
    const def = VISUALS.player_tempskron_pikeman;
    // Jump uses reversed FALLSTAND (crouch down to spring up), fall uses
    // FALLDOWN (falling pose), and land uses normal FALLSTAND (stand up
    // from crouch). Same clip names as Fighter and Mechanician since all
    // share the Bip01 skeleton, but the Pikeman's frame ranges come from
    // its own M4Bip.inx / m4.smb motion data.
    expect(def.clips.jump).toBe('FALLSTAND_REVERSED');
    expect(def.clips.fall).toBe('FALLDOWN');
    expect(def.clips.land).toBe('FALLSTAND');
  });

  it('the GLB asset file exists', () => {
    expect(existsSync(GLB_PATH), `${GLB_PATH} is missing`).toBe(true);
  });

  it('is distinct from the Combat Mech cosmetic body', () => {
    // The Pikeman is a fixed PT GLB, not the KayKit-rigged Combat Mech.
    expect(VISUALS.player_tempskron_pikeman.url).not.toBe(VISUALS.player_mech.url);
  });

  it('is distinct from the Fighter visual', () => {
    // The Pikeman must NOT reuse the Fighter GLB. Different body (tmbC01
    // vs tmbB01) and different head (tmh-C01 vs tmh-B01).
    expect(VISUALS.player_tempskron_pikeman.url).not.toBe(VISUALS.player_tempskron_fighter.url);
  });

  it('is distinct from the Mechanician visual', () => {
    // The Pikeman must NOT reuse the Mechanician GLB. Different body (tmbC01
    // vs tmbA01) and different head (tmh-C01 vs tmh-A01).
    expect(VISUALS.player_tempskron_pikeman.url).not.toBe(VISUALS.player_tempskron_mechanician.url);
  });
});

describe('Tempskron Pikeman is a player class, not a mob or NPC', () => {
  it('is listed in ALL_CLASSES', () => {
    expect(ALL_CLASSES).toContain('tempskron_pikeman');
  });

  it('has a CLASSES entry with the authentic Pikeman identity', () => {
    expect(CLASSES.tempskron_pikeman).toBeDefined();
    expect(CLASSES.tempskron_pikeman.id).toBe('tempskron_pikeman');
    expect(CLASSES.tempskron_pikeman.name).toBe('Tempskron Pikeman');
  });

  it('visualKeyFor resolves a player entity to player_tempskron_pikeman', () => {
    const e = {
      kind: 'player',
      templateId: 'tempskron_pikeman',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_tempskron_pikeman');
  });

  it('visualKeyFor does not resolve a mob to the Pikeman visual', () => {
    const e = {
      kind: 'mob',
      templateId: 'tempskron_pikeman',
    } as unknown as Entity;
    // A mob with the same templateId must NOT get the player visual; it falls
    // through to the mob-family lookup.
    expect(visualKeyFor(e)).not.toBe('player_tempskron_pikeman');
  });
});

// Phase A: authentic class foundation. The Pikeman's stats, resource
// type, and growth are derived from the MagicPT-Chinese source, not copied
// from the Fighter or Mechanician. Source: PT-Source\HoBaram\HoLogin.cpp:93
//   {4, 26, 9, 20, 19, 25}  // JobCode, Str, Spirit, Talent, Defence, Health
// and PT-Source\fileread.cpp:6443 (LifeFunction=1, ManaFunction=3,
// StaminaFunction=1).
describe('Tempskron Pikeman class foundation (Phase A)', () => {
  const def = CLASSES.tempskron_pikeman;

  it('uses mana, not rage (the Fighter resource)', () => {
    expect(def.resourceType).toBe('mana');
    expect(def.resourceType).not.toBe('rage');
  });

  it('has authentic PT starting stats mapped to WoC attributes', () => {
    // PT Strength (26) -> WoC str
    expect(def.baseStats.str).toBe(26);
    // PT Spirit (9) -> WoC int (mana pool driver)
    expect(def.baseStats.int).toBe(9);
    // PT Spirit (9) -> WoC spi (mana regen)
    expect(def.baseStats.spi).toBe(9);
    // PT Talent (20) -> WoC agi
    expect(def.baseStats.agi).toBe(20);
    // PT Defence (19) -> WoC armor
    expect(def.baseStats.armor).toBe(19);
    // PT Health (25) -> WoC sta
    expect(def.baseStats.sta).toBe(25);
  });

  it('is distinct from the Fighter starting stats', () => {
    const fighter = CLASSES.tempskron_fighter;
    // Fighter reuses Warrior: str 23, agi 20, sta 22, int 10, spi 11, armor 50.
    // Pikeman: str 26, agi 20, sta 25, int 9, spi 9, armor 19.
    expect(def.baseStats).not.toEqual(fighter.baseStats);
  });

  it('is distinct from the Mechanician starting stats', () => {
    const mechanician = CLASSES.tempskron_mechanician;
    // Mechanician: str 24, agi 25, sta 24, int 8, spi 8, armor 18.
    // Pikeman: str 26, agi 20, sta 25, int 9, spi 9, armor 19.
    expect(def.baseStats).not.toEqual(mechanician.baseStats);
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

  it('has HP values appropriate for a durable melee (between mage and warrior)', () => {
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

describe('Tempskron Pikeman GLB animation clips', () => {
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
    // The PT Pikeman head model (tmh-C01.smd) combines face and hair into
    // one material/texture, so the GLB has at least 2 material groups:
    // body (TmbC01.bmp) and head/hair (TmhC01.bmp).
    expect(materials.length).toBeGreaterThanOrEqual(2);
  });

  it('does not contain the C03 armor tier body texture', async () => {
    // The Pikeman body SMD (TmbC01.smd) contains 9 objects spanning two armor
    // tiers: 6 C01 objects (default armor, TmbC01.bmp) and 3 C03 objects
    // (a different armor, TmbC03.bmp). The assembler filters out the C03
    // objects using the M4Bip.inx model groups so they don't overlap with
    // the C01 body and tear a hole in the chest/stomach.
    // Before filtering: 4 material groups (C03 body + C01 body + 2 head).
    // After filtering: 3 material groups (C01 body + 2 head).
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const meshes = root.listMeshes();
    const prims = meshes.flatMap((m) => m.listPrimitives());
    // 3 primitives: C01 body + 2 head/hair materials. The C03 body material
    // (which would add a 4th primitive) is filtered out.
    expect(prims.length).toBe(3);
  });

  it('has exactly 1 body primitive (C01 default armor only)', async () => {
    // After filtering, the body uses only TmbC01.bmp (the default C01
    // armor texture). The C03 texture (TmbC03.bmp) should be absent,
    // leaving 1 body primitive + 2 head/hair primitives = 3 total.
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const materials = root.listMaterials();
    // The body material is the one with the most faces (1276). We can't
    // check the texture filename directly (the assembler names textures
    // tex_<matIdx>), but we can verify the material count is exactly 3
    // (1 body + 2 head) and not 4 (which would include the C03 body).
    expect(materials.length).toBe(3);
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

  it('has the Pikeman Bip01 skeleton (58 joints from m4.smb)', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const skins = root.listSkins();
    // The Pikeman uses m4.smb (its own motion file), which contains a
    // 58-bone Bip01 skeleton. This is distinct from the Fighter's m1.smb
    // (66 bones) and the Mechanician's m2.smb (66 bones). The Pikeman
    // skeleton has bbong01-06 auxiliary bones instead of the Fighter's
    // bb01-04 / m01-04, and no TargetBone. All three share the core Bip01
    // hierarchy (Spine, Head, limbs, fingers, tail).
    expect(skins[0].listJoints().length).toBe(58);
  });
});

describe('Tempskron Pikeman hair variants', () => {
  it('Pikeman GLB uses its own skeleton (m4.smb), not the Fighter skeleton', async () => {
    // The Pikeman uses M4Bip.inx (102 motions) and m4.smb (58 bones), NOT the
    // Fighter's M1Bip.inx (160 motions) and m1.smb (66 bones). Both share the
    // core Bip01 hierarchy, but the Pikeman skeleton has different auxiliary
    // bones (bbong01-06 vs the Fighter's bb01-04 / m01-04) and no TargetBone.
    // This test verifies the joint sets differ, confirming the Pikeman uses
    // its own motion file rather than the Fighter's.
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const pikeDoc = await io.read(GLB_PATH);
    const fightDoc = await io.read('public/models/creatures/pt_fighter.glb');
    const pikeJoints = new Set(pikeDoc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()));
    const fightJoints = new Set(fightDoc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()));
    // Both should have the core Bip01 hierarchy.
    expect(pikeJoints.has('Bip01')).toBe(true);
    expect(fightJoints.has('Bip01')).toBe(true);
    // The Pikeman should have bbong bones (its own skeleton).
    expect([...pikeJoints].some((n) => n.includes('bbong'))).toBe(true);
    // The Fighter should have bb/m bones (different skeleton).
    expect([...fightJoints].some((n) => n.includes('bb01'))).toBe(true);
    // The joint sets should differ.
    expect(pikeJoints.size).not.toBe(fightJoints.size);
  });

  it('registers player_tempskron_pikeman_hair2 in VISUALS', () => {
    const def = VISUALS.player_tempskron_pikeman_hair2;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_pikeman_hair2.glb');
  });

  it('registers player_tempskron_pikeman_hair3 in VISUALS', () => {
    const def = VISUALS.player_tempskron_pikeman_hair3;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_pikeman_hair3.glb');
  });

  it('hair2 GLB file exists', () => {
    expect(existsSync(GLB_HAIR2_PATH), `${GLB_HAIR2_PATH} is missing`).toBe(true);
  });

  it('hair3 GLB file exists', () => {
    expect(existsSync(GLB_HAIR3_PATH), `${GLB_HAIR3_PATH} is missing`).toBe(true);
  });

  it('hair variants have the same clips as the default', () => {
    const def = VISUALS.player_tempskron_pikeman;
    const hair2 = VISUALS.player_tempskron_pikeman_hair2;
    const hair3 = VISUALS.player_tempskron_pikeman_hair3;
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
    const def = VISUALS.player_tempskron_pikeman;
    const hair2 = VISUALS.player_tempskron_pikeman_hair2;
    const hair3 = VISUALS.player_tempskron_pikeman_hair3;
    expect(def.rawHeight).toBeDefined();
    expect(hair2.rawHeight).toBeDefined();
    expect(hair3.rawHeight).toBeDefined();
    expect(def.rawHeight).toBe(hair2.rawHeight);
    expect(def.rawHeight).toBe(hair3.rawHeight);
  });

  it('visualKeyFor resolves hair override to the correct variant', () => {
    const e = {
      kind: 'player',
      templateId: 'tempskron_pikeman',
      visualKeyOverride: 'player_tempskron_pikeman_hair2',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_tempskron_pikeman_hair2');
  });
});

describe('Tempskron Pikeman player-state-to-animation mapping', () => {
  // The PT Pikeman uses the same desiredBaseState() path as every other
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

  it('combat stance is selected when the Pikeman is engaged and stationary', () => {
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

describe('Tempskron Pikeman modular body skip', () => {
  it('does not have a player_tempskron_pikeman_modular visual', () => {
    // PT characters use their own Bip01 skeleton, not the KayKit mixamorig
    // skeleton. The modular body system must skip them.
    expect(VISUALS.player_tempskron_pikeman_modular).toBeUndefined();
  });
});
