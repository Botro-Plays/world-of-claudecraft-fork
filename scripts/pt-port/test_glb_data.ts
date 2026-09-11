import { parseSmd } from './smd_parser.ts';
import { parseInx } from './inx_parser.ts';
import { readFileSync } from 'node:fs';

const base = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\monster\\hopy\\';

const smd = parseSmd(readFileSync(base + 'hopy.smd'));
const smb = parseSmd(readFileSync(base + 'hopy.smb'));
const inx = parseInx(readFileSync(base + 'hopy.inx'));

console.log('=== SMD objects ===');
for (const o of smd.objects) {
  console.log(`${o.nodeName}: parent=${o.nodeParent} verts=${o.nVertex} faces=${o.nFace} texLinks=${o.nTexLink} physique=${o.physiqueBones.length} tmRot=${o.tmRot.length}`);
  if (o.physiqueBones.length > 0) {
    console.log('  physiqueBones[0..4]:', o.physiqueBones.slice(0, 5));
  }
  if (o.nVertex > 0) {
    const v0 = o.vertices[0];
    console.log(`  v0: (${v0.x}, ${v0.y}, ${v0.z}) / 256 = (${(v0.x/256).toFixed(3)}, ${(v0.y/256).toFixed(3)}, ${(v0.z/256).toFixed(3)})`);
  }
  console.log(`  tm[0..3]: ${o.tm.m.slice(0, 4).map((x: number) => x).join(', ')}`);
  console.log(`  tm (float) [0..3]: ${o.tm.m.slice(0, 4).map((x: number) => (x / 256).toFixed(4)).join(', ')}`);
}

console.log('\n=== SMB objects ===');
for (const o of smb.objects) {
  console.log(`${o.nodeName}: parent=${o.nodeParent} tmRot=${o.tmRot.length} tmPos=${o.tmPos.length} tmScale=${o.tmScale.length}`);
  if (o.tmRot.length > 0) {
    const r0 = o.tmRot[0];
    const rN = o.tmRot[o.tmRot.length - 1];
    console.log(`  rot[0]: frame=${r0.frame} q=(${r0.x.toFixed(3)}, ${r0.y.toFixed(3)}, ${r0.z.toFixed(3)}, ${r0.w.toFixed(3)})`);
    console.log(`  rot[N]: frame=${rN.frame} q=(${rN.x.toFixed(3)}, ${rN.y.toFixed(3)}, ${rN.z.toFixed(3)}, ${rN.w.toFixed(3)})`);
  }
  if (o.tmPos.length > 0) {
    const p0 = o.tmPos[0];
    console.log(`  pos[0]: frame=${p0.frame} p=(${p0.x.toFixed(3)}, ${p0.y.toFixed(3)}, ${p0.z.toFixed(3)})`);
  }
}

console.log('\n=== INX ===');
console.log(`modelFile: ${inx.modelFile}`);
console.log(`motionFile: ${inx.motionFile}`);
for (const m of inx.motions) {
  console.log(`  ${m.stateName}: frames ${m.startFrame}-${m.endFrame} repeat=${m.repeat} motionFrame=${m.motionFrame}`);
}

console.log('\n=== Materials ===');
for (const mat of smd.materials) {
  console.log(`  inUse=${mat.inUse} textures=${mat.textureNames} blend=${mat.blendType} twoSide=${mat.twoSide}`);
}
