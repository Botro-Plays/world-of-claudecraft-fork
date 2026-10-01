// PT skill-point investment (MagicPT-Chinese rules): the two level pools, the
// level-quest bonuses, the previous-skill chain, the requireLevel + rank*2
// gate, the rank-10 cap, the tier extent, and the load-time sanitize - plus
// the abilitiesKnownAt investment branch and the CharacterState round-trip.
//
// Fighter fixture rows (verified in generated/pt-maps/pt_skill_catalog):
//   order[0]  pt_melee_mastery   T1 req10 passive
//   order[1]  pt_fire_attribute  T1 req12 passive
//   order[2]  pt_raving          T1 req14
//   order[3]  pt_impact          T1 req17
//   order[4]  pt_triple_impact   T2 req20
//   order[12] pt_detoryer        T4 req60 (first pool-4 slot)

import { describe, expect, it } from 'vitest';
import { abilitiesKnownAt } from '../src/sim/content/classes';
import {
  isPtSkillClass,
  PT_SKILL_MAX_RANK,
  ptSkillBook,
  ptSkillInvestCheck,
  ptSkillOrder,
  ptSkillPools,
  ptSkillSignature,
  ptSkillView,
  sanitizePtSkillMastery,
  sanitizePtSkillRanks,
} from '../src/sim/progression/pt_skills';
import { Sim } from '../src/sim/sim';
import type { PlayerClass } from '../src/sim/types';
import { EMPTY_TEST_WORLD } from './sim_shared';

const FIGHTER: PlayerClass = 'tempskron_fighter';
const F_ORDER = ptSkillOrder(FIGHTER);
const [S1, S2, S3] = F_ORDER; // melee_mastery, fire_attribute, raving
const S_T4 = F_ORDER[12]; // detoryer, first tier-4 / pool-4 slot

function fighterSim(level: number): Sim {
  const sim = new Sim({ seed: 7, playerClass: FIGHTER, world: EMPTY_TEST_WORLD });
  sim.setPlayerLevel(level);
  return sim;
}

describe('PT skill pools (record.cpp formulas)', () => {
  it('earns nothing before level 10 and one point every two levels after', () => {
    expect(ptSkillPools(FIGHTER, 9, {}).p1.earned).toBe(0);
    expect(ptSkillPools(FIGHTER, 10, {}).p1.earned).toBe(1);
    expect(ptSkillPools(FIGHTER, 11, {}).p1.earned).toBe(1);
    expect(ptSkillPools(FIGHTER, 12, {}).p1.earned).toBe(2);
    expect(ptSkillPools(FIGHTER, 50, {}).p1.earned).toBe(21);
  });

  it('keeps the tier-4/5 pool separate and earns it from level 60', () => {
    expect(ptSkillPools(FIGHTER, 59, {}).p4.earned).toBe(0);
    expect(ptSkillPools(FIGHTER, 60, {}).p4.earned).toBe(1);
    expect(ptSkillPools(FIGHTER, 61, {}).p4.earned).toBe(1);
    expect(ptSkillPools(FIGHTER, 62, {}).p4.earned).toBe(2);
    // Pool-1 spending never touches pool-4 availability.
    const pools = ptSkillPools(FIGHTER, 62, { [S1]: 3 });
    expect(pools.p1.spent).toBe(3);
    expect(pools.p4.spent).toBe(0);
    expect(pools.p4.available).toBe(2);
    // And a pool-4 slot counts against pool 4 only.
    const split = ptSkillPools(FIGHTER, 80, { [S_T4]: 2 });
    expect(split.p4.spent).toBe(2);
    expect(split.p1.spent).toBe(0);
  });

  it('adds the level-quest bonuses only when level AND quest both qualify', () => {
    const quests = new Set(['pt_level_quest_55', 'pt_level_quest_70', 'pt_level_quest_80']);
    expect(ptSkillPools(FIGHTER, 54, {}, quests).p1.earned).toBe(23);
    expect(ptSkillPools(FIGHTER, 55, {}, quests).p1.earned).toBe(24); // +1
    expect(ptSkillPools(FIGHTER, 70, {}, quests).p1.earned).toBe(33); // +1
    expect(ptSkillPools(FIGHTER, 80, {}, quests).p1.earned).toBe(40); // +2
    // Quest done before its level pays nothing early.
    expect(ptSkillPools(FIGHTER, 40, {}, quests).p1.earned).toBe(16);
    // No questsDone at all: no bonus.
    expect(ptSkillPools(FIGHTER, 80, {}).p1.earned).toBe(36);
  });
});

describe('PT invest gate (sinSkill.cpp CheckingNowSkillState + click path)', () => {
  const check = (level: number, ranks: Record<string, number>, id: string) =>
    ptSkillInvestCheck(FIGHTER, level, ranks, id);

  it('rejects foreign ids and other classes\u2019 skills', () => {
    expect(check(50, {}, 'fireball')).toEqual({ ok: false, reason: 'not_pt_skill' });
    // An Archer skill is not in the Fighter chain.
    expect(check(50, {}, 'pt_scout_hawk')).toEqual({ ok: false, reason: 'not_pt_skill' });
  });

  it('lets a level-10 fighter spend the first point on the first skill', () => {
    expect(check(10, {}, S1)).toEqual({ ok: true });
    // S2 (fire_attribute, requireLevel 12) reports the level gate at 10 - the
    // gate order puts it ahead of the empty-pool check.
    expect(check(10, { [S1]: 1 }, S2)).toEqual({ ok: false, reason: 'level_gate' });
  });

  it('enforces the previous-skill chain, including across the tier boundary', () => {
    // Skipping S1 for S2 fails even with points to spare.
    expect(check(50, {}, S2)).toEqual({ ok: false, reason: 'needs_previous' });
    // The first pool-4 skill chains on the last tier-3 skill (order[11]).
    expect(check(80, { [F_ORDER[10]]: 1 }, S_T4)).toEqual({
      ok: false,
      reason: 'needs_previous',
    });
  });

  it('gates the next rank on requireLevel + currentRank * 2', () => {
    // Raving: requireLevel 14. Rank 1 needs 14, rank 2 needs 16.
    expect(check(13, { [S1]: 1, [S2]: 1 }, S3)).toEqual({ ok: false, reason: 'level_gate' });
    expect(check(14, { [S1]: 1, [S2]: 1 }, S3)).toEqual({ ok: true });
    // Rank 2 of melee mastery: 10 + 1*2 = 12.
    expect(check(11, { [S1]: 1 }, S1)).toEqual({ ok: false, reason: 'level_gate' });
    expect(check(12, { [S1]: 1 }, S1)).toEqual({ ok: true });
  });

  it('caps every skill at rank 10', () => {
    expect(check(90, { [S1]: PT_SKILL_MAX_RANK }, S1)).toEqual({
      ok: false,
      reason: 'max_rank',
    });
  });

  it('locks tiers whose floor the level has not reached', () => {
    // order[4] is tier 2 (floor 20): level 19 sees only tier 1.
    expect(check(19, { [S1]: 1, [S2]: 1, [S3]: 1, [F_ORDER[3]]: 1 }, F_ORDER[4])).toEqual({
      ok: false,
      reason: 'tier_locked',
    });
    expect(check(20, { [S1]: 1, [S2]: 1, [S3]: 1, [F_ORDER[3]]: 1 }, F_ORDER[4])).toEqual({
      ok: true,
    });
    // Tier 4 stays locked at 59 even with a complete chain.
    const fullChain = Object.fromEntries(F_ORDER.slice(0, 12).map((id) => [id, 1]));
    expect(check(59, fullChain, S_T4)).toEqual({ ok: false, reason: 'tier_locked' });
  });

  it('runs out of pool points only after the other gates pass', () => {
    // Level 14 earns 3; ranks {S1:2, S2:1} spend all 3, so a further invest in
    // a gate-passing skill (Raving needs 14, chain open) reports the empty pool.
    const spent = { [S1]: 2, [S2]: 1 };
    expect(ptSkillInvestCheck(FIGHTER, 14, spent, S3)).toEqual({
      ok: false,
      reason: 'no_points',
    });
  });
});

describe('PT skill book view', () => {
  it('exposes 4 skills per unlocked tier', () => {
    const rows = ptSkillBook(FIGHTER, 10, {});
    expect(rows).toHaveLength(20);
    expect(rows.filter((r) => r.visible)).toHaveLength(4);
    expect(ptSkillBook(FIGHTER, 59, {}).filter((r) => r.visible)).toHaveLength(12);
    expect(ptSkillBook(FIGHTER, 60, {}).filter((r) => r.visible)).toHaveLength(16);
    expect(ptSkillBook(FIGHTER, 80, {}).filter((r) => r.visible)).toHaveLength(20);
  });

  it('returns null from ptSkillView on non-PT classes', () => {
    expect(ptSkillView('warrior', 60, {})).toBeNull();
    expect(isPtSkillClass('warrior')).toBe(false);
    expect(isPtSkillClass(FIGHTER)).toBe(true);
  });
});

describe('PT load-time sanitize (RestoreSkill clamps)', () => {
  it('drops foreign ids, clamps ranks to 10, drops non-positive junk', () => {
    const clean = sanitizePtSkillRanks(FIGHTER, 80, {
      [S1]: 15,
      [S2]: 3,
      fireball: 9,
      [S3]: -2,
      [F_ORDER[3]]: 'banana',
    });
    expect(clean).toEqual({ [S1]: 10, [S2]: 3 });
  });

  it('wipes only the overspent pool (CheckSkillPoint parity)', () => {
    // Level 10 earns 1 pool-1 point: two invested tier-1 skills overspend it,
    // so ALL pool-1 ranks wipe while an honestly-affordable pool-4 row stays.
    // (Pool 4 cannot exist at level 10, so the single-pool case first:)
    expect(sanitizePtSkillRanks(FIGHTER, 10, { [S1]: 1, [S2]: 1 })).toEqual({});
    // At level 80: pool-1 spend of 2 is fine, but 2 ranks of pool-4 with the
    // full chain honestly invested stays intact...
    const honest = Object.fromEntries(F_ORDER.slice(0, 12).map((id) => [id, 1]));
    honest[S_T4] = 2;
    const kept = sanitizePtSkillRanks(FIGHTER, 80, honest);
    expect(kept[S_T4]).toBe(2);
    // ...while overspending pool 4 (11 earned at 80) wipes only tiers 4-5.
    const overspent = { ...honest };
    for (const id of F_ORDER.slice(12)) overspent[id] = 10;
    const wiped = sanitizePtSkillRanks(FIGHTER, 80, overspent);
    expect(F_ORDER.slice(12).every((id) => !(id in wiped))).toBe(true);
    expect(wiped[S1]).toBe(1);
  });

  it('sanitizes the mastery use-count map', () => {
    expect(
      sanitizePtSkillMastery(FIGHTER, { [S1]: 500, fireball: 9, [S2]: -4 }),
    ).toEqual({ [S1]: 500 });
  });
});

describe('PT signature (per-frame UI gate)', () => {
  it('is -1 for WoC classes and moves on invest, level, and reset', () => {
    expect(ptSkillSignature('warrior', 60, {})).toBe(-1);
    const at10 = ptSkillSignature(FIGHTER, 10, {});
    expect(ptSkillSignature(FIGHTER, 10, { [S1]: 1 })).not.toBe(at10);
    expect(ptSkillSignature(FIGHTER, 11, {})).not.toBe(at10);
  });
});

describe('abilitiesKnownAt PT investment branch', () => {
  it('grants nothing from level alone and resolves the invested rank', () => {
    // Level 50 fighter with no investment knows zero pt skills.
    const none = abilitiesKnownAt(FIGHTER, 50);
    expect(none.some((k) => k.def.id === S1)).toBe(false);
    // Invested rank resolves exactly, including the rank-row cost table.
    const invested = abilitiesKnownAt(FIGHTER, 50, undefined, undefined, {
      [S1]: 3,
      [S3]: 2,
    });
    const mastery = invested.find((k) => k.def.id === S1);
    const raving = invested.find((k) => k.def.id === S3);
    expect(mastery?.rank).toBe(3);
    expect(raving?.rank).toBe(2);
    expect(raving?.cost).toBe(16); // Raving_UseMana rank 2
    // S2 skipped (chain is not our concern here - resolution is per-skill).
    expect(invested.some((k) => k.def.id === S2)).toBe(false);
  });

  it('never lets a WoC class carry pt ranks', () => {
    const known = abilitiesKnownAt('warrior', 90, undefined, undefined, { [S1]: 5 });
    expect(known.some((k) => k.def.id === S1)).toBe(false);
  });
});

describe('Sim verbs + persistence', () => {
  it('invests through the authoritative verb and learns the rank live', () => {
    const sim = fighterSim(12);
    expect(sim.investPtSkill('nope')).toBe(false);
    expect(sim.investPtSkill(S3)).toBe(false); // chain not open
    expect(sim.investPtSkill(S1)).toBe(true);
    const meta = sim.players.get(sim.playerId)!;
    expect(meta.ptSkills[S1]).toBe(1);
    expect(meta.known.find((k) => k.def.id === S1)?.rank).toBe(1);
    // Second point at level 12 hits the next-rank level gate? 10 + 1*2 = 12: ok.
    expect(sim.investPtSkill(S1)).toBe(true);
    expect(meta.known.find((k) => k.def.id === S1)?.rank).toBe(2);
    // Both points spent: the next spend reports no_points (S2 is still
    // level-gated at 12, S1 rank 3 needs 14).
    expect(sim.investPtSkill(S1)).toBe(false);
    expect(sim.ptSkillInfo()?.pools.p1.available).toBe(0);
  });

  it('round-trips invested ranks through serializeCharacter', () => {
    const sim = fighterSim(20);
    sim.investPtSkill(S1);
    sim.investPtSkill(S2);
    const state = sim.serializeCharacter(sim.playerId);
    if (!state) throw new Error('serialize failed');
    expect(state.ptSkills).toEqual({ [S1]: 1, [S2]: 1 });

    const restored = new Sim({
      seed: 9,
      playerClass: FIGHTER,
      noPlayer: true,
      world: EMPTY_TEST_WORLD,
    });
    const pid = restored.addPlayer(FIGHTER, 'Reloaded', { state });
    const meta = restored.players.get(pid)!;
    expect(meta.ptSkills).toEqual({ [S1]: 1, [S2]: 1 });
    expect(meta.known.find((k) => k.def.id === S2)?.rank).toBe(1);
  });

  it('repairs a tampered save on load instead of trusting it', () => {
    const sim = fighterSim(20);
    const state = sim.serializeCharacter(sim.playerId)!;
    state.ptSkills = { [S1]: 40, fireball: 3, [S2]: 2 };
    state.ptSkillMastery = { [S1]: 1200, junk: 5 };
    const restored = new Sim({
      seed: 9,
      playerClass: FIGHTER,
      noPlayer: true,
      world: EMPTY_TEST_WORLD,
    });
    const pid = restored.addPlayer(FIGHTER, 'Tampered', { state });
    const meta = restored.players.get(pid)!;
    // Rank clamps to 10 and the foreign id drops - but 10 + 2 pool-1 ranks
    // overspend the level-20 budget (6 earned), so the pool-1 wipe fires.
    expect(meta.ptSkills).toEqual({});
    expect(meta.ptSkillMastery).toEqual({ [S1]: 1200 });
  });

  it('omits the pt fields entirely for a character with no investment', () => {
    const sim = new Sim({ seed: 7, playerClass: 'warrior', world: EMPTY_TEST_WORLD });
    const state = sim.serializeCharacter(sim.playerId)!;
    expect('ptSkills' in state).toBe(false);
    expect('ptSkillMastery' in state).toBe(false);
  });

  it('resets the build and unlearns every pt skill', () => {
    const sim = fighterSim(20);
    sim.investPtSkill(S1);
    expect(sim.resetPtSkills()).toBe(true);
    const meta = sim.players.get(sim.playerId)!;
    expect(meta.ptSkills).toEqual({});
    expect(meta.known.some((k) => k.def.id === S1)).toBe(false);
    expect(sim.resetPtSkills()).toBe(false); // nothing left to refund
  });
});
