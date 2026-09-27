// Shared PT world connection graph: the host-agnostic half of what used to
// live only in src/game/pt_map_links.ts (the client-side index over
// generated/pt-maps/maplinks.json).
//
// Why it exists: online field transitions (phase O2) need the SAME authored
// gate data on the realm - which field a boundary edge connects, where a
// WarpGate trigger cylinder sits, which WarpOut exits are legal, and each
// field's SMD bounds for identity/transform derivation. The generated JSON
// is the single authenticated source; each host injects it once at boot:
//   - browser/dev: src/game/pt_map_links.ts (import.meta.glob)
//   - realm:       server/pt_map_links.ts (fs read)
// Tests register the same JSON directly.
//
// PURITY: no DOM, no import.meta, no loaders, no renderer, no mutable world
// state beyond the registered graph reference. Everything below is data +
// pure resolution so src/sim's host-agnostic contract holds.

import {
  makePtBandTransform,
  makePtContinentTransform,
  ptFieldFitsContinent,
  type PtBounds,
  type PtFieldTransform,
} from './pt_field';

// ---------------------------------------------------------------------------
// Data shape (structurally identical to generated/pt-maps/maplinks.json)
// ---------------------------------------------------------------------------

export interface PtGraphField {
  fieldIndex: number;
  id: string | null;
  mapName: string | null;
  displayName: string | null;
  asePath: string;
  state: string | null;
  limitLevel: number;
  centerPos: [number, number] | null;
  startPoints: [number, number][];
  posWarpOut: { x: number; y: number; z: number } | null;
  /** Authored SMD footprint, PT units (emitted by map_links.mjs). */
  bounds: PtBounds | null;
  component: number;
  reachability: 'foot' | 'warp' | 'ui-item' | 'server' | 'isolated';
  sea?: {
    edges: {
      edge: 'minX' | 'maxX' | 'minZ' | 'maxZ';
      from: number;
      to: number;
      reach: number;
      level: number;
      materialIndex: number;
      uScale: number;
      vScale: number;
    }[];
  } | null;
}

export interface PtGraphGateEdge {
  from: number;
  to: number;
  fromId: string | null;
  toId: string | null;
  x: number;
  z: number;
  y: number;
  bidirectional: true;
  authoredIn: number;
  dead?: boolean;
}

export interface PtGraphWarpExit {
  to: number;
  toId: string | null;
  x: number;
  z: number;
  y: number;
}

export interface PtGraphWarpGate {
  field: number;
  fieldId: string | null;
  x: number;
  z: number;
  y: number;
  size: number;
  height: number;
  limitLevel: number;
  /** Source SpecialEffect: 0 immediate, 1 delayed, 2 wing-selection UI. */
  specialEffect: number;
  exits: PtGraphWarpExit[];
}

export interface PtGraphWingWarp {
  destinations: {
    icon: number;
    fieldIndex: number;
    fieldId: string | null;
    name: string | null;
    doc: string | null;
    iconPos: [number, number] | null;
    requiredLevel: number;
  }[];
  haGate: {
    fieldIndex: number | null;
    fieldId: string | null;
    name: string | null;
    doc: string | null;
    iconPos: [number, number] | null;
    requiresBlessCastleClan: boolean;
  };
  costs: number[];
  tiers: { item: string; unlockCount: number }[];
  defaultUnlock: number;
  rules: {
    freeIconsBelow: number;
    paidWhenUnlockAtLeast: number;
    costIndexBase: number;
    sameAreaFree: boolean;
    levelGate: string;
    arrival: string;
    trigger: string;
  };
}

export interface PtGraphNpcTeleport {
  destinations: {
    select: number;
    fieldIndex: number;
    fieldId: string | null;
    cost: number | null;
    levelGateField: number | null;
  }[];
  arrival: string;
  costIncludesSiegeTax: boolean;
  dungeonTeleport: { fieldIndex: number };
  castleTeleport: { fieldIndex: number };
  warTeleport: { fieldIndex: number; server: boolean };
  fallGame: { fieldIndex: number };
  jobChangeReturn: { tempskron: number; morion: number };
}

export interface PtGraphServerTransition {
  kind: string;
  fieldIndex: number | null;
  fieldId: string | null;
  x?: number;
  z?: number;
  source: string;
}

export interface PtMapGraphData {
  generatedFrom: string[];
  fieldCount: number;
  startFields: Record<string, number>;
  fields: PtGraphField[];
  fieldGates: PtGraphGateEdge[];
  warpGates: PtGraphWarpGate[];
  wingWarp: PtGraphWingWarp;
  npcTeleport: PtGraphNpcTeleport;
  teleportCore: { select: number; fieldIndex: number; fieldId: string | null; level: number }[];
  etherCore: { item: string; fieldIndex: number; fieldId: string | null; startFieldDefine: string }[];
  serverTransitions: PtGraphServerTransition[];
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let _graph: PtMapGraphData | null = null;

/**
 * Install the generated connection graph for this host. Idempotent per
 * object identity (both the Vite glob and the server fs read produce a
 * stable reference); a fresh object replaces the registry, which tests use
 * to inject fixtures.
 */
export function registerPtMapGraph(data: PtMapGraphData | null): void {
  _graph = data;
}

/** The registered graph, or null on a host that never injected it. */
export function ptMapGraph(): PtMapGraphData | null {
  return _graph;
}

// ---------------------------------------------------------------------------
// Field lookup + transforms
// ---------------------------------------------------------------------------

/** Field record by package id, mapName, or fieldIndex. */
export function ptGraphField(ref: number | string): PtGraphField | null {
  const g = _graph;
  if (!g) return null;
  if (typeof ref === 'number') return g.fields.find((f) => f.fieldIndex === ref) ?? null;
  return g.fields.find((f) => f.id === ref || f.mapName === ref) ?? null;
}

/**
 * The WoC<->PT transform one field's data lives under. The rule is the same
 * one the client package loader applies (loadPtDevMap): fields whose authored
 * bounds land inside the PT band share the Ricarten-anchored continent frame
 * so their FieldGate seams tile; everything else (warp-only islands like dc1)
 * gets the per-map band placement. Null when the field has no bounds.
 */
export function ptGraphFieldTransform(ref: number | string): PtFieldTransform | null {
  const f = ptGraphField(ref);
  if (!f || !f.bounds) return null;
  return ptFieldFitsContinent(f.bounds)
    ? makePtContinentTransform()
    : makePtBandTransform(f.bounds);
}

export interface PtWocBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The field's footprint in WoC coordinates under its own transform. */
export function ptGraphWocBounds(ref: number | string): PtWocBounds | null {
  const f = ptGraphField(ref);
  const t = ptGraphFieldTransform(ref);
  if (!f || !f.bounds || !t) return null;
  const b = f.bounds;
  // PT +X mirrors to WoC -X, so the WoC X range runs maxX -> minX.
  return {
    minX: t.ptXToWoC(b.maxX),
    maxX: t.ptXToWoC(b.minX),
    minZ: t.ptZToWoC(b.minZ),
    maxZ: t.ptZToWoC(b.maxZ),
  };
}

/** Whether `fieldId`'s WoC footprint claims (x, z). */
export function ptFieldClaimsWocPos(fieldId: string, wocX: number, wocZ: number): boolean {
  const wb = ptGraphWocBounds(fieldId);
  return (
    wb !== null && wocX >= wb.minX && wocX <= wb.maxX && wocZ >= wb.minZ && wocZ <= wb.maxZ
  );
}

// ---------------------------------------------------------------------------
// FieldGate edges
// ---------------------------------------------------------------------------

/** One boundary edge as seen from `fieldId` (the other end + gate point). */
export interface PtGraphGateOut {
  other: number;
  otherId: string | null;
  x: number;
  z: number;
  y: number;
  authoredIn: number;
  dead: boolean;
}

/** Undirected FieldGate edges touching a field (either direction). */
export function ptGraphFieldGatesOf(fieldId: string): PtGraphGateOut[] {
  const g = _graph;
  if (!g) return [];
  const f = ptGraphField(fieldId);
  if (!f) return [];
  const fi = f.fieldIndex;
  return g.fieldGates
    .filter((e) => e.from === fi || e.to === fi)
    .map((e) => ({
      other: e.from === fi ? e.to : e.from,
      otherId: e.from === fi ? e.toId : e.fromId,
      x: e.x,
      z: e.z,
      y: e.y,
      authoredIn: e.authoredIn,
      dead: e.dead ?? false,
    }));
}

/**
 * The live (non-dead) edge connecting two fields, or null. FieldGate
 * validation is connectivity-based: the realm only accepts a crossing
 * between fields the authored graph actually joins.
 */
export function ptGateEdgeBetween(aId: string, bId: string): PtGraphGateEdge | null {
  const g = _graph;
  if (!g) return null;
  const a = ptGraphField(aId);
  const b = ptGraphField(bId);
  if (!a || !b) return null;
  return (
    g.fieldGates.find(
      (e) =>
        !e.dead &&
        ((e.from === a.fieldIndex && e.to === b.fieldIndex) ||
          (e.from === b.fieldIndex && e.to === a.fieldIndex)),
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// WarpGates
// ---------------------------------------------------------------------------

/** WarpGate trigger records physically inside a field. */
export function ptGraphWarpGatesOf(fieldId: string): PtGraphWarpGate[] {
  const g = _graph;
  if (!g) return [];
  const f = ptGraphField(fieldId);
  if (!f) return [];
  return g.warpGates.filter((w) => w.field === f.fieldIndex);
}

// The CheckWarpGate cylinder bounds, verbatim (src/game/pt_warp_gates.ts
// delegates to the shared predicate below).
/** Per-axis trigger bound, PT units (|dx|,|dz| < 1024). */
export const PT_WARP_AXIS_LIMIT = 1024;

/**
 * The minimal trigger-cylinder shape. The graph's PtGraphWarpGate and the
 * descriptor's PtWarpGateLink both satisfy it, so ONE predicate serves the
 * client (descriptor data), the realm (graph records), and tests.
 */
export interface PtWarpTriggerLike {
  x: number;
  z: number;
  y: number;
  size: number;
  height: number;
  limitLevel: number;
  exits: readonly unknown[];
}

/**
 * The authored trigger cylinder test (sFIELD::CheckWarpGate). `ptX/ptY/ptZ`
 * are the player's position in the OWNING field's PT frame; `level` is the
 * player level for the LimitLevel gate. First match wins, in authored order
 * - matching the source loop.
 */
export function ptWarpTriggerIn<T extends PtWarpTriggerLike>(
  gates: readonly T[],
  ptX: number,
  ptY: number,
  ptZ: number,
  level: number,
): T | null {
  for (const g of gates) {
    const dx = Math.floor(g.x - ptX);
    const dz = Math.floor(g.z - ptZ);
    // Source: gate.y == 0 disables the height check (dy = 0).
    const dy = g.y === 0 ? 0 : Math.abs(ptY - g.y);
    const dist = dx * dx + dz * dz;
    if (
      g.limitLevel <= level &&
      g.exits.length > 0 &&
      Math.abs(dx) < PT_WARP_AXIS_LIMIT &&
      Math.abs(dz) < PT_WARP_AXIS_LIMIT &&
      dist < g.size * g.size &&
      dy < g.height
    ) {
      return g;
    }
  }
  return null;
}

/**
 * Pick a WarpOut exit. `rand` is a [0,1) draw supplied by the caller so the
 * realm can use its own rng and tests can pin the choice; the modulo guard
 * mirrors the offline warp module verbatim.
 */
export function ptWarpExitPick(
  gate: Pick<PtGraphWarpGate, 'exits'>,
  rand: number,
): PtGraphWarpExit | null {
  if (gate.exits.length === 0) return null;
  return gate.exits[Math.floor(rand * gate.exits.length) % gate.exits.length];
}

// ---------------------------------------------------------------------------
// Sticky field identity
// ---------------------------------------------------------------------------

/**
 * Which field a WoC position belongs to, with hysteresis.
 *
 * The PT band is a single shared stage: continent fields tile adjacently
 * under the continent transform, while warp-only band islands overlay the
 * same WoC region. A bare bounds scan is therefore ambiguous at seams and
 * inside islands; `currentId` (the field the entity is already known to be
 * in) disambiguates exactly like the offline active/standby promotion does:
 *
 *   1. if the current field still claims the position, keep it;
 *   2. else prefer a claimant connected to the current field by a live
 *      FieldGate edge (a legal crossing);
 *   3. else take the only claimant;
 *   4. else null (no claim - the caller keeps the last known identity).
 *
 * For warp islands there is no gate edge, so they only ever LOSE identity
 * here when their own bounds stop claiming (never happens while standing in
 * one) or a continent claimant also covers the spot - the explicit ptField
 * set performed at warp time is what disambiguates arrival.
 */
export function ptStickyFieldAt(currentId: string | null, wocX: number, wocZ: number): string | null {
  const g = _graph;
  if (!g) return null;
  const claimants: PtGraphField[] = [];
  let currentClaims = false;
  for (const f of g.fields) {
    if (!f.id || !f.bounds) continue;
    const wb = ptGraphWocBounds(f.id);
    if (!wb) continue;
    if (wocX >= wb.minX && wocX <= wb.maxX && wocZ >= wb.minZ && wocZ <= wb.maxZ) {
      if (f.id === currentId) {
        currentClaims = true;
      } else {
        claimants.push(f);
      }
    }
  }
  if (currentClaims) return currentId;
  if (claimants.length === 0) return null;
  if (currentId !== null) {
    const connected = claimants.find((c) => ptGateEdgeBetween(currentId, c.id!) !== null);
    if (connected) return connected.id;
  }
  // Band-island footprints self-anchor at the band origin and overlap
  // continent fields, so an unordered first-claimant pick could name an
  // island for a continent position. Continent claimants win; the island
  // only names a spot no continent field covers.
  const continent = claimants.filter((c) => ptFieldFitsContinent(c.bounds!));
  return (continent[0] ?? claimants[0]).id;
}
