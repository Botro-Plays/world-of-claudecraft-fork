import { parseSmd } from './smd_parser.ts';
import { readFileSync } from 'node:fs';

const base = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\monster\\hopy\\';
const smd = parseSmd(readFileSync(base + 'hopy.smd'));

const meshObj = smd.objects.find(o => o.nVertex > 0)!;

console.log('=== UV Analysis ===');
console.log(`Faces: ${meshObj.faces.length}, TexLinks: ${meshObj.texLinks.length}`);

// Check first 10 faces UVs
for (let i = 0; i < Math.min(10, meshObj.faces.length); i++) {
  const f = meshObj.faces[i];
  console.log(`Face ${i}: v=[${f.v}] mat=${f.materialIndex} uvs=[(${f.uvs[0][0].toFixed(3)},${f.uvs[0][1].toFixed(3)}), (${f.uvs[1][0].toFixed(3)},${f.uvs[1][1].toFixed(3)}), (${f.uvs[2][0].toFixed(3)},${f.uvs[2][1].toFixed(3)})]`);
}

// Check texLinks (these might modify UVs)
console.log('\n=== TexLinks ===');
for (let i = 0; i < Math.min(10, meshObj.texLinks.length); i++) {
  const tl = meshObj.texLinks[i];
  console.log(`TexLink ${i}: u=[${tl.u.map(v => v.toFixed(3))}] v=[${tl.v.map(v => v.toFixed(3))}]`);
}

// UV ranges
let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
for (const f of meshObj.faces) {
  for (const uv of f.uvs) {
    minU = Math.min(minU, uv[0]);
    maxU = Math.max(maxU, uv[0]);
    minV = Math.min(minV, uv[1]);
    maxV = Math.max(maxV, uv[1]);
  }
}
console.log(`\nUV range: U=[${minU.toFixed(3)}, ${maxU.toFixed(3)}] V=[${minV.toFixed(3)}, ${maxV.toFixed(3)}]`);

// Check if faces reference texLinks
// In PT, each face has a lpTexLink pointer. The texLink has u[3] and v[3] arrays
// that are used to transform the face UVs.
// Let's check if face UVs are already final or need texLink transformation
console.log('\n=== Face vs TexLink comparison ===');
for (let i = 0; i < Math.min(5, meshObj.faces.length); i++) {
  const f = meshObj.faces[i];
  const tl = meshObj.texLinks[i];
  console.log(`Face ${i} UV0: (${f.uvs[0][0].toFixed(3)}, ${f.uvs[0][1].toFixed(3)}) vs TexLink u0,v0: (${tl.u[0].toFixed(3)}, ${tl.v[0].toFixed(3)})`);
}
