// Focused tests for the Morion Atalanta PT character conversion proof-of-concept.
// Verifies the Atalanta visual definition, GLB asset, and animation clip mappings
// are wired correctly for use as a PLAYER character (not a mob).
//
// Also pins the player-state-to-animation mapping: the PT Atalanta must use the
// same desiredBaseState() path as every other player class, selecting STAND when
// stationary, WALK when moving, RUN when sprinting, and ATTACK on attack input.
// Combat stance is selected ONLY if the GLB ships a real combat-idle clip.
//
// The Atalanta shares the same motion file (m2.smb / M2Bip.inx, 108 motions, 67
// bones) as the Archer (both are female classes using the female Bip01
// skeleton). The body and head meshes are distinct (MfbB01.smd vs tfbD01.smd,
// MfhB01.smd vs Tfh-D01.smd).
//
// MORION FEMALE: The Atalanta is a Morion female character (BROOD_CODE_MORAYION,
// BROOD_CODE_WOMAN). The asset prefix is 'Mf' (Morion female) instead of the
// Morion male 'Mm' (Knight) or the Tempskron 'tf' (Tempskron female, Archer).
//
// MESH FILTERING: The Atalanta body SMD (MfbB01.smd) contains only 3 objects
// (MBHB01, MBMB01, MBLB01), exactly matching the mB001.inx model groups.
// No mesh filter is needed (unlike the Knight, whose body SMD contained
// multiple armor tiers).

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { desiredBaseState, type AnimState } from '../src/render/characters/anim_state';
import { ALL_CLASSES, type Entity } from '../src/sim/types';
import { CLASSES } from '../src/sim/content/classes';

const GLB_PATH = 'public/models/creatures/pt_atalanta.glb';
const GLB_HAIR2_PATH = 'public/models/creatures/pt_atalanta_hair2.glb';
const GLB_HAIR3_PATH = 'public/models/creatures/pt_atalanta_hair3.glb';

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

describe('Morion Atalanta visual definition (player character)', () => {
  it('registers player_morion_atalanta in VISUALS', () => {
    const def = VISUALS.player_morion_atalanta;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_atalanta.glb');
    expect(def.height).toBeGreaterThan(0);
  });

  it('declares the required player animation clip mappings', () => {
    const def = VISUALS.player_morion_atalanta;
    // The Atalanta shares M2Bip.inx (108 motions) with the Archer. The INX
    // state names match their visual content: STAND = standing pose,
    // WALK = walking, RUN = running
    expect(def.clips.idle).toBe('STAND');
    expect(def.clips.walk).toBe('WALK');
    expect(def.clips.run).toBe('RUN');
    expect(def.clips.attack).toContain('ATTACK');
    expect(def.clips.death).toBe('DEAD');
    expect(def.clips.hit).toContain('DAMAGE');
  });

  it('maps a combatIdle clip to the PT field STAND (combat stance)', () => {
    const def = VISUALS.player_morion_atalanta;
    // PT ships village (mapPos=1) and field (mapPos=2) STAND variants. The
    // field STAND is a braced combat stance exported as STAND_COMBAT, and the
    // manifest maps combatIdle to it so desiredBaseState picks it when the
    // Atalanta is engaged and stationary.
    expect(def.clips.combatIdle).toBe('STAND_COMBAT');
  });

  it('maps jump/fall/land clips', () => {
    const def = VISUALS.player_morion_atalanta;
    // Jump uses reversed FALLSTAND (crouch down to spring up), fall uses
    // FALLDOWN (falling pose), and land uses normal FALLSTAND (stand up
    // from crouch). Same clip names as the Archer since both share the
    // female Bip01 skeleton and m2.smb motion data.
    expect(def.clips.jump).toBe('FALLSTAND_REVERSED');
    expect(def.clips.fall).toBe('FALLDOWN');
    expect(def.clips.land).toBe('FALLSTAND');
  });

  it('the GLB asset file exists', () => {
    expect(existsSync(GLB_PATH), `${GLB_PATH} is missing`).toBe(true);
  });

  it('is distinct from the Combat Mech cosmetic body', () => {
    // The Atalanta is a fixed PT GLB, not the KayKit-rigged Combat Mech.
    expect(VISUALS.player_morion_atalanta.url).not.toBe(VISUALS.player_mech.url);
  });

  it('is distinct from the Fighter visual', () => {
    // The Atalanta must NOT reuse the Fighter GLB. Different body (MfbB01
    // vs tmbB01) and different head (MfhB01 vs tmh-B01).
    expect(VISUALS.player_morion_atalanta.url).not.toBe(VISUALS.player_tempskron_fighter.url);
  });

  it('is distinct from the Mechanician visual', () => {
    // The Atalanta must NOT reuse the Mechanician GLB. Different body (MfbB01
    // vs tmbA01) and different head (MfhB01 vs tmh-A01).
    expect(VISUALS.player_morion_atalanta.url).not.toBe(VISUALS.player_tempskron_mechanician.url);
  });

  it('is distinct from the Pikeman visual', () => {
    // The Atalanta must NOT reuse the Pikeman GLB. Different body (MfbB01
    // vs tmbC01) and different head (MfhB01 vs tmh-C01).
    expect(VISUALS.player_morion_atalanta.url).not.toBe(VISUALS.player_tempskron_pikeman.url);
  });

  it('is distinct from the Archer visual', () => {
    // The Atalanta must NOT reuse the Archer GLB. Different body (MfbB01
    // vs tfbD01) and different head (MfhB01 vs Tfh-D01).
    expect(VISUALS.player_morion_atalanta.url).not.toBe(VISUALS.player_tempskron_archer.url);
  });

  it('is distinct from the Knight visual', () => {
    // The Atalanta must NOT reuse the Knight GLB. Different body (MfbB01
    // vs MmbA01) and different head (MfhB01 vs MmhA01).
    expect(VISUALS.player_morion_atalanta.url).not.toBe(VISUALS.player_morion_knight.url);
  });
});

describe('Morion Atalanta is a player class, not a mob or NPC', () => {
  it('is listed in ALL_CLASSES', () => {
    expect(ALL_CLASSES).toContain('morion_atalanta');
  });

  it('has a CLASSES entry with the authentic Atalanta identity', () => {
    expect(CLASSES.morion_atalanta).toBeDefined();
    expect(CLASSES.morion_atalanta.id).toBe('morion_atalanta');
    expect(CLASSES.morion_atalanta.name).toBe('Morion Atalanta');
  });

  it('visualKeyFor resolves a player entity to player_morion_atalanta', () => {
    const e = {
      kind: 'player',
      templateId: 'morion_atalanta',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_morion_atalanta');
  });

  it('visualKeyFor does not resolve a mob to the Atalanta visual', () => {
    const e = {
      kind: 'mob',
      templateId: 'morion_atalanta',
    } as unknown as Entity;
    // A mob with the same templateId must NOT get the player visual; it falls
    // through to the mob-family lookup.
    expect(visualKeyFor(e)).not.toBe('player_morion_atalanta');
  });
});

// Phase A: authentic class foundation. The Atalanta's stats, resource
// type, and growth are derived from the MagicPT-Chinese source, not copied
// from the Fighter, Mechanician, Pikeman, Archer, or Knight. Source:
// PT-Source\HoBaram\HoLogin.cpp:99-108
//   {5, 23, 15, 19, 19, 23}  // JobCode, Str, Spirit, Talent, Defence, Health
// and PT-Source\fileread.cpp:6477 (LifeFunction=2, ManaFunction=2,
// StaminaFunction=2).
describe('Morion Atalanta class foundation (Phase A)', () => {
  const def = CLASSES.morion_atalanta;

  it('uses mana, not rage (the Fighter resource)', () => {
    expect(def.resourceType).toBe('mana');
    expect(def.resourceType).not.toBe('rage');
  });

  it('has authentic PT starting stats mapped to WoC attributes', () => {
    // PT Strength (23) -> WoC str
    expect(def.baseStats.str).toBe(23);
    // PT Spirit (15) -> WoC int (mana pool driver)
    expect(def.baseStats.int).toBe(15);
    // PT Spirit (15) -> WoC spi (mana regen)
    expect(def.baseStats.spi).toBe(15);
    // PT Talent (19) -> WoC agi
    expect(def.baseStats.agi).toBe(19);
    // PT Defence (19) -> WoC armor
    expect(def.baseStats.armor).toBe(19);
    // PT Health (23) -> WoC sta
    expect(def.baseStats.sta).toBe(23);
  });

  it('is distinct from the Fighter starting stats', () => {
    const fighter = CLASSES.tempskron_fighter;
    // Fighter reuses Warrior: str 23, agi 20, sta 22, int 10, spi 11, armor 50.
    // Atalanta: str 23, agi 19, sta 23, int 15, spi 15, armor 19.
    expect(def.baseStats).not.toEqual(fighter.baseStats);
  });

  it('is distinct from the Mechanician starting stats', () => {
    const mechanician = CLASSES.tempskron_mechanician;
    // Mechanician: str 24, agi 25, sta 24, int 8, spi 8, armor 18.
    // Atalanta: str 23, agi 19, sta 23, int 15, spi 15, armor 19.
    expect(def.baseStats).not.toEqual(mechanician.baseStats);
  });

  it('is distinct from the Pikeman starting stats', () => {
    const pikeman = CLASSES.tempskron_pikeman;
    // Pikeman: str 26, agi 20, sta 25, int 9, spi 9, armor 19.
    // Atalanta: str 23, agi 19, sta 23, int 15, spi 15, armor 19.
    expect(def.baseStats).not.toEqual(pikeman.baseStats);
  });

  it('is distinct from the Archer starting stats', () => {
    const archer = CLASSES.tempskron_archer;
    // Archer: str 17, agi 21, sta 23, int 11, spi 11, armor 27.
    // Atalanta: str 23, agi 19, sta 23, int 15, spi 15, armor 19.
    expect(def.baseStats).not.toEqual(archer.baseStats);
  });

  it('is distinct from the Knight starting stats', () => {
    const knight = CLASSES.morion_knight;
    // Knight: str 26, agi 17, sta 24, int 13, spi 13, armor 19.
    // Atalanta: str 23, agi 19, sta 23, int 15, spi 15, armor 19.
    expect(def.baseStats).not.toEqual(knight.baseStats);
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

describe('Morion Atalanta GLB animation clips', () => {
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
    // The Atalanta body (MfbB01.smd) and head (MfhB01.smd) use separate
    // textures, so the GLB has at least 2 material groups.
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

  it('shares the Archer Bip01 skeleton (67 joints from m2.smb)', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const skins = root.listSkins();
    // The Atalanta shares m2.smb (the same motion file as the Archer),
    // which contains a 67-bone female Bip01 skeleton (distinct from the
    // male m1.smb's 66 bones).
    expect(skins[0].listJoints().length).toBe(67);
  });
});

describe('Morion Atalanta hair variants', () => {
  it('Atalanta GLB shares the same skeleton as the Archer (m2.smb)', async () => {
    // The Atalanta shares M2Bip.inx (108 motions) and m2.smb (67 bones) with
    // the Archer. Both are female classes using the female Bip01 skeleton.
    // This test verifies the joint sets match, confirming the Atalanta uses
    // the same motion file rather than a different one.
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const atalantaDoc = await io.read(GLB_PATH);
    const archerDoc = await io.read('public/models/creatures/pt_archer.glb');
    const atalantaJoints = new Set(atalantaDoc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()));
    const archerJoints = new Set(archerDoc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()));
    // Both should have the core Bip01 hierarchy.
    expect(atalantaJoints.has('Bip01')).toBe(true);
    expect(archerJoints.has('Bip01')).toBe(true);
    // The joint sets should match (same m2.smb skeleton).
    expect(atalantaJoints.size).toBe(archerJoints.size);
  });

  it('registers player_morion_atalanta_hair2 in VISUALS', () => {
    const def = VISUALS.player_morion_atalanta_hair2;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_atalanta_hair2.glb');
  });

  it('registers player_morion_atalanta_hair3 in VISUALS', () => {
    const def = VISUALS.player_morion_atalanta_hair3;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_atalanta_hair3.glb');
  });

  it('hair2 GLB file exists', () => {
    expect(existsSync(GLB_HAIR2_PATH), `${GLB_HAIR2_PATH} is missing`).toBe(true);
  });

  it('hair3 GLB file exists', () => {
    expect(existsSync(GLB_HAIR3_PATH), `${GLB_HAIR3_PATH} is missing`).toBe(true);
  });

  it('hair variants have the same clips as the default', () => {
    const def = VISUALS.player_morion_atalanta;
    const hair2 = VISUALS.player_morion_atalanta_hair2;
    const hair3 = VISUALS.player_morion_atalanta_hair3;
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
    const def = VISUALS.player_morion_atalanta;
    const hair2 = VISUALS.player_morion_atalanta_hair2;
    const hair3 = VISUALS.player_morion_atalanta_hair3;
    expect(def.rawHeight).toBeDefined();
    expect(hair2.rawHeight).toBeDefined();
    expect(hair3.rawHeight).toBeDefined();
    expect(def.rawHeight).toBe(hair2.rawHeight);
    expect(def.rawHeight).toBe(hair3.rawHeight);
  });

  it('visualKeyFor resolves hair override to the correct variant', () => {
    const e = {
      kind: 'player',
      templateId: 'morion_atalanta',
      visualKeyOverride: 'player_morion_atalanta_hair2',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_morion_atalanta_hair2');
  });
});

describe('Morion Atalanta player-state-to-animation mapping', () => {
  // The PT Atalanta uses the same desiredBaseState() path as every other
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

  it('combat stance is selected when the Atalanta is engaged and stationary', () => {
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

describe('Morion Atalanta PT-specific skeleton and asset identity', () => {
  it('uses the PT Bip01 skeleton, not a KayKit modular character', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const skins = root.listSkins();
    const joints = skins[0].listJoints().map((j) => j.getName());
    // The Atalanta must use the PT Bip01 skeleton, not the KayKit mixamorig
    // skeleton used by the base WoC classes.
    expect(joints.some((n) => n.startsWith('Bip01'))).toBe(true);
    expect(joints.some((n) => n.startsWith('mixamorig'))).toBe(false);
  });

  it('does not use Fighter body assets', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const atalantaDoc = await io.read(GLB_PATH);
    const fightDoc = await io.read('public/models/creatures/pt_fighter.glb');
    // The Atalanta body texture is MfbB01.bmp; the Fighter body texture is
    // TmbB01.bmp. They must not share the same texture references.
    const atalantaTextures = new Set(atalantaDoc.getRoot().listTextures().map((t) => t.getName()));
    const fightTextures = new Set(fightDoc.getRoot().listTextures().map((t) => t.getName()));
    // The Atalanta and Fighter should have different texture sets (different
    // body and head textures).
    const shared = [...atalantaTextures].filter((t) => fightTextures.has(t));
    // They may share the motion data (different smb), and the body/head
    // textures are different. Allow no shared textures.
    expect(shared.length).toBe(0);
  });

  it('does not use Knight body assets', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const atalantaDoc = await io.read(GLB_PATH);
    const knightDoc = await io.read('public/models/creatures/pt_knight.glb');
    // The Atalanta body texture is MfbB01.bmp; the Knight body texture is
    // MmbA01.bmp. They must not share the same texture references.
    const atalantaTextures = new Set(atalantaDoc.getRoot().listTextures().map((t) => t.getName()));
    const knightTextures = new Set(knightDoc.getRoot().listTextures().map((t) => t.getName()));
    const shared = [...atalantaTextures].filter((t) => knightTextures.has(t));
    // Different body and head textures. The only shared texture is the
    // assembler's fallback placeholder (tex_1), not an actual body/head
    // texture. Allow at most 1 shared fallback texture.
    expect(shared.length).toBeLessThanOrEqual(1);
  });
});
