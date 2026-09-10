import { parseSmd } from './smd_parser.ts';
import { writeFileSync, readFileSync } from 'node:fs';

const dir = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\monster\\Monbagon\\';
const smd = parseSmd(readFileSync(dir + 'Monbagon-A.smd'));
const meshObj = smd.objects[0]; // bagonA-h

let obj = '# Bargon mesh export (no skinning)\n';
obj += '# Vertices in PT space (Z-up)\n';

// Output vertices in PT space, converted to Y-up for standard OBJ viewers
for (const v of meshObj.vertices) {
  const x = v.x / 256;
  const y = v.z / 256;  // PT Z → OBJ Y
  const z = -v.y / 256; // PT Y → OBJ Z (negated)
  obj += `v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}\n`;
}

// Output faces (1-indexed for OBJ)
for (const f of meshObj.faces) {
  obj += `f ${f.v[0]+1} ${f.v[1]+1} ${f.v[2]+1}\n`;
}

writeFileSync('scripts/pt-port/bargon.obj', obj);
console.log(`Written bargon.obj: ${meshObj.vertices.length} verts, ${meshObj.faces.length} faces`);

// Also print some stats
console.log(`\nVertex count: ${meshObj.vertices.length}`);
console.log(`Face count: ${meshObj.faces.length}`);
console.log(`Bone count: ${new Set(meshObj.physiqueBones).size}`);
console.log(`Bones: ${[...new Set(meshObj.physiqueBones)].join(', ')}`);

// Check if vertices are clustered by bone
const boneGroups = new Map<string, number[]>();
for (let i = 0; i < meshObj.physiqueBones.length; i++) {
  const bone = meshObj.physiqueBones[i];
  if (!boneGroups.has(bone)) boneGroups.set(bone, []);
  boneGroups.get(bone)!.push(i);
}
console.log(`\nVertices per bone:`);
for (const [bone, verts] of boneGroups) {
  const positions = verts.map(vi => {
    const v = meshObj.vertices[vi];
    return `(${(v.x/256).toFixed(1)}, ${(v.y/256).toFixed(1)}, ${(v.z/256).toFixed(1)})`;
  });
  console.log(`  ${bone}: ${verts.length} verts [${positions.slice(0, 3).join(', ')}${positions.length > 3 ? '...' : ''}]`);
}
