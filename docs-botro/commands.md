# World of ClaudeCraft: In-Game Commands Reference

Compiled from the live source (`src/sim/dev_commands.ts`, `server/moderation_commands.ts`,
`server/game.ts`, `src/ui/dev_command_view.ts`). Re-verify against code if a command
stops working; this doc is a convenience mirror, not the source of truth.

## How access is gated

Three independent gates, layered:

1. **`ALLOW_DEV_COMMANDS=1`** (server env var, read live per request). Gates the entire
   `/dev` family. Off in production; safe for local dev. The client advertises it via
   `/api/status` (`dev_commands: true`).
2. **Staff account** (`accounts.admin_roles` non-empty, snapshotted at join). Gates the
   `/dev spawn`, `/dev despawn`, `/dev killtarget` family AND the moderation commands.
   A GM character (`is_gm = TRUE`) alone is NOT enough for spawns; the account must be
   staff. Grant via `node scripts/grant_admin.mjs <username> --roles superadmin`.
3. **Moderation permission** (`moderation.act`, part of the `admin`/`superadmin` role
   bundles). Gates the `/kick`, `/ban`, `/mute`, `/jail`, `/spectate` family.

The GM character flag (`characters.is_gm = TRUE`) is separate: it makes the character
invulnerable and auto-sets level 20 on join. It does NOT grant any commands.

## `/dev` commands (require `ALLOW_DEV_COMMANDS=1`)

Type `/dev` alone in chat to see the in-game help line. Type `/dev gui` to open the
clickable dev command window (categories: Player, Spawns, Inventory, Progress, Travel,
Scenarios). The Spawns tab is staff-only.

### Player

| Command | Effect |
|---------|--------|
| `/dev heal` | Restore HP to full |
| `/dev hp <1-100>` | Set HP percent on self, your pet, or a living unowned target |
| `/dev resource` | Restore resource (mana/rage/energy) to full |
| `/dev cooldowns` | Clear all cooldowns and GCD |
| `/dev revive` | Revive if dead or ghost |
| `/dev combatreset` | Clear combat state |
| `/dev kill` (or `/dev die` / `/dev suicide`) | Kill yourself |
| `/dev level <n>` | Set your level (1 to MAX_LEVEL) |
| `/dev god` | Toggle dev god mode (invulnerable + 100x damage) |
| `/dev immortal` | Toggle invulnerability only (normal outgoing damage) |
| `/dev smite` (or `/dev oneshot` / `/dev nuke`) | Toggle one-shot kills on every hit |
| `/dev noaggro` | Toggle: mobs will not autonomously pull you |
| `/dev freezemobs [on\|off]` | Freeze ALL mobs sim-wide (no wander, no aggro, no swings) |
| `/dev daze` | Apply Courser's Guise daze (movement speed halved for 4s, test hook) |
| `/dev fear` | Apply 8s fear along your facing (test hook for the fear wall guard) |

### Spawns (require staff account, not just dev commands)

| Command | Effect |
|---------|--------|
| `/dev spawn <mobId> [count] [level]` | Spawn mobs near you (count 1-20, level 1-MAX_LEVEL) |
| `/dev killtarget` | Kill your currently targeted living mob |
| `/dev despawn target` | Despawn your targeted dev-spawned mob |
| `/dev despawn spawned` | Despawn all dev-spawned mobs |

### Inventory

| Command | Effect |
|---------|--------|
| `/dev give <itemId> [count]` | Grant items (count 1-20) |
| `/dev kit [spec]` | Equip the fresh-level-20 preset gear for your class and spec (blank = current spec) |
| `/dev bis [spec]` | Equip best-in-slot epic gear (blank = current spec) |
| `/dev gold <amount>` | Add gold to your purse (1-100000) |
| `/dev mounts` | Grant all mount reins + riding skill (levels you to 20 if below) |
| `/dev mountskins` | Grant all catalog mount skins to account cosmetics |
| `/dev mountquest` (or `/dev startmount`) | Level to 20, add 100g, teleport to Stablemaster Marla |

### Progress

| Command | Effect |
|---------|--------|
| `/dev quest <questId>` | Complete one quest (accept if needed, satisfy objectives, turn in) |
| `/dev quests` (or `/dev questall`) | Complete all currently in-progress quests |
| `/dev attune` | Mark all quests complete (in-progress quests untouched) |
| `/dev gather <professionId> [amount]` | Grant gathering proficiency (amount 1-100) |
| `/dev farmgrow [bedId]` | Advance a farm plot (or all your plots) to ready now |

### Travel

| Command | Effect |
|---------|--------|
| `/dev tp <x> <z>` | Teleport to world coordinates |
| `/dev dungeon <dungeonId> [normal\|heroic]` | Enter a dungeon (bypasses party/raid size gate) |
| `/dev raid [normal\|heroic]` | Enter the Nythraxis raid |
| `/dev raid reset` | Clear all raid lockouts |
| `/dev portal [seed] [level] [C\|B\|A\|S] [infernal\|random]` | Open a rift portal in front of you |
| `/dev riftmech <ice\|roller\|lava\|gate> [level]` | Open a rift whose floor 1 has a specific mechanic |

### Scenarios

| Command | Effect |
|---------|--------|
| `/dev bot <name>` | Spawn a whisper-able dev bot |
| `/dev vendor` | Spawn the Test Quartermaster (free epic gear) next to you |
| `/dev bg` | Force-start Thornhollow Fields battleground (pads with bots if solo) |
| `/dev bg end` | End your live battleground early on current score |
| `/dev lfg [queue\|raid\|board]` | Seed dungeon finder bots |
| `/dev cascade` | Start the Cascada temporal playtest scenario (dummy + raid allies) |
| `/dev sandbox` | Practice scenario: training dummy + invulnerable raid allies (10k HP) |
| `/dev mobilestation <craftId>` | Place a mobile profession station (specialization-gated) |
| `/dev ignivarraid [boss]` | Setup the Ignivar raid (stationary invulnerable allies); `boss` skips to Ignivar |
| `/dev nythraxisraid [normal\|heroic]` | Setup the Nythraxis practice raid |
| `/dev nyx <mechanic> [sec]` | Force a Nythraxis mechanic (curse, spike, eruption, sigil, gravefire, rend, rage, storm, wards, phase2, phase3, enrage) |
| `/dev varkhulraid [normal\|heroic]` | Setup the Varkhul raid |

### GUI

| Command | Effect |
|---------|--------|
| `/dev gui` | Open the dev command window (clickable buttons + input fields) |

## Moderation commands (require staff account with `moderation.act` permission)

These ride the chat pipeline but are claimed before ordinary chat. They require a staff
account (admin or superadmin role) with the `moderation.act` permission. Arguments with
spaces should be quoted.

| Command | Effect |
|---------|--------|
| `/kick [name] [reason]` | Disconnect a player from the server |
| `/kill [name] [reason]` | Kill a player's character in-world |
| `/forcerename [name] [reason]` | Force a character rename on next login |
| `/mute [name] [duration] [reason]` | Silence a player's chat (duration in minutes) |
| `/ban [name] [reason]` | Permanently ban an account |
| `/suspend [name] [duration] [reason]` | Temporarily suspend an account (duration in minutes) |
| `/spectate [name]` | Spectate a player (GM invulnerability turned on, teleport to limbo) |
| `/unspectate` | Stop spectating, return to your saved position |
| `/jail [name] [reason]` | Jail a player (teleport to jail cage, hostile-to-all flag) |
| `/unjail [name]` | Release a player from jail |

## Player commands (available to everyone)

| Command | Effect |
|---------|--------|
| `/ignore [name]` | Add a player to your ignore list (hides their chat) |
| `/unignore [name]` | Remove a player from your ignore list |
| `/ignorelist` | List everyone on your ignore list |
| `/block [name]` | Block a player (stronger than ignore; affects more interactions) |
| `/unblock [name]` | Unblock a player |
| `/blocklist` | List everyone on your block list |
| `/who` | List online players |
| `/unstuck` | Self-unstuck (teleport to a safe nearby point) |
| `/afk` | Toggle Away-From-Keyboard status |
| `/dnd` | Toggle Do-Not-Disturb status |
| `/w <name> <message>` (or `/whisper` / `/tell`) | Send a private message |
| `/invite <name>` | Invite a player to your party |
| `/leave` | Leave your current party |

## Setup for local dev

1. Copy `.env.example` to `.env`, set `POSTGRES_PASSWORD` and the matching password in
   `DATABASE_URL`.
2. Add `ALLOW_DEV_COMMANDS=1` to `.env` (never in production).
3. `npm run db:up` to start Postgres 16 in Docker (port 5433).
4. `npm run server` to start the authoritative server (port 8787).
5. `npm run dev` to start the Vite client (port 5173).
6. Grant your account staff roles:
   `node scripts/grant_admin.mjs <username> --roles superadmin`
7. (Optional) Grant a character GM invulnerability:
   `docker exec eastbrook-db psql -U eastbrook -d eastbrook -c "SET woc.material_source_writer = '1'; UPDATE characters SET is_gm = TRUE WHERE name = '<charname>';"`
8. Log in, create a character, enter the world. Relog after steps 6 and 7 so the
   join-time snapshot picks up the new roles/flags.

## Sources (re-verify here if a command stops working)

- `/dev` command router: `src/sim/dev_commands.ts` (`handleDevChat`)
- Dev command GUI actions: `src/ui/dev_command_view.ts` (`DEV_COMMAND_ACTIONS`)
- Moderation command parser: `server/moderation_commands.ts` (`parseModerationChatCommand`)
- Spawn staff gate: `server/game.ts` (the `session.isAdmin` check before spawn/despawn/killtarget)
- Staff role model: `server/admin_permissions.ts` (`ADMIN_ROLES`, `ROLE_PERMISSIONS`)
- GM flag: `server/db.ts` (`is_gm` column), `server/game.ts` (`setGm` on join)
- Grant admin script: `scripts/grant_admin.mjs`
