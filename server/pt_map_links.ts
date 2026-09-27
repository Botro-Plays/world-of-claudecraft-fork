// Realm-side injection of the shared PT connection graph.
//
// The generated maplinks.json is the single authenticated gate/warp/bounds
// dataset (scripts/pt-port/pt_map.mjs maplinks). The browser loads it via
// src/game/pt_map_links.ts (import.meta.glob); the realm cannot glob, so it
// reads the same artifact off disk here and hands it to the shared
// registry (src/sim/pt_map_graph.ts). Everything downstream - sticky field
// identity, FieldGate connectivity, WarpGate trigger cylinders, WarpOut
// exits, and the transforms derived from the emitted bounds - resolves
// identically on both hosts.
//
// The artifact is committed generated data, loaded once at module init like
// the generated field packages (pt_fields.ts). A missing/malformed artifact
// fails closed: the registry stays empty, ptFieldIdAt answers only from
// static registrations, and every transition request resolves
// 'no_transition' instead of trusting partial data.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  registerPtMapGraph,
  type PtMapGraphData,
} from '../src/sim/pt_map_graph';

// __dirname is server/ unbundled (vitest/dev) and dist-server/ in the
// shipped bundle; both sit one level below the repo root.
const MAPLINKS_PATH = path.join(__dirname, '..', 'generated', 'pt-maps', 'maplinks.json');

function loadPtMapLinks(): PtMapGraphData | null {
  try {
    const data = JSON.parse(readFileSync(MAPLINKS_PATH, 'utf8')) as PtMapGraphData;
    if (!Array.isArray(data.fields) || !Array.isArray(data.fieldGates) || !Array.isArray(data.warpGates)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

registerPtMapGraph(loadPtMapLinks());
