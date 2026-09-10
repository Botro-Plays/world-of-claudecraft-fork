import { parseSmd } from './smd_parser.ts';
import { readFileSync } from 'node:fs';

const dir = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\monster\\Monbagon\\';

// Parse SMD (mesh) and SMB (skeleton)
const smd = parseSmd(readFileSync(dir + 'Monbagon-A.smd'));
const smb = parseSmd(readFileSync(dir + 'mbagon.smb'));

console.log('=== SMD Info ===');
console.log('Version:', smd.version);
console.log('Objects:', smd.objects.length);
for (const o of smd.objects) {
  console.log(`  ${o.nodeName}: verts=${o.nVertex} faces=${o.nFace} texLinks=${o.nTexLink}`);
  // Print first few vertices
  for (let i = 0; i < Math.min(5, o.vertices.length); i++) {
    const v = o.vertices[i];
    console.log(`    v${i}: (${v.x}, ${v.y}, ${v.z}) / FONE = (${(v.x/256).toFixed(2)}, ${(v.y/256).toFixed(2)}, ${(v.z/256).toFixed(2)})`);
  }
  // Print bone assignments
  const bones = new Set(o.physiqueBones);
  console.log(`    Bones used: ${[...bones].join(', ')}`);
}

console.log('\n=== SMB Info ===');
console.log('Objects (bones):', smb.objects.length);
for (const o of smb.objects) {
  console.log(`  ${o.nodeName}: parent=${o.nodeParent}`);
  // Print bind-pose matrix
  const m = o.tm.m;
  console.log(`    TM (first row): ${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}`);
  console.log(`    TM (second row): ${m[4]}, ${m[5]}, ${m[6]}, ${m[7]}`);
  console.log(`    TM (third row): ${m[8]}, ${m[9]}, ${m[10]}, ${m[11]}`);
  console.log(`    TM (fourth row): ${m[12]}, ${m[13]}, ${m[14]}, ${m[15]}`);
  // Convert to float
  console.log(`    TM/FONE (translation): (${(m[12]/256).toFixed(2)}, ${(m[13]/256).toFixed(2)}, ${(m[14]/256).toFixed(2)})`);
}

// Check if SMD version affects coordinate handling
console.log('\n=== SMD Header ===');
console.log('Header:', smd.header);

// Check vertex bounds for first mesh object
const meshObj = smd.objects[0];
let minX = Infinity, maxX = -Infinity;
let minY = Infinity, maxY = -Infinity;
let minZ = Infinity, maxZ = -Infinity;
for (const v of meshObj.vertices) {
  if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
  if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
  if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
}
console.log(`\nVertex bounds (raw): X=[${minX}, ${maxX}] Y=[${minY}, ${maxY}] Z=[${minZ}, ${maxZ}]`);
console.log(`Vertex bounds (/FONE): X=[${(minX/256).toFixed(2)}, ${(maxX/256).toFixed(2)}] Y=[${(minY/256).toFixed(2)}, ${(maxY/256).toFixed(2)}] Z=[${(minZ/256).toFixed(2)}, ${(maxZ/256).toFixed(2)}]`);
