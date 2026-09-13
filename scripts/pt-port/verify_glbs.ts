import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'scripts/pt-port/converted/mount';
const files = readdirSync(dir).filter(f => f.endsWith('.glb'));

console.log(`=== Mount GLB inventory (${files.length} files) ===\n`);
for (const f of files.sort()) {
  const path = join(dir, f);
  const size = statSync(path).size;
  const buf = readFileSync(path);

  // GLB header: magic (4) + version (4) + length (4)
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const length = buf.readUInt32LE(8);

  // First chunk: length (4) + type (4) + JSON
  const chunkLen = buf.readUInt32LE(12);
  const chunkType = buf.readUInt32LE(16);
  const jsonStr = buf.subarray(20, 20 + chunkLen).toString('utf8');
  const json = JSON.parse(jsonStr);

  const meshes = json.meshes || [];
  const nodes = json.nodes || [];
  const materials = json.materials || [];
  const textures = json.textures || [];
  const skins = json.skins || [];
  const accessors = json.accessors || [];
  const animations = json.animations || [];

  // Count primitives and vertices
  let totalPrims = 0;
  let totalVerts = 0;
  for (const mesh of meshes) {
    totalPrims += mesh.primitives.length;
    for (const prim of mesh.primitives) {
      const posAcc = accessors[prim.attributes.POSITION];
      if (posAcc) totalVerts += posAcc.count;
    }
  }

  const valid = magic === 0x46546C67 && version === 2 && length === buf.length;
  const status = valid ? 'OK' : 'BAD';

  const animNames = animations.map(a => a.name).join(',') || '-';
  console.log(`${f.padEnd(25)} ${status}  ${(size / 1024).toFixed(0).padStart(6)} KB  meshes=${meshes.length} prims=${totalPrims} verts=${totalVerts} mats=${materials.length} texs=${textures.length} skins=${skins.length} nodes=${nodes.length} anims=${animations.length} [${animNames}]`);
}
