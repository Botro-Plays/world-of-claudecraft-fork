// Shared PT field-map raster cache (Phase 6F).
//
// The corner minimap (minimap_painter paintPtFields) and the enlarged M-key
// map window (pt_map_painter) composite the SAME converted field rasters
// (Field/map/<id>.tga as PNG). This module owns the one image cache both
// painters share, so a field's raster is fetched and decoded exactly once per
// session no matter which surface asks for it first, and reopening the map
// window never re-kicks a fetch.
//
// States: 'loading' latches an in-flight request, 'missing' latches a failed
// one (a 404 is skipped thereafter instead of hammered every redraw). The
// redraw cadence retries a still-loading image naturally: each call returns
// null until the browser has decoded it, exactly like the zone-background
// contract the minimap rasters replaced.
//
// DOM reach: `new Image()` is browser state, so this module is registered in
// UI_DOM_MODULES (tests/architecture.test.ts). It is otherwise stateless: one
// module-level Map keyed by PNG URL, bounded by the fields visited.

const ptRasterCache = new Map<string, HTMLImageElement | 'loading' | 'missing'>();

/**
 * Kick (or join) the one-time load for one field raster. Returns the decoded
 * image, or null while it is still in flight / permanently missing.
 */
export function ptMapRasterImage(url: string): HTMLImageElement | null {
  const cur = ptRasterCache.get(url);
  if (cur === 'loading' || cur === 'missing') return null;
  if (cur) return cur;
  if (typeof Image === 'undefined') {
    ptRasterCache.set(url, 'missing');
    return null;
  }
  ptRasterCache.set(url, 'loading');
  const img = new Image();
  img.onload = () => {
    ptRasterCache.set(url, img);
  };
  img.onerror = () => {
    ptRasterCache.set(url, 'missing');
  };
  img.src = url;
  return null;
}

/** Test seam: drop every cached entry. Browser runtime never calls this -
 * the cache is session-lifed by design (a raster never changes mid-session). */
export function ptMapRasterCacheReset(): void {
  ptRasterCache.clear();
}
