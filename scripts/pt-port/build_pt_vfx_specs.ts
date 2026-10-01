// PT per-skill VFX spec builder.
//
// The catalog transform gave every pt_* ability real numbers but no visual
// identity - all 220 fell through to the renderer's generic school-colored
// comet. This generator projects each skill's compact AbilityVfxSpec
// (src/render/ability_vfx_core.ts key legend: c=color p=palette pw=power
// sp=sparks rg=ringScale vr=vRing db=debris sm=smoke li=lightScale
// b={h:headScale,j:jagged,vl:volley} bo=buffOrbit lg=linger a=archetype)
// from the catalog row itself:
//
//   palette/color: skill-name/function/fileName keywords first (a "Fire Ball"
//     is fire even though its catalog `element` is {0,0,0} - that field is
//     PT's tier marker, not a damage element), then the class school
//     (priestess holy, magician arcane, shaman shadow), then physical.
//   archetype: the resolved AbilityDef's effects first, then the raw ini key
//     families for skills whose mechanics are not folded yet - summon stat
//     blocks and summon SkillFunctions, negative-valued debuff tables
//     (Inertia_* etc.), *_Area self-centered curses, heal pairs, aoe damage.
//   delivery: melee-whitelisted strikes stay `strike`; caster/ranged skills
//     and named projectiles (bolt/blast/arrow/spear/wave/ball) become `bolt`.
//   scale accents: power/sparks/ring grow with the skill's PT tier so a tier-5
//     ultimate reads bigger than a tier-1 poke; volley covers the multi-orb
//     skills (Dark Wave); jagged covers the lightning family.
//
// This is the FIRST visual pass: distinct per-skill WoC-native looks. The
// authentic PT Effect/ pipeline (per-skill Lua scripts + sprite textures like
// Judgement1.tga, MourningOfPrey.tga) is a follow-up port, not this pass.
//
// Usage:
//   npx tsx scripts/pt-port/build_pt_vfx_specs.ts

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  PT_SKILL_CATALOG,
  PT_SKILL_ORDER,
} from '../../generated/pt-maps/pt_skill_catalog.generated.ts';
import { PT_ABILITIES, PT_SUMMON_SKILLS } from '../../src/sim/content/pt_abilities.ts';
import type { AbilityDef } from '../../src/sim/types.ts';

interface CatalogRow {
  id: string;
  class: string;
  tier: number;
  slot: number;
  name: string;
  func: string;
  fileName: string;
  hand: string;
  element: string[];
  weapons: string[];
  ini: Record<string, unknown>;
}
const CATALOG = PT_SKILL_CATALOG as unknown as Record<string, CatalogRow>;

// ---------------------------------------------------------------------------
// Color/palette identity
// ---------------------------------------------------------------------------

type Vibe = 'fire' | 'frost' | 'storm' | 'venom' | 'shadow' | 'holy' | 'arcane' | 'nature' | 'physical' | 'blood' | 'gold' | 'moon';

// Three shades per vibe; a skill picks one by (tier*4 + slot) so a kit's same
// element still spreads across hues instead of reading as one color.
const SHADES: Record<Vibe, [string, string, string]> = {
  fire: ['#ff8a3c', '#ffb05a', '#e8682a'],
  frost: ['#7fd0ff', '#a8e0ff', '#5aa8e8'],
  storm: ['#ffe066', '#b8e8ff', '#9fc4ff'],
  venom: ['#8fe060', '#b8ff7f', '#58c048'],
  shadow: ['#a97fff', '#7f58c8', '#d058ff'],
  holy: ['#ffd98a', '#fff2c0', '#ffc35a'],
  arcane: ['#8fb8ff', '#c09fff', '#6f9fe8'],
  nature: ['#7fe08a', '#a8ffb0', '#58c06a'],
  physical: ['#e8d9b0', '#ffc88a', '#c8b898'],
  blood: ['#e8234a', '#ff5a68', '#b81e38'],
  gold: ['#ffe08a', '#ffca5a', '#f0b030'],
  moon: ['#b8c8ff', '#dfe8ff', '#8fa8e8'],
};

const CLASS_VIBE: Record<string, Vibe> = {
  morion_priestess: 'holy',
  morion_magician: 'arcane',
  atlanteon_shaman: 'shadow',
};

// Keyword -> vibe, scanned over name + SkillFunction + PT effect-file name.
// The catalog's `element` field is deliberately NOT consulted: it is PT's
// tier marker (tiers 1-3 = 0, tier 4 = 1, tier 5 = 2), not a damage element,
// so a tier-4 "Chain Lightning" would wrongly read as fire.
const NAME_VIBE: [RegExp, Vibe][] = [
  [/fire|flam|burn|blaze|meteor|inferno|ignis|pyro|hell|muspell/i, 'fire'],
  [/ice|frost|chill|blizzard|frozen|glaci|cold/i, 'frost'],
  [/lightning|thunder|shock|storm|volt|electric|typhoon|cyclone|tornado|gale|wind/i, 'storm'],
  [/venom|poison|toxic|acid|pollut/i, 'venom'],
  [/holy|saint|divine|god|bless|heal|valor|sacred|miracle|revive|resur|benedic|krishna|prmiel|midranda|migal/i, 'holy'],
  [/dark|shadow|curse|ghost|phantom|demon|soul|evil|mourn|nightmare|drain|vanish|wisp|chosty|agony/i, 'shadow'],
  [/blood|berserk|rage|frenzy|wound|crimson|vampir/i, 'blood'],
  [/nature|earth|quake|rock|stone|root|vine|falcon|hawk|beast|wolverin|golem/i, 'nature'],
];

function vibeOf(row: CatalogRow): Vibe {
  const text = `${row.name} ${row.func} ${row.fileName}`;
  for (const [re, vibe] of NAME_VIBE) if (re.test(text)) return vibe;
  return CLASS_VIBE[row.class] ?? 'physical';
}

// ---------------------------------------------------------------------------
// Archetype + accents from the resolved AbilityDef and raw ini families
// ---------------------------------------------------------------------------

const RANGED_WEAPONS = new Set(['sinWS1', 'sinWT1']);
const CASTER_WEAPONS = new Set(['sinWM1', 'sinWN1']);
const NON_MANA_INI = /UseMana|UseStamina|_Cost/i;
const DASH_NAME = /dash|charge|rush|blink|s_dash|p_dash|teleport/i;
const SHOUT_NAME = /roar|shout|cry|howl|yell/i;
const DEBUFF_NAME = /curse|lazy|inertia|weaken|blind|fear|silence|stun|slow|pentra|pasting|wisp/i;
const BOLT_NAME = /bolt|blast|arrow|shot|spear|javelin|wave|beam|ray|star|flare|ball|meteo|spike|needle|splash|knife|spiritual|judgement/i;
const DOT_NAME = /poison|venom|burn|bleed|agon|pollut|dot/i;

// A skill's debuff nature survives even when its ini keys are not folded into
// effects yet: curses land as negative-valued per-rank tables (Inertia_Speed,
// Inertia_Atk). Cost tables are positive and excluded.
function hasNegativeIni(row: CatalogRow): boolean {
  return Object.entries(row.ini).some(([k, v]) => {
    if (NON_MANA_INI.test(k)) return false;
    const first = Array.isArray(v) ? v[0] : v;
    return typeof first === 'number' && first < 0;
  });
}

function hasAreaIni(row: CatalogRow): boolean {
  return Object.keys(row.ini).some((k) => /_(?:Area|PushArea|PushRange)$/i.test(k));
}

function specFor(row: CatalogRow, def: AbilityDef): Record<string, unknown> | null {
  if (row.hand === 'passive') return null;
  const vibe = vibeOf(row);
  const c = SHADES[vibe][(row.tier * 4 + row.slot) % 3];
  const pw = Math.round((0.85 + (row.tier - 1) * 0.15) * 100) / 100;
  const effects = def.effects;
  const has = (t: string) => effects.some((e) => e.type === t);
  const spec: Record<string, unknown> = { c, p: vibe, pw };
  const text = `${row.name} ${row.func} ${row.fileName}`;

  if (PT_SUMMON_SKILLS.has(row.id)) {
    return { ...spec, a: 'summon', li: 1.4, bo: 'runes', lg: 2 };
  }
  if (has('heal') || has('aoeHeal')) {
    return {
      ...spec,
      a: 'heal',
      li: 1.5,
      bo: vibe === 'holy' ? 'halo' : 'sparks',
      lg: 1.5,
    };
  }

  const hasDamage = has('directDamage') || has('weaponStrike') || has('aoeDamage');
  const debuffish = has('applyDebuff') || hasNegativeIni(row) || DEBUFF_NAME.test(text);

  if (!def.requiresTarget) {
    // Self-cast: buffs, shouts, dashes, and caster-centered curse novas.
    if (SHOUT_NAME.test(text)) {
      return { ...spec, a: 'shout', rg: 1.2, sp: 16 + row.tier * 4, li: 1 };
    }
    if (DASH_NAME.test(text)) {
      return { ...spec, a: 'dash', sp: 8 + row.tier * 3, li: 1 };
    }
    if (debuffish && hasAreaIni(row)) {
      // Curse Lazy / Inertia-style self-centered debuff novas.
      return { ...spec, a: 'nova', rg: 1.2, sp: 14 + row.tier * 3, li: 1, lg: 1 };
    }
    const bo =
      vibe === 'holy' ? 'halo' : vibe === 'blood' || vibe === 'physical' ? 'weaponGlow'
      : vibe === 'nature' || vibe === 'venom' ? 'leaves' : 'runes';
    return { ...spec, a: 'buff', bo, lg: 2, li: 1.2 };
  }

  if (has('aoeDamage')) {
    const radius =
      (effects.find((e) => e.type === 'aoeDamage') as { radius?: number } | undefined)?.radius ?? 4;
    return {
      ...spec,
      a: 'nova',
      rg: Math.max(1, Math.round((radius / 4) * 10) / 10),
      vr: radius >= 5 ? 1 : undefined,
      sm: vibe === 'fire' || vibe === 'physical' || vibe === 'blood' ? 1 : undefined,
      db: vibe === 'physical' || vibe === 'blood' ? 1 : undefined,
      sp: 18 + row.tier * 4,
      li: vibe === 'physical' || vibe === 'blood' ? 0.8 : 1.2,
      lg: 1,
    };
  }
  if (debuffish && !hasDamage) {
    // Pure curses/debuffs: a contact claim on the victim, not a bolt.
    return { ...spec, a: 'cc', sp: 10 + row.tier * 3, li: 0.9, lg: 1 };
  }
  const whitelisted = row.weapons.filter((w) => w !== '0');
  const meleeOnly =
    whitelisted.length > 0 &&
    !whitelisted.some((w) => RANGED_WEAPONS.has(w) || CASTER_WEAPONS.has(w));
  if (
    !meleeOnly &&
    (def.school !== 'physical' ||
      whitelisted.some((w) => RANGED_WEAPONS.has(w) || CASTER_WEAPONS.has(w)) ||
      BOLT_NAME.test(text))
  ) {
    const volley = /triple|spread|volley|multi/.test(text.toLowerCase())
      ? 3
      : /double|twin|wave|chain/.test(text.toLowerCase())
        ? 2
        : 1;
    const dot = DOT_NAME.test(text) && row.ini && hasAreaIni(row);
    return {
      ...spec,
      a: dot ? 'dot' : 'bolt',
      b: {
        h: Math.round((0.9 + row.tier * 0.12) * 100) / 100,
        ...(vibe === 'storm' ? { j: 1 as const } : {}),
        ...(volley > 1 ? { vl: volley } : {}),
      },
      sp: 8 + row.tier * 3,
      li: 1.1,
      lg: dot ? 2 : undefined,
    };
  }
  // Physical strikes: sparks + blood-flavored reads on the martial kits.
  return {
    ...spec,
    a: 'strike',
    sp: 14 + row.tier * 4,
    bl: vibe === 'blood' ? 1 : undefined,
    db: row.tier >= 4 ? 1 : undefined,
    li: 0.6,
    bo: 'speedlines',
  };
}

function main() {
  const out: Record<string, Record<string, unknown>> = {};
  const ordered = Object.values(PT_SKILL_ORDER).flat() as string[];
  for (const id of ordered) {
    const row = CATALOG[id];
    const def = PT_ABILITIES[id];
    if (!row || !def) continue;
    const spec = specFor(row, def);
    if (spec) out[id] = Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined));
  }
  const ts = `// GENERATED by scripts/pt-port/build_pt_vfx_specs.ts, do not edit by hand.
// First-pass per-skill visual identity for the PT catalog: palette/color from
// skill-name/function keywords (the catalog's element field is PT's tier
// marker, not a damage element), archetype from the resolved AbilityDef's
// effects plus the raw ini key families, scale from the skill's tier. The
// authentic PT Effect/ lua+sprite port is a follow-up. Shape is the compact
// AbilityVfxSpec vocabulary (src/render/ability_vfx_core.ts); conformance is
// pinned by tests/pt_vfx_specs.test.ts.
export const PT_VFX_SPECS = ${JSON.stringify(out, null, 2)} as const;
`;
  const outPath = 'generated/pt-maps/pt_vfx_specs.generated.ts';
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, ts);
  console.log(`Wrote ${outPath} (${Object.keys(out).length} specs)`);
}

main();
