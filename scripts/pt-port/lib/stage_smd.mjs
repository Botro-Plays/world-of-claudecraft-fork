// ---------------------------------------------------------------------------
// Constants (from stage_smd_inspector.ts, verified against PT source)
// ---------------------------------------------------------------------------

const FONE = 256;
const MAP_SIZE = 256;

const SIZE_DFILE_HEADER = 556;
const SIZE_STAGE3D = 262_260;
const SIZE_MATERIAL_GROUP = 88;
const SIZE_MATERIAL = 320;
const SIZE_STAGE_VERTEX = 28;
const SIZE_STAGE_FACE = 28;
const SIZE_TEXLINK = 32;
const SIZE_LIGHT3D = 28;

const OFF_HEADER_STRING = 0;
const OFF_MAT_COUNTER = 28;

const OFF_STAGE3D_HEAD = 0;
const OFF_STAGE3D_STAGE_AREA = 4; // DWORD*[256][256] = 262,144 bytes
const OFF_STAGE3D_AREA_LIST = OFF_STAGE3D_STAGE_AREA + MAP_SIZE * MAP_SIZE * 4; // POINT*
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
const OFF_STAGE3D_N_FACE = OFF_STAGE3D_N_VERTEX + 4;
const OFF_STAGE3D_N_TEXLINK = OFF_STAGE3D_N_FACE + 4;
const OFF_STAGE3D_N_LIGHT = OFF_STAGE3D_N_TEXLINK + 4;
const OFF_STAGE3D_N_VERT_COLOR = OFF_STAGE3D_N_LIGHT + 4;
const OFF_STAGE3D_CONTRAST = OFF_STAGE3D_N_VERT_COLOR + 4;
const OFF_STAGE3D_BRIGHT = OFF_STAGE3D_CONTRAST + 4;
const OFF_STAGE3D_VECT_LIGHT = OFF_STAGE3D_BRIGHT + 4;
const OFF_STAGE3D_LPW_AREA_BUFF = OFF_STAGE3D_VECT_LIGHT + 12;
const OFF_STAGE3D_W_AREA_SIZE = OFF_STAGE3D_LPW_AREA_BUFF + 4;
const OFF_STAGE3D_STAGE_MAP_RECT = OFF_STAGE3D_W_AREA_SIZE + 4;

const OFF_MAT_IN_USE = 0;
const OFF_MAT_TEXTURE_COUNTER = 4;
const OFF_MAT_BLEND_TYPE = 116;
const OFF_MAT_SHADE = 120;
const OFF_MAT_TWO_SIDE = 124;
const OFF_MAT_TRANSPARENCY = 144;
const OFF_MAT_USE_STATE = 164;
const OFF_MAT_MESH_STATE = 168;
const OFF_MAT_WIND_MESH_BOTTOM = 172;
const OFF_MAT_ANIM_TEX_COUNTER = 304;

const OFF_SV_X = 8;
const OFF_SV_Y = 12;
const OFF_SV_Z = 16;

const OFF_SF_VERTEX_A = 8;
const OFF_SF_VERTEX_B = 10;
const OFF_SF_VERTEX_C = 12;
const OFF_SF_MATERIAL = 14;
const OFF_SF_TEXLINK_PTR = 16; // smTEXLINK* lpTexLink

const SMMAT_STAT_CHECK_FACE = 0x00000001;
const SMMAT_SCRIPT_WATER = 0x200;

// PT's translucent/water discriminator (smMATERIAL::Transparency > 0.1) —
// mirrors PT_TRANSLUCENT_THRESHOLD in src/render/pt_terrain.ts. On the golden
// map this rule selects exactly the proven water set {107,140,232}.
export const PT_TRANSLUCENT_THRESHOLD = 0.1;

// Resolve which material indices classify as water for a map.
//   rule 'translucent' (default): transparency > 0.1 — PT's own water test.
//   rule 'explicit': the manifest's materials list, verbatim.
//   rule 'script': windMeshBottom carries SMMAT_SCRIPT_WATER (0x200) — misses
//     localized still water (e.g. Ricarten mat 140), kept for completeness.
export function waterMaterialSet(materials, water) {
  const rule = water?.rule ?? 'translucent';
  if (rule === 'explicit') return new Set(water?.materials ?? []);
  if (rule === 'script') {
    return new Set(
      materials.filter((m) => (m.windMeshBottom & SMMAT_SCRIPT_WATER) !== 0).map((m) => m.index),
    );
  }
  return new Set(
    materials.filter((m) => m.transparency > PT_TRANSLUCENT_THRESHOLD).map((m) => m.index),
  );
}

// ---------------------------------------------------------------------------
// SMD Parser
// ---------------------------------------------------------------------------

export function parseSmd(buf) {
  const headerStr = buf.toString('ascii', 0, 24).replace(/\0+$/, '');
  if (!headerStr.startsWith('SMD Stage data Ver 0.7')) {
    throw new Error(`Not a stage SMD file: "${headerStr}"`);
  }
  const version = headerStr.includes('0.72') ? '0.72' : '0.71';

  const matCounterHeader = buf.readInt32LE(OFF_MAT_COUNTER);
  const stage3dOffset = SIZE_DFILE_HEADER;

  // Read counts from the smSTAGE3D header
  const nVertex = buf.readInt32LE(stage3dOffset + OFF_STAGE3D_N_VERTEX);
  const nFace = buf.readInt32LE(stage3dOffset + OFF_STAGE3D_N_FACE);
  const nTexLink = buf.readInt32LE(stage3dOffset + OFF_STAGE3D_N_TEXLINK);
  const nLight = buf.readInt32LE(stage3dOffset + OFF_STAGE3D_N_LIGHT);

  // Read pointer bases (for texlink index calculation)
  const texLinkBase = buf.readUInt32LE(stage3dOffset + OFF_STAGE3D_TEXLINK_PTR);

  // Read StageMapRect (fixed-point)
  const stageMapRect = {
    left: buf.readInt32LE(stage3dOffset + OFF_STAGE3D_STAGE_MAP_RECT),
    top: buf.readInt32LE(stage3dOffset + OFF_STAGE3D_STAGE_MAP_RECT + 4),
    right: buf.readInt32LE(stage3dOffset + OFF_STAGE3D_STAGE_MAP_RECT + 8),
    bottom: buf.readInt32LE(stage3dOffset + OFF_STAGE3D_STAGE_MAP_RECT + 12),
  };

  // -- Materials --
  // Format (from inspector + smTexture.cpp SaveFile/LoadFile):
  //   [smMATERIAL_GROUP header, 88 bytes]
  //   For each material:
  //     [smMATERIAL struct, 320 bytes]
  //     If inUse: [int StrLen] [StrLen bytes of null-terminated name strings]
  //       For each texture slot: Name\0 NameA\0
  //       For each anim texture slot: Name\0 NameA\0
  const matGroupOffset = stage3dOffset + SIZE_STAGE3D;
  let matOffset = matGroupOffset;
  let matCounter = 0;
  if (matCounterHeader > 0) {
    // Read material count from smMATERIAL_GROUP header (at offset 8)
    matCounter = buf.readUInt32LE(matGroupOffset + 8);
    matOffset += SIZE_MATERIAL_GROUP;
  }

  const materials = [];
  for (let mi = 0; mi < matCounter; mi++) {
    const matBase = matOffset;
    const inUse = buf.readUInt32LE(matBase + OFF_MAT_IN_USE) !== 0;
    const textureCounter = buf.readUInt32LE(matBase + OFF_MAT_TEXTURE_COUNTER);
    const blendType = buf.readUInt32LE(matBase + OFF_MAT_BLEND_TYPE);
    const shade = buf.readUInt32LE(matBase + OFF_MAT_SHADE);
    const twoSide = buf.readUInt32LE(matBase + OFF_MAT_TWO_SIDE) !== 0;
    const transparency = buf.readFloatLE(matBase + OFF_MAT_TRANSPARENCY);
    const useState = buf.readInt32LE(matBase + OFF_MAT_USE_STATE);
    const meshState = buf.readInt32LE(matBase + OFF_MAT_MESH_STATE);
    const windMeshBottom = buf.readInt32LE(matBase + OFF_MAT_WIND_MESH_BOTTOM);
    const animTexCounter = buf.readUInt32LE(matBase + OFF_MAT_ANIM_TEX_COUNTER);
    const isWalkable = (meshState & SMMAT_STAT_CHECK_FACE) !== 0;

    matOffset += SIZE_MATERIAL;

    const textureNames = [];
    const animTextureNames = [];

    if (inUse) {
      // Read the name block: int StrLen, then StrLen bytes of null-terminated strings
      const strLen = buf.readInt32LE(matOffset);
      matOffset += 4;
      const nameBlock = buf.subarray(matOffset, matOffset + strLen);
      matOffset += strLen;

      // Parse consecutive null-terminated strings from the name block
      let pos = 0;
      const readStr = () => {
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
        const name = readStr();
        const nameA = readStr(); // NameA (alpha texture name, often empty)
        if (name) textureNames.push(name);
      }
      for (let ai = 0; ai < animTexCounter; ai++) {
        const name = readStr();
        const nameA = readStr();
        if (name) animTextureNames.push(name);
      }
    }

    materials.push({
      index: mi,
      inUse,
      textureCounter,
      blendType,
      shade,
      twoSide,
      transparency,
      useState,
      meshState,
      windMeshBottom,
      isWalkable,
      animTexCounter,
      textureNames,
      animTextureNames,
    });
  }

  // -- Vertices --
  const verticesOffset = matOffset;
  const vertices = new Float32Array(nVertex * 3);
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let vi = 0; vi < nVertex; vi++) {
    const base = verticesOffset + vi * SIZE_STAGE_VERTEX;
    const x = buf.readInt32LE(base + OFF_SV_X) / FONE;
    const y = buf.readInt32LE(base + OFF_SV_Y) / FONE;
    const z = buf.readInt32LE(base + OFF_SV_Z) / FONE;
    vertices[vi * 3] = x;
    vertices[vi * 3 + 1] = y;
    vertices[vi * 3 + 2] = z;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  // -- Faces --
  const facesOffset = verticesOffset + nVertex * SIZE_STAGE_VERTEX;
  const faceA = new Uint16Array(nFace);
  const faceB = new Uint16Array(nFace);
  const faceC = new Uint16Array(nFace);
  const faceMat = new Uint16Array(nFace);
  const faceTexLinkIdx = new Int32Array(nFace).fill(-1);

  for (let fi = 0; fi < nFace; fi++) {
    const base = facesOffset + fi * SIZE_STAGE_FACE;
    faceA[fi] = buf.readUInt16LE(base + OFF_SF_VERTEX_A);
    faceB[fi] = buf.readUInt16LE(base + OFF_SF_VERTEX_B);
    faceC[fi] = buf.readUInt16LE(base + OFF_SF_VERTEX_C);
    faceMat[fi] = buf.readUInt16LE(base + OFF_SF_MATERIAL);

    // Read lpTexLink pointer and convert to texlink index
    const lpTexLink = buf.readUInt32LE(base + OFF_SF_TEXLINK_PTR);
    if (lpTexLink !== 0 && texLinkBase !== 0) {
      faceTexLinkIdx[fi] = (lpTexLink - texLinkBase) / SIZE_TEXLINK;
    }
  }

  // -- TexLinks (UVs) --
  const texLinksOffset = facesOffset + nFace * SIZE_STAGE_FACE;
  const texLinkU = new Float32Array(nTexLink * 3);
  const texLinkV = new Float32Array(nTexLink * 3);

  for (let ti = 0; ti < nTexLink; ti++) {
    const base = texLinksOffset + ti * SIZE_TEXLINK;
    texLinkU[ti * 3] = buf.readFloatLE(base);
    texLinkU[ti * 3 + 1] = buf.readFloatLE(base + 4);
    texLinkU[ti * 3 + 2] = buf.readFloatLE(base + 8);
    texLinkV[ti * 3] = buf.readFloatLE(base + 12);
    texLinkV[ti * 3 + 1] = buf.readFloatLE(base + 16);
    texLinkV[ti * 3 + 2] = buf.readFloatLE(base + 20);
  }

  // -- Lights (skip) --
  const lightsOffset = texLinksOffset + nTexLink * SIZE_TEXLINK;
  let afterLightsOffset = lightsOffset;
  if (nLight > 0) {
    afterLightsOffset += nLight * SIZE_LIGHT3D;
  }

  // -- StageArea cell data --
  const stageAreaBase = stage3dOffset + OFF_STAGE3D_STAGE_AREA;
  const stageAreaDataOffset = afterLightsOffset;
  let areaDataOffset = stageAreaDataOffset;

  // Read the StageArea pointer bitmap to find non-empty cells, then read
  // the face lists. The save order is: for z 0..255, for x 0..255.
  // StageArea[x][z] pointer is at stageAreaBase + (x * MAP_SIZE + z) * 4.
  const stageArea = new Array(MAP_SIZE * MAP_SIZE).fill(null);

  for (let z = 0; z < MAP_SIZE; z++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const ptr = buf.readUInt32LE(stageAreaBase + (x * MAP_SIZE + z) * 4);
      if (ptr === 0) continue;

      const slen = buf.readInt32LE(areaDataOffset);
      areaDataOffset += 4;

      if (version === '0.72') {
        // slen DWORDs: [faceCount, faceIndex0, faceIndex1, ...]
        const faceIndices = [];
        for (let si = 1; si < slen; si++) {
          faceIndices.push(buf.readUInt32LE(areaDataOffset + si * 4));
        }
        stageArea[x * MAP_SIZE + z] = faceIndices;
        areaDataOffset += slen * 4;
      } else {
        // v0.71: slen WORDs
        const faceIndices = [];
        for (let si = 1; si < slen; si++) {
          faceIndices.push(buf.readUInt16LE(areaDataOffset + si * 2));
        }
        stageArea[x * MAP_SIZE + z] = faceIndices;
        areaDataOffset += slen * 2;
      }
    }
  }

  return {
    version,
    nVertex,
    nFace,
    nTexLink,
    nLight,
    matCounter,
    materials,
    vertices,
    faceA,
    faceB,
    faceC,
    faceMat,
    faceTexLinkIdx,
    texLinkU,
    texLinkV,
    stageArea,
    stageMapRect,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
  };
}

function readCString(buf, offset) {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  return buf.toString('ascii', offset, end);
}

// ---------------------------------------------------------------------------
// Face classification and data restructuring
// ---------------------------------------------------------------------------

export function classifyAndBuild(smd, waterMatSet) {
  const { nFace, faceMat, materials, stageArea } = smd;

  // Classify faces: walkable (CHECK_FACE), water, decorative
  const walkableFaceIndices = [];
  const waterFaceIndices = [];
  const decorativeFaceIndices = [];

  for (let fi = 0; fi < nFace; fi++) {
    const mi = faceMat[fi];
    const mat = mi < materials.length ? materials[mi] : null;
    if (mat && mat.isWalkable) {
      walkableFaceIndices.push(fi);
    } else if (waterMatSet.has(mi)) {
      waterFaceIndices.push(fi);
    } else {
      decorativeFaceIndices.push(fi);
    }
  }

  // Build walkable face index map: original face index -> walkable face array index
  const walkableIndexMap = new Int32Array(nFace).fill(-1);
  for (let i = 0; i < walkableFaceIndices.length; i++) {
    walkableIndexMap[walkableFaceIndices[i]] = i;
  }

  // Build filtered StageArea: only walkable faces, indexed into the
  // walkable face array (not the full face array).
  const nWalkable = walkableFaceIndices.length;
  const cellOffsets = new Int32Array(MAP_SIZE * MAP_SIZE).fill(-1);
  const cellCounts = new Int16Array(MAP_SIZE * MAP_SIZE).fill(0);
  const filteredFaceIndices = [];

  for (let z = 0; z < MAP_SIZE; z++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const cellIdx = x * MAP_SIZE + z;
      const faces = stageArea[cellIdx];
      if (!faces || faces.length === 0) continue;

      const walkableInCell = [];
      for (const fi of faces) {
        const wi = walkableIndexMap[fi];
        if (wi >= 0) walkableInCell.push(wi);
      }

      if (walkableInCell.length > 0) {
        cellOffsets[cellIdx] = filteredFaceIndices.length;
        cellCounts[cellIdx] = walkableInCell.length;
        for (const wi of walkableInCell) {
          filteredFaceIndices.push(wi);
        }
      }
    }
  }

  return {
    walkableFaceIndices: new Uint16Array(walkableFaceIndices),
    waterFaceIndices: new Uint16Array(waterFaceIndices),
    decorativeFaceIndices: new Uint16Array(decorativeFaceIndices),
    nWalkable,
    cellOffsets,
    cellCounts,
    filteredFaceIndices: new Uint16Array(filteredFaceIndices),
  };
}

// ---------------------------------------------------------------------------
// UV extraction: per-face UVs from texlinks
// ---------------------------------------------------------------------------

export function buildPerFaceUVs(smd) {
  const { nFace, faceTexLinkIdx, texLinkU, texLinkV } = smd;
  const uvs = new Float32Array(nFace * 6); // u0, u1, u2, v0, v1, v2

  for (let fi = 0; fi < nFace; fi++) {
    const ti = faceTexLinkIdx[fi];
    if (ti >= 0 && ti * 3 + 2 < texLinkU.length) {
      uvs[fi * 6] = texLinkU[ti * 3];
      uvs[fi * 6 + 1] = texLinkU[ti * 3 + 1];
      uvs[fi * 6 + 2] = texLinkU[ti * 3 + 2];
      uvs[fi * 6 + 3] = texLinkV[ti * 3];
      uvs[fi * 6 + 4] = texLinkV[ti * 3 + 1];
      uvs[fi * 6 + 5] = texLinkV[ti * 3 + 2];
    }
  }

  return uvs;
}

// ---------------------------------------------------------------------------
// Material manifest: unique textures referenced by in-use materials
// ---------------------------------------------------------------------------

export function buildTextureManifest(smd) {
  const { materials } = smd;
  const textures = new Map(); // name -> { name, format, materialIndices }

  for (const mat of materials) {
    if (!mat.inUse) continue;
    for (const name of mat.textureNames) {
      if (!name) continue;
      const lower = name.toLowerCase();
      const format = lower.endsWith('.tga') || lower.endsWith('.tga') ? 'tga' : 'bmp';
      if (!textures.has(name)) {
        textures.set(name, { name, format, materialIndices: [] });
      }
      textures.get(name).materialIndices.push(mat.index);
    }
  }

  return Array.from(textures.values());
}

// ---------------------------------------------------------------------------
// Generated module emitter
// ---------------------------------------------------------------------------

export function emitModule(smd, built, uvs, textureManifest, sourceLabel) {
  const lines = [];
  lines.push('// GENERATED by scripts/pt-port/pt_map.mjs, do not edit by hand.');
  lines.push(`// Source: ${sourceLabel}`);
  lines.push('// PT stage SMD v' + smd.version + ', ' + smd.nVertex + ' vertices, ' + smd.nFace + ' faces.');
  lines.push('// Data only: no imports beyond types. Large arrays are base64-encoded');
  lines.push('// typed arrays, decoded lazily on first access.');
  lines.push('');
  lines.push('// Host-agnostic base64 decode: atob exists in browsers and Node 16+, so the');
  lines.push('// sim hosts (browser, server, headless, vitest) all run this. Buffer is');
  lines.push('// Node-only and must never appear here.');
  lines.push('function decodeB64(b64: string): Uint8Array {');
  lines.push('  const bin = atob(b64);');
  lines.push('  const buf = new Uint8Array(bin.length);');
  lines.push('  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);');
  lines.push('  return buf;');
  lines.push('}');
  lines.push('');

  // Bounds
  const b = smd.bounds;
  lines.push(`export const PT_BOUNDS = ${JSON.stringify(b)};`);
  lines.push(`export const PT_N_VERTEX = ${smd.nVertex};`);
  lines.push(`export const PT_N_FACE = ${smd.nFace};`);
  lines.push(`export const PT_N_WALKABLE = ${built.nWalkable};`);
  lines.push(`export const PT_N_WATER = ${built.waterFaceIndices.length};`);
  lines.push(`export const PT_N_DECORATIVE = ${built.decorativeFaceIndices.length};`);
  lines.push(`export const PT_STAGE_MAP_RECT = ${JSON.stringify(smd.stageMapRect)};`);
  lines.push('');

  // StageArea grid dimensions
  lines.push(`export const PT_GRID_SIZE = ${MAP_SIZE};`);
  // Fixed cell size in PT world units (from smStage3d.cpp: x >> 6).
  // The StageArea uses a FIXED 64-unit cell size, NOT derived from map bounds.
  lines.push(`export const PT_CELL_SIZE = 64;`);
  lines.push('');

  // Vertices (Float32Array, 3 per vertex)
  emitBase64Array(lines, 'PT_VERTICES', 'Float32Array', smd.vertices);

  // Render faces (Uint16Array, 4 per face: a, b, c, material)
  const renderFaces = new Uint16Array(smd.nFace * 4);
  for (let fi = 0; fi < smd.nFace; fi++) {
    renderFaces[fi * 4] = smd.faceA[fi];
    renderFaces[fi * 4 + 1] = smd.faceB[fi];
    renderFaces[fi * 4 + 2] = smd.faceC[fi];
    renderFaces[fi * 4 + 3] = smd.faceMat[fi];
  }
  emitBase64Array(lines, 'PT_RENDER_FACES', 'Uint16Array', renderFaces);

  // UVs (Float32Array, 6 per face)
  emitBase64Array(lines, 'PT_UVS', 'Float32Array', uvs);

  // Walkable faces (Uint16Array, 3 per face: a, b, c)
  const walkableFaces = new Uint16Array(built.nWalkable * 3);
  for (let i = 0; i < built.nWalkable; i++) {
    const fi = built.walkableFaceIndices[i];
    walkableFaces[i * 3] = smd.faceA[fi];
    walkableFaces[i * 3 + 1] = smd.faceB[fi];
    walkableFaces[i * 3 + 2] = smd.faceC[fi];
  }
  emitBase64Array(lines, 'PT_WALKABLE_FACES', 'Uint16Array', walkableFaces);

  // StageArea CSR (compressed sparse row)
  emitBase64Array(lines, 'PT_CELL_OFFSETS', 'Int32Array', built.cellOffsets);
  emitBase64Array(lines, 'PT_CELL_COUNTS', 'Int16Array', built.cellCounts);
  emitBase64Array(lines, 'PT_CELL_FACE_INDICES', 'Uint16Array', built.filteredFaceIndices);

  // Water and decorative face indices
  emitBase64Array(lines, 'PT_WATER_FACE_INDICES', 'Uint16Array', built.waterFaceIndices);
  emitBase64Array(lines, 'PT_DECORATIVE_FACE_INDICES', 'Uint16Array', built.decorativeFaceIndices);

  // Materials (JSON, small enough)
  const matData = smd.materials.filter(m => m.inUse).map(m => ({
    index: m.index,
    isWalkable: m.isWalkable,
    transparency: m.transparency,
    blendType: m.blendType,
    twoSide: m.twoSide,
    useState: m.useState,
    meshState: m.meshState,
    windMeshBottom: m.windMeshBottom,
    textureNames: m.textureNames,
  }));
  lines.push(`export const PT_MATERIALS = ${JSON.stringify(matData)};`);
  lines.push('');

  // Texture manifest
  lines.push(`export const PT_TEXTURE_MANIFEST = ${JSON.stringify(textureManifest)};`);
  lines.push('');

  return lines.join('\n');
}

function emitBase64Array(lines, name, type, arr) {
  const b64 = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
  lines.push(`let _${name}: ${type} | null = null;`);
  lines.push(`export function ${name}(): ${type} {`);
  lines.push(`  if (_${name} === null) {`);
  lines.push(`    const buf = decodeB64('${b64}');`);
  lines.push(`    _${name} = new ${type}(buf.buffer, buf.byteOffset, buf.byteLength / ${type}.BYTES_PER_ELEMENT);`);
  lines.push(`  }`);
  lines.push(`  return _${name};`);
  lines.push(`}`);
  lines.push('');
}
