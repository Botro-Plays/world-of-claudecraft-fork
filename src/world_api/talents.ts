import type { Role, SavedLoadout, TalentAllocation, TalentRowLevel } from '../sim/content/talents';
import type { PtSkillInfoView } from '../sim/progression/pt_skills';

export interface IWorldTalents {
  // Talents & Specializations. State is server-authoritative; the client stages
  // edits locally and commits via applyTalents (the server re-validates).
  talents: TalentAllocation;
  talentSpec: string | null;
  talentRole: Role | null;
  loadouts: SavedLoadout[];
  activeLoadout: number;
  talentPoints(): { total: number; spent: number };
  applyTalents(alloc: TalentAllocation): void;
  respec(): void;
  setSpec(specId: string | null): void;
  selectTalentRow(level: TalentRowLevel, optionId: string | null): void;
  /** `captureGear` stores the worn set on the loadout (src/sim/loadout_gear.ts).
   *  Opt-in and last, so an existing caller keeps its arity and its behavior. */
  saveLoadout(
    name: string,
    bar: (string | null)[],
    alloc?: TalentAllocation,
    captureGear?: boolean,
  ): void;
  switchLoadout(index: number): void;
  deleteLoadout(index: number): void;
  // PT skill-point investment (MagicPT port, PT classes only): `ptSkills` is
  // the server-authoritative skill id -> invested rank map mirrored from the
  // snapshot `tal` block ({} on WoC classes). The verbs are wire commands the
  // server re-validates through progression/pt_skills.ts (pool, tier extent,
  // previous-skill chain, level gate, rank cap); ptSkillInfo is the local
  // pool/book read for the skill window (null for non-PT classes).
  ptSkills: Record<string, number>;
  ptSkillInfo(): PtSkillInfoView | null;
  investPtSkill(skillId: string): void;
  resetPtSkills(): void;
}
