/**
 * Priston Tale Stage SMD Binary Inspector
 *
 * Parses PT's proprietary binary STAGE SMD format ("SMD Stage data Ver 0.72")
 * into an intermediate JavaScript object for offline inspection. This is NOT
 * a model SMD parser (that lives in smd_parser.ts); the stage format has a
 * completely different layout centered on the smSTAGE3D class.
 *
 * Format reverse-engineered from:
 *   PT-Source/smLib3d/smStage3d.cpp  (smSTAGE3D::SaveFile / LoadFile)
 *   PT-Source/smLib3d/smStage3d.h   (smSTAGE3D class layout)
 *   PT-Source/smLib3d/smType.h      (smSTAGE_VERTEX, smSTAGE_FACE, smTEXLINK,
 *                                    smLIGHT3D, smMATERIAL, POINT3D, smFCOLOR)
 *   PT-Source/smLib3d/smObj3d.h     (smDFILE_HEADER, smFRAME_POS)
 *   PT-Source/smLib3d/smTexture.h   (smMATERIAL_GROUP class layout)
 *   PT-Source/smLib3d/smTexture.cpp (smMATERIAL_GROUP::SaveFile / LoadFile)
 *   PT-Source/smLib3d/smRead3d.cpp   (smSTAGE3D_ReadASE — ASE coordinate swap)
 *
 * PT uses fixed-point math: coordinates are integers scaled by fONE=256.
 * PT is a 32-bit app: all pointers are 4 bytes. No #pragma pack is used
 * anywhere in smLib3d, so default MSVC 4-byte alignment applies.
 *
 * Stage SMD file layout (Ver 0.72):
 *   [smDFILE_HEADER]                       556 bytes
 *   [smSTAGE3D raw struct dump]         262,260 bytes
 *       (includes StageArea[256][256] pointer bitmap = 262,144 bytes)
 *   [smMATERIAL_GROUP raw struct]           88 bytes  (if MatCounter > 0)
 *   [smMATERIAL × MaterialCount]          320 bytes each
 *   [texture name strings]           variable per in-use material
 *   [smSTAGE_VERTEX × nVertex]             28 bytes each
 *   [smSTAGE_FACE × nFace]                 28 bytes each
 *   [smTEXLINK × nTexLink]                 32 bytes each
 *   [smLIGHT3D × nLight]                   28 bytes each  (if nLight > 0)
 *   [StageArea cell data]            variable per non-null cell
 *       (int slen + slen × DWORD for v0.72; int slen + slen × WORD for v0.71)
 *
 * The StageArea[256][256] pointer array in the raw struct dump tells the
 * loader which cells have data: non-zero pointer = cell has a face list.
 * The actual face-list data follows the vertex/face/texlink/light arrays.
 */

import { readFileSync, statSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONE = 256; // PT fixed-point unit (smType.h)
const MAP_SIZE = 256; // (smType.h)
const FLOATNS = 8; // fixed-point shift (smType.h)

const SMD_STAGE_HEADER_V072 = 'SMD Stage data Ver 0.72';
const SMD_STAGE_HEADER_V071 = 'SMD Stage data Ver 0.71';

// Struct sizes (32-bit, 4-byte alignment, no #pragma pack)
const SIZE_DFILE_HEADER = 556; // 24 + 4*5 + 32*16
const SIZE_STAGE3D = 262_260; // 4 + 256*256*4 + 4*13 + 4*8 + 12 + 4 + 4 + 16
const SIZE_MATERIAL_GROUP = 88; // 4 + 4 + 4 + 4 + 4 + 4 + 64
const SIZE_MATERIAL = 320; // see smMATERIAL layout below
const SIZE_STAGE_VERTEX = 28; // 4 + 4 + 12 + 8 (comment-confirmed in smType.h)
const SIZE_STAGE_FACE = 28; // 4 + 4 + 8 + 4 + 8
const SIZE_TEXLINK = 32; // 12 + 12 + 4 + 4
const SIZE_LIGHT3D = 28; // 4*5 + 2*3 + 2 padding

// Field offsets within smDFILE_HEADER
const OFF_HEADER_STRING = 0; // char[24]
const OFF_OBJ_COUNTER = 24; // int
const OFF_MAT_COUNTER = 28; // int
const OFF_MAT_FILE_POINT = 32; // int
const OFF_FIRST_OBJ_INFO_POINT = 36; // int
const OFF_TM_FRAME_COUNTER = 40; // int

// Field offsets within smSTAGE3D raw struct dump
// The class starts with DWORD Head, then DWORD* StageArea[256][256].
const OFF_STAGE3D_HEAD = 0; // DWORD
const OFF_STAGE3D_STAGE_AREA = 4; // DWORD*[256][256] = 262,144 bytes
const OFF_STAGE3D_AREA_LIST = 4 + MAP_SIZE * MAP_SIZE * 4; // POINT*
const OFF_STAGE3D_AREA_LIST_CNT = OFF_STAGE3D_AREA_LIST + 4; // int
const OFF_STAGE3D_MEM_MODE = OFF_STAGE3D_AREA_LIST_CNT + 4; // int
const OFF_STAGE3D_SUM_COUNT = OFF_STAGE3D_MEM_MODE + 4; // DWORD
const OFF_STAGE3D_CALC_SUM_COUNT = OFF_STAGE3D_SUM_COUNT + 4; // int
const OFF_STAGE3D_VERTEX_PTR = OFF_STAGE3D_CALC_SUM_COUNT + 4; // smSTAGE_VERTEX*
const OFF_STAGE3D_FACE_PTR = OFF_STAGE3D_VERTEX_PTR + 4; // smSTAGE_FACE*
const OFF_STAGE3D_TEXLINK_PTR = OFF_STAGE3D_FACE_PTR + 4; // smTEXLINK*
const OFF_STAGE3D_LIGHT_PTR = OFF_STAGE3D_TEXLINK_PTR + 4; // smLIGHT3D*
const OFF_STAGE3D_MAT_GROUP_PTR = OFF_STAGE3D_LIGHT_PTR + 4; // smMATERIAL_GROUP*
const OFF_STAGE3D_STAGE_OBJ_PTR = OFF_STAGE3D_MAT_GROUP_PTR + 4; // smSTAGE_OBJECT*
const OFF_STAGE3D_MATERIAL_PTR = OFF_STAGE3D_STAGE_OBJ_PTR + 4; // smMATERIAL*
const OFF_STAGE3D_N_VERTEX = OFF_STAGE3D_MATERIAL_PTR + 4; // int
const OFF_STAGE3D_N_FACE = OFF_STAGE3D_N_VERTEX + 4; // int
const OFF_STAGE3D_N_TEXLINK = OFF_STAGE3D_N_FACE + 4; // int
const OFF_STAGE3D_N_LIGHT = OFF_STAGE3D_N_TEXLINK + 4; // int
const OFF_STAGE3D_N_VERT_COLOR = OFF_STAGE3D_N_LIGHT + 4; // int
const OFF_STAGE3D_CONTRAST = OFF_STAGE3D_N_VERT_COLOR + 4; // int
const OFF_STAGE3D_BRIGHT = OFF_STAGE3D_CONTRAST + 4; // int
const OFF_STAGE3D_VECT_LIGHT = OFF_STAGE3D_BRIGHT + 4; // POINT3D (12 bytes)
const OFF_STAGE3D_LPW_AREA_BUFF = OFF_STAGE3D_VECT_LIGHT + 12; // DWORD*
const OFF_STAGE3D_W_AREA_SIZE = OFF_STAGE3D_LPW_AREA_BUFF + 4; // int
const OFF_STAGE3D_STAGE_MAP_RECT = OFF_STAGE3D_W_AREA_SIZE + 4; // RECT (16 bytes)

// Field offsets within smMATERIAL
const OFF_MAT_IN_USE = 0; // DWORD
const OFF_MAT_TEXTURE_COUNTER = 4; // DWORD
const OFF_MAT_BLEND_TYPE = 116; // DWORD
const OFF_MAT_SHADE = 120; // DWORD
const OFF_MAT_TWO_SIDE = 124; // DWORD
const OFF_MAT_TRANSPARENCY = 144; // float
const OFF_MAT_USE_STATE = 164; // int
const OFF_MAT_MESH_STATE = 168; // int  ← walkability flag
const OFF_MAT_ANIM_TEX_COUNTER = 304; // DWORD

// Field offsets within smSTAGE_VERTEX
const OFF_SV_X = 8; // int
const OFF_SV_Y = 12; // int
const OFF_SV_Z = 16; // int

// Field offsets within smSTAGE_FACE
const OFF_SF_VERTEX_A = 8; // WORD
const OFF_SF_VERTEX_B = 10; // WORD
const OFF_SF_VERTEX_C = 12; // WORD
const OFF_SF_MATERIAL = 14; // WORD

// Walkability flag (smType.h)
const SMMAT_STAT_CHECK_FACE = 0x00000001;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StageSmdHeader {
  headerString: string;
  version: '0.72' | '0.71' | 'unknown';
  objCounter: number;
  matCounter: number;
  matFilePoint: number;
  firstObjInfoPoint: number;
  tmFrameCounter: number;
}

export interface StageMapRect {
  left: number; // min X (fixed-point)
  top: number; // min Z (fixed-point)
  right: number; // max X (fixed-point)
  bottom: number; // max Z (fixed-point)
}

export interface StageVertex {
  x: number; // fixed-point int
  y: number;
  z: number;
  xFloat: number; // x / fONE
  yFloat: number;
  zFloat: number;
}

export interface StageFace {
  a: number; // vertex index
  b: number;
  c: number;
  materialIndex: number;
}

export interface StageMaterial {
  index: number;
  inUse: boolean;
  textureCounter: number;
  animTexCounter: number;
  blendType: number;
  shade: number;
  twoSide: boolean;
  transparency: number;
  useState: number;
  meshState: number;
  isWalkable: boolean; // meshState & SMMAT_STAT_CHECK_FACE
  textureNames: string[];
  animTextureNames: string[];
}

export interface StageAreaCell {
  x: number; // cell X index (0-255)
  z: number; // cell Z index (0-255)
  faceCount: number; // number of face indices stored
}

export interface StageSmdInspection {
  fileSize: number;
  header: StageSmdHeader;
  nVertex: number;
  nFace: number;
  nTexLink: number;
  nLight: number;
  nVertColor: number;
  contrast: number;
  bright: number;
  vectLight: { x: number; y: number; z: number };
  wAreaSize: number;
  stageMapRect: StageMapRect;
  stageMapRectFloat: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  materialCount: number;
  materials: StageMaterial[];
  vertices: StageVertex[];
  faces: StageFace[];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  boundsFloat: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  stageAreaNonEmptyCells: number;
  stageAreaCells: StageAreaCell[];
  sectionOffsets: {
    header: number;
    stage3d: number;
    materialGroup: number;
    vertices: number;
    faces: number;
    texLinks: number;
    lights: number;
    stageAreaData: number;
  };
  walkabilityStats: {
    walkableFaces: number;
    nonWalkableFaces: number;
    walkablePercentage: number;
  };
  textureReferences: string[];
  unresolved: string[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a PT stage SMD binary file into an inspection object.
 * Does NOT mutate the source file.
 */
export function parseStageSmd(filePath: string): StageSmdInspection {
  const buf = readFileSync(filePath);
  const fileSize = statSync(filePath).size;
  return parseStageSmdBuffer(buf, fileSize);
}

/**
 * Parse a PT stage SMD from a pre-loaded Buffer. Exposed for testing.
 */
export function parseStageSmdBuffer(buf: Buffer, fileSize: number = buf.length): StageSmdInspection {
  const unresolved: string[] = [];

  // -- 1. smDFILE_HEADER (556 bytes) --
  if (buf.length < SIZE_DFILE_HEADER) {
    throw new Error(`File too small for header: ${buf.length} < ${SIZE_DFILE_HEADER}`);
  }
  const headerString = buf.toString('ascii', 0, 24).replace(/\0+$/, '');
  let version: '0.72' | '0.71' | 'unknown' = 'unknown';
  if (headerString === SMD_STAGE_HEADER_V072) version = '0.72';
  else if (headerString === SMD_STAGE_HEADER_V071) version = '0.71';
  else throw new Error(`Not a stage SMD file: header "${headerString}"`);

  const objCounter = buf.readInt32LE(OFF_OBJ_COUNTER);
  const matCounter = buf.readInt32LE(OFF_MAT_COUNTER);
  const matFilePoint = buf.readInt32LE(OFF_MAT_FILE_POINT);
  const firstObjInfoPoint = buf.readInt32LE(OFF_FIRST_OBJ_INFO_POINT);
  const tmFrameCounter = buf.readInt32LE(OFF_TM_FRAME_COUNTER);

  const header: StageSmdHeader = {
    headerString,
    version,
    objCounter,
    matCounter,
    matFilePoint,
    firstObjInfoPoint,
    tmFrameCounter,
  };

  // -- 2. smSTAGE3D raw struct dump (262,260 bytes) --
  const stage3dOffset = SIZE_DFILE_HEADER;
  if (buf.length < stage3dOffset + SIZE_STAGE3D) {
    throw new Error(`File too small for smSTAGE3D struct: ${buf.length} < ${stage3dOffset + SIZE_STAGE3D}`);
  }

  const nVertex = buf.readInt32LE(stage3dOffset + OFF_STAGE3D_N_VERTEX);
  const nFace = buf.readInt32LE(stage3dOffset + OFF_STAGE3D_N_FACE);
  const nTexLink = buf.readInt32LE(stage3dOffset + OFF_STAGE3D_N_TEXLINK);
  const nLight = buf.readInt32LE(stage3dOffset + OFF_STAGE3D_N_LIGHT);
  const nVertColor = buf.readInt32LE(stage3dOffset + OFF_STAGE3D_N_VERT_COLOR);
  const contrast = buf.readInt32LE(stage3dOffset + OFF_STAGE3D_CONTRAST);
  const bright = buf.readInt32LE(stage3dOffset + OFF_STAGE3D_BRIGHT);
  const vectLight = {
    x: buf.readInt32LE(stage3dOffset + OFF_STAGE3D_VECT_LIGHT),
    y: buf.readInt32LE(stage3dOffset + OFF_STAGE3D_VECT_LIGHT + 4),
    z: buf.readInt32LE(stage3dOffset + OFF_STAGE3D_VECT_LIGHT + 8),
  };
  const wAreaSize = buf.readInt32LE(stage3dOffset + OFF_STAGE3D_W_AREA_SIZE);

  // StageMapRect: RECT { LONG left, top, right, bottom }
  // PT semantics: left=minX, top=minZ, right=maxX, bottom=maxZ
  const rectBase = stage3dOffset + OFF_STAGE3D_STAGE_MAP_RECT;
  const stageMapRect: StageMapRect = {
    left: buf.readInt32LE(rectBase),
    top: buf.readInt32LE(rectBase + 4),
    right: buf.readInt32LE(rectBase + 8),
    bottom: buf.readInt32LE(rectBase + 12),
  };
  const stageMapRectFloat = {
    left: stageMapRect.left / FONE,
    top: stageMapRect.top / FONE,
    right: stageMapRect.right / FONE,
    bottom: stageMapRect.bottom / FONE,
  };

  // StageArea[256][256] pointer bitmap: non-zero = cell has data
  const stageAreaBase = stage3dOffset + OFF_STAGE3D_STAGE_AREA;
  const stageAreaNonEmptyCells: StageAreaCell[] = [];
  for (let z = 0; z < MAP_SIZE; z++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      // StageArea[x][z] — the array is [MAP_SIZE][MAP_SIZE] = [256][256]
      // Layout in memory: StageArea[x][z] at offset (x * 256 + z) * 4
      const ptr = buf.readUInt32LE(stageAreaBase + (x * MAP_SIZE + z) * 4);
      if (ptr !== 0) {
        stageAreaNonEmptyCells.push({ x, z, faceCount: 0 }); // faceCount filled later
      }
    }
  }

  // -- 3. Material group (if MatCounter > 0) --
  let materialOffset = stage3dOffset + SIZE_STAGE3D;
  const materials: StageMaterial[] = [];
  let materialCount = 0;

  if (matCounter > 0) {
    if (buf.length < materialOffset + SIZE_MATERIAL_GROUP) {
      throw new Error(`File too small for smMATERIAL_GROUP: ${buf.length} < ${materialOffset + SIZE_MATERIAL_GROUP}`);
    }
    // Read smMATERIAL_GROUP raw struct (88 bytes) — MaterialCount at offset 8
    materialCount = buf.readUInt32LE(materialOffset + 8);
    materialOffset += SIZE_MATERIAL_GROUP;

    for (let mi = 0; mi < materialCount; mi++) {
      if (buf.length < materialOffset + SIZE_MATERIAL) {
        throw new Error(`File too small for material ${mi}: ${buf.length} < ${materialOffset + SIZE_MATERIAL}`);
      }
      const inUse = buf.readUInt32LE(materialOffset + OFF_MAT_IN_USE) !== 0;
      const textureCounter = buf.readUInt32LE(materialOffset + OFF_MAT_TEXTURE_COUNTER);
      const animTexCounter = buf.readUInt32LE(materialOffset + OFF_MAT_ANIM_TEX_COUNTER);
      const blendType = buf.readUInt32LE(materialOffset + OFF_MAT_BLEND_TYPE);
      const shade = buf.readUInt32LE(materialOffset + OFF_MAT_SHADE);
      const twoSide = buf.readUInt32LE(materialOffset + OFF_MAT_TWO_SIDE) !== 0;
      const transparency = buf.readFloatLE(materialOffset + OFF_MAT_TRANSPARENCY);
      const useState = buf.readInt32LE(materialOffset + OFF_MAT_USE_STATE);
      const meshState = buf.readInt32LE(materialOffset + OFF_MAT_MESH_STATE);
      const isWalkable = (meshState & SMMAT_STAT_CHECK_FACE) !== 0;

      const textureNames: string[] = [];
      const animTextureNames: string[] = [];

      materialOffset += SIZE_MATERIAL;

      if (inUse) {
        // Read the name block: int StrLen, then StrLen bytes of null-terminated strings
        if (buf.length < materialOffset + 4) {
          throw new Error(`File too small for material ${mi} name block length`);
        }
        const strLen = buf.readInt32LE(materialOffset);
        materialOffset += 4;
        if (buf.length < materialOffset + strLen) {
          throw new Error(`File too small for material ${mi} name block: ${buf.length} < ${materialOffset + strLen}`);
        }
        const nameBlock = buf.subarray(materialOffset, materialOffset + strLen);
        materialOffset += strLen;

        // Parse consecutive null-terminated strings from the name block
        let pos = 0;
        const readCString = (): string => {
          if (pos >= nameBlock.length) return '';
          const end = nameBlock.indexOf(0, pos);
          if (end === -1) {
            const s = nameBlock.subarray(pos).toString('ascii');
            pos = nameBlock.length;
            return s;
          }
          const s = nameBlock.subarray(pos, end).toString('ascii');
          pos = end + 1;
          return s;
        };

        for (let ti = 0; ti < textureCounter; ti++) {
          const name = readCString();
          const nameA = readCString();
          if (name) textureNames.push(name);
        }
        for (let ai = 0; ai < animTexCounter; ai++) {
          const name = readCString();
          const nameA = readCString();
          if (name) animTextureNames.push(name);
        }
      }

      materials.push({
        index: mi,
        inUse,
        textureCounter,
        animTexCounter,
        blendType,
        shade,
        twoSide,
        transparency,
        useState,
        meshState,
        isWalkable,
        textureNames,
        animTextureNames,
      });
    }
  }

  // -- 4. Vertices (smSTAGE_VERTEX × nVertex, 28 bytes each) --
  const verticesOffset = materialOffset;
  if (buf.length < verticesOffset + nVertex * SIZE_STAGE_VERTEX) {
    throw new Error(`File too small for vertices: ${buf.length} < ${verticesOffset + nVertex * SIZE_STAGE_VERTEX}`);
  }
  const vertices: StageVertex[] = [];
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let vi = 0; vi < nVertex; vi++) {
    const base = verticesOffset + vi * SIZE_STAGE_VERTEX;
    const x = buf.readInt32LE(base + OFF_SV_X);
    const y = buf.readInt32LE(base + OFF_SV_Y);
    const z = buf.readInt32LE(base + OFF_SV_Z);
    vertices.push({
      x, y, z,
      xFloat: x / FONE, yFloat: y / FONE, zFloat: z / FONE,
    });
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  // -- 5. Faces (smSTAGE_FACE × nFace, 28 bytes each) --
  const facesOffset = verticesOffset + nVertex * SIZE_STAGE_VERTEX;
  if (buf.length < facesOffset + nFace * SIZE_STAGE_FACE) {
    throw new Error(`File too small for faces: ${buf.length} < ${facesOffset + nFace * SIZE_STAGE_FACE}`);
  }
  const faces: StageFace[] = [];
  let walkableFaces = 0;
  let nonWalkableFaces = 0;

  for (let fi = 0; fi < nFace; fi++) {
    const base = facesOffset + fi * SIZE_STAGE_FACE;
    const a = buf.readUInt16LE(base + OFF_SF_VERTEX_A);
    const b = buf.readUInt16LE(base + OFF_SF_VERTEX_B);
    const c = buf.readUInt16LE(base + OFF_SF_VERTEX_C);
    const materialIndex = buf.readUInt16LE(base + OFF_SF_MATERIAL);
    faces.push({ a, b, c, materialIndex });

    if (materialIndex < materials.length && materials[materialIndex].isWalkable) {
      walkableFaces++;
    } else {
      nonWalkableFaces++;
    }
  }

  // -- 6. TexLinks (smTEXLINK × nTexLink, 32 bytes each) --
  const texLinksOffset = facesOffset + nFace * SIZE_STAGE_FACE;
  if (buf.length < texLinksOffset + nTexLink * SIZE_TEXLINK) {
    throw new Error(`File too small for texlinks: ${buf.length} < ${texLinksOffset + nTexLink * SIZE_TEXLINK}`);
  }
  // TexLinks contain UV coords and texture handle pointers; we skip detailed
  // parsing for now (the texture names come from the material group).

  // -- 7. Lights (smLIGHT3D × nLight, 28 bytes each, if nLight > 0) --
  const lightsStartOffset = texLinksOffset + nTexLink * SIZE_TEXLINK;
  let afterLightsOffset = lightsStartOffset;
  if (nLight > 0) {
    if (buf.length < afterLightsOffset + nLight * SIZE_LIGHT3D) {
      throw new Error(`File too small for lights: ${buf.length} < ${afterLightsOffset + nLight * SIZE_LIGHT3D}`);
    }
    afterLightsOffset += nLight * SIZE_LIGHT3D;
  }

  // -- 8. StageArea cell data (variable length per non-null cell) --
  const stageAreaDataOffset = afterLightsOffset;
  let areaDataOffset = stageAreaDataOffset;
  let totalAreaFaceIndices = 0;

  // The save/load loop order is: for cnt2 (z) 0..255, for cnt (x) 0..255
  // StageArea[cnt][cnt2] = StageArea[x][z]
  for (let z = 0; z < MAP_SIZE; z++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const ptr = buf.readUInt32LE(stageAreaBase + (x * MAP_SIZE + z) * 4);
      if (ptr !== 0) {
        if (buf.length < areaDataOffset + 4) {
          unresolved.push(`StageArea[${x}][${z}]: file truncated at area data offset ${areaDataOffset}`);
          break;
        }
        const slen = buf.readInt32LE(areaDataOffset);
        areaDataOffset += 4;
        if (version === '0.72') {
          // slen DWORDs
          if (buf.length < areaDataOffset + slen * 4) {
            unresolved.push(`StageArea[${x}][${z}]: file truncated at slen=${slen}`);
            break;
          }
          // First DWORD is the face count, followed by face indices
          areaDataOffset += slen * 4;
        } else {
          // v0.71: slen WORDs
          if (buf.length < areaDataOffset + slen * 2) {
            unresolved.push(`StageArea[${x}][${z}]: file truncated at slen=${slen} (v0.71)`);
            break;
          }
          areaDataOffset += slen * 2;
        }
        // Find the matching cell in stageAreaNonEmptyCells and set faceCount
        const cell = stageAreaNonEmptyCells.find(c => c.x === x && c.z === z);
        if (cell) cell.faceCount = slen > 0 ? slen - 1 : 0; // slen includes count word
        totalAreaFaceIndices += slen > 0 ? slen - 1 : 0;
      }
    }
  }

  // -- Collect all texture references --
  const textureReferences = new Set<string>();
  for (const mat of materials) {
    for (const name of mat.textureNames) textureReferences.add(name);
    for (const name of mat.animTextureNames) textureReferences.add(name);
  }

  // -- Validate StageMapRect against vertex bounds --
  if (stageMapRect.left !== minX || stageMapRect.right !== maxX ||
      stageMapRect.top !== minZ || stageMapRect.bottom !== maxZ) {
    unresolved.push(
      `StageMapRect (${stageMapRect.left},${stageMapRect.top},${stageMapRect.right},${stageMapRect.bottom}) ` +
      `does not match vertex bounds (X:${minX}..${maxX}, Z:${minZ}..${maxZ})`
    );
  }

  return {
    fileSize,
    header,
    nVertex,
    nFace,
    nTexLink,
    nLight,
    nVertColor,
    contrast,
    bright,
    vectLight,
    wAreaSize,
    stageMapRect,
    stageMapRectFloat,
    materialCount,
    materials,
    vertices,
    faces,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    boundsFloat: {
      minX: minX / FONE, maxX: maxX / FONE,
      minY: minY / FONE, maxY: maxY / FONE,
      minZ: minZ / FONE, maxZ: maxZ / FONE,
    },
    stageAreaNonEmptyCells: stageAreaNonEmptyCells.length,
    stageAreaCells: stageAreaNonEmptyCells,
    sectionOffsets: {
      header: 0,
      stage3d: stage3dOffset,
      materialGroup: matCounter > 0 ? stage3dOffset + SIZE_STAGE3D : -1,
      vertices: verticesOffset,
      faces: facesOffset,
      texLinks: texLinksOffset,
      lights: nLight > 0 ? lightsStartOffset : -1,
      stageAreaData: stageAreaDataOffset,
    },
    walkabilityStats: {
      walkableFaces,
      nonWalkableFaces,
      walkablePercentage: nFace > 0 ? (walkableFaces / nFace) * 100 : 0,
    },
    textureReferences: [...textureReferences].sort(),
    unresolved,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('stage_smd_inspector.ts')) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx scripts/pt-port/stage_smd_inspector.ts <path-to-village-2.smd>');
    process.exit(1);
  }
  const result = parseStageSmd(filePath);
  // Print a concise summary (full data is too large for console)
  console.log(JSON.stringify({
    fileSize: result.fileSize,
    header: result.header,
    counts: {
      nVertex: result.nVertex,
      nFace: result.nFace,
      nTexLink: result.nTexLink,
      nLight: result.nLight,
      nVertColor: result.nVertColor,
      materialCount: result.materialCount,
    },
    stageMapRect: result.stageMapRect,
    stageMapRectFloat: result.stageMapRectFloat,
    bounds: result.bounds,
    boundsFloat: result.boundsFloat,
    stageAreaNonEmptyCells: result.stageAreaNonEmptyCells,
    walkabilityStats: result.walkabilityStats,
    sectionOffsets: result.sectionOffsets,
    textureReferenceCount: result.textureReferences.length,
    textureReferences: result.textureReferences.slice(0, 20),
    materials: result.materials.map(m => ({
      index: m.index,
      inUse: m.inUse,
      textureCounter: m.textureCounter,
      meshState: m.meshState,
      isWalkable: m.isWalkable,
      blendType: m.blendType,
      transparency: m.transparency,
      textureNames: m.textureNames,
    })),
    unresolved: result.unresolved,
  }, null, 2));
}
