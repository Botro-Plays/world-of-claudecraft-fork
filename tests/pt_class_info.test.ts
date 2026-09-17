import { describe, expect, it } from 'vitest';
import { PT_CLASS_DISPLAY_NAMES, PT_TRIBES } from '../src/sim/content/pt_tribes';
import { PT_STARTING_STATS, ptStartingStatsFor } from '../src/sim/content/pt_starting_stats';
import { tEntity, classDisplayName } from '../src/ui/entity_i18n';
import { t } from '../src/ui/i18n';
import type { PlayerClass } from '../src/sim/types';

// Guards the Character Creation details panel data for the 11 PT classes
// against the generic WoC fallback regression (PT classes used to resolve
// to classes.warrior / classDetails.lore.warrior).
//
// Authoritative sources (MagicPT-Chinese):
//   names/job codes:  PT-Source/fileread.cpp  JobDataBase[]
//   starting stats:   PT-Source/HoBaram/HoLogin.cpp
//                     TempNewCharacterInit / MorNewCharacterInit
//   descriptions:     client/StartImage/login/CharSelect/T_chr-*.tga
//   current tribes:   src/sim/content/pt_tribes.ts (Botro roster, NOT the
//                     original two-brood MagicPT grouping)

interface PtClassExpectation {
  id: PlayerClass;
  /** Plain PT class name shown in the details panel header. */
  displayName: string;
  /** Tribe-prefixed catalog display name (classes.*) used elsewhere. */
  catalogName: string;
  /** Current Botro tribe (NOT the original MagicPT brood). */
  tribe: string;
  stats: { str: number; spi: number; tal: number; dex: number; hp: number };
  /** Substrings the authentic description must contain. */
  descriptionHas: string[];
  /** Substrings that must NOT appear (WoC placeholders / stale tribe refs). */
  descriptionRejects: string[];
}

const WOC_LORE_FRAGMENTS = [
  'Rage',
  'Combo Points',
  'Mending Light',
  'Fire, Frost',
  'elements, imbuing',
];

const PT_CLASSES: PtClassExpectation[] = [
  {
    id: 'tempskron_fighter',
    displayName: 'Fighter',
    catalogName: 'Tempskron Fighter',
    tribe: 'Tempskron',
    stats: { str: 28, spi: 6, tal: 21, dex: 17, hp: 27 },
    descriptionHas: ['proximity battles', 'short-range'],
    descriptionRejects: [],
  },
  {
    id: 'tempskron_mechanician',
    displayName: 'Mechanician',
    catalogName: 'Tempskron Mechanician',
    tribe: 'Tempskron',
    stats: { str: 24, spi: 8, tal: 25, dex: 18, hp: 24 },
    descriptionHas: ['machines', 'offensive machinery'],
    descriptionRejects: [],
  },
  {
    id: 'tempskron_pikeman',
    displayName: 'Pikeman',
    catalogName: 'Tempskron Pikeman',
    tribe: 'Tempskron',
    stats: { str: 26, spi: 9, tal: 20, dex: 19, hp: 25 },
    descriptionHas: ['spears', 'wide vision'],
    descriptionRejects: ['Scalemale'], // source typo; UI text must be cleaned
  },
  {
    id: 'morion_knight',
    displayName: 'Knight',
    catalogName: 'Tempskron Knight',
    tribe: 'Tempskron', // reassigned: source lore says "warriors of Morion"
    stats: { str: 26, spi: 13, tal: 17, dex: 19, hp: 24 },
    descriptionHas: ['warriors', 'religious'],
    descriptionRejects: ['Morion'],
  },
  {
    id: 'morion_magician',
    displayName: 'Magician',
    catalogName: 'Morion Magician',
    tribe: 'Morion',
    stats: { str: 16, spi: 29, tal: 19, dex: 14, hp: 21 },
    descriptionHas: ['magical power', 'element'],
    descriptionRejects: [],
  },
  {
    id: 'atlanteon_shaman',
    displayName: 'Shaman',
    catalogName: 'Morion Shaman',
    tribe: 'Morion', // reassigned to Morion
    stats: { str: 15, spi: 27, tal: 20, dex: 15, hp: 22 },
    descriptionHas: ['dark magic', 'phantom'],
    descriptionRejects: ['lightning'],
  },
  {
    id: 'morion_priestess',
    displayName: 'Priestess',
    catalogName: 'Morion Priestess',
    tribe: 'Morion',
    stats: { str: 15, spi: 28, tal: 21, dex: 15, hp: 20 },
    descriptionHas: ['religious magic', 'heal others'],
    descriptionRejects: ['holy light', 'undead'],
  },
  {
    id: 'atlanteon_martial_artist',
    displayName: 'Martial Artist',
    catalogName: 'Atlanteon Martial Artist',
    tribe: 'Atlanteon',
    stats: { str: 26, spi: 9, tal: 20, dex: 20, hp: 24 },
    // Korean source text translated; must not regress to warrior lore
    descriptionHas: ['fists and feet', 'vambrace'],
    descriptionRejects: [],
  },
  {
    id: 'morion_atalanta',
    displayName: 'Atalanta',
    catalogName: 'Atlanteon Atalanta',
    tribe: 'Atlanteon', // reassigned to Atlanteon
    stats: { str: 23, spi: 15, tal: 19, dex: 19, hp: 23 },
    descriptionHas: ['javelin', 'spears'],
    descriptionRejects: ['Morion'],
  },
  {
    id: 'tempskron_archer',
    displayName: 'Archer',
    catalogName: 'Atlanteon Archer',
    tribe: 'Atlanteon', // reassigned to Atlanteon
    stats: { str: 17, spi: 11, tal: 21, dex: 27, hp: 23 },
    descriptionHas: ['long-range', 'crossbows'],
    descriptionRejects: [],
  },
  {
    id: 'atlanteon_assassin',
    displayName: 'Assassin',
    catalogName: 'Atlanteon Assassin',
    tribe: 'Atlanteon',
    stats: { str: 25, spi: 10, tal: 22, dex: 20, hp: 22 },
    descriptionHas: ['dual-sword', 'poisoning'],
    descriptionRejects: ['Thamskron', 'Tempskron'], // obsolete source tribe ref
  },
];

function ptTribeNameFor(classId: PlayerClass): string | null {
  const tribe = PT_TRIBES.find((t) => t.implementedClassIds.includes(classId));
  return tribe ? tribe.name : null;
}

function classDescription(classId: PlayerClass): string {
  return tEntity({ kind: 'class', id: classId, field: 'description' });
}

describe('PT character-creation class information', () => {
  it('covers all 11 implemented PT classes', () => {
    expect(PT_CLASSES).toHaveLength(11);
    for (const c of PT_CLASSES) {
      expect(PT_CLASS_DISPLAY_NAMES[c.id], c.id).toBe(c.displayName);
      expect(ptStartingStatsFor(c.id), c.id).not.toBeNull();
    }
  });

  for (const c of PT_CLASSES) {
    describe(c.displayName, () => {
      it('resolves the current Botro tribe (not the MagicPT brood)', () => {
        expect(ptTribeNameFor(c.id)).toBe(c.tribe);
      });

      it('resolves the PT catalog display name, not a WoC class name', () => {
        expect(classDisplayName(c.id)).toBe(c.catalogName);
      });

      it('has the authentic MagicPT starting stats', () => {
        expect(PT_STARTING_STATS[c.id]).toEqual(c.stats);
      });

      it('has an authentic PT description, not generic WoC lore', () => {
        const desc = classDescription(c.id);
        expect(desc.length).toBeGreaterThan(20);
        for (const fragment of WOC_LORE_FRAGMENTS) {
          expect(desc, `${c.id} leaked WoC lore fragment "${fragment}"`).not.toContain(
            fragment,
          );
        }
        for (const wanted of c.descriptionHas) {
          expect(desc, `${c.id} description missing "${wanted}"`).toContain(wanted);
        }
        for (const rejected of c.descriptionRejects) {
          expect(desc, `${c.id} description still contains "${rejected}"`).not.toContain(
            rejected,
          );
        }
      });
    });
  }

  it('no PT class falls back to a WoC lore key', () => {
    // The exact placeholder strings previously aliased for PT classes.
    const wocLore = [
      'Warriors are battle-hardened melee fighters',
      'Priests call on Mending Light',
      'Mages bend Fire, Frost',
      'Rogues are stealthy assassins',
      'Shaman command the elements',
    ];
    for (const c of PT_CLASSES) {
      const desc = classDescription(c.id);
      for (const woc of wocLore) {
        expect(desc, `${c.id} resolves to WoC lore`).not.toContain(woc);
      }
    }
  });

  describe('accessibility wording', () => {
    // The panel's visible PT labels are Strength/Spirit/Talent/Agility/Health
    // (Agility labels the source's Defence column, stored on the `dex` field).
    const PT_STAT_LABELS = ['Strength', 'Spirit', 'Talent', 'Agility', 'Health'];
    const WOC_ONLY_STAT_LABELS = ['Stamina', 'Intellect'];

    it('PT aria text names the PT stats, not the WoC stat set', () => {
      for (const c of PT_CLASSES) {
        const stats = c.stats;
        const aria = t('classDetails.ariaPt', {
          className: c.displayName,
          tribe: c.tribe,
          str: stats.str,
          spi: stats.spi,
          tal: stats.tal,
          dex: stats.dex,
          hp: stats.hp,
        });
        expect(aria, `${c.id} aria missing class name`).toContain(c.displayName);
        expect(aria, `${c.id} aria missing tribe`).toContain(c.tribe);
        for (const label of PT_STAT_LABELS) {
          expect(aria, `${c.id} aria missing PT stat "${label}"`).toContain(label);
        }
        for (const label of WOC_ONLY_STAT_LABELS) {
          expect(aria, `${c.id} aria leaked WoC stat "${label}"`).not.toContain(label);
        }
      }
    });

    it('WoC classes keep the original WoC aria wording', () => {
      const aria = t('classDetails.aria', {
        className: 'Warrior',
        role: 'Tank',
        str: 10,
        agi: 10,
        sta: 10,
        int: 10,
        spi: 10,
      });
      expect(aria).toContain('role Tank');
      for (const label of ['Strength', 'Agility', 'Stamina', 'Intellect', 'Spirit']) {
        expect(aria, `WoC aria lost "${label}"`).toContain(label);
      }
      for (const label of ['Talent', 'Dexterity', 'Health']) {
        expect(aria, `WoC aria gained PT stat "${label}"`).not.toContain(label);
      }
    });
  });
});
