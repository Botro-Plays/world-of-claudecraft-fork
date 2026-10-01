// Pure 3-seat potion bar: which HP / MP / STM flask the player is carrying,
// and how many. DOM-free so Vitest drives empty vs filled without Hud.
// STM potions have no ItemDef field yet, so that seat stays empty until one
// exists; the bar never invents a count.

import type { InvSlot, ItemDef } from '../../../sim/types';

export type PotionKind = 'hp' | 'mp' | 'stm';

export const POTION_KINDS: readonly PotionKind[] = ['hp', 'mp', 'stm'];

export const POTION_ICON_SRC: Record<PotionKind, string> = {
  hp: '/ui/pt-hud/icon-hp-potion.png',
  mp: '/ui/pt-hud/icon-mp-potion.png',
  stm: '/ui/pt-hud/icon-stm-potion.png',
};

export type PotionLookup = (itemId: string) => ItemDef | undefined;

export interface PotionBarSlotView {
  kind: PotionKind;
  itemId: string | null;
  count: number;
  iconSrc: string;
}

export type PotionBarView = readonly [PotionBarSlotView, PotionBarSlotView, PotionBarSlotView];

type PotionDef = Pick<ItemDef, 'kind' | 'potionHp' | 'potionHpPctMax' | 'potionMana'>;

export function potionFamilyOf(def: PotionDef): PotionKind | null {
  if (def.kind !== 'potion') return null;
  if (def.potionHp != null || def.potionHpPctMax != null) return 'hp';
  if (def.potionMana != null) return 'mp';
  return null;
}

function potionRank(def: PotionDef, kind: PotionKind): number {
  switch (kind) {
    case 'hp':
      if (def.potionHpPctMax != null) return def.potionHpPctMax * 1_000_000;
      return def.potionHp ?? 0;
    case 'mp':
      return def.potionMana ?? 0;
    case 'stm':
      return 0;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

function stackCount(
  inventory: readonly Pick<InvSlot, 'itemId' | 'count'>[],
  itemId: string,
): number {
  let total = 0;
  for (const slot of inventory) {
    if (slot.itemId === itemId) total += slot.count;
  }
  return total;
}

function emptySlot(kind: PotionKind): PotionBarSlotView {
  return { kind, itemId: null, count: 0, iconSrc: POTION_ICON_SRC[kind] };
}

function pickSlot(
  inventory: readonly Pick<InvSlot, 'itemId' | 'count'>[],
  lookup: PotionLookup,
  kind: PotionKind,
): PotionBarSlotView {
  let bestId: string | null = null;
  let bestRank = -1;
  let bestCount = 0;
  for (const slot of inventory) {
    if (!slot.itemId) continue;
    const def = lookup(slot.itemId);
    if (!def || potionFamilyOf(def) !== kind) continue;
    const count = stackCount(inventory, slot.itemId);
    if (count <= 0) continue;
    const rank = potionRank(def, kind);
    if (
      rank > bestRank ||
      (rank === bestRank &&
        (count > bestCount || (count === bestCount && slot.itemId < (bestId ?? ''))))
    ) {
      bestId = slot.itemId;
      bestRank = rank;
      bestCount = count;
    }
  }
  if (!bestId) return emptySlot(kind);
  return { kind, itemId: bestId, count: bestCount, iconSrc: POTION_ICON_SRC[kind] };
}

export function potionBarView(
  inventory: readonly Pick<InvSlot, 'itemId' | 'count'>[],
  lookup: PotionLookup,
): PotionBarView {
  return [
    pickSlot(inventory, lookup, 'hp'),
    pickSlot(inventory, lookup, 'mp'),
    pickSlot(inventory, lookup, 'stm'),
  ];
}

export function potionBarSignature(view: PotionBarView): string {
  return view.map((slot) => `${slot.kind}:${slot.itemId ?? ''}:${slot.count}`).join('|');
}
