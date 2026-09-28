# PT Fixed NPC + Item Schema (O5)

Places the already-converted PT NPC/item content at source-authentic
positions on the online path. Companion to `pt-monster-population-schema.md`
(which covered `.spm`/`.spp`/`.inf`); this document covers the `.spc` fixed
NPC table that phase only counted, the `.NPC` definitions, and the OpenItem
catalog the NPC shops reference.

```
server/GameServer/Field/<field>.ASE.spc  (binary: 100 fixed NPC records)
server/GameServer/NPC/*.NPC              (GB2312: NPC definitions + shops)
server/GameServer/OpenItem/*.txt         (GB2312: item definitions)
        |
        v   scripts/pt-port/lib/pt_npcs.mjs  (parsers + emitters)
        v   scripts/pt-port/pt_npcs.mjs      (driver; enumerates generated
        v                                     population modules)
generated/pt-maps/<id>/npcs.generated.ts     (per field, placed records)
generated/pt-maps/pt_npc_catalog.generated.ts (115 NPC definitions)
generated/pt-maps/pt_item_catalog.generated.ts (1,902 item entries)
generated/pt-maps/npcs.json                   (coverage summary)
```

Regenerate: `node scripts/pt-port/pt_npcs.mjs`. Deterministic; a second run
is byte-identical.

## Source formats

### `.spc` — fixed NPC table (binary, little-endian)

100 records of 504 bytes = one `smTRNAS_PLAYERINFO` each (PT-Source
`field.h` / `STG_AREA::OpenNpc` in `field.cpp`):

```text
int   size                @ +0    (record size; live records carry 504)
int   code                @ +4    (nonzero = live NPC)
smCHAR_INFO smCharInfo    @ +8    (464 bytes: szName@+0, szModelName@+32,
                                 szModelName2@+96 -> .NPC definition)
DWORD dwObjectSerial      @ +472
int   x, y, z             @ +476  (fixed point <<8; divide by 256 for PT
                                 world units, matching the population
                                 convention)
int   ax, ay, az          @ +488  (ay = facing in ANGLE_360 = 4096 units)
int   state               @ +500
```

`.ASE.spc` sits next to the field's `.ASE` stage; the WoC field id's
`aseStem` resolves it (ricarten -> `village-2`, etc.). 104 live records
across the 9 of our registered fields that ship a table (ricarten 48,
pilai 28, town1 17, fore-2 4, mine-1 1, fore-3 2, forever-fall-03 1, fo1 2,
ba4 1); `village-1` carries 12 but has no registered server geometry, so it
is emitted but not registered — matching the population closure contract.

### `.NPC` — NPC definition (GB2312 text, `smCharDecode` in `character.cpp`)

Key directives:

| Directive | Meaning | WoC mapping |
|---|---|---|
| `*名字` | display name (overrides the `.spc` name) | `NpcDef.name` |
| `*外型文件` | model (`char\npc\<dir>\<name>.INI`) | GLB resolution input |
| `*对话` | dialogue line (repeatable) | joined into `greeting` |
| `*攻击物品` / `*防御物品` / `*物品出售` | shop stock lists (item codes) | `vendorItems` union, source order, deduped |
| `*物品保管` | warehouse service | `banker: true` |
| other `*…` service flags | stored in the catalog as `serviceFlags` | not mapped yet |

Item codes are `sItem[].LastCategory` keys (`PL101`, `ps104`, `ec101`, ...).

### `OpenItem/*.txt` — item definitions (GB2312, same `*directive` grammar)

Each file defines one item; `*物品代码`/LastCategory is the join key for
shop codes. Generated catalog entries keep name, code, price, level, and
the HP/MP/stamina recovery ranges. Runtime mapping
(`src/sim/content/pt_items.ts`): recovery ranges -> `potion` items with
midpoint `potionHp`/`potionMp` where WoC has the behavior; everything else
-> `junk` carrying source price/level (WoC has no PT equipment equivalent
yet — a compatibility decision, not a source fact). Item ids are
`pt_<lowercased LastCategory>` and merge into `ITEMS` via `mergeItems`.

## Runtime ownership

- `src/sim/content/pt_npcs.ts` emits `dynamic: true` `NpcDef`s keyed
  `pt_npc_<defKey>` into the shared `NPCS` table, so the world-init surface
  pass skips them and `pt_npc_visuals.ts` can key visuals per template.
- `src/sim/pt_npcs.ts` `ptNpcTick(ctx)` runs after `ptPopulationTick` in
  `sim.ts`: for every ACTIVE `PtFieldSession` (plus the bound dev-map
  descriptor fallback for offline hosts) it spawns the field's authored
  `.spc` set once, stamps `ptField`, floor-resolves Y, converts facing via
  the canonical PT transform (`ptAngleToFacing`, X-mirrored band
  transform), and indexes the entity into the session roster. Draining a
  session releases its NPC ids; re-entry rebuilds deterministically on
  fresh ids. NPCs are fixed records — no cadence, wander, or respawn.
- Field-scoped visibility rides the existing `inSamePtField` interest
  filter: a foreign-field viewer never receives another field's NPCs.
- Vendor stock and greetings reach the client through the normal
  `NPCS[templateId]` resolution — the wire carries template + position;
  the client resolves stock from the merged table. Warehouse NPCs join
  `bankerIds` so the existing bank reach set covers them.
- Registration: `src/game/pt_npc_data.ts` (Vite `import.meta.glob`) for the
  client, `server/pt_npcs.ts` (explicit static imports — esbuild cannot
  glob) for the server, same 22-field closure as `server/pt_populations.ts`.

## Visuals

`pt_npc_visuals.ts` is generated with the same lazy convention as
`pt_mob_visuals.ts`: GLB resolution checks the converted NPC catalog, then
`creatures/pt`, then the monster catalog dir-stem; bind-pose height is
measured from the GLB POSITION accessor bounds. Eight Atlantis `at1-8`-style
models were never converted and intentionally resolve to the `npc_villager`
fallback — `glb: null` in the catalog (8 defs), not silently dropped.

## Compatibility decisions (inference, not source fact)

- `*物品保管` -> banker flag (WoC has no separate warehouse UI).
- Consumable HP/MP ranges -> midpoint potion values.
- Non-consumable items -> `junk` with source price/level until a later
  equipment phase.
- Service flags beyond shop/warehouse are kept in the catalog but unmapped.

## Verification

- `tests/pt_online_npcs.test.ts` (12 tests): parse/count/coords/facing,
  session spawn + drain/rebuild, concurrent fields, isolation, descriptor
  fallback, vendor/banker resolution, catalog integrity, GLB existence,
  and a real GameServer snapshot path.
- `scripts/pt_online_transitions_e2e.mjs` `npcs` phase: real realm + two
  browsers — 48/48 authored Ricarten placements delivered with matching
  authoritative ids across viewers, vendor `vendorItems` resolved, foreign
  field clean.
