// Compare material tables between village-2.smd and v-ani*.smd files.
import fs from 'node:fs';
import path from 'node:path';

const FIELD = 'E:/CascadeProjects/PT-Project/MagicPT-Chinese/client/Field/Ricarten/village-2.smd';
const ANI_DIR = 'E:/CascadeProjects/PT-Project/MagicPT-Chinese/client/Field/Ricarten';

const SIZE_DFILE_HEADER = 556;
const SIZE_MATERIAL_GROUP = 88;
const SIZE_MATERIAL = 320;
const SIZE_STAGE3D = 262_260;
const OFF_MAT_COUNTER = 28;
const OFF_MAT_IN_USE = 0;
const OFF_MAT_TEXTURE_COUNTER = 4;
const OFF_MAT_ANIM_TEX_COUNTER = 304;

function readMats(buf, matGroupOffset, matCounterHeader) {
  let matCounter = 0;
  let matOffset = matGroupOffset;
  if (matCounterHeader > 0) {
    matCounter = buf.readUInt32LE(matGroupOffset + 8);
    matOffset += SIZE_MATERIAL_GROUP;
  }
  const mats = [];
  for (let mi = 0; mi < matCounter; mi++) {
    const base = matOffset;
    const inUse = buf.readUInt32LE(base + OFF_MAT_IN_USE) !== 0;
    const texCounter = buf.readUInt32LE(base + OFF_MAT_TEXTURE_COUNTER);
    const animTexCounter = buf.readUInt32LE(base + OFF_MAT_ANIM_TEX_COUNTER);
    const useState = buf.readInt32LE(base + 164);
    const meshState = buf.readInt32LE(base + 168);
    const transparency = buf.readFloatLE(base + 144);
    const twoSide = buf.readUInt32LE(base + 124) !== 0;
    const wind = buf.readInt32LE(base + 172);
    matOffset += SIZE_MATERIAL;
    const names = [];
    if (inUse) {
      const strLen = buf.readInt32LE(matOffset);
      matOffset += 4;
      const nb = buf.subarray(matOffset, matOffset + strLen);
      matOffset += strLen;
      let pos = 0;
      const rs = () => {
        if (pos >= nb.length) return '';
        const e = nb.indexOf(0, pos);
        const s = e === -1 ? nb.subarray(pos).toString('ascii') : nb.subarray(pos, e).toString('ascii');
        pos = e === -1 ? nb.length : e + 1;
        return s;
      };
      for (let t = 0; t < texCounter; t++) { const n = rs(); rs(); if (n) names.push(n); }
      for (let t = 0; t < animTexCounter; t++) { const n = rs(); rs(); if (n) names.push('anim:' + n); }
    }
    mats.push({ index: mi, inUse, names, useState, meshState, transparency, twoSide, wind });
  }
  return mats;
}

// field: material group follows stage3d at header+SIZE_STAGE3D
const fbuf = fs.readFileSync(FIELD);
const fMats = readMats(fbuf, SIZE_DFILE_HEADER + SIZE_STAGE3D, fbuf.readInt32LE(OFF_MAT_COUNTER));
console.log(`field mats: ${fMats.length}`);

for (let i = 1; i <= 14; i++) {
  const f = path.join(ANI_DIR, `v-ani${String(i).padStart(2, '0')}.smd`);
  const buf = fs.readFileSync(f);
  const matPoint = buf.readInt32LE(32);
  const aMats = readMats(buf, matPoint, buf.readInt32LE(28));
  let same = 0, diff = 0, diffList = [];
  for (let m = 0; m < Math.min(fMats.length, aMats.length); m++) {
    const a = aMats[m], b = fMats[m];
    if (a.inUse !== b.inUse) { diff++; diffList.push(m); continue; }
    if (a.inUse && (a.names.join('|') !== b.names.join('|'))) { diff++; diffList.push(m); continue; }
    same++;
  }
  console.log(`v-ani${String(i).padStart(2, '0')}: mats=${aMats.length} sameAsField=${same} diff=${diff} ${diffList.slice(0, 8).join(',')}`);
}
