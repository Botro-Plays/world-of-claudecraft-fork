// Pure Auto Play hunt decisions (ToA-style priority). DOM-free so Vitest
// drives potions, target pick, and skill casts without Hud.

import type { AutoPlaySettings } from './auto_play_settings_core';

export type AutoPlayAction =
  | { kind: 'none' }
  | { kind: 'useItem'; itemId: string }
  | { kind: 'target'; entityId: number }
  | { kind: 'startAutoAttack' }
  | { kind: 'stopAutoAttack' }
  | { kind: 'cast'; abilityId: string };

export interface AutoPlayHostileCandidate {
  id: number;
  distYd: number;
  /** Elite / boss mob: preferred when prioritizeBoss is on. */
  boss: boolean;
}

export interface AutoPlayTickInput {
  dead: boolean;
  hpPct: number;
  /** Null when the class does not spend mana. */
  manaPct: number | null;
  settings: AutoPlaySettings;
  hpPotionId: string | null;
  mpPotionId: string | null;
  /** Assigned support skills that are known and currently castable. */
  readySupportIds: readonly string[];
  /** Assigned attack skills that are known and currently castable. */
  readyAttackIds: readonly string[];
  currentTargetId: number | null;
  currentTargetValid: boolean;
  nearestHostile: AutoPlayHostileCandidate | null;
  autoAttack: boolean;
  /** Casting or on GCD: skip skill casts, still allow potions and targeting. */
  busy: boolean;
}

export function poolPct(current: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(current) || !Number.isFinite(max)) return 100;
  return Math.max(0, Math.min(100, (current / max) * 100));
}

export function pickNearestHostile(
  candidates: readonly AutoPlayHostileCandidate[],
  rangeYd: number,
  prioritizeBoss: boolean,
): AutoPlayHostileCandidate | null {
  let best: AutoPlayHostileCandidate | null = null;
  for (const c of candidates) {
    if (!(c.distYd <= rangeYd)) continue;
    if (!best) {
      best = c;
      continue;
    }
    if (prioritizeBoss && c.boss !== best.boss) {
      if (c.boss) best = c;
      continue;
    }
    if (c.distYd < best.distYd || (c.distYd === best.distYd && c.id < best.id)) {
      best = c;
    }
  }
  return best;
}

export function decideAutoPlayTick(input: AutoPlayTickInput): AutoPlayAction {
  if (input.dead) {
    return input.autoAttack ? { kind: 'stopAutoAttack' } : { kind: 'none' };
  }

  const { settings } = input;
  if (settings.autoHp && input.hpPotionId && input.hpPct < settings.hpBelow) {
    return { kind: 'useItem', itemId: input.hpPotionId };
  }
  if (
    settings.autoMp &&
    input.mpPotionId &&
    input.manaPct !== null &&
    input.manaPct < settings.mpBelow
  ) {
    return { kind: 'useItem', itemId: input.mpPotionId };
  }

  // Hunt first while anything hostile is in range. Support (buffs) only runs
  // when idle, otherwise it monopolizes the GCD and never engages.
  const hunting = input.currentTargetValid || input.nearestHostile !== null;

  if (hunting) {
    if (!input.currentTargetValid) {
      if (input.nearestHostile) {
        return { kind: 'target', entityId: input.nearestHostile.id };
      }
      if (input.autoAttack) return { kind: 'stopAutoAttack' };
      return { kind: 'none' };
    }

    if (!input.autoAttack) return { kind: 'startAutoAttack' };

    if (!input.busy) {
      const attackId = input.readyAttackIds[0];
      if (attackId) return { kind: 'cast', abilityId: attackId };
    }

    return { kind: 'none' };
  }

  if (!input.busy) {
    const supportId = input.readySupportIds[0];
    if (supportId) return { kind: 'cast', abilityId: supportId };
  }

  if (input.autoAttack) return { kind: 'stopAutoAttack' };
  return { kind: 'none' };
}
