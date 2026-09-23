/**
 * Ricarten village-2 Non-Walkable Material Analysis
 *
 * Reads the real village-2.smd via the existing stage_smd_inspector parser,
 * then produces a per-material analysis of every non-walkable material:
 *   - face count and percentage of total
 *   - spatial bounds (min/max X/Y/Z)
 *   - StageArea cell count and concentration
 *   - representative face samples (first, middle, last, spatially distributed)
 *   - face center and approximate normal
 *
 * This is OFFLINE ANALYSIS ONLY. It does not modify any production code
 * or assets. It reads the SMD file read-only.
 *
 * Usage:
 *   npx tsx scripts/pt-port/ricarten_collision_analysis.ts <path-to-village-2.smd>
 */

import { parseStageSmd, type StageSmdInspection, type StageFace, type StageVertex } from './stage_smd_inspector';

const FONE = 256;
const MAP_SIZE = 256;
const FLOATNS = 8;

interface MaterialAnalysis {
  materialIndex: number;
  meshState: number;
  transparency: number;
  textureNames: string[];
  faceCount: number;
  facePercentage: number;
  stageAreaCellCount: number;
  bounds: {
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
  };
  boundsFloat: {
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
  };
  representativeFaces: RepresentativeFace[];
}

interface RepresentativeFace {
  faceIndex: number;
  materialIndex: number;
  vertexA: number; vertexB: number; vertexC: number;
  vertexACoord: { x: number; y: number; z: number };
  vertexBCoord: { x: number; y: number; z: number };
  vertexCCoord: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  centerFloat: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  stageAreaCell: { x: number; z: number };
  textureName: string;
}

function computeFaceNormal(
  a: StageVertex, b: StageVertex, c: StageVertex
): { x: number; y: number; z: number } {
  // Edge vectors
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  // Cross product
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  // Normalize
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: nx / len, y: ny / len, z: nz / len };
}

function stageAreaCellFor(x: number, z: number): { x: number; z: number } {
  // PT: cell = (coord >> (6 + FLOATNS)) & 0xFF
  // 6+FLOATNS = 6+8 = 14
  return {
    x: (x >> 14) & 0xFF,
    z: (z >> 14) & 0xFF,
  };
}

function analyzeMaterial(
  result: StageSmdInspection,
  materialIndex: number
): MaterialAnalysis {
  const mat = result.materials[materialIndex];
  const faces: { index: number; face: StageFace }[] = [];

  for (let fi = 0; fi < result.faces.length; fi++) {
    if (result.faces[fi].materialIndex === materialIndex) {
      faces.push({ index: fi, face: result.faces[fi] });
    }
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  const cells = new Set<string>();

  for (const { face } of faces) {
    const a = result.vertices[face.a];
    const b = result.vertices[face.b];
    const c = result.vertices[face.c];
    for (const v of [a, b, c]) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
    // StageArea cell for face center
    const cx = (a.x + b.x + c.x) / 3;
    const cz = (a.z + b.z + c.z) / 3;
    const cell = stageAreaCellFor(cx, cz);
    cells.add(`${cell.x},${cell.z}`);
  }

  // Representative faces: first, middle, last, plus 2 spatially distributed
  const repIndices: number[] = [];
  if (faces.length > 0) {
    repIndices.push(0);
    if (faces.length > 1) {
      repIndices.push(Math.floor(faces.length / 2));
      repIndices.push(faces.length - 1);
    }
    if (faces.length > 6) {
      repIndices.push(Math.floor(faces.length / 4));
      repIndices.push(Math.floor((faces.length * 3) / 4));
    }
  }
  const uniqueRepIndices = [...new Set(repIndices)].sort((a, b) => a - b);

  const representativeFaces: RepresentativeFace[] = uniqueRepIndices.map(idx => {
    const { index: fi, face } = faces[idx];
    const a = result.vertices[face.a];
    const b = result.vertices[face.b];
    const c = result.vertices[face.c];
    const center = {
      x: (a.x + b.x + c.x) / 3,
      y: (a.y + b.y + c.y) / 3,
      z: (a.z + b.z + c.z) / 3,
    };
    const normal = computeFaceNormal(a, b, c);
    const cell = stageAreaCellFor(center.x, center.z);
    return {
      faceIndex: fi,
      materialIndex,
      vertexA: face.a, vertexB: face.b, vertexC: face.c,
      vertexACoord: { x: a.x, y: a.y, z: a.z },
      vertexBCoord: { x: b.x, y: b.y, z: b.z },
      vertexCCoord: { x: c.x, y: c.y, z: c.z },
      center,
      centerFloat: { x: center.x / FONE, y: center.y / FONE, z: center.z / FONE },
      normal,
      stageAreaCell: cell,
      textureName: mat.textureNames[0] || '(none)',
    };
  });

  return {
    materialIndex,
    meshState: mat.meshState,
    transparency: mat.transparency,
    textureNames: mat.textureNames,
    faceCount: faces.length,
    facePercentage: (faces.length / result.nFace) * 100,
    stageAreaCellCount: cells.size,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    boundsFloat: {
      minX: minX / FONE, maxX: maxX / FONE,
      minY: minY / FONE, maxY: maxY / FONE,
      minZ: minZ / FONE, maxZ: maxZ / FONE,
    },
    representativeFaces,
  };
}

// ---------------------------------------------------------------------------
// Exports (for direct import by tests)
// ---------------------------------------------------------------------------

export interface CollisionAnalysisOutput {
  summary: {
    totalFaces: number;
    totalMaterials: number;
    nonWalkableMaterialCount: number;
    nonWalkableFaceCount: number;
    nonWalkableFacePercentage: number;
    walkableFaceCount: number;
    mapBounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  };
  nonWalkableMaterials: Array<{
    materialIndex: number;
    meshState: number;
    transparency: number;
    textureNames: string[];
    faceCount: number;
    facePercentage: number;
    stageAreaCellCount: number;
    bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
    boundsFloat: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
    boundsSpan: { x: number; y: number; z: number };
    representativeFaces: Array<{
      faceIndex: number;
      vertices: number[];
      vertexCoords: Array<{ x: number; y: number; z: number }>;
      center: { x: number; y: number; z: number };
      centerFloat: { x: number; y: number; z: number };
      normal: { x: number; y: number; z: number };
      stageAreaCell: { x: number; z: number };
      textureName: string;
    }>;
  }>;
}

/**
 * Run the collision analysis on a parsed SMD inspection result.
 * Exposed for direct import by tests (avoids spawning a subprocess).
 */
export function analyzeNonWalkableMaterials(result: StageSmdInspection): CollisionAnalysisOutput {
  const nonWalkableMaterials: number[] = [];
  for (let mi = 0; mi < result.materials.length; mi++) {
    if (!result.materials[mi].isWalkable) {
      nonWalkableMaterials.push(mi);
    }
  }

  const analyses = nonWalkableMaterials.map(mi => analyzeMaterial(result, mi));

  return {
    summary: {
      totalFaces: result.nFace,
      totalMaterials: result.materialCount,
      nonWalkableMaterialCount: nonWalkableMaterials.length,
      nonWalkableFaceCount: result.walkabilityStats.nonWalkableFaces,
      nonWalkableFacePercentage: result.walkabilityStats.walkablePercentage > 0
        ? 100 - result.walkabilityStats.walkablePercentage
        : 0,
      walkableFaceCount: result.walkabilityStats.walkableFaces,
      mapBounds: result.boundsFloat,
    },
    nonWalkableMaterials: analyses.map(a => ({
      materialIndex: a.materialIndex,
      meshState: a.meshState,
      transparency: a.transparency,
      textureNames: a.textureNames,
      faceCount: a.faceCount,
      facePercentage: a.facePercentage,
      stageAreaCellCount: a.stageAreaCellCount,
      bounds: a.bounds,
      boundsFloat: a.boundsFloat,
      boundsSpan: {
        x: (a.bounds.maxX - a.bounds.minX) / FONE,
        y: (a.bounds.maxY - a.bounds.minY) / FONE,
        z: (a.bounds.maxZ - a.bounds.minZ) / FONE,
      },
      representativeFaces: a.representativeFaces.map(rf => ({
        faceIndex: rf.faceIndex,
        vertices: [rf.vertexA, rf.vertexB, rf.vertexC],
        vertexCoords: [rf.vertexACoord, rf.vertexBCoord, rf.vertexCCoord],
        center: rf.center,
        centerFloat: rf.centerFloat,
        normal: rf.normal,
        stageAreaCell: rf.stageAreaCell,
        textureName: rf.textureName,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx scripts/pt-port/ricarten_collision_analysis.ts <path-to-village-2.smd>');
    process.exit(1);
  }

  const result = parseStageSmd(filePath);
  const output = analyzeNonWalkableMaterials(result);
  console.log(JSON.stringify(output, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith('ricarten_collision_analysis.ts')) {
  main();
}
