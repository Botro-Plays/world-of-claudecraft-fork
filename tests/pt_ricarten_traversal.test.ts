// Durable regression tests for the PT Ricarten collision surface, distilled
// from the P2-B investigation probes (scripts/pt-port and the retired
// pt_probe_scratch.test.ts). These pin the two defects the P2-B work fixed:
//
//   1. Seam hairlines: strict barycentric containment rejected points lying
//      exactly on shared triangle edges after the WoC<->PT coordinate
//      round-trip (~0.004 PT-unit jitter), opening fall-through holes on
//      narrow stair strips. triangleHeightAt now carries PT_EDGE_TOLERANCE.
//   2. Harbor/dock channels read as void: water faces were neither walkable
//      nor recognized as water, so any seam or authored channel dropped the
//      player into a floorless pit. ptRicartenWaterLevel plus the
//      waterLevelAt PT arm in world.ts return the harbor sheet (~102 PT
//      units) instead.
//
// Also pinned: authentic walls stay walls, the ship gangplank and deck are
// traversable, and the canal crossing connects the west bank to the east
// bank - the "bridge" the investigation confirmed is ordinary terrain.

import { describe, expect, it } from 'vitest';
import {
  ptRicartenFloorHeight,
  ptRicartenGroundHeight,
  ptRicartenSupportHeight,
  ptRicartenWaterLevel,
} from '../src/sim/pt_ricarten_field';
import {
  PT_VERTICES,
  PT_WALKABLE_FACES,
  PT_RENDER_FACES,
  PT_MATERIALS,
} from '../src/sim/pt_ricarten_field.generated';
import {
  ptXToWoC,
  ptYToWoC,
  ptZToWoC,
  woCToPtX,
  woCToPtY,
  woCToPtZ,
  PT_RICARTEN_MIN_X,
  PT_RICARTEN_MAX_X,
  PT_RICARTEN_MIN_Z,
  PT_RICARTEN_MAX_Z,
} from '../src/sim/pt_band';
import { waterLevelAt } from '../src/sim/world';
import { MAX_STEP_HEIGHT } from '../src/sim/physics/character';
import { resolvePosition } from '../src/sim/colliders';
import { stepPlayerMotion, type PlayerMotionDeps } from '../src/sim/player_motion';
import type { Entity } from '../src/sim/types';

const MAX_STEP_PT = MAX_STEP_HEIGHT / 0.036; // ~25 PT units

// Surface at a PT point: the movement kernel's floor is the highest of the
// lowest surface (ground) and the highest reachable surface (support).
function surfaceAt(ptX: number, ptZ: number, maxYWoC: number): number {
  const x = ptXToWoC(ptX);
  const z = ptZToWoC(ptZ);
  const g = ptRicartenGroundHeight(x, z);
  const s = ptRicartenSupportHeight(x, z, 0.5, maxYWoC);
  return Math.max(g, s);
}

describe('shared-edge coverage (seam hairline seal)', () => {
  it('resolves points on edges shared by adjacent walkable faces', () => {
    const verts = PT_VERTICES();
    const faces = PT_WALKABLE_FACES();
    const nFaces = faces.length / 3;

    // Hash shared edges (unordered vertex pairs used by >= 2 faces).
    const edgeUse = new Map<bigint, number>();
    for (let f = 0; f < nFaces; f++) {
      const a = faces[f * 3];
      const b = faces[f * 3 + 1];
      const c = faces[f * 3 + 2];
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        const key = u < v ? (BigInt(u) << 20n) | BigInt(v) : (BigInt(v) << 20n) | BigInt(u);
        edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
      }
    }

    // Sample midpoints of every shared edge (strided to keep the test fast:
    // the full 50k-edge scan that motivated this found 587 holes before the
    // fix, 3 after - all three over harbor water).
    let tested = 0;
    let uncovered = 0;
    let uncoveredWithoutWater = 0;
    for (const key of edgeUse.keys()) {
      if (edgeUse.get(key)! < 2) continue;
      const u = Number(key >> 20n);
      const v = Number(key & 0xfffffn);
      if ((u * 31 + v) % 37 !== 0) continue; // ~1/37 of shared edges
      const mx = (verts[u * 3] + verts[v * 3]) / 2;
      const my = (verts[u * 3 + 1] + verts[v * 3 + 1]) / 2;
      const mz = (verts[u * 3 + 2] + verts[v * 3 + 2]) / 2;
      tested++;
      const h = ptRicartenGroundHeight(ptXToWoC(mx), ptZToWoC(mz));
      if (h === -Infinity) {
        uncovered++;
        const w = ptRicartenWaterLevel(ptXToWoC(mx), ptZToWoC(mz));
        if (w === -Infinity) uncoveredWithoutWater++;
      }
    }
    expect(tested).toBeGreaterThan(500);
    // Every residual hole must land on water, never on void.
    expect(uncoveredWithoutWater).toBe(0);
    // The fix's measured residual rate is ~0.006%; allow 1% for margin.
    expect(uncovered / tested).toBeLessThan(0.01);
  });
});

describe('PT harbor water level', () => {
  it('returns the harbor sheet height inside the dock channel', () => {
    // The twin-pier dock channel (x~790, z~-20490) is authentic water.
    const w = ptRicartenWaterLevel(ptXToWoC(790), ptZToWoC(-20490));
    expect(Number.isFinite(w)).toBe(true);
    // ~102 PT units -> ~12.99 WoC yd.
    expect(w).toBeCloseTo(ptYToWoC(102), 1);
  });

  it('reports no water on dry spawn land', () => {
    const w = ptRicartenWaterLevel(ptXToWoC(2592), ptZToWoC(-18566));
    expect(w).toBe(-Infinity);
  });

  it('routes waterLevelAt through the PT band arm', () => {
    const x = ptXToWoC(790);
    const z = ptZToWoC(-20490);
    const w = waterLevelAt(x, z, 0);
    expect(Number.isFinite(w)).toBe(true);
    // The harbor channel gives ground=-Infinity but finite water: a swimmer
    // lands on the sheet instead of falling through the map.
    expect(ptRicartenGroundHeight(x, z)).toBe(-Infinity);
  });
});

describe('traversal fidelity', () => {
  it('walks the ship gangplank without holes', () => {
    // The bridge.bmp gangplank crosses x 3981..4302 at z ~ -17470, rising
    // from the quay (~114 PT units) to the ship rail (~233).
    let prev = -Infinity;
    for (let x = 4000; x <= 4290; x += 10) {
      const h = surfaceAt(x, -17470, ptYToWoC(300));
      expect(Number.isFinite(h)).toBe(true);
      const hPt = woCToPtY(h);
      if (Number.isFinite(prev)) {
        expect(Math.abs(hPt - prev)).toBeLessThanOrEqual(MAX_STEP_PT);
      }
      prev = hPt;
    }
  });

  it('reaches the ship deck through supportHeightAt (multi-level)', () => {
    // The ship interior: hold floor at ~0-40, deck at ~200+ PT units. The
    // upper surface must resolve through supportHeightAt.
    const x = ptXToWoC(4600);
    const z = ptZToWoC(-17000);
    const upper = ptRicartenSupportHeight(x, z, 0.5, ptYToWoC(260));
    expect(Number.isFinite(upper)).toBe(true);
  });

  it('keeps the canal walls blocking', () => {
    // Canal wall band: a real wall ~6+ yd over the waterline. The player
    // standing on the west bank must not gain the wall top as a step.
    const feetWoC = ptYToWoC(100); // standing near waterline
    const support = ptRicartenSupportHeight(
      ptXToWoC(1500),
      ptZToWoC(-17080),
      0.5,
      feetWoC,
    );
    // Either no reachable surface, or one within an authentic step.
    if (Number.isFinite(support)) {
      expect(woCToPtY(support)).toBeLessThanOrEqual(woCToPtY(feetWoC));
    }
  });

  it('connects the west bank to the east bank across the canal bridge', () => {
    // BFS over the walkable surface at 4-unit resolution; the bridge must
    // connect x<1450 (west) to x>1650 (east) without swimming.
    const x0 = 1400;
    const x1 = 1700;
    const z0 = -17300;
    const z1 = -16900;
    const step = 4;
    const W = Math.floor((x1 - x0) / step) + 1;
    const H = Math.floor((z1 - z0) / step) + 1;
    const h = new Float64Array(W * H).fill(-Infinity);
    for (let iz = 0; iz < H; iz++) {
      for (let ix = 0; ix < W; ix++) {
        const px = x0 + ix * step;
        const pz = z0 + iz * step;
        const g = ptRicartenGroundHeight(ptXToWoC(px), ptZToWoC(pz));
        h[iz * W + ix] = g;
      }
    }
    // Seed on the west bank (a covered cell).
    let seed = -1;
    for (let iz = 0; iz < H && seed < 0; iz++) {
      for (let ix = 0; ix < Math.floor(W / 3); ix++) {
        if (Number.isFinite(h[iz * W + ix])) {
          seed = iz * W + ix;
          break;
        }
      }
    }
    expect(seed).toBeGreaterThanOrEqual(0);
    const seen = new Uint8Array(W * H);
    const q = [seed];
    seen[seed] = 1;
    while (q.length) {
      const c = q.pop()!;
      const cx = c % W;
      const cz = Math.floor(c / W);
      const ch = woCToPtY(h[c]);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          const ni = nz * W + nx;
          if (seen[ni] || !Number.isFinite(h[ni])) continue;
          if (woCToPtY(h[ni]) - ch > MAX_STEP_PT) continue;
          seen[ni] = 1;
          q.push(ni);
        }
      }
    }
    // Some east-bank cell (rightmost third) must be reachable.
    let reached = false;
    for (let iz = 0; iz < H && !reached; iz++) {
      for (let ix = Math.floor((W * 2) / 3); ix < W; ix++) {
        if (seen[iz * W + ix]) {
          reached = true;
          break;
        }
      }
    }
    expect(reached).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PT floor rule (smStage3d.cpp GetFloorHeight/CheckNextMove) + kernel walks
// ---------------------------------------------------------------------------
//
// ptRicartenFloorHeight implements the authoritative PT selection: the
// HIGHEST CHECK_FACE surface strictly less than Stage_StepHeight (10 PT
// units) above the reference — so stepping DOWN always qualifies, a surface
// 10+ units up does not, and a destination with no qualifying face is
// floorless (CheckNextMove returns NULL and the move never happens). The
// kernel gate in stepPlayerMotion turns that -Infinity into a refused move
// for walkers; a swimmer may continue only into genuinely deep water.

const motionDeps: PlayerMotionDeps = {
  seed: 1,
  moveSpeedMult: () => 1,
  resolveMove: (_fx, _fz, nx, nz, r, _e, ig) => resolvePosition(1, nx, nz, r, ig),
  resolvedAbility: () => null,
  cancelCast: () => {},
  standUp: () => {},
  dealDamage: () => {},
};

// A player entity placed on a PT surface. refPtY picks the level on stacked
// geometry (PT checks from a reference, so 500 lands on the top face, while
// 240 lands on the bridge deck beneath the arch ribs).
function ptEntity(ptX: number, ptZ: number, refPtY = 500): Entity {
  const x = ptXToWoC(ptX);
  const z = ptZToWoC(ptZ);
  let y = ptRicartenFloorHeight(x, z, ptYToWoC(refPtY));
  if (!Number.isFinite(y)) y = ptRicartenGroundHeight(x, z);
  const yy = Number.isFinite(y) ? y : 20;
  return {
    pos: { x, y: yy, z },
    prevPos: { x, y: yy, z },
    vx: 0,
    vy: 0,
    vz: 0,
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

// Drive the kernel toward a PT target; returns the final entity.
function ptWalk(e: Entity, ptX: number, ptZ: number, ticks: number): Entity {
  const tX = ptXToWoC(ptX);
  const tZ = ptZToWoC(ptZ);
  for (let t = 0; t < ticks; t++) {
    if (Math.hypot(tX - e.pos.x, tZ - e.pos.z) < 0.5) break;
    e.facing = Math.atan2(tX - e.pos.x, tZ - e.pos.z);
    stepPlayerMotion(motionDeps, e, { forward: true } as never);
    expect(Number.isFinite(e.pos.x + e.pos.y + e.pos.z)).toBe(true);
  }
  return e;
}

describe('ptRicartenFloorHeight (PT GetFloorHeight rule)', () => {
  // The canal footbridge's west end stacks four walkable surfaces over one
  // XZ column: under-ramp ~197, deck ~232, arch face ~245, rib ~265.
  const BX = ptXToWoC(830);
  const BZ = ptZToWoC(-17600);

  it('selects the surface the reference stands on', () => {
    const f = ptRicartenFloorHeight(BX, BZ, ptYToWoC(232));
    expect(woCToPtY(f)).toBeGreaterThan(225);
    expect(woCToPtY(f)).toBeLessThan(242);
  });

  it('admits a surface below +10 PT units, rejects the next tier up', () => {
    // From 250 the 245 arch face qualifies (highest below 260); the 265 rib
    // does not (265 - 250 = 15 > 10).
    const f = ptRicartenFloorHeight(BX, BZ, ptYToWoC(250));
    expect(woCToPtY(f)).toBeGreaterThan(240);
    expect(woCToPtY(f)).toBeLessThan(255);
  });

  it('reaches a higher surface once the reference climbs within 10 units', () => {
    const f = ptRicartenFloorHeight(BX, BZ, ptYToWoC(256));
    expect(woCToPtY(f)).toBeGreaterThan(258);
  });

  it('steps down arbitrarily: the highest qualifying surface wins', () => {
    const f = ptRicartenFloorHeight(BX, BZ, ptYToWoC(400));
    expect(woCToPtY(f)).toBeGreaterThan(258);
  });

  it('returns -Infinity where no face is within reach (CheckNextMove NULL)', () => {
    // All faces are >10 PT units above this reference.
    expect(ptRicartenFloorHeight(BX, BZ, ptYToWoC(180))).toBe(-Infinity);
    // Open canal water carries no CHECK_FACE at all.
    expect(ptRicartenFloorHeight(ptXToWoC(840), ptZToWoC(-17640), ptYToWoC(300))).toBe(
      -Infinity,
    );
  });
});

describe('PT kernel traversal (stepPlayerMotion)', () => {
  it('crosses the canal footbridge deck west to east', () => {
    // The open deck lane runs along the bridge's north side at
    // z ~ -17555..-17575 (CHECK_FACE surface ~219 PT units spanning
    // x ~780..1220 over the harbor channel). The center lane z ~ -17600 is
    // cut by the crown parapet (mat riy-f013/riy-f023 CHECK_FACE faces) —
    // PT's CheckNextMove wall test blocks it, and so do we.
    const e = ptWalk(ptEntity(790, -17560), 1200, -17560, 3000);
    expect(woCToPtX(e.pos.x)).toBeGreaterThan(1180);
    expect(woCToPtY(e.pos.y)).toBeCloseTo(219, 0);
  });

  it('crosses the footbridge east to west on the open lane', () => {
    const e = ptWalk(ptEntity(1210, -17560), 790, -17560, 3000);
    expect(woCToPtX(e.pos.x)).toBeLessThan(810);
    const s = ptWalk(ptEntity(790, -17570), 1200, -17570, 3000);
    expect(woCToPtX(s.pos.x)).toBeGreaterThan(1180);
    expect(woCToPtY(s.pos.y)).toBeCloseTo(219, 0);
  });

  it('blocks the footbridge center lane at the crown parapet', () => {
    // Authentic CheckNextMove behavior: the z ~ -17600 lane dead-ends into
    // authored CHECK_FACE parapet faces, so the walker stalls on the west
    // approach instead of clipping through like the pre-wall-test code did.
    const e = ptWalk(ptEntity(790, -17600), 1200, -17600, 3000);
    expect(woCToPtX(e.pos.x)).toBeLessThan(1000);
    expect(Number.isFinite(e.pos.y)).toBe(true);
  });

  it('stops at the floorless deck edge instead of falling into the harbor', () => {
    // South of the deck at x~1000 the CHECK_FACE coverage ends at z ~ -17620;
    // beyond it is open water with no walkable bed. CheckNextMove refuses the
    // step, so the walker halts on the edge rather than dropping.
    const e = ptWalk(ptEntity(1000, -17605), 1000, -17650, 600);
    expect(Number.isFinite(e.pos.y)).toBe(true);
    expect(woCToPtZ(e.pos.z)).toBeGreaterThan(-17630);
    expect(woCToPtY(e.pos.y)).toBeGreaterThan(200);
  });

  it('a body placed over floorless water falls in and swims — never NaN', () => {
    // Regression: the steep-slide gate used to read a NaN downhill vector
    // from all-(-Infinity) ground samples and poison pos. Now the body drops
    // to the harbor sheet and seats at the swim line (~water - 0.75 yd).
    const e = ptEntity(840, -17640); // floorless canal water
    expect(ptRicartenGroundHeight(e.pos.x, e.pos.z)).toBe(-Infinity);
    for (let i = 0; i < 300; i++) {
      stepPlayerMotion(motionDeps, e, { forward: false } as never);
      expect(Number.isFinite(e.pos.x + e.pos.y + e.pos.z)).toBe(true);
    }
    const wl = ptRicartenWaterLevel(e.pos.x, e.pos.z);
    expect(Number.isFinite(wl)).toBe(true);
    expect(e.pos.y).toBeCloseTo(wl - 0.75, 1);
    // And it can swim through genuinely deep water — but only that: the
    // canal lane north toward the footbridge ends at the bridge footing
    // (faces ~219 PT units rising through the waterline), which is floorless
    // for the +10 rule yet NOT deep water, so the swimmer holds off it like
    // any other wall instead of crossing onto it.
    ptWalk(e, 840, -17590, 2000);
    expect(woCToPtZ(e.pos.z)).toBeGreaterThan(-17635); // did swim north
    expect(woCToPtZ(e.pos.z)).toBeLessThan(-17610); // blocked at the footing
    expect(Number.isFinite(e.pos.y)).toBe(true);
  });

  it('climbs the warp-gate south staircase to the top platform', () => {
    // Warp Gate A (734, -20119): authored stairs 260 -> 273 -> 289 -> 302 ->
    // 313, every riser inside the 10-unit step rule.
    const e = ptWalk(ptEntity(734, -20250), 734, -20119, 3000);
    expect(Math.abs(woCToPtZ(e.pos.z) - -20119)).toBeLessThan(30);
    expect(woCToPtY(e.pos.y)).toBeGreaterThan(300);
  });

  it('refuses the canal-edge step onto open water (CheckNextMove NULL)', () => {
    // Walking the east bank toward the floorless canal: no qualifying face
    // at the destination, so the move is refused and the body stays on land.
    const e = ptWalk(ptEntity(1600, -17200), 1400, -17200, 3000);
    expect(woCToPtX(e.pos.x)).toBeGreaterThan(1450);
    expect(Number.isFinite(e.pos.y)).toBe(true);
  });
});

describe('PT wall test (CheckNextMove smMakeTLine goalpost)', () => {
  it('blocks at the ship hull east wall on the harbor seabed', () => {
    // The ship's east side (ship_sides CHECK_FACE) drops from the deck to
    // the seabed; walking the harbor floor west into it stops at the hull
    // face (~x 4358) instead of entering the hull interior.
    const e = ptWalk(ptEntity(4700, -17400, 120), 4300, -17400, 2500);
    expect(woCToPtX(e.pos.x)).toBeGreaterThan(4340);
    expect(Number.isFinite(e.pos.y)).toBe(true);
  });

  it('holds the ship deck north rail (CHECK_FACE parapet)', () => {
    // The deck edge carries an authored rail; the goalpost lines straddle
    // it, so the walker stops on the deck (~z -17351) rather than stepping
    // through onto the void beyond.
    const e = ptWalk(ptEntity(4300, -17450, 260), 4300, -17300, 1500);
    expect(woCToPtZ(e.pos.z)).toBeGreaterThan(-17380);
    expect(woCToPtZ(e.pos.z)).toBeLessThan(-17320);
    expect(woCToPtY(e.pos.y)).toBeGreaterThan(200);
  });

  it('climbs the ship gangplank dock-to-deck and back', () => {
    // bridge.bmp CHECK_FACE ramp, x 3982->4301 rising ~124->230. Every
    // per-tick step is inside the 10-unit rule, so both directions cross.
    const up = ptWalk(ptEntity(3980, -17470, 200), 4290, -17470, 2500);
    expect(woCToPtX(up.pos.x)).toBeGreaterThan(4250);
    expect(woCToPtY(up.pos.y)).toBeGreaterThan(200);
    const down = ptWalk(ptEntity(4280, -17470, 260), 4000, -17470, 2500);
    expect(woCToPtX(down.pos.x)).toBeLessThan(4050);
    expect(woCToPtY(down.pos.y)).toBeLessThan(160);
  });

  it('blocks on tree trunk faces (na02 CHECK_FACE) on the flat plateau', () => {
    // The plateau trees are terrain geometry: na02_01 trunks (~ground to
    // +82u) and na02_02 canopy frames are CHECK_FACE, so the goalpost hits
    // them and the walker stops in front of the trunk.
    const e = ptWalk(ptEntity(2100, -15200, 200), 1850, -15200, 2500);
    expect(woCToPtX(e.pos.x)).toBeGreaterThan(1900);
    expect(Number.isFinite(e.pos.y)).toBe(true);
    const s = ptWalk(ptEntity(1550, -15600, 200), 1800, -15600, 2500);
    expect(woCToPtX(s.pos.x)).toBeLessThan(1700);
  });

  it('lets the walker pass under foliage — na03 leaves are not CHECK_FACE', () => {
    // Data-level pin: every na03_* foliage material is non-walkable
    // (WINDZ1 sway leaves, transparency), so they can never produce a
    // collision face. The walk-face set must carry none of them.
    const rf = PT_RENDER_FACES();
    const wf = PT_WALKABLE_FACES();
    const mats = PT_MATERIALS;
    const key = (a: number, b: number, c: number) => {
      const s = [a, b, c].sort((x, y) => x - y);
      return s[0] * 1e10 + s[1] * 1e5 + s[2];
    };
    const matByTri = new Map<number, number>();
    for (let fi = 0; fi < rf.length / 4; fi++) {
      matByTri.set(key(rf[fi * 4], rf[fi * 4 + 1], rf[fi * 4 + 2]), rf[fi * 4 + 3]);
    }
    const walkMats = new Set<number>();
    for (let wi = 0; wi < wf.length / 3; wi++) {
      const mi = matByTri.get(key(wf[wi * 3], wf[wi * 3 + 1], wf[wi * 3 + 2]));
      if (mi !== undefined) walkMats.add(mi);
    }
    for (const m of mats) {
      const tex = m.textureNames[0] ?? '';
      if (/na03_\d+\.tga$/i.test(tex)) {
        expect(m.isWalkable).toBe(false);
        expect(walkMats.has(m.index)).toBe(false);
      }
      if (/na02_\d+\.bmp$/i.test(tex)) {
        expect(m.isWalkable).toBe(true);
        expect(walkMats.has(m.index)).toBe(true);
      }
    }
  });

  it('blocks at a village building wall (wall_st CHECK_FACE)', () => {
    // Authored building wall at z ~ -19063: walking south from the north
    // side stalls on the wall face instead of entering the structure.
    const e = ptWalk(ptEntity(2543, -19020, 360), 2543, -19120, 1500);
    expect(woCToPtZ(e.pos.z)).toBeGreaterThan(-19090);
    expect(Number.isFinite(e.pos.y)).toBe(true);
  });

  it('holds the canal west quay wall', () => {
    // The quay face drops straight into floorless water; both the +10
    // floor rule and the wall goalpost keep the walker on the bank (~787).
    const e = ptWalk(ptEntity(700, -17800, 200), 950, -17800, 2500);
    expect(woCToPtX(e.pos.x)).toBeLessThan(850);
    expect(Number.isFinite(e.pos.y)).toBe(true);
  });

  it('holds the map edge on all four sides (no out-of-band leak)', () => {
    // The PT gate keys on the player's CURRENT position, not the
    // destination — the band edge coincides with the field edge, so a step
    // landing out-of-band used to fall through to the generic path and
    // walk onto the void floor (observed: ptX 5700 at y ~ -6). In PT,
    // CheckNextMove finds no face list past StageMapRect and refuses, so
    // the walker must stop at the authored field bounds.
    const east = ptWalk(ptEntity(5400, -16000), 5700, -16000, 2000);
    expect(woCToPtX(east.pos.x)).toBeLessThanOrEqual(PT_RICARTEN_MAX_X + 1);
    const west = ptWalk(ptEntity(-3400, -16000), -4000, -16000, 2000);
    expect(woCToPtX(west.pos.x)).toBeGreaterThanOrEqual(PT_RICARTEN_MIN_X - 1);
    const south = ptWalk(ptEntity(2592, -13250), 2592, -12900, 2000);
    expect(woCToPtZ(south.pos.z)).toBeLessThanOrEqual(PT_RICARTEN_MAX_Z + 1);
    const north = ptWalk(ptEntity(2592, -22300), 2592, -22600, 2000);
    expect(woCToPtZ(north.pos.z)).toBeGreaterThanOrEqual(PT_RICARTEN_MIN_Z - 1);
  });
});
