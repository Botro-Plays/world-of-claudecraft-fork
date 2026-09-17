# Docker + PostgreSQL Online Test Environment

## 1. Docker Architecture

The repository ships with a complete `docker-compose.yml` and `Dockerfile`. No new Docker files were created. The existing infrastructure is reused:

- **`Dockerfile`**: Multi-stage build. Stage 1 builds the client + server with pnpm. Stage 2 runs the server on `node:26-slim`.
- **`docker-compose.yml`**: Three services (postgres, game, discord-bot) plus MediaWiki. For local testing, only `postgres` and `game` are needed.
- **`.env`** (gitignored): Local development environment variables. Created from `.env.example` with development-only credentials.

## 2. PostgreSQL Service

- **Image**: `postgres:16-alpine`
- **Container**: `eastbrook-db`
- **Port**: `127.0.0.1:5433` (maps to container 5432)
- **Database**: `eastbrook`
- **User**: `eastbrook`
- **Password**: Set via `POSTGRES_PASSWORD` in `.env` (development-only)
- **Volume**: `eastbrook_pgdata` (named persistent volume)
- **Healthcheck**: `pg_isready -h 127.0.0.1 -U eastbrook -d eastbrook`
- **Schema**: Auto-applied by the game server on boot via `ensureSchema()` in `server/db.ts`

## 3. Server Service

- **Image**: `eastbrook-game:local` (built from `Dockerfile`)
- **Container**: `eastbrook-game`
- **Port**: `127.0.0.1:8787` (HTTP + WebSocket on one port)
- **Depends on**: `postgres` (with `condition: service_healthy`)
- **DATABASE_URL**: `postgres://eastbrook:$POSTGRES_PASSWORD@postgres:5432/eastbrook`
- **NODE_ENV**: `production` (set in Dockerfile)
- **NATIVE_ATTESTATION_REQUIRED**: `0` (set in `.env` to disable native app attestation for local dev)
- **Healthcheck**: `node -e "require('http').get('http://127.0.0.1:8787/livez',...)"` (checks `/livez`)
- **Startup**: `node dist-server/server.cjs` (serves built client + REST API + WebSocket world)

## 4. Environment Variables

The `.env` file (gitignored, not committed) contains:

```
POSTGRES_PASSWORD=local-dev-pg-2026
DATABASE_URL=postgres://eastbrook:local-dev-pg-2026@127.0.0.1:5433/eastbrook
NATIVE_ATTESTATION_REQUIRED=0
MEDIAWIKI_DB_NAME=mediawiki
MEDIAWIKI_DB_USER=mediawiki
MEDIAWIKI_DB_PASSWORD=mediawiki-change-me
MEDIAWIKI_ADMIN_USER=WikiAdmin
MEDIAWIKI_ADMIN_PASS=change-me-admin-password
MEDIAWIKI_SERVER=http://localhost:8080
WIKI_URL=http://localhost:8080/wiki/index.php/Main_Page
```

Key settings for local testing:
- `NATIVE_ATTESTATION_REQUIRED=0`: Disables native app attestation so curl/Node can call the API directly.
- `TURNSTILE_SECRET` is unset: The Turnstile middleware passes when no secret is configured (dev/test mode).
- `REQUIRE_WEB_LOGIN` is unset: In production mode (`NODE_ENV=production`), the web login guard is active, but it accepts `localhost` origins.

## 5. Database Initialization

The game server auto-applies the schema on boot via `ensureSchema()` in `server/db.ts`. No manual migration step is needed. The schema includes the `accounts` and `characters` tables with the `class` column storing the `PlayerClass` string.

## 6. How to Start

```bash
# Start Docker Desktop (Windows)
# Then from the repository root:
docker compose up -d --wait postgres game

# Or build and start:
docker compose up -d --build postgres game
```

Wait for both containers to be healthy:
```bash
docker compose ps
# Both should show "healthy" status
```

## 7. How to Stop

```bash
docker compose down
```

This stops containers but preserves the PostgreSQL volume.

## 8. How to View Logs

```bash
# All services:
docker compose logs

# Game server only:
docker compose logs game

# PostgreSQL only:
docker compose logs postgres

# Follow live:
docker compose logs -f game
```

## 9. How to Reset the Database

**Warning: This destroys all data.**

```bash
docker compose down -v
```

The `-v` flag removes the named volume `eastbrook_pgdata`. The next `docker compose up` will create a fresh database.

To reset only the data (keep the image):
```bash
docker compose down -v
docker compose up -d --wait postgres game
```

## 10. How to Configure the Local Client

The Docker server serves the built client at `http://127.0.0.1:8787`. Open this URL in a browser to use the game client.

For development with `npm run dev` (Vite on :5173), the Vite config proxies `/api`, `/admin/api`, and `/ws` to `:8787`. The Docker server must be running for the dev client to connect.

## 11. How to Create/Use the Local Test Account

The local test account was created via the real registration API:

```bash
# Register (creates account via the real auth flow):
curl -s -X POST http://127.0.0.1:8787/api/register \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8787" \
  -d '{"username":"jhing","password":"<password>","email":"jhing@local.test"}'

# Login (returns a bearer token):
curl -s -X POST http://127.0.0.1:8787/api/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8787" \
  -d '{"username":"jhing","password":"<password>"}'
```

The password is stored only in the local `.env` file (gitignored) and the local PostgreSQL database. It is never committed to Git or placed in tracked source files.

## 12. PT Online Smoke-Test Procedure

### Step 1: Start the environment
```bash
docker compose up -d --wait postgres game
```

### Step 2: Register and login
```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8787/api/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8787" \
  -d '{"username":"jhing","password":"<password>"}' | \
  grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//')
```

### Step 3: Create a PT character
```bash
curl -s -X POST http://127.0.0.1:8787/api/characters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Origin: http://localhost:8787" \
  -d '{"name":"PTFighter","class":"tempskron_fighter","skin":0}'
```

Expected response:
```json
{"id":1,"name":"PTFighter","class":"tempskron_fighter","level":1,"skin":0,"forceRename":false}
```

### Step 4: Verify character roster
```bash
curl -s http://127.0.0.1:8787/api/characters \
  -H "Authorization: Bearer $TOKEN"
```

The roster should include the PT character with `class: "tempskron_fighter"`.

### Step 5: Verify in PostgreSQL
```bash
docker exec eastbrook-db psql -U eastbrook -d eastbrook \
  -c "SELECT id, name, class, level FROM characters WHERE name='PTFighter';"
```

### Step 6: WebSocket Enter World
Connect to `ws://127.0.0.1:8787/ws` and send the auth message:
```json
{
  "t": "auth-world-29",
  "token": "<token>",
  "character": 1,
  "clientSeed": "",
  "dungeonEntryFacingWire": 1,
  "timerWire": 3,
  "petSpecialWire": 1,
  "movementWire": 2
}
```

The server responds with:
- `hello`: `{ pid: 1013, name: "PTFighter", cls: "tempskron_fighter", realm: "Claudemoon" }`
- `snap`: World snapshot with the player entity (`self.tid: "tempskron_fighter"`)

Server logs confirm: `+ PTFighter (tempskron_fighter) joined, 1 online`

## 13. Test Results

### Docker Smoke Test (Real Online Flow)
- **PostgreSQL healthy**: YES
- **Game server healthy**: YES
- **Account registration**: SUCCESS (account "jhing" created via real `/api/register`)
- **Login**: SUCCESS (bearer token issued via real `/api/login`)
- **Character roster retrieval**: SUCCESS (empty initially, then contains PT fighter)
- **PT character creation**: SUCCESS (`tempskron_fighter` accepted by server, stored in PostgreSQL)
- **PostgreSQL verification**: SUCCESS (`class: tempskron_fighter` in `characters` table)
- **WebSocket Enter World**: SUCCESS (server responds with `hello` + `snap`, player entity has `tid: "tempskron_fighter"`)
- **Server log confirmation**: `+ PTFighter (tempskron_fighter) joined, 1 online`

### Unit Tests
- TypeScript (`tsc --noEmit`): PASS
- Server character creation (`tests/server/characters.test.ts`): 105/105 PASSED
- PT character tests (`tests/pt_fighter.test.ts`, `tests/pt_formation.test.ts`, `tests/pt_tribes.test.ts`): 196/196 PASSED

## 14. Known Pre-Existing Failure

`tests/snapshots.test.ts` > "flushes changed movement immediately without resending unchanged frames"

This test was verified to fail on the clean HEAD (`d2ee916957`) before any Docker/test work began. It is a pre-existing failure in the movement/input flush logic, unrelated to the PT online wiring or the Docker environment.
