import { describe, expect, it } from 'vitest';
import { ptMouseSkillSlot } from '../src/game/pt_mouse_skills';
import {
  PT_MOUSE_LEFT_BAR_SLOT,
  PT_MOUSE_RIGHT_BAR_SLOT,
} from '../src/ui/hud/action_bar/mouse_skill_picker_view';

describe('ptMouseSkillSlot', () => {
  it('maps LMB on an entity to the left well and RMB to the right well', () => {
    expect(
      ptMouseSkillSlot(0, { pickedEntityId: 7, worldUiConsumed: false, hasTarget: true }),
    ).toBe(PT_MOUSE_LEFT_BAR_SLOT);
    expect(
      ptMouseSkillSlot(2, { pickedEntityId: 7, worldUiConsumed: false, hasTarget: true }),
    ).toBe(PT_MOUSE_RIGHT_BAR_SLOT);
  });

  it('casts on ground clicks when a target is already live (PT sticky feel)', () => {
    expect(
      ptMouseSkillSlot(0, { pickedEntityId: null, worldUiConsumed: false, hasTarget: true }),
    ).toBe(PT_MOUSE_LEFT_BAR_SLOT);
    expect(
      ptMouseSkillSlot(2, { pickedEntityId: null, worldUiConsumed: false, hasTarget: true }),
    ).toBe(PT_MOUSE_RIGHT_BAR_SLOT);
  });

  it('skips ground clicks with no target so clear-target / click-to-move stay alone', () => {
    expect(
      ptMouseSkillSlot(0, { pickedEntityId: null, worldUiConsumed: false, hasTarget: false }),
    ).toBeNull();
    expect(
      ptMouseSkillSlot(2, { pickedEntityId: null, worldUiConsumed: false, hasTarget: false }),
    ).toBeNull();
  });

  it('skips clicks that already opened a world UI', () => {
    expect(
      ptMouseSkillSlot(0, { pickedEntityId: 3, worldUiConsumed: true, hasTarget: true }),
    ).toBeNull();
    expect(
      ptMouseSkillSlot(2, { pickedEntityId: 3, worldUiConsumed: true, hasTarget: true }),
    ).toBeNull();
  });

  it('ignores middle / extra mouse buttons', () => {
    expect(
      ptMouseSkillSlot(1, { pickedEntityId: 3, worldUiConsumed: false, hasTarget: true }),
    ).toBeNull();
    expect(
      ptMouseSkillSlot(3, { pickedEntityId: 3, worldUiConsumed: false, hasTarget: true }),
    ).toBeNull();
  });
});
