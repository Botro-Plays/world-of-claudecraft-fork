// Canvas-2D painter for the enlarged PT field map (Phase 6F).
//
// The M-key world-map surface for the PT band: hud routes it when
// mapWindowMode returns 'pt'. It reuses the Phase 5B minimap pipeline
// wholesale rather than implementing the source's separate FullZoomMap /
// GuideMap system: ptMinimapLayers composites the active field's authored
// Field/map/<id> raster plus the FieldGate-preloaded standby field (same
// source draw order, standby beneath active), each layer lands through its
// own StageMapRect projection (pt_minimap_core.ts), and the shared
// pt_map_images cache means a raster the minimap already decoded never
// fetches again here.
//
// What differs from the corner minimap is the framing alone: the same PT
// source raster over the same PT world rect drawn through a larger
// destination rect into the 560px window canvas (buildPtFieldMapView fits the
// composited set's union instead of clipping a player-centered window), so
// the map stays sharp rather than stretching the small bitmap. The player
// arrow keeps the minimap's exact convention (triangle tip up = +Z, rotated
// by -facing), scaled up for the larger surface; the field display name
// resolves the same way as the corner label (localized Ricarten title,
// authentic name for every other field) and draws as a cached text sprite.
//
// CADENCE: the window repaints from hud.update()'s mediumHud band while open
// (same contract as the WoC map window). Rasters still in flight leave the
// PT void fill, exactly like a not-yet-decoded minimap background.
//
// NO-MAGIC-VALUES: the color tokens are resolved via getComputedStyle ONCE
// per redraw and cached on the instance (the static :root tokens do not
// mutate at runtime); every other literal (arrow geometry, title font and
// baseline) is a named constant.

import { getPtFieldDisplayName } from '../sim/content/pt_field_names';
import { activePtMapDescriptor, standbyPtMapDescriptor } from '../sim/pt_field_active';
import type { IWorld } from '../world_api';
import { ptMapRasterImage } from './pt_map_images';
import {
  buildPtFieldMapView,
  PT_MINIMAP_MAX_X,
  PT_MINIMAP_MAX_Z,
  PT_MINIMAP_MIN_X,
  PT_MINIMAP_MIN_Z,
  PT_MINIMAP_TEXTURE_URL,
  ptMinimapLayers,
  type PtMinimapLayer,
} from './pt_minimap_core';
import { TextSpriteCache, type TextSpriteStyle } from './text_sprite_cache';

// Player arrow geometry: the minimap's compact profile (1.5x the corner
// marker), sized for the large window canvas rather than invented anew.
const PT_MAP_ARROW_TIP_Y = -10.5;
const PT_MAP_ARROW_HALF_X = 6.75;
const PT_MAP_ARROW_BASE_Y = 8.25;
const PT_MAP_ARROW_OUTLINE_WIDTH = 1.5;
// Field-name title, mirroring the overworld map's title typography.
const PT_MAP_TITLE_FONT = 'bold 16px Georgia';
const PT_MAP_TITLE_BASELINE_Y = 20;
const PT_MAP_TITLE_OUTLINE_WIDTH = 3;

// The tokens the painter resolves once and caches (a 2D context reads CSS
// vars only through getComputedStyle; the --color-* set is static :root).
const PT_MAP_COLOR_TOKENS = {
  ptVoid: '--color-minimap-void',
  player: '--color-minimap-player',
  outline: '--color-minimap-outline',
  titleLabel: '--color-map-label',
  titleOutline: '--color-map-outline',
} as const;

type PtMapColors = Record<keyof typeof PT_MAP_COLOR_TOKENS, string>;

export interface PtMapPaintResult {
  /** The resolved field display name (for the window's a11y summary). */
  name: string;
}

export class PtMapPainter {
  private readonly textSprites = new TextSpriteCache();
  private colors: PtMapColors | null = null;

  constructor(
    /** The localized Ricarten field title, same as the corner minimap's. */
    private readonly ricartenName: () => string,
  ) {}

  private resolveColors(): PtMapColors {
    if (this.colors) return this.colors;
    const cs = getComputedStyle(document.documentElement);
    const colors = {} as PtMapColors;
    for (const key of Object.keys(PT_MAP_COLOR_TOKENS) as (keyof typeof PT_MAP_COLOR_TOKENS)[]) {
      colors[key] = cs.getPropertyValue(PT_MAP_COLOR_TOKENS[key]).trim();
    }
    // Cache only once the tokens actually resolved (same self-heal rule as
    // the minimap: a redraw before the stylesheet lands must not freeze '').
    if (colors.player) this.colors = colors;
    return colors;
  }

  /** The layer set paintPtFields would composite right now, including the
   *  descriptor-less Ricarten fallback for a host with no bound field. */
  private currentLayers(active: ReturnType<typeof activePtMapDescriptor>): PtMinimapLayer[] {
    if (active) return ptMinimapLayers(active, standbyPtMapDescriptor());
    return [
      {
        id: 'ricarten',
        png: PT_MINIMAP_TEXTURE_URL,
        rect: {
          minX: PT_MINIMAP_MIN_X,
          maxX: PT_MINIMAP_MAX_X,
          minZ: PT_MINIMAP_MIN_Z,
          maxZ: PT_MINIMAP_MAX_Z,
        },
      },
    ];
  }

  /** Paint one enlarged-map redraw and return the surface's display name. */
  paint(ctx: CanvasRenderingContext2D, world: IWorld, S: number): PtMapPaintResult {
    const colors = this.resolveColors();
    const p = world.player;
    const active = activePtMapDescriptor();
    const name =
      active === null || active.id === 'ricarten'
        ? this.ricartenName()
        : getPtFieldDisplayName(active.id);
    const view = buildPtFieldMapView(this.currentLayers(active), p.pos.x, p.pos.z, p.facing, S);

    ctx.clearRect(0, 0, S, S);
    // The authentic rasters' unmapped area is alpha-0; the void fill keeps
    // letterboxed space and undecoded layers dark, matching the minimap.
    ctx.fillStyle = colors.ptVoid;
    ctx.fillRect(0, 0, S, S);
    ctx.imageSmoothingEnabled = true;
    for (const layer of view.layers) {
      const img = ptMapRasterImage(layer.png);
      if (img === null) continue;
      const r = layer.dest;
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
    }

    // The player arrow: same silhouette and rotation rule as the corner
    // minimap's (tip up = +Z world, rotate -facing), at the compact scale.
    ctx.save();
    ctx.translate(view.player.mx, view.player.my);
    ctx.rotate(view.player.angle);
    ctx.fillStyle = colors.player;
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = PT_MAP_ARROW_OUTLINE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(0, PT_MAP_ARROW_TIP_Y);
    ctx.lineTo(PT_MAP_ARROW_HALF_X, PT_MAP_ARROW_BASE_Y);
    ctx.lineTo(-PT_MAP_ARROW_HALF_X, PT_MAP_ARROW_BASE_Y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // The field title, one cached text sprite per redraw (the map-painter
    // contract: localized text never goes through the canvas text API).
    this.textSprites.beginRedraw();
    const titleStyle: TextSpriteStyle = {
      font: PT_MAP_TITLE_FONT,
      fill: colors.titleLabel,
      stroke: colors.titleOutline,
      lineWidth: PT_MAP_TITLE_OUTLINE_WIDTH,
    };
    this.textSprites.draw(ctx, name, S / 2, PT_MAP_TITLE_BASELINE_Y, titleStyle);

    return { name };
  }
}
