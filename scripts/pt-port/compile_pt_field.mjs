// Legacy shim - the compiler now lives in scripts/pt-port/lib/stage_smd.mjs
// and is driven manifest-first by scripts/pt-port/pt_map.mjs.
//
// Preserved for existing muscle memory / docs:
//   node scripts/pt-port/compile_pt_field.mjs <smd-path> <out-path>
//   node scripts/pt-port/compile_pt_field.mjs          (Ricarten defaults)
//
// Water classification uses the generic 'translucent' rule, which on
// village-2.smd selects exactly the proven set {107,140,232}.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ptClientPath } from './lib/pt_client.mjs';
import {
  buildPerFaceUVs,
  buildTextureManifest,
  classifyAndBuild,
  emitModule,
  parseSmd,
  waterMaterialSet,
} from './lib/stage_smd.mjs';

const inPath = resolve(process.argv[2] || ptClientPath('Field/Ricarten/village-2.smd'));
const outPath = resolve(process.argv[3] || 'src/sim/pt_ricarten_field.generated.ts');

const smd = parseSmd(readFileSync(inPath));
const built = classifyAndBuild(smd, waterMaterialSet(smd.materials, { rule: 'translucent' }));
const uvs = buildPerFaceUVs(smd);
const textureManifest = buildTextureManifest(smd);

const sourceLabel = process.argv[2] || 'client/Field/Ricarten/village-2.smd';
const out = emitModule(smd, built, uvs, textureManifest, sourceLabel);
writeFileSync(outPath, out);
console.log(`wrote ${outPath}`);
