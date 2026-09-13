import { parseSmd } from './smd_parser.ts';
import { readFileSync } from 'node:fs';

const dir = 'C:/Users/jhing/CascadeProjects/PT-Project/MagicPT-Chinese/client/char/tmABCD/';

const files = [
  'MmbA01.smd',
  'MmhA01.smd',
  'MmhA02.smd',
  'MmhA03.smd',
];

for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const buf = readFileSync(dir + f);
  const smd = parseSmd(buf);
  console.log(`  Objects: ${smd.objCount}`);
  for (const m of smd.objects) {
    console.log(`    ${m.nodeName}: ${m.nVertex} verts, ${m.nFace} faces`);
  }
  console.log(`  Materials: ${smd.matCount}`);
  for (const mat of smd.materials) {
    if (mat.inUse) {
      console.log(`    textures: ${mat.textureNames.join(', ')}`);
    }
  }
}
