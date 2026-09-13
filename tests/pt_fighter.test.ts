// Focused tests for the Tempskron Fighter PT character conversion proof-of-concept.
// Verifies the Fighter visual definition, GLB asset, and animation clip mappings
// are wired correctly for use as a PLAYER character (not a mob).
//
// Also pins the player-state-to-animation mapping: the PT Fighter must use the
// same desiredBaseState() path as every other player class, selecting STAND when
// stationary, WALK when moving, RUN when sprinting, and ATTACK on attack input.
// Combat stance is selected ONLY if the GLB ships a real combat-idle clip.

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { desiredBaseState, type AnimState } from '../src/render/characters/anim_state';
import { ALL_CLASSES, type Entity } from '../src/sim/types';
import { CLASSES } from '../src/sim/content/classes';
import { BIND_ACTIONS } from '../src/game/keybinds';
import {
  toggleGaitMode,
  effectiveRunning,
  loadGaitMode,
  saveGaitMode,
  DEFAULT_GAIT_MODE,
} from '../src/game/run_walk_toggle';

const GLB_PATH = 'public/models/creatures/pt_fighter.glb';

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

describe('Tempskron Fighter visual definition (player character)', () => {
  it('registers player_tempskron_fighter in VISUALS', () => {
    const def = VISUALS.player_tempskron_fighter;
    expect(def).toBeDefined();
    expect(def.url).toBe('models/creatures/pt_fighter.glb');
    expect(def.height).toBeGreaterThan(0);
  });

  it('declares the required player animation clip mappings', () => {
    const def = VISUALS.player_tempskron_fighter;
    // With the complete m1.smb motion file, the INX state names match their
    // actual visual content (confirmed by user review):
    // STAND = standing pose, WALK = walking, RUN = running
    expect(def.clips.idle).toBe('STAND');
    expect(def.clips.walk).toBe('WALK');
    expect(def.clips.run).toBe('RUN');
    expect(def.clips.attack).toContain('ATTACK');
    expect(def.clips.death).toBe('DEAD');
    expect(def.clips.hit).toContain('DAMAGE');
  });

  it('maps a combatIdle clip to the PT field STAND (combat stance)', () => {
    const def = VISUALS.player_tempskron_fighter;
    // PT ships village (mapPos=1) and field (mapPos=2) STAND variants. The
    // field STAND is a braced combat stance exported as STAND_COMBAT, and the
    // manifest maps combatIdle to it so desiredBaseState picks it when the
    // Fighter is engaged and stationary.
    expect(def.clips.combatIdle).toBe('STAND_COMBAT');
  });

  it('the GLB asset file exists', () => {
    expect(existsSync(GLB_PATH), `${GLB_PATH} is missing`).toBe(true);
  });

  it('is distinct from the Combat Mech cosmetic body', () => {
    // The Fighter is a fixed PT GLB, not the KayKit-rigged Combat Mech.
    expect(VISUALS.player_tempskron_fighter.url).not.toBe(VISUALS.player_mech.url);
  });
});

describe('Tempskron Fighter is a player class, not a mob or NPC', () => {
  it('is listed in ALL_CLASSES', () => {
    expect(ALL_CLASSES).toContain('tempskron_fighter');
  });

  it('has a CLASSES entry with the warrior data set', () => {
    expect(CLASSES.tempskron_fighter).toBeDefined();
    expect(CLASSES.tempskron_fighter.id).toBe('tempskron_fighter');
    expect(CLASSES.tempskron_fighter.name).toBe('Tempskron Fighter');
  });

  it('visualKeyFor resolves a player entity to player_tempskron_fighter', () => {
    const e = {
      kind: 'player',
      templateId: 'tempskron_fighter',
      skinCatalog: null,
      mountKey: null,
    } as unknown as Entity;
    expect(visualKeyFor(e)).toBe('player_tempskron_fighter');
  });

  it('visualKeyFor does not resolve a mob to the Fighter visual', () => {
    const e = {
      kind: 'mob',
      templateId: 'tempskron_fighter',
    } as unknown as Entity;
    // A mob with the same templateId must NOT get the player visual; it falls
    // through to the mob-family lookup.
    expect(visualKeyFor(e)).not.toBe('player_tempskron_fighter');
  });
});

describe('Tempskron Fighter GLB animation clips', () => {
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

  it('does not contain a Mechanician-specific combat-stance clip', async () => {
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
    // The PT Fighter head model (tmh-B01.smd) combines face and hair into one
    // material/texture (TmhB01.bmp), so the GLB has 2 material groups: body
    // (TmbB01.bmp) and head/hair (TmhB01.bmp). Older assemblies split hair into
    // a separate texture; the character-select head model does not.
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
});

describe('Tempskron Fighter player-state-to-animation mapping', () => {
  // The PT Fighter uses the same desiredBaseState() path as every other player
  // class. The clip availability flags match the manifest: no walkBack, no
  // wade, but combatIdle IS now available (STAND_COMBAT from the PT field STAND).
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

  it('sprinting player selects run (RUN = running with axe)', () => {
    const s = animState({ moving: true, running: true, speed: 7 });
    expect(desiredBaseState(s, hasWalkBack, hasWade, hasCombatIdle)).toBe('run');
  });

  it('attack input is a one-shot (ATTACK), not a base state', () => {
    // desiredBaseState never returns 'attack': attacks are one-shots driven by
    // playAttack(), which plays the ATTACK clip and returns to the base state
    // on finish. The base state during the swing is whatever the player is
    // doing (idle if stationary, walk/run if moving).
    const stationary = animState({ moving: false });
    const moving = animState({ moving: true, running: false, speed: 3 });
    const states = new Set<string>();
    states.add(desiredBaseState(stationary, hasWalkBack, hasWade, hasCombatIdle));
    states.add(desiredBaseState(moving, hasWalkBack, hasWade, hasCombatIdle));
    expect(states.has('attack')).toBe(false);
  });

  it('attack completion returns to idle when stationary', () => {
    // After the ATTACK one-shot finishes, onFinished() fades back to
    // baseAction(), which is desiredBaseState(). A stationary player returns
    // to 'idle' (which plays the WALK clip, the relaxed standing pose).
    const s = animState({ moving: false });
    expect(desiredBaseState(s, hasWalkBack, hasWade, hasCombatIdle)).toBe('idle');
  });

  it('attack completion returns to walk when moving', () => {
    // A player who was moving when the attack finished returns to 'walk'.
    const s = animState({ moving: true, running: false, speed: 3 });
    expect(desiredBaseState(s, hasWalkBack, hasWade, hasCombatIdle)).toBe('walk');
  });

  it('combat stance is selected when the Fighter is engaged and stationary', () => {
    // The PT GLB ships STAND_COMBAT (the PT field STAND, mapPos=2), so when
    // the Fighter is engaged (combat=true) and stationary, desiredBaseState
    // returns 'combatIdle' and the renderer plays the braced combat stance
    // instead of the relaxed village idle.
    const s = animState({ moving: false, combat: true });
    expect(desiredBaseState(s, hasWalkBack, hasWade, hasCombatIdle)).toBe('combatIdle');
  });

  it('non-combat stationary player stays on idle, not combatIdle', () => {
    // When not engaged (combat=false), a stationary player holds the relaxed
    // standing pose (idle state, WALK clip), not the combat stance.
    const s = animState({ moving: false, combat: false });
    expect(desiredBaseState(s, hasWalkBack, hasWade, hasCombatIdle)).toBe('idle');
  });

  it('stopping transitions from walk to idle (not stuck on STAND)', () => {
    // The WALK-stuck bug: a player who stops moving must transition from
    // 'walk' to 'idle'. desiredBaseState returns 'idle' when moving=false.
    const walking = animState({ moving: true, running: false, speed: 3 });
    const stopped = animState({ moving: false, speed: 0 });
    expect(desiredBaseState(walking, hasWalkBack, hasWade, hasCombatIdle)).toBe('walk');
    expect(desiredBaseState(stopped, hasWalkBack, hasWade, hasCombatIdle)).toBe('idle');
  });
});

describe('Run/walk gait toggle (KeyR)', () => {
  // Tests for the pure run/walk toggle logic (src/game/run_walk_toggle.ts).
  // The toggle is a per-character persisted state that, when set to 'walk',
  // forces the locomotion gait to walk regardless of speed.

  it('defaults to run mode', () => {
    expect(DEFAULT_GAIT_MODE).toBe('run');
  });

  it('toggles between run and walk', () => {
    expect(toggleGaitMode('run')).toBe('walk');
    expect(toggleGaitMode('walk')).toBe('run');
  });

  it('forces running=false when gait mode is walk', () => {
    expect(effectiveRunning('walk', true)).toBe(false);
    expect(effectiveRunning('walk', false)).toBe(false);
  });

  it('preserves the hysteresis running flag when gait mode is run', () => {
    expect(effectiveRunning('run', true)).toBe(true);
    expect(effectiveRunning('run', false)).toBe(false);
  });

  it('persists and loads the gait mode from storage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage;
    expect(loadGaitMode(storage)).toBe('run');
    saveGaitMode(storage, 'walk');
    expect(loadGaitMode(storage)).toBe('walk');
    saveGaitMode(storage, 'run');
    expect(loadGaitMode(storage)).toBe('run');
  });

  it('returns the default when storage is unavailable', () => {
    expect(loadGaitMode(null)).toBe('run');
    expect(loadGaitMode(undefined)).toBe('run');
  });

  it('returns the default for invalid stored values', () => {
    const store = new Map<string, string>([['woc_run_walk_mode', 'invalid']]);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage;
    expect(loadGaitMode(storage)).toBe('run');
  });
});

describe('Run/walk keybind binding', () => {
  it('binds toggleRunWalk to KeyR by default', () => {
    const action = BIND_ACTIONS.find((a) => a.id === 'toggleRunWalk');
    expect(action).toBeDefined();
    expect(action!.defaults).toContain('KeyR');
    expect(action!.kind).toBe('edge');
    expect(action!.category).toBe('Movement');
  });

  it('moves autorun to Shift+KeyR (no longer bare KeyR)', () => {
    const autorun = BIND_ACTIONS.find((a) => a.id === 'autorun');
    expect(autorun).toBeDefined();
    expect(autorun!.defaults).toContain('Shift+KeyR');
    expect(autorun!.defaults).not.toContain('KeyR');
  });
});

describe('Tempskron Fighter hair variants share the body scale', () => {
  it('all variants share the same rawHeight for consistent body scale', () => {
    // rawHeight is pinned across ALL variants (default + hair2 + hair3) so
    // the body scale stays constant across hair swaps. Without pinning the
    // default, it measures its posed skinned bounds dynamically (which
    // differs from the hair variants' pinned value), so switching hair
    // changes the body size in character selection.
    const def = VISUALS.player_tempskron_fighter;
    const hair2 = VISUALS.player_tempskron_fighter_hair2;
    const hair3 = VISUALS.player_tempskron_fighter_hair3;
    expect(def.rawHeight).toBeDefined();
    expect(hair2.rawHeight).toBeDefined();
    expect(hair3.rawHeight).toBeDefined();
    expect(def.rawHeight).toBe(hair2.rawHeight);
    expect(def.rawHeight).toBe(hair3.rawHeight);
  });
});
