// Client-only reconstruction of the server's talent and ability presentation.
import { abilitiesKnownAt } from '../sim/content/classes';
import {
  emptyAllocation,
  repairAllocation,
  type SavedLoadout,
  type TalentAllocation,
} from '../sim/content/talents';
import {
  sanitizePtSkillMastery,
  sanitizePtSkillRanks,
} from '../sim/progression/pt_skills';
import { computeCharacterModifiers } from '../sim/set_bonus_mods';
import { mergeAugmentMods } from '../sim/social/fiesta';
import { parseTalentAllocation } from '../sim/talent_allocation_input';
import { repairTalentLoadouts } from '../sim/talent_loadouts';
import type { EquipSlot, PlayerClass } from '../sim/types';

interface PresentationState {
  talents: TalentAllocation;
  loadouts: SavedLoadout[];
  activeLoadout: number;
  equipment: Partial<Record<EquipSlot, string>>;
  questsDone: Set<string>;
  // PT skill-point investment mirrors (the `tal` block's ptSkills/ptMastery);
  // absent/omitted on WoC classes and pre-feature servers.
  ptSkills: Record<string, number>;
  ptSkillMastery: Record<string, number>;
}
interface TalentWire {
  alloc?: unknown;
  loadouts?: unknown;
  activeLoadout?: unknown;
  ptSkills?: unknown;
  ptMastery?: unknown;
}

export function buildClientAbilityPresentation(
  cls: PlayerClass,
  level: number,
  current: PresentationState,
  wire: TalentWire | null | undefined,
  augments: string[],
) {
  let { talents, loadouts, activeLoadout, ptSkills, ptSkillMastery } = current;
  if (wire) {
    const parsed = parseTalentAllocation(wire.alloc);
    if (parsed) {
      talents = repairAllocation(cls, parsed, level);
      ({ loadouts, activeLoadout } = repairTalentLoadouts(
        cls,
        level,
        wire.loadouts,
        wire.activeLoadout,
      ));
    }
    // PT investment travels in the same heavy block. Same sanitize the sim's
    // load path applies (foreign ids drop, ranks clamp to 1..10, an overspent
    // pool wipes) so a stale or forged wire never shows phantom ranks.
    if (wire.ptSkills !== undefined) {
      ptSkills = sanitizePtSkillRanks(cls, level, wire.ptSkills, current.questsDone);
    }
    if (wire.ptMastery !== undefined) {
      ptSkillMastery = sanitizePtSkillMastery(cls, wire.ptMastery);
    }
  }
  talents ??= emptyAllocation();
  const base = computeCharacterModifiers(cls, talents, level, current.equipment);
  const mods = augments.length ? mergeAugmentMods(base, augments) : base;
  return {
    talents,
    loadouts,
    activeLoadout,
    mods,
    ptSkills,
    ptSkillMastery,
    // The invested rank map feeds abilitiesKnownAt's PT branch: a pt_* skill
    // is known only while it holds >= 1 invested point, at exactly that rank.
    known: abilitiesKnownAt(cls, level, mods, current.questsDone, ptSkills),
  };
}
