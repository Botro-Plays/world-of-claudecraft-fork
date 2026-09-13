// Focused tests for the Character Select roster cleanup.
//
// The Character Select screen was converted from a WoC roster to a PT roster.
// The default WoC classes (warrior, paladin, hunter, rogue, priest, shaman,
// mage, warlock, druid) were removed from the Character Select UI at the
// data/registration layer (index.html). The underlying WoC class systems
// remain intact for gameplay.
//
// These tests verify:
// - The WoC classes are no longer present as selectable cards in Character
//   Select (both the online #charcreate-panel and the offline #offline-select).
// - The implemented PT classes (Fighter, Mechanician, Pikeman, Archer, Knight,
//   Atalanta) ARE present as selectable cards.
// - The Tempskron and Morion tribe sections are present.
// - The default selection logic in main.ts uses a PT class (not 'warrior').
// - The underlying WoC class definitions are still intact in the sim (CLASSES
//   still has warrior, mage, etc.).
// - The PT classes still have their class definitions intact.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLASSES } from '../src/sim/content/classes';
import { ALL_CLASSES } from '../src/sim/types';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const mainTs = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);

// The default WoC classes that were removed from Character Select.
const WOC_CLASSES = [
  'warrior',
  'paladin',
  'hunter',
  'rogue',
  'priest',
  'shaman',
  'mage',
  'warlock',
  'druid',
] as const;

// The implemented PT classes that should remain in Character Select.
// Locked classes (morion_magician, morion_priestess, atlanteon_*) are also
// present in the panels but are marked disabled; they are not in this list
// since they are not yet playable.
const PT_CLASSES = [
  'tempskron_fighter',
  'tempskron_mechanician',
  'tempskron_pikeman',
  'tempskron_archer',
  'morion_knight',
  'morion_atalanta',
] as const;

// Extract the mini-class buttons from a given panel section of index.html.
function miniClassButtonsInPanel(panelId: string): string[] {
  // Find the panel div and extract all data-class values from .mini-class buttons
  // within it. We use a simple regex approach since we're parsing static HTML.
  const panelStart = indexHtml.indexOf(`id="${panelId}"`);
  expect(panelStart, `panel #${panelId} not found in index.html`).toBeGreaterThan(-1);
  // Find the closing </div> at the same nesting level. We search for the next
  // panel or the end of the charselect section. A simpler approach: find all
  // mini-class data-class attributes between the panel start and the next
  // major panel boundary.
  const panelEnd = indexHtml.indexOf('\n        <div id="', panelStart + 10);
  const panelHtml = panelEnd > -1
    ? indexHtml.slice(panelStart, panelEnd)
    : indexHtml.slice(panelStart);
  const matches = panelHtml.match(/data-class="([^"]+)"/g) ?? [];
  return matches.map((m) => m.replace(/data-class="([^"]+)"/, '$1'));
}

describe('Character Select roster cleanup', () => {
  describe('WoC classes removed from Character Select', () => {
    for (const cls of WOC_CLASSES) {
      it(`#${cls} is NOT a mini-class button in #charcreate-panel`, () => {
        const buttons = miniClassButtonsInPanel('charcreate-panel');
        expect(buttons, `mini-class buttons in #charcreate-panel`).not.toContain(cls);
      });

      it(`#${cls} is NOT a mini-class button in #offline-select`, () => {
        const buttons = miniClassButtonsInPanel('offline-select');
        expect(buttons, `mini-class buttons in #offline-select`).not.toContain(cls);
      });
    }
  });

  describe('PT classes present in Character Select', () => {
    for (const cls of PT_CLASSES) {
      it(`#${cls} IS a mini-class button in #charcreate-panel`, () => {
        const buttons = miniClassButtonsInPanel('charcreate-panel');
        expect(buttons, `mini-class buttons in #charcreate-panel`).toContain(cls);
      });

      it(`#${cls} is NOT a mini-class button in #offline-select (3D stage selects)`, () => {
        // The offline-select now uses clickable 3D characters instead of
        // .mini-class cards. No mini-class buttons should be present.
        const buttons = miniClassButtonsInPanel('offline-select');
        expect(buttons, `mini-class buttons in #offline-select`).not.toContain(cls);
      });
    }
  });

  describe('PT tribe sections present', () => {
    it('has a PRISTON TALE heading (tribe select panel title)', () => {
      // The tribe-first panel uses "PRISTON TALE" as its h2 heading.
      expect(indexHtml).toContain('PRISTON TALE');
    });

    it('has a TEMPSKRON tribe label', () => {
      // Tribe sections now use the tribe name directly (not "PRISTON TALE: X").
      expect(indexHtml).toContain('TEMPSKRON');
    });

    it('has a MORION tribe label', () => {
      expect(indexHtml).toContain('MORION');
    });

    it('has an ATLANTEON tribe section', () => {
      expect(indexHtml).toContain('ATLANTEON');
    });

    it('has pt-tribe-section divs', () => {
      expect(indexHtml).toContain('pt-tribe-section');
    });

    it('has a #pt-tribe-select panel', () => {
      expect(indexHtml).toContain('id="pt-tribe-select"');
    });

    it('#pt-tribe-select has tribe cards for all three tribes', () => {
      const tribeSelectStart = indexHtml.indexOf('id="pt-tribe-select"');
      const tribeSelectEnd = indexHtml.indexOf('\n        <div id="offline-select"', tribeSelectStart);
      const tribeSelectHtml = tribeSelectEnd > -1
        ? indexHtml.slice(tribeSelectStart, tribeSelectEnd)
        : indexHtml.slice(tribeSelectStart);
      expect(tribeSelectHtml).toContain('data-tribe="tempskron"');
      expect(tribeSelectHtml).toContain('data-tribe="morion"');
      expect(tribeSelectHtml).toContain('data-tribe="atlanteon"');
    });

    it('tribe sections in #offline-select have data-tribe attributes', () => {
      const offlineStart = indexHtml.indexOf('id="offline-select"');
      const offlineHtml = indexHtml.slice(offlineStart, offlineStart + 4000);
      expect(offlineHtml).toContain('data-tribe="tempskron"');
      expect(offlineHtml).toContain('data-tribe="morion"');
      expect(offlineHtml).toContain('data-tribe="atlanteon"');
    });

    it('Atlanteon tribe section exists (3D stage renders its classes)', () => {
      // The offline-select no longer has .mini-class buttons; the 3D
      // stage renders the tribe's classes. Verify the tribe section div
      // exists so the tribe filter can show/hide it.
      const offlineStart = indexHtml.indexOf('id="offline-select"');
      const atlanteonSectionStart = indexHtml.indexOf('data-tribe="atlanteon"', offlineStart);
      expect(atlanteonSectionStart, 'Atlanteon tribe section must exist').toBeGreaterThan(-1);
    });
  });
});

describe('Character Select default selection uses a PT class', () => {
  it('main.ts does not default-select warrior in the offline panel', () => {
    expect(mainTs).not.toContain(
      '#offline-select .mini-class[data-class="warrior"]',
    );
  });

  it('main.ts does not default-select warrior in the online panel', () => {
    expect(mainTs).not.toContain(
      '#charcreate-panel .mini-class[data-class="warrior"]',
    );
  });

  it('main.ts tribe-first flow shows #pt-tribe-select for offline entry', () => {
    // With the tribe-first flow, handleOfflineSelect navigates to #pt-tribe-select
    // instead of directly to #offline-select. The tribe wiring callback then
    // auto-selects the first implemented class when a tribe is chosen.
    expect(mainTs).toContain("show('#pt-tribe-select')");
  });

  it('main.ts tribe callback builds the 3D stage (not mini-class cards)', () => {
    // The offline-select now uses a persistent 3D stage; the tribe callback
    // calls showTribeFormation which builds the stage. No .mini-class card
    // selection should remain for the offline panel.
    expect(mainTs).toContain('showTribeFormation');
    expect(mainTs).not.toContain('#offline-select .mini-class[data-class="');
  });

  it('main.ts default-selects tempskron_fighter in the online panel', () => {
    expect(mainTs).toContain(
      '#charcreate-panel .mini-class[data-class="tempskron_fighter"]',
    );
  });

  it('main.ts charcreate preview fallback is tempskron_fighter (not warrior)', () => {
    expect(mainTs).toContain(
      "selEl ? (selEl.dataset.class as PlayerClass) : 'tempskron_fighter'",
    );
  });

  it('main.ts imports wirePtTribeSelect from the tribe select module', () => {
    expect(mainTs).toContain('wirePtTribeSelect');
    expect(mainTs).toContain("from './ui/pt_tribe_select'");
  });

  it('main.ts imports filterOfflineSelectForTribe', () => {
    expect(mainTs).toContain('filterOfflineSelectForTribe');
  });

  it('main.ts imports resetOfflineSelectTribeFilter', () => {
    expect(mainTs).toContain('resetOfflineSelectTribeFilter');
  });
});

describe('Underlying WoC class systems preserved', () => {
  // The task requires that the underlying WoC class definitions remain intact.
  // Only the Character Select UI was changed; the sim class system is untouched.

  it('CLASSES still has warrior', () => {
    expect(CLASSES.warrior).toBeDefined();
    expect(CLASSES.warrior.id).toBe('warrior');
  });

  it('CLASSES still has mage', () => {
    expect(CLASSES.mage).toBeDefined();
    expect(CLASSES.mage.id).toBe('mage');
  });

  it('CLASSES still has paladin', () => {
    expect(CLASSES.paladin).toBeDefined();
    expect(CLASSES.paladin.id).toBe('paladin');
  });

  it('CLASSES still has priest', () => {
    expect(CLASSES.priest).toBeDefined();
    expect(CLASSES.priest.id).toBe('priest');
  });

  it('CLASSES still has rogue', () => {
    expect(CLASSES.rogue).toBeDefined();
    expect(CLASSES.rogue.id).toBe('rogue');
  });

  it('CLASSES still has hunter', () => {
    expect(CLASSES.hunter).toBeDefined();
    expect(CLASSES.hunter.id).toBe('hunter');
  });

  it('CLASSES still has shaman', () => {
    expect(CLASSES.shaman).toBeDefined();
    expect(CLASSES.shaman.id).toBe('shaman');
  });

  it('CLASSES still has warlock', () => {
    expect(CLASSES.warlock).toBeDefined();
    expect(CLASSES.warlock.id).toBe('warlock');
  });

  it('CLASSES still has druid', () => {
    expect(CLASSES.druid).toBeDefined();
    expect(CLASSES.druid.id).toBe('druid');
  });

  it('ALL_CLASSES still includes the WoC classes', () => {
    for (const cls of WOC_CLASSES) {
      expect(ALL_CLASSES).toContain(cls);
    }
  });
});

describe('PT class definitions intact after roster cleanup', () => {
  it('CLASSES has tempskron_fighter', () => {
    expect(CLASSES.tempskron_fighter).toBeDefined();
    expect(CLASSES.tempskron_fighter.id).toBe('tempskron_fighter');
  });

  it('CLASSES has tempskron_mechanician', () => {
    expect(CLASSES.tempskron_mechanician).toBeDefined();
    expect(CLASSES.tempskron_mechanician.id).toBe('tempskron_mechanician');
  });

  it('CLASSES has tempskron_pikeman', () => {
    expect(CLASSES.tempskron_pikeman).toBeDefined();
    expect(CLASSES.tempskron_pikeman.id).toBe('tempskron_pikeman');
  });

  it('CLASSES has tempskron_archer', () => {
    expect(CLASSES.tempskron_archer).toBeDefined();
    expect(CLASSES.tempskron_archer.id).toBe('tempskron_archer');
  });

  it('CLASSES has morion_knight', () => {
    expect(CLASSES.morion_knight).toBeDefined();
    expect(CLASSES.morion_knight.id).toBe('morion_knight');
  });

  it('CLASSES has morion_atalanta', () => {
    expect(CLASSES.morion_atalanta).toBeDefined();
    expect(CLASSES.morion_atalanta.id).toBe('morion_atalanta');
  });

  it('ALL_CLASSES includes all PT classes', () => {
    for (const cls of PT_CLASSES) {
      expect(ALL_CLASSES).toContain(cls);
    }
  });
});

describe('Character Select roster is PT-only', () => {
  it('the offline-select panel has no mini-class buttons (3D stage selects)', () => {
    // The offline-select now uses clickable 3D characters instead of
    // .mini-class cards. No mini-class buttons should be present at all.
    const buttons = miniClassButtonsInPanel('offline-select');
    expect(buttons, `offline-select should have no mini-class buttons`).toEqual([]);
  });

  it('the charcreate-panel has only PT class buttons', () => {
    const buttons = miniClassButtonsInPanel('charcreate-panel');
    for (const cls of WOC_CLASSES) {
      expect(buttons, `WoC class ${cls} should not be in charcreate-panel`).not.toContain(cls);
    }
    for (const cls of PT_CLASSES) {
      expect(buttons, `PT class ${cls} should be in charcreate-panel`).toContain(cls);
    }
  });
});
