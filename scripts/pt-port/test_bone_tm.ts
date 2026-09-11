import { parseSmd } from './smd_parser.ts';
import { readFileSync } from 'node:fs';

const base = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\monster\\hopy\\';
const smb = parseSmd(readFileSync(base + 'hopy.smb'));

console.log('=== SMB bone tm matrices (float) ===');
for (const bone of smb.objects) {
  const m = bone.tm.m.map(x => x / 256);
  console.log(`\n${bone.nodeName} (parent: ${bone.nodeParent}):`);
  console.log(`  [${m[0].toFixed(4)}, ${m[1].toFixed(4)}, ${m[2].toFixed(4)}, ${m[3].toFixed(4)}]`);
  console.log(`  [${m[4].toFixed(4)}, ${m[5].toFixed(4)}, ${m[6].toFixed(4)}, ${m[7].toFixed(4)}]`);
  console.log(`  [${m[8].toFixed(4)}, ${m[9].toFixed(4)}, ${m[10].toFixed(4)}, ${m[11].toFixed(4)}]`);
  console.log(`  [${m[12].toFixed(4)}, ${m[13].toFixed(4)}, ${m[14].toFixed(4)}, ${m[15].toFixed(4)}]`);
  
  // Decompose to TRS
  const tx = m[12], ty = m[13], tz = m[14];
  const sx = Math.hypot(m[0], m[4], m[8]);
  const sy = Math.hypot(m[1], m[5], m[9]);
  const sz = Math.hypot(m[2], m[6], m[10]);
  console.log(`  Translation: (${tx.toFixed(4)}, ${ty.toFixed(4)}, ${tz.toFixed(4)})`);
  console.log(`  Scale: (${sx.toFixed(4)}, ${sy.toFixed(4)}, ${sz.toFixed(4)})`);
  
  // Check if rotation part is orthonormal
  const r00 = m[0]/sx, r01 = m[1]/sy, r02 = m[2]/sz;
  const r10 = m[4]/sx, r11 = m[5]/sy, r12 = m[6]/sz;
  const r20 = m[8]/sx, r21 = m[9]/sy, r22 = m[10]/sz;
  // Check dot products of rows (should be 0 for orthonormal)
  const dot01 = r00*r01 + r10*r11 + r20*r21;
  const dot02 = r00*r02 + r10*r12 + r20*r22;
  const dot12 = r01*r02 + r11*r12 + r21*r22;
  console.log(`  Orthogonality: dot01=${dot01.toFixed(6)} dot02=${dot02.toFixed(6)} dot12=${dot12.toFixed(6)}`);
  
  // Determinant of rotation part (should be 1)
  const det = r00*(r11*r22 - r12*r21) - r01*(r10*r22 - r12*r20) + r02*(r10*r21 - r11*r20);
  console.log(`  Rotation determinant: ${det.toFixed(6)}`);
}
