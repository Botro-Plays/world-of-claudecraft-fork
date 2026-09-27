// O2 online E2E: the authoritative PT transition path end to end through a
// REAL GameServer (its sim_boot_config import registers the O2 field
// closure and the shared map graph, exactly as the shipped realm boots),
// the real snapshot wire, and a real ClientWorld decode. This is the
// strongest integration evidence available in-process: no socket, but the
// join -> sim tick -> bcastSelf -> applySnapshot chain is the production
// one, not a mock.
//
// Covered:
//   1. join: the persisted ptField rides the first snapshot as `ptf` and
//      the online client mirrors it onto IWorld.ptField.
//   2. FieldGate: a player standing on fore-1-claimed ground gets the
//      authoritative flip passively (no command), the `ptf` delta and the
//      pid-scoped `pt_transition` event both reach the wire, and the
//      client mirror follows.
//   3. WarpGate: a morion in pilai's SE0 trigger sends the DATA-FREE
//      {cmd:'pt_transition', rid} frame; the server picks the authored
//      exit itself, lands the player verbatim in forever-fall-01, and the
//      client sees ptf + the warp event.
//   4. Persistence: serializeCharacter after the warp carries
//      ptField='forever-fall-01' - the reconnect seed.
//   5. Two players on one realm: A's warp does not move B's identity.
//   6. Rejection: a bare nudge from a trigger-less position answers
//      commandOutcome ok:false and corrupts nothing.
//
// What stays unproven here (reported honestly in the O2 summary): a live
// browser's curtain/loading sequence, and the multi-hop walk driven by
// real input packets rather than direct placement.

import { describe, expect, it } from 'vitest';
import { GameServer, type ClientSession } from '../server/game';
import { characterCreationTestSeam } from '../server/main';
import {
  bareClient,
  broadcast,
  fakeWs,
  lastSnap,
  type FakeClient,
} from './helpers/bare_client';
import { ptGraphFieldTransform, ptGraphWarpGatesOf } from '../src/sim/pt_map_graph';
import type { ClientWorld } from '../src/net/online';

const PILAI_SE0 = ptGraphWarpGatesOf('pilai').find((g) => g.specialEffect === 0)!;

function joinPt(
  server: GameServer,
  accountId: number,
  characterId: number,
  name: string,
  cls: 'tempskron_fighter' | 'morion_magician',
): { session: ClientSession; fc: FakeClient } {
  const fc = fakeWs();
  // The REAL newborn row shape: server/main.ts stamps the PT start position
  // and ptField at character creation, so a join sees them through state.
  const state = characterCreationTestSeam.initialCharacterState(cls, name, 0);
  const session = server.join(fc.ws, accountId, characterId, name, cls, state, false, {});
  if ('error' in session) throw new Error(session.error);
  session.blockListLoaded = true;
  return { session, fc };
}

/** A wire command rides the production {t:'cmd'} envelope. */
function sendCmd(server: GameServer, session: ClientSession, cmd: Record<string, unknown>): void {
  server.handleMessage(session, JSON.stringify({ t: 'cmd', ...cmd }));
}

/**
 * Sim.tick returns the drained event batch; GameServer's own loop feeds it to
 * routeEvents. The helper mirrors that so queued pt_transition events reach
 * the pid-scoped session instead of being discarded.
 */
function tickServer(server: GameServer): void {
  (server as any).routeEvents(server.sim.tick());
}

/** Deliverable events sent to a fake client: every frame's list, flattened. */
function eventsFor(fc: FakeClient): any[] {
  return fc.sent.filter((m) => m.t === 'events').flatMap((m) => m.list);
}

/** The latest commandOutcome for a request id, or undefined. */
function outcomeFor(fc: FakeClient, rid: number): boolean | undefined {
  for (let i = fc.sent.length - 1; i >= 0; i--) {
    const m = fc.sent[i];
    if (m.t === 'commandOutcome' && m.rid === rid) return m.ok;
  }
  return undefined;
}

describe('PT online transitions E2E (GameServer + wire + ClientWorld)', () => {
  it('join -> snapshot: ptf carries the persisted field and the client mirrors it', () => {
    const server = new GameServer();
    const { session, fc } = joinPt(server, 1, 101, 'PtA', 'tempskron_fighter');
    broadcast(server);

    const snap = lastSnap(fc.sent);
    expect(snap.self.ptf).toBe('ricarten');

    const client: ClientWorld = bareClient(session.pid, {
      playerClass: 'tempskron_fighter',
    });
    (client as any).applySnapshot(snap);
    expect(client.player?.ptField).toBe('ricarten');
    expect(client.ptField).toBe('ricarten'); // IWorld member
  });

  it('FieldGate flip is authoritative and passive: ptf delta + event reach the wire', () => {
    const server = new GameServer();
    const { session, fc } = joinPt(server, 1, 102, 'PtB', 'tempskron_fighter');
    const client = bareClient(session.pid, { playerClass: 'tempskron_fighter' });
    broadcast(server);
    (client as any).applySnapshot(lastSnap(fc.sent));

    // Walk the seam: place the authoritative entity on fore-1-claimed
    // ground (ricarten -> fore-1 is the authored live edge).
    const xf = ptGraphFieldTransform('fore-1')!;
    const p = server.sim.entities.get(session.pid)!;
    p.pos = { x: xf.ptXToWoC(4000), y: 0, z: xf.ptZToWoC(-8000) };
    p.prevPos = { ...p.pos };

    tickServer(server);
    broadcast(server);

    const snap = lastSnap(fc.sent);
    expect(snap.self.ptf).toBe('fore-1');
    (client as any).applySnapshot(snap);
    expect(client.ptField).toBe('fore-1');

    const tr = eventsFor(fc).find(
      (e) => e.type === 'pt_transition' && e.pid === session.pid,
    );
    expect(tr).toMatchObject({ kind: 'field', field: 'fore-1' });
  });

  it('WarpGate: the data-free request resolves the authored exit end to end', () => {
    const server = new GameServer();
    const { session, fc } = joinPt(server, 1, 103, 'PtC', 'morion_magician');
    const client = bareClient(session.pid, { playerClass: 'morion_magician' });
    broadcast(server);
    expect(lastSnap(fc.sent).self.ptf).toBe('pilai');
    (client as any).applySnapshot(lastSnap(fc.sent));

    // Stand inside the pilai SE0 trigger (authored cylinder, PT coords).
    const xf = ptGraphFieldTransform('pilai')!;
    const p = server.sim.entities.get(session.pid)!;
    p.pos = {
      x: xf.ptXToWoC(PILAI_SE0.x),
      y: xf.ptYToWoC(PILAI_SE0.y),
      z: xf.ptZToWoC(PILAI_SE0.z),
    };
    p.prevPos = { ...p.pos };

    // The client sends ONLY the nudge - no field, no gate, no coords.
    sendCmd(server, session, { cmd: 'pt_transition', rid: 41 });
    expect(outcomeFor(fc, 41)).toBe(true);

    const exit = PILAI_SE0.exits[0];
    const dxf = ptGraphFieldTransform('forever-fall-01')!;
    expect(p.pos.x).toBeCloseTo(dxf.ptXToWoC(exit.x), 6);
    expect(p.pos.z).toBeCloseTo(dxf.ptZToWoC(exit.z), 6);

    tickServer(server);
    broadcast(server);
    const snap = lastSnap(fc.sent);
    expect(snap.self.ptf).toBe('forever-fall-01');
    (client as any).applySnapshot(snap);
    expect(client.ptField).toBe('forever-fall-01');
    const tr = eventsFor(fc).find(
      (e) => e.type === 'pt_transition' && e.pid === session.pid,
    );
    expect(tr).toMatchObject({ kind: 'warp', field: 'forever-fall-01' });

    // Persisted state names the destination - the reconnect seed.
    const saved = server.sim.serializeCharacter(session.pid)!;
    expect(saved.ptField).toBe('forever-fall-01');
    expect(saved.pos.x).toBeCloseTo(dxf.ptXToWoC(exit.x), 6);
  });

  it('reconnect: the saved ptField re-seeds the joined entity and the wire', async () => {
    const server = new GameServer();
    const { session: s1, fc: fc1 } = joinPt(server, 2, 104, 'PtD', 'morion_magician');
    broadcast(server);
    expect(lastSnap(fc1.sent).self.ptf).toBe('pilai');

    // Warp to forever-fall-01, then save as the DB layer would.
    const xf = ptGraphFieldTransform('pilai')!;
    const p1 = server.sim.entities.get(s1.pid)!;
    p1.pos = {
      x: xf.ptXToWoC(PILAI_SE0.x),
      y: xf.ptYToWoC(PILAI_SE0.y),
      z: xf.ptZToWoC(PILAI_SE0.z),
    };
    p1.prevPos = { ...p1.pos };
    sendCmd(server, s1, { cmd: 'pt_transition', rid: 42 });
    expect(outcomeFor(fc1, 42)).toBe(true);
    const saved = server.sim.serializeCharacter(s1.pid)!;
    expect(saved.ptField).toBe('forever-fall-01');
    await server.leave(s1, 'e2e reconnect');

    // A fresh session on the saved row restores the field identity.
    const fc2 = fakeWs();
    const s2 = server.join(fc2.ws, 2, 104, 'PtD', 'morion_magician', saved, false, {});
    if ('error' in s2) throw new Error(s2.error);
    const p2 = server.sim.entities.get(s2.pid)!;
    expect(p2.ptField).toBe('forever-fall-01');
    broadcast(server);
    expect(lastSnap(fc2.sent).self.ptf).toBe('forever-fall-01');
  });

  it('two players: A warps while B keeps its own field identity', () => {
    const server = new GameServer();
    const { session: sa, fc: fa } = joinPt(server, 3, 105, 'PtE', 'morion_magician');
    const { session: sb, fc: fb } = joinPt(server, 4, 106, 'PtF', 'tempskron_fighter');
    broadcast(server);
    expect(lastSnap(fa.sent).self.ptf).toBe('pilai');
    expect(lastSnap(fb.sent).self.ptf).toBe('ricarten');

    const xf = ptGraphFieldTransform('pilai')!;
    const pa = server.sim.entities.get(sa.pid)!;
    pa.pos = {
      x: xf.ptXToWoC(PILAI_SE0.x),
      y: xf.ptYToWoC(PILAI_SE0.y),
      z: xf.ptZToWoC(PILAI_SE0.z),
    };
    pa.prevPos = { ...pa.pos };
    sendCmd(server, sa, { cmd: 'pt_transition', rid: 43 });
    expect(outcomeFor(fa, 43)).toBe(true);

    tickServer(server);
    broadcast(server);
    // B is untouched: the entity keeps ricarten, every ptf delta B ever saw
    // was ricarten (unchanged keys are omitted, so scan all frames), and the
    // pid-scoped event went to A only.
    expect(server.sim.entities.get(sb.pid)!.ptField).toBe('ricarten');
    for (const frame of fb.sent) {
      const ptf = (frame as any).self?.ptf;
      if (ptf !== undefined) expect(ptf).toBe('ricarten');
    }
    expect(
      eventsFor(fb).some((e) => e.type === 'pt_transition' && e.pid === sa.pid),
    ).toBe(false);
  });

  it('rejects a nudge away from any trigger without corrupting state', () => {
    const server = new GameServer();
    const { session, fc } = joinPt(server, 5, 107, 'PtG', 'tempskron_fighter');
    broadcast(server);
    const before = { ...server.sim.entities.get(session.pid)!.pos };

    sendCmd(server, session, { cmd: 'pt_transition', rid: 44 });
    expect(outcomeFor(fc, 44)).toBe(false);
    const p = server.sim.entities.get(session.pid)!;
    expect(p.ptField).toBe('ricarten');
    expect(p.pos).toEqual(before);
  });
});
