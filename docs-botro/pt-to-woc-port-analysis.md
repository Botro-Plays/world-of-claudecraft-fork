# Porting Priston Tale into World of ClaudeCraft Engine

## Analysis Date: September 9, 2026

---

## 1. Project Overview

### Objective
Port the game Priston Tale (PT) into the World of ClaudeCraft (WoC) browser-based engine, replacing WoC's default content with PT's assets, classes, items, mobs, and world.

### Source Materials
- **WoC Repository**: `https://github.com/levy-street/world-of-claudecraft` (MIT license)
- **PT Source**: `D:\From Luis Cezar Matias - Chinese MagicPT` (full client + server source)
- **WoC Fork**: `D:\world-of-claudecraft-fork` (cloned, dev environment set up)

### PT Source Directory Reference
| Path | Contents |
|---|---|
| `D:\From Luis Cezar Matias - Chinese MagicPT\PT-Source\` | Client C++ source (DirectX 11, custom 3D engine) |
| `D:\From Luis Cezar Matias - Chinese MagicPT\PT-Source\SrcServer\` | Server source (SQL, damage, party, events) |
| `D:\From Luis Cezar Matias - Chinese MagicPT\PT-Source\smLib3d\` | Custom 3D library (model loading, rendering, textures) |
| `D:\From Luis Cezar Matias - Chinese MagicPT\PT-Source\sinbaram\` | Game systems (skills, items, inventory, trade, quests) |
| `D:\From Luis Cezar Matias - Chinese MagicPT\Client\` | Game client assets (models, textures, sounds, fields) |
| `D:\From Luis Cezar Matias - Chinese MagicPT\Client\char\monster\` | ~230 monster folders (SMD + SMB + INX + BMP/TGA) |
| `D:\From Luis Cezar Matias - Chinese MagicPT\Client\char\npc\` | ~80 NPC folders |
| `D:\From Luis Cezar Matias - Chinese MagicPT\Client\char\Items\` | Item icons and definitions |
| `D:\From Luis Cezar Matias - Chinese MagicPT\Client\weapons\` | Weapon models (SMD + ASE + textures) |
| `D:\From Luis Cezar Matias - Chinese MagicPT\Client\Field\` | ~30 field/map directories |
| `D:\From Luis Cezar Matias - Chinese MagicPT\DATABASE LIMPIO\` | Clean database backup |
| `D:\From Luis Cezar Matias - Chinese MagicPT\SQL\` | SQL scripts |

---

## 2. WoC Engine Architecture

### Tech Stack
- **Runtime**: Node.js 26, TypeScript
- **Build**: Vite 8, pnpm 10.34.5
- **3D Rendering**: Three.js 0.185.1 (WebGL2)
- **Server**: Node.js with PostgreSQL 16
- **Desktop**: Electron
- **Mobile**: Capacitor (Android + iOS)
- **Database**: PostgreSQL 16 (port 5433)
- **Game Server Port**: 8787

### Architecture: "One Sim, Three Hosts"
The same `src/sim/` code runs in three contexts:
1. **Offline browser** — direct `Sim` instance, no server needed
2. **Online server** — authoritative game loop on port 8787
3. **Headless** — Node.js environment for RL training

### Key Directories
| Directory | Purpose |
|---|---|
| `src/sim/` | Game logic (combat, classes, items, mobs, quests) — zero DOM deps |
| `src/render/` | Three.js rendering, character visuals, terrain, effects |
| `src/ui/` | HUD, menus, inventory, chat, settings |
| `src/net/` | Online client, API, economy, wallet, auth |
| `src/game/` | Client-side game systems (input, camera, audio, mobile controls) |
| `server/` | Authoritative server code |
| `electron/` | Desktop app wrapper |
| `android/` | Android Capacitor project |
| `ios/` | iOS Capacitor project |
| `scripts/assets/` | Offline GLB/texture build pipeline |
| `public/` | Shipped assets (models, textures, audio) |
| `tests/` | Vitest test suite (architecture, parity, content tests) |

### IWorld Seam
The `IWorld` interface (`src/world_api.ts`) is the boundary between sim and client. The renderer and HUD talk only to this interface, never to a concrete world. This means content can be swapped underneath without touching the rendering or UI layer.

### Offline Mode
Available in dev builds via `import.meta.env.DEV`. Runs a local unauthenticated `Sim` with no server. Accessed via a mode-select dropdown on the start screen. Production builds hide this option.

---

## 3. WoC Asset Pipeline

### 3D Models (Props, Buildings, Environment)
WoC uses a **procedural image-to-GLB pipeline**:
1. Start from a reference image
2. Write a procedural Three.js factory (`model.js`) — geometry via code
3. Export to GLB via headless Puppeteer + GLTFExporter
4. Optimize via `build_assets.mjs` (meshopt compression, pruning, KTX2 textures)
5. Validate with structural tests (triangle counts, byte sizes, bounds)
6. Integrate via a render adapter module

### Characters & Creatures
- **GLB-loaded rigged models** — not procedural
- Modular body system: one GLB (`warrior_modular.glb`) contains all body parts, hair, armor on shared `Rig_Medium` (23 joints)
- Face customization via morph targets (8 paired sliders)
- Colors are material-level (skin, hair, eye recoloured at runtime)
- Stubble/beards are runtime texture decals, not meshes

### Character Manifest
- `src/render/characters/manifest.ts` — `VISUALS: Record<key, VisualDef>` with `ClipMap` factories
- Dispatch: `visualKeyFor(e)` → `FAMILY_KEYS`/`MOB_KEYS`/`NPC_KEYS`
- Adding a creature: drop GLB in `public/models/`, add `VisualDef`, run media manifest build

### Art Style
- **Low-poly stylized** models from CC0 kits (KayKit, Quaternius, Kenney)
- Character GLBs: 400-800 KB each
- Creature GLBs: 100-500 KB (bosses up to 1.8 MB)
- Vertex color is primary palette; textures are a last resort
- KTX2/Basis texture compression for GPU memory efficiency

### Icons
- Layered painter system (auto-generated fallback + curated art on top)
- CraftPix ability icons in `public/ui/skills/` (non-MIT license — must replace for redistribution)

### Audio
- SFX: Procedurally generated + curated sounds, SFX Studio authoring tool
- Music: Procedural composition + streamed remasters with zone crossfading
- Bundled ffmpeg-static/ffprobe-static — no system FFmpeg needed

### Game Data
All in `src/sim/`:
- **Classes**: `src/sim/content/classes.ts` (abilities, talents, signatures)
- **Items**: `src/sim/data.ts` (`ITEMS` table)
- **Mobs**: `src/sim/data.ts` (`MOBS` table)
- **Quests**: `src/sim/data.ts` (`QUESTS` table)
- **Zones**: `src/sim/data.ts` (`ZONES` table)
- **Combat**: `src/sim/combat/` (formulas, CC, mitigation)

---

## 4. Priston Tale Source Analysis

### Source Location
`D:\From Luis Cezar Matias - Chinese MagicPT`

### Directory Structure
| Path | Contents |
|---|---|
| `PT-Source/` | Client C++ source (DirectX 11, custom 3D engine) |
| `PT-Source/SrcServer/` | Server source (SQL, damage, party, events) |
| `PT-Source/smLib3d/` | Custom 3D library (model loading, rendering, textures) |
| `PT-Source/sinbaram/` | Game systems (skills, items, inventory, trade, quests) |
| `Client/` | Game client assets (models, textures, sounds, fields) |
| `Client/char/monster/` | ~230 monster folders |
| `Client/char/npc/` | ~80 NPC folders |
| `Client/char/Items/` | Item icons and definitions |
| `Client/weapons/` | Weapon models (SMD + ASE + textures) |
| `Client/Field/` | ~30 field/map directories |
| `DATABASE LIMPIO/` | Clean database backup |
| `SQL/` | SQL scripts |

### PT Model Format (Proprietary Binary)

PT does NOT use standard Valve SMD format. The `.smd`/`.smb`/`.inx` files are proprietary binary formats parsed by the custom `smLib3d` engine.

#### File Types
| Extension | Purpose | Format |
|---|---|---|
| `.smd` | Skeletal mesh data (vertices, faces, bones, weights) | Binary |
| `.smb` | Animation/motion data (keyframes per bone) | Binary |
| `.inx` | Index/motion info (maps frames to animation states) | Binary |
| `.ASE` | ASCII Scene Export (3ds Max format) | Text (alternative format) |
| `.inf` | Character configuration (face/hair/body variants) | Text |
| `.bmp` | Texture (256-color or 24-bit) | BMP |
| `.tga` | Texture (with alpha) | TGA |

#### Key Structs (from `smType.h`)
- `smVERTEX` — `{ int x, y, z, nx, ny, nz }` (fixed-point coordinates)
- `smFACE` — `{ WORD v[4], smFTPOINT t[3], smTEXLINK *lpTexLink }` (3 verts + material index + UVs)
- `smMATERIAL` — diffuse color, transparency, self-illumination, up to 8 textures, blend modes, animation
- `smMATRIX` — 4x4 fixed-point matrix (`int` elements, `fONE = 256`)
- `smMOTIONINFO` — animation state: start frame, end frame, event frames, item codes, skill codes
- `smMODELINFO` — model file, motion file, sub-model, motion info array (up to 512 motions)

#### Fixed-Point Math
- `fONE = 256` — fixed-point unit
- Coordinates are integers scaled by 256
- Must convert to float for glTF

#### Bone Naming
From raw SMD data: `Bip01`, `Bip02`, `Bip03`, `Bip04` (3ds Max Biped naming convention)

#### Material System
- `smMATERIAL` supports up to 8 textures per material
- Blend modes: none, alpha, color, shadow, lamp, add-color, inv-shadow
- Script flags: wind, water, animation, not-view, pass, not-pass, blink-color, check-ice
- Texture animation support (32 animated texture handles)

#### PT Classes (from `fileread.h`)
| Tier 1 (Base) | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|
| Mechanician (0x01) | MechanicMaster (0x10) | MetalLeader (0x100) | MetalRage (0x10000) |
| Fighter (0x02) | Warrior (0x20) | Champion (0x200) | Warlord (0x20000) |
| Pikeman (0x03) | Combatant (0x30) | Lancer (0x300) | Bayiolunt (0x30000) |
| Archer (0x04) | HunterMaster (0x40) | DionsDisciple (0x400) | Iskar (0x40000) |
| Assassin (0x09) | Rogue (0x90) | Shadow (0x900) | ShadowMaster (0x90000) |
| MartialArtist (0x0B) | Striker (0xB0) | TrickArtist (0xB00) | CrandMaster (0xB0000) |
| Knight (0x05) | Paladin (0x50) | HolyKnight (0x500) | SaintKnight (0x5000) |
| Atalanta (0x06) | Valkyrie (0x60) | Brunhild (0x600) | Valhalla (0x6000) |
| Priest (0x07) | Saintess (0x70) | Bishop (0x700) | Celestial (0x7000) |
| Magician (0x08) | Wizard (0x80) | RoyalKnight (0x800) | ArchMage (0x8000) |
| Shaman (0x0A) | Summoner (0xA0) | HighSummoner (0xA00) | SoulCatcher (0xA000) |

#### Monster Categories
From `smCHAR_MONSTER_INFO` parsing in `fileread.cpp`:
- `smCHAR_MONSTER_NATURAL` — neutral
- `smCHAR_MONSTER_GOOD` — friendly
- `smCHAR_MONSTER_EVIL` — hostile

Brood types:
- `smCHAR_MONSTER_NORMAL`
- `smCHAR_MONSTER_UNDEAD`
- `smCHAR_MONSTER_MUTANT`
- `smCHAR_MONSTER_DEMON`
- `smCHAR_MONSTER_MECHANIC`

### Sample Monster Asset (hopy)
| File | Size |
|---|---|
| `hopy.smd` | 16,803 bytes |
| `hopy.smb` | 91,512 bytes |
| `hopy.inx` | 95,268 bytes |
| `Monhobi.bmp` | 98,358 bytes (256x256 texture) |

### Sample Monster Asset (Bear)
| File | Size |
|---|---|
| `Ginkgobear.smd` | 48,124 bytes |
| `Ginkgobear.smb` | 2,894,260 bytes |
| `Ginkgobear.inx` | 95,268 bytes |
| `danpung_bear.tga` | 262,188 bytes (256x256 with alpha) |

---

## 5. Porting Plan

### Phase 1: Proof of Concept (Weeks)
**Goal**: Convert one PT monster model to GLB and render it in WoC's offline mode.

1. Write a TypeScript SMD parser based on C++ structs in `smType.h`
2. Parse `hopy.smd` → extract vertices, faces, bones, UVs, material refs
3. Parse `hopy.smb` → extract animation keyframes
4. Parse `hopy.inx` → extract animation state mappings (walk, attack, die, etc.)
5. Convert `Monhobi.bmp` → PNG/WebP
6. Convert PT fixed-point coordinates to float
7. Map PT bone hierarchy (`Bip01`/`Bip02`/`Bip03`/`Bip04`) to glTF joints
8. Assemble GLB with mesh + skeleton + animations + texture
9. Drop into `public/models/creatures/hopy.glb`
10. Add `VisualDef` in `src/render/characters/manifest.ts`
11. Spawn in offline mode, verify it walks/attacks/dies

**Alternative**: Start with ASE files (text format, easier to parse) for weapons first — `weapons/Crown.ASE`, `weapons/Godly_Shield.ASE`.

### Phase 2: One Class Playable (Weeks)
1. Port one PT class (e.g. Fighter) with all skills into `src/sim/content/classes.ts`
2. Convert PT class model (SMD → GLB) with all armor/weapon variants
3. Port a handful of PT items and their icons
4. Port 5-10 PT monsters with stats into `src/sim/data.ts`
5. Adjust combat formulas in `src/sim/combat/` to match PT's system
6. Get combat feeling right in offline mode

### Phase 3: World and Content (Months)
1. Re-author PT's zones and maps as sim data
2. Port remaining classes (all 11 base + tier progressions)
3. Port all ~230 monsters with stats, drops, spawns
4. Port all items, equipment, shops
5. Port quest system
6. Set up multiplayer server with PT's economy
7. Port field maps (decision: procedural re-author vs. direct geometry loading)

### Phase 4: UI and Polish (Months)
1. Reskin HUD to match PT's interface
2. Port PT's music and sound effects
3. Localization (PT supports Korean, Chinese, English, Japanese, Brazilian)
4. Mobile touch controls tuning
5. Performance optimization for large PT world

---

## 6. Technical Challenges

### Model Conversion
- **Binary SMD format**: Must reverse-engineer from C++ source. The structs in `smType.h` and parsing code in `smRead3d.cpp`/`smObj3d.cpp` provide the spec.
- **Fixed-point math**: PT uses integer coordinates scaled by 256. Must convert to float for glTF.
- **Bone retargeting**: PT uses 3ds Max Biped (`Bip01`-`Bip04`). WoC uses KayKit `Rig_Medium` (23 joints). Need to either retarget animations or build a new rig system.
- **Animation state mapping**: PT's `.inx` files map frame ranges to states. Must convert to named glTF animation clips.

### Texture Conversion
- BMP/TGA → PNG/WebP (straightforward via sharp/ImageMagick)
- KTX2/Basis compression for shipped GLBs (via `scripts/assets/compress_glb_textures.mjs`)
- PT textures are 256x256 — small, fine for web

### Game Logic
- PT combat formulas are in `Svr_Damge.cpp` (199 KB) and `Damage.cpp` (29 KB) — must translate C++ to TypeScript
- PT skill system is in `SkillSub.cpp` (144 KB) and `sinbaram/sinSkill.cpp` (285 KB) — extensive
- PT item system is in `sinbaram/sinItem.cpp` (447 KB) — extensive
- PT class/job system is in `fileread.h` — 4-tier progression (base → master → leader → grandmaster)

### World/Terrain
- PT uses tile-based maps with pre-authored geometry in `Client/Field/`
- WoC generates terrain procedurally from sim data at runtime
- **Decision needed**: Re-author PT maps as sim data (WoC way) vs. modify renderer to load PT map files directly

### Server
- PT server is C++ with SQL Server
- WoC server is TypeScript with PostgreSQL
- Must re-author server logic in TypeScript (auth, character persistence, chat, economy, parties, battlegrounds)

---

## 7. What's in Our Favor

- **WoC is MIT licensed** — full freedom to modify and redistribute
- **PT full source available** — client, server, assets, database all present
- **Sim is isolated** — `src/sim/` has zero DOM/browser deps, so rewriting game logic is architecturally clean
- **IWorld seam** — renderer and HUD talk only to the interface, so swapping content is supported by design
- **Tests enforce architecture** — they'll catch boundary violations during porting
- **PT is low-poly too** — art style is compatible with WoC's performance budget
- **Offline mode** — iterate on content without running the server
- **ASE alternative** — some PT assets have text-based ASE files as an easier entry point
- **Three.js GLTFExporter** — can programmatically build geometry and export to GLB
- **@gltf-transform** — available in WoC's dependencies for GLB manipulation

---

## 8. Environment Setup (Completed)

### Machine Specs
| Component | Value |
|---|---|
| OS | Windows 10 Pro (Build 19045) |
| CPU | AMD Ryzen 5 5600G, 6 cores / 12 threads |
| RAM | 32 GB total (~14 GB available) |
| Disk (D:) | ~34 GB free |
| GPU | AMD Radeon (integrated with 5600G) |

### Installed Tools
| Tool | Version |
|---|---|
| Node.js | v26.0.0 |
| pnpm | 10.34.5 |
| npm | 11.12.1 |
| git | 2.55.0 |
| Docker | 29.4.2 |

### WoC Dev Environment
- Repository cloned to `D:\world-of-claudecraft-fork` (8.58 GB, 18,491 files)
- Dependencies installed (1,014 packages, 5m 49s)
- Dev server running at `http://localhost:5173/`
- Offline mode tested and working

---

## 9. PT Source File Reference

### Key Source Files for Porting
| File | Size | Purpose |
|---|---|---|
| `PT-Source/smLib3d/smType.h` | 14 KB | All struct definitions (vertices, faces, materials, matrices) |
| `PT-Source/smLib3d/smRead3d.cpp` | 66 KB | Model file loading (ASE, SMD parsing) |
| `PT-Source/smLib3d/smObj3d.cpp` | 56 KB | 3D object management |
| `PT-Source/smLib3d/smTexture.cpp` | 62 KB | Texture loading and management |
| `PT-Source/smLib3d/smRend3d.cpp` | 100 KB | 3D rendering pipeline |
| `PT-Source/character.cpp` | 559 KB | Character system (rendering, animation, equipment) |
| `PT-Source/character.h` | 36 KB | Character structures and declarations |
| `PT-Source/fileread.cpp` | 197 KB | File I/O (monster, item, character data loading) |
| `PT-Source/fileread.h` | 7 KB | Item/monster struct definitions, class/job codes |
| `PT-Source/playmodel.h` | 206 KB | Model definitions (faces, hair, equipment mappings) |
| `PT-Source/SkillSub.cpp` | 145 KB | Skill/ability system |
| `PT-Source/Svr_Damge.cpp` | 196 KB | Server-side damage calculation |
| `PT-Source/Damage.cpp` | 29 KB | Client-side damage display |
| `PT-Source/sinbaram/sinSkill.cpp` | 285 KB | Skill system (client) |
| `PT-Source/sinbaram/sinItem.cpp` | 447 KB | Item system (client) |
| `PT-Source/sinbaram/sinSkill_Info.h` | 45 KB | Skill data definitions |
| `PT-Source/SrcServer/OnSever.cpp` | 1.1 MB | Main server logic |
| `PT-Source/SrcServer/Svr_Damge.cpp` | 200 KB | Server damage calculation |
| `PT-LevelTable.h` | 6 KB | Level/XP tables |

### Asset Counts
| Category | Count |
|---|---|
| Monster folders | ~230 |
| NPC folders | ~80 |
| Field/map directories | ~30 |
| Weapon models (SMD+ASE) | ~10 (in weapons/) |
| Item icon categories | ~12 (in char/Items/) |

---

## 10. Next Steps

1. **Build SMD parser** — Translate C++ structs from `smType.h` to TypeScript, parse `hopy.smd` as proof of concept
2. **Build SMB parser** — Parse animation keyframes from `hopy.smb`
3. **Build INX parser** — Map animation states from `hopy.inx`
4. **Convert textures** — BMP/TGA → PNG
5. **Assemble GLB** — Mesh + skeleton + animations + texture → `hopy.glb`
6. **Integrate into WoC** — Add `VisualDef`, spawn in offline mode
7. **Iterate** — Fix issues, then scale to more monsters, characters, weapons
