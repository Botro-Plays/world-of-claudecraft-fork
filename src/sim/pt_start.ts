// PT starting-town resolution: which PT map a newly created PT character
// enters the world on.
//
// Each tribe lands in its own source-authentic town (field.cpp StartField /
// WarpStartField): Tempskron -> Ricarten (field 3), Morion -> Pillai
// ("pilai", field 21, START_FIELD_MORYON), Atlanteon -> Atlantis Town
// ("town1", field 51, START_FIELD_ATLANTIS). WoC classes return null and
// keep the existing Proving Shore / Eastbrook flow untouched.
//
// The returned position is in WoC band coordinates (X/Z); Y is resolved by
// the caller through the normal ground-position path (groundPos ->
// groundHeight -> activePtField), never hardcoded here. `fieldId` names the
// generated/pt-maps/<id> package the entry flow binds as the active field
// so that resolution lands on the right town's collision data.

import { ptTribeForClass } from './content/pt_tribes';
import {
  PT_PILAI_SPAWN_FACING,
  PT_PILAI_SPAWN_X,
  PT_PILAI_SPAWN_Z,
  PT_RICARTEN_SPAWN_FACING,
  PT_RICARTEN_SPAWN_X,
  PT_RICARTEN_SPAWN_Z,
  PT_TOWN1_SPAWN_FACING,
  PT_TOWN1_SPAWN_X,
  PT_TOWN1_SPAWN_Z,
} from './pt_band';
import type { PlayerClass } from './types';

/** A tribe starting-town spawn: the generated map package id plus the WoC
 *  band position and arrival facing. */
export interface PtStartPos {
  fieldId: string;
  x: number;
  z: number;
  facing: number;
}

/**
 * The starting position for a PT class's tribe starting town, in WoC band
 * coordinates, or null when the class has no PT starting town (WoC classes).
 */
export function ptStartPosForClass(cls: PlayerClass): PtStartPos | null {
  switch (ptTribeForClass(cls)?.id) {
    case 'tempskron':
      return { fieldId: 'ricarten', x: PT_RICARTEN_SPAWN_X, z: PT_RICARTEN_SPAWN_Z, facing: PT_RICARTEN_SPAWN_FACING };
    case 'morion':
      return { fieldId: 'pilai', x: PT_PILAI_SPAWN_X, z: PT_PILAI_SPAWN_Z, facing: PT_PILAI_SPAWN_FACING };
    case 'atlanteon':
      return { fieldId: 'town1', x: PT_TOWN1_SPAWN_X, z: PT_TOWN1_SPAWN_Z, facing: PT_TOWN1_SPAWN_FACING };
    default:
      return null;
  }
}
