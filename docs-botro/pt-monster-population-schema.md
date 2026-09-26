# PT Monster Population Schema (Phase 6H-1)

Data pipeline only. **No runtime monster spawning exists or is wired** — this
document describes how PT source population data flows into generated
artifacts. Runtime consumption is Phase 6H-2+.

```
server/GameServer/Field/<field>.ase.spm   (GB2312 text: types/weights/caps)
server/GameServer/Field/<field>.ase.spp   (binary: 200 spawn anchors)
server/GameServer/Field/<field>.ase.spc   (binary: fixed NPCs, counted only)
server/GameServer/Monster/*.inf           (GB2312: monster definitions)
        |
        v   scripts/pt-port/lib/population.mjs  (readers + registry)
        v   scripts/pt-port/pt_map.mjs          (population-all / compile)
        v
generated/pt-maps/<id>/population.generated.ts   (per field)
generated/pt-maps/monster_registry.generated.ts  (shared registry)
generated/pt-maps/population.json                (coverage summary)
```

Regenerate: `node scripts/pt-port/pt_map.mjs population-all` (surgical —
touches only population artifacts) or `pt_map.mjs compile-all` (full pipeline;
population emitted per field like terrain/stage modules).

## Source formats

### `.spm` — population config (GB2312 text)

| Directive | Chinese | Meaning |
|---|---|---|
| `*ACTOR "name" N` | `*怪物种类` | Weighted regular type; `N` is a relative weight, not a percent |
| `*BOSS_ACTOR "master" "slave" C h…` | `*BOSS种类` | Scheduled boss; up to 32 wall-clock hours |
| `*MAX_ACTOR_POS N` | `*怪物总数` | Field live-cap (`LimitMax`, server default 10) |
| `*DELAY s [t]` | `*出现间隔` | `s` = shift → tick mask `(1<<s)-1` (OpenInterval); `t` = per-anchor lockout **seconds** → `dwIntervalTime` ms |
| `*MAX_ACTOR N` | `*数量` | Max live monsters **per anchor** (`OpenLimit`, default 3) — NOT group size |

`//` lines are dead. Unmatched `*ACTOR` names are silently dropped by the
server (weight removed, no slot consumed) — see Unresolved references.

### `.spp` — spawn anchors (binary)

200 fixed records of 12 bytes: `{ state:i32, x:i32, z:i32 }`. `state!=0`
marks an authored anchor; `x`/`z` are **PT map units** (server multiplies by
`fONE`=256 when placing). Slot index is the anchor identity — the server's
per-anchor counters (`StartPointMonCount`, `dwStartPoint_OpenTime`) index it.

### `.inf` — monster definitions (GB2312 text)

| Tag | Field | Role |
|---|---|---|
| `*名字` | name | **`.spm` join key** (display name, not filename) |
| `*外型文件` | model | `char\monster\<dir>\<name>.INI` asset path |
| `*组织` | group | `GenerateGroup[0..1]` group-size range |
| `*等级` | level | level |
| `*属性` | kind | record kind (`怪物`) |
| `*音效` | sound | sound code |
| `*活动时间` | activeTime | activity window (`无限制` = unrestricted) |

## Generated schema

### `population.generated.ts` (per field)

```ts
PT_FIELD_POPULATION = {
  fieldId, fieldIndex, aseStem,
  status: 'populated' | 'no-actors' | 'no-source',
  source: { spm, spp, spc, npcRecords },       // provenance paths + NPC count
  limits: { limitMax, delayShift, delayLockoutSec,
            openIntervalMask, openLimit } | null,
  pecetageCount,                              // total weight, resolved actors only
  commentedActors, commentedBosses,           // dead-source provenance
  actors: [{ index, name, weight, openStart, monster, unresolved }],
  bosses: [{ index, master:{name,key,unresolved},
             slave:{name,key,unresolved}, slaveCount, hours[] }],
  spawnAnchors: [{ index, x, z }],            // raw PT map units
  sppSlots,
  unresolved: [names],
}
```

- `status`: `no-source` (no `.spm` — server default caps, no spawns),
  `no-actors` (`.spm` exists, zero live actors — ricarten, quest-iv),
  `populated`.
- `openStart`: cumulative weight start **over resolved actors only** —
  exactly the server's `NumOpenStart` semantics.
- `delayShift`/`delayLockoutSec` are raw authored values;
  `openIntervalMask` is the derived `(1<<s)-1` mask (source-exact formula).
  Neither is a fabricated "seconds" field.
- Anchors keep raw PT coordinates — transforms are applied at runtime by the
  existing `pt_field.ts` transform, never baked in.

### `monster_registry.generated.ts` (shared)

```ts
PT_MONSTER_REGISTRY = [{ key, name, inf, kind, model, modelDir, level,
                         group, sound, activeTime, variant, stem,
                         asset, dieAsset }]
PT_MONSTER_BY_NAME  = { "<name>": { key, alternates: [...] } }
```

- `key` = `.inf` filename stem lowercased — unique, source-derived, stable.
- `asset`/`dieAsset` point into `scripts/pt-port/converted/monster/` (tooling
  outputs; runtime visual registration is a later phase).

## Deterministic identity / collision policy

411 `.inf` files define 378 unique names — 32 names collide across variants
(level tiers like `BOSS_135_death_knight`/`BOSS_150_death_knight`, `VIP_`
dungeon variants, `event_` variants). The server resolves by
`FindFirstFile` enumeration order, which is filesystem-dependent and is NOT
reproduced here. Canonical pick:

1. lowest variant rank — `base` < `vip` < `event` (filename prefix)
2. lowest authored `*等级`
3. lexicographic stem (stable tiebreak)

Non-canonical variants stay listed under `alternates` — nothing is hidden.
Example: `凯尔维苏` → `boss_155_kelvezu`, alternates
`[boss_165_kelvezu, boss_190_kelvezu]`.

## Unresolved references

`矿山开采者` (mine-1 `*ACTOR`, weight 20) has no `.inf` — the server silently
drops it. Generated data keeps it visible:
`{ monster: null, unresolved: 'no-inf', openStart: null }` and the field's
`unresolved` list. Not mapped to a guess; not dropped from provenance.

## Group semantics

`*数量`/`OpenLimit` caps monsters **per anchor**; actual group size comes from
the monster's `.inf` `*组织 min max` (`GenerateGroup`), sampled per spawn.
Both are preserved separately.

## Boss separation

`*BOSS_ACTOR` records emit under `bosses[]` — never merged into `actors`.
Hours are raw wall-clock values; positions are hard-coded in the server's
`rsOpenBossMonster` and intentionally not part of this schema (boss runtime
is a later phase).

## Coordinates

Anchors carry raw PT map units. Conversion to WoC world coords happens at
runtime through the existing `pt_field.ts` transforms (continent X-mirror or
per-field band) — unchanged by this pipeline. The generated record preserves
the source value so `source PT → generated → world` stays auditable.

## Coverage (from generated/pt-maps/population.json)

| Metric | Value |
|---|---|
| Fields | 70 (61 populated, 2 actor-less, 7 source-empty) |
| Live `*ACTOR` entries | 331 |
| `*BOSS_ACTOR` records | 17 across 16 fields |
| Spawn anchors | 4,936 |
| Unique referenced names | 248 (247 resolved, 1 unresolved) |
| `.inf` defs / names / collisions | 411 / 378 / 32 |
| `.spc` NPC records | 153 (provenance only) |
