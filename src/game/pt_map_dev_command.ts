// /ptmap and /ptmaps dev chat commands: the thin, always-bundled half of the
// PT map test harness. The heavy half (manifest enumeration + lazy generated
// field/stage-object loading) lives in pt_dev_maps.ts and is reached only
// through the dynamic import below, so a production build drops the whole
// harness, including every generated/pt-maps chunk, when import.meta.env.DEV
// folds to false.
//
// Usage:
//   /ptmap <id>   load generated/pt-maps/<id>/ into the PT band and spawn
//   /ptmap off    restore the production Ricarten binding
//   /ptmaps       enumerate every converted package with QA columns
//   /ptmaplinks   print the active field's source-authentic connections
//                 (FieldGate / WarpGate / wing UI / item / server), or
//                 /ptmaplinks <id|index> for any registered field
//
// This is a development inspection mechanism only. It is NOT production map
// routing: the selected map installs through src/sim/pt_field_active.ts and
// restores Ricarten on /ptmap off, and nothing here registers map ids
// anywhere the game resolves portals or zones.

import type { Entity } from '../sim/types';
import type { PtDevHud } from './pt_ricarten_dev_command';

/** True when the chat line is a /ptmap, /ptmaps or /ptmaplinks command. */
export function isPtMapDevCommand(raw: string): boolean {
  return /^\/ptmaps?\b/i.test(raw.trim()) || /^\/ptmaplinks\b/i.test(raw.trim());
}

/**
 * Dispatch the command. Fire-and-forget from the chat hook: map packages
 * load asynchronously, so the hook consumes the line immediately and the
 * result lands in the dev log when the load resolves.
 */
export function execPtMapDevCommand(
  raw: string,
  hud: PtDevHud,
  player: Entity | undefined,
): void {
  if (!import.meta.env.DEV) return;
  void import('./pt_dev_maps')
    .then((m) => m.execPtMapDevCommand(raw, hud, player))
    .catch((err) => {
      hud.log(`[dev] /ptmap failed: ${err instanceof Error ? err.message : String(err)}`, '#ff6a6a');
    });
}

/**
 * Per-frame FieldGate boundary watch (the PT client's PlayNearGateField
 * cadence) plus the WarpGate trigger check (the client's per-frame
 * StageField[OnStageField]->CheckWarpGate call). Runs whenever a PT field
 * descriptor is bound - including the default Ricarten binding, which is a
 * real graph participant in production: the watch preloads the
 * neighboring field's package into the standby slot when the player nears
 * an authored gate point, and the warp check teleports on an authored
 * trigger. The modules stay dynamically imported so the first PT-band
 * frame loads them once and later frames resolve from the module cache.
 */
export function tickPtMapDev(player: Entity | undefined, nowMs: number): void {
  if (!player) return;
  void import('./pt_field_links')
    .then((m) => m.tickPtFieldGates(player.pos.x, player.pos.z))
    .catch(() => undefined);
  void import('./pt_warp_gates')
    .then((m) => m.tickPtWarpGates(player, nowMs))
    .catch(() => undefined);
}
