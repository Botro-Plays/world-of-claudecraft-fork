// Focused tests for the Ricarten multi-height / overhang analysis.
//
// Tests the analysis against the real village-2.smd if it exists
// at the known MagicPT path (skipped otherwise). Verifies:
//   - Ricarten has significant multi-level walkable geometry
//   - max separation exceeds the PT step height
//   - a meaningful percentage of cells have multiple heights
//   - the Y distribution spans multiple distinct bands

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { parseStageSmd } from '../scripts/pt-port/stage_smd_inspector';
import { analyzeMultiHeight } from '../scripts/pt-port/ricarten_multiheight_analysis';

const SMD_PATH = 'E:/CascadeProjects/PT-Project/MagicPT-Chinese/client/Field/Ricarten/village-2.smd';
const STEP_HEIGHT_WORLD = 10; // PT step height = 10 * fONE = 10 world units

describe('ricarten multi-height analysis', () => {
  it.skipIf(!existsSync(SMD_PATH))('analyzes 42408 walkable faces', () => {
    const result = parseStageSmd(SMD_PATH);
    const analysis = analyzeMultiHeight(result);
    expect(analysis.summary.totalWalkableFaces).toBe(42408);
  });

  it.skipIf(!existsSync(SMD_PATH))('confirms significant multi-level geometry (cells with significant separation > 1000)', () => {
    const result = parseStageSmd(SMD_PATH);
    const analysis = analyzeMultiHeight(result);
    // 31,618 cells have separation > step height = a major multi-level map
    expect(analysis.summary.cellsWithSignificantSeparation).toBeGreaterThan(1000);
  });

  it.skipIf(!existsSync(SMD_PATH))('confirms max separation exceeds 100 world units (multi-story structures)', () => {
    const result = parseStageSmd(SMD_PATH);
    const analysis = analyzeMultiHeight(result);
    // Max separation = 586 world units = multi-story buildings
    expect(analysis.summary.maxSeparation).toBeGreaterThan(100);
  });

  it.skipIf(!existsSync(SMD_PATH))('confirms multi-height cells are a meaningful percentage (> 10%)', () => {
    const result = parseStageSmd(SMD_PATH);
    const analysis = analyzeMultiHeight(result);
    // 19.4% of cells with faces have multiple heights
    expect(analysis.summary.multiHeightPercentage).toBeGreaterThan(10);
  });

  it.skipIf(!existsSync(SMD_PATH))('confirms Y distribution spans multiple distinct bands', () => {
    const result = parseStageSmd(SMD_PATH);
    const analysis = analyzeMultiHeight(result);
    const range = analysis.yDistribution.maxY - analysis.yDistribution.minY;
    // Y range is over 1000 world units (min -259, max 983)
    expect(range).toBeGreaterThan(1000);
  });

  it.skipIf(!existsSync(SMD_PATH))('confirms heightfield-only collision would lose significant geometry', () => {
    const result = parseStageSmd(SMD_PATH);
    const analysis = analyzeMultiHeight(result);
    // A heightfield keeps only the topmost surface per XZ cell.
    // Cells with significant separation would lose a walkable surface.
    const lostSurfaces = analysis.summary.cellsWithSignificantSeparation;
    const totalCells = analysis.summary.cellsWithFaces;
    const lossPercentage = (lostSurfaces / totalCells) * 100;
    // 18.3% of walkable cells would lose a surface = unacceptable fidelity loss
    expect(lossPercentage).toBeGreaterThan(10);
  });
});
