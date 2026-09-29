// PT item definitions, adapted from the generated canonical OpenItem catalog
// (generated/pt-maps/pt_item_catalog.generated.ts, emitted by
// scripts/pt-port/pt_npcs.mjs -> lib/pt_items.mjs from MagicPT-Chinese
// server/GameServer/OpenItem/<FILE>.txt joined with sinItem.cpp sItem[]).
// One ItemDef per source record, keyed pt_<lowercased key>; the original
// LastCategory string stays on `code` for provenance.
//
// Canonical-layer notes:
//   - PT_ITEM_CATALOG is keyed by the *代码 LastCategory code (the join key
//     NPC shop lists and monster drop tables resolve against). Conflicting
//     duplicate files and QW* quest-weapon variants that share a code live in
//     PT_ITEM_VARIANTS keyed by file stem; both emit ItemDefs here so
//     pt_qwa108-class ids resolve.
//   - The catalog `kind` is the source-derived family classification
//     (weapon/armor/accessory/consumable/quest/...). Runtime mapping is
//     deliberately narrower: only restore-bearing items become 'potion',
//     quest-flagged items become 'quest' (which also enforces the source's
//     NotSell rule through junkSellableSlot), everything else stays 'junk'
//     until the equipment/consumable phases map real behavior.
//   - *价格 maps to buyValue; sellValue is price/4 (source buyback rate).
//     *生命/魔法/耐力提高 are [min,max] restore ranges; WoC potions take a
//     flat amount so the midpoint (rounded) is the compatibility value.
//     Stamina restores have no WoC equivalent - catalog-only.
//   - `name` (ItemDef) is the canonical English player-facing name
//     (nameEnSource: 'sitem' authentic, 'file'/*'source' passthrough,
//     'translated' authored). The source-language name stays in the catalog
//     `name` field for provenance; zh overlays re-apply it via i18n.
//
// Not mapped yet (later phases): equipment slots/stats, durability gameplay,
// spec/class affinity enforcement, SP restore/bonus effects, drop-model
// rendering, monster drop-table execution, starter kits, quests, crafting.

import {
  PT_ITEM_CATALOG,
  PT_ITEM_VARIANTS,
} from '../../../generated/pt-maps/pt_item_catalog.generated';
import type { ItemDef } from '../types';

// Shape of one generated catalog record (the emitter pins this; the literal
// table widens per-field so consumers bind the explicit type here). Only the
// fields this module consumes plus the canonical surface tests rely on are
// typed; the emitted records carry more (see lib/pt_items.mjs shapeRecord).
export interface PtItemCatalogEntry {
  code: string;
  name: string | null;
  nameEn: string;
  nameEnSource: 'sitem' | 'file' | 'translated' | 'source';
  family: string;
  kind: string;
  price: number | null;
  weight: number | null;
  level: number | null;
  durability: number[] | null;
  restore: { hp: number[] | null; mp: number[] | null; sp: number[] | null } | null;
  requirements: { level?: number | null } | null;
  source: { file: string; duplicates?: string[]; variants?: string[] };
  variantOf?: string;
}

const CATALOG = PT_ITEM_CATALOG as unknown as Record<string, PtItemCatalogEntry>;
const VARIANTS = PT_ITEM_VARIANTS as unknown as Record<string, PtItemCatalogEntry>;

export const PT_ITEM_ID_PREFIX = 'pt_';

/** The WoC item id for a PT catalog key (a *代码 code, or a variant file stem
 *  for records in PT_ITEM_VARIANTS such as QWA108). */
export function ptItemId(code: string): string {
  return `${PT_ITEM_ID_PREFIX}${code.toLowerCase()}`;
}

const midpoint = (range: number[] | null): number | undefined =>
  range ? Math.round((range[0] + (range[1] ?? range[0])) / 2) : undefined;

function toItemDef(key: string, rec: PtItemCatalogEntry): ItemDef {
  const level = rec.level ?? rec.requirements?.level ?? null;
  const base = {
    id: ptItemId(key),
    name: rec.nameEn,
    quality: 'common' as const,
    sellValue: Math.max(1, Math.floor((rec.price ?? 0) / 4)),
    buyValue: rec.price ?? undefined,
    ...(level ? { requiredLevel: level } : {}),
  };
  if (rec.restore?.hp || rec.restore?.mp || rec.restore?.sp) {
    return {
      ...base,
      kind: 'potion',
      ...(rec.restore.hp ? { potionHp: midpoint(rec.restore.hp) } : {}),
      ...(rec.restore.mp ? { potionMana: midpoint(rec.restore.mp) } : {}),
    };
  }
  // Source NotSell (QT107/QT108, ITEM_KIND_QUEST_WEAPON): 'quest' kind keeps
  // these out of the junk-sell path until the quest phase owns them.
  if (rec.kind === 'quest' || rec.kind === 'questWeapon') {
    return { ...base, kind: 'quest' };
  }
  return { ...base, kind: 'junk' };
}

export const PT_ITEMS: Record<string, ItemDef> = {};

for (const [key, rec] of Object.entries(CATALOG)) {
  PT_ITEMS[ptItemId(key)] = toItemDef(key, rec);
}
for (const [stem, rec] of Object.entries(VARIANTS)) {
  PT_ITEMS[ptItemId(stem)] = toItemDef(stem, rec);
}
