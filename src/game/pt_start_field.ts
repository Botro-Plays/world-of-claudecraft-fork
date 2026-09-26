// Starting-town field binding: installs the tribe's starting-town PT field
// as the active map before the world resolves a fresh spawn's floor.
//
// Why this exists: Sim construction places a new PT character at
// ptStartPosForClass's WoC position and resolves Y through
// groundPos -> activePtField(). For Ricarten that is already correct (the
// production default binding); for Pillai / Atlantis Town the field data
// lives in a lazily loaded generated/pt-maps package, so the descriptor
// must be installed BEFORE the Sim (or ClientWorld join) samples the floor,
// otherwise the spawn Y resolves against the wrong field.
//
// The same call reconciles the binding on re-entry: 'ricarten' restores the
// production default so a character can never inherit a stale dev/town
// install left over from an earlier session in the same page.

import { setActivePtMap } from '../sim/pt_field_active';
import { ptStartPosForClass } from '../sim/pt_start';
import type { PlayerClass } from '../sim/types';
import { loadPtDevMap } from './pt_dev_maps';

/**
 * Bind the active PT field to `cls`'s tribe starting town. `defaultWorld`
 * must mirror the compulsoryTutorial condition (false for editor play-test
 * worlds): a custom world never rebinds the PT map. No-op for WoC classes.
 */
export async function bindPtStartField(cls: PlayerClass, defaultWorld: boolean): Promise<void> {
  const start = defaultWorld ? ptStartPosForClass(cls) : null;
  if (start === null) return;
  if (start.fieldId === 'ricarten') {
    // Restore the production default binding (registered by the render
    // layer) so a stale dev-map or other-town install cannot shadow it.
    setActivePtMap(null);
    return;
  }
  const loaded = await loadPtDevMap(start.fieldId);
  setActivePtMap(loaded.descriptor);
}
