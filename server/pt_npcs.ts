// PT fixed-NPC registrations for the headless realm sim (O5).
//
// The client registers all generated npc modules through
// src/game/pt_npc_data.ts's import.meta.glob; esbuild cannot glob, so the
// realm imports the same generated modules explicitly - and only for the
// geometry closure it actually simulates (server/pt_fields.ts +
// server/pt_start_fields.ts, same closure as pt_populations.ts). A fixed-NPC
// module whose field has no registered geometry can never satisfy floor
// probes, and a session can never form on a field the server refuses, so
// the bounded list loses nothing; keep it in step with the registrations in
// pt_fields.ts.
//
// Generated modules are pure data (host-agnostic), so bundling them into the
// server is safe.

import { PT_FIELD_NPCS as NPCS_AD1 } from '../generated/pt-maps/ad1/npcs.generated';
import { PT_FIELD_NPCS as NPCS_AD2 } from '../generated/pt-maps/ad2/npcs.generated';
import { PT_FIELD_NPCS as NPCS_AD3 } from '../generated/pt-maps/ad3/npcs.generated';
import { PT_FIELD_NPCS as NPCS_BA4 } from '../generated/pt-maps/ba4/npcs.generated';
import { PT_FIELD_NPCS as NPCS_DC1 } from '../generated/pt-maps/dc1/npcs.generated';
import { PT_FIELD_NPCS as NPCS_DCAVE } from '../generated/pt-maps/dcave/npcs.generated';
import { PT_FIELD_NPCS as NPCS_FO1 } from '../generated/pt-maps/fo1/npcs.generated';
import { PT_FIELD_NPCS as NPCS_FORE1 } from '../generated/pt-maps/fore-1/npcs.generated';
import { PT_FIELD_NPCS as NPCS_FORE2 } from '../generated/pt-maps/fore-2/npcs.generated';
import { PT_FIELD_NPCS as NPCS_FORE3 } from '../generated/pt-maps/fore-3/npcs.generated';
import { PT_FIELD_NPCS as NPCS_FF01 } from '../generated/pt-maps/forever-fall-01/npcs.generated';
import { PT_FIELD_NPCS as NPCS_FF02 } from '../generated/pt-maps/forever-fall-02/npcs.generated';
import { PT_FIELD_NPCS as NPCS_FF03 } from '../generated/pt-maps/forever-fall-03/npcs.generated';
import { PT_FIELD_NPCS as NPCS_ICE3 } from '../generated/pt-maps/ice3/npcs.generated';
import { PT_FIELD_NPCS as NPCS_LOST3 } from '../generated/pt-maps/lost3/npcs.generated';
import { PT_FIELD_NPCS as NPCS_MCAVE } from '../generated/pt-maps/mcave/npcs.generated';
import { PT_FIELD_NPCS as NPCS_MINE1 } from '../generated/pt-maps/mine-1/npcs.generated';
import { PT_FIELD_NPCS as NPCS_PILAI } from '../generated/pt-maps/pilai/npcs.generated';
import { PT_FIELD_NPCS as NPCS_RICARTEN } from '../generated/pt-maps/ricarten/npcs.generated';
import { PT_FIELD_NPCS as NPCS_RUIN4 } from '../generated/pt-maps/ruin-4/npcs.generated';
import { PT_FIELD_NPCS as NPCS_TCAVE } from '../generated/pt-maps/tcave/npcs.generated';
import { PT_FIELD_NPCS as NPCS_TOWN1 } from '../generated/pt-maps/town1/npcs.generated';
import { type PtNpcModule, registerPtNpcs } from '../src/sim/pt_npcs';

// The generated modules are data literals (status widens to string); the
// emitter pins their shape against PtNpcModule at generation time.
const mods = [
  NPCS_RICARTEN,
  NPCS_PILAI,
  NPCS_TOWN1,
  NPCS_FORE1,
  NPCS_FORE2,
  NPCS_FORE3,
  NPCS_RUIN4,
  NPCS_FF01,
  NPCS_FF02,
  NPCS_FF03,
  NPCS_FO1,
  NPCS_BA4,
  NPCS_TCAVE,
  NPCS_MCAVE,
  NPCS_DCAVE,
  NPCS_DC1,
  NPCS_LOST3,
  NPCS_ICE3,
  NPCS_AD1,
  NPCS_AD2,
  NPCS_AD3,
  NPCS_MINE1,
] as PtNpcModule[];

export const PT_SERVER_NPC_TABLE: ReadonlyMap<string, PtNpcModule> = new Map(
  mods.map((mod) => [mod.fieldId, mod]),
);
registerPtNpcs(PT_SERVER_NPC_TABLE);
