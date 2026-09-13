import { readFileSync } from 'node:fs';
import { parseSmd } from './smd_parser.ts';

const root = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\mount\\';

const tests: Array<[string, string]> = [
  ['horse', 'horse.smd'],
  ['Raptor', 'Raptor.smd'],
  ['Unicorn', 'Unicorn.smd'],
  ['xunlu', 'xunlu.smd'],
  ['chicken', 'chicken.smd'],
  ['wolf', 'll_blackwolf.smd'],
];

for (const [dir, file] of tests) {
  console.log(`\n=== ${dir}/${file} ===`);
  try {
    const smd = parseSmd(readFileSync(root + dir + '\\' + file));
    console.log('Version:', smd.version);
    console.log('Objects:', smd.objCount);
    for (const o of smd.objects) {
      console.log(`  Obj: ${o.nodeName} nV=${o.nVertex} nF=${o.nFace}`);
    }
    console.log('Materials:', smd.matCount);
    for (const m of smd.materials) {
      console.log(`  Mat: tex=${JSON.stringify(m.textureNames)}`);
    }
  } catch (e) {
    console.log('ERROR:', (e as Error).message);
  }
}
