// @ts-nocheck
// Scratch: dump v-ani08 node materials and world footprint.
import { readFileSync } from 'node:fs';

const buf = readFileSync('E:/CascadeProjects/PT-Project/MagicPT-Chinese/client/Field/Ricarten/v-ani08.smd');
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

// header: version string then counts. smPAT3D header per smRead3d:
// [64 char szFileHeader?] — need actual layout. From prior work: objinfo at 556.
// Header fields: int32 counts etc. We re-derive: nodes start at 556, each node head 2236.
const nObj = dv.getInt32(552, true); // guess: count field just before table?
console.log('int@552 =', nObj);
// try reading plausible count at a few offsets
for (const off of [36, 40, 44, 48, 52, 548, 552]) {
  console.log(`int@${off} =`, dv.getInt32(off, true));
}
