// PT static field registrations for the headless realm sim (phases O2/O2.5).
//
// Starting towns still come from ./pt_start_fields (imported below); this
// module adds the fields the authoritative transition system (src/sim/
// pt_transitions.ts) needs collision for, plus the shared connection graph
// (./pt_map_links.ts) those transitions resolve against.
//
// The registration set is deliberately bounded to the verified closure:
// every field a player can reach ON FOOT from a starting town through live
// FieldGate edges, plus the fields reachable through the authored WarpGate
// exits of fields already inside the closure:
//
//   foot:   ricarten (built-in) - fore-1 - fore-2 - fore-3
//           fore-1 - ruin-4
//           town1 - fo1 - ba4
//           forever-fall-01 - forever-fall-02 - forever-fall-03
//   warp:   pilai -> forever-fall-01 (SE0, lvl 0) and back (SE1, lvl 0)
//           ricarten -> dc1 (SE0, lvl 180) and back (lvl 0)
//           fore-3 -> tcave (lvl 55), forever-fall-03 -> mcave (lvl 55)
//           tcave <-> dcave (lvl 65 in), dcave <-> tcave/mcave (lvl 0)
//           ba4 -> ad1 (lvl 130), ad1 <-> ad2 <-> ad3 (lvl 0)
//           ice3 -> ricarten (lvl 0, exit only)
//
// Band islands (ptFieldFitsContinent = false) register into the
// IDENTITY-SCOPED tier, not positional dispatch: their per-map band
// transforms self-anchor at the band origin so their WoC footprints overlap
// the continent's, and a bounds claim could never tell them apart. An
// entity's ptField selects the module (withPtFieldScope /
// ptFloorOwnerAt in pt_field_active); a bare position never seeds one.
// Fields with no inbound gate (lost3: etherCore-only entry; ice3: NPC
// teleport only) still register so a legitimate identity never resolves
// 'field_unavailable' on the way OUT.
//
// Still unregistered on purpose (the resolver answers 'field_unavailable'
// honestly): ruin-3, fo2, ba3, forever-fall-04, sanc1, and every further
// field. Widen per-phase as online coverage is verified; never silently.
//
// Generated modules are pure data (host-agnostic atob decode), so bundling
// them into the server is safe.

import * as FORE1_FIELD from '../generated/pt-maps/fore-1/field.generated';
import * as FORE2_FIELD from '../generated/pt-maps/fore-2/field.generated';
import * as FORE3_FIELD from '../generated/pt-maps/fore-3/field.generated';
import * as RUIN4_FIELD from '../generated/pt-maps/ruin-4/field.generated';
import * as FF01_FIELD from '../generated/pt-maps/forever-fall-01/field.generated';
import * as FF02_FIELD from '../generated/pt-maps/forever-fall-02/field.generated';
import * as FF03_FIELD from '../generated/pt-maps/forever-fall-03/field.generated';
import * as FO1_FIELD from '../generated/pt-maps/fo1/field.generated';
import * as BA4_FIELD from '../generated/pt-maps/ba4/field.generated';
import * as TCIVE_FIELD from '../generated/pt-maps/tcave/field.generated';
import * as MCIVE_FIELD from '../generated/pt-maps/mcave/field.generated';
import * as DCIVE_FIELD from '../generated/pt-maps/dcave/field.generated';
import * as DC1_FIELD from '../generated/pt-maps/dc1/field.generated';
import * as LOST3_FIELD from '../generated/pt-maps/lost3/field.generated';
import * as ICE3_FIELD from '../generated/pt-maps/ice3/field.generated';
import * as AD1_FIELD from '../generated/pt-maps/ad1/field.generated';
import * as AD2_FIELD from '../generated/pt-maps/ad2/field.generated';
import * as AD3_FIELD from '../generated/pt-maps/ad3/field.generated';
import * as MINE1_FIELD from '../generated/pt-maps/mine-1/field.generated';
import { registerPtStaticField } from '../src/sim/pt_field_active';

// Side effects, order-pinned: the graph first (identity/bounds resolution),
// then the start towns (pilai/town1 keep their existing registration site
// so their boot comments still apply), then the closure.
import './pt_map_links';
import './pt_start_fields';

registerPtStaticField(FORE1_FIELD, 'fore-1');
registerPtStaticField(FORE2_FIELD, 'fore-2');
registerPtStaticField(FORE3_FIELD, 'fore-3');
registerPtStaticField(RUIN4_FIELD, 'ruin-4');
registerPtStaticField(FF01_FIELD, 'forever-fall-01');
registerPtStaticField(FF02_FIELD, 'forever-fall-02');
registerPtStaticField(FF03_FIELD, 'forever-fall-03');
registerPtStaticField(FO1_FIELD, 'fo1');
registerPtStaticField(BA4_FIELD, 'ba4');
registerPtStaticField(TCIVE_FIELD, 'tcave');
registerPtStaticField(MCIVE_FIELD, 'mcave');
registerPtStaticField(DCIVE_FIELD, 'dcave');
registerPtStaticField(DC1_FIELD, 'dc1');
registerPtStaticField(LOST3_FIELD, 'lost3');
registerPtStaticField(ICE3_FIELD, 'ice3');
registerPtStaticField(AD1_FIELD, 'ad1');
registerPtStaticField(AD2_FIELD, 'ad2');
registerPtStaticField(AD3_FIELD, 'ad3');
// mine-1 (O4): a band island like dc1 - identity-scoped only, never a
// positional claimant. Registered so its authored population module can run
// its floor probes and a dev-seeded ptField can verify the live path.
registerPtStaticField(MINE1_FIELD, 'mine-1');

// Field-population modules for the same closure (O4): the scheduler runs
// per active field session inside the sim (src/sim/pt_population.ts).
import './pt_populations';
