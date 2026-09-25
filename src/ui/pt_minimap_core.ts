// PT Ricarten minimap projection (P3).
//
// Source of truth: MagicPT-Chinese PT-Source playsub.cpp DrawFieldMap, which
// draws the corner minimap as a player-centered window over the per-field map
// texture (field\map\<name>.tga; Ricarten = village-2). The texture covers the
// stage's StageMapRect: image left = rect.left (PT west), image top =
// rect.bottom (PT north). PT projects:
//     u = (pX - rect.left)   / width
//     v = (rect.bottom - pZ) / height
// with positions in x256 fixed point. In real PT units the rect is exactly the
// authored Ricarten bounds (StageInfo.dat record 3: -3498..5585 x,
// -22373..-13194 z, stored x256).
//
// WoC mirrors X (ptXToWoC maps PT east to WoC east = -X), so in band space the
// image's left edge sits at the LARGER WoC x. The rect below is expressed in
// WoC coordinates so the painter can reuse the same math as every other
// minimap background (+X map-left, +Z map-up).

import {
  PT_RICARTEN_MAX_X,
  PT_RICARTEN_MAX_Z,
  PT_RICARTEN_MIN_X,
  PT_RICARTEN_MIN_Z,
  ptXToWoC,
  ptZToWoC,
} from '../sim/pt_band';
import type { PtFieldTransform, PtMapDescriptor } from '../sim/pt_field';

// The authentic PT minimap texture: client/Field/map/village-2.tga, a 256x256
// 32-bit top-down map render covering the full StageMapRect, converted to PNG
// (the G8 header obfuscation is stripped by scripts/pt-port/tga_to_png.ts).
export const PT_MINIMAP_TEXTURE_URL = '/textures/pt-ricarten/minimap-village-2.png';

// WoC-space rect the map image covers, derived from the real StageMapRect
// bounds (pt_band constants), never duplicated literals.
export const PT_MINIMAP_MIN_X = ptXToWoC(PT_RICARTEN_MAX_X);
export const PT_MINIMAP_MAX_X = ptXToWoC(PT_RICARTEN_MIN_X);
export const PT_MINIMAP_MIN_Z = ptZToWoC(PT_RICARTEN_MIN_Z);
export const PT_MINIMAP_MAX_Z = ptZToWoC(PT_RICARTEN_MAX_Z);

/** Normalized image coordinate of a PT point: u 0 = west edge, v 0 = north
 *  edge. Pure PT-space so the projection is independent of the world scale
 *  (PT_SCALE) and the band placement. */
export function ptMinimapUV(ptX: number, ptZ: number): { u: number; v: number } {
  return {
    u: (ptX - PT_RICARTEN_MIN_X) / (PT_RICARTEN_MAX_X - PT_RICARTEN_MIN_X),
    v: (PT_RICARTEN_MAX_Z - ptZ) / (PT_RICARTEN_MAX_Z - PT_RICARTEN_MIN_Z),
  };
}

/** Minimap canvas position (px) of a WoC point when the player sits at the
 *  center. Same projection the marker core uses: +X world = map-left,
 *  +Z world = map-up. */
export function ptMinimapScreenDelta(
  wocX: number,
  wocZ: number,
  playerX: number,
  playerZ: number,
  pxPerYard: number,
): { dx: number; dy: number } {
  return {
    dx: -(wocX - playerX) * pxPerYard,
    dy: -(wocZ - playerZ) * pxPerYard,
  };
}

/** Destination rect for the map image on the minimap canvas (the same formula
 *  the zoneBg overlay uses: image-left pins to region maxX, image-top to
 *  region maxZ). */
export function ptRicartenMapDestRect(
  playerX: number,
  playerZ: number,
  S: number,
  pxPerYard: number,
): { x: number; y: number; w: number; h: number } {
  return ptRasterDestRect(
    {
      minX: PT_MINIMAP_MIN_X,
      maxX: PT_MINIMAP_MAX_X,
      minZ: PT_MINIMAP_MIN_Z,
      maxZ: PT_MINIMAP_MAX_Z,
    },
    playerX,
    playerZ,
    S,
    pxPerYard,
  );
}

// ---------------------------------------------------------------------------
// Connected-world rasters (Phase 5B)
// ---------------------------------------------------------------------------

/** WoC-space rect one field's minimap raster covers. */
export interface PtRasterRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Authored StageMapRect coverage of a field's map raster (SMD header,
 *  x256 fixed-point PT units): image left = rect.left, image top =
 *  rect.bottom. */
export interface PtStageMapRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Project a field's StageMapRect into WoC space through the field's own
 * band transform. The X mirror puts PT west (rect.left, the numerically
 * smaller PT x) at the LARGER WoC x; Z maps straight through, so the
 * image-top edge (rect.bottom) lands at maxZ.
 */
export function ptRasterWorldRect(
  rect: PtStageMapRect,
  transform: PtFieldTransform,
): PtRasterRect {
  const xA = transform.ptXToWoC(rect.left / 256);
  const xB = transform.ptXToWoC(rect.right / 256);
  const zA = transform.ptZToWoC(rect.top / 256);
  const zB = transform.ptZToWoC(rect.bottom / 256);
  return {
    minX: Math.min(xA, xB),
    maxX: Math.max(xA, xB),
    minZ: Math.min(zA, zB),
    maxZ: Math.max(zA, zB),
  };
}

/** Generic form of ptRicartenMapDestRect for any field raster rect. */
export function ptRasterDestRect(
  rect: PtRasterRect,
  playerX: number,
  playerZ: number,
  S: number,
  pxPerYard: number,
): { x: number; y: number; w: number; h: number } {
  const half = S / 2;
  return {
    x: half - (rect.maxX - playerX) * pxPerYard,
    y: half - (rect.maxZ - playerZ) * pxPerYard,
    w: (rect.maxX - rect.minX) * pxPerYard,
    h: (rect.maxZ - rect.minZ) * pxPerYard,
  };
}

/** One raster to composite: the converted PNG plus its WoC placement. */
export interface PtMinimapLayer {
  id: string;
  png: string;
  rect: PtRasterRect;
}

/**
 * The connected-world minimap set in source draw order: the standby
 * (FieldGate-preloaded) neighbor first, the active field on top - the PT
 * client draws sCompactMap[1] then sCompactMap[0]. Fields whose source
 * Field/map/<id>.tga was absent carry PT_MINIMAP = null and drop out,
 * leaving the void fill (never a fabricated stand-in). Only the two
 * loaded slots are composited; PT itself never holds more.
 */
export function ptMinimapLayers(
  active: PtMapDescriptor | null,
  standby: PtMapDescriptor | null,
): PtMinimapLayer[] {
  const layers: PtMinimapLayer[] = [];
  for (const d of [standby, active]) {
    if (d === null) continue;
    const png = d.field.PT_MINIMAP?.png;
    const rect = d.field.PT_STAGE_MAP_RECT;
    if (!png || !rect) continue;
    layers.push({ id: d.id, png, rect: ptRasterWorldRect(rect, d.transform) });
  }
  return layers;
}
