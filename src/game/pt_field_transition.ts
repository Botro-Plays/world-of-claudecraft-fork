// PT field-transition curtain: the "YOU ARE ENTERING <FIELD>" loading screen
// that covers the PT world while the destination field is not visually ready.
//
// Why this exists on top of Phase 6A: 6A made the standby field reach
// visual-ready before the FieldGate crossing, but ownership promotion is
// position-driven inside the movement floor check (pt_field_active.ts), so
// there is still a moment where the bound map changed and its view is either
// still building (initial entry, warp to an unprepared field, same-id
// rebuild) or already revealed. This module wraps that moment in a
// deliberate loading screen with a minimum presentation time, like the PT
// client's own field-change screen, instead of a flicker.
//
// This module is DOM-free orchestration only: the overlay, the movement
// suspend, and the renderer probe are injected by main.ts, so the whole
// state machine is unit-testable without a renderer. It does NOT drive the
// load: the PtTerrainGate pair and pt_field_links.ts own descriptor install
// and view building exactly as before (Phase 6A unchanged); the curtain only
// watches and covers.
//
// Trigger rule: whenever the player is inside the PT band and the ACTIVE
// field binding is new (the bound map changed, or the same field id was
// re-bound by a fresh descriptor) or its view is not ready (not bound to
// the gate yet, still building, or compiling), the curtain is up. Keying
// on the descriptor identity, not only on sampled readiness, matters: a
// cache-warm same-id rebuild can resolve inside a single frame gap on a
// slow client, so "was a not-ready tick observed" is frame-rate luck. A
// re-bound field is a re-entry either way and gets the same deliberate
// card. The bound map changing under an open curtain retargets the same
// screen rather than stacking a second one.

import { getPtFieldDisplayName } from '../sim/content/pt_field_names';

export type PtFieldViewState = 'none' | 'building' | 'compiling' | 'ready' | 'failed';

/** Curtain callbacks, satisfied by the DOM overlay (ui/pt_transition_screen). */
export interface PtFieldTransitionOverlay {
  show(fieldName: string): void;
  setProgress(percent: number, loading: boolean): void;
  fail(fieldName: string): void;
  hide(): void;
}

export interface PtFieldTransitionDeps {
  /** Player is inside the PT world band (only there is the PT view the world). */
  inPtBand(): boolean;
  /** The currently bound active PT map binding, or null when unbound. The
   *  object identity is the transition signal, not just `id`: installing a
   *  fresh descriptor for the same field (a /ptmap reinstall) is a new
   *  binding and re-enters the field, while the descriptor is stable for
   *  the whole life of one binding. */
  activeMap(): { id: string } | null;
  /** The preloaded FieldGate neighbor binding (the source's StageField[1]),
   *  or null. Identity, not just id, for the same reason as activeMap. */
  standbyMap(): { id: string } | null;
  /** Renderer-side readiness of the view bound to a map id (active gate). */
  viewState(mapId: string): PtFieldViewState;
  /** Same probe on the STANDBY gate: the pre-entry card watches the
   *  destination's build while the player is still short of the boundary. */
  standbyViewState(mapId: string): PtFieldViewState;
  /** True while the player stands within the pre-entry margin of a gate
   *  point whose far side is `fieldId` (ptGateApproachTo below). */
  nearGateTo(fieldId: string): boolean;
  /** Same mouth as nearGateTo, plus the player is actually moving toward
   *  the gate point. The arm uses this - not bare proximity - so a player
   *  idling inside the margin (e.g. stopping just past a crossing) does
   *  not get a card for a crossing they are not making. */
  approachingGateTo(fieldId: string): boolean;
  /** Presentation name for a map id. Returns the label to paint immediately;
   *  an implementation that resolves a richer name lazily (the maplinks
   *  registry is a dynamic import) calls onUpgrade(id, label) when it lands. */
  fieldName(mapId: string, onUpgrade: (id: string, label: string) => void): string;
  /** One-shot fired on the frame a curtain engages. main.ts uses it to drop
   *  latched movement the suspend deliberately preserves (autorun,
   *  click-to-move), so the frozen frame is also a frozen player. */
  onRaise?(): void;
  overlay: PtFieldTransitionOverlay;
  nowMs(): number;
}

// ~2s of screen even when the destination was already dressed: the crossing
// reads as an intentional map change instead of a flicker, and it matches the
// source client's own field-change card.
export const PT_TRANSITION_MIN_MS = 2000;

// Pre-entry margin for the pre-entry card, in PT units: the overlay engages
// when the player is this close to a gate point whose far side is the loaded
// standby field (~10 WoC yards — well inside the ~39yd PlayNearGateField
// preload radius, so the neighbor is already warming when the card raises).
export const PT_GATE_APPROACH_MARGIN_PT = 280;

/** The narrow slice of a PtMapDescriptor the gate-approach check reads. */
export interface PtGateApproachSource {
  transform: {
    ptXToWoC(x: number): number;
    ptZToWoC(z: number): number;
    woCToPtX(x: number): number;
    woCToPtZ(z: number): number;
  };
  fieldGates?: readonly { targetId: string | null; x: number; z: number }[];
}

/**
 * Nearest authored gate point on `src`'s boundary whose far side is `destId`
 * and which lies within PT_GATE_APPROACH_MARGIN_PT of (wocX, wocZ), returned
 * in WoC coordinates so the caller can also test closing motion. Reads the
 * descriptor's own AddGate records - the same points the standby preload
 * scan uses - so the card engages only where the authored crossing actually
 * is. Null when no such gate is near.
 */
export function ptGatePointTo(
  src: PtGateApproachSource,
  destId: string,
  wocX: number,
  wocZ: number,
): { x: number; z: number } | null {
  const ptX = src.transform.woCToPtX(wocX);
  const ptZ = src.transform.woCToPtZ(wocZ);
  const m2 = PT_GATE_APPROACH_MARGIN_PT * PT_GATE_APPROACH_MARGIN_PT;
  let best: { x: number; z: number } | null = null;
  let bestD2 = m2;
  for (const g of src.fieldGates ?? []) {
    if (g.targetId !== destId) continue;
    const dx = ptX - g.x;
    const dz = ptZ - g.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > bestD2) continue;
    bestD2 = d2;
    best = { x: src.transform.ptXToWoC(g.x), z: src.transform.ptZToWoC(g.z) };
  }
  return best;
}

/**
 * Pre-entry proximity check for the transition curtain (Phase 6G): true while
 * (wocX, wocZ) is within PT_GATE_APPROACH_MARGIN_PT of an authored gate point
 * on `active`'s boundary whose far side is `destId`.
 */
export function ptGateApproachTo(
  active: PtGateApproachSource,
  destId: string,
  wocX: number,
  wocZ: number,
): boolean {
  return ptGatePointTo(active, destId, wocX, wocZ) !== null;
}

// A build that keeps rejecting retries forever inside the gate; past this
// bound the curtain switches to its failure line instead of promising a load
// that may never land. Movement is released at the same time: the field's
// data binding (collision/floor) is independent of the view, so the player
// is not actually stuck even if the visuals never arrive.
export const PT_TRANSITION_FAIL_MS = 45_000;

export interface PtFieldTransition {
  /** Drive one rendered frame. Cheap: a few reads and elided DOM writes. */
  tick(): void;
  /** True while the curtain is up: main.ts folds this into suspendMovement. */
  readonly inputHeld: boolean;
  /** True while the curtain is up: main.ts holds the world GL submit, so the
   *  last presented frame - still the field the player is leaving - stays on
   *  screen under the translucent overlay until the destination is dressed. */
  readonly drawHeld: boolean;
  /** Map id the curtain is currently presenting, or null. */
  readonly targetId: string | null;
}

/**
 * Field label for the curtain: the authentic display name immediately
 * (`GARDEN OF FREEDOM`), with the source-authored zh displayName folded in
 * once the lazily imported maplinks registry resolves
 * (`GARDEN OF FREEDOM (自由庭院)`). onUpgrade fires only when a zh name
 * exists and differs from the resolved display name; the orchestrator
 * drops it if the curtain retargeted to another field first.
 */
export function ptFieldLabel(id: string, onUpgrade: (id: string, label: string) => void): string {
  const display = getPtFieldDisplayName(id);
  void import('./pt_map_links')
    .then((m) => {
      const zh = m.ptMapLinksForField(id)?.field.displayName;
      if (zh && zh !== display) onUpgrade(id, `${display} (${zh})`);
    })
    .catch(() => undefined);
  return display.toUpperCase();
}

export function createPtFieldTransition(deps: PtFieldTransitionDeps): PtFieldTransition {
  // The map binding whose view was last revealed to the player; null
  // pre-entry. The descriptor object is kept alongside the id so a same-id
  // re-bind still reads as a new transition.
  let revealedId: string | null = null;
  let revealedKey: unknown = null;
  let targetId: string | null = null;
  let targetKey: unknown = null;
  // 'flip' covers the ACTIVE binding (the classic post-crossing card);
  // 'pre' covers the STANDBY binding while the player is still short of the
  // gate, so the overlay - and the movement/draw freeze - engage before the
  // field boundary rather than one frame after it.
  let mode: 'flip' | 'pre' = 'flip';
  // A field the pre-entry card already presented and released: when floor
  // promotion binds it to the active slot a moment later, that flip is the
  // same transition, not a new one, so it must not raise a second card.
  let expectedId: string | null = null;
  let expectedKey: unknown = null;
  let shownAt = 0;
  let failed = false;

  // A late-arriving richer label only repaints while the curtain still
  // targets the field it was resolved for.
  function retitle(id: string, label: string): void {
    if (targetId === id) deps.overlay.show(label);
  }

  function raise(id: string, key: unknown, m: 'flip' | 'pre'): void {
    mode = m;
    targetId = id;
    targetKey = key;
    shownAt = deps.nowMs();
    failed = false;
    deps.onRaise?.();
    deps.overlay.show(deps.fieldName(id, retitle));
  }

  const self: PtFieldTransition = {
    get inputHeld() {
      return targetId !== null && !failed;
    },
    get drawHeld() {
      return targetId !== null && !failed;
    },
    get targetId() {
      return targetId;
    },
    tick(): void {
      // The player is outside the PT band (or the field graph is unbound):
      // the curtain has nothing to cover. Lift it without the minimum.
      const active = deps.activeMap();
      if (!deps.inPtBand() || active === null) {
        if (targetId !== null) {
          targetId = null;
          targetKey = null;
          deps.overlay.hide();
        }
        expectedId = null;
        expectedKey = null;
        return;
      }
      const id = active.id;
      const key: unknown = active;
      const state = deps.viewState(id);
      const standby = deps.standbyMap();

      // Consume an expected promotion: the pre-entry card lifted and the
      // player simply walked through the gate - same transition, no card.
      if (expectedId !== null) {
        if (id === expectedId && key === expectedKey) {
          revealedId = id;
          revealedKey = key;
          expectedId = null;
          expectedKey = null;
        } else if (standby?.id !== expectedId || !deps.nearGateTo(expectedId)) {
          // The standby slot rotated to another field, or the player left
          // the gate mouth: the pending crossing evaporated, so a later
          // flip to that field is a fresh transition again.
          expectedId = null;
          expectedKey = null;
        }
      }

      if (targetId === null) {
        // Same binding, still ready: nothing to present. A new binding -
        // another map, or a fresh descriptor for this same field id (a
        // /ptmap reinstall, which is a re-entry even when its rebuild
        // resolves between ticks) - or a not-ready view takes the curtain.
        if (id === revealedId && key === revealedKey && state === 'ready') {
          // Pre-entry arm: a loaded FieldGate neighbor whose gate point the
          // player is walking into. Raising here - before the floor check
          // can promote - is what makes the card read as "approaching a new
          // map" instead of "already inside it". Two guards keep the arm
          // honest: (a) the expectation a lifted pre card left armed counts
          // as presented, so standing in the mouth after the reveal cannot
          // re-raise the card every minimum-interval, and (b) the approach
          // probe requires closing motion, so an idle player inside the
          // margin (stopped just past a crossing) arms nothing.
          if (
            standby !== null &&
            (standby.id !== expectedId || standby !== expectedKey) &&
            deps.approachingGateTo(standby.id)
          ) {
            raise(standby.id, standby, 'pre');
          } else {
            return;
          }
        } else {
          raise(id, key, 'flip');
        }
      } else if (mode === 'pre') {
        if (id === targetId && key === targetKey) {
          // Floor promotion ran under the open pre-entry card (e.g. the
          // tick that armed it still resolved the crossing). The
          // destination is the active binding now; finish as a normal flip
          // transition against the active-gate probe.
          mode = 'flip';
          expectedId = null;
          expectedKey = null;
        } else if (key !== revealedKey) {
          // The player never crossed (input is held), yet the active
          // binding changed anyway: a warp or /ptmap landed under the open
          // card. The pre-entry watch is moot; the new binding becomes the
          // concern unless it is somehow already revealed.
          if (state !== 'ready') {
            mode = 'flip';
            targetId = id;
            targetKey = key;
            failed = false;
            deps.overlay.show(deps.fieldName(id, retitle));
          } else {
            targetId = null;
            targetKey = null;
            deps.overlay.hide();
            return;
          }
        } else if (standby === null || standby.id !== targetId) {
          // The standby slot rotated without a crossing. If another gate
          // is armed, retarget the same card; otherwise the approach ended
          // and there is nothing left to cover.
          if (standby !== null && deps.nearGateTo(standby.id)) {
            targetId = standby.id;
            targetKey = standby;
            failed = false;
            deps.overlay.show(deps.fieldName(standby.id, retitle));
          } else {
            targetId = null;
            targetKey = null;
            deps.overlay.hide();
            return;
          }
        }
      } else if (id !== targetId || key !== targetKey) {
        // The bound map changed or was re-bound under an open curtain (a
        // second promotion, a warp, a dev /ptmap): retarget the same
        // screen, keeping the original show time so a rapid chain cannot
        // stretch or restart it.
        targetId = id;
        targetKey = key;
        failed = false;
        deps.overlay.show(deps.fieldName(id, retitle));
      }

      // Every branch above that cleared the target returned; a live target
      // remains for the state machine below.
      if (targetId === null) return;
      const elapsed = deps.nowMs() - shownAt;
      const targetState =
        mode === 'pre' ? deps.standbyViewState(targetId) : deps.viewState(targetId);
      if (!failed && (targetState === 'failed' || elapsed > PT_TRANSITION_FAIL_MS)) {
        failed = true;
        deps.overlay.fail(deps.fieldName(targetId, retitle));
        return;
      }
      if (failed) {
        // A 'failed' curtain is not a dead end: the gate retries builds, so
        // if the view lands after all the curtain lifts and reveals normally
        // (the minimum has long since elapsed past the failure bound).
        if (targetState !== 'ready') return;
        failed = false;
      }
      switch (targetState) {
        case 'ready':
          deps.overlay.setProgress(100, true);
          if (elapsed >= PT_TRANSITION_MIN_MS) {
            if (mode === 'pre') {
              // Reveal happened BEFORE the crossing: arm the expectation so
              // the promotion a moment later is the same transition, not a
              // second card.
              expectedId = targetId;
              expectedKey = targetKey;
            } else {
              revealedId = targetId;
              revealedKey = targetKey;
            }
            targetId = null;
            targetKey = null;
            deps.overlay.hide();
          }
          return;
        case 'compiling':
          // Attached; waiting on the link/upload lanes. Short by design.
          deps.overlay.setProgress(85 + Math.min(13, elapsed / 250), true);
          return;
        case 'building':
          // Textures + meshes in flight. Time-eased inside the stage so the
          // bar keeps moving on a cold build, capped so it never claims
          // done before the view is real.
          deps.overlay.setProgress(20 + 58 * Math.min(1, elapsed / 9000), true);
          return;
        default:
          // 'none': the descriptor is bound but the renderer has not picked
          // it up yet (the frames between promotion and the gate swap).
          deps.overlay.setProgress(12, true);
      }
    },
  };
  return self;
}
