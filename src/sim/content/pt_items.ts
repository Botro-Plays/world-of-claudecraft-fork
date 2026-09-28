// PT item definitions, adapted from the generated OpenItem catalog
// (generated/pt-maps/pt_item_catalog.generated.ts, emitted by
// scripts/pt-port/pt_npcs.mjs from MagicPT-Chinese
// server/GameServer/OpenItem/<CODE>.txt). One ItemDef per source item,
// keyed pt_<lowercased code>; the original LastCategory string stays on
// `code` in the catalog for provenance.
//
// Field mapping notes (verified against PT-Source/fileread.cpp and the
// server's shop handlers in SrcServer/OnSever.cpp):
//   - *价格 is the vendor sale price and maps to buyValue directly. PT prices
//     are already in the game's lowest coin unit, so no currency rescale is
//     applied; sellValue is price/4, the source's standard buyback rate.
//   - *生命提高 / *魔法提高 / *耐力提高 are [min,max] restore ranges on
//     potion-use items. WoC potions take a flat amount, so the midpoint
//     (rounded) is the compatibility value; the range stays in the catalog.
//     Stamina restores have no WoC equivalent and are recorded but unmapped.
//   - *等级 lands on requiredLevel. Equipment stats (attack/defense/elemental
//     values, class locks, durability) are preserved in the catalog files but
//     deliberately NOT mapped: WoC's equipment model has no 1:1 targets, so
//     non-consumable PT items register as 'junk' — they resolve, stack, and
//     trade/vend correctly, they just don't equip yet (a Phase F+ mapping).
//   - *连接文件 drop-model references stay in the source layer; the converted
//     DropItem GLBs are a later world-drop phase, not placement data.
//
// Names keep the source zh strings (same convention as pt_mobs.ts: the sim
// layer is language-agnostic and display localization is a later phase).

import { PT_ITEM_CATALOG } from '../../../generated/pt-maps/pt_item_catalog.generated';
import type { ItemDef } from '../types';

// Shape of one generated catalog entry (the emitter pins this; the literal
// table widens per-field so consumers bind the explicit type here).
export interface PtItemCatalogEntry {
  code: string;
  name: string | null;
  price: number | null;
  weight: number | null;
  level: number | null;
  hp: number[] | null;
  mp: number[] | null;
  stamina: number[] | null;
}

const CATALOG = PT_ITEM_CATALOG as unknown as Record<string, PtItemCatalogEntry>;

export const PT_ITEM_ID_PREFIX = 'pt_';

/** The WoC item id for a PT LastCategory code (the .npc shop-list token). */
export function ptItemId(code: string): string {
  return `${PT_ITEM_ID_PREFIX}${code.toLowerCase()}`;
}

export const PT_ITEMS: Record<string, ItemDef> = {};

for (const rec of Object.values(CATALOG)) {
  const def: ItemDef =
    rec.hp || rec.mp || rec.stamina
      ? {
          id: ptItemId(rec.code),
          name: rec.name ?? rec.code,
          kind: 'potion',
          quality: 'common',
          sellValue: Math.max(1, Math.floor((rec.price ?? 0) / 4)),
          buyValue: rec.price ?? undefined,
          ...(rec.hp ? { potionHp: Math.round((rec.hp[0] + (rec.hp[1] ?? rec.hp[0])) / 2) } : {}),
          ...(rec.mp ? { potionMana: Math.round((rec.mp[0] + (rec.mp[1] ?? rec.mp[0])) / 2) } : {}),
          ...(rec.level ? { requiredLevel: rec.level } : {}),
        }
      : {
          id: ptItemId(rec.code),
          name: rec.name ?? rec.code,
          kind: 'junk',
          quality: 'common',
          sellValue: Math.max(1, Math.floor((rec.price ?? 0) / 4)),
          buyValue: rec.price ?? undefined,
          ...(rec.level ? { requiredLevel: rec.level } : {}),
        };
  PT_ITEMS[def.id] = def;
}
