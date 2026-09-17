# PT Online Character Flow Audit

**Status**: Audit only. No code changes. No implementation yet.

## 1. Current ONLINE Flow

```
Login (#login-panel)
    |
    v
api.login() / api.register()
    |
    v
completeOnlineAuth()
    |
    v
enterRealmFlow()
    |
    v
selectRealm(entry)  (or auto-select remembered realm)
    |
    v
show('#charselect-panel') + refreshCharacters()
    |
    v
GET /api/characters  ->  CharacterSummary[]
    |
    +-- if roster is EMPTY:
    |       show('#charcreate-panel')
    |       (all 11 PT classes visible as mini-class chips, no tribe-first step)
    |       user clicks a .mini-class chip -> selects class
    |       user enters name, clicks Create
    |       api.createCharacter(name, class, skin, appearance, helm)
    |       -> show('#charselect-panel') + refreshCharacters()
    |
    +-- if roster has characters:
            list rendered as .char-row elements
            user clicks a row -> showCharselectCharacter(c)
            user clicks Enter World -> enterWorld(c)
            |
            v
        new ClientWorld(token, c.id, c.class, api.base, seed)
            |
            v
        WebSocket auth-world-29 { token, character, ... }
            |
            v
        server: ws_auth -> game.join() -> sim.addPlayer(cls)
            |
            v
        existing PT character system (CLASSES[cls], VISUALS[cls])
            |
            v
        PT player in online world
```

### Key files (online flow)
- `src/main.ts`: `completeOnlineAuth()` (line 9858), `enterRealmFlow()` (6229), `selectRealm()` (6743), `refreshCharacters()` (6926), `enterWorld()` (7221), `showCharselectCharacter()` (7351), charcreate chip handlers (10529), create button handler (10687)
- `src/net/online.ts`: `CharacterSummary` interface (279), `api.characters()` (774), `api.createCharacter()`
- `server/characters.ts`: `createCharacterHandler()` (680), `VALID_CLASSES` (now `ALL_CLASSES`)
- `server/main.ts`: legacy `validClasses` (now `ALL_CLASSES`)
- `server/db.ts`: `characters` table schema (416), `ensureSchema()`
- `server/ws_auth.ts`: WebSocket auth handshake, loads character row, calls `game.join()`
- `index.html`: `#charcreate-panel` (1273), `#charselect-panel`

## 2. Current OFFLINE/PT Flow

```
Mode Select (#mode-select)
    |
    v
handleOfflineSelect()
    |
    v
show('#pt-tribe-select')
    |
    v
user clicks a tribe card (Tempskron / Morion / Atlanteon)
    |
    v
wirePtTribeSelect.onTribeSelected(tribeId, firstClassId)
    |
    v
filterOfflineSelectForTribe(#offline-select, tribeId)
show('#offline-select')
showTribeFormation(tribeId)  ->  CharacterPreview.setStageFormation(entries)
    |
    v
3D stage: all tribe classes stand at HOME positions
user clicks a 3D character -> setStageClickCallback -> selectStageClass(cls)
    |
    v
selectStageMember(cls) -> character walks to center
renderClassDetails('offline-class-details', cls)
refreshOfflineSkins(cls)
    |
    v
user enters name, clicks Start
    |
    v
handleOfflineStart(stageCls)
    |
    v
startOffline(cls, name, skin, ..., ptHair)
    |
    v
new Sim(offlineWorldConfig({ playerClass, name, ... }))
sim.setPlayerSkin(playerId, skin)
    |
    v
existing PT character system (CLASSES[cls], VISUALS[cls])
    |
    v
PT player in offline world
```

### Key files (offline flow)
- `src/main.ts`: `handleOfflineSelect()` (9915), `showTribeFormation()` (5756), `selectStageClass()` (5771), `handleOfflineStart()` (9887), `startOffline()` (5228), `previewClassBody()` (5736), `ptVisualKey()` (5505), stage click callback (11518), offline start button (10089)
- `src/ui/pt_tribe_select.ts`: `wirePtTribeSelect()`, `filterOfflineSelectForTribe()`
- `src/ui/pt_formation.ts`: `tribeStageEntries()`, `FormationEntry`
- `src/render/characters/preview.ts`: `CharacterPreview` class, `setStageFormation()` (560), `selectStageMember()` (652), `setStageClickCallback()` (759), `getStageSelectedClass()`
- `src/sim/content/pt_tribes.ts`: `PT_TRIBES`, `PtTribeId`, `implementedClassIds`
- `index.html`: `#pt-tribe-select` (1340), `#offline-select` (1368)

## 3. Differences Between Online and Offline

| Aspect | Online (`#charcreate-panel`) | Offline (`#pt-tribe-select` + `#offline-select`) |
|---|---|---|
| Tribe selection | None. All 11 PT classes shown at once as chips. | Tribe-first. `#pt-tribe-select` shows 3 tribe cards. |
| Class selection UI | `.mini-class` chips (2D buttons). | 3D stage. Characters stand in formation; click to select. |
| Class filtering | No tribe filter. All tribes visible simultaneously. | `filterOfflineSelectForTribe()` hides non-selected tribe sections. |
| Preview | `previewClassBody(cls)` in `#charcreate-preview-container` (single character, sheet framing). | `CharacterPreview.setStageFormation()` in `#offline-preview-container` (full tribe formation, stage framing). |
| Hair controls | No PT hair selector on the online panel. | `#offline-pt-hair-row` with 3 hair cards, `offlinePtHair` variable. |
| Selected class source | `document.querySelector('#charcreate-panel .mini-class.sel')` (line 10689). | `characterPreview.getStageSelectedClass()` (line 10093). |
| Skin controls | `#online-skin-row`, `refreshOnlineSkins(cls)`. | `#offline-skin-row`, `refreshOfflineSkins(cls)`. |
| Class details panel | `#charcreate-class-details`. | `#offline-class-details`. |
| Persistence | `api.createCharacter()` -> PostgreSQL `characters` table. | None. Offline character is ephemeral. |
| Enter World | `enterWorld(c)` -> `new ClientWorld(...)` -> WebSocket. | `startOffline(cls, name, ...)` -> `new Sim(...)`. |

## 4. Existing Reusable Components

### Tribe selection
- `src/ui/pt_tribe_select.ts`: `wirePtTribeSelect()` wires tribe card clicks. Reusable for online.
- `src/sim/content/pt_tribes.ts`: `PT_TRIBES` is the single source of truth for tribe-to-class mapping.
- `index.html`: `#pt-tribe-select` panel with 3 tribe cards. Already wired.

### 3D stage
- `src/render/characters/preview.ts`: `CharacterPreview` supports `setStageFormation()`, `selectStageMember()`, `setStageClickCallback()`, `getStageSelectedClass()`, `setFraming('stage'|'sheet')`.
- `src/ui/pt_formation.ts`: `tribeStageEntries(tribeId)` builds the formation entries.
- `src/main.ts`: `showTribeFormation()`, `selectStageClass()` are panel-agnostic helpers that could be reused.

### Class details
- `src/main.ts`: `renderClassDetails(panelId, cls)` works for any panel id.

### PT visual system
- `src/main.ts`: `ptVisualKey(cls, hair)` maps class + hair to visual key.
- `src/render/characters/assets.ts`: PT GLB assets and visual mappings.
- `src/sim/content/pt_tribes.ts`: `PT_CLASS_DISPLAY_NAMES`.

### REST API
- `src/net/online.ts`: `api.characters()`, `api.createCharacter()`.
- `server/characters.ts`: `createCharacterHandler()` accepts all 20 classes (PT wiring already done).

### WebSocket Enter World
- `src/main.ts`: `enterWorld(c)` creates `ClientWorld` and connects.
- `server/ws_auth.ts`: loads character row, calls `game.join()`.
- `src/net/world_auth_message.ts`: `buildWebSocketAuthMessage()`.

### Database
- `server/db.ts`: `characters` table has `class TEXT NOT NULL`. No schema change needed.

## 5. Missing Integration Points

### Gap 1: Online charcreate has no tribe-first step
The online `#charcreate-panel` shows all 11 PT classes at once. The target flow requires a tribe selection step before class creation, matching the offline `#pt-tribe-select` experience.

**Current**: `refreshCharacters()` -> if empty -> `show('#charcreate-panel')` (line 6971)
**Target**: `refreshCharacters()` -> if empty -> `show('#pt-tribe-select')` -> tribe card click -> filtered charcreate

### Gap 2: Online charcreate uses chips, not the 3D stage
The online `#charcreate-panel` uses `.mini-class` chips for class selection. The offline `#offline-select` uses the 3D stage with `CharacterPreview.setStageFormation()` and click-to-select. The target flow should reuse the 3D stage for online creation.

**Current**: `#charcreate-panel .mini-class` chips (line 10529)
**Target**: 3D stage formation, reusing `showTribeFormation()` and `selectStageClass()`

### Gap 3: Online charcreate does not filter classes by tribe
The online `#charcreate-panel` shows all tribe sections simultaneously. The offline flow filters via `filterOfflineSelectForTribe()`. The target requires tribe-filtered class selection.

**Current**: All `.pt-tribe-section` blocks visible in `#charcreate-panel`
**Target**: Only the selected tribe's classes visible (or stage only shows that tribe)

### Gap 4: Online charcreate has no PT hair selector
The offline `#offline-select` has `#offline-pt-hair-row` with 3 hair cards. The online `#charcreate-panel` has no hair selector. PT classes use hair-variant GLBs via `ptVisualKey(cls, hair)`.

**Current**: No hair controls on `#charcreate-panel`
**Target**: PT hair selector on the online creation panel

### Gap 5: Online charcreate reads class from chips, not stage
The create button handler reads `document.querySelector('#charcreate-panel .mini-class.sel')` (line 10689). If the 3D stage is used, it must read from `characterPreview.getStageSelectedClass()` instead.

**Current**: `clsEl = document.querySelector('#charcreate-panel .mini-class.sel')` (line 10689)
**Target**: `stageCls = characterPreview?.getStageSelectedClass()`

### Gap 6: Preview container and framing
The online charcreate uses `#charcreate-preview-container` with `sheet` framing. The 3D stage needs `stage` framing. `updatePreviewContainer()` (line 5921) already handles panel-specific container and framing selection, but the charcreate panel is not wired for stage mode.

**Current**: `characterPreview.setFraming(panelId === '#offline-select' ? 'stage' : 'sheet')` (line 5936)
**Target**: Charcreate panel (or a new online creation panel) should use `stage` framing when the 3D formation is active.

## 6. Proposed Target Flow

```
LOGIN (#login-panel)
    |
    v
api.login() / api.register()
    |
    v
completeOnlineAuth() -> enterRealmFlow() -> selectRealm()
    |
    v
show('#charselect-panel') + refreshCharacters()
    |
    v
GET /api/characters  ->  CharacterSummary[]
    |
    +-- if roster is EMPTY:
    |       show('#pt-tribe-select')
    |       user clicks tribe card
    |       -> show online character creation panel (filtered to tribe)
    |       -> showTribeFormation(tribeId)  (3D stage with tribe classes)
    |       -> user clicks 3D character -> selectStageClass(cls)
    |       -> user enters name, selects hair
    |       -> api.createCharacter(name, cls, skin, appearance, helm)
    |       -> show('#charselect-panel') + refreshCharacters()
    |
    +-- if roster has characters:
            list rendered as .char-row elements
            user clicks row -> showCharselectCharacter(c)
            user clicks Enter World -> enterWorld(c)
                |
                v
            new ClientWorld(token, c.id, c.class, api.base, seed)
                |
                v
            WebSocket auth-world-29
                |
                v
            server: ws_auth -> game.join() -> sim.addPlayer(cls)
                |
                v
            existing PT character system
                |
                v
            PT player in online world
```

## 7. Exact Source Files/Functions Involved

### Files that may need modification
| File | What changes |
|---|---|
| `src/main.ts` | `refreshCharacters()`: redirect empty-roster to `#pt-tribe-select` instead of `#charcreate-panel`. Wire tribe card callback for online creation. Wire 3D stage for online charcreate. Update create button to read from stage. Add PT hair controls to online creation. |
| `index.html` | Add PT hair selector to `#charcreate-panel` (or create a new online creation panel). May need a new container for the 3D stage in the online creation flow. |

### Files that should NOT be modified
| File | Why |
|---|---|
| `src/sim/content/pt_tribes.ts` | Single source of truth for tribes. Reuse as-is. |
| `src/ui/pt_tribe_select.ts` | Tribe card wiring. Reuse as-is. |
| `src/ui/pt_formation.ts` | Formation entries. Reuse as-is. |
| `src/render/characters/preview.ts` | CharacterPreview class. Reuse as-is. |
| `src/net/online.ts` | REST API client. Reuse as-is. |
| `server/characters.ts` | Server handler. Already accepts all 20 classes. |
| `server/main.ts` | Legacy handler. Already accepts all 20 classes. |
| `server/db.ts` | Schema. `class TEXT` already stores PT classes. |
| `server/ws_auth.ts` | WebSocket auth. Already works with PT classes. |
| `src/net/world_auth_message.ts` | WS auth message. Reuse as-is. |
| `src/render/characters/assets.ts` | PT GLB assets. Reuse as-is. |
| All `src/sim/` files | Sim core. Must not be modified. |

## 8. Risks/Regressions to Watch For

1. **Offline flow breakage**: The `#pt-tribe-select` and `#offline-select` panels are shared. Any change to tribe card wiring or stage formation must not break the offline flow. The `wirePtTribeSelect()` callback currently calls `filterOfflineSelectForTribe()` and `show('#offline-select')`. If the same panel is reused for online, the callback must branch on online vs offline mode.

2. **CharacterPreview container sharing**: `characterPreview` is a single instance. `updatePreviewContainer()` switches its container based on the active panel. If the online creation panel uses the 3D stage, the container and framing must be set correctly, and the stage formation must not conflict with the charselect panel's preview.

3. **Stage state leakage**: The 3D stage has persistent state (`getStageSelectedClass()`). If the user navigates from online creation back to charselect, the stage must be cleared or reset to avoid a stale class selection.

4. **Hair state**: `offlinePtHair` is a module-level variable. If online creation reuses the hair selector, the hair state must be tracked per-context or shared carefully.

5. **Skin controls**: `refreshOnlineSkins()` and `refreshOfflineSkins()` are separate functions. The online creation panel must use the correct skin refresh.

6. **Create button class source**: The create button currently reads from `.mini-class.sel`. If the 3D stage replaces chips, the button must read from `getStageSelectedClass()`. If chips remain as a fallback, both sources must be reconciled.

7. **Empty roster redirect**: `refreshCharacters()` currently redirects to `#charcreate-panel` on empty roster (line 6971). Changing this to `#pt-tribe-select` must not break the case where the user backs out of tribe select and needs to return to charselect.

8. **Back navigation**: `#btn-charcreate-back` currently goes to `#charselect-panel` (line 10495). If tribe select is inserted before charcreate, back from charcreate should go to tribe select, and back from tribe select should go to charselect (or login if no characters exist).

9. **Existing character case**: When the roster has characters, the flow must skip tribe select and go straight to charselect. This is already the behavior (line 6968-6972), but the redirect target changes.

10. **i18n**: Any new UI text must use `t()` keys. PT hair labels and tribe-select subtitles are already localized.

## 9. Phased Implementation Plan

### Phase 1: Tribe-first redirect for empty roster
**Goal**: When the online roster is empty, show `#pt-tribe-select` instead of `#charcreate-panel`.

**Changes**:
- `src/main.ts` `refreshCharacters()`: Change `show('#charcreate-panel')` to `show('#pt-tribe-select')` when roster is empty.
- `src/main.ts` `wirePtTribeSelect()`: Add an online-mode callback branch. When online, tribe card click transitions to `#charcreate-panel` (filtered to tribe) instead of `#offline-select`.
- `index.html`: No change needed yet (charcreate panel already has tribe sections).

**Tests**:
- Offline flow still works (tribe select -> offline select -> start offline).
- Online empty roster shows tribe select.
- Online tribe card click shows charcreate panel.
- Online non-empty roster skips tribe select.

### Phase 2: Filter charcreate panel by selected tribe
**Goal**: When the user selects a tribe online, only show that tribe's classes.

**Changes**:
- `src/main.ts` online tribe callback: Call `filterOfflineSelectForTribe()` on `#charcreate-panel` (or a shared filter function) to hide non-selected tribe sections.
- Alternatively, create a `filterCharcreateForTribe()` helper or generalize the existing one.

**Tests**:
- Only the selected tribe's class chips are visible.
- Back from charcreate returns to tribe select.
- Changing tribe re-filters.

### Phase 3: 3D stage for online character creation
**Goal**: Replace the mini-class chips with the 3D stage formation for online creation.

**Changes**:
- `src/main.ts` online tribe callback: Call `showTribeFormation(tribeId)` to build the 3D stage.
- `src/main.ts` `updatePreviewContainer()`: Set `stage` framing for `#charcreate-panel` when the 3D stage is active.
- `src/main.ts` create button handler: Read class from `characterPreview.getStageSelectedClass()` instead of `.mini-class.sel`.
- `src/main.ts` stage click callback: Route to `selectStageClass()` for online mode too.
- `index.html`: Add `#charcreate-preview-container` sizing for stage mode (or reuse existing container).

**Tests**:
- 3D stage shows tribe classes in formation.
- Clicking a 3D character selects it.
- Create button reads the selected stage class.
- Preview updates on class selection.

### Phase 4: PT hair selector for online creation
**Goal**: Add the PT hair selector to the online creation panel.

**Changes**:
- `index.html`: Add a `#charcreate-pt-hair-row` (or reuse `#offline-pt-hair-row` if shared) to `#charcreate-panel`.
- `src/main.ts`: Wire hair card clicks for online creation. Track `onlinePtHair` (or share `offlinePtHair`).
- `src/main.ts`: On hair change, rebuild the selected stage member's visual with the new hair.

**Tests**:
- Hair selector appears for PT classes.
- Hair change updates the 3D preview.
- Selected hair is passed to `api.createCharacter()` (or applied to the preview only; the server stores appearance, not hair directly).

### Phase 5: Polish and edge cases
**Goal**: Handle back navigation, stage cleanup, and state reset.

**Changes**:
- `src/main.ts`: Back from online charcreate -> `#pt-tribe-select` (not `#charselect-panel`).
- `src/main.ts`: Back from `#pt-tribe-select` (online, empty roster) -> `#charselect-panel` (or `#login-panel` if no session).
- `src/main.ts`: Clear stage formation when leaving online charcreate.
- `src/main.ts`: Reset hair state when entering online charcreate.

**Tests**:
- Full online flow: login -> empty roster -> tribe select -> charcreate -> create -> charselect -> enter world.
- Full online flow: login -> existing roster -> charselect -> enter world.
- Back navigation works at every step.
- Offline flow unaffected.

## 10. Tests That Must Pass After Implementation

### Existing tests (must not regress)
- `tests/pt_fighter.test.ts` (33 tests)
- `tests/pt_mechanician.test.ts`
- `tests/pt_pikeman.test.ts`
- `tests/pt_archer.test.ts`
- `tests/pt_knight.test.ts`
- `tests/pt_atalanta.test.ts`
- `tests/pt_priestess.test.ts`
- `tests/pt_magician.test.ts`
- `tests/pt_assassin.test.ts`
- `tests/pt_martial_artist.test.ts`
- `tests/pt_shaman.test.ts`
- `tests/pt_formation.test.ts` (115 tests)
- `tests/pt_tribes.test.ts` (48 tests)
- `tests/server/characters.test.ts` (105 tests)
- `tests/architecture.test.ts`
- `tests/world_api_parity.test.ts`
- All online/login tests (763+ tests)
- `tests/snapshots.test.ts` (known pre-existing failure: "flushes changed movement immediately without resending unchanged frames")

### New tests (to be added)
- Online empty-roster redirects to tribe select.
- Tribe card click filters charcreate to tribe classes.
- 3D stage shows tribe formation in online creation.
- Create button reads class from stage, not chips.
- PT hair selector works in online creation.
- Back navigation: charcreate -> tribe select -> charselect.
- Existing roster skips tribe select.
- Offline flow unaffected by online changes.

### Build checks
- TypeScript (`tsc --noEmit`): PASS
- Production build (`npm run build`): PASS
- Server build (`npm run build:server`): PASS

### Docker smoke test
- Login as `jhing` -> empty roster -> tribe select -> create PT fighter -> charselect -> enter world -> WebSocket -> PT player online.
- Login as `jhing` -> existing roster -> charselect -> enter world -> WebSocket -> PT player online.
