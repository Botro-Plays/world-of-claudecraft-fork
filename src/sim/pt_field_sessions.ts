// Authoritative online PT field sessions (O3).
//
// What this owns: the realm's answer to "which players and PT entities belong
// to which PT field right now", kept in lockstep with the authoritative
// identity, Entity.ptField. One realm runs ONE Sim over a shared entity
// roster; a field session is a field-keyed membership index INSIDE that sim,
// not a parallel world - the map graph stays the relationship source, and no
// field geometry lives here (collision modules are host-level registrations
// in pt_field_active.ts, unrelated to session lifecycle).
//
// Membership is maintained at the ONE write seam: every Entity.ptField
// assignment routes through assignPtField, so a transfer moves the entity's
// identity and its session membership in the same synchronous call - no
// observer can see an entity in two sessions, and a stale or duplicate
// transition is a no-op. Roster insert/remove (entity_roster.ts) covers the
// two writes that happen off the seam: addPlayer's pre-insert restore and
// pt_population's pre-insert mob stamp.
//
// Lifecycle: a session is UNLOADED (absent) until the first member needs it,
// ACTIVE while players belong, DRAINING for a grace window after the last
// player leaves, then UNLOADED again. Draining releases only the membership
// record; field geometry is shared host state and is never unloaded. The
// sweep runs once per sim tick over the active-session map - bounded by
// online occupancy, no per-field workers, nothing preloaded.
//
// Persistence needs nothing session-specific: ptField rides the character
// blob (CharacterState.ptField); reconnect or a server restart rebuilds the
// session on demand when the restored entity rejoins through the roster.
//
// Per-sim state follows the pt_population convention: a WeakMap keyed on the
// SimContext, so two Sims in one process never share membership.

import type { SimContext } from './sim_context';
import type { Entity, SimEvent } from './types';

export type PtFieldSessionState = 'active' | 'draining';

// After the last member player leaves, the session lingers this long (sim
// seconds) so a gate-hopper's quick return rejoins instead of rebuilding,
// then unloads. Membership-only bookkeeping, so the window is anti-thrash,
// not correctness.
export const PT_FIELD_DRAIN_GRACE_S = 10;

export interface PtFieldSession {
  readonly fieldId: string;
  /** Entity ids of member players (kind 'player'). */
  readonly players: ReadonlySet<number>;
  /** Entity ids of every member carrying this field's identity. */
  readonly entities: ReadonlySet<number>;
  readonly state: PtFieldSessionState;
  /** Sim time at which a draining session unloads; 0 while active. */
  readonly drainAt: number;
  /**
   * Field-scoped event destination (O4+): emits the event through the shared
   * SimEvent stream with this session's field stamped as its scope. The
   * realm's event router then delivers it only to viewers whose field
   * identity matches (entity-anchored events already resolve scope from the
   * anchor entity; the stamp covers coordinate-anchored events, whose
   * position alone cannot distinguish an island from the overlapping
   * continent field).
   */
  emit(ev: SimEvent): void;
}

interface PtFieldSessionRec extends PtFieldSession {
  players: Set<number>;
  entities: Set<number>;
  state: PtFieldSessionState;
  drainAt: number;
}

const simSessions = new WeakMap<SimContext, Map<string, PtFieldSessionRec>>();

function registryFor(ctx: SimContext): Map<string, PtFieldSessionRec> {
  let reg = simSessions.get(ctx);
  if (reg === undefined) {
    reg = new Map();
    simSessions.set(ctx, reg);
  }
  return reg;
}

/**
 * Create + activate a session, reclaiming every roster entity already
 * identified with the field. The reconcile scan matters after a drain:
 * member entities keep their ptField identity while unloaded (identity lives
 * on the entity, not the session), so a session that re-activates must
 * re-index them rather than starting empty.
 */
function activate(ctx: SimContext, fieldId: string): PtFieldSessionRec {
  const rec: PtFieldSessionRec = {
    fieldId,
    players: new Set(),
    entities: new Set(),
    state: 'active',
    drainAt: 0,
    emit: (ev) => emitPtFieldEvent(ctx, fieldId, ev),
  };
  for (const e of ctx.entities.values()) {
    if (e.ptField !== fieldId) continue;
    rec.entities.add(e.id);
    if (e.kind === 'player') rec.players.add(e.id);
  }
  if (rec.players.size === 0) {
    // Entity-created sessions (PT mobs) hold the field only until the drain
    // grace lapses: a field with no players is never kept active.
    rec.state = 'draining';
    rec.drainAt = ctx.time + PT_FIELD_DRAIN_GRACE_S;
  }
  registryFor(ctx).set(fieldId, rec);
  return rec;
}

function join(ctx: SimContext, fieldId: string, e: Entity): void {
  const rec = registryFor(ctx).get(fieldId) ?? activate(ctx, fieldId);
  rec.entities.add(e.id);
  if (e.kind === 'player') {
    rec.players.add(e.id);
    rec.state = 'active';
    rec.drainAt = 0;
  }
}

function leave(ctx: SimContext, fieldId: string, e: Entity): void {
  const rec = registryFor(ctx).get(fieldId);
  if (rec === undefined) return;
  rec.entities.delete(e.id);
  if (e.kind === 'player') {
    rec.players.delete(e.id);
    if (rec.players.size === 0 && rec.state === 'active') {
      rec.state = 'draining';
      rec.drainAt = ctx.time + PT_FIELD_DRAIN_GRACE_S;
    }
  }
}

/**
 * The single write seam for Entity.ptField. Identity and session membership
 * move together in one synchronous step, so the transition can never be
 * observed half-applied. Writes made before the entity reaches the roster
 * (addPlayer's restore, pt_population's mob stamp) only set the field here;
 * the insert hook indexes them.
 */
export function assignPtField(
  ctx: SimContext,
  e: Entity,
  fieldId: string | undefined,
): void {
  const prev = e.ptField;
  if (prev === fieldId) return;
  e.ptField = fieldId;
  if (!ctx.entities.has(e.id)) return;
  if (prev !== undefined) leave(ctx, prev, e);
  if (fieldId !== undefined) join(ctx, fieldId, e);
}

/** Roster hook: an inserted entity joins the session its identity names. */
export function ptFieldSessionEntityJoined(ctx: SimContext, e: Entity): void {
  if (e.ptField !== undefined) join(ctx, e.ptField, e);
}

/** Roster hook: a removed entity leaves its session. */
export function ptFieldSessionEntityDropped(ctx: SimContext, e: Entity): void {
  if (e.ptField !== undefined) leave(ctx, e.ptField, e);
}

/** The live session for a field, or null while UNLOADED. */
export function ptFieldSession(
  ctx: SimContext,
  fieldId: string,
): PtFieldSession | null {
  return registryFor(ctx).get(fieldId) ?? null;
}

/** A snapshot of live sessions (both states), for diagnostics and tests. */
export function ptFieldSessions(ctx: SimContext): PtFieldSession[] {
  return [...registryFor(ctx).values()];
}

/** Emit a field-scoped event for O4+ producers (population, field mobs). */
export function emitPtFieldEvent(
  ctx: SimContext,
  fieldId: string,
  ev: SimEvent,
): void {
  (ev as { ptf?: string }).ptf = fieldId;
  ctx.emit(ev);
}

/**
 * Lifecycle sweep, once per sim tick. A draining session that gained a
 * player is already back to 'active' via join(); this releases draining
 * sessions whose grace window lapsed. Runs over the live-session map only:
 * cost is O(fields with members), never O(the PT map graph).
 */
export function tickPtFieldSessions(ctx: SimContext): void {
  const reg = simSessions.get(ctx);
  if (reg === undefined || reg.size === 0) return;
  for (const [id, rec] of reg) {
    if (rec.state !== 'draining') continue;
    if (rec.players.size > 0) {
      rec.state = 'active';
      rec.drainAt = 0;
      continue;
    }
    if (ctx.time >= rec.drainAt) reg.delete(id);
  }
}
