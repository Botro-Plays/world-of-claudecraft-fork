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
  const half = S / 2;
  return {
    x: half - (PT_MINIMAP_MAX_X - playerX) * pxPerYard,
    y: half - (PT_MINIMAP_MAX_Z - playerZ) * pxPerYard,
    w: (PT_MINIMAP_MAX_X - PT_MINIMAP_MIN_X) * pxPerYard,
    h: (PT_MINIMAP_MAX_Z - PT_MINIMAP_MIN_Z) * pxPerYard,
  };
}
