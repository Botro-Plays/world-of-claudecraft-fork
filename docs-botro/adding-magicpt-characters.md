# Adding MagicPT Characters to World of ClaudeCraft

## Reference Guide: Tempskron Fighter Implementation

This document records every change made to add the Priston Tale (PT) Tempskron
Fighter as a playable character in the World of ClaudeCraft (WoC) engine. It
serves as a step-by-step reference for adding more characters from the MagicPT
client (e.g. Mechanician, Archer, Pikeman, Knight, Atalanta, Priestess, Magician).

---

## 1. PT Source Asset Layout

All PT character assets live under the MagicPT client directory:

```
<client_root>\char\<charDir>\
```

For the Fighter, `charDir` is `tmABCD`. Each character ships:

| File | Purpose |
|---|---|
| `tmbB01.smd` | Body mesh (armor variant B, the Fighter's armor) |
| `tmh-B01.smd` | Head/hair mesh, style 1 |
| `tmh-B02.smd` | Head/hair mesh, style 2 |
| `tmh-B03.smd` | Head/hair mesh, style 3 |
| `m1.smb` | Complete skeleton + ALL animation keyframes (33MB, 66 bones, frames 0-11043) |
| `M1Bip.inx` | Animation state name to frame range mappings (150 motions) |
| `TmbB01.bmp` | Body texture |
| `TmhB01.bmp` | Hair texture, style 1 |
| `TmhB02.bmp` | Hair texture, style 2 |
| `TmhB03.bmp` | Hair texture, style 3 |

### Armor Job Mapping

PT maps character jobs to armor variants via `ArmorJobNum` in `playsub.cpp`:

```
{0,1,0,3,2,5,4,7,6,8,9,10}
```

- Job 1 (Fighter) -> index 1 -> armor B -> `tmbB01.smd`
- Job 2 (Mechanician) -> index 0 -> armor A -> `tmbA01.smd`

### Head/Hair Mapping

The head model comes from `szModel_FighterFaceName[FaceCode][HairCode]` in
`playmodel.h`. The default face is `FaceCode=0`, and the three hair styles are
`HairCode` 0, 1, 2, resolving to `tmh-B01/B02/B03.smd`.

### INX State Names

The complete `m1.smb` file contains these named animation states:

| State | Frames | Duration | Semantic |
|---|---|---|---|
| STAND | 1-51 | 1.70s | Standing idle |
| RESTART | 167-225 | 1.97s | Get up from ground |
| FALLDOWN | 238-248 | 0.37s | Falling pose |
| FALLSTAND | 261-295 | 1.17s | Stand up from crouch |
| FALLDAMAGE | 308-343 | 1.20s | Fall damage reaction |
| WALK | 345-373 | 0.97s | Walking |
| RUN | 632-652 | 0.70s | Running |
| EAT | 852-872 | 0.70s | Eating emote |
| DAMAGE | 1229-1251 | 0.77s | Hit reaction |
| DEAD | 1264-1333 | 2.33s | Death |
| ATTACK | 1343-1383 | 1.37s | Attack swing |
| SKILL | 1754-1794 | 1.37s | Skill cast |
| YAHOO | 2122-2172 | 1.70s | Celebration/jump-like |

**Important:** Use the complete `m1.smb` file, NOT the split `M1-motion1..14.smb`
files. The split files only cover frames 0-7423 and have fewer bones, missing
the SKILL animations and producing incorrect animation reversals.

---

## 2. GLB Assembly Pipeline

### 2.1 The GLB Assembler (`scripts/pt-port/glb_assembler.ts`)

This is the generic converter that combines PT source assets into a glTF 2.0
binary (.glb) file. It handles:

- SMD mesh parsing (vertices, faces, bone weights, material groups)
- SMB skeleton + animation keyframe parsing
- INX animation state to frame range mapping
- BMP/TGA to PNG texture conversion
- Z-up (3ds Max) to Y-up (glTF) coordinate conversion
- Reversed clip generation (for jump animations)

Key constants:
- `TICKS_PER_FRAME = 160` (PT's tick rate per frame)
- `FPS = 30` (PT's animation playback rate)
- `FONE = 256` (PT's fixed-point scale)

The coordinate conversion is a +90 degree rotation around X:
`(x, y, z) -> (x, z, -y)`

### 2.2 The Fighter Assembler (`scripts/pt-port/fighter_assembler.ts`)

The character-specific entry point. For the Fighter it:

1. Defines hair variants (3 head SMDs)
2. Defines reversed clips (FALLSTAND reversed for jump)
3. Calls `buildGlb` for each hair variant

To add a new character, copy this file and change:
- `HAIR_VARIANTS` array (head SMD names)
- `REVERSED_CLIPS` array (if the character has jump-capable clips)
- The body SMD path (`tmbB01.smd` -> `tmbA01.smd` for Mechanician, etc.)
- The output GLB names

### 2.3 Reversed Clips

The GLB assembler supports `reversedClips` in `GlbBuildOptions`:

```ts
reversedClips?: { sourceState: string; exportName: string }[];
```

Each entry creates a new clip by playing an existing INX state's keyframes in
reverse (time-mirrored). The keyframe times are transformed as `t' = duration - t`
and then the keyframe array is reversed to keep times in ascending order.

For the Fighter, FALLSTAND reversed creates a jump-launch animation (crouch
down to spring up), while the normal FALLSTAND plays forward for the landing.

### 2.4 Running the Assembler

```bash
npx tsx scripts/pt-port/fighter_assembler.ts [client_root] [output_dir]
```

Defaults:
- `client_root` = `C:\Users\jhing\CascadeProjects\PT-Project\MagicPT-Chinese\client\`
- `output_dir` = `public/models/creatures/`

Output: 3 GLB files (`pt_fighter.glb`, `pt_fighter_hair2.glb`, `pt_fighter_hair3.glb`)

---

## 3. Class Definition (`src/sim/content/classes.ts`)

Register the new class in `CLASSES`:

```ts
tempskron_fighter: { ...WARRIOR_DEF, id: 'tempskron_fighter', name: 'Tempskron Fighter' },
```

The Fighter reuses the warrior's complete ability kit, stats, and talents by
spreading `WARRIOR_DEF`. Only the `id` and `name` change. For a class with
different abilities (e.g. Archer), define a full class definition instead.

The class id (`tempskron_fighter`) becomes the `templateId` on the player
entity and the key suffix for the visual definition (`player_tempskron_fighter`).

---

## 4. Visual Definition (`src/render/characters/manifest.ts`)

### 4.1 The VisualDef Entry

Add one entry per GLB in the `VISUALS` map:

```ts
player_tempskron_fighter: {
  url: `${CREATURES}/pt_fighter.glb`,
  height: HUMANOID_H,
  clips: {
    idle: 'STAND',
    combatIdle: 'STAND_COMBAT',
    walk: 'WALK',
    run: 'RUN',
    jump: 'FALLSTAND_REVERSED',
    fall: 'FALLDOWN',
    land: 'FALLSTAND',
    attack: ['ATTACK'],
    death: 'DEAD',
    hit: ['DAMAGE'],
  },
  walkRef: 5,
},
```

Key fields:
- `url`: path to the GLB under `public/models/creatures/`
- `height`: `HUMANOID_H` (the standard humanoid collision height)
- `clips`: maps WoC animation states to PT INX state names
- `walkRef`: tuning for WALK playback speed (see section 7)

### 4.2 Hair Variant Entries

Each hair variant gets its own VisualDef entry with the same clips:

```ts
player_tempskron_fighter_hair2: {
  url: `${CREATURES}/pt_fighter_hair2.glb`,
  height: HUMANOID_H,
  rawHeight: 49.91,  // pinned to default variant's height for consistent scaling
  clips: { /* same as default */ },
  walkRef: 5,
},
```

**Important: pin `rawHeight` on ALL variants, including the default.** The
renderer derives the body scale from `height / rawHeight`. If `rawHeight` is
unset, the renderer measures the posed skinned bounds dynamically at load
time. Different hair geometry produces different bounding-box heights, so
without pinning, switching hair changes the body size in character selection
and in-world. Pin every variant (default + hair2 + hair3) to the SAME
`rawHeight` value so only the head/hair mesh changes, not the body scale.

To find the right `rawHeight` value, measure each GLB's raw bounding-box
height (the Y extent of its POSITION attribute) and pick one value to pin
across all variants. The default variant's measured height is the natural
choice. Measure with:

```bash
node -e "
const { NodeIO } = require('@gltf-transform/core');
const io = new NodeIO();
(async () => {
  for (const f of ['pt_fighter.glb', 'pt_fighter_hair2.glb', 'pt_fighter_hair3.glb']) {
    const doc = await io.read('public/models/creatures/' + f);
    let minY = Infinity, maxY = -Infinity;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const arr = prim.getAttribute('POSITION').getArray();
        for (let i = 1; i < arr.length; i += 3) {
          if (arr[i] < minY) minY = arr[i];
          if (arr[i] > maxY) maxY = arr[i];
        }
      }
    }
    console.log(f, 'raw height =', (maxY - minY).toFixed(2));
  }
})();
"
```

Add a test that verifies all variants share the same `rawHeight`:

```ts
it('all variants share the same rawHeight for consistent body scale', () => {
  const def = VISUALS.player_tempskron_fighter;
  const hair2 = VISUALS.player_tempskron_fighter_hair2;
  const hair3 = VISUALS.player_tempskron_fighter_hair3;
  expect(def.rawHeight).toBeDefined();
  expect(hair2.rawHeight).toBeDefined();
  expect(hair3.rawHeight).toBeDefined();
  expect(def.rawHeight).toBe(hair2.rawHeight);
  expect(def.rawHeight).toBe(hair3.rawHeight);
});
```

### 4.3 The Modular Body Skip

PT characters use their own Bip01 skeleton, not the KayKit mixamorig skeleton.
The modular body system must skip them. In `manifest.ts`, the loop that creates
`player_<cls>_modular` entries explicitly skips the Fighter:

```ts
for (const cls of ALL_CLASSES) {
  if (cls === 'tempskron_fighter') continue;
  // ... create player_<cls>_modular entry
}
```

Add each new PT class to this skip list.

### 4.4 The visualKeyFor Function

`visualKeyFor(e: Entity)` resolves a player entity to its visual key:

```ts
if (e.visualKeyOverride && VISUALS[e.visualKeyOverride]) return e.visualKeyOverride;
return VISUALS[`player_${e.templateId}`] ? `player_${e.templateId}` : 'player_warrior';
```

The `visualKeyOverride` field on the entity lets the hair variant be selected
at runtime without changing the class. This is how the Fighter's 3 hair styles
swap in-world.

---

## 5. Character Selection UI (`index.html` + `src/main.ts`)

### 5.1 HTML: Class Card and Hair Selector

In `index.html`, add a class card button:

```html
<button type="button" class="mini-class pt-class" data-class="tempskron_fighter"
  aria-label="Tempskron Fighter class" aria-pressed="false">Tempskron Fighter</button>
```

And a hair style selector (shown only when the Fighter is selected):

```html
<div id="offline-pt-hair-row" class="skin-row" hidden>
  <div class="pt-hair-label">Hair Style</div>
  <div class="pt-hair-choices">
    <button class="btn btn-secondary pt-hair-btn sel" data-hair="0">Style 1</button>
    <button class="btn btn-secondary pt-hair-btn" data-hair="1">Style 2</button>
    <button class="btn btn-secondary pt-hair-btn" data-hair="2">Style 3</button>
  </div>
</div>
```

### 5.2 TypeScript: Hair State and Visual Key Mapping

In `src/main.ts`:

```ts
let offlinePtHair = 0; // chosen PT Fighter hair style (0-2)

const PT_FIGHTER_HAIR_KEYS = [
  'player_tempskron_fighter',
  'player_tempskron_fighter_hair2',
  'player_tempskron_fighter_hair3',
] as const;

function ptFighterVisualKey(hair: number): string {
  return PT_FIGHTER_HAIR_KEYS[hair] ?? PT_FIGHTER_HAIR_KEYS[0];
}
```

### 5.3 Hair Button Event Wiring

The hair buttons swap the 3D preview and store the selection:

```ts
document.querySelectorAll('#offline-pt-hair-row .pt-hair-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    offlinePtHair = Number(btn.dataset.hair ?? '0');
    // Update selected state on buttons...
    if (characterPreview) {
      characterPreview.setVisualKey(ptFighterVisualKey(offlinePtHair));
    }
  });
});
```

### 5.4 The previewClassBody Function

When the class is selected, the 3D preview must use the PT visual key, not the
modular body:

```ts
function previewClassBody(cls: PlayerClass): void {
  const look = modularLookForClass(cls);
  if (look) characterPreview.setModular(look.app, look.worn, cls);
  else if (cls === 'tempskron_fighter') {
    characterPreview.setVisualKey(ptFighterVisualKey(offlinePtHair));
  } else characterPreview.setClass(cls);
}
```

### 5.5 The startOffline Function

Pass the hair selection to `startOffline`:

```ts
async function startOffline(
  playerClass: PlayerClass,
  name: string,
  skin = 0,
  world?: WorldContent,
  seedOverride?: number,
  ptHair = 0,
): Promise<void> {
  // ...
  if (playerClass !== 'tempskron_fighter') {
    offlinePlayer.modularAppearance = modularAppearance;
  } else if (ptHair > 0) {
    offlinePlayer.visualKeyOverride = ptFighterVisualKey(ptHair);
  }
}
```

The `visualKeyOverride` on the entity is what makes the renderer, portrait
system, and character window all show the correct hair.

---

## 6. Animation State Mapping

### 6.1 The Clip Mapping

WoC animation states map to PT INX state names in the VisualDef `clips` object:

| WoC State | PT INX State | Description |
|---|---|---|
| idle | STAND | Standing pose |
| combatIdle | STAND_COMBAT | Braced combat stance (field STAND, mapPos=2) |
| walk | WALK | Walking cycle |
| run | RUN | Running cycle |
| jump | FALLSTAND_REVERSED | Jump launch (FALLSTAND reversed) |
| fall | FALLDOWN | Falling pose |
| land | FALLSTAND | Landing (stand up from crouch) |
| attack | ATTACK | Attack swing |
| death | DEAD | Death animation |
| hit | DAMAGE | Hit reaction |

### 6.2 STAND_COMBAT Export

The GLB assembler automatically exports the field STAND (mapPos=2) as
`STAND_COMBAT` in addition to the default village STAND. This is handled in
`glb_assembler.ts` and requires no per-character configuration.

### 6.3 Jump/Fall/Land Flow

The `visual.ts` state machine handles jump, fall, and land:

```ts
case 'jump':
  return this.action(c.jump) ?? this.action(c.idle);
case 'fall':
  return this.action(c.fall) ?? this.action(c.jump) ?? this.action(c.idle);
```

If no jump clip is defined, it falls back to idle. The land clip plays as a
one-shot when the entity touches ground.

### 6.4 Animation Playback Speed: walkRef

The `walkRef` field tunes how fast the WALK clip plays relative to movement
speed. The default `walkRef = 2.2` would spin the Fighter's legs too fast at
`RUN_SPEED = 7` yd/s (clamped to 1.8x). Setting `walkRef = 5` gives `7/5 = 1.4x`,
a natural walk cadence. `runRef` stays at the default (7) so RUN plays at 1.0x.

---

## 7. Walk/Run Movement Speed

### 7.1 The Walk Mode Flag

The run/walk toggle (R key) now affects actual movement speed, not just
animation. A `walkMode` boolean on `MoveInput` propagates through the entire
movement pipeline.

### 7.2 Files Changed for Walk Mode

| File | Change |
|---|---|
| `src/sim/types.ts` | Added `walkMode?: boolean` to `MoveInput` and `emptyMoveInput()` |
| `src/sim/player_motion.ts` | Added `WALK_MODE_SPEED_MULT = 0.45`, applied when `inp.walkMode` is true |
| `src/sim/move_input.ts` | Added `['walkMode', 'wm']` to `MOVE_FIELDS` for wire serialization |
| `src/game/input.ts` | All `readMoveInput()` return paths include `walkMode: this.gaitMode === 'walk'` |
| `src/net/online.ts` | Added `wm: mi.walkMode ? 1 : 0` to the wire message |
| `src/net/input_signature.ts` | Added `walkMode` to the change-detection signature |
| `src/render/self_motion.ts` | Added `walkMode` to the client-side prediction input |

### 7.3 The Speed Calculation

In `src/sim/player_motion.ts`:

```ts
export const WALK_MODE_SPEED_MULT = 0.45;

// In stepPlayerMotion:
let speed = RUN_SPEED * deps.moveSpeedMult(p);
if (inp.walkMode) speed *= WALK_MODE_SPEED_MULT;  // 7 * 0.45 = 3.15 yd/s
if (mz < 0) speed *= BACKPEDAL_MULT;              // backpedal is slower
```

### 7.4 Wire Protocol

The `walkMode` flag is sent over the wire as `wm` (1 or 0) in the `mi` object of
the `input` message. The server's `sanitizeMoveInput` in `src/sim/move_input.ts`
decodes it back to a boolean via the shared `MOVE_FIELDS` table.

### 7.5 Client-Side Prediction Parity

The `self_motion.ts` extrapolator uses the same `stepPlayerMotion` function with
the same `walkMode` flag, so client-predicted movement matches server-authoritative
movement exactly.

---

## 8. Portrait System Integration

The portrait system renders 2D headshots from the 3D model for the character
card, player frame, target frame, and context menus.

### 8.1 The Problem

PT characters carry their hair variant as `visualKeyOverride` on the entity,
but the portrait system only used `playerPortraitDataUrl(cls, skin)` which
always renders the default hair. The portrait did not match the in-world model.

### 8.2 Files Changed for Portraits

| File | Change |
|---|---|
| `src/ui/portrait_chip.ts` | Added `visualKeyOverride` to `PortraitChipOpts`, used in `portraitChipHtml` and `hydratePortraits` |
| `src/ui/unit_portrait_painter.ts` | Added `drawVisualOverride(canvas, visualKey, cls, skin)` |
| `src/ui/character_appearance.ts` | `activeCharacterAppearancePreview` accepts `visualKeyOverride` parameter |
| `src/ui/char_window.ts` | Passes `visualKeyOverride` to the portrait chip |
| `src/ui/hud.ts` | `drawPlayerFramePortrait`, `drawTargetPortrait`, `drawTargetOfTargetPortrait` use override; `renderCharPreview` passes override to 3D model |

### 8.3 The Portrait Chip

The `portraitChipHtml` function now renders the override visual key when no
modular look is present:

```ts
const portrait = mech
  ? visualPortraitDataUrl('player_mech', skin, framing)
  : look
    ? modularPortraitDataUrl(modularVisualKey(cls), look, framing)
    : visualKeyOverride
      ? visualPortraitDataUrl(visualKeyOverride, skin, framing)
      : playerPortraitDataUrl(cls, skin, framing);
```

The chip carries `data-visual-key` for hydration, and `onPortraitUpdate`
rehydrates the whole page when an override chip's portrait lands (since the
class filter cannot name it).

### 8.4 The Canvas Portrait

`UnitPortraitPainter.drawVisualOverride` renders the override visual key's
portrait, falling back to `drawClass` while assets load:

```ts
drawVisualOverride(canvas, visualKey, cls, skin) {
  const url = visualPortraitDataUrl(visualKey, skin);
  if (url) this.drawHeadshot(canvas, url);
  else this.drawClass(canvas, cls, skin);
}
```

### 8.5 The 3D Model Preview

`activeCharacterAppearancePreview` now returns the override visual key:

```ts
visualKey: catalog === 'mech'
  ? 'player_mech'
  : visualKeyOverride ?? `player_${cls}`,
```

This drives the character window's 3D turntable model.

### 8.6 HUD Character Card Portrait Prewarm

The HUD player frame, target frame, and target-of-target frame all use
`drawVisualOverride` to render the selected hair variant. However, the
post-entry preview prewarm plan only prewarms `player_<class>` portraits
(the default class portrait). Without prewarming the override visual key,
the HUD character card falls back to the class crest for a few frames
while the live capture completes (43 to 201 ms per cold portrait).

To make the HUD character card show the selected hair immediately on
entry, add a prewarm unit for the `visualKeyOverride` in
`Hud.postEntryPreviewPrewarmUnits`:

```ts
const override = self?.visualKeyOverride ?? null;
if (override) {
  units.push({
    family: 'char',
    label: `preview:portrait-override:${override}`,
    run: () => prewarmVisualKeyPortrait(override, self?.skin ?? 0),
  });
}
```

`prewarmVisualKeyPortrait` is exported from
`src/render/characters/portrait.ts` and prewarms any visual key portrait
(not just `player_<class>`). The unit runs through the same paced
background GPU lane as the other portrait prewarms, so it never blocks
the live frame.

This is generic: any PT class that sets `visualKeyOverride` for a hair
variant gets the HUD card prewarm automatically. No per-character work
is needed beyond setting `visualKeyOverride` on the player entity (which
the character-selection flow already does).

---

## 9. Run/Walk Gait Toggle

### 9.1 The Toggle State (`src/game/run_walk_toggle.ts`)

- `GaitMode = 'run' | 'walk'`
- Default: `'run'`
- Persisted in `localStorage` under key `woc_run_walk_mode`
- `effectiveRunning(mode, hysteresisRunning)` forces running false in walk mode

### 9.2 The Input Integration (`src/game/input.ts`)

The `Input` class stores `gaitMode: 'run' | 'walk' = 'run'`. The R key toggles
gait mode and invokes `onGaitModeChange`. `readMoveInput()` populates
`walkMode: this.gaitMode === 'walk'` on every return path.

### 9.3 The Renderer Integration (`src/render/renderer.ts`)

The renderer has a `forceWalk` property that suppresses the rendered run
selection when walk mode is enabled. This keeps the animation gait synchronized
with the simulation gait.

---

## 10. Tests

### 10.1 Test Files

| File | Tests | Coverage |
|---|---|---|
| `tests/pt_fighter.test.ts` | 32 | VisualDef registration, clip mappings, GLB contents, animation state selection, run/walk toggle |
| `tests/locomotion.test.ts` | 23 | Locomotion time scale, walkRef tuning |
| `tests/anim_state_entity_core.test.ts` | 9 | Animation state machine core |
| `tests/player_motion.test.ts` | 13 | Movement simulation, walk mode speed |
| `tests/character_appearance.test.ts` | 3 | Appearance preview visual key |
| `tests/player_look_core.test.ts` | 28 | Modular look composition |

### 10.2 Key Test Patterns

Test that the VisualDef exists and has the right clips:

```ts
it('registers player_tempskron_fighter in VISUALS', () => {
  expect(VISUALS['player_tempskron_fighter']).toBeDefined();
});

it('declares the required player animation clip mappings', () => {
  const def = VISUALS['player_tempskron_fighter'];
  expect(def.clips.idle).toBe('STAND');
  expect(def.clips.walk).toBe('WALK');
  expect(def.clips.run).toBe('RUN');
});
```

Test that the GLB file exists and contains the right animations:

```ts
it('contains STAND, WALK, RUN, ATTACK, DEAD, and DAMAGE animations', async () => {
  const io = new NodeIO();
  const doc = await io.read(GLB_PATH);
  const animNames = doc.getRoot().listAnimations().map(a => a.getName());
  expect(animNames).toContain('STAND');
  expect(animNames).toContain('WALK');
});
```

Test that visualKeyFor resolves a player entity correctly:

```ts
it('visualKeyFor resolves a player entity to player_tempskron_fighter', () => {
  const e: Entity = { kind: 'player', templateId: 'tempskron_fighter', ... };
  expect(visualKeyFor(e)).toBe('player_tempskron_fighter');
});
```

---

## 11. Step-by-Step Checklist for a New Character

To add a new PT character (e.g. Mechanician, Archer), follow these steps:

### Step 1: Identify Source Assets

1. Find the character directory under `char\` (e.g. `tmABCD` for Fighter)
2. Identify the body SMD (e.g. `tmbB01.smd` for armor B)
3. Identify the head/hair SMDs (e.g. `tmh-B01/B02/B03.smd`)
4. Confirm `m1.smb` (complete motion file) and `M1Bip.inx` exist
5. Identify textures (BMP files)

### Step 2: Audit the INX

1. List all INX state names and their frame ranges
2. Map each state to its semantic meaning (STAND, WALK, RUN, etc.)
3. Check for jump-capable clips (significant vertical pelvis movement)
4. Identify clips suitable for reversed export (e.g. FALLSTAND for jump)

### Step 3: Create the Assembler Script

1. Copy `scripts/pt-port/fighter_assembler.ts` to `<class>_assembler.ts`
2. Update `HAIR_VARIANTS` with the new character's head SMDs
3. Update `REVERSED_CLIPS` if the character has jump-capable clips
4. Update the body SMD path and output GLB names
5. Run: `npx tsx scripts/pt-port/<class>_assembler.ts`

### Step 4: Register the Class

1. Add the class to `CLASSES` in `src/sim/content/classes.ts`
2. Either spread an existing class def (for POC) or define a full one

### Step 5: Add Visual Definitions

1. Add a `player_<class>` entry to `VISUALS` in `src/render/characters/manifest.ts`
2. Add `player_<class>_hair2`, `_hair3` entries for each hair variant
3. Pin `rawHeight` to the SAME value on ALL variants (default + hair2 + hair3)
   so the body scale stays constant across hair swaps (see section 4.2)
4. Add the class to the modular body skip list
5. Map the INX state names to WoC animation states in `clips`
6. Tune `walkRef` if the WALK clip plays too fast/slow

### Step 6: Add Character Selection UI

1. Add a class card button in `index.html`
2. Add a hair style selector (if the character has hair variants)
3. Add the hair key mapping and `ptFighterVisualKey` equivalent in `src/main.ts`
4. Wire the hair button events
5. Update `previewClassBody` and `startOffline` for the new class

### Step 7: Portrait System

The portrait system changes are generic (they use `visualKeyOverride`), so no
per-character work is needed for the portrait chip, canvas painter, or 3D
preview. The `visualKeyOverride` on the entity automatically flows through to
all portrait surfaces.

The HUD character card prewarm is also generic: `Hud.postEntryPreviewPrewarmUnits`
adds a prewarm unit for any `visualKeyOverride` on the local player, so the
HUD player frame shows the selected hair immediately on entry. No per-character
work is needed beyond setting `visualKeyOverride` on the player entity (which
the character-selection flow already does). See section 8.6.

### Step 8: Write Tests

1. Add a `tests/<class>_test.ts` file following the Fighter test pattern
2. Test VisualDef registration, clip mappings, GLB contents
3. Test visualKeyFor resolution for player and mob entities
4. Test animation state selection (idle, walk, run, attack)
5. Test all hair variants share the same `rawHeight` (body scale consistency)
6. Test the hair override visual key resolves correctly

### Step 9: Validate

1. Run `npx tsc --noEmit`
2. Run `npx vitest run tests/<class>_test.ts tests/locomotion.test.ts tests/player_motion.test.ts`
3. Verify in-game: character select, in-world model, portraits, animations

---

## 12. File Reference

All files touched by the Tempskron Fighter implementation:

### Build Pipeline
- `scripts/pt-port/fighter_assembler.ts` - Fighter GLB assembler entry point
- `scripts/pt-port/glb_assembler.ts` - Generic PT-to-GLB converter (reversed clips support)
- `scripts/pt-port/smd_parser.ts` - SMD mesh parser
- `scripts/pt-port/inx_parser.ts` - INX animation state parser
- `scripts/pt-port/bmp_to_png.ts` - BMP to PNG texture converter
- `scripts/pt-port/tga_to_png.ts` - TGA to PNG texture converter

### Generated Assets
- `public/models/creatures/pt_fighter.glb` - Default hair GLB
- `public/models/creatures/pt_fighter_hair2.glb` - Hair style 2 GLB
- `public/models/creatures/pt_fighter_hair3.glb` - Hair style 3 GLB

### Class Definition
- `src/sim/content/classes.ts` - `tempskron_fighter` class entry

### Visual Definitions
- `src/render/characters/manifest.ts` - VisualDef entries, modular skip, visualKeyFor

### Character Selection
- `index.html` - Class card button, hair style selector HTML
- `src/main.ts` - Hair state, visual key mapping, preview/startOffline integration

### Animation
- `src/render/characters/anim_state.ts` - Locomotion time scale (walkRef/runRef)
- `src/render/characters/visual.ts` - Jump/fall/land state machine

### Movement
- `src/sim/types.ts` - `walkMode` on `MoveInput` and `emptyMoveInput()`
- `src/sim/player_motion.ts` - `WALK_MODE_SPEED_MULT` walk speed multiplier
- `src/sim/move_input.ts` - `walkMode` in wire `MOVE_FIELDS`
- `src/game/input.ts` - `gaitMode` state, `walkMode` in all `readMoveInput` paths
- `src/game/run_walk_toggle.ts` - Gait mode toggle state and persistence
- `src/net/online.ts` - `wm` field in wire protocol
- `src/net/input_signature.ts` - `walkMode` in change-detection signature
- `src/render/self_motion.ts` - `walkMode` in client-side prediction
- `src/render/renderer.ts` - `forceWalk` renderer gait suppression

### Portraits
- `src/ui/portrait_chip.ts` - `visualKeyOverride` in PortraitChipOpts
- `src/ui/unit_portrait_painter.ts` - `drawVisualOverride` method
- `src/ui/character_appearance.ts` - `visualKeyOverride` in appearance preview
- `src/ui/char_window.ts` - Pass `visualKeyOverride` to portrait chip
- `src/ui/hud.ts` - Override in player frame, target frame, ToT frame, 3D preview

### Tests
- `tests/pt_fighter.test.ts` - 32 tests covering the full Fighter implementation
- `tests/locomotion.test.ts` - 23 tests for locomotion time scale
- `tests/player_motion.test.ts` - 13 tests for movement simulation
- `tests/character_appearance.test.ts` - 3 tests for appearance preview
- `tests/anim_state_entity_core.test.ts` - 9 tests for animation state machine
- `tests/player_look_core.test.ts` - 28 tests for modular look composition

---

## 13. Known Limitations

1. **No swim/jump/emote clips**: The PT rig does not carry swim, emote, or
   dedicated jump animations. Jump uses FALLSTAND reversed; swim falls back to
   the walk clip; emotes fall back to idle.

2. **No modular body composition**: PT characters use their own Bip01 skeleton
   and cannot wear KayKit modular armor. The character creator's appearance
   customizer does not apply to PT classes.

3. **Hair variants are separate GLBs**: Each hair style is a complete GLB file
   (body + head + animations), not a head-swap on a shared body. This is because
   the PT head mesh is baked into the same SMD as the body skinning.

4. **Online play shows default hair**: The `visualKeyOverride` is local-player
   presentation state and is not sent over the wire. Other players online see
   the default hair. (This could be added as a wire field in the future.)

5. **Class abilities reuse warrior**: The Fighter spreads `WARRIOR_DEF` for its
   ability kit. A full implementation would define PT-specific abilities.
