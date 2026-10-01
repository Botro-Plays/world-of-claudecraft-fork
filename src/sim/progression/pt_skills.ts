// PT skill-point progression (MagicPT-Chinese source of truth).
//
// The rules below are derived directly from the original client/server code:
//   record.cpp  RestoreSkill / CheckSkillPoint / GetSkillPoint_LevelQuest
//   sinbaram/sinSkill.cpp  CheckingNowSkillState + the master-mode LButtonUp
//                          invest path + CheckSkillMastery
// Skill identity/levels/costs come from the generated catalog
// (scripts/pt-port/build_pt_skills.mjs ->
// generated/pt-maps/pt_skill_catalog.generated.ts); PT_SKILL_ORDER keeps the
// sSkill[] table order, which IS the learn-chain order.
//
// Authentic rules implemented here:
//   * Two point pools. Pool 1 (`SkillPoint`) feeds the first 12 list slots
//     (tiers 1-3): earned ((level-8)/2) once level >= 10, plus the level-quest
//     bonuses (+1 at 55, +1 at 70, +2 at 80). Pool 4 (`SkillPoint4`) feeds
//     slots 12..19 (tiers 4-5): earned ((level-58)/2) once level >= 60.
//   * Per-skill rank cap 10 (MAX_USE_SKILL_POINT).
//   * Previous-skill chain: a skill may not be invested until the previous
//     list entry holds >= 1 point (sinSkill.cpp `UseSkill[j-1].Point`); the
//     chain crosses the tier boundary into tier 4 the same way the source's
//     `j>12` branch does.
//   * Rank level gate: reaching rank N requires level >= requireLevel +
//     (N-1)*2 (the source's `RequireLevel + Point*2 <= Level`, evaluated for
//     the NEXT point in the master-mode click path).
//   * Job-tier visibility: PT exposes 4 skills per advancement
//     (ChangeJobSkillPlus = 5,9,13,17,21 incl. the normal-attack slot). The
//     job-quest system is not ported yet, so the tier unlock rides the tier's
//     own level floor (10/20/40/60/80 - the same levels PT opens the
//     advancement quests at).
//   * Mastery (`UseSkillCount`): each cast increments the counter, which in
//     PT lowers that skill's recast delay (RequireMastery[0] +
//     RequireMastery[1]*Point - mastery/100, clamped [1,70]); element skills
//     (Element[0] nonzero) bypass mastery entirely. We persist the count now;
//     the recast-delay application lands with the per-skill combat pass.
//
// Load-time sanitize mirrors PT's RestoreSkill/CheckSkillPoint clamps: a pool
// overspent past its earned budget wipes THAT pool's ranks (never the other
// pool), ranks clamp to 10, and foreign ids drop.
//
// src/sim-pure: no DOM/Three/render/ui/game/net imports, no ambient randomness
// or wall-clock reads (enforced by tests/architecture.test.ts). Behavior verbs
// ride the SimContext seam like progression/talents.ts.

import {
  PT_SKILL_CATALOG,
  PT_SKILL_ORDER,
} from '../../../generated/pt-maps/pt_skill_catalog.generated';
import type { SimContext } from '../sim_context';
import type { PlayerClass } from '../types';
import type { PlayerMeta } from '../sim';

export type PtSkillId = keyof typeof PT_SKILL_CATALOG;

export const PT_SKILL_MAX_RANK = 10;

// record.cpp: pool 1 covers the first 12 catalog slots (tiers 1-3), pool 4 the
// remaining 8 (tiers 4-5). Slots are the skill's index inside PT_SKILL_ORDER.
const PT_POOL1_SLOTS = 12;

// The lowest requireLevel inside each tier (from the catalog: T1 10, T2 20,
// T3 40, T4 60, T5 80). Doubles as the tier-visibility floor until job-change
// quests land.
const PT_TIER_LEVELS = [10, 20, 40, 60, 80] as const;

/** The level a tier's rows unlock at (1-based tier -> the PT_TIER_LEVELS floor). */
export function ptTierUnlockLevel(tier: number): number {
  return PT_TIER_LEVELS[tier - 1] ?? 80;
}

// Level-quest skill-point bonuses (GetSkillPoint_LevelQuest). The quest ids are
// ours (the PT level quests are not ported yet); once they land in content the
// bonus activates with no code change here.
const PT_SKILL_QUEST_BONUS: Readonly<Record<string, { minLevel: number; points: number }>> = {
  pt_level_quest_55: { minLevel: 55, points: 1 },
  pt_level_quest_70: { minLevel: 70, points: 1 },
  pt_level_quest_80: { minLevel: 80, points: 2 },
};

interface PtSkillRow {
  id: string;
  class: string;
  tier: number;
  slot: number;
  requireLevel: number;
  hand: string;
}

const CATALOG: Readonly<Record<string, PtSkillRow>> = PT_SKILL_CATALOG;

export function isPtSkillClass(cls: PlayerClass): boolean {
  return cls in PT_SKILL_ORDER;
}

/** The class's learn-chain order (the sSkill[] table order): 20 skill ids. */
export function ptSkillOrder(cls: PlayerClass): readonly string[] {
  return (PT_SKILL_ORDER as Record<string, readonly string[]>)[cls] ?? [];
}

/** Catalog row for a skill id (undefined for non-PT ids). */
export function ptSkillRow(id: string): PtSkillRow | undefined {
  return CATALOG[id];
}

/** How many catalog slots the class exposes at `level` (4 per unlocked tier). */
export function ptSkillExtent(cls: PlayerClass, level: number): number {
  const order = ptSkillOrder(cls);
  let tiers = 0;
  for (const min of PT_TIER_LEVELS) if (level >= min) tiers++;
  return Math.min(order.length, tiers * 4);
}

function ptSkillQuestBonus(level: number, questsDone?: ReadonlySet<string>): number {
  if (!questsDone) return 0;
  let bonus = 0;
  for (const [questId, q] of Object.entries(PT_SKILL_QUEST_BONUS)) {
    if (level >= q.minLevel && questsDone.has(questId)) bonus += q.points;
  }
  return bonus;
}

export interface PtSkillPool {
  /** Points earned so far (level formula + quest bonus for pool 1). */
  earned: number;
  /** Points already invested into this pool's slots. */
  spent: number;
  /** earned - spent; the spendable remainder. */
  available: number;
}

export interface PtSkillPools {
  /** Tiers 1-3 (record.cpp `SkillPoint`). Earns from level 10. */
  p1: PtSkillPool;
  /** Tiers 4-5 (record.cpp `SkillPoint4`). Earns from level 60. */
  p4: PtSkillPool;
}

/** Split the invested map into the two source pools (record.cpp sums). */
function ptPoolSpent(cls: PlayerClass, ranks: Readonly<Record<string, number>>): {
  p1: number;
  p4: number;
} {
  const order = ptSkillOrder(cls);
  let p1 = 0;
  let p4 = 0;
  for (let i = 0; i < order.length; i++) {
    const r = ranks[order[i]] ?? 0;
    if (r <= 0) continue;
    if (i < PT_POOL1_SLOTS) p1 += r;
    else p4 += r;
  }
  return { p1, p4 };
}

export function ptSkillPools(
  cls: PlayerClass,
  level: number,
  ranks: Readonly<Record<string, number>>,
  questsDone?: ReadonlySet<string>,
): PtSkillPools {
  const spent = ptPoolSpent(cls, ranks);
  const e1 =
    level >= 10 ? Math.floor((level - 8) / 2) + ptSkillQuestBonus(level, questsDone) : 0;
  const e4 = level >= 60 ? Math.floor((level - 58) / 2) : 0;
  return {
    p1: { earned: e1, spent: spent.p1, available: Math.max(0, e1 - spent.p1) },
    p4: { earned: e4, spent: spent.p4, available: Math.max(0, e4 - spent.p4) },
  };
}

/**
 * Allocation-free change signature for per-frame UI refresh gates (the
 * spellbook runs on Hud's per-frame band): -1 for non-PT classes, else a
 * packed scalar covering everything a repaint depends on - the level (tier
 * extent + rank gates derive from it) and both pools' AVAILABLE counts (spent
 * is implied: investing moves a point from available into a rank). A forge or
 * a content change that swaps WHICH skill held a rank without moving the
 * totals is not a real frame case: the rank map itself is rendered at build
 * time from world.ptSkills, and invest/reset always moves the availability.
 */
export function ptSkillSignature(
  cls: PlayerClass,
  level: number,
  ranks: Readonly<Record<string, number>>,
  questsDone?: ReadonlySet<string>,
): number {
  if (!isPtSkillClass(cls)) return -1;
  const order = ptSkillOrder(cls);
  let p1 = 0,
    p4 = 0;
  for (let i = 0; i < order.length; i++) {
    const r = ranks[order[i]] ?? 0;
    if (r <= 0) continue;
    if (i < PT_POOL1_SLOTS) p1 += r;
    else p4 += r;
  }
  const e1 =
    level >= 10 ? Math.floor((level - 8) / 2) + ptSkillQuestBonus(level, questsDone) : 0;
  const e4 = level >= 60 ? Math.floor((level - 58) / 2) : 0;
  return level * 65536 + Math.max(0, e1 - p1) * 256 + Math.max(0, e4 - p4);
}

export type PtSkillInvestError =
  | 'not_pt_skill' // id is not in this class's catalog order
  | 'tier_locked' // tier not yet visible at this level
  | 'needs_previous' // previous list entry holds no points
  | 'level_gate' // requireLevel + currentRank*2 not yet met
  | 'max_rank' // already rank 10
  | 'no_points'; // the owning pool is empty

export type PtSkillInvestCheck = { ok: true } | { ok: false; reason: PtSkillInvestError };

/**
 * The master-mode invest gate (sinSkill.cpp LButtonUp + CheckingNowSkillState):
 * pool point available, within the job-tier extent, previous entry holds >= 1
 * point, level >= requireLevel + currentRank*2, and under the rank-10 cap.
 */
export function ptSkillInvestCheck(
  cls: PlayerClass,
  level: number,
  ranks: Readonly<Record<string, number>>,
  skillId: string,
  questsDone?: ReadonlySet<string>,
): PtSkillInvestCheck {
  const order = ptSkillOrder(cls);
  const idx = order.indexOf(skillId);
  const row = CATALOG[skillId];
  if (idx < 0 || !row || row.class !== cls) return { ok: false, reason: 'not_pt_skill' };
  if (idx >= ptSkillExtent(cls, level)) return { ok: false, reason: 'tier_locked' };
  const rank = ranks[skillId] ?? 0;
  if (rank >= PT_SKILL_MAX_RANK) return { ok: false, reason: 'max_rank' };
  if (idx > 0 && (ranks[order[idx - 1]] ?? 0) < 1) return { ok: false, reason: 'needs_previous' };
  if (level < row.requireLevel + rank * 2) return { ok: false, reason: 'level_gate' };
  const pools = ptSkillPools(cls, level, ranks, questsDone);
  if ((idx < PT_POOL1_SLOTS ? pools.p1 : pools.p4).available < 1)
    return { ok: false, reason: 'no_points' };
  return { ok: true };
}

/** Per-skill view for the skill window: one row per catalog slot. */
export interface PtSkillViewRow {
  id: string;
  tier: number;
  slot: number;
  rank: number;
  visible: boolean; // inside the job-tier extent
  investable: boolean;
  reason: PtSkillInvestError | null;
  /** Level needed for the NEXT rank (requireLevel + rank*2); 0 when capped. */
  nextRankLevel: number;
}

export function ptSkillBook(
  cls: PlayerClass,
  level: number,
  ranks: Readonly<Record<string, number>>,
  questsDone?: ReadonlySet<string>,
): PtSkillViewRow[] {
  const extent = ptSkillExtent(cls, level);
  return ptSkillOrder(cls).map((id, idx) => {
    const row = CATALOG[id];
    const rank = ranks[id] ?? 0;
    const check = ptSkillInvestCheck(cls, level, ranks, id, questsDone);
    return {
      id,
      tier: row.tier,
      slot: row.slot,
      rank,
      visible: idx < extent,
      investable: check.ok,
      reason: check.ok ? null : check.reason,
      nextRankLevel: rank >= PT_SKILL_MAX_RANK ? 0 : row.requireLevel + rank * 2,
    };
  });
}

/**
 * Load-time clamp (record.cpp RestoreSkill + CheckSkillPoint): drop ids that
 * are not in this class's catalog, clamp ranks to [0, 10], and wipe a pool's
 * ranks entirely when it is overspent past its earned budget - the same
 * correction the original applies instead of rejecting the character.
 */
export function sanitizePtSkillRanks(
  cls: PlayerClass,
  level: number,
  ranks: unknown,
  questsDone?: ReadonlySet<string>,
): Record<string, number> {
  const order = ptSkillOrder(cls);
  const valid = new Set(order);
  const out: Record<string, number> = {};
  if (ranks && typeof ranks === 'object') {
    for (const [id, v] of Object.entries(ranks as Record<string, unknown>)) {
      if (!valid.has(id)) continue;
      const r = Math.floor(Number(v));
      if (!Number.isFinite(r) || r <= 0) continue;
      out[id] = Math.min(PT_SKILL_MAX_RANK, r);
    }
  }
  // Per-pool overspend wipe: CheckSkillPoint's `SkillPoint<0 -> return FALSE`
  // maps to RestoreSkill's `SkillPoint<0 -> zero the pool's slots`.
  const wipePool = (pool1: boolean): void => {
    order.forEach((id, i) => {
      if ((i < PT_POOL1_SLOTS) === pool1) delete out[id];
    });
  };
  // Iterating once is enough: a wipe only ever lowers spent.
  const pools = ptSkillPools(cls, level, out, questsDone);
  if (pools.p1.spent > pools.p1.earned) wipePool(true);
  if (pools.p4.spent > pools.p4.earned) wipePool(false);
  return out;
}

/** Load-time clamp for mastery counters: known ids, non-negative ints only. */
export function sanitizePtSkillMastery(cls: PlayerClass, mastery: unknown): Record<string, number> {
  const valid = new Set(ptSkillOrder(cls));
  const out: Record<string, number> = {};
  if (mastery && typeof mastery === 'object') {
    for (const [id, v] of Object.entries(mastery as Record<string, unknown>)) {
      if (!valid.has(id)) continue;
      const n = Math.floor(Number(v));
      if (Number.isFinite(n) && n > 0) out[id] = Math.min(10000, n);
    }
  }
  return out;
}

const INVEST_ERROR_TEXT: Record<PtSkillInvestError, string> = {
  not_pt_skill: 'That is not a class skill.',
  tier_locked: 'That skill tier is not unlocked yet.',
  needs_previous: 'Learn the previous skill first.',
  level_gate: 'You are not high enough level for the next rank.',
  max_rank: 'That skill is already mastered.',
  no_points: 'No skill points available.',
};

/**
 * Spend one point into a PT skill (the master-mode click). Server-authoritative:
 * every gate in ptSkillInvestCheck is re-run here, then the known-ability list
 * re-resolves so the new rank is live immediately.
 */
export function investPtSkill(ctx: SimContext, skillId: string, pid?: number): boolean {
  const r = ctx.resolve(pid);
  if (!r) return false;
  const check = ptSkillInvestCheck(
    r.meta.cls,
    r.e.level,
    r.meta.ptSkills,
    skillId,
    r.meta.questsDone,
  );
  if (!check.ok) {
    ctx.error(r.e.id, INVEST_ERROR_TEXT[check.reason]);
    return false;
  }
  r.meta.ptSkills[skillId] = (r.meta.ptSkills[skillId] ?? 0) + 1;
  ctx.refreshKnownAbilities(r.meta, true);
  // wireRev dirty so the heavy self snapshot resends the rank map.
  r.meta.wireRev++;
  return true;
}

/**
 * Refund every invested PT point (the PT skill-reset item analogue). Only used
 * by the explicit reset path; not reachable in ordinary play. Returns false for
 * a non-PT class or when there was nothing to refund.
 */
export function resetPtSkills(ctx: SimContext, pid?: number): boolean {
  const r = ctx.resolve(pid);
  if (!r || !isPtSkillClass(r.meta.cls)) return false;
  if (Object.keys(r.meta.ptSkills).length === 0) return false;
  r.meta.ptSkills = {};
  ctx.refreshKnownAbilities(r.meta, false);
  r.meta.wireRev++;
  return true;
}

/** The IWorld read shape: both pools plus the per-skill book rows. */
export interface PtSkillInfoView {
  pools: PtSkillPools;
  skills: PtSkillViewRow[];
}

/**
 * Pure view (no ctx): both ClientWorld (snapshot mirror) and Sim call this so
 * the skill window renders identically offline and online. Null for non-PT
 * classes.
 */
export function ptSkillView(
  cls: PlayerClass,
  level: number,
  ranks: Readonly<Record<string, number>>,
  questsDone?: ReadonlySet<string>,
): PtSkillInfoView | null {
  if (!isPtSkillClass(cls)) return null;
  return {
    pools: ptSkillPools(cls, level, ranks, questsDone),
    skills: ptSkillBook(cls, level, ranks, questsDone),
  };
}

/** IWorld read: the two pools plus the per-skill view, all server-derived. */
export function ptSkillInfo(ctx: SimContext, pid?: number): PtSkillInfoView | null {
  const r = ctx.resolve(pid);
  if (!r) return null;
  return ptSkillView(r.meta.cls, r.e.level, r.meta.ptSkills, r.meta.questsDone);
}
