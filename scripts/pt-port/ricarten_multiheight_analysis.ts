/**
 * Ricarten village-2 Multi-Height / Overhang Analysis
 *
 * Reads the real village-2.smd via the existing stage_smd_inspector parser,
 * then analyzes the 42,408 walkable (SMMAT_STAT_CHECK_FACE) faces to
 * determine whether Ricarten's walkable surface is single-valued (heightfield-
 * compatible) or multi-valued (requires triangle collision or hybrid).
 *
 * Method: for each walkable face, compute its XZ bounding box. Rasterize it
 * into a coarse grid (cell size = PT step height = 10 world units). For each
 * grid cell, collect the interpolated Y heights from all faces that project
 * onto it. Report cells where the Y range exceeds the step height.
 *
 * This is OFFLINE ANALYSIS ONLY. Does not modify production code or assets.
 *
 * Usage:
 *   npx tsx scripts/pt-port/ricarten_multiheight_analysis.ts <path-to-village-2.smd>
 */

import { parseStageSmd, type StageSmdInspection, type StageFace, type StageVertex } from './stage_smd_inspector';

const FONE = 256;
const STEP_HEIGHT_WORLD = 10; // PT step height = 10 * fONE = 10 world units

// Grid cell size for multi-height analysis (world units).
// Using the PT step height as the threshold: if two surfaces at the same XZ
// are separated by more than the step height, a player can stand on both.
const GRID_CELL_WORLD = 10;

interface CellHeights {
  x: number; // grid cell X index
  z: number; // grid cell Z index
  heights: number[]; // sorted unique Y heights (world units)
  yRange: number; // max - min
  faceCount: number;
}

interface MultiHeightRegion {
  gridX: number;
  gridZ: number;
  centerX: number; // world units
  centerZ: number; // world units
  heights: number[];
  yRange: number;
  faceCount: number;
  separation: number; // max gap between consecutive sorted heights
}

interface OverhangExample {
  faceIndex: number;
  materialIndex: number;
  // The face's XZ bounds
  minX: number; maxX: number;
  minZ: number; maxZ: number;
  // The face's Y range
  minY: number; maxY: number;
  // Whether another walkable face exists below this face at overlapping XZ
  hasFaceBelow: boolean;
  belowY: number; // the Y of the face below (if any)
}

// Compute the interpolated Y height of a triangle at a given XZ point.
// Returns null if the point is outside the triangle's XZ projection.
function triangleHeightAt(
  a: StageVertex, b: StageVertex, c: StageVertex,
  px: number, pz: number
): number | null {
  // Barycentric coordinates on the XZ plane
  const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (d === 0) return null;
  const l1 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / d;
  const l2 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / d;
  const l3 = 1 - l1 - l2;
  if (l1 < -0.001 || l2 < -0.001 || l3 < -0.001) return null;
  // Interpolate Y
  return l1 * a.y + l2 * b.y + l3 * c.y;
}

export interface MultiHeightAnalysis {
  summary: {
    totalWalkableFaces: number;
    gridCellSize: number;
    gridCellsX: number;
    gridCellsZ: number;
    totalGridCells: number;
    cellsWithFaces: number;
    cellsWithMultipleHeights: number;
    cellsWithSignificantSeparation: number;
    maxSeparation: number;
    maxSeparationCell: { x: number; z: number; centerX: number; centerZ: number } | null;
    multiHeightPercentage: number;
  };
  topMultiHeightRegions: MultiHeightRegion[];
  overhangExamples: OverhangExample[];
  yDistribution: {
    minY: number;
    maxY: number;
    buckets: { range: string; count: number }[];
  };
}

export function analyzeMultiHeight(result: StageSmdInspection): MultiHeightAnalysis {
  const walkableFaces: { index: number; face: StageFace }[] = [];
  for (let fi = 0; fi < result.faces.length; fi++) {
    const mat = result.materials[result.faces[fi].materialIndex];
    if (mat && mat.isWalkable) {
      walkableFaces.push({ index: fi, face: result.faces[fi] });
    }
  }

  const { minX, maxX, minZ, maxZ } = result.bounds;
  const minXf = minX / FONE;
  const maxXf = maxX / FONE;
  const minZf = minZ / FONE;
  const maxZf = maxZ / FONE;

  const gridCellsX = Math.ceil((maxXf - minXf) / GRID_CELL_WORLD);
  const gridCellsZ = Math.ceil((maxZf - minZf) / GRID_CELL_WORLD);

  // Face-driven rasterization: for each walkable face, compute its XZ bounding
  // box, find the grid cells it overlaps, and sample the interpolated Y at each
  // cell center. This is O(walkableFaces * avgCellsPerFace) instead of
  // O(gridCells * walkableFaces).
  const cellHeightsMap = new Map<string, number[]>();
  const cellFaceCountMap = new Map<string, number>();

  for (const { face } of walkableFaces) {
    const a = result.vertices[face.a];
    const b = result.vertices[face.b];
    const c = result.vertices[face.c];

    const fminX = Math.min(a.x, b.x, c.x) / FONE;
    const fmaxX = Math.max(a.x, b.x, c.x) / FONE;
    const fminZ = Math.min(a.z, b.z, c.z) / FONE;
    const fmaxZ = Math.max(a.z, b.z, c.z) / FONE;

    // Find grid cell range for this face's XZ bounds
    const gxStart = Math.floor((fminX - minXf) / GRID_CELL_WORLD);
    const gxEnd = Math.ceil((fmaxX - minXf) / GRID_CELL_WORLD);
    const gzStart = Math.floor((fminZ - minZf) / GRID_CELL_WORLD);
    const gzEnd = Math.ceil((fmaxZ - minZf) / GRID_CELL_WORLD);

    for (let gx = gxStart; gx <= gxEnd; gx++) {
      for (let gz = gzStart; gz <= gzEnd; gz++) {
        if (gx < 0 || gz < 0 || gx >= gridCellsX || gz >= gridCellsZ) continue;

        const cx = Math.round((minXf + (gx + 0.5) * GRID_CELL_WORLD) * FONE);
        const cz = Math.round((minZf + (gz + 0.5) * GRID_CELL_WORLD) * FONE);

        // Quick AABB check
        if (cx < Math.min(a.x, b.x, c.x) || cx > Math.max(a.x, b.x, c.x) ||
            cz < Math.min(a.z, b.z, c.z) || cz > Math.max(a.z, b.z, c.z)) continue;

        const y = triangleHeightAt(a, b, c, cx, cz);
        if (y === null) continue;

        const key = `${gx},${gz}`;
        let heights = cellHeightsMap.get(key);
        if (!heights) {
          heights = [];
          cellHeightsMap.set(key, heights);
          cellFaceCountMap.set(key, 0);
        }
        heights.push(y / FONE);
        cellFaceCountMap.set(key, (cellFaceCountMap.get(key) || 0) + 1);
      }
    }
  }

  // Analyze cells with multiple heights
  const multiHeightRegions: MultiHeightRegion[] = [];
  let maxSeparation = 0;
  let maxSeparationCell: MultiHeightRegion | null = null;
  let cellsWithMultipleHeights = 0;
  let cellsWithSignificantSeparation = 0;

  for (const [key, heights] of cellHeightsMap) {
    if (heights.length < 2) continue;

    // Sort and find unique heights (within 1 world unit tolerance)
    const sorted = [...heights].sort((a, b) => a - b);
    const unique: number[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - unique[unique.length - 1] > 1.0) {
        unique.push(sorted[i]);
      }
    }

    if (unique.length < 2) continue;

    cellsWithMultipleHeights++;

    const yRange = unique[unique.length - 1] - unique[0];
    let maxGap = 0;
    for (let i = 1; i < unique.length; i++) {
      maxGap = Math.max(maxGap, unique[i] - unique[i - 1]);
    }

    if (maxGap > STEP_HEIGHT_WORLD) {
      cellsWithSignificantSeparation++;
    }

    const [gx, gz] = key.split(',').map(Number);
    const region: MultiHeightRegion = {
      gridX: gx,
      gridZ: gz,
      centerX: minXf + (gx + 0.5) * GRID_CELL_WORLD,
      centerZ: minZf + (gz + 0.5) * GRID_CELL_WORLD,
      heights: unique,
      yRange,
      faceCount: cellFaceCountMap.get(key) || 0,
      separation: maxGap,
    };

    if (maxGap > maxSeparation) {
      maxSeparation = maxGap;
      maxSeparationCell = region;
    }

    multiHeightRegions.push(region);
  }

  // Sort by separation descending
  multiHeightRegions.sort((a, b) => b.separation - a.separation);

  // Y distribution
  let yMin = Infinity, yMax = -Infinity;
  for (const heights of cellHeightsMap.values()) {
    for (const h of heights) {
      if (h < yMin) yMin = h;
      if (h > yMax) yMax = h;
    }
  }
  const allHeightsForBuckets: number[] = [];
  for (const heights of cellHeightsMap.values()) {
    for (const h of heights) allHeightsForBuckets.push(h);
  }
  const yRange = yMax - yMin;
  const bucketCount = 20;
  const bucketSize = yRange / bucketCount;
  const buckets: { range: string; count: number }[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const lo = yMin + i * bucketSize;
    const hi = yMin + (i + 1) * bucketSize;
    const count = allHeightsForBuckets.filter(h => h >= lo && h < hi).length;
    buckets.push({ range: `${lo.toFixed(1)}-${hi.toFixed(1)}`, count });
  }

  // Overhang detection: use the grid to find cells with significant Y separation.
  // A cell with two heights separated by > step height means one surface is
  // above another at the same XZ = an overhang or multi-level walkable surface.
  const overhangExamples: OverhangExample[] = [];
  for (const [key, heights] of cellHeightsMap) {
    if (heights.length < 2) continue;
    const sorted = [...heights].sort((a, b) => a - b);
    const unique: number[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - unique[unique.length - 1] > 1.0) {
        unique.push(sorted[i]);
      }
    }
    if (unique.length < 2) continue;
    const maxGap = Math.max(...unique.slice(1).map((h, i) => h - unique[i]));
    if (maxGap <= STEP_HEIGHT_WORLD) continue;

    const [gx, gz] = key.split(',').map(Number);
    const cx = minXf + (gx + 0.5) * GRID_CELL_WORLD;
    const cz = minZf + (gz + 0.5) * GRID_CELL_WORLD;
    overhangExamples.push({
      faceIndex: -1, // grid-based, not face-specific
      materialIndex: -1,
      minX: cx - GRID_CELL_WORLD / 2,
      maxX: cx + GRID_CELL_WORLD / 2,
      minZ: cz - GRID_CELL_WORLD / 2,
      maxZ: cz + GRID_CELL_WORLD / 2,
      minY: unique[0],
      maxY: unique[unique.length - 1],
      hasFaceBelow: true,
      belowY: unique[0],
    });
  }

  return {
    summary: {
      totalWalkableFaces: walkableFaces.length,
      gridCellSize: GRID_CELL_WORLD,
      gridCellsX,
      gridCellsZ,
      totalGridCells: gridCellsX * gridCellsZ,
      cellsWithFaces: cellHeightsMap.size,
      cellsWithMultipleHeights,
      cellsWithSignificantSeparation,
      maxSeparation,
      maxSeparationCell: maxSeparationCell ? {
        x: maxSeparationCell.gridX,
        z: maxSeparationCell.gridZ,
        centerX: maxSeparationCell.centerX,
        centerZ: maxSeparationCell.centerZ,
      } : null,
      multiHeightPercentage: cellHeightsMap.size > 0
        ? (cellsWithMultipleHeights / cellHeightsMap.size) * 100
        : 0,
    },
    topMultiHeightRegions: multiHeightRegions.slice(0, 20),
    overhangExamples: overhangExamples.slice(0, 20),
    yDistribution: {
      minY: yMin,
      maxY: yMax,
      buckets,
    },
  };
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('ricarten_multiheight_analysis.ts')) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx scripts/pt-port/ricarten_multiheight_analysis.ts <path-to-village-2.smd>');
    process.exit(1);
  }
  const result = parseStageSmd(filePath);
  const analysis = analyzeMultiHeight(result);
  console.log(JSON.stringify(analysis, null, 2));
}
