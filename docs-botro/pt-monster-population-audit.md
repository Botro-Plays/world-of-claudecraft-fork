# PT Monster Field Population Audit

Audit-only deliverable for Phase 6G-A. No production code, generated packages,
monster definitions, transforms, or runtime systems were modified. Monsters are
not implemented by this phase.

## 1. Baseline

| Item | Value |
|---|---|
| Repository | `E:\CascadeProjects\PT Cross-Platform\ClaudeCraft-Comparison\world-of-claudecraft-fork` |
| Branch | `safety/map-connections-2025-01` |
| Baseline commit | `ef8f94894d795c09e5ba9cd4321bb36189fe31c7` (`feat(pt): polish PT world visuals and refine field-transition loading`) |
| Remote state | `HEAD == origin/main`, divergence 0/0, working tree clean at start |
| PT source | `E:\CascadeProjects\PT-Project\MagicPT-Chinese` |
| PT reference | `E:\CascadeProjects\PT-Project\exmachina+magicpt\ExMachina` |

Verified pre-audit: `git status --short --branch`, `git rev-parse HEAD`,
`git rev-parse origin/main`, `git diff` — all clean at baseline commit.

## 2. Source .SPM Format

### 2.1 File roles (three distinct formats)

The server field loader `STG_AREA::LoadStage` (`PT-Source/SrcServer/OnSever.cpp`
~line 7239) loads three sibling files per field via `SetFieldInfoPath`
(`OnSever.cpp` ~1639), which strips the subdirectory and emits
`GameServer\Field\<basename>.<ext>` — so the **root** `server/GameServer/Field/`
files are the only ones ever read; subdirectory copies (`不用的\`, `暂时关闭\`)
are dead/disabled variants.

| File | Format | Role | Loader |
|---|---|---|---|
| `.ase.spm` | GB2312 text | Monster population config (types, weights, caps, timing, boss schedule) | `DecodeOpenMonster` (`fileread.cpp` ~5390) |
| `.ase.spp` | binary | 200-slot spawn anchor table `STG_START_POINT{state:int32, x:int32, z:int32}` | `LoadStartPoint` (`OnSever.cpp` ~6545) |
| `.ase.spc` | binary | 100-slot fixed-NPC records `smTRNAS_PLAYERINFO` (504 B each) | `LoadCharInfoFixed` (`OnSever.cpp` ~5958) → `OpenNpc` |

`.spp` coordinates are stored in map units and multiplied by `fONE` (256) at use
(`smType.h` `fONE=256`, `FLOATNS=8`). `.spc` is a separate NPC pipeline and is
out of scope for monster population but inventoried below.

### 2.2 `.spm` directives

Parser: `DecodeOpenMonster` in `PT-Source/fileread.cpp` (~5390), declared in
`fileread.h`. Line-oriented text, `fopen(..., "rb")`, `fgets`, `GetWord` /
`GetString` tokenization. Bilingual GB2312 Chinese / English tags; `//` prefix
comments lines.

| Directive | Chinese | Destination | Semantics |
|---|---|---|---|
| `*ACTOR "name" N` | `*怪物种类` | `rsMonster[i]` | Weighted regular type. `N` is a **relative weight** (not literal %); `NumOpenStart` = cumulative start; `PecetageCount` += N |
| `*BOSS_ACTOR "master" "slave" cnt h…` | `*BOSS种类` | `sBossMonsters[i]` | Scheduled boss: master, slave type, slave count, up to 32 **wall-clock hours** (0–23) |
| `*MAX_ACTOR_POS N` | `*怪物总数` | `LimitMax` | Field-wide live monster cap (default 10 if absent, `OnSever.cpp` ~7269) |
| `*DELAY s [t]` | `*出现间隔` | `OpenInterval`, `dwIntervalTime` | `OpenInterval = (1<<s)`, decremented if >1 → `(2^s)-1` tick mask; `t` = per-anchor lockout **seconds** → `dwIntervalTime = t*1000` ms |
| `*MAX_ACTOR N` | `*数量` | `OpenLimit` | Max live monsters **per spawn anchor** (default 3) |

Runtime structs (`fileread.h`): `rsSTG_MONSTER[50]`, `sBOSS_MONSTER[16]`,
`rsSTG_MONSTER_LIST { PecetageCount, Counter, LimitMax, OpenInterval,
OpenLimit, dwIntervalTime, sBossMonsters, BossMonsterCount }`.

Parser facts:
- Unmatched `*ACTOR` names are silently skipped (slot not counted, weight
  dropped) — unknown names are ignored, not errors.
- `*DELAY` second arg optional (`quest_IV` uses bare `*DELAY 5` → lockout 0 ms).
- `Counter = 0` (no actors) disables natural spawning for the field.
- Latent source bugs documented for later: partial `ZeroMemory` (boss table not
  cleared on re-parse), no bounds checks beyond table sizes, `rand()%0` if all
  weights zero.

## 3. Source Field Population Inventory

Active set = the 70 generated fields in `generated/pt-maps/maplinks.json`,
each traced to its source `.ase` via the manifest `asePath` (case-insensitive
filesystem match to root `Field\` files).

| Measure | Count |
|---|---|
| Generated PT fields (active) | 70 |
| Fields with `.spm` | 63 |
| Root `.spm` files total | 64 (63 mapped + `Oblivion.ase.spm` orphan — no registered field references `Oblivion.ase`) |
| Fields with `.spp` | 66 |
| Fields with `.spc` | 26 (153 live NPC records total) |
| Live `*ACTOR` entries (across all fields) | 331 |
| Unique monster names referenced (types + boss master/slave) | 248 |
| `*BOSS_ACTOR` records | 17 (across 16 fields) |
| Active `.spp` spawn anchors (state≠0) | 4,936 |

### 3.1 Special cases

| Case | Fields | Evidence |
|---|---|---|
| No `.spm` at all | `office`, `pilai`, `ice-ura` (`ice_ura.ASE`), `castle`, `fall-game` (`fall_game.ASE`), `town1`, `dc1` (`dark_boss.ASE`) | `DecodeOpenMonster` returns FALSE → `LimitMax=10`, `Counter=0`, no natural spawns. ExMachina supplies reference `.spm`s for `castle`, `office`, `pilai`, `fall_game`, `swamp`. `Stemple`/`swamp` are registered server fields but are not in the generated 70-field set |
| `.spm` with zero live actors | `ricarten` (`Village-2.ase.spm` — header only: total 30, delay `5 9`, qty 2), `quest-iv` (`quest_IV.ASE.spm` — total 70, bare `DELAY 5`, no actors; quest arena is event-driven) | `Counter=0` → spawning disabled |
| Boss fields | `forever-fall-01..04`, `fo2`, `fo3`, `ba1..ba4`, `iron3`, `sod-2`, `ad1..ad3`, `sanc1`, `sanc2` | 17 `*BOSS_ACTOR` lines |
| Commented boss/type templates | `fore-1/2/3`, `de-1`, `iron-1`, `ice1`, `dun-6`, `heartoffire` (7 commented types), `crystalnest` (7 commented types) | `//`-prefixed lines ignored by parser |
| `*ACTOR` placeholders | `crystalnest` (`E8`), `heartoffire` (`H8`), `landofnurwn` (`S1`–`S7`) | Development placeholder names — still resolve to `.inf` defs (see §4) |
| Single-anchor field | `sod-1` (1 active anchor, interval `8 35`, 1 type, weight 100 — HardCore event override forces `rsMonster[0]` at `OnSever.cpp` ~7072) | `.spp` flag analysis |
| `.spc` NPC-dense towns | `ricarten`/`village-2` 48, `pilai` 27, `town1` 17, `office` 12, `village-1` 12, `castle` 7 | Fixed NPC records, separate pipeline |
| Disabled/historical variants | `Field\不用的\*.spm`, `Field\暂时关闭\*.spm` | Never loaded (`SetFieldInfoPath` strips directories); must not be merged into the active matrix |

## 4. Monster Definition / Asset Mapping

### 4.1 Definition chain

`InitMonster()` (`OnSever.cpp` ~1336) enumerates `server/GameServer/Monster/*.inf`
through `smCharDecode` into `chrMonsterList[]` (`smCHAR_INFO.szName`). `.spm`
names join by exact `lstrcmp` on `szName` — filename is irrelevant.

`.inf` format (GB2312): `*名字` = display name (join key — **not** `*名称`),
`*外型文件` = model path `char\monster\<dir>\<name>.INI`, `*组织 a b` =
`GenerateGroup[0..1]` group-size range, `*等级` level, `*音效` sound code,
plus combat/stat fields. Example `4_Hopy.inf`: `*名字 "独角兽"`,
`*组织 2 3`, model `char\monster\Hopy\Hopy.INI`.

### 4.2 Inventory and join results

| Measure | Count |
|---|---|
| `.inf` files | 411 |
| Unique `*名字` keys | 378 (33 name collisions — level tiers and `VIP_` variants, e.g. `死亡骑士` ×2, `凯尔维苏` ×3, `精英*` pairs) |
| Unique live `.spm` names | 248 |
| Names resolving to an `.inf` | 247 |
| Resolved names with model dir + converted GLB | **247 PASS** |

Converted assets: `scripts/pt-port/converted/monster/` holds 345 GLBs (~319
unique monsters + `-die` death variants; 1 known conversion failure:
`firegremlin`).

### 4.3 Classification of live names

| Status | Count | Detail |
|---|---|---|
| PASS (def + model + GLB) | 247 | All weighted types and all 9 boss master/slave names resolve |
| SOURCE GAP | 1 | `矿山开采者` (`mine-1` type) — no `.inf` carries this name; nearest are `矿山机械`, `矿山晶石`, `矿山管理者`. Server silently drops it (weight lost from `PecetageCount`) |
| MISMATCH risk | 32 names | `.inf` name collisions across level/VIP variants; server join = `lstrcmp` first-match in enumeration order, so which variant instantiates is load-order-dependent. WoC must pin a deterministic variant per name |
| MISSING from WoC runtime registry | 246 | Only `pt_hopy` and `pt_bargon` exist as WoC mob templates (`src/sim/content/zone1.ts`) with visuals `mob_hopy`/`mob_bargon` (`src/render/characters/manifest.ts`) — both hand-authored for Eastbrook Vale, not PT fields |

## 5. Spawn Coordinate Mapping

`.spp` anchors are field-local map units; entity positions are `anchor * fONE`
fixed-point. Existing WoC transform (`src/sim/pt_band.ts`, `src/sim/pt_field.ts`)
— unchanged by this audit:

```
PT_SCALE = 0.036
continent: wocX = 139400 + (5585 - ptX) * 0.036   (X mirrored)
           wocZ = (ptZ + 22373) * 0.036
           wocY = (ptY + 259)   * 0.036
fallback (island): anchored to field's own maxX/minZ/minY
```

Transform selection per field: `ptFieldFitsContinent(PT_BOUNDS)` → continent
transform; otherwise per-field band transform (`src/game/pt_dev_maps.ts`).

`.spp` record = `{state, x, z}` int32 × 200; `state` is the authored
enable flag, `x`/`z` are map units (not ×256). Y is resolved at spawn from
stage geometry — the source calls `GetFloorHeight`/`SetPosi` which select the
**top** surface and apply a small upward settle (~2 WoC yd).

## 6. Respawn / Group Semantics

Source-verified (agent source audit of `OnSever.cpp`):

- **Spawn cadence**: `STG_AREA::Main()` ticks at nominal 70 fps; a spawn
  attempt fires when `(Counter & OpenInterval) == 0` and
  `MonsterCount < LimitMax`. `*DELAY 5` → mask `31` → attempt every 32 ticks
  (~457 ms nominal). This is a cadence, not per-monster respawn timing.
- **Weighted pick**: `rand() % PecetageCount` over cumulative `NumOpenStart`.
- **Group size**: `gGroup = GetRandomPos(GenerateGroup[0], GenerateGroup[1])`
  from the monster's `.inf` (`*组织 min max`); ≤0 clamps to 1. `.spm` `*数量`
  (`OpenLimit`) is the **per-anchor concurrency cap**, not group size — do not
  conflate.
- **Anchor gating**: a `StartPoint` fires only if `state`, `StartPointNearPlay`
  (a player is within proximity — refreshed ~every 512 ticks),
  `StartPointMonCount[p] < OpenLimit`, and `dwStartPoint_OpenTime[p] <
  dwPlayServTime`. After use, `dwStartPoint_OpenTime += dwIntervalTime`
  (the `*DELAY` second arg ×1000 ms per-anchor lockout).
- **Group placement**: leader at the anchor; members 2..N on an 8-slot ring
  `±24 map units` (≈96 world units). `SetStartPosNearChar` behavior for
  groups > 8 unverified — flag for implementation.
- **Despawn**: `ReopenCount = 256` decrements every 4 ticks while no player is
  near → monster despawns ~15 s nominal after the last player leaves range.
  "Respawn" is emergent: cadence + caps + lockouts + near-play gating. There
  is no authored per-monster respawn timer.
- **Bosses**: `*BOSS_ACTOR` hours are wall-clock server-local hours. Once per
  calendar day the server rolls `OpenBossTimeMin = rand()%45+1`; at that
  minute of each configured hour, `rsOpenBossMonster` fires (10-min global
  cooldown `dwEventBossMonterTime` between firings). Boss positions are
  **hard-coded** in `rsOpenBossMonster` for known bosses (Babel, Death Knight,
  Kelvezu, Mokova, Fury — `50172*fONE`-style constants), not from `.spp`.
- **Events**: `FIELD_EVENT_NIGHTMARE` gates spawns by game day/night
  (`dwServ_NightDay`, 800 ms per game-minute → hour ≈ 48 s);
  `rsOpenEventMonster(100)` swaps Ricarten night-invasion monsters;
  `Boss.ini` (`Hour,Min,Map,Count,X,Y,Z,Name`) is an independent scheduled
  spawn path; `sod-1` HardCore override forces `rsMonster[0]`.

## 7. Generated Data Audit

Inspected `generated/pt-maps/<field>/{field.generated.ts,
stage_objects.generated.ts,manifest.json}` and `generated/pt-maps/maplinks.json`
for all 70 fields.

| Check | Result |
|---|---|
| Monster population emitted | **None** — zero fields carry any monster record |
| Schema present | `PT_BOUNDS`, terrain/collision arrays, materials, lighting, minimap, walkable/water/decorative face sets, cell offsets; stage modules carry scenery objects + `blendType`; manifests carry gates/warps/starts/limit level |
| Population tokens in `maplinks.json` | None (`monster`/`mob`/`spawn` searches: only player `startPoints` and sea-edge data) |
| Parse-then-drop | None — `scripts/pt-port/` contains **no `.spm`/`.spp`/`.spc` reader**; nothing parses population at all |

Classification: **PARSE → LOST** for the entire source population dataset.
The architecture docs already predicted this: `docs-botro/pt-map-converter-
architecture.md` and `pt-map-port-analysis.md` list server-side `.spp`/`.spm`/
`.spc` as later-phase inputs.

## 8. Runtime Consumption Audit

**Status: E — absent.**

- No population loader exists; `PtMapDescriptor`/field modules expose no
  population member.
- No `createMob`/`addEntity`/`createNpc` call exists in the PT field
  activation path (`src/sim/pt_field_active.ts`, `src/game/pt_field_links.ts`,
  `src/game/pt_dev_maps.ts`).
- The generic WoC mob/camp pipeline exists (`src/sim/content/zone1.ts`
  `CampDef` flow) — `pt_hopy` (camp x≈-95,z≈-10, r20, n4) and `pt_bargon`
  (camp x≈-100,z≈25, r15, n2) ride it, but both are hand-placed Eastbrook Vale
  content, not PT-field population.
- 247 resolvable source monsters + 345 converted GLBs sit unused as runtime
  content (only `mob_hopy`/`mob_bargon` are registered visuals).

## 9. Field Ownership / Two-Slot Interaction

Current two-slot model (`pt_field_active.ts`, `pt_field_links.ts`,
`pt_dev_maps.ts`, `renderer.ts`): active + standby slots own **terrain and
field descriptors only**. The slot system supports standby preload, floor
comparison, gate transitions, and the Phase 6G loading transition — but has
**no entity-ownership semantics**:

- No monster instantiation on activation, no cleanup on deactivation, no
  per-field respawn state, no standby monster lifecycle.
- Source model for reference: PT keeps all fields resident; each `STG_AREA`
  runs `Main()` every tick, spawns only near players (`StartPointNearPlay`),
  and despawns monsters ~15 s after players leave range. WoC's two-slot model
  is stricter — an inactive field isn't even loaded — so per-field population
  state (per-anchor counts, lockout timers, open monster sets) will need a
  lifecycle decision: instantiate on slot-bind, suspend for standby, destroy
  on unbind vs. keep-alive.

## 10. Ground Placement Validation

12 representative fields validated against the real generated fields
(`createPtField` + `groundHeight`/`supportHeight`), converting every active
`.spp` anchor through each field's transform:

| Field | Anchors | Grounded | No floor | Multi-level (>50 u) | Notes |
|---|---|---|---|---|---|
| fore-1 | 53 | 53 | 0 | 0 | clean |
| fore-3 | 53 | 53 | 0 | 0 | clean |
| ruin-1 | 91 | 91 | 0 | 0 | clean |
| de-1 | 125 | 125 | 0 | 0 | clean (desert) |
| dun-1 | 62 | 62 | 0 | 0 | clean (dungeon) |
| ice1 | 101 | 101 | 0 | 0 | clean |
| village-1 | 29 | 29 | 0 | 0 | clean (town field) |
| lost | 91 | 91 | 0 | 0 | clean (island, band transform) |
| mine-1 | 136 | 136 | 0 | 3 | stacked mine geometry — top-surface selection matters |
| sod-1 | 1 | 1 | 0 | 1 | single anchor on a raised structure |
| seaa | 200 | 179 | 21 | 33 | sea arena — ~10% anchors over water/void; PT `GetFloorHeight` may return water plane where WoC has no walkable face |
| ancientw | 175 | 87 | 88 | 0 | **half the anchors unresolvable** — either generated coverage gap or intentional anchors over non-walkable authored space |

Findings:
- Continent-transform fields place cleanly; island fields under the band
  transform also resolve.
- `groundHeight` (lowest containing face) is **not** PT parity for stacked
  geometry — use `supportHeight(x,z,0,+∞)` / `floorHeight` parity for spawn Y
  (mine-1, sod-1, seaa all show divergence).
- `ancientw` and `seaa` need implementation-time investigation: are the
  unresolvable anchors authored on non-walkable surfaces the PT server
  tolerates, or is generated floor coverage incomplete? Either way, spawn
  code needs a no-floor fallback policy (skip anchor vs. clamp vs. Y=0).

## 11. Complete Field Gap Matrix

Legend: `Tot` = `*MAX_ACTOR_POS` (field cap), `Int` = `*DELAY` args,
`Qty` = `*MAX_ACTOR` (per-anchor cap), `T` = live type count, `B` = boss
records, `A` = active `.spp` anchors, `N` = `.spc` NPC records. "Generated"
and "Runtime" are uniformly absent — stated once here and repeated per-row as
`PARSE→LOST` / `—`.

| Field | SPM | Tot | Int | Qty | T | B | A | N | Generated | Runtime | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fore-3 | + | 200 | 5 8 | 1 | 6 | 0 | 53 | 2 | PARSE→LOST | — | MISSING(runtime) |
| fore-2 | + | 200 | 5 8 | 1 | 7 | 0 | 30 | 1 | PARSE→LOST | — | MISSING(runtime) |
| fore-1 | + | 200 | 5 8 | 1 | 5 | 0 | 53 | 0 | PARSE→LOST | — | MISSING(runtime) |
| ricarten | + | 30 | 5 9 | 2 | 0 | 0 | 0 | 48 | PARSE→LOST | — | town / event-only |
| ruin-4 | + | 200 | 5 8 | 1 | 7 | 0 | 97 | 0 | PARSE→LOST | — | MISSING(runtime) |
| ruin-3 | + | 200 | 5 8 | 1 | 6 | 0 | 86 | 1 | PARSE→LOST | — | MISSING(runtime) |
| ruin-2 | + | 200 | 5 8 | 1 | 6 | 0 | 59 | 4 | PARSE→LOST | — | MISSING(runtime) |
| ruin-1 | + | 200 | 5 8 | 1 | 6 | 0 | 91 | 1 | PARSE→LOST | — | MISSING(runtime) |
| de-1 | + | 200 | 5 8 | 1 | 7 | 0 | 125 | 0 | PARSE→LOST | — | MISSING(runtime) |
| village-1 | + | 70 | 5 9 | 1 | 8 | 0 | 29 | 12 | PARSE→LOST | — | MISSING(runtime) |
| de-2 | + | 200 | 5 8 | 1 | 6 | 0 | 83 | 0 | PARSE→LOST | — | MISSING(runtime) |
| de-3 | + | 400 | 5 8 | 1 | 7 | 0 | 103 | 1 | PARSE→LOST | — | MISSING(runtime) |
| de-4 | + | 200 | 5 8 | 1 | 6 | 0 | 96 | 0 | PARSE→LOST | — | MISSING(runtime) |
| dun-1 | + | 300 | 5 8 | 1 | 6 | 0 | 62 | 0 | PARSE→LOST | — | MISSING(runtime) |
| dun-2 | + | 300 | 5 8 | 1 | 6 | 0 | 69 | 0 | PARSE→LOST | — | MISSING(runtime) |
| dun-3 | + | 300 | 5 8 | 1 | 7 | 0 | 82 | 0 | PARSE→LOST | — | MISSING(runtime) |
| office | − | — | — | — | 0 | 0 | 1 | 12 | — | — | MISSING(source .spm) |
| forever-fall-04 | + | 200 | 5 8 | 1 | 6 | 1 | 124 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| forever-fall-03 | + | 200 | 5 8 | 1 | 7 | 1 | 83 | 2 | PARSE→LOST | — | MISSING(runtime) + boss |
| forever-fall-02 | + | 200 | 5 8 | 1 | 6 | 1 | 131 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| forever-fall-01 | + | 200 | 5 8 | 1 | 5 | 1 | 85 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| pilai | − | — | — | — | 0 | 0 | 0 | 27 | — | — | MISSING(source .spm) |
| dun-4 | + | 400 | 5 8 | 1 | 9 | 0 | 78 | 0 | PARSE→LOST | — | MISSING(runtime) |
| dun-5 | + | 400 | 5 8 | 1 | 8 | 0 | 98 | 1 | PARSE→LOST | — | MISSING(runtime) |
| tcave | + | 300 | 5 8 | 1 | 8 | 0 | 50 | 0 | PARSE→LOST | — | MISSING(runtime) |
| mcave | + | 300 | 5 8 | 1 | 8 | 0 | 42 | 0 | PARSE→LOST | — | MISSING(runtime) |
| dcave | + | 300 | 5 8 | 1 | 8 | 0 | 45 | 0 | PARSE→LOST | — | MISSING(runtime) |
| iron-1 | + | 400 | 5 8 | 1 | 8 | 0 | 129 | 1 | PARSE→LOST | — | MISSING(runtime) |
| iron-2 | + | 400 | 5 8 | 1 | 8 | 0 | 162 | 1 | PARSE→LOST | — | MISSING(runtime) |
| ice-ura | − | — | — | — | 0 | 0 | 0 | 4 | — | — | MISSING(source .spm) |
| sod-1 | + | 200 | 8 35 | 1 | 1 | 0 | 1 | 0 | PARSE→LOST | — | event field (HardCore) |
| ice1 | + | 400 | 5 8 | 1 | 7 | 0 | 101 | 0 | PARSE→LOST | — | MISSING(runtime) |
| quest-iv | + | 70 | 5 | 1 | 0 | 0 | 2 | 0 | PARSE→LOST | — | event arena, no actors |
| castle | − | — | — | — | 0 | 0 | 1 | 7 | — | — | MISSING(source .spm) |
| greedy | + | 400 | 5 8 | 1 | 7 | 0 | 153 | 1 | PARSE→LOST | — | MISSING(runtime) |
| ice2 | + | 400 | 5 8 | 1 | 5 | 0 | 67 | 1 | PARSE→LOST | — | MISSING(runtime) |
| boss | + | 400 | 5 8 | 1 | 5 | 0 | 53 | 1 | PARSE→LOST | — | MISSING(runtime) |
| lost | + | 400 | 5 8 | 1 | 6 | 0 | 91 | 0 | PARSE→LOST | — | MISSING(runtime) |
| losttemple | + | 400 | 5 8 | 1 | 6 | 0 | 77 | 0 | PARSE→LOST | — | MISSING(runtime) |
| fall-game | − | — | — | — | 0 | 0 | 0 | 0 | — | — | MISSING(source .spm) |
| dun-7 | + | 400 | 5 8 | 1 | 6 | 0 | 82 | 0 | PARSE→LOST | — | MISSING(runtime) |
| dun-8 | + | 400 | 5 8 | 1 | 6 | 0 | 64 | 0 | PARSE→LOST | — | MISSING(runtime) |
| dun-6 | + | 400 | 5 8 | 1 | 5 | 0 | 64 | 1 | PARSE→LOST | — | MISSING(runtime) |
| dun-9 | + | 400 | 5 8 | 1 | 7 | 0 | 115 | 0 | PARSE→LOST | — | MISSING(runtime) |
| mine-1 | + | 400 | 5 8 | 1 | 7 | 0 | 136 | 1 | PARSE→LOST | — | MISSING(runtime); 1 unresolved name |
| slab | + | 400 | 5 8 | 1 | 5 | 0 | 46 | 0 | PARSE→LOST | — | MISSING(runtime) |
| ancientw | + | 400 | 5 8 | 1 | 5 | 0 | 175 | 0 | PARSE→LOST | — | UNKNOWN(ground: 88 no-floor) |
| lost3 | + | 400 | 5 8 | 1 | 5 | 0 | 121 | 0 | PARSE→LOST | — | MISSING(runtime) |
| fo3 | + | 300 | 5 15 | 1 | 3 | 1 | 48 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| fo2 | + | 300 | 5 15 | 1 | 3 | 1 | 36 | 1 | PARSE→LOST | — | MISSING(runtime) + boss |
| fo1 | + | 400 | 5 8 | 1 | 4 | 0 | 48 | 2 | PARSE→LOST | — | MISSING(runtime) |
| town1 | − | — | — | — | 0 | 0 | 0 | 17 | — | — | MISSING(source .spm) |
| ba1 | + | 300 | 5 15 | 1 | 3 | 1 | 28 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| ba2 | + | 300 | 5 15 | 1 | 3 | 1 | 110 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| ba3 | + | 300 | 5 15 | 1 | 3 | 1 | 107 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| ba4 | + | 300 | 5 15 | 1 | 3 | 1 | 60 | 3 | PARSE→LOST | — | MISSING(runtime) + boss |
| iron3 | + | 300 | 5 40 | 1 | 3 | 1 | 67 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| dc1 | − | — | — | — | 0 | 0 | 0 | 0 | — | — | MISSING(source .spm) |
| sod-2 | + | 70 | 5 50 | 1 | 4 | 1 | 30 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| ice3 | + | 400 | 5 8 | 1 | 5 | 0 | 188 | 0 | PARSE→LOST | — | MISSING(runtime) |
| iron4 | + | 400 | 5 8 | 1 | 5 | 0 | 101 | 0 | PARSE→LOST | — | MISSING(runtime) |
| seaa | + | 400 | 5 8 | 1 | 5 | 0 | 200 | 0 | PARSE→LOST | — | UNKNOWN(ground: 21 no-floor, 33 multi-level) |
| heartoffire | + | 500 | 5 20 | 1 | 1 | 0 | 24 | 0 | PARSE→LOST | — | placeholder types (H8) |
| ad1 | + | 300 | 5 40 | 1 | 4 | 1 | 90 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| ad2 | + | 300 | 5 40 | 1 | 4 | 1 | 78 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| ad3 | + | 300 | 5 40 | 1 | 4 | 1 | 79 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| sanc1 | + | 300 | 5 40 | 1 | 3 | 1 | 54 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| sanc2 | + | 500 | 5 20 | 1 | 3 | 1 | 58 | 0 | PARSE→LOST | — | MISSING(runtime) + boss |
| crystalnest | + | 200 | 5 8 | 1 | 1 | 0 | 16 | 0 | PARSE→LOST | — | placeholder types (E8) |
| landofnurwn | + | 200 | 5 8 | 1 | 7 | 0 | 19 | 0 | PARSE→LOST | — | placeholder types (S1–S7) |

Orphan source data (no generated field): `Oblivion.ase.spm` (mostly commented
actors anyway). Disabled variants under `不用的\` and `暂时关闭\` excluded.

## 12. Source → Generated → Runtime Trace

```
server/GameServer/Field/<f>.ase.spm   (GB2312 text; types/weights/caps/timing/boss)
server/GameServer/Field/<f>.ase.spp   (binary; 200×{state,x,z} anchors, map units)
server/GameServer/Field/<f>.ase.spc   (binary; 100×504B fixed-NPC records — separate pipeline)
server/GameServer/Monster/*.inf       (411 defs; *名字 join key, *外型文件 model, *组织 group)
        │
        ▼  scripts/pt-port/ — NO parser for any of the four inputs
        ▼  PARSE → LOST (entire dataset dropped before generation)
generated/pt-maps/<f>/field.generated.ts     — no population schema
generated/pt-maps/<f>/manifest.json          — gates/warps/starts only
generated/pt-maps/maplinks.json              — no population records
        │
        ▼  runtime
src/sim/pt_field_active.ts, src/game/pt_field_links.ts, pt_dev_maps.ts
        — two slots own terrain + descriptors; zero entity lifecycle
        — no spawn scheduler, no near-play gating, no boss scheduler
src/sim/content/zone1.ts — only pt_hopy/pt_bargon, hand-placed Eastbrook camps
```

Integration state: **E — absent** end-to-end (not definition-only: even
definitions exist only as unregistered converted assets, except two
hand-authored mobs).

## 13. Findings

1. **The source pipeline is complete and well-understood**: `.spm` (text,
   5 directives) + `.spp` (binary anchors) + `.inf` (defs/groups). Parser
   semantics are fully documented from `DecodeOpenMonster`, `STG_AREA::Main`,
   `SetStartPosChar`, and `rsOpenBossMonster`.
2. **The WoC pipeline is a clean zero**: nothing parses, nothing emits,
   nothing consumes. Every generated package is `PARSE→LOST` for population;
   runtime integration is absent (E).
3. **Asset readiness is high**: 247/248 names resolve `.inf` → model →
   converted GLB. The asset layer is not the blocker — the data path is.
4. **Source gaps are small but real**: `矿山开采者` (mine-1) has no `.inf`;
   `Oblivion.ase.spm` is orphaned; 7 generated fields have no `.spm` at all
   (towns/event fields where PT itself spawns nothing — semantically correct);
   2 `.spm` files are intentionally actor-less.
5. **Ambiguity hazards for implementation**: 32 `.inf` name collisions
   (level/VIP variants — server resolves by enumeration order, WoC must pin
   deterministically); `*数量` is a per-anchor cap not group size; `*DELAY`
   arg1 is a tick-mask shift; `.spp` `state` gating is player-proximity-based;
   despawn (ReopenCount 256 → ~15 s) is player-absence-driven, not a respawn
   timer; boss positions are hard-coded server constants, not `.spp` anchors.
6. **Coordinate validation is mostly clean**: 10/12 sampled fields resolve
   100% of anchors. `ancientw` (88/175 no-floor) and `seaa` (21 no-floor, 33
   multi-level) need a no-floor policy. `mine-1`/`sod-1` confirm
   `groundHeight` ≠ PT top-surface semantics — use `supportHeight`/`floorHeight`
   parity at spawn.
7. **`.spc` fixed NPCs are a separate pipeline** (26 files, 153 records,
   town-dense) — inventoried but out of scope for monster population.
8. **Boss sub-system is schedule-based**: wall-clock hours + once-daily
   random minute + hard-coded positions + global 10-min cooldown — a distinct
   implementation workstream from natural spawning.

## 14. Recommended Implementation Sequence

1. **Population readers** (`scripts/pt-port/`): GB2312 `.spm` text parser
   (5 directives, live/commented split), `.spp` binary reader
   (200×12 B `STG_START_POINT`), `.inf` reader (`*名字`/`*外型文件`/`*组织`).
   No new binary formats — match the verified source semantics.
2. **Generated schema**: emit per-field population (type table + weights,
   `LimitMax`, `OpenInterval`, `dwIntervalTime`, `OpenLimit`, boss table,
   active anchors) — either into `field.generated.ts` or a `maplinks.json`
   population record. Include a name→`.inf` resolution report at compile time
   so collisions/gaps surface at build, not runtime.
3. **Monster registry**: deterministic name→def→model→GLB→visualKey
   registration for the 247 resolved monsters; pin the `.inf` variant for the
   32 colliding names; handle `矿山开采者` explicitly (rename, def creation,
   or document-as-dropped matching source's silent skip).
4. **Field-owned population runtime**: population definitions load with the
   field slot; monsters instantiate only in the **active** slot; standby loads
   definitions without entities; deactivation despawns and releases; respawn
   state (per-anchor counts/lockouts) owned per field instance.
5. **Spawn scheduler**: `OpenInterval` cadence + `LimitMax` field cap +
   `OpenLimit` per-anchor cap + `dwIntervalTime` per-anchor lockout +
   near-play gating + `.inf` group-size sampling + ring placement.
6. **Floor placement**: `supportHeight`/`floorHeight` parity for spawn Y;
   no-floor policy for `ancientw`/`seaa` classes of anchors.
7. **Tests + E2E**: unit coverage for parser → schema → scheduler →
   placement; E2E field-population validation on representative fields
   (fore-1, de-1, dun-1, ricarten-no-spawn, a boss field).
8. **Boss/event layer** (after natural spawning lands): wall-clock boss
   scheduler + hard-coded positions + `Boss.ini` path + nightmare/day-night
   gating + event-field overrides.
9. **`.spc` fixed NPCs** (separate phase): 26 files / 153 records, town-heavy;
   feeds the NPC system, not the mob system.

## 15. Explicit Non-Goals / Deferred Items

- No monster spawning, MobTemplates, VisualDefs, camps, parsers, schemas, or
  runtime wiring were implemented in this phase.
- No changes to coordinate transforms, terrain, collision, FieldGate,
  WarpGate, minimap, lighting, or the loading transition.
- `.spc` fixed-NPC population: inventoried, deferred to its own phase.
- Boss hard-coded positions and `Boss.ini` scheduling: documented, deferred
  to the boss workstream.
- `.inf` collision resolution policy (level/VIP variants): flagged, decision
  deferred to implementation.
- `ancientw`/`seaa` no-floor anchor disposition: investigation deferred to
  spawn implementation (skip/clamp policy needed).
- `swamp`/`Stemple` registered server fields absent from the generated
  70-field set: noted; out of scope for the current world map.
- Disabled variants (`不用的\`, `暂时关闭\`) and orphan `Oblivion.ase.spm`:
  documented, never merged.
