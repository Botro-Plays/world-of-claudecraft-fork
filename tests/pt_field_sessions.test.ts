// PT field sessions (Phase O3): the realm's authoritative answer to "which
// players and PT entities belong to which PT field right now".
//
// The session layer is a field-keyed membership index inside the one Sim -
// NOT a parallel world. What this suite pins:
//
//   - creation/lookup: sessions materialize when the first member arrives,
//     one per field identity, reachable through ptFieldSession(ctx, id);
//   - membership: Entity.ptField writes route through assignPtField, so a
//     transfer is one synchronous step - an entity is never observable in
//     two sessions, and re-assigning the same identity is a no-op;
//   - identity scope: an island resident (dc1) and a continent resident at
//     the SAME WoC coordinates sit in different sessions, and the interest
//     gate keeps them invisible to each other;
//   - lifecycle: ACTIVE while players belong, DRAINING for a grace window
//     after the last player leaves, then UNLOADED; rejoining during drain
//     reactivates, and reactivation reconciles member entities that kept
//     their identity through the unloaded window;
//   - event destination: session.emit stamps the field scope (ptf) so the
//     realm router can deliver world-coordinate events to field members
//     only - the contract O4 population consumes.
//
// The online half runs through the real GameServer + wire snapshot path,
// mirroring pt_transition_online.test.ts: join, leave, reconnect, and the
// field-scoped event route are all exercised on the production call chain.
//
// Field registrations come from the server boot import chain
// (server/game.ts -> sim_boot_config -> pt_fields.ts); the map graph is
// registered here the same way pt_field_dispatch.test.ts does it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GameServer, type ClientSession } from '../server/game';
import { inSamePtField } from '../server/interest_policy';
import { characterCreationTestSeam } from '../server/main';
import { broadcast, fakeWs, lastSnap, type FakeClient } from './helpers/bare_client';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import {
  ptGraphFieldTransform,
  ptGraphWarpGatesOf,
  registerPtMapGraph,
  type PtMapGraphData,
} from '../src/sim/pt_map_graph';
import {
  assignPtField,
  PT_FIELD_DRAIN_GRACE_S,
  ptFieldSession,
  ptFieldSessions,
} from '../src/sim/pt_field_sessions';
import { Sim } from '../src/sim/sim';
import { DT, type Entity, type PlayerClass } from '../src/sim/types';

registerPtMapGraph(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../generated/pt-maps/maplinks.json', import.meta.url)),
      'utf8',
    ),
  ) as PtMapGraphData,
);

// dc1's authored landing in WoC coords - the island overlaps Ricarten's
// claim, which is exactly the coordinate-ambiguity the session layer exists
// to make irrelevant.
const RIC_DC1 = ptGraphWarpGatesOf('ricarten').find((g) =>
  g.exits.some((e) => e.toId === 'dc1'),
)!;
const DC1_LAND = (() => {
  const exit = RIC_DC1.exits.find((e) => e.toId === 'dc1')!;
  const xf = ptGraphFieldTransform('dc1')!;
  return { x: xf.ptXToWoC(exit.x), y: xf.ptYToWoC(exit.y), z: xf.ptZToWoC(exit.z) };
})();

function ptState(cls: PlayerClass, name: string) {
  return characterCreationTestSeam.initialCharacterState(cls, name, 0);
}

/** A bare sim (no constructor player) with one PT character joined. */
function ptSim(cls: PlayerClass = 'tempskron_fighter', seed = 9410): { sim: Sim; p: Entity } {
  const sim = new Sim({ seed, playerClass: cls, noPlayer: true });
  const pid = sim.addPlayer(cls, 'PT', { autoEquip: true, state: ptState(cls, 'PT') });
  return { sim, p: sim.entities.get(pid)! };
}

/** Tick until `cond` or the sim-second budget lapses. */
function tickUntil(sim: Sim, seconds: number, cond: () => boolean): void {
  for (let i = 0, n = Math.ceil(seconds / DT); i < n && !cond(); i++) sim.tick();
}

// ---------------------------------------------------------------------------
// Registry unit level: the SimContext-keyed session index itself.
// ---------------------------------------------------------------------------

describe('field session registry (sim level)', () => {
  it('creates the session when the first identified member joins', () => {
    const { sim, p } = ptSim();
    const s = ptFieldSession(sim.ctx, 'ricarten');
    expect(s).not.toBeNull();
    expect(s!.state).toBe('active');
    expect(s!.players.has(p.id)).toBe(true);
    expect(s!.entities.has(p.id)).toBe(true);
    // One field identity = one session object.
    expect(ptFieldSessions(sim.ctx).filter((x) => x.fieldId === 'ricarten')).toHaveLength(1);
  });

  it('reports null for a field with no live session', () => {
    const { sim } = ptSim();
    expect(ptFieldSession(sim.ctx, 'dc1')).toBeNull();
    expect(ptFieldSession(sim.ctx, 'fore-1')).toBeNull();
  });

  it('keeps players with no PT identity out of every session', () => {
    // A WoC-class character never carries ptField: no session may claim it.
    const sim = new Sim({ seed: 9411, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'WoC', { autoEquip: true });
    const p = sim.entities.get(pid)!;
    expect(p.ptField).toBeUndefined();
    for (const s of ptFieldSessions(sim.ctx)) {
      expect(s.players.has(pid)).toBe(false);
      expect(s.entities.has(pid)).toBe(false);
    }
  });

  it('transfers membership atomically: never in two sessions', () => {
    const { sim, p } = ptSim();
    assignPtField(sim.ctx, p, 'fore-1');
    // One synchronous step: source and destination are consistent the moment
    // the call returns - no interim state where both claim the entity.
    expect(ptFieldSession(sim.ctx, 'ricarten')!.players.has(p.id)).toBe(false);
    expect(ptFieldSession(sim.ctx, 'fore-1')!.players.has(p.id)).toBe(true);
    expect(p.ptField).toBe('fore-1');
    const holding = ptFieldSessions(sim.ctx).filter((s) => s.entities.has(p.id));
    expect(holding.map((s) => s.fieldId)).toEqual(['fore-1']);
  });

  it('treats a repeated assignment as a no-op, not a duplicate join', () => {
    const { sim, p } = ptSim();
    assignPtField(sim.ctx, p, 'ricarten');
    assignPtField(sim.ctx, p, 'ricarten');
    const s = ptFieldSession(sim.ctx, 'ricarten')!;
    expect(s.players.size).toBe(1);
    expect(s.entities.size).toBe(1);
    // And the source-side bookkeeping stayed clean: exactly one session total.
    expect(ptFieldSessions(sim.ctx)).toHaveLength(1);
  });

  it('clears membership when identity is cleared', () => {
    const { sim, p } = ptSim();
    assignPtField(sim.ctx, p, undefined);
    expect(ptFieldSession(sim.ctx, 'ricarten')!.entities.has(p.id)).toBe(false);
    expect(ptFieldSessions(sim.ctx).some((s) => s.entities.has(p.id))).toBe(false);
  });

  it('scopes an island resident by identity, not by the overlapped claim', () => {
    const sim = new Sim({ seed: 9412, playerClass: 'tempskron_fighter', noPlayer: true });
    const islander = sim.entities.get(
      sim.addPlayer('tempskron_fighter', 'Isle', {
        autoEquip: true,
        state: ptState('tempskron_fighter', 'Isle'),
      }),
    )!;
    const townsfolk = sim.entities.get(
      sim.addPlayer('tempskron_fighter', 'Town', {
        autoEquip: true,
        state: ptState('tempskron_fighter', 'Town'),
      }),
    )!;
    // Same coordinates, different authoritative identities.
    islander.pos = { ...DC1_LAND };
    islander.prevPos = { ...DC1_LAND };
    townsfolk.pos = { ...DC1_LAND };
    townsfolk.prevPos = { ...DC1_LAND };
    assignPtField(sim.ctx, islander, 'dc1');

    expect(ptFieldSession(sim.ctx, 'dc1')!.players.has(islander.id)).toBe(true);
    expect(ptFieldSession(sim.ctx, 'ricarten')!.players.has(townsfolk.id)).toBe(true);
    expect(ptFieldSession(sim.ctx, 'ricarten')!.players.has(islander.id)).toBe(false);
    // The position cannot steal the island's identity.
    expect(inSamePtField(islander, townsfolk)).toBe(false);
  });

  it('indexes field-carrying non-player entities without making them players', () => {
    const { sim } = ptSim();
    // Mirror pt_population's pre-insert stamp: the roster hook indexes it.
    const mob = createMob(sim.nextId++, MOBS.forest_wolf, 3, { ...DC1_LAND });
    mob.ptField = 'dc1';
    sim.addEntity(mob);
    const s = ptFieldSession(sim.ctx, 'dc1')!;
    expect(s.entities.has(mob.id)).toBe(true);
    expect(s.players.has(mob.id)).toBe(false);
    // A playerless field holds no one: entity-created sessions go straight
    // to draining rather than pinning a field active.
    expect(s.state).toBe('draining');
  });
});

// ---------------------------------------------------------------------------
// Lifecycle: active -> draining -> unloaded, rejoin, and reconcile.
// ---------------------------------------------------------------------------

describe('field session lifecycle', () => {
  it('drains when the last player leaves and unloads after the grace', () => {
    const { sim, p } = ptSim();
    sim.removePlayer(p.id);
    const draining = ptFieldSession(sim.ctx, 'ricarten')!;
    expect(draining.state).toBe('draining');
    expect(draining.players.size).toBe(0);
    expect(draining.drainAt).toBeGreaterThan(0);
    tickUntil(sim, PT_FIELD_DRAIN_GRACE_S + 1, () => ptFieldSession(sim.ctx, 'ricarten') === null);
    expect(ptFieldSession(sim.ctx, 'ricarten')).toBeNull();
  });

  it('keeps the session while a second player remains', () => {
    const sim = new Sim({ seed: 9413, playerClass: 'tempskron_fighter', noPlayer: true });
    const a = sim.addPlayer('tempskron_fighter', 'A', {
      autoEquip: true,
      state: ptState('tempskron_fighter', 'A'),
    });
    const b = sim.addPlayer('tempskron_fighter', 'B', {
      autoEquip: true,
      state: ptState('tempskron_fighter', 'B'),
    });
    const s = ptFieldSession(sim.ctx, 'ricarten')!;
    expect(s.players.size).toBe(2);
    sim.removePlayer(a);
    // B still owns the field: no drain starts.
    expect(ptFieldSession(sim.ctx, 'ricarten')!.state).toBe('active');
    expect(ptFieldSession(sim.ctx, 'ricarten')!.players.has(b)).toBe(true);
    sim.removePlayer(b);
    expect(ptFieldSession(sim.ctx, 'ricarten')!.state).toBe('draining');
  });

  it('reactivates when a player rejoins during the drain window', () => {
    const sim = new Sim({ seed: 9414, playerClass: 'tempskron_fighter', noPlayer: true });
    const state = ptState('tempskron_fighter', 'A');
    const a = sim.addPlayer('tempskron_fighter', 'A', { autoEquip: true, state });
    sim.removePlayer(a);
    sim.tick(); // one tick into the drain window
    const b = sim.addPlayer('tempskron_fighter', 'A2', { autoEquip: true, state });
    const s = ptFieldSession(sim.ctx, 'ricarten')!;
    expect(s.state).toBe('active');
    expect(s.drainAt).toBe(0);
    expect(s.players.has(b)).toBe(true);
  });

  it('reclaims identity-carrying entities when the session re-creates', () => {
    const sim = new Sim({ seed: 9415, playerClass: 'tempskron_fighter', noPlayer: true });
    // An island mob outlives its session: the entity keeps ptField through
    // the unloaded window (identity lives on the entity, not the session).
    const mob = createMob(sim.nextId++, MOBS.forest_wolf, 3, { ...DC1_LAND });
    mob.ptField = 'dc1';
    sim.addEntity(mob);
    tickUntil(sim, PT_FIELD_DRAIN_GRACE_S + 1, () => ptFieldSession(sim.ctx, 'dc1') === null);
    expect(ptFieldSession(sim.ctx, 'dc1')).toBeNull();
    expect(sim.entities.get(mob.id)!.ptField).toBe('dc1');

    // A player's arrival re-creates the session AND re-indexes the mob the
    // reconcile scan finds already identified with the field.
    const pid = sim.addPlayer('tempskron_fighter', 'A', {
      autoEquip: true,
      state: ptState('tempskron_fighter', 'A'),
    });
    assignPtField(sim.ctx, sim.entities.get(pid)!, 'dc1');
    const s = ptFieldSession(sim.ctx, 'dc1')!;
    expect(s.state).toBe('active');
    expect(s.players.has(pid)).toBe(true);
    expect(s.entities.has(mob.id)).toBe(true);
  });

  it('removes roster membership on disconnect-equivalent drop', () => {
    const { sim, p } = ptSim();
    // sim.removePlayer is the path disconnect/leave() funnels through.
    sim.removePlayer(p.id);
    const s = ptFieldSession(sim.ctx, 'ricarten')!;
    expect(s.entities.has(p.id)).toBe(false);
    expect(s.players.has(p.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Field-scoped event destination: emit stamps, router delivers by field.
// ---------------------------------------------------------------------------

describe('field-scoped event destination', () => {
  it('session.emit stamps the field scope onto the event', () => {
    const { sim } = ptSim();
    // An entity-created session (no players) still carries the emit surface.
    const mob = createMob(sim.nextId++, MOBS.forest_wolf, 3, { ...DC1_LAND });
    mob.ptField = 'dc1';
    sim.addEntity(mob);
    ptFieldSession(sim.ctx, 'dc1')!.emit({
      type: 'spellfxAt',
      x: DC1_LAND.x,
      z: DC1_LAND.z,
      school: 'fire',
      fx: 'burst',
    });
    const out = sim.drainEvents();
    const fx = out.find((e) => e.type === 'spellfxAt');
    expect(fx).toBeDefined();
    expect((fx as { ptf?: string }).ptf).toBe('dc1');
  });
});

// ---------------------------------------------------------------------------
// Online level: the real GameServer join/leave/wire path owns membership.
// ---------------------------------------------------------------------------

function joinPtChar(
  server: GameServer,
  accountId: number,
  characterId: number,
  name: string,
  cls: 'tempskron_fighter' | 'morion_magician',
): { session: ClientSession; fc: FakeClient } {
  const fc = fakeWs();
  const state = ptState(cls, name);
  const session = server.join(fc.ws, accountId, characterId, name, cls, state, false, {});
  if ('error' in session) throw new Error(session.error);
  session.blockListLoaded = true;
  return { session, fc };
}

function routeTick(server: GameServer): void {
  (server as any).routeEvents(server.sim.tick());
}

function eventsSent(fc: FakeClient): any[] {
  return fc.sent.filter((m) => m.t === 'events').flatMap((m) => m.list);
}

describe('field sessions on the online path (GameServer)', () => {
  it('join claims membership in the persisted field session', () => {
    const server = new GameServer();
    const { session } = joinPtChar(server, 11, 201, 'PtA', 'tempskron_fighter');
    const s = ptFieldSession(server.sim.ctx, 'ricarten')!;
    expect(s.state).toBe('active');
    expect(s.players.has(session.pid)).toBe(true);
  });

  it('a FieldGate flip moves membership in the same authoritative step', () => {
    const server = new GameServer();
    const { session } = joinPtChar(server, 12, 202, 'PtB', 'tempskron_fighter');
    broadcast(server);
    const p = server.sim.entities.get(session.pid)!;
    const xf = ptGraphFieldTransform('fore-1')!;
    p.pos = { x: xf.ptXToWoC(4000), y: 0, z: xf.ptZToWoC(-8000) };
    p.prevPos = { ...p.pos };
    routeTick(server);

    const source = ptFieldSession(server.sim.ctx, 'ricarten')!;
    const dest = ptFieldSession(server.sim.ctx, 'fore-1')!;
    expect(source.players.has(session.pid)).toBe(false);
    expect(source.entities.has(session.pid)).toBe(false);
    expect(dest.players.has(session.pid)).toBe(true);
    expect(p.ptField).toBe('fore-1');
    // No observer window: exactly one session holds the entity.
    const holding = ptFieldSessions(server.sim.ctx).filter((s) => s.entities.has(session.pid));
    expect(holding.map((s) => s.fieldId)).toEqual(['fore-1']);
  });

  it('leave drains; a restarted realm reconstructs the session from the save', async () => {
    const server = new GameServer();
    const { session } = joinPtChar(server, 13, 203, 'PtC', 'tempskron_fighter');
    // Move the character off the start field so the restore is load-bearing.
    assignPtField(server.sim.ctx, server.sim.entities.get(session.pid)!, 'fore-1');
    const saved = server.sim.serializeCharacter(session.pid)!;
    expect(saved.ptField).toBe('fore-1');
    await server.leave(session, 'o3 restart seed');
    expect(ptFieldSession(server.sim.ctx, 'fore-1')!.players.size).toBe(0);

    // Server restart = a fresh GameServer (fresh sim, empty registry). The
    // persisted ptField alone rebuilds the session on join.
    const restarted = new GameServer();
    const fc = fakeWs();
    const s2 = restarted.join(fc.ws, 13, 203, 'PtC', 'tempskron_fighter', saved, false, {});
    if ('error' in s2) throw new Error(s2.error);
    const restored = ptFieldSession(restarted.sim.ctx, 'fore-1')!;
    expect(restored.state).toBe('active');
    expect(restored.players.has(s2.pid)).toBe(true);
    broadcast(restarted);
    expect(lastSnap(fc.sent).self.ptf).toBe('fore-1');
  });

  it('two players: same field shares one session, a transfer isolates', () => {
    const server = new GameServer();
    const { session: sa } = joinPtChar(server, 14, 204, 'PtD', 'tempskron_fighter');
    const { session: sb } = joinPtChar(server, 15, 205, 'PtE', 'tempskron_fighter');
    const ric = ptFieldSession(server.sim.ctx, 'ricarten')!;
    expect(ric.players.has(sa.pid)).toBe(true);
    expect(ric.players.has(sb.pid)).toBe(true);

    // A crosses to fore-1; B must not move and must not ghost anywhere.
    assignPtField(server.sim.ctx, server.sim.entities.get(sa.pid)!, 'fore-1');
    expect(ptFieldSession(server.sim.ctx, 'ricarten')!.players.has(sa.pid)).toBe(false);
    expect(ptFieldSession(server.sim.ctx, 'ricarten')!.players.has(sb.pid)).toBe(true);
    expect(ptFieldSession(server.sim.ctx, 'ricarten')!.state).toBe('active');
    expect(ptFieldSession(server.sim.ctx, 'fore-1')!.players.has(sa.pid)).toBe(true);
    expect(
      ptFieldSessions(server.sim.ctx).filter((s) => s.entities.has(sb.pid)),
    ).toHaveLength(1);
  });

  it('a field-scoped event reaches field members and no one else', () => {
    const server = new GameServer();
    // Both players at dc1's landing coordinates (which overlap the Ricarten
    // claim); the islander holds dc1 identity, the townsfolk ricarten.
    const { session: isle, fc: isleFc } = joinPtChar(
      server,
      16,
      206,
      'PtIsle',
      'tempskron_fighter',
    );
    const { session: town, fc: townFc } = joinPtChar(
      server,
      17,
      207,
      'PtTown',
      'tempskron_fighter',
    );
    const isleEnt = server.sim.entities.get(isle.pid)!;
    const townEnt = server.sim.entities.get(town.pid)!;
    isleEnt.pos = { ...DC1_LAND };
    isleEnt.prevPos = { ...DC1_LAND };
    townEnt.pos = { ...DC1_LAND };
    townEnt.prevPos = { ...DC1_LAND };
    assignPtField(server.sim.ctx, isleEnt, 'dc1');
    broadcast(server);

    // The island session's event reaches the islander only.
    ptFieldSession(server.sim.ctx, 'dc1')!.emit({
      type: 'spellfxAt',
      x: DC1_LAND.x,
      z: DC1_LAND.z,
      school: 'fire',
      fx: 'burst',
    });
    routeTick(server);
    const isleFx = eventsSent(isleFc).filter((e) => e.type === 'spellfxAt');
    const townFx = eventsSent(townFc).filter((e) => e.type === 'spellfxAt');
    expect(isleFx).toHaveLength(1);
    expect(isleFx[0].ptf).toBe('dc1');
    expect(townFx).toHaveLength(0);

    // An unstamped continent event at the same coordinates is the reverse:
    // the positional claimant (the continent field) owns it, so the townsfolk
    // sees it and the islander does not.
    server.sim.ctx.emit({
      type: 'spellfxAt',
      x: DC1_LAND.x,
      z: DC1_LAND.z,
      school: 'fire',
      fx: 'nova',
    });
    routeTick(server);
    const isleFx2 = eventsSent(isleFc).filter((e) => e.type === 'spellfxAt' && e.fx === 'nova');
    const townFx2 = eventsSent(townFc).filter((e) => e.type === 'spellfxAt' && e.fx === 'nova');
    expect(townFx2).toHaveLength(1);
    expect(isleFx2).toHaveLength(0);
  });

  it('entity-anchored events follow the anchor field, not the coordinates', () => {
    const server = new GameServer();
    const { session: isle, fc: isleFc } = joinPtChar(
      server,
      18,
      208,
      'PtIsle2',
      'tempskron_fighter',
    );
    const { session: town, fc: townFc } = joinPtChar(
      server,
      19,
      209,
      'PtTown2',
      'tempskron_fighter',
    );
    const isleEnt = server.sim.entities.get(isle.pid)!;
    const townEnt = server.sim.entities.get(town.pid)!;
    isleEnt.pos = { ...DC1_LAND };
    townEnt.pos = { ...DC1_LAND };
    assignPtField(server.sim.ctx, isleEnt, 'dc1');
    broadcast(server);

    // An entityId-anchored log on the islander: distance says "in range" for
    // both viewers (identical coordinates); the field gate says town is out.
    server.sim.ctx.emit({ type: 'log', entityId: isle.pid, text: 'isle cue' });
    routeTick(server);
    const isleLogs = eventsSent(isleFc).filter(
      (e) => e.type === 'log' && e.text === 'isle cue',
    );
    const townLogs = eventsSent(townFc).filter(
      (e) => e.type === 'log' && e.text === 'isle cue',
    );
    expect(isleLogs).toHaveLength(1);
    expect(townLogs).toHaveLength(0);
  });
});
