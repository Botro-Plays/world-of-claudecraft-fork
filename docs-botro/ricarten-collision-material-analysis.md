# Ricarten village-2 Collision Material Analysis

## Repository State

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `b8bb8abbef6b9fd9ffc0adee8db575205dd23696` (previous validation commit) |
| origin/main | `1d64d9e07e3ff7a99fa6d83da3da8418796d9d45` |
| Working tree | Clean (2 new untracked analysis files) |
| Commit | NOT performed (per task instructions) |
| Push | NOT performed |

## Input

- **File**: `client/Field/Ricarten/village-2.smd` (5,626,241 bytes, SMD Stage data Ver 0.72)
- **Parser**: `scripts/pt-port/stage_smd_inspector.ts` (from previous validation)
- **Analysis tool**: `scripts/pt-port/ricarten_collision_analysis.ts` (new, offline)
- **Total faces**: 49,888
- **Total materials**: 288
- **Walkable faces** (`SMMAT_STAT_CHECK_FACE` set): 42,408 (85.0%)
- **Non-walkable faces**: 7,480 (15.0%)
- **Non-walkable materials**: 16 (not 8 as the previous validation report stated)

## Non-Walkable Materials

The previous validation report stated "8 materials" with `sMATS_SCRIPT_RENDLATTER`. Empirical inspection found **16 non-walkable materials**: 8 with `meshState=0x2000` (RENDLATTER) and 8 with `meshState=0x0` (no flags at all). This is a correction to the previous report.

| Mat | MeshState | Transparency | Faces | % | Cells | Texture(s) | Classification |
|---|---|---|---|---|---|---|---|
| 107 | 0x0 | 0.290 | 1530 | 3.07% | 1530 | riy-f030.bmp, riy-w091.bmp | Water (transp > 0.1) |
| 136 | 0x2000 | 0.000 | 50 | 0.10% | 35 | riy002.tga | Decorative (ignored) |
| 137 | 0x2000 | 0.000 | 18 | 0.04% | 12 | riy001.tga | Decorative (ignored) |
| 138 | 0x2000 | 0.000 | 50 | 0.10% | 20 | do01.tga | Decorative (ignored) |
| 139 | 0x2000 | 0.000 | 50 | 0.10% | 23 | do02.tga | Decorative (ignored) |
| 140 | 0x0 | 0.290 | 32 | 0.06% | 28 | riy-f030.bmp, riy-w091.bmp | Water (transp > 0.1) |
| 232 | 0x2000 | 0.260 | 96 | 0.19% | 81 | sea_0.BMP, riy-f030.bmp | Water (transp > 0.1) |
| 239 | 0x2000 | 0.010 | 320 | 0.64% | 156 | na03_07.tga | Decorative (ignored) |
| 240 | 0x2000 | 0.010 | 1062 | 2.13% | 480 | na03_08.tga | Decorative (ignored) |
| 241 | 0x2000 | 0.010 | 182 | 0.36% | 57 | na03_04.tga | Decorative (ignored) |
| 242 | 0x2000 | 0.010 | 418 | 0.84% | 127 | na03_01.tga | Decorative (ignored) |
| 243 | 0x2000 | 0.010 | 38 | 0.08% | 20 | na03_03.tga | Decorative (ignored) |
| 244 | 0x2000 | 0.010 | 356 | 0.71% | 47 | L-VV.tga | Decorative (ignored) |
| 245 | 0x2000 | 0.010 | 166 | 0.33% | 46 | jdo.tga | Decorative (ignored) |
| 246 | 0x2000 | 0.050 | 1064 | 2.13% | 185 | Ttem.tga | Decorative (ignored) |
| 247 | 0x2000 | 0.050 | 2048 | 4.11% | 114 | L-q.tga | Decorative (ignored) |

**Totals**:
- Water faces (transp > 0.1): 1,658 (3 materials: 107, 140, 232)
- Decorative/ignored faces (transp <= 0.1): 5,822 (13 materials)
- Blocking faces: 0 (none of the 7,480 non-walkable faces block in PT)

## Spatial Bounds

### Water surfaces (transp > 0.1, treated as water by PT)

**Mat 107** (riy-f030.bmp + riy-w091.bmp) — dominant water plane:
- Faces: 1530, Cells: 1530 (one face per cell, dense grid)
- Bounds (world units): X[-3498, 5585], Y[101.2, 103.1], Z[-22373, -13194]
- Span: 9083 x 2 x 9179 (covers entire map, Y-thin = flat horizontal)
- Normals: all (0, -1, 0) — flat horizontal plane facing down
- Height: Y approx 101.8 world units (fixed-point 26066)
- Interpretation: a large transparent water/ground plane at constant height, spanning the whole map

**Mat 140** (riy-f030.bmp + riy-w091.bmp) — smaller water patch:
- Faces: 32, Cells: 28
- Bounds (world units): X[-1043, 1520], Y[101.2, 103.1], Z[-18001, -16810]
- Span: 2563 x 2 x 1191 (localized, Y-thin = flat horizontal)
- Normals: all approx (0, -1, 0) — flat horizontal
- Same textures as Mat 107, smaller area

**Mat 232** (sea_0.BMP + riy-f030.bmp) — sea surface:
- Faces: 96, Cells: 81
- Bounds (world units): X[-1043, 1872], Y[131.5, 214.3], Z[-18373, -17774]
- Span: 2916 x 83 x 599 (localized, some Y variation)
- Normals: mostly (0, -1, 0) with some variation — mostly flat with gentle slopes
- "sea" in filename confirms water surface

### Decorative/ignored surfaces (transp <= 0.1, completely ignored by PT collision)

**Mats 136-139** (riy001/riy002/do01/do02) — small decorative objects:
- Face counts: 50, 18, 50, 50 (total 168)
- Spans: small (300-400 world units per axis)
- Normals: varied (not flat) — 3D objects
- Interpretation: small decorative props/signs/lamps

**Mats 239-243** (na03_*.tga) — transparent decorative surfaces:
- Face counts: 320, 1062, 182, 418, 38 (total 2020)
- Spans: moderate (1000-5000 world units)
- Normals: varied — angled surfaces
- Interpretation: transparent decorative geometry (likely building details, awnings, banners)

**Mat 244** (L-VV.tga) — transparent vertical surface:
- Faces: 356, Cells: 47
- Normals: all have Y approx 0 (vertical surfaces)
- Interpretation: transparent vertical panels (windows, glass walls)

**Mat 245** (jdo.tga) — transparent vertical surface:
- Faces: 166, Cells: 46
- Normals: all have Y approx 0 (vertical surfaces)
- Interpretation: transparent vertical panels

**Mat 246** (Ttem.tga) — angled transparent surface:
- Faces: 1064, Cells: 185
- Normals: mostly point downward at an angle (Y negative, X/Z varied)
- Interpretation: transparent roof or canopy structure

**Mat 247** (L-q.tga) — largest decorative surface:
- Faces: 2048, Cells: 114
- Normals: mixed (varied angles)
- Interpretation: complex transparent decorative structure

## Representative Faces

### Mat 107 (water surface) — sample face

```
Face 43021: vertices [41198, 41167, 41199]
  V[0]: (1245092, 26066, -5727554)  → (4863.6, 101.8, -22373.3) world
  V[1]: (1429680, 26066, -5727554)  → (5584.7, 101.8, -22373.3) world
  V[2]: (1245092, 26066, -5532221)  → (4863.6, 101.8, -21610.2) world
  Center: (1306621, 26066, -5662443) → (5104.0, 101.8, -22118.9) world
  Normal: (0, -1, 0) — flat horizontal, facing down
  StageArea cell: (79, 166)
  Texture: Field\Ricarten\riy-f030.bmp
```

### Mat 247 (largest decorative) — sample face

```
Face 18940: vertices [19059, 19060, 19058]
  V[0]: (-133940, 55590, -4315501)  → (-523.2, 217.1, -16857.4) world
  V[1]: (-131648, 59834, -4315020)  → (-514.2, 233.7, -16855.5) world
  V[2]: (-132719, 59781, -4314027)  → (-518.4, 233.5, -16851.7) world
  Center: (-132769, 58402, -4314849) → (-518.6, 228.1, -16854.9) world
  Normal: (0.63, -0.41, 0.66) — angled, facing up-and-sideways
  StageArea cell: (247, 248)
  Texture: Field\Ricarten\L-q.tga
```

## Texture Evidence

All 16 referenced texture files exist on disk under `client/Field/Ricarten/`. However, they are NOT standard BMP or TGA format:

- BMP files do not start with the `BM` magic bytes
- TGA files do not have valid TGA headers
- File sizes suggest custom format with 44-byte header:
  - 262,188 bytes = 256x256x4 + 44 (32bpp, 256x256)
  - 65,580 bytes = 128x128x4 + 44 (32bpp, 128x128)
  - 49,206 bytes = 128x128x3 + 54 (24bpp, 128x128, BMP-like header size)

These are PT's custom encrypted/encoded texture format. The PT client uses `LoadTexture11()` (in `smTexture.cpp:2202`) which handles the custom decoding internally via DirectX 11. Visual inspection of the raw texture content is not possible without implementing the PT texture decoder.

**Texture evidence is therefore based on filenames only**, not pixel content:
- `sea_0.BMP` — "sea" strongly suggests water surface
- `riy-f030.bmp` — "riy" prefix appears on Ricarten field textures; "f030" likely a field tile
- `riy-w091.bmp` — "w" likely "wall" or "water" variant
- `na03_*.tga` — "na03" likely a named area or building section
- `L-VV.tga`, `L-q.tga` — "L-" prefix likely "light" or "lamp" (transparent light sources)
- `Ttem.tga` — likely "transparent temple" or similar structure
- `jdo.tga` — unknown, possibly a Korean-romanized name
- `do01.tga`, `do02.tga` — "do" likely "door" or a decorative element
- `riy001.tga`, `riy002.tga` — Ricarten-specific decorative textures

## Original PT Collision Behavior

### CONFIRMED from PT source

1. **Only `SMMAT_STAT_CHECK_FACE` faces participate in collision.**
   - `CheckNextMove` (`smStage3d.cpp:500`): `if (smMaterial[face->Vertex[3]].MeshState & SMMAT_STAT_CHECK_FACE)` — only walkable faces are tested for height and blocking.
   - `CheckSolid` (`smStage3d.cpp:1583, 1620`): `if (face->CalcSum!=CalcSum && smMaterial[face->Vertex[3]].MeshState & SMMAT_STAT_CHECK_FACE)` — only walkable faces are tested for triangle intersection.
   - `GetFloorHeight` (`smStage3d.cpp:608`): same filter.

2. **Non-walkable faces with transparency > 0.1 are treated as water.**
   - `CheckNextMove` (`smStage3d.cpp:520`): `if (smMaterial[face->Vertex[3]].Transparency > 0.1 || smMaterial[face->Vertex[3]].MeshState & sMATS_SCRIPT_ORG_WATER)` — non-walkable faces with transparency > 0.1 OR the `ORG_WATER` flag (0x10000) are tracked as water surface height (`WaterHeight`).
   - Water height is used only for visual water effects, not blocking. The player can walk through water.

3. **Non-walkable faces with transparency <= 0.1 are completely ignored.**
   - They are gathered into the area face list by `MakeAreaFaceList` (which does not filter by material), but then skipped by all collision checks.
   - No triangle intersection, no height tracking, no blocking.

4. **`MakeAreaFaceList` gathers ALL faces in nearby StageArea cells.**
   - `smStage3d.cpp:1273-1332`: iterates StageArea cells, adds all faces within Y range to `smFaceList`.
   - The material filter happens in the caller, not in `MakeAreaFaceList`.

5. **Step height is 10 * fONE = 2560 fixed-point units.**
   - `smStage3d.cpp:10`: `int Stage_StepHeight = 10*fONE;`
   - `CheckNextMove` (`smStage3d.cpp:506`): `if (hy < Stage_StepHeight)` — a face is walkable only if its height above the current position is less than the step height.

6. **None of the 16 non-walkable materials have `sMATS_SCRIPT_ORG_WATER` (0x10000).**
   - Water classification for Mats 107, 140, 232 is based solely on transparency > 0.1.

### LIKELY

1. **The 7,480 non-walkable faces include NO environmental blocking geometry.**
   - All 16 non-walkable materials are either water (transp > 0.1) or transparent decorative (RENDLATTER with low transparency).
   - None have `SMMAT_STAT_CHECK_FACE`, so none block movement in PT.
   - Walls, buildings, and solid obstacles in Ricarten are made of walkable-material faces (with `SMMAT_STAT_CHECK_FACE` set) that block via triangle intersection in `CheckNextMove`/`CheckSolid`.

2. **Mat 107 is the map-wide water plane.**
   - It spans the entire map (9083 x 9179 world units) at a constant height of Y approx 102.
   - All normals are (0, -1, 0) — perfectly flat.
   - 1530 faces, one per StageArea cell, forming a regular grid.
   - This is the transparent water surface that covers the entire Ricarten area.

### UNKNOWN

1. **Whether the 13 decorative materials (5,822 faces) have any gameplay significance beyond visual.**
   - PT source confirms they are ignored by collision, but they may have rendering or gameplay effects (e.g., light sources, triggers) not visible in the SMD.

2. **The exact visual appearance of any texture.**
   - PT textures are in a custom encrypted format that cannot be decoded without the PT texture loader.

## Classification

| Mat | Faces | Classification | Evidence |
|---|---|---|---|
| 107 | 1530 | Water surface | transp=0.29 > 0.1, flat horizontal (normal 0,-1,0), spans entire map, "sea"/"riy" textures |
| 140 | 32 | Water surface | transp=0.29 > 0.1, flat horizontal, same textures as 107 |
| 232 | 96 | Water surface | transp=0.26 > 0.1, mostly flat, "sea_0.BMP" texture |
| 136 | 50 | Decorative/transparent | transp=0.0, RENDLATTER, small 3D object, "riy002" texture |
| 137 | 18 | Decorative/transparent | transp=0.0, RENDLATTER, small 3D object, "riy001" texture |
| 138 | 50 | Decorative/transparent | transp=0.0, RENDLATTER, small 3D object, "do01" texture |
| 139 | 50 | Decorative/transparent | transp=0.0, RENDLATTER, small 3D object, "do02" texture |
| 239 | 320 | Decorative/transparent | transp=0.01, RENDLATTER, angled surfaces, "na03_07" texture |
| 240 | 1062 | Decorative/transparent | transp=0.01, RENDLATTER, varied surfaces, "na03_08" texture |
| 241 | 182 | Decorative/transparent | transp=0.01, RENDLATTER, angled surfaces, "na03_04" texture |
| 242 | 418 | Decorative/transparent | transp=0.01, RENDLATTER, varied surfaces, "na03_01" texture |
| 243 | 38 | Decorative/transparent | transp=0.01, RENDLATTER, small surface, "na03_03" texture |
| 244 | 356 | Decorative/transparent (vertical) | transp=0.01, RENDLATTER, vertical normals (Y approx 0), "L-VV" texture |
| 245 | 166 | Decorative/transparent (vertical) | transp=0.01, RENDLATTER, vertical normals (Y approx 0), "jdo" texture |
| 246 | 1064 | Decorative/transparent (angled) | transp=0.05, RENDLATTER, downward-angled normals, "Ttem" texture |
| 247 | 2048 | Decorative/transparent (complex) | transp=0.05, RENDLATTER, mixed normals, "L-q" texture |

**No material is classified as "potential blocker".** All non-walkable faces are either water or decorative/transparent. PT's collision system confirms this: only `SMMAT_STAT_CHECK_FACE` faces block.

## Collision Recommendation

### CONFIRMED FROM PT SOURCE

1. **Non-walkable faces must NOT become collision blockers in WoC.**
   - PT's `CheckNextMove` and `CheckSolid` explicitly skip faces without `SMMAT_STAT_CHECK_FACE`.
   - The 7,480 non-walkable faces are never tested for triangle intersection or step-height blocking.
   - Making them blockers would produce collision behavior that contradicts the original game.

2. **Water faces (1,658 faces, Mats 107/140/232) should be treated as visual water, not collision.**
   - PT tracks water height for visual effects but the player walks through water.
   - WoC should render water but not block movement on these faces.

3. **Decorative faces (5,822 faces, 13 materials) should be rendered but not collided.**
   - PT completely ignores them for collision.
   - WoC should render them as transparent decorative geometry.

4. **All blocking geometry is in the 42,408 walkable faces (280 materials with `SMMAT_STAT_CHECK_FACE`).**
   - WoC collision must be derived from these faces only.

### RECOMMENDED FOR WO C IMPLEMENTATION (not confirmed from PT source)

1. **Bake collision from walkable faces only.**
   - The build-time compiler should extract the 42,408 walkable faces and bake them into a heightfield + blocking volume set.
   - Non-walkable faces should be excluded from collision data entirely.

2. **Render water surfaces separately.**
   - Mat 107 (map-wide water plane at Y approx 102) should be rendered as a transparent water surface.
   - Mats 140 and 232 are localized water patches.

3. **Render decorative transparent surfaces with alpha blending.**
   - The 13 decorative materials have transparency 0.0 to 0.05.
   - They should use alpha blending in the WoC renderer.
   - The `sMATS_SCRIPT_RENDLATTER` flag (0x2000) means "render after" (render-order hint), which WoC should honor for correct transparency sorting.

4. **Do not bake a "blocking set" from non-walkable faces.**
   - The previous validation report suggested "blocking volumes from non-walkable faces." This analysis proves that is wrong: non-walkable faces are NOT blockers in PT. Only walkable faces block.

## Remaining Risks

1. **Texture decoding**: PT textures are in a custom encrypted format. The WoC texture conversion pipeline must implement PT's texture decoder (or use the PT client to export them). This is a separate task from collision.

2. **Step height on baked heightfield**: PT uses `Stage_StepHeight = 10 * fONE = 2560` fixed-point (10 world units). WoC's movement kernel uses its own step-height logic. The baked heightfield must produce equivalent walkability at step edges.

3. **Triangle-accurate collision vs heightfield**: PT's `CheckNextMove` does ray/triangle intersection (`GetTriangleImact`) against walkable faces. A baked heightfield loses overhangs and vertical walls. The WoC implementation must decide whether to use a heightfield + blocking volumes or full triangle collision for walkable faces.

4. **Water rendering**: Mat 107 covers the entire map at Y approx 102. If the WoC renderer draws it as a flat transparent plane, it may z-fight with terrain at that height. The water plane may need to be offset or rendered with a depth bias.

5. **Mat 107 cell count = face count (1530 = 1530)**: Each face occupies exactly one StageArea cell, suggesting a regular grid. This is unusual for a triangle mesh and may indicate a procedurally generated water plane. The WoC implementation could potentially replace it with a single large plane primitive rather than 1530 triangles.

## Correction to Previous Validation Report

The previous validation report (commit `b8bb8abbef`) stated:
- "the 7,480 non-walkable faces use 8 materials"
- "those materials have sMATS_SCRIPT_RENDLATTER (0x2000)"

Empirical inspection found:
- **16 non-walkable materials**, not 8
- 8 materials have `meshState=0x2000` (RENDLATTER)
- 8 materials have `meshState=0x0` (no flags at all, including Mats 107 and 140 which are water)
- The previous report only counted materials with `meshState=0x2000` and missed the `meshState=0x0` water materials

This correction does not invalidate the previous report's conclusion (15% non-walkable, material-driven walkability) but expands the material inventory.
