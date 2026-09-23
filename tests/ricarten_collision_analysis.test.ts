// Focused tests for the Ricarten non-walkable material analysis.
//
// Tests the analysis against the real village-2.smd if it exists
// at the known MagicPT path (skipped otherwise). Verifies:
//   - correct count of non-walkable materials
//   - correct total non-walkable face count
//   - water materials have transparency > 0.1
//   - decorative materials have transparency <= 0.1
//   - Mat 107 is a flat horizontal plane (water surface)

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseStageSmd } from '../scripts/pt-port/stage_smd_inspector';
import { analyzeNonWalkableMaterials } from '../scripts/pt-port/ricarten_collision_analysis';

const SMD_PATH = 'E:/CascadeProjects/PT-Project/MagicPT-Chinese/client/Field/Ricarten/village-2.smd';

describe('ricarten collision analysis', () => {
  it.skipIf(!existsSync(SMD_PATH))('identifies exactly 16 non-walkable materials', () => {
    const result = parseStageSmd(SMD_PATH);
    const analysis = analyzeNonWalkableMaterials(result);
    expect(analysis.summary.nonWalkableMaterialCount).toBe(16);
  });

  it.skipIf(!existsSync(SMD_PATH))('counts 7480 non-walkable faces out of 49888 total', () => {
    const result = parseStageSmd(SMD_PATH);
    const analysis = analyzeNonWalkableMaterials(result);
    expect(analysis.summary.totalFaces).toBe(49888);
    expect(analysis.summary.nonWalkableFaceCount).toBe(7480);
    expect(analysis.summary.walkableFaceCount).toBe(42408);
  });

  it.skipIf(!existsSync(SMD_PATH))('classifies water materials by transparency > 0.1', () => {
    const result = parseStageSmd(SMD_PATH);
    const analysis = analyzeNonWalkableMaterials(result);
    const waterMaterials = analysis.nonWalkableMaterials.filter(m => m.transparency > 0.1);
    const decorativeMaterials = analysis.nonWalkableMaterials.filter(m => m.transparency <= 0.1);

    // 3 water materials: 107, 140, 232
    expect(waterMaterials).toHaveLength(3);
    expect(waterMaterials.map(m => m.materialIndex).sort((a, b) => a - b)).toEqual([107, 140, 232]);

    // 13 decorative/ignored materials
    expect(decorativeMaterials).toHaveLength(13);
  });

  it.skipIf(!existsSync(SMD_PATH))('confirms Mat 107 is a flat horizontal water surface', () => {
    const result = parseStageSmd(SMD_PATH);
    const analysis = analyzeNonWalkableMaterials(result);
    const mat107 = analysis.nonWalkableMaterials.find(m => m.materialIndex === 107);

    expect(mat107).toBeDefined();
    expect(mat107!.transparency).toBeGreaterThan(0.1);
    expect(mat107!.faceCount).toBe(1530);

    // All representative faces should have normal approx (0, -1, 0) = flat horizontal
    for (const face of mat107!.representativeFaces) {
      expect(Math.abs(face.normal.x)).toBeLessThan(0.01);
      expect(face.normal.y).toBeLessThan(-0.99);
      expect(Math.abs(face.normal.z)).toBeLessThan(0.01);
    }
  });

  it.skipIf(!existsSync(SMD_PATH))('confirms no non-walkable material has SMMAT_STAT_CHECK_FACE', () => {
    const result = parseStageSmd(SMD_PATH);
    const analysis = analyzeNonWalkableMaterials(result);
    for (const mat of analysis.nonWalkableMaterials) {
      // SMMAT_STAT_CHECK_FACE = 0x1
      expect(mat.meshState & 1).toBe(0);
    }
  });

  it.skipIf(!existsSync(SMD_PATH))('confirms water face total is 1658 (107+140+232)', () => {
    const result = parseStageSmd(SMD_PATH);
    const analysis = analyzeNonWalkableMaterials(result);
    const waterFaces = analysis.nonWalkableMaterials
      .filter(m => m.transparency > 0.1)
      .reduce((sum, m) => sum + m.faceCount, 0);
    expect(waterFaces).toBe(1658);
  });

  it.skipIf(!existsSync(SMD_PATH))('confirms decorative face total is 5822 (ignored by PT collision)', () => {
    const result = parseStageSmd(SMD_PATH);
    const analysis = analyzeNonWalkableMaterials(result);
    const decorativeFaces = analysis.nonWalkableMaterials
      .filter(m => m.transparency <= 0.1)
      .reduce((sum, m) => sum + m.faceCount, 0);
    expect(decorativeFaces).toBe(5822);
  });
});
