// Measure the rawHeight (Y extent) of a generated PT GLB file.
import { readFileSync } from 'node:fs';

function measureGlb(path: string) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const jsonStr = buf.toString('utf8', 20, 20 + jsonLen);
  const gltf = JSON.parse(jsonStr);

  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart);

  let minY = Infinity, maxY = -Infinity;

  for (const accessor of gltf.accessors || []) {
    if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') continue;
    const bv = accessor.bufferView;
    if (bv === undefined) continue;
    const view = gltf.bufferViews[bv];
    const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;
    const stride = 12;
    for (let i = 0; i < count; i++) {
      const y = bin.readFloatLE(offset + i * stride + 4);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const height = maxY - minY;
  console.log(`${path}: minY=${minY.toFixed(2)}, maxY=${maxY.toFixed(2)}, rawHeight=${height.toFixed(2)}`);
  return height;
}

const files = [
  'public/models/creatures/pt_fighter.glb',
  'public/models/creatures/pt_mechanician.glb',
  'public/models/creatures/pt_pikeman.glb',
  'public/models/creatures/pt_archer.glb',
  'public/models/creatures/pt_knight.glb',
  'public/models/creatures/pt_knight_hair2.glb',
  'public/models/creatures/pt_knight_hair3.glb',
];

for (const f of files) {
  measureGlb(f);
}
