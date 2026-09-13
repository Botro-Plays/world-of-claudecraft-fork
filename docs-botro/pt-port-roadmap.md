# Priston Tale -> World of ClaudeCraft: Full Port Roadmap

Status: in progress. This document is the operating roadmap for converting PT into a
complete game on the WoC engine. Each phase is a vertical slice that delivers a
testable behavior. Re-verify against live code before starting a phase; paths and
symbols here are anchors, not frozen line numbers.

## Developer attribution

| Dev | Role | Work done |
|-----|------|----------|
| Botro | Repo owner, asset pipeline, monster wiring | Phase 0 (NPC conversion), Phase 2.1 (item 3D models), Phase 4 partial (Bargon + Hopy), Phase 8.1 (mount models), death-model swap, Bargon rename, repo independence, GM account, smd_parser/viewer enhancements, all conversion tooling |
| Jhing | PT class system integration | Phase 7 Phase A (11 PT class foundations), tribe select UI, PT starting stats, PT tribe definitions, class visual wiring (11 classes x 3 hair variants), i18n catalog entries, equipment rules, dev kit roles, loot archetypes, community test accounts |
| Devin (AI) | Audit and cleanup | Post-merge cleanup commit (env asset restore, test pin fixes, .gitignore restore, package-lock removal, duplicate Bargon deletion, manifest regeneration, i18n attributes, character_clipmaps death-model fix) |

## Phase status summary

| Phase | Name | Status | Dev | Last updated |
|-------|------|--------|-----|--------------|
| 0 | NPC model conversion | DONE | Botro | Pre-merge |
| 1 | NPC visual wiring | PENDING | - | - |
| 2 | Item port | PARTIAL (2.1 done, 2.2-2.4 pending) | Botro (2.1) | Pre-merge |
| 3 | Map/zone port | PENDING | - | - |
| 4 | Monster content wiring | PARTIAL (Bargon + Hopy wired, 316 pending) | Botro (Bargon + Hopy) | Pre-merge |
| 5 | Skill port | PENDING | - | - |
| 6 | Quest port | PENDING | - | - |
| 7 | Class system | PARTIAL (Phase A done, Phase B pending) | Jhing (Phase A) | Merge commit 62853e1a5c |
| 8 | Mount port | PARTIAL (8.1 done, 8.2-8.3 pending) | Botro (8.1) | Pre-merge |
| 9 | Polish and integration | PENDING | - | - |
| 10 | Particle/effect port | PENDING | - | - |

### Completed work outside the phase list

- Monster model conversion: 318 monster dirs converted to GLB in `scripts/pt-port/converted/monster/`. (Botro)
- Bargon + Hopy wired in-game with PT-proportionate sizes and separate-skeleton death model swap. (Botro)
- GM account set (account: Botro, character: Viking, is_gm: true). (Botro)
- Repository made independent from `levy-street/world-of-claudecraft` (orphan history, new remote). (Botro)
- DropItem 3D model conversion: 1,925 GLBs in `scripts/pt-port/converted/item/DropItem/` (see Phase 2 notes). (Botro)
- Mount model conversion: 17 GLBs in `scripts/pt-port/converted/mount/` (see Phase 8 notes). (Botro)
- Post-merge cleanup: env asset restore, test pin fixes, .gitignore restore, package-lock removal, duplicate Bargon deletion, manifest regeneration, i18n attributes, character_clipmaps death-model fix. (Devin)
- Pre-existing gaps documented in `docs-botro/known-gaps-after-pt-merge.md`. (Devin)

## PT source inventory (what we have)

Root: `D:\From Luis Cezar Matias - Chinese MagicPT\`

### Model assets (`Client\char\`)

| Folder | Count | Format | Status |
|--------|-------|--------|--------|
| `monster\` | 318 dirs | SMD + SMB + INX + BMP/TGA | DONE: converted to `scripts/pt-port/converted/monster/*.glb` (Botro) |
| `npc\` | 89 dirs | SMD + SMB + INX + BMP/TGA | DONE: converted to `scripts/pt-port/converted/npc/*.glb` (Botro) |
| `tmABCD\` | 7,740 files | 2,200 SMD + 90 SMB + 2,513 INX + 1,201 TGA + 447 BMP + 130 PNG | Player character models (modular: body + head + face + equipment per class/gender). 11 classes converted to GLB by Jhing (body + 3 hair variants each) |
| `Items\` | 13 subfolders | BMP + SMD + TGA + PNG | Item 3D drop models (DropItem) and 2D inventory icons (Weapon, Defense, Accessory, Event, Potion, Premium, Quest, Skins, Wing, ElementIcon, ItemInfoBox, Make). DropItem 3D models converted by Botro; icons not yet converted |
| `mount\` | 17 dirs | SMD + SMB + PNG (no INX) | DONE: converted to `scripts/pt-port/converted/mount/*.glb` (14 Ver 0.62 + 3 Ver 0.66) (Botro) |
| `Flag\` | 8 files | SMD + SMB | Flag/banner models (not converted) |

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
| Classes | class defs in `src/sim/content/classes.ts` | DONE: 11 PT classes added as new WoC classes (Jhing) |

## Key architectural constraints (from CLAUDE.md)

- `src/sim/` has zero DOM/browser/Three.js imports; runs in browser, server, headless
- Determinism: 20 Hz tick, all randomness through `Rng`, never `Math.random`
- `IWorld` is the only seam between sim and render/ui
- Module-first: new logic lands as small modules behind existing seams, never appended to monoliths
- i18n: every player-visible string is a `t()` key
- Gameplay math follows classic-era MMO formulas

## Decisions already made

1. Monster GLB filenames keep the converted folder name (e.g. `Monbagon.glb`), only the in-game display name changes (e.g. "Bargon"). (Botro)
2. Death models with incompatible skeletons use the separate-skeleton death model swap (implemented for Bargon, pattern is reusable). (Botro)
3. Monster sizes use PT proportions applied through WoC's normalization system (Hopy 1.6, Bargon 4.0). (Botro)
4. The repo is fully independent from `levy-street/world-of-claudecraft`. (Botro)
5. Git LFS is used for large binaries. (Botro)
6. Runtime creature assets are selectively copied to `public/models/creatures/`. (Botro)
7. PT classes are added as NEW WoC classes (Option B from the open decisions), not mapped onto existing WoC classes. 11 PT classes join the 9 original WoC classes for a total of 20. (Jhing)
8. PT tribe structure (Tempskron, Morion, Atlanteon) is preserved in the character select UI with a tribe-first selection flow. (Jhing)

## Open decisions (need user input before the phase that needs them)

1. ~~PT classes vs WoC classes~~ RESOLVED: Option B, add as new WoC classes. (Jhing implemented)
2. **PT maps vs WoC zones**: PT maps are tile-based BMP heightmaps. WoC zones are procedural terrain. Do we import PT heightmaps as stamps, or rebuild PT maps as WoC procedural zones?
3. **PT skills vs WoC abilities**: PT skills are level-scaled in skill.ini. WoC abilities are rank-based with talents. Do we port PT skill data into WoC's ability system, or rebuild PT skills as WoC abilities?
4. **NPC visual system**: WoC NPCs currently use KayKit player models with modular composition. PT NPC GLBs are self-contained rigged meshes. Do we add a new `npc_pt_*` visual path for PT NPCs, or replace the modular system?
5. **Item system**: PT items have different stat ranges and slot systems. Do we map PT items onto WoC's item system, or extend WoC items to support PT item properties?
6. **PT job change**: PT has job change at level 5 (Fighter branches into Pikeman/Archer, Mechanician branches into Assassin/Martial Artist, etc.). WoC has no branching class system. Do we implement job change as a class swap at level 5, or keep the 11 classes flat?
7. **PT max level**: PT goes to 249 (hotuk.ini). WoC caps at MAX_LEVEL. Do we raise the cap for PT, or keep WoC's cap and rescale PT content?

---

## Phase 0: NPC model conversion (DONE)

**Dev**: Botro
**Goal**: Convert all 89 PT NPC model directories to GLB using the existing monster pipeline.

**Why first**: NPCs are the next asset category, the pipeline already exists (glb_assembler.ts handles SMD/SMB/INX/BMP/TGA), and NPCs are needed before we can populate PT towns.

### 0.1 Batch-convert NPC models (DONE, Botro)
- Extended `scripts/pt-port/batch_convert.ts` to accept a category argument (monster/npc/mount) or write a parallel `batch_convert_npcs.ts`
- Source: `D:\From Luis Cezar Matias - Chinese MagicPT\Client\char\npc\`
- Output: `scripts/pt-port/converted/npc/*.glb`
- The glb_assembler.ts already handles the SMD/SMB/INX/BMP/TGA format; NPC dirs use the same structure
- Verify with the viewer: `http://localhost:3002/viewer.html?model=npc/Ahin.glb`

### 0.2 Verify and catalog NPC GLBs (DONE, Botro)
- Ran the viewer against each converted NPC
- Cataloged: which NPCs have animations, which are static, which have texture issues
- Identified any NPC models that need manual fixes (missing textures, broken skeletons)
- Wrote a `_report.json` summary like the monster conversion did

### 0.3 Copy runtime NPC assets (DONE, Botro)
- Copied the PT NPC GLBs that will be used at runtime to `public/models/npcs/`
- Followed the monster precedent: keep the converted folder name, change only the in-game display name

**Exit criteria**: 89 NPC GLBs in `scripts/pt-port/converted/npc/`, a report showing success/fail counts, runtime copies in `public/models/npcs/` for the ones we will place in the world. MET.

**State for next phase**: NPC GLBs ready to wire into VisualDefs.

---

## Phase 1: NPC visual wiring (PENDING)

**Dev**: Unassigned
**Goal**: Make PT NPC models render in-game by adding `npc_pt_*` VisualDefs to the manifest.

### What is done
- 89 NPC GLBs are converted and available in `scripts/pt-port/converted/npc/`. (Botro)
- Runtime copies are in `public/models/npcs/`. (Botro)

### What is missing
- No `npc_pt_*` VisualDef entries in `src/render/characters/manifest.ts`.
- No `NpcDef` entries for PT NPCs in `src/sim/content/`.
- No NPC placement data (which NPCs go in which PT town/zone).
- No PT NPC role mapping (vendor, quest giver, skill master, class trainer, etc.).

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

**Dev**: Botro (2.1)
**Goal**: Convert PT item models/icons and port PT item data into WoC's item system.

### 2.1 Convert item 3D models (DONE, Botro)

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

## Phase 3: Map/zone port (PENDING)

**Dev**: Unassigned
**Goal**: Recreate PT maps as WoC zones. This is the hardest phase.

### What is done
- PT source maps are cataloged (72 maps, 34 directories). (Botro)
- Map format is documented (BMP heightmap tiles + TGA texture splats + SMD props). (Botro)

### What is missing
- No heightmap import tool.
- No texture splat converter.
- No PT zone definitions.
- No PT town (Ricarten) implementation.

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

**Dev**: Botro (Bargon + Hopy)
**Goal**: Wire the 318 converted monster GLBs into WoC as playable mob templates with PT stats.

### What is done (Botro)
- 318 monster GLBs converted and available in `scripts/pt-port/converted/monster/`.
- `mob_bargon` VisualDef in `manifest.ts` with `deathModelUrl` for separate-skeleton death swap.
- `mob_hopy` VisualDef in `manifest.ts`.
- `pt_hopy` and `pt_bargon` MobTemplate entries in `zone1.ts` with PT-style stats.
- Both placed in camps in zone1 (offStream, temporary placement near Sableweb Lurker).
- Runtime GLBs copied to `public/models/creatures/` (Monbagon.glb, Monbagon-die.glb, hopy.glb).

### What is missing
- 316 of 318 monsters have no MobTemplate, no VisualDef, and no camp placement.
- No monster stats extracted from rPTDB (all current stats are hand-tuned estimates).
- No PT-specific zone placement (monsters are in WoC zone1, not PT zones).

### 4.1 Extract monster stats (PENDING)
- Source: rPTDB database backup (monster HP, damage, defense, level, XP)
- Parse the MSSQL backup or extract from `PT-Source\SrcServer\gameSQL.cpp`
- Output: a JSON/TS data file mapping monster names to stats

### 4.2 Define PT mob templates (PENDING: 2 of 318 done)
- Add `MobTemplate` entries for PT monsters in `src/sim/content/pt_mobs.ts`
- Map PT stats to WoC's MobTemplate format (hpBase, hpPerLevel, dmgBase, dmgPerLevel, etc.)
- Set aggroRadius, moveSpeed, attackSpeed from PT data or reasonable defaults

### 4.3 Wire PT mob visuals (PENDING: 2 of 318 done)
- Add `VisualDef` entries for each PT monster in manifest.ts (pattern: mob_bargon)
- Copy runtime GLBs to `public/models/creatures/`
- Handle death models (the separate-skeleton swap pattern) for monsters that have `-die.glb` variants

### 4.4 Place PT monsters in PT zones (PENDING)
- Add `CampDef` entries in the PT zone files placing monsters at their PT spawn positions
- PT spawn data may be in the rPTDB or the field files

**Exit criteria**: PT monsters spawn in PT zones with correct stats, visuals, and death animations.

---

## Phase 5: Skill port (PENDING)

**Dev**: Unassigned
**Goal**: Port PT skills into WoC's ability system.

### What is done
- Nothing. PT skills are not ported. All 11 PT classes currently use the Warrior ability kit as a placeholder. (Jhing left this as Phase A foundation; ability kit to be replaced in a later phase.)

### What is missing
- No `skill.ini` parser.
- No PT ability definitions in `src/sim/content/`.
- No PT skill visuals (effects from `Client\Effect\`).
- No PT-specific combat suites (no `combat/tempskron_*.ts` or `combat/morion_*.ts` files).
- All 11 PT classes use `WARRIOR_DEF.abilities` (warrior's heroic_strike, revenge, charge, etc.).

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

### 5.4 Build per-class combat suites
- Create `combat/tempskron_fighter.ts`, `combat/tempskron_mechanician.ts`, etc.
- Each PT class needs its own combat module following the WoC pattern (every class has one: `combat/paladin_*.ts`, `warrior_stances.ts`, etc.)
- Replace the `WARRIOR_DEF.abilities` reference in each PT class def with its own authentic ability list

**Exit criteria**: PT skills are castable in-game with correct damage, mana cost, and visuals.

---

## Phase 6: Quest port (PENDING)

**Dev**: Unassigned
**Goal**: Port PT quests into WoC's quest system.

### What is done
- Nothing. PT quests are not ported.

### What is missing
- No PT quest data extracted.
- No `QuestDef` entries for PT quests.
- No PT quest giver NPC wiring (depends on Phase 1).

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

## Phase 7: Class system (PARTIAL: Phase A done by Jhing)

**Dev**: Jhing (Phase A)
**Goal**: Port PT's class system. Decision resolved: Option B, add PT classes as new WoC classes.

### What is done (Jhing, Phase A: class identity foundation)

Jhing implemented "Phase A" of the class system: the class identity and visual foundation.
All 11 PT classes are playable with authentic stats and visuals, but they all reuse the
Warrior's ability kit, talent trees, and equipment as placeholders.

**Class definitions (DONE, Jhing):**
- 11 PT classes added to `ALL_CLASSES` in `src/sim/content/classes.ts` (20 total with 9 WoC classes):
  - Tempskron: `tempskron_fighter`, `tempskron_mechanician`, `tempskron_pikeman`, `tempskron_archer`
  - Morion: `morion_knight`, `morion_atalanta`, `morion_priestess`, `morion_magician`
  - Atlanteon: `atlanteon_assassin`, `atlanteon_shaman`, `atlanteon_martial_artist`
- Each has a dedicated `ClassDef` with authentic PT base stats mapped from PT's 5-stat system (Strength, Spirit, Talent, Defence, Health) to WoC's 6-attribute system (str, agi, sta, int, spi, armor).
- Source citations from `HoLogin.cpp`, `fileread.cpp`, `sinInvenTory.cpp`, `smPacket.h` in each class def.
- HP and mana pools derived from PT's `LifeFunction` and `ManaFunction` formulas.
- `tempskron_fighter` uses `rage` resource (inherits from warrior); all other PT classes use `mana`.

**PT starting stats (DONE, Jhing):**
- `src/sim/content/pt_starting_stats.ts`: authentic PT 5-stat starting values from `TempNewCharacterInit` and `MorNewCharacterInit` tables.
- Used by the character-select info panel to show authentic PT identity alongside WoC gameplay stats.

**Tribe system (DONE, Jhing):**
- `src/sim/content/pt_tribes.ts`: 3 tribes (Tempskron, Morion, Atlanteon) with class rosters.
- Each tribe has `classIds` (all intended classes) and `implementedClassIds` (subset with full implementation).
- Atlanteon has 3 classes (intentionally, no placeholder for a fourth).
- Tribe logos: Tempskron and Morion have SVG logos; Atlanteon uses a Tempskron placeholder.

**Tribe select UI (DONE, Jhing):**
- `src/ui/pt_tribe_select.ts`: tribe card clicks, back navigation, filtering class list by tribe.
- `src/ui/pt_formation.ts`: 3D formation roster showing tribe members standing in the scene.
- `index.html`: PT tribe select panel with tribe cards and class buttons.
- `data-i18n` and `data-i18n-aria` attributes on all PT class buttons (added by Devin in cleanup).

**Class visuals (DONE, Jhing):**
- 33 VisualDefs in `src/render/characters/manifest.ts` (11 classes x body + 2 hair variants).
- Each PT class has a converted PT character GLB (e.g. `pt_fighter.glb`, `pt_mechanician.glb`).
- `rawHeight` pinned to 49.91 across hair variants to keep body scale constant.
- Clips mapped from PT INX state names (STAND, WALK, ATTACK, DAMAGE, DEAD, etc.).
- Per-class assembler scripts in `scripts/pt-port/` (fighter_assembler.ts, mechanician_assembler.ts, etc.).

**System wiring (DONE, Jhing):**
- Equipment rules: all 11 PT classes in `src/sim/equipment_rules.ts` (mail armor, warrior weapons).
- Dev kit roles: all 11 PT classes in `src/sim/content/dev_kit_roles.ts`.
- Loot archetypes: `src/sim/content/delves/drowned_litany_loot.ts` maps PT classes to WoC archetypes (WAR for physical, MAG for priestess/magician, ROG for assassin).
- REWARD_ARCHETYPE: all 11 PT classes mapped to `'warrior'` in `src/sim/data.ts`.
- Community test accounts: all 11 PT classes in `tests/community_test_accounts.test.ts`.
- PBE boost roles: all 11 PT classes wired.
- Skin counts: all 11 PT classes set to 6 (same as warrior).
- Class details: `src/ui/class_details_data.ts` has role/armor/weapons info for each PT class.
- i18n: catalog entries for all class names and aria labels in resolved bundles.

**Test count pins (FIXED, Devin):**
- 8 test files updated from stale WoC class counts (10/15) to 20 classes.
- `character_clipmaps.test.ts` fixed to load `deathModelUrl` for death clip resolution.

### What is missing (Phase B: authentic class kits)

**Abilities (PENDING):**
- All 11 PT classes use `WARRIOR_DEF.abilities` (heroic_strike, revenge, charge, thunder_clap, etc.).
- No PT-specific abilities defined. Each class needs its own skill kit from `skill.ini`.
- No `combat/tempskron_*.ts` or `combat/morion_*.ts` combat suite files exist.

**Talents (PENDING):**
- All 11 PT classes use `WARRIOR_ROWS` (warrior's 6-row talent tree).
- All 11 PT classes use `WARRIOR_TALENTS.specs` (Arms, Fury, Protection).
- No PT-specific talent trees or specs exist.
- PT has no spec system; subclasses are job-change at level 5, not talent specs.

**Starting equipment (PENDING):**
- All 11 PT classes use `worn_sword` + `eastbrook_buckler` + `recruit_tunic` (warrior's starting gear).
- No PT-specific weapons (spear, bow, wand, hammer, etc.) or armor defined.

**Class colors (PARTIAL):**
- Some PT classes have authentic colors (Archer green, Knight blue, Magician orange, Priestess pink, Atalanta teal, Assassin purple, Shaman cyan, Martial Artist gold).
- Fighter, Mechanician, Pikeman reuse warrior's `0xd67a54`.

**Job change system (PENDING):**
- PT has job change at level 5 (`*CHANGE_JOB_LEVEL 5` in `hotuk.ini`).
- Fighter -> Pikeman or Archer at level 5.
- Mechanician -> Assassin or Martial Artist at level 5.
- Morion classes (Knight, Atalanta, Priestess, Magician) are already post-job-change.
- WoC has no branching class system. Open decision #6.

**Max level (PENDING):**
- PT goes to 249 (`*MAX_LEVEL 249` in `hotuk.ini`).
- WoC caps at `MAX_LEVEL`. No adjustment for PT. Open decision #7.

**Guide stills (PENDING, pre-existing gap):**
- 10 of 11 PT class guide stills are missing (only `player_tempskron_fighter.webp` exists).
- `npm run wiki:stills` script is broken (esbuild can't handle `import.meta.url` in IIFE format).
- `tests/guide.test.ts` fails on the 10 missing stills. See `docs-botro/known-gaps-after-pt-merge.md`.

**Tribe card labels (PENDING, pre-existing gap):**
- Tribe card names (TEMPSKRON, MORION, ATLANTEON) and class lists in `index.html` are hardcoded English.
- Class buttons and subtitle ARE i18n-wired (fixed by Devin in cleanup).
- Tribe labels need new catalog keys for proper nouns / brand names.

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

### 7.2 Phase B: Authentic class kits (PENDING)
- Replace `WARRIOR_DEF.abilities` with PT-specific ability lists for each class
- Create per-class combat suites (`combat/tempskron_fighter.ts`, etc.)
- Define PT-specific talent trees (or decide PT uses a different progression system)
- Add PT-specific starting equipment (PT weapons and armor)
- Implement job change system (open decision #6)
- Adjust max level if needed (open decision #7)
- Fix guide stills for 10 missing PT classes
- i18n-wire tribe card labels

**Exit criteria**: PT class system works with job change, class skills, and progression.

---

## Phase 8: Mount port (PARTIAL: 8.1 done)

**Dev**: Botro (8.1)
**Goal**: Convert PT mount models and add them as WoC mounts.

### 8.1 Convert mount models (DONE, Botro)

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

## Phase 9: Polish and integration (PENDING)

**Dev**: Unassigned
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

## Phase 10: Particle/effect port (PENDING)

**Dev**: Unassigned
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
Phase 0 (NPC models) DONE ──> Phase 1 (NPC visuals) PENDING ──┐
                                                               ├──> Phase 3 (Maps) PENDING ──> Phase 4 (Monsters) PARTIAL ──> Phase 6 (Quests) PENDING
Phase 2 (Items) PARTIAL ────────────────────────────────────────┘
                                                               Phase 10 (Particles) PENDING ──> Phase 5 (Skills) PENDING ──> Phase 7 (Classes) PARTIAL
                                                               Phase 8 (Mounts) PARTIAL ───────────────────────────────────────────────────> Phase 9 (Polish) PENDING
```

Phases 0, 2, 8, 10 can run in parallel (independent asset conversions).
Phase 3 (maps) is the critical path: it unblocks 4 and 6.
Phase 10 (particles) must come before Phase 5 (skills) so skills port with their effects attached.
Phase 5 (skills) and 7 (classes) are coupled.

## Recommended execution order

1. **Phase 0**: NPC model conversion (DONE, Botro)
2. **Phase 2.1**: Item 3D model conversion (DONE, Botro); item icons, stats, and defs (PENDING)
3. **Phase 8.1**: Mount model conversion (DONE, Botro); mount visuals and runtime (PENDING)
4. **Phase 10**: Particle/effect asset conversion (parse .part files, convert effect textures; parallel with 2 and 8, not started)
5. **Phase 1**: NPC visual wiring (after 0, not started)
6. **Phase 4**: Monster content wiring (Bargon + Hopy done by Botro, 316 pending)
7. **Phase 3**: Map/zone port (the hard one, needs focused effort, not started)
8. **Phase 5**: Skill port (after 10 so effects are ready, and after class decision, not started)
9. **Phase 6**: Quest port (after 1, 3, 4 are done, not started)
10. **Phase 7 Phase B**: Authentic class kits (after 5, replaces warrior placeholder abilities)
11. **Phase 9**: Polish (last, not started)

The key insight: all asset conversion (models, icons, textures, particles) happens first
in parallel. Then content wiring (visuals, stats, skills, quests) uses those assets
with effects attached from the start, no retrofitting.

## Tools we have and need

### Existing tools (reuse)
- `scripts/pt-port/glb_assembler.ts`: SMD/SMB/INX/BMP/TGA -> GLB (works for monsters, NPCs, mounts) (Botro)
- `scripts/pt-port/batch_convert.ts`: batch converter (extend for npc/mount categories) (Botro)
- `scripts/pt-port/converter_api.ts`: HTTP API for the converter UI (Botro)
- `scripts/pt-port/viewer.html`: GLB viewer with animation/skeleton/wireframe + category/search filtering (Botro)
- `scripts/pt-port/bmp_to_png.ts` / `tga_to_png.ts`: texture converters (Botro)
- `scripts/pt-port/smd_parser.ts` / `inx_parser.ts`: PT format parsers (Botro)
- `scripts/pt-port/mount_glb_assembler.ts`: mount-specific GLB assembler (Botro)
- `scripts/pt-port/static_glb_assembler.ts`: skeletonless item GLB assembler (Botro)
- `scripts/pt-port/*_assembler.ts`: per-class character model assemblers (Jhing, 11 files)
- `scripts/pt-port/diag_physique.ts`: physique/skinning diagnostics (Botro)
- `scripts/pt-port/verify_glbs.ts`: GLB validation (Botro)
- `scripts/pt-port/check_mount.ts`: mount-specific validation (Botro)

### Tools to build
- PT heightmap -> WoC HeightStamp converter (Phase 3)
- PT skill.ini parser (Phase 5)
- PT quest text parser (Phase 6)
- PT rPTDB database extractor (Phase 4, for monster/item stats)
- PT item icon batch converter (Phase 2.2)
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
- Class system: `src/sim/content/classes.ts` (ClassDef), `src/sim/content/pt_tribes.ts` (PtTribeDef), `src/sim/content/pt_starting_stats.ts`
- Class visuals: `src/render/characters/manifest.ts` (`player_tempskron_*`, `player_morion_*`, `player_atlanteon_*` entries)
- Class talents: `src/sim/content/talent_rows.ts`, `src/sim/content/talents.ts`
- Class combat: `src/sim/combat/` (per-class suites, no PT files yet)
- Mount system: `src/sim/` (mount logic), `src/render/characters/manifest.ts` (mount visuals)
- Death model swap: `src/render/characters/visual.ts` (enterDeath/revive), `tests/death_model_swap.test.ts`
- Tribe select UI: `src/ui/pt_tribe_select.ts`, `src/ui/pt_formation.ts`, `index.html`
- i18n: `src/ui/i18n.locales/` (per-locale overlays), `src/ui/i18n.resolved.generated/` (resolved bundles)
