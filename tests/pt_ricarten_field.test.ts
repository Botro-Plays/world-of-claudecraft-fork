// Tests for the PT Ricarten field module: coordinate transform, bounds,
// terrain height queries, hybrid collision, and spawn placement.

import { describe, expect, it } from 'vitest';
import {
  PT_BAND_X_MIN,
  PT_BAND_Z,
  PT_FIELD_ANCHOR_X,
  PT_RICARTEN_MAX_X,
  PT_RICARTEN_MAX_Z,
  PT_RICARTEN_MIN_X,
  PT_RICARTEN_MIN_Y,
  PT_RICARTEN_MIN_Z,
  PT_RICARTEN_SPAWN_X,
  PT_RICARTEN_SPAWN_Z,
  PT_SCALE,
  isPtPos,
  ptXToWoC,
  ptYToWoC,
  ptZToWoC,
  woCToPtX,
  woCToPtY,
  woCToPtZ,
} from '../src/sim/pt_band';
import {
  ptRicartenGroundHeight,
  ptRicartenSpawnY,
  ptRicartenSupportHeight,
} from '../src/sim/pt_ricarten_field';
import {
  PT_BOUNDS,
  PT_MATERIALS,
  PT_N_FACE,
  PT_N_VERTEX,
  PT_N_WALKABLE,
  PT_TEXTURE_MANIFEST,
} from '../src/sim/pt_ricarten_field.generated';

describe('pt_band coordinate transforms', () => {
  it('round-trips PT to WoC and back', () => {
    const ptX = 2592;
    const ptZ = -18566;
    const ptY = 100;

    const wocX = ptXToWoC(ptX);
    const wocZ = ptZToWoC(ptZ);
    const wocY = ptYToWoC(ptY);

    expect(woCToPtX(wocX)).toBeCloseTo(ptX, 4);
    expect(woCToPtZ(wocZ)).toBeCloseTo(ptZ, 4);
    expect(woCToPtY(wocY)).toBeCloseTo(ptY, 4);
  });

  it('maps PT bounds to the PT band', () => {
    // X is mirrored about the band (PT is a left-handed DirectX world where
    // +X is east; WoC's right-handed compass reads east as -X), so PT max X
    // maps to the continent anchor and the footprint stays inside the band.
    expect(ptXToWoC(PT_RICARTEN_MAX_X)).toBeCloseTo(PT_FIELD_ANCHOR_X);
    expect(ptXToWoC(PT_RICARTEN_MIN_X)).toBeCloseTo(
      PT_FIELD_ANCHOR_X + (PT_RICARTEN_MAX_X - PT_RICARTEN_MIN_X) * PT_SCALE,
    );
    // PT min Z maps to band Z
    expect(ptZToWoC(PT_RICARTEN_MIN_Z)).toBeCloseTo(PT_BAND_Z);
    // PT min Y maps to 0 (local origin)
    expect(ptYToWoC(PT_RICARTEN_MIN_Y)).toBeCloseTo(0);
  });

  it('mirrors X about the map while preserving footprint', () => {
    // The mirrored transform is an involution composed with the band offset:
    // PT bounds still occupy the same physical X range in WoC.
    const width = (PT_RICARTEN_MAX_X - PT_RICARTEN_MIN_X) * PT_SCALE;
    const lo = ptXToWoC(PT_RICARTEN_MAX_X);
    const hi = ptXToWoC(PT_RICARTEN_MIN_X);
    expect(hi - lo).toBeCloseTo(width, 6);
    expect(lo).toBeCloseTo(PT_FIELD_ANCHOR_X, 6);
  });

  it('maps PT compass directions to WoC compass directions', () => {
    // PT compass (MagicPT FullZoomMap projection + MoveAngle2 facing math):
    //   north=+Z, east=+X. WoC compass (compass.ts / minimap_markers.ts):
    //   north=+Z, east=-X. A correct port keeps every PT landmark on its
    //   original compass side.
    const centerX = 2596; // SetCenterPos(2596,-18738) in field.cpp
    const centerZ = -18738;

    // SW warp gate AddWarpGate(734,-20119): PT-west + PT-south of center.
    const gate = { x: ptXToWoC(734), z: ptZToWoC(-20119) };
    const center = { x: ptXToWoC(centerX), z: ptZToWoC(centerZ) };
    // WoC west = +X, south = -Z.
    expect(gate.x).toBeGreaterThan(center.x); // stays west of center
    expect(gate.z).toBeLessThan(center.z); // stays south of center

    // Second start point AddStartPoint(-1047,-16973): PT-west + PT-north.
    const start2 = { x: ptXToWoC(-1047), z: ptZToWoC(-16973) };
    expect(start2.x).toBeGreaterThan(center.x); // stays west
    expect(start2.z).toBeGreaterThan(center.z); // stays north

    // NE multi-story structure (SMD analysis): X 4467-4617, Z -17138..-17218.
    const neStructure = { x: ptXToWoC(4542), z: ptZToWoC(-17178) };
    expect(neStructure.x).toBeLessThan(center.x); // stays east (WoC -X)
    expect(neStructure.z).toBeGreaterThan(center.z); // stays north

    // Port extreme (minZ) remains the southernmost point.
    expect(ptZToWoC(PT_RICARTEN_MIN_Z)).toBeLessThan(ptZToWoC(PT_RICARTEN_MAX_Z));
  });

  it('keeps the spawn on the same PT source coordinate', () => {
    // Spawn is derived from ptXToWoC(PT_RICARTEN_START_X); round-tripping it
    // must return the exact PT start point.
    expect(woCToPtX(PT_RICARTEN_SPAWN_X)).toBeCloseTo(2592, 4);
    expect(woCToPtZ(PT_RICARTEN_SPAWN_Z)).toBeCloseTo(-18566, 4);
    // Spawn still sits north of town center and inside the band.
    expect(PT_RICARTEN_SPAWN_Z).toBeGreaterThan(ptZToWoC(-18738));
    expect(isPtPos(PT_RICARTEN_SPAWN_X)).toBe(true);
  });

  it('isPtPos detects the PT band', () => {
    expect(isPtPos(PT_BAND_X_MIN)).toBe(true);
    expect(isPtPos(PT_BAND_X_MIN + 100)).toBe(true);
    expect(isPtPos(PT_BAND_X_MIN - 1)).toBe(false);
    expect(isPtPos(0)).toBe(false);
  });

  it('spawn point is inside the PT band', () => {
    expect(isPtPos(PT_RICARTEN_SPAWN_X)).toBe(true);
  });
});

describe('pt_ricarten_field generated data', () => {
  it('has the expected vertex and face counts', () => {
    expect(PT_N_VERTEX).toBe(47180);
    expect(PT_N_FACE).toBe(49888);
    expect(PT_N_WALKABLE).toBe(42408);
  });

  it('has the expected bounds', () => {
    expect(PT_BOUNDS.minX).toBeCloseTo(-3498.3, 1);
    expect(PT_BOUNDS.maxX).toBeCloseTo(5584.7, 1);
    expect(PT_BOUNDS.minY).toBeCloseTo(-259.3, 1);
    expect(PT_BOUNDS.maxY).toBeCloseTo(1012.7, 1);
    expect(PT_BOUNDS.minZ).toBeCloseTo(-22373.3, 1);
    expect(PT_BOUNDS.maxZ).toBeCloseTo(-13194.4, 1);
  });

  it('has 288 materials', () => {
    expect(PT_MATERIALS.length).toBe(288);
  });

  it('has 279 unique textures in the manifest', () => {
    expect(PT_TEXTURE_MANIFEST.length).toBe(279);
  });
});

describe('pt_ricarten_field height queries', () => {
  it('returns a finite ground height at the spawn point', () => {
    const h = ptRicartenGroundHeight(PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z);
    expect(Number.isFinite(h)).toBe(true);
  });

  it('returns a finite spawn Y', () => {
    const y = ptRicartenSpawnY(PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z);
    expect(Number.isFinite(y)).toBe(true);
  });

  it('returns -Infinity outside the map bounds', () => {
    const h = ptRicartenGroundHeight(PT_BAND_X_MIN - 1000, PT_BAND_Z - 1000);
    expect(h).toBe(-Infinity);
  });

  it('returns -Infinity for support height when maxY is below ground', () => {
    // Ask for a surface below the actual ground: should return nothing.
    const h = ptRicartenSupportHeight(
      PT_RICARTEN_SPAWN_X,
      PT_RICARTEN_SPAWN_Z,
      0,
      -100,
    );
    expect(h).toBe(-Infinity);
  });

  it('returns a surface at or below maxY when it exists', () => {
    const ground = ptRicartenGroundHeight(PT_RICARTEN_SPAWN_X, PT_RICARTEN_SPAWN_Z);
    if (!Number.isFinite(ground)) return; // skip if no ground
    // Ask for a surface at or below the ground itself.
    const h = ptRicartenSupportHeight(
      PT_RICARTEN_SPAWN_X,
      PT_RICARTEN_SPAWN_Z,
      0,
      ground + 0.01,
    );
    expect(Number.isFinite(h)).toBe(true);
    if (Number.isFinite(h)) {
      expect(h).toBeLessThanOrEqual(ground + 0.01);
    }
  });
});
