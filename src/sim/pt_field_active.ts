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
let _standbyDescriptor: PtMapDescriptor | null = null;
let _standbyField: PtField | null = null;

// ---------------------------------------------------------------------------
// Two-slot connected-world binding (the PT client's StageField[0]/[1] model)
// ---------------------------------------------------------------------------
//
// The original engine keeps the player's current field in StageField[0] and
// the nearest FieldGate neighbor preloaded in StageField[1]. Ownership does
// NOT flip at the preload trigger: it flips inside CheckNextMove, when the
// active stage's floor test fails at a position and the standby stage's
// succeeds. Movement itself never teleports - the same world-space position
// simply resolves against the other stage's triangles.
//
// This composite mirrors that: floorHeight evaluates BOTH fields the way PT
// runs smGameStage[0] and smGameStage[1] CheckNextMove in parallel
// (character.cpp). When both resolve the destination, PT compares the two
// floor heights: within ~8 PT units the results are considered the same
// surface and the active field keeps ownership, but when they diverge the
// HIGHER floor wins - that is how a walker steps up onto the neighboring
// field's road/deck across a seam (the Ricarten gate road sits ~47 units
// above fore-1's moat lip at the overlap) instead of descending into the
// active field's lower surface. Pure queries
// (groundHeight/supportHeight/waterLevel) also fall back to the standby so
// rendering-side reads stay consistent across the boundary, but only
// floorHeight - the movement kernel's check - performs ownership transfer.
// wallHit ORs both fields so a boundary wall on either side still blocks.

// 8 PT units in WoC yards (fONE*8 divergence band from character.cpp).
const PT_FLOOR_DIVERGENCE_WOC = 8 * 0.036;

const _linkedField: PtField = {
  groundHeight(x, z) {
    const a = _activeField!.groundHeight(x, z);
    if (a !== -Infinity || !_standbyField) return a;
    return _standbyField.groundHeight(x, z);
  },
  supportHeight(x, z, r, maxY) {
    const a = _activeField!.supportHeight(x, z, r, maxY);
    if (a !== -Infinity || !_standbyField) return a;
    return _standbyField.supportHeight(x, z, r, maxY);
  },
  floorHeight(x, z, refY) {
    const a = _activeField!.floorHeight(x, z, refY);
    const b = _standbyField ? _standbyField.floorHeight(x, z, refY) : -Infinity;
    if (a === -Infinity) {
      if (b !== -Infinity) promoteStandbyField();
      return b;
    }
    if (b === -Infinity) return a;
    // Both fields offer a floor: a near-identical pair is the same surface
    // continuing across the boundary, so the active field keeps ownership.
    // Past the divergence band the higher floor wins the step; when that is
    // the standby's the slots swap (OnStageField = 1 in the source).
    if (b > a && b - a >= PT_FLOOR_DIVERGENCE_WOC) {
      promoteStandbyField();
      return b;
    }
    return a;
  },
  wallHit(sx, sy, sz, ex, ez, destFloorY) {
    if (_activeField!.wallHit(sx, sy, sz, ex, ez, destFloorY)) return true;
    return _standbyField?.wallHit(sx, sy, sz, ex, ez, destFloorY) ?? false;
  },
  spawnY(x, z) {
    const a = _activeField!.groundHeight(x, z);
    if (Number.isFinite(a)) return a;
    const b = _standbyField?.groundHeight(x, z) ?? -Infinity;
    return Number.isFinite(b) ? b : 0;
  },
  waterLevel(x, z) {
    const a = _activeField!.waterLevel(x, z);
    if (a !== -Infinity || !_standbyField) return a;
    return _standbyField.waterLevel(x, z);
  },
};

function promoteStandbyField(): void {
  const d = _standbyDescriptor;
  const f = _standbyField;
  _standbyDescriptor = _activeDescriptor;
  _standbyField = _activeField;
  _activeDescriptor = d;
  _activeField = f;
}

/**
 * The field every PT-band query routes through: the dev-installed map when
 * one is active, otherwise Ricarten. While a standby neighbor is installed
 * this returns the two-slot composite above.
 */
export function activePtField(): PtField {
  if (_activeField === null) return ptRicartenField();
  return _standbyField === null ? _activeField : _linkedField;
}

/**
 * The dev-installed map descriptor, or null while Ricarten is bound. The
 * renderer reads this to build the matching terrain view.
 */
export function activePtMapDescriptor(): PtMapDescriptor | null {
  return _activeDescriptor;
}

/**
 * The preloaded FieldGate neighbor descriptor, or null. The renderer keeps
 * a second terrain view bound to it so the destination is visible before
 * the player crosses.
 */
export function standbyPtMapDescriptor(): PtMapDescriptor | null {
  return _standbyDescriptor;
}

/**
 * Install a dev map (or null to restore Ricarten). Development-harness only:
 * nothing calls this in production flow, so the default path stays the
 * committed Ricarten field. Installing a new active map drops any standby:
 * it belongs to the previous map's neighborhood.
 */
export function setActivePtMap(descriptor: PtMapDescriptor | null): void {
  _activeDescriptor = descriptor;
  _activeField = descriptor
    ? createPtField(descriptor.field, descriptor.transform)
    : null;
  _standbyDescriptor = null;
  _standbyField = null;
}

/**
 * Install (or clear) the standby neighbor. A standby identical to the
 * active map is ignored (the SeaA self-loop and double-authored edges land
 * here), so FieldGate dead ends degrade to a harmless no-op.
 */
export function setStandbyPtMap(descriptor: PtMapDescriptor | null): void {
  if (descriptor !== null && descriptor.id === _activeDescriptor?.id) {
    descriptor = null;
  }
  _standbyDescriptor = descriptor;
  _standbyField = descriptor
    ? createPtField(descriptor.field, descriptor.transform)
    : null;
}
