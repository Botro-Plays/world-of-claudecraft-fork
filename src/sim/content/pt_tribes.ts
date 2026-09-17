/**
 * Priston Tale tribe configuration.
 *
 * Authoritative source for the three PT tribes and their class rosters.
 * Classes not yet implemented as PlayerClass entries are still listed so
 * the full intended tribe structure is visible in the UI. Each tribe keeps
 * a separate `implementedClassIds` list to drive the selectable / locked
 * distinction without touching the PlayerClass union.
 *
 * Atlanteon intentionally has 3 classes. No fourth class or placeholder.
 */

export type PtTribeId = 'tempskron' | 'morion' | 'atlanteon';

export interface PtTribeDef {
  readonly id: PtTribeId;
  readonly name: string;
  /** All intended class IDs (implemented + coming soon). */
  readonly classIds: readonly string[];
  /** Subset of classIds that have a full PlayerClass + visual implementation. */
  readonly implementedClassIds: readonly string[];
  /**
   * Logo image path under public/, relative to the site root.
   * Null means no own logo yet; use placeholderLogoFromTribe instead.
   * Replace with the real path when the asset is available.
   */
  readonly logoPath: string | null;
  /**
   * Tribe ID whose logo is temporarily reused when logoPath is null.
   * Set to null when this tribe has its own logo.
   */
  readonly placeholderLogoFromTribe: PtTribeId | null;
}

/** Display names for all PT class IDs used in the tribe roster UI. */
export const PT_CLASS_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  tempskron_fighter: 'Fighter',
  tempskron_mechanician: 'Mechanician',
  tempskron_pikeman: 'Pikeman',
  tempskron_archer: 'Archer',
  morion_knight: 'Knight',
  morion_atalanta: 'Atalanta',
  morion_magician: 'Magician',
  morion_priestess: 'Priestess',
  atlanteon_assassin: 'Assassin',
  atlanteon_shaman: 'Shaman',
  atlanteon_martial_artist: 'Martial Artist',
};

/** The three Priston Tale tribes and their intended class rosters. */
export const PT_TRIBES: readonly PtTribeDef[] = [
  {
    id: 'tempskron',
    name: 'Tempskron',
    classIds: [
      'tempskron_fighter',
      'tempskron_mechanician',
      'tempskron_pikeman',
      'tempskron_archer',
    ],
    implementedClassIds: [
      'tempskron_fighter',
      'tempskron_mechanician',
      'tempskron_pikeman',
      'tempskron_archer',
    ],
    logoPath: '/ui/tribes/Tempskron.png',
    placeholderLogoFromTribe: null,
  },
  {
    id: 'morion',
    name: 'Morion',
    classIds: [
      'morion_knight',
      'morion_atalanta',
      'morion_magician',
      'morion_priestess',
    ],
    implementedClassIds: ['morion_knight', 'morion_atalanta', 'morion_priestess', 'morion_magician'],
    logoPath: '/ui/tribes/Morion.png',
    placeholderLogoFromTribe: null,
  },
  {
    id: 'atlanteon',
    name: 'Atlanteon',
    // Atlanteon intentionally has 3 classes. No fourth class or placeholder.
    classIds: [
      'atlanteon_assassin',
      'atlanteon_shaman',
      'atlanteon_martial_artist',
    ],
    implementedClassIds: ['atlanteon_assassin', 'atlanteon_shaman', 'atlanteon_martial_artist'],
    logoPath: '/ui/tribes/Atlanteon.png',
    placeholderLogoFromTribe: null,
  },
] as const;
