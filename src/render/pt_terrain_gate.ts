// Per-frame guard for the PT terrain build.
//
// buildPtTerrainView awaits ~276 texture loads, so the returned promise stays
// pending for seconds. Without this gate, every sync() frame inside the PT
// band would start another build: each call synchronously decodes 47k
// vertices and builds a ~48k-face geometry, and each resolving promise adds
// another duplicate terrain group to the scene. The result was main-thread
// starvation severe enough to freeze player movement.
//
// The gate allows at most one in-flight build, attaches the resolved view
// exactly once, and clears itself on failure so a later frame can retry.
//
// The active PT map can change while the player is in the band (the /ptmap
// dev harness installs a different PtMapDescriptor). ensure(src) detects a
// source change: the old view is detached and disposed, and a stale
// in-flight build resolves into dispose() instead of attach() so a
// superseded map can never pop in over the new selection.

import type { PtMapDescriptor } from '../sim/pt_field';
import type { PtTerrainView } from './pt_terrain';

export class PtTerrainGate {
  private pending: Promise<void> | null = null;
  private view: PtTerrainView | null = null;
  private src: PtMapDescriptor | null = null;
  private seq = 0;

  constructor(
    private readonly build: (src: PtMapDescriptor) => Promise<PtTerrainView>,
    private readonly attach: (view: PtTerrainView) => void,
    private readonly detach: (view: PtTerrainView) => void = () => undefined,
  ) {}

  /** The built view, or null while the build is in flight / after a failure. */
  get current(): PtTerrainView | null {
    return this.view;
  }

  /** The descriptor this gate is bound to (built or building), or null. */
  get source(): PtMapDescriptor | null {
    return this.src;
  }

  /**
   * Start the terrain build for `src` if none is in flight and none has
   * completed for it. A different `src` than the current/pending one tears
   * down the old view first. Returns the in-flight promise (or null when
   * already built), so callers and tests can await completion. Safe to call
   * every frame.
   */
  ensure(src: PtMapDescriptor): Promise<void> | null {
    if (src !== this.src) this.reset();
    this.src = src;
    if (this.view !== null || this.pending !== null) return this.pending;
    const seq = this.seq;
    this.pending = this.build(src)
      .then((view) => {
        if (this.seq === seq && this.src === src) {
          this.view = view;
          this.attach(view);
        } else {
          // Superseded while building: never attach a stale map's view.
          view.dispose();
        }
      })
      .catch(() => undefined)
      .then(() => {
        // Only the current generation may clear pending: a stale chain must
        // not release the gate while a newer build is in flight.
        if (this.seq === seq) this.pending = null;
      });
    return this.pending;
  }

  /**
   * Detach and dispose the current view and invalidate any in-flight build.
   * The next ensure() starts fresh.
   */
  reset(): void {
    this.seq++;
    this.src = null;
    // Drop the reference to any stale in-flight build; its resolution is
    // rejected by the seq check above and never touches the scene.
    this.pending = null;
    if (this.view !== null) {
      this.detach(this.view);
      this.view.dispose();
      this.view = null;
    }
  }
}
