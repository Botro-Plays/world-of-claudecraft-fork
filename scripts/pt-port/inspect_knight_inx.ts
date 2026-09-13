import { parseInx } from './inx_parser.ts';
import { readFileSync } from 'node:fs';

const dir = 'C:/Users/jhing/CascadeProjects/PT-Project/MagicPT-Chinese/client/char/tmABCD/';

const files = ['M1Bip.inx', 'M2Bip.inx', 'M4Bip.inx'];

for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const buf = readFileSync(dir + f);
  const inx = parseInx(buf);
  console.log('  High model:', inx.highModel.names);
  console.log('  Default model:', inx.defaultModel.names);
  console.log('  Low model:', inx.lowModel.names);
}
