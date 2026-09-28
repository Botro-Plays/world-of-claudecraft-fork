// PT online population (Phase O4): the realm sim owns monster existence.
//
// O4 changes WHO owns a field's population scheduler: not the bound dev-map
// descriptor but the ACTIVE O3 field session (with the descriptor retained
// as the offline/test fallback). What this suite pins:
//
//   - session ownership: a populated field's anchors arm only while an
//     ACTIVE session holds it; spawned mobs carry the session's ptField
//     identity, stamp their spawn anchor, and join the session's entity
//     index through the O3 roster hook;
//   - near-play scope: anchor near-play reads SESSION players only - a
//     player standing at the same WoC coordinates inside a DIFFERENT field
//     must never arm a foreign field's anchors (the WoC->PT transform of an
//     island field makes a continent player's coordinates meaningful only
//     inside that field's session);
//   - multi-field concurrency: two active sessions populate their own
//     fields in the same sim;
//   - lifecycle: the last player leaving releases the field's owned
//     entities immediately (drain start, not unload) and resets its
//     population state; re-entry rebuilds deterministically - same seed,
//     same first spawn, fresh entity ids;
//   - the wire path: same-field viewers receive the same mob ids; a
//     cross-field viewer never receives them (interest isolation end to
//     end through the real GameServer snapshot);
//   - unresolved actors stay suppressed: mine-1's one no-inf record never
//     produces an entity while its resolved neighbors spawn;
//   - the descriptor fallback keeps a harness-bound map populating with no
//     session at all (offline/dev regression).
//
// Field + population registrations come from the server boot import chain
// (server/game.ts -> sim_boot_config -> pt_fields.ts -> pt_populations.ts);
// the map graph is registered from maplinks.json the way the O3 suite does.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GameServer, type ClientSession } from '../server/game';
import { characterCreationTestSeam } from '../server/main';
import { broadcast, fakeWs, lastSnap, type FakeClient } from './helpers/bare_client';
import { loadPtDevMap } from '../src/game/pt_dev_maps';
import { MOBS } from '../src/sim/data';
import { PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z } from '../src/sim/pt_band';
import { ptFieldById, setActivePtMap } from '../src/sim/pt_field_active';
import { assignPtField, ptFieldSession } from '../src/sim/pt_field_sessions';
import {
  ptGraphFieldTransform,
  registerPtMapGraph,
  type PtMapGraphData,
} from '../src/sim/pt_map_graph';
import { ptPopulationModule, type PtSpawnAnchor } from '../src/sim/pt_population';
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

function ptState(cls: PlayerClass, name: string) {
  return characterCreationTestSeam.initialCharacterState(cls, name, 0);
}

/** A bare sim (no constructor player) with one PT character joined. */
function ptSim(cls: PlayerClass = 'tempskron_fighter', seed = 9410): { sim: Sim; p: Entity } {
  const sim = new Sim({ seed, playerClass: cls, noPlayer: true });
  const pid = sim.addPlayer(cls, 'PT', { autoEquip: true, state: ptState(cls, 'PT') });
  return { sim, p: sim.entities.get(pid)! };
}

/** Tick until `cond` or the sim-second budget lapses; returns whether it hit. */
function tickUntil(sim: Sim, seconds: number, cond: () => boolean): boolean {
  for (let i = 0, n = Math.ceil(seconds / DT); i < n && !cond(); i++) sim.tick();
  return cond();
}

/** The first anchor with authored floor under it, or null. */
function flooredAnchor(fieldId: string): PtSpawnAnchor | null {
  const mod = ptPopulationModule(fieldId);
  const field = ptFieldById(fieldId);
  const xf = ptGraphFieldTransform(fieldId);
  if (!mod || !field || !xf) return null;
  for (const a of mod.spawnAnchors) {
    if (Number.isFinite(field.supportHeight(xf.ptXToWoC(a.x), xf.ptZToWoC(a.z), 0, Infinity))) {
      return a;
    }
  }
  return null;
}

/** Place an entity exactly on a PT anchor (near-play radius) with floor Y. */
function standOnAnchor(p: Entity, fieldId: string, a: PtSpawnAnchor): void {
  const field = ptFieldById(fieldId)!;
  const xf = ptGraphFieldTransform(fieldId)!;
  const x = xf.ptXToWoC(a.x);
  const z = xf.ptZToWoC(a.z);
  p.pos = { x, y: field.supportHeight(x, z, 0, Infinity), z };
  p.prevPos = { ...p.pos };
}

const fieldMobs = (sim: Sim, fieldId: string): Entity[] =>
  [...sim.entities.values()].filter((e) => e.ptFieldAnchor?.fieldId === fieldId);
const liveFieldMobs = (sim: Sim, fieldId: string): Entity[] =>
  fieldMobs(sim, fieldId).filter((e) => !e.dead);

/** Spawned mobs aggro on the observer; keep population, not combat, decisive. */
const tank = (p: Entity): void => {
  p.hp = 1e9;
};

// ---------------------------------------------------------------------------
// Sim level: session ownership, near-play scope, lifecycle, unresolved actors.
// ---------------------------------------------------------------------------

describe('O4 session-owned population (sim level)', () => {
  it('populates the active session field and stamps ownership + floor', () => {
    const { sim, p } = ptSim();
    tank(p);
    const anchor = flooredAnchor('fore-1');
    expect(anchor).not.toBeNull();
    assignPtField(sim.ctx, p, 'fore-1');
    standOnAnchor(p, 'fore-1', anchor!);
    expect(tickUntil(sim, 15, () => liveFieldMobs(sim, 'fore-1').length > 0)).toBe(true);

    const session = ptFieldSession(sim.ctx, 'fore-1')!;
    const field = ptFieldById('fore-1')!;
    for (const m of liveFieldMobs(sim, 'fore-1')) {
      expect(m.ptField).toBe('fore-1');
      expect(session.entities.has(m.id)).toBe(true);
      expect(m.ptFieldAnchor!.anchorIndex).toBe(anchor!.index);
      expect(m.templateId.startsWith('pt_')).toBe(true);
      expect(MOBS[m.templateId]).toBeDefined();
      // The mob sits ON a resolved PT surface (leader: the top; members: a
      // surface within the authored tolerance band).
      const floor = field.floorHeight(m.pos.x, m.pos.z, m.pos.y + 1.0);
      expect(Number.isFinite(floor)).toBe(true);
      expect(Math.abs(floor - m.pos.y)).toBeLessThan(0.05);
    }
  });

  it('populates two active fields concurrently in one sim', () => {
    const { sim, p } = ptSim();
    tank(p);
    const pid2 = sim.addPlayer('tempskron_fighter', 'PT2', {
      autoEquip: true,
      state: ptState('tempskron_fighter', 'PT2'),
    });
    const p2 = sim.entities.get(pid2)!;
    tank(p2);

    const a1 = flooredAnchor('fore-1')!;
    const a2 = flooredAnchor('fore-2')!;
    assignPtField(sim.ctx, p, 'fore-1');
    standOnAnchor(p, 'fore-1', a1);
    assignPtField(sim.ctx, p2, 'fore-2');
    standOnAnchor(p2, 'fore-2', a2);

    expect(
      tickUntil(
        sim,
        20,
        () => liveFieldMobs(sim, 'fore-1').length > 0 && liveFieldMobs(sim, 'fore-2').length > 0,
      ),
    ).toBe(true);
    for (const m of liveFieldMobs(sim, 'fore-2')) {
      expect(m.ptField).toBe('fore-2');
      expect(ptFieldSession(sim.ctx, 'fore-2')!.entities.has(m.id)).toBe(true);
    }
  });

  it('near-play reads session players only: a sessionless roster member on the anchor cannot arm it', async () => {
    // The reachable foreigner construction: on a descriptor host the
    // transition tracker is inert (presentation owns traversal), so a WoC
    // warrior can stand on a fore-1 anchor WITHOUT gaining ptField - a
    // roster player at arming distance who belongs to no session. A
    // roster-wide near-play scan (the pre-O4 behavior) would let him arm
    // the field; session scope must not.
    const f1 = await loadPtDevMap('fore-1');
    setActivePtMap(f1.descriptor);
    try {
      const { sim, p } = ptSim();
      tank(p);
      const rid = sim.addPlayer('warrior', 'WoC', { autoEquip: true });
      const r = sim.entities.get(rid)!;
      tank(r);

      const anchor = flooredAnchor('fore-1')!;
      // S holds fore-1's session (so the session - not the descriptor -
      // owns near-play) from far outside every anchor's radius.
      assignPtField(sim.ctx, p, 'fore-1');
      const xf = ptGraphFieldTransform('fore-1')!;
      p.pos = { x: xf.ptXToWoC(anchor.x + 20000), y: 0, z: xf.ptZToWoC(anchor.z + 20000) };
      p.prevPos = { ...p.pos };
      standOnAnchor(r, 'fore-1', anchor);

      expect(ptFieldSession(sim.ctx, 'fore-1')!.players.has(p.id)).toBe(true);
      for (let i = 0; i < 20 * 12; i++) sim.tick();
      expect(r.ptField).toBeUndefined();
      expect(liveFieldMobs(sim, 'fore-1')).toHaveLength(0);

      // Positive control: the session's own player arriving at the anchor
      // does arm it - the field was live and only the scope gated it.
      standOnAnchor(p, 'fore-1', anchor);
      expect(tickUntil(sim, 15, () => liveFieldMobs(sim, 'fore-1').length > 0)).toBe(true);
    } finally {
      setActivePtMap(null);
    }
  });

  it('releases owned entities when the session drains and rebuilds deterministically on re-entry', () => {
    const { sim, p } = ptSim();
    tank(p);
    const anchor = flooredAnchor('fore-1')!;
    assignPtField(sim.ctx, p, 'fore-1');
    standOnAnchor(p, 'fore-1', anchor);
    expect(tickUntil(sim, 15, () => liveFieldMobs(sim, 'fore-1').length > 0)).toBe(true);
    const first = liveFieldMobs(sim, 'fore-1').map((m) => ({
      templateId: m.templateId,
      x: m.pos.x,
      z: m.pos.z,
    }));
    const firstIds = liveFieldMobs(sim, 'fore-1').map((m) => m.id);

    // The last (only) player leaves: the session drains and the field's
    // owned entities release at drain start - far inside the absence window.
    assignPtField(sim.ctx, p, 'ricarten');
    p.pos = { x: PT_RICARTEN_SPAWN_X, y: 0, z: PT_RICARTEN_SPAWN_Z };
    p.prevPos = { ...p.pos };
    for (let i = 0; i < 4; i++) sim.tick();
    expect(fieldMobs(sim, 'fore-1')).toHaveLength(0);

    // Re-entry rebuilds from reset state: same seed + field + spawn
    // ordinal reproduces the first group exactly, on fresh entity ids.
    assignPtField(sim.ctx, p, 'fore-1');
    standOnAnchor(p, 'fore-1', anchor);
    expect(tickUntil(sim, 15, () => liveFieldMobs(sim, 'fore-1').length > 0)).toBe(true);
    const second = liveFieldMobs(sim, 'fore-1').map((m) => ({
      templateId: m.templateId,
      x: m.pos.x,
      z: m.pos.z,
    }));
    expect(second).toEqual(first);
    for (const m of liveFieldMobs(sim, 'fore-1')) {
      expect(firstIds.includes(m.id)).toBe(false);
    }
  });

  it('mine-1 spawns its resolved actors and never the unresolved record', () => {
    const { sim, p } = ptSim();
    tank(p);
    const anchor = flooredAnchor('mine-1');
    expect(anchor).not.toBeNull();
    assignPtField(sim.ctx, p, 'mine-1');
    standOnAnchor(p, 'mine-1', anchor!);
    expect(tickUntil(sim, 15, () => liveFieldMobs(sim, 'mine-1').length > 0)).toBe(true);

    const mod = ptPopulationModule('mine-1')!;
    const resolved = new Set(
      mod.actors.filter((a) => a.monster !== null).map((a) => `pt_${a.monster}`),
    );
    expect(resolved.size).toBeGreaterThan(0);
    for (const m of liveFieldMobs(sim, 'mine-1')) {
      expect(resolved.has(m.templateId)).toBe(true);
    }
  });

  it('descriptor fallback: a bound dev map still populates with no session', async () => {
    const f1 = await loadPtDevMap('fore-1');
    setActivePtMap(f1.descriptor);
    try {
      const sim = new Sim({ seed: 4242, playerClass: 'warrior' });
      tank(sim.player);
      const xf = f1.descriptor.transform;
      const a = FORE1_FIRST_FLOORED_ANCHOR(xf);
      sim.player.pos.x = xf.ptXToWoC(a.x);
      sim.player.pos.z = xf.ptZToWoC(a.z);
      const y = ptFieldById('fore-1')?.groundHeight(sim.player.pos.x, sim.player.pos.z);
      if (y !== undefined && Number.isFinite(y)) sim.player.pos.y = y;
      // A WoC warrior carries no ptField: no session may exist, so this run
      // proves the descriptor owner alone drives population.
      expect(sim.player.ptField).toBeUndefined();
      expect(tickUntil(sim, 15, () => liveFieldMobs(sim, 'fore-1').length > 0)).toBe(true);
    } finally {
      setActivePtMap(null);
    }
  });
});

// The descriptor-path helper mirrors pt_population_runtime's flooredAnchor,
// against the bound dev field (activeOwnedPtField-equivalent via ptFieldById,
// which answers the same registered module for a bound static field).
function FORE1_FIRST_FLOORED_ANCHOR(xf: {
  ptXToWoC(v: number): number;
  ptZToWoC(v: number): number;
}): PtSpawnAnchor {
  const mod = ptPopulationModule('fore-1')!;
  const field = ptFieldById('fore-1');
  if (field) {
    for (const a of mod.spawnAnchors) {
      if (Number.isFinite(field.supportHeight(xf.ptXToWoC(a.x), xf.ptZToWoC(a.z), 0, Infinity))) {
        return a;
      }
    }
  }
  return mod.spawnAnchors[0];
}

// ---------------------------------------------------------------------------
// Online level: the real GameServer owns spawn + interest delivery.
// ---------------------------------------------------------------------------

function joinPtChar(
  server: GameServer,
  accountId: number,
  characterId: number,
  name: string,
): { session: ClientSession; fc: FakeClient } {
  const fc = fakeWs();
  const state = ptState('tempskron_fighter', name);
  const session = server.join(
    fc.ws,
    accountId,
    characterId,
    name,
    'tempskron_fighter',
    state,
    false,
    {},
  );
  if ('error' in session) throw new Error(session.error);
  session.blockListLoaded = true;
  return { session, fc };
}

function routeTick(server: GameServer): void {
  // biome-ignore lint/suspicious/noExplicitAny: private loop seam, same as the O3 suite
  (server as any).routeEvents(server.sim.tick());
}

const snapEntityIds = (fc: FakeClient): Set<number> =>
  new Set((lastSnap(fc.sent)?.ents ?? []).map((e: { id: number }) => e.id));

describe('O4 population on the online path (GameServer)', () => {
  it('server spawns authoritative mobs; only same-field viewers receive them', () => {
    const server = new GameServer();
    const a = joinPtChar(server, 21, 301, 'PopA');
    const b = joinPtChar(server, 22, 302, 'PopB');

    // A into fore-1 at a floored anchor; B stays in ricarten.
    const anchor = flooredAnchor('fore-1')!;
    const pa = server.sim.entities.get(a.session.pid)!;
    tank(pa);
    assignPtField(server.sim.ctx, pa, 'fore-1');
    standOnAnchor(pa, 'fore-1', anchor);

    let spawned: Entity[] = [];
    for (let i = 0; i < 20 * 20 && spawned.length === 0; i++) {
      routeTick(server);
      spawned = [...server.sim.entities.values()].filter(
        (e) => e.ptFieldAnchor?.fieldId === 'fore-1',
      );
    }
    expect(spawned.length).toBeGreaterThan(0);
    const session = ptFieldSession(server.sim.ctx, 'fore-1')!;
    for (const m of spawned) {
      expect(m.ptField).toBe('fore-1');
      expect(session.entities.has(m.id)).toBe(true);
    }

    // Wire: A's snapshot carries the mobs; B's never does.
    broadcast(server);
    const idsA = snapEntityIds(a.fc);
    const idsB = snapEntityIds(b.fc);
    for (const m of spawned) {
      expect(idsA.has(m.id)).toBe(true);
      expect(idsB.has(m.id)).toBe(false);
    }

    // B enters the same field: the SAME entities become visible to B -
    // no duplicate population is created for the second player.
    const before = new Set(
      [...server.sim.entities.values()]
        .filter((e) => e.ptFieldAnchor?.fieldId === 'fore-1')
        .map((e) => e.id),
    );
    const pb = server.sim.entities.get(b.session.pid)!;
    tank(pb);
    assignPtField(server.sim.ctx, pb, 'fore-1');
    standOnAnchor(pb, 'fore-1', anchor);
    for (let i = 0; i < 20 * 3; i++) routeTick(server);
    broadcast(server);
    const idsB2 = snapEntityIds(b.fc);
    for (const id of before) {
      expect(idsB2.has(id)).toBe(true);
    }
    const anchorNow = new Set(
      [...server.sim.entities.values()]
        .filter((e) => e.ptFieldAnchor?.fieldId === 'fore-1')
        .map((e) => e.id),
    );
    for (const id of anchorNow) {
      // Nothing new spawned AT THIS anchor just because B arrived; natural
      // cadence may arm OTHER anchors, so compare the observed anchor only.
      if (before.has(id)) continue;
      const e = server.sim.entities.get(id)!;
      expect(e.ptFieldAnchor!.anchorIndex).not.toBe(anchor.index);
    }
  });

  it('leave drains the field: owned mobs release and a rejoin rebuilds them', async () => {
    const server = new GameServer();
    const a = joinPtChar(server, 23, 303, 'PopC');
    const anchor = flooredAnchor('fore-1')!;
    const p = server.sim.entities.get(a.session.pid)!;
    tank(p);
    assignPtField(server.sim.ctx, p, 'fore-1');
    standOnAnchor(p, 'fore-1', anchor);
    for (let i = 0; i < 20 * 20; i++) {
      routeTick(server);
      if (
        [...server.sim.entities.values()].some((e) => e.ptFieldAnchor?.fieldId === 'fore-1')
      ) {
        break;
      }
    }
    const spawnedIds = new Set(
      [...server.sim.entities.values()]
        .filter((e) => e.ptFieldAnchor?.fieldId === 'fore-1')
        .map((e) => e.id),
    );
    expect(spawnedIds.size).toBeGreaterThan(0);

    const saved = server.sim.serializeCharacter(a.session.pid)!;
    expect(saved.ptField).toBe('fore-1');
    await server.leave(a.session, 'o4 drain');
    for (let i = 0; i < 4; i++) routeTick(server);
    expect(
      [...server.sim.entities.values()].filter((e) => e.ptFieldAnchor?.fieldId === 'fore-1'),
    ).toHaveLength(0);

    // Rejoin with the saved field: the session rebuilds and repopulates on
    // fresh entity ids.
    const fc2 = fakeWs();
    const rejoin = server.join(
      fc2.ws,
      23,
      303,
      'PopC',
      'tempskron_fighter',
      saved,
      false,
      {},
    );
    if ('error' in rejoin) throw new Error(rejoin.error);
    const rp = server.sim.entities.get(rejoin.pid)!;
    tank(rp);
    expect(rp.ptField).toBe('fore-1');
    let rebuilt: Entity[] = [];
    for (let i = 0; i < 20 * 20; i++) {
      routeTick(server);
      rebuilt = [...server.sim.entities.values()].filter(
        (e) => e.ptFieldAnchor?.fieldId === 'fore-1',
      );
      if (rebuilt.length > 0) break;
    }
    expect(rebuilt.length).toBeGreaterThan(0);
    for (const m of rebuilt) {
      expect(spawnedIds.has(m.id)).toBe(false);
    }
  });
});
