/**
 * Priston Tale starting stats from the MagicPT-Chinese source.
 *
 * The authoritative source for each PT class's starting stats is the
 * `TempNewCharacterInit` and `MorNewCharacterInit` tables in
 * PT-Source/HoBaram/HoLogin.cpp. The columns are:
 *
 *   JobCode, Strength, Spirit, Talent, Defence, Health
 *
 * The code field that receives column 4 is `sinChar->Dexterity`, so the
 * stat is displayed as "Dexterity" (DEX) in the character-select panel.
 *
 * These values are the raw PT stats, NOT the WoC-mapped attributes (str/agi/
 * sta/int/spi/armor). They exist so the character-select information panel
 * can show the authentic PT identity alongside the WoC gameplay stats.
 */

import type { PlayerClass } from '../types';

/** The five PT starting stats shown in character select. */
export interface PtStartingStats {
  /** Strength — melee power. */
  readonly str: number;
  /** Spirit — mana pool and regen. */
  readonly spi: number;
  /** Talent — technique / move speed. */
  readonly tal: number;
  /** Dexterity — dodge / defence (PT source column header: "Defence"). */
  readonly dex: number;
  /** Health — HP pool. */
  readonly hp: number;
}

/**
 * MagicPT-Chinese source starting stats for every implemented PT class.
 *
 * Tempskron classes come from `TempNewCharacterInit` (HoLogin.cpp:88-97).
 * Morion classes come from `MorNewCharacterInit` (HoLogin.cpp:99-108).
 * Atlanteon classes are reassigned from their original tribe in the Botro
 * fork; their stats still come from the original MagicPT table.
 */
export const PT_STARTING_STATS: Readonly<Partial<Record<PlayerClass, PtStartingStats>>> = {
  // Tempskron (TempNewCharacterInit)
  tempskron_fighter: { str: 28, spi: 6, tal: 21, dex: 17, hp: 27 },
  tempskron_mechanician: { str: 24, spi: 8, tal: 25, dex: 18, hp: 24 },
  tempskron_pikeman: { str: 26, spi: 9, tal: 20, dex: 19, hp: 25 },
  tempskron_archer: { str: 17, spi: 11, tal: 21, dex: 27, hp: 23 },
  // Morion (MorNewCharacterInit)
  morion_knight: { str: 26, spi: 13, tal: 17, dex: 19, hp: 24 },
  morion_atalanta: { str: 23, spi: 15, tal: 19, dex: 19, hp: 23 },
  morion_priestess: { str: 15, spi: 28, tal: 21, dex: 15, hp: 20 },
  morion_magician: { str: 16, spi: 29, tal: 19, dex: 14, hp: 21 },
  // Atlanteon (reassigned; stats from original MagicPT tables)
  atlanteon_assassin: { str: 25, spi: 10, tal: 22, dex: 20, hp: 22 },
  atlanteon_shaman: { str: 15, spi: 27, tal: 20, dex: 15, hp: 22 },
  atlanteon_martial_artist: { str: 26, spi: 9, tal: 20, dex: 20, hp: 24 },
};

/** Get the PT starting stats for a class, or null if the class is not a PT class. */
export function ptStartingStatsFor(cls: PlayerClass): PtStartingStats | null {
  return PT_STARTING_STATS[cls] ?? null;
}

/** True if the class has PT starting stats (i.e. is a PT class). */
export function hasPtStartingStats(cls: PlayerClass): boolean {
  return cls in PT_STARTING_STATS;
}
