// Run/walk gait toggle state. Pure (no DOM, no IWorld) so the toggle logic is
// unit-testable without a renderer or world.
//
// The locomotion gait hysteresis (locomotion.ts) picks run vs walk from the
// smoothed speed. When the player toggles to WALK mode, the gait is forced to
// walk regardless of speed; when toggled to RUN mode (the default), the
// hysteresis picks naturally.
//
// The toggle is persisted per-character in localStorage so it survives
// relogs, matching the keybinds persistence model.

const STORAGE_KEY = 'woc_run_walk_mode';

export type GaitMode = 'run' | 'walk';

/** The default mode is RUN, matching the original behavior before the toggle
 *  existed (the hysteresis picks run at high speed). */
export const DEFAULT_GAIT_MODE: GaitMode = 'run';

/** Read the persisted gait mode from localStorage. Returns the default if
 *  the value is missing or invalid. Safe to call in any environment (returns
 *  the default when localStorage is unavailable). */
export function loadGaitMode(storage: Storage | null | undefined): GaitMode {
  if (!storage) return DEFAULT_GAIT_MODE;
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === 'run' || raw === 'walk') return raw;
  return DEFAULT_GAIT_MODE;
}

/** Persist the gait mode to localStorage. No-op when storage is unavailable. */
export function saveGaitMode(storage: Storage | null | undefined, mode: GaitMode): void {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, mode);
}

/** Flip the gait mode. Pure: returns the opposite mode. */
export function toggleGaitMode(mode: GaitMode): GaitMode {
  return mode === 'run' ? 'walk' : 'run';
}

/** Returns true when the locomotion gait should be forced to walk, given the
 *  current gait mode and the hysteresis-derived running flag. When the mode
 *  is 'walk', running is always false (forced walk). When the mode is 'run',
 *  the hysteresis result is used as-is. */
export function effectiveRunning(mode: GaitMode, hysteresisRunning: boolean): boolean {
  if (mode === 'walk') return false;
  return hysteresisRunning;
}
