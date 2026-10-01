// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDef } from '../src/sim/types';
import { POTION_ICON_SRC, type PotionKind } from '../src/ui/hud/vitals/potion_bar_core';
import { PotionBarPainter, type PotionBarSlotEls } from '../src/ui/hud/vitals/potion_bar_painter';
import { makeWriterFacet } from '../src/ui/painter_host';

function potion(partial: Partial<ItemDef> & Pick<ItemDef, 'id' | 'kind'>): ItemDef {
  return {
    name: partial.id,
    sellValue: 1,
    ...partial,
  } as ItemDef;
}

const DEFS: Record<string, ItemDef> = {
  heal: potion({ id: 'heal', kind: 'potion', potionHp: 110 }),
  mana: potion({ id: 'mana', kind: 'potion', potionMana: 145 }),
};

function writers() {
  return makeWriterFacet(
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    () => undefined,
    () => undefined,
  );
}

function mintSlot(kind: PotionKind): PotionBarSlotEls {
  const btn = document.createElement('button');
  btn.id = `pt-potion-${kind}`;
  const icon = document.createElement('img');
  const count = document.createElement('span');
  count.className = 'pt-potion-count';
  btn.append(icon, count);
  document.body.append(btn);
  return { btn, icon, count };
}

describe('PotionBarPainter', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('shows the PT flask and real count only while that potion is carried', () => {
    const slots = {
      hp: mintSlot('hp'),
      mp: mintSlot('mp'),
      stm: mintSlot('stm'),
    };
    const painter = new PotionBarPainter(
      writers(),
      slots,
      (id) => DEFS[id],
      (n) => String(n),
      () => undefined,
    );
    painter.paint([]);
    expect(slots.hp.btn.classList.contains('filled')).toBe(false);
    expect(slots.hp.icon.getAttribute('src')).toBeNull();
    expect(slots.hp.count.textContent).toBe('');

    painter.paint([
      { itemId: 'heal', count: 7 },
      { itemId: 'mana', count: 2 },
    ]);
    expect(slots.hp.btn.classList.contains('filled')).toBe(true);
    expect(slots.hp.icon.getAttribute('src')).toBe(POTION_ICON_SRC.hp);
    expect(slots.hp.count.textContent).toBe('7');
    expect(slots.mp.icon.getAttribute('src')).toBe(POTION_ICON_SRC.mp);
    expect(slots.stm.btn.classList.contains('filled')).toBe(false);
    expect(slots.stm.count.textContent).toBe('');
  });

  it('uses a filled seat and ignores a click on an empty one', () => {
    const used: string[] = [];
    const slots = {
      hp: mintSlot('hp'),
      mp: mintSlot('mp'),
      stm: mintSlot('stm'),
    };
    const painter = new PotionBarPainter(
      writers(),
      slots,
      (id) => DEFS[id],
      (n) => String(n),
      (id) => {
        used.push(id);
      },
    );
    painter.paint([{ itemId: 'heal', count: 1 }]);
    slots.hp.btn.click();
    slots.mp.btn.click();
    slots.stm.btn.click();
    expect(used).toEqual(['heal']);
  });

  it('does not fake a count when the lookup cannot resolve the item', () => {
    const slots = {
      hp: mintSlot('hp'),
      mp: mintSlot('mp'),
      stm: mintSlot('stm'),
    };
    const painter = new PotionBarPainter(
      writers(),
      slots,
      () => undefined,
      () => '99',
      vi.fn(),
    );
    painter.paint([{ itemId: 'heal', count: 12 }]);
    expect(slots.hp.btn.classList.contains('filled')).toBe(false);
    expect(slots.hp.count.textContent).toBe('');
  });
});
