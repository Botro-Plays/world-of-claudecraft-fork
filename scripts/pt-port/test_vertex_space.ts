import { parseSmd } from './smd_parser.ts';
import { readFileSync } from 'node:fs';

const FONE = 256;

type Mat4 = number[];

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++)
        r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return r;
}

const CONV: Mat4 = [1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1];
const CONV_INV: Mat4 = [1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1];

const dir = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\monster\\Monbagon\\';
const smd = parseSmd(readFileSync(dir + 'Monbagon-A.smd'));
const smb = parseSmd(readFileSync(dir + 'mbagon.smb'));

const bones = smb.objects;
const boneIndexMap = new Map<string, number>();
bones.forEach((b, i) => boneIndexMap.set(b.nodeName, i));

// Compute local and world matrices (in PT space, no coordinate conversion)
const localMats = bones.map(b => b.tm.m.map(v => v / FONE));
const worldMats: Mat4[] = [];
for (let i = 0; i < bones.length; i++) {
  const parentName = bones[i].nodeParent;
  const parentIdx = parentName ? boneIndexMap.get(parentName) : undefined;
  if (parentIdx !== undefined && parentIdx >= 0) {
    worldMats.push(mat4Multiply(localMats[i], worldMats[parentIdx]));
  } else {
    worldMats.push(localMats[i].slice());
  }
}

// Print world positions of bones
console.log('=== Bone World Positions (PT space) ===');
for (let i = 0; i < bones.length; i++) {
  const w = worldMats[i];
  console.log(`  ${bones[i].nodeName}: world pos = (${w[12].toFixed(2)}, ${w[13].toFixed(2)}, ${w[14].toFixed(2)})`);
}

// Check if vertices are near their bone's world position
const meshObj = smd.objects[0];
console.log('\n=== Vertex vs Bone World Position ===');
const boneGroups = new Map<string, number[]>();
for (let i = 0; i < meshObj.physiqueBones.length; i++) {
  const bone = meshObj.physiqueBones[i];
  if (!boneGroups.has(bone)) boneGroups.set(bone, []);
  boneGroups.get(bone)!.push(i);
}

for (const [boneName, vertIndices] of boneGroups) {
  const boneIdx = boneIndexMap.get(boneName);
  if (boneIdx === undefined) continue;
  const boneWorldPos = [worldMats[boneIdx][12], worldMats[boneIdx][13], worldMats[boneIdx][14]];

  // Compute centroid of vertices assigned to this bone
  let cx = 0, cy = 0, cz = 0;
  for (const vi of vertIndices) {
    const v = meshObj.vertices[vi];
    cx += v.x / FONE; cy += v.y / FONE; cz += v.z / FONE;
  }
  cx /= vertIndices.length; cy /= vertIndices.length; cz /= vertIndices.length;

  const dist = Math.hypot(cx - boneWorldPos[0], cy - boneWorldPos[1], cz - boneWorldPos[2]);
  console.log(`  ${boneName}: boneWorld=(${boneWorldPos[0].toFixed(2)}, ${boneWorldPos[1].toFixed(2)}, ${boneWorldPos[2].toFixed(2)}) vertCentroid=(${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)}) dist=${dist.toFixed(2)}`);
}

// Also check: transform a vertex by bone world matrix to see if it matches
console.log('\n=== Sample: vertex * boneWorldMatrix ===');
for (const [boneName, vertIndices] of boneGroups) {
  const boneIdx = boneIndexMap.get(boneName);
  if (boneIdx === undefined) continue;
  const w = worldMats[boneIdx];
  const vi = vertIndices[0];
  const v = meshObj.vertices[vi];
  const vx = v.x / FONE, vy = v.y / FONE, vz = v.z / FONE;

  // Transform vertex by bone world matrix (column vector: w * v)
  const tx = w[0]*vx + w[4]*vy + w[8]*vz + w[12];
  const ty = w[1]*vx + w[5]*vy + w[9]*vz + w[13];
  const tz = w[2]*vx + w[6]*vy + w[10]*vz + w[14];

  // Also try row vector: v * w
  const rx = vx*w[0] + vy*w[1] + vz*w[2] + w[3];
  const ry = vx*w[4] + vy*w[5] + vz*w[6] + w[7];
  const rz = vx*w[8] + vy*w[9] + vz*w[10] + w[11];

  console.log(`  ${boneName}: v=(${vx.toFixed(2)}, ${vy.toFixed(2)}, ${vz.toFixed(2)}) -> col=(${tx.toFixed(2)}, ${ty.toFixed(2)}, ${tz.toFixed(2)}) row=(${rx.toFixed(2)}, ${ry.toFixed(2)}, ${rz.toFixed(2)})`);
  if (vertIndices[0] > 2) break; // just a few samples
}
