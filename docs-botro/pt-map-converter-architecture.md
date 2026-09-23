# PT Map Converter Architecture

## Purpose

Convert Priston Tale maps from MagicPT-Chinese into WoC-consumable generated
packages, using the proven Ricarten (village-2) pipeline as the golden
reference. This document records the audit of the existing pipeline, the
generic-vs-map-specific split, and the proposed compiler architecture.

Status: **design record** — the converter itself is not yet implemented.
Ricarten remains the golden regression map.

## Sources

- PT authority: `MagicPT-Chinese/client/Field/` (31 dirs, 82 stage SMDs,
  416 model SMDs) and `MagicPT-Chinese/PT-Source/field.cpp` (the authored
  field registry: ~70 `psField[i]` blocks carrying index, ASE/SMD path, map
  name, State, music, backimages, AddStageObject lists, SetCenterPos,
  AddStartPoint lists, AddGate links).
- Server-side per-map content (later phases): `server/GameServer/Field/
  <name>.ase.{spp,spm,spc}` — fixed-point spawn/mob records. Not needed for
  terrain conversion; optional inputs for Phase 4.

## Existing pipeline (what Ricarten actually uses)

```
village-2.smd ── compile_pt_field.mjs ──► src/sim/pt_ricarten_field.generated.ts
                                       (vertices, render faces, UVs, materials,
                                        walkable/water/deco face sets,
                                        StageArea CSR grid, texture manifest)
v-ani01..14.smd ── compile_pt_stage_objects.mjs ──► pt_stage_objects.generated.ts
Field/Ricarten/*.{bmp,tga} ── convert_pt_textures.ts
    (+ bmp_to_png.ts / tga_to_png.ts PT-obfuscation decoders)
    ──► public/textures/pt-ricarten/*.png
Field/map/village-2.tga ──► pt-ricarten/minimap-village-2.png
field.cpp ──► (hand-extracted) spawn constants in src/sim/pt_band.ts
```

Runtime dispatch is already one seam: `isPtPos(x)` gates six call sites
(`world.ts` water/ground, `player_motion.ts` floor/wall/step, `colliders.ts`
supportHeight, `sim.ts` saved-position, `renderer.ts` terrain build + gait,
`fog_scene_state.ts` outdoor preset).

## Audit classification

### A. Generic PT conversion logic (reusable as-is or with a map param)

- `compile_pt_field.mjs` — stage-SMD parser (v0.71 WORD + v0.72 DWORD
  StageArea), material block walk, TexLink→UV, CHECK_FACE classification,
  CSR emit. Hardcoded: `KNOWN_WATER_MATS={107,140,232}`, `mapName`, default
  paths, header line.
- `compile_pt_stage_objects.mjs` — smPAT3D v0.62 parser (nodes, TmRot/Pos/
  Scale tracks, TmPrevRot absolute quats, materials). Hardcoded: the
  v-ani01..14 loop and emit header.
- `bmp_to_png.ts`, `tga_to_png.ts` — PT header-obfuscation decoders. Generic.
- `convert_pt_textures.ts` — manifest-driven convert loop. Hardcoded: Ricarten
  source dir, generated-module path, output dir.
- `stage_smd_inspector.ts` — format reference for the stage offsets.

### B. Generic runtime logic bound to Ricarten data

- `pt_ricarten_field.ts` — barycentric height, multi-level floor selection,
  wall hit, water level over the StageArea CSR. Algorithm generic; binds the
  generated module + `pt_band` transforms statically.
- `pt_terrain.ts` — material rules (translucency>0.1, alpha-test 60/255,
  NOTVIEW, multimix bake, WINDZ1/WATER vertex scripts), ocean ring + deep-sea
  + horizon fade. Generic rules; binds generated data + pt_band.
- `pt_stage_objects.ts` — animated-prop runtime (PT tick model, segment
  tables). Generic; binds generated module.
- `pt_terrain_gate.ts` — build gate. Fully generic already.
- `pt_minimap_core.ts` — projection math generic; bound to Ricarten rect/URL.

### C. Ricarten-specific configuration (becomes manifest data)

- `pt_band.ts` Ricarten bounds + start points — currently baked into the
  transform constants. The band constants (PT_BAND_X_MIN/Z, PT_SCALE) and the
  X-mirror are generic; the bounds/spawn are per-map.
- `KNOWN_WATER_MATS` — equals `transparency > 0.1` on Ricarten exactly
  ({107,140,232}; mat 140 lacks the WATER script bit, so translucency is the
  correct generic rule — already the runtime's own test).
- Spawn points `2592,-18566` / `-1047,-16973` — authored in field.cpp.
- Minimap texture `map/village-2.tga` — named by `SetName` lpNameMap.
- Ocean ring/fade — a map-style treatment for sea-bound maps; opt-in per map.

### D. Temporary analysis/debug tooling (not part of the converter)

`scripts/pt-port/{ricarten_collision_analysis,ricarten_multiheight_analysis,
probe_*,dbg_*,scratch_*,inspect_*,test_*}` and `tmp/pt-stage-objects/*`.

### E. Validation/test tooling

`tests/pt_ricarten_field.test.ts`, `pt_terrain_render.test.ts`,
`pt_stage_objects.test.ts`, `pt_start.test.ts`, `pt_minimap_core.test.ts`,
`pt_terrain_gate.test.ts`, `ricarten_*_analysis.test.ts`,
`pt_ricarten_traversal.test.ts`, `step_smooth_core.test.ts`.

### F. Generated output

`pt_ricarten_field.generated.ts`, `pt_stage_objects.generated.ts`,
`public/textures/pt-ricarten/` (292 PNGs, LFS).

### G. Correctly map-specific (stays per-map)

Spawn points, minimap texture, ocean treatment, per-map water overrides, the
`/ricarten` dev command target, tribe→town routing in `pt_start.ts`.

## Proposed architecture

```
MagicPT source                        WoC repo
─────────────                         ────────
client/Field/<dir>/<map>.smd ──┐
client/Field/<dir>/*.{bmp,tga} │
client/Field/map/<name>.tga    ├──► pt-map audit <map>
field.cpp (registry)           │      pt-map compile <map>
                               │      pt-map validate <map>
                               ▼
                    scripts/pt-port/lib/stage_smd   (parser, shared)
                    scripts/pt-port/lib/pat_smd     (smPAT3D, shared)
                    scripts/pt-port/lib/texconv     (bmp/tga decode)
                    scripts/pt-port/lib/emit        (generated modules)
                    scripts/pt-port/maps/<map>.ts   (map manifest)
                               │
                               ▼
              src/sim/pt_maps/<map>.generated.ts   (field data)
              src/render/pt_maps/<map>.objects.generated.ts
              public/textures/pt-<map>/*.png
              src/sim/pt_maps/<map>.manifest.ts    (descriptor)
```

### Map manifest (the config, not code)

Smallest shape that carries genuine per-map differences; populated from
field.cpp + audit output:

```ts
interface PtMapManifest {
  id: string;                 // 'ricarten' — drives file/const names
  fieldIndex: number;         // psField[i] index (3 for Ricarten)
  smdPath: string;            // client/Field/<dir>/<file>.smd
  mapName: string;            // lpNameMap → minimap file + texture dir name
  state: string;              // FIELD_STATE_* (village, forest, …)
  startPoints: [x, z][];      // AddStartPoint list
  centerPos: [x, z];          // SetCenterPos
  stageObjects: string[];     // AddStageObject basenames ([] allowed)
  texturesDir: string;        // texture search dir (usually the field dir)
  water: { rule: 'translucent' | 'explicit'; materials?: number[] };
  ocean: { enabled: boolean }; // sea-bound maps opt in
  minimap: { srcTga: string } | null;  // null when lpNameMap is 0
}
```

### Compiler outputs (deterministic)

Per map: one field module (same layout as `pt_ricarten_field.generated.ts` —
vertices, faces, UVs, materials, CSR grid, face classifications, texture
manifest), one optional stage-objects module, one texture directory, one
manifest descriptor. Same input → byte-identical output.

### Runtime generalization (follow-on phase, not this task)

`pt_band.ts` becomes a descriptor registry: each manifest contributes bounds +
a band-local origin; transform functions move onto a per-map descriptor
(`map.ptXToWoC(...)`). The six `isPtPos` dispatch sites resolve position →
map descriptor → call the same algorithms, now fed by the map's generated
module. Ricarten keeps its exact constants via its manifest — no behavior
change.

## Validation layer

`pt-map audit` reports per map: SMD version, vertex/face/material/texture
counts, CHECK_FACE/water/decorative classification counts, StageArea
occupancy, bounds, texture manifest vs files on disk (missing/dupes/decode
failures), stage-object list vs files found, minimap presence, spawn
plausibility (inside bounds, on walkable ground), warnings/errors, final
PASS/WARNING/ERROR. `pt-map validate` runs the audit plus structural invariants
the Ricarten tests pin (counts, classification, rect/bounds consistency).

## Ricarten equivalence strategy

1. Compile `village-2.smd` with the generic compiler into a scratch module.
2. Byte-compare against the committed `pt_ricarten_field.generated.ts`
   (header lines may differ — compare the payload sections).
3. Water classification: `transparency > 0.1` must reproduce
   `KNOWN_WATER_MATS` exactly — already verified statically (both = {107,140,
   232}); the equivalence run must assert identical water face indices.
4. Stage objects: same byte-compare for `pt_stage_objects.generated.ts`.
5. Texture manifest identical; texture PNGs identical bytes.
6. Any unexplained drift blocks the conversion — Ricarten is the regression.

## Known limitations / open questions

- Band layout for many maps: the PT band is 4000 yd wide; maps either get
  sub-band origins inside it or the band scheme extends (descriptor
  decision at implementation time).
- Translucency-as-water may over-classify on maps with translucent glass/ice
  — the `explicit` rule is the manifest escape hatch; audit must flag
  translucent non-water mats for review.
- `Fall_Game` registers with lpNameMap=0 (no minimap); `Custom/ad1.smd` has a
  corrupted header tail (prefix-parse still works).
- field.cpp is the authored manifest source but is C++ — manifests are
  hand-extracted per map at first; auto-extracting field.cpp is a later
  option, not required for correctness.
- SPP/SPM/SPC (server spawn/mob data) are decoded in the Phase-4 content
  phase, not the terrain converter.
- Gates/portals (`AddGate` links in field.cpp) are recorded in the manifest
  schema but not wired until map-to-map travel is designed.

## Implementation status (extraction phase, done)

Extracted, per this design, with Ricarten equivalence proven byte-for-byte:

- `scripts/pt-port/lib/stage_smd.mjs` — stage-SMD parser, water classification
  (`translucent` | `explicit` | `script` rules), CHECK_FACE/StageArea build,
  TexLink UV extraction, texture manifest, deterministic emitter.
- `scripts/pt-port/lib/pat_smd.mjs` — smPAT3D v0.62 stage-object parser +
  emitter (parsePat/emitModule parameterized).
- `scripts/pt-port/lib/pt_client.mjs` — PT client/source root resolution
  (`PT_CLIENT_DIR`/`PT_SOURCE_DIR` env, MagicPT default fallback).
- `scripts/pt-port/lib/field_registry.mjs` — field.cpp catalog parser
  (72 fields; `fieldIndex` is registration order — the authored `//N`
  comments drift on 3 fields and are informational only; `SetName(...,0)`
  means no minimap).
- `scripts/pt-port/maps/<id>.mjs` — per-map manifests (`ricarten` shipped).
- `scripts/pt-port/pt_map.mjs` — CLI: `catalog`, `audit`, `compile`,
  `validate` (audit + in-memory recompile drift check vs on-disk modules),
  `textures`.
- `compile_pt_field.mjs` / `compile_pt_stage_objects.mjs` — now thin shims
  over the libs (same CLI/defaults preserved).
- `convert_pt_textures.ts` — parameterized `[generatedModule] [texDir]
  [outDir]`, Ricarten defaults preserved.
- `tests/pt_map_compiler.test.ts` — byte-identical Ricarten equivalence,
  determinism, water-rule branches, registry parser fixture.

Header-only diffs vs the pre-extraction committed modules (intentional):
`GENERATED by` now names `pt_map.mjs`, and the field `Source:` line records
the real `client/Field/Ricarten/village-2.smd` (the legacy emitter derived a
capitalized `Village-2` path from the map name). All payload bytes identical.

Deferred (unchanged from the design): bulk `compile-all`, runtime
descriptor-driven multi-map dispatch, SPP/SPM/SPC, gate travel wiring.
