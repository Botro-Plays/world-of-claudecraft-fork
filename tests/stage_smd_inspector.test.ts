// Focused tests for the PT Stage SMD inspector.
//
// Tests the parser against:
//   1. A synthetic minimal SMD buffer (deterministic, no external file needed)
//   2. The real village-2.smd if it exists at the known MagicPT path (skipped otherwise)
//
// The synthetic buffer is built from the exact struct layouts reverse-engineered
// from PT-Source/smLib3d/. It validates that the parser correctly reads headers,
// counts, bounds, materials, vertices, faces, and walkability flags.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  parseStageSmdBuffer,
  type StageSmdInspection,
} from '../scripts/pt-port/stage_smd_inspector';

// ---------------------------------------------------------------------------
// Constants (must match the inspector)
// ---------------------------------------------------------------------------

const FONE = 256;
const SIZE_DFILE_HEADER = 556;
const SIZE_STAGE3D = 262_260;
const SIZE_MATERIAL_GROUP = 88;
const SIZE_MATERIAL = 320;
const SIZE_STAGE_VERTEX = 28;
const SIZE_STAGE_FACE = 28;
const SIZE_TEXLINK = 32;
const SIZE_LIGHT3D = 28;
const MAP_SIZE = 256;

const SMD_STAGE_HEADER_V072 = 'SMD Stage data Ver 0.72';

// Offsets within smSTAGE3D raw struct
const OFF_N_VERTEX = 262_196;
const OFF_N_FACE = 262_200;
const OFF_N_TEXLINK = 262_204;
const OFF_N_LIGHT = 262_208;
const OFF_STAGE_MAP_RECT = 262_244;

// Offsets within smMATERIAL
const OFF_MAT_IN_USE = 0;
const OFF_MAT_TEXTURE_COUNTER = 4;
const OFF_MAT_MESH_STATE = 168;
const OFF_MAT_ANIM_TEX_COUNTER = 304;

const SMMAT_STAT_CHECK_FACE = 0x00000001;

// ---------------------------------------------------------------------------
// Synthetic SMD builder
// ---------------------------------------------------------------------------

/**
 * Build a minimal synthetic stage SMD buffer for testing.
 * Creates a small terrain with 3 vertices, 1 face, 1 material, 0 lights.
 */
function buildSyntheticSmd(): Buffer {
  const nVertex = 3;
  const nFace = 1;
  const nTexLink = 1;
  const nLight = 0;
  const materialCount = 1;

  // Calculate total size
  const materialGroupSize = SIZE_MATERIAL_GROUP + materialCount * SIZE_MATERIAL;
  // Material 0: InUse, 1 texture, name "test.bmp\0" + nameA "\0" = 10 bytes
  const textureNameBlock = 4 + 10; // int StrLen + "test.bmp\0\0"
  const verticesSize = nVertex * SIZE_STAGE_VERTEX;
  const facesSize = nFace * SIZE_STAGE_FACE;
  const texLinksSize = nTexLink * SIZE_TEXLINK;
  const lightsSize = nLight * SIZE_LIGHT3D;

  // StageArea: all cells empty (zero pointers) = 0 bytes of area data
  const totalSize = SIZE_DFILE_HEADER + SIZE_STAGE3D + materialGroupSize + textureNameBlock +
    verticesSize + facesSize + texLinksSize + lightsSize;

  const buf = Buffer.alloc(totalSize, 0);

  let offset = 0;

  // 1. smDFILE_HEADER (556 bytes)
  buf.write(SMD_STAGE_HEADER_V072, 0, 'ascii');
  buf.writeInt32LE(0, 24); // ObjCounter
  buf.writeInt32LE(materialCount, 28); // MatCounter
  buf.writeInt32LE(SIZE_DFILE_HEADER, 32); // MatFilePoint
  buf.writeInt32LE(SIZE_DFILE_HEADER + SIZE_STAGE3D + materialGroupSize + textureNameBlock, 36); // First_ObjInfoPoint
  offset = SIZE_DFILE_HEADER;

  // 2. smSTAGE3D raw struct (262,260 bytes)
  // StageArea[256][256] = all zeros (no cells have data)
  // Write counts
  buf.writeInt32LE(nVertex, offset + OFF_N_VERTEX);
  buf.writeInt32LE(nFace, offset + OFF_N_FACE);
  buf.writeInt32LE(nTexLink, offset + OFF_N_TEXLINK);
  buf.writeInt32LE(nLight, offset + OFF_N_LIGHT);

  // StageMapRect: left=minX, top=minZ, right=maxX, bottom=maxZ
  // Vertices: (0, 0, 0), (256, 0, 0), (0, 0, 256) → minX=0, maxX=256, minZ=0, maxZ=256
  buf.writeInt32LE(0, offset + OFF_STAGE_MAP_RECT); // left (minX)
  buf.writeInt32LE(0, offset + OFF_STAGE_MAP_RECT + 4); // top (minZ)
  buf.writeInt32LE(256, offset + OFF_STAGE_MAP_RECT + 8); // right (maxX)
  buf.writeInt32LE(256, offset + OFF_STAGE_MAP_RECT + 12); // bottom (maxZ)

  offset += SIZE_STAGE3D;

  // 3. Material group
  // smMATERIAL_GROUP raw struct (88 bytes) — MaterialCount at offset 8
  buf.writeUInt32LE(materialCount, offset + 8);
  offset += SIZE_MATERIAL_GROUP;

  // Material 0: InUse=1, TextureCounter=1, MeshState=SMMAT_STAT_CHECK_FACE (walkable)
  buf.writeUInt32LE(1, offset + OFF_MAT_IN_USE);
  buf.writeUInt32LE(1, offset + OFF_MAT_TEXTURE_COUNTER);
  buf.writeInt32LE(SMMAT_STAT_CHECK_FACE, offset + OFF_MAT_MESH_STATE);
  buf.writeUInt32LE(0, offset + OFF_MAT_ANIM_TEX_COUNTER);
  offset += SIZE_MATERIAL;

  // Texture name block: int StrLen + "test.bmp\0" + "\0"
  const nameStr = 'test.bmp';
  const strLen = nameStr.length + 1 + 1; // "test.bmp\0" + "\0" (empty NameA)
  buf.writeInt32LE(strLen, offset);
  offset += 4;
  buf.write(nameStr, offset, 'ascii');
  buf.writeUInt8(0, offset + nameStr.length); // null terminator for Name
  buf.writeUInt8(0, offset + nameStr.length + 1); // empty NameA (just null)
  offset += strLen;

  // 4. Vertices (3 vertices, 28 bytes each)
  // Vertex 0: (0, 0, 0)
  buf.writeInt32LE(0, offset + 8); // x
  buf.writeInt32LE(0, offset + 12); // y
  buf.writeInt32LE(0, offset + 16); // z
  // Vertex 1: (256, 0, 0)
  buf.writeInt32LE(256, offset + 28 + 8);
  buf.writeInt32LE(0, offset + 28 + 12);
  buf.writeInt32LE(0, offset + 28 + 16);
  // Vertex 2: (0, 0, 256)
  buf.writeInt32LE(0, offset + 56 + 8);
  buf.writeInt32LE(0, offset + 56 + 12);
  buf.writeInt32LE(256, offset + 56 + 16);
  offset += verticesSize;

  // 5. Faces (1 face, 28 bytes each)
  // Face 0: vertices 0, 1, 2, material 0
  buf.writeUInt16LE(0, offset + 8); // a
  buf.writeUInt16LE(1, offset + 10); // b
  buf.writeUInt16LE(2, offset + 12); // c
  buf.writeUInt16LE(0, offset + 14); // material
  offset += facesSize;

  // 6. TexLinks (1 texlink, 32 bytes each) — all zeros
  offset += texLinksSize;

  // 7. Lights — none
  // 8. StageArea — all cells empty, no data

  return buf;
}

/**
 * Build a truncated buffer (too small for header).
 */
function buildTruncatedSmd(): Buffer {
  return Buffer.alloc(100, 0);
}

/**
 * Build a buffer with wrong header string.
 */
function buildWrongHeaderSmd(): Buffer {
  const buf = Buffer.alloc(SIZE_DFILE_HEADER + 100, 0);
  buf.write('NOT AN SMD FILE', 0, 'ascii');
  return buf;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stage_smd_inspector', () => {
  describe('synthetic SMD', () => {
    it('parses header and version correctly', () => {
      const buf = buildSyntheticSmd();
      const result = parseStageSmdBuffer(buf);

      expect(result.header.headerString).toBe(SMD_STAGE_HEADER_V072);
      expect(result.header.version).toBe('0.72');
      expect(result.header.matCounter).toBe(1);
    });

    it('parses geometry counts correctly', () => {
      const buf = buildSyntheticSmd();
      const result = parseStageSmdBuffer(buf);

      expect(result.nVertex).toBe(3);
      expect(result.nFace).toBe(1);
      expect(result.nTexLink).toBe(1);
      expect(result.nLight).toBe(0);
    });

    it('parses vertex bounds correctly', () => {
      const buf = buildSyntheticSmd();
      const result = parseStageSmdBuffer(buf);

      expect(result.bounds.minX).toBe(0);
      expect(result.bounds.maxX).toBe(256);
      expect(result.bounds.minY).toBe(0);
      expect(result.bounds.maxY).toBe(0);
      expect(result.bounds.minZ).toBe(0);
      expect(result.bounds.maxZ).toBe(256);
    });

    it('parses StageMapRect matching vertex bounds', () => {
      const buf = buildSyntheticSmd();
      const result = parseStageSmdBuffer(buf);

      expect(result.stageMapRect.left).toBe(result.bounds.minX);
      expect(result.stageMapRect.right).toBe(result.bounds.maxX);
      expect(result.stageMapRect.top).toBe(result.bounds.minZ);
      expect(result.stageMapRect.bottom).toBe(result.bounds.maxZ);
    });

    it('parses material count and walkability flags', () => {
      const buf = buildSyntheticSmd();
      const result = parseStageSmdBuffer(buf);

      expect(result.materialCount).toBe(1);
      expect(result.materials).toHaveLength(1);
      expect(result.materials[0].inUse).toBe(true);
      expect(result.materials[0].isWalkable).toBe(true);
      expect(result.materials[0].meshState).toBe(SMMAT_STAT_CHECK_FACE);
    });

    it('parses texture names from material group', () => {
      const buf = buildSyntheticSmd();
      const result = parseStageSmdBuffer(buf);

      expect(result.materials[0].textureNames).toContain('test.bmp');
      expect(result.textureReferences).toContain('test.bmp');
    });

    it('parses faces with correct vertex indices and material', () => {
      const buf = buildSyntheticSmd();
      const result = parseStageSmdBuffer(buf);

      expect(result.faces).toHaveLength(1);
      expect(result.faces[0].a).toBe(0);
      expect(result.faces[0].b).toBe(1);
      expect(result.faces[0].c).toBe(2);
      expect(result.faces[0].materialIndex).toBe(0);
    });

    it('computes walkability stats correctly', () => {
      const buf = buildSyntheticSmd();
      const result = parseStageSmdBuffer(buf);

      expect(result.walkabilityStats.walkableFaces).toBe(1);
      expect(result.walkabilityStats.nonWalkableFaces).toBe(0);
      expect(result.walkabilityStats.walkablePercentage).toBe(100);
    });

    it('reports zero non-empty StageArea cells for all-zero pointer array', () => {
      const buf = buildSyntheticSmd();
      const result = parseStageSmdBuffer(buf);

      expect(result.stageAreaNonEmptyCells).toBe(0);
    });

    it('reports no unresolved issues for valid synthetic data', () => {
      const buf = buildSyntheticSmd();
      const result = parseStageSmdBuffer(buf);

      expect(result.unresolved).toHaveLength(0);
    });

    it('produces deterministic output for same input', () => {
      const buf1 = buildSyntheticSmd();
      const buf2 = buildSyntheticSmd();

      const r1 = parseStageSmdBuffer(buf1);
      const r2 = parseStageSmdBuffer(buf2);

      expect(r1.nVertex).toBe(r2.nVertex);
      expect(r1.nFace).toBe(r2.nFace);
      expect(r1.bounds).toEqual(r2.bounds);
      expect(r1.materialCount).toBe(r2.materialCount);
    });
  });

  describe('error handling', () => {
    it('throws on truncated input (too small for header)', () => {
      const buf = buildTruncatedSmd();
      expect(() => parseStageSmdBuffer(buf)).toThrow();
    });

    it('throws on wrong header string', () => {
      const buf = buildWrongHeaderSmd();
      expect(() => parseStageSmdBuffer(buf)).toThrow(/Not a stage SMD file/);
    });
  });

  describe('real village-2.smd', () => {
    // Path to the real MagicPT Ricarten SMD file
    const SMD_PATH = 'E:/CascadeProjects/PT-Project/MagicPT-Chinese/client/Field/Ricarten/village-2.smd';

    it.skipIf(!existsSync(SMD_PATH))('parses real village-2.smd with expected counts', () => {
      const buf = readFileSync(SMD_PATH);
      const result = parseStageSmdBuffer(buf, buf.length);

      // Header
      expect(result.header.version).toBe('0.72');
      expect(result.header.headerString).toBe(SMD_STAGE_HEADER_V072);

      // Counts (verified from the actual file)
      expect(result.nVertex).toBe(47180);
      expect(result.nFace).toBe(49888);
      expect(result.nTexLink).toBe(51561);
      expect(result.nLight).toBe(81);
      expect(result.materialCount).toBe(288);

      // File size
      expect(result.fileSize).toBe(5626241);

      // StageMapRect matches vertex bounds (no unresolved issues)
      expect(result.unresolved).toHaveLength(0);

      // Walkability: 85% walkable, 15% non-walkable
      expect(result.walkabilityStats.walkableFaces).toBe(42408);
      expect(result.walkabilityStats.nonWalkableFaces).toBe(7480);
      expect(result.walkabilityStats.walkablePercentage).toBeCloseTo(85.0, 0);

      // StageArea: ~20k non-empty cells
      expect(result.stageAreaNonEmptyCells).toBe(20592);

      // Texture references: 279 unique textures
      expect(result.textureReferences).toHaveLength(279);

      // All texture paths start with Field\Ricarten\
      for (const tex of result.textureReferences) {
        expect(tex.toLowerCase()).toMatch(/^field\\ricarten\\/i);
      }
    });

    it.skipIf(!existsSync(SMD_PATH))('real village-2.smd bounds contain field.cpp reference points', () => {
      const buf = readFileSync(SMD_PATH);
      const result = parseStageSmdBuffer(buf, buf.length);

      // Field.cpp center: (2596, -18738) in world units
      // Field.cpp starts: (2592, -18566), (-1047, -16973) in world units
      // These should fall within the SMD bounds (divided by fONE)
      const { boundsFloat } = result;

      // Center (2596, -18738): X=2596, Z=-18738
      expect(boundsFloat.minX).toBeLessThanOrEqual(2596);
      expect(boundsFloat.maxX).toBeGreaterThanOrEqual(2596);
      expect(boundsFloat.minZ).toBeLessThanOrEqual(-18738);
      expect(boundsFloat.maxZ).toBeGreaterThanOrEqual(-18738);

      // Start 1: (2592, -18566)
      expect(boundsFloat.minX).toBeLessThanOrEqual(2592);
      expect(boundsFloat.maxX).toBeGreaterThanOrEqual(2592);
      expect(boundsFloat.minZ).toBeLessThanOrEqual(-18566);
      expect(boundsFloat.maxZ).toBeGreaterThanOrEqual(-18566);

      // Start 2: (-1047, -16973)
      expect(boundsFloat.minX).toBeLessThanOrEqual(-1047);
      expect(boundsFloat.maxX).toBeGreaterThanOrEqual(-1047);
      expect(boundsFloat.minZ).toBeLessThanOrEqual(-16973);
      expect(boundsFloat.maxZ).toBeGreaterThanOrEqual(-16973);
    });
  });
});
