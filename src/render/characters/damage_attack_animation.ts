// Pure event gate for physical-hit attack gestures. Casts with an authored
// full-body one-shot keep ownership of the rig while ordinary melee damage is
// still allowed to resolve underneath them.

import { playerRangedAttackAlreadyStarted } from './skin_attack';

export interface DamageAttackAnimationContext {
  sourceKind: string | undefined;
  attackAnimationStarted: boolean | undefined;
  castingAbility: string | null | undefined;
  authoredCastOwnsBody: boolean;
  // The damaging ability's authored clip is still playing (its release was
  // deferred to the clip's event frame): a restart would snap the rig.
  authoredGestureInFlight?: boolean;
}

export function shouldStartDamageAttackAnimation({
  sourceKind,
  attackAnimationStarted,
  castingAbility,
  authoredCastOwnsBody,
  authoredGestureInFlight,
}: DamageAttackAnimationContext): boolean {
  if (playerRangedAttackAlreadyStarted(sourceKind, attackAnimationStarted)) return false;
  if (sourceKind === 'mob' && castingAbility !== null && authoredCastOwnsBody) return false;
  // A PT skill's windup already started the authored SKILL clip at cast time
  // and its damage lands on the clip's EventFrame, mid-gesture: restarting the
  // same one-shot on impact would snap the rig back to frame 0.
  if (authoredGestureInFlight) return false;
  return true;
}

/** A character visual's authored-clip lookup (CharacterVisual, structurally). */
export interface AttackClipOverrideSource {
  hasAttackClipOverride(abilityId: string): boolean;
  isMidOneShot?: boolean;
}

/**
 * Resolve the gate above from the live source entity and its active visual,
 * moved verbatim from the renderer's damage-event arm: an authored full-body
 * cast clip on a casting mob owns the rig, so the landing damage must not
 * restart a generic attack gesture underneath it. The same is true of a
 * windup-telegraphed ability whose authored clip is still playing when its
 * deferred damage lands (PT EventFrame releases).
 */
export function damageEventStartsAttackAnimation(
  source: { kind: string; castingAbility?: string | null } | undefined,
  sourceVisual: AttackClipOverrideSource | null,
  attackAnimationStarted: boolean | undefined,
  abilityId?: string,
): boolean {
  const authoredCastOwnsBody =
    source?.kind === 'mob' &&
    source.castingAbility !== null &&
    source.castingAbility !== undefined &&
    sourceVisual?.hasAttackClipOverride(source.castingAbility) === true;
  const authoredGestureInFlight =
    abilityId !== undefined &&
    sourceVisual?.isMidOneShot === true &&
    sourceVisual.hasAttackClipOverride(abilityId);
  return shouldStartDamageAttackAnimation({
    sourceKind: source?.kind,
    attackAnimationStarted,
    castingAbility: source?.castingAbility,
    authoredCastOwnsBody,
    authoredGestureInFlight,
  });
}
