// Phase 6H-2 runtime tests: the field-owned ordinary monster population
// scheduler (src/sim/pt_population.ts) over real generated population data
// and real generated field packages.
//
// Semantics under test (SrcServer/OnSever.cpp):
//   - only the ACTIVE field owns entities; a standby visual field never spawns
//   - anchors activate on player proximity (DIST_TRANSLEVEL_CONNECT)
//   - OpenLimit gates anchor eligibility; a rolled group lands whole
//   - (Counter & OpenIntervalMask) == 0 cadence + per-anchor lockout seconds
//   - ~14.6s player absence despawns an anchor's group
//   - no floor under an anchor quarantines it with a diagnostic
//   - unresolved .inf names and boss records never spawn
//   - same seed + same player path gives identical spawn results

import { afterEach, describe, expect, it } from 'vitest';
import { PT_FIELD_POPULATION as ANCIENTW_POP } from '../generated/pt-maps/ancientw/population.generated';
import { PT_FIELD_POPULATION as FORE1_POP } from '../generated/pt-maps/fore-1/population.generated';
import { PT_FIELD_POPULATION as SEAA_POP } from '../generated/pt-maps/seaa/population.generated';
import { loadPtDevMap } from '../src/game/pt_dev_maps';
import '../src/game/pt_population_data';
import { PT_POPULATION_TABLE } from '../src/game/pt_population_data';
import { MOBS } from '../src/sim/data';
import {
  activeOwnedPtField,
  activePtMapDescriptor,
  setActivePtMap,
  setStandbyPtMap,
  standbyPtMapDescriptor,
} from '../src/sim/pt_field_active';
import {
  type PtPopulationModule,
  type PtSpawnAnchor,
  ptPopulationDiagnostics,
  registerPtPopulations,
} from '../src/sim/pt_population';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

const SEED = 4242;
const makeSim = () => new Sim({ seed: SEED, playerClass: 'warrior' });

/** Spawned mobs aggro on the observer; keep the player unkillable so the
 *  population under observation, not combat outcome, decides the result. */
const tankPlayer = (sim: Sim): void => {
  sim.player.hp = 1e9;
};

/** First anchor with a real floor under it, or the list head. */
function flooredAnchor(
  xf: { ptXToWoC(v: number): number; ptZToWoC(v: number): number },
  anchors: readonly PtSpawnAnchor[],
  startIdx = 0,
): PtSpawnAnchor {
  const field = activeOwnedPtField();
  if (field) {
    for (const a of anchors.slice(startIdx)) {
      if (Number.isFinite(field.supportHeight(xf.ptXToWoC(a.x), xf.ptZToWoC(a.z), 0, Infinity))) {
        return a;
      }
    }
  }
  return anchors[startIdx] ?? anchors[0];
}

const ptMobs = (sim: Sim): Entity[] =>
  [...sim.entities.values()].filter((e) => e.ptFieldAnchor !== undefined);
const livePtMobs = (sim: Sim): Entity[] => ptMobs(sim).filter((e) => !e.dead);

/** Put the player at a PT anchor's xz (near-play radius). */
function standAt(
  sim: Sim,
  xf: { ptXToWoC(v: number): number; ptZToWoC(v: number): number },
  a: PtSpawnAnchor,
): void {
  sim.player.pos.x = xf.ptXToWoC(a.x);
  sim.player.pos.z = xf.ptZToWoC(a.z);
  const y = activeOwnedPtField()?.groundHeight(sim.player.pos.x, sim.player.pos.z);
  if (y !== undefined && Number.isFinite(y)) sim.player.pos.y = y;
}

const runTicks = (sim: Sim, seconds: number): void => {
  const n = Math.round(seconds * 20);
  for (let i = 0; i < n; i++) sim.tick();
};

const farthestAnchorFrom = (
  anchors: readonly PtSpawnAnchor[],
  from: PtSpawnAnchor,
): PtSpawnAnchor =>
  anchors.reduce((best, a) =>
    Math.hypot(a.x - from.x, a.z - from.z) > Math.hypot(best.x - from.x, best.z - from.z)
      ? a
      : best,
  );

afterEach(() => {
  setActivePtMap(null);
  setStandbyPtMap(null);
  registerPtPopulations(PT_POPULATION_TABLE);
});

describe('PT field population', () => {
  it('spawns nothing while the player is far from every anchor', async () => {
    const f1 = await loadPtDevMap('fore-1');
    setActivePtMap(f1.descriptor);
    const sim = makeSim();
    // Player stays in Eastbrook: kilometers from the PT band.
    runTicks(sim, 6);
    expect(ptMobs(sim)).toHaveLength(0);
  });

  it('populates anchors near the player and stamps ownership', async () => {
    const f1 = await loadPtDevMap('fore-1');
    setActivePtMap(f1.descriptor);
    const sim = makeSim();
    tankPlayer(sim);
    standAt(sim, f1.descriptor.transform, FORE1_POP.spawnAnchors[0]);
    runTicks(sim, 12);
    const owned = livePtMobs(sim);
    expect(owned.length).toBeGreaterThan(0);
    for (const e of owned) {
      expect(e.ptFieldAnchor!.fieldId).toBe('fore-1');
      expect(e.templateId.startsWith('pt_')).toBe(true);
      expect(MOBS[e.templateId]).toBeDefined();
      expect(Number.isFinite(e.pos.y)).toBe(true);
    }
  });

  it('keeps anchor occupancy inside the authored cap semantics', async () => {
    const f1 = await loadPtDevMap('fore-1');
    setActivePtMap(f1.descriptor);
    const sim = makeSim();
    tankPlayer(sim);
    standAt(
      sim,
      f1.descriptor.transform,
      flooredAnchor(f1.descriptor.transform, FORE1_POP.spawnAnchors, 10),
    );
    runTicks(sim, 60);
    const owned = livePtMobs(sim);
    expect(owned.length).toBeGreaterThan(0);
    const openLimit = FORE1_POP.limits!.openLimit!;
    const maxGroup = Math.max(
      ...FORE1_POP.actors.map((ac) => (ac.monster ? (MOBS[`pt_${ac.monster}`]?.groupMax ?? 1) : 1)),
    );
    // openLimit gates a new spawn while alive >= openLimit; a rolled group
    // lands whole, so the observable bound is openLimit-1 + maxGroup.
    const byAnchor = new Map<number, number>();
    for (const e of owned) {
      const k = e.ptFieldAnchor!.anchorIndex;
      byAnchor.set(k, (byAnchor.get(k) ?? 0) + 1);
    }
    for (const [idx, count] of byAnchor) {
      expect(count, `anchor ${idx}`).toBeLessThanOrEqual(openLimit - 1 + maxGroup);
    }
  });

  it('spawns rolled groups on the source ring around the anchor', async () => {
    const f1 = await loadPtDevMap('fore-1');
    setActivePtMap(f1.descriptor);
    const sim = makeSim();
    tankPlayer(sim);
    const a0 = flooredAnchor(f1.descriptor.transform, FORE1_POP.spawnAnchors, 0);
    standAt(sim, f1.descriptor.transform, a0);
    runTicks(sim, 40);
    const owned = ptMobs(sim);
    expect(owned.length).toBeGreaterThan(1);
    // Members spawn on the +-96 map-unit ring around the anchor (3.46 yd on
    // the axes, 96*sqrt(2)*0.036 ~= 4.89 yd on the diagonals); spawnPos is the
    // pinned home, e.pos may have wandered since.
    for (const e of owned) {
      const a = FORE1_POP.spawnAnchors.find((s) => s.index === e.ptFieldAnchor!.anchorIndex)!;
      const ax = f1.descriptor.transform.ptXToWoC(a.x);
      const az = f1.descriptor.transform.ptZToWoC(a.z);
      expect(Math.hypot(e.spawnPos.x - ax, e.spawnPos.z - az)).toBeLessThan(5.0);
    }
  });

  it('never spawns on the standby field and never promotes it via probes', async () => {
    const f1 = await loadPtDevMap('fore-1');
    const f2 = await loadPtDevMap('fore-2');
    setActivePtMap(f1.descriptor);
    setStandbyPtMap(f2.descriptor);
    expect(standbyPtMapDescriptor()?.id).toBe('fore-2');
    const sim = makeSim();
    tankPlayer(sim);
    standAt(sim, f1.descriptor.transform, FORE1_POP.spawnAnchors[0]);
    runTicks(sim, 15);
    const owned = ptMobs(sim);
    expect(owned.length).toBeGreaterThan(0);
    expect(owned.every((e) => e.ptFieldAnchor!.fieldId === 'fore-1')).toBe(true);
    expect(activePtMapDescriptor()?.id).toBe('fore-1');
  });

  it('drops the previous field population when ownership moves', async () => {
    const f1 = await loadPtDevMap('fore-1');
    const f2 = await loadPtDevMap('fore-2');
    setActivePtMap(f1.descriptor);
    const sim = makeSim();
    tankPlayer(sim);
    standAt(sim, f1.descriptor.transform, FORE1_POP.spawnAnchors[0]);
    runTicks(sim, 15);
    const before = ptMobs(sim);
    expect(before.length).toBeGreaterThan(0);
    const ids = new Set(before.map((e) => e.id));

    setActivePtMap(f2.descriptor);
    runTicks(sim, 2);
    expect(ptMobs(sim).filter((e) => ids.has(e.id))).toHaveLength(0);
    const diag = ptPopulationDiagnostics(sim.ctx);
    expect(diag.despawnedFieldChange).toBeGreaterThan(0);
  });

  it('despawns an absent anchor group after the source absence window', async () => {
    const f1 = await loadPtDevMap('fore-1');
    setActivePtMap(f1.descriptor);
    const sim = makeSim();
    tankPlayer(sim);
    const home = flooredAnchor(f1.descriptor.transform, FORE1_POP.spawnAnchors, 0);
    standAt(sim, f1.descriptor.transform, home);
    runTicks(sim, 15);
    expect(livePtMobs(sim).length).toBeGreaterThan(0);

    // Walk far away inside the same field (the field stays active/owned).
    const far = farthestAnchorFrom(FORE1_POP.spawnAnchors, home);
    standAt(sim, f1.descriptor.transform, far);
    runTicks(sim, 8);
    const stillThere = livePtMobs(sim).some((e) => e.ptFieldAnchor!.anchorIndex === home.index);
    expect(stillThere).toBe(true);
    runTicks(sim, 10);
    const gone = livePtMobs(sim).filter((e) => e.ptFieldAnchor!.anchorIndex === home.index);
    expect(gone).toHaveLength(0);
    expect(ptPopulationDiagnostics(sim.ctx).despawnedAbsence).toBeGreaterThan(0);
  });

  it('quarantines a no-floor anchor and keeps spawning healthy ones', async () => {
    // Real no-floor coverage: probe seaa and ancientw anchors on their real
    // fields and confirm at least one anchor cannot produce a floor.
    let quarantinedReal = 0;
    for (const [fieldId, pop] of [
      ['seaa', SEAA_POP],
      ['ancientw', ANCIENTW_POP],
    ] as const) {
      const loaded = await loadPtDevMap(fieldId);
      setActivePtMap(loaded.descriptor);
      const field = activeOwnedPtField()!;
      for (const a of pop.spawnAnchors) {
        const x = loaded.descriptor.transform.ptXToWoC(a.x);
        const z = loaded.descriptor.transform.ptZToWoC(a.z);
        if (field.supportHeight(x, z, 0, Infinity) === -Infinity) quarantinedReal++;
      }
    }
    // If a real anchor is no-floor the runtime quarantines it; if the
    // generated fields happen to be fully floored the synthetic case below
    // still pins the contract.
    if (quarantinedReal > 0) {
      const loaded = await loadPtDevMap('seaa');
      setActivePtMap(loaded.descriptor);
      const field = activeOwnedPtField()!;
      const bad = SEAA_POP.spawnAnchors.find(
        (a) =>
          field.supportHeight(
            loaded.descriptor.transform.ptXToWoC(a.x),
            loaded.descriptor.transform.ptZToWoC(a.z),
            0,
            Infinity,
          ) === -Infinity,
      );
      if (bad) {
        const sim = makeSim();
        standAt(sim, loaded.descriptor.transform, bad);
        runTicks(sim, 15);
        const diag = ptPopulationDiagnostics(sim.ctx);
        expect(diag.quarantinedAnchors.some((q) => q.endsWith(`${bad.index}:no-floor`))).toBe(true);
        expect(ptMobs(sim).some((e) => e.ptFieldAnchor!.anchorIndex === bad.index)).toBe(false);
      }
    }

    // Synthetic pin: a fore-1 module whose only anchor sits off the mesh.
    const off: PtPopulationModule = {
      ...FORE1_POP,
      status: 'populated',
      spawnAnchors: [{ index: 0, x: -999_000, z: -999_000 }],
      limits: { ...FORE1_POP.limits!, delayLockoutSec: 0, openIntervalMask: 0 },
    };
    const f1 = await loadPtDevMap('fore-1');
    setActivePtMap(f1.descriptor);
    registerPtPopulations(new Map([['fore-1', off]]));
    const sim = makeSim();
    tankPlayer(sim);
    standAt(sim, f1.descriptor.transform, off.spawnAnchors[0]);
    runTicks(sim, 8);
    const diag = ptPopulationDiagnostics(sim.ctx);
    expect(diag.quarantinedAnchors).toContain('fore-1:0:no-floor');
    expect(ptMobs(sim)).toHaveLength(0);
  });

  it('never spawns unresolved or boss records', async () => {
    // mine-1 references 矿山开采者 with no .inf: it must never spawn, and
    // resolved actors still populate.
    const mine = await loadPtDevMap('mine-1');
    const minePop = PT_POPULATION_TABLE.get('mine-1')!;
    setActivePtMap(mine.descriptor);
    const sim = makeSim();
    tankPlayer(sim);
    standAt(sim, mine.descriptor.transform, minePop.spawnAnchors[0]);
    runTicks(sim, 15);
    const resolved = new Set(minePop.actors.filter((a) => a.monster).map((a) => `pt_${a.monster}`));
    const spawnedIds = new Set(ptMobs(sim).map((e) => e.templateId));
    for (const id of spawnedIds) expect(resolved.has(id)).toBe(true);

    // forever-fall-01 carries a live boss record; neither master nor slave
    // may enter the ordinary scheduler.
    const ff = await loadPtDevMap('forever-fall-01');
    const ffPop = PT_POPULATION_TABLE.get('forever-fall-01')!;
    setActivePtMap(ff.descriptor);
    const sim2 = makeSim();
    tankPlayer(sim2);
    standAt(
      sim2,
      ff.descriptor.transform,
      flooredAnchor(ff.descriptor.transform, ffPop.spawnAnchors, 0),
    );
    runTicks(sim2, 20);
    const ids = new Set(ptMobs(sim2).map((e) => e.templateId));
    expect(ids.has('pt_boss_135_death_knight')).toBe(false);
    expect(ids.has('pt_86_kinghopy')).toBe(false);
    // Ordinary actors do populate.
    const ffResolved = new Set(ffPop.actors.filter((a) => a.monster).map((a) => `pt_${a.monster}`));
    for (const id of ids) expect(ffResolved.has(id)).toBe(true);
    expect(ids.size).toBeGreaterThan(0);
  });

  it('is deterministic across identical runs', async () => {
    const run = async () => {
      const f1 = await loadPtDevMap('fore-1');
      setActivePtMap(f1.descriptor);
      const sim = makeSim();
      tankPlayer(sim);
      standAt(
        sim,
        f1.descriptor.transform,
        flooredAnchor(f1.descriptor.transform, FORE1_POP.spawnAnchors, 0),
      );
      runTicks(sim, 25);
      return ptMobs(sim)
        .map(
          (e) =>
            `${e.templateId}@${e.ptFieldAnchor!.anchorIndex}:` +
            `${e.pos.x.toFixed(4)},${e.pos.y.toFixed(4)},${e.pos.z.toFixed(4)}`,
        )
        .sort();
    };
    const a = await run();
    const b = await run();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('leaves the hand-placed pt_hopy/pt_bargon camps untouched', async () => {
    const f1 = await loadPtDevMap('fore-1');
    setActivePtMap(f1.descriptor);
    const sim = makeSim();
    // Camp mobs exist independent of the PT scheduler and carry no anchor tag.
    runTicks(sim, 3);
    const camps = [...sim.entities.values()].filter(
      (e) => e.templateId === 'pt_hopy' || e.templateId === 'pt_bargon',
    );
    expect(camps.length).toBeGreaterThan(0);
    expect(camps.every((e) => e.ptFieldAnchor === undefined)).toBe(true);
    // Field population still runs alongside them without touching them.
    tankPlayer(sim);
    standAt(
      sim,
      f1.descriptor.transform,
      flooredAnchor(f1.descriptor.transform, FORE1_POP.spawnAnchors, 0),
    );
    runTicks(sim, 12);
    expect(livePtMobs(sim).length).toBeGreaterThan(0);
    expect(
      [...sim.entities.values()].some(
        (e) => e.templateId === 'pt_hopy' && e.ptFieldAnchor === undefined,
      ),
    ).toBe(true);
  });
});
