// WarpGate connected-world runtime: the PT client's sFIELD::CheckWarpGate
// over the generated/pt-maps packages.
//
// WarpGate is a TELEPORT, not a FieldGate seam. Source semantics
// (field.cpp CheckWarpGate, reproduced faithfully):
//   - Runs every frame on the field that OWNS the player
//     (StageField[OnStageField]) - never scans other fields.
//   - Trigger cylinder per gate: dx*dx+dz*dz < size*size in integer PT
//     units, plus |dx|,|dz| < 1024 axis bounds and |y-gate.y| < height.
//     The height check is disabled when the authored gate y is 0.
//   - Requires LimitLevel <= player level and at least one OutGate record.
//   - Global re-trigger lock: dwWarpDelayTime + 3000ms blocks any further
//     warp after a successful one (shared across fields, module state).
//   - SpecialEffect 0: immediate warp to rand()%OutGateCount exit.
//   - SpecialEffect != 0: first pass snaps the player to the gate center,
//     stops movement (MoveFlag = 0), and arms a delayed warp. SpecialEffect
//     1 fires about 2s later through the normal exit branch; SpecialEffect
//     2 arms the wing-warp flow and blocks re-trigger (dwWarpDelayTime =
//     0xFFFF0000) until a destination is selected via the wing-gate UI.
//   - The wing path (WingWarpGate_Field) level-checks the destination
//     field (FieldLimitLevel_Table[index]) and requires the player within
//     DIST_TRANSLEVEL_LOW of lpLastWarpField->PosWarpOut, then teleports
//     to the DESTINATION field's PosWarpOut - the point stamped by its
//     self-targeting AddWarpOutGate.
//   - On warp: LoadStageFromField(dest, source) keeps the source field in
//     the second slot, SetPosi places the player at the authored exit
//     coordinate verbatim (no floor validation - the AncientW no-floor
//     exit still lands on its authored coordinate), facing preserved.
//
// Dead records (a gate with zero exits because every AddWarpOutGate line
// is commented out, e.g. iron-2's snow/HeartOfFire exits) fail the
// OutGateCount test exactly like the source and need no special-casing.

import {
  activePtMapDescriptor,
  setActivePtMap,
  setStandbyPtMap,
  standbyPtMapDescriptor,
} from '../sim/pt_field_active';
import type { PtMapDescriptor, PtWarpGateLink, PtWarpOutExit } from '../sim/pt_field';
import type { Entity } from '../sim/types';
import { loadPtDevMap, ptDevWarpFields } from './pt_dev_maps';

// dwWarpDelayTime + 3000: the global re-warp lockout after a successful
// warp (and the SE2-cancel block).
const PT_WARP_DELAY_MS = 3000;
// A SpecialEffect 1 gate sets dwWarpDelayTime = dwPlayTime - 1000, so the
// 3000ms guard releases the armed warp ~2000ms after the first pass.
const PT_EFFECT_WARP_DELAY_MS = 2000;
// The trigger's per-axis bound: abs(dx) < 1024 and abs(dz) < 1024.
const PT_WARP_AXIS_LIMIT = 1024;
// DIST_TRANSLEVEL_LOW: wing-warp requires the player within this squared
// distance of lpLastWarpField->PosWarpOut (PT units squared).
const PT_WING_WARP_DIST2 = 0x320000;
// dwWarpDelayTime = 0xFFFF0000 blocks re-trigger indefinitely - the
// wing-warp armed state.
const PT_WARP_BLOCKED = Number.POSITIVE_INFINITY;
// WingWarpGate_Field(-1) (UI cancel) sets dwWarpDelayTime = 5000 absolute,
// blocking while dwPlayTime < 8000 - kept verbatim.
const PT_WARP_CANCEL_UNTIL = 8000;

export interface PtWarpDebugState {
  warpDelayUntil: number;
  nextWarpDelay: boolean;
  wingFieldIndex: number;
  lastWarpFieldId: string | null;
  armedGate: PtWarpGateLink | null;
  warpInFlight: boolean;
}

let _warpDelayUntil = 0; // dwWarpDelayTime -> absolute unblock timestamp
let _nextWarpDelay = false; // dwNextWarpDelay: a delayed warp is armed
let _wingFieldIndex = -1; // WingWarpField
let _lastWarpFieldId: string | null = null; // lpLastWarpField
let _armedGate: PtWarpGateLink | null = null; // the SE!=0 gate awaiting its second pass
let _armedFieldId: string | null = null; // field the armed gate belongs to
let _warpInFlight = false; // async destination load in progress

let _rng: () => number = Math.random;

/** Test hook: replace the exit-selection rng (source: rand()). */
export function setPtWarpRng(rng: () => number): void {
  _rng = rng;
}

/** fieldIndex -> {id, posWarpOut, limitLevel}, lazily built from manifests. */
let _fieldByIndex: Map<number, {
  id: string;
  posWarpOut: { x: number; y: number; z: number } | null;
  limitLevel: number;
}> | null = null;

function fieldByIndex() {
  if (_fieldByIndex !== null) return _fieldByIndex;
  _fieldByIndex = new Map();
  for (const f of ptDevWarpFields()) {
    _fieldByIndex.set(f.fieldIndex, {
      id: f.id,
      posWarpOut: f.posWarpOut,
      limitLevel: f.limitLevel,
    });
  }
  return _fieldByIndex;
}

/** The gate that currently triggers, or null. Pure CheckWarpGate scan. */
function triggeringGate(
  desc: PtMapDescriptor,
  ptX: number,
  ptY: number,
  ptZ: number,
  level: number,
): PtWarpGateLink | null {
  for (const g of desc.warpGates ?? []) {
    const dx = Math.floor(g.x - ptX);
    const dz = Math.floor(g.z - ptZ);
    // Source: gate.y == 0 disables the height check (dy = 0).
    const dy = g.y === 0 ? 0 : Math.abs(ptY - g.y);
    const dist = dx * dx + dz * dz;
    if (
      g.limitLevel <= level &&
      g.exits.length > 0 &&
      Math.abs(dx) < PT_WARP_AXIS_LIMIT &&
      Math.abs(dz) < PT_WARP_AXIS_LIMIT &&
      dist < g.size * g.size &&
      dy < g.height
    ) {
      return g;
    }
  }
  return null;
}

/** SetPosi: authored PT coordinate -> WoC through the DESTINATION field's
 *  transform. prevPos is pinned too so the renderer cannot interpolate a
 *  streak across the map. Facing is preserved (source keeps Angle). */
function setPosi(player: Entity, desc: PtMapDescriptor, x: number, y: number, z: number): void {
  player.pos.x = desc.transform.ptXToWoC(x);
  player.pos.y = desc.transform.ptYToWoC(y);
  player.pos.z = desc.transform.ptZToWoC(z);
  player.prevPos.x = player.pos.x;
  player.prevPos.y = player.pos.y;
  player.prevPos.z = player.pos.z;
}

function snapToGate(player: Entity, desc: PtMapDescriptor, g: PtWarpGateLink): void {
  setPosi(player, desc, g.x, g.y, g.z);
}

async function finishWarp(
  player: Entity,
  source: PtMapDescriptor,
  destId: string | null,
  x: number,
  y: number,
  z: number,
  now: number,
): Promise<void> {
  _warpInFlight = true;
  try {
    if (destId !== null) {
      const loaded = await loadPtDevMap(destId);
      // LoadStageFromField(dest, source): the warped-to field becomes the
      // active stage and the field warped FROM stays loaded in the second
      // slot. A stale descriptor read (another /ptmap during the await)
      // fails closed.
      setActivePtMap(loaded.descriptor);
      // LoadStageFromField pushes the field warped FROM into the second
      // slot; on a self-field warp the second slot keeps whatever it held
      // (a FieldGate-preloaded neighbor stays resident).
      setStandbyPtMap(
        source.id === loaded.descriptor.id ? standbyPtMapDescriptor() : source,
      );
      setPosi(player, loaded.descriptor, x, y, z);
    }
    // A null/unconvertible destination consumes the armed warp without
    // moving the player - the source reaches the same post-warp block on
    // a failed WarpField and still resets the delay + armed state.
  } catch {
    // An unconvertible destination fails closed: the player stays put.
  } finally {
    _warpInFlight = false;
    // dwWarpDelayTime = dwPlayTime: the 3s global re-trigger lock runs
    // whether or not the load succeeded (the source sets it in the same
    // block before returning).
    _warpDelayUntil = now + PT_WARP_DELAY_MS;
    _nextWarpDelay = false;
    _wingFieldIndex = -1;
    _armedGate = null;
    _armedFieldId = null;
  }
}

/**
 * One CheckWarpGate frame. Called every rendered frame while a dev map is
 * installed (source cadence is every frame on the owning field). `now` is
 * the dwPlayTime equivalent in milliseconds; `level` the player level.
 * Never moves the player except through the faithful SetPosi paths.
 */
export function tickPtWarpGates(player: Entity, now: number): void {
  const active = activePtMapDescriptor();
  if (active === null) return; // default Ricarten binding: no warp graph
  // A map switch under an armed gate drops the arm (the armed gate
  // belongs to the previous field's trigger list).
  if (_armedGate && _armedFieldId !== active.id) {
    _armedGate = null;
    _armedFieldId = null;
    _nextWarpDelay = false;
  }
  // While a delayed warp is armed the source holds the player at the gate
  // center (MoveFlag = 0 + the snap). Pin position the same way so the
  // armed gate re-triggers on its second pass.
  if (_armedGate && !_warpInFlight) snapToGate(player, active, _armedGate);
  // dwWarpDelayTime guard: a global lockout after each warp (or while a
  // wing-warp arm blocks it indefinitely).
  if (_warpDelayUntil !== 0 && _warpDelayUntil > now) return;
  if (_warpInFlight) return;

  const ptX = active.transform.woCToPtX(player.pos.x);
  const ptY = active.transform.woCToPtY(player.pos.y);
  const ptZ = active.transform.woCToPtZ(player.pos.z);
  const gate = triggeringGate(active, ptX, ptY, ptZ, player.level);
  if (gate === null) return;

  _lastWarpFieldId = active.id;

  if (gate.specialEffect !== 0 && !_nextWarpDelay) {
    // First pass of a delayed gate: snap to the gate center, stop motion,
    // arm the second pass. No teleport yet.
    _nextWarpDelay = true;
    _armedGate = gate;
    _armedFieldId = active.id;
    snapToGate(player, active, gate);
    if (gate.specialEffect === 2) {
      // cSinWarpGate.SerchUseWarpGate(): the wing-warp gate blocks until a
      // destination is selected via ptWingWarpSelect.
      _warpDelayUntil = PT_WARP_BLOCKED;
    } else {
      // dwWarpDelayTime = dwPlayTime - 1000: releases ~2s later.
      _warpDelayUntil = now + PT_EFFECT_WARP_DELAY_MS;
    }
    return;
  }

  if (_wingFieldIndex >= 0) {
    // Wing warp: the destination is the selected FIELD's PosWarpOut.
    const dest = fieldByIndex().get(_wingFieldIndex);
    const po = dest?.posWarpOut ?? null;
    void finishWarp(
      player,
      active,
      po !== null ? dest!.id : null,
      po?.x ?? 0,
      po?.y ?? 0,
      po?.z ?? 0,
      now,
    );
    return;
  }

  // rand() % OutGateCount: uniform random exit selection.
  const exit: PtWarpOutExit =
    gate.exits[Math.floor(_rng() * gate.exits.length) % gate.exits.length];
  void finishWarp(player, active, exit.targetId, exit.x, exit.y, exit.z, now);
}

/**
 * WingWarpGate_Field(dwFieldCode): the wing-gate destination selection.
 * fieldIndex < 0 is the UI cancel path. Returns false on the same
 * validation failures as the source (no last warp field, bad code, level
 * gate, out of PosWarpOut range).
 */
export function ptWingWarpSelect(
  fieldIndex: number,
  player: Entity | undefined,
  now: number,
): boolean {
  _nextWarpDelay = true;
  _warpDelayUntil = PT_WARP_CANCEL_UNTIL; // dwWarpDelayTime = 5000 verbatim
  _wingFieldIndex = -1;
  if (_lastWarpFieldId === null) return false;
  if (fieldIndex < 0) return false;
  if (player === undefined) return false;
  const dest = fieldByIndex().get(fieldIndex);
  if (dest === undefined) return false;
  if (dest.limitLevel > player.level) return false;
  // dist > DIST_TRANSLEVEL_LOW fails: distance between the player and the
  // last warp field's PosWarpOut, in PT units.
  const last = ptDevWarpFields().find((f) => f.id === _lastWarpFieldId);
  const lastDesc = activePtMapDescriptor();
  const po = last?.posWarpOut ?? null;
  if (po === null || lastDesc === null) return false;
  const dx = lastDesc.transform.woCToPtX(player.pos.x) - po.x;
  const dy = lastDesc.transform.woCToPtY(player.pos.y) - po.y;
  const dz = lastDesc.transform.woCToPtZ(player.pos.z) - po.z;
  if (dx * dx + dy * dy + dz * dz > PT_WING_WARP_DIST2) return false;
  // Effect + delay, then the armed gate's second pass warps to the
  // destination field's PosWarpOut.
  _warpDelayUntil = now + PT_EFFECT_WARP_DELAY_MS;
  _wingFieldIndex = fieldIndex;
  return true;
}

/** Debug/test surface: the module-global warp state. */
export function ptWarpState(): PtWarpDebugState {
  return {
    warpDelayUntil: _warpDelayUntil,
    nextWarpDelay: _nextWarpDelay,
    wingFieldIndex: _wingFieldIndex,
    lastWarpFieldId: _lastWarpFieldId,
    armedGate: _armedGate,
    warpInFlight: _warpInFlight,
  };
}

/** Test hook: reset all module state between cases. */
export function resetPtWarpState(): void {
  _warpDelayUntil = 0;
  _nextWarpDelay = false;
  _wingFieldIndex = -1;
  _lastWarpFieldId = null;
  _armedGate = null;
  _armedFieldId = null;
  _warpInFlight = false;
  _rng = Math.random;
}
