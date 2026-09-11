import { parseSmd } from './smd_parser.ts';
import { readFileSync } from 'node:fs';

const buf = readFileSync(process.argv[2]);
const model = parseSmd(buf);

for (const obj of model.objects) {
  console.log(`\n=== ${obj.nodeName} (parent: ${obj.nodeParent}) ===`);
  console.log(`  TmRot: ${obj.tmRot.length}, TmPos: ${obj.tmPos.length}, TmScale: ${obj.tmScale.length}, TmPrevRot: ${obj.tmPrevRot.length}`);

  if (obj.tmRot.length > 0) {
    console.log('  First 3 TmRot:');
    for (let i = 0; i < Math.min(3, obj.tmRot.length); i++) {
      const r = obj.tmRot[i];
      const mag = Math.sqrt(r.x * r.x + r.y * r.y + r.z * r.z + r.w * r.w);
      console.log(`    frame=${r.frame} q=(${r.x.toFixed(4)},${r.y.toFixed(4)},${r.z.toFixed(4)},${r.w.toFixed(4)}) |q|=${mag.toFixed(4)}`);
    }
  }

  if (obj.tmPos.length > 0) {
    console.log('  First 3 TmPos:');
    for (let i = 0; i < Math.min(3, obj.tmPos.length); i++) {
      const p = obj.tmPos[i];
      console.log(`    frame=${p.frame} pos=(${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)})`);
    }
  }

  if (obj.tmScale.length > 0) {
    console.log('  First 3 TmScale:');
    for (let i = 0; i < Math.min(3, obj.tmScale.length); i++) {
      const s = obj.tmScale[i];
      console.log(`    frame=${s.frame} scale=(${(s.x / 256).toFixed(3)},${(s.y / 256).toFixed(3)},${(s.z / 256).toFixed(3)})`);
    }
  }

  if (obj.tmPrevRot.length > 0) {
    const m = obj.tmPrevRot[0].m;
    console.log(`  TmPrevRot[0] first 4: (${m[0].toFixed(4)},${m[1].toFixed(4)},${m[2].toFixed(4)},${m[3].toFixed(4)})`);
  }
}
