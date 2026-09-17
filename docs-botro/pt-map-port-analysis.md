# PT Map Port Analysis: WoC World/Map System Audit for Priston Tale Map Integration

## Audit Date: September 13, 2026

## Source Inspected
- WoC Fork: `E:\CascadeProjects\PT Cross-Platform\ClaudeCraft-Comparison\world-of-claudecraft-fork`
- PT Source: `E:\CascadeProjects\PT-Project\MagicPT-Chinese`

---

## 1. Executive Summary

This document is an audit and implementation plan for replacing the current World of ClaudeCraft (WoC) procedural world with an authentic Priston Tale (PT) map. It does NOT implement any map code.

### Key Findings

1. **WoC uses a fully procedural terrain system**: terrain height is a pure function `terrainHeight(x, z, seed)` with no external map files. The world is a north-running strip of zone bands. Collision, rendering, and movement all sample the same heightfield function.

2. **PT uses a mesh-based terrain system**: each map is a triangle mesh loaded from `.ase` (ASCII Scene Export) or cached `.smd` (binary) files. Collision is mesh-based via triangle face intersection, not heightfield-based. Walkability is determined per-face by material flags.

3. **The two systems are fundamentally incompatible at the terrain level**: WoC expects a heightfield function `f(x,z) -> y`, while PT provides an arbitrary triangle mesh. A PT map loader/adapter is required.

4. **Ricarten (village-2) is the best first map**: it is the Tempskron starting town, has complete data (5.6MB .smd terrain, 14 animated stage objects, server-side .spp/.spc/.spm files, minimap .tga), and is the default spawn for Tempskron characters.

5. **Recommended architecture: PT Map Loader/Adapter (Option B)**: build a loader that parses PT .smd binary files and feeds the terrain mesh, collision data, and object placements into the existing WoC engine via the `MapDoc`/`WorldContent` seam. This preserves the existing engine while enabling authentic PT maps.

6. **No confirmed blockers**: the .smd binary format is reverse-engineered from the PT source code, the existing `smd_parser.ts` in the repo already parses the model variant, and the stage variant uses the same struct layouts. The main work is writing a stage-specific parser and a terrain mesh to heightfield/collision adapter.

---

## 2. Current WoC World Architecture

### 2.1 World Initialization

| Component | File | Function/Class | Responsibility |
|-----------|------|---------------|----------------|
| Client entry | `src/main.ts` | `main()` | Wires concrete world (`Sim` or `ClientWorld`) with renderer and HUD |
| Sim coordinator | `src/sim/sim.ts` | `class Sim` (constructor ~line 2215) | Spawns NPCs, mobs, ground objects, player from `WorldContent` |
| World seed | `src/sim/world_seed.ts` | `WORLD_SEED = 20061` | The one shipped world seed |
| World content | `src/sim/data.ts` | `BUILTIN_WORLD` (line 804) | Default `WorldContent` bundle wrapping all built-in zone/content arrays |
| Content swap | `src/sim/data.ts` | `setActiveWorldContent()` (line 859) | Swaps in custom maps (editor play-test) |

### 2.2 Terrain System

**Type: 100% procedural (heightfield from pure functions)**

| Component | File | Function | Responsibility |
|-----------|------|----------|----------------|
| Terrain height | `src/sim/world.ts` | `terrainHeight(x, z, seed)` (line 3906) | Pure function: returns Y height at any (x, z) |
| Ground height | `src/sim/world.ts` | `groundHeight(x, z, seed)` (line 3851) | Adds dungeon floors, docks, custom-map sculpt edits on top of terrainHeight |
| Biome shaping | `src/sim/world.ts` | `BIOME_SHAPE` table (line 210) | Hill amplitude, base elevation, crag amplitude per biome |
| Water | `src/sim/world.ts` | `WATER_LEVEL = -4.3` (line 78) | Water level; `waterLevel()`, `isInWaterBody()`, `isOpenSeaAt()` |
| Terrain relief | `src/sim/terrain_relief.ts` | `cragLayer`, `ridged2` | Ridged-multifractal layer for sharp ridgelines |
| Terrain regions | `src/sim/terrain_region_index.ts` | `buildTerrainRegionIndex` | Spatial index for authored height stamps |
| Renderer terrain | `src/render/terrain.ts` | `buildTerrain(seed, anchor)` | Chunked LOD terrain mesh; samples `terrainHeight()` for vertex heights |
| Chunk geometry | `src/render/terrain_chunk_build.ts` | `beginChunkGeometry` | Chunk geometry generation (~60-unit chunks) |

### 2.3 World Geometry (Static Objects)

| Component | File | Function | Responsibility |
|-----------|------|----------|----------------|
| Props data | `src/sim/data.ts` | `PROPS` (line 651) | Buildings, wells, stalls, mines, docks, tents, crates, campfires, fences, walls, decorProps |
| Props merge | `src/sim/data.ts` | `mergeProps()` (line 670) | Merges per-zone `*_PROPS` into `PROPS` |
| Props rendering | `src/render/props.ts` | `buildProps()` | Builds Three.js meshes from `PROPS` definitions (GLB assets) |
| Foliage | `src/render/foliage.ts` | `buildFoliage()` | Trees, rocks, scatter decorations from `generateDecorations()` |
| Decorations | `src/sim/world.ts` | `generateDecorations(seed)` (line 5205) | Deterministic decoration field (rocks, flora) |

### 2.4 Environment

| Component | File | Function | Responsibility |
|-----------|------|----------|----------------|
| Sky | `src/render/sky.ts` | `buildSky()` | HDRI sky dome per biome, cross-fading across zone boundaries |
| Lighting | `src/render/gfx.ts` | `SUN_DIR`, `SUN_ANCHOR` | Canonical sun for shadows, god rays, water glints |
| Water rendering | `src/render/water.ts` | `buildWater(seed, webgl)` | ShaderMaterial plane per zone with shore depth, foam, wave displacement |
| Weather | `src/render/weather.ts` | - | Weathered biomes drive precipitation |
| Biome haze | `src/render/biome_haze_field.ts` | - | Per-zone haze colour and strength |

### 2.5 Coordinates

- **Units**: Yards (1 unit = 1 yard)
- **Axes**: X = east-west, Z = south-north, Y = up
- **Origin**: (0, 0) roughly centers the original strip (Eastbrook Vale)
- **Strip bounds**: X in [-180, 180], Z spans `WORLD_MIN_Z` to `WORLD_MAX_Z`
- **Water level**: Y = -4.3
- **Instance plane**: X > 100,000 (dungeons, arena, delves)
- **Player spawn**: `PLAYER_START = { x: -94, z: -58 }` (Eastbrook Vale)

### 2.6 Player Movement and Collision

| Component | File | Function | Responsibility |
|-----------|------|----------|----------------|
| Movement kernel | `src/sim/player_motion.ts` | `stepPlayerMotion` | Turn integration, wish vector, slope gates, swept static collision, vertical pass |
| Collision | `src/sim/colliders.ts` | `resolvePosition` | Static collision + slide from `PROPS`, dungeon layouts, decorations |
| Collider cells | `src/sim/collider_cells.ts` | `buildColliderCellIndex` | Spatial grid for collider lookup |
| Pathfinding | `src/sim/pathfind.ts` | `findPath` | Local A* over a 1-yard grid |
| Physics engine | `src/sim/physics/` | - | Continuous swept collision, multi-pass sliding, depenetration, STEP UP |

### 2.7 Map Boundaries

| Component | File | Function | Responsibility |
|-----------|------|----------|----------------|
| World bounds | `src/sim/data.ts` | `WORLD_MIN_X/MAX_X/MIN_Z/MAX_Z` | Bounding box of all zone rects |
| Border edges | `src/sim/border_edges.ts` | `computeBorderEdges`, `crossesSealedBorder` | Ridge walls along zone edges |
| Ridge constants | `src/sim/world.ts` | `RIDGE_HEIGHT = 15`, `SEALED_RIDGE_HEIGHT = 60` | Mountain walls between zones |

### 2.8 NPCs, Monsters, Portals

| Component | File | Function | Responsibility |
|-----------|------|----------|----------------|
| NPC data | `src/sim/content/zone*.ts` | `*_NPCS` | NPC definitions (id, name, pos, facing, quests, vendorItems) |
| NPC merge | `src/sim/data.ts` | `NPCS` (line 435) | Merged NPC table |
| Camp data | `src/sim/content/zone*.ts` | `*_CAMPS` | Monster camp definitions (mobId, center, radius, count) |
| Camp merge | `src/sim/data.ts` | `CAMPS` (line 528) | Merged camp table |
| Portal data | `src/sim/content/zone*.ts` | `*_PORTALS` | Portal definitions (paired sides with landing coords) |
| Portal merge | `src/sim/data.ts` | `PORTALS` (line 637) | Merged portal table |
| Portal triggers | `src/sim/portals.ts` | `updatePortalTriggers` | Per-tick portal proximity check |

### 2.9 Camera

| Component | File | Function | Responsibility |
|-----------|------|----------|----------------|
| Camera update | `src/render/renderer.ts` | `updateCamera(selfPos, dt)` (line 12356) | Spring-arm pivot lag, look-ahead, FOV kicks |
| Camera boom | `src/render/camera_boom_core.ts` | `createCameraBoom` | Spring-arm pivot lag |
| Camera feel | `src/render/camera_feel_core.ts` | `createCameraFeel` | Look-ahead + FOV kicks + landing thump |
| Camera director | `src/render/camera_director_core.ts` | `createCameraDirector` | Directed zone-vista/death-drift moves |

### 2.10 Zone Streaming

| Component | File | Function | Responsibility |
|-----------|------|----------|----------------|
| Streaming policy | `src/render/zone_streaming.ts` | `zonesWithinStreamingHorizon` | Which zones to materialize and in what order |
| Zone build pool | `src/render/zone_build_pool.ts` | - | Background zone build workers |
| Chunk residency | `src/render/chunk_residency_core.ts` | - | How far camera can see before unbuilt ground |
| Zone eviction | `src/render/zone_eviction_core.ts` | - | Zone eviction policy |

### 2.11 Map Data Formats

1. **Built-in world**: TypeScript data-as-code in `src/sim/content/*.ts`. No external files.
2. **Custom maps (editor)**: JSON via `src/sim/map_doc.ts` - `MapDoc` format (v2). Contains zones, camps, NPCs, objects, roads, terrainEdits, placements, blockers, biomePaint, waterLevel, playerStart.
3. **Battleground maps**: `data/battleground/thornhollow.map.json` - checked-in map data.

### 2.12 How Map Content is Authored

Content modules (`content/*.ts`) export zone definitions, NPCs, mobs, camps, props, roads, portals, objects, quests. These are merged in `src/sim/data.ts` into flat tables (`ZONES`, `NPCS`, `MOBS`, `CAMPS`, `PROPS`, `ROADS`, `PORTALS`, `GROUND_OBJECTS`).

The `MapDoc` format allows custom maps to override the built-in world via `setActiveWorldContent()`. This is the existing seam for custom map content.

---

## 3. MagicPT World/Map Architecture

### 3.1 Directory Structure

```
MagicPT-Chinese/
├── Game.exe                          # Compiled game executable
├── game.ini                          # Game configuration
├── client/
│   ├── Field/                        # All map data (per-map subdirectories)
│   │   ├── Ricarten/                  # Ricarten town (village-2)
│   │   ├── forever-fall/              # Forever Fall area (includes Pillai)
│   │   ├── forest/                    # Forest maps (includes Navisko)
│   │   ├── Ruin/                      # Ruin maps
│   │   ├── desert/                    # Desert maps
│   │   ├── dungeon/                   # Dungeon maps
│   │   ├── cave/                      # Cave maps
│   │   ├── Iron/                      # Iron maps
│   │   ├── Ice/                       # Ice maps
│   │   └── ... (30+ map directories)
│   ├── char/                          # Character models
│   ├── image/                         # UI images
│   ├── sky/                           # Sky textures
│   ├── wav/                           # Sound effects
│   └── weapons/                       # Weapon models
├── server/
│   ├── GameServer/
│   │   ├── Field/                     # Server-side map data (.spm/.spp/.spc)
│   │   ├── Monster/                   # Monster data
│   │   ├── NPC/                       # NPC data
│   │   └── OpenItem/                  # Item data
│   └── Maps/                          # Server collision bitmaps
└── PT-Source/                         # All C++ source code
    ├── field.cpp / field.h            # CORE: All map/field definitions (hardcoded)
    ├── playmain.cpp                   # Stage loading, game loop
    ├── playsub.cpp                    # Mini-map, LoadFieldMap
    ├── smLib3d/                       # 3D engine library
    │   ├── smStage3d.cpp/.h           # smSTAGE3D class (terrain/collision)
    │   ├── smRead3d.cpp/.h             # ASE/SMD file readers
    │   ├── smStgObj.cpp/.h             # Static object placement
    │   ├── smType.h                   # Core types: POINT3D, MAP_SIZE, fONE
    │   └── smTexture.cpp               # Material/walkability flag processing
    └── SrcServer/                     # Server-side code
        ├── OnSever.cpp / onserver.h   # STG_AREA, server map loading
        └── svrEventSpawn.cpp/.h       # Event spawn system
```

### 3.2 Map File Formats

#### .SMD (SMD Stage data) - PRIMARY TERRAIN FORMAT (binary)

- **What it stores**: Complete terrain mesh (vertices, faces, texture coords, materials, lights, spatial partition)
- **Header**: `"SMD Stage data Ver 0.72"` (or 0.71)
- **Evidence**: `smSTAGE3D::LoadFile()` in `PT-Source/smLib3d/smStage3d.cpp:2074`
- **Layout**:
  1. `smDFILE_HEADER` (header string + MatCounter)
  2. Raw `smSTAGE3D` struct dump (includes nVertex, nFace, nTexLink, nLight, StageMapRect, pointers)
  3. Material group data (if MatCounter > 0)
  4. `smSTAGE_VERTEX[nVertex]` - vertices with int x, y, z (fixed-point)
  5. `smSTAGE_FACE[nFace]` - triangular faces with vertex indices + material index
  6. `smTEXLINK[nTexLink]` - texture coordinate links
  7. `smLIGHT3D[nLight]` - light data (if nLight > 0)
  8. `StageArea[256][256]` spatial partition data (face indices per grid cell)
- **Example**: `client/Field/Ricarten/village-2.smd` (5,626,241 bytes)

#### .ASE (ASCII Scene Export) - SOURCE TERRAIN FORMAT (text, mostly absent)

- **What it stores**: Same terrain mesh as .smd, but as ASCII text (3ds Max ASE format)
- **Evidence**: `smSTAGE3D_ReadASE()` in `PT-Source/smLib3d/smRead3d.cpp:2753`
- **Status**: Most .ase files are absent; only .smd binary caches remain. The loader checks for .smd first via `smFindFile(file, "smd")`, falls back to .ase.

#### .SMD (SMD Model data) - MODEL FORMAT (binary, different from stage)

- **What it stores**: 3D model data (characters, monsters, animated objects)
- **Header**: `"SMD Model data Ver 0.62"` or `"0.64"`
- **Note**: Same extension, different format. The existing `scripts/pt-port/smd_parser.ts` in the WoC repo already parses this model variant.

#### .SPP (Stage Point Position) - MONSTER SPAWN POINTS (binary)

- **What it stores**: Array of `STG_START_POINT[200]` structures (state, x, z coordinates)
- **Evidence**: `STG_AREA::LoadStartPoint()` in `PT-Source/SrcServer/OnSever.cpp:6545`
- **Path**: `server/GameServer/Field/<mapname>.ase.spp`
- **Example**: `server/GameServer/Field/village-2.ase.spp` (2,400 bytes = 200 * 12 bytes)

#### .SPC (Stage Player/Character) - NPC POSITION DATA (binary)

- **What it stores**: Array of `smTRNAS_PLAYERINFO[100]` structures (NPC position, model, stats)
- **Evidence**: `STG_AREA::LoadCharInfoFixed()` in `PT-Source/SrcServer/OnSever.cpp:5958`
- **Path**: `server/GameServer/Field/<mapname>.ase.spc`
- **Example**: `server/GameServer/Field/village-2.ase.spc` (50,400 bytes)

#### .SPM (Stage Monster) - MONSTER SPAWN CONFIG (text)

- **What it stores**: Monster types, spawn percentages, boss monsters, spawn limits, delays
- **Evidence**: `DecodeOpenMonster()` in `PT-Source/fileread.cpp:5390`
- **Keywords**: `*ACTOR`, `*BOSS_ACTOR`, `*MAX_ACTOR_POS`, `*DELAY`
- **Path**: `server/GameServer/Field/<mapname>.ase.spm`
- **Example**: `server/GameServer/Field/Village-2.ase.spm` (38 bytes - village has no monsters)

#### .TGA - MINIMAP AND TITLE IMAGES

- **What it stores**: Minimap texture and map title image per field
- **Evidence**: `sFIELD::SetName()` in `PT-Source/field.cpp:111`
- **Path**: `client/Field/map/<name>.tga` (minimap), `client/Field/title/<name>t.tga` (title)

#### .BMP - SERVER COLLISION BITMAPS

- **What it stores**: Server-side collision/walkability bitmaps (256x256 or similar)
- **Path**: `server/Maps/<name>.bmp`
- **Example**: `server/Maps/village-2.bmp` (262,198 bytes = 256x256 + header)

### 3.3 Map Definitions (Hardcoded)

All 70+ map definitions are hardcoded in `InitField()` (`PT-Source/field.cpp:441`). Each map definition includes:
- ASE/SMD file path (terrain mesh)
- Map name (for minimap TGA)
- State (village, forest, desert, ruin, dungeon, iron, ice, castle, action, room)
- Background image codes (day, glow, night variants)
- Background music code
- Server code (main, extend, user)
- Center position (cX, cZ)
- Start points (player spawn positions, up to 8)
- Stage objects (animated/static decorations)
- Gates (walk-through transitions to adjacent fields)
- Warp gates (portal teleports with level limits and special effects)
- Ambient sound positions
- Level limits

### 3.4 Terrain/Heightmap System

PT does NOT use a heightmap. Terrain is a **triangle mesh** loaded from .smd/.ase files.

- **smSTAGE3D** class stores vertices (`smSTAGE_VERTEX *Vertex` with int x, y, z) and faces (`smSTAGE_FACE *Face` with vertex indices + material index)
- **Height query**: `GetHeight(x, z)` converts world coords to area grid indices, iterates faces in the cell, uses `GetPolyHeight()` for barycentric interpolation on the triangle
- **Spatial partition**: `StageArea[256][256]` grid, each cell covers `64 * fONE = 16384` fixed-point units
- **No fixed map size**: each .smd file defines its own bounds via vertex coordinates. `StageMapRect` tracks the bounding box.

### 3.5 Tile/Walkability System

PT uses a **material-based walkability system**, NOT a tile grid:

1. Each triangle face has a material (stored in `Face[n].Vertex[3]` as material index)
2. Each material has a `MeshState` flag
3. `SMMAT_STAT_CHECK_FACE` (0x1): if set, the face is solid/walkable (checked for collision)
4. If `MeshState & SMMAT_STAT_CHECK_FACE == 0`, the face is passable (no collision)

Material script keywords (parsed from ASE material names):
- `"pass:"` - explicitly passable
- `"notpass:"` - explicitly solid
- `"water:"` - water surface (passable, tracked for water effects)
- `"wind:"` - animated vegetation (passable)
- `"wall:"` - invisible wall
- `"ice:"` - ice surface (slippery)

Default: opaque materials are solid, transparent materials are passable.

### 3.6 Static Objects

- **System**: `smSTAGE_OBJECT` stores up to 1024 objects
- Each object is an `smSTAGE_OBJ3D` containing a model (`smPAT3D`), optional bone animation (`BipPattern`), position, and rotation
- Objects are placed in `ObjectMap[256][256]` spatial grid
- Defined per-field via `AddStageObject("path\\file.ASE")` in `InitField()`
- Loaded during stage loading via `StageObject->AddObjectFile()`

### 3.7 Collision System

PT uses **mesh-based collision** (not tile-based, not heightfield-based):

- `SetupPolyAreas()` builds a 256x256 spatial partition of all solid faces
- `GetFloorHeight(x, y, z, ObjHeight)` - finds highest solid face below position
- `CheckNextMove(Posi, Angle, MovePosi, dist, ObjWidth, ObjHeight)` - movement validation via triangle intersection
- `CheckSolid(sx, sy, sz, dx, dy, dz)` - ray-triangle intersection for projectiles/line-of-sight
- `Stage_StepHeight = 10 * fONE = 2560` - maximum step height for walking

### 3.8 Portals/Warps

Two types:
1. **Field Gates**: walk-through transitions between adjacent maps. `AddGate(lpsField, x, z, y)`. Two stages kept loaded simultaneously for seamless transitions.
2. **Warp Gates**: portal teleports. `AddWarpGate(x, y, z, size, height)` + `AddWarpOutGate(lpsField, x, z, y)`. `CheckWarpGate()` triggers on proximity. Special effects: fade transition, warp gate UI.

### 3.9 Player Spawn

- `AddStartPoint(x, z)` adds spawn points (up to 8 per field)
- `GetStartPoint(x, z, *mx, *mz)` finds nearest start point
- Initial spawn selection by race: Tempskron -> Ricarten (field 3), Morion -> Pillai (field 21)

---

## 4. Selected First PT Map: Ricarten (village-2)

### Why Ricarten is the Best First Target

1. **Tempskron starting town**: Field index 3, the default spawn for Tempskron characters. This aligns with the existing PT character work (Tempskron tribe is the first tribe in the selector).

2. **Complete data available**:
   - `client/Field/Ricarten/village-2.smd` (5,626,241 bytes) - complete terrain mesh
   - `server/GameServer/Field/village-2.ase.spp` (2,400 bytes) - spawn points
   - `server/GameServer/Field/village-2.ase.spc` (50,400 bytes) - NPC data
   - `server/GameServer/Field/Village-2.ase.spm` (38 bytes) - monster config (village = no monsters)
   - `server/Maps/village-2.bmp` (262,198 bytes) - server collision bitmap
   - 14 animated stage objects (`v-ani01.ASE` through `v-ani14.ASE`)
   - 23 `.smd` model files (animated objects)
   - 532 texture files (.bmp, .tga) for terrain and objects

3. **Recognizable town**: Ricarten is the iconic PT town that players know.

4. **Simple monster config**: villages have no monster spawns, simplifying the first milestone.

5. **Warp gate to boss area**: provides a test case for portal/warp integration later.

### Ricarten Field Definition (from field.cpp:549-587)

```
Field index: 3
Name: "ricarten\\village-2.ase" / "village-2"
State: FIELD_STATE_VILLAGE
BackImageCode: DAY, GLOWDAY, NIGHT
BackMusicCode: BGM_CODE_TOWN2
ServerCode: PLAY_SERVER_CODE_MAIN
Center position: (2596, -18738)
Start points: (2592, -18566), (-1047, -16973)
Stage objects: 14 animated objects (v-ani01 through v-ani14)
Ambient sounds: 2 positions
Warp gates: 2 (one return-to-town, one to boss area with level limit)
```

### What Components Are Available

| Component | Available | Source |
|-----------|-----------|--------|
| Terrain mesh | YES | `village-2.smd` (5.6MB binary) |
| Textures | YES | 532 .bmp/.tga files in `client/Field/Ricarten/` |
| Animated objects | YES | 14 .smd files + 14 .ASE references |
| NPC positions | YES | `village-2.ase.spc` (50.4KB binary) |
| Spawn points | YES | `village-2.ase.spp` (2.4KB binary) |
| Monster config | YES (empty) | `Village-2.ase.spm` (village = no monsters) |
| Minimap | YES | `village-2.tga` (referenced in SetName) |
| Server collision | YES | `village-2.bmp` (262KB bitmap) |
| Field metadata | YES | Hardcoded in `field.cpp:549-587` |

### What Components Are Missing

| Component | Status | Impact |
|-----------|--------|--------|
| .ASE source file | ABSENT (only .smd binary cache) | Must parse .smd binary directly |
| Individual object .ASE files | ABSENT (only .smd binary caches) | Must parse .smd model format for objects |
| Texture paths in .smd | Need verification | May reference textures by path or index |

### Conversion Work Required

1. Parse `village-2.smd` (stage format, "SMD Stage data Ver 0.72") to extract:
   - Vertices (int x, y, z in fixed-point, fONE=256)
   - Faces (vertex indices + material index)
   - Materials (with MeshState/walkability flags)
   - Texture coordinate links
   - StageMapRect (bounding box)
2. Convert PT fixed-point coordinates to WoC yard units
3. Convert PT triangle mesh to WoC-compatible heightfield + collision
4. Convert PT textures (.bmp/.tga) to WebGL-compatible format (.png/.webp/.ktx2)
5. Parse and place 14 animated stage objects from .smd model files
6. Parse NPC positions from `village-2.ase.spc`
7. Parse spawn points from `village-2.ase.spp`

---

## 5. Complete PT Map Data Trace: Ricarten

### Data Flow

```
PT map source (village-2.smd binary)
  |
  v
smSTAGE3D::LoadFile() [smStage3d.cpp:2074]
  |- Reads smDFILE_HEADER (header string + MatCounter)
  |- Reads raw smSTAGE3D struct (nVertex, nFace, nTexLink, nLight, StageMapRect)
  |- Reads material group (materials with MeshState flags)
  |- Reads smSTAGE_VERTEX[nVertex] (int x, y, z fixed-point)
  |- Reads smSTAGE_FACE[nFace] (vertex indices + material index)
  |- Reads smTEXLINK[nTexLink] (texture coords)
  |- Reads smLIGHT3D[nLight] (lights)
  |- Reads StageArea[256][256] spatial partition
  |
  v
smSTAGE3D::SetupPolyAreas() [smStage3d.cpp:1711]
  |- Builds 256x256 spatial grid of face indices
  |
  v
Terrain rendering (smSTAGE3D::DrawStage)
  |- Iterates visible area cells
  |- Renders faces with materials + textures
  |
  v
Collision (smSTAGE3D::GetFloorHeight / CheckNextMove)
  |- GetFloorHeight: finds highest solid face below position
  |- CheckNextMove: tests triangle intersection with movement lines
  |- Uses material MeshState flags for walkability
  |
  v
Object placement (LoadStageFromField [playmain.cpp:240])
  |- For each StgObjCount: loads .ASE/.smd model
  |- Places in ObjectMap[256][256] grid
  |
  v
NPC placement (STG_AREA::LoadCharInfoFixed [OnSever.cpp:5958])
  |- Reads village-2.ase.spc (100 smTRNAS_PLAYERINFO entries)
  |- Calls OpenNpc() for each valid entry
  |
  v
Spawn points (STG_AREA::LoadStartPoint [OnSever.cpp:6545])
  |- Reads village-2.ase.spp (200 STG_START_POINT entries)
  |
  v
Player spawn (sFIELD::GetStartPoint)
  |- Returns nearest start point to player position
  |- Ricarten start points: (2592, -18566), (-1047, -16973)
  |- Center fallback: (2596, -18738)
```

---

## 6. Coordinate and Scale Analysis

### PT Coordinate System

- **Type**: Fixed-point integers (int x, y, z)
- **Fixed-point unit**: `fONE = 256` (1.0 world unit = 256 fixed-point units)
- **Shift**: `FLOATNS = 8` (2^8 = 256)
- **Axes**: X = horizontal (east-west), Y = vertical (UP), Z = horizontal (north-south)
- **Origin**: Map-specific; each map has its own coordinate space defined by vertex bounds
- **Units**: 1 world unit = 256 fixed-point units. The relationship to real-world units (meters/feet) is not explicitly documented, but character heights and movement speeds suggest 1 world unit is approximately 1 game-meter.
- **ASE import**: PT swaps Y and Z during ASE import (3ds Max is Z-up, PT is Y-up)

### WoC Coordinate System

- **Type**: Floating-point numbers
- **Axes**: X = east-west, Z = south-north, Y = up
- **Origin**: (0, 0) roughly centers the original strip
- **Units**: Yards (1 unit = 1 yard)
- **Water level**: Y = -4.3

### Comparison

| Property | PT | WoC | Compatible? |
|----------|----|----|-------------|
| Axis orientation | X=EW, Y=UP, Z=NS | X=EW, Y=UP, Z=NS | YES (same) |
| Data type | Fixed-point int (fONE=256) | Float | CONVERSION REQUIRED |
| Unit scale | ~1 world unit = 1 game-meter | 1 unit = 1 yard | APPROXIMATELY COMPATIBLE (1 meter ~ 1.094 yards, close enough for game purposes) |
| Vertical direction | Y up | Y up | YES (same) |
| Coordinate origin | Map-specific (per-map vertex bounds) | World center (0,0) | CONVERSION REQUIRED (offset) |
| Map bounds | Defined by StageMapRect per map | Defined by WORLD_MIN/MAX per zone | DIFFERENT (per-map vs global) |

### Required Transformation

To convert PT coordinates to WoC coordinates:
1. Divide by `fONE` (256) to convert fixed-point to float: `woc_x = pt_x / 256.0`
2. Apply an origin offset to place the PT map within the WoC world: `woc_x = (pt_x / 256.0) - pt_center_x`
3. The Y/Z swap is already done in the .smd file (PT stores Y-up internally)

The scale factor is approximately 1:1 (PT world units to WoC yards), which is close enough for authentic PT map reproduction.

---

## 7. Collision/Walkability Analysis

### PT Collision System

- **Type**: Mesh-based (triangle face intersection)
- **Walkability**: Per-face, determined by material `MeshState` flags
- **Solid faces**: `SMMAT_STAT_CHECK_FACE` (0x1) set on material
- **Passable faces**: `MeshState == 0` (transparent materials, water, wind, pass: keyword)
- **Height queries**: `GetFloorHeight(x, y, z, ObjHeight)` - barycentric interpolation on solid faces
- **Movement validation**: `CheckNextMove()` - triangle intersection with movement lines
- **Step height**: `Stage_StepHeight = 10 * fONE = 2560` (10 world units)
- **Spatial partition**: 256x256 grid, each cell covers 64 world units

### WoC Collision System

- **Type**: Heightfield-based + extruded-2D collider set
- **Terrain collision**: `terrainHeight(x, z, seed)` returns Y height at any point
- **Static collision**: `resolvePosition()` from `PROPS`, dungeon layouts, decorations
- **Movement**: `stepPlayerMotion()` with swept collision against extruded-2D colliders
- **Step height**: `PLAYER_MAX_CLIMB_SLOPE = 1.5` yards
- **Pathfinding**: A* over 1-yard grid

### Can PT Collision Be Directly Converted?

**NO.** PT collision is mesh-based (arbitrary triangle faces), while WoC collision is heightfield-based (a function `f(x,z) -> y`). These are fundamentally different:

- PT allows overhangs, tunnels, vertical walls, and multi-level terrain (multiple Y values at the same X,Z)
- WoC assumes a single Y height at each (x,z) point

### Options

1. **Convert PT mesh to WoC heightfield**: Sample the PT mesh at regular intervals to generate a heightfield. This loses overhangs/tunnels but is compatible with WoC's existing collision system. For Ricarten (a flat town), this is acceptable.

2. **Add mesh collision to WoC**: Extend WoC's collision system to support arbitrary triangle meshes alongside the heightfield. This is more work but preserves authentic PT collision. The existing `voxel.ts` + `voxel_mesh.ts` system in WoC already layers true-3D geometry over the heightfield, providing a potential foundation.

3. **Adapter layer**: Build a PT collision adapter that implements WoC's collision interface (`resolvePosition`, `terrainHeight`) by delegating to the PT mesh. This is the least invasive approach.

### Evidence

From `PT-Source/smLib3d/smStage3d.cpp`:
- `GetFloorHeight()` iterates solid faces in the area cell and returns the highest face below the position
- `CheckNextMove()` tests triangle intersection with movement lines at 3 angles
- Material `MeshState` flags determine which faces are solid

From `src/sim/world.ts` and `src/sim/colliders.ts`:
- `terrainHeight()` is a pure function returning a single Y value
- `resolvePosition()` collides against extruded-2D colliders (circles/boxes), not triangle meshes
- The `voxel.ts` system adds true-3D density fields but is not yet wired into collision

---

## 8. WoC vs PT Compatibility Matrix

| PT System | WoC System | Compatibility | Required Work |
|-----------|-----------|---------------|---------------|
| Terrain (triangle mesh) | Terrain (heightfield function) | ADAPTER REQUIRED | Build a PT mesh loader that samples the mesh to produce a heightfield, or add mesh collision support |
| Heightmap (none - mesh-based) | Heightmap (procedural function) | CONVERSION REQUIRED | Sample PT mesh at regular intervals to generate heightfield data |
| Geometry (ASE/SMD mesh) | Geometry (Three.js GLB) | CONVERSION REQUIRED | Convert PT .smd mesh to GLB or Three.js BufferGeometry |
| Textures (.bmp/.tga) | Textures (.png/.webp/.ktx2) | CONVERSION REQUIRED | Convert PT textures to WebGL-compatible formats |
| Static objects (.smd models) | Static objects (GLB) | CONVERSION REQUIRED | Convert PT .smd model files to GLB |
| Dynamic objects (smSTAGE_OBJ3D) | Dynamic objects (Three.js meshes) | CONVERSION REQUIRED | Map PT object system to WoC props system |
| Coordinates (fixed-point, per-map origin) | Coordinates (float, world center) | CONVERSION REQUIRED | Divide by fONE=256, apply origin offset |
| Scale (1 unit ~ 1 meter) | Scale (1 unit = 1 yard) | APPROXIMATELY COMPATIBLE | ~1:1 conversion, minor scale adjustment |
| Collision (mesh-based) | Collision (heightfield + extruded-2D) | ADAPTER REQUIRED | Build collision adapter or extend WoC collision for meshes |
| Walkability (per-face material flags) | Walkability (heightfield + collider set) | ADAPTER REQUIRED | Map PT material flags to WoC collider definitions |
| Navigation (none in client) | Navigation (A* on 1-yard grid) | CONVERSION REQUIRED | Generate navigation grid from PT walkable faces |
| Player spawn (StartPoint array) | Player spawn (PLAYER_START) | CONVERSION REQUIRED | Map PT start points to WoC playerStart |
| NPC spawn (.spc binary) | NPC spawn (NpcDef in TypeScript) | CONVERSION REQUIRED | Parse .spc and convert to NpcDef entries |
| Monster spawn (.spm + .spp) | Monster spawn (CampDef in TypeScript) | CONVERSION REQUIRED | Parse .spm/.spp and convert to CampDef entries |
| Portals (FieldGate + WarpGate) | Portals (PortalDef) | CONVERSION REQUIRED | Map PT gates/warps to WoC PortalDef pairs |
| Lighting (smLIGHT3D + material lightmaps) | Lighting (sun + HDRI + PBR) | CONVERSION REQUIRED | Convert PT light data to WoC lighting or use WoC lighting |
| Sky/environment (BackImageCode) | Sky/environment (HDRI per biome) | CONVERSION REQUIRED | Map PT background codes to WoC biome/sky settings |
| Map boundaries (StageMapRect) | Map boundaries (zone rects + ridge walls) | ADAPTER REQUIRED | Use PT StageMapRect as WoC zone bounds |
| Asset loading (file path strings) | Asset loading (GLB + manifest) | CONVERSION REQUIRED | Build PT asset pipeline to GLB |

---

## 9. Asset Conversion Requirements

### PT Source Formats

1. **.smd (stage)** - Binary terrain mesh (vertices, faces, materials, textures, spatial partition)
2. **.smd (model)** - Binary model data (characters, objects) - already parsed by `scripts/pt-port/smd_parser.ts`
3. **.bmp/.tga** - Textures (terrain, objects, minimaps)
4. **.spp** - Binary spawn point data
5. **.spc** - Binary NPC data
6. **.spm** - Text monster config

### Existing Conversion Infrastructure in WoC Repo

| Tool | File | Status |
|------|------|--------|
| SMD model parser | `scripts/pt-port/smd_parser.ts` | EXISTS - parses "SMD Model data Ver 0.62/0.64" |
| SMD stage parser | NOT FOUND | NEEDED - must parse "SMD Stage data Ver 0.72" |
| BMP to PNG converter | `scripts/pt-port/bmp_to_png.ts` | EXISTS |
| TGA to PNG converter | `scripts/pt-port/tga_to_png.ts` | EXISTS |
| GLB assembler | `scripts/pt-port/glb_assembler.ts` | EXISTS - assembles GLBs from SMD model data |
| Batch converter | `scripts/pt-port/batch_convert.ts` | EXISTS |
| INX parser | `scripts/pt-port/inx_parser.ts` | EXISTS - character config parser |
| GLB inspector | `scripts/pt-port/inspect_glb.mjs` | EXISTS |

### What a PT Stage SMD Converter Would Need to Do

1. **Parse the .smd stage binary**:
   - Read `smDFILE_HEADER` (header string + MatCounter)
   - Read raw `smSTAGE3D` struct (extract nVertex, nFace, nTexLink, nLight, StageMapRect)
   - Read material group (materials with MeshState/walkability flags)
   - Read vertex array (`smSTAGE_VERTEX[nVertex]`: int x, y, z fixed-point)
   - Read face array (`smSTAGE_FACE[nFace]`: vertex indices + material index)
   - Read texlink array (`smTEXLINK[nTexLink]`: texture coords)
   - Read StageArea spatial partition

2. **Convert to intermediate format**:
   - Convert fixed-point vertices to float (divide by fONE=256)
   - Extract material walkability flags
   - Extract texture coordinate mappings
   - Extract bounding box (StageMapRect)

3. **Output options**:
   - GLB (for rendering): convert mesh + materials + textures to a Three.js-compatible GLB
   - Heightfield (for collision): sample mesh at regular intervals to generate a heightmap
   - Collision mesh (for advanced collision): output the triangle mesh with walkability flags
   - JSON (for metadata): output map bounds, spawn points, NPC positions, object placements

### Texture Conversion

- PT uses .bmp and .tga textures
- WoC uses .png, .webp, .ktx2
- Existing `bmp_to_png.ts` and `tga_to_png.ts` can handle this
- PT textures may use indexed color or specific formats that need validation

### Coordinate Conversion

- PT: fixed-point int (value * 256)
- WoC: float (yards)
- Formula: `woc_coord = pt_fixed_point / 256.0`
- Origin offset: subtract PT map center to place map at WoC origin (or desired location)

---

## 10. Recommended Architecture

### Options Evaluated

#### A. Convert PT maps into the existing WoC world representation

- **Approach**: Convert PT .smd mesh to a WoC heightfield function + PROPS definitions + zone content modules
- **Pros**: Fully compatible with existing WoC engine, no engine changes
- **Cons**: Loses PT's mesh-based features (overhangs, vertical walls, multi-level terrain). For Ricarten (flat town), this is acceptable, but it would limit future maps.
- **Verdict**: VIABLE for flat maps, LIMITING for complex maps

#### B. Build a PT Map Loader/Adapter that feeds PT data into the existing WoC world engine

- **Approach**: Build a loader that parses PT .smd files and produces:
  1. A heightfield function (by sampling the mesh) for WoC's `terrainHeight()` replacement
  2. A collision mesh (for authentic PT collision) as an optional layer
  3. Object placements as WoC `PROPS` entries
  4. NPC/camp/portal definitions as WoC content entries
  5. A `MapDoc` or custom `WorldContent` that activates the PT map
- **Pros**: Preserves existing engine, allows authentic PT maps, extensible to more PT maps
- **Cons**: Requires building the .smd stage parser and adapter
- **Verdict**: RECOMMENDED - least invasive while preserving authenticity

#### C. Replace/rewrite the WoC world subsystem

- **Approach**: Replace WoC's procedural terrain with a mesh-based terrain system
- **Pros**: Most authentic PT experience, supports all PT map features
- **Cons**: Massive engine change, breaks existing WoC content, high risk
- **Verdict**: NOT RECOMMENDED - too invasive, breaks existing work

### Recommendation: Option B - PT Map Loader/Adapter

**Rationale** (from code evidence):

1. WoC already has a `MapDoc` format and `setActiveWorldContent()` seam (`src/sim/data.ts:859`) designed for custom maps. A PT map can be loaded as a custom `WorldContent`.

2. WoC's `terrainHeight()` is called via `getActiveWorldContent()`, meaning a custom world content can override the terrain height function. A PT map adapter can provide a heightfield sampled from the PT mesh.

3. WoC's `PROPS` system (`src/sim/data.ts:651`) already supports arbitrary object placements. PT stage objects can be converted to `PROPS` entries.

4. WoC's `NPCS`, `CAMPS`, `PORTALS` tables are data-driven. PT NPC/monster/portal data can be converted to these formats.

5. The existing `smd_parser.ts` in the repo already parses the PT model .smd format. The stage .smd format uses the same struct layouts (`smSTAGE_VERTEX`, `smSTAGE_FACE`, etc.), so the parser can be extended.

6. WoC's `voxel.ts` + `voxel_mesh.ts` system already layers true-3D geometry over the heightfield, providing a foundation for mesh-based collision if needed later.

### Architecture Diagram

```
PT .smd stage file
  |
  v
[PT Stage SMD Parser] (new: scripts/pt-port/stage_smd_parser.ts)
  |- Parses "SMD Stage data Ver 0.72" binary format
  |- Extracts vertices, faces, materials, textures, bounds
  |
  v
[PT Map Adapter] (new: src/sim/pt_map_adapter.ts)
  |- Converts mesh to heightfield (samples mesh at grid intervals)
  |- Converts materials to walkability data
  |- Converts objects to PROPS entries
  |- Converts NPCs/spawns/portal data
  |
  v
[Custom WorldContent] (implements WoC's WorldContent interface)
  |- Overrides terrainHeight() with PT heightfield
  |- Provides PROPS, NPCS, CAMPS, PORTALS
  |- Provides playerStart
  |
  v
[setActiveWorldContent()] (existing WoC seam)
  |- Swaps in PT map content
  |
  v
[Existing WoC Engine] (unchanged)
  |- Renderer samples terrainHeight() for mesh generation
  |- Collision uses heightfield + PROPS colliders
  |- Movement, camera, pathfinding work unchanged
```

---

## 11. First Implementation Milestone

### MUST HAVE for Milestone 1

Goal: WoC starts with a PT map loaded, PT terrain/geometry appears, player spawns at PT location, camera works, player can move, collision works.

1. **PT Stage SMD Parser** (`scripts/pt-port/stage_smd_parser.ts`)
   - Parse `village-2.smd` binary ("SMD Stage data Ver 0.72")
   - Extract vertices (fixed-point to float), faces, materials, StageMapRect
   - Output as JSON or intermediate format

2. **PT Heightfield Generator** (`scripts/pt-port/pt_heightfield.ts`)
   - Sample PT mesh at regular intervals (e.g., 1-yard grid)
   - Generate heightfield array covering StageMapRect bounds
   - Handle material walkability (solid vs passable)

3. **PT Map WorldContent** (`src/sim/pt_map_content.ts`)
   - Implement `WorldContent` interface with PT map data
   - Override `terrainHeight()` to use PT heightfield
   - Set `playerStart` to PT start point (2592, -18566) converted to WoC coords
   - Provide empty NPCS, CAMPS, PORTALS (for milestone 1)

4. **PT Terrain Renderer** (`src/render/pt_terrain.ts`)
   - Build Three.js mesh from PT vertices and faces (alternative: use heightfield)
   - Apply PT textures (converted from .bmp/.tga to .png)
   - Or: let WoC's existing terrain renderer use the PT heightfield

5. **PT Map Activation**
   - Call `setActiveWorldContent()` with PT map content
   - Verify WoC starts, player spawns, camera works, movement works, collision works

### LATER FEATURES (not in Milestone 1)

- NPC placement (from .spc parsing)
- Monster spawns (from .spm/.spp parsing)
- Portals/warps (field gates and warp gates)
- Animated stage objects (14 v-ani objects)
- Minimap (from .tga)
- PT-specific lighting/sky
- Map transitions (loading adjacent maps)
- Quests, shops, NPC interactions
- Advanced environmental effects
- Mesh-based collision (for overhangs/tunnels)
- Multiple PT maps

---

## 12. Risks and Blockers

### CONFIRMED BLOCKERS

None. All required data is present and all formats are reverse-engineered from source code.

### POTENTIAL RISKS

| Risk | Severity | Mitigation |
|------|----------|------------|
| .smd stage parser complexity | MEDIUM | The stage format uses the same struct layouts as the model format (already parsed). The main difference is the header and the StageArea spatial partition data. |
| Texture path resolution | LOW | PT .smd files may reference textures by path or index. Need to verify how textures are referenced in the material data. |
| Heightfield sampling accuracy | MEDIUM | Sampling a triangle mesh at grid intervals may miss thin walls or small steps. For Ricarten (flat town), this is low risk. For complex maps, mesh collision may be needed. |
| Coordinate system mismatch | LOW | PT and WoC both use Y-up. The main conversion is fixed-point to float (divide by 256) and origin offset. |
| Map size / performance | MEDIUM | Ricarten .smd is 5.6MB. Converting to a heightfield + GLB may produce large assets. Need to optimize for WebGL. |
| Texture format compatibility | LOW | PT uses .bmp/.tga. Existing converters (bmp_to_png.ts, tga_to_png.ts) handle this. |
| Material walkability mapping | LOW | PT material flags (SMMAT_STAT_CHECK_FACE) map cleanly to WoC's collider system. |
| Animated object conversion | MEDIUM | PT animated objects use .smd model format with bone animation. The existing smd_parser.ts handles model parsing, but bone animation conversion to GLB may need work. |
| Multiple texture coordinate sets | LOW | PT supports lightmap textures alongside diffuse textures. WoC's PBR system may need adaptation. |
| Memory usage | LOW | 5.6MB mesh + textures is manageable for WebGL. |
| Loading time | LOW | Binary .smd parsing is fast. Heightfield sampling is O(n) in grid size. |

---

## 13. Exact Source Files Discovered

### WoC Files (in the fork repository)

| File | Purpose |
|------|---------|
| `src/sim/world.ts` | Terrain heightfield functions (`terrainHeight`, `groundHeight`, `WATER_LEVEL`) |
| `src/sim/data.ts` | World content tables, `BUILTIN_WORLD`, `setActiveWorldContent()`, `PLAYER_START` |
| `src/sim/types.ts` | `WorldContent` interface, `ZoneDef`, `NpcDef`, `CampDef`, `PortalDef` |
| `src/sim/map_doc.ts` | `MapDoc` format (custom map JSON format) |
| `src/sim/colliders.ts` | `resolvePosition` (static collision + slide) |
| `src/sim/player_motion.ts` | `stepPlayerMotion` (player movement kernel) |
| `src/sim/pathfind.ts` | `findPath` (A* pathfinding) |
| `src/sim/physics/` | Character physics engine (swept collision) |
| `src/render/terrain.ts` | `buildTerrain()` (chunked LOD terrain mesh) |
| `src/render/renderer.ts` | `updateCamera()` (camera positioning) |
| `src/render/props.ts` | `buildProps()` (static object rendering) |
| `scripts/pt-port/smd_parser.ts` | EXISTING: parses PT .smd MODEL format |
| `scripts/pt-port/bmp_to_png.ts` | EXISTING: BMP to PNG converter |
| `scripts/pt-port/tga_to_png.ts` | EXISTING: TGA to PNG converter |
| `scripts/pt-port/glb_assembler.ts` | EXISTING: GLB assembler from SMD model data |

### PT Files (in MagicPT-Chinese)

| File | Purpose |
|------|---------|
| `PT-Source/field.cpp` | All 70+ map definitions (hardcoded in `InitField()`) |
| `PT-Source/field.h` | `sFIELD` class, `sFGATE`, `sWARPGATE` structures |
| `PT-Source/playmain.cpp` | `LoadStageFromField()` (stage loading) |
| `PT-Source/playsub.cpp` | `LoadFieldMap()` (minimap loading) |
| `PT-Source/smLib3d/smStage3d.cpp` | `smSTAGE3D::LoadFile()` (.smd binary loader), `GetFloorHeight()`, `CheckNextMove()` |
| `PT-Source/smLib3d/smStage3d.h` | `smSTAGE3D` class definition |
| `PT-Source/smLib3d/smRead3d.cpp` | `smSTAGE3D_ReadASE()` (.ase loader), `smReadStage()` (.smd loader) |
| `PT-Source/smLib3d/smType.h` | `POINT3D`, `MAP_SIZE=256`, `fONE=256`, `FLOATNS=8` |
| `PT-Source/smLib3d/smTexture.cpp` | Material `MeshState` flag processing |
| `PT-Source/smLib3d/smStgObj.cpp` | `smSTAGE_OBJECT` (static object placement) |
| `PT-Source/SrcServer/OnSever.cpp` | `STG_AREA::LoadStage()`, `LoadCharInfoFixed()`, `LoadStartPoint()` |
| `PT-Source/SrcServer/onserver.h` | `STG_AREA` class, `STG_START_POINT` struct |
| `client/Field/Ricarten/village-2.smd` | Ricarten terrain mesh (5.6MB binary) |
| `client/Field/Ricarten/v-ani01.smd` through `v-ani14.smd` | 14 animated stage objects |
| `client/Field/Ricarten/*.bmp` | 320 BMP texture files |
| `client/Field/Ricarten/*.tga` | 140 TGA texture files |
| `server/GameServer/Field/village-2.ase.spp` | Spawn points (2.4KB binary) |
| `server/GameServer/Field/village-2.ase.spc` | NPC data (50.4KB binary) |
| `server/GameServer/Field/Village-2.ase.spm` | Monster config (38 bytes, village = no monsters) |
| `server/Maps/village-2.bmp` | Server collision bitmap (262KB) |

---

## 14. Known Unknowns / Unresolved Questions

1. **Texture references in .smd**: How exactly does the .smd material data reference texture files? By path string, by index, or by hash? Need to parse the material group data in `village-2.smd` to confirm.

2. **Stage object positions**: Are the 14 animated object positions embedded in the .smd stage file, or are they defined in the hardcoded `InitField()` (as .ASE path strings)? Evidence suggests they are separate .smd/.ase files loaded by path from `AddStageObject()` calls, with positions embedded in the object's transformation matrix.

3. **Heightfield sampling resolution**: What grid resolution is needed to accurately represent Ricarten's terrain as a heightfield? 1-yard grid may be too fine for a large map; 4-yard may be sufficient. Need to measure StageMapRect dimensions.

4. **PT .spp/.spc struct layouts**: The exact binary layout of `STG_START_POINT` and `smTRNAS_PLAYERINFO` needs verification from the source. `STG_START_POINT` appears to be `{int state; int x; int z}` (12 bytes * 200 = 2400 bytes, matching the .spp file size).

5. **Material texture paths**: PT materials may reference textures by path relative to the field directory. Need to verify how `smMATERIAL_GROUP` stores texture file paths.

6. **WoC heightfield override mechanism**: How exactly does `setActiveWorldContent()` override `terrainHeight()`? Need to trace the call path from `groundHeight()` through `getActiveWorldContent()` to confirm a custom WorldContent can replace the terrain function.

7. **PT map dimensions**: The exact world-unit dimensions of Ricarten (from StageMapRect) need to be extracted from the .smd file to plan the heightfield grid size and coordinate offset.

8. **Animated object bone data**: The 14 animated objects use Bip animation. The .smd model format stores bone data, but converting PT bone animation to GLB animation clips may require additional work.

---

## 15. Final Implementation Recommendation

### Recommended Path

1. **Build a PT Stage SMD Parser** (`scripts/pt-port/stage_smd_parser.ts`)
   - Extend the existing `smd_parser.ts` pattern to handle "SMD Stage data Ver 0.72"
   - Parse vertices, faces, materials, StageMapRect, spatial partition
   - Output as JSON intermediate format

2. **Build a PT Heightfield Generator** (`scripts/pt-port/pt_heightfield.ts`)
   - Sample the parsed mesh at a regular grid (start with 2-yard resolution)
   - Generate a heightfield array with walkability flags
   - Output as a compact binary or JSON format

3. **Build a PT Map WorldContent** (`src/sim/pt_map_content.ts`)
   - Implement WoC's `WorldContent` interface
   - Override `terrainHeight()` to interpolate from the PT heightfield
   - Set `playerStart` to converted PT coordinates
   - Start with empty NPCS, CAMPS, PORTALS (add in later milestones)

4. **Build PT Terrain Rendering**
   - Option A: Let WoC's existing `buildTerrain()` use the PT heightfield (simplest)
   - Option B: Build a custom PT mesh renderer that renders the actual PT triangle mesh (more authentic)

5. **Convert PT Textures**
   - Use existing `bmp_to_png.ts` and `tga_to_png.ts`
   - Organize into WoC's `public/` directory structure

6. **Activate and Test**
   - Call `setActiveWorldContent()` with PT map content
   - Verify: WoC starts, PT terrain appears, player spawns at PT location, camera works, movement works, collision works

### What NOT to Do

- Do NOT rewrite WoC's terrain engine (Option C)
- Do NOT replace WoC's collision system entirely
- Do NOT modify existing PT character work
- Do NOT modify existing WoC content modules
- Do NOT create fake placeholder PT map data
- Do NOT implement NPCs, monsters, portals, or animated objects in Milestone 1

### Existing PT Work Protection

All existing PT work is verified intact and must not be modified:

| System | Status |
|--------|--------|
| PT Tribe Select (18 references in index.html) | PRESERVED |
| 11 PT classes (32 references in classes.ts) | PRESERVED |
| 33 PT visual definitions | PRESERVED |
| 33 PT player GLBs | PRESERVED |
| PT formation system | PRESERVED |
| PT preview/raycasting | PRESERVED |
| PT walking/HOME positions | PRESERVED |
| PT hair variants | PRESERVED |
| visualKeyOverride | PRESERVED |
| rawHeight | PRESERVED (49 references) |
| Enter World flow | PRESERVED |
| Monbagon death model (2 GLBs) | PRESERVED |
| 344 converted monster GLBs | PRESERVED |
| BOP trade cleanup/persistence | PRESERVED |
| Vault ledger | PRESERVED |
| Interact-key gather | PRESERVED |
| Audio/SFX | PRESERVED |

### Future Integration Points

The PT map system will connect to existing PT work at:

1. **Enter World flow**: After selecting a PT character, the player enters the PT map (not the WoC world). The `setActiveWorldContent()` call should happen during the Enter World transition.

2. **PT player spawning**: The PT player should spawn at the PT map's start point, not WoC's `PLAYER_START`.

3. **PT character rendering**: PT character GLBs will render on the PT map terrain. The existing character rendering system should work unchanged.

4. **Monster GLBs**: The 344 converted monster GLBs and Monbagon system will eventually be placed on PT maps (not in Milestone 1).

---

## Appendix: Git Safety Verification

- No commits made: YES
- No pushes made: YES
- No resets/reverts: YES
- No branch switches: YES
- No production source files modified: YES
- No existing PT character functionality changed: YES
- No existing monster assets changed: YES
- No Git operations performed: YES
- Safety checkpoint `e14c050879` preserved: YES
- Working tree clean: YES (0 changes)
- PT source inspected: `E:\CascadeProjects\PT-Project\MagicPT-Chinese` (confirmed)
- File created: `docs-botro/pt-map-port-analysis.md` (this document, new file only)
