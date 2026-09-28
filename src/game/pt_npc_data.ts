// Registers every generated PT fixed-NPC module
// (generated/pt-maps/<id>/npcs.generated.ts, O5) with the sim spawner
// (src/sim/pt_npcs.ts). The generated modules are pure data, so an eager
// compile-time glob keeps registration synchronous and deterministic: the
// table is complete before the first tick, and adding or removing a field
// package needs no edit list here.
//
// Load site: src/game/pt_field_transition.ts (which main.ts imports), so
// registration rides the same module graph that installs PT field
// descriptors — the pt_population_data.ts precedent. Server Sims load
// server/pt_npcs.ts instead (esbuild cannot glob).

import { type PtNpcModule, registerPtNpcs } from '../sim/pt_npcs';

const NPC_MODULES = import.meta.glob('../../generated/pt-maps/*/npcs.generated.ts', {
  eager: true,
}) as Record<string, { PT_FIELD_NPCS: PtNpcModule }>;

/** The full generated table as installed; tests restore it after overrides. */
export const PT_NPC_TABLE: ReadonlyMap<string, PtNpcModule> = new Map(
  Object.values(NPC_MODULES).map((mod) => [mod.PT_FIELD_NPCS.fieldId, mod.PT_FIELD_NPCS]),
);
registerPtNpcs(PT_NPC_TABLE);
