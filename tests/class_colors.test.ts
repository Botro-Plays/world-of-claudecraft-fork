import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLASS_COLOR as AVATAR_CLASS_COLOR } from '../server/avatar';
import { CLASS_CHIPS } from '../src/guide/data';
import { CLASSES } from '../src/sim/content/classes';
import type { PlayerClass } from '../src/sim/types';

// The class color lives in several places: CLASSES[cls].color (the shared
// source, driving chat names, party/raid frame accents, minimap/delve dots, the
// 3D model tint, and the Player Card), the two --class-color token blocks in
// shell.css (char-select chips, class detail panels, skin swatches), the guide's
// CLASS_CHIPS, and the server avatar emblem tint (public profile pages and
// og:image unfurls). The CSS and guide copies are MANUAL parallels that do not
// read CLASSES, and copies have drifted before (priest was #ffffff in CSS vs
// #fffff0 in the sim, and the avatar table shipped a whole palette generation
// behind), so this suite pins the shared palette to literals and guards every
// site against it.

// The approved palette, pinned as literals so a silent revert of any single
// color fails loudly. Do not derive these from CLASSES: the pin IS the spec.
const PALETTE: Record<PlayerClass, number> = {
  warrior: 0xd67a54,
  mage: 0x33c1f1,
  rogue: 0xfcee58,
  paladin: 0xf58ca0,
  hunter: 0xa6d84f,
  priest: 0xc6d4f0,
  shaman: 0x4e8aea,
  warlock: 0xa785e6,
  druid: 0xff8c1a,
  // PT Tempskron Fighter POC: reuse warrior's color
  tempskron_fighter: 0xd67a54,
  // PT Tempskron Mechanician POC: reuse warrior's color
  tempskron_mechanician: 0xd67a54,
  // PT Tempskron Pikeman POC: reuse warrior's color
  tempskron_pikeman: 0xd67a54,
  // PT Tempskron Archer POC: distinct green color (ranged/dexterity class)
  tempskron_archer: 0x4a9c5a,
  // PT Morion Knight POC: distinct Morion blue color (strength/melee class)
  morion_knight: 0x6b8fb5,
  // PT Morion Atalanta POC: distinct Morion gold color (spear/dexterity class)
  morion_atalanta: 0xc4a070,
  // PT Morion Priestess POC: distinct light purple color (holy healer)
  morion_priestess: 0xe8d0ff,
  // PT Morion Magician POC: distinct orange-red color (fire/elemental caster)
  morion_magician: 0xff6b3d,
  // PT Atlanteon Assassin POC: distinct dark blue-gray color (dual-wield DPS)
  atlanteon_assassin: 0x4a4a6b,
  // PT Atlanteon Martial Artist POC: distinct gold color (unarmed brawler)
  atlanteon_martial_artist: 0xd4a040,
  // PT Atlanteon Shaman POC: distinct teal color (spiritual caster)
  atlanteon_shaman: 0x3d6b5c,
};
const CLASS_IDS = Object.keys(PALETTE) as PlayerClass[];

const toCssHex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

// Whitespace-normalized view of the CSS so biome re-wrapping never breaks a
// match, only a real value change does (the known pin trap).
const shellCss = readFileSync(new URL('../src/styles/shell.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ');

describe('class color palette', () => {
  it('CLASSES pins the nine approved colors as exact literals', () => {
    for (const cls of CLASS_IDS) {
      expect(CLASSES[cls].color, cls).toBe(PALETTE[cls]);
    }
  });

  it('covers every class exactly once', () => {
    expect([...CLASS_IDS].sort()).toEqual(Object.keys(CLASSES).sort());
  });

  it('the server avatar emblem tint matches the shared value per class', () => {
    for (const cls of CLASS_IDS) {
      const [r, g, b] = AVATAR_CLASS_COLOR[cls];
      expect((r << 16) | (g << 8) | b, `avatar color for ${cls}`).toBe(PALETTE[cls]);
    }
  });

  it('both shell.css --class-color token blocks match the shared value per class', () => {
    for (const cls of CLASS_IDS) {
      // Matches any selector block containing data-class="<cls>" that declares
      // --class-color; there are two (the .mini-class copy and the generic
      // [data-class] copy) and BOTH must agree with CLASSES[cls].color.
      const re = new RegExp(
        `\\[data-class="${cls}"\\] \\{[^}]*?--class-color: (#[0-9a-fA-F]{6})`,
        'g',
      );
      const tokens = [...shellCss.matchAll(re)].map((m) => m[1].toLowerCase());
      expect(tokens, `shell.css --class-color blocks for ${cls}`).toEqual([
        toCssHex(PALETTE[cls]),
        toCssHex(PALETTE[cls]),
      ]);
    }
  });

  it('the guide CLASS_CHIPS colors match the shared value per class', () => {
    expect(CLASS_CHIPS.map((c) => c.id).sort()).toEqual([...CLASS_IDS].sort());
    for (const chip of CLASS_CHIPS) {
      expect(chip.color.toLowerCase(), `guide color for ${chip.id}`).toBe(
        toCssHex(PALETTE[chip.id as PlayerClass]),
      );
    }
  });

  it('the char-select badge literals track their 1:1 class colors', () => {
    // The energy and rage resource badges and the ranged role label render on
    // the SAME class-details card as the class-colored name, and each is 1:1
    // with a single class (rogue, warrior, hunter), so they must track the
    // palette exactly or the card shows two near-miss shades of one identity.
    // Mana is shared by five classes and deliberately NOT class-pinned.
    expect(shellCss).toContain(
      `.badge-resource.resource-energy { background: rgba(252, 238, 88, 0.12); border-color: rgba(252, 238, 88, 0.4); color: ${toCssHex(PALETTE.rogue)}; }`,
    );
    expect(shellCss).toContain(
      `.badge-resource.resource-rage { background: rgba(214, 122, 84, 0.15); border-color: rgba(214, 122, 84, 0.4); color: ${toCssHex(PALETTE.warrior)}; }`,
    );
    expect(shellCss).toContain(
      `.class-details-role.role-ranged { color: ${toCssHex(PALETTE.hunter)}; }`,
    );
  });
});
