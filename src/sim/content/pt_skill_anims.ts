import {
  PT_SKILL_ANIMS as GENERATED_PT_SKILL_ANIMS,
  PT_SKILL_RELEASE_SEC as GENERATED_PT_SKILL_RELEASE_SEC,
} from '../../../generated/pt-maps/pt_skill_anims.generated';

export interface PtSkillAnimEntry {
  donor: string;
  clips: Record<string, string>;
}

// Per-class PT skill animation bindings generated from the authentic MagicPT
// INX SkillCodeList table (see scripts/pt-port/build_pt_skill_anims.ts).
// Keys are pt_* ability ids; clip names live inside the class's shared
// mesh-free donor GLB, merged onto the body rig via VisualDef.animUrls.
// PT skills with no bound SKILL motion (bow/spear throws, Raving, ...) play
// their normal weapon swing in PT too, so they intentionally get no entry.
export const PT_SKILL_ANIMS: Record<string, PtSkillAnimEntry> = GENERATED_PT_SKILL_ANIMS;

// Seconds into a PT skill's gesture clip where the authored EventFrame fires
// the effect (projectile leaves the hand mid-swing). casting_lifecycle defers
// a cast's projectile/damage outcome by this offset so the gesture visibly
// leads the release, exactly like the PT client. Unlisted ids (melee swings,
// the ten weapon-shot skills) release at cast time.
export const PT_SKILL_RELEASE_SEC: Record<string, number> =
  GENERATED_PT_SKILL_RELEASE_SEC;
