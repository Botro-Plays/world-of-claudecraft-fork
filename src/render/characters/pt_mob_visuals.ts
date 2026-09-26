// Generated PT monster visuals, adapted from
// generated/pt-maps/pt_mob_catalog.generated.ts (scripts/pt-port emitter)
// into ordinary VisualDef/MOB_KEYS entries. One entry per actor-referenced
// registry key, all under public/models/creatures/pt/.
//
// Every def is lazyPreload: 200+ converted PT monster GLBs must never join
// the boot preload sweep; each is fetched on first sight through the normal
// streamed-asset path (ensureCharacterUrl -> onCharacterAssetReady rebuild).
// Clips use the catalog's own mapping (PT clip names preserved); entries
// with no authored death or hit clip simply omit them, which the animation
// state machine already tolerates (missing clip -> null action).

import { PT_MOB_CATALOG } from '../../../generated/pt-maps/pt_mob_catalog.generated';
import type { ClipMap, VisualDef } from './manifest';

const PT_CREATURES = 'models/creatures/pt';

export const PT_MOB_VISUALS: Record<string, VisualDef> = {};
export const PT_MOB_KEYS: Record<string, string> = {};

for (const rec of Object.values(PT_MOB_CATALOG)) {
  const visualKey = `mob_pt_${rec.key}`;
  const v = rec.visual;
  const clips: ClipMap = {
    idle: v.clips.idle ?? 'STAND',
    walk: v.clips.walk ?? v.clips.idle ?? 'WALK',
    run: v.clips.run ?? v.clips.walk ?? v.clips.idle ?? 'WALK',
    attack: v.clips.attack,
  };
  if (v.clips.death) clips.death = v.clips.death;
  if (v.clips.hit.length > 0) clips.hit = v.clips.hit;
  const def: VisualDef = {
    url: `${PT_CREATURES}/${v.file}`,
    height: v.height,
    clips,
    lazyPreload: true,
  };
  if (v.dieFile) def.deathModelUrl = `${PT_CREATURES}/${v.dieFile}`;
  PT_MOB_VISUALS[visualKey] = def;
  PT_MOB_KEYS[`pt_${rec.key}`] = visualKey;
}
