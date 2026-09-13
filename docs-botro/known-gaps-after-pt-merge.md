# Known Gaps After PT Merge Cleanup

Pre-existing issues carried over from Jhing's merge commit (`62853e1a5c`).
These are NOT caused by the cleanup commit (`719e523c88`), but were discovered
during the audit and need dedicated fixes in future sessions.

## 1. Wiki stills script broken: 10 PT class guide images missing

**Status:** Pre-existing, blocks `tests/guide.test.ts`

`npm run wiki:stills` (`scripts/wiki/render_model_stills.mjs`) fails at
build time. The script bundles `scripts/wiki/stills_render_entry.js` into
an IIFE via esbuild, but the transitive import graph pulls in modules that
use `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`
(see `src/render/characters/portrait_bitmap_encode.ts`,
`src/render/shader_warm_client.ts`, `src/render/zone_build_pool.ts`,
`src/ui/icon_prewarm.ts`). esbuild rewrites `import.meta` to an empty
object in IIFE format, so the bundle throws at boot with:

```
Error: stills bundle still reads an import.meta.env field with no define
(esbuild rewrites import.meta to an empty object in an IIFE, so the page
TypeErrors at boot).
```

**Impact:** The 10 new PT class stills (`player_tempskron_mechanician.webp`,
`player_tempskron_pikeman.webp`, `player_tempskron_archer.webp`,
`player_morion_knight.webp`, `player_morion_atalanta.webp`,
`player_morion_priestess.webp`, `player_morion_magician.webp`,
`player_atlanteon_assassin.webp`, `player_atlanteon_martial_artist.webp`,
`player_atlanteon_shaman.webp`) are never generated. Only
`player_tempskron_fighter.webp` exists (it was generated before the
script broke).

`tests/guide.test.ts` > "ships a committed WebP on disk for every baked
still url" fails on each missing file.

**Fix approach:** Either add `import.meta.url` defines to the esbuild
config in `render_model_stills.mjs`, or exclude the worker-spawning modules
from the stills bundle (the stills renderer only needs the model assembly
path, not the full client runtime).

## 2. LFS clean filter mismatch on `trading-spacing-after.png`

**Status:** Pre-existing, cosmetic

Jhing committed `trading-spacing-after.png` as a raw 30669-byte PNG, but
`.gitattributes` marks `*.png` for LFS. The LFS clean filter would convert
it to a 130-byte pointer, so `git status` always shows the file as
modified after checkout. The file content is identical on disk and in git;
only the LFS filter disagrees.

**Impact:** Cosmetic noise in `git status`. No functional effect.

**Fix:** `git rm --cached trading-spacing-after.png && git add
trading-spacing-after.png` will re-stage it as an LFS pointer.

## 3. 583 raw binary files (163 MB) committed outside LFS

**Status:** Pre-existing, repo hygiene

Jhing's `e14c050879` ("safety: checkpoint local PT and WoC working tree")
committed the entire WoC repo snapshot with raw binaries for file types
that `.gitattributes` marks as LFS (`*.glb`, `*.png`, `*.jpg`, `*.hdr`,
`*.ktx2`, `*.mp3`, `*.wav`, `*.ogg`, `*.obj`, etc.). This adds 163 MB of
binary data permanently to the git pack that should have been stored as
LFS pointers.

The affected files span every asset category: `public/models/creatures/`,
`public/models/biome/`, `public/models/drakelands_kit/`, `public/map_art/`,
`public/audio/`, `build/`, and more. The full list is 583 files.

**Impact:**
- Repo clone size is 163 MB larger than it should be.
- `git status` shows modified for any of these files after checkout if
  the LFS smudge/clean filter runs.
- Future commits that touch these files will silently migrate them to
  LFS pointers, creating large diffs.

**Fix approach:** Run `git lfs migrate import` with the patterns from
`.gitattributes` to rewrite history and convert all raw binaries to LFS
pointers. This is a destructive history rewrite that requires
coordination with all contributors (force push, re-clone). Alternatively,
accept the current pack size and ensure all NEW binary commits go through
LFS.

## 4. Tribe card labels in `index.html` not i18n-wired

**Status:** Pre-existing, minor

The PT tribe select panel has hardcoded English for:
- Tribe card names (`TEMPSKRON`, `MORION`, `ATLANTEON`)
- Tribe card class lists (`Fighter . Mechanician . Pikeman . Archer`)
- Tribe card aria-labels (`Select Tempskron tribe`)
- The `PRISTON TALE` title

The class buttons and subtitle ARE now wired with `data-i18n` and
`data-i18n-aria` attributes (fixed in the cleanup commit). The tribe
labels remain English-only because they are proper nouns / brand names
and would need new catalog keys.

**Impact:** English-only text in translated character selection UI for
the tribe cards. The class buttons themselves are properly localized.

**Fix:** Add catalog keys for tribe names and class-list strings, then
add `data-i18n` attributes to the tribe card elements in `index.html`.

## Summary

| Gap | Severity | Blocks tests? | Fix scope |
|---|---|---|---|
| Wiki stills script broken | Medium | Yes (`guide.test.ts`) | Script fix |
| LFS filter on trading-spacing-after.png | Low | No | One-liner |
| 583 raw binaries outside LFS | Medium | No | History rewrite or accept |
| Tribe card labels not i18n-wired | Low | No | Catalog + HTML edit |
