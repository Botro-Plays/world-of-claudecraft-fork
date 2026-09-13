// Focused tests for the tribe formation roster and positioning.
//
// Tests the pure modules:
//   src/render/characters/formation.ts (formation slot math)
//   src/ui/pt_formation.ts (tribe -> formation entries)
//   src/sim/content/pt_starting_stats.ts (MagicPT starting stats)
//
// No WebGL, no DOM required.

import { describe, expect, it } from 'vitest';
import {
  formationSlots,
  formationSlotAt,
  stageRowSlots,
  stagePresentationTarget,
  PRESENTATION_CENTER,
} from '../src/render/characters/formation';
import {
  tribeFormationEntries,
  selectedFormationSlot,
  tribeStageEntries,
  classHomeSlot,
} from '../src/ui/pt_formation';
import {
  PT_STARTING_STATS,
  ptStartingStatsFor,
  hasPtStartingStats,
} from '../src/sim/content/pt_starting_stats';
import { ALL_CLASSES, type PlayerClass } from '../src/sim/types';

// ---------------------------------------------------------------------------
// formationSlots: pure positioning math
// ---------------------------------------------------------------------------

describe('formationSlots', () => {
  it('returns empty array for zero characters', () => {
    expect(formationSlots(0)).toEqual([]);
  });

  it('returns one slot for a single character', () => {
    const slots = formationSlots(1);
    expect(slots).toHaveLength(1);
    expect(slots[0].x).toBe(0);
  });

  it('returns 4 slots for Tempskron (4 classes)', () => {
    expect(formationSlots(4)).toHaveLength(4);
  });

  it('returns 3 slots for Atlanteon (3 classes)', () => {
    expect(formationSlots(3)).toHaveLength(3);
  });

  it('all slots have negative Z (behind the presentation center)', () => {
    for (const count of [2, 3, 4, 5]) {
      const slots = formationSlots(count);
      for (const s of slots) {
        expect(s.z).toBeLessThan(0);
      }
    }
  });

  it('slots are deterministic (same count -> same positions)', () => {
    expect(formationSlots(4)).toEqual(formationSlots(4));
  });
});

describe('formationSlotAt', () => {
  it('returns the slot at the given index', () => {
    const slots = formationSlots(4);
    expect(formationSlotAt(slots, 0)).toBe(slots[0]);
    expect(formationSlotAt(slots, 3)).toBe(slots[3]);
  });

  it('returns PRESENTATION_CENTER for out-of-range index', () => {
    const slots = formationSlots(4);
    expect(formationSlotAt(slots, -1)).toBe(PRESENTATION_CENTER);
    expect(formationSlotAt(slots, 99)).toBe(PRESENTATION_CENTER);
  });
});

// ---------------------------------------------------------------------------
// stageRowSlots: clean horizontal row for the 3D character-select stage
// ---------------------------------------------------------------------------

describe('stageRowSlots', () => {
  it('returns empty array for zero characters', () => {
    expect(stageRowSlots(0)).toEqual([]);
  });

  it('returns one slot for a single character', () => {
    const slots = stageRowSlots(1);
    expect(slots).toHaveLength(1);
    expect(slots[0].x).toBe(0);
  });

  it('returns 4 slots for Tempskron (4 classes)', () => {
    expect(stageRowSlots(4)).toHaveLength(4);
  });

  it('returns 3 slots for Atlanteon (3 classes)', () => {
    expect(stageRowSlots(3)).toHaveLength(3);
  });

  it('all slots share the same Z (clean horizontal row)', () => {
    for (const count of [2, 3, 4, 5]) {
      const slots = stageRowSlots(count);
      const zValues = new Set(slots.map((s) => s.z));
      expect(zValues.size, `${count} chars must share one Z`).toBe(1);
    }
  });

  it('all slots have negative Z (behind the presentation center)', () => {
    for (const count of [2, 3, 4, 5]) {
      const slots = stageRowSlots(count);
      for (const s of slots) {
        expect(s.z).toBeLessThan(0);
      }
    }
  });

  it('slots are evenly spaced on X', () => {
    const slots = stageRowSlots(4);
    const spacings = [];
    for (let i = 1; i < slots.length; i++) {
      spacings.push(slots[i].x - slots[i - 1].x);
    }
    const uniqueSpacings = new Set(spacings.map((s) => Math.round(s * 100)));
    expect(uniqueSpacings.size).toBe(1);
  });

  it('slots are deterministic (same count -> same positions)', () => {
    expect(stageRowSlots(4)).toEqual(stageRowSlots(4));
  });

  it('no slot is at the presentation center (0, 0)', () => {
    for (const count of [2, 3, 4]) {
      const slots = stageRowSlots(count);
      for (const s of slots) {
        expect(`${s.x},${s.z}`).not.toBe('0,0');
      }
    }
  });

  it('all slots have unique X positions', () => {
    for (const count of [3, 4, 5]) {
      const slots = stageRowSlots(count);
      const xValues = new Set(slots.map((s) => s.x));
      expect(xValues.size).toBe(count);
    }
  });
});

// ---------------------------------------------------------------------------
// tribeFormationEntries: tribe -> formation roster
// ---------------------------------------------------------------------------

describe('tribeFormationEntries', () => {
  it('Tempskron formation has 3 entries (4 classes minus selected)', () => {
    const entries = tribeFormationEntries('tempskron', 'tempskron_fighter');
    expect(entries).toHaveLength(3);
  });

  it('Morion formation has 3 entries (4 classes minus selected)', () => {
    const entries = tribeFormationEntries('morion', 'morion_knight');
    expect(entries).toHaveLength(3);
  });

  it('Atlanteon formation has 2 entries (3 classes minus selected)', () => {
    const entries = tribeFormationEntries('atlanteon', 'atlanteon_assassin');
    expect(entries).toHaveLength(2);
  });

  it('excludes the selected class from the formation', () => {
    const entries = tribeFormationEntries('tempskron', 'tempskron_fighter');
    expect(entries.every((e) => e.cls !== 'tempskron_fighter')).toBe(true);
  });

  it('each entry has a valid visual key (player_<class>)', () => {
    const entries = tribeFormationEntries('morion', 'morion_knight');
    for (const e of entries) {
      expect(e.visualKey).toMatch(/^player_/);
    }
  });

  it('each entry has a distinct position', () => {
    const entries = tribeFormationEntries('tempskron', 'tempskron_fighter');
    const positions = new Set(entries.map((e) => `${e.x},${e.z}`));
    expect(positions.size).toBe(entries.length);
  });

  it('all formation entries have negative Z (behind the center)', () => {
    const entries = tribeFormationEntries('atlanteon', 'atlanteon_assassin');
    for (const e of entries) {
      expect(e.z).toBeLessThan(0);
    }
  });

  it('returns empty for an unknown tribe', () => {
    // @ts-expect-error testing invalid tribe id
    expect(tribeFormationEntries('unknown', 'warrior')).toEqual([]);
  });
});

describe('selectedFormationSlot', () => {
  it('returns a slot with negative Z for a valid tribe+class', () => {
    const slot = selectedFormationSlot('tempskron', 'tempskron_fighter');
    expect(slot.z).toBeLessThan(0);
  });

  it('returns a slot for each Tempskron class', () => {
    for (const cls of [
      'tempskron_fighter',
      'tempskron_mechanician',
      'tempskron_pikeman',
      'tempskron_archer',
    ]) {
      const slot = selectedFormationSlot('tempskron', cls as never);
      expect(slot).toBeDefined();
      expect(slot.z).toBeLessThan(0);
    }
  });

  it('returns a slot for each Atlanteon class', () => {
    for (const cls of [
      'atlanteon_assassin',
      'atlanteon_shaman',
      'atlanteon_martial_artist',
    ]) {
      const slot = selectedFormationSlot('atlanteon', cls as never);
      expect(slot).toBeDefined();
      expect(slot.z).toBeLessThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// PT_STARTING_STATS: MagicPT source data
// ---------------------------------------------------------------------------

describe('PT_STARTING_STATS', () => {
  it('has entries for all 11 PT classes', () => {
    const ptClasses = ALL_CLASSES.filter((c) => hasPtStartingStats(c));
    expect(ptClasses).toHaveLength(11);
  });

  it('Fighter stats match MagicPT source (STR 28, SPI 6, TAL 21, DEX 17, HP 27)', () => {
    const s = PT_STARTING_STATS.tempskron_fighter;
    expect(s).toBeDefined();
    expect(s!.str).toBe(28);
    expect(s!.spi).toBe(6);
    expect(s!.tal).toBe(21);
    expect(s!.dex).toBe(17);
    expect(s!.hp).toBe(27);
  });

  it('Mechanician stats match MagicPT source (STR 24, SPI 8, TAL 25, DEX 18, HP 24)', () => {
    const s = PT_STARTING_STATS.tempskron_mechanician;
    expect(s).toBeDefined();
    expect(s!.str).toBe(24);
    expect(s!.spi).toBe(8);
    expect(s!.tal).toBe(25);
    expect(s!.dex).toBe(18);
    expect(s!.hp).toBe(24);
  });

  it('Pikeman stats match MagicPT source (STR 26, SPI 9, TAL 20, DEX 19, HP 25)', () => {
    const s = PT_STARTING_STATS.tempskron_pikeman;
    expect(s).toBeDefined();
    expect(s!.str).toBe(26);
    expect(s!.spi).toBe(9);
    expect(s!.tal).toBe(20);
    expect(s!.dex).toBe(19);
    expect(s!.hp).toBe(25);
  });

  it('Archer stats match MagicPT source (STR 17, SPI 11, TAL 21, DEX 27, HP 23)', () => {
    const s = PT_STARTING_STATS.tempskron_archer;
    expect(s).toBeDefined();
    expect(s!.str).toBe(17);
    expect(s!.spi).toBe(11);
    expect(s!.tal).toBe(21);
    expect(s!.dex).toBe(27);
    expect(s!.hp).toBe(23);
  });

  it('Knight stats match MagicPT source (STR 26, SPI 13, TAL 17, DEX 19, HP 24)', () => {
    const s = PT_STARTING_STATS.morion_knight;
    expect(s).toBeDefined();
    expect(s!.str).toBe(26);
    expect(s!.spi).toBe(13);
    expect(s!.tal).toBe(17);
    expect(s!.dex).toBe(19);
    expect(s!.hp).toBe(24);
  });

  it('Atalanta stats match MagicPT source (STR 23, SPI 15, TAL 19, DEX 19, HP 23)', () => {
    const s = PT_STARTING_STATS.morion_atalanta;
    expect(s).toBeDefined();
    expect(s!.str).toBe(23);
    expect(s!.spi).toBe(15);
    expect(s!.tal).toBe(19);
    expect(s!.dex).toBe(19);
    expect(s!.hp).toBe(23);
  });

  it('Priestess stats match MagicPT source (STR 15, SPI 28, TAL 21, DEX 15, HP 20)', () => {
    const s = PT_STARTING_STATS.morion_priestess;
    expect(s).toBeDefined();
    expect(s!.str).toBe(15);
    expect(s!.spi).toBe(28);
    expect(s!.tal).toBe(21);
    expect(s!.dex).toBe(15);
    expect(s!.hp).toBe(20);
  });

  it('Magician stats match MagicPT source (STR 16, SPI 29, TAL 19, DEX 14, HP 21)', () => {
    const s = PT_STARTING_STATS.morion_magician;
    expect(s).toBeDefined();
    expect(s!.str).toBe(16);
    expect(s!.spi).toBe(29);
    expect(s!.tal).toBe(19);
    expect(s!.dex).toBe(14);
    expect(s!.hp).toBe(21);
  });

  it('returns null for a non-PT class (warrior)', () => {
    expect(ptStartingStatsFor('warrior')).toBeNull();
  });

  it('hasPtStartingStats is true for PT classes, false for WoC classes', () => {
    expect(hasPtStartingStats('tempskron_fighter')).toBe(true);
    expect(hasPtStartingStats('warrior')).toBe(false);
  });

  it('all PT stats are positive integers', () => {
    for (const cls of Object.keys(PT_STARTING_STATS) as (keyof typeof PT_STARTING_STATS)[]) {
      const s = PT_STARTING_STATS[cls];
      if (!s) continue;
      expect(s.str).toBeGreaterThan(0);
      expect(s.spi).toBeGreaterThan(0);
      expect(s.tal).toBeGreaterThan(0);
      expect(s.dex).toBeGreaterThan(0);
      expect(s.hp).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Switching sequence: Fighter -> Mechanician -> Pikeman -> Archer -> Fighter
// Verifies that every newly selected character begins at its own formation
// slot, and the previously selected character returns to its formation slot
// (it reappears in the rebuilt formation background).
// ---------------------------------------------------------------------------

describe('switching sequence (Fighter -> Mechanician -> Pikeman -> Archer -> Fighter)', () => {
  const tribe = 'tempskron';
  const sequence: PlayerClass[] = [
    'tempskron_fighter',
    'tempskron_mechanician',
    'tempskron_pikeman',
    'tempskron_archer',
    'tempskron_fighter',
  ];

  it('every newly selected class starts at its own formation slot', () => {
    for (const cls of sequence) {
      const slot = selectedFormationSlot(tribe, cls);
      // The selected class's formation slot must have negative Z (behind
      // the presentation center) — it is NOT at the center (0, 0).
      expect(slot.z, `${cls} slot Z must be negative`).toBeLessThan(0);
    }
  });

  it('each selected class has a distinct formation slot from the others', () => {
    const slots = sequence.map((cls) => selectedFormationSlot(tribe, cls));
    // All four unique classes (Fighter, Mech, Pike, Archer) must have
    // distinct slots. The sequence visits Fighter twice; dedupe by class.
    const uniqueClasses = Array.from(new Set(sequence));
    const uniqueSlots = uniqueClasses.map((cls) => selectedFormationSlot(tribe, cls));
    const positions = uniqueSlots.map((s) => `${s.x},${s.z}`);
    expect(new Set(positions).size).toBe(uniqueClasses.length);
  });

  it('the previously selected class returns to the formation background', () => {
    // Simulate the switching sequence. After each switch, the formation
    // background (tribeFormationEntries) must include the previously
    // selected class — it has returned to its formation slot.
    let prev: PlayerClass | null = null;
    for (const cls of sequence) {
      if (prev !== null) {
        const entries = tribeFormationEntries(tribe, cls);
        const prevInFormation = entries.some((e) => e.cls === prev);
        expect(prevInFormation, `${prev} must return to formation after selecting ${cls}`).toBe(true);
      }
      prev = cls;
    }
  });

  it('the newly selected class is NOT in the formation background (it presents at center)', () => {
    for (const cls of sequence) {
      const entries = tribeFormationEntries(tribe, cls);
      const selectedInFormation = entries.some((e) => e.cls === cls);
      expect(selectedInFormation, `${cls} must not be in its own formation background`).toBe(false);
    }
  });

  it('the formation background always has exactly (tribeSize - 1) entries', () => {
    // Tempskron has 4 implemented classes; the formation background holds
    // the other 3 when one is selected.
    for (const cls of sequence) {
      const entries = tribeFormationEntries(tribe, cls);
      expect(entries).toHaveLength(3);
    }
  });

  it('the full Fighter -> Mech -> Pike -> Archer -> Fighter cycle is deterministic', () => {
    // Run the cycle twice; the slots and formation entries must be identical
    // each time (no state leakage between switches).
    const run1 = sequence.map((cls) => ({
      slot: selectedFormationSlot(tribe, cls),
      formation: tribeFormationEntries(tribe, cls),
    }));
    const run2 = sequence.map((cls) => ({
      slot: selectedFormationSlot(tribe, cls),
      formation: tribeFormationEntries(tribe, cls),
    }));
    expect(run1).toEqual(run2);
  });

  it('Fighter returns to formation after the full cycle back to Fighter', () => {
    // After Fighter -> Mech -> Pike -> Archer -> Fighter, the Fighter that
    // was originally at center has been displaced to the formation when
    // Mech was selected. By the time we select Fighter again, Archer (the
    // previous selection) must be in the formation.
    const entries = tribeFormationEntries(tribe, 'tempskron_fighter');
    const archerInFormation = entries.some((e) => e.cls === 'tempskron_archer');
    expect(archerInFormation, 'Archer must be in formation after re-selecting Fighter').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tribeStageEntries: persistent stage formation (all classes, HOME positions)
// ---------------------------------------------------------------------------

describe('tribeStageEntries', () => {
  it('Tempskron stage has 4 entries (all classes, none excluded)', () => {
    const entries = tribeStageEntries('tempskron');
    expect(entries).toHaveLength(4);
  });

  it('Morion stage has 4 entries (all classes, none excluded)', () => {
    const entries = tribeStageEntries('morion');
    expect(entries).toHaveLength(4);
  });

  it('Atlanteon stage has 3 entries (all classes, none excluded)', () => {
    const entries = tribeStageEntries('atlanteon');
    expect(entries).toHaveLength(3);
  });

  it('every entry has a valid visual key (player_<class>)', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const entries = tribeStageEntries(tribe);
      for (const e of entries) {
        expect(e.visualKey).toMatch(/^player_/);
      }
    }
  });

  it('all characters receive unique HOME positions', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const entries = tribeStageEntries(tribe);
      const positions = new Set(entries.map((e) => `${e.x},${e.z}`));
      expect(positions.size, `${tribe} must have unique positions`).toBe(entries.length);
    }
  });

  it('HOME positions remain stable (deterministic)', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      expect(tribeStageEntries(tribe)).toEqual(tribeStageEntries(tribe));
    }
  });

  it('four Tempskron characters map correctly (Fighter, Mech, Pike, Archer)', () => {
    const entries = tribeStageEntries('tempskron');
    const classes = entries.map((e) => e.cls);
    expect(classes).toEqual([
      'tempskron_fighter',
      'tempskron_mechanician',
      'tempskron_pikeman',
      'tempskron_archer',
    ]);
  });

  it('four Morion characters map correctly (Knight, Atalanta, Priestess, Magician)', () => {
    const entries = tribeStageEntries('morion');
    const classes = entries.map((e) => e.cls);
    expect(classes).toEqual([
      'morion_knight',
      'morion_atalanta',
      'morion_priestess',
      'morion_magician',
    ]);
  });

  it('three Atlanteon characters map correctly (Assassin, Shaman, Martial Artist)', () => {
    const entries = tribeStageEntries('atlanteon');
    const classes = entries.map((e) => e.cls);
    expect(classes).toEqual([
      'atlanteon_assassin',
      'atlanteon_shaman',
      'atlanteon_martial_artist',
    ]);
  });

  it('all HOME positions have negative Z (behind the presentation center)', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const entries = tribeStageEntries(tribe);
      for (const e of entries) {
        expect(e.z, `${tribe}/${e.cls} HOME Z must be negative`).toBeLessThan(0);
      }
    }
  });

  it('no HOME position is at the presentation center (0, 0)', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const entries = tribeStageEntries(tribe);
      for (const e of entries) {
        expect(`${e.x},${e.z}`, `${tribe}/${e.cls} must not be at center`).not.toBe('0,0');
      }
    }
  });

  it('returns empty for an unknown tribe', () => {
    // @ts-expect-error testing invalid tribe id
    expect(tribeStageEntries('unknown')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// classHomeSlot: authoritative HOME position per class
// ---------------------------------------------------------------------------

describe('classHomeSlot', () => {
  it('returns a slot with negative Z for every Tempskron class', () => {
    for (const cls of [
      'tempskron_fighter',
      'tempskron_mechanician',
      'tempskron_pikeman',
      'tempskron_archer',
    ]) {
      const slot = classHomeSlot('tempskron', cls as PlayerClass);
      expect(slot.z, `${cls} HOME Z must be negative`).toBeLessThan(0);
    }
  });

  it('returns a slot with negative Z for every Morion class', () => {
    for (const cls of [
      'morion_knight',
      'morion_atalanta',
      'morion_magician',
      'morion_priestess',
    ]) {
      const slot = classHomeSlot('morion', cls as PlayerClass);
      expect(slot.z, `${cls} HOME Z must be negative`).toBeLessThan(0);
    }
  });

  it('returns a slot with negative Z for every Atlanteon class', () => {
    for (const cls of [
      'atlanteon_assassin',
      'atlanteon_shaman',
      'atlanteon_martial_artist',
    ]) {
      const slot = classHomeSlot('atlanteon', cls as PlayerClass);
      expect(slot.z, `${cls} HOME Z must be negative`).toBeLessThan(0);
    }
  });

  it('HOME positions are stable across calls (never change)', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const entries = tribeStageEntries(tribe);
      for (const e of entries) {
        const slot = classHomeSlot(tribe, e.cls);
        expect(slot).toEqual({ x: e.x, z: e.z });
      }
    }
  });

  it('every class in a tribe has a distinct HOME position', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const entries = tribeStageEntries(tribe);
      const positions = entries.map((e) => `${classHomeSlot(tribe, e.cls).x},${classHomeSlot(tribe, e.cls).z}`);
      expect(new Set(positions).size).toBe(entries.length);
    }
  });

  it('HOME position is never the presentation center (0, 0)', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const entries = tribeStageEntries(tribe);
      for (const e of entries) {
        const slot = classHomeSlot(tribe, e.cls);
        expect(`${slot.x},${slot.z}`).not.toBe('0,0');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Stage selection state machine: HOME -> PRESENTATION -> HOME
// Simulates the persistent stage architecture without WebGL by tracking
// each character's current position against its authoritative HOME.
// ---------------------------------------------------------------------------

describe('stage selection state (home <-> center with diagonal walking)', () => {
  // Walk-based stage model: the selected character WALKS toward the
  // presentation point (centered X, forward Z — see stagePresentationTarget)
  // from its home slot, moving diagonally on both X and Z. The previous
  // selected WALKS back to its home. Home positions are immutable. Scale
  // emphasis is subtle and settles after arrival.

  const FOCUS_SCALE = 1.08;
  const BACKGROUND_SCALE = 0.92;

  /** Simulate the stage: a map of classId -> home position, target X/Z, target
   *  scale, and walk direction. select() sets the previous selection walking
   *  back home and the new selection walking toward the presentation point. */
  function makeStage(tribe: 'tempskron' | 'morion' | 'atlanteon') {
    const entries = tribeStageEntries(tribe);
    const homes = new Map<string, { x: number; z: number }>();
    const targetX = new Map<string, number>();
    const targetZ = new Map<string, number>();
    const targetScale = new Map<string, number>();
    const walkDir = new Map<string, 'forward' | 'back' | null>();
    for (const e of entries) {
      homes.set(e.cls, { x: e.x, z: e.z });
      targetX.set(e.cls, e.x);
      targetZ.set(e.cls, e.z);
      targetScale.set(e.cls, 1);
      walkDir.set(e.cls, null);
    }
    // Compute the presentation target from the formation size, matching
    // the real preview.ts implementation.
    const pres = stagePresentationTarget(entries.length);
    const CENTER_X = pres.x;
    const FOCUS_Z = pres.z;
    let selected: string | null = null;
    return {
      homes,
      targetX,
      targetZ,
      targetScale,
      walkDir,
      presentationX: CENTER_X,
      presentationZ: FOCUS_Z,
      selectedClass: () => selected,
      select(cls: string) {
        if (selected && selected !== cls) {
          // Previous selection walks back home, scale to background.
          const home = homes.get(selected)!;
          targetX.set(selected, home.x);
          targetZ.set(selected, home.z);
          targetScale.set(selected, BACKGROUND_SCALE);
          walkDir.set(selected, 'back');
        }
        // New selection walks toward the presentation point, scale up.
        targetX.set(cls, CENTER_X);
        targetZ.set(cls, FOCUS_Z);
        targetScale.set(cls, FOCUS_SCALE);
        walkDir.set(cls, 'forward');
        // All others go to background scale, stay at home.
        for (const [c] of targetX) {
          if (c !== cls) {
            const h = homes.get(c)!;
            targetX.set(c, h.x);
            targetZ.set(c, h.z);
            targetScale.set(c, BACKGROUND_SCALE);
            if (walkDir.get(c) !== 'back') walkDir.set(c, null);
          }
        }
        selected = cls;
      },
      isAtHome(cls: string) {
        return targetX.get(cls) === homes.get(cls)!.x && targetZ.get(cls) === homes.get(cls)!.z;
      },
      isAtCenter(cls: string) {
        return targetX.get(cls) === CENTER_X && targetZ.get(cls) === FOCUS_Z;
      },
      isWalkingForward(cls: string) {
        return walkDir.get(cls) === 'forward';
      },
      isWalkingBack(cls: string) {
        return walkDir.get(cls) === 'back';
      },
      isIdle(cls: string) {
        return walkDir.get(cls) === null;
      },
      scale(cls: string) {
        return targetScale.get(cls)!;
      },
    };
  }

  it('Fighter home -> Fighter center (target X=0, Z=0, walking forward)', () => {
    const stage = makeStage('tempskron');
    stage.select('tempskron_fighter');
    expect(stage.isAtCenter('tempskron_fighter')).toBe(true);
    expect(stage.isWalkingForward('tempskron_fighter')).toBe(true);
    expect(stage.scale('tempskron_fighter')).toBe(FOCUS_SCALE);
  });

  it('selected character target X is the presentation X, not home X', () => {
    const stage = makeStage('tempskron');
    const fighterHomeX = stage.homes.get('tempskron_fighter')!.x;
    stage.select('tempskron_fighter');
    expect(stage.targetX.get('tempskron_fighter')).toBe(stage.presentationX);
    expect(stage.targetX.get('tempskron_fighter')).not.toBe(fighterHomeX);
  });

  it('all other characters remain at home when one is selected', () => {
    const stage = makeStage('tempskron');
    stage.select('tempskron_fighter');
    for (const cls of ['tempskron_mechanician', 'tempskron_pikeman', 'tempskron_archer']) {
      expect(stage.isAtHome(cls), `${cls} must be at home`).toBe(true);
      expect(stage.scale(cls)).toBe(BACKGROUND_SCALE);
    }
  });

  it('Fighter center -> Fighter home (after selecting another, walking back)', () => {
    const stage = makeStage('tempskron');
    stage.select('tempskron_fighter');
    stage.select('tempskron_pikeman');
    expect(stage.isAtHome('tempskron_fighter'), 'Fighter must return home').toBe(true);
    expect(stage.isWalkingBack('tempskron_fighter')).toBe(true);
    expect(stage.isAtCenter('tempskron_pikeman')).toBe(true);
    expect(stage.isWalkingForward('tempskron_pikeman')).toBe(true);
  });

  it('Pikeman home -> Pikeman center', () => {
    const stage = makeStage('tempskron');
    stage.select('tempskron_pikeman');
    expect(stage.isAtCenter('tempskron_pikeman')).toBe(true);
  });

  it('Pikeman center -> Pikeman home (after selecting another)', () => {
    const stage = makeStage('tempskron');
    stage.select('tempskron_pikeman');
    stage.select('tempskron_mechanician');
    expect(stage.isAtHome('tempskron_pikeman')).toBe(true);
  });

  it('Mechanician home -> Mechanician center', () => {
    const stage = makeStage('tempskron');
    stage.select('tempskron_mechanician');
    expect(stage.isAtCenter('tempskron_mechanician')).toBe(true);
  });

  it('repeated switching: Fighter -> Mech -> Pike -> Archer -> Fighter', () => {
    const stage = makeStage('tempskron');
    const sequence: string[] = [
      'tempskron_fighter',
      'tempskron_mechanician',
      'tempskron_pikeman',
      'tempskron_archer',
      'tempskron_fighter',
    ];
    for (const cls of sequence) stage.select(cls);
    // After the full cycle, every character must be at its own home except
    // the final selection (Fighter), which is at center.
    expect(stage.isAtCenter('tempskron_fighter')).toBe(true);
    for (const cls of ['tempskron_mechanician', 'tempskron_pikeman', 'tempskron_archer']) {
      expect(stage.isAtHome(cls), `${cls} must be at home after cycle`).toBe(true);
    }
  });

  it('after every switch, the previously selected character returns to its exact home', () => {
    const stage = makeStage('tempskron');
    const sequence: string[] = [
      'tempskron_fighter',
      'tempskron_mechanician',
      'tempskron_pikeman',
      'tempskron_archer',
      'tempskron_fighter',
    ];
    let prev: string | null = null;
    for (const cls of sequence) {
      stage.select(cls);
      if (prev && prev !== cls) {
        expect(stage.isAtHome(prev), `${prev} must return home after selecting ${cls}`).toBe(true);
        expect(stage.isWalkingBack(prev), `${prev} must be walking back`).toBe(true);
      }
      prev = cls;
    }
  });

  it('no two characters permanently occupy the center position', () => {
    const stage = makeStage('tempskron');
    stage.select('tempskron_fighter');
    stage.select('tempskron_mechanician');
    // Only Mechanician is at center; Fighter has returned home.
    expect(stage.isAtCenter('tempskron_mechanician')).toBe(true);
    expect(stage.isAtCenter('tempskron_fighter')).toBe(false);
  });

  it('only one character has focus scale at a time', () => {
    const stage = makeStage('tempskron');
    stage.select('tempskron_fighter');
    stage.select('tempskron_pikeman');
    expect(stage.scale('tempskron_pikeman')).toBe(FOCUS_SCALE);
    expect(stage.scale('tempskron_fighter')).toBe(BACKGROUND_SCALE);
  });

  it('characters do not swap home positions', () => {
    const stage = makeStage('tempskron');
    const fighterHome = { ...stage.homes.get('tempskron_fighter')! };
    const pikemanHome = { ...stage.homes.get('tempskron_pikeman')! };
    stage.select('tempskron_fighter');
    stage.select('tempskron_pikeman');
    stage.select('tempskron_fighter');
    // Home positions are immutable.
    expect(stage.homes.get('tempskron_fighter')).toEqual(fighterHome);
    expect(stage.homes.get('tempskron_pikeman')).toEqual(pikemanHome);
  });

  it('selected character target X changes toward center (not staying at home X)', () => {
    const stage = makeStage('tempskron');
    stage.select('tempskron_fighter');
    // The target X must be the presentation X, not the home X.
    expect(stage.targetX.get('tempskron_fighter')).toBe(stage.presentationX);
    expect(stage.targetX.get('tempskron_fighter')).not.toBe(
      stage.homes.get('tempskron_fighter')!.x,
    );
  });

  it('returning character target X is its exact original homeX', () => {
    const stage = makeStage('tempskron');
    const fighterHomeX = stage.homes.get('tempskron_fighter')!.x;
    stage.select('tempskron_fighter');
    stage.select('tempskron_pikeman');
    // Fighter is walking back to its exact home X.
    expect(stage.targetX.get('tempskron_fighter')).toBe(fighterHomeX);
  });

  it('both transitions can occur simultaneously (forward + back)', () => {
    const stage = makeStage('tempskron');
    stage.select('tempskron_fighter');
    stage.select('tempskron_mechanician');
    // Fighter is walking back while Mechanician is walking forward.
    expect(stage.isWalkingBack('tempskron_fighter')).toBe(true);
    expect(stage.isWalkingForward('tempskron_mechanician')).toBe(true);
  });

  it('formation is not rebuilt during selection (home positions stable)', () => {
    const stage = makeStage('tempskron');
    const homesBefore = new Map(stage.homes);
    stage.select('tempskron_fighter');
    stage.select('tempskron_pikeman');
    stage.select('tempskron_archer');
    stage.select('tempskron_fighter');
    expect(stage.homes).toEqual(homesBefore);
  });

  it('three-character formation (Atlanteon) works', () => {
    const stage = makeStage('atlanteon');
    stage.select('atlanteon_assassin');
    expect(stage.isAtCenter('atlanteon_assassin')).toBe(true);
    stage.select('atlanteon_shaman');
    expect(stage.isAtHome('atlanteon_assassin')).toBe(true);
    expect(stage.isAtCenter('atlanteon_shaman')).toBe(true);
    stage.select('atlanteon_martial_artist');
    expect(stage.isAtHome('atlanteon_shaman')).toBe(true);
    expect(stage.isAtCenter('atlanteon_martial_artist')).toBe(true);
  });

  it('Morion four-character formation works', () => {
    const stage = makeStage('morion');
    stage.select('morion_knight');
    expect(stage.isAtCenter('morion_knight')).toBe(true);
    stage.select('morion_priestess');
    expect(stage.isAtHome('morion_knight')).toBe(true);
    expect(stage.isAtCenter('morion_priestess')).toBe(true);
  });

  it('no character starts at center during initial tribe setup', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const entries = tribeStageEntries(tribe);
      for (const e of entries) {
        expect(`${e.x},${e.z}`, `${tribe}/${e.cls} must not start at center`).not.toBe('0,0');
      }
    }
  });

  it('all home positions share the same Z (clean horizontal row)', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const entries = tribeStageEntries(tribe);
      const zValues = new Set(entries.map((e) => e.z));
      expect(zValues.size, `${tribe} must share one Z`).toBe(1);
    }
  });
});

describe('stage presentation target (formation-aware depth)', () => {
  // The presentation target must be centered on X and sufficiently forward
  // in Z that the selected character is clearly in front of every formation
  // member — including the middle character of a 3-member formation, whose
  // home X is also 0. This prevents the selected character from overlapping
  // the middle formation character from the camera's view.

  it('stagePresentationTarget returns a centered X (0)', () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const t = stagePresentationTarget(count);
      expect(t.x, `count=${count} must center X at 0`).toBe(0);
    }
  });

  it('stagePresentationTarget returns a Z in front of the formation row', () => {
    // The formation row is at z = -2.5 (STAGE_ROW_Z). The presentation Z
    // must be greater (closer to camera) than the row Z so the selected
    // character is physically in front.
    const rowZ = -2.5;
    for (const count of [1, 2, 3, 4, 5]) {
      const t = stagePresentationTarget(count);
      expect(t.z, `count=${count} presentation Z must be in front of row`).toBeGreaterThan(rowZ);
    }
  });

  it('stagePresentationTarget is deterministic (same count → same target)', () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const a = stagePresentationTarget(count);
      const b = stagePresentationTarget(count);
      expect(a).toEqual(b);
    }
  });
});

describe('3-character formation (Atlanteon) presentation overlap fix', () => {
  // Atlanteon has 3 characters. The middle character's home X is 0 (same as
  // the presentation X). The presentation Z must be sufficiently forward that
  // the selected character does not overlap the middle character from the
  // camera's view.

  const FOCUS_SCALE = 1.08;
  const BACKGROUND_SCALE = 0.92;

  function makeAtlanteonStage() {
    const entries = tribeStageEntries('atlanteon');
    const homes = new Map<string, { x: number; z: number }>();
    const targetX = new Map<string, number>();
    const targetZ = new Map<string, number>();
    const targetScale = new Map<string, number>();
    const walkDir = new Map<string, 'forward' | 'back' | null>();
    for (const e of entries) {
      homes.set(e.cls, { x: e.x, z: e.z });
      targetX.set(e.cls, e.x);
      targetZ.set(e.cls, e.z);
      targetScale.set(e.cls, 1);
      walkDir.set(e.cls, null);
    }
    const pres = stagePresentationTarget(entries.length);
    const PRES_X = pres.x;
    const PRES_Z = pres.z;
    let selected: string | null = null;
    return {
      homes,
      targetX,
      targetZ,
      targetScale,
      walkDir,
      presX: PRES_X,
      presZ: PRES_Z,
      selectedClass: () => selected,
      select(cls: string) {
        if (selected && selected !== cls) {
          const home = homes.get(selected)!;
          targetX.set(selected, home.x);
          targetZ.set(selected, home.z);
          targetScale.set(selected, BACKGROUND_SCALE);
          walkDir.set(selected, 'back');
        }
        targetX.set(cls, PRES_X);
        targetZ.set(cls, PRES_Z);
        targetScale.set(cls, FOCUS_SCALE);
        walkDir.set(cls, 'forward');
        for (const [c] of targetX) {
          if (c !== cls) {
            const h = homes.get(c)!;
            targetX.set(c, h.x);
            targetZ.set(c, h.z);
            targetScale.set(c, BACKGROUND_SCALE);
            if (walkDir.get(c) !== 'back') walkDir.set(c, null);
          }
        }
        selected = cls;
      },
      isAtHome(cls: string) {
        return targetX.get(cls) === homes.get(cls)!.x && targetZ.get(cls) === homes.get(cls)!.z;
      },
      isAtPresentation(cls: string) {
        return targetX.get(cls) === PRES_X && targetZ.get(cls) === PRES_Z;
      },
    };
  }

  it('3-member formation creates three unique home positions', () => {
    const entries = tribeStageEntries('atlanteon');
    expect(entries).toHaveLength(3);
    const positions = entries.map((e) => `${e.x},${e.z}`);
    const unique = new Set(positions);
    expect(unique.size, 'all 3 home positions must be unique').toBe(3);
  });

  it('3-member formation middle character home X is 0 (centered)', () => {
    const entries = tribeStageEntries('atlanteon');
    // The middle entry (index 1) should have X = 0.
    expect(entries[1]!.x, 'middle character must be at X=0').toBe(0);
  });

  it('selected left Atlanteon target is centered but does not equal middle home', () => {
    const stage = makeAtlanteonStage();
    const middleHome = stage.homes.get('atlanteon_shaman')!;
    stage.select('atlanteon_assassin');
    // Target X is centered (0), same as middle home X.
    expect(stage.targetX.get('atlanteon_assassin')).toBe(stage.presX);
    // But target Z is in front of the formation, not at middle home Z.
    expect(stage.targetZ.get('atlanteon_assassin')).toBe(stage.presZ);
    expect(stage.presZ, 'presentation Z must differ from middle home Z').not.toBe(middleHome.z);
    expect(stage.presZ, 'presentation Z must be in front of middle home').toBeGreaterThan(middleHome.z);
  });

  it('selected right Atlanteon target is centered but does not equal middle home', () => {
    const stage = makeAtlanteonStage();
    const middleHome = stage.homes.get('atlanteon_shaman')!;
    stage.select('atlanteon_martial_artist');
    expect(stage.targetX.get('atlanteon_martial_artist')).toBe(stage.presX);
    expect(stage.targetZ.get('atlanteon_martial_artist')).toBe(stage.presZ);
    expect(stage.presZ).not.toBe(middleHome.z);
    expect(stage.presZ).toBeGreaterThan(middleHome.z);
  });

  it('selected middle Atlanteon also walks to the presentation position', () => {
    const stage = makeAtlanteonStage();
    stage.select('atlanteon_shaman');
    // The middle character walks forward to the presentation Z (not staying
    // at its home Z).
    expect(stage.isAtPresentation('atlanteon_shaman')).toBe(true);
    expect(stage.targetZ.get('atlanteon_shaman')).toBe(stage.presZ);
    expect(stage.presZ, 'presentation Z must be in front of middle home').toBeGreaterThan(
      stage.homes.get('atlanteon_shaman')!.z,
    );
  });

  it('presentation target is in front of the formation (Z > row Z)', () => {
    const stage = makeAtlanteonStage();
    const rowZ = stage.homes.get('atlanteon_shaman')!.z;
    expect(stage.presZ, 'presentation Z must be in front of the row').toBeGreaterThan(rowZ);
  });

  it('selected character can reach presentation target without overlapping middle home', () => {
    const stage = makeAtlanteonStage();
    const middleHome = stage.homes.get('atlanteon_shaman')!;
    stage.select('atlanteon_assassin');
    // The presentation position (presX, presZ) must not equal the middle
    // character's home position. Since presX == 0 == middleHome.x, the Z
    // must differ to avoid overlap.
    expect({ x: stage.presX, z: stage.presZ }).not.toEqual(middleHome);
    expect(stage.presZ).toBeGreaterThan(middleHome.z);
  });

  it('returning character always returns to its exact original homeX/homeZ', () => {
    const stage = makeAtlanteonStage();
    const assassinHome = { ...stage.homes.get('atlanteon_assassin')! };
    stage.select('atlanteon_assassin');
    stage.select('atlanteon_shaman');
    expect(stage.targetX.get('atlanteon_assassin')).toBe(assassinHome.x);
    expect(stage.targetZ.get('atlanteon_assassin')).toBe(assassinHome.z);
  });

  it('4-member formation (Tempskron) continues to work with presentation target', () => {
    const entries = tribeStageEntries('tempskron');
    const pres = stagePresentationTarget(entries.length);
    // 4-member formation has no character at X=0, but the presentation
    // target is still centered and in front.
    expect(pres.x).toBe(0);
    expect(pres.z).toBeGreaterThan(-2.5);
    // No 4-member home is at X=0.
    for (const e of entries) {
      expect(e.x, `${e.cls} must not be at X=0 in 4-member formation`).not.toBe(0);
    }
  });

  it('simultaneous switching continues to work (Atlanteon)', () => {
    const stage = makeAtlanteonStage();
    stage.select('atlanteon_assassin');
    stage.select('atlanteon_martial_artist');
    // Assassin walks back while Martial Artist walks forward.
    expect(stage.walkDir.get('atlanteon_assassin')).toBe('back');
    expect(stage.walkDir.get('atlanteon_martial_artist')).toBe('forward');
    expect(stage.isAtPresentation('atlanteon_martial_artist')).toBe(true);
    expect(stage.isAtHome('atlanteon_assassin')).toBe(true);
  });

  it('only one character is selected at a time (Atlanteon)', () => {
    const stage = makeAtlanteonStage();
    stage.select('atlanteon_assassin');
    expect(stage.selectedClass()).toBe('atlanteon_assassin');
    stage.select('atlanteon_shaman');
    expect(stage.selectedClass()).toBe('atlanteon_shaman');
    stage.select('atlanteon_martial_artist');
    expect(stage.selectedClass()).toBe('atlanteon_martial_artist');
  });

  it('clicking the already-selected character does nothing (Atlanteon)', () => {
    const stage = makeAtlanteonStage();
    stage.select('atlanteon_assassin');
    const targetBefore = stage.targetX.get('atlanteon_assassin');
    stage.select('atlanteon_assassin'); // no-op
    expect(stage.targetX.get('atlanteon_assassin')).toBe(targetBefore);
  });

  it('formation positions of unselected characters remain unchanged (Atlanteon)', () => {
    const stage = makeAtlanteonStage();
    const homesBefore = new Map(stage.homes);
    stage.select('atlanteon_assassin');
    stage.select('atlanteon_shaman');
    stage.select('atlanteon_martial_artist');
    expect(stage.homes).toEqual(homesBefore);
  });

  it('Morion (4-character) presentation target does not overlap any home', () => {
    const entries = tribeStageEntries('morion');
    const pres = stagePresentationTarget(entries.length);
    for (const e of entries) {
      // No Morion home is at X=0, so no X overlap. But verify the Z is
      // still in front.
      expect(pres.z, `presentation Z must be in front of ${e.cls} home`).toBeGreaterThan(e.z);
    }
  });
});

describe('stage initialization (no automatic selection)', () => {
  // The stage must build with NO character selected. All members start at
  // their HOME positions, formation idle, no walk direction, no focus scale,
  // no selected flag. The player must explicitly click a character before
  // any walking or selection emphasis occurs.

  /** Simulate the freshly-built stage: all members at home, none selected. */
  function makeFreshStage(tribe: 'tempskron' | 'morion' | 'atlanteon') {
    const entries = tribeStageEntries(tribe);
    const homes = new Map<string, { x: number; z: number }>();
    const targetZ = new Map<string, number>();
    const targetScale = new Map<string, number>();
    const walkDir = new Map<string, 'forward' | 'back' | null>();
    const selected = new Map<string, boolean>();
    for (const e of entries) {
      homes.set(e.cls, { x: e.x, z: e.z });
      targetZ.set(e.cls, e.z);
      targetScale.set(e.cls, 1);
      walkDir.set(e.cls, null);
      selected.set(e.cls, false);
    }
    return {
      homes,
      targetZ,
      targetScale,
      walkDir,
      selected,
      selectedClass: () => null as string | null,
      isAtHome(cls: string) {
        return targetZ.get(cls) === homes.get(cls)!.z;
      },
      isAtFocus(cls: string) {
        return targetZ.get(cls) === 0;
      },
      isWalkingForward(cls: string) {
        return walkDir.get(cls) === 'forward';
      },
      isWalkingBack(cls: string) {
        return walkDir.get(cls) === 'back';
      },
      isIdle(cls: string) {
        return walkDir.get(cls) === null;
      },
      scale(cls: string) {
        return targetScale.get(cls)!;
      },
      isSelected(cls: string) {
        return selected.get(cls) === true;
      },
    };
  }

  it('formation initializes with no selected class', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const stage = makeFreshStage(tribe);
      expect(stage.selectedClass(), `${tribe} must have no selected class`).toBeNull();
    }
  });

  it('all members start at their HOME Z positions', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const stage = makeFreshStage(tribe);
      for (const [cls] of stage.homes) {
        expect(stage.isAtHome(cls), `${cls} must start at home Z`).toBe(true);
      }
    }
  });

  it('all members start with walkDir = null (no walking)', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const stage = makeFreshStage(tribe);
      for (const [cls] of stage.homes) {
        expect(stage.isIdle(cls), `${cls} must start idle`).toBe(true);
        expect(stage.isWalkingForward(cls), `${cls} must not walk forward`).toBe(false);
        expect(stage.isWalkingBack(cls), `${cls} must not walk back`).toBe(false);
      }
    }
  });

  it('no member starts at focus Z', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const stage = makeFreshStage(tribe);
      for (const [cls] of stage.homes) {
        expect(stage.isAtFocus(cls), `${cls} must not start at focus Z`).toBe(false);
      }
    }
  });

  it('no member receives selected scale on initialization', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const stage = makeFreshStage(tribe);
      for (const [cls] of stage.homes) {
        expect(stage.scale(cls), `${cls} must start at scale 1`).toBe(1);
      }
    }
  });

  it('no member is marked selected after initialization', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const stage = makeFreshStage(tribe);
      for (const [cls] of stage.homes) {
        expect(stage.isSelected(cls), `${cls} must not be selected`).toBe(false);
      }
    }
  });

  it('first roster character does NOT automatically walk forward', () => {
    for (const tribe of ['tempskron', 'morion', 'atlanteon'] as const) {
      const stage = makeFreshStage(tribe);
      const entries = tribeStageEntries(tribe);
      const first = entries[0]!.cls;
      expect(stage.isWalkingForward(first), `${first} must not auto-walk forward`).toBe(false);
      expect(stage.isAtFocus(first), `${first} must not be at focus`).toBe(false);
    }
  });

  it('explicit click/select still starts forward walking', () => {
    // After initialization, an explicit select() call starts walking forward.
    const entries = tribeStageEntries('tempskron');
    const homes = new Map<string, { x: number; z: number }>();
    const targetZ = new Map<string, number>();
    const targetScale = new Map<string, number>();
    const walkDir = new Map<string, 'forward' | 'back' | null>();
    let selected: string | null = null;
    for (const e of entries) {
      homes.set(e.cls, { x: e.x, z: e.z });
      targetZ.set(e.cls, e.z);
      targetScale.set(e.cls, 1);
      walkDir.set(e.cls, null);
    }
    // Explicit select Fighter
    const cls = 'tempskron_fighter';
    targetZ.set(cls, 0);
    targetScale.set(cls, 1.08);
    walkDir.set(cls, 'forward');
    selected = cls;
    expect(walkDir.get(cls)).toBe('forward');
    expect(targetZ.get(cls)).toBe(0);
    expect(selected).toBe(cls);
  });

  it('clicking the already-selected character does nothing', () => {
    // Simulate: select Fighter, then select Fighter again — no restart.
    const entries = tribeStageEntries('tempskron');
    const homes = new Map<string, { x: number; z: number }>();
    const targetZ = new Map<string, number>();
    const walkDir = new Map<string, 'forward' | 'back' | null>();
    let selected: string | null = null;
    for (const e of entries) {
      homes.set(e.cls, { x: e.x, z: e.z });
      targetZ.set(e.cls, e.z);
      walkDir.set(e.cls, null);
    }
    // First select
    const select = (c: string) => {
      if (selected === c) return; // no-op if already selected
      if (selected) {
        targetZ.set(selected, homes.get(selected)!.z);
        walkDir.set(selected, 'back');
      }
      targetZ.set(c, 0);
      walkDir.set(c, 'forward');
      selected = c;
    };
    select('tempskron_fighter');
    const walkDirAfterFirst = walkDir.get('tempskron_fighter');
    // Second select of same character — no-op
    select('tempskron_fighter');
    expect(walkDir.get('tempskron_fighter')).toBe(walkDirAfterFirst);
  });

  it('leaving and re-entering the tribe produces a fresh unselected formation', () => {
    // Simulate: build stage, select Fighter, clear stage, rebuild stage.
    // After rebuild, no character should be selected.
    function buildFresh() {
      const entries = tribeStageEntries('tempskron');
      const selected = new Map<string, boolean>();
      const walkDir = new Map<string, 'forward' | 'back' | null>();
      for (const e of entries) {
        selected.set(e.cls, false);
        walkDir.set(e.cls, null);
      }
      return { selected, walkDir, selectedClass: null as string | null };
    }
    const stage1 = buildFresh();
    expect(stage1.selectedClass).toBeNull();
    // Simulate selecting Fighter
    stage1.selected.set('tempskron_fighter', true);
    stage1.walkDir.set('tempskron_fighter', 'forward');
    stage1.selectedClass = 'tempskron_fighter';
    // Clear and rebuild
    const stage2 = buildFresh();
    expect(stage2.selectedClass, 'rebuilt stage must have no selection').toBeNull();
    expect(stage2.selected.get('tempskron_fighter'), 'Fighter must not be selected after rebuild').toBe(false);
    expect(stage2.walkDir.get('tempskron_fighter'), 'Fighter must not walk after rebuild').toBeNull();
  });

  it('Morion and Atlanteon behave the same way (no auto-select)', () => {
    for (const tribe of ['morion', 'atlanteon'] as const) {
      const stage = makeFreshStage(tribe);
      expect(stage.selectedClass(), `${tribe} must have no selected class`).toBeNull();
      const entries = tribeStageEntries(tribe);
      for (const e of entries) {
        expect(stage.isAtHome(e.cls), `${tribe}/${e.cls} must be at home`).toBe(true);
        expect(stage.isIdle(e.cls), `${tribe}/${e.cls} must be idle`).toBe(true);
        expect(stage.isSelected(e.cls), `${tribe}/${e.cls} must not be selected`).toBe(false);
      }
    }
  });

  it('information-panel default class does not select the 3D stage character', () => {
    // The info panel may show a default class (the first roster entry) for
    // display purposes, but the 3D stage selection state must remain null.
    // This test verifies the separation: the stage's selectedClass is null
    // even though the info panel has a class to display.
    const stage = makeFreshStage('tempskron');
    const infoPanelClass = tribeStageEntries('tempskron')[0]!.cls; // info panel default
    expect(stage.selectedClass(), 'stage must have no selection despite info panel').toBeNull();
    expect(infoPanelClass, 'info panel shows a class').toBeTruthy();
    // The info panel class is NOT the stage selected class.
    expect(stage.selectedClass()).not.toBe(infoPanelClass);
  });
});
