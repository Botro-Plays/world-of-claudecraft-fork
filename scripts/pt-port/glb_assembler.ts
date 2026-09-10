// GLB assembler for Priston Tale models.
// Combines SMD (mesh), SMB (skeleton + animations), INX (animation state mappings),
// and PNG (texture) into a single glTF 2.0 binary (.glb) file.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import {
  Document, Node, Mesh, Primitive, Accessor,
  Material, Texture, Skin, Animation, AnimationChannel, AnimationSampler,
  NodeIO,
} from '@gltf-transform/core';
import { parseSmd, PTSmdModel, PTObject, PTVertex, PTFace, PTFramePos } from './smd_parser.ts';
import { parseInx, PTMotionInfo } from './inx_parser.ts';
import { bmpToPng } from './bmp_to_png.ts';
import { tgaToPng } from './tga_to_png.ts';

const FONE = 256;
const TICKS_PER_FRAME = 160;
const FPS = 30;

// ---------------------------------------------------------------------------
// Matrix math helpers
// ---------------------------------------------------------------------------

type Mat4 = number[]; // 16 elements, row-major
type Quat = [number, number, number, number]; // x, y, z, w
type Vec3 = [number, number, number];

// PT model format (SMD/SMB) uses 3ds Max Z-up coordinate system.
// PT game world is Y-up, but model files store data in Z-up.
// Convert Z-up → glTF Y-up: (x, y, z) → (x, z, -y), a +90° rotation around X.
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
// Quaternion for +90° around X (column-vector): (sin45°, 0, 0, cos45°)
const CONV_QUAT: Quat = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
const CONV_QUAT_INV: Quat = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

function quatMultiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

// Convert a Z-up column-vector quaternion to glTF Y-up column-vector.
function convertQuatZupToYup(q: Quat): Quat {
  return quatMultiply(quatMultiply(CONV_QUAT, q), CONV_QUAT_INV);
}

// Conjugate (inverse for unit quaternions)
function conjugateQuat(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

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

function mat4TransformPoint(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  // Row-vector convention: v' = v * M
  return [
    x * m[0] + y * m[4] + z * m[8] + m[12],
    x * m[1] + y * m[5] + z * m[9] + m[13],
    x * m[2] + y * m[6] + z * m[10] + m[14],
  ];
}

function mat4TransformDir(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  // Row-vector convention, rotation only (no translation): v' = v * R
  return [
    x * m[0] + y * m[4] + z * m[8],
    x * m[1] + y * m[5] + z * m[9],
    x * m[2] + y * m[6] + z * m[10],
  ];
}

function mat4Inverse(m: Mat4): Mat4 {
  // 4x4 matrix inverse via cofactors
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
  r[15] = ( m[8 ]*s[3] - m[9 ]*s[1] + m[10]*s[0]) * invDet;

  return r;
}

function ptMatrixToFloat(ptM: { m: number[] }): Mat4 {
  return ptM.m.map((v) => v / FONE);
}

function mat4ToTRS(m: Mat4): { translation: Vec3; rotation: Quat; scale: Vec3 } {
  // Extract translation
  const tx = m[12], ty = m[13], tz = m[14];

  // Extract scale from column lengths
  const sx = Math.hypot(m[0], m[4], m[8]);
  const sy = Math.hypot(m[1], m[5], m[9]);
  const sz = Math.hypot(m[2], m[6], m[10]);

  // Build rotation matrix (remove scale)
  // Negated quaternion signs below effectively conjugate, handling DirectX→glTF convention
  const invSx = sx !== 0 ? 1 / sx : 0;
  const invSy = sy !== 0 ? 1 / sy : 0;
  const invSz = sz !== 0 ? 1 / sz : 0;

  const r00 = m[0] * invSx, r10 = m[4] * invSx, r20 = m[8] * invSx;
  const r01 = m[1] * invSy, r11 = m[5] * invSy, r21 = m[9] * invSy;
  const r02 = m[2] * invSz, r12 = m[6] * invSz, r22 = m[10] * invSz;

  // Convert rotation matrix to quaternion
  const trace = r00 + r11 + r22;
  let qx: number, qy: number, qz: number, qw: number;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    qw = 0.25 * s;
    qx = (r12 - r21) / s;
    qy = (r20 - r02) / s;
    qz = (r01 - r10) / s;
  } else if (r00 > r11 && r00 > r22) {
    const s = Math.sqrt(1 + r00 - r11 - r22) * 2;
    qw = (r12 - r21) / s;
    qx = 0.25 * s;
    qy = (r10 + r01) / s;
    qz = (r20 + r02) / s;
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2;
    qw = (r20 - r02) / s;
    qx = (r10 + r01) / s;
    qy = 0.25 * s;
    qz = (r21 + r12) / s;
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
    qw = (r01 - r10) / s;
    qx = (r20 + r02) / s;
    qy = (r21 + r12) / s;
    qz = 0.25 * s;
  }

  // Normalize quaternion
  const ql = Math.hypot(qx, qy, qz, qw);
  if (ql > 0) {
    qx /= ql; qy /= ql; qz /= ql; qw /= ql;
  }

  return {
    translation: [tx, ty, tz],
    rotation: [qx, qy, qz, qw],
    scale: [sx, sy, sz],
  };
}

// ---------------------------------------------------------------------------
// GLB assembly
// ---------------------------------------------------------------------------

export interface GlbBuildOptions {
  smdPath: string;
  smbPath: string;
  inxPath: string;
  bmpPath: string;
  outputPath: string;
}

export async function buildGlb(opts: GlbBuildOptions): Promise<void> {
  const smd = parseSmd(readFileSync(opts.smdPath));
  const smb = parseSmd(readFileSync(opts.smbPath));
  const inx = parseInx(readFileSync(opts.inxPath));

  // Find ALL mesh objects (has vertices)
  const meshObjs = smd.objects.filter((o) => o.nVertex > 0);
  if (meshObjs.length === 0) throw new Error('No mesh object found in SMD');
  const meshObj = meshObjs[0]; // keep for backward compat

  // Bone list from SMB
  const bones = smb.objects;
  const boneNames = bones.map((b) => b.nodeName);
  const boneIndexMap = new Map<string, number>();
  boneNames.forEach((name, i) => boneIndexMap.set(name, i));

  // Convert bone Tm matrices to glTF coordinate space
  const tmGltf = bones.map((b) => {
    const ptM = ptMatrixToFloat(b.tm);
    return mat4Multiply(mat4Multiply(CONV_MATRIX, ptM), CONV_MATRIX_INV);
  });

  // PT pre-transforms vertices by inverse(Tm) during loading, so vertices are
  // in bone-local space. TmResult_bind = Tm (not hierarchical world matrix).
  // For glTF: bone node local = Tm * inverse(parent_Tm) (relative transform)
  //           inverse bind matrix = inverse(Tm)
  //           vertices pre-transformed by Tm to get world-space positions
  const localMatrices: Mat4[] = [];
  const inverseBindMatrices: Mat4[] = [];
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

  // Resolve textures for each material
  const modelDir = opts.smdPath.substring(0, opts.smdPath.lastIndexOf('\\') + 1);
  const textureCache = new Map<string, Uint8Array | null>();
  function getTexturePng(texPath: string): Uint8Array | null {
    if (!texPath) return null;
    if (textureCache.has(texPath)) return textureCache.get(texPath)!;
    try {
      const clientRoot = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\';
      let fullPath = texPath;
      if (!fullPath.startsWith('D:')) {
        fullPath = clientRoot + texPath;
      }
      const lower = fullPath.toLowerCase();
      let png: Buffer;
      if (lower.endsWith('.tga')) {
        png = tgaToPng(readFileSync(fullPath));
      } else {
        png = bmpToPng(readFileSync(fullPath));
      }
      textureCache.set(texPath, png);
      return png;
    } catch (e) {
      console.warn(`Failed to load texture ${texPath}: ${(e as Error).message}`);
      textureCache.set(texPath, null);
      return null;
    }
  }

  // Group faces by material index across ALL mesh objects
  const matGroups = new Map<number, { obj: typeof meshObj; fi: number }[]>();
  for (const mo of meshObjs) {
    for (let fi = 0; fi < mo.faces.length; fi++) {
      const matIdx = mo.faces[fi].materialIndex;
      if (!matGroups.has(matIdx)) matGroups.set(matIdx, []);
      matGroups.get(matIdx)!.push({ obj: mo, fi });
    }
  }

  console.log(`Mesh: ${meshObjs.reduce((s, o) => s + o.faces.length, 0)} faces, ${matGroups.size} material groups`);

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
      for (let vi = 0; vi < 3; vi++) {
        const vIdx = face.v[vi];
        const v = mo.vertices[vIdx];
        // PT vertices are in bone-local space (pre-transformed by inverse(Tm) during loading).
        // Transform by bone Tm to get world-space position, then convert to glTF.
        const boneName = mo.physiqueBones[vIdx];
        const boneIdx = boneIndexMap.get(boneName);
        if (boneIdx !== undefined) {
          const ptM = ptMatrixToFloat(bones[boneIdx].tm);
          const [wx, wy, wz] = mat4TransformPoint(ptM, v.x / FONE, v.y / FONE, v.z / FONE);
          positions.push(wx, wz, -wy);
        } else {
          positions.push(v.x / FONE, v.z / FONE, -v.y / FONE);
        }
        // Normals: transform by bone Tm (rotation part only), then convert to glTF
        const nl = Math.hypot(v.nx, v.ny, v.nz);
        if (nl > 0) {
          if (boneIdx !== undefined) {
            const ptM = ptMatrixToFloat(bones[boneIdx].tm);
            const [nx, ny, nz] = mat4TransformDir(ptM, v.nx / nl, v.ny / nl, v.nz / nl);
            const nlen = Math.hypot(nx, ny, nz);
            normals.push(nx / nlen, nz / nlen, -ny / nlen);
          } else {
            normals.push(v.nx / nl, v.nz / nl, -v.ny / nl);
          }
        } else {
          normals.push(0, 1, 0);
        }
        const texLink = mo.texLinks[fi];
        uvs.push(texLink.u[vi], texLink.v[vi]);

        if (boneIdx === undefined) {
          joints.push(0, 0, 0, 0);
        } else {
          joints.push(boneIdx, 0, 0, 0);
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
    const jointAcc = doc.createAccessor(`joint_${matIdx}`, buffer)
      .setType('VEC4').setArray(new Uint16Array(joints));
    const weightAcc = doc.createAccessor(`weight_${matIdx}`, buffer)
      .setType('VEC4').setArray(new Float32Array(weights));
    const idxAcc = doc.createAccessor(`idx_${matIdx}`, buffer)
      .setType('SCALAR').setArray(new Uint32Array(indices));

    // Material for this group
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

    console.log(`  Material ${matIdx}: ${faceIndices.length} faces, texture=${texName}`);

    const primitive = doc.createPrimitive()
      .setAttribute('POSITION', posAcc)
      .setAttribute('NORMAL', normAcc)
      .setAttribute('TEXCOORD_0', uvAcc)
      .setAttribute('JOINTS_0', jointAcc)
      .setAttribute('WEIGHTS_0', weightAcc)
      .setIndices(idxAcc)
      .setMaterial(material);
    primitives.push(primitive);
  }

  const mesh = doc.createMesh('mesh');
  for (const p of primitives) mesh.addPrimitive(p);

  // Skeleton nodes
  const boneNodes: Node[] = [];
  const boneNodeMap = new Map<string, Node>();

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

  // Link parent-child
  for (let i = 0; i < bones.length; i++) {
    const parentName = bones[i].nodeParent;
    if (parentName && boneNodeMap.has(parentName)) {
      boneNodeMap.get(parentName)!.addChild(boneNodes[i]);
    }
  }

  // Skin
  const ibmArray = new Float32Array(bones.length * 16);
  for (let i = 0; i < bones.length; i++) {
    const ibm = inverseBindMatrices[i];
    for (let j = 0; j < 16; j++) ibmArray[i * 16 + j] = ibm[j];
  }
  const ibmAcc = doc.createAccessor('ibm', buffer)
    .setType('MAT4')
    .setArray(ibmArray);

  const skin = doc.createSkin('skin')
    .setInverseBindMatrices(ibmAcc);
  for (const node of boneNodes) {
    skin.addJoint(node);
  }

  // Mesh node (with skin)
  const meshNode = doc.createNode('hopy')
    .setMesh(mesh)
    .setSkin(skin);

  // Root node (parent of mesh and root bones)
  const rootNode = doc.createNode('root');
  rootNode.addChild(meshNode);
  for (let i = 0; i < bones.length; i++) {
    if (!bones[i].nodeParent || !boneNodeMap.has(bones[i].nodeParent)) {
      rootNode.addChild(boneNodes[i]);
    }
  }

  // Scene
  const scene = doc.createScene('scene').addChild(rootNode);

  // Animations from INX + SMB (doc.createAnimation adds to root automatically)
  const seenStates = new Set<string>();
  for (const motion of inx.motions) {
    if (seenStates.has(motion.stateName)) continue;
    seenStates.add(motion.stateName);
    buildAnimation(doc, buffer, motion, bones, boneNodeMap, smb.tmFrames, boneIndexMap, tmGltf);
  }

  // Write GLB
  const io = new NodeIO();
  await io.write(opts.outputPath, doc);
  const stats = readFileSync(opts.outputPath);
  console.log(`Written GLB: ${opts.outputPath} (${stats.length} bytes)`);
}

function buildAnimation(
  doc: Document,
  buffer: any,
  motion: PTMotionInfo,
  bones: PTObject[],
  boneNodeMap: Map<string, Node>,
  tmFrames: PTFramePos[],
  boneIndexMap: Map<string, number>,
  tmGltf: Mat4[],
): Animation | null {
  // PT offsets each animation's frame range by TmFrame[MotionFrame-1].StartFrame.
  // character.cpp:689-691: sframe = TmFrame[MotionFrame-1].StartFrame / 160;
  //                            StartFrame += sframe; EndFrame += sframe;
  // Then: frame = StartFrame * 160 (line 2349)
  // So: startTick = (INX.startFrame + TmFrame.startFrame/160) * 160
  //              = INX.startFrame * 160 + TmFrame.startFrame
  const motionIdx = motion.motionFrame - 1; // 1-based to 0-based
  const tmFrame = (motionIdx >= 0 && motionIdx < tmFrames.length) ? tmFrames[motionIdx] : null;
  const frameOffset = tmFrame ? tmFrame.startFrame : 0;
  const startTick = motion.startFrame * TICKS_PER_FRAME + frameOffset;
  const endTick = motion.endFrame * TICKS_PER_FRAME + frameOffset;
  const duration = (endTick - startTick) / TICKS_PER_FRAME / FPS;

  if (duration <= 0) return null;

  const anim = doc.createAnimation(motion.stateName);

  for (let bi = 0; bi < bones.length; bi++) {
    const bone = bones[bi];
    const node = boneNodeMap.get(bone.nodeName);
    if (!node) continue;

    // Rotation keyframes
    if (bone.tmRot.length > 0) {
      const times: number[] = [];
      const values: number[] = [];
      for (let ri = 0; ri < bone.tmRot.length; ri++) {
        const kf = bone.tmRot[ri];
        if (kf.frame >= startTick && kf.frame <= endTick) {
          times.push((kf.frame - startTick) / TICKS_PER_FRAME / FPS);
          // PrevRot[ri] is the bone's LOCAL rotation matrix at keyframe ri (Z-up, row-vector).
          // Convert to glTF Y-up column-vector using the same CONV sandwich as the bind pose.
          // The delta quaternion (kf.x,y,z,w) is only for PT's internal slerp and is not needed here.
          const prevRotGltf = mat4Multiply(mat4Multiply(CONV_MATRIX, bone.tmPrevRot[ri].m), CONV_MATRIX_INV);
          const qGltf = mat4ToTRS(prevRotGltf).rotation as Quat;
          values.push(qGltf[0], qGltf[1], qGltf[2], qGltf[3]);
        }
      }
      if (times.length > 0) {
        const timeAcc = doc.createAccessor(`t_${motion.stateName}_${bone.nodeName}_r`, buffer)
          .setType('SCALAR').setArray(new Float32Array(times));
        const valAcc = doc.createAccessor(`v_${motion.stateName}_${bone.nodeName}_r`, buffer)
          .setType('VEC4').setArray(new Float32Array(values));
        const sampler = doc.createAnimationSampler()
          .setInput(timeAcc)
          .setOutput(valAcc)
          .setInterpolation('LINEAR');
        const channel = doc.createAnimationChannel()
          .setSampler(sampler)
          .setTargetNode(node)
          .setTargetPath('rotation');
        anim.addSampler(sampler);
        anim.addChannel(channel);
      }
    }

    // Translation keyframes
    if (bone.tmPos.length > 0) {
      const times: number[] = [];
      const values: number[] = [];
      for (const kf of bone.tmPos) {
        if (kf.frame >= startTick && kf.frame <= endTick) {
          times.push((kf.frame - startTick) / TICKS_PER_FRAME / FPS);
          values.push(kf.x, kf.z, -kf.y);
        }
      }
      if (times.length > 0) {
        const timeAcc = doc.createAccessor(`t_${motion.stateName}_${bone.nodeName}_t`, buffer)
          .setType('SCALAR').setArray(new Float32Array(times));
        const valAcc = doc.createAccessor(`v_${motion.stateName}_${bone.nodeName}_t`, buffer)
          .setType('VEC3').setArray(new Float32Array(values));
        const sampler = doc.createAnimationSampler()
          .setInput(timeAcc)
          .setOutput(valAcc)
          .setInterpolation('LINEAR');
        const channel = doc.createAnimationChannel()
          .setSampler(sampler)
          .setTargetNode(node)
          .setTargetPath('translation');
        anim.addSampler(sampler);
        anim.addChannel(channel);
      }
    }

    // Scale keyframes
    if (bone.tmScale.length > 0) {
      const times: number[] = [];
      const values: number[] = [];
      for (const kf of bone.tmScale) {
        if (kf.frame >= startTick && kf.frame <= endTick) {
          times.push((kf.frame - startTick) / TICKS_PER_FRAME / FPS);
          const sx = kf.x / FONE, sy = kf.y / FONE, sz = kf.z / FONE;
          values.push(sx, sz, sy);
        }
      }
      if (times.length > 0) {
        const timeAcc = doc.createAccessor(`t_${motion.stateName}_${bone.nodeName}_s`, buffer)
          .setType('SCALAR').setArray(new Float32Array(times));
        const valAcc = doc.createAccessor(`v_${motion.stateName}_${bone.nodeName}_s`, buffer)
          .setType('VEC3').setArray(new Float32Array(values));
        const sampler = doc.createAnimationSampler()
          .setInput(timeAcc)
          .setOutput(valAcc)
          .setInterpolation('LINEAR');
        const channel = doc.createAnimationChannel()
          .setSampler(sampler)
          .setTargetNode(node)
          .setTargetPath('scale');
        anim.addSampler(sampler);
        anim.addChannel(channel);
      }
    }
  }

  return anim;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('glb_assembler.ts')) {
  const modelDir = process.argv[2] || 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\monster\\hopy\\';
  const output = process.argv[3] || 'scripts/pt-port/hopy.glb';

  // Auto-discover files in the model directory
  const dir = readdirSync(modelDir);
  
  // Find SMD (mesh) — pick the one that looks like the main model (not die/attack specific)
  const smdFiles = dir.filter(f => f.toLowerCase().endsWith('.smd'));
  const mainSmd = smdFiles.find(f => !f.toLowerCase().includes('die') && !f.toLowerCase().includes('attack')) || smdFiles[0];
  
  // Find SMB (animation) — pick the largest one (usually contains all animations)
  const smbFiles = dir.filter(f => f.toLowerCase().endsWith('.smb'));
  const mainSmb = smbFiles.sort((a, b) => {
    const sa = statSync(modelDir + a).size;
    const sb = statSync(modelDir + b).size;
    return sb - sa;
  })[0];
  
  // Find INX — main INX (non-die)
  const inxFiles = dir.filter(f => f.toLowerCase().endsWith('.inx'));
  const mainInx = inxFiles.find(f => !f.toLowerCase().includes('die')) || inxFiles[0];
  
  // Find die files (separate model with different skeleton)
  const dieSmdFiles = smdFiles.filter(f => f.toLowerCase().includes('die'));
  const dieSmbFiles = smbFiles.filter(f => f.toLowerCase().includes('die'));
  const dieInxFiles = inxFiles.filter(f => f.toLowerCase().includes('die'));
  
  // Find BMP (texture) — pick the main body texture (not header/hair)
  const bmpFiles = dir.filter(f => f.toLowerCase().endsWith('.bmp'));
  const mainBmp = bmpFiles.find(f => !f.toLowerCase().includes('h') || f.toLowerCase().match(/-d\.bmp$/)) || bmpFiles[0];
  
  console.log('Auto-discovered files:');
  console.log(`  SMD: ${mainSmd}`);
  console.log(`  SMB: ${mainSmb}`);
  console.log(`  INX: ${mainInx}`);
  console.log(`  BMP: ${mainBmp}`);
  if (dieSmdFiles.length > 0) console.log(`  Die: ${dieSmdFiles.length} SMD, ${dieSmbFiles.length} SMB, ${dieInxFiles.length} INX`);

  buildGlb({
    smdPath: modelDir + mainSmd,
    smbPath: modelDir + mainSmb,
    inxPath: modelDir + mainInx,
    bmpPath: modelDir + mainBmp,
    outputPath: output,
  }).then(() => {
    // Build die GLB if die files exist
    if (dieSmdFiles.length > 0 && dieSmbFiles.length > 0 && dieInxFiles.length > 0) {
      const dieSmd = dieSmdFiles[0];
      const dieSmb = dieSmbFiles[0];
      const dieInx = dieInxFiles[0];
      const dieOutput = output.replace(/\.glb$/i, '-die.glb');
      console.log(`\nBuilding die GLB: ${dieSmd} + ${dieSmb} + ${dieInx}`);
      return buildGlb({
        smdPath: modelDir + dieSmd,
        smbPath: modelDir + dieSmb,
        inxPath: modelDir + dieInx,
        bmpPath: modelDir + mainBmp,
        outputPath: dieOutput,
      });
    }
  }).catch((err) => {
    console.error('GLB assembly failed:', err);
    process.exit(1);
  });
}
