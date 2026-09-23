// Per-frame guard for the PT Ricarten terrain build.
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

import type { PtTerrainView } from './pt_terrain';

export class PtTerrainGate {
  private pending: Promise<void> | null = null;
  private view: PtTerrainView | null = null;

  constructor(
    private readonly build: () => Promise<PtTerrainView>,
    private readonly attach: (view: PtTerrainView) => void,
  ) {}

  /** The built view, or null while the build is in flight / after a failure. */
  get current(): PtTerrainView | null {
    return this.view;
  }

  /**
   * Start the terrain build if none is in flight and none has completed.
   * Returns the in-flight promise (or null when already built), so callers
   * and tests can await completion. Safe to call every frame.
   */
  ensure(): Promise<void> | null {
    if (this.view !== null || this.pending !== null) return this.pending;
    this.pending = this.build()
      .then((view) => {
        this.view = view;
        this.attach(view);
      })
      .catch(() => undefined)
      .then(() => {
        this.pending = null;
      });
    return this.pending;
  }
}
