// PT world connection graph tests: the committed source-derived graph in
// generated/pt-maps/maplinks.json (emitted by scripts/pt-port/lib/
// map_links.mjs via `pt_map.mjs maplinks` / compile-all) and the runtime
// query module src/game/pt_map_links.ts.
//
// Every assertion pins a SOURCE fact parsed out of MagicPT-Chinese, not a
// guess: the field registry, AddGate/AddGate2 bidirectional boundaries,
// WarpGate triggers/exits, the wing-warp destination codes, the NPC/item
// teleport tables, and the server-side smTRANSCODE_WARPFIELD catalog.
// The "no invented connections" invariants are structural: every edge
// endpoint must be a registered field, and boundary records flagged `dead`
// must be exactly the set whose gate point sits outside both footprints.

import { describe, expect, it } from 'vitest';
import {
  ptMapLinksForField,
  ptMapLinksGraph,
  type PtMapLinks,
} from '../src/game/pt_map_links';

const graph = (): PtMapLinks => {
  const g = ptMapLinksGraph();
  if (!g) throw new Error('maplinks.json missing - run `node scripts/pt-port/pt_map.mjs maplinks`');
  return g;
};

describe('pt map graph: registry', () => {
  it('registers exactly 70 fields, indices 0-69 unique', () => {
    const g = graph();
    expect(g.fieldCount).toBe(70);
    expect(g.fields).toHaveLength(70);
    const indices = g.fields.map((f) => f.fieldIndex).sort((a, b) => a - b);
    expect(indices).toEqual([...Array(70).keys()]);
  });

  it('keeps the source field indices (Ricarten=3, Garden of Freedom=2)', () => {
    const g = graph();
    expect(g.fields[3].id).toBe('ricarten');
    expect(g.fields[2].id).toBe('fore-1');
    expect(g.fields[2].displayName).toBe('自由庭院'); // Garden of Freedom
  });
});

describe('pt map graph: FieldGate boundaries', () => {
  it('Ricarten <-> Garden of Freedom is the authored bridge edge', () => {
    const g = graph();
    const edge = g.fieldGates.find((e) => e.from === 2 && e.to === 3);
    expect(edge).toBeDefined();
    expect(edge!.x).toBe(2275);
    expect(edge!.z).toBe(-14828);
    expect(edge!.bidirectional).toBe(true);
    expect(edge!.authoredIn).toBe(2); // authored inside fore-1's InitField block
    expect(edge!.dead ?? false).toBe(false); // both footprints reach the point
  });

  it('exposes the edge on the Ricarten side even though Ricarten authors none', () => {
    const links = ptMapLinksForField('ricarten');
    expect(links).not.toBeNull();
    const e = links!.fieldGates.find((x) => x.otherId === 'fore-1');
    expect(e).toBeDefined();
    expect(e!.x).toBe(2275);
    expect(e!.z).toBe(-14828);
    expect(e!.authoredIn).toBe(2); // reverse record created by AddGate2
  });

  it('every FieldGate edge is bidirectional between registered fields', () => {
    const g = graph();
    expect(g.fieldGates.length).toBeGreaterThan(0);
    for (const e of g.fieldGates) {
      expect(e.bidirectional).toBe(true);
      expect(e.from).toBeGreaterThanOrEqual(0);
      expect(e.from).toBeLessThan(70);
      expect(e.to).toBeGreaterThanOrEqual(0);
      expect(e.to).toBeLessThan(70);
    }
  });

  it('flags exactly the copied-coordinate dead edge (ff-01 -> pilai)', () => {
    const g = graph();
    const dead = g.fieldGates.filter((e) => e.dead);
    expect(dead).toHaveLength(1);
    expect(dead[0].from).toBe(20);
    expect(dead[0].to).toBe(21);
    expect(dead[0].x).toBe(-8508);
    expect(dead[0].z).toBe(-10576);
  });

  it('keeps the SeaA self-loop as authored (source anomaly, not an error)', () => {
    const g = graph();
    const self = g.fieldGates.filter((e) => e.from === e.to);
    expect(self.map((e) => e.from)).toEqual([61]);
  });
});

describe('pt map graph: WarpGate + WarpOut', () => {
  it('covers the dungeon/cave chains parsed from InitField', () => {
    const g = graph();
    const exitsTo = (from: number, to: number) =>
      g.warpGates.some((w) => w.field === from && w.exits.some((e) => e.to === to));
    // ruin-1 <-> dun-1
    expect(exitsTo(7, 13)).toBe(true);
    expect(exitsTo(13, 7)).toBe(true);
    // dun-1 <-> dun-2 -> dun-3
    expect(exitsTo(13, 14)).toBe(true);
    expect(exitsTo(14, 13)).toBe(true);
    expect(exitsTo(14, 15)).toBe(true);
    // dun-4 <-> dun-5 -> dun-6
    expect(exitsTo(22, 23)).toBe(true);
    expect(exitsTo(23, 22)).toBe(true);
    expect(exitsTo(23, 42)).toBe(true);
    // cave trio
    expect(exitsTo(24, 26)).toBe(true);
    expect(exitsTo(25, 26)).toBe(true);
    expect(exitsTo(26, 24)).toBe(true);
    expect(exitsTo(26, 25)).toBe(true);
    // ice3 -> Ricarten return warp
    expect(exitsTo(59, 3)).toBe(true);
    // ba1 -> town1
    expect(exitsTo(52, 51)).toBe(true);
  });

  it('every warp exit lands on a registered field (no invented targets)', () => {
    const g = graph();
    for (const w of g.warpGates) {
      expect(w.field).toBeGreaterThanOrEqual(0);
      expect(w.field).toBeLessThan(70);
      for (const e of w.exits) {
        expect(e.to).toBeGreaterThanOrEqual(0);
        expect(e.to).toBeLessThan(70);
      }
    }
  });

  it('self-targeting exits stamp each field PosWarpOut (last wins)', () => {
    // sFIELD::AddWarpOutGate overwrites PosWarpOut on every self-targeting
    // call, so the field's point is the LAST self-exit in authored order
    // (ancientw has two self-stamping warp gates; the second owns it).
    const g = graph();
    for (const f of g.fields) {
      const selfs = g.warpGates
        .filter((w) => w.field === f.fieldIndex)
        .flatMap((w) => w.exits.filter((e) => e.to === w.field));
      if (selfs.length === 0) continue;
      const last = selfs[selfs.length - 1];
      expect(f.posWarpOut).toEqual({ x: last.x, y: last.y, z: last.z });
    }
  });
});

describe('pt map graph: wing-warp UI', () => {
  it('has the authored destination code table', () => {
    const g = graph();
    expect(g.wingWarp.destinations.map((d) => d.fieldIndex)).toEqual([
      3, 21, 18, 1, 6, 9, 12, 29, 37,
    ]);
    expect(g.wingWarp.destinations.map((d) => d.fieldId)).toEqual([
      'ricarten', 'pilai', 'forever-fall-03', 'fore-2', 'ruin-2',
      'village-1', 'de-4', 'ice-ura', 'lost',
    ]);
    expect(g.wingWarp.haGate.fieldIndex).toBe(33);
    expect(g.wingWarp.haGate.requiresBlessCastleClan).toBe(true);
  });

  it('carries the level gates from FieldLimitLevel_Table', () => {
    const g = graph();
    const req = (fi: number) => g.wingWarp.destinations.find((d) => d.fieldIndex === fi)!.requiredLevel;
    expect(req(12)).toBe(55);
    expect(req(29)).toBe(90);
    expect(req(37)).toBe(95);
    expect(req(3)).toBe(0);
  });

  it('parses the wing-item tier unlocks and the default two-icon map', () => {
    const g = graph();
    expect(g.wingWarp.defaultUnlock).toBe(2);
    expect(g.wingWarp.tiers.map((t) => t.unlockCount)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(g.wingWarp.costs).toEqual([100, 300, 500, 1000, 2000, 4000]);
    expect(g.wingWarp.rules.freeIconsBelow).toBe(2);
    expect(g.wingWarp.rules.sameAreaFree).toBe(true);
  });
});

describe('pt map graph: item/NPC/server transitions', () => {
  it('NPC teleport service destinations match sinTeleportIndexArray', () => {
    const g = graph();
    expect(g.npcTeleport.destinations.map((d) => d.fieldIndex)).toEqual([0, 18, 7, 12]);
    expect(g.npcTeleport.destinations[3].levelGateField).toBe(12);
    expect(g.npcTeleport.dungeonTeleport.fieldIndex).toBe(40);
    expect(g.npcTeleport.castleTeleport.fieldIndex).toBe(33);
    expect(g.npcTeleport.fallGame.fieldIndex).toBe(39);
    expect(g.npcTeleport.warTeleport).toEqual({ fieldIndex: 23, server: true });
  });

  it('ether cores resolve START_FIELD_* defines to field indices', () => {
    const g = graph();
    const byItem = new Map(g.etherCore.map((d) => [d.item, d.fieldIndex]));
    expect(byItem.get('sinEC1|sin01')).toBe(3);  // ricarten
    expect(byItem.get('sinEC1|sin02')).toBe(9);  // village-1 (Navisko)
    expect(byItem.get('sinEC1|sin04')).toBe(21); // pilai
    expect(byItem.get('sinEC1|sin13')).toBe(57); // dc1
    for (const d of g.etherCore) expect(d.fieldIndex).not.toBeNull();
  });

  it('teleport-core scroll has the full 54-row destination table', () => {
    const g = graph();
    expect(g.teleportCore).toHaveLength(54);
    for (const d of g.teleportCore) {
      expect(d.fieldIndex).toBeGreaterThanOrEqual(0);
      expect(d.fieldIndex).toBeLessThan(70);
      expect(d.level).toBeGreaterThanOrEqual(0);
    }
  });

  it('catalogs the server-side smTRANSCODE_WARPFIELD senders', () => {
    const g = graph();
    const kinds = g.serverTransitions.map((t) => t.kind);
    for (const k of [
      'SOD_ENTER', 'SOD_EXIT', 'WAR_JOIN', 'WAR_END',
      'DEVIL_CASTLE_ENTER', 'DEVIL_CASTLE_EXIT', 'QUEST_ARENA',
      'ADMIN_TELEPORT', 'RESPAWN_TOWN',
    ]) {
      expect(kinds).toContain(k);
    }
    const devil = g.serverTransitions.find((t) => t.kind === 'DEVIL_CASTLE_ENTER');
    expect(devil?.fieldIndex).toBe(58);
  });
});

describe('pt map graph: reachability classification', () => {
  it('classifies every field into exactly one bucket', () => {
    const g = graph();
    const classes = new Set(['foot', 'warp', 'ui-item', 'server', 'isolated']);
    for (const f of g.fields) {
      expect(classes.has(f.reachability)).toBe(true);
    }
  });

  it('walkable continent: Ricarten bridge chain is foot-reachable', () => {
    const g = graph();
    for (const fi of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12]) {
      expect(g.fields[fi].reachability).toBe('foot');
    }
    // Pilai is the Morion start town - a foot root, not reachable over the
    // dead ff-01 edge.
    expect(g.fields[21].reachability).toBe('foot');
  });

  it('dungeon fields classify warp, not foot (they teleport, not adjoin)', () => {
    const g = graph();
    for (const fi of [13, 14, 15, 22, 23, 24, 25, 26, 42]) {
      expect(g.fields[fi].reachability).toBe('warp');
    }
  });

  it('the far continent and lost maps classify ui-item', () => {
    const g = graph();
    for (const fi of [50, 51, 52, 55, 59, 61, 68, 69]) {
      expect(g.fields[fi].reachability).toBe('ui-item');
    }
  });

  it('quest arena and devil castle are server-only; office is isolated', () => {
    const g = graph();
    expect(g.fields[32].reachability).toBe('server');
    expect(g.fields[58].reachability).toBe('server');
    expect(g.fields[16].reachability).toBe('isolated');
  });
});
