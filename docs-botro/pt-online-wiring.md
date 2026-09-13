# PT Online Wiring

## 1. Online Flow Audited

The existing WoC online character pipeline works as follows:

1. **Login**: Client authenticates via REST (`src/net/online.ts` `Api.login()`), receives a bearer token.
2. **Character roster**: Client fetches the character list via `GET /api/characters` (`Api.listCharacters()`). The server returns `CharacterSummary[]` with `class: PlayerClass` for each character (`server/characters.ts` `buildCharacterList`).
3. **Character selection**: The client renders the roster in the char-select panel. The player picks a character. The selected `CharacterSummary` carries `c.class`.
4. **Character creation**: When creating a new character, the client sends `POST /api/characters` with `{ name, class, skin, ... }` (`Api.createCharacter()`). The server validates the class against `VALID_CLASSES` and creates the character via `initialCharacterState(cls, name, skin)`.
5. **Enter World**: `enterWorld(c)` in `src/main.ts` creates `new ClientWorld(api.token, c.id, c.class, api.base, getClientSeed())`. The `ClientWorld` constructor stores `ownPlayerClass = cls` and opens a WebSocket.
6. **WebSocket auth**: The client sends `ONLINE_WORLD_AUTH_TYPE` with the token and character id. The server's `ws_auth.ts` loads the character row from the DB (including `character.class`) and calls `game.join(ws, accountId, character.id, character.name, character.class, character.state, ...)`.
7. **Server join**: `GameServer.join()` calls `this.sim.addPlayer(cls, name, { state, characterId, ... })`. The `Sim.addPlayer()` accepts any `PlayerClass` and constructs the player entity using the existing `CLASSES` registry (which already includes all 11 PT classes).
8. **Snapshot**: The server sends snapshots to the client. The client's `ClientWorld.applySnapshot()` decodes entities, including the player's class (`e.kind`), appearance, and equipment.
9. **Rendering**: The renderer uses the player's class to select the visual definition from `src/render/characters/manifest.ts`. PT classes have their own `VisualDef` entries with PT GLB assets, PT animations, and PT hair variants. The existing `visualKeyOverride` and `rawHeight` systems apply.

## 2. Existing PT Character Architecture Used

The existing PT character system is the source of truth and was NOT modified:

- **PT classes**: All 11 PT classes are defined in `src/sim/types.ts` `ALL_CLASSES` (20 total: 9 WoC + 11 PT).
- **PT class data**: `src/sim/content/classes.ts` `CLASSES` registry has `ClassDef` entries for all 11 PT classes (stats, abilities, resource).
- **PT visuals**: `src/render/characters/manifest.ts` has `VisualDef` entries for all 11 PT classes with PT GLB assets, PT animations, and PT hair variants.
- **PT tribe select**: `index.html` has the PT tribe selection UI (`#pt-tribe-select`) with all 11 PT class buttons.
- **PT formation**: `src/render/characters/formation.ts` handles the 3D stage formation for PT tribe selection.
- **PT port scripts**: `scripts/pt-port/` contains all PT conversion tooling (smd_parser, assemblers, etc.).
- **PT tests**: All existing PT tests (`tests/pt_*.test.ts`) verify class data, visuals, and formation.

## 3. Exact Integration Boundary

The integration boundary is the **server-side character creation class validation**. Two server files had hardcoded class lists that rejected PT class names:

1. `server/characters.ts` line 149: `VALID_CLASSES` (the RouteDef handler for `POST /api/characters`)
2. `server/main.ts` line 1862: `validClasses` (the legacy inline handler for `POST /api/characters`)

Both lists contained only the 9 WoC classes. When a client submitted a PT class name (e.g., `tempskron_fighter`), the server responded with `400 { error: 'invalid class', code: 'character.invalid_class' }`.

## 4. Root Cause of the Online PT Identity Disconnect

The PT character identity was being lost at **character creation time** on the server side. The client-side flow was already correct:

- `index.html` renders PT class chips with `data-class="tempskron_fighter"` etc.
- `src/main.ts` reads `clsEl.dataset.class as PlayerClass` and sends it to `api.createCharacter()`
- `src/net/online.ts` `createCharacter()` sends `{ class: cls }` to the server
- The server **rejected** the PT class name because `VALID_CLASSES` only contained the 9 WoC classes

This meant a PT character could never be created online. The player could not reach the Enter World step with a PT character because the server refused to persist it.

Once a character was created (if the class list were extended), the rest of the pipeline already worked:
- `ws_auth.ts` passes `character.class` to `game.join()` without validation
- `GameServer.join()` calls `sim.addPlayer(cls, name, ...)` which accepts any `PlayerClass`
- `Sim.addPlayer()` uses the `CLASSES` registry which already includes all 11 PT classes
- The renderer uses the class to select the visual definition, which already has PT entries
- `ClientWorld` stores `ownPlayerClass` and uses it for the player's visual assembly

## 5. Changes Made

### `server/characters.ts`
- **Before**: `VALID_CLASSES` was a hardcoded array of 9 WoC class names.
- **After**: `VALID_CLASSES` is now `ALL_CLASSES` imported from `src/sim/types.ts`, which contains all 20 classes (9 WoC + 11 PT).
- **Import**: Changed `import type { PlayerClass }` to `import { ALL_CLASSES, type PlayerClass }`.
- **Why**: This is the RouteDef handler for `POST /api/characters`. It validates the class at character creation. Using `ALL_CLASSES` as the single source of truth ensures the server accepts every class the client can offer and the sim supports.

### `server/main.ts`
- **Before**: `validClasses` was a hardcoded inline array of 9 WoC class names (the legacy handler).
- **After**: `validClasses` is now `ALL_CLASSES` imported from `src/sim/types.ts`.
- **Import**: Changed `import type { PlayerClass }` to `import { ALL_CLASSES, type PlayerClass }`.
- **Why**: This is the retained legacy handler for `POST /api/characters`. It must accept the same set as the RouteDef handler to keep the two arms byte-identical.

No other files were modified. No client-side changes were needed. No PT character system files were touched.

## 6. How PT Identity Is Preserved

The PT identity flows through the pipeline unchanged:

```
PT Tribe Select (index.html)
    ↓ data-class="tempskron_fighter"
Character Creation (src/main.ts)
    ↓ clsEl.dataset.class as PlayerClass
API Call (src/net/online.ts)
    ↓ POST /api/characters { class: 'tempskron_fighter' }
Server Validation (server/characters.ts)
    ↓ VALID_CLASSES includes 'tempskron_fighter' ✓
Server Creation (server/main.ts initialCharacterState)
    ↓ Sim({ playerClass: 'tempskron_fighter' }) → serializeCharacter
Database Storage
    ↓ characters.class = 'tempskron_fighter'
Character Roster (server/characters.ts buildCharacterList)
    ↓ { class: 'tempskron_fighter' }
Client Roster (src/net/online.ts listCharacters)
    ↓ CharacterSummary.class = 'tempskron_fighter'
Enter World (src/main.ts enterWorld)
    ↓ new ClientWorld(token, c.id, c.class='tempskron_fighter', ...)
WebSocket Auth (server/ws_auth.ts)
    ↓ character.class = 'tempskron_fighter' → game.join()
Server Join (server/game.ts)
    ↓ sim.addPlayer('tempskron_fighter', name, { state })
Sim Entity (src/sim/sim.ts)
    ↓ CLASSES['tempskron_fighter'] → ClassDef with PT stats/abilities
Snapshot (server/game.ts broadcastSnapshots)
    ↓ wire entity with kind='tempskron_fighter'
Client Snapshot (src/net/online.ts applySnapshot)
    ↓ e.kind = 'tempskron_fighter'
Renderer (src/render/characters/manifest.ts)
    ↓ VISUALS['player_tempskron_fighter'] → PT GLB + PT animations + PT hair
Rendered PT Player
```

## 7. How Enter World Now Constructs the PT Player

Enter World was already correctly wired. The fix was upstream at character creation:

1. Player selects a PT tribe and class in the char-create panel (e.g., Tempskron → Fighter).
2. Client sends `POST /api/characters { name, class: 'tempskron_fighter' }`.
3. Server now accepts `tempskron_fighter` (previously rejected with `invalid_class`).
4. Server creates the character with `initialCharacterState('tempskron_fighter', name, skin)`, which constructs a `Sim` with `playerClass: 'tempskron_fighter'` and serializes the character state.
5. The character is stored in the DB with `class = 'tempskron_fighter'`.
6. On Enter World, `ClientWorld` is created with `cls = 'tempskron_fighter'`.
7. The server loads the character row, passes `character.class` to `game.join()`, which calls `sim.addPlayer('tempskron_fighter', ...)`.
8. The sim uses `CLASSES['tempskron_fighter']` for stats/abilities.
9. The renderer uses `VISUALS['player_tempskron_fighter']` for the PT GLB, PT animations, and PT hair.
10. The PT player appears in the online world.

## 8. Tests Performed

### TypeScript
- `npx tsc --noEmit`: **PASS** (exit code 0)

### Production Build
- `npm run build`: **PASS** (exit code 0, built in ~21s, 5475 modules, 1773 media assets)

### PT Character Tests (662 tests)
- `tests/pt_formation.test.ts`: 115/115 PASSED
- `tests/pt_tribes.test.ts`: 48/48 PASSED
- `tests/pt_fighter.test.ts`: 33/33 PASSED
- `tests/pt_mechanician.test.ts`: 42/42 PASSED
- `tests/pt_pikeman.test.ts`: 47/47 PASSED
- `tests/pt_archer.test.ts`: 48/48 PASSED
- `tests/pt_knight.test.ts`: 50/50 PASSED
- `tests/pt_atalanta.test.ts`: 53/53 PASSED
- `tests/pt_priestess.test.ts`: 30/30 PASSED
- `tests/pt_magician.test.ts`: 30/30 PASSED
- `tests/pt_assassin.test.ts`: 30/30 PASSED
- `tests/pt_shaman.test.ts`: 32/32 PASSED
- `tests/pt_martial_artist.test.ts`: 30/30 PASSED
- `tests/charselect_roster_cleanup.test.ts`: PASSED
- `tests/death_model_swap.test.ts`: PASSED

### Server Character Creation Tests
- `tests/server/characters.test.ts`: 105/105 PASSED (including the "400s an invalid class" test which still rejects `'jester'`)

### Class/Registry Tests
- `tests/character_db.test.ts`: PASSED
- `tests/env_protocol.test.ts`: 14/14 PASSED
- `tests/v026_winning_warrior_contract.test.ts`: PASSED
- `tests/talents.test.ts`: 32/32 PASSED
- `tests/talent_rows_core.test.ts`: PASSED

### Online/Login Tests
- `tests/world_api_parity.test.ts`: PASSED
- `tests/command_schema.test.ts`: PASSED
- `tests/command_facets.test.ts`: PASSED
- `tests/linkdead.test.ts`: PASSED
- `tests/charselect_action.test.ts`: PASSED
- `tests/char_sort.test.ts`: PASSED
- `tests/bandwidth.test.ts`: PASSED
- `tests/snapshots.test.ts`: 261/262 PASSED (1 pre-existing failure: "flushes changed movement immediately without resending unchanged frames" - confirmed failing on clean HEAD before my changes)

## 9. Build Result

**PASS** - `npm run build` exit code 0. All generated artifacts (i18n, wiki content, SFX manifest, media manifest, vite bundle) produced successfully.

## 10. Remaining Limitations

1. **No live server test**: The local online flow was not tested with a running server + client. The fix is validated by TypeScript, build, and unit tests only. A live integration test would require starting the server and connecting a browser client.

2. **Pre-existing snapshot test failure**: `tests/snapshots.test.ts` has one pre-existing failure ("flushes changed movement immediately without resending unchanged frames") that exists on the clean HEAD and is unrelated to this change.

3. **PBE boost classes**: `server/pbe_boost.ts` `BOOST_CLASSES` still lists only 9 WoC classes. This is a PBE-only (playtest environment) test-seed feature, not a character creation path. PT classes are not included in PBE boost bots. This is intentional and out of scope for this task.

4. **No new PT classes/assets**: This task does not add new PT classes, PT assets, PT animations, or PT visual definitions. It only wires the existing PT character system into the online flow.

5. **No Ricarten/map work**: This task does not touch the world/map system. The upcoming Ricarten implementation is a separate task.
