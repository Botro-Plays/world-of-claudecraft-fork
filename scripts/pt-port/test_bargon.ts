import { parseSmd } from './smd_parser.ts';
import { readFileSync } from 'node:fs';

const dir = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\monster\\Monbagon\\';
const m = parseSmd(readFileSync(dir + 'Monbagon-A.smd'));

console.log('Materials:', JSON.stringify(m.materials, null, 2));
console.log('\nObjects:');
for (const o of m.objects) {
  console.log(`  ${o.nodeName}: verts=${o.nVertex} faces=${o.nFace}`);
  const matIndices = new Set(o.faces.map(f => f.materialIndex));
  console.log(`    material indices: ${[...matIndices].join(', ')}`);
}
