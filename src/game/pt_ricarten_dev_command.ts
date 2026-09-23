// Dev-build chat command that teleports the local player to the PT Ricarten
// field (village-2). This is a development/testing mechanism for P1 local
// validation - NOT a gameplay portal. Production portals are P2 work.
//
// Usage: /ricarten or /pt
// Dev builds only (import.meta.env.DEV).

import { PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z } from '../sim/pt_band';
import { ptRicartenSpawnY } from '../sim/pt_ricarten_field';
import type { Entity } from '../sim/types';

export interface PtDevHud {
  log(text: string, color?: string): void;
}

/**
 * Handle the /ricarten dev chat command. Returns true when handled.
 * Sets the player entity's position directly (like the Ignivar placer's
 * teleports); the movement kernel resolves Y on the next tick.
 */
export function tryPtRicartenDevCommand(
  raw: string,
  hud: PtDevHud,
  player: Entity | undefined,
): boolean {
  const m = raw.trim().match(/^\/(?:ricarten|pt)\b/i);
  if (!m) return false;
  if (!import.meta.env.DEV) return false;
  if (!player) {
    hud.log('[dev] no player entity', '#ff6a6a');
    return true;
  }

  // Set position to the Ricarten start point (WoC coordinates).
  player.pos.x = PT_RICARTEN_SPAWN_X;
  player.pos.z = PT_RICARTEN_SPAWN_Z;
  player.pos.y = ptRicartenSpawnY(PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z);
  player.prevPos.x = player.pos.x;
  player.prevPos.y = player.pos.y;
  player.prevPos.z = player.pos.z;

  hud.log(
    `[dev] teleported to Ricarten (${PT_RICARTEN_SPAWN_X.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${PT_RICARTEN_SPAWN_Z.toFixed(1)})`,
    '#8fd0ff',
  );
  return true;
}
