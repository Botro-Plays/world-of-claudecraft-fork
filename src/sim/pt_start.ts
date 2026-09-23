// PT starting-town resolution: which PT map a newly created PT character
// enters the world on.
//
// Ricarten is the Tempskron starting town. Morion and Atlanteon starting
// towns are not implemented yet (P2). WoC classes return null and keep the
// existing Proving Shore / Eastbrook flow untouched.
//
// The returned position is in WoC band coordinates (X/Z); Y is resolved by
// the caller through the normal ground-position path (groundPos ->
// groundHeight -> ptRicartenGroundHeight), never hardcoded here.

import { ptTribeForClass } from './content/pt_tribes';
import { PT_RICARTEN_SPAWN_FACING, PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z } from './pt_band';
import type { PlayerClass } from './types';

/**
 * The starting position for a PT class's tribe starting town, in WoC band
 * coordinates, or null when the class has no PT starting town (WoC classes,
 * and PT tribes whose towns are not implemented yet).
 */
export function ptStartPosForClass(cls: PlayerClass): { x: number; z: number; facing: number } | null {
  if (ptTribeForClass(cls)?.id !== 'tempskron') return null;
  return { x: PT_RICARTEN_SPAWN_X, z: PT_RICARTEN_SPAWN_Z, facing: PT_RICARTEN_SPAWN_FACING };
}
