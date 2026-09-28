// PT field-population registrations for the headless realm sim (O4).
//
// The client registers all 70 generated population modules through
// src/game/pt_population_data.ts's import.meta.glob; esbuild cannot glob, so
// the realm imports the same generated modules explicitly - and only for the
// geometry closure it actually simulates (server/pt_fields.ts +
// server/pt_start_fields.ts). A population module whose field has no
// registered geometry can never satisfy floor probes, and a session can
// never form on a field the server refuses, so the bounded list loses
// nothing; keep it in step with the registrations in pt_fields.ts.
//
// Generated modules are pure data (host-agnostic), so bundling them into the
// server is safe. boss records inside these modules stay excluded by the
// scheduler itself (src/sim/pt_population.ts skips them on read); the
// standalone 'boss' field module is intentionally not registered.

import { PT_FIELD_POPULATION as POP_RICARTEN } from '../generated/pt-maps/ricarten/population.generated';
import { PT_FIELD_POPULATION as POP_PILAI } from '../generated/pt-maps/pilai/population.generated';
import { PT_FIELD_POPULATION as POP_TOWN1 } from '../generated/pt-maps/town1/population.generated';
import { PT_FIELD_POPULATION as POP_FORE1 } from '../generated/pt-maps/fore-1/population.generated';
import { PT_FIELD_POPULATION as POP_FORE2 } from '../generated/pt-maps/fore-2/population.generated';
import { PT_FIELD_POPULATION as POP_FORE3 } from '../generated/pt-maps/fore-3/population.generated';
import { PT_FIELD_POPULATION as POP_RUIN4 } from '../generated/pt-maps/ruin-4/population.generated';
import { PT_FIELD_POPULATION as POP_FF01 } from '../generated/pt-maps/forever-fall-01/population.generated';
import { PT_FIELD_POPULATION as POP_FF02 } from '../generated/pt-maps/forever-fall-02/population.generated';
import { PT_FIELD_POPULATION as POP_FF03 } from '../generated/pt-maps/forever-fall-03/population.generated';
import { PT_FIELD_POPULATION as POP_FO1 } from '../generated/pt-maps/fo1/population.generated';
import { PT_FIELD_POPULATION as POP_BA4 } from '../generated/pt-maps/ba4/population.generated';
import { PT_FIELD_POPULATION as POP_TCAVE } from '../generated/pt-maps/tcave/population.generated';
import { PT_FIELD_POPULATION as POP_MCAVE } from '../generated/pt-maps/mcave/population.generated';
import { PT_FIELD_POPULATION as POP_DCAVE } from '../generated/pt-maps/dcave/population.generated';
import { PT_FIELD_POPULATION as POP_DC1 } from '../generated/pt-maps/dc1/population.generated';
import { PT_FIELD_POPULATION as POP_LOST3 } from '../generated/pt-maps/lost3/population.generated';
import { PT_FIELD_POPULATION as POP_ICE3 } from '../generated/pt-maps/ice3/population.generated';
import { PT_FIELD_POPULATION as POP_AD1 } from '../generated/pt-maps/ad1/population.generated';
import { PT_FIELD_POPULATION as POP_AD2 } from '../generated/pt-maps/ad2/population.generated';
import { PT_FIELD_POPULATION as POP_AD3 } from '../generated/pt-maps/ad3/population.generated';
import { PT_FIELD_POPULATION as POP_MINE1 } from '../generated/pt-maps/mine-1/population.generated';
import {
  type PtPopulationModule,
  registerPtPopulations,
} from '../src/sim/pt_population';

// The generated modules are data literals (status widens to string); the
// emitter pins their shape against PtPopulationModule at generation time.
const mods = [
  POP_RICARTEN,
  POP_PILAI,
  POP_TOWN1,
  POP_FORE1,
  POP_FORE2,
  POP_FORE3,
  POP_RUIN4,
  POP_FF01,
  POP_FF02,
  POP_FF03,
  POP_FO1,
  POP_BA4,
  POP_TCAVE,
  POP_MCAVE,
  POP_DCAVE,
  POP_DC1,
  POP_LOST3,
  POP_ICE3,
  POP_AD1,
  POP_AD2,
  POP_AD3,
  POP_MINE1,
] as PtPopulationModule[];

export const PT_SERVER_POPULATION_TABLE: ReadonlyMap<string, PtPopulationModule> = new Map(
  mods.map((mod) => [mod.fieldId, mod]),
);
registerPtPopulations(PT_SERVER_POPULATION_TABLE);
