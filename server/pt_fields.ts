// PT static field registrations for the headless realm sim (phase O2).
//
// Starting towns still come from ./pt_start_fields (imported below); this
// module adds the fields the authoritative transition system (src/sim/
// pt_transitions.ts) needs collision for, plus the shared connection graph
// (./pt_map_links.ts) those transitions resolve against.
//
// The registration set is deliberately bounded to the O2-verified closure:
// every field a player can reach ON FOOT from a starting town through live
// FieldGate edges, plus the fields reachable through the authored WarpGate
// exits of fields already inside the closure at level 0:
//
//   foot:   ricarten (built-in) - fore-1 - fore-2 - fore-3
//           fore-1 - ruin-4
//           town1 - fo1
//   warp:   pilai -> forever-fall-01 (SE0, lvl 0) and back (SE1, lvl 0)
//
// forever-fall-02 rides along because it is the forever-fall-01 FieldGate
// neighbor (ff-01's only live gate); ff-03, ruin-3, fo2, ba4 and every
// further field stay UNREGISTERED on purpose - the resolver answers
// 'field_unavailable' for them honestly rather than simulating a floor on
// the Ricarten fallback's wrong geometry. Widen this list per-phase as
// online coverage is verified; never silently.
//
// tcave is NOT a mere omission: it is one of the nine non-continent fields
// (ptFieldFitsContinent = false - tcave, mcave, dcave, lost3, dc1, ice3,
// ad1-3) whose per-map band transform self-anchors at the band origin, so
// its WoC footprint overlaps Ricarten's almost exactly. Positional dispatch
// cannot distinguish them, and registerPtStaticField itself refuses such
// modules. Islands go online only with identity-scoped dispatch.
//
// Generated modules are pure data (host-agnostic atob decode), so bundling
// them into the server is safe.

import * as FORE1_FIELD from '../generated/pt-maps/fore-1/field.generated';
import * as FORE2_FIELD from '../generated/pt-maps/fore-2/field.generated';
import * as FORE3_FIELD from '../generated/pt-maps/fore-3/field.generated';
import * as RUIN4_FIELD from '../generated/pt-maps/ruin-4/field.generated';
import * as FF01_FIELD from '../generated/pt-maps/forever-fall-01/field.generated';
import * as FF02_FIELD from '../generated/pt-maps/forever-fall-02/field.generated';
import * as FO1_FIELD from '../generated/pt-maps/fo1/field.generated';
import { registerPtStaticField } from '../src/sim/pt_field_active';

// Side effects, order-pinned: the graph first (identity/bounds resolution),
// then the start towns (pilai/town1 keep their existing registration site
// so their boot comments still apply), then the O2 closure.
import './pt_map_links';
import './pt_start_fields';

registerPtStaticField(FORE1_FIELD, 'fore-1');
registerPtStaticField(FORE2_FIELD, 'fore-2');
registerPtStaticField(FORE3_FIELD, 'fore-3');
registerPtStaticField(RUIN4_FIELD, 'ruin-4');
registerPtStaticField(FF01_FIELD, 'forever-fall-01');
registerPtStaticField(FF02_FIELD, 'forever-fall-02');
registerPtStaticField(FO1_FIELD, 'fo1');
