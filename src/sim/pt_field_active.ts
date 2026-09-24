// The PT field currently bound to the PT band.
//
// Production runtime always resolves to the committed Ricarten field: the
// queries below return the exact same values the old ptRicarten* functions
// did. The development map-test harness (/ptmap) installs a PtMapDescriptor
// built from a generated/pt-maps/<id>/ package; while one is installed every
// PT-band collision/water query routes to that map's data instead. Clearing
// the descriptor restores Ricarten with no state carried over.

import * as RICARTEN_MODULE from './pt_ricarten_field.generated';
import { createPtField, type PtField, type PtFieldTransform, type PtMapDescriptor } from './pt_field';
import {
  ptXToWoC,
  ptYToWoC,
  ptZToWoC,
  woCToPtX,
  woCToPtY,
  woCToPtZ,
} from './pt_band';

// Ricarten keeps its existing pt_band transform constants (the rounded
// bounds in pt_band.ts), not PT_BOUNDS-derived values, so this binding is
// byte-identical to the pre-extraction code path.
const RICARTEN_TRANSFORM: PtFieldTransform = {
  ptXToWoC,
  ptYToWoC,
  ptZToWoC,
  woCToPtX,
  woCToPtY,
  woCToPtZ,
};

let _ricartenField: PtField | null = null;

/** The committed Ricarten field, built on first query. */
export function ptRicartenField(): PtField {
  if (_ricartenField === null) {
    _ricartenField = createPtField(RICARTEN_MODULE, RICARTEN_TRANSFORM);
  }
  return _ricartenField;
}

let _activeDescriptor: PtMapDescriptor | null = null;
let _activeField: PtField | null = null;

/**
 * The field every PT-band query routes through: the dev-installed map when
 * one is active, otherwise Ricarten.
 */
export function activePtField(): PtField {
  return _activeField ?? ptRicartenField();
}

/**
 * The dev-installed map descriptor, or null while Ricarten is bound. The
 * renderer reads this to build the matching terrain view.
 */
export function activePtMapDescriptor(): PtMapDescriptor | null {
  return _activeDescriptor;
}

/**
 * Install a dev map (or null to restore Ricarten). Development-harness only:
 * nothing calls this in production flow, so the default path stays the
 * committed Ricarten field.
 */
export function setActivePtMap(descriptor: PtMapDescriptor | null): void {
  _activeDescriptor = descriptor;
  _activeField = descriptor
    ? createPtField(descriptor.field, descriptor.transform)
    : null;
}
