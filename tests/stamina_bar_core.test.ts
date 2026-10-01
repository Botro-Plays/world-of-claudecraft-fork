import { describe, expect, it } from 'vitest';
import { staminaBarView } from '../src/ui/hud/vitals/stamina_bar_core';
import { unitFrameCurrentMaxText } from '../src/ui/hud_frames';
import { healthFromStamina } from '../src/ui/stat_tooltip';

describe('staminaBarView', () => {
  it('uses the same first-20-then-10 HP-from-STA table as the character sheet', () => {
    expect(staminaBarView(0).pool).toBe(0);
    expect(staminaBarView(20).pool).toBe(20);
    expect(staminaBarView(28).pool).toBe(100);
    expect(staminaBarView(-5).pool).toBe(0);
    for (const sta of [1, 19, 21, 45, 120]) {
      expect(staminaBarView(sta).pool).toBe(healthFromStamina(sta));
    }
  });

  it('paints current / max from that pool and fills the bar when STA contributes HP', () => {
    const view = staminaBarView(28);
    expect(view.text).toBe(unitFrameCurrentMaxText(100, 100));
    expect(view.fillFrac).toBe(1);
    expect(view.fillTransform).toBe('scaleX(1)');
  });

  it('empties the fill when stamina contributes no HP', () => {
    const view = staminaBarView(0);
    expect(view.text).toBe(unitFrameCurrentMaxText(0, 0));
    expect(view.fillFrac).toBe(0);
    expect(view.fillTransform).toBe('scaleX(0)');
  });
});
