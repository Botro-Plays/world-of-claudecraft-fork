import { describe, expect, it } from 'vitest';
import {
  AUTO_PLAY_HP_DEFAULT,
  AUTO_PLAY_SLOT_COUNT,
  clampLeashYd,
  clampPct,
  clampRangeYd,
  loadAutoPlaySettings,
  parseAutoPlaySettings,
  saveAutoPlaySettings,
  setAutoPlaySlot,
} from '../src/ui/hud/action_bar/auto_play_settings_core';

describe('clampPct', () => {
  it('pins potion thresholds to 5..95', () => {
    expect(clampPct(0)).toBe(5);
    expect(clampPct(100)).toBe(95);
    expect(clampPct(35.4)).toBe(35);
    expect(clampPct(Number.NaN)).toBe(AUTO_PLAY_HP_DEFAULT);
  });
});

describe('clampRangeYd', () => {
  it('pins hunt range to 1..40 yards', () => {
    expect(clampRangeYd(0)).toBe(1);
    expect(clampRangeYd(99)).toBe(40);
    expect(clampRangeYd(5)).toBe(5);
  });
});

describe('clampLeashYd', () => {
  it('pins leash to 5..40 yards', () => {
    expect(clampLeashYd(0)).toBe(5);
    expect(clampLeashYd(99)).toBe(40);
    expect(clampLeashYd(20)).toBe(20);
  });
});

describe('parseAutoPlaySettings', () => {
  it('fills ToA-style defaults from empty storage', () => {
    const s = parseAutoPlaySettings(null);
    expect(s.mode).toBe('stationary');
    expect(s.leashYd).toBe(20);
    expect(s.prioritizeBoss).toBe(false);
    expect(s.autoHp).toBe(true);
    expect(s.autoMp).toBe(true);
    expect(s.autoStm).toBe(true);
    expect(s.hpBelow).toBe(AUTO_PLAY_HP_DEFAULT);
    expect(s.supportIds).toHaveLength(AUTO_PLAY_SLOT_COUNT);
    expect(s.supportIds.every((id) => id === null)).toBe(true);
  });

  it('migrates a legacy autoPotion blob into per-pool toggles', () => {
    const off = parseAutoPlaySettings({ autoPotion: false, mode: 'wander' });
    expect(off.mode).toBe('wander');
    expect(off.autoHp).toBe(false);
    expect(off.autoMp).toBe(false);
    expect(off.autoStm).toBe(false);
    const mixed = parseAutoPlaySettings({ autoPotion: false, autoHp: true });
    expect(mixed.autoHp).toBe(true);
    expect(mixed.autoMp).toBe(false);
  });

  it('does not share slot arrays across parses', () => {
    const a = parseAutoPlaySettings(null);
    const b = parseAutoPlaySettings(null);
    a.supportIds[0] = 'heal';
    expect(b.supportIds[0]).toBeNull();
  });
});

describe('setAutoPlaySlot', () => {
  it('writes a support seat and leaves attack seats alone', () => {
    const next = setAutoPlaySlot(parseAutoPlaySettings(null), 'support', 2, 'heal');
    expect(next.supportIds[2]).toBe('heal');
    expect(next.attackIds[2]).toBeNull();
  });
});

describe('loadAutoPlaySettings / saveAutoPlaySettings', () => {
  it('round-trips through an injected store', () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    const saved = {
      ...setAutoPlaySlot(parseAutoPlaySettings(null), 'attack', 0, 'fireball'),
      mode: 'wander' as const,
      prioritizeBoss: true,
      leashYd: 30,
    };
    saveAutoPlaySettings(saved, storage);
    const loaded = loadAutoPlaySettings(storage);
    expect(loaded.attackIds[0]).toBe('fireball');
    expect(loaded.mode).toBe('wander');
    expect(loaded.prioritizeBoss).toBe(true);
    expect(loaded.leashYd).toBe(30);
    expect(loaded.hpBelow).toBe(AUTO_PLAY_HP_DEFAULT);
  });
});
