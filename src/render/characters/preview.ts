import * as THREE from 'three';
import { CLASSES } from '../../sim/data';
import type { PlayerClass } from '../../sim/types';
import { GPU_WORK_PRIORITY } from '../background_gpu_queue';
import { trackWebGLContext } from '../context_release';
import { gpuPrepNow, recordGpuPrepEvent } from '../gpu_prep_events';
import {
  type LinkedProgramTouchQueue,
  PREVIEW_LINKED_PROGRAM_TOUCH_LABEL,
  runLinkedProgramTouchLane,
} from '../linked_program_touch_lane';
import { shaderDebugRequested } from '../shader_debug_flag';
import {
  collectPrewarmTextures,
  uploadTexturesInSlices,
  yieldToMainThread,
} from '../texture_prewarm';
import { mechAssetsReady, preloadMechAssets } from './assets';
import { modularVisualKey, VISUALS, type WeaponLayoutOverride } from './manifest';
import {
  type ArmorLoadout,
  type ModularAppearance,
  type ModularLook,
  modularBuildSignature,
} from './modular';
import {
  appearanceSignature,
  type PreviewAppearance,
  previewAppearanceVisual,
} from './preview_appearance';
import { PREVIEW_FRAMING, type PreviewFramingName } from './preview_framing';
import { createPreviewOpenGate, type PreviewOpenGate } from './preview_open_gate_core';
import { characterPreviewFrameVisible, resolveCharacterPreviewPolicy } from './preview_policy';
import { stagePresentationTarget } from './formation';
import { CharacterVisual } from './visual';

export type { PreviewAppearance } from './preview_appearance';

/** The 2D layer the HUD paints over the empty canvas while the open gate
 *  holds. Structural on purpose: the DOM lives in src/ui/preview_stand_in.ts,
 *  so nothing here reaches into the UI layer. */
export interface PreviewOpenStandIn {
  show(): void;
  hide(): void;
}

/** The gpu-prep key the bounded escape records under. The existing
 *  `gate-timeout` KIND is reused rather than minting a preview-specific one:
 *  it already means "a compile gate's bounded fail-soft escape fired", which
 *  is exactly this, and every capture reader, perf-overlay row and test that
 *  enumerates GpuPrepEventKind keeps working with the union at four members. */
export const PREVIEW_OPEN_ESCAPE_EVENT_KEY = 'preview-open';

export interface CharacterPreviewPose {
  clips: readonly string[];
  fraction: number;
}

export interface CharacterPreviewOptions {
  constrainedMemory?: boolean;
}

const PREVIEW_ANIM_STATE = {
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
};

const LIVE_PREVIEW_X = 0;

/** Walk duration in seconds for the formation-to-center presentation walk. */
const FORMATION_WALK_DURATION_S = 0.9;

/** AnimState fed to CharacterVisual.update while the formation walk is active.
 *  `moving: true` selects the walk clip per the existing semantic mapping. */
const PREVIEW_WALK_STATE = {
  ...PREVIEW_ANIM_STATE,
  moving: true,
  speed: 3.5,
} as const;

// -------------------------------------------------------------------------
// Stage: 3D character-select stage with authentic PT walking.
//
// Characters stand in a permanent horizontal row (their HOME positions).
// The selected character WALKS toward the presentation point (centered X,
// forward Z — see stagePresentationTarget in formation.ts), playing the
// real MagicPT WALK clip and facing its movement direction. On arrival it
// stops and enters the PT STAND (idle) clip. When another character is
// selected, the previous one WALKS back to its home while the new one
// WALKS toward the presentation point simultaneously. Scale emphasis
// settles in only after arrival — no pop.
// -------------------------------------------------------------------------

/** Modest scale of the selected (focus) character after arrival. */
const STAGE_FOCUS_SCALE = 1.08;
/** Scale of the background (unselected) characters. */
const STAGE_BACKGROUND_SCALE = 0.92;
/** Walking speed in world units per second (diagonal X+Z). */
const STAGE_WALK_SPEED = 3.0;
/** Scale lerp speed: how fast the scale emphasis settles after arrival. */
const STAGE_SCALE_LERP_SPEED = 4.0;
/** Position arrival threshold (world units) to consider the walk done. */
const STAGE_ARRIVAL_THRESHOLD = 0.03;
/** Rotation lerp speed for facing the movement direction. */
const STAGE_FACING_LERP_SPEED = 8.0;
/** Oscillation frequency (radians/sec) for the selected character's rotation. */
const STAGE_OSCILLATION_FREQ = 0.8;
/** Oscillation amplitude (radians, ~±29 degrees). */
const STAGE_OSCILLATION_AMP = 0.5;

/** Walk direction: forward toward center, or back toward home. */
type StageWalkDir = 'forward' | 'back' | null;

/** Shortest-angle lerp between two yaw values (radians). */
function lerpAngle(current: number, target: number, t: number): number {
  let diff = target - current;
  // Wrap to [-PI, PI] for the shortest rotation.
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * t;
}

/**
 * A persistent stage member in the 3D character-select stage. Each member
 * has a permanent HOME position (its slot in the background row). When
 * selected, the character WALKS toward the CENTER of the stage (X=0, Z=0),
 * facing its movement direction; when deselected, it WALKS back to its
 * home. The animate loop drives the physical movement at a fixed speed
 * and switches the animation between the PT WALK clip (while moving) and
 * the PT STAND/idle clip (at rest).
 */
interface StageMember {
  visual: CharacterVisual;
  classId: string;
  // Permanent HOME position: the character's slot in the background row.
  homeX: number;
  homeZ: number;
  // Target X/Z: where this character is currently walking toward (home or
  // center). When idle, these equal homeX/homeZ.
  targetX: number;
  targetZ: number;
  // Target scale: settles in after arrival (no pop).
  targetScale: number;
  // Current animated scale (lerped toward targetScale).
  currentScale: number;
  // Walk state: 'forward' = walking to center, 'back' = walking home,
  // null = arrived/idle.
  walkDir: StageWalkDir;
  // Whether this member is currently selected.
  selected: boolean;
}

export class CharacterPreview {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private characterGroup: THREE.Group;
  private currentVisual: CharacterVisual | null = null;
  private currentVisualSig: string | null = null;
  // Formation: background characters standing in the scene while the selected
  // character presents at the center. Each entry is a CharacterVisual rooted
  // under formationGroup. Cleared by clearFormation().
  private formationGroup: THREE.Group;
  private formationVisuals: CharacterVisual[] = [];
  // Stage: persistent tribe formation. All characters live here with rest
  // positions; the selected one moves forward, scales up, and receives a
  // spotlight. When the stage is active, characterGroup/formationGroup
  // are unused.
  private stageGroup: THREE.Group;
  private stageMembers: StageMember[] = [];
  private stageSelectedClass: string | null = null;
  // Presentation target for the selected character, computed from the
  // formation size when the stage is built. Centered on X and sufficiently
  // forward in Z to be clearly in front of every formation member.
  private stagePresentationX = 0;
  private stagePresentationZ = 0;
  private stageElapsed = 0; // for oscillation sine wave
  private stageSpotlight: THREE.SpotLight | null = null;
  private stageSpotlightTarget: THREE.Object3D | null = null;
  private raycaster = new THREE.Raycaster();
  private stageClickCallback: ((classId: string) => void) | null = null;
  // Inline formation-walk state (legacy, used when stage is NOT active).
  private walkPhase: 'idle' | 'walking' = 'idle';
  private walkStartX = 0;
  private walkStartZ = 0;
  private walkElapsed = 0;
  private currentSkin = 0;
  // The active Armory weapon-skin cosmetic, persisted across visual rebuilds
  // exactly like currentSkin so a class/appearance swap keeps the skinned
  // weapon (the in-world renderer and the store preview both apply it; the
  // paperdoll must match or a purchased skin reads as missing).
  private currentWeaponSkinId: string | null = null;
  // Identity of the appearance last requested via setAppearance, so an async mech
  // re-apply can bail out if a newer selection superseded it.
  private appearanceSig: string | null = null;
  /** Look handed to the next modular rebuild (setVisualKey reads it back). */
  private pendingLook: ModularLook | null = null;
  // THREE.Timer, not the r183-deprecated Clock: update() advances it once per
  // frame, reset() re-anchors it after a non-animating span (Clock's
  // discard-getDelta drain pattern).
  private timer = new THREE.Timer();
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unregisterContext: (() => void) | null = null;
  private cleanupDragControls: (() => void) | null = null;
  // Player-card shots render into a fixed offscreen target. Resizing the live
  // WebGL canvas forced a synchronous framebuffer reallocation (up to ~85 ms on
  // mobile GPUs) on every pose change. The target and readback buffer are kept
  // warm instead, and captures are serialized so concurrent pose clicks cannot
  // overwrite a readback that is still in flight.
  private captureTarget: THREE.WebGLRenderTarget | null = null;
  private capturePixels: Uint8Array | null = null;
  private captureQueue: Promise<void> = Promise.resolve();
  private closeupCache = new Map<string, HTMLCanvasElement>();
  // ResizeObserver owns this flag: a preview moved below a display:none window
  // keeps one cheap rAF subscription but performs no animation or WebGL work.
  private renderActive = false;
  // Set while prewarm() owns the renderer's buffer size for a warmup pass.
  private prewarming = false;
  // The latest activation request (from setContainer/the resize observer,
  // via syncSize) that arrived while prewarming; applied by prewarm's finally
  // instead of the renderActive it captured at entry, so a window opened or
  // closed mid-warmup is never clobbered back to a stale snapshot.
  private pendingActive: boolean | null = null;
  // The cold-open gate: while it is armed, both live draw sites (syncSize and
  // the animate loop) withhold their render and the HUD's stand-in covers the
  // empty canvas. It also carries the linked signature prewarm() shares.
  private openGate: PreviewOpenGate = createPreviewOpenGate();
  private standIn: PreviewOpenStandIn | null = null;
  // The WORLD renderer's background GPU queue, injected by the HUD. Right on a
  // foreign context because the queue arbitrates MAIN-THREAD time, not
  // programs: a getUniforms/getAttributes round trip blocks the same thread
  // and the same frame whichever context owns the program.
  private touchQueue: LinkedProgramTouchQueue | null = null;
  private yieldToMain: () => Promise<void> = yieldToMainThread;
  private destroyed = false;
  // Drag controls
  private isDragging = false;
  private previousMouseX = 0;

  constructor(
    container: HTMLElement,
    canvas: HTMLCanvasElement,
    options: CharacterPreviewOptions = {},
  ) {
    this.container = container;
    this.canvas = canvas;
    const policy = resolveCharacterPreviewPolicy(options.constrainedMemory === true);

    // 1. Initialize WebGLRenderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: policy.antialias,
      preserveDrawingBuffer: policy.preserveDrawingBuffer,
    });
    this.renderer.debug.checkShaderErrors = shaderDebugRequested();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, policy.pixelRatioCap));
    const initialWidth = this.container.clientWidth;
    const initialHeight = this.container.clientHeight;
    this.renderer.setSize(initialWidth, initialHeight, false);
    this.renderActive = initialWidth > 0 && initialHeight > 0;
    this.renderer.shadowMap.enabled = false; // Preview doesn't need heavy shadows
    // Hand this context back on page teardown (see context_release.ts).
    this.unregisterContext = trackWebGLContext(this.renderer);

    // 2. Initialize Scene
    this.scene = new THREE.Scene();

    // 3. Initialize Camera
    const aspect =
      this.container.clientHeight > 0
        ? this.container.clientWidth / this.container.clientHeight
        : 1;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    // Default to the self character-sheet framing; the inspect window switches to
    // its pulled-back framing via setFraming('inspect') on mount.
    this.applyFraming(PREVIEW_FRAMING.sheet);

    // 4. Initialize Character Group
    this.characterGroup = new THREE.Group();
    this.scene.add(this.characterGroup);
    // Formation group: holds background characters in the tribe formation.
    // Added before the characterGroup so the selected character renders on top.
    this.formationGroup = new THREE.Group();
    this.scene.add(this.formationGroup);
    // Stage group: persistent tribe formation for the clickable 3D
    // character selector. All characters live here with rest positions;
    // the selected one moves forward, scales up, and receives a spotlight.
    this.stageGroup = new THREE.Group();
    this.scene.add(this.stageGroup);
    // Stage spotlight: follows the selected character to visually
    // emphasize it (Jere Codes inspired). Hidden until the stage is
    // active and a character is selected.
    this.stageSpotlightTarget = new THREE.Object3D();
    this.scene.add(this.stageSpotlightTarget);
    this.stageSpotlight = new THREE.SpotLight(
      0xffffff,
      0, // intensity set when a character is selected
      12, // distance
      Math.PI / 6, // angle (~30 degrees)
      0.5, // penumbra
      1.5, // decay
    );
    this.stageSpotlight.position.set(0, 5, 2);
    this.stageSpotlight.target = this.stageSpotlightTarget;
    this.stageSpotlight.visible = false;
    this.scene.add(this.stageSpotlight);

    // 5. Add Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
    this.scene.add(hemiLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight1.position.set(3, 5, 4);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight2.position.set(-3, 3, -4);
    this.scene.add(dirLight2);

    // 6. Setup Drag Controls
    this.setupDragControls();

    // 7. Setup Resize Observer
    this.setupResizeObserver();

    // 8. Start loop
    this.animate();
  }

  /** Set the active character model by player class. Pass explicit hand ids for a
   *  character sheet; omit them to show the class starter equipment in creation. */
  setClass(cls: PlayerClass, weaponItemId?: string | null, offhandItemId?: string | null): void {
    if (this.destroyed) return;
    // A class-driven selection (create/offline picker, or a panel switch) supersedes
    // any pending async mech re-apply, so invalidate the tracked appearance.
    this.appearanceSig = null;
    const weapon = weaponItemId !== undefined ? weaponItemId : (CLASSES[cls].startWeapon ?? null);
    const offhand =
      offhandItemId !== undefined ? offhandItemId : (CLASSES[cls].startOffhand ?? null);
    this.setVisualKey(`player_${cls}`, weapon, null, offhand);
  }

  /** Show a character's real, in-world appearance: the class rig or the Combat Mech
   *  cosmetic body, its appearance skin, and the actually-equipped hands. Mirrors
   *  createCharacterVisual so the char-select roster and character sheet match the
   *  world. The mech's cosmetic assets load
   *  lazily; while they are not ready this shows the class body and re-applies once
   *  loaded, unless a newer selection has superseded this one. */
  setAppearance(a: PreviewAppearance): void {
    if (this.destroyed) return;
    this.currentSkin = a.skin;
    this.currentWeaponSkinId = a.weaponSkinId ?? null;
    const sig = appearanceSignature(a);
    this.appearanceSig = sig;
    if (a.skinCatalog === 'mech' && !mechAssetsReady()) {
      this.setVisualKey(`player_${a.cls}`, a.mainhandItemId ?? null, null, a.offhandItemId ?? null);
      this.currentVisual?.setSkin(a.skin);
      void preloadMechAssets().then(() => {
        if (!this.destroyed && this.appearanceSig === sig) this.setAppearance(a);
      });
      return;
    }
    const v = previewAppearanceVisual(a);
    this.setVisualKey(v.visualKey, v.weaponItemId, v.weaponOverride, v.offhandItemId);
    // setVisualKey is intentionally idempotent. If only the skin changed, keep
    // the warm rig and update its shared material bindings in place.
    this.currentVisual?.setSkin(a.skin);
  }

  /** Set the active model by raw visual key (e.g. `player_mech` for the cosmetic
   *  turntable). The asset must already be loaded — callers preload first.
   *  `weaponOverride` lets a cosmetic body adopt a class hand layout (including
   *  shields and dual wield), matching the in-world render. */
  /** Show the composed modular body (character creation's live turntable) for
   *  a class: its modular def carries the class clips and hand layout, and the
   *  starter weapons default from the class. Any change to gender/hair/brows/
   *  colour is a geometry or material change on a shared cached variant, so
   *  this just rebuilds, the variant cache makes a repeat selection nearly
   *  free. */
  setModular(
    app: ModularAppearance,
    worn: ArmorLoadout = {},
    cls: PlayerClass = 'warrior',
    weaponItemId?: string | null,
    // Both hands default to the class starters (creation, where nothing is
    // equipped yet). The character sheet passes what is ACTUALLY worn, so the
    // composed turntable holds the same shield / dual wield the world draws.
    offhandItemId?: string | null,
  ): void {
    if (this.destroyed) return;
    this.appearanceSig = null;
    this.pendingLook = { app, worn };
    const weapon = weaponItemId !== undefined ? weaponItemId : (CLASSES[cls].startWeapon ?? null);
    const offhand =
      offhandItemId !== undefined ? offhandItemId : (CLASSES[cls].startOffhand ?? null);
    this.setVisualKey(modularVisualKey(cls), weapon, null, offhand);
    // The face/body sliders ride the live body rather than the rebuild
    // signature (see modularBuildSignature): the creator emits on every `input`
    // event, so a drag would otherwise dispose and recompose the character per
    // 5% step. Harmless after a rebuild, which composed with these already.
    this.currentVisual?.applyModularSliders(app);
  }

  setVisualKey(
    visualKey: string,
    weaponItemId: string | null = null,
    weaponOverride: WeaponLayoutOverride | null = null,
    offhandItemId: string | null = null,
  ): void {
    if (this.destroyed) return;
    const look = VISUALS[visualKey]?.modular ? this.pendingLook : null;
    const nextSig = JSON.stringify([
      visualKey,
      weaponItemId,
      weaponOverride,
      offhandItemId,
      look ? modularBuildSignature(look.app, look.worn) : null,
    ]);
    if (this.currentVisual && this.currentVisualSig === nextSig) return;
    this.closeupCache.clear();
    if (this.currentVisual) {
      // CharacterVisual keeps shared geometry/material caches but owns its
      // mixer and cloned skeleton bone textures, so a genuine replacement must
      // release those resources.
      this.characterGroup.remove(this.currentVisual.root);
      this.currentVisual.dispose();
      this.currentVisual = null;
      // three releases a program with the last material holding it, so a
      // signature linked before this rebuild can be cold again afterwards:
      // the gate must not skip the warm on a return to an old look.
      this.openGate.forgetLinked();
    }
    this.currentVisualSig = null;

    try {
      this.currentVisual = new CharacterVisual(
        visualKey,
        0xffffff,
        this.currentSkin,
        weaponItemId,
        weaponOverride,
        offhandItemId,
        look,
      );
      this.currentVisualSig = nextSig;
      this.characterGroup.add(this.currentVisual.root);
      // Re-apply the persisted weapon-skin cosmetic to the rebuilt visual (the
      // constructor attaches the equipped item's own model).
      if (this.currentWeaponSkinId) this.currentVisual.setWeaponSkin(this.currentWeaponSkinId);

      // Reset rotation on a class swap so every new character greets the player
      // FACE-ON (the classic character-screen pose); dragging still spins freely.
      this.characterGroup.rotation.y = 0;
    } catch (err) {
      console.error(`Failed to load preview character visual for ${visualKey}:`, err);
    }
  }

  /** Apply or clear the Armory weapon-skin cosmetic; persists across
   *  setClass/setVisualKey rebuilds like the body skin. */
  setWeaponSkin(weaponSkinId: string | null): void {
    if (this.destroyed) return;
    this.currentWeaponSkinId = weaponSkinId;
    this.currentVisual?.setWeaponSkin(weaponSkinId);
  }

  /** Start the formation-to-center presentation walk. The characterGroup is
   *  snapped to the formation slot (startX, startZ) immediately, then the
   *  animate loop lerps it to (0, 0) over FORMATION_WALK_DURATION_S seconds
   *  using easeOutQuad. While walking, the walk clip plays (`moving: true`);
   *  on arrival, the character enters idle.
   *
   *  Call this AFTER setClass/setVisualKey so the correct visual is mounted.
   *  Do NOT call it for a hair change: hair swaps preserve the current
   *  position and idle state. */
  startFormationWalk(startX: number, startZ: number): void {
    if (this.destroyed) return;
    this.walkPhase = 'walking';
    this.walkStartX = startX;
    this.walkStartZ = startZ;
    this.walkElapsed = 0;
    // Snap to the formation slot immediately so there is no single-frame
    // flash at the previous center position.
    this.characterGroup.position.x = startX;
    this.characterGroup.position.z = startZ;
  }

  /**
   * Populate the formation background with the given characters at the given
   * formation slots. Each entry renders a CharacterVisual at its slot's X/Z.
   * The selected character (selectedClass) is NOT included in the formation
   * (it presents at the center via characterGroup); the formation holds the
   * OTHER characters so the player sees the full tribe standing in the scene.
   *
   * Pass an empty array (or call clearFormation()) to remove all background
   * characters.
   */
  setFormation(
    entries: readonly {
      readonly visualKey: string;
      readonly x: number;
      readonly z: number;
    }[],
  ): void {
    if (this.destroyed) return;
    this.clearFormation();
    for (const e of entries) {
      try {
        const v = new CharacterVisual(e.visualKey, 0xffffff, 0, null, null, null, null);
        v.root.position.set(e.x, 0, e.z);
        this.formationGroup.add(v.root);
        this.formationVisuals.push(v);
      } catch (err) {
        console.warn(`[preview] formation visual ${e.visualKey} failed:`, err);
      }
    }
  }

  /** Remove all formation background characters and dispose their resources. */
  clearFormation(): void {
    if (this.destroyed) return;
    for (const v of this.formationVisuals) {
      this.formationGroup.remove(v.root);
      v.dispose();
    }
    this.formationVisuals = [];
  }

  // -------------------------------------------------------------------------
  // Stage: Jere Codes-inspired 3D character-select stage.
  //
  // All tribe characters live as StageMembers in stageGroup, each with a
  // rest position in a horizontal row. The selected member's target moves
  // it forward (z → 0), scales it up, and the spotlight follows it;
  // background members' targets keep them in the row at a smaller scale.
  // The animate loop lerps each member toward its target every frame
  // (asymptotic ease-out). Clicking a member (via raycasting) selects it.
  // The formation is created once per tribe and NEVER rebuilt on click.
  // -------------------------------------------------------------------------

  /**
   * Create the persistent stage: one StageMember per entry, each at its
   * rest position in the background row. The first entry is auto-selected
   * (moves forward, scales up, spotlight). Disposes any previous stage.
   */
  setStageFormation(
    entries: readonly {
      readonly cls: string;
      readonly visualKey: string;
      readonly x: number;
      readonly z: number;
    }[],
  ): void {
    if (this.destroyed) return;
    this.clearStage();
    // Hide the legacy character/formation groups so they don't render over
    // the stage.
    this.characterGroup.visible = false;
    this.formationGroup.visible = false;

    // Compute the presentation target for this formation size. Centered on
    // X and sufficiently forward in Z that the selected character is clearly
    // in front of every formation member — including the middle character of
    // a 3-member formation, whose home X is also 0.
    const target = stagePresentationTarget(entries.length);
    this.stagePresentationX = target.x;
    this.stagePresentationZ = target.z;

    for (const e of entries) {
      try {
        const visual = new CharacterVisual(
          e.visualKey,
          0xffffff,
          0,
          null,
          null,
          null,
          null,
        );
        visual.root.position.set(e.x, 0, e.z);
        visual.root.scale.setScalar(1);
        this.stageGroup.add(visual.root);
        this.stageMembers.push({
          visual,
          classId: e.cls,
          homeX: e.x,
          homeZ: e.z,
          targetX: e.x,
          targetZ: e.z,
          targetScale: 1,
          currentScale: 1,
          walkDir: null,
          selected: false,
        });
      } catch (err) {
        console.warn(`[preview] stage visual ${e.visualKey} failed:`, err);
      }
    }
    // No automatic selection: every character stays at its HOME position in
    // formation idle until the player explicitly clicks one. The spotlight
    // stays off until a selection exists.
  }

  /** Remove all stage members and dispose their resources. */
  clearStage(): void {
    if (this.destroyed) return;
    for (const m of this.stageMembers) {
      this.stageGroup.remove(m.visual.root);
      m.visual.dispose();
    }
    this.stageMembers = [];
    this.stageSelectedClass = null;
    this.stagePresentationX = 0;
    this.stagePresentationZ = 0;
    // The stage shares `currentVisual` with the single-character path
    // (setVisualKey/setAppearance/setModular). When the stage was built
    // while a characterGroup visual was already mounted, that visual was
    // orphaned here (currentVisual=null without removal), so a later
    // setVisualKey — seeing currentVisual=null — skipped the dispose step
    // and added a NEW visual alongside the orphan, stacking them. If the
    // current visual lives in characterGroup (a non-stage character from a
    // previous setAppearance/setModular), dispose it now so setVisualKey
    // starts from a clean group. A stage member's root lives in stageGroup
    // and was already disposed above, so this check skips it.
    if (this.currentVisual && this.currentVisual.root.parent === this.characterGroup) {
      this.characterGroup.remove(this.currentVisual.root);
      this.currentVisual.dispose();
    }
    this.currentVisual = null;
    this.currentVisualSig = null;
    if (this.stageSpotlight) this.stageSpotlight.visible = false;
    // Restore legacy group visibility for non-stage panels.
    this.characterGroup.visible = true;
    this.formationGroup.visible = true;
  }

  /** The class currently selected on the stage, or null. */
  getStageSelectedClass(): string | null {
    return this.stageSelectedClass;
  }

  /**
   * Select a stage member by class id. The previously selected member
   * begins WALKING back to its home position (target → homeX/homeZ); the
   * newly selected member begins WALKING from its current position to
   * the presentation point (target → stagePresentationX/stagePresentationZ),
   * facing its movement direction. Scale emphasis settles in after
   * arrival — no instant pop. If the same member is already selected,
   * this is a no-op. The formation is NOT rebuilt — only walk targets
   * change. Both transitions can occur simultaneously.
   */
  selectStageMember(classId: string): void {
    if (this.destroyed) return;
    const newMember = this.stageMembers.find((m) => m.classId === classId);
    if (!newMember) return;
    if (this.stageSelectedClass === classId) return;

    // Demote the previously selected member: walk back home, scale to
    // background. The walk starts from wherever the character currently is.
    if (this.stageSelectedClass) {
      const oldMember = this.stageMembers.find(
        (m) => m.classId === this.stageSelectedClass,
      );
      if (oldMember) {
        oldMember.selected = false;
        oldMember.targetX = oldMember.homeX;
        oldMember.targetZ = oldMember.homeZ;
        oldMember.targetScale = STAGE_BACKGROUND_SCALE;
        // Start walking back only if not already at home.
        const dx = Math.abs(oldMember.visual.root.position.x - oldMember.homeX);
        const dz = Math.abs(oldMember.visual.root.position.z - oldMember.homeZ);
        if (dx > STAGE_ARRIVAL_THRESHOLD || dz > STAGE_ARRIVAL_THRESHOLD) {
          oldMember.walkDir = 'back';
        } else {
          oldMember.walkDir = null;
        }
      }
    }

    // Promote the newly selected member: walk toward the presentation point,
    // scale up (settles after arrival).
    newMember.selected = true;
    newMember.targetX = this.stagePresentationX;
    newMember.targetZ = this.stagePresentationZ;
    newMember.targetScale = STAGE_FOCUS_SCALE;
    // Start walking forward only if not already at the presentation point.
    const dx = Math.abs(newMember.visual.root.position.x - this.stagePresentationX);
    const dz = Math.abs(newMember.visual.root.position.z - this.stagePresentationZ);
    if (dx > STAGE_ARRIVAL_THRESHOLD || dz > STAGE_ARRIVAL_THRESHOLD) {
      newMember.walkDir = 'forward';
    } else {
      newMember.walkDir = null;
    }

    // Set all other background members to background scale, at their homes.
    // A member whose home just changed (a rotation displaced it) walks to
    // the new slot; a member already at home stays idle.
    for (const m of this.stageMembers) {
      if (m !== newMember) {
        m.targetScale = STAGE_BACKGROUND_SCALE;
        m.targetX = m.homeX;
        m.targetZ = m.homeZ;
        if (m.walkDir === null) {
          const dx = Math.abs(m.visual.root.position.x - m.homeX);
          const dz = Math.abs(m.visual.root.position.z - m.homeZ);
          if (dx > STAGE_ARRIVAL_THRESHOLD || dz > STAGE_ARRIVAL_THRESHOLD) {
            m.walkDir = 'back';
          }
        }
      }
    }

    this.stageSelectedClass = classId;
    // Point currentVisual at the selected member so existing appearance/skin/
    // hair machinery operates on the right visual.
    this.currentVisual = newMember.visual;
    this.currentVisualSig = null;

    // Activate the spotlight on the selected character.
    if (this.stageSpotlight) {
      this.stageSpotlight.visible = true;
      this.stageSpotlight.intensity = 1.5;
    }
  }

  /**
   * Stage rotation: swap the HOME position of the clicked member with the
   * member occupying the CENTER slot (the middle home position of the
   * three-member row), then select the clicked member. The clicked member
   * walks to the presentation point; the displaced center member walks
   * into the clicked member's old side slot; the opposite side is
   * untouched. Reuses the existing walk animation — no teleport.
   *
   * The center-slot owner is the selected member whenever a selection
   * exists, so repeated side clicks rotate side ↔ center. On the very
   * first selection, clicking a side member displaces the middle-slot
   * member into the vacated side slot so all three positions stay
   * occupied. If the clicked member already owns the center slot (a
   * center click), no homes move.
   */
  rotateStageMember(classId: string): void {
    if (this.destroyed) return;
    const clicked = this.stageMembers.find((m) => m.classId === classId);
    if (!clicked) return;
    if (this.stageSelectedClass === classId) return; // center click = no-op
    // The CENTER position is the home slot closest to the presentation X
    // (the middle of the row). Its owner is the member the click
    // displaces: the selected member once one exists, or the middle
    // character on the first selection.
    const center = this.stageMembers.reduce((best, m) =>
      Math.abs(m.homeX - this.stagePresentationX) <
      Math.abs(best.homeX - this.stagePresentationX)
        ? m
        : best,
    );
    if (clicked !== center) {
      const tmpX = clicked.homeX;
      const tmpZ = clicked.homeZ;
      clicked.homeX = center.homeX;
      clicked.homeZ = center.homeZ;
      center.homeX = tmpX;
      center.homeZ = tmpZ;
    }
    this.selectStageMember(classId);
  }

  /**
   * Rebuild the selected member's visual with a new visual key (for hair
   * changes). The member stays at its current position, scale, and walk
   * state — no target change, no stage transition, no walk restart.
   */
  rebuildSelectedStageVisual(visualKey: string): void {
    if (this.destroyed || !this.stageSelectedClass) return;
    const member = this.stageMembers.find(
      (m) => m.classId === this.stageSelectedClass,
    );
    if (!member) return;
    const currentX = member.visual.root.position.x;
    const currentZ = member.visual.root.position.z;
    const currentScale = member.currentScale;
    const currentRotY = member.visual.root.rotation.y;
    const savedWalkDir = member.walkDir;
    try {
      this.stageGroup.remove(member.visual.root);
      member.visual.dispose();
      const visual = new CharacterVisual(
        visualKey,
        0xffffff,
        this.currentSkin,
        null,
        null,
        null,
        null,
      );
      visual.root.position.set(currentX, 0, currentZ);
      visual.root.scale.setScalar(currentScale);
      visual.root.rotation.y = currentRotY;
      this.stageGroup.add(visual.root);
      member.visual = visual;
      member.walkDir = savedWalkDir;
      this.currentVisual = visual;
      this.currentVisualSig = null;
    } catch (err) {
      console.error(`[preview] stage visual rebuild ${visualKey} failed:`, err);
    }
  }

  /** Register a callback fired when the player clicks a stage character. */
  setStageClickCallback(cb: ((classId: string) => void) | null): void {
    this.stageClickCallback = cb;
  }

  /** True if the stage formation is active (members exist). */
  isStageActive(): boolean {
    return this.stageMembers.length > 0;
  }

  /** Get the home position of a stage member by class id (for tests). */
  getStageHomePosition(classId: string): { x: number; z: number } | null {
    const m = this.stageMembers.find((m) => m.classId === classId);
    return m ? { x: m.homeX, z: m.homeZ } : null;
  }

  /** Get the current world position of a stage member by class id (tests). */
  getStageCurrentPosition(classId: string): { x: number; z: number } | null {
    const m = this.stageMembers.find((m) => m.classId === classId);
    return m
      ? { x: m.visual.root.position.x, z: m.visual.root.position.z }
      : null;
  }

  /** Get the target X of a stage member by class id (tests). */
  getStageTargetX(classId: string): number | null {
    const m = this.stageMembers.find((m) => m.classId === classId);
    return m ? m.targetX : null;
  }

  /** Get the target Z of a stage member by class id (tests). */
  getStageTargetZ(classId: string): number | null {
    const m = this.stageMembers.find((m) => m.classId === classId);
    return m ? m.targetZ : null;
  }

  /** Get the walk direction of a stage member by class id (tests). */
  getStageWalkDir(classId: string): string | null {
    const m = this.stageMembers.find((m) => m.classId === classId);
    return m ? m.walkDir : null;
  }

  /** Get the current scale of a stage member by class id (tests). */
  getStageScale(classId: string): number | null {
    const m = this.stageMembers.find((m) => m.classId === classId);
    return m ? m.currentScale : null;
  }

  /** Get the target scale of a stage member by class id (tests). */
  getStageTargetScale(classId: string): number | null {
    const m = this.stageMembers.find((m) => m.classId === classId);
    return m ? m.targetScale : null;
  }

  /** True if the stage member is selected (tests). */
  isStageMemberSelected(classId: string): boolean {
    const m = this.stageMembers.find((m) => m.classId === classId);
    return m ? m.selected : false;
  }

  /**
   * Raycast from screen coordinates and return the class id of the clicked
   * stage member, or null if empty space was clicked. Uses the member's
   * root group for hit detection (covers the full body).
   */
  private raycastStageMember(clientX: number, clientY: number): string | null {
    if (this.stageMembers.length === 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const targets: THREE.Object3D[] = this.stageMembers.map(
      (m) => m.visual.root,
    );
    const hits = this.raycaster.intersectObjects(targets, true);
    if (hits.length === 0) return null;
    // Walk up the parent chain to find which member's root was hit.
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj) {
      const member = this.stageMembers.find((m) => m.visual.root === obj);
      if (member) return member.classId;
      obj = obj.parent;
    }
    return null;
  }

  /** Swap the previewed skin (alternate body texture); persists across setClass. */
  setSkin(skinIndex: number): void {
    if (this.destroyed) return;
    // Same invalidation as setClass: a standalone skin change (dataset fallback,
    // char-create skin hover) is not the appearance a pending mech re-apply targets.
    this.appearanceSig = null;
    if (this.currentSkin === skinIndex) return;
    this.currentSkin = skinIndex;
    this.closeupCache.clear();
    this.currentVisual?.setSkin(skinIndex);
  }

  /** Dynamically shift the canvas to a new container */
  setContainer(container: HTMLElement): void {
    if (this.destroyed) return;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.container = container;
    this.container.appendChild(this.canvas);

    this.syncSize();

    // Re-observe the new container
    this.setupResizeObserver();
  }

  /** Switch the camera framing (see preview_framing.ts). The self character sheet
   *  uses 'sheet' (close, face-on); the inspect window uses 'inspect' (pulled back
   *  so a tall silhouette stays framed). Re-asserted on every mount so reopening
   *  the character sheet after inspecting restores the close framing. */
  setFraming(name: PreviewFramingName): void {
    if (this.destroyed) return;
    this.applyFraming(PREVIEW_FRAMING[name]);
  }

  private applyFraming(f: { y: number; z: number; lookY: number }): void {
    this.camera.position.set(LIVE_PREVIEW_X, f.y, f.z);
    this.camera.lookAt(new THREE.Vector3(LIVE_PREVIEW_X, f.lookY, 0));
    this.camera.updateProjectionMatrix();
  }

  /** Force the renderer to match the current visible container size. */
  syncSize(): void {
    if (this.destroyed) return;
    if (this.prewarming) {
      // prewarm() owns the renderer's buffer size until it finishes; record
      // the request instead of resizing out from under it, and let prewarm's
      // finally apply it once the buffer is the live preview's own again.
      this.pendingActive = this.container.clientWidth > 0 && this.container.clientHeight > 0;
      return;
    }
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderActive = width > 0 && height > 0;
    if (width > 0 && height > 0) {
      // The buffer, camera and aspect still follow the container while the
      // open gate holds: only the DRAW waits, so the reveal needs no resize.
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      if (this.gateAllowsDraw()) this.renderer.render(this.scene, this.camera);
    } else {
      this.standDownOpenGate();
    }
  }

  /** Inject the world renderer's background GPU queue, the one arbiter that
   *  paces main-thread preparation work. Without it the open gate still links
   *  and uploads; only its touch tail is skipped. */
  setTouchQueue(queue: LinkedProgramTouchQueue | null): void {
    this.touchQueue = queue;
  }

  /** The visual signature whose programs are linked on this context, written
   *  by BOTH prewarm() and the open gate so neither compiles what the other
   *  already did. */
  get linkedVisualSig(): string | null {
    return this.openGate.linkedSig();
  }

  /**
   * Arm the cold-open gate for whatever is mounted right now: hold both draw
   * sites, show `standIn`, then link, upload and touch before the first frame
   * the player sees. A no-op when the mounted signature is already linked (the
   * warm open, and the reason nothing pays twice).
   *
   * Called from every mount (Hud.mountSharedPreview), so the sheet, the skin
   * picker and Inspect all arm on the same rule; Inspect is the case the
   * background lane can never cover, because it mounts a peer's class rig this
   * context may never have linked.
   */
  armOpen(standIn: PreviewOpenStandIn | null = null): void {
    if (this.destroyed) return;
    const sig = this.currentVisualSig;
    if (!this.openGate.arm(sig, gpuPrepNow())) return;
    this.hideStandIn();
    // Always, even for a rebuild in the SAME container: setContainer and the
    // resize observer both run syncSize first, and setSize reassigns
    // canvas.width, which CLEARS the drawing buffer. There is no retained
    // frame left to stand in for the armed window, only a black panel.
    this.standIn = standIn;
    standIn?.show();
    const token = this.openGate.beginWarm();
    if (token === null) return;
    void this.prepareOpen(token, sig);
  }

  /** LINK, then UPLOAD, then TOUCH, then reveal. compileAsync in three r185
   *  both submits and polls COMPLETION_STATUS_KHR, so its resolution IS the
   *  settle and no separate wait step exists; the touch tail is what removes
   *  the first-use uniform-table query the reveal draw would otherwise pay. */
  private async prepareOpen(token: number, sig: string | null): Promise<void> {
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
      if (this.destroyed) return;
      const textures = new Set<THREE.Texture>();
      collectPrewarmTextures(this.scene, textures);
      await uploadTexturesInSlices(this.renderer, textures, {
        yieldToMain: this.yieldToMain,
        isCancelled: () => this.destroyed,
      });
      if (this.destroyed) return;
      // ACTIONABLE_VIEW because a player CLICKED: the actionable floor is what
      // guarantees the open is never starved behind background preparation,
      // and one budgeted piece per program is what keeps a 15 to 17 ms driver
      // round trip out of the frame that carries the click.
      if (this.touchQueue) {
        await runLinkedProgramTouchLane(
          this.touchQueue,
          this.renderer.properties,
          this.characterGroup,
          GPU_WORK_PRIORITY.ACTIONABLE_VIEW,
          // settled: the compileAsync above was awaited to completion, which is
          // what proves this context's programs linked.
          { label: PREVIEW_LINKED_PROGRAM_TOUCH_LABEL, settled: true },
        );
      }
    } catch (err) {
      // Fail-soft, like every other gate here: a refused context or a rejected
      // compile must reveal the character, never strand the panel empty.
      console.warn('[preview] cold-open warm failed', err);
    } finally {
      if (!this.destroyed && this.openGate.finishWarm(token, sig)) this.revealOpen();
    }
  }

  /** Whether a live draw site may draw, and the one place the bounded escape
   *  fires: past the soft deadline the gate releases, the escape is recorded
   *  once, and the frame draws whatever is ready. */
  private gateAllowsDraw(): boolean {
    const now = gpuPrepNow();
    const escapedAgeMs = this.openGate.takeEscape(now);
    if (escapedAgeMs !== null) {
      recordGpuPrepEvent({
        kind: 'gate-timeout',
        key: PREVIEW_OPEN_ESCAPE_EVENT_KEY,
        ageMs: escapedAgeMs,
      });
      this.hideStandIn();
    }
    return this.openGate.shouldRender(now);
  }

  private revealOpen(): void {
    this.hideStandIn();
    if (!this.renderActive) return;
    this.renderer.render(this.scene, this.camera);
  }

  private hideStandIn(): void {
    this.standIn?.hide();
    this.standIn = null;
  }

  /** The preview stopped drawing: its window closed, or its container was
   *  unmounted. Both draw sites are unreachable now, so the bounded escape can
   *  never fire and an armed gate would strand the stand-in layer and its
   *  aria-busy on a hidden container until the next mount. Drop the hold with
   *  it; the next mount arms again, and a warm still in flight records nothing
   *  because cancel() supersedes its arm. */
  private standDownOpenGate(): void {
    if (!this.openGate.isArmed() && !this.standIn) return;
    this.openGate.cancel();
    this.hideStandIn();
  }

  /** Compile and upload the current preview while a loading screen is visible.
   *  The hidden character window has no layout size, so use a temporary small
   *  drawing buffer and restore it without ever exposing the warmup frame. */
  async prewarm(skinIndices: readonly number[] = [this.currentSkin]): Promise<void> {
    if (this.destroyed || !this.currentVisual) return;
    const previousSize = new THREE.Vector2();
    this.renderer.getSize(previousSize);
    const previousPixelRatio = this.renderer.getPixelRatio();
    const previousAspect = this.camera.aspect;
    const previousSkin = this.currentSkin;
    const wasActive = this.renderActive;
    // What this pass linked, if anything: its touch tail runs after the
    // warmup buffer is handed back (see below).
    let compiledSig: string | null = null;
    this.renderActive = false;
    this.prewarming = true;
    this.pendingActive = null;
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(320, 400, false);
      this.camera.aspect = 320 / 400;
      this.camera.updateProjectionMatrix();
      this.currentVisual.update(0, PREVIEW_ANIM_STATE, true);
      // One linked signature, shared with the open gate: a scheduled warm and
      // a player's open never compile the same visual twice, and the per-skin
      // units after the first still do their texture work while skipping a
      // compile that would link nothing new.
      const warmSig = this.currentVisualSig;
      if (!this.openGate.isLinked(warmSig)) {
        await this.renderer.compileAsync(this.scene, this.camera);
        compiledSig = warmSig;
      }
      // A chroma swap rebinds body textures. Upload every class variant now so
      // clicking a skin swatch cannot turn the preview's next rAF into a first-
      // use texture upload. The uploads themselves are prepaid in bounded
      // slices before each draw: a cold skin's render otherwise pays them all
      // in one synchronous block (128 to 155 ms per paced unit in production).
      const textures = new Set<THREE.Texture>();
      for (const skin of new Set(skinIndices)) {
        if (this.destroyed) break;
        this.currentVisual.setSkin(skin);
        textures.clear();
        collectPrewarmTextures(this.scene, textures);
        await uploadTexturesInSlices(this.renderer, textures, {
          yieldToMain: yieldToMainThread,
          isCancelled: () => this.destroyed,
        });
        if (this.destroyed) break;
        this.renderer.render(this.scene, this.camera);
        await yieldToMainThread();
      }
    } finally {
      this.currentSkin = previousSkin;
      this.currentVisual?.setSkin(previousSkin);
      this.renderer.setPixelRatio(previousPixelRatio);
      this.renderer.setSize(Math.max(1, previousSize.x), Math.max(1, previousSize.y), false);
      this.camera.aspect = previousAspect;
      this.camera.updateProjectionMatrix();
      this.prewarming = false;
      // setContainer/the resize observer may have arrived mid-prewarm (the
      // window opened or closed while this buffer was repurposed for
      // warmup); apply that request instead of the wasActive snapshot
      // captured at entry, and resync to the real container size rather than
      // the stale pre-warmup size just restored above.
      const requestedActive = this.pendingActive;
      this.pendingActive = null;
      this.renderActive = requestedActive ?? wasActive;
      if (requestedActive !== null) this.syncSize();
      this.timer.reset();
    }
    // The tail, OUTSIDE the warmup window: it only walks programs that are
    // already linked, and holding the live preview inactive across a paced
    // per-program lane would keep the panel dark if the player opened the
    // sheet mid-warm.
    //
    // The signature counts as linked only once that tail has run, because the
    // skip it grants makes a later open bypass armOpen entirely, tail
    // included, and an open with no tail pays the first-use uniform-table
    // query per program (15 to 17 ms each on the Intel iGPU) inside the frame
    // that carries the click. With no queue injected there is no tail here, so
    // nothing is recorded and the open gate still touches.
    if (compiledSig === null || !this.touchQueue || this.destroyed) return;
    await runLinkedProgramTouchLane(
      this.touchQueue,
      this.renderer.properties,
      this.characterGroup,
      GPU_WORK_PRIORITY.BACKGROUND,
      // settled: reached only with a compiledSig, i.e. after the awaited
      // compileAsync above resolved for this signature.
      { label: PREVIEW_LINKED_PROGRAM_TOUCH_LABEL, settled: true },
    );
    // A rebuild in between released those programs (forgetLinked): what this
    // pass warmed is no longer what is mounted, so it records nothing.
    if (!this.destroyed && this.currentVisualSig === compiledSig) {
      this.openGate.noteLinked(compiledSig);
    }
  }

  /** Warm the exact offscreen player-card path while the loading screen is up. */
  async prewarmCloseupPoses(poses: readonly CharacterPreviewPose[]): Promise<void> {
    if (this.destroyed || !this.currentVisual) return;
    for (const pose of poses) {
      await this.captureCloseup({
        poseClips: pose.clips,
        poseFraction: pose.fraction,
      });
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  private setupDragControls(): void {
    // Track whether the pointer moved between mousedown and mouseup so a
    // click (no drag) can be distinguished from a drag-then-release.
    let downX = 0;
    let downY = 0;
    let moved = false;

    const onMouseDown = (e: MouseEvent) => {
      this.isDragging = true;
      this.previousMouseX = e.clientX;
      downX = e.clientX;
      downY = e.clientY;
      moved = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;
      const deltaX = e.clientX - this.previousMouseX;
      if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) {
        moved = true;
      }
      // Drag rotates the selected stage member (if active) or characterGroup.
      if (this.stageMembers.length > 0 && this.stageSelectedClass) {
        const m = this.stageMembers.find(
          (m) => m.classId === this.stageSelectedClass,
        );
        if (m) m.visual.root.rotation.y += deltaX * 0.01;
      } else {
        this.characterGroup.rotation.y += deltaX * 0.01;
      }
      this.previousMouseX = e.clientX;
    };

    const onMouseUp = (e: MouseEvent) => {
      this.isDragging = false;
      // If the pointer didn't move, treat it as a click for stage selection.
      if (!moved && this.stageMembers.length > 0) {
        const classId = this.raycastStageMember(e.clientX, e.clientY);
        if (classId) this.stageClickCallback?.(classId);
      }
    };

    // Touch support
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.previousMouseX = e.touches[0].clientX;
        downX = e.touches[0].clientX;
        downY = e.touches[0].clientY;
        moved = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!this.isDragging || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - this.previousMouseX;
      if (
        Math.abs(e.touches[0].clientX - downX) > 4 ||
        Math.abs(e.touches[0].clientY - downY) > 4
      ) {
        moved = true;
      }
      if (this.stageMembers.length > 0 && this.stageSelectedClass) {
        const m = this.stageMembers.find(
          (m) => m.classId === this.stageSelectedClass,
        );
        if (m) m.visual.root.rotation.y += deltaX * 0.01;
      } else {
        this.characterGroup.rotation.y += deltaX * 0.01;
      }
      this.previousMouseX = e.touches[0].clientX;
    };

    const onTouchEnd = (e: TouchEvent) => {
      this.isDragging = false;
      // Tap (no move) selects a stage character.
      if (!moved && this.stageMembers.length > 0 && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        const classId = this.raycastStageMember(t.clientX, t.clientY);
        if (classId) this.stageClickCallback?.(classId);
      }
    };

    this.canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    this.canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    this.cleanupDragControls = () => {
      this.canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      this.canvas.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.syncSize();
    });
    this.resizeObserver.observe(this.container);
  }

  private animate = (): void => {
    if (this.destroyed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);

    if (
      !characterPreviewFrameVisible(
        this.canvas.isConnected,
        this.container.clientWidth,
        this.container.clientHeight,
      )
    ) {
      // Re-anchor the timer while hidden so reopening cannot produce a large
      // animation step.
      this.timer.reset();
      this.standDownOpenGate();
      return;
    }

    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1); // cap dt to prevent huge jumps
    if (!this.renderActive) return;
    // The second live draw site: a gate covering only syncSize is not a gate,
    // because the loop draws the same cold scene on the very next frame.
    if (!this.gateAllowsDraw()) return;

    // No idle auto-rotation: the character holds its face-on pose (the classic
    // character-screen behavior) and only the player's drag spins the turntable.

    // Stage mode: 3D character-select stage with authentic PT walking.
    // Each member WALKS toward its target (center or home) at a fixed speed
    // (frame-rate independent), moving on both X and Z diagonally. While
    // moving, the real PT WALK clip plays and the character faces its
    // movement direction; at rest, the PT STAND/idle clip plays and the
    // selected character settles into presentation orientation. Scale
    // emphasis settles in after arrival (no pop). The selected character
    // gently oscillates once at center.
    if (this.stageMembers.length > 0) {
      this.stageElapsed += dt;
      const scaleLerp = Math.min(dt * STAGE_SCALE_LERP_SPEED, 1);
      const facingLerp = Math.min(dt * STAGE_FACING_LERP_SPEED, 1);
      for (const m of this.stageMembers) {
        // Physical X+Z movement: walk toward (targetX, targetZ) at
        // STAGE_WALK_SPEED. The movement vector is normalized so diagonal
        // walks are not faster than straight walks.
        if (m.walkDir !== null) {
          const cx = m.visual.root.position.x;
          const cz = m.visual.root.position.z;
          const dx = m.targetX - cx;
          const dz = m.targetZ - cz;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const step = STAGE_WALK_SPEED * dt;
          if (dist <= step || dist === 0) {
            // Arrived this frame.
            m.visual.root.position.x = m.targetX;
            m.visual.root.position.z = m.targetZ;
            m.walkDir = null;
          } else {
            m.visual.root.position.x += (dx / dist) * step;
            m.visual.root.position.z += (dz / dist) * step;
          }
        }

        // Scale settles toward target (no instant pop).
        m.currentScale += (m.targetScale - m.currentScale) * scaleLerp;
        m.visual.root.scale.setScalar(m.currentScale);

        // Rotation: while walking, face the movement direction. At rest,
        // the selected character oscillates (sine wave) once at center and
        // not dragging; background characters face forward.
        if (m.walkDir !== null) {
          // Face the movement direction (shortest rotation toward target).
          const targetYaw = Math.atan2(
            m.targetX - m.visual.root.position.x,
            m.targetZ - m.visual.root.position.z,
          );
          // Shortest-angle lerp toward the target yaw.
          m.visual.root.rotation.y = lerpAngle(
            m.visual.root.rotation.y,
            targetYaw,
            facingLerp,
          );
        } else if (m.selected && !this.isDragging) {
          // Arrived at center: settle into presentation oscillation.
          m.visual.root.rotation.y =
            Math.sin(this.stageElapsed * STAGE_OSCILLATION_FREQ) *
            STAGE_OSCILLATION_AMP;
        } else if (!m.selected) {
          // Background: face forward.
          m.visual.root.rotation.y +=
            (0 - m.visual.root.rotation.y) * scaleLerp;
        }

        // Animation: WALK clip while moving, STAND/idle at rest.
        const isMoving = m.walkDir !== null;
        m.visual.update(
          dt,
          isMoving ? PREVIEW_WALK_STATE : PREVIEW_ANIM_STATE,
          true,
        );
      }

      // Move the spotlight to follow the selected character.
      if (this.stageSpotlight && this.stageSpotlightTarget && this.stageSelectedClass) {
        const sel = this.stageMembers.find(
          (m) => m.classId === this.stageSelectedClass,
        );
        if (sel) {
          this.stageSpotlight.position.set(
            sel.visual.root.position.x,
            5,
            sel.visual.root.position.z + 2,
          );
          this.stageSpotlightTarget.position.set(
            sel.visual.root.position.x,
            0,
            sel.visual.root.position.z,
          );
        }
      }

      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Legacy mode: single selected character in characterGroup + background
    // formation in formationGroup. Used by non-stage panels (charselect,
    // charcreate, inspect).
    // Formation walk: if active, lerp the characterGroup from its formation
    // slot to the presentation center (0, 0) using easeOutQuad. While
    // walking, the walk clip plays; on arrival, the character enters idle.
    // Hair changes do NOT reset the walk state, so they inherit the current
    // position without restarting the walk.
    if (this.currentVisual) {
      if (this.walkPhase === 'walking') {
        this.walkElapsed += dt;
        const t = Math.min(this.walkElapsed / FORMATION_WALK_DURATION_S, 1);
        const e = 1 - (1 - t) * (1 - t); // easeOutQuad
        this.characterGroup.position.x = this.walkStartX + (0 - this.walkStartX) * e;
        this.characterGroup.position.z = this.walkStartZ + (0 - this.walkStartZ) * e;
        if (t >= 1) this.walkPhase = 'idle';
      }
      const animState = this.walkPhase === 'walking' ? PREVIEW_WALK_STATE : PREVIEW_ANIM_STATE;
      this.currentVisual.update(dt, animState, true);
    }
    // Formation background characters: idle-animate in place. They are not
    // combat-active and do not move; only their idle clip advances.
    for (const v of this.formationVisuals) {
      v.update(dt, PREVIEW_ANIM_STATE, true);
    }

    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Render a single crisp, deterministic close-up of the current character and
   * return it as an unencoded 2D canvas. Used to stamp the player's avatar onto
   * the shareable player card without an intermediate PNG encode/decode cycle.
   *
   * The scene is rendered into a persistent offscreen target, then copied back
   * asynchronously through a pixel-pack buffer. The live preview canvas is never
   * resized or repainted with the card pose, avoiding both framebuffer stalls and
   * visible intermediate frames.
   */
  captureCloseup(
    opts: {
      width?: number;
      height?: number;
      angle?: number;
      poseClips?: readonly string[];
      poseFraction?: number;
    } = {},
  ): Promise<HTMLCanvasElement> {
    const request = {
      ...opts,
      poseClips: opts.poseClips ? [...opts.poseClips] : undefined,
    };
    const capture = this.captureQueue.then(() => this.captureCloseupNow(request));
    this.captureQueue = capture.then(
      () => undefined,
      () => undefined,
    );
    return capture;
  }

  private async captureCloseupNow(
    opts: {
      width?: number;
      height?: number;
      angle?: number;
      poseClips?: readonly string[];
      poseFraction?: number;
    } = {},
  ): Promise<HTMLCanvasElement> {
    if (this.destroyed) throw new Error('character-preview: capture after destroy');
    const width = Math.max(1, Math.round(opts.width ?? 540));
    const height = Math.max(1, Math.round(opts.height ?? 720));
    const angle = opts.angle ?? -0.42; // gentle 3/4 turn for a heroic stance
    const cacheKey =
      opts.poseClips && opts.poseClips.length > 0
        ? JSON.stringify([width, height, angle, opts.poseClips, opts.poseFraction ?? 0.5])
        : null;
    const cached = cacheKey ? this.closeupCache.get(cacheKey) : null;
    if (cached) return cached;

    const prevAspect = this.camera.aspect;
    const prevPos = this.camera.position.clone();
    const prevRotY = this.characterGroup.rotation.y;
    const prevTarget = this.renderer.getRenderTarget();
    const prevCubeFace = this.renderer.getActiveCubeFace();
    const prevMipmapLevel = this.renderer.getActiveMipmapLevel();

    // Optionally lock a deliberate pose for the shot (e.g. a hero/cast/cheer
    // stance) instead of whatever idle frame is up. Restored via clearPose below.
    const posed =
      opts.poseClips && opts.poseClips.length > 0
        ? (this.currentVisual?.poseFreeze(opts.poseClips, opts.poseFraction ?? 0.5) ?? null)
        : null;

    let target = this.captureTarget;
    if (!target) {
      target = new THREE.WebGLRenderTarget(width, height, {
        depthBuffer: true,
        stencilBuffer: false,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      });
      target.texture.colorSpace = this.renderer.outputColorSpace;
      target.texture.generateMipmaps = false;
      this.captureTarget = target;
    } else if (target.width !== width || target.height !== height) {
      target.setSize(width, height);
    }
    const byteLength = width * height * 4;
    if (!this.capturePixels || this.capturePixels.byteLength !== byteLength) {
      this.capturePixels = new Uint8Array(byteLength);
    }

    let readback: Promise<THREE.TypedArray> | null = null;
    try {
      this.camera.aspect = width / height;
      // Pulled back to z=4.6, aimed at y=1.55 (eye 1.62) so the 45 degree,
      // 0.75-aspect frustum spans roughly y in [-0.3, 3.5] at the figure plane:
      // enough headroom above the 2.6 head-top to clear raised weapons and arms.
      this.camera.position.set(-0.1, 1.62, 4.6);
      this.camera.lookAt(new THREE.Vector3(-0.1, 1.55, 0));
      this.camera.updateProjectionMatrix();
      this.characterGroup.rotation.y = angle;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
      readback = this.renderer.readRenderTargetPixelsAsync(
        target,
        0,
        0,
        width,
        height,
        this.capturePixels,
      );
    } finally {
      this.renderer.setRenderTarget(prevTarget, prevCubeFace, prevMipmapLevel);
      if (posed) this.currentVisual?.clearPose();
      this.camera.aspect = prevAspect;
      this.camera.position.copy(prevPos);
      this.camera.lookAt(new THREE.Vector3(LIVE_PREVIEW_X, 1.3, 0));
      this.camera.updateProjectionMatrix();
      this.characterGroup.rotation.y = prevRotY;
      if (this.renderActive) this.renderer.render(this.scene, this.camera);
    }

    if (!readback) throw new Error('character-preview: capture readback unavailable');
    await readback;
    if (this.destroyed) throw new Error('character-preview: destroyed during capture');

    // WebGL readback starts at the bottom-left; Canvas ImageData starts at the
    // top-left. Flip one scanline at a time into the returned canvas.
    const stride = width * 4;
    const topDown = new Uint8ClampedArray(byteLength);
    for (let y = 0; y < height; y++) {
      const source = (height - 1 - y) * stride;
      topDown.set(this.capturePixels.subarray(source, source + stride), y * stride);
    }
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = width;
    captureCanvas.height = height;
    const context = captureCanvas.getContext('2d');
    if (!context) throw new Error('character-preview: could not create capture canvas');
    context.putImageData(new ImageData(topDown, width, height), 0, 0);
    if (cacheKey) this.closeupCache.set(cacheKey, captureCanvas);
    return captureCanvas;
  }

  /** Cleanup resources */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.cleanupDragControls?.();
    this.cleanupDragControls = null;
    this.openGate.cancel();
    this.hideStandIn();
    this.clearStage();
    this.clearFormation();
    if (this.currentVisual) {
      this.characterGroup.remove(this.currentVisual.root);
      this.currentVisual.dispose();
      this.currentVisual = null;
      // three releases a program with the last material holding it, so a
      // signature linked before this rebuild can be cold again afterwards:
      // the gate must not skip the warm on a return to an old look.
      this.openGate.forgetLinked();
    }
    this.currentVisualSig = null;
    this.closeupCache.clear();
    this.captureTarget?.dispose();
    this.captureTarget = null;
    this.capturePixels = null;

    this.unregisterContext?.();
    this.unregisterContext = null;
    try {
      this.renderer.forceContextLoss();
    } catch {
      /* context may already be lost */
    }
    this.renderer.dispose();
    this.canvas.remove();
  }
}
