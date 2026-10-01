import { describe, expect, it } from 'vitest';
import type { ItemDef } from '../src/sim/types';
import {
  POTION_ICON_SRC,
  potionBarSignature,
  potionBarView,
  potionFamilyOf,
} from '../src/ui/hud/vitals/potion_bar_core';

function potion(partial: Partial<ItemDef> & Pick<ItemDef, 'id' | 'kind'>): ItemDef {
  return {
    name: partial.id,
    sellValue: 1,
    ...partial,
  } as ItemDef;
}

const DEFS: Record<string, ItemDef> = {
  minor_heal: potion({ id: 'minor_heal', kind: 'potion', potionHp: 110 }),
  greater_heal: potion({ id: 'greater_heal', kind: 'potion', potionHp: 279 }),
  soul: potion({ id: 'soul', kind: 'potion', potionHpPctMax: 0.25 }),
  minor_mana: potion({ id: 'minor_mana', kind: 'potion', potionMana: 145 }),
  greater_mana: potion({ id: 'greater_mana', kind: 'potion', potionMana: 354 }),
  bread: potion({ id: 'bread', kind: 'food', foodHp: 50 }),
};

const lookup = (id: string): ItemDef | undefined => DEFS[id];

describe('potionFamilyOf', () => {
  it('classifies healing and mana potions and ignores food', () => {
    expect(potionFamilyOf(DEFS.minor_heal)).toBe('hp');
    expect(potionFamilyOf(DEFS.soul)).toBe('hp');
    expect(potionFamilyOf(DEFS.minor_mana)).toBe('mp');
    expect(potionFamilyOf(DEFS.bread)).toBeNull();
  });
});

describe('potionBarView', () => {
  it('leaves every seat empty when the bag has no potions', () => {
    const view = potionBarView([{ itemId: 'bread', count: 4 }], lookup);
    expect(view.map((s) => s.itemId)).toEqual([null, null, null]);
    expect(view.map((s) => s.count)).toEqual([0, 0, 0]);
    expect(view[0].iconSrc).toBe(POTION_ICON_SRC.hp);
    expect(view[2].kind).toBe('stm');
  });

  it('fills HP and MP from real stack counts and keeps STM empty', () => {
    const view = potionBarView(
      [
        { itemId: 'minor_heal', count: 8 },
        { itemId: 'minor_heal', count: 4 },
        { itemId: 'minor_mana', count: 3 },
      ],
      lookup,
    );
    expect(view[0]).toMatchObject({ itemId: 'minor_heal', count: 12 });
    expect(view[1]).toMatchObject({ itemId: 'minor_mana', count: 3 });
    expect(view[2]).toMatchObject({ itemId: null, count: 0 });
  });

  it('seats the strongest carried flask of each family, not a fake count', () => {
    const view = potionBarView(
      [
        { itemId: 'minor_heal', count: 20 },
        { itemId: 'greater_heal', count: 2 },
        { itemId: 'minor_mana', count: 9 },
        { itemId: 'greater_mana', count: 1 },
      ],
      lookup,
    );
    expect(view[0]).toMatchObject({ itemId: 'greater_heal', count: 2 });
    expect(view[1]).toMatchObject({ itemId: 'greater_mana', count: 1 });
  });

  it('prefers a percent heal over a weaker flat flask', () => {
    const view = potionBarView(
      [
        { itemId: 'greater_heal', count: 5 },
        { itemId: 'soul', count: 1 },
      ],
      lookup,
    );
    expect(view[0]).toMatchObject({ itemId: 'soul', count: 1 });
  });

  it('changes signature when a stack moves', () => {
    const a = potionBarView([{ itemId: 'minor_heal', count: 1 }], lookup);
    const b = potionBarView([{ itemId: 'minor_heal', count: 2 }], lookup);
    expect(potionBarSignature(a)).not.toBe(potionBarSignature(b));
  });
});
