// Remote precipitation decisions (src/render/weather_field_core.ts): the
// pure half of "you can see a neighbouring realm's weather from outside it".
// Three things matter: the per-biome table stays the one weather.ts always
// ran, the box plan finds a neighbour's weather from the clear side of a
// border (and prefers your own), and masked spawns land over the weathered
// zone's cells, never the clear ones.

import { describe, expect, it } from 'vitest';
import {
  PRECIP_SCAN_GRID,
  PRECIP_SPAWN_TRIES,
  precipForBiome,
  precipSpawnXZ,
  remotePrecipPlan,
  weatherPlayerBiome,
  weatherScanBiomeAt,
} from '../src/render/weather_field_core';
import type { BiomeId } from '../src/sim/types';
import { zoneBiomeAt } from '../src/sim/world';
import { PT_BAND_X_MIN, PT_BAND_X_MAX, isPtPos } from '../src/sim/pt_band';

// A synthetic border world: frost (snow) fills x >= 0, amber (clear) x < 0.
const borderWorld = (x: number): BiomeId => (x >= 0 ? 'frost' : 'amber');

// Tiny deterministic rng, the same shape weather.ts hands precipSpawnXZ.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

describe('the precipitation table', () => {
  it('keeps peaks and frost snow, plus the marsh and haunt rain', () => {
    expect(precipForBiome('peaks')).toBe('snow');
    expect(precipForBiome('frost')).toBe('snow');
    expect(precipForBiome('marsh')).toBe('rain');
    expect(precipForBiome('haunt')).toBe('rain');
    for (const clear of ['vale', 'amber', 'night', 'jungle', 'garden'] as BiomeId[]) {
      expect(precipForBiome(clear)).toBeNull();
    }
  });

  it('matches the real world map: the Frostveil vantage the border effect exists for', () => {
    // The A/B harness vantage (scripts/zone_atmosphere_at_range_shots.mjs)
    // stands at x 100, z 1650 inside the frost band.
    expect(precipForBiome(zoneBiomeAt(100, 1650))).toBe('snow');
  });
});

describe('remotePrecipPlan', () => {
  it('prefers the biome under the camera and skips masking there', () => {
    const plan = remotePrecipPlan(50, 0, 70, 70, borderWorld);
    expect(plan).toEqual({ mode: 'snow', local: true });
  });

  it('finds a neighbouring zone weather from the clear side of the border', () => {
    const plan = remotePrecipPlan(-30, 0, 70, 70, borderWorld);
    expect(plan.mode).toBe('snow');
    expect(plan.local).toBe(false);
  });

  it('returns null with no weathered cell in the box', () => {
    const plan = remotePrecipPlan(-500, 0, 70, 70, borderWorld);
    expect(plan).toEqual({ mode: null, local: false });
  });

  it('picks the NEAREST weathered mode when two disagree', () => {
    // rain to the west at x <= -40, snow to the east at x >= 20; camera at 0
    // sits nearer the snow line.
    const twoFronts = (x: number): BiomeId => (x <= -40 ? 'marsh' : x >= 20 ? 'frost' : 'amber');
    const plan = remotePrecipPlan(0, 0, 70, 70, twoFronts);
    expect(plan.mode).toBe('snow');
    expect(plan.local).toBe(false);
  });

  it('scans finely enough that a corner sliver still registers', () => {
    // One grid step is 2*hx / PRECIP_SCAN_GRID = 20 yards at the live box
    // size, inside the narrowest zone band.
    expect((2 * 70) / PRECIP_SCAN_GRID).toBeLessThanOrEqual(20);
    const sliver = (x: number, z: number): BiomeId => (x > 50 && z > 50 ? 'frost' : 'amber');
    expect(remotePrecipPlan(0, 0, 70, 70, sliver).mode).toBe('snow');
  });
});

describe('precipSpawnXZ', () => {
  it('lands every successful spawn over the weathered zone', () => {
    const rand = rng(0x5eed);
    for (let i = 0; i < 200; i++) {
      const s = precipSpawnXZ(rand, -30, 0, 70, 70, 'snow', borderWorld);
      if (s === null) continue;
      expect(borderWorld(s.x)).toBe('frost');
      expect(Math.abs(s.x - -30)).toBeLessThanOrEqual(70);
      expect(Math.abs(s.z - 0)).toBeLessThanOrEqual(70);
    }
  });

  it('succeeds nearly always when a third of the box qualifies', () => {
    const rand = rng(7);
    let hits = 0;
    for (let i = 0; i < 200; i++) {
      if (precipSpawnXZ(rand, -30, 0, 70, 70, 'snow', borderWorld)) hits++;
    }
    // ~29% of the box is frost: a miss needs PRECIP_SPAWN_TRIES straight
    // failures, under 4% per spawn.
    expect(PRECIP_SPAWN_TRIES).toBeGreaterThanOrEqual(8);
    expect(hits).toBeGreaterThan(180);
  });

  it('returns null rather than spawning over the clear zone when the budget misses', () => {
    const rand = rng(11);
    for (let i = 0; i < 50; i++) {
      expect(precipSpawnXZ(rand, -500, 0, 70, 70, 'snow', borderWorld)).toBeNull();
    }
  });

  it('is deterministic for a given rng seed', () => {
    const a = precipSpawnXZ(rng(42), -30, 0, 70, 70, 'snow', borderWorld);
    const b = precipSpawnXZ(rng(42), -30, 0, 70, 70, 'snow', borderWorld);
    expect(a).toEqual(b);
  });
});

describe('the PT connected-world boundary (Phase 6D)', () => {
  // Source facts (MagicPT-Chinese audit): PT precipitation is a server-event
  // overlay (smCOMMAND_PLAY_WEATHER) gated to FIELD_STATE_FOREST, never a
  // biome ambient; snow precipitation is not authored at all. This build
  // runs no PT weather events, so WoC ambient weather must not leak onto PT
  // fields - the zoneAt() southmost fallback maps PT-band coordinates onto
  // unrelated WoC biomes (marsh rain, frost snow) without the boundary.
  const PT_X = PT_BAND_X_MIN + 1;

  it('suppresses the player biome inside the PT band', () => {
    expect(isPtPos(PT_X)).toBe(true);
    expect(weatherPlayerBiome(PT_X, 0)).toBeNull();
    // Any z: PT dungeon, desert, ruin, and forest fields all suppress the
    // same way - there is no per-map list.
    for (const z of [-40_000, -20_000, 0, 5_000]) {
      expect(weatherPlayerBiome(PT_X, z)).toBeNull();
    }
  });

  it('returns the real zone biome outside the PT band', () => {
    // The Frostveil vantage from the remote-weather tests is ordinary WoC
    // land: unchanged behaviour.
    expect(weatherPlayerBiome(100, 1650)).toBe(zoneBiomeAt(100, 1650));
    expect(precipForBiome(weatherPlayerBiome(100, 1650)!)).toBe('snow');
    // Just west of the band edge is WoC land again.
    expect(weatherPlayerBiome(PT_BAND_X_MIN - 1, 0)).toBe(zoneBiomeAt(PT_BAND_X_MIN - 1, 0));
  });

  it('reports a clear biome for PT cells in the remote scan', () => {
    // A camera box straddling the band edge must not plan WoC precipitation
    // off a PT cell, whatever biome the zone fallback would have invented.
    expect(weatherScanBiomeAt(PT_X, 0)).toBe('vale');
    expect(precipForBiome(weatherScanBiomeAt(PT_X, -30_000))).toBeNull();
    // WoC cells resolve normally everywhere in the box.
    expect(weatherScanBiomeAt(100, 1650)).toBe(zoneBiomeAt(100, 1650));
  });

  it('never plans precipitation off PT-band cells', () => {
    // Camera at the band centre, a huge box: every sampled cell is PT land.
    const plan = remotePrecipPlan(PT_BAND_X_MIN + 1_000, 0, 500, 500, weatherScanBiomeAt);
    expect(plan).toEqual({ mode: null, local: false });
  });

  it('still plans WoC weather right up to the band edge', () => {
    // Frost world ending at the band: a WoC camera just west of it keeps the
    // border effect; the PT cells themselves never qualify for spawn masking.
    const frostToBand = (x: number, z: number): BiomeId =>
      isPtPos(x) ? 'vale' : 'frost';
    const camX = PT_BAND_X_MIN - 50;
    const plan = remotePrecipPlan(camX, 0, 70, 70, frostToBand);
    expect(plan.mode).toBe('snow'); // the WoC side still snows
    const rand = rng(99);
    for (let i = 0; i < 200; i++) {
      const s = precipSpawnXZ(rand, camX, 0, 70, 70, 'snow', frostToBand);
      if (s === null) continue;
      expect(isPtPos(s.x)).toBe(false); // never masked onto PT land
    }
  });
});
