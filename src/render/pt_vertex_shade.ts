// PT terrain vertex shading (smStage3d.cpp smSTAGE3D::SetVertexShade).
//
// The SMD binary stores each vertex's authored sDef_Color (RGBA int16).
// At load, PT multiplies the RGB channels by a per-vertex gouraud shade:
//
//   normal[v]  = average of adjacent face normals (fixed point, |n| = 256)
//   gShade     = ((n . VectLight) >> 8) / Contrast + Bright   (integer math)
//   rgb[v]    *= gShade >> 8, alpha forced to 255
//
// Phase 5A emits PT_VERTEX_COLORS (the authored colors) and
// PT_FIELD_LIGHTING (VectLight/Contrast/Bright). This module bakes the
// load-time shade once per field build, so the color attribute carries the
// same per-vertex diffuse PT writes into its render stream. The material
// transparency -> vertex alpha rule is handled separately by material
// opacity in pt_terrain.ts.
//
// All math mirrors the source's integer/fixed-point arithmetic so the
// output is deterministic and testable without a DOM or GPU.

/** Fixed-point scale PT uses for normals and VectLight (fONE = 256). */
const PT_FONE = 256;

export interface PtShadeInput {
  /** PT vertex positions, 3 per vertex (x, y, z fixed-point units). */
  vertices: ArrayLike<number>;
  /** Render faces, 4 per face (a, b, c, materialIndex). */
  faces: ArrayLike<number>;
  /** Authored sDef_Color, RGBA int16 per vertex. */
  colors: Int16Array;
  /** smSTAGE3D lighting header. */
  contrast: number;
  bright: number;
  vectLight: readonly [number, number, number];
}

/**
 * Bake authored colors x gouraud shade into Float32 RGB (0..~1.4, values
 * over 1.0 are PT overbright and intentionally preserved). Returns null
 * when the input cannot be shaded (empty/mismatched buffers).
 */
export function ptBakeVertexShade(input: PtShadeInput): Float32Array | null {
  const nVertex = Math.floor(input.vertices.length / 3);
  const nFace = Math.floor(input.faces.length / 4);
  if (nVertex === 0 || input.colors.length < nVertex * 4) return null;

  // Accumulate face normals per vertex (SetNormal output is a fixed-point
  // unit normal scaled to fONE).
  const nx = new Float64Array(nVertex);
  const ny = new Float64Array(nVertex);
  const nz = new Float64Array(nVertex);
  const nCount = new Int32Array(nVertex);

  const v = input.vertices;
  for (let fi = 0; fi < nFace; fi++) {
    const a = input.faces[fi * 4];
    const b = input.faces[fi * 4 + 1];
    const c = input.faces[fi * 4 + 2];
    // SetNormal: normalized cross of (b - a) x (c - a), fixed point.
    const ax = v[a * 3], ay = v[a * 3 + 1], az = v[a * 3 + 2];
    const ux = v[b * 3] - ax, uy = v[b * 3 + 1] - ay, uz = v[b * 3 + 2] - az;
    const wx = v[c * 3] - ax, wy = v[c * 3 + 1] - ay, wz = v[c * 3 + 2] - az;
    let cx = uy * wz - uz * wy;
    let cy = uz * wx - ux * wz;
    let cz = ux * wy - uy * wx;
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (len > 0) {
      cx = (cx / len) * PT_FONE;
      cy = (cy / len) * PT_FONE;
      cz = (cz / len) * PT_FONE;
    }
    for (const vi of [a, b, c]) {
      nx[vi] += cx;
      ny[vi] += cy;
      nz[vi] += cz;
      nCount[vi]++;
    }
  }

  const [lx, ly, lz] = input.vectLight;
  const out = new Float32Array(nVertex * 3);
  for (let vi = 0; vi < nVertex; vi++) {
    const cnt = nCount[vi];
    // Integer-divide the accumulated normal (source: normal /= NormalCnt).
    const nnx = cnt > 0 ? Math.trunc(nx[vi] / cnt) : 0;
    const nny = cnt > 0 ? Math.trunc(ny[vi] / cnt) : 0;
    const nnz = cnt > 0 ? Math.trunc(nz[vi] / cnt) : 0;

    // gShade = ((n . L) >> FLOATNS_BITS) / Contrast + Bright
    // FLOATNS_BITS = 8 (>>FLOATNS in the source).
    let gShade = Math.trunc((nnx * lx + nny * ly + nnz * lz) / PT_FONE);
    gShade = Math.trunc(gShade / input.contrast) + input.bright;

    const r = input.colors[vi * 4];
    const g = input.colors[vi * 4 + 1];
    const b = input.colors[vi * 4 + 2];
    out[vi * 3] = ((r * gShade) >> 8) / PT_FONE;
    out[vi * 3 + 1] = ((g * gShade) >> 8) / PT_FONE;
    out[vi * 3 + 2] = ((b * gShade) >> 8) / PT_FONE;
  }
  return out;
}

/**
 * Authored colors without the gouraud term (fallback when a field module
 * carries PT_VERTEX_COLORS but no PT_FIELD_LIGHTING header).
 */
export function ptVertexColorsOnly(colors: Int16Array, nVertex: number): Float32Array | null {
  if (nVertex === 0 || colors.length < nVertex * 4) return null;
  const out = new Float32Array(nVertex * 3);
  for (let vi = 0; vi < nVertex; vi++) {
    out[vi * 3] = colors[vi * 4] / PT_FONE;
    out[vi * 3 + 1] = colors[vi * 4 + 1] / PT_FONE;
    out[vi * 3 + 2] = colors[vi * 4 + 2] / PT_FONE;
  }
  return out;
}
