// PT monster population pipeline tests (Phase 6H-1, data pipeline only).
//
// Two layers:
//   - reader/registry tests against real MagicPT-Chinese server files
//     (guarded by hasPtServer - the generated outputs are committed, so the
//     suite still runs fully without the source checkout)
//   - generated-artifact tests over committed generated/pt-maps/*/
//     population.generated.ts + monster_registry.generated.ts +
//     population.json
//
// Asserted totals are the Phase 6G-A audit numbers - the test suite is the
// machine-checkable form of the audit coverage claims.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  buildFieldPopulation,
  buildMonsterRegistry,
  countSpcRecords,
  emitPopulationModule,
  openIntervalMask,
  parseInf,
  parseSpm,
  parseSpp,
} from '../scripts/pt-port/lib/population.mjs';
import { ptServerPath, ptServerExists } from '../scripts/pt-port/lib/pt_client.mjs';

const REPO_ROOT = resolve(__dirname, '..');
const hasPtServer = ptServerExists('GameServer/Field');
const hasMonsterDir = ptServerExists('GameServer/Monster');

interface PopModule {
  PT_FIELD_POPULATION: {
    fieldId: string;
    fieldIndex: number;
    status: string;
    limits: {
      limitMax: number | null;
      delayShift: number | null;
      delayLockoutSec: number | null;
      openIntervalMask: number | null;
      openLimit: number | null;
    } | null;
    pecetageCount: number;
    actors: {
      index: number;
      name: string;
      weight: number;
      openStart: number | null;
      monster: string | null;
      unresolved: string | null;
    }[];
    bosses: {
      index: number;
      master: { name: string; key: string | null; unresolved: string | null };
      slave: { name: string; key: string | null; unresolved: string | null };
      slaveCount: number;
      hours: number[];
    }[];
    spawnAnchors: { index: number; x: number; z: number }[];
    unresolved: string[];
  };
}

interface RegistryModule {
  PT_MONSTER_REGISTRY: {
    key: string;
    name: string | null;
    inf: string;
    model: string | null;
    level: number | null;
    group: [number, number] | null;
    variant: string;
    alternates?: string[];
    asset: string | null;
    dieAsset: string | null;
  }[];
  PT_MONSTER_BY_NAME: Record<string, { key: string; alternates: string[] }>;
}

const POP_MODULES = import.meta.glob<PopModule>(
  '../generated/pt-maps/*/population.generated.ts',
  { eager: true },
);
const REGISTRY_MODULES = import.meta.glob<RegistryModule>(
  '../generated/pt-maps/monster_registry.generated.ts',
  { eager: true },
);

const populations = Object.values(POP_MODULES).map((m) => m.PT_FIELD_POPULATION);
const popById = new Map(populations.map((p) => [p.fieldId, p]));
const registry = REGISTRY_MODULES['../generated/pt-maps/monster_registry.generated.ts'];

function loadSummary() {
  const p = resolve(REPO_ROOT, 'generated/pt-maps/population.json');
  return JSON.parse(readFileSync(p, 'utf8')) as {
    registry: { infFiles: number; uniqueNames: number; collisions: unknown[] };
    totals: Record<string, number>;
    fields: Record<string, { status: string; actors: number; bosses: number; anchors: number }>;
  };
}

// ---------------------------------------------------------------------------
// .spm reader
// ---------------------------------------------------------------------------

describe('pt population: .spm reader', () => {
  it('parses all five directives, skipping comments and matching the source tag table', () => {
    // English aliases here (ASCII fixture); the GB2312 Chinese tags are
    // exercised by the real-file test below.
    const spm = parseSpm(
      Buffer.from(
        [
          '//*ACTOR "IGNORED" 99',
          '*MAX_ACTOR_POS 200',
          '*DELAY 5 8',
          '*MAX_ACTOR 1',
          '*ACTOR "AAA" 35',
          '*ACTOR "BBB" 65',
          '*BOSS_ACTOR "BOSS" "SLAVE" 10 13 16 19 22',
        ].join('\n'),
        'utf8',
      ),
    );
    expect(spm.limitMax).toBe(200);
    expect(spm.delayShift).toBe(5);
    expect(spm.delayLockoutSec).toBe(8);
    expect(spm.openLimit).toBe(1);
    expect(spm.actors).toEqual([
      { name: 'AAA', weight: 35 },
      { name: 'BBB', weight: 65 },
    ]);
    expect(spm.bosses).toEqual([
      { master: 'BOSS', slave: 'SLAVE', slaveCount: 10, hours: [13, 16, 19, 22] },
    ]);
    expect(spm.commentedActors).toBe(1);
  });

  it('decodes GB2312 source names and preserves source order', () => {
    if (!hasPtServer) return;
    const spm = parseSpm(readFileSync(ptServerPath('GameServer/Field/fore-1.ase.spm')));
    expect(spm.actors[0].name).toBe('独角兽');
    expect(spm.actors.length).toBe(5);
    expect(spm.actors.map((a) => a.weight)).toEqual([35, 12, 20, 25, 8]);
    expect(spm.limitMax).toBe(200);
    expect(spm.delayShift).toBe(5);
    expect(spm.delayLockoutSec).toBe(8);
    expect(spm.openLimit).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// .spp reader
// ---------------------------------------------------------------------------

describe('pt population: .spp reader', () => {
  it('reads the 200-slot STG_START_POINT table and keeps slot identity', () => {
    const buf = Buffer.alloc(200 * 12);
    buf.writeInt32LE(1, 3 * 12); // slot 3: state=1
    buf.writeInt32LE(12345, 3 * 12 + 4);
    buf.writeInt32LE(-678, 3 * 12 + 8);
    const spp = parseSpp(buf);
    expect(spp.slots).toBe(200);
    expect(spp.anchors).toEqual([{ index: 3, x: 12345, z: -678 }]);
  });

  it('parses real fore-1 anchors (audit count: 53)', () => {
    if (!hasPtServer) return;
    const spp = parseSpp(readFileSync(ptServerPath('GameServer/Field/fore-1.ase.spp')));
    expect(spp.slots).toBe(200);
    expect(spp.anchors.length).toBe(53);
  });
});

// ---------------------------------------------------------------------------
// .inf reader + registry
// ---------------------------------------------------------------------------

describe('pt population: .inf reader', () => {
  it('parses GB2312 fields including the *名字 join key and *组织 group range', () => {
    if (!hasMonsterDir) return;
    const inf = parseInf(readFileSync(ptServerPath('GameServer/Monster/4_Hopy.inf')));
    expect(inf.name).toBe('独角兽');
    expect(inf.model).toMatch(/char\\monster\\Hopy\\Hopy\.INI/i);
    expect(inf.group).toEqual([2, 3]);
    expect(inf.level).toBe(4);
    expect(inf.kind).toBe('怪物');
  });
});

describe('pt population: deterministic registry', () => {
  it('registers every .inf with a stable key and resolves 32 name collisions deterministically', () => {
    if (!hasMonsterDir) return;
    const reg = buildMonsterRegistry(ptServerPath('GameServer/Monster'));
    expect(reg.defs.length).toBe(411);
    expect(new Set(reg.defs.map((d) => d.key)).size).toBe(411);
    const collisions = [...reg.nameResolution.values()].filter((r) => r.alternates.length > 0);
    expect(collisions.length).toBe(32);
    // Canonical pick: lowest variant rank, then lowest level. The Kelvezu
    // name has three boss tiers; 155 is the base canonical.
    expect(reg.nameResolution.get('凯尔维苏')!.key).toBe('boss_155_kelvezu');
    expect(reg.nameResolution.get('凯尔维苏')!.alternates).toEqual([
      'boss_165_kelvezu',
      'boss_190_kelvezu',
    ]);
    // VIP variants lose to the base def when both exist.
    expect(reg.nameResolution.get('冰霜木乃伊')!.key).toBe('xd4_151_royalmummy');
  });

  it('does not depend on filesystem enumeration order', () => {
    if (!hasMonsterDir) return;
    const a = buildMonsterRegistry(ptServerPath('GameServer/Monster'));
    const b = buildMonsterRegistry(ptServerPath('GameServer/Monster'));
    expect(JSON.stringify([...a.nameResolution.entries()].sort())).toBe(
      JSON.stringify([...b.nameResolution.entries()].sort()),
    );
  });
});

// ---------------------------------------------------------------------------
// Generated schema + coverage (committed artifacts)
// ---------------------------------------------------------------------------

describe('pt population: generated artifacts', () => {
  it('emits a population module for every active field (70)', () => {
    expect(populations.length).toBe(70);
  });

  it('preserves source semantics verbatim: raw shift, per-anchor cap, cumulative openStart', () => {
    const fore1 = popById.get('fore-1')!;
    expect(fore1.limits!.delayShift).toBe(5);
    expect(fore1.limits!.openIntervalMask).toBe(31); // (1<<5)-1, the raw mask
    expect(fore1.limits!.delayLockoutSec).toBe(8); // source seconds, NOT ms
    expect(fore1.limits!.openLimit).toBe(1); // *数量 per-anchor cap
    expect(fore1.limits!.limitMax).toBe(200); // *怪物总数 field cap
    const starts = fore1.actors.map((a) => a.openStart);
    expect(starts).toEqual([0, 35, 47, 67, 92]);
    expect(fore1.pecetageCount).toBe(100);
  });

  it('keeps boss records separate from regular actors with source hours intact', () => {
    const sanc2 = popById.get('sanc2')!;
    expect(sanc2.actors.length).toBe(3);
    expect(sanc2.bosses.length).toBe(1);
    expect(sanc2.bosses[0].master.name).toBe('凯尔维苏');
    expect(sanc2.bosses[0].master.key).toBe('boss_155_kelvezu');
    expect(sanc2.bosses[0].slave.key).toBe('c_150_web');
    expect(sanc2.bosses[0].slaveCount).toBe(10);
    expect(sanc2.bosses[0].hours).toEqual([13, 16, 19, 22]);
  });

  it('preserves raw PT spawn-anchor coordinates (map units, no transform applied)', () => {
    const fore1 = popById.get('fore-1')!;
    expect(fore1.spawnAnchors.length).toBe(53);
    for (const a of fore1.spawnAnchors) {
      expect(Number.isInteger(a.x)).toBe(true);
      expect(Number.isInteger(a.z)).toBe(true);
      // PT map-unit magnitudes (not WoC yards, not x256 fixed point).
      expect(Math.abs(a.x)).toBeLessThan(200000);
      expect(Math.abs(a.z)).toBeLessThan(200000);
    }
  });

  it('represents the unresolved mine-1 reference explicitly', () => {
    const mine1 = popById.get('mine-1')!;
    const bad = mine1.actors.find((a) => a.name === '矿山开采者')!;
    expect(bad.monster).toBeNull();
    expect(bad.unresolved).toBe('no-inf');
    expect(bad.openStart).toBeNull(); // server drops its weight
    expect(mine1.unresolved).toEqual(['矿山开采者']);
    // Its authored weight is still preserved on the record.
    expect(bad.weight).toBe(20);
  });

  it('distinguishes source-empty fields from actor-less fields and populated fields', () => {
    expect(popById.get('ricarten')!.status).toBe('no-actors');
    expect(popById.get('quest-iv')!.status).toBe('no-actors');
    for (const id of ['office', 'pilai', 'ice-ura', 'castle', 'fall-game', 'town1', 'dc1']) {
      expect(popById.get(id)!.status).toBe('no-source');
      expect(popById.get(id)!.limits).toBeNull();
    }
  });

  it('matches the audit coverage totals in population.json', () => {
    const s = loadSummary();
    expect(s.totals.fields).toBe(70);
    expect(s.totals.populated).toBe(61);
    expect(s.totals.noActors).toBe(2);
    expect(s.totals.noSource).toBe(7);
    expect(s.totals.actors).toBe(331);
    expect(s.totals.bosses).toBe(17);
    expect(s.totals.anchors).toBe(4936);
    expect(s.totals.npcRecords).toBe(153);
    expect(s.totals.unresolvedNames).toEqual(['矿山开采者']);
    expect(s.registry.infFiles).toBe(411);
    expect(s.registry.uniqueNames).toBe(378);
    expect(s.registry.collisions.length).toBe(32);
  });

  it('resolves 247 of 248 referenced names to a registry entry with a converted GLB', () => {
    const reg = registry!;
    const byKey = new Map(reg.PT_MONSTER_REGISTRY.map((d) => [d.key, d]));
    let referenced = 0;
    let resolved = 0;
    const missingAsset: string[] = [];
    for (const p of populations) {
      for (const a of p.actors) {
        referenced++;
        if (!a.monster) continue;
        resolved++;
        const def = byKey.get(a.monster);
        expect(def, `actor ${a.name} -> ${a.monster}`).toBeDefined();
        if (!def!.asset) missingAsset.push(`${a.name}:${a.monster}`);
      }
      for (const b of p.bosses) {
        for (const side of [b.master, b.slave]) {
          if (!side.key) continue;
          const def = byKey.get(side.key);
          expect(def, `boss ${side.name} -> ${side.key}`).toBeDefined();
        }
      }
    }
    expect(resolved).toBe(330); // 331 actor records - 1 unresolved
    expect(missingAsset).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('pt population: deterministic generation', () => {
  it('emits byte-identical module text across repeated compiles', () => {
    if (!hasPtServer || !hasMonsterDir) return;
    const reg = buildMonsterRegistry(ptServerPath('GameServer/Monster'));
    const manifest = { id: 'fore-1', fieldIndex: 2, smdPath: 'Field/forest/fore-1.smd' };
    const r1 = buildFieldPopulation(manifest, reg);
    const r2 = buildFieldPopulation(manifest, reg);
    expect(emitPopulationModule(r1, 'test')).toBe(emitPopulationModule(r2, 'test'));
    // The committed artifact matches a fresh compile of the same source.
    const disk = readFileSync(
      resolve(REPO_ROOT, 'generated/pt-maps/fore-1/population.generated.ts'),
      'utf8',
    );
    const fresh = emitPopulationModule(
      r1,
      'server/GameServer/Field/fore-1.ase.spm | server/GameServer/Field/fore-1.ase.spp',
    );
    expect(disk).toBe(fresh);
  });
});

// ---------------------------------------------------------------------------
// .spc counter (provenance only)
// ---------------------------------------------------------------------------

describe('pt population: .spc counter', () => {
  it('counts live fixed-NPC records', () => {
    const buf = Buffer.alloc(100 * 504);
    buf.writeInt32LE(7, 0 * 504 + 4); // slot 0 live
    buf.writeInt32LE(7, 12 * 504 + 4); // slot 12 live
    expect(countSpcRecords(buf)).toEqual({ slots: 100, live: 2 });
  });

  it('reports the ricarten NPC count (48)', () => {
    if (!hasPtServer) return;
    const spc = countSpcRecords(readFileSync(ptServerPath('GameServer/Field/village-2.ase.spc')));
    expect(spc.live).toBe(48);
  });
});

// ---------------------------------------------------------------------------
// Semantic guards (raw-value preservation)
// ---------------------------------------------------------------------------

describe('pt population: semantic preservation', () => {
  it('openIntervalMask derives the source tick mask without inventing seconds', () => {
    expect(openIntervalMask(5)).toBe(31);
    expect(openIntervalMask(8)).toBe(255);
    expect(openIntervalMask(0)).toBe(1);
    expect(openIntervalMask(1)).toBe(1);
    expect(openIntervalMask(null)).toBeNull();
  });

  it('sod-1 keeps its unusual *DELAY 8 35 verbatim', () => {
    const sod1 = popById.get('sod-1')!;
    expect(sod1.limits!.delayShift).toBe(8);
    expect(sod1.limits!.delayLockoutSec).toBe(35);
    expect(sod1.limits!.openIntervalMask).toBe(255);
  });
});
