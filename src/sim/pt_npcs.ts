// PT fixed-NPC field population (O5): session-owned .spc placement.
//
// MagicPT places fixed NPCs at map load: STG_AREA::LoadStage reads
// Field/<base>.ase.spc (100 x smTRNAS_PLAYERINFO) and OpenNpc()s every record
// with code != 0 at its authored x/y/z + angle (PT-Source/SrcServer/
// OnSever.cpp). There is no spawn cadence, wander, or respawn — a live NPC
// exists while its field is loaded.
//
// WoC equivalent (same ownership model as src/sim/pt_population.ts):
//   - An ACTIVE PtFieldSession owns its field's fixed NPCs; the bound dev-map
//     descriptor keeps the same content available on offline/test hosts.
//   - Spawn happens once when the field goes live (source: LoadStage opens
//     every record up front); release happens when the owner leaves 'active'
//     (drain/unload), mirroring the population release contract.
//   - Positions are the authored record values pushed through the field's
//     canonical transform (pt_band.ts): x/z are PT world units, y resolves
//     against field floor at the authored height, and facing maps
//     ay (ANGLE_360 = 4096) -> -t radians under the mirrored X transform.
//   - NPCs stamp ptField so inSamePtField scoping delivers them only to the
//     field's own players; a foreign field's viewer never sees them.
//
// *移动范围 (wander) is recorded in the catalog but deliberately not
// simulated: WoC NPCs stand still, and none of the placed records carry a
// nonzero range. Service flags beyond vendor/warehouse (skill masters,
// teleporters, crafting masters, event NPCs) are catalog data for a later
// phase; the NPC itself places and renders correctly without them.

import { ptNpcTemplateId } from './content/pt_npcs';
import { NPCS } from './data';
import { createNpc } from './entity';
import type { PtField, PtFieldTransform } from './pt_field';
import { activeOwnedPtField, activePtMapDescriptor, ptFieldById } from './pt_field_active';
import { ptFieldSessions } from './pt_field_sessions';
import { ptGraphFieldTransform } from './pt_map_graph';
import type { SimContext } from './sim_context';

// ---------------------------------------------------------------------------
// Generated-module contract (npcs.generated.ts shape)
// ---------------------------------------------------------------------------

export interface PtNpcPlacement {
  /** .spc record slot (0..99); stable within the field's table. */
  slot: number;
  /** PT_NPC_CATALOG key (the .npc definition file stem), or null. */
  def: string | null;
  /** .spc szName (provenance; the .npc *名字 overrides it for display). */
  name: string | null;
  /** Resolved model stem (*外型文件 wins over szModelName) or null. */
  model: string | null;
  /** PT world units (the <<8 fixed point was folded out at emit time). */
  x: number;
  y: number;
  z: number;
  /** Facing in ANGLE_360=4096 units. */
  ay: number;
  /** smCHAR_STATE_* (0 = NPC in every shipped table). */
  charState: number;
}

export interface PtNpcModule {
  fieldId: string;
  aseStem: string;
  status: 'placed' | 'empty' | 'no-source';
  npcs: PtNpcPlacement[];
  unresolved: string[];
}

// ---------------------------------------------------------------------------
// Registry seam: the game layer (src/game/pt_npc_data.ts) installs the
// generated modules; the sim reads them here. Unregistered = no NPCs.
// ---------------------------------------------------------------------------

let npcTable: ReadonlyMap<string, PtNpcModule> = new Map();

export function registerPtNpcs(map: ReadonlyMap<string, PtNpcModule>): void {
  npcTable = map;
}

export function ptNpcModule(fieldId: string): PtNpcModule | null {
  return npcTable.get(fieldId) ?? null;
}

// ---------------------------------------------------------------------------
// Per-sim ownership state: fieldId -> spawned entity ids. WeakMap-keyed on
// SimContext so two Sims in one process never share spawns (pt_population
// convention).
// ---------------------------------------------------------------------------

const simSpawned = new WeakMap<SimContext, Map<string, number[]>>();

function spawnedFor(ctx: SimContext): Map<string, number[]> {
  let s = simSpawned.get(ctx);
  if (!s) {
    s = new Map();
    simSpawned.set(ctx, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Facing: PT Angle.y runs 0..4095 per revolution, 0 = +Z north (MoveAngle2).
// The mirrored band transform maps facing t -> -t (pt_band.ts header), so a
// PT ay becomes the WoC radians 2pi - ay*2pi/4096 (mod 2pi).
// ---------------------------------------------------------------------------

const PT_ANGLE_PER_REV = 4096;

export function ptAngleToFacing(ay: number): number {
  const t = ((ay % PT_ANGLE_PER_REV) + PT_ANGLE_PER_REV) % PT_ANGLE_PER_REV;
  return ((PT_ANGLE_PER_REV - t) % PT_ANGLE_PER_REV) * ((Math.PI * 2) / PT_ANGLE_PER_REV);
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

/**
 * One fixed-NPC step, called once per sim tick beside ptPopulationTick.
 * Releases a field's NPC entities when its owner leaves 'active', and spawns
 * the authored set when an owner goes live. Fixed NPCs have no cadence —
 * spawn-once-per-activation IS the source behavior (LoadStage).
 */
export function ptNpcTick(ctx: SimContext): void {
  const spawned = spawnedFor(ctx);

  const live = new Set<string>();
  for (const s of ptFieldSessions(ctx)) {
    if (s.state === 'active') live.add(s.fieldId);
  }
  const desc = activePtMapDescriptor();
  if (desc !== null) live.add(desc.id);

  // Release: owner gone inactive -> drop the field's NPC entities now (the
  // O4 drain contract: release at drain start, not at unload).
  for (const [fieldId, ids] of spawned) {
    if (live.has(fieldId)) continue;
    for (const id of ids) if (ctx.entities.has(id)) ctx.dropEntity(id);
    spawned.delete(fieldId);
  }

  for (const fieldId of live) {
    if (spawned.has(fieldId)) continue;
    const mod = ptNpcModule(fieldId);
    if (!mod || mod.status !== 'placed' || mod.npcs.length === 0) {
      spawned.set(fieldId, []); // mark visited so an empty field isn't rescanned
      continue;
    }
    const isDesc = desc !== null && fieldId === desc.id;
    const field = isDesc ? activeOwnedPtField() : ptFieldById(fieldId);
    const xf = isDesc ? desc.transform : ptGraphFieldTransform(fieldId);
    if (!field || !xf) continue;
    spawnFieldNpcs(ctx, mod, field, xf, spawned);
  }
}

/** The source LoadStage arm: open every live .spc record at its authored spot. */
function spawnFieldNpcs(
  ctx: SimContext,
  mod: PtNpcModule,
  field: PtField,
  xf: PtFieldTransform,
  spawned: Map<string, number[]>,
): void {
  const ids: number[] = [];
  for (const rec of mod.npcs) {
    const templateId = rec.def ? ptNpcTemplateId(rec.def) : null;
    const def = templateId ? NPCS[templateId] : undefined;
    if (!def) continue; // def-less or catalog-missing: recorded unresolved upstream
    const wx = xf.ptXToWoC(rec.x);
    const wz = xf.ptZToWoC(rec.z);
    // Ground placement: the authored PT height, resolved against the field's
    // floor so an NPC on stairs/a platform lands on that exact surface (the
    // record's own y picks the level band); a missing floor falls back to the
    // authored height rather than dropping the NPC.
    const authoredY = xf.ptYToWoC(rec.y);
    const floor = field.floorHeight(wx, wz, authoredY + 1);
    const npc = createNpc(ctx.nextId++, def, {
      x: wx,
      y: floor === -Infinity ? authoredY : floor,
      z: wz,
    });
    npc.facing = ptAngleToFacing(rec.ay);
    npc.prevFacing = npc.facing;
    // The NPC OWNS its spawn field's identity: inSamePtField gates visibility
    // on ptField (the mob contract in pt_population.ts).
    npc.ptField = mod.fieldId;
    ctx.addEntity(npc);
    ids.push(npc.id);
    // Warehouse NPCs (*物品保管) join the banker reach set while spawned; a
    // dropped id resolves to nothing in nearBanker's entity lookup, so drain
    // needs no list cleanup (bank.ts skips dead anchors).
    if (def.banker) ctx.bankerIds.push(npc.id);
  }
  spawned.set(mod.fieldId, ids);
}
