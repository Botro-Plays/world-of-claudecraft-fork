// PT ability definitions, transformed from the extracted MagicPT skill
// catalog (generated/pt-maps/pt_skill_catalog.generated.ts, built by
// scripts/pt-port/build_pt_skills.mjs from MagicPT-Chinese sinSkill_Info.h /
// sinSkill.cpp / Server/skill.ini).
//
// FIRST MECHANICAL PASS - what is mapped now vs what waits for the per-skill
// SkillFunction audit:
//   * rank model: 10 ranks per skill; the base def is rank 1 and `ranks[]`
//     carries 2..10 with `level` = the PT invest gate (requireLevel +
//     (rank-1)*2) and `cost` = the per-rank mana table. Which rank is ACTIVE
//     comes from the invested point count (abilitiesKnownAt's pt branch), so
//     `level` here is metadata for the book, not the grant rule.
//   * `*_Damage`-family pair arrays ([min,max] per rank) -> `directDamage`.
//   * `*_Damage`-family scalars are % of attack power (Svr_Damge.cpp:
//     `Power += Power * Damage[Point] / 100`). On weapon-whitelisted martial
//     skills they become `weaponStrike` {weaponMult: 1 + pct/100}; on
//     implement-whitelisted caster skills they become `directDamage` with
//     `spellPowerCoeff` = pct/100 (the same "% of power" semantic through the
//     spell-power path). With a duration key present the scalar is a timed
//     self-buff instead (`buff_ap_pct`).
//   * `*_Heal` pair arrays -> `heal` (friendly target).
//   * `*_Area`/`*_Range`-family keys upgrade flat damage to `aoeDamage`
//     (self-centered; PT uses caster-centered novas/pushes).
//   * `*_Time`/`*_UseTime` keys are seconds (E_Shield 300, Scout_Hawk 5..14)
//     and mark a timed effect row.
//   * `DecDamage`-family scalars + duration -> `applyDebuff` 'debuff_ap'.
//   * `hand === 'passive'` (SIN_SKILL_USE_NOT) -> `passive: true`: masteries,
//     attribute imbuements, and stat passives get their real folds in the
//     per-skill pass.
//   * cooldown derives from the PT per-skill recast delay (RequireMastery
//     base + perRank*(rank-1), the pre-use-count value; the use-count
//     reduction lands with the mastery hook). PT delay units map /60 -> sec.
//   * Summons (a `*_Life`+`*_Hit`/`*_Defense` stat block - golem, wolverine,
//     elementals, Divine Inhalation - or a summon SkillFunction for the pets
//     whose ini holds no Life table: Scout Hawk, Muspell, the Advents, the
//     Bloody Knight) are recognized but emit no summon effect yet - PT pet
//     templates do not exist in WoC. Weapon whitelists (`UseWeaponCode`) and
//     stamina costs are carried in the catalog, not yet enforced at cast time.
//
// Everything here is data-as-code (no engine logic): a pure transform of the
// generated catalog into AbilityDef records merged into ABILITIES by
// classes.ts, and PT_CLASS_KITS feeding each PT class's `abilities` list.

import {
  PT_SKILL_CATALOG,
  PT_SKILL_ORDER,
} from '../../../generated/pt-maps/pt_skill_catalog.generated';
import type { AbilityDef, AbilityEffect, AbilityRank, PlayerClass } from '../types';

// ---------------------------------------------------------------------------
// Catalog row typing (the generated module is an untyped literal; describe it
// here so the transform is checked).
// ---------------------------------------------------------------------------

interface PtCatalogSkill {
  id: string;
  code: string;
  class: PlayerClass;
  tier: number;
  slot: number;
  name: string;
  nameZh: string;
  docZh: string;
  requireLevel: number;
  stamina: { base: number; perRank: number };
  mastery: { base: number; perRank: number };
  element: string[];
  weapons: string[];
  func: string;
  hand: 'right' | 'left' | 'all' | 'passive';
  mana: number[] | null;
  icon: string;
  fileName: string;
  ini: Record<string, (number | [number, number])[]>;
}

const SKILLS = PT_SKILL_CATALOG as unknown as Record<string, PtCatalogSkill>;

export const PT_MAX_SKILL_RANK = 10;

// ---------------------------------------------------------------------------
// ini key families (verified against Server/skill.ini + the consumers in
// SkillFunction/Tempskron.cpp, Morayion.cpp and Svr_Damge.cpp).
// ---------------------------------------------------------------------------

const DAMAGE_KEY = /_(?:Damag?e|Damge|Demage|DamagePercent|CharingDamagePercent|AddDamage)$/i;
const HEAL_KEY = /_(?:Heal|HealRange)$/i;
const AREA_KEY = /_(?:Area|PushArea|PushRange)$/i;
const RANGE_KEY = /_(?:Range|ShootingRange|Attack_Range)$/i;
const TIME_KEY = /_(?:Use)?Time$/i;
const DEC_DAMAGE_KEY = /_(?:DecDamage|Dec_Damage)$/i;
const DEFENSE_KEY = /_(?:Defense|Defanse)$/i;
const HP_KEY = /_(?:HP|AddLife)$/i;
const SUMMON_LIFE_KEY = /_Life$/i;
const SUMMON_STAT_KEY = /_(?:Hit|Defense|Defanse)$/i;
// PT summons that carry no *_Life stat block (their ini holds only the pet's
// attack/duration rows) - identified by the SkillFunction name instead.
// Deliberately tight: Elemental Shot (F_E_Shot) and the martial artist's
// H_Hawk damage skill are NOT summons.
const SUMMON_FUNC = /^F_(?:Recall_|Summon_|Advent_|Spirit_Elemental|Fire_Elemental|Scout_Hawk|Metal_Golem|D_Inhalation|Crimson_Knight)/i;

function isPairTable(v: unknown): v is [number, number][] {
  return Array.isArray(v) && Array.isArray(v[0]);
}

function scalarAt(v: (number | [number, number])[] | undefined, i: number): number {
  if (!v) return 0;
  const e = v[i];
  return typeof e === 'number' ? e : 0;
}

function pairAt(v: (number | [number, number])[] | undefined, i: number): [number, number] {
  if (!v) return [0, 0];
  const e = v[i];
  return Array.isArray(e) ? e : [0, 0];
}

// PT ranged implements: sinWS1 = bow, sinWT1 = javelin, sinWM1 = staff,
// sinWN1 = bell/fetish (sinItem.h weapon-class codes).
const PT_RANGED_WEAPONS = new Set(['sinWS1', 'sinWT1']);
const PT_CASTER_WEAPONS = new Set(['sinWM1', 'sinWN1']);

// The catalog's `element` field is NOT a damage element: it is PT's tier
// marker (every class splits 12/4/4 across tiers 1-3 / 4 / 5 and the client
// only reads Element[0] as a "different mastery gage" flag). A skill's school
// therefore comes from its name/function keywords - a "Fire Ball" is fire
// even though its row says {0,0,0} - then the class's caster school so bolts
// are not `physical`, then physical.
const PT_NAME_SCHOOL: [RegExp, AbilityDef['school']][] = [
  [/fire|flam|burn|blaze|meteor|inferno|ignis|pyro|hell|muspell/i, 'fire'],
  [/ice|frost|chill|blizzard|frozen|glaci|cold/i, 'frost'],
  [/lightning|thunder|shock|storm|volt|electric|typhoon|cyclone/i, 'nature'],
  [/venom|poison|toxic|acid|pollut/i, 'nature'],
  [/holy|saint|divine|god|bless|sacred|valor|miracle|heal|revive|resur|benedic/i, 'holy'],
  [/dark|shadow|curse|ghost|phantom|demon|soul|evil|mourn|drain|nightmare|chosty/i, 'shadow'],
];
// PT lightning/poison have no WoC school of their own; `nature` is the
// storm/venom read in this codebase's school vocabulary.
const PT_CLASS_SCHOOL: Partial<Record<PlayerClass, AbilityDef['school']>> = {
  morion_priestess: 'holy',
  morion_magician: 'arcane',
  atlanteon_shaman: 'shadow',
};

// PT recast-delay units -> WoC cooldown seconds. `Mastery` fills a 35-unit
// gage at 35/(Mastery/2) per client frame (~60fps): delay sec ≈ Mastery/60.
// Documented approximation pending the per-skill delay audit.
const PT_DELAY_TO_SEC = 1 / 60;

function ptCooldownSec(mastery: { base: number; perRank: number }, rank: number): number {
  const delay = mastery.base + mastery.perRank * (rank - 1);
  return Math.round(Math.max(0, delay * PT_DELAY_TO_SEC) * 10) / 10;
}

interface PtIniScan {
  dmgPairs: [number, number][] | undefined;
  healPairs: [number, number][] | undefined;
  /** scalar % values under Damage-family keys (PT attack-power percent). */
  dmgPct: (number | [number, number])[] | undefined;
  decPct: (number | [number, number])[] | undefined;
  duration: (number | [number, number])[] | undefined;
  area: (number | [number, number])[] | undefined;
  range: (number | [number, number])[] | undefined;
  defBuff: (number | [number, number])[] | undefined;
  hpBuff: (number | [number, number])[] | undefined;
  summonLife: boolean;
  summonStat: boolean;
  summon: boolean;
}

function scanIni(row: PtCatalogSkill): PtIniScan {
  const out: PtIniScan = {
    dmgPairs: undefined,
    healPairs: undefined,
    dmgPct: undefined,
    decPct: undefined,
    duration: undefined,
    area: undefined,
    range: undefined,
    defBuff: undefined,
    hpBuff: undefined,
    summonLife: false,
    summonStat: false,
    summon: false,
  };
  for (const [key, v] of Object.entries(row.ini)) {
    if (DAMAGE_KEY.test(key)) {
      if (isPairTable(v)) out.dmgPairs ??= v;
      else out.dmgPct ??= v;
    } else if (HEAL_KEY.test(key)) {
      if (isPairTable(v)) out.healPairs ??= v;
    } else if (TIME_KEY.test(key)) out.duration ??= v;
    else if (AREA_KEY.test(key)) out.area ??= v;
    else if (RANGE_KEY.test(key)) out.range ??= v;
    else if (DEC_DAMAGE_KEY.test(key)) out.decPct ??= v;
    else if (DEFENSE_KEY.test(key)) out.defBuff ??= v;
    else if (HP_KEY.test(key)) out.hpBuff ??= v;
    if (SUMMON_LIFE_KEY.test(key)) out.summonLife = true;
    else if (SUMMON_STAT_KEY.test(key)) out.summonStat = true;
  }
  // A *_Life HP pool beside a *_Hit/*_Defense stat is a summoned creature's
  // block, not caster stats - a lone _Hit table on a combat skill (T_Impact's
  // hit count, G_Coup's hit rating) must not flag the skill as a summon.
  out.summon = (out.summonLife && out.summonStat) || SUMMON_FUNC.test(row.func);
  if (out.summon) {
    out.defBuff = undefined;
    out.hpBuff = undefined;
  }
  return out;
}

const WEAPON_WHITELISTED = (row: PtCatalogSkill): boolean =>
  row.weapons.some((w) => w !== '0');

function buildEffects(row: PtCatalogSkill, scan: PtIniScan, i: number): AbilityEffect[] {
  const effects: AbilityEffect[] = [];
  if (scan.healPairs) {
    const [min, max] = pairAt(scan.healPairs, i);
    effects.push({ type: 'heal', min, max });
  }
  if (scan.dmgPairs) {
    const [min, max] = pairAt(scan.dmgPairs, i);
    if (scan.area) {
      // PT AoE distance units are coarser than yards; keep a bounded mapping
      // (Area 40-80 -> 4-8yd) pending the per-skill audit.
      const radius = Math.min(15, Math.max(3, Math.round(scalarAt(scan.area, i) / 10)));
      effects.push({ type: 'aoeDamage', min, max, radius });
    } else {
      effects.push({ type: 'directDamage', min, max });
    }
  }
  const pct = scalarAt(scan.dmgPct, i);
  const dur = Math.round(scalarAt(scan.duration, i));
  if (pct > 0 && dur > 0) {
    // Timed +% attack power: a self buff, not a strike.
    effects.push({ type: 'selfBuff', kind: 'buff_ap_pct', value: pct, duration: dur });
  } else if (pct > 0) {
    if (WEAPON_WHITELISTED(row) && !PT_CASTER_WEAPONS.has(row.weapons.find((w) => w !== '0') ?? '')) {
      effects.push({ type: 'weaponStrike', bonus: 0, weaponMult: 1 + pct / 100 });
    } else {
      effects.push({ type: 'directDamage', min: 0, max: 0, spellPowerCoeff: pct / 100 });
    }
  }
  const dec = scalarAt(scan.decPct, i);
  if (dec > 0 && dur > 0) {
    effects.push({ type: 'applyDebuff', kind: 'debuff_ap', value: dec, duration: dur });
  }
  const defV = scalarAt(scan.defBuff, i);
  if (defV > 0 && dur > 0 && !scan.summon) {
    effects.push({ type: 'selfBuff', kind: 'buff_armor', value: defV, duration: dur });
  }
  const hpV = scalarAt(scan.hpBuff, i);
  if (hpV > 0 && dur > 0 && !scan.summon && hpV <= 100) {
    // `*_HP`/`*_AddLife` scalars under 100 are % max-hp buffs (Bulkup,
    // Incantation); raw hit-point values (a summon stat block, or values
    // like Healing_AddLife flat heals) never reach this arm.
    effects.push({ type: 'selfBuff', kind: 'buff_maxhp_pct', value: hpV, duration: dur });
  }
  return effects;
}

function buildDef(row: PtCatalogSkill): AbilityDef {
  const scan = scanIni(row);
  const passive = row.hand === 'passive';
  const effects = passive || scan.summon ? [] : buildEffects(row, scan, 0);
  const hasOffense = effects.some(
    (e) =>
      e.type === 'directDamage' ||
      e.type === 'weaponStrike' ||
      e.type === 'aoeDamage' ||
      e.type === 'applyDebuff',
  );
  const hasHeal = effects.some((e) => e.type === 'heal' || e.type === 'aoeHeal');
  const rangedWeapon = row.weapons.some((w) => PT_RANGED_WEAPONS.has(w));
  const casterWeapon = row.weapons.some((w) => PT_CASTER_WEAPONS.has(w));
  // Duration rows without an offensive edge are self buffs; summons and
  // passives never take a target.
  const selfOrSummon = scan.summon || (!hasOffense && !hasHeal);
  const requiresTarget = !passive && !selfOrSummon;
  const range = requiresTarget
    ? rangedWeapon || casterWeapon || hasHeal
      ? 30
      : Math.min(35, Math.max(0, Math.round(scalarAt(scan.range, 0) / 10)))
    : 0;
  const schoolText = `${row.name} ${row.func} ${row.fileName}`;
  const school =
    PT_NAME_SCHOOL.find(([re]) => re.test(schoolText))?.[1] ??
    PT_CLASS_SCHOOL[row.class] ??
    'physical';
  const mana0 = row.mana?.[0] ?? 0;
  const cooldown = ptCooldownSec(row.mastery, 1);

  const def: AbilityDef = {
    id: row.id,
    name: row.name,
    class: row.class,
    cost: mana0,
    castTime: 0,
    cooldown,
    range,
    scalesWith: rangedWeapon ? 'ranged' : undefined,
    requiresTarget,
    targetType: hasHeal ? 'friendly' : 'enemy',
    passive: passive || undefined,
    school,
    learnLevel: row.requireLevel,
    effects,
    // Chinese flavor text stays out of the English field; the i18n pass writes
    // real tooltips (pt.skill.* keys) in the same change as the effect audit.
    description: `${row.name} - a rank-scaled Priston Tale technique.`,
    // Ranks 2..10: `level` carries the PT invest gate (requireLevel +
    // (rank-1)*2) - informational here; the invested point count decides the
    // resolved rank. Per-rank cooldown (PT delays grow per rank) has no
    // AbilityRank field, so cooldown stays the rank-1 delay until the
    // mastery pass lands.
    ranks: Array.from({ length: PT_MAX_SKILL_RANK - 1 }, (_, k) => {
      const rank = k + 2;
      const i = rank - 1;
      const rankRow: AbilityRank = {
        rank,
        level: row.requireLevel + (rank - 1) * 2,
        cost: row.mana?.[i] ?? mana0,
        effects: passive || scan.summon ? [] : buildEffects(row, scan, i),
      };
      return rankRow;
    }),
  };
  return def;
}

/** PT skills that conjure a creature (ini stat blocks + SkillFunction names). */
export const PT_SUMMON_SKILLS: ReadonlySet<string> = new Set(
  Object.values(SKILLS)
    .filter((row) => scanIni(row).summon)
    .map((row) => row.id),
);

/** All 220 extracted PT skills as AbilityDefs, keyed by `pt_*` id. */
export const PT_ABILITIES: Record<string, AbilityDef> = Object.fromEntries(
  Object.values(SKILLS).map((row) => [row.id, buildDef(row)]),
);

/** Each PT class's 20-skill kit in learn-chain (sSkill[] table) order. */
export const PT_CLASS_KITS = PT_SKILL_ORDER as Record<PlayerClass, string[] | undefined>;
