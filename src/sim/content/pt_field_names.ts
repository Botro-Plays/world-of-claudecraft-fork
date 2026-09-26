/**
 * Authentic player-facing display names for the generated PT map packages.
 *
 * The package id (generated/pt-maps/<id>/) is the technical identifier and
 * stays authoritative for manifests, URLs, FieldGate/WarpGate wiring, saves,
 * and dev tooling. This table is the ONE display-name source: UI surfaces
 * (minimap title, the Phase 6B transition curtain) resolve through
 * getPtFieldDisplayName instead of leaking `fore-1`-style ids or holding
 * their own name dictionaries.
 *
 * Provenance, per entry (see docs-botro/pt-map-port-analysis.md for the
 * source audit; generated/pt-maps/maplinks.json is the extracted graph):
 * - wingWarp/npcTeleport records carry source doc labels and the exact
 *   destination order the official Suba Games teleport table publishes
 *   (Acacia Forest, Land of Dusk, Cursed Land, Forbidden Land), which pins
 *   several fields that the authored Chinese displayName alone leaves
 *   ambiguous.
 * - Warp-gate topology corroborates the chain identities: the map holding
 *   the Dungeon-1 entrance is Cursed Land, Gallubia Valley warps to
 *   Ice Mine 1, Battlefield of the Ancients warps to Cursed Temple 1.
 * - English names follow the canonical English PT spellings (official
 *   ePT/Suba naming, matching the live English-server lists), with the
 *   authored zh name noted where it diverges.
 * - A handful of late MagicPT-exclusive fields have no canonical English
 *   name at all; those entries carry the source-authored Chinese display
 *   name verbatim rather than an invented English one.
 *
 * Names are content data, not localized strings: PT location names are
 * proper nouns (same convention as PT_CLASS_DISPLAY_NAMES in
 * pt_tribes.ts), so they are NOT routed through t().
 */

export const PT_FIELD_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  // ---- Tempskron grasslands (Ricarten side) ----
  ricarten: 'Ricarten', // zh 里查登; wingWarp doc 'Ricarten'; official map title 'Ricarten Town'
  'fore-1': 'Garden of Freedom', // zh 自由庭院; chain ricarten -> fore-1 -> fore-2 -> fore-3
  'fore-2': 'Bamboo Forest', // zh 竹之林; wingWarp doc 'Forest3'
  'fore-3': 'Acacia Forest', // zh 胶之林; npcTeleport select 1 (Suba 'Acacia forest'); ePT 'Acasia Forest'
  // ---- Wastelands between Garden of Freedom and Ruinen ----
  'ruin-4': 'Refuge of the Ancients', // zh 废墟墓地; first ruin field off fore-1
  'ruin-3': 'Castle of the Lost', // zh 废墟; adjacent to Ruinen Village (official chain order)
  'ruin-2': 'Ruinen Village', // zh 废墟村庄; wingWarp doc 'Ruinen'
  'ruin-1': 'Cursed Land', // zh 遗忘之地; hosts the Dungeon-1 warp (source graph) as in official PT; npcTeleport select 3
  'de-1': 'Forgotten Land', // zh 诅咒之地; sits between Cursed Land and Navisko, hubs to Oasis
  'village-1': 'Navisko Town', // zh 内维斯克; wingWarp doc 'Nevisco'
  'de-2': 'Oasis', // zh 绿洲; desert branch off Forgotten Land
  'de-3': 'Battlefield of the Ancients', // zh 古代战场; lv55; hosts the Cursed Temple 1 warp
  'de-4': 'Forbidden Land', // zh 封印之地; lv55; npcTeleport select 4; wingWarp doc 'Desert4'
  // ---- Ricarten dungeon chain and the cave system ----
  'dun-1': 'Dungeon 1', // zh 地牢1层; lv40; ePT called these 'Ancient Prison Floor 1-3'
  'dun-2': 'Dungeon 2', // zh 地牢2层; lv50
  'dun-3': 'Dungeon 3', // zh 地牢3层; lv60
  tcave: 'Mushroom Cave', // zh 蘑菇洞穴; lv55; warps to Acacia Forest and Dark Sanctuary
  mcave: 'Beehive Cave', // zh 蜂房洞穴; lv55; warps to Land of Dusk and Dark Sanctuary
  dcave: 'Dark Sanctuary', // zh 暗黑圣殿; lv65; live English servers call it 'Sanctuary of Darkness'
  // ---- Morion forests (Pillai side) ----
  'forever-fall-01': 'Road of the Wind', // zh 风之路; adjacent to Pillai
  'forever-fall-02': 'Valley of Tranquility', // zh 秋之谷
  'forever-fall-03': 'Land of Dusk', // zh 心情树林; npcTeleport select 2 (Suba 'Land of Dusk'); hosts the Beehive Cave warp
  'forever-fall-04': 'Forest of the Spirits', // zh 黄昏树林; chain terminus into Ruinen Village
  pilai: 'Pillai', // zh 菲尔拉; wingWarp doc 'Pilai'; wartale spells it 'Phillai'
  // ---- Cursed Temple + Endless Tower chains ----
  'dun-4': 'Cursed Temple 1', // zh 晦气寺庙1层; lv70; warp-in from Battlefield of the Ancients
  'dun-5': 'Cursed Temple 2', // zh 晦气寺庙2层; lv75
  'dun-6': 'Cursed Temple 3', // zh 晦气寺庙3层; lv125; chains onward to Secret Laboratory
  'dun-7': 'Endless Tower 1', // zh 无尽之塔1层; lv105
  'dun-8': 'Endless Tower 2', // zh 无尽之塔2层; lv110
  'dun-9': 'Endless Tower 3', // zh 无尽之塔3层; lv115
  // ---- Iron lands ----
  'iron-1': 'Railway of Chaos', // zh 末日都市; lv80; first iron field off Forbidden Land
  'iron-2': 'Heart of Perum', // zh 普龙心脏; lv85; warps onward to Eura Village and Iron Core
  iron4: 'Iron Core', // zh 米拉幻境; lv145; terminus field off Heart of Perum
  iron3: '米拉遗迹', // zh-authored; no canonical English name (MagicPT-era field off Loulan)
  // ---- Ice lands ----
  greedy: 'Greedy Lake', // zh 贪婪之湖; lv70 ice pocket off Ruinen Village
  'ice-ura': 'Eura Village', // zh 幽拉村庄; wingWarp doc 'yura'
  ice1: 'Gallubia Valley', // zh 凯拉笔山谷; lv90; hosts the Ice Mine 1 warp (official topology)
  ice2: 'Frozen Sanctuary', // zh 冰之谷; lv95; hosts the Kelvezu Cave warp
  ice3: '风雪谷', // zh-authored; no canonical English name (god-city ether-core chain)
  boss: 'Kelvezu Cave', // zh 凯尔维苏洞穴; lv100; wartale 'Kelvezu Cave' (ePT 'Kelvezu's Lair')
  'mine-1': 'Ice Mine 1', // zh 凯拉比矿洞; lv120; wartale 'Ice Mine 1'
  // ---- Island / chaos fields ----
  lost: 'Land of Chaos', // zh 迷失之地; wingWarp doc 'chaoticpost'; gateway to Lost Temple
  losttemple: 'Lost Temple', // zh 迷失寺庙; lv100
  lost3: 'Lost Island', // zh 迷失岛屿; lv140; ether-core chain destination
  // ---- Laboratory / weapon depths ----
  slab: 'Secret Laboratory', // zh 矿洞研究所; lv130; chains Cursed Temple 3 -> slab -> Ancient Weapon
  ancientw: 'Ancient Weapon', // zh 地精实验室; lv135; id is the source map name
  // ---- Atlantis expansion (MagicPT-era renewal maps) ----
  town1: 'Atlantis Town', // zh 阿瑞斯城; etherCore START_FIELD_ATLANTIS
  fo1: 'Mystery Forest 1', // zh 绿野仙踪; lv80; first forest field off Atlantis Town
  fo2: 'Mystery Forest 2', // zh 远古森林; lv100
  fo3: 'Mystery Forest 3', // zh 远古草地; lv110
  ba4: 'Mystery Desert 1', // zh 热沙栈道; lv120; desert chain after the Mystery Forests
  ba3: 'Mystery Desert 2', // zh 庞贝遗迹; lv130
  ba2: 'Mystery Desert 3', // zh 西风古道; lv140
  ba1: 'Loulan Ancient City', // zh 楼兰古城; etherCore START_FIELD_LOULANGUCHENG (pinyin of the authored name)
  // ---- Abyss / gods-city arc ----
  seaa: 'Sea of Abyss', // zh 迷雾之海; lv155; etherCore ZHONGSHENZHICHENG2
  heartoffire: 'Heart of Fire', // zh 熔岩之心; lv160; id is the source map name
  dc1: '熔岩之心', // zh-authored (shares the zh name with heartoffire); no canonical English name
  crystalnest: 'Crystal Nest', // zh 冰晶峡谷; lv180; id is the source map name
  ad1: 'Ancient Dungeon 1', // zh 远古地牢一层; lv160; warp-in from Mystery Desert 1
  ad2: 'Ancient Dungeon 2', // zh 远古地牢二层; lv170
  ad3: 'Ancient Dungeon 3', // zh 远古地牢三层; lv180
  sanc1: '远古神殿一层', // zh-authored; no canonical English name (Ancient Temple 1, lv190)
  sanc2: '远古神殿二层', // zh-authored; no canonical English name (Ancient Temple 2, lv200)
  landofnurwn: '永霜圣殿', // zh-authored; no canonical English name (Eternal Frost Temple, lv200)
  // ---- Arenas, events, and system fields ----
  'sod-1': 'Survive or Die', // zh 'SOD'; the SOD_ENTER / Bellatra arena
  'sod-2': 'Devil Square', // zh 恶魔广场; DEVIL_CASTLE_ENTER event field
  'quest-iv': 'Quest Arena', // zh 任务地图; FIELD_STATE_QUEST_ARENA host
  'fall-game': 'Ghost Castle', // zh 幽灵城堡; ePT side game (lv1000 event field)
  castle: 'Bless Castle', // zh 祝福城堡; siege field
  office: 'GM Room', // zh GM房间; staff room, FIELD_STATE_ROOM
  // ---- Generated packages beyond the 70-field maplinks registry ----
  stemple: 'Temple of Abyss', // mapName 'Stemple' under Field/SeaA; abyss-arc temple field (index 70)
  swamp: 'Twilight Swamp', // mapName 'swamp'; the ePT Twilight Swamp event field (index 71)
};

/**
 * Player-facing name for a PT field id. Returns the registered authentic
 * name, or the id itself for ids outside the generated map set (a safe
 * developer-facing fallback; every packaged field has an entry).
 */
export function getPtFieldDisplayName(fieldId: string): string {
  return PT_FIELD_DISPLAY_NAMES[fieldId] ?? fieldId;
}
