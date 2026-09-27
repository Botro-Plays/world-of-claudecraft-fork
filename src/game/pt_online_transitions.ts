// Online PT field transitions: the client half of phase O2.
//
// The realm owns PT field identity and transition resolution
// (src/sim/pt_transitions.ts); this module is only the client glue:
//
//   1. FieldGate watch reuse: the EXISTING preload scan
//      (pt_field_links.tickPtFieldGates) still runs - it never moves the
//      player and never flips identity, it just keeps the gate-neighbor
//      package warm so the destination is dressed when the authoritative
//      flip lands. The standby->active promotion itself still happens
//      inside the shared movement kernel's floor check (offline and in
//      self-prediction), which is presentation only.
//   2. Transition nudges: on a bound-map flip (the local floor promotion
//      already happened) or while standing inside an authored WarpGate
//      trigger cylinder (descriptor records + the shared ptWarpTriggerIn
//      predicate), the client sends the data-free `pt_transition` command.
//      The server re-derives source field, gate, destination, level and
//      lockout itself; nothing in the request can be forged.
//   3. Authoritative reconcile: the `ptf` self-delta is the realm's field
//      identity. When it disagrees with the bound package past a short
//      hysteresis (hint rejected, warp landed elsewhere, reconnect into
//      another town), this module binds the authoritative field through
//      the existing package loader. The pt_transition event forces the
//      same bind immediately.
//   4. The transition curtain needs no separate drive: a new bound
//      descriptor is exactly the signal createPtFieldTransition watches,
//      so the existing loading screen covers online swaps verbatim.
//
// This module NEVER teleports and NEVER trusts a client-side field name:
// every bind derives from the authoritative `ptf` value or the pid-scoped
// `pt_transition` event. Offline/dev traversal is untouched - main.ts only
// calls into this module while connected to a realm.

import { isPtPos } from '../sim/pt_band';
import type { PtMapDescriptor } from '../sim/pt_field';
import {
  activePtMapDescriptor,
  setActivePtMap,
  setStandbyPtMap,
  standbyPtMapDescriptor,
} from '../sim/pt_field_active';
import { ptWarpTriggerIn } from '../sim/pt_map_graph';
import type { Entity, SimEvent } from '../sim/types';
import type { IWorld } from '../world_api';
import './pt_map_links'; // registers the shared map graph on this host
import { loadPtDevMap } from './pt_dev_maps';
import { tickPtFieldGates } from './pt_field_links';

// Minimum spacing between pt_transition nudges (ms). The realm's passive
// scan is the real authority - this cadence just keeps a client standing in
// a trigger from spamming the wire.
const PT_REQUEST_COOLDOWN_MS = 800;
// How long the bound field may disagree with the authoritative `ptf`
// before the reconcile binds the realm's answer. Covers the normal race:
// the local floor promotion flips a frame or two before the server's tick
// resolves the same crossing (both watch the same authoritative position,
// so agreement is the common case and only real divergence heals).
const PT_FIELD_MISMATCH_MS = 1500;

let _lastRequestAt = -Infinity;
let _lastBoundId: string | null = null;
let _lastPtf: string | null | undefined; // undefined = never observed
let _mismatchSince = 0;
let _pendingBind: string | null = null;
let _clock: (() => number) | null = null;

function nowMs(): number {
  return _clock?.() ?? performance.now();
}

/**
 * Bind the realm-resolved field (LoadStageFromField semantics: destination
 * active, the field we came from stays in the standby slot). 'ricarten'
 * restores the production default binding rather than loading a second
 * descriptor for the same field. Fail-closed: an unconvertible package
 * keeps the current binding.
 */
async function bindAuthoritativeField(fieldId: string): Promise<void> {
  _pendingBind = fieldId;
  try {
    if (fieldId === 'ricarten') {
      const prev = activePtMapDescriptor();
      if (prev?.id === 'ricarten') return;
      const keep: PtMapDescriptor | null = prev ?? standbyPtMapDescriptor();
      setActivePtMap(null);
      if (keep !== null && keep.id !== 'ricarten') setStandbyPtMap(keep);
      return;
    }
    const loaded = await loadPtDevMap(fieldId);
    if (_pendingBind !== fieldId) return; // superseded while loading
    const prev = activePtMapDescriptor();
    if (prev?.id === loaded.descriptor.id) return;
    setActivePtMap(loaded.descriptor);
    if (prev !== null && prev.id !== loaded.descriptor.id) setStandbyPtMap(prev);
  } catch {
    // An unconvertible destination package fails closed: the current field
    // binding stays (collision is host-side; the realm still owns identity).
  } finally {
    if (_pendingBind === fieldId) _pendingBind = null;
  }
}

/** The data-free nudge, throttled. */
function requestTransition(world: IWorld): void {
  const t = nowMs();
  if (t - _lastRequestAt < PT_REQUEST_COOLDOWN_MS) return;
  _lastRequestAt = t;
  void world.requestPtFieldTransition();
}

/**
 * One online PT-transition frame. Runs only while connected to a realm
 * (main.ts); `player` is the authoritative self mirror. Does the FieldGate
 * preload watch, the WarpGate presence probe, the flip nudge, and the ptf
 * reconcile - never a move.
 */
export function tickPtOnlineTransitions(world: IWorld, player: Entity | undefined): void {
  if (player === undefined) return;
  if (!isPtPos(player.pos.x)) {
    _lastBoundId = null;
    _mismatchSince = 0;
    return;
  }
  const active = activePtMapDescriptor();
  if (active === null) return; // no PT binding on this client at all

  // 1. Keep the FieldGate neighbor warm (presentation only; the scan never
  //    moves the player and never decides identity).
  tickPtFieldGates(player.pos.x, player.pos.z);

  // 2. Nudge on a bound-map flip (the local promotion already walked the
  //    seam - ask the authority to confirm it now rather than next tick).
  if (active.id !== _lastBoundId) {
    if (_lastBoundId !== null) requestTransition(world);
    _lastBoundId = active.id;
    _mismatchSince = 0;
  }

  // 3. WarpGate presence probe on the bound field's own authored records.
  if (active.warpGates !== undefined && active.warpGates.length > 0) {
    const ptX = active.transform.woCToPtX(player.pos.x);
    const ptY = active.transform.woCToPtY(player.pos.y);
    const ptZ = active.transform.woCToPtZ(player.pos.z);
    if (ptWarpTriggerIn(active.warpGates, ptX, ptY, ptZ, player.level) !== null) {
      requestTransition(world);
    }
  }

  // 4. ptf reconcile: the first observed value heals entry guesses
  //    (bindPtStartField binds the CLASS start town; a returning character
  //    may stand in another field entirely), and a persistent mismatch heals
  //    a rejected hint / a warp landing in a field we never bound.
  const ptf = world.ptField;
  if (ptf !== null && ptf !== active.id) {
    if (_lastPtf === undefined || _lastPtf !== ptf) {
      // First sighting of THIS authoritative field: bind immediately. For
      // the entry case this replaces the start-town guess; mid-session a ptf
      // change means the realm moved us (a warp event also lands, but ptf
      // alone covers a missed/late event).
      void bindAuthoritativeField(ptf);
      _mismatchSince = 0;
    } else {
      // Unchanged ptf still disagreeing with the local binding: the realm
      // rejected our flip (or resolved a different claimant). Give the seam
      // overlap window a moment to settle, then adopt the authority's field.
      const t = nowMs();
      if (_mismatchSince === 0) _mismatchSince = t;
      if (t - _mismatchSince >= PT_FIELD_MISMATCH_MS) {
        void bindAuthoritativeField(ptf);
        _mismatchSince = 0;
      }
    }
  } else {
    _mismatchSince = 0;
  }
  _lastPtf = ptf;
}

/**
 * The pid-scoped authoritative transition event: the realm resolved a field
 * change for this player - bind the destination immediately (the position
 * snap for 'warp' is carried by the wire position itself, not this event).
 */
export function handlePtTransitionEvent(ev: SimEvent, selfPid: number): void {
  if (ev.type !== 'pt_transition' || ev.pid !== selfPid) return;
  void bindAuthoritativeField(ev.field);
}

/** Test hook: inject a clock so cooldown/hysteresis are deterministic. */
export function setPtOnlineTransitionsClock(clock: (() => number) | null): void {
  _clock = clock;
}

/** Test hook / session reset: drop all module state. */
export function resetPtOnlineTransitions(): void {
  _lastRequestAt = -Infinity;
  _lastBoundId = null;
  _lastPtf = undefined;
  _mismatchSince = 0;
  _pendingBind = null;
  _clock = null;
}
