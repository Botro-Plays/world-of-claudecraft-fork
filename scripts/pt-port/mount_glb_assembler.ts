// Mount GLB assembler for Priston Tale mount models.
// Combines SMD (mesh) and SMB (skeleton, optional) with PNG textures into a
// single glTF 2.0 binary (.glb) file. Mounts have no INX animation index files;
// mount animation is driven by the player's motion at runtime, not by baked
// clips. This assembler is intentionally separate from glb_assembler.ts (which
// handles NPC/monster conversion with INX) so the working pipeline stays
// untouched.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import {
  Document, Node, Mesh, Primitive, Accessor,
  Material, Texture, Skin, NodeIO, Animation, AnimationChannel, AnimationSampler,
} from '@gltf-transform/core';
import { parseSmd } from './smd_parser.ts';
import type { PTSmdModel, PTObject, PTTmRot, PTTmPos, PTMatrix } from './smd_parser.ts';
import { bmpToPng } from './bmp_to_png.ts';
import { tgaToPng } from './tga_to_png.ts';

const FONE = 256;

// ---------------------------------------------------------------------------
// PNG decryption: PT mount textures are XOR-encrypted in the IHDR data
// and pHYs length fields. The key is byte[16] (first byte of IHDR width).
// XOR bytes 16-36 (IHDR data + IHDR CRC + pHYs length) with the key.
// Unencrypted PNGs have byte[16] = 0x00, making the XOR a no-op.
// ---------------------------------------------------------------------------

function decryptPng(buf: Buffer): Buffer {
  if (buf.length < 37) return buf;
  const key = buf[16];
  if (key === 0) return buf;
  const out = Buffer.from(buf);
  for (let i = 16; i <= 36 && i < out.length; i++) {
    out[i] = buf[i] ^ key;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Coordinate conversion (3ds Max Z-up to glTF Y-up)
// ---------------------------------------------------------------------------

type Mat4 = number[];
type Quat = [number, number, number, number];
type Vec3 = [number, number, number];

const CONV_MATRIX: Mat4 = [
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, -1, 0, 0,
  0, 0, 0, 1,
];
const CONV_MATRIX_INV: Mat4 = [
  1, 0, 0, 0,
  0, 0, -1, 0,
  0, 1, 0, 0,
  0, 0, 0, 1,
];

function mat4Identity(): Mat4 {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) {
        r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
      }
    }
  }
  return r;
}

function mat4TransformPoint(m: Mat4, x: number, y: number, z: number): Vec3 {
  return [
    x * m[0] + y * m[4] + z * m[8] + m[12],
    x * m[1] + y * m[5] + z * m[9] + m[13],
    x * m[2] + y * m[6] + z * m[10] + m[14],
  ];
}

function mat4TransformDir(m: Mat4, x: number, y: number, z: number): Vec3 {
  return [
    x * m[0] + y * m[4] + z * m[8],
    x * m[1] + y * m[5] + z * m[9],
    x * m[2] + y * m[6] + z * m[10],
  ];
}

function mat4Inverse(m: Mat4): Mat4 {
  const r = new Array(16).fill(0);
  const s = [0,0,0,0,0,0];
  s[0] = m[0]*m[5] - m[4]*m[1];
  s[1] = m[0]*m[6] - m[4]*m[2];
  s[2] = m[0]*m[7] - m[4]*m[3];
  s[3] = m[1]*m[6] - m[5]*m[2];
  s[4] = m[1]*m[7] - m[5]*m[3];
  s[5] = m[2]*m[7] - m[6]*m[3];
  const c5 = m[10]*m[15] - m[14]*m[11];
  const c4 = m[9]*m[15] - m[13]*m[11];
  const c3 = m[9]*m[14] - m[13]*m[10];
  const c2 = m[8]*m[15] - m[12]*m[11];
  const c1 = m[8]*m[14] - m[12]*m[10];
  const c0 = m[8]*m[13] - m[12]*m[9];
  const det = s[0]*c5 - s[1]*c4 + s[2]*c3 + s[3]*c2 - s[4]*c1 + s[5]*c0;
  if (Math.abs(det) < 1e-12) return mat4Identity();
  const invDet = 1.0 / det;
  r[0] = ( m[5]*c5 - m[6]*c4 + m[7]*c3) * invDet;
  r[1] = (-m[1]*c5 + m[2]*c4 - m[3]*c3) * invDet;
  r[2] = ( m[13]*s[5] - m[14]*s[4] + m[15]*s[3]) * invDet;
  r[3] = (-m[9 ]*s[5] + m[10]*s[4] - m[11]*s[3]) * invDet;
  r[4] = (-m[4]*c5 + m[6]*c2 - m[7]*c1) * invDet;
  r[5] = ( m[0]*c5 - m[2]*c2 + m[3]*c1) * invDet;
  r[6] = (-m[12]*s[5] + m[14]*s[2] - m[15]*s[1]) * invDet;
  r[7] = ( m[8 ]*s[5] - m[10]*s[2] + m[11]*s[1]) * invDet;
  r[8] = ( m[4]*c4 - m[5]*c2 + m[7]*c0) * invDet;
  r[9] = (-m[0]*c4 + m[1]*c2 - m[3]*c0) * invDet;
  r[10] = ( m[12]*s[4] - m[13]*s[2] + m[15]*s[0]) * invDet;
  r[11] = (-m[8 ]*s[4] + m[9 ]*s[2] - m[11]*s[0]) * invDet;
  r[12] = (-m[4]*c3 + m[5]*c1 - m[6]*c0) * invDet;
  r[13] = ( m[0]*c3 - m[1]*c1 + m[2]*c0) * invDet;
  r[14] = (-m[12]*s[3] + m[13]*s[1] - m[14]*s[0]) * invDet;
  r[15] = ( m[8]*s[3] - m[9]*s[1] + m[10]*s[0]) * invDet;
  return r;
}

function ptMatrixToFloat(ptM: { m: number[] }): Mat4 {
  return ptM.m.map((v) => v / FONE);
}

function mat4ToTRS(m: Mat4): { translation: Vec3; rotation: Quat; scale: Vec3 } {
  const tx = m[12], ty = m[13], tz = m[14];
  const sx = Math.hypot(m[0], m[4], m[8]);
  const sy = Math.hypot(m[1], m[5], m[9]);
  const sz = Math.hypot(m[2], m[6], m[10]);
  const invSx = sx !== 0 ? 1 / sx : 0;
  const invSy = sy !== 0 ? 1 / sy : 0;
  const invSz = sz !== 0 ? 1 / sz : 0;
  const r00 = m[0] * invSx, r10 = m[4] * invSx, r20 = m[8] * invSx;
  const r01 = m[1] * invSy, r11 = m[5] * invSy, r21 = m[9] * invSy;
  const r02 = m[2] * invSz, r12 = m[6] * invSz, r22 = m[10] * invSz;
  const trace = r00 + r11 + r22;
  let qx: number, qy: number, qz: number, qw: number;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    qw = 0.25 * s; qx = (r12 - r21) / s; qy = (r20 - r02) / s; qz = (r01 - r10) / s;
  } else if (r00 > r11 && r00 > r22) {
    const s = Math.sqrt(1 + r00 - r11 - r22) * 2;
    qw = (r12 - r21) / s; qx = 0.25 * s; qy = (r10 + r01) / s; qz = (r20 + r02) / s;
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2;
    qw = (r20 - r02) / s; qx = (r10 + r01) / s; qy = 0.25 * s; qz = (r21 + r12) / s;
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
    qw = (r01 - r10) / s; qx = (r20 + r02) / s; qy = (r21 + r12) / s; qz = 0.25 * s;
  }
  const ql = Math.hypot(qx, qy, qz, qw);
  if (ql > 0) { qx /= ql; qy /= ql; qz /= ql; qw /= ql; }
  return {
    translation: [tx, ty, tz],
    rotation: [qx, qy, qz, qw],
    scale: [sx, sy, sz],
  };
}

// ---------------------------------------------------------------------------
// Bone utilities
// ---------------------------------------------------------------------------

/**
 * Returns true when a bone's bind-pose translation is outside a plausible
 * range.  Raptor.smd has two bones whose smOBJ3D::Tm matrix contains garbage
 * (INT32_MIN / 256 ≈ -32768 glTF units).  Including them in the scene forces
 * the camera far enough out that the rest of the model is invisible.
 */
function isGarbageBone(bone: PTObject): boolean {
  const tx = bone.tm.m[12] / FONE;
  const ty = bone.tm.m[13] / FONE;
  const tz = bone.tm.m[14] / FONE;
  return Math.abs(tx) > 200 || Math.abs(ty) > 200 || Math.abs(tz) > 200;
}

/**
 * Convert a TmPrevRot float matrix (PT row-major, rotation-only) to the
 * equivalent glTF quaternion by applying the PT→glTF coordinate conversion.
 *
 * PT uses Z-up; glTF uses Y-up, right-handed.
 * Coordinate swap: PT(x,y,z) → glTF(x, z, -y).
 *
 * The TmPrevRot stores the ACCUMULATED ABSOLUTE rotation at each keyframe.
 * This is what the PT runtime uses as the base rotation; the TmRot quaternion
 * is a per-segment DELTA applied on top of it.  See smObj3d.cpp GetRotFrame:
 *   smFMatrixMult( gmat , PrevRot[cnt], gmat );
 */
function tmPrevRotToGltfQuat(prevRot: PTMatrix): Quat {
  // TmPrevRot values are already floats (not fixed-point int32).
  const ptM = prevRot.m as number[];
  const gltfM = mat4Multiply(mat4Multiply(CONV_MATRIX, ptM), CONV_MATRIX_INV);
  return mat4ToTRS(gltfM).rotation;
}

// ---------------------------------------------------------------------------
// Texture resolution (case-insensitive, supports PNG/BMP/TGA)
// ---------------------------------------------------------------------------

function normalizeStem(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, '');
}

function resolveCaseInsensitive(fullPath: string): string {
  const dir = dirname(fullPath);
  const target = basename(fullPath);
  const targetLower = target.toLowerCase();
  const targetStem = normalizeStem(target.replace(/\.[^.]+$/, ''));
  const targetExt = targetLower.match(/\.([^.]+)$/)?.[1] || '';
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return fullPath; }
  for (const e of entries) {
    if (e.toLowerCase() === targetLower) return join(dir, e);
  }
  for (const e of entries) {
    const eLower = e.toLowerCase();
    if (!eLower.endsWith('.' + targetExt)) continue;
    const eStem = normalizeStem(e.replace(/\.[^.]+$/, ''));
    if (eStem.startsWith(targetStem.slice(0, Math.max(4, targetStem.length - 4)))) {
      return join(dir, e);
    }
  }
  return fullPath;
}

// ---------------------------------------------------------------------------
// Build options and main entry point
// ---------------------------------------------------------------------------

export interface MountGlbBuildOptions {
  smdPath: string;
  smbPath?: string;
  outputPath: string;
  clientRoot?: string;
}

export async function buildMountGlb(opts: MountGlbBuildOptions): Promise<void> {
  const clientRoot = opts.clientRoot || 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\';
  const smd = parseSmd(readFileSync(opts.smdPath));
  const reverseWinding = smd.version === '0.66';

  // Find ALL mesh objects (has vertices)
  const meshObjs = smd.objects.filter((o) => o.nVertex > 0);
  if (meshObjs.length === 0) throw new Error('No mesh object found in SMD');

  // Skeleton from SMB (optional)
  let bones: PTObject[] = [];
  let boneIndexMap = new Map<string, number>();
  let tmGltf: Mat4[] = [];
  let localMatrices: Mat4[] = [];
  let inverseBindMatrices: Mat4[] = [];
  let hasSkeleton = false;
  let smbModel: PTSmdModel | null = null;

  if (opts.smbPath && existsSync(opts.smbPath)) {
    smbModel = parseSmd(readFileSync(opts.smbPath));
    // Filter out garbage bones whose bind-pose translation is implausibly large.
    // These occur in some Ver 0.66 assets (e.g. Raptor) where the smOBJ3D::Tm
    // matrix was not correctly written, producing INT32_MIN values.
    // Including them makes the camera frame a bounding box thousands of units
    // wide, making the rest of the model appear tiny/crumpled.
    const allBones = smbModel.objects;
    const garbageBoneNames = new Set(allBones.filter(isGarbageBone).map(b => b.nodeName));
    if (garbageBoneNames.size > 0) {
      console.log(`  Filtering ${garbageBoneNames.size} garbage bone(s): ${[...garbageBoneNames].join(', ')}`);
    }
    bones = allBones.filter(b => !isGarbageBone(b));
    const boneNames = bones.map((b) => b.nodeName);
    boneNames.forEach((name, i) => boneIndexMap.set(name, i));
    hasSkeleton = bones.length > 0;

    if (hasSkeleton) {
      tmGltf = bones.map((b) => {
        const ptM = ptMatrixToFloat(b.tm);
        return mat4Multiply(mat4Multiply(CONV_MATRIX, ptM), CONV_MATRIX_INV);
      });
      for (let i = 0; i < bones.length; i++) {
        inverseBindMatrices.push(mat4Inverse(tmGltf[i]));
        const parentName = bones[i].nodeParent;
        const parentIdx = parentName ? boneIndexMap.get(parentName) : undefined;
        if (parentIdx !== undefined && parentIdx >= 0) {
          localMatrices.push(mat4Multiply(tmGltf[i], mat4Inverse(tmGltf[parentIdx])));
        } else {
          localMatrices.push(tmGltf[i].slice());
        }
      }
    }
  }

  // Check if any mesh object has physique bone data
  const hasPhysique = meshObjs.some((mo) => mo.physiqueBones.length > 0);

  // Texture resolution
  const textureCache = new Map<string, Uint8Array | null>();
  function getTexturePng(texPath: string): Uint8Array | null {
    if (!texPath) return null;
    const cleanPath = texPath.split('|')[0];
    if (textureCache.has(cleanPath)) return textureCache.get(cleanPath)!;
    try {
      let fullPath = cleanPath;
      if (!fullPath.startsWith('D:') && !fullPath.startsWith('/')) {
        fullPath = clientRoot + cleanPath;
      }
      let resolvedPath = fullPath;
      if (!existsSync(resolvedPath)) {
        resolvedPath = resolveCaseInsensitive(fullPath);
      }
      const lower = resolvedPath.toLowerCase();
      let png: Buffer;
      if (lower.endsWith('.png')) {
        png = decryptPng(readFileSync(resolvedPath));
      } else if (lower.endsWith('.tga')) {
        png = tgaToPng(readFileSync(resolvedPath));
      } else {
        png = bmpToPng(readFileSync(resolvedPath));
      }
      textureCache.set(cleanPath, png);
      return png;
    } catch (e) {
      console.warn(`  Failed to load texture ${cleanPath}: ${(e as Error).message}`);
      textureCache.set(cleanPath, null);
      return null;
    }
  }

  // Group faces by material index across ALL mesh objects.
  // Skip faces with out-of-bounds vertex indices (0.66 format may include
  // degenerate/padding faces that reference vertices beyond nVertex).
  const matGroups = new Map<number, { obj: PTObject; fi: number }[]>();
  for (const mo of meshObjs) {
    for (let fi = 0; fi < mo.faces.length; fi++) {
      const f = mo.faces[fi];
      if (f.v.some(v => v >= mo.vertices.length)) continue;
      const matIdx = f.materialIndex;
      if (!matGroups.has(matIdx)) matGroups.set(matIdx, []);
      matGroups.get(matIdx)!.push({ obj: mo, fi });
    }
  }

  // TexLink base pointer resolution
  const TEXLINK_SIZE = 32;
  const texLinkBase = new Map<PTObject, number | null>();
  for (const mo of meshObjs) {
    if (mo.texLinks.length === 0 || mo.faces.length === 0) {
      texLinkBase.set(mo, null);
      continue;
    }
    const indices = mo.faces.map(f => f.texLinkIndex);
    const maxIdx = Math.max(...indices);
    if (maxIdx >= mo.texLinks.length) {
      texLinkBase.set(mo, Math.min(...indices));
    } else {
      texLinkBase.set(mo, null);
    }
  }

  // Detect inverted normals per object
  const flipNormals = new Set<PTObject>();
  for (const mo of meshObjs) {
    if (mo.faces.length === 0) continue;
    let dotSum = 0, dotCount = 0;
    for (let fi = 0; fi < Math.min(mo.faces.length, 50); fi++) {
      const f = mo.faces[fi];
      if (f.v.some(v => v >= mo.vertices.length)) continue;
      const v0 = mo.vertices[f.v[0]];
      // Use the same winding order as the output (Ver 0.66 reverses v[1] and v[2])
      const v1 = mo.vertices[reverseWinding ? f.v[2] : f.v[1]];
      const v2 = mo.vertices[reverseWinding ? f.v[1] : f.v[2]];
      const e1x = v1.x - v0.x, e1y = v1.y - v0.y, e1z = v1.z - v0.z;
      const e2x = v2.x - v0.x, e2y = v2.y - v0.y, e2z = v2.z - v0.z;
      const fnx = e1y * e2z - e1z * e2y;
      const fny = e1z * e2x - e1x * e2z;
      const fnz = e1x * e2y - e1y * e2x;
      const fnl = Math.hypot(fnx, fny, fnz);
      const vnl = Math.hypot(v0.nx, v0.ny, v0.nz);
      if (fnl > 0 && vnl > 0) {
        dotSum += (fnx * v0.nx + fny * v0.ny + fnz * v0.nz) / (fnl * vnl);
        dotCount++;
      }
    }
    if (dotCount > 0 && dotSum / dotCount < -0.3) {
      flipNormals.add(mo);
    }
  }

  console.log(`  Mesh: ${meshObjs.reduce((s, o) => s + o.faces.length, 0)} faces, ${matGroups.size} material groups, ${hasSkeleton ? bones.length + ' bones' : 'no skeleton'}`);

  // Create glTF document
  const doc = new Document();
  const root = doc.getRoot();
  const buffer = doc.createBuffer('bin');

  // Build one primitive per material group
  const primitives: Primitive[] = [];

  for (const [matIdx, faceIndices] of matGroups) {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const joints: number[] = [];
    const weights: number[] = [];
    const indices: number[] = [];
    let vertIdx = 0;

    for (const { obj: mo, fi } of faceIndices) {
      const face = mo.faces[fi];
      // Ver 0.66 face winding is reversed compared to Ver 0.62.
      // Swap v[1] and v[2] to make normals point outward.
      const viOrder = reverseWinding ? [0, 2, 1] : [0, 1, 2];
      for (const vi of viOrder) {
        const vIdx = face.v[vi];
        const v = mo.vertices[vIdx];
        const boneName = mo.physiqueBones[vIdx];
        const boneIdx = boneName ? boneIndexMap.get(boneName) : undefined;
        if (boneIdx !== undefined && hasSkeleton) {
          const ptM = ptMatrixToFloat(bones[boneIdx].tm);
          const [wx, wy, wz] = mat4TransformPoint(ptM, v.x / FONE, v.y / FONE, v.z / FONE);
          positions.push(wx, wz, -wy);
        } else {
          positions.push(v.x / FONE, v.z / FONE, -v.y / FONE);
        }
        const nl = Math.hypot(v.nx, v.ny, v.nz);
        const flip = flipNormals.has(mo) ? -1 : 1;
        if (nl > 0) {
          if (boneIdx !== undefined && hasSkeleton) {
            const ptM = ptMatrixToFloat(bones[boneIdx].tm);
            const [nx, ny, nz] = mat4TransformDir(ptM, flip * v.nx / nl, flip * v.ny / nl, flip * v.nz / nl);
            const nlen = Math.hypot(nx, ny, nz);
            normals.push(nx / nlen, nz / nlen, -ny / nlen);
          } else {
            normals.push(flip * v.nx / nl, flip * v.nz / nl, -flip * v.ny / nl);
          }
        } else {
          normals.push(0, 1, 0);
        }
        const base = texLinkBase.get(mo);
        let texLinkIdx = fi;
        if (base !== null && base !== undefined) {
          texLinkIdx = Math.round((face.texLinkIndex - base) / TEXLINK_SIZE);
        }
        const texLink = mo.texLinks[texLinkIdx];
        if (texLink && texLink.u[vi] !== undefined) {
          uvs.push(texLink.u[vi], texLink.v[vi]);
        } else {
          uvs.push(face.uvs[vi][0], face.uvs[vi][1]);
        }
        if (boneIdx !== undefined && hasSkeleton) {
          joints.push(boneIdx, 0, 0, 0);
        } else {
          joints.push(0, 0, 0, 0);
        }
        weights.push(1.0, 0, 0, 0);
        indices.push(vertIdx);
        vertIdx++;
      }
    }

    const posAcc = doc.createAccessor(`pos_${matIdx}`, buffer)
      .setType('VEC3').setArray(new Float32Array(positions));
    const normAcc = doc.createAccessor(`norm_${matIdx}`, buffer)
      .setType('VEC3').setArray(new Float32Array(normals));
    const uvAcc = doc.createAccessor(`uv_${matIdx}`, buffer)
      .setType('VEC2').setArray(new Float32Array(uvs));
    const idxAcc = doc.createAccessor(`idx_${matIdx}`, buffer)
      .setType('SCALAR').setArray(new Uint32Array(indices));

    const mat = smd.materials[matIdx];
    const texName = mat?.textureNames?.[0] || '';
    const pngBuf = getTexturePng(texName);

    const material = doc.createMaterial(`mat_${matIdx}`)
      .setMetallicFactor(0)
      .setRoughnessFactor(1)
      .setAlphaMode('MASK')
      .setAlphaCutoff(0.5)
      .setDoubleSided(true);

    if (pngBuf && pngBuf.length > 0) {
      const texImage = doc.createTexture(`tex_${matIdx}`)
        .setImage(pngBuf)
        .setMimeType('image/png');
      material.setBaseColorTexture(texImage);
    }

    console.log(`    Material ${matIdx}: ${faceIndices.length} faces, texture=${texName || '(none)'}`);

    const prim = doc.createPrimitive()
      .setAttribute('POSITION', posAcc)
      .setAttribute('NORMAL', normAcc)
      .setAttribute('TEXCOORD_0', uvAcc)
      .setIndices(idxAcc)
      .setMaterial(material);

    if (hasSkeleton && hasPhysique) {
      const jointAcc = doc.createAccessor(`joint_${matIdx}`, buffer)
        .setType('VEC4').setArray(new Uint16Array(joints));
      const weightAcc = doc.createAccessor(`weight_${matIdx}`, buffer)
        .setType('VEC4').setArray(new Float32Array(weights));
      prim.setAttribute('JOINTS_0', jointAcc);
      prim.setAttribute('WEIGHTS_0', weightAcc);
    }
    primitives.push(prim);
  }

  const mesh = doc.createMesh('mount_mesh');
  for (const p of primitives) mesh.addPrimitive(p);

  // Skeleton nodes (only if skeleton AND physique data present).
  // Without physique data, the mesh is rigid; bone nodes would only
  // inflate the scene bounding box and make the mesh appear crumpled.
  const boneNodes: Node[] = [];
  const boneNodeMap = new Map<string, Node>();

  if (hasSkeleton && hasPhysique) {
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i];
      const trs = mat4ToTRS(localMatrices[i]);
      const node = doc.createNode(bone.nodeName)
        .setTranslation(trs.translation)
        .setRotation(trs.rotation)
        .setScale(trs.scale);
      boneNodes.push(node);
      boneNodeMap.set(bone.nodeName, node);
    }
    for (let i = 0; i < bones.length; i++) {
      const parentName = bones[i].nodeParent;
      if (parentName && boneNodeMap.has(parentName)) {
        boneNodeMap.get(parentName)!.addChild(boneNodes[i]);
      }
    }
  }

  // Mesh node
  const meshNode = doc.createNode('mount');
  meshNode.setMesh(mesh);

  // Skin (only if skeleton and physique data present)
  if (hasSkeleton && hasPhysique) {
    const ibmArray = new Float32Array(bones.length * 16);
    for (let i = 0; i < bones.length; i++) {
      const ibm = inverseBindMatrices[i];
      for (let j = 0; j < 16; j++) ibmArray[i * 16 + j] = ibm[j];
    }
    const ibmAcc = doc.createAccessor('ibm', buffer)
      .setType('MAT4')
      .setArray(ibmArray);
    const skin = doc.createSkin('mount_skin')
      .setInverseBindMatrices(ibmAcc);
    for (const node of boneNodes) skin.addJoint(node);
    meshNode.setSkin(skin);
  }

  // Root node
  const rootNode = doc.createNode('root');
  rootNode.addChild(meshNode);
  // Only add bone nodes to the scene when the mesh is actually skinned
  // (has physique data). Without skinning, bone nodes are orphan nodes:
  // they exist for animation targeting but do not expand the scene's
  // bounding box, which would make the mesh appear tiny and crumpled.
  if (hasSkeleton && hasPhysique) {
    for (let i = 0; i < bones.length; i++) {
      if (!bones[i].nodeParent || !boneNodeMap.has(bones[i].nodeParent)) {
        rootNode.addChild(boneNodes[i]);
      }
    }
  }

  doc.createScene('scene').addChild(rootNode);

  // --- Animation extraction ---
  // PT mount SMB files contain per-bone keyframe tracks (tmRot/tmPos).
  // Frame values are in subframes (160 per frame). The CMountHandler uses
  // frame ranges: Run = frames 0-15, Idle = frames 17-106 (clamped to data).
  // We create two clips: "run" and "idle".
  const SUBFRAMES_PER_FRAME = 160;
  const FPS = 30;
  const RUN_START = 0;
  const RUN_END = 15;
  const IDLE_START = 17;

  if (hasSkeleton && hasPhysique && smbModel) {
    // Find the max frame across all bones to cap idle end
    let maxSubframe = 0;
    for (const bone of bones) {
      for (const r of bone.tmRot) {
        if (r.frame > maxSubframe) maxSubframe = r.frame;
      }
    }
    const idleEnd = Math.min(106, Math.floor(maxSubframe / SUBFRAMES_PER_FRAME));

    for (const [clipName, fStart, fEnd] of [
      ['run', RUN_START, RUN_END],
      ['idle', IDLE_START, idleEnd],
    ] as const) {
      const subStart = fStart * SUBFRAMES_PER_FRAME;
      const subEnd = fEnd * SUBFRAMES_PER_FRAME;
      const tStart = fStart / FPS;
      const tEnd = fEnd / FPS;

      const samplers: AnimationSampler[] = [];
      const channels: AnimationChannel[] = [];

      for (let bi = 0; bi < bones.length; bi++) {
        const bone = bones[bi];
        const node = boneNodeMap.get(bone.nodeName);
        if (!node) continue;

        // Rotation track.
        //
        // PT does NOT store absolute quaternions in TmRot.  Instead, TmRot[i]
        // is a DELTA quaternion that the engine applies on top of the
        // accumulated base matrix TmPrevRot[i] (see smObj3d.cpp GetRotFrame):
        //
        //   D3DMath_QuaternionSlerp(q, 0,0,0,0, TmRot[cnt+1], alpha);
        //   smFMatrixFromQuaternion(gmat, q);
        //   smFMatrixMult(gmat, PrevRot[cnt], gmat);   // gmat = PrevRot × delta
        //
        // Therefore TmPrevRot[i] is the ABSOLUTE world rotation at keyframe i,
        // and is the correct value to use as the glTF rotation keyframe.
        if (bone.tmRot.length >= 2 && bone.tmPrevRot.length === bone.tmRot.length) {
          // Pair each TmRot timestamp with its TmPrevRot absolute rotation.
          const pairs = bone.tmRot
            .map((k, i) => ({ frame: k.frame, prevRot: bone.tmPrevRot[i] }))
            .filter(({ frame }) => frame >= subStart && frame <= subEnd);
          if (pairs.length >= 2) {
            const times = new Float32Array(pairs.length);
            const vals = new Float32Array(pairs.length * 4);
            for (let i = 0; i < pairs.length; i++) {
              // Time relative to clip start (t=0 for the first keyframe).
              times[i] = (pairs[i].frame - subStart) / SUBFRAMES_PER_FRAME / FPS;
              // Convert TmPrevRot (PT float row-major, rotation only) →
              // glTF quaternion via PT→glTF coordinate conversion.
              const q = tmPrevRotToGltfQuat(pairs[i].prevRot);
              vals[i * 4 + 0] = q[0];
              vals[i * 4 + 1] = q[1];
              vals[i * 4 + 2] = q[2];
              vals[i * 4 + 3] = q[3];
            }
            const timeAcc = doc.createAccessor(`anim_${clipName}_rot_t_${bi}`, buffer)
              .setType('SCALAR').setArray(times);
            const valAcc = doc.createAccessor(`anim_${clipName}_rot_v_${bi}`, buffer)
              .setType('VEC4').setArray(vals);
            const sampler = doc.createAnimationSampler()
              .setInput(timeAcc).setOutput(valAcc)
              .setInterpolation('LINEAR');
            const channel = doc.createAnimationChannel()
              .setTargetNode(node)
              .setTargetPath('rotation')
              .setSampler(sampler);
            samplers.push(sampler);
            channels.push(channel);
          }
        }

        // Position track.
        // TmPos stores absolute world-space positions; linear interpolation is
        // correct (matches smObj3d.cpp GetPosFrame).
        if (bone.tmPos.length >= 2) {
          const keys = bone.tmPos.filter((k) => k.frame >= subStart && k.frame <= subEnd);
          if (keys.length >= 2) {
            const times = new Float32Array(keys.length);
            const vals = new Float32Array(keys.length * 3);
            for (let i = 0; i < keys.length; i++) {
              // Time relative to clip start (t=0 for the first keyframe).
              times[i] = (keys[i].frame - subStart) / SUBFRAMES_PER_FRAME / FPS;
              // PT position (x,y,z) -> glTF (x,z,-y) coordinate swap.
              vals[i * 3 + 0] = keys[i].x;
              vals[i * 3 + 1] = keys[i].z;
              vals[i * 3 + 2] = -keys[i].y;
            }
            const timeAcc = doc.createAccessor(`anim_${clipName}_pos_t_${bi}`, buffer)
              .setType('SCALAR').setArray(times);
            const valAcc = doc.createAccessor(`anim_${clipName}_pos_v_${bi}`, buffer)
              .setType('VEC3').setArray(vals);
            const sampler = doc.createAnimationSampler()
              .setInput(timeAcc).setOutput(valAcc)
              .setInterpolation('LINEAR');
            const channel = doc.createAnimationChannel()
              .setTargetNode(node)
              .setTargetPath('translation')
              .setSampler(sampler);
            samplers.push(sampler);
            channels.push(channel);
          }
        }
      }

      if (samplers.length > 0) {
        const anim = doc.createAnimation(clipName);
        for (const s of samplers) anim.addSampler(s);
        for (const c of channels) anim.addChannel(c);
        console.log(`    Animation: ${clipName} (frames ${fStart}-${fEnd}, ${samplers.length} tracks)`);
      }
    }
  }

  // Write GLB
  const io = new NodeIO();
  await io.write(opts.outputPath, doc);
  const stats = readFileSync(opts.outputPath);
  console.log(`  Written: ${opts.outputPath} (${stats.length} bytes)`);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/pt-port/mount_glb_assembler.ts <smd> <output.glb> [smb]');
    process.exit(1);
  }
  const smdPath = args[0];
  const outputPath = args[1];
  const smbPath = args[2]; // optional
  await buildMountGlb({ smdPath, smbPath, outputPath });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
