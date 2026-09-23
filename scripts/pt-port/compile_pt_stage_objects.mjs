// Build-time compiler for PT stage-object SMD files (smPAT3D, "SMD Model
// data Ver 0.62").
//
// Reads the Ricarten v-ani01..v-ani14 animated stage objects and emits a
// generated TypeScript module consumed by src/render/pt_stage_objects.ts.
// These are render-only props (windmills, carts, banners, fountains): PT
// gives smSTAGE_OBJECT no collision path, so nothing here feeds the
// walkable-face set in pt_ricarten_field.
//
// File layout (smObj3d.cpp smPAT3D::SaveFile, iMode=0 for Ver 0.62):
//   smDFILE_HEADER   556 bytes  (szHeader[24] + 5 ints + 32 x smFRAME_POS)
//   smDFILE_OBJINFO  40 bytes x ObjCounter
//   smMATERIAL_GROUP 88 bytes + per-material 320 bytes + name blocks
//   smOBJ3D          per object at ObjFilePoint:
//     head 2236 bytes (nVertex@84, nFace@88, nTexLink@92, Posi@104,
//       NodeName@172, NodeParent@204, Tm@240, TmRotate@432,
//       px,py,pz@656, track ptrs/counts@668-692, TmRotFrame@696,
//       TmPosFrame@1208, TmScaleFrame@1720, TmFrameCnt@2232)
//     Vertex[n] x 24 (smVERTEX: x,y,z + nx,ny,nz, fixed-point /256)
//     Face[n] x 36   (smFACE: v[4] WORDs a,b,c,mat + t[3] uvs + lpTexLink)
//     TexLink[n] x 32 (unused: face t[] carries the same UVs)
//     TmRot[r] x 20  (frame + delta quaternion xyzw)
//     TmPos[p] x 16  (frame + float position, file axis order)
//     TmScale[s] x 16(frame + fixed-point scale xyz /256)
//     TmPrevRot[r] x 64 (smFMATRIX: absolute accumulated rotation per key)
//
// Axis order: the SMD stores ASE order (x, z_depth, y_height) - PT world
// (x,y,z) reads (v.x, v.z, v.y), confirmed by smPAT3D::SetFixPosi mapping
// Posi=(Tm._41, Tm._43, Tm._42). Data is emitted in PT world order
// (x,y,z) in PT units; the renderer applies the pt_band transform at build
// time, exactly like the terrain path.
//
// Animation model (smOBJ3D::TmAnimation + smStgObj.cpp Draw):
//   Pattern->Frame += elapsed_ms << 1; wraps against MaxFrame (ticks;
//   SCENE_TICKSPERFRAME=160). Per node and frame the smFRAME_POS segment
//   tables (TmRotFrame/TmPosFrame/TmScaleFrame) select the active key range;
//   absent segments fall back to the base Tm pieces. Rotation keys are
//   accumulated: TmPrevRot[k] already stores the absolute orientation at key
//   k, so we emit absolute quaternions (exact at every keyframe) and slerp
//   between them - visually identical to PT's delta morph at the authored
//   160-tick key density.
//
// Usage:
//   node scripts/pt-port/compile_pt_stage_objects.mjs <ricarten-field-dir> <out-path>
//
// Deterministic: same input -> byte-identical output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONE = 256;

const SIZE_DFILE_HEADER = 556;
const SIZE_OBJINFO = 40;
const SIZE_MATERIAL_GROUP = 88;
const SIZE_MATERIAL = 320;
const SIZE_OBJ3D_HEAD = 2236;
const SIZE_VERTEX = 24;
const SIZE_FACE = 36;
const SIZE_TEXLINK = 32;
const SIZE_TM_ROT = 20;
const SIZE_TM_POS = 16;
const SIZE_TM_SCALE = 16;
const SIZE_PREVROT = 64;

const OFF_OBJ_NV = 84;
const OFF_OBJ_NF = 88;
const OFF_OBJ_NTL = 92;
const OFF_OBJ_POSI = 104;
const OFF_OBJ_NAME = 172;
const OFF_OBJ_PARENT = 204;
const OFF_OBJ_TM = 240;
const OFF_OBJ_TMROTATE = 432;
const OFF_OBJ_ROTCNT = 684;
const OFF_OBJ_POSCNT = 688;
const OFF_OBJ_SCALECNT = 692;
const OFF_OBJ_ROTFRAME = 696;
const OFF_OBJ_POSFRAME = 1208;
const OFF_OBJ_SCALEFRAME = 1720;
const OFF_OBJ_TMFRAMECNT = 2232;

const OFF_MAT_IN_USE = 0;
const OFF_MAT_TEXTURE_COUNTER = 4;
const OFF_MAT_TWO_SIDE = 124;
const OFF_MAT_TRANSPARENCY = 144;
const OFF_MAT_USE_STATE = 164;
const OFF_MAT_MESH_STATE = 168;
const OFF_MAT_WIND_MESH_BOTTOM = 172;
const OFF_MAT_ANIM_TEX_COUNTER = 304;

// File order (a, b, c) = (x, z_depth, y_height) -> PT world (x, y, z).
function fileToPt(a, b, c) {
  return [a, c, b];
}

// ---------------------------------------------------------------------------
// 4x4 float matrix helpers (row-vector convention, translation in row 4)
// ---------------------------------------------------------------------------

function mat4Mul(a, b) {
  const m = new Array(16).fill(0);
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + i] * b[j * 4 + k];
      m[j * 4 + i] = s;
    }
  }
  return m;
}

function mat4Invert(m) {
  const n = 4;
  const aug = [];
  for (let i = 0; i < n; i++) {
    aug.push([...m.slice(i * 4, i * 4 + 4), 0, 0, 0, 0]);
    aug[i][n + i] = 1;
  }
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(aug[r][col]) > Math.abs(aug[piv][col])) piv = r;
    if (Math.abs(aug[piv][col]) < 1e-12) return null;
    [aug[col], aug[piv]] = [aug[piv], aug[col]];
    const d = aug[col][col];
    for (let c = 0; c < 2 * n; c++) aug[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      for (let c = 0; c < 2 * n; c++) aug[r][c] -= f * aug[col][c];
    }
  }
  const inv = new Array(16);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) inv[i * 4 + j] = aug[i][n + j];
  return inv;
}

// Rotation matrix (row-vector 4x4) -> quaternion (x,y,z,w).
function quatFromMat3(m) {
  const t = m[0] + m[5] + m[10];
  let x, y, z, w;
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    w = s / 4;
    x = (m[9] - m[6]) / s;
    y = (m[2] - m[8]) / s;
    z = (m[4] - m[1]) / s;
  } else if (m[0] > m[5] && m[0] > m[10]) {
    const s = Math.sqrt(1 + m[0] - m[5] - m[10]) * 2;
    w = (m[9] - m[6]) / s;
    x = s / 4;
    y = (m[1] + m[4]) / s;
    z = (m[2] + m[8]) / s;
  } else if (m[5] > m[10]) {
    const s = Math.sqrt(1 + m[5] - m[0] - m[10]) * 2;
    w = (m[2] - m[8]) / s;
    x = (m[1] + m[4]) / s;
    y = s / 4;
    z = (m[6] + m[9]) / s;
  } else {
    const s = Math.sqrt(1 + m[10] - m[0] - m[5]) * 2;
    w = (m[4] - m[1]) / s;
    x = (m[2] + m[8]) / s;
    y = (m[6] + m[9]) / s;
    z = s / 4;
  }
  const len = Math.hypot(x, y, z, w) || 1;
  return [x / len, y / len, z / len, w / len];
}

// Conjugate a file-order linear 3x3 into PT order: R_pt = S^-1 * R * S where
// S maps file (a,b,c) -> pt (a,c,b) (swap of axes 2 and 3). S is its own
// inverse: out[i][j] = r[perm(i)][perm(j)] with perm = [0,2,1].
function conjugateRotFileToPt(r3) {
  const p = [0, 2, 1];
  const out = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) out[i * 3 + j] = r3[p[i] * 3 + p[j]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// smMATERIAL_GROUP parser (same layout as the field compiler's)
// ---------------------------------------------------------------------------

function parseMaterialGroup(buf, offset, matCounterHeader) {
  let matCounter = 0;
  let matOffset = offset;
  if (matCounterHeader > 0) {
    matCounter = buf.readUInt32LE(offset + 8);
    matOffset += SIZE_MATERIAL_GROUP;
  }
  const materials = [];
  for (let mi = 0; mi < matCounter; mi++) {
    const base = matOffset;
    const inUse = buf.readUInt32LE(base + OFF_MAT_IN_USE) !== 0;
    const textureCounter = buf.readUInt32LE(base + OFF_MAT_TEXTURE_COUNTER);
    const animTexCounter = buf.readUInt32LE(base + OFF_MAT_ANIM_TEX_COUNTER);
    const twoSide = buf.readUInt32LE(base + OFF_MAT_TWO_SIDE) !== 0;
    const transparency = buf.readFloatLE(base + OFF_MAT_TRANSPARENCY);
    const useState = buf.readInt32LE(base + OFF_MAT_USE_STATE);
    const meshState = buf.readInt32LE(base + OFF_MAT_MESH_STATE);
    const windMeshBottom = buf.readInt32LE(base + OFF_MAT_WIND_MESH_BOTTOM);
    matOffset += SIZE_MATERIAL;
    const textureNames = [];
    if (inUse) {
      const strLen = buf.readInt32LE(matOffset);
      matOffset += 4;
      const nb = buf.subarray(matOffset, matOffset + strLen);
      matOffset += strLen;
      let pos = 0;
      const rs = () => {
        if (pos >= nb.length) return '';
        const e = nb.indexOf(0, pos);
        const s = e === -1 ? nb.subarray(pos).toString('ascii') : nb.subarray(pos, e).toString('ascii');
        pos = e === -1 ? nb.length : e + 1;
        return s;
      };
      for (let t = 0; t < textureCounter; t++) { const n = rs(); rs(); if (n) textureNames.push(n); }
      for (let t = 0; t < animTexCounter; t++) { const n = rs(); rs(); if (n) textureNames.push(n); }
    }
    materials.push({ index: mi, inUse, textureNames, twoSide, transparency, useState, meshState, windMeshBottom });
  }
  return { materials, endOffset: matOffset };
}

// ---------------------------------------------------------------------------
// smPAT3D parser (iMode=0 / "Ver 0.62")
// ---------------------------------------------------------------------------

function cstr(buf, off, len) {
  let end = off;
  while (end < off + len && buf[end] !== 0) end++;
  return buf.toString('latin1', off, end);
}

function readFrameTable(buf, off) {
  const out = new Int32Array(32 * 4);
  for (let i = 0; i < 32 * 4; i++) out[i] = buf.readInt32LE(off + i * 4);
  return out;
}

function parsePat(buf, fileName) {
  const headerStr = buf.toString('ascii', 0, 24).replace(/\0+$/, '');
  if (!headerStr.startsWith('SMD Model data Ver 0.62')) {
    throw new Error(`${fileName}: not a v0.62 model SMD: "${headerStr}"`);
  }
  const objCounter = buf.readInt32LE(24);
  const matCounterHeader = buf.readInt32LE(28);
  const matFilePoint = buf.readInt32LE(32);

  const { materials } = parseMaterialGroup(buf, matFilePoint, matCounterHeader);

  const infos = [];
  for (let k = 0; k < objCounter; k++) {
    const o = SIZE_DFILE_HEADER + k * SIZE_OBJINFO;
    infos.push({
      name: cstr(buf, o, 32),
      length: buf.readInt32LE(o + 32),
      offset: buf.readInt32LE(o + 36),
    });
  }

  const nodes = [];
  for (const info of infos) {
    const o = info.offset;
    const nVertex = buf.readInt32LE(o + OFF_OBJ_NV);
    const nFace = buf.readInt32LE(o + OFF_OBJ_NF);
    const nTexLink = buf.readInt32LE(o + OFF_OBJ_NTL);
    const rotCnt = buf.readInt32LE(o + OFF_OBJ_ROTCNT);
    const posCnt = buf.readInt32LE(o + OFF_OBJ_POSCNT);
    const scaleCnt = buf.readInt32LE(o + OFF_OBJ_SCALECNT);
    const tmFrameCnt = buf.readInt32LE(o + OFF_OBJ_TMFRAMECNT);

    const expected =
      SIZE_OBJ3D_HEAD + nVertex * SIZE_VERTEX + nFace * SIZE_FACE +
      nTexLink * SIZE_TEXLINK + rotCnt * SIZE_TM_ROT + posCnt * SIZE_TM_POS +
      scaleCnt * SIZE_TM_SCALE + rotCnt * SIZE_PREVROT;
    if (expected !== info.length) {
      throw new Error(`${fileName}/${info.name}: body size ${info.length} != expected ${expected}`);
    }

    let p = o + SIZE_OBJ3D_HEAD;

    // Vertices: file order (x, z_depth, y_height), fixed-point /256,
    // emitted in PT world order (x, y, z).
    const verts = new Float32Array(nVertex * 3);
    for (let i = 0; i < nVertex; i++) {
      const a = buf.readInt32LE(p) / FONE;
      const b = buf.readInt32LE(p + 4) / FONE;
      const c = buf.readInt32LE(p + 8) / FONE;
      const w = fileToPt(a, b, c);
      verts[i * 3] = w[0];
      verts[i * 3 + 1] = w[1];
      verts[i * 3 + 2] = w[2];
      p += SIZE_VERTEX;
    }

    // Faces: a,b,c,material WORDs + t[3] uv pairs + lpTexLink.
    // The face t[3] UVs are UNINITIALIZED GARBAGE in many SMD files (left
    // over from 3ds Max ASE export). The real UVs live in the TexLink array,
    // which is written immediately after the face array. PT's smOBJ3D::LoadFile
    // fixes up Face[i].lpTexLink to point at TexLink[i] (sequential, stride
    // sizeof(smTEXLINK)=32, and nFace == nTexLink in every stage-object node),
    // and the renderer reads UVs from lpTexLink->u/v, never from face t[].
    // We mirror that: read face indices only, then read UVs from TexLink[i].
    const faces = new Uint16Array(nFace * 4);
    for (let i = 0; i < nFace; i++) {
      faces[i * 4] = buf.readUInt16LE(p);
      faces[i * 4 + 1] = buf.readUInt16LE(p + 2);
      faces[i * 4 + 2] = buf.readUInt16LE(p + 4);
      faces[i * 4 + 3] = buf.readUInt16LE(p + 6);
      p += SIZE_FACE;
    }

    // TexLinks: smTEXLINK { float u[3], v[3]; DWORD hTexture; smTEXLINK *NextTex }.
    // face i -> TexLink i (verified: nFace == nTexLink, sequential pointers).
    const uvs = new Float32Array(nFace * 6);
    for (let i = 0; i < nTexLink; i++) {
      uvs[i * 6] = buf.readFloatLE(p);
      uvs[i * 6 + 1] = buf.readFloatLE(p + 4);
      uvs[i * 6 + 2] = buf.readFloatLE(p + 8);
      uvs[i * 6 + 3] = buf.readFloatLE(p + 12);
      uvs[i * 6 + 4] = buf.readFloatLE(p + 16);
      uvs[i * 6 + 5] = buf.readFloatLE(p + 20);
      p += SIZE_TEXLINK;
    }
    // If nTexLink < nFace (never observed, but guard anyway), remaining faces
    // get zero UVs rather than reading past the TexLink array.

    // TmRot keys carry delta quats; TmPrevRot[k] is the accumulated absolute
    // rotation at key k (smRead3d.cpp dPrevMat accumulation). Emit absolute
    // quaternions in PT order so the runtime slerps key to key.
    const rotKeyFrames = new Int32Array(rotCnt);
    for (let i = 0; i < rotCnt; i++) {
      rotKeyFrames[i] = buf.readInt32LE(p);
      p += SIZE_TM_ROT;
    }
    const posKeys = new Float32Array(posCnt * 4);
    for (let i = 0; i < posCnt; i++) {
      const f = buf.readInt32LE(p);
      const a = buf.readFloatLE(p + 4);
      const b = buf.readFloatLE(p + 8);
      const c = buf.readFloatLE(p + 12);
      const w = fileToPt(a, b, c);
      posKeys[i * 4] = f;
      posKeys[i * 4 + 1] = w[0];
      posKeys[i * 4 + 2] = w[1];
      posKeys[i * 4 + 3] = w[2];
      p += SIZE_TM_POS;
    }
    const scaleKeys = new Float32Array(scaleCnt * 4);
    for (let i = 0; i < scaleCnt; i++) {
      const f = buf.readInt32LE(p);
      const sx = buf.readInt32LE(p + 4) / FONE;
      const sy = buf.readInt32LE(p + 8) / FONE;
      const sz = buf.readInt32LE(p + 12) / FONE;
      const w = fileToPt(sx, sy, sz);
      scaleKeys[i * 4] = f;
      scaleKeys[i * 4 + 1] = w[0];
      scaleKeys[i * 4 + 2] = w[1];
      scaleKeys[i * 4 + 3] = w[2];
      p += SIZE_TM_SCALE;
    }
    const rotKeys = new Float32Array(rotCnt * 5);
    for (let i = 0; i < rotCnt; i++) {
      const m = [];
      for (let k = 0; k < 16; k++) m.push(buf.readFloatLE(p + k * 4));
      p += SIZE_PREVROT;
      const m3 = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
      const lin = conjugateRotFileToPt(m3);
      const q = quatFromMat3([lin[0], lin[1], lin[2], 0, lin[3], lin[4], lin[5], 0, lin[6], lin[7], lin[8], 0, 0, 0, 0, 1]);
      rotKeys[i * 5] = rotKeyFrames[i];
      rotKeys[i * 5 + 1] = q[0];
      rotKeys[i * 5 + 2] = q[1];
      rotKeys[i * 5 + 3] = q[2];
      rotKeys[i * 5 + 4] = q[3];
    }

    // Base transform (row-vector, file order, fixed-point /256): emit the
    // translation and rotation pieces converted to PT order. The runtime
    // composes the local matrix from TRS.
    const tm = [];
    for (let k = 0; k < 16; k++) tm.push(buf.readInt32LE(o + OFF_OBJ_TM + k * 4) / FONE);
    const tmRotate = [];
    for (let k = 0; k < 16; k++) tmRotate.push(buf.readInt32LE(o + OFF_OBJ_TMROTATE + k * 4) / FONE);
    const posiFile = [
      buf.readInt32LE(o + OFF_OBJ_POSI) / FONE,
      buf.readInt32LE(o + OFF_OBJ_POSI + 4) / FONE,
      buf.readInt32LE(o + OFF_OBJ_POSI + 8) / FONE,
    ];

    // PT-order fallbacks. Posi is rebuilt by SetFixPosi from the Tm
    // translation (Posi.x = Tm._41, Posi.y = Tm._43, Posi.z = Tm._42) - the
    // stored Posi field is zero in these files, so use Tm._41.._43 in file
    // order (a,b,c) -> PT (a,c,b).
    const basePos = fileToPt(tm[12], tm[13], tm[14]);
    const rot3 = [tmRotate[0], tmRotate[1], tmRotate[2],
      tmRotate[4], tmRotate[5], tmRotate[6],
      tmRotate[8], tmRotate[9], tmRotate[10]];
    const rotPt3 = conjugateRotFileToPt(rot3);
    const baseRotQuat = quatFromMat3([rotPt3[0], rotPt3[1], rotPt3[2], 0,
      rotPt3[3], rotPt3[4], rotPt3[5], 0, rotPt3[6], rotPt3[7], rotPt3[8], 0, 0, 0, 0, 1]);

    // Static local matrix in PT order: Tm * parentTm^-1, with the axis swap
    // conjugated: local_pt = S^-1 * local_file * S applied to the full 4x4
    // (S permutation, its own inverse). Done via index swizzle.
    const parent = cstr(buf, o + OFF_OBJ_PARENT, 32);
    let localFile = tm;
    if (parent) {
      const pnode = nodes.find((pn) => pn.name === parent);
      const inv = pnode ? mat4Invert(pnode.tmRaw) : null;
      if (inv) localFile = mat4Mul(tm, inv);
    }
    // Swizzle the 4x4: M_pt[i][j] = M_file[perm(i)][perm(j)] for i,j<3 plus
    // translation row: t_pt = fileToPt(t). Column 3 / row 3 (w) untouched.
    const perm = [0, 2, 1];
    const localPt = new Float32Array(16);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) localPt[i * 4 + j] = localFile[perm[i] * 4 + perm[j]];
      localPt[i * 4 + 3] = localFile[perm[i] * 4 + 3]; // unused (0)
    }
    for (let j = 0; j < 3; j++) localPt[12 + j] = localFile[12 + perm[j]];
    localPt[15] = localFile[15];

    nodes.push({
      name: cstr(buf, o + OFF_OBJ_NAME, 32),
      parent,
      tmRaw: tm,
      nVertex,
      nFace,
      verts,
      faces,
      uvs,
      localPt,
      baseRotQuat,
      basePos,
      rotKeys,
      posKeys,
      scaleKeys,
      rotCnt,
      posCnt,
      scaleCnt,
      tmFrameCnt,
      rotFrameTable: readFrameTable(buf, o + OFF_OBJ_ROTFRAME),
      posFrameTable: readFrameTable(buf, o + OFF_OBJ_POSFRAME),
      scaleFrameTable: readFrameTable(buf, o + OFF_OBJ_SCALEFRAME),
    });
  }

  // PAT MaxFrame = max over nodes of the last track key frame (AddObject).
  let maxFrame = 0;
  for (const n of nodes) {
    if (n.rotCnt > 0) maxFrame = Math.max(maxFrame, n.rotKeys[(n.rotCnt - 1) * 5]);
    if (n.posCnt > 0) maxFrame = Math.max(maxFrame, n.posKeys[(n.posCnt - 1) * 4]);
  }

  return { fileName, objCounter, maxFrame, nodes, materials };
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

function emitBase64(lines, name, tsType, arr) {
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const b64 = buf.toString('base64');
  lines.push(`let _${name}: ${tsType} | null = null;`);
  lines.push(`export function ${name}(): ${tsType} {`);
  lines.push(`  if (_${name} === null) {`);
  lines.push(`    const buf = decodeB64('${b64}');`);
  lines.push(`    _${name} = new ${tsType}(buf.buffer, buf.byteOffset, buf.byteLength / ${tsType}.BYTES_PER_ELEMENT);`);
  lines.push(`  }`);
  lines.push(`  return _${name};`);
  lines.push(`}`);
  lines.push('');
}

function emitModule(objects) {
  const lines = [];
  lines.push('// GENERATED by scripts/pt-port/compile_pt_stage_objects.mjs, do not edit by hand.');
  lines.push('// Source: client/Field/Ricarten/v-ani01..v-ani14.smd (smPAT3D, SMD Model data Ver 0.62).');
  lines.push('// Render-only stage objects (windmills, carts, fountains): PT gives');
  lines.push('// smSTAGE_OBJECT no collision path, so nothing here feeds the');
  lines.push('// walkable-face set in pt_ricarten_field.');
  lines.push('// Data is in PT world units, PT world order (x,y,z); the renderer');
  lines.push('// applies the pt_band transform (X mirror + PT_SCALE) at build time.');
  lines.push('');
  lines.push('function decodeB64(b64: string): Uint8Array {');
  lines.push('  const bin = atob(b64);');
  lines.push('  const buf = new Uint8Array(bin.length);');
  lines.push('  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);');
  lines.push('  return buf;');
  lines.push('}');
  lines.push('');
  lines.push('export interface PtStageObjectMaterial {');
  lines.push('  index: number;');
  lines.push('  textureNames: string[];');
  lines.push('  twoSide: boolean;');
  lines.push('  transparency: number;');
  lines.push('  useState: number;');
  lines.push('  meshState: number;');
  lines.push('  windMeshBottom: number;');
  lines.push('}');
  lines.push('');
  lines.push('export interface PtStageObjectNode {');
  lines.push('  name: string;');
  lines.push('  parent: string;');
  lines.push('  nVertex: number;');
  lines.push('  nFace: number;');
  lines.push('  verts: Float32Array;   // PT units, PT order (x,y,z), 3 per vertex');
  lines.push('  faces: Uint16Array;  // a,b,c,material, 4 per face');
  lines.push('  uvs: Float32Array;   // u0,u1,u2,v0,v1,v2 per face');
  lines.push('  localMatrix: Float32Array; // 16, PT row-vector layout (Tm * parentTm^-1)');
  lines.push('  rotKeys: Float32Array;   // frame, quat x,y,z,w PT order (5 per key)');
  lines.push('  posKeys: Float32Array;   // frame, x,y,z PT units (4 per key)');
  lines.push('  scaleKeys: Float32Array; // frame, x,y,z (4 per key)');
  lines.push('  rotFrameTable: Int32Array;   // 32 x smFRAME_POS (start,end,posNum,posCnt)');
  lines.push('  posFrameTable: Int32Array;');
  lines.push('  scaleFrameTable: Int32Array;');
  lines.push('  tmFrameCnt: number;');
  lines.push('  baseRotQuat: number[]; // quat from base Tm rotation, PT order');
  lines.push('  basePos: number[];     // Posi translation, PT units (x,y,z)');
  lines.push('  animated: boolean;');
  lines.push('}');
  lines.push('');
  lines.push('export interface PtStageObject {');
  lines.push('  name: string;');
  lines.push('  maxFrame: number; // animation loop length in PT ticks (ms*2)');
  lines.push('  nodes: PtStageObjectNode[];');
  lines.push('  materials: PtStageObjectMaterial[];');
  lines.push('}');
  lines.push('');

  objects.forEach((obj, oi) => {
    const O = `PT_OBJ_${oi}`;
    obj.nodes.forEach((n, ni) => {
      emitBase64(lines, `${O}_N${ni}_VERTS`, 'Float32Array', n.verts);
      emitBase64(lines, `${O}_N${ni}_FACES`, 'Uint16Array', n.faces);
      emitBase64(lines, `${O}_N${ni}_UVS`, 'Float32Array', n.uvs);
      emitBase64(lines, `${O}_N${ni}_LOCAL`, 'Float32Array', n.localPt);
      emitBase64(lines, `${O}_N${ni}_ROTK`, 'Float32Array', n.rotKeys);
      emitBase64(lines, `${O}_N${ni}_POSK`, 'Float32Array', n.posKeys);
      emitBase64(lines, `${O}_N${ni}_SCLK`, 'Float32Array', n.scaleKeys);
      emitBase64(lines, `${O}_N${ni}_RFT`, 'Int32Array', n.rotFrameTable);
      emitBase64(lines, `${O}_N${ni}_PFT`, 'Int32Array', n.posFrameTable);
      emitBase64(lines, `${O}_N${ni}_SFT`, 'Int32Array', n.scaleFrameTable);
    });
  });

  lines.push('export const PT_STAGE_OBJECTS: PtStageObject[] = [');
  objects.forEach((obj, oi) => {
    const O = `PT_OBJ_${oi}`;
    lines.push('  {');
    lines.push(`    name: ${JSON.stringify(obj.fileName)},`);
    lines.push(`    maxFrame: ${obj.maxFrame},`);
    lines.push('    nodes: [');
    obj.nodes.forEach((n, ni) => {
      const animated = n.rotCnt > 0 || n.posCnt > 0 || n.scaleCnt > 0;
      lines.push('      {');
      lines.push(`        name: ${JSON.stringify(n.name)},`);
      lines.push(`        parent: ${JSON.stringify(n.parent)},`);
      lines.push(`        nVertex: ${n.nVertex}, nFace: ${n.nFace},`);
      lines.push(`        verts: ${O}_N${ni}_VERTS(),`);
      lines.push(`        faces: ${O}_N${ni}_FACES(),`);
      lines.push(`        uvs: ${O}_N${ni}_UVS(),`);
      lines.push(`        localMatrix: ${O}_N${ni}_LOCAL(),`);
      lines.push(`        rotKeys: ${O}_N${ni}_ROTK(),`);
      lines.push(`        posKeys: ${O}_N${ni}_POSK(),`);
      lines.push(`        scaleKeys: ${O}_N${ni}_SCLK(),`);
      lines.push(`        rotFrameTable: ${O}_N${ni}_RFT(),`);
      lines.push(`        posFrameTable: ${O}_N${ni}_PFT(),`);
      lines.push(`        scaleFrameTable: ${O}_N${ni}_SFT(),`);
      lines.push(`        tmFrameCnt: ${n.tmFrameCnt},`);
      lines.push(`        baseRotQuat: ${JSON.stringify(n.baseRotQuat.map((v) => +v.toFixed(6)))},`);
      lines.push(`        basePos: ${JSON.stringify(n.basePos.map((v) => +v.toFixed(4)))},`);
      lines.push(`        animated: ${animated},`);
      lines.push('      },');
    });
    lines.push('    ],');
    lines.push(`    materials: ${JSON.stringify(obj.materials.filter((m) => m.inUse).map((m) => ({
      index: m.index,
      textureNames: m.textureNames,
      twoSide: m.twoSide,
      transparency: +m.transparency.toFixed(4),
      useState: m.useState,
      meshState: m.meshState,
      windMeshBottom: m.windMeshBottom,
    })))},`);
    lines.push('  },');
  });
  lines.push('];');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const inDir = resolve(process.argv[2] || 'client/Field/Ricarten');
const outPath = resolve(process.argv[3] || 'src/render/pt_stage_objects.generated.ts');

const objects = [];
for (let i = 1; i <= 14; i++) {
  const file = `v-ani${String(i).padStart(2, '0')}.smd`;
  const buf = readFileSync(join(inDir, file));
  const pat = parsePat(buf, file);
  objects.push(pat);
  const animatedNodes = pat.nodes.filter((n) => n.rotCnt > 0 || n.posCnt > 0 || n.scaleCnt > 0);
  console.log(
    `${file}: nodes=${pat.nodes.length} animated=${animatedNodes.length} ` +
    `maxFrame=${pat.maxFrame} mats=${pat.materials.filter((m) => m.inUse).length}`,
  );
  for (const n of pat.nodes) {
    const pos = n.basePos;
    console.log(
      `  ${n.name}: v=${n.nVertex} f=${n.nFace} ptPos=(${pos.map((v) => v.toFixed(1)).join(',')}) ` +
      `rot=${n.rotCnt} pos=${n.posCnt} scale=${n.scaleCnt} segs=${n.tmFrameCnt} parent=${n.parent || '-'}`,
    );
  }
}

const out = emitModule(objects);
writeFileSync(outPath, out);
console.log(`wrote ${outPath} (${(out.length / 1024).toFixed(0)} KB)`);
