# Priston Tale -> World of ClaudeCraft: Full Port Roadmap

Status: in progress. This document is the operating roadmap for converting PT into a
complete game on the WoC engine. Each phase is a vertical slice that delivers a
testable behavior. Re-verify against live code before starting a phase; paths and
symbols here are anchors, not frozen line numbers.

## Phase status summary

| Phase | Name | Status |
|-------|------|--------|
| 0 | NPC model conversion | DONE |
| 1 | NPC visual wiring | pending |
| 2 | Item port | PARTIAL (2.1 done, 2.2-2.4 pending) |
| 3 | Map/zone port | pending |
| 4 | Monster content wiring | PARTIAL (Bargon + Hopy wired, rest pending) |
| 5 | Skill port | pending |
| 6 | Quest port | pending |
| 7 | Class system | pending |
| 8 | Mount port | PARTIAL (8.1 done, 8.2-8.3 pending) |
| 9 | Polish and integration | pending |
| 10 | Particle/effect port | pending |

### Completed work outside the phase list

- Monster model conversion: 318 monster dirs converted to GLB in `scripts/pt-port/converted/monster/`.
- Bargon + Hopy wired in-game with PT-proportionate sizes and separate-skeleton death model swap.
- GM account set (account: Botro, character: Viking, is_gm: true).
- Repository made independent from `levy-street/world-of-claudecraft` (orphan history, new remote).
- DropItem 3D model conversion: 1,925 GLBs in `scripts/pt-port/converted/item/DropItem/` (see Phase 2 notes).
- Mount model conversion: 17 GLBs in `scripts/pt-port/converted/mount/` (see Phase 8 notes).

## PT source inventory (what we have)

Root: `D:\From Luis Cezar Matias - Chinese MagicPT\`

### Model assets (`Client\char\`)

| Folder | Count | Format | Status |
|--------|-------|--------|--------|
| `monster\` | 318 dirs | SMD + SMB + INX + BMP/TGA | DONE: converted to `scripts/pt-port/converted/monster/*.glb` |
| `npc\` | 89 dirs | SMD + SMB + INX + BMP/TGA | DONE: converted to `scripts/pt-port/converted/npc/*.glb` |
| `tmABCD\` | 7,740 files | 2,200 SMD + 90 SMB + 2,513 INX + 1,201 TGA + 447 BMP + 130 PNG | Player character models (modular: body + head + face + equipment per class/gender) |
| `Items\` | 13 subfolders | BMP + SMD + TGA + PNG | Item 3D drop models (DropItem) and 2D inventory icons (Weapon, Defense, Accessory, Event, Potion, Premium, Quest, Skins, Wing, ElementIcon, ItemInfoBox, Make) |
| `mount\` | 17 dirs | SMD + SMB + PNG (no INX) | DONE: converted to `scripts/pt-port/converted/mount/*.glb` (14 Ver 0.62 + 3 Ver 0.66) |
| `Flag\` | 8 files | SMD + SMB | Flag/banner models |

### Field/map assets (`Client\Field\`)

**72 maps** defined in `PT-Source\field.cpp` (SetName calls), across 34 top-level directories.
Many directories contain multiple map segments. 71 minimap TGAs in `Field\map\`.

| Field dir | Maps | Type | Notes |
|-----------|------|------|-------|
| `forest\` | fore-1, fore-2, fore-3 | Overworld | Starting area (Tempskron) |
| `Ricarten\` | village-2 | Town | Main city (Ricarten) |
| `Ruin\` | ruin-1, ruin-2, ruin-3, ruin-4 | Overworld | Ruined lands |
| `desert\` | De-1, De-2, De-3, De-4, de-5 | Overworld | Desert region |
| `dungeon\` | dun-1 through dun-6 | Dungeon | Cursed Temple |
| `forever-fall\` | forever-fall-01 through 04, pilai | Overworld | Forever Fall + Pilai |
| `cave\` | Tcave, Mcave, Dcave | Dungeon | Three cave systems |
| `Iron\` | iron-1, iron-2, iron3, iron4 | Overworld | Iron fields |
| `Ice\` | ice1, ice2, ice3, ice_ura | Overworld | Snow/ice region |
| `Sod\` | sod-1, sod-2 | Arena | Bellatra/SOD arena |
| `Boss\` | Boss, dc1 | Boss | Boss arena + dark boss |
| `castle\` | castle | PvP | Bless Castle (siege) |
| `Lost\` | lost, lost3 | Overworld | Lost island |
| `Losttemple\` | Losttemple | Dungeon | Lost temple |
| `endless\` | dun-7, dun-8, dun-9 | Dungeon | Endless tower |
| `Mine\` | mine-1 | Dungeon | Mine |
| `Slab\` | Slab | Overworld | Slab region |
| `AncientW\` | AncientW | Overworld | Ancient World |
| `Custom\` | fo1, fo2, fo3, town1, ba1-ba4, ad1-ad3, sanc1, sanc2 | Custom | Custom/event maps |
| `Greedy\` | Greedy | Overworld | Greedy region |
| `SeaA\` | SeaA, Stemple | Overworld | Sea area + Temple |
| `HeartOfFire\` | HeartOfFire | Dungeon | Heart of Fire |
| `swamp\` | swamp | Overworld | Swamp |
| `CrystalNest\` | CrystalNest | Dungeon | Crystal Nest |
| `LandofNurwn\` | LandofNurwn | Overworld | Land of Nurwn |
| `Quest\` | quest_IV | Quest | Quest arena |
| `Room\` | office | Indoor | GM room |
| `Fall_Game\` | fall_game | Minigame | Fall game |
| `desert5\` | (part of desert) | Overworld | Desert extension |
| `Oblivion\` | oblivion | Overworld | Oblivion (minimap exists, not in field.cpp SetName) |

Each map directory contains BMP heightmap tiles + TGA texture splats + SMD building/prop models.
Server-side map data in `Server\Maps\` (41 BMP files). Map loading logic in `PT-Source\field.cpp`.
Field state types: VILLAGE, FOREST, DESERT, RUIN, DUNGEON, IRON, ICE, CASTLE, ROOM, ACTION.
Sky variants: day, night, glow (dawn/dusk), rain, snow, desert, ruin, iron, SOD, greedy, lost, temple.

### Particle/effect assets (`Client\Effect\`)

| Folder | Count | What |
|--------|-------|------|
| `Particle\Script\` | 557 `.part` files | Text-based particle system definitions (skills, hits, monster effects, aging, environmental) |
| `AssaEffect\` | 29 subdirs | Per-monster/skill effect textures (EnchantWeapon, RollingSmash, PhoenixShot, DeathKnight, IceGolem, etc.) |
| `NewEffect\Res\` | resources | Newer effect resources |
| `Sky\` | effects | Sky/weather particle effects (rain, snow) |
| `AnimationData\` / `ObjAnimationData\` | data | Effect animation data |

The `.part` format is a custom text-based particle script with `particlesystem` blocks
containing `eventsequence` sub-blocks (position, gravity, emit rate, lifetime, texture,
color, size, velocity, blend mode, fade, particle type). Needs a custom parser and a
bridge to WoC's Three.js VFX system.

### Game data

| Source | What it contains |
|--------|------------------|
| `Server\hotuk.ini` | Server config: max level 249, job change at level 5, game port, server name |
| `Server\skill.ini` | Skill data: damage, mana cost, range, cooldown per skill level |
| `Server\Rarity.ini` | Item rarity/drop rates by level band (Uncommon, Rare, Epic, Legendary) |
| `Server\Boss.ini` | Boss spawn config |
| `Server\bellatra.ini` | Bellatra arena config |
| `Server\Invasion.ini` | Invasion event config |
| `DATABASE LIMPIO\Accountdb.sql` | Account DB schema (MSSQL) |
| `DATABASE LIMPIO\rPTDB*.zip` | Game database backup: monster stats, item stats, character data |
| `PT-Source\SrcServer\gameSQL.cpp` | C++ game SQL queries (monster/item/character data access) |
| `PT-Source\sinbaram\HaQuest.cpp` | C++ quest system |
| `PT-Source\sinbaram\*.cpp` | Full client source: rendering, combat, field loading, character |

### NPC directory names (89, from `char\npc\`)

Ahin, arad, Arkanda, Ascam, atlantis, Barba, Baurin, Bcn01-06, bt03, cashshop,
dailyquest, Derik, Enzo, evenmorif, eventmolly, FishingRod, Hermit, hobsanta,
Hosean, Hunter, IceN-01-03, ji_woo, Jin, M_Messenger, Mage, Marina, maskedman,
maskedwoman, milter, MN-001-013, nadia, NineFox, Packjjangpy, PCmanager, phl,
Quest_ray, reddevil, reddevil-01, Rudolf, Sakura, salon, Sambagirl, SHunter,
Skadi, SkillMaster, SN-001-005, stella, T_Messenger, Teacher, TN-001-017, Zarad

## WoC target systems (where things land)

| WoC system | Source of truth | How PT content wires in |
|------------|-----------------|-------------------------|
| Monster templates | `MobTemplate` in `src/sim/content/zone*.ts` | Add PT mob defs with PT stats |
| Monster visuals | `VisualDef` in `src/render/characters/manifest.ts` | Point `url` at converted GLB |
| NPC defs | `NpcDef` in `src/sim/content/zone*.ts` | Add PT NPC defs |
| NPC visuals | `VisualDef` in manifest.ts (currently KayKit player models) | New `npc_pt_*` defs pointing at PT GLBs |
| Items | `ItemDef` in `src/sim/content/` | Add PT items with PT stats |
| Item icons | `src/ui/icons` | Convert PT BMP item icons to PNG |
| Mounts | mount system in `src/sim/` + manifest.ts | Add PT mount GLBs as VisualDefs |
| Zones/maps | `ZoneDef` in `src/sim/content/zone*.ts` + terrain in `src/sim/world.ts` | New PT zone defs; terrain is the hard part |
| Skills/abilities | ability defs in `src/sim/content/` | Port PT skill.ini data to WoC ability format |
| Quests | `QuestDef` in `src/sim/content/zone*.ts` | Port PT quest data to WoC quest format |
| Classes | class defs in `src/sim/content/` | Map PT classes to WoC classes or add new |

## Key architectural constraints (from CLAUDE.md)

- `src/sim/` has zero DOM/browser/Three.js imports; runs in browser, server, headless
- Determinism: 20 Hz tick, all randomness through `Rng`, never `Math.random`
- `IWorld` is the only seam between sim and render/ui
- Module-first: new logic lands as small modules behind existing seams, never appended to monoliths
- i18n: every player-visible string is a `t()` key
- Gameplay math follows classic-era MMO formulas

## Decisions already made

1. Monster GLB filenames keep the converted folder name (e.g. `Monbagon.glb`), only the in-game display name changes (e.g. "Bargon").
2. Death models with incompatible skeletons use the separate-skeleton death model swap (implemented for Bargon, pattern is reusable).
3. Monster sizes use PT proportions applied through WoC's normalization system (Hopy 1.6, Bargon 4.0).
4. The repo is fully independent from `levy-street/world-of-claudecraft`.
5. Git LFS is used for large binaries.
6. Runtime creature assets are selectively copied to `public/models/creatures/`.

## Open decisions (need user input before the phase that needs them)

1. **PT classes vs WoC classes**: PT has 2 base classes (Fighter, Mechanician) that branch into subclasses (Pikeman, Knight, Archer, etc. at job change level 5). WoC has 8 classes (warrior, mage, rogue, hunter, warlock, druid, shaman, barbarian). Do we map PT classes onto WoC classes, or add PT classes as new WoC classes?
2. **PT maps vs WoC zones**: PT maps are tile-based BMP heightmaps. WoC zones are procedural terrain. Do we import PT heightmaps as stamps, or rebuild PT maps as WoC procedural zones?
3. **PT skills vs WoC abilities**: PT skills are level-scaled in skill.ini. WoC abilities are rank-based with talents. Do we port PT skill data into WoC's ability system, or rebuild PT skills as WoC abilities?
4. **NPC visual system**: WoC NPCs currently use KayKit player models with modular composition. PT NPC GLBs are self-contained rigged meshes. Do we add a new `npc_pt_*` visual path for PT NPCs, or replace the modular system?
5. **Item system**: PT items have different stat ranges and slot systems. Do we map PT items onto WoC's item system, or extend WoC items to support PT item properties?

---

## Phase 0: NPC model conversion (DONE)

**Goal**: Convert all 89 PT NPC model directories to GLB using the existing monster pipeline.

**Why first**: NPCs are the next asset category, the pipeline already exists (glb_assembler.ts handles SMD/SMB/INX/BMP/TGA), and NPCs are needed before we can populate PT towns.

### 0.1 Batch-convert NPC models
- Extend `scripts/pt-port/batch_convert.ts` to accept a category argument (monster/npc/mount) or write a parallel `batch_convert_npcs.ts`
- Source: `D:\From Luis Cezar Matias - Chinese MagicPT\Client\char\npc\`
- Output: `scripts/pt-port/converted/npc/*.glb`
- The glb_assembler.ts already handles the SMD/SMB/INX/BMP/TGA format; NPC dirs use the same structure
- Verify with the viewer: `http://localhost:3002/viewer.html?model=npc/Ahin.glb`

### 0.2 Verify and catalog NPC GLBs
- Run the viewer against each converted NPC
- Catalog: which NPCs have animations, which are static, which have texture issues
- Identify any NPC models that need manual fixes (missing textures, broken skeletons)
- Write a `_report.json` summary like the monster conversion did

### 0.3 Copy runtime NPC assets
- Copy the PT NPC GLBs that will be used at runtime to `public/models/npcs/`
- Follow the monster precedent: keep the converted folder name, change only the in-game display name

**Exit criteria**: 89 NPC GLBs in `scripts/pt-port/converted/npc/`, a report showing success/fail counts, runtime copies in `public/models/npcs/` for the ones we will place in the world.

**State for next phase**: NPC GLBs ready to wire into VisualDefs.

---

## Phase 1: NPC visual wiring

**Goal**: Make PT NPC models render in-game by adding `npc_pt_*` VisualDefs to the manifest.

### 1.1 Add npc_pt_* VisualDefs
- In `src/render/characters/manifest.ts`, add one `VisualDef` per PT NPC that uses a PT GLB
- Pattern: same as `mob_bargon` (url points at the GLB, height normalized, clips mapped)
- PT NPC GLBs may share the KayKit animation clip format or have their own; verify per-model

### 1.2 NPC placement data
- Define PT NPC placements (which NPCs go in which PT town/zone)
- This needs PT map data (Phase 3) to know town layouts, so this step may stub placements first and refine later

### 1.3 NPC content defs
- Add `NpcDef` entries for PT NPCs in a new `src/sim/content/pt_npcs.ts` or in the PT zone files
- Map PT NPC roles: vendor, quest giver, skill master, etc.
- PT NPC roles from the folder names: SkillMaster (trainer), cashshop (premium vendor), dailyquest (quest giver), Teacher (class trainer), PCmanager (account manager), FishingRod (fishing NPC)

**Exit criteria**: At least 5 PT NPCs rendering in-game at test placements, with correct models, names, and roles.

---

## Phase 2: Item port (PARTIAL)

**Goal**: Convert PT item models/icons and port PT item data into WoC's item system.

### 2.1 Convert item 3D models (DONE)

- Source: `Client\image\Sinimage\Items\DropItem\` (1,508 SMD files, the canonical PT client location)
- Fallback source: `Client\char\Items\DropItem\` (1,838 SMD files, includes non-standard variants)
- Converter: `scripts/pt-port/static_glb_assembler.ts` (skeletonless item meshes)
- Batch driver: `scripts/pt-port/batch_convert_items.ts`
- Output: `scripts/pt-port/converted/item/DropItem/` (1,925 GLBs, 252 MB)
- Texture resolution order: canonical `Image\sinImage\Items\DropItem` path, then SMD directory fallback, then `char\Items\DropItem` fallback, then other `char\Items\*` subdirs (Event, Accessory, etc.)
- Supports TGA (including PT-encrypted), BMP (including PT A8-encrypted), PNG, and JPG textures
- 80 SMD parse failures remain (aged/upgraded *173/*175/*177/*188/*199/*991 variants in `char\Items\DropItem` only, non-standard SMD format)

#### 7 items with missing textures (unfixable from this client)

These 7 GLBs have mesh data but no embedded texture because the referenced texture file is missing, corrupted, or uses an unknown encryption:

| Item | Referenced texture | Issue |
|------|-------------------|-------|
| itBC225 | `itBC221.tga` | Does not exist anywhere in the client |
| itBC228 | `itBC222.tga` | Does not exist anywhere in the client |
| itcw109 | `Effect\NewEffect\Res\Object\_effectsource_wing_blu.tga` | Does not exist anywhere in the client |
| itDB131 | `itDB131.tga` | File exists in `char\Items\DropItem` but is truncated (49 KB vs needed 65 KB for 128x128x32) |
| itom301 | `Hall_Shield.bmp` | File exists but uses unknown 'ri' encryption marker (not the standard PT 'A8' marker) |
| itOS140 | `rPT7.tga` | Does not exist anywhere in the client |
| itWT132 | `j97456.bmp` | Does not exist anywhere in the client |

Fixing these requires sourcing the textures from another PT client or extracting them from the game data.

### 2.2 Convert item icons (PENDING)

- Source: `Client\char\Items\` (13 subfolders of BMP/TGA icons)
- Convert BMP to PNG using the existing `bmp_to_png.ts` / `tga_to_png.ts`
- Output: `public/icons/items/` (or wherever WoC item icons live)
- Catalog: map PT item icon names to WoC item IDs

### 2.3 Port item stats (PENDING)

- Extract PT item stats from the rPTDB database backup or the C++ source
- Map PT item properties (attack, defense, level requirement, class restriction) to WoC's `ItemDef` format
- PT item rarity from `Rarity.ini` maps to WoC's rarity tiers

### 2.4 Define PT items in WoC (PENDING)

- Add `ItemDef` entries in `src/sim/content/` for PT items
- Wire item icons to the icon system
- Wire item models to the equipment rendering system

**Exit criteria**: PT items appear in vendor stock and drop from PT monsters, with correct stats and icons.

---

## Phase 3: Map/zone port

**Goal**: Recreate PT maps as WoC zones. This is the hardest phase.

### 3.1 Analyze PT map format
- 72 maps defined in `PT-Source\field.cpp` (SetName calls), across 34 top-level `Client\Field\` directories
- 71 minimap TGAs in `Client\Field\map\`, 41 server-side map BMPs in `Server\Maps\`
- PT maps are in `Client\Field\<mapname>\` with BMP heightmap tiles and texture splats
- Study the field loading code in `PT-Source\field.cpp` (the master map list with SetName calls)
- Document the tile format, height encoding, texture layering, warp gates, field states

### 3.2 Heightmap import tool
- Write a converter that reads PT BMP heightmaps and produces WoC `HeightStamp[]` data
- WoC terrain is procedural (heightfield + splat layers); PT maps can be imported as stamps over a flat base
- Output: `src/sim/content/pt_zones/<mapname>_terrain.ts`

### 3.3 Texture splat import
- Convert PT field textures (BMP) to PNG
- Map PT texture layers to WoC's splat system (grass, dirt, sand, rock, water)
- PT maps have per-tile textures; WoC uses splat weights; the mapping is approximate

### 3.4 Zone definitions
- Create `ZoneDef` entries for each PT map in `src/sim/content/pt_zones/`
- Define zone boundaries, roads, props, camps
- Place NPCs (from Phase 1) and monsters (already converted) in their PT positions

### 3.5 Town: Ricarten
- Ricarten is PT's main city; convert it first as the proof of concept
- Place all Ricarten NPCs (vendors, skill masters, quest givers)
- Add buildings and props

**Exit criteria**: Ricarten is walkable in-game with PT terrain, PT NPCs, and PT buildings.

---

## Phase 4: Monster content wiring (PARTIAL: Bargon + Hopy done)

**Goal**: Wire the 318 converted monster GLBs into WoC as playable mob templates with PT stats.

### 4.1 Extract monster stats (PENDING)
- Source: rPTDB database backup (monster HP, damage, defense, level, XP)
- Parse the MSSQL backup or extract from `PT-Source\SrcServer\gameSQL.cpp`
- Output: a JSON/TS data file mapping monster names to stats

### 4.2 Define PT mob templates
- Add `MobTemplate` entries for PT monsters in `src/sim/content/pt_mobs.ts`
- Map PT stats to WoC's MobTemplate format (hpBase, hpPerLevel, dmgBase, dmgPerLevel, etc.)
- Set aggroRadius, moveSpeed, attackSpeed from PT data or reasonable defaults

### 4.3 Wire PT mob visuals
- Add `VisualDef` entries for each PT monster in manifest.ts (pattern: mob_bargon)
- Copy runtime GLBs to `public/models/creatures/`
- Handle death models (the separate-skeleton swap pattern) for monsters that have `-die.glb` variants

### 4.4 Place PT monsters in PT zones
- Add `CampDef` entries in the PT zone files placing monsters at their PT spawn positions
- PT spawn data may be in the rPTDB or the field files

**Exit criteria**: PT monsters spawn in PT zones with correct stats, visuals, and death animations.

---

## Phase 5: Skill port

**Goal**: Port PT skills into WoC's ability system.

### 5.1 Parse skill.ini
- `Server\skill.ini` has per-level damage, mana cost, range, cooldown for each PT skill
- Write a parser that extracts this into a structured format

### 5.2 Map PT skills to WoC abilities
- PT skills are level-scaled (1-10 per skill); WoC abilities are rank-based with talents
- Decision needed: port PT scaling directly, or convert to WoC rank system
- PT has class-specific skills (Fighter, Mechanician, and their subclasses)

### 5.3 Define PT abilities
- Add ability definitions in `src/sim/content/` for PT skills
- Map PT skill effects (damage, buff, debuff, heal) to WoC's ability effect system
- Port PT skill visuals (effects from `Client\Effect\`)

**Exit criteria**: PT skills are castable in-game with correct damage, mana cost, and visuals.

---

## Phase 6: Quest port

**Goal**: Port PT quests into WoC's quest system.

### 6.1 Extract PT quest data
- Source: `Client\image\Sinimage\Quest\*.txt` (quest text), `PT-Source\sinbaram\HaQuest.cpp` (quest logic)
- PT quest text files: gr1-3, mr1, sm1-4, vi1-2, haQuesttired_Astart
- Parse quest objectives, rewards, prerequisites

### 6.2 Define PT quests in WoC
- Add `QuestDef` entries in `src/sim/content/pt_quests.ts`
- Map PT quest objectives (kill X monsters, collect Y items, talk to NPC) to WoC's quest objective types
- Wire quest givers to PT NPCs (from Phase 1)

**Exit criteria**: PT quests are accepted, progressed, and completed in-game.

---

## Phase 7: Class system

**Goal**: Port PT's class system. Depends on the open decision about PT vs WoC classes.

### 7.1 PT class structure
- PT has 2 tribes: Tempskron (physical) and Morion (magical)
- The `tmABCD` folder name = Tempskron/Morion; A/B = Tempskron body types, C/D = Morion body types
- Each tribe has base classes that branch into subclasses at job change (level 5)
- Tempskron: Fighter (FS), Mechanician (MS), Archer (AS), Pikeman (PS), Assassin (ASS), Martial Artist (MA)
- Morion: Atalanta (ATA), Knight (KS), Magician (MGS), Priest (PRS), Shaman (SHM)
- MagicPT Chinese has an 11th class: Martial Artist (MA), a Tempskron subclass
- Job change at level 5 (from hotuk.ini: `*CHANGE_JOB_LEVEL 5`)
- Max level 249 (from hotuk.ini: `*MAX_LEVEL 249`)
- Character models are modular: body (tmb) + head (tmh) + face (tfb) + equipment, composed per class and per gear set
- The `tmABCD` folder has 7,740 files: 2,200 SMD, 90 SMB, 2,513 INX, 447 BMP, 1,201 TGA, 130 PNG, 870 INF, 272 INI
- Class suffixes in filenames: FS (Fighter), MS (Mechanician), AS (Archer), PS (Pikeman), ASS (Assassin), MA (Martial Artist), ATA (Atalanta), KS (Knight), MGS (Magician), PRS (Priest), SHM (Shaman)

### 7.2 Implementation (pending decision)
- Option A: Map PT classes onto WoC's 8 classes (simpler, loses PT identity)
- Option B: Add PT classes as new WoC classes (more work, preserves PT feel)
- Option C: Replace WoC classes with PT classes (full conversion)

**Exit criteria**: PT class system works with job change, class skills, and progression.

---

## Phase 8: Mount port (PARTIAL: 8.1 done)

**Goal**: Convert PT mount models and add them as WoC mounts.

### 8.1 Convert mount models (DONE)

- Source: `Client\char\mount\` (17 mount dirs: chicken, horse, raptor, wolf, unicorn, piggy, turtle, etc.)
- Mounts use two SMD format variants:
  - **Ver 0.62** (14 mounts): standard SMD/SMB format, same as NPCs/monsters. Has physique bone names for skinning.
  - **Ver 0.66** (3 mounts: Raptor, Unicorn, xunlu): newer inline format with 60-byte vertex records, auto-detected face header size (8 or 12 bytes), 32-byte texlink records, and bone data embedded in vertices (no separate physique bone name block).
- Mounts have no INX animation index files; mount animation is driven by the player's motion at runtime.
- Converter: `scripts/pt-port/mount_glb_assembler.ts` (isolated from `glb_assembler.ts` to preserve the working NPC/monster pipeline)
- Batch driver: `scripts/pt-port/batch_convert_mounts.ts`
- Parser extensions: `scripts/pt-port/smd_parser.ts` extended with `readVertex066`, `readFace066` (auto-detected header size), `readTexLink066`, and `peekUInt16` for face format detection
- Output: `scripts/pt-port/converted/mount/*.glb` (17 GLBs, all valid glTF 2.0)
- Results:
  - 17/17 mounts converted successfully (0 failed, 0 skipped)
  - 14 Ver 0.62 mounts have skin data (physique bones + skeleton)
  - 3 Ver 0.66 mounts have skeleton nodes but no skin data (bone references embedded in vertex format, not yet extracted)
  - Some Ver 0.66 faces with out-of-bounds vertex indices are skipped (degenerate/padding faces)
  - UVs for Ver 0.66 faces are placeholder zeros (texlink UV encoding not fully reverse-engineered)
- Known limitations:
  - Ver 0.66 vertex bone weights/indices (bytes 24-59 of the 60-byte record) are not yet extracted; skinning is not available for 0.66 mounts
  - Ver 0.66 texlink UV encoding (32-byte records with int32 values) is approximate (divided by 4096 as fixed-point); may produce incorrect UV mapping
  - Ver 0.66 SMB skeleton parent hierarchy is not reconstructed (serialized parent names are garbage; object-info table names are used but parent relationships are cleared)

### 8.2 Wire mount visuals (PENDING)
- Add `VisualDef` entries for PT mounts in manifest.ts
- Add mount item defs (reins) for each PT mount

### 8.3 Mount runtime (PENDING)
- Wire mount GLBs into the WoC mount system
- Implement mount summoning/dismounting
- Mount animations driven by player motion (no INX clips)

**Exit criteria**: PT mounts are rideable in-game.

---

## Phase 9: Polish and integration

**Goal**: Tie everything together into a cohesive PT game.

### 9.1 PT-specific UI
- Port PT UI elements (health/mana bars, skill bar, inventory layout)
- Source: `Client\image\` and `Client\Game\`

### 9.2 PT sound effects
- Source: `Client\wav\`
- Map PT SFX to WoC's audio system

### 9.3 PT sky/weather
- Source: `Client\sky\` and `Client\rain\`
- Map to WoC's sky and weather systems

### 9.4 Balance pass
- Verify PT monster difficulty curves match PT original
- Verify PT item progression matches PT original
- Verify PT quest reward economy

### 9.5 Bug fixing and QA
- Run the full WoC QA gate against all PT content
- Playtest each PT zone end to end

**Exit criteria**: A complete, playable PT game on the WoC engine.

---

## Phase 10: Particle/effect port

**Goal**: Port PT's particle system and skill/monster visual effects into WoC so that when skills and monster abilities are wired in (Phase 5), their effects are ready to attach from the start.

**Why before skills**: Porting skills without their particle effects means retrofitting every effect later. By converting the particle assets and building the emitter bridge first, skill porting (Phase 5) and monster ability wiring (Phase 4) can attach effects inline, no second pass.

### PT particle system overview

PT uses a custom text-based particle script format (`.part` files):
- Location: `Client\Effect\Particle\Script\` (557 `.part` files)
- Format: text-based particle system definitions with:
  - `particlesystem` blocks containing `eventsequence` sub-blocks
  - Position, gravity, emit rate, lifetime, loops
  - Texture references (TGA files in `Effect\Particle\`)
  - Color, size, velocity, fade parameters
  - Blend modes (BLEND_LAMP, etc.)
  - Particle types (TYPE_THREE, etc.)
  - Per-event delays and random ranges
- Additional effect assets:
  - `Client\Effect\AssaEffect\` (29 subdirs): per-monster/skill effect textures (EnchantWeapon, RollingSmash, PhoenixShot, DeathKnight, IceGolem, etc.)
  - `Client\Effect\NewEffect\Res\`: newer effect resources
  - `Client\Effect\Sky\`: sky/weather particle effects (rain, snow)
  - `Client\Effect\AnimationData\` and `ObjAnimationData\`: effect animation data

### 10.1 Parse PT .part files
- Write a parser for the PT `.part` text format
- Extract: particle count, emit rate, lifetime, texture, color, size, velocity, gravity, blend mode, fade
- Map PT particle types and blend modes to Three.js equivalents
- Output: structured JSON/TS per effect

### 10.2 Convert particle textures
- Source: `Client\Effect\Particle\*.tga` and `Client\Effect\AssaEffect\*\*.bmp|*.tga`
- Convert TGA/BMP to PNG using existing `tga_to_png.ts` / `bmp_to_png.ts`
- Output: `public/textures/effects/`

### 10.3 Build PT-to-WoC particle emitter bridge
- WoC has its own VFX system (Three.js particles in `src/render/`)
- Build a bridge that converts parsed PT particle definitions into WoC VFX emitters
- Map PT blend modes to Three.js blending modes
- Map PT particle types to Three.js particle configurations
- Respect WoC's deterministic rendering constraints

### 10.4 Wire skill effects
- Map each PT skill's particle effect to the corresponding WoC ability (from Phase 5)
- Source: `.part` files named after skills (e.g. `AceroSkill.part`, `AceroHit.part`, `AceroStart.part`)
- Trigger the right effect on cast, hit, and impact

### 10.5 Wire monster effects
- Map monster ability effects from `AssaEffect\` subdirs to PT monsters (from Phase 4)
- Hit effects, death effects, special ability effects

### 10.6 Wire environmental effects
- Aging/level-up effects (`Aging.part`, `AgingBody.part`, etc.)
- Enchant weapon effects (`EnchantWeapon\`)
- Weather effects from `Effect\Sky\`

**Exit criteria**: PT skills, monster hits, and environmental effects play with PT particle visuals in-game.

**State for next phase**: Combat and abilities look and feel like PT.

---

## Phase dependency graph

```
Phase 0 (NPC models) ──> Phase 1 (NPC visuals) ──┐
                                                  ├──> Phase 3 (Maps) ──> Phase 4 (Monsters) ──> Phase 6 (Quests)
Phase 2 (Items) ──────────────────────────────────┘
                                                  Phase 10 (Particles) ──> Phase 5 (Skills) ──> Phase 7 (Classes)
                                                  Phase 8 (Mounts) ───────────────────────────────────────────> Phase 9 (Polish)
```

Phases 0, 2, 8, 10 can run in parallel (independent asset conversions).
Phase 3 (maps) is the critical path: it unblocks 4 and 6.
Phase 10 (particles) must come before Phase 5 (skills) so skills port with their effects attached.
Phase 5 (skills) and 7 (classes) are coupled.

## Recommended execution order

1. **Phase 0**: NPC model conversion (DONE)
2. **Phase 2**: Item 3D model conversion (DONE); item icons, stats, and defs (PENDING)
3. **Phase 8**: Mount model conversion (parallel asset conversion, not started)
4. **Phase 10**: Particle/effect asset conversion (parse .part files, convert effect textures; parallel with 2 and 8, not started)
5. **Phase 1**: NPC visual wiring (after 0, not started)
6. **Phase 4**: Monster content wiring (Bargon + Hopy done, rest pending)
7. **Phase 3**: Map/zone port (the hard one, needs focused effort, not started)
8. **Phase 5**: Skill port (after 10 so effects are ready, and after class decision, not started)
9. **Phase 6**: Quest port (after 1, 3, 4 are done, not started)
10. **Phase 7**: Class system (after 5, not started)
11. **Phase 9**: Polish (last, not started)

The key insight: all asset conversion (models, icons, textures, particles) happens first
in parallel. Then content wiring (visuals, stats, skills, quests) uses those assets
with effects attached from the start, no retrofitting.

## Tools we have and need

### Existing tools (reuse)
- `scripts/pt-port/glb_assembler.ts`: SMD/SMB/INX/BMP/TGA -> GLB (works for monsters, NPCs, mounts)
- `scripts/pt-port/batch_convert.ts`: batch converter (extend for npc/mount categories)
- `scripts/pt-port/converter_api.ts`: HTTP API for the converter UI
- `scripts/pt-port/viewer.html`: GLB viewer with animation/skeleton/wireframe
- `scripts/pt-port/bmp_to_png.ts` / `tga_to_png.ts`: texture converters
- `scripts/pt-port/smd_parser.ts` / `inx_parser.ts`: PT format parsers

### Tools to build
- PT heightmap -> WoC HeightStamp converter (Phase 3)
- PT skill.ini parser (Phase 5)
- PT quest text parser (Phase 6)
- PT rPTDB database extractor (Phase 4, for monster/item stats)
- PT item icon batch converter (Phase 2)
- PT `.part` particle script parser (Phase 10)
- PT particle emitter -> WoC VFX bridge (Phase 10)

## Source pointers (re-verify before starting a phase)

- Monster pipeline: `scripts/pt-port/glb_assembler.ts`, `scripts/pt-port/batch_convert.ts`
- Monster visuals: `src/render/characters/manifest.ts` (VisualDef, `mob_*` entries)
- Monster content: `src/sim/content/zone*.ts` (MobTemplate, `ZONE*_MOBS`)
- NPC defs: `src/sim/types.ts` (NpcDef), `src/sim/content/zone*.ts` (ZONE*_NPCS)
- NPC visuals: `src/render/characters/manifest.ts` (`npc_*` entries), `src/render/characters/npc_looks.ts`
- Item system: `src/sim/content/` (ItemDef), `src/ui/icons` (icons)
- Zone system: `src/sim/types.ts` (ZoneDef), `src/sim/content/zone*.ts`, `src/sim/world.ts` (terrain)
- Quest system: `src/sim/types.ts` (QuestDef), `src/sim/content/zone*.ts` (ZONE*_QUESTS)
- Class system: `src/sim/content/` (class defs)
- Mount system: `src/sim/` (mount logic), `src/render/characters/manifest.ts` (mount visuals)
- Death model swap: `src/render/characters/visual.ts` (enterDeath/revive), `tests/death_model_swap.test.ts`
