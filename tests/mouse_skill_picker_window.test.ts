// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MouseSkillPickerWindow } from '../src/ui/hud/action_bar/mouse_skill_picker_window';

vi.mock('../src/game/audio', () => ({ audio: { click: vi.fn() } }));

function makePicker(): MouseSkillPickerWindow {
  const root = document.createElement('div');
  root.id = 'pt-mouse-skill-picker';
  const autoPlayRoot = document.createElement('div');
  autoPlayRoot.id = 'pt-auto-play';
  document.body.append(root, autoPlayRoot);
  return new MouseSkillPickerWindow({
    root: () => root,
    autoPlayRoot: () => autoPlayRoot,
    knownIds: () => [],
    assigned: () => ({ isAttack: true, abilityId: null }),
    editAllowed: () => true,
    walkByAutoloot: () => false,
    setWalkByAutoloot: () => undefined,
    onAssignAbility: () => undefined,
    onClear: () => undefined,
    isAutoRunning: () => false,
    onToggleAuto: () => undefined,
  });
}

describe('MouseSkillPickerWindow.attach', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('parks L and R wells in the dedicated mouse hosts, off the numbered skill row', () => {
    const skillRow = document.createElement('div');
    skillRow.id = 'actionbar';
    const left = document.createElement('button');
    left.dataset.hotbarSlot = '0';
    const right = document.createElement('button');
    right.dataset.hotbarSlot = '1';
    skillRow.append(left, right);

    const leftHost = document.createElement('div');
    leftHost.id = 'pt-mouse-l';
    const rightHost = document.createElement('div');
    rightHost.id = 'pt-mouse-r';
    document.body.append(skillRow, leftHost, rightHost);

    makePicker().attach(left, right, null);

    expect(leftHost.contains(left)).toBe(true);
    expect(rightHost.contains(right)).toBe(true);
    expect(skillRow.contains(left)).toBe(false);
    expect(skillRow.contains(right)).toBe(false);
  });
});
