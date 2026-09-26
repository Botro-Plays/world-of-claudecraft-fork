// PT ordinary monster MobTemplates, adapted from the generated Phase 6H-1
// catalog (generated/pt-maps/pt_mob_catalog.generated.ts, emitted by
// scripts/pt-port/lib/population.mjs from the MagicPT-Chinese .inf files).
// This module owns ONLY the stat-family adaptation decisions; the generated
// file stays pure data.
//
// Field mapping notes (verified against PT-Source/fileread.cpp and
// character.cpp):
//   - *life feeds hpBase directly; hpPerLevel is 0 because .inf level is
//     fixed per monster, not rolled.
//   - *attack [min,max] maps through MobTemplate.weaponMin/weaponMax so the
//     authored spread survives exactly (the 0.8/1.25 derivation would lose
//     the low end).
//   - *defense lands on armorBase (flat level-1 armor). WoC armor and PT
//     defense are different curves, so this is deliberately provisional:
//     correct, deterministic, and revisable when PT combat tuning lands.
//   - *attackSpeed is a source ANIMATION pacing figure (fileread multiplies
//     by fONE; playsub.cpp GetAttackSpeedMainFrame converts it to animation
//     frames), not a swing interval. Mapped linearly into the existing
//     mob swing band, clamped: lower authored value = slower swing.
//   - *moveSpeed goes through the source's own ConvMoveSpeed normalization
//     ((v-9)*16+fONE, i.e. a fraction of base gait where 9 = 1.0x) applied
//     to the ordinary mob gait of 7 yd/s, clamped. A 0 still moves (source
//     yields 0.44x), matching trap-plant monsters that creep rather than
//     stand still.
//   - *sight is a map-unit radius (all current data: 450), converted to
//     yards at the PT band scale (0.036) for aggroRadius.
//   - *organization lands on groupMin/groupMax for the population scheduler.
//   - xp/attackRange/size/moveType are carried in the catalog for later
//     phases but intentionally not consumed yet: kill XP stays on the
//     standard WoC level formula and ranged reach stays standard melee.
//   - respawnSeconds: Infinity disables the generic in-place camp respawn;
//     src/sim/pt_population.ts owns reappearance via the source's
//     anchor-cap/lockout cadence instead.
//
// Names stay in the source's own zh strings: the sim layer is
// language-agnostic and the target-frame name surface is an i18n question
// for a later phase (the existing pt_hopy/pt_bargon templates follow the
// same pattern today).

import { PT_MOB_CATALOG } from '../../../generated/pt-maps/pt_mob_catalog.generated';
import type { MobFamily, MobTemplate } from '../types';

// .inf race -> MobFamily. Only two races map to dedicated families
// (combat-relevant: demon/undead interact with family-specific effects);
// mutant, nature, and steel races read as ordinary beasts.
const RACE_FAMILY: Record<string, MobFamily> = {
  恶魔系: 'demon',
  不死系: 'undead',
};

const PT_MOBS_LIST: MobTemplate[] = Object.values(PT_MOB_CATALOG).map((rec) => {
  const s = rec.stats;
  const level = rec.level ?? 1;
  const moveV = s.moveSpeed ?? 4;
  const atkV = s.attackSpeed ?? 6;
  return {
    id: `pt_${rec.key}`,
    name: rec.name,
    minLevel: level,
    maxLevel: level,
    family: (s.race && RACE_FAMILY[s.race]) || 'beast',
    hpBase: s.life ?? 10 + level * 10,
    hpPerLevel: 0,
    dmgBase: 0,
    dmgPerLevel: 0,
    weaponMin: s.attack?.[0] ?? 1,
    weaponMax: s.attack?.[1] ?? 2,
    attackSpeed: Math.min(2.8, Math.max(1.6, 3.4 - atkV * 0.2)),
    armorBase: s.defense ?? 0,
    armorPerLevel: 0,
    // ConvMoveSpeed(v) = (v-9)*16+fONE -> fraction (v+7)/16 of base gait.
    moveSpeed: Math.min(9, Math.max(2.2, (7 * (moveV + 7)) / 16)),
    aggroRadius: Math.min(20, Math.max(6, (s.vision ?? 300) * 0.036)),
    loot: [],
    scale: 1,
    color: 0xffffff,
    respawnSeconds: Infinity,
    groupMin: rec.group?.[0],
    groupMax: rec.group?.[1],
    // PT source levels run far past the WoC creditable ceiling; kill-credit
    // exclusions (deeds.ts giantslayer gate) read this flag.
    ptField: true,
  };
});

export const PT_MOBS: Record<string, MobTemplate> = Object.fromEntries(
  PT_MOBS_LIST.map((t) => [t.id, t]),
);
