// P3: the authentic PT Ricarten minimap. Source of truth: MagicPT-Chinese
// playsub.cpp DrawFieldMap (compact map = player-centered window over
// field/map/village-2.tga across the field's StageMapRect) and field.cpp's
// field-3 record ("ricarten\\village-2.ase"), which pins every landmark
// coordinate asserted below. The projection is pure PT-unit math; the painter
// tests at the bottom prove the Hud routes the PT band here and nowhere else.

import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  PT_MINIMAP_MAX_X,
  PT_MINIMAP_MAX_Z,
  PT_MINIMAP_MIN_X,
  PT_MINIMAP_MIN_Z,
  ptMinimapScreenDelta,
  ptMinimapUV,
  ptRicartenMapDestRect,
} from '../src/ui/pt_minimap_core';
import {
  PT_BAND_X_MIN,
  PT_RICARTEN_MAX_X,
  PT_RICARTEN_MAX_Z,
  PT_RICARTEN_MIN_X,
  PT_RICARTEN_MIN_Z,
  PT_RICARTEN_START2_X,
  PT_RICARTEN_START2_Z,
  PT_RICARTEN_START_X,
  PT_RICARTEN_START_Z,
  PT_SCALE,
  isPtPos,
  ptXToWoC,
  ptZToWoC,
} from '../src/sim/pt_band';
import { MinimapPainter, MINIMAP_SIZE } from '../src/ui/minimap_painter';
import type { IWorld } from '../src/world_api';

// -- Authoritative PT coordinates (field.cpp field 3, "village-2") -----------
const CENTER = { x: 2596, z: -18738 }; // SetCenterPos
const SPAWN1 = { x: PT_RICARTEN_START_X, z: PT_RICARTEN_START_Z }; // 2592,-18566
const SPAWN2 = { x: PT_RICARTEN_START2_X, z: PT_RICARTEN_START2_Z }; // -1047,-16973
const SW_WARP = { x: 734, z: -20119 }; // AddWarpGate(734,-20119,312,64,32)
const TOWN_WARP = { x: 2597, z: -18243 }; // AddWarpGate(2597,-18243,236,32,32)
const NE_WINDMILL = { x: 2424, z: -15946 }; // v-ani03 hub (stage objects)
const SOUTH_WATER = { x: 2600, z: -20800 }; // harbor channel (mat-107 faces)

const RECT_W_PT = PT_RICARTEN_MAX_X - PT_RICARTEN_MIN_X; // 9083 PT units
const RECT_H_PT = PT_RICARTEN_MAX_Z - PT_RICARTEN_MIN_Z; // 9179 PT units

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pt_minimap_core: bounds come from the authored StageMapRect', () => {
  it('derives the WoC rect from the pt_band constants, ordered min < max', () => {
    // The X mirror makes the WoC rect run opposite the PT one: PT west
    // (min X) lands at the LARGER WoC x.
    expect(PT_MINIMAP_MIN_X).toBe(ptXToWoC(PT_RICARTEN_MAX_X));
    expect(PT_MINIMAP_MAX_X).toBe(ptXToWoC(PT_RICARTEN_MIN_X));
    expect(PT_MINIMAP_MIN_Z).toBe(ptZToWoC(PT_RICARTEN_MIN_Z));
    expect(PT_MINIMAP_MAX_Z).toBe(ptZToWoC(PT_RICARTEN_MAX_Z));
    expect(PT_MINIMAP_MIN_X).toBeLessThan(PT_MINIMAP_MAX_X);
    expect(PT_MINIMAP_MIN_Z).toBeLessThan(PT_MINIMAP_MAX_Z);
  });

  it('covers the full Ricarten footprint at PT_SCALE (~327 x 330 yards)', () => {
    expect(PT_MINIMAP_MAX_X - PT_MINIMAP_MIN_X).toBeCloseTo(RECT_W_PT * PT_SCALE, 6);
    expect(PT_MINIMAP_MAX_Z - PT_MINIMAP_MIN_Z).toBeCloseTo(RECT_H_PT * PT_SCALE, 6);
    // The rect sits inside the PT band so isPtPos gates it.
    expect(isPtPos(PT_MINIMAP_MIN_X)).toBe(true);
    expect(PT_MINIMAP_MIN_X).toBeGreaterThanOrEqual(PT_BAND_X_MIN);
  });
});

describe('pt_minimap_core: UV projection matches the PT map convention', () => {
  it('pins the rect edges: u 0/1 = west/east, v 0/1 = north/south', () => {
    expect(ptMinimapUV(PT_RICARTEN_MIN_X, PT_RICARTEN_MAX_Z)).toEqual({ u: 0, v: 0 });
    expect(ptMinimapUV(PT_RICARTEN_MAX_X, PT_RICARTEN_MIN_Z)).toEqual({ u: 1, v: 1 });
  });

  it('places every field.cpp landmark inside the map', () => {
    for (const lm of [CENTER, SPAWN1, SPAWN2, SW_WARP, TOWN_WARP, NE_WINDMILL, SOUTH_WATER]) {
      const { u, v } = ptMinimapUV(lm.x, lm.z);
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(1);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('orders the landmarks on the right compass points', () => {
    const spawn1 = ptMinimapUV(SPAWN1.x, SPAWN1.z);
    const spawn2 = ptMinimapUV(SPAWN2.x, SPAWN2.z);
    const swWarp = ptMinimapUV(SW_WARP.x, SW_WARP.z);
    const townWarp = ptMinimapUV(TOWN_WARP.x, TOWN_WARP.z);
    const windmill = ptMinimapUV(NE_WINDMILL.x, NE_WINDMILL.z);
    const water = ptMinimapUV(SOUTH_WATER.x, SOUTH_WATER.z);

    // Spawn 2 (-1047,-16973) is far west and north of spawn 1 (2592,-18566).
    expect(spawn2.u).toBeLessThan(spawn1.u); // west = left
    expect(spawn2.v).toBeLessThan(spawn1.v); // north = up
    // The south warp gate sits south-west of the town center.
    expect(swWarp.u).toBeLessThan(ptMinimapUV(CENTER.x, CENTER.z).u);
    expect(swWarp.v).toBeGreaterThan(ptMinimapUV(CENTER.x, CENTER.z).v);
    // The town gate is essentially on the center's meridian, just north.
    expect(townWarp.u).toBeCloseTo(ptMinimapUV(CENTER.x, CENTER.z).u, 2);
    expect(townWarp.v).toBeLessThan(ptMinimapUV(CENTER.x, CENTER.z).v);
    // The windmills are the northernmost landmark; the harbor the southernmost.
    expect(windmill.v).toBeLessThan(spawn1.v);
    expect(windmill.v).toBeLessThan(townWarp.v);
    expect(water.v).toBeGreaterThan(swWarp.v);
  });
});

describe('pt_minimap_core: screen delta honors the WoC X mirror', () => {
  const player = { x: 139_800, z: 200 };
  const s = 2;

  it('PT east (WoC -X) lands map-right, PT west (WoC +X) map-left', () => {
    expect(ptMinimapScreenDelta(player.x - 10, player.z, player.x, player.z, s).dx).toBe(20);
    expect(ptMinimapScreenDelta(player.x + 10, player.z, player.x, player.z, s).dx).toBe(-20);
  });

  it('north (+Z) lands map-up, south (-Z) map-down', () => {
    expect(ptMinimapScreenDelta(player.x, player.z + 10, player.x, player.z, s).dy).toBe(-20);
    expect(ptMinimapScreenDelta(player.x, player.z - 10, player.x, player.z, s).dy).toBe(20);
  });
});

describe('pt_minimap_core: map dest rect tracks the player through the band', () => {
  const S = MINIMAP_SIZE;
  const s = 1.7;
  const half = S / 2;

  it('centers the image on the rect center', () => {
    const cx = (PT_MINIMAP_MIN_X + PT_MINIMAP_MAX_X) / 2;
    const cz = (PT_MINIMAP_MIN_Z + PT_MINIMAP_MAX_Z) / 2;
    const r = ptRicartenMapDestRect(cx, cz, S, s);
    expect(r.x + r.w / 2).toBeCloseTo(half, 6);
    expect(r.y + r.h / 2).toBeCloseTo(half, 6);
  });

  it('lets the player marker reach the true map edges', () => {
    // PT west edge = WoC maxX: the image's west (left) edge sits under the marker.
    expect(ptRicartenMapDestRect(PT_MINIMAP_MAX_X, 0, S, s).x).toBeCloseTo(half, 6);
    // PT east edge = WoC minX: the image's east (right) edge sits under the marker.
    const east = ptRicartenMapDestRect(PT_MINIMAP_MIN_X, 0, S, s);
    expect(east.x + east.w).toBeCloseTo(half, 6);
    // North edge = WoC maxZ, south edge = WoC minZ.
    expect(ptRicartenMapDestRect(0, PT_MINIMAP_MAX_Z, S, s).y).toBeCloseTo(half, 6);
    const south = ptRicartenMapDestRect(0, PT_MINIMAP_MIN_Z, S, s);
    expect(south.y + south.h).toBeCloseTo(half, 6);
  });

  it('keeps the texture unstretched: one scale on both axes', () => {
    const r = ptRicartenMapDestRect(0, 0, S, s);
    expect(r.w).toBeCloseTo(RECT_W_PT * PT_SCALE * s, 6);
    expect(r.h).toBeCloseTo(RECT_H_PT * PT_SCALE * s, 6);
  });

  it('the blitted image and the marker core share one projection', () => {
    // For an arbitrary player and landmark, the landmark's pixel inside the
    // dest rect (u*w, v*h) must equal the marker projection (screen delta).
    const playerPt = { x: 1500, z: -19000 };
    const px = ptXToWoC(playerPt.x);
    const pz = ptZToWoC(playerPt.z);
    const r = ptRicartenMapDestRect(px, pz, S, s);
    for (const lm of [SPAWN1, SPAWN2, SW_WARP, TOWN_WARP, NE_WINDMILL]) {
      const { u, v } = ptMinimapUV(lm.x, lm.z);
      const d = ptMinimapScreenDelta(ptXToWoC(lm.x), ptZToWoC(lm.z), px, pz, s);
      expect(r.x + u * r.w).toBeCloseTo(half + d.dx, 4);
      expect(r.y + v * r.h).toBeCloseTo(half + d.dy, 4);
    }
  });
});

describe('pt_minimap_core: facing stays consistent under the mirror', () => {
  // WoC facing f has forward vector (sin f, cos f); the painter draws the
  // player arrow at angle -f on the same +X-left/+Z-up surface. Stepping one
  // yard forward must land the marker in the direction the arrow points.
  const player = { x: ptXToWoC(2592), z: ptZToWoC(-18566) };
  const s = 1.7;

  it.each([
    ['north (+Z)', 0, { dx: 0, dy: -1 }],
    ['south (-Z)', Math.PI, { dx: 0, dy: 1 }],
    // PT east is WoC -X: facing atan2(-1,0) = -pi/2, forward (-1,0), map-right.
    ['east (PT +X = WoC -X)', -Math.PI / 2, { dx: 1, dy: 0 }],
    ['west (PT -X = WoC +X)', Math.PI / 2, { dx: -1, dy: 0 }],
  ])('facing %s projects one step ahead in the arrow direction', (_label, facing, dir) => {
    const ahead = { x: player.x + Math.sin(facing), z: player.z + Math.cos(facing) };
    const d = ptMinimapScreenDelta(ahead.x, ahead.z, player.x, player.z, s);
    const sgn = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
    expect(sgn(d.dx)).toBe(dir.dx);
    expect(sgn(d.dy)).toBe(dir.dy);
  });
});

// -- Painter routing: the PT band gets the Ricarten map, nothing else does ---

interface BlitCall {
  image: unknown;
  x: number;
  y: number;
  w: number;
  h: number;
}

function recordingCtx(): { ctx: CanvasRenderingContext2D; blits: BlitCall[] } {
  const blits: BlitCall[] = [];
  const ctx = {
    drawImage(image: unknown, ...rest: number[]): void {
      if (rest.length === 4) blits.push({ image, x: rest[0], y: rest[1], w: rest[2], h: rest[3] });
    },
    clearRect(): void {},
    save(): void {},
    restore(): void {},
    beginPath(): void {},
    closePath(): void {},
    clip(): void {},
    arc(): void {},
    moveTo(): void {},
    lineTo(): void {},
    fill(): void {},
    stroke(): void {},
    fillRect(): void {},
    strokeRect(): void {},
    translate(): void {},
    rotate(): void {},
    fillText(): void {},
    strokeText(): void {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, blits };
}

function ptWorld(x: number, z: number): IWorld {
  const player = { id: 1, kind: 'player', name: 'Me', pos: { x, z }, facing: 0 };
  return {
    player,
    entities: new Map([[1, player]]),
    partyInfo: null,
    socialInfo: null,
    delveRun: null,
    cfg: { seed: 42, playerClass: 'warrior' },
    playerId: 1,
    inventory: [],
    stationPlacements: [],
    farmPatches: [],
    nodeHarvestableByMe: () => false,
    questState: () => 'unavailable',
    questsDone: new Set<string>(),
    craftingIdentity: { version: 1, synced: true, cadenceBlockedQuests: [] },
  } as unknown as IWorld;
}

function makePainter(labels: string[]): MinimapPainter {
  return new MinimapPainter(
    { setText: (_el: HTMLElement, text: string) => labels.push(text) } as never,
    () => 'cls-color',
    (zoneId: string) => `zone:${zoneId}`,
    (name: string) => name,
    () => 'Thornhollow Fields',
    () => 'Ricarten',
  );
}

// A synchronous Image stand-in: src assignment fires onload immediately, so the
// first paint primes the cache and the second blits.
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  static constructed = 0;
  constructor() {
    FakeImage.constructed++;
  }
  set src(_v: string) {
    this.onload?.();
  }
}

// paintOverworld resolves the --color-minimap-* tokens through
// getComputedStyle once per call (same stub as minimap_painter.test.ts).
function stubDomGlobals(): void {
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('document', { documentElement: {} });
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (token: string) => `paint:${token}`,
  }));
  FakeImage.constructed = 0;
}

describe('paintOverworld: PT band routing', () => {
  it('paints the authentic Ricarten texture only inside the PT band', () => {
    stubDomGlobals();
    const labels: string[] = [];
    const painter = makePainter(labels);
    const { ctx, blits } = recordingCtx();
    const world = ptWorld(ptXToWoC(SPAWN1.x), ptZToWoC(SPAWN1.z));

    painter.paintOverworld(ctx, world, {} as HTMLElement, {} as HTMLCanvasElement, 1);
    painter.paintOverworld(ctx, world, {} as HTMLElement, {} as HTMLCanvasElement, 1);

    expect(labels).toEqual(['Ricarten', 'Ricarten']);
    expect(FakeImage.constructed).toBe(1); // texture loads once, not per frame
    expect(blits).toHaveLength(1); // second paint blits the decoded image
    const r = ptRicartenMapDestRect(world.player.pos.x, world.player.pos.z, MINIMAP_SIZE, 1.7);
    expect(blits[0].x).toBeCloseTo(r.x, 6);
    expect(blits[0].y).toBeCloseTo(r.y, 6);
    expect(blits[0].w).toBeCloseTo(r.w, 6);
    expect(blits[0].h).toBeCloseTo(r.h, 6);
  });

  it('leaves the normal WoC minimap path untouched outside the band', () => {
    stubDomGlobals();
    const labels: string[] = [];
    const painter = makePainter(labels);
    const { ctx, blits } = recordingCtx();
    const world = ptWorld(0, 100); // overworld spawn area, far from the band

    painter.paintOverworld(ctx, world, {} as HTMLElement, {} as HTMLCanvasElement, 1);

    expect(labels[0]).not.toBe('Ricarten');
    expect(FakeImage.constructed).toBe(0); // the PT texture is never fetched
    for (const b of blits) expect(b.image).not.toBeInstanceOf(FakeImage);
  });
});
