import { describe, expect, it } from 'vitest';
import {
  buildMouseSkillPickerView,
  MOUSE_SKILL_ATTACK_ID,
  mouseSkillPickerSignature,
  mouseSkillWellTitleKey,
  mouseWellActionIndex,
  mouseWellBarSlot,
  PT_MOUSE_LEFT_BAR_SLOT,
  PT_MOUSE_RIGHT_BAR_SLOT,
} from '../src/ui/hud/action_bar/mouse_skill_picker_view';

describe('mouseSkillWellTitleKey', () => {
  it('names the left and right wells', () => {
    expect(mouseSkillWellTitleKey('left')).toBe('hudChrome.mouseSkills.leftButton');
    expect(mouseSkillWellTitleKey('right')).toBe('hudChrome.mouseSkills.rightButton');
  });
});

describe('PT mouse well slots', () => {
  it('parks L/R on the last two primary-bar seats so 1-0 stay on the skill row', () => {
    expect(PT_MOUSE_LEFT_BAR_SLOT).toBe(10);
    expect(PT_MOUSE_RIGHT_BAR_SLOT).toBe(11);
    expect(mouseWellBarSlot('left')).toBe(10);
    expect(mouseWellBarSlot('right')).toBe(11);
    expect(mouseWellActionIndex('left')).toBe(9);
    expect(mouseWellActionIndex('right')).toBe(10);
  });
});

describe('buildMouseSkillPickerView', () => {
  it('lists known skills on the left well without an Attack row', () => {
    const view = buildMouseSkillPickerView({
      well: 'left',
      knownIds: ['fireball', 'frostbolt'],
      assigned: { isAttack: false, abilityId: 'fireball' },
    });
    expect(view.rows.some((row) => row.id === MOUSE_SKILL_ATTACK_ID)).toBe(false);
    expect(view.rows[0]).toEqual({ id: 'fireball', selected: true });
    expect(view.empty).toBe(false);
    expect(view.count).toBe(2);
    expect(view.assignedIsAttack).toBe(false);
  });

  it('selects the assigned ability on the right well', () => {
    const view = buildMouseSkillPickerView({
      well: 'right',
      knownIds: ['fireball', 'frostbolt'],
      assigned: { isAttack: false, abilityId: 'frostbolt' },
    });
    expect(view.rows.find((row) => row.id === 'frostbolt')?.selected).toBe(true);
    expect(view.empty).toBe(false);
    expect(view.assignedId).toBe('frostbolt');
  });

  it('treats a well with no known skills as empty', () => {
    const view = buildMouseSkillPickerView({
      well: 'right',
      knownIds: [],
      assigned: { isAttack: false, abilityId: null },
    });
    expect(view.empty).toBe(true);
    expect(view.rows).toEqual([]);
    expect(view.count).toBe(0);
  });
});

describe('mouseSkillPickerSignature', () => {
  it('changes when the assigned skill changes', () => {
    const base = {
      well: 'right' as const,
      knownIds: ['fireball'],
      assigned: { isAttack: false, abilityId: null as string | null },
    };
    const empty = mouseSkillPickerSignature(buildMouseSkillPickerView(base));
    const filled = mouseSkillPickerSignature(
      buildMouseSkillPickerView({ ...base, assigned: { isAttack: false, abilityId: 'fireball' } }),
    );
    expect(empty).not.toBe(filled);
  });
});
