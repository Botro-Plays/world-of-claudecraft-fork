// Pure model for the PT mouse-skill picker (LMB / RMB wells). DOM-free so a
// Vitest can pin assignable rows, empty copy, and well titles without Hud.

export type MouseSkillWell = 'left' | 'right';

export const MOUSE_SKILL_ATTACK_ID = 'attack';

export type MouseSkillPickerRow = {
  id: string;
  selected: boolean;
};

export type MouseSkillAssigned = {
  isAttack: boolean;
  abilityId: string | null;
};

export type MouseSkillPickerView = {
  well: MouseSkillWell;
  titleKey: 'hudChrome.mouseSkills.leftButton' | 'hudChrome.mouseSkills.rightButton';
  count: number;
  empty: boolean;
  assignedIsAttack: boolean;
  assignedId: string | null;
  rows: MouseSkillPickerRow[];
};

export function mouseSkillWellTitleKey(well: MouseSkillWell): MouseSkillPickerView['titleKey'] {
  switch (well) {
    case 'left':
      return 'hudChrome.mouseSkills.leftButton';
    case 'right':
      return 'hudChrome.mouseSkills.rightButton';
    default: {
      const _never: never = well;
      return _never;
    }
  }
}

/** L/R wells park the last two primary-bar seats so slots 0-9 stay the 1-0 row. */
export const PT_MOUSE_LEFT_BAR_SLOT = 10;
export const PT_MOUSE_RIGHT_BAR_SLOT = 11;

export function buildMouseSkillPickerView(input: {
  well: MouseSkillWell;
  knownIds: readonly string[];
  assigned: MouseSkillAssigned;
}): MouseSkillPickerView {
  const assignedId = input.assigned.abilityId;
  const rows: MouseSkillPickerRow[] = input.knownIds.map((id) => ({
    id,
    selected: assignedId === id,
  }));
  return {
    well: input.well,
    titleKey: mouseSkillWellTitleKey(input.well),
    count: rows.length,
    empty: rows.length === 0,
    assignedIsAttack: false,
    assignedId,
    rows,
  };
}

export function mouseWellBarSlot(well: MouseSkillWell): number {
  switch (well) {
    case 'left':
      return PT_MOUSE_LEFT_BAR_SLOT;
    case 'right':
      return PT_MOUSE_RIGHT_BAR_SLOT;
    default: {
      const _never: never = well;
      return _never;
    }
  }
}

export function mouseWellActionIndex(well: MouseSkillWell): number {
  return mouseWellBarSlot(well) - 1;
}

export function mouseSkillPickerSignature(view: MouseSkillPickerView): string {
  return [
    view.well,
    view.assignedIsAttack ? '1' : '0',
    view.assignedId ?? '',
    String(view.count),
    view.rows.map((row) => `${row.id}:${row.selected ? '1' : '0'}`).join(','),
  ].join('|');
}
