import { parseSmd } from './smd_parser.ts';
import { readFileSync } from 'node:fs';

const base = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\monster\\hopy\\';
const smd = parseSmd(readFileSync(base + 'hopy.smd'));
const meshObj = smd.objects.find(o => o.nVertex > 0)!;

// Check for degenerate faces
let degenCount = 0;
for (let i = 0; i < meshObj.faces.length; i++) {
  const f = meshObj.faces[i];
  if (f.v[0] === f.v[1] || f.v[1] === f.v[2] || f.v[0] === f.v[2]) {
    degenCount++;
    console.log(`Degenerate face ${i}: v=[${f.v}]`);
  }
  // Check if vertices are collinear
  const v0 = meshObj.vertices[f.v[0]];
  const v1 = meshObj.vertices[f.v[1]];
  const v2 = meshObj.vertices[f.v[2]];
  const dx1 = v1.x - v0.x, dy1 = v1.y - v0.y, dz1 = v1.z - v0.z;
  const dx2 = v2.x - v0.x, dy2 = v2.y - v0.y, dz2 = v2.z - v0.z;
  const cx = dy1*dz2 - dz1*dy2;
  const cy = dz1*dx2 - dx1*dz2;
  const cz = dx1*dy2 - dy1*dx2;
  const area = Math.hypot(cx, cy, cz);
  if (area < 1) {
    console.log(`Near-degenerate face ${i}: v=[${f.v}] area=${area}`);
  }
}
console.log(`Degenerate faces: ${degenCount}/${meshObj.faces.length}`);

// Check which vertices are bound to which bones and their positions
console.log('\n=== Vertices by bone ===');
const boneGroups: Record<string, number[]> = {};
for (let i = 0; i < meshObj.physiqueBones.length; i++) {
  const bone = meshObj.physiqueBones[i];
  if (!boneGroups[bone]) boneGroups[bone] = [];
  boneGroups[bone].push(i);
}

for (const [bone, verts] of Object.entries(boneGroups)) {
  console.log(`\n${bone} (${verts.length} verts):`);
  for (const vi of verts.slice(0, 5)) {
    const v = meshObj.vertices[vi];
    console.log(`  v${vi}: (${(v.x/256).toFixed(3)}, ${(v.y/256).toFixed(3)}, ${(v.z/256).toFixed(3)})`);
  }
  if (verts.length > 5) console.log(`  ... and ${verts.length - 5} more`);
}

// Check if any vertices are shared between faces with different bones
console.log('\n=== Vertices shared between different-bone faces ===');
const vertBones: Map<number, Set<string>> = new Map();
for (let fi = 0; fi < meshObj.faces.length; fi++) {
  const f = meshObj.faces[fi];
  for (const vi of f.v) {
    const bone = meshObj.physiqueBones[vi];
    if (!vertBones.has(vi)) vertBones.set(vi, new Set());
    vertBones.get(vi)!.add(bone);
  }
}
let multiBoneCount = 0;
for (const [vi, bones] of vertBones) {
  if (bones.size > 1) {
    console.log(`  v${vi} used by bones: ${[...bones].join(', ')}`);
    multiBoneCount++;
  }
}
console.log(`Vertices shared between different bones: ${multiBoneCount}`);

// Print all vertex positions for visual inspection
console.log('\n=== All vertex positions (float) ===');
for (let i = 0; i < meshObj.vertices.length; i++) {
  const v = meshObj.vertices[i];
  const bone = meshObj.physiqueBones[i];
  console.log(`v${i} [${bone}]: (${(v.x/256).toFixed(3)}, ${(v.y/256).toFixed(3)}, ${(v.z/256).toFixed(3)})`);
}
