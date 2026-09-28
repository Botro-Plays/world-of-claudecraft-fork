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
// Names: the zh source strings stay on the catalog record (`def.name`) and in
// the zh_CN/zh_TW overlays; `NpcDef.name` carries the authored English display
// name below, which is what the en locale and every other unlocalized locale
// fall back to (the same role WoC NPC names already serve).
//
// English naming is deliberate, not machine-translated:
//   - Generic shop labels keep the town's service wording ("General Store",
//     "Warehouse Keeper", "Magic Store"), matching the derived title.
//   - Personal names transliterate the zh, cross-checked against the model
//     stems where they exist (HOSEAN->Hosean, ARAD->Arad, Marina, JIWOO,
//     Quest_ray->Raymond) and the NPC's self-introduced name in *对话
//     (salon -> Sarana).
//   - 菲尔拉 is Pillai (the Morion starting town, field `pilai`), 里查登/理查
//     is Ricarten, 内维斯克 is Navisko (village-1), 幽拉大陆 is the Eura ice
//     continent (ice-ura), and 庞贝遗迹 is the Pompeii Ruins elite map.
//   - bcn05 艾德斯 -> "Aides" (Bless Castle service NPC); npc_ninefox 普雷娅
//     -> "Preya"; sod_* elemental spirits transliterate their spirit names.

// English display names keyed by generated .npc def key (the part after
// `pt_npc_`). A def missing from this table falls back to the source zh name,
// which the coverage check flags.
const PT_NPC_EN_NAMES: Record<string, string> = {
  // ---- office / shared service NPCs (socket + misc GM-room services) ----
  '1': 'Socket Puncher Skadi', // 装备开孔小妹 - punches sockets into gear
  '2': 'Gem Inlayer Jin', // 装备镶嵌大姐 - inlays gems into sockets
  '3': 'Ricarten General Store', // 理查杂货店
  '4': 'Ricarten General Store', // 理查杂货店
  'itempost': 'Equipment Distributor', // 装备发放员 (itemGrant)
  'donation-box': 'Special Item Store', // 特殊物品商店
  'ji_woo': 'Novice Guide Jiwoo', // 新手向导, model JIWOO
  // ---- Ricarten (里查登, tempskron capital) ----
  'ricarden-equip1': 'Blacksmith Guden', // 铁匠古登
  'ricarden-equip2': 'Blacksmith Gus', // 铁匠格斯
  'ricarden-guard1': 'Ricarten Guard', // 里查登守卫
  'ricarden-guard2': 'Ricarten Guard',
  'ricarden-master': 'Skill Master', // 技能导师 (skillMaster)
  'ricarden-store': 'Ricarten General Store', // 理查杂货店
  'ricarden-warehouse': 'Warehouse Keeper', // 仓库管理员
  'ricarden-quest': 'Quest Item Dealer', // 任务物品专卖
  'ricarden-civilian1': 'Arena Teleporter', // 竞技场传送员 (death-arena ride)
  'ricarden-imbue': 'Synthesis Master', // 合成大师
  'ricarden-ser': 'Enchantment Master', // 装备附魔大师 (attributeSystem)
  'ricarden-guard': 'Equipment Smelter', // 装备熔炼师 (stove)
  'ricarden-tan': 'Wing Ascension Master', // 翅膀附魂大师 (ascension)
  'derik': 'Knight Derik', // 二级爵士德克
  'hosean': 'Hosean', // 豪森安, model HOSEAN
  'npc_ninefox': 'Preya', // 普雷娅
  'hair1': 'Mermaid Stylist Marina', // 人鱼染发师, model Marina
  'hair': 'Stone Store', // 石头商店
  'crystal': 'Monster Crystal Collector', // 收集怪物水晶任务 (questEvent)
  'puzzleking': 'Puzzle Master', // 拼图碎片任务 (questEvent)
  'qiegao-store': 'Stat Reset Store', // 属性重置商店
  'force-master': 'Force Master', // 力量大师 (forceStone)
  'babelquest': 'Item Restoration Master', // 装备恢复大师 (restore)
  'bronzwolverin': 'Copper Wolf', // 铜狼
  'goldenwolverin': 'Golden Wolf', // 金狼
  'sillverwolverin': 'Silver Wolf', // 银狼
  'wfzone': 'Teleport Inventor', // 传送点发明人 (frontierQuest)
  'eventgirl': 'Bless Island Teleporter', // 祝福岛传送员
  'salon': 'Master Craftsman Sarana', // 装备制炼大师; self-introduced 萨拉娜
  'at9': 'Premium Morion Store', // 高级魔灵族商店
  'at10': 'Premium Tempskron Store', // 高级坦普族商店
  'at11': 'Premium Armor Store', // 高级防具商店
  'at12': 'Equipment Study Master', // 装备深造大师 (deepStudy)
  'at13': 'Item Synthesis Craftsman', // 道具组合工匠 (newSynthesis)
  'reddevil-01': 'Forge Craftsman', // 装备锻造工匠
  'sod_01': 'Fire Spirit Kasha', // 火之精灵卡莎
  'sod_02': 'Water Spirit Ariel', // 水之精灵艾丽尔
  'sod_03': 'Wind Spirit Sylphy', // 风之精灵赛尔菲
  'sod_04': 'Earth Spirit Noas', // 地之精灵诺雅丝
  'sod_05': 'Secretary Karina', // 秘书卡丽纳 (clan secretary)
  'phillay-arad': 'Ore Master Arad', // 矿石合并大师, model ARAD (smelt)
  'phillay-imbue': 'Forge Craftsman', // 装备锻造工匠 (office+pilai)
  'phillay-civilian2': 'Mushroom Cave Teleporter', // 蘑菇洞穴传送大师
  'phillay-master': 'Magic Mentor', // 魔法导师 (office+pilai, skillMaster)
  // ---- Pillai (菲尔拉, Morion capital, field pilai) ----
  'phillay-store': 'General Store', // 杂货店
  'phillay-magic': 'Magic Store', // 魔法商店
  'phillay-equip1': 'Blacksmith Bartz', // 铁匠巴特兹
  'phillay-equip2': 'Blacksmith Devrian', // 铁匠德弗里安
  'phillay-warehouse': 'Warehouse Keeper', // 仓库管理员
  'phillay-guard1': 'Pillai Guard', // 菲尔拉守卫
  'phillay-guard3': 'Item Restoration Master', // 装备恢复大师
  'phillay-dragoman1': 'Pillai Guide', // 菲尔拉导游
  'phillay-civilian1': 'Grandma Molly', // 莫利奶奶
  'phillay-quest': 'Quest Item Dealer', // 任务物品专卖
  'reddevil': 'Synthesis Master', // 合成大师
  'ray': 'Royal Mage Raymond', // 皇家法师雷蒙, model Quest_ray
  // ---- Atlantis Town (town1, Atlanteon starting town; at* defs) ----
  'at1': 'Forge Craftsman', // 锻造工匠
  'at2': 'Synthesis Craftsman', // 合成工匠
  'at3': 'Strength Trainer', // 力量导师
  'at4': 'General Store', // 杂货店
  'at5': 'Weapon Merchant', // 武器店老板
  'at6': 'Warehouse Keeper', // 仓库管理员
  'at7': 'Magic Shopkeeper', // 魔法店老板娘
  'at8': 'Prison Guard', // 大牢守卫
  'town-dragoman': 'Elite Map Guard', // 精英地图守卫
  // ---- Navisko village (内维斯克, village-1) ----
  'navisko-store': 'General Store', // 杂货店
  'nevisko-magic': 'Magic Store', // 魔法商店
  'navisko-equip': 'Blacksmith Murphy', // 铁匠默菲
  'navisko-dragoman': 'Navisko Guide', // 内维斯克导游
  'navisko-civilian2': 'Villager Mino', // 居民米诺
  'desert-guard': 'Desert Guard', // 沙漠守卫
  'bastone': 'Mysterious Store', // 神秘商店
  // ---- Bless Castle (bcn*, castle) ----
  'bcn01': 'General Store', // 杂货店
  'bcn02': 'General Store',
  'bcn03': 'General Store',
  'bcn04': 'General Store',
  'bcn05': 'Aides', // 艾德斯 (blessCastle service)
  'bcn06': 'Walker', // 沃克 (warehouse)
  'blesscatle-guard': 'Bless Castle Guard', // 祝福城守卫
  // ---- Ruinen village (ruin-2) & field guards ----
  'ruiden-store': 'General Store', // 杂货店
  'ruiden-magic': 'Magic Store', // 魔法商店
  'ruiden-equip': 'Blacksmith Luga', // 铁匠鲁加
  'ruiden-civilian1': 'Wanderer Ross', // 流浪者罗斯
  'bridge-guard': 'Bridge Guard', // 大桥守卫 (ruin-3)
  'dungeon-keeper': 'Dungeon Guard', // 地牢守卫 (ruin-1)
  'templer': 'Temple Mage', // 殿堂法师 (de-3)
  'sanc-guard': 'Fire Dragon Cave Guard', // 火龙洞穴守卫 (ice2)
  'mn-013': 'Bless Teleporter', // 祝福传送员 (fore-2, battlefield ride)
  'mrcave-keeper': 'Cave Guard', // 洞穴守卫 (forever-fall-03)
  'tmcave-keeper': 'Cave Guard', // 洞穴守卫 (fore-3, bee cave)
  'flypitcher-store': 'General Store', // 杂货店 (forever-fall-03)
  'acasia-store': 'General Store', // 杂货店 (fore-3/boss)
  'coward': 'Wandering Merchant', // 流浪商人 (dun-6)
  'fury': 'Lion-Faced Demon King', // 狮面魔王 (dun-5)
  'fo-keeper01': 'Ancient Forest Guard', // 远古森林守卫
  'fo-keeper02': 'Ancient Ruins Guard', // 远古废墟守卫
  'fo-keeper03': 'Ancient Plains Guard', // 远古平原守卫
  'fo-keeper04': 'Goblin Lab Guard', // 地精实验室守卫
  'fo-keeper05': 'Mine Research Lab Guard', // 矿洞研究所守卫
  'fo-keeper06': 'Pompeii Ruins Guard', // 庞贝遗迹守卫
  'real_clanmaster': 'Clan Master', // 公会管理员 (clanMaster)
  // ---- Eura / iron continent (ice-ura, iron-1/2, mine-1) ----
  'yura-store': 'General Store', // 杂货店
  'yura-warehouse': 'Eura Warehouse Keeper', // 幽拉仓库管理员
  'yura-guard': 'Eura Guard', // 幽拉大陆守卫
  'yura-guard1': 'Eura Guard',
  'yura-guard2': 'Railway Guard', // 铁路守卫 (iron-1)
  'yura-force-master': 'Force Master', // 力量大师
  'minestone': 'Frozen Mine Store', // 冰封矿洞杂货店 (mine-1)
};

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
    name: PT_NPC_EN_NAMES[key] ?? def.name ?? key,
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
