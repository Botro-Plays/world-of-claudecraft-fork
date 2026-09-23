// Scratch: inspect v-ani*.smd (SMD Model data Ver 0.62 / smPAT3D)
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'E:/CascadeProjects/PT-Project/MagicPT-Chinese/client/Field/Ricarten';
const OBJ_FRAME_SEARCH_MAX = 32;

// smDFILE_HEADER: 24 + 4*5 + 16*32 = 556
const HDR = 24 + 20 + 16 * OBJ_FRAME_SEARCH_MAX;
// smDFILE_OBJINFO: 32 + 4 + 4 = 40
const OBJINFO = 40;
// smOBJ3D head size
const OFF_NV = 84, OFF_NF = 88, OFF_NTL = 92, OFF_POSI = 104;
const OFF_NAME = 172, OFF_PARENT = 204, OFF_TM = 240;
const OFF_ROTCNT = 684, OFF_POSCNT = 688, OFF_SCALECNT = 692;
const OFF_ROTFRAME = 696, OFF_POSFRAME = 1208, OFF_SCALEFRAME = 1720, OFF_TMFRAMECNT = 2232;
const HEAD_SZ = 2236;

const SZ_VERTEX = 24, SZ_FACE = 36, SZ_TEXLINK = 32;
const SZ_TM_ROT = 20, SZ_TM_POS = 16, SZ_TM_SCALE = 16, SZ_PREVROT = 64;

const cstr = (buf, off, len) => {
  let end = off;
  while (end < off + len && buf[end] !== 0) end++;
  return buf.toString('latin1', off, end);
};

for (let i = 1; i <= 14; i++) {
  const file = path.join(DIR, `v-ani${String(i).padStart(2, '0')}.smd`);
  const buf = fs.readFileSync(file);
  const header = cstr(buf, 0, 24);
  const objCounter = buf.readInt32LE(24);
  const matCounter = buf.readInt32LE(28);
  const matPoint = buf.readInt32LE(32);
  const firstObjPoint = buf.readInt32LE(36);
  const tmFrameCounter = buf.readInt32LE(40);
  console.log(`\n=== v-ani${String(i).padStart(2, '0')}.smd ===`);
  console.log(`header="${header}" objs=${objCounter} mats=${matCounter} tmFrameCnt=${tmFrameCounter} size=${buf.length}`);
  // TmFrame table
  for (let f = 0; f < Math.min(tmFrameCounter, 6); f++) {
    const o = 44 + f * 16;
    console.log(`  TmFrame[${f}]: start=${buf.readInt32LE(o)} end=${buf.readInt32LE(o + 4)} posNum=${buf.readInt32LE(o + 8)} posCnt=${buf.readInt32LE(o + 12)}`);
  }
  // obj infos
  const infos = [];
  for (let k = 0; k < objCounter; k++) {
    const o = HDR + k * OBJINFO;
    infos.push({ name: cstr(buf, o, 32), len: buf.readInt32LE(o + 32), pt: buf.readInt32LE(o + 36) });
  }
  for (const info of infos) {
    const o = info.pt;
    const nVertex = buf.readInt32LE(o + OFF_NV);
    const nFace = buf.readInt32LE(o + OFF_NF);
    const nTexLink = buf.readInt32LE(o + OFF_NTL);
    const px = buf.readInt32LE(o + OFF_POSI), py = buf.readInt32LE(o + OFF_POSI + 4), pz = buf.readInt32LE(o + OFF_POSI + 8);
    const name = cstr(buf, o + OFF_NAME, 32);
    const parent = cstr(buf, o + OFF_PARENT, 32);
    const rotCnt = buf.readInt32LE(o + OFF_ROTCNT), posCnt = buf.readInt32LE(o + OFF_POSCNT), scaleCnt = buf.readInt32LE(o + OFF_SCALECNT);
    // Tm translation: smMATRIX _41.._44 = ints at 48..64
    const t41 = buf.readInt32LE(o + OFF_TM + 48), t42 = buf.readInt32LE(o + OFF_TM + 52), t43 = buf.readInt32LE(o + OFF_TM + 56);
    // frame ranges
    const rf = buf.readInt32LE(o + OFF_ROTFRAME), re = buf.readInt32LE(o + OFF_ROTFRAME + 4);
    const pf = buf.readInt32LE(o + OFF_POSFRAME), pe = buf.readInt32LE(o + OFF_POSFRAME + 4);
    const sf = buf.readInt32LE(o + OFF_SCALEFRAME), se = buf.readInt32LE(o + OFF_SCALEFRAME + 4);
    const maxFr = buf.readInt32LE(o + OFF_TMFRAMECNT);
    // sanity: expected body size
    const body = HEAD_SZ + nVertex * SZ_VERTEX + nFace * SZ_FACE + nTexLink * SZ_TEXLINK +
      rotCnt * SZ_TM_ROT + posCnt * SZ_TM_POS + scaleCnt * SZ_TM_SCALE + rotCnt * SZ_PREVROT;
    const ok = body === info.len ? 'OK' : `MISMATCH(len=${info.len})`;
    console.log(`  node "${name}" parent="${parent}" v=${nVertex} f=${nFace} tl=${nTexLink} ` +
      `pos=(${px},${py},${pz}) Tm41=(${t41},${t42},${t43}) ` +
      `rot=${rotCnt}[${rf}-${re}] pos=${posCnt}[${pf}-${pe}] scale=${scaleCnt}[${sf}-${se}] maxFr=${maxFr} ${ok}`);
  }
  // materials
  if (matCounter > 0) {
    const mo = matPoint;
    const matCount = buf.readInt32LE(mo);
    const maxMat = buf.readInt32LE(mo + 4);
    console.log(`  mats: count=${matCount} max=${maxMat}`);
    for (let m = 0; m < matCount; m++) {
      const mo2 = mo + 88 + m * 320;
      const useState = buf.readUInt16LE(mo2 + 164);
      const meshState = buf.readUInt16LE(mo2 + 168);
      const wind = buf.readUInt16LE(mo2 + 172);
      const transp = buf.readFloatLE(mo2 + 144);
      const twoSide = buf.readInt32LE(mo2 + 152);
      // names follow material block: after 320*mats? smMATERIAL_GROUP save: head + mats + name block
      console.log(`    mat[${m}] transp=${transp.toFixed(3)} twoSide=${twoSide} useState=0x${useState.toString(16)} meshState=0x${meshState.toString(16)} wind=0x${wind.toString(16)}`);
    }
    // texture names: read trailing name block - scan for .tga/.bmp strings
    const names = new Set();
    const tail = buf.toString('latin1', mo + 88 + matCount * 320, Math.min(buf.length, mo + 88 + matCount * 320 + 64 * 1024));
    for (const mm of tail.matchAll(/[ -~]{3,64}\.(?:tga|bmp|png|dds)/gi)) names.add(mm[0]);
    console.log(`    texrefs: ${[...names].join(', ')}`);
  }
}
