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
  /** Renderer-side readiness of the view bound to a map id. */
  viewState(mapId: string): PtFieldViewState;
  /** Presentation name for a map id. Returns the label to paint immediately;
   *  an implementation that resolves a richer name lazily (the maplinks
   *  registry is a dynamic import) calls onUpgrade(id, label) when it lands. */
  fieldName(mapId: string, onUpgrade: (id: string, label: string) => void): string;
  overlay: PtFieldTransitionOverlay;
  nowMs(): number;
}

// ~2s of screen even when the destination was already dressed: the crossing
// reads as an intentional map change instead of a flicker, and it matches the
// source client's own field-change card.
export const PT_TRANSITION_MIN_MS = 2000;

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
  /** Map id the curtain is currently presenting, or null. */
  readonly targetId: string | null;
}

/**
 * Field label for the curtain: the package id immediately (`FORE-1`), with
 * the source-authored displayName folded in once the lazily imported
 * maplinks registry resolves (`FORE-1 (自由庭院)`). onUpgrade fires only
 * when a display name exists; the orchestrator drops it if the curtain
 * retargeted to another field first.
 */
export function ptFieldLabel(id: string, onUpgrade: (id: string, label: string) => void): string {
  void import('./pt_map_links')
    .then((m) => {
      const display = m.ptMapLinksForField(id)?.field.displayName;
      if (display) onUpgrade(id, `${id.toUpperCase()} (${display})`);
    })
    .catch(() => undefined);
  return id.toUpperCase();
}

export function createPtFieldTransition(deps: PtFieldTransitionDeps): PtFieldTransition {
  // The map binding whose view was last revealed to the player; null
  // pre-entry. The descriptor object is kept alongside the id so a same-id
  // re-bind still reads as a new transition.
  let revealedId: string | null = null;
  let revealedKey: unknown = null;
  let targetId: string | null = null;
  let targetKey: unknown = null;
  let shownAt = 0;
  let failed = false;

  // A late-arriving richer label only repaints while the curtain still
  // targets the field it was resolved for.
  function retitle(id: string, label: string): void {
    if (targetId === id) deps.overlay.show(label);
  }

  const self: PtFieldTransition = {
    get inputHeld() {
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
        return;
      }
      const id = active.id;
      const key: unknown = active;
      const state = deps.viewState(id);
      if (targetId === null) {
        // Same binding, still ready: nothing to present. A new binding -
        // another map, or a fresh descriptor for this same field id (a
        // /ptmap reinstall, which is a re-entry even when its rebuild
        // resolves between ticks) - or a not-ready view takes the curtain.
        if (id === revealedId && key === revealedKey && state === 'ready') return;
        targetId = id;
        targetKey = key;
        shownAt = deps.nowMs();
        failed = false;
        deps.overlay.show(deps.fieldName(id, retitle));
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

      const elapsed = deps.nowMs() - shownAt;
      const targetState = deps.viewState(targetId);
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
            revealedId = targetId;
            revealedKey = targetKey;
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
