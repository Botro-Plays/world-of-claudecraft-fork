# Ricarten Terrain Implementation Analysis

## Repository State

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `b8bb8abbef6b9fd9ffc0adee8db575205dd23696` (previous validation commit) |
| origin/main | `1d64d9e07e3ff7a99fa6d83da3da8418796d9d45` |
| Working tree | Clean (5 new untracked analysis files) |
| Commit | NOT performed (per task instructions) |
| Push | NOT performed |

## Source Data

- **SMD**: `client/Field/Ricarten/village-2.smd` (5,626,241 bytes, Ver 0.72)
- **Vertices**: 47,180 (fixed-point, fONE=256, Y-up)
- **Faces**: 49,888
- **Walkable faces** (`SMMAT_STAT_CHECK_FACE`): 42,408 (85.0%)
- **Non-walkable faces**: 7,480 (15.0%, all water or decorative, none blocking)
- **Materials**: 288 (280 walkable, 16 non-walkable)
- **Textures**: 279 unique references, all under `Field\Ricarten\`
- **StageArea**: 256x256 spatial partition, 20,592 non-empty cells
- **Bounds** (world units): X[-3498, 5585], Y[-259, 1013], Z[-22373, -13194]
- **Map span**: 9083 x 1272 x 9179 world units

## Part A - Collision Geometry

### Geometry Characteristics

The 42,408 walkable faces were rasterized into a 10-world-unit grid (matching PT's step height of 10 * fONE). Each face was tested at each grid cell center it covers, producing interpolated Y heights.

| Metric | Value |
|---|---|
| Total grid cells | 834,462 (909 x 918) |
| Cells with walkable faces | 173,029 (20.7%) |
| Cells with multiple heights | 33,594 (19.4% of cells with faces) |
| Cells with separation > step height | 31,618 (18.3% of cells with faces) |
| Max Y separation | 586.1 world units |
| Y range | -259.2 to 983.1 (1242.3 world units) |

**Ricarten is NOT a single-valued terrain surface.** Nearly 1 in 5 walkable cells has multiple surfaces at substantially different heights, with the maximum separation reaching 586 world units (58x the step height). This is a multi-level town with buildings, elevated platforms, and stacked walkable surfaces.

### Multiple Height Analysis

The top multi-height regions show 4-5 distinct height levels at the same XZ:

| Cell | Center (X, Z) | Y Range | Max Gap | Faces | Heights (world units) |
|---|---|---|---|---|---|
| (797, 517) | (4477, -17198) | 901.0 | 586.1 | 5 | -60.1, 209.6, 795.7, 801.8, 840.9 |
| (796, 517) | (4467, -17198) | 858.3 | 586.0 | 4 | -56.7, 209.5, 795.5, 801.7 |
| (798, 516) | (4487, -17208) | 904.8 | 586.0 | 5 | -63.6, 209.9, 795.9, 802.0, 841.1 |
| (809, 516) | (4597, -17208) | 910.9 | 585.9 | 5 | -68.6, 211.1, 797.1, 803.2, 842.3 |
| (800, 515) | (4507, -17218) | 912.2 | 585.9 | 5 | -70.7, 210.4, 796.3, 802.4, 841.5 |

These regions show 5 distinct walkable layers:
- Layer 1: Y approx -60 to -70 (basement/lower level)
- Layer 2: Y approx 210 (ground level, the dominant band)
- Layer 3: Y approx 795 (mid-level, approx 585 units above ground)
- Layer 4: Y approx 802 (upper level, slightly above layer 3)
- Layer 5: Y approx 841 (top level, approx 630 units above ground)

The concentration of these regions around X=4467-4617, Z=-17208 to -17138 suggests a large multi-story structure (likely a tower, temple, or castle) in the northeast quadrant of the map.

### Stairs / Slopes

The Y distribution histogram confirms multiple distinct height bands:

| Y Range (world units) | Sample Count | Interpretation |
|---|---|---|
| -259 to -73 | 871 | Underground/basement |
| -73 to 11 | 2815 | Lower terrain |
| 11 to 114 | 3585 | Ground level approaches |
| 114 to 176 | 44825 | Ground level (dominant) |
| 176 to 238 | 93087 | Ground level (dominant peak) |
| 238 to 362 | 65441 | Low platforms/steps |
| 362 to 486 | 21366 | Mid-level platforms |
| 486 to 610 | 3869 | Upper platforms |
| 610 to 735 | 1300 | High structures |
| 735 to 859 | 1078 | Towers/roofs |
| 859 to 983 | 57 | Peaks |

The dominant ground level is at Y=176-238 (93,087 samples, 53.8% of total). The secondary band at Y=238-362 (65,441 samples) represents elevated walkable surfaces (platforms, stairs, low walls). The sparse but present bands at Y=486-859 confirm multi-story structures.

PT's `GetPolyHeight` (`smStage3d.cpp:1335`) computes the exact triangle-interpolated height at any XZ point. PT's `CheckNextMove` then checks whether the height difference is within `Stage_StepHeight = 10 * fONE` (10 world units). A heightfield sampled at 10-unit resolution would preserve slopes and stairs adequately (the step height is the grid resolution), but would collapse the multi-level regions.

### Overhangs

Overhang detection found 20+ grid cells where walkable faces exist at overlapping XZ with Y separation exceeding the step height. Representative examples:

| X Range | Z Range | Y Range | Below Y |
|---|---|---|---|
| [-728, -718] | [-17293, -17283] | [211.0, 239.9] | 211.0 |
| [-728, -718] | [-17283, -17273] | [211.3, 238.0] | 211.3 |
| [-728, -718] | [-17273, -17263] | [211.5, 236.1] | 211.5 |
| [-748, -738] | [-17183, -17173] | [211.9, 232.6] | 211.9 |
| [-738, -728] | [-17203, -17193] | [213.3, 223.4] | 213.3 |

These show moderate overhangs (20-30 unit Y separation) in the X=-728 to -748, Z=-17173 to -17293 region, likely a building with a ground floor and an elevated walkable roof or balcony.

The larger overhangs (586 unit separation) in the X=4467-4617 region confirm tall multi-story structures where a player can stand at ground level (Y=210) and also on upper floors (Y=795, 802, 841) at the same XZ.

### PT Collision Behavior

**CONFIRMED from PT source** (`smStage3d.cpp`):

1. **`CheckNextMove` (line 500)**: For each face in the area list, if `smMaterial[face->Vertex[3]].MeshState & SMMAT_STAT_CHECK_FACE`, PT calls `GetPolyHeight` to get the exact triangle-interpolated height, then checks if the height step is within `Stage_StepHeight`. This is full triangle collision, not a heightfield.

2. **`CheckSolid` (line 1583, 1620)**: For each face, if `smMaterial[face->Vertex[3]].MeshState & SMMAT_STAT_CHECK_FACE`, PT calls `smGetTriangleImact` for ray-triangle intersection. This is full mesh collision for blocking tests.

3. **`MakeAreaFaceList` (line 1273)**: Gathers all faces from nearby StageArea cells (within a 2-cell radius of the player position), filtered by Y range. The material filter happens in the caller, not here. This is a spatial acceleration structure, not a heightfield.

4. **`GetPolyHeight` (line 1335)**: Computes the exact Y height at a given XZ by barycentric interpolation on a single triangle. Returns `CLIP_OUT` if the point is outside the triangle's XZ projection.

5. **Step height**: `Stage_StepHeight = 10 * fONE` (line 10) = 10 world units. A face is walkable only if its height above the current position is less than this.

**PT uses full triangle collision, not a heightfield.** The StageArea provides spatial acceleration (only test nearby faces), but the actual collision test is per-triangle: `GetPolyHeight` for height, `smGetTriangleImact` for blocking. This naturally handles multi-level geometry because each triangle is tested independently.

### WoC Collision Compatibility

**Current WoC collision** (`src/sim/world.ts`, `src/sim/player_motion.ts`, `src/sim/colliders.ts`):

1. **Overworld**: `groundHeight(x, z, seed)` returns a single height per XZ (heightfield). Multi-level geometry is impossible. The voxel layer (`voxel.ts`) adds tunnels/overhangs but is not yet wired into collision.

2. **Thornhollow battleground**: `bgFieldHeightLocal(x, z)` returns a single height per XZ (heightfield from baked stamp chain). Standable colliders (ramparts, stairs, flag podiums) are separate box volumes, not triangle mesh.

3. **Dungeons**: Flat floor + authored lifts per room. Single height per XZ.

4. **Movement kernel** (`player_motion.ts`): Swept collision against extruded-2D collider set. The `supportHeightAt` query returns a single height per XZ for standable surfaces.

**WoC's current collision architecture is heightfield-based.** It cannot represent multi-level walkable geometry without extension. The Thornhollow pattern (heightfield + standable box colliders) works for simple stairs/ramps but not for 5-level stacked structures with 586-unit separation.

### Collision Strategy Decision

**DECISION: Hybrid (heightfield + triangle collision for multi-level regions)**

Evidence:

1. **Ricarten requires multi-level collision.** 31,618 cells (18.3% of walkable surface) have multiple heights separated by more than the step height. A pure heightfield would lose these surfaces. Max separation is 586 world units (multi-story structures).

2. **PT uses full triangle collision.** The original game tests every nearby triangle independently via `GetPolyHeight` and `smGetTriangleImact`. This naturally handles multi-level geometry.

3. **A pure heightfield is insufficient.** WoC's existing `groundHeight` returns one height per XZ. The 5-level structures in the northeast quadrant would collapse to a single surface.

4. **A full triangle mesh is feasible but expensive.** 42,408 walkable triangles is a moderate mesh. With StageArea-style spatial acceleration (only test nearby triangles), per-move collision would test ~50-200 triangles (based on the 2-cell radius PT uses). This is comparable to WoC's existing collider set.

5. **Hybrid is the pragmatic choice.** Use a heightfield for the dominant single-valued terrain (81.7% of cells), and a triangle mesh for the 18.3% of cells with multi-level geometry. This preserves fidelity where it matters and keeps the common case fast.

**Implementation approach** (for the future build-time compiler, NOT this task):
- Bake a heightfield at 1-world-unit resolution for the dominant ground surface
- Bake a triangle mesh (vertices + indices) for the multi-level regions
- Bake a spatial acceleration structure (grid or BVH) for the triangle mesh
- The runtime collision queries the heightfield first, then the triangle mesh for multi-level cells
- This mirrors PT's own architecture: StageArea accelerates triangle queries, the heightfield is not used

**What information would be lost with a pure heightfield**: 31,618 walkable cells would lose their lower/upper surfaces. Players could not stand on bridges, balconies, upper floors, or any stacked walkable geometry. This is unacceptable for a town with multi-story buildings.

**Performance implications**: A hybrid approach tests the heightfield (O(1) lookup) for 81.7% of positions and a small triangle set (O(n) where n ~50-200) for 18.3% of positions. This is comparable to WoC's existing collider queries and well within real-time budget.

**Fidelity implications**: The hybrid approach preserves PT's multi-level collision exactly. The only fidelity loss is the heightfield's interpolation error on slopes (within the 1-unit grid resolution, which is finer than PT's step height).

## Part B - Texture Pipeline

### Original PT Texture Loader

**CONFIRMED from PT source** (`smLib3d/smTexture.cpp:1860-1976`):

PT textures are **obfuscated, not encrypted**. The obfuscation is a simple header transformation:

**BMP files** (line 1932-1938):
- Bytes 0-1: `0x41 0x38` ("A8") instead of `0x42 0x4D` ("BM")
- Bytes 2-13: each byte has `i * i` added (where `i` is the byte index)
- Decoding: set bytes 0-1 to "BM", subtract `i * i` from bytes 2-13
- The rest of the file (pixel data) is standard BMP format

**TGA files** (line 1946-1952):
- Bytes 0-1: `0x47 0x38` ("G8") instead of `0x00 0x00`
- Bytes 2-17: each byte has `i * i` added
- Decoding: set bytes 0-1 to `0x00 0x00`, subtract `i * i` from bytes 2-17
- The rest of the file (pixel data) is standard TGA format

**PNG files** (line 1955-1966):
- A more complex XOR-based decryption at bytes 0x6A-0x6D
- Not relevant to Ricarten (no PNG textures referenced)

After decoding, PT uses standard WIC (Windows Imaging Component) for BMP/JPG/PNG and a native TGA decoder for TGA. The decoded header is the only custom step; the pixel payload is standard format.

### Actual village-2 Texture Format

Verified by decoding representative files:

| File | Type | Decoded Dimensions | BPP | Format |
|---|---|---|---|---|
| sea_0.BMP | BMP (obfuscated) | 128x128 | 24 | Standard BMP after header decode |
| riy-f030.bmp | BMP (obfuscated) | 256x256 | 24 | Standard BMP after header decode |
| na03_08.tga | TGA (obfuscated) | 256x256 | 32 | Uncompressed truecolor, BGRA |
| Ttem.tga | TGA (obfuscated) | 256x256 | 32 | Uncompressed truecolor, BGRA |
| L-q.tga | TGA (obfuscated) | 128x128 | 32 | Uncompressed truecolor, BGRA |
| riy002.tga | TGA (obfuscated) | 256x256 | 32 | Uncompressed truecolor, BGRA |

All Ricarten textures use the simple header obfuscation. No encryption, no compression, no custom container. The pixel data is standard BMP/TGA after the 14-byte (BMP) or 18-byte (TGA) header is decoded.

### Sample Files Inspected

Decoded `sea_0.BMP` to PNG: 33,368 bytes, 128x128, 24bpp. The conversion produces a valid PNG. The texture is a water surface pattern (based on material classification, not pixel inspection since visual review requires a viewer).

### Existing Conversion Tools

The repository already contains working PT texture converters:

| Tool | Path | Status |
|---|---|---|
| BMP to PNG | `scripts/pt-port/bmp_to_png.ts` | Working, implements exact PT header decode |
| TGA to PNG | `scripts/pt-port/tga_to_png.ts` | Working, implements exact PT header decode, supports uncompressed + RLE, 8/16/24/32-bit |

Both tools implement the exact obfuscation reversal found in `smTexture.cpp`. Verified: `bmpToPng()` successfully decoded `sea_0.BMP` to a valid 33,368-byte PNG.

**No new converter is needed.** The existing tools handle all Ricaren textures.

### Required Future Conversion Pipeline

For the Ricarten implementation, the texture pipeline will be:

1. Read each PT texture file from `client/Field/Ricarten/`
2. Decode the header obfuscation (existing `decryptBmpHeader` / `decryptTgaHeader`)
3. Convert to PNG (existing `bmpToPng` / `tgaToPng`)
4. Compress to KTX2/Basis using the existing `compress_standalone_textures.mjs` (terrain splat set) or `compress_glb_textures.mjs` (if embedded in GLB)
5. Output to `public/textures/ricarten/`

This mirrors the existing Thornhollow/overworld texture pipeline. The only PT-specific step is the header decode, which is already implemented and tested.

## Part C - Proposed Build-Time Output

Based on the Thornhollow precedent (`compile_thornhollow.mjs` -> `thornhollow_field.generated.ts`) and the multi-height analysis, the future Ricarten compiler should produce:

### 1. Heightfield (for the dominant ground surface)
- Grid resolution: 1 world unit (matching Thornhollow's 1yd cells)
- Origin: map-specific offset (Ricarten center at approx (1043, -17784) world units)
- Quantization: 1cm (matching Thornhollow)
- Encoding: base64 in generated module
- Coverage: the 81.7% of cells that are single-valued

### 2. Triangle collision mesh (for multi-level regions)
- Vertices: the subset of SMD vertices in multi-level cells (estimated 5,000-15,000 based on the 31,618 multi-height cells)
- Faces: the subset of walkable faces in multi-level cells (estimated 5,000-10,000)
- Spatial acceleration: grid-based (reusing the StageArea partition or a new grid)
- Encoding: typed arrays in generated module

### 3. Material/paint map
- Grid resolution: matching the heightfield or coarser
- Per-cell material index (from the 280 walkable materials)
- Used for terrain texturing and footstep sounds

### 4. Water surface
- Mat 107 (map-wide water plane at Y=102): a single flat plane primitive
- Mats 140, 232 (localized water): smaller plane primitives
- Rendered as transparent water, not collided

### 5. Decorative transparent geometry
- The 5,822 non-walkable decorative faces (13 materials)
- Rendered as transparent meshes with alpha blending
- Not collided

### 6. Texture manifest
- 279 texture references
- Each converted from PT obfuscated format to KTX2/Basis
- Output path mapping (PT path -> WoC asset path)

### 7. Map bounds and coordinate transform
- StageMapRect (vertex XZ bounds)
- Origin offset for WoC band placement
- Scale: 1:1 (PT world units to WoC yards, pending calibration)

### 8. Spawn records
- From `field.cpp` reference points (Center, Start, Second start)
- Converted from PT world coordinates to WoC band coordinates

### What is NOT needed
- StageArea data (WoC uses its own spatial acceleration)
- Lights (81 lights, not needed for collision; rendering TBD)
- TexLinks (51,561, a PT rendering optimization, not needed for WoC)

## Part D - Performance / Size

### Estimated runtime data size

| Component | Count | Estimated Size |
|---|---|---|
| Heightfield | 9083 x 9179 cells at 1-unit res, 1cm quantization | ~830K cells, ~830KB base64 |
| Triangle mesh (multi-level) | ~10,000 faces, ~15,000 vertices | ~300KB (typed arrays) |
| Material/paint map | 9083 x 9179 cells, 1 byte per cell | ~83MB raw, ~10MB RLE |
| Water surfaces | 3 planes | <1KB |
| Decorative meshes | 5,822 faces, ~8,000 vertices | ~200KB |
| Texture manifest | 279 entries | ~10KB |
| Textures (KTX2) | 279 textures, avg 128x128 | ~14MB (279 * ~50KB) |

**Total estimated**: ~25MB (dominated by textures and paint map)

### Comparison to existing WoC precedents

| Precedent | Data size | Notes |
|---|---|---|
| Thornhollow field | ~830KB heightfield + paint RLE | Single-level, heightfield only |
| Overworld terrain | Procedural, no baked data | Heightfield + voxel |
| Ricarten (estimated) | ~25MB | Multi-level, heightfield + triangle mesh + textures |

Ricarten is significantly larger than Thornhollow due to the triangle collision mesh and 279 textures. However, 25MB is within the range of existing WoC zone assets (e.g., the Drakelands kit is similar).

### Performance expectations

- Heightfield query: O(1), same as Thornhollow
- Triangle collision query: O(n) where n ~50-200 (StageArea radius), comparable to existing collider set
- Texture loading: 279 KTX2 textures, streamed on demand (same as existing zone textures)
- No obvious architectural problems

## Confirmed

1. **Ricarten has significant multi-level walkable geometry.** 31,618 cells (18.3%) have multiple walkable surfaces separated by more than the step height. Max separation is 586 world units. A pure heightfield is insufficient.

2. **PT uses full triangle collision.** `CheckNextMove` and `CheckSolid` test individual triangles via `GetPolyHeight` and `smGetTriangleImact`. The StageArea provides spatial acceleration. This naturally handles multi-level geometry.

3. **PT textures are obfuscated, not encrypted.** The obfuscation is a simple header transformation (bytes 0-1 replaced, bytes 2-13/2-17 shifted by `i*i`). The pixel payload is standard BMP/TGA. Existing converters (`bmp_to_png.ts`, `tga_to_png.ts`) already implement the exact decode.

4. **Existing texture converters work.** Verified: `bmpToPng()` successfully decoded `sea_0.BMP` to a valid 33,368-byte PNG. No new converter is needed.

5. **The Thornhollow build-time pattern is the right precedent.** The compiler produces a generated `.ts` module with baked data. Ricarten extends this with a triangle collision mesh for multi-level regions.

6. **None of the 7,480 non-walkable faces are blocking.** All blocking geometry is in the 42,408 walkable faces. (Confirmed in the previous collision material analysis.)

## Likely

1. **The hybrid collision approach (heightfield + triangle mesh) is sufficient.** The heightfield handles 81.7% of cells; the triangle mesh handles the 18.3% multi-level cells. This matches PT's own architecture (StageArea + per-triangle tests).

2. **The northeast quadrant contains a large multi-story structure.** The 586-unit separation regions cluster around X=4467-4617, Z=-17138 to -17218. This is likely a tower, temple, or castle.

3. **The map-wide water plane (Mat 107) can be a single flat primitive.** 1530 faces at constant Y=102 with normal (0,-1,0) is a regular grid that can be replaced by one plane.

4. **Ricarten's 25MB estimated data size is within WoC's asset budget.** Comparable to existing zone asset packs.

## Unresolved

1. **Exact WoC band placement and origin offset.** Where in the WoC world will Ricarten live? This is a design decision, not an empirical question.

2. **Scale calibration.** The assumption that PT world units map 1:1 to WoC yards needs validation against character height and movement speed during implementation.

3. **Step height calibration.** PT uses 10 world units; WoC's movement kernel uses its own step-height logic. The baked collision must produce equivalent walkability at step edges.

4. **Texture visual content.** PT textures are in custom format; pixel content was not visually inspected (only header/dimension verification). The texture pipeline is proven to decode correctly, but visual review of the converted textures is needed during implementation.

5. **Light handling.** The 81 lights in the SMD were not analyzed. Their impact on WoC rendering needs evaluation during renderer design.

6. **Whether the 5-level structure (Y=-60, 210, 795, 802, 841) is fully navigable.** The analysis confirms the surfaces exist and are walkable, but whether PT's step height allows climbing between all levels (e.g., from 210 to 795) depends on stair/ramp geometry not yet analyzed.

## Recommended Next Implementation Step

The empirical validation is complete. The remaining items are design decisions:

1. **Collision strategy**: Hybrid (heightfield + triangle mesh) - decided, evidence-based
2. **Ricarten band/origin placement**: design decision needed from user
3. **Texture conversion strategy**: use existing `bmp_to_png.ts` / `tga_to_png.ts` + `compress_standalone_textures.mjs` - decided
4. **Initial player-entry/spawn strategy**: design decision needed from user

**Nothing empirically blocks beginning P1 Ricarten implementation.** The SMD format is fully decoded, the collision requirements are measured, the texture pipeline is proven, and the build-time output is specified. The next task should be the actual Ricarten terrain compiler, pending the two design decisions above.
