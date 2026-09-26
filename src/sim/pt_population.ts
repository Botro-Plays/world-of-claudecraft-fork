// Field-owned ordinary monster population for PT-band fields.
//
// Source semantics reproduced from SrcServer/OnSever.cpp (STG_AREA::Main,
// SetStartPosChar, SetStartPosNearChar, srAutoPlayMain despawn) over the
// generated Phase 6H-1 data: generated/pt-maps/<id>/population.generated.ts
// (anchors, weighted actor table, caps, delay mask) plus
// generated/pt-maps/pt_mob_catalog.generated.ts (stats/group/assets) via
// src/sim/content/pt_mobs.ts. Legacy .spm/.spp/.inf files are never read at
// runtime.
//
// Ownership model: only the ACTIVE sim field (activePtMapDescriptor) owns a
// population. A standby field preloaded for the visual FieldGate transition
// never spawns. When the active field changes, the previous field's owned
// entities are dropped at once; the source unloads a stage's monsters when
// its slot is released.
//
// Source constants (verbatim where they matter):
//   - spawn cadence: the field Counter++ runs inside STG_AREA::Main() at the
//     server's nominal 70 Hz; an attempt fires when
//     (Counter & OpenIntervalMask) == 0 and the field's live count is below
//     LimitMax. The sim ticks at 20 Hz, so a fractional accumulator
//     reproduces the 70 Hz source cadence in wall time.
//   - anchor gate: state && near-play && aliveCount < *quantity (OpenLimit)
//     && lockoutUntil <= now. The lockout is *DELAY arg2 in seconds, armed
//     forward from the moment the anchor fires.
//   - anchor selection: a rotating cursor over the anchor table
//     (StartPointCnt); the first eligible anchor wins.
//   - monster pick: a uniform roll over [0, PecetageCount) against the
//     cumulative openStart weights, then the organization group roll (leader
//     at the anchor, members on the 8-slot +-96 map-unit ring tried in
//     rotating order, each member needing a floor within 64 map units of the
//     leader's Y).
//   - despawn: ReopenCount = 256 decremented once per 4 source ticks while
//     no player is near, about 14.6 s of player absence before an anchor's
//     group despawns.
//
// Deliberate Phase 6H-2 deltas from the source (documented, not silent):
//   - near-play is recomputed every sim tick instead of cached every ~512
//     ticks (a strictly fresher flag; the source's staleness is a cache, not
//     a mechanic).
//   - a spawn's rand() draws come from a per-spawn private Rng seeded off the
//     world seed + field id + spawn ordinal (the campPrivateRng pattern), so
//     population never perturbs the shared rng stream.
//   - a spawn whose anchor finds no walkable floor is quarantined with a
//     once-per-anchor diagnostic (the source never validates; the generated
//     data keeps those anchors for auditability).
//   - a slain mob frees its anchor slot at death (not at corpse decay) and
//     never respawns in place (respawnSeconds: Infinity on the template);
//     the corpse decays via the normal corpseTimer and is dropped once
//     decayed. The field scheduler refills the slot.
//
// Server note: the PT connected world currently installs field descriptors
// only on the client (src/game/pt_field_transition.ts via
// pt_population_data.ts); server and headless Sims see an empty table and
// this module no-ops there. That matches the existing client-only PT field
// architecture; server-authoritative PT population is a later phase.

import { createMob } from './entity';
import type { PtField, PtMapDescriptor } from './pt_field';
import { activeOwnedPtField, activePtMapDescriptor } from './pt_field_active';
import { corpseHasDecayed } from './respawn_policy';
import { Rng } from './rng';
import type { SimContext } from './sim_context';
import type { MobTemplate } from './types';
import { DT } from './types';

// ---------------------------------------------------------------------------
// Generated-module contract (population.generated.ts shape)
// ---------------------------------------------------------------------------

export interface PtPopulationActor {
  index: number;
  name: string;
  weight: number;
  openStart: number | null;
  monster: string | null;
  unresolved: string | null;
}

export interface PtSpawnAnchor {
  index: number;
  x: number;
  z: number;
}

export interface PtPopulationModule {
  fieldId: string;
  fieldIndex: number;
  aseStem: string;
  status: 'populated' | 'no-actors' | 'no-source';
  limits: {
    limitMax: number | null;
    delayShift: number | null;
    delayLockoutSec: number | null;
    openIntervalMask: number | null;
    openLimit: number | null;
  } | null;
  pecetageCount: number;
  actors: PtPopulationActor[];
  spawnAnchors: PtSpawnAnchor[];
}

// ---------------------------------------------------------------------------
// Registry seam: the game layer (src/game/pt_population_data.ts) installs the
// generated modules; the sim reads them here. Unregistered = no population.
// ---------------------------------------------------------------------------

let populationTable: ReadonlyMap<string, PtPopulationModule> = new Map();

export function registerPtPopulations(map: ReadonlyMap<string, PtPopulationModule>): void {
  populationTable = map;
}

export function ptPopulationModule(fieldId: string): PtPopulationModule | null {
  return populationTable.get(fieldId) ?? null;
}

// ---------------------------------------------------------------------------
// Source constants
// ---------------------------------------------------------------------------

// STG_AREA::Main() runs at the server's nominal 70 Hz; the sim ticks at
// 20 Hz, so the per-field counter advances by DT*70 fractional source ticks
// per sim tick.
const PT_SOURCE_TICK_HZ = 70;

// SendStartPos proximity gate: dist^2 < DIST_TRANSLEVEL_CONNECT (map
// units^2) plus the |dx|,|dz| < TRANS_VIEW_LIMIT axis bound. ~1086 units is
// roughly 39 yards.
const PT_NEAR_DIST2 = 0x120000;
const PT_NEAR_AXIS = 4096;

// ReopenCount = 256 decremented once per 4 source ticks while no player is
// near: 256*4/70 = ~14.63 s of player absence despawns an anchor's monsters.
const PT_ABSENCE_SECONDS = (256 * 4) / PT_SOURCE_TICK_HZ;

// Group ring (SetStartPosNearChar): ptItemSettingPosi entries are +-24 map
// units applied at *4*fONE, so +-96 map units around the leader.
const PT_GROUP_RING_OFFSET = 24 * 4;
const PT_GROUP_RING: readonly { x: number; z: number }[] = [
  { x: 0, z: -PT_GROUP_RING_OFFSET },
  { x: PT_GROUP_RING_OFFSET, z: -PT_GROUP_RING_OFFSET },
  { x: PT_GROUP_RING_OFFSET, z: 0 },
  { x: PT_GROUP_RING_OFFSET, z: PT_GROUP_RING_OFFSET },
  { x: 0, z: PT_GROUP_RING_OFFSET },
  { x: -PT_GROUP_RING_OFFSET, z: PT_GROUP_RING_OFFSET },
  { x: -PT_GROUP_RING_OFFSET, z: 0 },
  { x: -PT_GROUP_RING_OFFSET, z: -PT_GROUP_RING_OFFSET },
];
const PT_GROUP_RING_SLOTS = PT_GROUP_RING.length;

// Member floor acceptance: |floor - leaderY| < 64 map units (fONE domain).
// In WoC yards: 64 * 0.036 = 2.304.
const PT_MEMBER_FLOOR_TOLERANCE_YD = 64 * 0.036;

// Server defaults (fileread.cpp ZeroMemory + explicit defaults): a field
// that omits a directive keeps these, not zero.
const DEFAULT_LIMIT_MAX = 10;
const DEFAULT_OPEN_INTERVAL_MASK = 0x7f;
const DEFAULT_OPEN_LIMIT = 3;

// ---------------------------------------------------------------------------
// Per-field runtime state
// ---------------------------------------------------------------------------

interface PtAnchorState {
  /** Owned entity ids (live mobs plus corpses awaiting decay). */
  ids: Set<number>;
  /** Forward-armed per-anchor lockout (dwStartPoint_OpenTime), sim seconds. */
  lockoutUntil: number;
  /** Last sim time a player was within the near-play radius. */
  lastNearAt: number;
  /** Player was within the near-play radius at the last refresh. */
  nearNow: boolean;
  /** Set once an anchor provably cannot spawn (diagnostic reason). */
  quarantined: string | null;
}

interface PtFieldState {
  fieldId: string;
  /** Fractional source-tick accumulator (DT*70 per sim tick). */
  srcFrac: number;
  /** Integer source-tick counter (the mask gate reads this). */
  counter: number;
  /** Rotating anchor cursor (StartPointCnt). */
  cursor: number;
  /** Rotating group-ring slot cursor (MonsterSettingCount). */
  ringCursor: number;
  /** Per-field spawn ordinal; seeds each spawn's private Rng stream. */
  spawnSeq: number;
  anchors: Map<number, PtAnchorState>;
}

// Per-sim population state, keyed on the SimContext so two Sims in one
// process never share anchor/cursor state (same isolation rule as
// campPrivateRng).
const simStates = new WeakMap<SimContext, Map<string, PtFieldState>>();

function statesFor(ctx: SimContext): Map<string, PtFieldState> {
  let s = simStates.get(ctx);
  if (!s) {
    s = new Map();
    simStates.set(ctx, s);
  }
  return s;
}

function fieldStateFor(states: Map<string, PtFieldState>, mod: PtPopulationModule): PtFieldState {
  let st = states.get(mod.fieldId);
  if (!st) {
    st = {
      fieldId: mod.fieldId,
      srcFrac: 0,
      counter: 0,
      cursor: 0,
      ringCursor: 0,
      spawnSeq: 0,
      anchors: new Map(),
    };
    for (const a of mod.spawnAnchors) {
      st.anchors.set(a.index, {
        ids: new Set(),
        lockoutUntil: 0,
        lastNearAt: -Infinity,
        nearNow: false,
        quarantined: null,
      });
    }
    states.set(mod.fieldId, st);
  }
  return st;
}

// ---------------------------------------------------------------------------
// Diagnostics (once-per-anchor/event counters; no per-frame logging)
// ---------------------------------------------------------------------------

export interface PtPopulationDiagnostics {
  spawned: number;
  despawnedAbsence: number;
  despawnedFieldChange: number;
  corpsesDropped: number;
  quarantinedAnchors: string[]; // "fieldId:anchorIndex:reason"
  missingTemplates: string[]; // templateIds that produced no spawn
}

const simDiagnostics = new WeakMap<SimContext, PtPopulationDiagnostics>();

function diagnosticsFor(ctx: SimContext): PtPopulationDiagnostics {
  let d = simDiagnostics.get(ctx);
  if (!d) {
    d = {
      spawned: 0,
      despawnedAbsence: 0,
      despawnedFieldChange: 0,
      corpsesDropped: 0,
      quarantinedAnchors: [],
      missingTemplates: [],
    };
    simDiagnostics.set(ctx, d);
  }
  return d;
}

/** Test/debug surface: counters accumulated by the population scheduler. */
export function ptPopulationDiagnostics(ctx: SimContext): PtPopulationDiagnostics {
  return diagnosticsFor(ctx);
}

// ---------------------------------------------------------------------------
// Spawn RNG: private sub-stream seeded by world seed + field + spawn ordinal
// (the campPrivateRng convention), so population draws never move the shared
// stream and two spawned groups stay reproducible under the same sim state.
// ---------------------------------------------------------------------------

function spawnRng(ctx: SimContext, fieldId: string, spawnSeq: number): Rng {
  let h = 0x811c9dc5 ^ (ctx.cfg.seed >>> 0);
  const mix = (n: number): void => {
    h = Math.imul((h ^ (n >>> 0)) >>> 0, 0x01000193) >>> 0;
  };
  for (let i = 0; i < fieldId.length; i++) mix(fieldId.charCodeAt(i));
  mix(spawnSeq);
  return new Rng(h >>> 0);
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

/**
 * One population step, called once per sim tick (see sim.ts). Despawns
 * populations on inactive fields, applies absence despawn, then runs the
 * source-cadence spawn scheduler for the active field.
 */
export function ptPopulationTick(ctx: SimContext, mobs: Record<string, MobTemplate>): void {
  const states = statesFor(ctx);
  const diag = diagnosticsFor(ctx);
  const desc = activePtMapDescriptor();
  const fieldId = desc?.id ?? null;

  // A field that is no longer the active sim field owns nothing: drop every
  // entity it spawned (the source unloads the stage's monster table when the
  // slot is released).
  for (const [fid, st] of states) {
    if (fid !== fieldId) {
      for (const anchor of st.anchors.values()) {
        for (const id of anchor.ids) {
          if (ctx.entities.has(id)) {
            ctx.dropEntity(id);
            diag.despawnedFieldChange++;
          }
        }
        anchor.ids.clear();
      }
      states.delete(fid);
    }
  }
  if (fieldId === null || !desc) return;

  const mod = ptPopulationModule(fieldId);
  // The BARE active field, not the active/standby composite: floor probes
  // here must never trigger the composite's promote-standby side effect,
  // and a standby field's geometry must never satisfy an active field's
  // spawn check.
  const field = activeOwnedPtField();
  if (!mod || mod.status !== 'populated' || mod.actors.length === 0 || !field) {
    // An unpopulated field owns no entities; clear any stale state.
    const stale = states.get(fieldId);
    if (stale) {
      for (const anchor of stale.anchors.values()) {
        for (const id of anchor.ids) ctx.dropEntity(id);
        anchor.ids.clear();
      }
      states.delete(fieldId);
    }
    return;
  }

  const st = fieldStateFor(states, mod);
  const xf = desc.transform;
  const now = ctx.time;

  // Near-play refresh: every anchor sees the live player set each tick.
  const playersPt: { x: number; z: number }[] = [];
  for (const meta of ctx.players.values()) {
    const p = ctx.entities.get(meta.entityId);
    if (!p || p.dead) continue;
    playersPt.push({ x: xf.woCToPtX(p.pos.x), z: xf.woCToPtZ(p.pos.z) });
  }

  let fieldAlive = 0;
  const decayIds: number[] = [];
  for (const a of mod.spawnAnchors) {
    const anchor = st.anchors.get(a.index);
    if (!anchor) continue;

    anchor.nearNow = false;
    for (const pl of playersPt) {
      const dx = a.x - pl.x;
      const dz = a.z - pl.z;
      if (
        dx * dx + dz * dz < PT_NEAR_DIST2 &&
        Math.abs(dx) < PT_NEAR_AXIS &&
        Math.abs(dz) < PT_NEAR_AXIS
      ) {
        anchor.nearNow = true;
        break;
      }
    }
    if (anchor.nearNow) anchor.lastNearAt = now;

    // Sweep the ownership set: drop ids whose entity is gone, count live
    // members against the per-anchor cap, and release decayed corpses.
    for (const id of anchor.ids) {
      const e = ctx.entities.get(id);
      if (!e) {
        anchor.ids.delete(id);
        continue;
      }
      if (!e.dead) {
        fieldAlive++;
      } else if (corpseHasDecayed(e.dead, e.corpseTimer)) {
        decayIds.push(id);
      }
    }

    // Absence despawn: an anchor whose monsters have seen no player for the
    // absence window releases its whole group (live mobs and corpses alike).
    if (anchor.ids.size > 0 && !anchor.nearNow && now - anchor.lastNearAt > PT_ABSENCE_SECONDS) {
      for (const id of anchor.ids) {
        if (ctx.entities.has(id)) {
          ctx.dropEntity(id);
          diag.despawnedAbsence++;
        }
      }
      anchor.ids.clear();
    }
  }
  for (const id of decayIds) {
    if (ctx.entities.has(id)) ctx.dropEntity(id);
    diag.corpsesDropped++;
  }

  // Spawn scheduler: reproduce the source's 70 Hz counter against sim time.
  const mask = mod.limits?.openIntervalMask ?? DEFAULT_OPEN_INTERVAL_MASK;
  const limitMax = mod.limits?.limitMax ?? DEFAULT_LIMIT_MAX;
  const openLimit = mod.limits?.openLimit ?? DEFAULT_OPEN_LIMIT;
  const lockoutSec = mod.limits?.delayLockoutSec ?? 0;

  st.srcFrac += DT * PT_SOURCE_TICK_HZ;
  while (st.srcFrac >= 1) {
    st.srcFrac -= 1;
    st.counter++;
    if ((st.counter & mask) !== 0) continue;
    if (fieldAlive >= limitMax) continue;
    fieldAlive += attemptSpawn(ctx, mod, st, desc, field, mobs, diag, now, {
      openLimit,
      limitMax,
      lockoutSec,
      fieldAlive,
    });
  }
}

// ---------------------------------------------------------------------------
// Spawn attempt (STG_AREA::Main's gated arm + SetStartPosChar + group ring)
// ---------------------------------------------------------------------------

function attemptSpawn(
  ctx: SimContext,
  mod: PtPopulationModule,
  st: PtFieldState,
  desc: PtMapDescriptor,
  field: PtField,
  mobs: Record<string, MobTemplate>,
  diag: PtPopulationDiagnostics,
  now: number,
  limits: { openLimit: number; limitMax: number; lockoutSec: number; fieldAlive: number },
): number {
  const anchors = mod.spawnAnchors;
  if (anchors.length === 0) return 0;

  // Rotating cursor: resume the scan where the last spawn left off, wrapping
  // once (the source's two-pass StartPointCnt scan made explicit).
  let chosen: PtSpawnAnchor | null = null;
  let anchorState: PtAnchorState | null = null;
  for (let pass = 0; pass < anchors.length; pass++) {
    const idx = (st.cursor + pass) % anchors.length;
    const a = anchors[idx];
    const s = st.anchors.get(a.index);
    if (!s || s.quarantined !== null) continue;
    if (!s.nearNow) continue;
    // dwStartPoint_OpenTime < dwPlayServTime, strictly.
    if (s.lockoutUntil >= now) continue;
    let alive = 0;
    for (const id of s.ids) {
      const e = ctx.entities.get(id);
      if (e && !e.dead) alive++;
    }
    if (alive >= limits.openLimit) continue;
    chosen = a;
    anchorState = s;
    st.cursor = (idx + 1) % anchors.length;
    break;
  }
  if (!chosen || !anchorState) return 0;
  const anchorIndex = chosen.index;

  const rng = spawnRng(ctx, mod.fieldId, st.spawnSeq++);

  // Weighted pick: the first actor whose exclusive cumulative openStart
  // exceeds the roll is the boundary; the bucket is the PREVIOUS resolved
  // entry (source uses rsMonster[cnt-1]). Unresolved actors never entered
  // rsMonster[] at all (the source compacts the array on read), so they are
  // skipped here, not merely weightless.
  const roll = rng.int(0, mod.pecetageCount - 1);
  let actor: PtPopulationActor | null = null;
  for (const a of mod.actors) {
    if (a.openStart === null) continue;
    if (a.openStart > roll) break;
    actor = a;
  }
  if (!actor || !actor.monster) return 0;
  const template = mobs[`pt_${actor.monster}`];
  if (!template) {
    const tag = `pt_${actor.monster}`;
    if (!diag.missingTemplates.includes(tag)) diag.missingTemplates.push(tag);
    return 0;
  }

  // Group size from the .inf organization range (GenerateGroup); absent or
  // <=0 clamps to 1.
  let group = 1;
  if (template.groupMin !== undefined && template.groupMax !== undefined) {
    group = rng.int(template.groupMin, template.groupMax);
  }
  if (group <= 0) group = 1;

  const xf = desc.transform;
  const wx = xf.ptXToWoC(chosen.x);
  const wz = xf.ptZToWoC(chosen.z);

  // Leader floor: the top surface at the anchor (source GetFloorHeight picks
  // the top). No surface quarantines the anchor with a diagnostic instead of
  // floating or relocating the spawn.
  const leaderY = field.supportHeight(wx, wz, 0, Infinity);
  if (!Number.isFinite(leaderY)) {
    anchorState.quarantined = 'no-floor';
    diag.quarantinedAnchors.push(`${mod.fieldId}:${anchorIndex}:no-floor`);
    return 0;
  }

  let spawnedCount = 0;
  const spawnAt = (x: number, y: number, z: number): void => {
    const mob = createMob(ctx.nextId++, template, template.minLevel, { x, y, z });
    mob.ptFieldAnchor = { fieldId: mod.fieldId, anchorIndex };
    mob.facing = rng.range(0, Math.PI * 2);
    mob.prevFacing = mob.facing;
    ctx.addEntity(mob);
    anchorState.ids.add(mob.id);
    spawnedCount++;
  };
  spawnAt(wx, leaderY, wz);

  // Members 2..N on the rotating 8-slot +-96 map-unit ring, each needing a
  // floor within 64 map units of the leader's Y (SetStartPosNearChar). A slot
  // that fails the floor check is skipped; a member that finds no slot is
  // simply not spawned (the source fails the member the same way). Members
  // are NOT gated by OpenLimit (the source's member loop checks neither
  // OpenLimit nor LimitMax; the rolled group lands whole and AddMonTable
  // counts every member, which is what relocks the anchor). LimitMax stays
  // as the field-level safety rail.
  for (let i = 1; i < group && limits.fieldAlive + spawnedCount < limits.limitMax; i++) {
    for (let s = 0; s < PT_GROUP_RING_SLOTS; s++) {
      const slot = PT_GROUP_RING[st.ringCursor++ & 7];
      const mx = xf.ptXToWoC(chosen.x + slot.x);
      const mz = xf.ptZToWoC(chosen.z + slot.z);
      const fy = field.floorHeight(mx, mz, leaderY);
      if (fy === -Infinity) continue;
      if (Math.abs(fy - leaderY) >= PT_MEMBER_FLOOR_TOLERANCE_YD) continue;
      spawnAt(mx, fy, mz);
      break;
    }
  }

  // The anchor re-locks for dwIntervalTime (the *DELAY second arg) whether or
  // not members fit; only a failed attempt leaves the lockout untouched.
  anchorState.lockoutUntil = now + limits.lockoutSec;
  diag.spawned += spawnedCount;
  return spawnedCount;
}
