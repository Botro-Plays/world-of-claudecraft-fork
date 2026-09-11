import { parseSmd } from './smd_parser.ts';
import { parseInx } from './inx_parser.ts';
import { readFileSync } from 'node:fs';

const base = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\monster\\hopy\\';
const smb = parseSmd(readFileSync(base + 'hopy.smb'));
const inx = parseInx(readFileSync(base + 'hopy.inx'));

const TICKS_PER_FRAME = 160;

console.log('=== INX Motion ranges (in ticks) ===');
for (const m of inx.motions) {
  const startTick = m.startFrame * TICKS_PER_FRAME;
  const endTick = m.endFrame * TICKS_PER_FRAME;
  console.log(`  ${m.stateName}: frames ${m.startFrame}-${m.endFrame} → ticks ${startTick}-${endTick}`);
}

console.log('\n=== SMB keyframe frame numbers ===');
for (const bone of smb.objects) {
  if (bone.tmRot.length > 0) {
    const frames = bone.tmRot.map(k => k.frame);
    const minF = Math.min(...frames);
    const maxF = Math.max(...frames);
    // Show first 10 and last 5 frame numbers
    const sample = frames.slice(0, 10).join(', ');
    console.log(`  ${bone.nodeName} rot: count=${bone.tmRot.length} range=[${minF}-${maxF}] first=[${sample}]`);
  }
  if (bone.tmPos.length > 0) {
    const frames = bone.tmPos.map(k => k.frame);
    const minF = Math.min(...frames);
    const maxF = Math.max(...frames);
    const sample = frames.slice(0, 10).join(', ');
    console.log(`  ${bone.nodeName} pos: count=${bone.tmPos.length} range=[${minF}-${maxF}] first=[${sample}]`);
  }
}

// Check which keyframes fall in ATTACK range
console.log('\n=== ATTACK animation (frames 270-310, ticks 43200-49600) ===');
for (const bone of smb.objects) {
  const rotKfs = bone.tmRot.filter(k => k.frame >= 43200 && k.frame <= 49600);
  const posKfs = bone.tmPos.filter(k => k.frame >= 43200 && k.frame <= 49600);
  console.log(`  ${bone.nodeName}: rot=${rotKfs.length} pos=${posKfs.length}`);
  if (rotKfs.length > 0) {
    console.log(`    rot frames: ${rotKfs.map(k => k.frame).join(', ')}`);
  }
}

// Check WALK
console.log('\n=== WALK animation (frames 1-28, ticks 160-4480) ===');
for (const bone of smb.objects) {
  const rotKfs = bone.tmRot.filter(k => k.frame >= 160 && k.frame <= 4480);
  const posKfs = bone.tmPos.filter(k => k.frame >= 160 && k.frame <= 4480);
  console.log(`  ${bone.nodeName}: rot=${rotKfs.length} pos=${posKfs.length}`);
  if (rotKfs.length > 0) {
    console.log(`    rot frames: ${rotKfs.map(k => k.frame).join(', ')}`);
  }
}

// Check STAND
console.log('\n=== STAND animation (frames 40-130, ticks 6400-20800) ===');
for (const bone of smb.objects) {
  const rotKfs = bone.tmRot.filter(k => k.frame >= 6400 && k.frame <= 20800);
  const posKfs = bone.tmPos.filter(k => k.frame >= 6400 && k.frame <= 20800);
  console.log(`  ${bone.nodeName}: rot=${rotKfs.length} pos=${posKfs.length}`);
  if (rotKfs.length > 0) {
    console.log(`    rot frames: ${rotKfs.map(k => k.frame).join(', ')}`);
  }
}

// Check physique bone assignments
const smd = parseSmd(readFileSync(base + 'hopy.smd'));
const meshObj = smd.objects.find(o => o.nVertex > 0)!;
const boneCounts: Record<string, number> = {};
for (const b of meshObj.physiqueBones) {
  boneCounts[b] = (boneCounts[b] || 0) + 1;
}
console.log('\n=== Physique bone assignments ===');
for (const [bone, count] of Object.entries(boneCounts)) {
  console.log(`  ${bone}: ${count} vertices`);
}

// Check for duplicate vertices or degenerate faces
console.log('\n=== Mesh diagnostics ===');
const vSet = new Set<string>();
let dupCount = 0;
for (const v of meshObj.vertices) {
  const key = `${v.x},${v.y},${v.z}`;
  if (vSet.has(key)) dupCount++;
  vSet.add(key);
}
console.log(`  Unique vertex positions: ${vSet.size}/${meshObj.vertices.length} (${dupCount} duplicates)`);

// Check face indices
let maxVIdx = 0;
let invalidFaces = 0;
for (const f of meshObj.faces) {
  for (const vi of f.v) {
    if (vi > maxVIdx) maxVIdx = vi;
    if (vi >= meshObj.vertices.length) invalidFaces++;
  }
}
console.log(`  Max vertex index in faces: ${maxVIdx} (nVertex=${meshObj.nVertex})`);
console.log(`  Invalid faces (out of range): ${invalidFaces}`);

// Check mesh tm matrix
console.log('\n=== Mesh object tm matrix ===');
console.log(`  ${meshObj.tm.m.slice(0, 4).map(x => (x/256).toFixed(4)).join(', ')}`);
console.log(`  ${meshObj.tm.m.slice(4, 8).map(x => (x/256).toFixed(4)).join(', ')}`);
console.log(`  ${meshObj.tm.m.slice(8, 12).map(x => (x/256).toFixed(4)).join(', ')}`);
console.log(`  ${meshObj.tm.m.slice(12, 16).map(x => (x/256).toFixed(4)).join(', ')}`);
