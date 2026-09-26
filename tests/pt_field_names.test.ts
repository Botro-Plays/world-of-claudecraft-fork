// PT field display-name registry: every generated map package resolves to
// an authentic player-facing name while the technical id stays the
// authoritative identifier (manifests, URLs, gates, saves).
//
// Name provenance is documented per entry in src/sim/content/pt_field_names.ts
// (source doc labels, the official teleport-table destination order, and
// warp-gate topology; fields with no canonical English name keep their
// source-authored zh name).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ptMapLinksGraph } from '../src/game/pt_map_links';
import { getPtFieldDisplayName, PT_FIELD_DISPLAY_NAMES } from '../src/sim/content/pt_field_names';

const PT_MAPS_DIR = join(__dirname, '..', 'generated', 'pt-maps');

describe('PT_FIELD_DISPLAY_NAMES', () => {
  it('covers every registered field from the source maplinks graph', () => {
    const g = ptMapLinksGraph();
    if (!g)
      throw new Error('maplinks.json missing - run `node scripts/pt-port/pt_map.mjs maplinks`');
    for (const f of g.fields) {
      expect(f.id, `fieldIndex ${f.fieldIndex} has no id`).toBeTruthy();
      const name = PT_FIELD_DISPLAY_NAMES[f.id ?? ''];
      expect(name, `${f.id} has no display name`).toBeDefined();
      expect(name.length, `${f.id} display name is empty`).toBeGreaterThan(0);
    }
  });

  it('covers every generated map package directory, ids unchanged', () => {
    const dirs = readdirSync(PT_MAPS_DIR).filter((d) => {
      try {
        readFileSync(join(PT_MAPS_DIR, d, 'manifest.json'));
        return true;
      } catch {
        return false;
      }
    });
    for (const dir of dirs) {
      const manifest = JSON.parse(readFileSync(join(PT_MAPS_DIR, dir, 'manifest.json'), 'utf8'));
      const id = manifest.manifest?.id ?? manifest.id;
      // The package id IS the directory name and stays the identifier;
      // the registry never renames it, only labels it.
      expect(id).toBe(dir);
      expect(PT_FIELD_DISPLAY_NAMES[dir], `package ${dir} has no display name`).toBeDefined();
    }
  });

  it('resolves the verified core mappings', () => {
    const expected: Record<string, string> = {
      'fore-1': 'Garden of Freedom',
      'fore-2': 'Bamboo Forest',
      'fore-3': 'Acacia Forest',
      ricarten: 'Ricarten',
      pilai: 'Pillai',
      'ruin-2': 'Ruinen Village',
      'village-1': 'Navisko Town',
      'forever-fall-01': 'Road of the Wind',
      'forever-fall-03': 'Land of Dusk',
      'de-4': 'Forbidden Land',
      'ice-ura': 'Eura Village',
      boss: 'Kelvezu Cave',
      castle: 'Bless Castle',
      town1: 'Atlantis Town',
    };
    for (const [id, name] of Object.entries(expected)) {
      expect(getPtFieldDisplayName(id), id).toBe(name);
    }
  });

  it('keeps the source-authored zh name where no canonical English name exists', () => {
    // These late MagicPT fields have no official English name anywhere;
    // the registry must not invent one, so the authored zh name is shown.
    expect(getPtFieldDisplayName('landofnurwn')).toBe('永霜圣殿');
    expect(getPtFieldDisplayName('sanc1')).toBe('远古神殿一层');
  });

  it('falls back to the technical id for fields outside the map set', () => {
    expect(getPtFieldDisplayName('not-a-real-field')).toBe('not-a-real-field');
    expect(getPtFieldDisplayName('')).toBe('');
  });
});
