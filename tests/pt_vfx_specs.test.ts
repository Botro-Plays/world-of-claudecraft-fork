// PT per-skill VFX spec contract (generated/pt-maps/pt_vfx_specs.generated.ts
// by scripts/pt-port/build_pt_vfx_specs.ts).
//
// The catalog transform left every pt_* ability without a registered spec, so
// the painter refused the event and the renderer's generic school comet drew
// every PT cast identically. These tests pin the generated table's coverage
// (every non-passive pt_* skill owns a spec), its shape (the compact
// AbilityVfxSpec vocabulary the painter plans from), and its registration
// through the abilityVfxSpecFor seam.

import { describe, expect, it } from 'vitest';
import { PT_VFX_SPECS } from '../generated/pt-maps/pt_vfx_specs.generated';
import { PT_SKILL_CATALOG } from '../generated/pt-maps/pt_skill_catalog.generated';
import { PT_ABILITIES } from '../src/sim/content/pt_abilities';
import { abilityVfxSpecFor } from '../src/render/ability_vfx/encounter_specs';
import type { AbilityVfxSpec } from '../src/render/ability_vfx_core';

// The palettes SCHOOL_BY_PALETTE knows in the painter plus the gallery's
// archetype vocabulary - a generated value outside these sets would either
// mistint the pooled light or silently lose its archetype arm.
const VALID_PALETTES = new Set([
  'fire', 'blood', 'frost', 'storm', 'arcane', 'moon',
  'shadow', 'venom', 'nature', 'gold', 'holy', 'physical',
]);
const VALID_ARCHETYPES = new Set([
  'bolt', 'burst', 'strike', 'nova', 'beam', 'dot',
  'heal', 'buff', 'shout', 'summon', 'cc', 'dash',
]);

interface CatalogRow {
  id: string;
  hand: string;
}
const CATALOG = PT_SKILL_CATALOG as unknown as Record<string, CatalogRow>;
// `as const` key-literal map indexed by skill id.
const SPECS = PT_VFX_SPECS as unknown as Record<string, AbilityVfxSpec>;

describe('PT skill VFX specs', () => {
  it('covers every non-passive PT skill and only those', () => {
    for (const row of Object.values(CATALOG)) {
      if (row.hand === 'passive') {
        expect(SPECS[row.id], `passive ${row.id} must not claim VFX`).toBeUndefined();
      } else {
        expect(SPECS[row.id], `active ${row.id} must own a spec`).toBeDefined();
      }
    }
    // No strays: every generated key is a real catalog skill.
    for (const id of Object.keys(PT_VFX_SPECS)) {
      expect(CATALOG[id], `spec for unknown skill ${id}`).toBeDefined();
    }
  });

  it('uses only the compact spec vocabulary the painter plans', () => {
    for (const [id, s] of Object.entries(SPECS)) {
      expect(s.c, `${id} color`).toMatch(/^#[0-9a-f]{6}$/i);
      if (s.p !== undefined) expect(VALID_PALETTES, `${id} palette`).toContain(s.p);
      if (s.a !== undefined) expect(VALID_ARCHETYPES, `${id} archetype`).toContain(s.a);
      for (const k of ['pw', 'sp', 'rg', 'vr', 'db', 'sm', 'bl', 'li', 'lg', 'wu', 'spin', 'fin'] as const) {
        if (s[k] !== undefined) expect(typeof s[k], `${id}.${k}`).toBe('number');
      }
    }
  });

  it('resolves through the painter seam so specs actually claim events', () => {
    for (const row of Object.values(CATALOG)) {
      if (row.hand === 'passive') continue;
      expect(
        abilityVfxSpecFor(row.id),
        `abilityVfxSpecFor(${row.id})`,
      ).toBeDefined();
    }
  });

  it('keeps iconic reads distinct (element + delivery)', () => {
    const p = (id: string) => SPECS[id];
    expect(p('pt_chain_lightning').p).toBe('storm');
    expect(p('pt_fire_ball').p).toBe('fire');
    expect(p('pt_dark_bolt').p).toBe('shadow');
    expect(p('pt_healing').a).toBe('heal');
    expect(p('pt_metal_golem').a).toBe('summon');
    // Enemy-targeted debuffs are a contact/claim read, not a caster buff.
    expect(p('pt_curse_lazy').a).not.toBe('buff');
    // Melee whitelisted strikes keep the strike arm, caster bolts the bolt arm.
    expect(p('pt_triple_impact').a).toBe('strike');
  });
});
