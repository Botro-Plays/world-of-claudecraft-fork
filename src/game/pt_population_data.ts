// Registers every generated PT field-population module
// (generated/pt-maps/<id>/population.generated.ts, Phase 6H-1) with the sim
// population controller (src/sim/pt_population.ts). The generated modules
// are pure data, so an eager compile-time glob keeps registration
// synchronous and deterministic: the table is complete before the first
// tick, and adding or removing a field package needs no edit list here.
//
// Load site: src/game/pt_field_transition.ts (which main.ts imports), so
// registration rides the same module graph that installs PT field
// descriptors. Server and headless Sims never load this module; they see an
// empty table and the scheduler no-ops there, matching the current
// client-only PT field architecture.

import { type PtPopulationModule, registerPtPopulations } from '../sim/pt_population';

const POPULATION_MODULES = import.meta.glob('../../generated/pt-maps/*/population.generated.ts', {
  eager: true,
}) as Record<string, { PT_FIELD_POPULATION: PtPopulationModule }>;

/** The full generated table as installed; tests restore it after overrides. */
export const PT_POPULATION_TABLE: ReadonlyMap<string, PtPopulationModule> = new Map(
  Object.values(POPULATION_MODULES).map((mod) => [
    mod.PT_FIELD_POPULATION.fieldId,
    mod.PT_FIELD_POPULATION,
  ]),
);
registerPtPopulations(PT_POPULATION_TABLE);
