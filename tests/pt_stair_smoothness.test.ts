// PT stair-smoothness regression: the pinned traversal suite proves a
// walker EVENTUALLY reaches the top of a staircase, but it cannot see the
// stutter that ships when the wall sweep rejects legitimate risers — the
// move still progresses through CheckNextMove's rotated half-distance
// slide retries, so "reached the top" stays true while the walk zigzags.
//
// These tests classify every simulation tick of a real stair walk:
//   direct  — full-distance acceptance (the smooth path)
//   slide   — only a rotated half-distance retry accepted (the stutter)
//   held    — no acceptance at all (wedged)
// After the wall/tree/boat collision work the warp-gate staircase read
// 10 direct / 12 slide: smooth on paper, a zigzag in game. The step-aware
// wallHit filter restored 13 direct / 0 slide; these tests pin that.
import { describe, expect, it } from 'vitest';
import {
  ptXToWoC, ptYToWoC, ptZToWoC, woCToPtX, woCToPtY, woCToPtZ,
} from '../src/sim/pt_band';
import {
  activePtField, ptRicartenField, setActivePtMap,
} from '../src/sim/pt_field_active';
import { stepPlayerMotion, type PlayerMotionDeps } from '../src/sim/player_motion';
import { resolvePosition } from '../src/sim/colliders';
import { loadPtDevMap } from '../src/game/pt_dev_maps';
import type { Entity } from '../src/sim/types';
import type { PtField, PtFieldTransform } from '../src/sim/pt_field';

const motionDeps: PlayerMotionDeps = {
  seed: 1,
  moveSpeedMult: () => 1,
  resolveMove: (_fx, _fz, nx, nz, r, _e, ig) => resolvePosition(1, nx, nz, r, ig),
  resolvedAbility: () => null,
  cancelCast: () => {},
  standUp: () => {},
  dealDamage: () => {},
};

function ptEntity(field: PtField, xf: PtFieldTransform, ptX: number, ptZ: number, refPtY = 500): Entity {
  const x = xf.ptXToWoC(ptX);
  const z = xf.ptZToWoC(ptZ);
  let y = field.floorHeight(x, z, xf.ptYToWoC(refPtY));
  if (!Number.isFinite(y)) y = field.groundHeight(x, z);
  const yy = Number.isFinite(y) ? y : 20;
  return {
    pos: { x, y: yy, z },
    prevPos: { x, y: yy, z },
    vx: 0, vy: 0, vz: 0,
    facing: 0,
    onGround: true,
    jumping: false,
    sitting: false,
    swimStroke: 0,
    swimDiving: false,
    fallStartY: yy,
    auras: [],
    maxHp: 1000,
  } as unknown as Entity;
}

interface WalkStats {
  direct: number;
  slide: number;
  held: number;
  log: string[];
}

// Walk e toward a PT-space target through the real stepPlayerMotion and
// classify each tick. Direct ticks move the full ~0.35 yd stride; slide
// ticks move the half-distance retry ~0.175 yd; held ticks do not move.
function walkDiag(
  e: Entity,
  xf: PtFieldTransform,
  ptX: number,
  ptZ: number,
  ticks: number,
): WalkStats {
  const tX = xf.ptXToWoC(ptX), tZ = xf.ptZToWoC(ptZ);
  const stats: WalkStats = { direct: 0, slide: 0, held: 0, log: [] };
  for (let t = 0; t < ticks; t++) {
    if (Math.hypot(tX - e.pos.x, tZ - e.pos.z) < 0.5) break;
    e.facing = Math.atan2(tX - e.pos.x, tZ - e.pos.z);
    const px = e.pos.x, pz = e.pos.z;
    stepPlayerMotion(motionDeps, e, { forward: true } as never);
    const moved = Math.hypot(e.pos.x - px, e.pos.z - pz);
    if (moved < 0.001) {
      stats.held++;
      stats.log.push(`t=${t} HELD (${xf.woCToPtX(px).toFixed(1)},${xf.woCToPtY(e.pos.y).toFixed(1)},${xf.woCToPtZ(pz).toFixed(1)})`);
    } else if (moved < 0.25) {
      stats.slide++;
      stats.log.push(`t=${t} SLIDE (${xf.woCToPtX(px).toFixed(1)},${xf.woCToPtY(e.pos.y).toFixed(1)},${xf.woCToPtZ(pz).toFixed(1)})`);
    } else {
      stats.direct++;
    }
  }
  return stats;
}

const RICARTEN_XF: PtFieldTransform = {
  ptXToWoC, ptYToWoC, ptZToWoC, woCToPtX, woCToPtY, woCToPtZ,
};

describe('PT stair smoothness (per-tick wall-sweep classification)', () => {
  it('warp-gate south staircase: every tick accepts the full stride', () => {
    const e = ptEntity(ptRicartenField(), RICARTEN_XF, 734, -20250);
    const s = walkDiag(e, RICARTEN_XF, 734, -20119, 200);
    // Pre-fix this read 10 direct / 12 slide: the staircase's own faces
    // sat inside the tick-length wall sweep and read as walls.
    expect(s.slide, s.log.join('\n')).toBe(0);
    expect(s.held, s.log.join('\n')).toBe(0);
    expect(woCToPtY(e.pos.y)).toBeCloseTo(313, 0);
  });

  it('warp-gate staircase descending stays direct', () => {
    const e = ptEntity(ptRicartenField(), RICARTEN_XF, 734, -20119, 350);
    const s = walkDiag(e, RICARTEN_XF, 734, -20250, 200);
    expect(s.slide, s.log.join('\n')).toBe(0);
    expect(s.held, s.log.join('\n')).toBe(0);
  });

  it('village 16-riser staircase stays direct', () => {
    // A second authored Ricarten staircase (found by scanning the field
    // data for consecutive <=10u risers): 16 risers, every tick direct.
    const e = ptEntity(ptRicartenField(), RICARTEN_XF, -1228, -18059);
    const s = walkDiag(e, RICARTEN_XF, -1092, -18059, 200);
    expect(s.slide, s.log.join('\n')).toBe(0);
    expect(s.held, s.log.join('\n')).toBe(0);
    expect(woCToPtY(e.pos.y)).toBeGreaterThan(200);
  });

  it('ship gangplank dock-to-deck stays direct', () => {
    const e = ptEntity(ptRicartenField(), RICARTEN_XF, 4290, -17450, 260);
    const s = walkDiag(e, RICARTEN_XF, 4320, -17380, 200);
    expect(s.slide, s.log.join('\n')).toBe(0);
    expect(s.held, s.log.join('\n')).toBe(0);
  });

  it('footbridge open lane crosses without wedging (z=-17560)', () => {
    // The step-aware filter must not skip the deck's own bounded faces on
    // level ground: their deflections hold the walker on the open lane.
    // An earlier filter variant let the walker drift crownward and wedge.
    const e = ptEntity(ptRicartenField(), RICARTEN_XF, 790, -17560);
    const s = walkDiag(e, RICARTEN_XF, 1200, -17560, 300);
    expect(s.held, s.log.join('\n')).toBe(0);
    expect(woCToPtX(e.pos.x)).toBeGreaterThan(1180);
    expect(woCToPtY(e.pos.y)).toBeCloseTo(219, 0);
  });

  it('footbridge open lane crosses without wedging (z=-17570)', () => {
    const e = ptEntity(ptRicartenField(), RICARTEN_XF, 790, -17570);
    const s = walkDiag(e, RICARTEN_XF, 1200, -17570, 300);
    expect(s.held, s.log.join('\n')).toBe(0);
    expect(woCToPtX(e.pos.x)).toBeGreaterThan(1180);
  });

  it('non-Ricarten map: dun-1 staircase climbs without stutter', async () => {
    // The 15-riser staircase found in the dun-1 field data: proves the
    // step-aware wall filter is a generic PT rule, not Ricarten tuning.
    const { descriptor } = await loadPtDevMap('dun-1');
    const xf = descriptor.transform;
    setActivePtMap(descriptor);
    try {
      const e = ptEntity(activePtField(), xf, -14895, -27921, 2000);
      const s = walkDiag(e, xf, -14895, -27793, 200);
      expect(s.slide, s.log.join('\n')).toBe(0);
      expect(s.held, s.log.join('\n')).toBe(0);
      expect(xf.woCToPtY(e.pos.y)).toBeGreaterThan(200);
    } finally {
      setActivePtMap(null);
    }
  });
});
