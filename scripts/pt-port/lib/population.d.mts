// Type declarations for population.mjs (PT monster population readers,
// deterministic registry, and generated-module emitters).

export interface PtSpmActor {
  name: string;
  weight: number;
}

export interface PtSpmBoss {
  master: string;
  slave: string;
  slaveCount: number;
  hours: number[];
}

export interface PtSpmRecord {
  limitMax: number | null;
  delayShift: number | null;
  delayLockoutSec: number | null;
  openLimit: number | null;
  actors: PtSpmActor[];
  bosses: PtSpmBoss[];
  commentedActors: number;
  commentedBosses: number;
}

export function parseSpm(buf: Buffer): PtSpmRecord;
export function openIntervalMask(shift: number | null | undefined): number | null;

export interface PtSpawnAnchor {
  index: number;
  x: number;
  z: number;
}

export interface PtSppRecord {
  slots: number;
  anchors: PtSpawnAnchor[];
}

export function parseSpp(buf: Buffer): PtSppRecord;

export function countSpcRecords(buf: Buffer): { slots: number; live: number };

export interface PtInfRecord {
  name: string | null;
  model: string | null;
  group: [number, number] | null;
  level: number | null;
  kind: string | null;
  sound: string | null;
  activeTime: string | null;
}

export function parseInf(buf: Buffer): PtInfRecord;

export interface PtMonsterDef {
  key: string;
  name: string | null;
  inf: string;
  kind: string | null;
  model: string | null;
  modelDir: string | null;
  level: number | null;
  group: [number, number] | null;
  sound: string | null;
  activeTime: string | null;
  variant: 'base' | 'vip' | 'event';
  stem: string;
  asset: string | null;
  dieAsset: string | null;
}

export interface PtNameResolution {
  key: string;
  alternates: string[];
}

export interface PtMonsterRegistry {
  defs: PtMonsterDef[];
  nameResolution: Map<string, PtNameResolution>;
  byName: Map<string, PtMonsterDef[]>;
}

export function buildMonsterRegistry(
  monsterDir: string,
  opts?: { convertedDir?: string },
): PtMonsterRegistry;

export interface PtPopulationPaths {
  spm: string | null;
  spp: string | null;
  spc: string | null;
}

export function fieldPopulationPaths(aseStem: string): PtPopulationPaths;

export interface PtPopActor {
  index: number;
  name: string;
  weight: number;
  openStart: number | null;
  monster: string | null;
  unresolved: string | null;
}

export interface PtPopBossSide {
  name: string;
  key: string | null;
  unresolved: string | null;
}

export interface PtPopBoss {
  index: number;
  master: PtPopBossSide;
  slave: PtPopBossSide;
  slaveCount: number;
  hours: number[];
}

export interface PtFieldPopulation {
  fieldId: string;
  fieldIndex: number;
  aseStem: string;
  status: 'populated' | 'no-actors' | 'no-source';
  source: {
    spm: string | null;
    spp: string | null;
    spc: string | null;
    npcRecords: number | null;
  };
  limits: {
    limitMax: number | null;
    delayShift: number | null;
    delayLockoutSec: number | null;
    openIntervalMask: number | null;
    openLimit: number | null;
  } | null;
  pecetageCount: number;
  commentedActors: number;
  commentedBosses: number;
  actors: PtPopActor[];
  bosses: PtPopBoss[];
  spawnAnchors: PtSpawnAnchor[];
  sppSlots: number;
  unresolved: string[];
}

export function buildFieldPopulation(
  manifest: { id: string; fieldIndex: number; smdPath: string },
  registry: PtMonsterRegistry,
  opts?: { readFileSync?: (p: string) => Buffer },
): PtFieldPopulation;

export function emitPopulationModule(rec: PtFieldPopulation, sourceLabel: string): string;
export function emitRegistryModule(registry: PtMonsterRegistry): string;

export interface PtPopulationSummary {
  registry: {
    infFiles: number;
    uniqueNames: number;
    collisions: { name: string; canonical: string; alternates: string[] }[];
  };
  totals: {
    fields: number;
    populated: number;
    noActors: number;
    noSource: number;
    actors: number;
    bosses: number;
    anchors: number;
    npcRecords: number;
    unresolvedNames: string[];
  };
  fields: Record<
    string,
    {
      status: string;
      actors: number;
      bosses: number;
      anchors: number;
      npcRecords: number;
      unresolved: string[];
    }
  >;
}

export function buildPopulationSummary(
  records: PtFieldPopulation[],
  registry: PtMonsterRegistry,
): PtPopulationSummary;
