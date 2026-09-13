---
description: "Priston Tale character/class implementation rule for the Botro fork of World of ClaudeCraft. Fighter is the integration baseline; MagicPT-Chinese is the character source of truth."
trigger: always_on
---

# PT Character Implementation Rule

This rule governs EVERY Priston Tale character/class implementation task in
this repository (the Botro fork of World of ClaudeCraft).

It is a DEVELOPMENT RULE, not an implementation task. It constrains how PT
character work is planned, audited, and executed.

## 1. PRIMARY PRINCIPLE

For every PT character that is added:

- FIGHTER = TECHNICAL IMPLEMENTATION BASELINE
- MagicPT-Chinese = CHARACTER SOURCE OF TRUTH

The existing PT Fighter implementation is the reference for HOW a PT character
is integrated into the current World of ClaudeCraft / Botro architecture.

The MagicPT-Chinese source is the authority for WHAT the new character is.

Never reverse these responsibilities.

Key architectural patterns to reuse from Fighter:

- class registration
- visual registration with `rawHeight` pinned on ALL variants (default + hair)
- character selection
- hair selection via `visualKeyOverride`
- character preview
- player spawning
- portrait integration (visualKeyOverride flows to HUD card, target frame,
  character window)
- HUD character card prewarm for the override visual key
- test structure including rawHeight consistency tests

## 2. FIGHTER IS THE IMPLEMENTATION BASELINE

When adding a new PT character, first study the existing PT Fighter
implementation. Use Fighter as the proven reference for:

- class registration
- PT character registration
- visual registration
- GLB integration
- character selection
- character preview
- hair selection
- character presentation movement
- player spawning
- player-character integration
- animation integration
- portrait integration
- visualKey / visualKeyOverride
- test structure
- PT asset conversion workflow

Reuse the existing architecture wherever it is generic. Do NOT blindly copy
Fighter-specific character data.

## 3. MAGICPT-CHINESE IS THE CHARACTER AUTHORITY

The source repository is:

`C:\Users\jhing\CascadeProjects\PT-Project\MagicPT-Chinese`

For every new character, independently inspect the corresponding MagicPT
source before implementation. Determine the actual source information
available for that character, including where applicable:

- character/job code
- class/group identifiers
- job advancement tiers
- body model
- armor model
- head model
- hair models
- textures
- skeleton
- SMD/SMB
- INX
- animations
- animation variants
- stats
- stat growth
- HP behavior
- mana behavior
- stamina behavior
- resource type
- resource formulas
- weapons
- armor
- skills
- buffs
- passive abilities
- summons
- special mechanics
- effects
- class restrictions
- starting equipment

Do not assume these values are the same as Fighter.

## 4. NEVER "COPY FIGHTER AND RENAME"

A new character must NOT be implemented by:

1. Copying Fighter
2. Renaming Fighter
3. Changing the model
4. Changing the class name
5. Calling it complete

Instead:

1. Study Fighter's implementation.
2. Study the actual MagicPT source for the new character.
3. Separate generic architecture from character-specific data.
4. Reuse the architecture.
5. Implement the new character using the verified MagicPT data.

## 5. CHARACTER-SPECIFIC DATA MUST BE VERIFIED

Never assume that Fighter's:

- stats
- resource
- abilities
- skills
- talents
- role
- weapons
- armor
- job tiers
- animation mapping
- effects
- starting equipment
- class behavior

apply to another PT character.

If the MagicPT source confirms something is shared, it may be reused. If it
is not confirmed, treat it as character-specific until verified.

## 6. ANIMATION RULE

Every new PT character requires its own animation audit. Do NOT assume:

- PT STAND = WoC idle
- PT WALK = WoC walk
- PT RUN = WoC run

Animation names describe the source system, not necessarily the final
semantic behavior. Inspect the actual animation behavior and create an
explicit mapping:

`PT SOURCE CLIP -> WoC SEMANTIC STATE`

If a source character's clips behave differently from their names, preserve
the original PT clip names and map them semantically. Do not rename source
clips simply to make them match WoC terminology.

If multiple variants of an animation exist, inspect the source context/map
position and select the correct variant. Preserve the existing generic PT
animation handling already established in the Fighter implementation.

## 7. CHARACTER ASSETS

Use authentic MagicPT player-character assets whenever they are available.
A PT class is a PLAYER CHARACTER. Do not implement a PT Fighter, Mechanician,
Archer, Pikeman, Knight, Atalanta, Priestess, Magician, or other PT class as
a monster/mob merely because the model can technically be rendered by the
creature system. The character must integrate with the player-character
architecture.

Use the modern WoC character-selection UI. Do NOT reproduce the old MagicPT
character-selection UI unless explicitly requested.

Target:

- AUTHENTIC MAGICPT CHARACTER
- MODERN WOW-STYLE/WOC CHARACTER INTEGRATION

## 8. GAMEPLAY IMPLEMENTATION MUST BE INCREMENTAL

Do not attempt to recreate an entire PT class in one uncontrolled task.
Implement characters in controlled phases. Typical order:

- Phase A: class foundation, authentic identity, stats, resource, basic
  growth, basic equipment foundation
- Phase B: signature abilities
- Phase C: defensive/utility mechanics
- Phase D: advanced mechanics/summons
- Phase E: job progression
- Phase F: VFX/effects
- Phase G: weapon/armor restrictions

Only implement the phase explicitly requested by the task. Do not silently
expand the scope.

## 9. SOURCE UNCERTAINTY RULE

If MagicPT contains data that is binary, incomplete, ambiguous, corrupted,
unavailable, or not confidently decoded: DO NOT GUESS. Instead:

- identify what was verified
- identify what remains unknown
- determine whether implementation can safely continue
- implement only the verified portion
- report the limitation

Never invent PT-specific values merely to make a character appear complete.

## 10. PRESERVE EXISTING CHARACTERS

Every new character implementation must preserve all previously implemented
PT characters. At minimum, do not regress:

- Fighter
- Mechanician
- existing PT visual assets
- character selection
- hair selection
- character preview
- presentation movement
- player spawning
- animation behavior

If an architectural change affects an existing character, run regression
tests and verify its behavior. Do not alter Fighter's character-specific
behavior just to make another class easier to implement.

## 11. CODEBASE DISCIPLINE

Before editing:

1. Inspect the existing Fighter implementation.
2. Inspect the relevant MagicPT source.
3. Identify reusable architecture.
4. Identify character-specific differences.
5. Determine the smallest safe implementation scope.

During editing:

- avoid unrelated refactoring
- avoid unrelated cleanup
- preserve existing behavior
- do not duplicate generic systems unnecessarily
- follow the current repository architecture
- keep character-specific logic isolated where appropriate
- add comments for important PT-specific decisions

After editing:

- explain what changed
- explain why it changed
- identify what came from MagicPT
- identify what was reused from Fighter
- report tests
- report TypeScript/build status
- report unresolved source limitations

Do not create unnecessary documentation for every task.

## 12. TESTING RULE

Every new PT character must have focused tests appropriate to the
implementation scope. Tests should verify applicable items such as:

- class registration
- character identity
- PT visual key
- correct assets
- hair variants
- rawHeight consistency across all hair variants (body scale stability)
- animation registration
- animation semantic mapping
- character selection
- player spawning
- class-specific stats
- resource type
- implemented gameplay behavior

Always run relevant regression tests for existing PT characters. At minimum:

- TypeScript validation
- focused character tests
- relevant existing regression tests

Run the project build when practical. A successful TypeScript compilation
alone does NOT mean the character is complete.

## 13. VISUAL VALIDATION

When visual implementation is part of the task, perform an actual visual
review when the environment allows it. Verify:

- correct character
- correct body
- correct armor
- correct hair
- correct textures
- correct proportions
- correct idle/presentation state
- correct walking
- correct running
- correct combat idle
- correct attack
- correct hit/death behavior where applicable

Specifically verify that the new character is not accidentally displaying
Fighter, Mechanician, another PT class, a mob, or a generic WoC creature. If
an animation looks wrong, investigate the actual PT source animation before
changing the WoC state machine.

### 13.1 Body Scale Consistency Across Hair Swaps

Every PT character with hair variants MUST pin `rawHeight` to the SAME value
on ALL variants (default + hair2 + hair3) in `src/render/characters/manifest.ts`.
The renderer derives the body scale from `height / rawHeight`. If `rawHeight`
is unset on any variant, the renderer measures its posed skinned bounds
dynamically, and different hair geometry produces different bounding-box
heights, so switching hair changes the body size in character selection and
in-world.

A focused test MUST verify all variants share the same `rawHeight`. This is
a regression risk for every new PT character with hair variants.

### 13.2 HUD Character Card Portrait Consistency

The HUD player frame, target frame, target-of-target frame, and character
window portrait must all show the same hair variant as the in-world model.
This flows through `visualKeyOverride` on the player entity.

The post-entry preview prewarm plan (`Hud.postEntryPreviewPrewarmUnits`)
MUST prewarm the `visualKeyOverride` portrait so the HUD character card
shows the selected hair immediately on entry rather than falling back to
the class crest while the live capture completes. This is generic: any PT
class that sets `visualKeyOverride` gets the prewarm automatically. No
per-character work is needed beyond setting `visualKeyOverride` on the
player entity (which the character-selection flow already does).

## 14. GIT RULE

Work locally. Do NOT commit, push, create branches, merge, modify GitHub, or
publish changes unless explicitly requested by the user. Preserve the
current working tree and all existing work.

## 15. REQUIRED END-OF-TASK REPORT

For every future PT character implementation task, report:

### Character
Name of character implemented.

### MagicPT Source Verified
List the relevant MagicPT assets/data that were actually verified.

### Fighter Architecture Reused
List the generic Fighter implementation patterns reused.

### Character-Specific Implementation
List the new character-specific changes.

### Animation Mapping
Show: `PT Source Animation -> WoC Semantic State`

### Tests
Report: focused tests, regression tests, TypeScript, build.

### Visual Validation
PASS / FAIL / NOT PERFORMED

### Known Limitations
Only verified limitations.

### Repository State
Confirm: local changes only, no commit/push unless explicitly requested.

## 16. FINAL RULE

For every PT character:

DO NOT THINK: "How can I copy Fighter?"

THINK: "How can I reuse Fighter's proven integration architecture while
accurately implementing this character from its own MagicPT source?"

The required development model is:

1. MAGICPT SOURCE
2. CHARACTER-SPECIFIC AUDIT
3. FIGHTER ARCHITECTURE REFERENCE
4. CHARACTER-SPECIFIC IMPLEMENTATION
5. FOCUSED TESTS
6. REGRESSION TESTS
7. VISUAL VALIDATION

Fighter is the blueprint for integration. MagicPT-Chinese is the authority
for character identity.
