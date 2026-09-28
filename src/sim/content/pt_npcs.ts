// PT fixed-NPC definitions, adapted from the generated catalog
// (generated/pt-maps/pt_npc_catalog.generated.ts, emitted by
// scripts/pt-port/pt_npcs.mjs from MagicPT-Chinese server/GameServer/npc/*.npc
// + the Field/<map>.ase.spc placement tables).
//
// Every entry is `dynamic`: fixed NPCs belong to a PT field, not the WoC
// surface, so the Sim ctor's surface-placement loop skips them and
// src/sim/pt_npcs.ts spawns each field's set when its PtFieldSession goes
// active (the O4 population ownership pattern).
//
// Field mapping notes (verified against PT-Source/fileread.cpp smCharDecode
// and SrcServer/OnSever.cpp OpenNpc):
//   - *名字 is the display name; it overrides the .spc record's szName
//     (smMonsterInfo.szName -> smCharInfo.szName in OpenNpc). zh strings are
//     kept verbatim (same convention as pt_mobs.ts).
//   - *对话 lines become the NPC's greeting (the source builds an lpNpcMessage
//     list; WoC renders one greeting, so the lines join with '\n').
//   - *武器出售 / *防具出售 / *物品出售 hold LastCategory item codes. The
//     source shows three separate shop tabs; WoC has one vendor grid, so the
//     compatibility union is attack-then-defence-then-etc order, deduplicated.
//   - *物品保管 (WareHouseMaster) maps to the banker flag: PT warehouse and
//     WoC bank are the same personal-storage service.
//   - Other service flags (skillMaster, teleport, crafting masters, events)
//     are preserved in the catalog but intentionally unmapped — they name PT
//     systems WoC does not implement, and an unmapped flag is honest data.
//   - pos/facing/color are placeholders: real placement comes from the
//     generated per-field npcs.generated.ts records at spawn time.
//
// Names stay in the source's own zh strings (see pt_mobs.ts header).

import { PT_ITEM_CATALOG } from '../../../generated/pt-maps/pt_item_catalog.generated';
import { PT_NPC_CATALOG } from '../../../generated/pt-maps/pt_npc_catalog.generated';
import type { NpcDef } from '../types';
import { ptItemId } from './pt_items';

// Shape of one generated .npc catalog entry (the emitter pins this).
export interface PtNpcCatalogDef {
  file: string;
  name: string | null;
  modelFile: string | null;
  /** Resolved model stem (*外型文件 over .spc szModelName). */
  model: string | null;
  /** Public-relative GLB URL for the resolved model, or null when the
   *  converted asset is absent (npc_villager fallback; logged in npcs.json). */
  glb: string | null;
  /** Measured GLB bind-pose Y extent in PT units. */
  height: number | null;
  dialog: string[];
  level: number | null;
  moveRange: number;
  openInterval: number[] | null;
  isMonster: boolean;
  sellAttack: string[];
  sellDefence: string[];
  sellEtc: string[];
  flags: string[];
}

export const PT_NPC_DEFS = PT_NPC_CATALOG as unknown as Record<string, PtNpcCatalogDef>;
const ITEM_CODES = PT_ITEM_CATALOG as unknown as Record<string, unknown>;

export const PT_NPC_ID_PREFIX = 'pt_npc_';

/** The NpcDef/template id for a generated .npc def key. */
export function ptNpcTemplateId(defKey: string): string {
  return `${PT_NPC_ID_PREFIX}${defKey}`;
}

// NpcDef.title is a required non-empty string (the i18n manifest enumerates a
// title key per NPC and rejects empty sources). MagicPT carries no title
// field, so this is a compatibility label derived from the NPC's own service
// flags - not source data. English on purpose: it is the en fill, and a
// pending zh_TW row renders it unchanged (a zh source would leak Simplified
// glyphs into the Traditional locale's unconditional check).
function ptNpcTitle(def: PtNpcCatalogDef): string {
  if (def.flags.includes('warehouse')) return 'Warehouse Keeper';
  if (def.sellAttack.length || def.sellDefence.length || def.sellEtc.length) return 'Merchant';
  if (def.flags.includes('skillMaster')) return 'Skill Master';
  if (def.flags.includes('teleport')) return 'Teleporter';
  if (def.flags.includes('clanMaster')) return 'Clan Master';
  if (def.flags.includes('event') || def.flags.includes('questEvent')) return 'Event Guide';
  return 'Villager';
}

export const PT_NPCS: Record<string, NpcDef> = {};

for (const [key, def] of Object.entries(PT_NPC_DEFS)) {
  const vendorItems: string[] = [];
  for (const list of [def.sellAttack, def.sellDefence, def.sellEtc]) {
    for (const code of list) {
      // Codes that never resolved in OpenItem are dropped here (they'd dead-end
      // in the vendor grid); the catalog keeps them for provenance.
      if (ITEM_CODES[code]) vendorItems.push(ptItemId(code));
    }
  }
  PT_NPCS[ptNpcTemplateId(key)] = {
    id: ptNpcTemplateId(key),
    name: def.name ?? key,
    title: ptNpcTitle(def),
    pos: { x: 0, z: 0 },
    facing: 0,
    color: 0x9a8c7a,
    questIds: [],
    greeting: def.dialog.join('\n'),
    dynamic: true,
    ...(vendorItems.length ? { vendorItems: [...new Set(vendorItems)] } : {}),
    ...(def.flags.includes('warehouse') ? { banker: true as const } : {}),
  };
}
