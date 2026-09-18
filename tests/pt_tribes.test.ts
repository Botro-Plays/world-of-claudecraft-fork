// Focused tests for the PT tribe-first Character Selection system.
//
// Verifies the authoritative tribe configuration (pt_tribes.ts) and the
// tribe-select UI logic (ui/pt_tribe_select.ts):
//
// - Three tribes: Tempskron, Morion, Atlanteon
// - Tempskron: 4 classes (all implemented)
// - Morion: 3 classes (all implemented)
// - Atlanteon: 4 classes (all implemented)
// - Tribe filtering (filterOfflineSelectForTribe, resetOfflineSelectTribeFilter)
// - Tribe card wiring (wirePtTribeSelect callbacks)
// - Display name coverage
//
// No browser/DOM globals are needed for the data-layer tests; the wiring
// tests use a minimal fake DOM built from plain objects.

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  PT_CLASS_DISPLAY_NAMES,
  PT_TRIBES,
  ptTribeForClass,
  type PtTribeId,
} from '../src/sim/content/pt_tribes';
import {
  filterOfflineSelectForTribe,
  resetOfflineSelectTribeFilter,
  wirePtTribeSelect,
} from '../src/ui/pt_tribe_select';

// ---------------------------------------------------------------------------
// Tribe data layer
// ---------------------------------------------------------------------------

describe('PT tribe configuration', () => {
  it('defines exactly three tribes', () => {
    expect(PT_TRIBES).toHaveLength(3);
  });

  it('tribe ids are tempskron, morion, atlanteon in order', () => {
    expect(PT_TRIBES.map((t) => t.id)).toEqual(['tempskron', 'morion', 'atlanteon']);
  });

  describe('Tempskron', () => {
    const tribe = PT_TRIBES.find((t) => t.id === 'tempskron')!;

    it('exists', () => expect(tribe).toBeDefined());
    it('name is Tempskron', () => expect(tribe.name).toBe('Tempskron'));
    it('has 4 classes', () => expect(tribe.classIds).toHaveLength(4));
    it('has 4 implemented classes', () => expect(tribe.implementedClassIds).toHaveLength(4));

    it('classIds contains the four Tempskron classes', () => {
      expect(tribe.classIds).toContain('tempskron_fighter');
      expect(tribe.classIds).toContain('tempskron_mechanician');
      expect(tribe.classIds).toContain('tempskron_pikeman');
      expect(tribe.classIds).toContain('morion_knight');
    });

    it('all four Tempskron classes are implemented', () => {
      expect(tribe.implementedClassIds).toContain('tempskron_fighter');
      expect(tribe.implementedClassIds).toContain('tempskron_mechanician');
      expect(tribe.implementedClassIds).toContain('tempskron_pikeman');
      expect(tribe.implementedClassIds).toContain('morion_knight');
    });

    it('first implemented class is tempskron_fighter', () => {
      expect(tribe.implementedClassIds[0]).toBe('tempskron_fighter');
    });

    it('has a logo path', () => {
      expect(tribe.logoPath).toBeTruthy();
    });

    it('does not use a placeholder logo', () => {
      expect(tribe.placeholderLogoFromTribe).toBeNull();
    });
  });

  describe('Morion', () => {
    const tribe = PT_TRIBES.find((t) => t.id === 'morion')!;

    it('exists', () => expect(tribe).toBeDefined());
    it('name is Morion', () => expect(tribe.name).toBe('Morion'));
    it('has 3 classes', () => expect(tribe.classIds).toHaveLength(3));
    it('has 3 implemented classes', () => expect(tribe.implementedClassIds).toHaveLength(3));

    it('classIds contains the three Morion classes', () => {
      expect(tribe.classIds).toContain('morion_magician');
      expect(tribe.classIds).toContain('atlanteon_shaman');
      expect(tribe.classIds).toContain('morion_priestess');
    });

    it('all three Morion classes are implemented', () => {
      expect(tribe.implementedClassIds).toContain('morion_magician');
      expect(tribe.implementedClassIds).toContain('atlanteon_shaman');
      expect(tribe.implementedClassIds).toContain('morion_priestess');
    });

    it('first implemented class is morion_magician', () => {
      expect(tribe.implementedClassIds[0]).toBe('morion_magician');
    });

    it('has a logo path', () => {
      expect(tribe.logoPath).toBeTruthy();
    });

    it('does not use a placeholder logo', () => {
      expect(tribe.placeholderLogoFromTribe).toBeNull();
    });
  });

  describe('Atlanteon', () => {
    const tribe = PT_TRIBES.find((t) => t.id === 'atlanteon')!;

    it('exists', () => expect(tribe).toBeDefined());
    it('name is Atlanteon', () => expect(tribe.name).toBe('Atlanteon'));

    it('has exactly 4 classes', () => {
      expect(tribe.classIds).toHaveLength(4);
    });

    it('classIds contains the four Atlanteon classes', () => {
      expect(tribe.classIds).toContain('atlanteon_martial_artist');
      expect(tribe.classIds).toContain('morion_atalanta');
      expect(tribe.classIds).toContain('tempskron_archer');
      expect(tribe.classIds).toContain('atlanteon_assassin');
    });

    it('has 4 implemented classes', () => {
      expect(tribe.implementedClassIds).toHaveLength(4);
    });

    it('all four Atlanteon classes are implemented', () => {
      expect(tribe.implementedClassIds).toContain('atlanteon_martial_artist');
      expect(tribe.implementedClassIds).toContain('morion_atalanta');
      expect(tribe.implementedClassIds).toContain('tempskron_archer');
      expect(tribe.implementedClassIds).toContain('atlanteon_assassin');
    });

    it('has a logo path', () => {
      expect(tribe.logoPath).toBeTruthy();
    });

    it('does not use a placeholder logo', () => {
      expect(tribe.placeholderLogoFromTribe).toBeNull();
    });
  });

  describe('PT_CLASS_DISPLAY_NAMES', () => {
    it('covers every class ID in every tribe', () => {
      for (const tribe of PT_TRIBES) {
        for (const classId of tribe.classIds) {
          expect(
            PT_CLASS_DISPLAY_NAMES[classId],
            `display name missing for ${classId}`,
          ).toBeTruthy();
        }
      }
    });

    it('Fighter display name is Fighter', () =>
      expect(PT_CLASS_DISPLAY_NAMES['tempskron_fighter']).toBe('Fighter'));
    it('Magician display name is Magician', () =>
      expect(PT_CLASS_DISPLAY_NAMES['morion_magician']).toBe('Magician'));
    it('Shaman display name is Shaman', () =>
      expect(PT_CLASS_DISPLAY_NAMES['atlanteon_shaman']).toBe('Shaman'));
    it('Martial Artist display name is Martial Artist', () =>
      expect(PT_CLASS_DISPLAY_NAMES['atlanteon_martial_artist']).toBe('Martial Artist'));
  });
});

// ---------------------------------------------------------------------------
// Tribe UI logic: filterOfflineSelectForTribe / resetOfflineSelectTribeFilter
// ---------------------------------------------------------------------------
//
// Minimal fake DOM helpers: only the subset of the API the module touches
// (toggleAttribute, removeAttribute, setAttribute, dataset, querySelectorAll).

function makeFakeSection(tribe: PtTribeId) {
  const el = {
    dataset: { tribe },
    hidden: false,
    toggleAttribute(name: string, force?: boolean) {
      if (name === 'hidden') this.hidden = force !== undefined ? force : !this.hidden;
    },
    removeAttribute(name: string) {
      if (name === 'hidden') this.hidden = false;
    },
  };
  return el;
}

function makeFakeHeader() {
  return {
    hidden: true,
    textContent: '',
    removeAttribute(name: string) {
      if (name === 'hidden') this.hidden = false;
    },
    setAttribute(name: string, _val: string) {
      if (name === 'hidden') this.hidden = true;
    },
  };
}

function makeOfflineSelectPanel() {
  const tempSection = makeFakeSection('tempskron');
  const morionSection = makeFakeSection('morion');
  const atlanteonSection = makeFakeSection('atlanteon');
  const header = makeFakeHeader();
  const sections = [tempSection, morionSection, atlanteonSection];

  const panel = {
    querySelectorAll(selector: string) {
      if (selector === '.pt-tribe-section') {
        return sections as unknown as NodeListOf<HTMLElement>;
      }
      return [] as unknown as NodeListOf<HTMLElement>;
    },
    querySelector(selector: string) {
      if (selector === '#offline-tribe-header') {
        return header as unknown as HTMLElement;
      }
      return null;
    },
  } as unknown as HTMLElement;

  return { panel, tempSection, morionSection, atlanteonSection, header };
}

describe('filterOfflineSelectForTribe', () => {
  it('shows only the tempskron section when tempskron is selected', () => {
    const { panel, tempSection, morionSection, atlanteonSection } = makeOfflineSelectPanel();
    filterOfflineSelectForTribe(panel, 'tempskron');
    expect(tempSection.hidden).toBe(false);
    expect(morionSection.hidden).toBe(true);
    expect(atlanteonSection.hidden).toBe(true);
  });

  it('shows only the morion section when morion is selected', () => {
    const { panel, tempSection, morionSection, atlanteonSection } = makeOfflineSelectPanel();
    filterOfflineSelectForTribe(panel, 'morion');
    expect(tempSection.hidden).toBe(true);
    expect(morionSection.hidden).toBe(false);
    expect(atlanteonSection.hidden).toBe(true);
  });

  it('shows only the atlanteon section when atlanteon is selected', () => {
    const { panel, tempSection, morionSection, atlanteonSection } = makeOfflineSelectPanel();
    filterOfflineSelectForTribe(panel, 'atlanteon');
    expect(tempSection.hidden).toBe(true);
    expect(morionSection.hidden).toBe(true);
    expect(atlanteonSection.hidden).toBe(false);
  });

  it('updates the tribe header text to the tribe name in uppercase', () => {
    const { panel, header } = makeOfflineSelectPanel();
    filterOfflineSelectForTribe(panel, 'morion');
    expect(header.textContent).toBe('MORION');
    expect(header.hidden).toBe(false);
  });

  it('updates the header text for Atlanteon', () => {
    const { panel, header } = makeOfflineSelectPanel();
    filterOfflineSelectForTribe(panel, 'atlanteon');
    expect(header.textContent).toBe('ATLANTEON');
  });

  it('is safe to call with a null panel', () => {
    expect(() => filterOfflineSelectForTribe(null, 'tempskron')).not.toThrow();
  });
});

describe('resetOfflineSelectTribeFilter', () => {
  it('shows all sections after a tribe filter', () => {
    const { panel, tempSection, morionSection, atlanteonSection } = makeOfflineSelectPanel();
    filterOfflineSelectForTribe(panel, 'tempskron');
    resetOfflineSelectTribeFilter(panel);
    expect(tempSection.hidden).toBe(false);
    expect(morionSection.hidden).toBe(false);
    expect(atlanteonSection.hidden).toBe(false);
  });

  it('hides the tribe header after reset', () => {
    const { panel, header } = makeOfflineSelectPanel();
    filterOfflineSelectForTribe(panel, 'morion');
    expect(header.hidden).toBe(false);
    resetOfflineSelectTribeFilter(panel);
    expect(header.hidden).toBe(true);
  });

  it('is safe to call with a null panel', () => {
    expect(() => resetOfflineSelectTribeFilter(null)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// wirePtTribeSelect callback wiring
// ---------------------------------------------------------------------------

function makeTribeSelectPanel() {
  type FakeCard = {
    dataset: { tribe: PtTribeId };
    addEventListener: (event: string, h: EventListenerOrEventListenerObject) => void;
    trigger: (event: string) => void;
  };

  const makeCard = (tribe: PtTribeId): FakeCard => {
    const listeners: Map<string, EventListenerOrEventListenerObject[]> = new Map();
    return {
      dataset: { tribe },
      addEventListener(event: string, h: EventListenerOrEventListenerObject) {
        const existing = listeners.get(event) ?? [];
        existing.push(h);
        listeners.set(event, existing);
      },
      trigger(event: string) {
        const ev = new Event(event);
        (listeners.get(event) ?? []).forEach((h) =>
          typeof h === 'function' ? h(ev) : h.handleEvent(ev),
        );
      },
    };
  };

  const tempCard = makeCard('tempskron');
  const morionCard = makeCard('morion');
  const atlanteonCard = makeCard('atlanteon');

  const backListeners: EventListenerOrEventListenerObject[] = [];
  const backBtn = {
    id: 'btn-tribe-select-back',
    addEventListener(_event: string, h: EventListenerOrEventListenerObject) {
      backListeners.push(h);
    },
    trigger() {
      const ev = new Event('click');
      backListeners.forEach((h) => (typeof h === 'function' ? h(ev) : h.handleEvent(ev)));
    },
  };

  const cards = [tempCard, morionCard, atlanteonCard];
  const panel = {
    querySelectorAll(selector: string) {
      if (selector === '.pt-tribe-card[data-tribe]') {
        return cards as unknown as NodeListOf<HTMLElement>;
      }
      return [] as unknown as NodeListOf<HTMLElement>;
    },
    querySelector(selector: string) {
      if (selector === '#btn-tribe-select-back') {
        return backBtn as unknown as HTMLElement;
      }
      return null;
    },
  } as unknown as HTMLElement;

  return { panel, tempCard, morionCard, atlanteonCard, backBtn };
}

describe('wirePtTribeSelect', () => {
  it('calls onTribeSelected with tempskron when the Tempskron card is clicked', () => {
    const onTribeSelected = vi.fn();
    const { panel, tempCard } = makeTribeSelectPanel();
    wirePtTribeSelect(panel, { onTribeSelected, onBack: vi.fn() });
    tempCard.trigger('click');
    expect(onTribeSelected).toHaveBeenCalledTimes(1);
    const [tribeId] = onTribeSelected.mock.calls[0]!;
    expect(tribeId).toBe('tempskron');
  });

  it('passes the first implemented class id for Tempskron', () => {
    const onTribeSelected = vi.fn();
    const { panel, tempCard } = makeTribeSelectPanel();
    wirePtTribeSelect(panel, { onTribeSelected, onBack: vi.fn() });
    tempCard.trigger('click');
    const [, firstClass] = onTribeSelected.mock.calls[0]!;
    expect(firstClass).toBe('tempskron_fighter');
  });

  it('calls onTribeSelected with morion when the Morion card is clicked', () => {
    const onTribeSelected = vi.fn();
    const { panel, morionCard } = makeTribeSelectPanel();
    wirePtTribeSelect(panel, { onTribeSelected, onBack: vi.fn() });
    morionCard.trigger('click');
    const [tribeId, firstClass] = onTribeSelected.mock.calls[0]!;
    expect(tribeId).toBe('morion');
    expect(firstClass).toBe('morion_magician');
  });

  it('passes the first implemented class for Atlanteon', () => {
    const onTribeSelected = vi.fn();
    const { panel, atlanteonCard } = makeTribeSelectPanel();
    wirePtTribeSelect(panel, { onTribeSelected, onBack: vi.fn() });
    atlanteonCard.trigger('click');
    const [tribeId, firstClass] = onTribeSelected.mock.calls[0]!;
    expect(tribeId).toBe('atlanteon');
    expect(firstClass).toBe('atlanteon_martial_artist');
  });

  it('calls onBack when the Back button is clicked', () => {
    const onBack = vi.fn();
    const { panel, backBtn } = makeTribeSelectPanel();
    wirePtTribeSelect(panel, { onTribeSelected: vi.fn(), onBack });
    backBtn.trigger();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('is safe to call with a null panel', () => {
    expect(() =>
      wirePtTribeSelect(null, { onTribeSelected: vi.fn(), onBack: vi.fn() }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Character-name tribe color wiring
//
// The Character Details header emits data-pt-tribe="<id>" on the
// .class-details-name element (resolved from PT_TRIBES, not a per-class
// table), and shell.css maps each tribe id to its name color. Any class
// added to a tribe's implementedClassIds — including the future Morion
// Monk — automatically inherits that tribe's name color.
// ---------------------------------------------------------------------------

describe('PT class-name tribe color wiring', () => {
  const shellCss = readFileSync(
    new URL('../src/styles/shell.css', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');

  it('every implemented PT class resolves to exactly one tribe id', () => {
    for (const tribe of PT_TRIBES) {
      for (const cls of tribe.implementedClassIds) {
        const owners = PT_TRIBES.filter((t) =>
          (t.implementedClassIds as readonly string[]).includes(cls),
        );
        expect(owners, `${cls} must belong to exactly one tribe`).toHaveLength(1);
        expect(owners[0]!.id).toBe(tribe.id);
      }
    }
  });

  it('every tribe id has a class-details-name color rule in shell.css', () => {
    for (const tribe of PT_TRIBES) {
      expect(
        shellCss,
        `missing .class-details-name[data-pt-tribe='${tribe.id}'] rule`,
      ).toContain(`.class-details-name[data-pt-tribe='${tribe.id}']`);
    }
  });

  it('current classes map to the expected tribe (name color follows)', () => {
    const expected: Record<string, PtTribeId> = {
      tempskron_fighter: 'tempskron',
      tempskron_mechanician: 'tempskron',
      tempskron_pikeman: 'tempskron',
      morion_knight: 'tempskron',
      morion_magician: 'morion',
      atlanteon_shaman: 'morion',
      morion_priestess: 'morion',
      atlanteon_martial_artist: 'atlanteon',
      morion_atalanta: 'atlanteon',
      tempskron_archer: 'atlanteon',
      atlanteon_assassin: 'atlanteon',
    };
    for (const [cls, tribeId] of Object.entries(expected)) {
      const owner = PT_TRIBES.find((t) =>
        (t.implementedClassIds as readonly string[]).includes(cls),
      );
      expect(owner?.id, cls).toBe(tribeId);
    }
  });
});

// ---------------------------------------------------------------------------
// Unified tribe-color wiring
//
// One palette (--pt-tribe-* in tokens.css) and one resolver
// (ptTribeForClass in pt_tribes.ts) feed every tribe-tinted surface:
// the Character Details name, the portrait-chip ring (character select and
// every in-game chip), and the player unit-frame portrait ring. WoC classes
// get no data-pt-tribe attribute and keep their class-color/--border look.
// A class added to a tribe's implementedClassIds — including the future
// Morion Monk — resolves on every surface with no per-class color table.
// ---------------------------------------------------------------------------

describe('unified PT tribe color', () => {
  const tokensCss = readFileSync(
    new URL('../src/styles/tokens.css', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const shellCss = readFileSync(
    new URL('../src/styles/shell.css', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const hudCss = readFileSync(
    new URL('../src/styles/hud.css', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const portraitChipTs = readFileSync(
    new URL('../src/ui/portrait_chip.ts', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const hudTs = readFileSync(
    new URL('../src/ui/hud.ts', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const mainTs = readFileSync(
    new URL('../src/main.ts', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');

  const TRIBE_HEX: Record<PtTribeId, string> = {
    tempskron: '#d86a6a',
    morion: '#6fa8d8',
    atlanteon: '#70b58a',
  };

  it('the shared resolver maps every implemented class to its tribe', () => {
    for (const tribe of PT_TRIBES) {
      for (const cls of tribe.implementedClassIds) {
        expect(ptTribeForClass(cls)?.id, cls).toBe(tribe.id);
      }
    }
  });

  it('the shared resolver returns null for WoC classes', () => {
    for (const cls of ['warrior', 'paladin', 'mage', 'priest', 'rogue']) {
      expect(ptTribeForClass(cls), cls).toBeNull();
    }
  });

  it('tokens.css holds the one authoritative tribe palette', () => {
    for (const tribe of PT_TRIBES) {
      expect(tokensCss, `--pt-tribe-${tribe.id}`).toContain(
        `--pt-tribe-${tribe.id}: ${TRIBE_HEX[tribe.id]};`,
      );
    }
  });

  it('every tribe-tinted surface reads the shared token, not a raw hex', () => {
    for (const tribe of PT_TRIBES) {
      // Character Details name (shell.css)
      expect(shellCss).toContain(`.class-details-name[data-pt-tribe='${tribe.id}']`);
      // Portrait-chip ring feeds the token through the --class-color seam
      expect(shellCss).toContain(`.portrait-chip[data-pt-tribe='${tribe.id}']`);
      expect(shellCss).toContain(`--class-color: var(--pt-tribe-${tribe.id});`);
      // Player unit-frame portrait ring (hud.css)
      expect(hudCss).toContain(
        `#player-frame .portrait-wrap[data-pt-tribe='${tribe.id}'] .portrait`,
      );
      expect(hudCss).toContain(`border-color: var(--pt-tribe-${tribe.id});`);
    }
  });

  it('portrait chips emit data-pt-tribe from the shared resolver', () => {
    expect(portraitChipTs).toContain('ptTribeForClass(cls)');
    expect(portraitChipTs).toContain('data-pt-tribe');
  });

  it('the player unit frame stamps data-pt-tribe from the shared resolver', () => {
    expect(hudTs).toContain('ptTribeForClass(this.sim.cfg.playerClass)');
    expect(hudTs).toContain("'data-pt-tribe'");
  });

  it('the Character Details name still emits data-pt-tribe', () => {
    expect(mainTs).toContain('class-details-name');
    expect(mainTs).toContain('data-pt-tribe');
  });
});
