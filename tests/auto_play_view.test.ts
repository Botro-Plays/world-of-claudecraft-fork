import { describe, expect, it } from 'vitest';
import { parseAutoPlaySettings } from '../src/ui/hud/action_bar/auto_play_settings_core';
import { autoPlayViewSignature, buildAutoPlayView } from '../src/ui/hud/action_bar/auto_play_view';

describe('buildAutoPlayView', () => {
  it('copies ToA hunt state and lists pick rows only while picking', () => {
    const settings = {
      ...parseAutoPlaySettings(null),
      mode: 'wander' as const,
      prioritizeBoss: true,
      leashYd: 25,
    };
    const idle = buildAutoPlayView({
      settings,
      tab: 'hunt',
      running: false,
      walkByAutoloot: true,
      pick: null,
      knownIds: ['heal', 'fireball'],
    });
    expect(idle.walkByAutoloot).toBe(true);
    expect(idle.mode).toBe('wander');
    expect(idle.prioritizeBoss).toBe(true);
    expect(idle.leashYd).toBe(25);
    expect(idle.autoHp).toBe(true);
    expect(idle.pickRows).toEqual([]);
    const picking = buildAutoPlayView({
      settings,
      tab: 'hunt',
      running: true,
      walkByAutoloot: true,
      pick: { group: 'attack', index: 0 },
      knownIds: ['heal', 'fireball'],
    });
    expect(picking.running).toBe(true);
    expect(picking.pickRows).toEqual(['heal', 'fireball']);
    expect(autoPlayViewSignature(idle)).not.toBe(autoPlayViewSignature(picking));
  });
});
