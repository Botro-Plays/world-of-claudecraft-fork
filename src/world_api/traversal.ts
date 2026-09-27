import type { WorldInteractionOutcome } from './interaction';

// PT connected-world traversal (online phase O2): the authoritative field
// identity plus the transition nudge. The request is deliberately data-free
// - it carries no field id, gate id, or coordinates - because the server
// re-derives every transition from the authoritative position and the
// shared map graph (src/sim/pt_transitions.ts). There is nothing in the
// payload to spoof.
export interface IWorldTraversal {
  // The PT field the authority says the local player stands in (a
  // generated/pt-maps package id like 'ricarten' or 'fore-1'), or null
  // outside the PT band / before the first snapshot carries it. Online this
  // mirrors the self-wire `ptf` field; offline it reads the bound map.
  readonly ptField: string | null;

  // Nudge the authority to resolve a PT transition at the current position
  // NOW rather than on its own tick cadence: a live FieldGate crossing or a
  // WarpGate trigger the client detected presentation-side. Resolves true
  // when a transition applied (or was already armed); false on every
  // rejection (wrong field, out of a trigger, lockout, low level,
  // unsupported wing warp, unavailable destination). Offline this is inert
  // - the dev traversal modules own transitions on a descriptor host.
  requestPtFieldTransition(): WorldInteractionOutcome;
}
