// Emits the `pt_*` ABILITY_RECIPES block for src/ui/icons.ts.
//
// tests/ability_icons.test.ts requires every ability id to carry an explicit
// recipe INSIDE the ABILITY_RECIPES object literal (spreads are rejected) and
// no two abilities may serialize to the same recipe. With 220 PT skills the
// literal is generated instead of hand-written: run
//
//   node scripts/pt-port/build_pt_icons.mjs > generated/pt_icons_block.txt
//
// and paste the output where the PT marker comment sits in icons.ts.
//
// Semantics are catalog-derived, never guessed:
//   - bg/pal come from the skill's element (Element[0]: 1 fire, 2 ice,
//     3 lightning, 4 poison) or the class's caster school for elementless
//     magic, else steel for martial.
//   - the main glyph follows the same ini-key classification
//     pt_abilities.ts applies: heal pairs -> heart, Life/Hit/Defense stat
//     blocks -> paw (summon), Dec* scalars -> skull (debuff), timed
//     non-damage rows -> shield (buff), area keys -> sunburst (nova),
//     hand === 'passive' -> sigil_rune (mastery/imbue), ranged-weapon
//     whitelists -> arrow, caster implements -> bolt, melee fallback ->
//     the class's signature weapon glyph.
//   - uniqueness is encoded, not hoped for: every entry gets a small `gem`
//     accent whose palette is the CLASS, corner is the SLOT (TL/TR/BL/BR),
//     and scale is the TIER. (class, tier, slot) is unique in the catalog,
//     so no two recipes can serialize identically.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(here, '../../generated/pt-maps/pt_skill_catalog.generated.ts');

// The generated module is a TS literal; pull the data with a regex-light
// parse instead of a TS toolchain dependency (same approach as the
// extractor's consumers).
const source = readFileSync(catalogPath, 'utf8');

// Each skill block in the catalog is a flat object literal; split on the
// `  pt_<id>: {` keys that open them (two-space indent, closing `  },`).
const blocks = [...source.matchAll(/^  (pt_[a-z0-9_]+): \{([\s\S]*?)\n  \},/gm)];

const ELEMENT_STYLE = {
  1: ['fire', 'ember'],
  2: ['frost', 'ice'],
  3: ['storm', 'sky'],
  4: ['nature', 'venom'],
};
const CLASS_STYLE = {
  morion_priestess: ['holy', 'holyGold'],
  morion_magician: ['arcane', 'arcanePink'],
  atlanteon_shaman: ['shadow', 'shadowPurple'],
};
// Class accent palettes for the uniqueness gem (all distinct, all real
// PaletteName values in icons.ts).
const CLASS_ACCENT = {
  tempskron_fighter: 'blood',
  tempskron_mechanician: 'earthBrown',
  tempskron_pikeman: 'sky',
  tempskron_archer: 'leafGreen',
  morion_knight: 'gold',
  morion_atalanta: 'pink',
  morion_priestess: 'holyGold',
  morion_magician: 'arcanePink',
  atlanteon_assassin: 'shadowPurple',
  atlanteon_martial_artist: 'ember',
  atlanteon_shaman: 'venom',
};
// Signature melee glyph per class when the row is a weapon-strike.
const CLASS_GLYPH = {
  tempskron_fighter: 'sword',
  tempskron_mechanician: 'gear',
  tempskron_pikeman: 'needle',
  tempskron_archer: 'arrow',
  morion_knight: 'sword',
  morion_atalanta: 'wing',
  morion_priestess: 'cross',
  morion_magician: 'staff',
  atlanteon_assassin: 'dagger',
  atlanteon_martial_artist: 'fist',
  atlanteon_shaman: 'bell',
};
const SLOT_CORNER = [
  { x: -13, y: -13 },
  { x: 13, y: -13 },
  { x: -13, y: 13 },
  { x: 13, y: 13 },
];
// sinWS1 = bow, sinWT1 = javelin (the archer/atalanta whitelists), sinWS2 is
// the two-handed melee line (fighter/knight/pikeman all carry it).
const RANGED_WEAPONS = new Set(['sinWS1', 'sinWT1']);
const CASTER_WEAPONS = new Set(['sinWM1', 'sinWN1']);

const field = (body, name) => {
  const m = body.match(new RegExp(`${name}: ([^,\n]+)`));
  return m ? m[1].trim() : null;
};

function glyphFor(cls, body) {
  const hand = field(body, 'hand')?.replaceAll('"', '');
  if (hand === 'passive') return 'sigil_rune';
  if (/_(?:Heal|HealRange)"?:/.test(body)) return 'heart';
  if (/_(?:Life|Hit|Defense)"?:/.test(body) && /Life/.test(body)) return 'paw';
  if (/Dec(?:_)?(?:Damag?e|Damage)/.test(body)) return 'skull';
  const hasArea = /_(?:Area|PushArea|PushRange)"?:/.test(body);
  // Pair tables print as `Key: [[min, max], ...]`; scalar % rows as `Key: [n, ...]`.
  const hasDmgPairs = /_(?:Damag?e|Damge|Demage)"?:\s*\[\[/.test(body);
  const hasDmgScalar = /_(?:Damag?e|Damge|Demage|DamagePercent|CharingDamagePercent|AddDamage)"?:\s*\[(?!\[)/.test(
    body,
  );
  const hasDmg = hasDmgPairs || hasDmgScalar;
  const hasTime = /_(?:Use)?Time"?:/.test(body);
  if (hasDmgPairs && hasArea) return 'sunburst';
  // Scalar % + duration is the buff_ap_pct fold (Maximize family), a timed
  // self-buff, not a strike.
  if (hasDmgScalar && hasTime && !hasDmgPairs) return 'shield';
  if (!hasDmg && hasTime) return 'shield';
  const weapons = (body.match(/weapons: \[([^\]]*)\]/)?.[1] ?? '').match(/sin[A-Z0-9]+/g) ?? [];
  if (hasDmg) {
    if (weapons.some((w) => RANGED_WEAPONS.has(w))) return 'arrow';
    if (weapons.some((w) => CASTER_WEAPONS.has(w))) return 'bolt';
    return CLASS_GLYPH[cls] ?? 'sword';
  }
  return CLASS_GLYPH[cls] ?? 'sword';
}

const lines = [];
const seen = new Map();
for (const block of blocks) {
  const id = block[1];
  const body = block[2];
  const cls = field(body, 'class')?.replaceAll('"', '');
  const tier = Number(field(body, 'tier'));
  const slot = Number(field(body, 'slot'));
  const element = field(body, 'element')?.match(/"(\d)"/)?.[1] ?? '0';
  const [bg, pal] =
    (element !== '0' && ELEMENT_STYLE[element]) || CLASS_STYLE[cls] || ['steel', 'steel'];
  const glyph = glyphFor(cls, body);
  const corner = SLOT_CORNER[slot % 4];
  const scale = (0.3 + tier * 0.06).toFixed(2);
  const accent = `{ p: 'gem', x: ${corner.x}, y: ${corner.y}, s: ${scale}, pal: '${CLASS_ACCENT[cls]}' }`;
  const recipe = `r('${bg}', '${pal}', ['${glyph}', ${accent}], ['glow'])`;
  if (seen.has(recipe)) throw new Error(`recipe collision: ${id} vs ${seen.get(recipe)}`);
  seen.set(recipe, id);
  lines.push(`  ${id}: ${recipe},`);
}

if (lines.length !== 220) throw new Error(`expected 220 pt skills, emitted ${lines.length}`);
process.stdout.write(lines.join('\n') + '\n');
