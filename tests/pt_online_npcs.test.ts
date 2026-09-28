// PT fixed NPCs online (O5): the realm sim owns .spc-sourced NPC existence.
//
// MagicPT opens every live .spc record (code != 0) when a field loads
// (STG_AREA::LoadStage -> OpenNpc). The WoC equivalent places the field's
// authored NPC set once per ACTIVE PtFieldSession (with the bound dev-map
// descriptor retained as the offline/test fallback) and releases it when the
// owner drains. What this suite pins:
//
//   - session ownership: a placed field's NPCs exist only while an ACTIVE
//     session holds it; each entity carries the session's ptField identity
//     and joins the session entity index;
//   - source-authentic placement: entity x/z equals the .spc record pushed
//     through the field's canonical transform, facing maps ay (ANGLE_360=
//     4096) through the X-mirror rule (t -> -t), and y lands on the field
//     floor under the authored height;
//   - lifecycle: the last player leaving releases the field's NPCs at drain
//     start; re-entry rebuilds the same authored set on fresh entity ids;
//   - the wire path: same-field viewers receive the same npc ids; a
//     cross-field viewer never receives them (interest isolation end to end
//     through the real GameServer snapshot);
//   - vendor/warehouse data: shop NPCs expose vendorItems resolved to real
//     pt_* ITEMS, and *物品保管 NPCs join the banker reach set;
//   - the descriptor fallback keeps a harness-bound map placing NPCs with no
//     session at all (offline/dev parity with pt_population);
//   - generated data integrity: every placed record resolves its .npc def,
//     every shop code resolves in the item catalog, duplicate slots are
//     impossible by construction.
//
// Field/npc registrations come from the server boot import chain
// (server/game.ts -> sim_boot_config -> pt_fields.ts -> pt_npcs.ts); the map
// graph is registered from maplinks.json the way the O3/O4 suites do.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PT_FIELD_NPCS as FORE2_NPCS } from '../generated/pt-maps/fore-2/npcs.generated';
import { PT_FIELD_NPCS as PILAI_NPCS } from '../generated/pt-maps/pilai/npcs.generated';
import { PT_ITEM_CATALOG } from '../generated/pt-maps/pt_item_catalog.generated';
import { PT_NPC_CATALOG } from '../generated/pt-maps/pt_npc_catalog.generated';
import { PT_FIELD_NPCS as RICARTEN_NPCS } from '../generated/pt-maps/ricarten/npcs.generated';
import { type ClientSession, GameServer } from '../server/game';
import { characterCreationTestSeam } from '../server/main';
import { loadPtDevMap } from '../src/game/pt_dev_maps';
import { ptItemId } from '../src/sim/content/pt_items';
import { PT_NPC_DEFS, ptNpcTemplateId } from '../src/sim/content/pt_npcs';
import { ITEMS, NPCS } from '../src/sim/data';
import { ptFieldById, setActivePtMap } from '../src/sim/pt_field_active';
import { assignPtField, ptFieldSession } from '../src/sim/pt_field_sessions';
import {
  type PtMapGraphData,
  ptGraphFieldTransform,
  registerPtMapGraph,
} from '../src/sim/pt_map_graph';
import { type PtNpcModule, ptAngleToFacing, ptNpcModule } from '../src/sim/pt_npcs';
import { Sim } from '../src/sim/sim';
import { DT, type Entity, type PlayerClass } from '../src/sim/types';
import { broadcast, type FakeClient, fakeWs, lastSnap } from './helpers/bare_client';

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

function tickUntil(sim: Sim, seconds: number, cond: () => boolean): boolean {
  for (let i = 0, n = Math.ceil(seconds / DT); i < n && !cond(); i++) sim.tick();
  return cond();
}

const fieldNpcs = (sim: Sim, fieldId: string): Entity[] =>
  [...sim.entities.values()].filter((e) => e.kind === 'npc' && e.ptField === fieldId);

/** The generated placement record a spawned entity claims (slot order is
 *  spawn order: ids land in .spc record order). */
function expectAuthoredPlacement(e: Entity, fieldId: string, rec: PtNpcModule['npcs'][number]) {
  const xf = ptGraphFieldTransform(fieldId)!;
  expect(e.ptField).toBe(fieldId);
  expect(e.kind).toBe('npc');
  expect(e.templateId).toBe(ptNpcTemplateId(rec.def!));
  expect(e.pos.x).toBeCloseTo(xf.ptXToWoC(rec.x), 6);
  expect(e.pos.z).toBeCloseTo(xf.ptZToWoC(rec.z), 6);
  // y: the field floor at the authored spot when resolvable, else the
  // authored PT height through the transform (see pt_npcs.ts spawn comment).
  const authoredY = xf.ptYToWoC(rec.y);
  const floor = ptFieldById(fieldId)!.floorHeight(e.pos.x, e.pos.z, authoredY + 1);
  if (floor !== -Infinity) expect(e.pos.y).toBeCloseTo(floor, 4);
  else expect(e.pos.y).toBeCloseTo(authoredY, 4);
  // facing: PT ay (4096/rev, 0 = north) through the X-mirror rule t -> -t.
  const wantFacing = ptAngleToFacing(rec.ay);
  const d = Math.abs(e.facing - wantFacing);
  expect(Math.min(d, Math.PI * 2 - d)).toBeLessThan(1e-9);
}

// ---------------------------------------------------------------------------
// Sim level: ownership, placement fidelity, lifecycle, vendor data.
// ---------------------------------------------------------------------------

describe('O5 session-owned fixed NPCs (sim level)', () => {
  it("spawns the field's authored .spc set when its session goes active", () => {
    const { sim, p } = ptSim();
    assignPtField(sim.ctx, p, 'fore-2');
    expect(tickUntil(sim, 5, () => fieldNpcs(sim, 'fore-2').length > 0)).toBe(true);

    const session = ptFieldSession(sim.ctx, 'fore-2')!;
    const npcs = fieldNpcs(sim, 'fore-2');
    expect(npcs.length).toBe(FORE2_NPCS.npcs.length);
    npcs.forEach((npc, i) => {
      expect(session.entities.has(npc.id)).toBe(true);
      expectAuthoredPlacement(npc, 'fore-2', FORE2_NPCS.npcs[i]);
      expect(NPCS[npc.templateId]).toBeDefined();
    });
  });

  it('ricarten places its full 48-NPC town set', () => {
    const { sim, p } = ptSim();
    assignPtField(sim.ctx, p, 'ricarten');
    expect(tickUntil(sim, 5, () => fieldNpcs(sim, 'ricarten').length === 48)).toBe(true);
    for (const npc of fieldNpcs(sim, 'ricarten')) {
      expect(npc.templateId.startsWith('pt_npc_')).toBe(true);
    }
  });

  it('releases NPCs when the session drains and rebuilds them on re-entry', () => {
    const { sim, p } = ptSim();
    assignPtField(sim.ctx, p, 'fore-2');
    expect(tickUntil(sim, 5, () => fieldNpcs(sim, 'fore-2').length > 0)).toBe(true);
    const first = fieldNpcs(sim, 'fore-2').map((n) => ({
      templateId: n.templateId,
      x: n.pos.x,
      z: n.pos.z,
      facing: n.facing,
    }));
    const firstIds = fieldNpcs(sim, 'fore-2').map((n) => n.id);

    // Last player leaves -> drain start releases the field's NPCs.
    assignPtField(sim.ctx, p, 'ricarten');
    for (let i = 0; i < 4; i++) sim.tick();
    expect(fieldNpcs(sim, 'fore-2')).toHaveLength(0);

    assignPtField(sim.ctx, p, 'fore-2');
    expect(tickUntil(sim, 5, () => fieldNpcs(sim, 'fore-2').length > 0)).toBe(true);
    const second = fieldNpcs(sim, 'fore-2').map((n) => ({
      templateId: n.templateId,
      x: n.pos.x,
      z: n.pos.z,
      facing: n.facing,
    }));
    expect(second).toEqual(first);
    for (const n of fieldNpcs(sim, 'fore-2')) {
      expect(firstIds.includes(n.id)).toBe(false);
    }
  });

  it('shop NPCs carry source vendor lists resolved to real items', () => {
    const { sim, p } = ptSim();
    assignPtField(sim.ctx, p, 'ricarten');
    tickUntil(sim, 5, () => fieldNpcs(sim, 'ricarten').length === 48);

    // ricarden-equip1 (铁匠古登) sells its authored *武器出售 + *防具出售
    // union; every row must resolve to a real pt_* item in ITEMS.
    const vendor = fieldNpcs(sim, 'ricarten').find(
      (n) => n.templateId === ptNpcTemplateId('ricarden-equip1'),
    )!;
    expect(vendor).toBeDefined();
    // The authored union, minus any code that never resolved in OpenItem
    // (content/pt_npcs.ts drops unresolvable tokens at def-build time).
    const cat = PT_NPC_CATALOG['ricarden-equip1'];
    const itemCodes = PT_ITEM_CATALOG as Record<string, unknown>;
    const expected = new Set(
      [...cat.sellAttack, ...cat.sellDefence, ...cat.sellEtc]
        .filter((code) => itemCodes[code])
        .map((code) => ptItemId(code)),
    );
    expect(vendor.vendorItems.length).toBe(expected.size);
    expect(vendor.vendorItems.length).toBeGreaterThan(0);
    for (const id of vendor.vendorItems) {
      expect(id.startsWith('pt_')).toBe(true);
      expect(ITEMS[id]).toBeDefined();
    }
    // Spot-check a source row: PL101 is in the pilai 杂货店 etc list and its
    // potion stats survive into the item def.
    expect(ITEMS[ptItemId('PL101')]).toMatchObject({ kind: 'potion' });
    expect(ITEMS[ptItemId('PL101')].potionHp).toBeGreaterThan(0);
  });

  it('*物品保管 NPCs join the banker reach set', () => {
    const { sim, p } = ptSim();
    assignPtField(sim.ctx, p, 'ricarten');
    tickUntil(sim, 5, () => fieldNpcs(sim, 'ricarten').length === 48);
    const warehouse = fieldNpcs(sim, 'ricarten').find(
      (n) => n.templateId === ptNpcTemplateId('ricarden-warehouse'),
    )!;
    expect(warehouse).toBeDefined();
    expect(sim.ctx.bankerIds.includes(warehouse.id)).toBe(true);
  });

  it('descriptor fallback: a bound dev map places its NPCs with no session', async () => {
    const f2 = await loadPtDevMap('fore-2');
    setActivePtMap(f2.descriptor);
    try {
      const sim = new Sim({ seed: 4242, playerClass: 'warrior' });
      expect(sim.player.ptField).toBeUndefined();
      expect(tickUntil(sim, 5, () => fieldNpcs(sim, 'fore-2').length > 0)).toBe(true);
      expect(fieldNpcs(sim, 'fore-2').length).toBe(FORE2_NPCS.npcs.length);
    } finally {
      setActivePtMap(null);
    }
  });

  it("keeps two active fields' NPC sets isolated", () => {
    const { sim, p } = ptSim();
    const pid2 = sim.addPlayer('tempskron_fighter', 'PT2', {
      autoEquip: true,
      state: ptState('tempskron_fighter', 'PT2'),
    });
    const p2 = sim.entities.get(pid2)!;
    assignPtField(sim.ctx, p, 'fore-2');
    assignPtField(sim.ctx, p2, 'fore-3');
    expect(
      tickUntil(
        sim,
        5,
        () => fieldNpcs(sim, 'fore-2').length > 0 && fieldNpcs(sim, 'fore-3').length > 0,
      ),
    ).toBe(true);
    for (const n of fieldNpcs(sim, 'fore-3')) {
      expect(n.ptField).toBe('fore-3');
      expect(ptFieldSession(sim.ctx, 'fore-3')!.entities.has(n.id)).toBe(true);
      expect(ptFieldSession(sim.ctx, 'fore-2')!.entities.has(n.id)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Online level: the real GameServer owns placement + interest delivery.
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
  // biome-ignore lint/suspicious/noExplicitAny: private loop seam, same as the O4 suite
  (server as any).routeEvents(server.sim.tick());
}

/** Place an entity on a field's first authored NPC spot. The transition
 *  tracker re-derives ptField from WoC position each tick, so assigning the
 *  field without moving into its band snaps back on the next tick (the O4
 *  suite's standOnAnchor does the same for anchors). */
function standOnFieldNpc(p: Entity, fieldId: string): void {
  const mod = ptNpcModule(fieldId)!;
  const field = ptFieldById(fieldId)!;
  const xf = ptGraphFieldTransform(fieldId)!;
  const rec = mod.npcs[0];
  const x = xf.ptXToWoC(rec.x);
  const z = xf.ptZToWoC(rec.z);
  const y = field.floorHeight(x, z, xf.ptYToWoC(rec.y) + 1);
  p.pos = { x, y: y === -Infinity ? xf.ptYToWoC(rec.y) : y, z };
  p.prevPos = { ...p.pos };
}

const snapEntityIds = (fc: FakeClient): Set<number> =>
  new Set((lastSnap(fc.sent)?.ents ?? []).map((e: { id: number }) => e.id));

describe('O5 fixed NPCs on the online path (GameServer)', () => {
  it('server places authoritative NPCs; only same-field viewers receive them', () => {
    const server = new GameServer();
    const a = joinPtChar(server, 31, 311, 'NpcA');
    const b = joinPtChar(server, 32, 312, 'NpcB');

    // A into fore-2 (1 authored NPC) standing on it; B stays in ricarten.
    const pa = server.sim.entities.get(a.session.pid)!;
    assignPtField(server.sim.ctx, pa, 'fore-2');
    standOnFieldNpc(pa, 'fore-2');
    for (let i = 0; i < 20 * 5; i++) routeTick(server);

    const npcs = [...server.sim.entities.values()].filter(
      (e) => e.kind === 'npc' && e.ptField === 'fore-2',
    );
    expect(npcs.length).toBe(FORE2_NPCS.npcs.length);
    const session = ptFieldSession(server.sim.ctx, 'fore-2')!;
    for (const n of npcs) expect(session.entities.has(n.id)).toBe(true);

    broadcast(server);
    const idsA = snapEntityIds(a.fc);
    const idsB = snapEntityIds(b.fc);
    for (const n of npcs) {
      expect(idsA.has(n.id)).toBe(true);
      expect(idsB.has(n.id)).toBe(false);
    }

    // B enters the same field: the SAME entities become visible to B.
    const pb = server.sim.entities.get(b.session.pid)!;
    assignPtField(server.sim.ctx, pb, 'fore-2');
    standOnFieldNpc(pb, 'fore-2');
    for (let i = 0; i < 20 * 3; i++) routeTick(server);
    broadcast(server);
    const idsB2 = snapEntityIds(b.fc);
    for (const n of npcs) {
      expect(idsB2.has(n.id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Data integrity: generated modules against the catalogs they resolve to.
// ---------------------------------------------------------------------------

describe('O5 generated data integrity', () => {
  const mods = [RICARTEN_NPCS, PILAI_NPCS, FORE2_NPCS] as unknown as PtNpcModule[];

  it('every placed record resolves a catalog def and a usable template id', () => {
    for (const mod of mods) {
      for (const rec of mod.npcs) {
        expect(rec.def).not.toBeNull();
        expect(PT_NPC_DEFS[rec.def!]).toBeDefined();
        expect(NPCS[ptNpcTemplateId(rec.def!)]).toBeDefined();
      }
    }
  });

  it('no duplicate placement slots inside a field', () => {
    for (const mod of mods) {
      const slots = mod.npcs.map((n) => n.slot);
      expect(new Set(slots).size).toBe(slots.length);
    }
  });

  it('every shop stock code resolves in the item catalog', () => {
    for (const [key, def] of Object.entries(PT_NPC_DEFS)) {
      for (const code of [...def.sellAttack, ...def.sellDefence, ...def.sellEtc]) {
        const itemId = ptItemId(code);
        // unresolved codes are filtered at def-build; resolved ones must exist
        if (NPCS[ptNpcTemplateId(key)]?.vendorItems?.includes(itemId)) {
          expect(ITEMS[itemId]).toBeDefined();
        }
      }
    }
  });

  it('resolved catalog GLBs exist under public/models', () => {
    for (const def of Object.values(PT_NPC_DEFS)) {
      if (!def.glb) continue;
      const onDisk = fileURLToPath(new URL(`../public/${def.glb}`, import.meta.url));
      expect(existsSync(onDisk), `missing ${def.glb}`).toBe(true);
    }
  });
});
