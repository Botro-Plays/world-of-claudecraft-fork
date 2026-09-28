// Generated PT fixed-NPC visuals, adapted from
// generated/pt-maps/pt_npc_catalog.generated.ts (scripts/pt-port/pt_npcs.mjs)
// into ordinary VisualDef/NPC_KEYS entries. One visual per resolved model
// GLB under public/models/npc/pt (or the already-deployed creatures/pt for
// shared monster models); defs with no converted GLB get no visual and fall
// through to the npc_villager fallback in visualKeyFor.
//
// Clip semantics: converted PT NPC GLBs carry the source STAND/WALK clips
// (PT humanoid rig). NPCs are stationary fixed placements, so idle uses
// STAND; walk/run share WALK for completeness (a future *移动范围 wander
// phase would need it). lazyPreload matches the PT creature convention:
// fetched on first sight inside a PT field.

import { PT_NPC_DEFS, ptNpcTemplateId } from '../../sim/content/pt_npcs';
import type { ClipMap, VisualDef } from './manifest';

// PT world units -> WoC yards, the same scale the band transform applies
// (src/sim/pt_band.ts). Kept as a literal: render/ may import sim helpers,
// but this module is a pure data table like pt_mob_visuals.ts.
const PT_YD = 0.036;

// Every .npc def in MagicPT-Chinese carries *模型尺寸 1.2, parsed into
// smCharInfo.wPlayClass[1] (fileread.cpp smCharDecode) and drawn as
// smRender.ObjectVertexScale - a render-only vertex scale of 1.2x the
// authored model units. Uniform across all 123 NPC defs, so it stays a
// constant here rather than catalog data. Players carry no such directive
// and render at 1.0x; this asymmetry is part of the source's intended
// player-vs-NPC proportion (a TN-002 guard is meant to loom).
const PT_NPC_MODEL_SCALE = 1.2;

export const PT_NPC_VISUALS: Record<string, VisualDef> = {};
export const PT_NPC_KEYS: Record<string, string> = {};

for (const [defKey, rec] of Object.entries(PT_NPC_DEFS)) {
  if (!rec.glb) continue; // unresolved model: npc_villager fallback, logged in npcs.json
  const visualKey = `npc_pt_${defKey}`;
  const clips: ClipMap = {
    idle: 'STAND',
    walk: 'WALK',
    run: 'WALK',
    // NPCs never attack; the clip slot is required by ClipMap but the
    // animation state machine tolerates an absent clip on the GLB.
    attack: [],
  };
  const def: VisualDef = {
    url: rec.glb,
    clips,
    lazyPreload: true,
    // measured bind-pose Y extent in PT units -> WoC yards, times the
    // source's uniform 1.2x NPC render scale; the GLB bounds ARE the truth.
    height: (rec.height ?? 50) * PT_YD * PT_NPC_MODEL_SCALE,
    rawHeight: rec.height ?? undefined,
  };
  PT_NPC_VISUALS[visualKey] = def;
  PT_NPC_KEYS[ptNpcTemplateId(defKey)] = visualKey;
}
