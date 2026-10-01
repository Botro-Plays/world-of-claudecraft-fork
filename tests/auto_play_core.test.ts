import { describe, expect, it } from 'vitest';
import {
  type AutoPlayTickInput,
  decideAutoPlayTick,
  pickNearestHostile,
  poolPct,
} from '../src/ui/hud/action_bar/auto_play_core';
import { parseAutoPlaySettings } from '../src/ui/hud/action_bar/auto_play_settings_core';

function base(over: Partial<AutoPlayTickInput> = {}): AutoPlayTickInput {
  return {
    dead: false,
    hpPct: 100,
    manaPct: 100,
    settings: parseAutoPlaySettings(null),
    hpPotionId: 'minor_healing_potion',
    mpPotionId: 'minor_mana_potion',
    readySupportIds: [],
    readyAttackIds: [],
    currentTargetId: null,
    currentTargetValid: false,
    nearestHostile: null,
    autoAttack: false,
    busy: false,
    ...over,
  };
}

describe('poolPct', () => {
  it('clamps and handles a zero max', () => {
    expect(poolPct(50, 100)).toBe(50);
    expect(poolPct(0, 0)).toBe(100);
  });
});

describe('pickNearestHostile', () => {
  it('respects range and picks the closest id on a tie', () => {
    expect(
      pickNearestHostile(
        [
          { id: 2, distYd: 6, boss: false },
          { id: 1, distYd: 6, boss: false },
          { id: 3, distYd: 12, boss: false },
        ],
        10,
        false,
      ),
    ).toEqual({ id: 1, distYd: 6, boss: false });
    expect(pickNearestHostile([{ id: 1, distYd: 12, boss: false }], 10, false)).toBeNull();
  });

  it('prefers a boss when prioritizeBoss is on', () => {
    expect(
      pickNearestHostile(
        [
          { id: 1, distYd: 2, boss: false },
          { id: 2, distYd: 8, boss: true },
        ],
        10,
        true,
      ),
    ).toEqual({ id: 2, distYd: 8, boss: true });
  });
});

describe('decideAutoPlayTick', () => {
  it('stops auto-attack on death', () => {
    expect(decideAutoPlayTick(base({ dead: true, autoAttack: true }))).toEqual({
      kind: 'stopAutoAttack',
    });
  });

  it('drinks an HP potion before hunting', () => {
    expect(decideAutoPlayTick(base({ hpPct: 20 }))).toEqual({
      kind: 'useItem',
      itemId: 'minor_healing_potion',
    });
  });

  it('skips HP potions when Auto HP is off', () => {
    const settings = { ...parseAutoPlaySettings(null), autoHp: false };
    expect(decideAutoPlayTick(base({ hpPct: 20, settings }))).toEqual({ kind: 'none' });
  });

  it('targets the nearest hostile, then engages, then casts', () => {
    expect(
      decideAutoPlayTick(
        base({
          nearestHostile: { id: 9, distYd: 4, boss: false },
          readyAttackIds: ['fireball'],
        }),
      ),
    ).toEqual({ kind: 'target', entityId: 9 });
    expect(
      decideAutoPlayTick(
        base({
          currentTargetValid: true,
          currentTargetId: 9,
          readyAttackIds: ['fireball'],
        }),
      ),
    ).toEqual({ kind: 'startAutoAttack' });
    expect(
      decideAutoPlayTick(
        base({
          currentTargetValid: true,
          currentTargetId: 9,
          autoAttack: true,
          readyAttackIds: ['fireball'],
        }),
      ),
    ).toEqual({ kind: 'cast', abilityId: 'fireball' });
  });

  it('hunts before support when a hostile is in range', () => {
    expect(
      decideAutoPlayTick(
        base({
          readySupportIds: ['frost_armor'],
          nearestHostile: { id: 1, distYd: 3, boss: false },
          readyAttackIds: ['fireball'],
        }),
      ),
    ).toEqual({ kind: 'target', entityId: 1 });
  });

  it('casts support only while idle with no hostiles nearby', () => {
    expect(
      decideAutoPlayTick(
        base({
          readySupportIds: ['frost_armor'],
          nearestHostile: null,
        }),
      ),
    ).toEqual({ kind: 'cast', abilityId: 'frost_armor' });
  });

  it('skips casts while busy but still targets', () => {
    expect(
      decideAutoPlayTick(
        base({
          busy: true,
          readySupportIds: ['frost_armor'],
          nearestHostile: { id: 1, distYd: 3, boss: false },
        }),
      ),
    ).toEqual({ kind: 'target', entityId: 1 });
  });
});
