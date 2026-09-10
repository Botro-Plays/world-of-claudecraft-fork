import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Priston Tale SMD Binary Parser
 *
 * Parses PT's proprietary binary SMD model format into an intermediate
 * JavaScript object that can be fed to a GLB assembler.
 *
 * Format reverse-engineered from:
 *   - PT-Source/smLib3d/smType.h     (struct definitions)
 *   - PT-Source/smLib3d/smObj3d.h    (class layout)
 *   - PT-Source/smLib3d/smObj3d.cpp  (SaveFile / LoadFile / GetSaveSize)
 *   - PT-Source/smLib3d/smTexture.h  (smMATERIAL_GROUP layout)
 *   - PT-Source/smLib3d/smTexture.cpp (material loading)
 *
 * PT uses fixed-point math: coordinates are integers scaled by fONE=256.
 * PT is a 32-bit app: all pointers are 4 bytes.
 *
 * SMD file layout:
 *   [smDFILE_HEADER]                      556 bytes
 *   [smDFILE_OBJINFO] × ObjCounter        40 bytes each
 *   [Material data] at MatFilePoint
 *   [Object data]   at each ObjFilePoint
 *
 * Object data layout (Ver 0.62, bNew=FALSE):
 *   [smOBJ3D header]                      2236 bytes (raw class dump)
 *   [smVERTEX] × nVertex                  24 bytes each
 *   [smFACE]   × nFace                    36 bytes each
 *   [smTEXLINK] × nTexLink                32 bytes each
 *   [smTM_ROT]  × TmRotCnt                28 bytes each
 *   [smTM_POS]  × TmPosCnt                16 bytes each
 *   [smTM_SCALE]× TmScaleCnt              16 bytes each
 *   [smMATRIX]  × TmRotCnt (TmPrevRot)    64 bytes each
 *   [char[32]]  × nVertex (physique names) if Physique pointer non-null
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONE = 256; // PT fixed-point unit

const SMD_HEADER_V062 = 'SMD Model data Ver 0.62';
const SMD_HEADER_V064 = 'SMD Model data Ver 0.64';
const LOCAL_HEADER: number[] = [
  0xa5, 0x82, 0xac, 0x58, 0x15, 0x98, 0x29, 0x8c,
  0x85, 0x9f, 0x12, 0xc8, 0x84, 0x1f, 0x74, 0x8c,
  0x8f, 0x42, 0x8f, 0xa8, 0x1b, 0x84, 0xaa, 0x00,
];

// Struct sizes (32-bit, 4-byte alignment)
const SIZE_DFILE_HEADER = 556; // 24 + 4*5 + 32*16
const SIZE_DFILE_OBJINFO = 40; // 32 + 4 + 4
const SIZE_MATERIAL_GROUP = 88; // 4 + 4 + 4 + 4 + 4 + 4 + 64
const SIZE_MATERIAL = 320; // see smMATERIAL layout
const SIZE_OBJ3D = 2236; // includes pParent pointer (2232 + 4)
const SIZE_VERTEX = 24; // 6 ints
const SIZE_FACE = 36; // 8 + 24 + 4
const SIZE_TEXLINK = 32; // 24 + 4 + 4
const SIZE_TM_ROT = 20; // int frame + 4 floats (4 + 16)
const SIZE_TM_POS = 16; // int frame + 3 floats (4 + 12)
const SIZE_TM_SCALE = 16; // int frame + 3 ints (4 + 12)
const SIZE_MATRIX = 64; // 16 ints
const SIZE_FMATRIX = 64; // 16 floats

// Field offsets within smOBJ3D class dump
const OFF_Physique = 16; // pointer
const OFF_nVertex = 84;
const OFF_nFace = 88;
const OFF_nTexLink = 92;
const OFF_NodeName = 172;
const OFF_NodeParent = 204;
// Note: pParent pointer at offset 236 shifts all subsequent fields by 4
const OFF_Tm = 240; // bind-pose matrix (smMATRIX)
const OFF_TmRotCnt = 684;
const OFF_TmPosCnt = 688;
const OFF_TmScaleCnt = 692;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PTVertex {
  x: number; y: number; z: number; // fixed-point (divide by FONE for float)
  nx: number; ny: number; nz: number;
}

export interface PTFace {
  v: [number, number, number]; // vertex indices
  materialIndex: number; // v[3]
  uvs: [[number, number], [number, number], [number, number]]; // per-vertex UVs
  texLinkIndex: number; // index into texLinks array (from lpTexLink pointer)
}

export interface PTTexLink {
  u: [number, number, number];
  v: [number, number, number];
  // hTexture and NextTex are pointers — ignored
}

export interface PTTmRot {
  frame: number;
  x: number; y: number; z: number; w: number; // quaternion
}

export interface PTTmPos {
  frame: number;
  x: number; y: number; z: number;
}

export interface PTTmScale {
  frame: number;
  x: number; y: number; z: number;
}

export interface PTMatrix {
  // 4×4 fixed-point matrix (int elements)
  m: number[]; // 16 ints, row-major
}

export interface PTMaterial {
  inUse: boolean;
  textureCount: number;
  textureNames: string[]; // resolved from string block
  blendType: number;
  twoSide: boolean;
  diffuse: { r: number; g: number; b: number };
  transparency: number;
  selfIllum: number;
}

export interface PTFramePos {
  startFrame: number; // in ticks
  endFrame: number;   // in ticks
  posNum: number;
  posCnt: number;
}

export interface PTObject {
  nodeName: string;
  nodeParent: string;
  nVertex: number;
  nFace: number;
  nTexLink: number;
  vertices: PTVertex[];
  faces: PTFace[];
  texLinks: PTTexLink[];
  tmRot: PTTmRot[];
  tmPos: PTTmPos[];
  tmScale: PTTmScale[];
  tmPrevRot: PTMatrix[]; // precomputed rotation matrices
  tm: PTMatrix; // bind-pose transform
  physiqueBones: string[]; // per-vertex bone names (if Physique was set)
}

export interface PTSmdModel {
  header: string;
  version: '0.62' | '0.64' | 'local';
  objCount: number;
  matCount: number;
  materials: PTMaterial[];
  objects: PTObject[];
  tmFrameCounter: number;
  tmFrames: PTFramePos[]; // animation frame range offsets (TmFrame[32])
}

// ---------------------------------------------------------------------------
// Binary reader helper
// ---------------------------------------------------------------------------

class BinaryReader {
  buf: Buffer;
  pos: number;

  constructor(buf: Buffer, startOffset = 0) {
    this.buf = buf;
    this.pos = startOffset;
  }

  seek(offset: number): void {
    this.pos = offset;
  }

  skip(bytes: number): void {
    this.pos += bytes;
  }

  remaining(): number {
    return this.buf.length - this.pos;
  }

  readInt32(): number {
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  readUInt32(): number {
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  readFloat32(): number {
    const v = this.buf.readFloatLE(this.pos);
    this.pos += 4;
    return v;
  }

  readInt16(): number {
    const v = this.buf.readInt16LE(this.pos);
    this.pos += 2;
    return v;
  }

  readUInt16(): number {
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }

  readByte(): number {
    const v = this.buf.readUInt8(this.pos);
    this.pos += 1;
    return v;
  }

  readBytes(n: number): Buffer {
    const slice = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  readFixedString(maxLen: number): string {
    const raw = this.readBytes(maxLen);
    const nul = raw.indexOf(0);
    const str = nul >= 0 ? raw.subarray(0, nul) : raw;
    return str.toString('ascii');
  }

  readNullTerminatedString(): string {
    const start = this.pos;
    while (this.pos < this.buf.length && this.buf[this.pos] !== 0) this.pos++;
    const str = this.buf.subarray(start, this.pos).toString('ascii');
    if (this.pos < this.buf.length) this.pos++; // skip null
    return str;
  }

  readMatrix(): PTMatrix {
    const m: number[] = [];
    for (let i = 0; i < 16; i++) m.push(this.readInt32());
    return { m };
  }

  readFMatrix(): PTMatrix {
    const m: number[] = [];
    for (let i = 0; i < 16; i++) m.push(this.readFloat32());
    return { m };
  }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function detectVersion(headerBytes: Buffer): '0.62' | '0.64' | 'local' {
  const headerStr = headerBytes.toString('ascii', 0, 24).replace(/\0+$/, '');
  if (headerStr === SMD_HEADER_V062) return '0.62';
  if (headerStr === SMD_HEADER_V064) return '0.64';
  // Check local encrypted header
  for (let i = 0; i < 24; i++) {
    if (headerBytes[i] !== LOCAL_HEADER[i]) break;
    if (i === 23) return 'local';
  }
  throw new Error(`Unknown SMD header: "${headerStr}"`);
}

function parseMaterialGroup(reader: BinaryReader): PTMaterial[] {
  const materials: PTMaterial[] = [];

  // Read smMATERIAL_GROUP header (88 bytes)
  // DWORD Head          @ 0
  // smMATERIAL *smMaterial @ 4  (pointer — garbage)
  // DWORD MaterialCount    @ 8
  // int ReformTexture      @ 12
  // int MaxMaterial        @ 16
  // int LastSearchMaterial @ 20
  // char szLastSearchName[64] @ 24
  reader.skip(8); // skip Head + smMaterial pointer
  const materialCount = reader.readUInt32();
  reader.skip(SIZE_MATERIAL_GROUP - 12); // skip remaining fields

  for (let i = 0; i < materialCount; i++) {
    // Read smMATERIAL struct (320 bytes)
    const matStart = reader.pos;
    const inUse = reader.readUInt32() !== 0;
    const textureCount = reader.readUInt32();
    reader.skip(32); // smTexture[8] pointers
    reader.skip(32); // TextureStageState[8]
    reader.skip(32); // TextureFormState[8]
    reader.skip(4);  // ReformTexture
    reader.skip(4);  // MapOpacity
    reader.skip(4);  // TextureType
    const blendType = reader.readUInt32();
    reader.skip(4);  // Shade
    const twoSide = reader.readUInt32() !== 0;
    reader.skip(4);  // SerialNum
    const diffuse = { r: reader.readFloat32(), g: reader.readFloat32(), b: reader.readFloat32() };
    const transparency = reader.readFloat32();
    const selfIllum = reader.readFloat32();
    reader.skip(SIZE_MATERIAL - (reader.pos - matStart)); // skip to end of struct

    const textureNames: string[] = [];

    if (inUse) {
      // Read string block
      const strLen = reader.readInt32();
      const strBlock = reader.readBytes(strLen);
      let offset = 0;
      for (let t = 0; t < textureCount; t++) {
        // name
        let end = strBlock.indexOf(0, offset);
        const name = strBlock.subarray(offset, end).toString('ascii');
        offset = end + 1;
        // nameA (opacity map, may be empty)
        end = strBlock.indexOf(0, offset);
        const nameA = strBlock.subarray(offset, end).toString('ascii');
        offset = end + 1;
        textureNames.push(nameA ? `${name}|${nameA}` : name);
      }
    }

    materials.push({
      inUse,
      textureCount,
      textureNames,
      blendType,
      twoSide,
      diffuse,
      transparency,
      selfIllum,
    });
  }

  return materials;
}

function parseObject(reader: BinaryReader, version: '0.62' | '0.64' | 'local'): PTObject {
  const objStart = reader.pos;

  // Read smOBJ3D class dump (2236 bytes)
  // We only extract the fields we need; skip the rest.
  reader.skip(16); // Head + Vertex/Face/TexLink pointers
  const physiquePtr = reader.readUInt32(); // Physique pointer
  reader.skip(24); // ZeroVertex (smVERTEX)
  reader.skip(24); // maxZ,minZ,maxY,minY,maxX,minX
  reader.skip(4);  // dBound
  reader.skip(4);  // Bound
  reader.skip(4);  // MaxVertex
  reader.skip(4);  // MaxFace
  const nVertex = reader.readInt32();
  const nFace = reader.readInt32();
  const nTexLink = reader.readInt32();
  reader.skip(4);  // ColorEffect
  reader.skip(4);  // ClipStates
  reader.skip(12); // Posi
  reader.skip(12); // CameraPosi
  reader.skip(12); // Angle
  reader.skip(32); // Trig[8]
  const nodeName = reader.readFixedString(32);
  const nodeParent = reader.readFixedString(32);
  reader.skip(4);                       // pParent pointer
  const tm = reader.readMatrix();       // Tm (bind-pose)
  reader.skip(SIZE_MATRIX);             // TmInvert
  reader.skip(SIZE_FMATRIX);            // TmResult
  reader.skip(SIZE_MATRIX);             // TmRotate
  reader.skip(SIZE_MATRIX);             // mWorld
  reader.skip(SIZE_MATRIX);             // mLocal
  reader.skip(4);                       // lFrame
  reader.skip(16);                      // qx,qy,qz,qw
  reader.skip(12);                      // sx,sy,sz
  reader.skip(12);                      // px,py,pz
  reader.skip(16);                      // TmRot/TmPos/TmScale/TmPrevRot pointers
  const tmRotCnt = reader.readInt32();
  const tmPosCnt = reader.readInt32();
  const tmScaleCnt = reader.readInt32();
  reader.skip(SIZE_OBJ3D - (reader.pos - objStart)); // skip to end of header

  // Read arrays — order depends on version
  // Ver 0.62 (bNew=FALSE): Vertex, Face, TexLink, TmRot, TmPos, TmScale, TmPrevRot
  // Ver 0.64 (bNew=TRUE):  Face, Vertex (swapped), TexLink, TmPos, TmRot, TmPrevRot, TmScale

  const vertices: PTVertex[] = [];
  const faces: PTFace[] = [];
  const texLinks: PTTexLink[] = [];
  const tmRot: PTTmRot[] = [];
  const tmPos: PTTmPos[] = [];
  const tmScale: PTTmScale[] = [];
  const tmPrevRot: PTMatrix[] = [];
  let physiqueBones: string[] = [];

  const isNew = version === '0.64';

  if (isNew) {
    // Face first
    for (let i = 0; i < nFace; i++) faces.push(readFace(reader));
    // Vertex (with coordinate swap)
    for (let i = 0; i < nVertex; i++) {
      const v = readVertex(reader);
      // PT Ver 0.64 swaps x↔z and adjusts y
      vertices.push({ ...v, x: v.z, z: v.x, y: v.y - 27243 });
    }
  } else {
    // Vertex first
    for (let i = 0; i < nVertex; i++) vertices.push(readVertex(reader));
    // Face
    for (let i = 0; i < nFace; i++) faces.push(readFace(reader));
  }

  // TexLink
  for (let i = 0; i < nTexLink; i++) texLinks.push(readTexLink(reader));

  if (isNew) {
    // TmPos, TmRot, TmPrevRot, TmScale
    for (let i = 0; i < tmPosCnt; i++) tmPos.push(readTmPos(reader));
    for (let i = 0; i < tmRotCnt; i++) tmRot.push(readTmRot(reader));
    for (let i = 0; i < tmRotCnt; i++) tmPrevRot.push(reader.readFMatrix());
    for (let i = 0; i < tmScaleCnt; i++) tmScale.push(readTmScale(reader));
  } else {
    // TmRot, TmPos, TmScale, TmPrevRot
    for (let i = 0; i < tmRotCnt; i++) tmRot.push(readTmRot(reader));
    for (let i = 0; i < tmPosCnt; i++) tmPos.push(readTmPos(reader));
    for (let i = 0; i < tmScaleCnt; i++) tmScale.push(readTmScale(reader));
    for (let i = 0; i < tmRotCnt; i++) tmPrevRot.push(reader.readFMatrix());
  }

  // Physique bone names (if Physique pointer was non-null in saved data)
  if (physiquePtr !== 0) {
    for (let i = 0; i < nVertex; i++) {
      physiqueBones.push(reader.readFixedString(32));
    }
  }

  return {
    nodeName,
    nodeParent,
    nVertex,
    nFace,
    nTexLink,
    vertices,
    faces,
    texLinks,
    tmRot,
    tmPos,
    tmScale,
    tmPrevRot,
    tm,
    physiqueBones,
  };
}

function readVertex(reader: BinaryReader): PTVertex {
  const x = reader.readInt32();
  const y = reader.readInt32();
  const z = reader.readInt32();
  const nx = reader.readInt32();
  const ny = reader.readInt32();
  const nz = reader.readInt32();
  return { x, y, z, nx, ny, nz };
}

function readFace(reader: BinaryReader): PTFace {
  const a = reader.readUInt16();
  const b = reader.readUInt16();
  const c = reader.readUInt16();
  const materialIndex = reader.readUInt16();
  // smFTPOINT t[3] — per-face-vertex UVs
  const u0 = reader.readFloat32(); const v0 = reader.readFloat32();
  const u1 = reader.readFloat32(); const v1 = reader.readFloat32();
  const u2 = reader.readFloat32(); const v2 = reader.readFloat32();
  const texLinkIndex = reader.readUInt32(); // lpTexLink pointer (saved as index)
  return {
    v: [a, b, c],
    materialIndex,
    uvs: [[u0, v0], [u1, v1], [u2, v2]],
    texLinkIndex,
  };
}

function readTexLink(reader: BinaryReader): PTTexLink {
  const u: [number, number, number] = [
    reader.readFloat32(), reader.readFloat32(), reader.readFloat32(),
  ];
  const v: [number, number, number] = [
    reader.readFloat32(), reader.readFloat32(), reader.readFloat32(),
  ];
  reader.skip(8); // hTexture + NextTex pointers
  return { u, v };
}

function readTmRot(reader: BinaryReader): PTTmRot {
  const frame = reader.readInt32();
  const x = reader.readFloat32();
  const y = reader.readFloat32();
  const z = reader.readFloat32();
  const w = reader.readFloat32();
  return { frame, x, y, z, w };
}

function readTmPos(reader: BinaryReader): PTTmPos {
  const frame = reader.readInt32();
  const x = reader.readFloat32();
  const y = reader.readFloat32();
  const z = reader.readFloat32();
  return { frame, x, y, z };
}

function readTmScale(reader: BinaryReader): PTTmScale {
  const frame = reader.readInt32();
  const x = reader.readInt32();
  const y = reader.readInt32();
  const z = reader.readInt32();
  return { frame, x, y, z };
}

// ---------------------------------------------------------------------------
// Main parse function
// ---------------------------------------------------------------------------

export function parseSmd(buffer: Buffer): PTSmdModel {
  const reader = new BinaryReader(buffer);

  // 1. Read file header
  const headerBytes = reader.readBytes(24);
  const version = detectVersion(headerBytes);
  const header = headerBytes.toString('ascii', 0, 24).replace(/\0+$/, '');

  const objCount = reader.readInt32();
  const matCount = reader.readInt32();
  const matFilePoint = reader.readInt32();
  const firstObjInfoPoint = reader.readInt32();
  const tmFrameCounter = reader.readInt32();
  const tmFrames: PTFramePos[] = [];
  for (let i = 0; i < 32; i++) {
    tmFrames.push({
      startFrame: reader.readInt32(),
      endFrame: reader.readInt32(),
      posNum: reader.readInt32(),
      posCnt: reader.readInt32(),
    });
  }

  // 2. Read object info table
  interface ObjInfo {
    nodeName: string;
    length: number;
    objFilePoint: number;
  }
  const objInfos: ObjInfo[] = [];
  for (let i = 0; i < objCount; i++) {
    const nodeName = reader.readFixedString(32);
    const length = reader.readInt32();
    const objFilePoint = reader.readInt32();
    objInfos.push({ nodeName, length, objFilePoint });
  }

  // 3. Parse materials (at MatFilePoint)
  const materials: PTMaterial[] = [];
  if (matCount > 0) {
    reader.seek(matFilePoint);
    const parsedMats = parseMaterialGroup(reader);
    materials.push(...parsedMats);
  }

  // 4. Parse objects
  const objects: PTObject[] = [];
  for (let i = 0; i < objCount; i++) {
    reader.seek(objInfos[i].objFilePoint);
    const obj = parseObject(reader, version);
    objects.push(obj);
  }

  return {
    header,
    version,
    objCount,
    matCount,
    materials,
    objects,
    tmFrameCounter,
    tmFrames,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function fixedToFloat(v: number): number {
  return v / FONE;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: npx tsx scripts/pt-port/smd_parser.ts <file.smd> [output.json]');
    process.exit(1);
  }

  const filePath = args[0];
  const buffer = readFileSync(filePath);

  console.log(`Parsing: ${filePath} (${buffer.length} bytes)`);

  const model = parseSmd(buffer);

  // Summary
  console.log('\n=== SMD Model Summary ===');
  console.log(`Header: "${model.header}"`);
  console.log(`Version: ${model.version}`);
  console.log(`Objects: ${model.objCount}`);
  console.log(`Materials: ${model.matCount}`);

  for (const mat of model.materials) {
    console.log(`\n  Material: inUse=${mat.inUse}, textures=${mat.textureCount}`);
    console.log(`    blendType=${mat.blendType}, twoSide=${mat.twoSide}`);
    console.log(`    diffuse=(${mat.diffuse.r.toFixed(3)}, ${mat.diffuse.g.toFixed(3)}, ${mat.diffuse.b.toFixed(3)})`);
    console.log(`    transparency=${mat.transparency.toFixed(3)}`);
    for (const name of mat.textureNames) {
      console.log(`    texture: ${name}`);
    }
  }

  for (const obj of model.objects) {
    console.log(`\n  Object: "${obj.nodeName}" (parent: "${obj.nodeParent}")`);
    console.log(`    Vertices: ${obj.nVertex}, Faces: ${obj.nFace}, TexLinks: ${obj.nTexLink}`);
    console.log(`    TmRot: ${obj.tmRot.length}, TmPos: ${obj.tmPos.length}, TmScale: ${obj.tmScale.length}`);
    console.log(`    Physique bones: ${obj.physiqueBones.length}`);

    // Show first few vertices (converted to float)
    const v0 = obj.vertices[0];
    if (v0) {
      console.log(`    Vertex[0]: pos=(${fixedToFloat(v0.x).toFixed(3)}, ${fixedToFloat(v0.y).toFixed(3)}, ${fixedToFloat(v0.z).toFixed(3)})`);
    }

    // Show first few faces
    const f0 = obj.faces[0];
    if (f0) {
      console.log(`    Face[0]: v=[${f0.v[0]}, ${f0.v[1]}, ${f0.v[2]}], mat=${f0.materialIndex}`);
    }

    // Show unique physique bones
    if (obj.physiqueBones.length > 0) {
      const uniqueBones = [...new Set(obj.physiqueBones)];
      console.log(`    Unique bones: ${uniqueBones.join(', ')}`);
    }

    // Bind-pose matrix (first 3 rows as floats)
    const tm = obj.tm;
    console.log(`    Tm row0: (${fixedToFloat(tm.m[0]).toFixed(3)}, ${fixedToFloat(tm.m[1]).toFixed(3)}, ${fixedToFloat(tm.m[2]).toFixed(3)}, ${fixedToFloat(tm.m[3]).toFixed(3)})`);
    console.log(`    Tm row3: (${fixedToFloat(tm.m[12]).toFixed(3)}, ${fixedToFloat(tm.m[13]).toFixed(3)}, ${fixedToFloat(tm.m[14]).toFixed(3)}, ${fixedToFloat(tm.m[15]).toFixed(3)})`);
  }

  // Write JSON output if requested
  if (args.length >= 2) {
    const outPath = args[1];
    const json = JSON.stringify(model, null, 2);
    writeFileSync(outPath, json);
    console.log(`\nWritten to: ${outPath}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('smd_parser.ts')) {
  main();
}
