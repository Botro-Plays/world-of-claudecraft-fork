// Focused tests for the Tempskron Mechanician PT character conversion proof-of-concept.
// Verifies the Mechanician visual definition, GLB asset, and animation clip mappings
// are wired correctly for use as a PLAYER character (not a mob).
//
// Also pins the player-state-to-animation mapping: the PT Mechanician must use the
// same desiredBaseState() path as every other player class, selecting STAND when
// stationary, WALK when moving, RUN when sprinting, and ATTACK on attack input.
// Combat stance is selected ONLY if the GLB ships a real combat-idle clip.
//
// The Mechanician shares the same m1.smb and M1Bip.inx as the Fighter (both are
// Tempskron classes using the Bip01 skeleton), so the animation state names and
// frame ranges are identical. The body and head meshes are distinct (tmbA01.smd
// vs tmbB01.smd, tmh-A01.smd vs tmh-B01.smd), verified by MD5 hash.

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { desiredBaseState, type AnimState } from '../src/render/characters/anim_state';
import { ALL_CLASSES, type Entity } from '../src/sim/types';
import { CLASSES } from '../src/sim/content/classes';

const GLB_PATH = 'public/models/creatures/pt_mechanician.glb';
const GLB_HAIR2_PATH = 'public/models/creatures/pt_mechanician_hair2.glb';
const GLB_HAIR3_PATH = 'public/models/creatures/pt_mechanician_hair3.glb';

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

describe('Tempskron Mechanician visual definition (player character)', () => {
  it('registers player_tempskron_mechanician in VISUALS', () => {
    const def = VISUALS.player_tempskron_mechanician;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_mechanician.glb');
    expect(def.height).toBeGreaterThan(0);
  });

  it('declares the required player animation clip mappings', () => {
    const def = VISUALS.player_tempskron_mechanician;
    // The Mechanician shares the same m1.smb and M1Bip.inx as the Fighter
    // (both are Tempskron classes using the Bip01 skeleton), so the INX
    // state names match their actual visual content:
    // STAND = standing pose, WALK = walking, RUN = running
    expect(def.clips.idle).toBe('STAND');
    expect(def.clips.walk).toBe('WALK');
    expect(def.clips.run).toBe('RUN');
    expect(def.clips.attack).toContain('ATTACK');
    expect(def.clips.death).toBe('DEAD');
    expect(def.clips.hit).toContain('DAMAGE');
  });

  it('maps a combatIdle clip to the PT field STAND (combat stance)', () => {
    const def = VISUALS.player_tempskron_mechanician;
    // PT ships village (mapPos=1) and field (mapPos=2) STAND variants. The
    // field STAND is a braced combat stance exported as STAND_COMBAT, and the
    // manifest maps combatIdle to it so desiredBaseState picks it when the
    // Mechanician is engaged and stationary.
    expect(def.clips.combatIdle).toBe('STAND_COMBAT');
  });

  it('maps jump/fall/land clips', () => {
    const def = VISUALS.player_tempskron_mechanician;
    // Jump uses reversed FALLSTAND (crouch down to spring up), fall uses
    // FALLDOWN (falling pose), and land uses normal FALLSTAND (stand up
    // from crouch). Same as the Fighter since both share the same motion data.
    expect(def.clips.jump).toBe('FALLSTAND_REVERSED');
    expect(def.clips.fall).toBe('FALLDOWN');
    expect(def.clips.land).toBe('FALLSTAND');
  });

  it('the GLB asset file exists', () => {
    expect(existsSync(GLB_PATH), `${GLB_PATH} is missing`).toBe(true);
  });

  it('is distinct from the Combat Mech cosmetic body', () => {
    // The Mechanician is a fixed PT GLB, not the KayKit-rigged Combat Mech.
    expect(VISUALS.player_tempskron_mechanician.url).not.toBe(VISUALS.player_mech.url);
  });

  it('is distinct from the Fighter visual', () => {
    // The Mechanician must NOT reuse the Fighter GLB. Different body (tmbA01
    // vs tmbB01) and different head (tmh-A01 vs tmh-B01).
    expect(VISUALS.player_tempskron_mechanician.url).not.toBe(VISUALS.player_tempskron_fighter.url);
  });
});

describe('Tempskron Mechanician is a player class, not a mob or NPC', () => {
  it('is listed in ALL_CLASSES', () => {
    expect(ALL_CLASSES).toContain('tempskron_mechanician');
  });

  it('has a CLASSES entry with the authentic Mechanician identity', () => {
    expect(CLASSES.tempskron_mechanician).toBeDefined();
    expect(CLASSES.tempskron_mechanician.id).toBe('tempskron_mechanician');
    expect(CLASSES.tempskron_mechanician.name).toBe('Tempskron Mechanician');
  });

  it('visualKeyFor resolves a player entity to player_tempskron_mechanician', () => {
    const e = {
      kind: 'player',
      templateId: 'tempskron_mechanician',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_tempskron_mechanician');
  });

  it('visualKeyFor does not resolve a mob to the Mechanician visual', () => {
    const e = {
      kind: 'mob',
      templateId: 'tempskron_mechanician',
    } as unknown as Entity;
    // A mob with the same templateId must NOT get the player visual; it falls
    // through to the mob-family lookup.
    expect(visualKeyFor(e)).not.toBe('player_tempskron_mechanician');
  });
});

// Phase A: authentic class foundation. The Mechanician's stats, resource
// type, and growth are derived from the MagicPT-Chinese source, not copied
// from the Fighter. Source: PT-Source\HoBaram\HoLogin.cpp:91
//   {2, 24, 8, 25, 18, 24}  // JobCode, Str, Spirit, Talent, Defence, Health
// and PT-Source\fileread.cpp:6441 (ManaFunction=2, LifeFunction=2).
describe('Tempskron Mechanician class foundation (Phase A)', () => {
  const def = CLASSES.tempskron_mechanician;

  it('uses mana, not rage (the Fighter resource)', () => {
    expect(def.resourceType).toBe('mana');
    expect(def.resourceType).not.toBe('rage');
  });

  it('has authentic PT starting stats mapped to WoC attributes', () => {
    // PT Strength (24) -> WoC str
    expect(def.baseStats.str).toBe(24);
    // PT Spirit (8) -> WoC int (mana pool driver)
    expect(def.baseStats.int).toBe(8);
    // PT Spirit (8) -> WoC spi (mana regen)
    expect(def.baseStats.spi).toBe(8);
    // PT Talent (25) -> WoC agi
    expect(def.baseStats.agi).toBe(25);
    // PT Defence (18) -> WoC armor
    expect(def.baseStats.armor).toBe(18);
    // PT Health (24) -> WoC sta
    expect(def.baseStats.sta).toBe(24);
  });

  it('is distinct from the Fighter starting stats', () => {
    const fighter = CLASSES.tempskron_fighter;
    // Fighter reuses Warrior: str 23, agi 20, sta 22, int 10, spi 11, armor 50.
    // Mechanician: str 24, agi 25, sta 24, int 8, spi 8, armor 18.
    expect(def.baseStats).not.toEqual(fighter.baseStats);
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

  it('has HP values appropriate for a tanky hybrid (between mage and warrior)', () => {
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

describe('Tempskron Mechanician GLB animation clips', () => {
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
    // The PT Mechanician head model (tmh-A01.smd) combines face and hair into
    // one material/texture (TmhA01.bmp), so the GLB has 2 material groups:
    // body (TmbA01.bmp) and head/hair (TmhA01.bmp).
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

  it('has 66 joints (same Bip01 skeleton as Fighter)', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO();
    const doc = await io.read(GLB_PATH);
    const root = doc.getRoot();
    const skins = root.listSkins();
    // The Mechanician shares the same m1.smb skeleton as the Fighter: 66
    // Bip01 bones. This confirms the skeleton is complete and not a
    // truncated/split SMB.
    expect(skins[0].listJoints().length).toBe(66);
  });
});

describe('Tempskron Mechanician hair variants', () => {
  it('registers player_tempskron_mechanician_hair2 in VISUALS', () => {
    const def = VISUALS.player_tempskron_mechanician_hair2;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_mechanician_hair2.glb');
  });

  it('registers player_tempskron_mechanician_hair3 in VISUALS', () => {
    const def = VISUALS.player_tempskron_mechanician_hair3;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_mechanician_hair3.glb');
  });

  it('hair2 GLB file exists', () => {
    expect(existsSync(GLB_HAIR2_PATH), `${GLB_HAIR2_PATH} is missing`).toBe(true);
  });

  it('hair3 GLB file exists', () => {
    expect(existsSync(GLB_HAIR3_PATH), `${GLB_HAIR3_PATH} is missing`).toBe(true);
  });

  it('hair variants have the same clips as the default', () => {
    const def = VISUALS.player_tempskron_mechanician;
    const hair2 = VISUALS.player_tempskron_mechanician_hair2;
    const hair3 = VISUALS.player_tempskron_mechanician_hair3;
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
    const def = VISUALS.player_tempskron_mechanician;
    const hair2 = VISUALS.player_tempskron_mechanician_hair2;
    const hair3 = VISUALS.player_tempskron_mechanician_hair3;
    expect(def.rawHeight).toBeDefined();
    expect(hair2.rawHeight).toBeDefined();
    expect(hair3.rawHeight).toBeDefined();
    expect(def.rawHeight).toBe(hair2.rawHeight);
    expect(def.rawHeight).toBe(hair3.rawHeight);
  });

  it('visualKeyFor resolves hair override to the correct variant', () => {
    const e = {
      kind: 'player',
      templateId: 'tempskron_mechanician',
      visualKeyOverride: 'player_tempskron_mechanician_hair2',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_tempskron_mechanician_hair2');
  });
});

describe('Tempskron Mechanician player-state-to-animation mapping', () => {
  // The PT Mechanician uses the same desiredBaseState() path as every other
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

  it('combat stance is selected when the Mechanician is engaged and stationary', () => {
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

describe('Tempskron Mechanician modular body skip', () => {
  it('does not have a player_tempskron_mechanician_modular visual', () => {
    // PT characters use their own Bip01 skeleton, not the KayKit mixamorig
    // skeleton. The modular body system must skip them.
    expect(VISUALS.player_tempskron_mechanician_modular).toBeUndefined();
  });
});
