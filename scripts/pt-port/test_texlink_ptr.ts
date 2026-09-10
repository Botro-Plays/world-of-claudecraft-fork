import { parseSmd } from './smd_parser.ts';
import { readFileSync } from 'node:fs';

const base = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\monster\\hopy\\';
const smd = parseSmd(readFileSync(base + 'hopy.smd'));
const meshObj = smd.objects.find(o => o.nVertex > 0)!;

console.log(`nFace=${meshObj.faces.length}, nTexLink=${meshObj.texLinks.length}`);
console.log('\n=== Face texLinkIndex values ===');
const indices = new Set<number>();
for (let i = 0; i < meshObj.faces.length; i++) {
  const f = meshObj.faces[i];
  indices.add(f.texLinkIndex);
  if (i < 15 || i >= meshObj.faces.length - 3) {
    console.log(`  Face ${i}: v=[${f.v}] texLinkIndex=${f.texLinkIndex}`);
  } else if (i === 15) {
    console.log('  ...');
  }
}

console.log(`\nUnique texLinkIndex values: ${indices.size}`);
console.log(`Min: ${Math.min(...indices)}, Max: ${Math.max(...indices)}`);
const allValid = [...indices].every(v => v >= 0 && v < meshObj.texLinks.length);
console.log(`All valid indices (0-${meshObj.texLinks.length - 1}): ${allValid}`);

const sortedIndices = [...indices].sort((a, b) => a - b);
const isSequential = sortedIndices.every((v, i) => v === i);
console.log(`Sequential 0..n-1: ${isSequential}`);

let mismatchCount = 0;
for (let i = 0; i < meshObj.faces.length; i++) {
  if (meshObj.faces[i].texLinkIndex !== i) {
    mismatchCount++;
    if (mismatchCount <= 5) {
      console.log(`  MISMATCH: Face ${i} has texLinkIndex=${meshObj.faces[i].texLinkIndex} (expected ${i})`);
    }
  }
}
console.log(`\nFace-to-texLink mismatches (face index vs texLinkIndex): ${mismatchCount}/${meshObj.faces.length}`);
