// FieldGate connected-world runtime: the PT client's PlayNearGateField
// behavior over the generated/pt-maps packages.
//
// Source semantics (field.cpp), reproduced faithfully:
//   - AddGate is bidirectional by construction, so every authored record is
//     one undirected boundary edge whose shared gate point is meaningful
//     from both sides.
//   - PlayNearGateField runs periodically (FieldCheckCount & 0x3F), scans
//     only the two loaded fields' gate lists, and measures XZ distance in
//     PT units: dx*dx+dz*dz < DIST_TRANSLEVEL_CONNECT (0x120000) with the
//     extra |dx|,|dz| < 16384 axis bound. 0x120000 is a squared-distance
//     constant, so the effective trigger radius is sqrt(0x120000) ~=
//     1086 PT units (~39 yards) around each gate point.
//   - When exactly ONE of the two loaded fields yields a nearest gate
//     candidate whose destination is not the other loaded field, that
//     destination loads into the OTHER slot (the scanned field is kept).
//     Both-or-neither is an ambiguity/no-work case and does nothing.
//   - The scan only PRELOADS. Ownership flips later inside the movement
//     floor check (pt_field_active.ts _linkedField), never here, so this
//     code never touches the player position.
//
// Dead source edges (ff-01 -> pilai's copied coordinate, the iron-2 <->
// iron4 pair whose points sit outside the source field) never produce a
// candidate because the player cannot approach their gate point while
// standing on a field that can reach it; they require no special-casing.
// The SeaA self-loop resolves to a same-id standby request, which
// setStandbyPtMap ignores.

import {
  activePtMapDescriptor,
  setActivePtMap,
  setStandbyPtMap,
  standbyPtMapDescriptor,
} from '../sim/pt_field_active';
import type { PtMapDescriptor } from '../sim/pt_field';
import { loadPtDevMap, ptDevFieldGates } from './pt_dev_maps';

// DIST_TRANSLEVEL_CONNECT verbatim: a squared XZ distance in integer PT
// units (see header). Radius ~= 1086 units.
const PT_GATE_CONNECT_DIST2 = 0x120000;
// The same source check's per-axis bound: |dx| < 16384 and |dz| < 16384.
const PT_GATE_AXIS_LIMIT = 16384;
// Source cadence is FieldCheckCount & 0x3F (~every second at 60fps). The
// host calls this module once per rendered frame; scanning every 48th
// call keeps the same lazy cadence without per-frame allocation.
const PT_GATE_SCAN_FRAMES = 48;

/** One undirected boundary edge between two field packages. */
interface PtFieldEdge {
  aId: string;
  bId: string;
  x: number;
  z: number;
}

let _edgesByMap: Map<string, PtFieldEdge[]> | null = null;

/** Lazily index every authored gate by BOTH endpoint ids. */
function edgesByMap(): Map<string, PtFieldEdge[]> {
  if (_edgesByMap !== null) return _edgesByMap;
  const byIndex = new Map<number, string>();
  for (const e of ptDevFieldGates()) byIndex.set(e.fieldIndex, e.id);
  const map = new Map<string, PtFieldEdge[]>();
  const push = (id: string, edge: PtFieldEdge) => {
    const list = map.get(id);
    if (list) list.push(edge);
    else map.set(id, [edge]);
  };
  for (const e of ptDevFieldGates()) {
    for (const g of e.gates) {
      // Prefer the manifest's resolved targetId; fall back to the index
      // table so a stale manifest still resolves its destination.
      const destId = g.targetId ?? byIndex.get(g.targetIndex) ?? null;
      if (destId === null) continue; // authored target outside the registry
      const edge: PtFieldEdge = { aId: e.id, bId: destId, x: g.x, z: g.z };
      push(e.id, edge);
      if (destId !== e.id) push(destId, edge);
    }
  }
  _edgesByMap = map;
  return map;
}

/** Exported for tests: the undirected edge count (36 edges + SeaA self). */
export function ptFieldEdgeCount(): number {
  let n = 0;
  for (const [id, list] of edgesByMap()) {
    for (const e of list) if (e.aId === id) n++;
  }
  return n;
}

/** Exported for tests: edges touching one map id. */
export function ptFieldEdgesOf(mapId: string): readonly PtFieldEdge[] {
  return edgesByMap().get(mapId) ?? [];
}

interface GateCandidate {
  destId: string;
  dist2: number;
}

/**
 * Nearest gate on `scannedId`'s boundary list whose destination is not
 * `otherLoadedId`, within the source connect radius of (ptX, ptZ). A gate
 * whose other end IS `scannedId` (self-loop) is skipped up front.
 */
function nearestGate(
  scannedId: string,
  otherLoadedId: string | null,
  ptX: number,
  ptZ: number,
): GateCandidate | null {
  let best: GateCandidate | null = null;
  for (const e of edgesByMap().get(scannedId) ?? []) {
    const other = e.aId === scannedId ? e.bId : e.aId;
    if (other === scannedId || other === otherLoadedId) continue;
    const dx = ptX - e.x;
    const dz = ptZ - e.z;
    if (Math.abs(dx) >= PT_GATE_AXIS_LIMIT || Math.abs(dz) >= PT_GATE_AXIS_LIMIT) continue;
    const dist2 = dx * dx + dz * dz;
    if (dist2 < PT_GATE_CONNECT_DIST2 && (best === null || dist2 < best.dist2)) {
      best = { destId: other, dist2 };
    }
  }
  return best;
}

let _scanCount = 0;
let _pendingId: string | null = null;

async function installCandidate(
  destId: string,
  keepDescriptor: PtMapDescriptor,
  keepIsActive: boolean,
): Promise<void> {
  _pendingId = destId;
  try {
    const loaded = await loadPtDevMap(destId);
    // Re-read the slot state after the await: a /ptmap switch or a faster
    // second candidate may have changed the world while the package loaded.
    const active = activePtMapDescriptor();
    const standby = standbyPtMapDescriptor();
    if (loaded.descriptor.id === active?.id || loaded.descriptor.id === standby?.id) return;
    if (keepIsActive) {
      if (active?.id !== keepDescriptor.id) return; // world moved on
      setStandbyPtMap(loaded.descriptor);
    } else {
      if (standby?.id !== keepDescriptor.id) return;
      setActivePtMap(loaded.descriptor);
      setStandbyPtMap(keepDescriptor);
    }
  } catch {
    // An unconvertible destination package fails closed: the boundary stays
    // a dead seam instead of breaking the walk.
  } finally {
    if (_pendingId === destId) _pendingId = null;
  }
}

/**
 * One periodic scan step. Called once per rendered frame from the dev
 * harness; internally throttled to the source's ~1s cadence. Never moves
 * the player and never loads more than one package per decision.
 */
export function tickPtFieldGates(wocX: number, wocZ: number): void {
  if (++_scanCount % PT_GATE_SCAN_FRAMES !== 0) return;
  if (_pendingId !== null) return; // a destination load is in flight

  const active = activePtMapDescriptor();
  if (active === null) return; // default Ricarten binding: no field graph
  const standby = standbyPtMapDescriptor();
  const ptX = active.transform.woCToPtX(wocX);
  const ptZ = active.transform.woCToPtZ(wocZ);

  const candActive = nearestGate(active.id, standby?.id ?? null, ptX, ptZ);
  const candStandby = standby
    ? nearestGate(standby.id, active.id, ptX, ptZ)
    : null;

  // Source ambiguity rule: both-or-neither does nothing this round.
  if ((candActive && candStandby) || (!candActive && !candStandby)) return;

  if (candActive) {
    void installCandidate(candActive.destId, active, true);
  } else if (candStandby && standby) {
    void installCandidate(candStandby.destId, standby, false);
  }
}
