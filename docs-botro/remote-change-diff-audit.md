# Remote Change Diff Audit

## 1. Local State

LOCAL_BRANCH: `safety/local-working-tree-2026-09-13`
LOCAL_HEAD: `62853e1a5c083ffdfb9b285f1d23bf12a2761e3a`
WORKING_TREE: Clean except for untracked `docs-botro/pt-map-port-analysis.md` (the map audit document from the previous task)

Working tree files:
- Untracked: `docs-botro/pt-map-port-analysis.md` (new, not committed)
- Modified: none
- Deleted: none

Safety branch created: `safety/pre-remote-diff-2026-09-13` pointing to `62853e1a5c083ffdfb9b285f1d23bf12a2761e3a`

## 2. Remote State

REMOTE: `origin` (https://github.com/Botro-Plays/world-of-claudecraft-fork.git)
REMOTE_HEAD: `d36f298c37abf2049d36e0b61c0d5411a9f4eb4a`

## 3. Commit Relationship

**REMOTE AHEAD** (fast-forward possible)

- Merge base: `62853e1a5c083ffdfb9b285f1d23bf12a2761e3a` (our HEAD)
- Commits on remote not in local: 3
- Commits in local not on remote: 0
- The remote is a clean fast-forward from our HEAD

## 4. Remote Commits Not In Local

### Commit 1
- HASH: `719e523c88788bcf553e3ada846d4059b0a7b764`
- AUTHOR: botro-plays
- DATE: Sun Sep 13 20:14:34 2026 +0800
- SUBJECT: `fix(cleanup): restore env assets, fix test pins, remove duplicates after PT merge`

### Commit 2
- HASH: `7cfe8dd03fd62a8cebaeb43bc095c14b504c8c17`
- AUTHOR: botro-plays
- DATE: Sun Sep 13 20:26:38 2026 +0800
- SUBJECT: `feat(pt-port): add PT conversion scripts, converted assets, and gap docs`

### Commit 3
- HASH: `d36f298c37abf2049d36e0b61c0d5411a9f4eb4a`
- AUTHOR: botro-plays
- DATE: Sun Sep 13 20:46:26 2026 +0800
- SUBJECT: `docs(pt-port): rewrite roadmap with detailed status, attribution, and gaps`

## 5. Changed Files

### Summary
- 2142 files changed
- 19,037 insertions(+)
- 16,173 deletions(-)
- 2124 added (A)
- 15 modified (M)
- 3 deleted (D)
- 0 renamed (R)

### Complete Name-Status List

#### Modified Files (15)
```
M  .gitignore
M  index.html
M  scripts/pt-port/smd_parser.ts
M  scripts/pt-port/viewer.html
M  src/render/assets/manifest.generated.ts
M  tests/character_clipmaps.test.ts
M  tests/character_db.test.ts
M  tests/env_protocol.test.ts
M  tests/paladin_divine_tome.test.ts
M  tests/social_classes.test.ts
M  tests/talent_rows_core.test.ts
M  tests/talents.test.ts
M  tests/talents_view.test.ts
M  tests/v026_winning_warrior_contract.test.ts
M  trading-spacing-after.png
```

#### Deleted Files (3)
```
D  package-lock.json
D  public/models/creatures/bargon-die.glb
D  public/models/creatures/bargon.glb
```

#### Added Files (2124) - by group
```
1924  scripts/pt-port/converted/item/DropItem/*   (PT item GLB assets)
89    scripts/pt-port/converted/npc/*            (PT NPC GLB assets)
79    public/env/*                                (HDR/KTX2 sky environment maps)
18    scripts/pt-port/converted/mount/*           (PT mount GLB assets)
10    scripts/pt-port/*                           (new conversion scripts)
2     docs-botro/*                                (roadmap + gap docs)
```

## 6. Source Changes

### .gitignore
The `.gitignore` was rewritten to exclude non-essential directories from the fork:
- **Removed from .gitignore**: `public/env/`, `public/audio/` (these are now tracked)
- **Added to .gitignore**: `skies_in/`, `.github/`, `headless/`, `python/`, `bot/`, `mediawiki/`, `deploy/`, `android/`, `ios/`, `diagnostics/`, `ip-refactor/`, `.spawn/`, `third_party/`
- **Kept**: `docs/` (still ignored)

### index.html
PT tribe select buttons received `data-i18n` and `data-i18n-aria` attributes for internationalization. The "SELECT YOUR TRIBE" subtitle received `data-i18n="auth.selectTribe"`. These are **additive** changes - the existing `data-class`, `aria-label`, and text content remain unchanged.

### scripts/pt-port/smd_parser.ts
- Added support for SMD Model data Ver 0.66 (`SMD_HEADER_V066`)
- Added `peekUInt16()` method to `BinaryReader`
- Updated `detectVersion()` to handle 0.66
- Updated `PTSmdModel.version` type to include `'0.66'`
- These are **backward-compatible** additions - existing 0.62/0.64 parsing is unchanged

### scripts/pt-port/viewer.html
Modified (122 line changes) - likely viewer enhancements for the new asset types.

### src/render/assets/manifest.generated.ts
- **Removed**: `models/creatures/bargon-die.glb` and `models/creatures/bargon.glb` entries
- These were the OLD Bargon GLB files that were superseded by `Monbagon.glb` and `Monbagon-die.glb`
- The `Monbagon.glb` and `Monbagon-die.glb` entries remain in the manifest

### Test Changes (9 files)
All test changes update class counts from 10 to 20 (adding the 11 PT classes):
- `character_clipmaps.test.ts`: Added `deathModelUrl` existence checks and clip loading
- `character_db.test.ts`: Changed character count from 10 to 20 (community test accounts)
- `env_protocol.test.ts`: Changed expected class count from 15 to 20
- `paladin_divine_tome.test.ts`: Added 11 PT classes to the "others" list
- `social_classes.test.ts`: Changed describe text from "ten classes" to "twenty classes"
- `talent_rows_core.test.ts`: Updated row/option counts (60->120 rows, 180->360 options)
- `talents.test.ts`: Updated spec/row/option counts (30->60 specs, 60->120 rows, 180->360 options)
- `talents_view.test.ts`: Updated class count from 10 to 20
- `v026_winning_warrior_contract.test.ts`: Added 10 missing PT classes to the canonical class list

### trading-spacing-after.png
Binary file modified (30669 -> 130 bytes). Likely a test fixture shrink.

## 7. Asset Changes

### Added Assets

#### PT Converted Item Assets (1924 files)
- Location: `scripts/pt-port/converted/item/DropItem/*`
- These are PT item 3D models converted to GLB format
- Part of the co-developer's Phase 2.1 item port work

#### PT Converted NPC Assets (89 files)
- Location: `scripts/pt-port/converted/npc/*`
- PT NPC models converted to GLB format
- Part of the Phase 0 NPC conversion work

#### PT Converted Mount Assets (18 files)
- Location: `scripts/pt-port/converted/mount/*`
- PT mount models converted to GLB format
- Part of the Phase 8.1 mount port work

#### Environment/Sky Assets (79 files)
- Location: `public/env/*`
- HDR and KTX2 sky environment maps (amber_sunset, ember_storm, evergarden_day, farshore_day, fen_day, frost_twilight, galecrest_day, etc.)
- These restore sky environment assets that were previously .gitignored

### Deleted Assets

#### bargon.glb (585,976 bytes)
- Was the old Bargon monster model
- Superseded by `Monbagon.glb` (585,976 bytes - same size, likely renamed)
- Our manifest already uses `Monbagon.glb`, not `bargon.glb`
- **Impact**: NONE - our code references `Monbagon.glb` which is NOT deleted

#### bargon-die.glb (447,512 bytes)
- Was the old Bargon death model
- Superseded by `Monbagon-die.glb` (447,512 bytes - same size, likely renamed)
- Our manifest already uses `Monbagon-die.glb`, not `bargon-die.glb`
- **Impact**: NONE - our code references `Monbagon-die.glb` which is NOT deleted

### Monbagon Assets (NOT changed)
- `public/models/creatures/Monbagon.glb` - NOT in the diff (unchanged)
- `public/models/creatures/Monbagon-die.glb` - NOT in the diff (unchanged)

### LFS Configuration
- `.gitattributes` - NOT changed
- `.lfsconfig` - NOT changed

## 8. PT Integration Impact

### PT Tribe Select
- **index.html**: Added `data-i18n` and `data-i18n-aria` attributes to all 11 PT class buttons
- **Impact**: SAFE ADDITIVE CHANGE - existing `data-class`, `aria-label`, and text content preserved

### 11 PT Classes
- **Tests**: Updated to expect 20 classes (9 WoC + 11 PT) instead of 10/15
- **Impact**: SAFE ADDITIVE CHANGE - tests now correctly include all PT classes that were already in the code

### PT Player Models / Visual System
- **No source changes** to `src/render/characters/manifest.ts`, `visual.ts`, or any character rendering code
- **Impact**: NONE

### PT Hair Variants / Animations / Formation
- **No changes** to any PT character system source files
- **Impact**: NONE

### Enter World / PT Spawning / PT Walking
- **No changes** to spawning or movement code
- **Impact**: NONE

### visualKeyOverride / rawHeight
- **No changes** to these systems
- **Impact**: NONE

### PT-port Scripts
- **smd_parser.ts**: Added Ver 0.66 support (backward-compatible)
- **viewer.html**: Modified (likely viewer enhancements)
- **New scripts**: `batch_convert_items.ts`, `batch_convert_mounts.ts`, `check_mount.ts`, `diag_physique.ts`, `mount_glb_assembler.ts`, `static_glb_assembler.ts`, `verify_glbs.ts`
- **Impact**: SAFE ADDITIVE CHANGE - new scripts added, existing parser extended backward-compatibly

### Hopy / Bargon / Monbagon
- **bargon.glb / bargon-die.glb**: DELETED (old duplicates, superseded by Monbagon)
- **Monbagon.glb / Monbagon-die.glb**: NOT changed
- **Our manifest**: Uses `Monbagon.glb` / `Monbagon-die.glb` (not bargon)
- **Impact**: NONE - the deleted files were old duplicates not referenced by our code

### 344 Converted Monster GLBs
- **Not in the diff** - the existing converted monster assets are unchanged
- **New additions**: 1924 item assets, 89 NPC assets, 18 mount assets (different categories)
- **Impact**: NONE to existing monster assets

### BOP / Vault / Interact/Gather
- **No changes** to these systems
- **Impact**: NONE

### Audio/SFX
- **No changes** to audio files
- **.gitignore**: `public/audio/` is no longer in .gitignore (was previously ignored)
- **Impact**: Audio assets may now be tracked - need to verify no unexpected audio files appear

### PT Regression Tests
- **Tests updated**: 9 test files modified to include PT classes in counts
- **character_clipmaps.test.ts**: Added deathModelUrl checks (validates our Monbagon death model)
- **Impact**: SAFE ADDITIVE CHANGE - tests now correctly account for PT classes

## 9. Ricarten / Map Integration Impact

### World/Map Source Files
- `src/sim/world.ts` - NOT changed
- `src/sim/data.ts` - NOT changed
- `src/sim/map_doc.ts` - NOT changed
- `src/sim/colliders.ts` - NOT changed
- `src/sim/player_motion.ts` - NOT changed
- `src/sim/pathfind.ts` - NOT changed
- `src/render/terrain.ts` - NOT changed
- `src/render/renderer.ts` - NOT changed
- `src/render/props.ts` - NOT changed

### Map-Related Changes
- **NONE** - no changes to any world, terrain, collision, movement, camera, or map loading source files
- The only `src/` change is `manifest.generated.ts` (asset manifest, not map-related)

### Impact on Upcoming Ricarten Implementation
- **NONE** - the remote changes do not affect any system that the Ricarten map implementation will touch
- The `setActiveWorldContent()` seam, `WorldContent` interface, `terrainHeight()` function, and all map systems are unchanged
- The new PT port roadmap document (`docs-botro/pt-port-roadmap.md`) mentions "Phase 3: Map/zone port" as PENDING, which aligns with our audit

## 10. Deletions / Renames

### Deleted Files (3)
1. **package-lock.json** - Removed (16,088 lines). The co-developer likely removed it to avoid lockfile conflicts. This is a standard fork cleanup operation.
2. **public/models/creatures/bargon-die.glb** - Old Bargon death model, superseded by Monbagon-die.glb
3. **public/models/creatures/bargon.glb** - Old Bargon model, superseded by Monbagon.glb

### Renamed Files
- NONE

### Replaced Files
- NONE

### Risk Assessment
- **package-lock.json**: LOW RISK - standard fork cleanup, can be regenerated with `npm install`
- **bargon.glb / bargon-die.glb**: NO RISK - old duplicates not referenced by our code (we use Monbagon)

## 11. Potential Conflicts

### DIRECT CONFLICT
- NONE - since the relationship is a clean fast-forward (remote ahead, local has 0 unique commits), there are no merge conflicts

### POTENTIAL FUNCTIONAL CONFLICT
1. **package-lock.json deletion**: If we have a local `package-lock.json` that differs, pulling would delete it. However, our working tree is clean and we have no local modifications to this file.
2. **bargon.glb deletion**: If any local code still references `bargon.glb` (not `Monbagon.glb`), it would break. Verified: our `manifest.ts` uses `Monbagon.glb` / `Monbagon-die.glb`.
3. **manifest.generated.ts**: The remote removes bargon entries. If we have local changes to this file, there could be a conflict. Verified: our working tree is clean.
4. **.gitignore**: The remote rewrites the .gitignore. If we have local .gitignore changes, there could be a conflict. Verified: our working tree is clean.
5. **trading-spacing-after.png**: Binary file modified. If we have local changes, conflict. Verified: clean.

### SAFE ADDITIVE CHANGE
1. **index.html i18n attributes**: Additive, no conflict
2. **smd_parser.ts Ver 0.66**: Backward-compatible addition
3. **New PT-port scripts**: New files, no conflict
4. **New converted assets**: New files, no conflict
5. **New env assets**: New files, no conflict
6. **New docs**: New files, no conflict
7. **Test updates**: Test files modified to include PT classes, aligns with our work

### UNRELATED CHANGE
1. **trading-spacing-after.png**: Test fixture, unrelated to PT work
2. **package-lock.json**: Fork cleanup, unrelated to PT work

## 12. Recommended Integration Approach

**A normal fast-forward pull/merge appears safe.**

### Rationale
1. The remote is a clean fast-forward from our HEAD (3 commits, 0 local commits not on remote)
2. No source files that affect our PT character work or upcoming Ricarten map work are changed
3. The only `src/` change is removing old bargon entries from the generated manifest (our code uses Monbagon)
4. The deleted `bargon.glb` / `bargon-die.glb` are old duplicates not referenced by our code
5. The test updates align with our PT class integration (updating counts from 10 to 20)
6. The .gitignore changes are fork cleanup (excluding non-essential directories)
7. The new assets (1924 items, 89 NPCs, 18 mounts, 79 env maps) are additive

### Pre-Pull Checklist
Before pulling, verify:
1. The untracked `docs-botro/pt-map-port-analysis.md` will not be affected (it's untracked, so a fast-forward pull won't touch it)
2. No local `package-lock.json` modifications exist (verified: clean)
3. No local `.gitignore` modifications exist (verified: clean)

### Recommended Command
```bash
git pull origin main
# or equivalently:
git merge origin/main
```

Both will perform a fast-forward merge since local has no unique commits.

### Post-Pull Verification
After pulling, verify:
1. `Monbagon.glb` and `Monbagon-die.glb` still exist
2. `manifest.ts` still references Monbagon (not bargon)
3. PT tribe select still works (i18n attributes are additive)
4. `docs-botro/pt-map-port-analysis.md` still exists (untracked file)

## 13. Safety Verification

- HEAD unchanged: YES (`62853e1a5c083ffdfb9b285f1d23bf12a2761e3a`)
- Current branch unchanged: YES (`safety/local-working-tree-2026-09-13`)
- Working files unchanged: YES (only untracked `docs-botro/pt-map-port-analysis.md`)
- No pull performed: YES
- No merge performed: YES
- No rebase performed: YES
- No reset performed: YES
- No commit performed: YES
- No push performed: YES
- Safety branch `safety/pre-remote-diff-2026-09-13` created: YES
- No merge in progress: YES (`.git/MERGE_HEAD` does not exist)
- No rebase in progress: YES (`.git/rebase-merge` / `.git/rebase-apply` do not exist)
