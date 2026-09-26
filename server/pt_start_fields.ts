// PT starting-town static fields for the headless realm sim.
//
// The realm runs without the client descriptor pipeline, so PT-band floor
// queries fall back to src/sim/pt_field_active's descriptor-less path - which
// historically resolved every position through the bundled Ricarten field.
// Morion and Atlanteon characters spawn (and may be saved) in Pillai
// ("pilai") and Atlantis Town ("town1"); registering those generated field
// modules makes addPlayer's groundPos re-resolution and movement floor
// checks return real collision for the three starting towns.
//
// Generated modules are pure data (no imports, host-agnostic atob decode),
// so bundling them into the server is safe. Ricarten needs no registration:
// its committed module is already the ultimate fallback.

import * as PILAI_FIELD from '../generated/pt-maps/pilai/field.generated';
import * as TOWN1_FIELD from '../generated/pt-maps/town1/field.generated';
import { registerPtStaticField } from '../src/sim/pt_field_active';

registerPtStaticField(PILAI_FIELD);
registerPtStaticField(TOWN1_FIELD);
