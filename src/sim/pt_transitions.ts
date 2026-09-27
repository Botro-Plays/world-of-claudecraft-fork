// Authoritative PT field transitions (online phase O2), host-agnostic so
// the realm Sim and the offline Sim share one implementation.
//
// What this owns:
//   - FieldGate crossings: seamless shared-frame boundaries - the player's
//     WoC position is continuous, so a crossing changes only which field
//     OWNS the position (entity.ptField). The realm validates that the
//     claimed destination is both live-edge-connected to the current field
//     AND bounds-claiming the position; the client never names a field the
//     server did not resolve itself.
//   - WarpGate teleports: the authored trigger cylinder (sFIELD::
//     CheckWarpGate, pt_map_graph.ptWarpTriggerIn) decides eligibility from
//     the authoritative position alone - the request carries NO destination
//     and no coordinates, so there is nothing to spoof. SE0 warps resolve an
//     exit immediately; SE1 warps arm a server-timed release; SE2 (wing
//     selection UI) rejects 'wing_unsupported' until an online destination
//     protocol exists.
//   - The re-warp lockout (dwWarpDelayTime + 3000ms) and verbatim-exit
//     landing (no floor validation - the ancientw no-floor exit is the
//     pinned case), both carried per-entity so a reconnect mid-warp never
//     re-triggers from stale module state.
//
// What this does NOT own: rendering, package loading, the transition
// curtain, monster population, or movement itself (the server already owns
// authoritative position - this module only relocates it via warps).
//
// Host roles: this resolver runs only on AUTHORITY hosts - a host with no
// bound PtMapDescriptor (the realm, headless tests). On a descriptor host
// (the offline/dev client) the existing FieldGate/WarpGate presentation
// modules own traversal, so both the tick pass and the request path are
// inert there.

import { isPtPos } from './pt_band';
import type { PtFieldTransform } from './pt_field';
import {
  activePtMapDescriptor,
  ptFieldIdAt,
  ptStaticFieldRegistered,
} from './pt_field_active';
import {
  ptFieldClaimsWocPos,
  ptGateEdgeBetween,
  ptGraphFieldGatesOf,
  ptGraphFieldTransform,
  ptGraphWocBounds,
  ptGraphWarpGatesOf,
  ptStickyFieldAt,
  ptWarpExitPick,
  ptWarpTriggerIn,
  type PtGraphWarpGate,
} from './pt_map_graph';
import { cancelProfessionSessionOnDisplacement } from './professions/session_teardown';
import type { SimContext } from './sim_context';
import { settleTeleportArrival } from './teleport_arrival';
import type { Entity } from './types';

// dwWarpDelayTime + 3000ms: the global re-warp lockout, in sim seconds.
const PT_WARP_DELAY_S = 3;
// SpecialEffect 1 delayed warps release ~2s after arming
// (dwWarpDelayTime = dwPlayTime - 1000 + 3000 in the source).
const PT_EFFECT_WARP_DELAY_S = 2;

export type PtTransitionReject =
  | 'not_pt' // player is outside the PT band
  | 'no_transition' // no gate edge or warp cylinder applies at this position
  | 'warp_locked' // the global re-warp lockout is still running
  | 'warp_pending' // a delayed warp is already armed for this player
  | 'low_level' // a trigger cylinder matched but LimitLevel gates it out
  | 'wing_unsupported' // SE2 wing-selection has no online protocol yet
  | 'field_unavailable'; // the resolved field has no collision on this host

export type PtTransitionOutcome =
  | { ok: true; kind: 'field' | 'warp'; field: string; delayed?: boolean }
  | { ok: false; reason: PtTransitionReject };

/** The transition authority only exists on descriptor-less hosts (the
 *  realm, headless sims). A bound PtMapDescriptor means the offline/dev
 *  presentation modules own traversal - running this resolver beside them
 *  would double-teleport. */
function authorityHost(): boolean {
  return activePtMapDescriptor() === null;
}

/**
 * One displace-step for a WarpGate landing: the authored exit coordinate is
 * placed VERBATIM (no groundPos re-resolve - the source never validates the
 * exit floor, and the AncientW no-floor exit relies on that), facing kept,
 * streak killed so the snapshot lands as a hard teleport on the client.
 */
function warpLand(ctx: SimContext, p: Entity, x: number, y: number, z: number): void {
  cancelProfessionSessionOnDisplacement(ctx, p);
  p.pos = { x, y, z };
  p.prevPos = { ...p.pos };
  ctx.rebucket(p);
  p.targetId = null;
  p.autoAttack = false;
  settleTeleportArrival(p);
}

/**
 * Execute a WarpGate transition: pick the exit (server-side rand), convert
 * the authored exit through the DESTINATION field's transform, and move the
 * player. Returns the outcome; rejects leave the player untouched.
 */
function execWarp(
  ctx: SimContext,
  p: Entity,
  gate: PtGraphWarpGate,
  rand: () => number,
): PtTransitionOutcome {
  const exit = ptWarpExitPick(gate, rand());
  // A gate whose exits are all dead records consumes the request without
  // moving anyone - the source reaches the same fail-closed branch.
  if (exit === null || exit.toId === null) return { ok: false, reason: 'no_transition' };
  if (!ptStaticFieldRegistered(exit.toId)) return { ok: false, reason: 'field_unavailable' };
  const xf = ptGraphFieldTransform(exit.toId);
  if (xf === null) return { ok: false, reason: 'field_unavailable' };
  warpLand(ctx, p, xf.ptXToWoC(exit.x), xf.ptYToWoC(exit.y), xf.ptZToWoC(exit.z));
  p.ptField = exit.toId;
  p.ptWarpLockUntil = ctx.time + PT_WARP_DELAY_S;
  p.ptWarpPending = undefined;
  ctx.emit({ type: 'pt_transition', pid: p.id, kind: 'warp', field: exit.toId });
  return { ok: true, kind: 'warp', field: exit.toId };
}

/**
 * The authored trigger cylinder the player currently stands in, plus the
 * owning field's transform. Null when nothing triggers - this is the ONE
 * re-derivation both the request path and the passive scan use, so a
 * client can never name the gate or the field.
 */
function warpTriggerAt(
  p: Entity,
  fieldId: string,
): { gate: PtGraphWarpGate; xf: PtFieldTransform } | null {
  const xf = ptGraphFieldTransform(fieldId);
  if (xf === null) return null;
  const gate = ptWarpTriggerIn(
    ptGraphWarpGatesOf(fieldId),
    xf.woCToPtX(p.pos.x),
    xf.woCToPtY(p.pos.y),
    xf.woCToPtZ(p.pos.z),
    p.level,
  );
  return gate === null ? null : { gate, xf };
}

/** Arm a delayed (SE!=0) warp: the source's first pass snaps the player to
 *  the gate center, stops movement (MoveFlag = 0), and hands the second
 *  pass to the tick. */
function armDelayedWarp(
  ctx: SimContext,
  p: Entity,
  fieldId: string,
  gate: PtGraphWarpGate,
  xf: PtFieldTransform,
): void {
  const cx = xf.ptXToWoC(gate.x);
  const cy = xf.ptYToWoC(gate.y);
  const cz = xf.ptZToWoC(gate.z);
  p.pos = { x: cx, y: cy, z: cz };
  p.prevPos = { ...p.pos };
  p.ptWarpPending = {
    fieldId,
    gateX: gate.x,
    gateY: gate.y,
    gateZ: gate.z,
    releaseAt: ctx.time + PT_EFFECT_WARP_DELAY_S,
  };
}

/**
 * The live field candidates a 'field' request may legally move to: a
 * non-dead FieldGate neighbor of the current field whose bounds claim the
 * position. Bounds overlap at seams is exactly what the connectivity clause
 * resolves - a field you cannot walk to cannot be claimed by standing in an
 * overlapping footprint elsewhere.
 */
function requestedFieldAt(currentId: string, wocX: number, wocZ: number): string | null {
  for (const e of ptGraphFieldGatesOf(currentId)) {
    if (e.dead || e.otherId === null) continue;
    const wb = ptGraphWocBounds(e.otherId);
    if (wb === null) continue;
    if (wocX >= wb.minX && wocX <= wb.maxX && wocZ >= wb.minZ && wocZ <= wb.maxZ) {
      return e.otherId;
    }
  }
  return null;
}

/**
 * Resolve one transition request for a player. The request is data-free by
 * design: everything is re-derived from the authoritative position, level,
 * and live field identity. Idempotent - a request racing the passive
 * tracker (or a re-armed delayed warp) answers with the state that already
 * exists rather than double-acting.
 */
export function requestPtTransition(
  ctx: SimContext,
  p: Entity,
  rand: () => number,
): PtTransitionOutcome {
  if (p.kind !== 'player' || !authorityHost()) return { ok: false, reason: 'not_pt' };
  if (!isPtPos(p.pos.x)) return { ok: false, reason: 'not_pt' };
  if (p.dead) return { ok: false, reason: 'no_transition' };
  const current = p.ptField ?? ptFieldIdAt(p.pos.x, p.pos.z);
  if (current === null) return { ok: false, reason: 'not_pt' };
  if (p.ptWarpPending !== undefined) return { ok: false, reason: 'warp_pending' };

  // WarpGate first: the source runs CheckWarpGate on the field OWNING the
  // player, never on neighbors.
  const hit = warpTriggerAt(p, current);
  if (hit !== null) {
    const { gate, xf } = hit;
    if (ctx.time < (p.ptWarpLockUntil ?? 0)) return { ok: false, reason: 'warp_locked' };
    if (gate.specialEffect === 2) {
      // Wing-warp destination selection has no online protocol: no
      // client-chosen field is accepted, and the arm does not stand in
      // for one. Documented gap - not silent client authority.
      return { ok: false, reason: 'wing_unsupported' };
    }
    if (gate.specialEffect !== 0) {
      armDelayedWarp(ctx, p, current, gate, xf);
      return { ok: true, kind: 'warp', field: current, delayed: true };
    }
    return execWarp(ctx, p, gate, rand);
  }
  // A cylinder that only failed the level check reports as such instead
  // of the ambiguous no_transition.
  const xf = ptGraphFieldTransform(current);
  if (
    xf !== null &&
    ptWarpTriggerIn(
      ptGraphWarpGatesOf(current),
      xf.woCToPtX(p.pos.x),
      xf.woCToPtY(p.pos.y),
      xf.woCToPtZ(p.pos.z),
      Number.MAX_SAFE_INTEGER,
    ) !== null
  ) {
    return { ok: false, reason: 'low_level' };
  }

  // FieldGate: the crossing is position-continuous, so "transition" here is
  // the ownership flip. Approve only a live-edge-connected claimant.
  const dest = requestedFieldAt(current, p.pos.x, p.pos.z);
  if (dest === null) {
    // Sticky fallback: the passive tracker may already have flipped this
    // player to the claimant (same seam, earlier tick) - report success
    // with the state that exists rather than a spurious rejection.
    const sticky = ptStickyFieldAt(current, p.pos.x, p.pos.z);
    if (sticky !== null && sticky !== current && ptGateEdgeBetween(current, sticky) !== null) {
      if (!ptStaticFieldRegistered(sticky)) return { ok: false, reason: 'field_unavailable' };
      p.ptField = sticky;
      ctx.emit({ type: 'pt_transition', pid: p.id, kind: 'field', field: sticky });
      return { ok: true, kind: 'field', field: sticky };
    }
    return { ok: false, reason: 'no_transition' };
  }
  if (!ptStaticFieldRegistered(dest)) return { ok: false, reason: 'field_unavailable' };
  p.ptField = dest;
  ctx.emit({ type: 'pt_transition', pid: p.id, kind: 'field', field: dest });
  return { ok: true, kind: 'field', field: dest };
}

// ---------------------------------------------------------------------------
// Per-tick authority passes (realm): pending release, presence-triggered
// warp scan, sticky FieldGate identity. All three are inert on descriptor
// hosts, so the offline/dev traversal modules keep full ownership there.
// ---------------------------------------------------------------------------

/**
 * Per-tick release of an armed delayed warp (the source's second pass).
 * While armed the player is re-pinned at the gate center - the source's
 * MoveFlag=0 hold. Death or a field change drops the arm without warping.
 */
function releasePendingWarp(ctx: SimContext, p: Entity, rand: () => number): void {
  const pend = p.ptWarpPending;
  if (pend === undefined) return;
  if (p.kind !== 'player' || p.dead || p.ptField !== pend.fieldId) {
    p.ptWarpPending = undefined;
    return;
  }
  const xf = ptGraphFieldTransform(pend.fieldId);
  const gate =
    xf === null
      ? null
      : ptGraphWarpGatesOf(pend.fieldId).find(
          (g) => g.x === pend.gateX && g.y === pend.gateY && g.z === pend.gateZ,
        ) ?? null;
  if (gate === null || xf === null) {
    p.ptWarpPending = undefined;
    return;
  }
  if (ctx.time < pend.releaseAt) {
    // Held at the gate center until release; a re-pin is a no-op when the
    // position already sits there, so no epoch churn while standing still.
    const cx = xf.ptXToWoC(gate.x);
    const cy = xf.ptYToWoC(gate.y);
    const cz = xf.ptZToWoC(gate.z);
    if (p.pos.x !== cx || p.pos.y !== cy || p.pos.z !== cz) {
      p.pos = { x: cx, y: cy, z: cz };
      p.prevPos = { ...p.pos };
    }
    return;
  }
  p.ptWarpPending = undefined;
  execWarp(ctx, p, gate, rand);
}

/**
 * The presence-triggered half of CheckWarpGate, run on authority hosts:
 * standing inside an authored cylinder IS the warp request in the source,
 * so the realm does not wait on the client's nudge. SE2 wings skip silently
 * here - they carry no destination to resolve; the explicit request path
 * is the one that answers 'wing_unsupported'.
 */
function scanWarpTrigger(ctx: SimContext, p: Entity, rand: () => number): void {
  if (p.ptWarpPending !== undefined) return;
  if (p.ptField === undefined) return;
  if (ctx.time < (p.ptWarpLockUntil ?? 0)) return;
  const hit = warpTriggerAt(p, p.ptField);
  if (hit === null) return;
  const { gate, xf } = hit;
  if (gate.specialEffect === 2) return; // wing warp has no online protocol
  if (gate.specialEffect !== 0) {
    armDelayedWarp(ctx, p, p.ptField, gate, xf);
    return;
  }
  execWarp(ctx, p, gate, rand);
}

/**
 * Sticky FieldGate identity: ptField follows the bounds claimant when - and
 * only when - the move is legal (live FieldGate edge to the claimant) and
 * simulatable (the destination's collision is registered on this host).
 * The one exception is a stale seed (a ptField persisted under an older
 * layout): when the recorded field no longer claims the position at all,
 * the bounds claimant wins without the edge check.
 */
function trackPtField(ctx: SimContext, p: Entity): void {
  if (!isPtPos(p.pos.x)) {
    if (p.ptField !== undefined) p.ptField = undefined;
    return;
  }
  const current = p.ptField ?? null;
  if (current === null) {
    const seed = ptFieldIdAt(p.pos.x, p.pos.z);
    if (seed !== null) p.ptField = seed;
    return;
  }
  const next = ptStickyFieldAt(current, p.pos.x, p.pos.z);
  if (next === null || next === current) return;
  if (!ptStaticFieldRegistered(next)) return;
  if (ptFieldClaimsWocPos(current, p.pos.x, p.pos.z) && ptGateEdgeBetween(current, next) === null) {
    return;
  }
  p.ptField = next;
  ctx.emit({ type: 'pt_transition', pid: p.id, kind: 'field', field: next });
}

/**
 * One authority tick of PT transition state for a player: armed-warp
 * release, presence-triggered warp scan, sticky FieldGate identity. Runs
 * from the shared Sim tick; the authority-host gate inside keeps it inert
 * on the offline/dev client where the presentation modules own traversal.
 */
export function updatePtTransitions(ctx: SimContext, p: Entity, rand: () => number): void {
  if (p.kind !== 'player' || !authorityHost()) return;
  releasePendingWarp(ctx, p, rand);
  if (p.dead) {
    // A dead player's pending arm is already cleared above; field identity
    // still tracks (a spirit running a seam should not strand ptField).
    trackPtField(ctx, p);
    return;
  }
  scanWarpTrigger(ctx, p, rand);
  trackPtField(ctx, p);
}
