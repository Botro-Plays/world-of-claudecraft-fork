// Legacy shim - the smPAT3D compiler now lives in
// scripts/pt-port/lib/pat_smd.mjs and is driven manifest-first by
// scripts/pt-port/pt_map.mjs.
//
// Preserved for existing muscle memory / docs:
//   node scripts/pt-port/compile_pt_stage_objects.mjs <field-dir> <out-path>
//   node scripts/pt-port/compile_pt_stage_objects.mjs   (Ricarten defaults)

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ptClientPath } from './lib/pt_client.mjs';
import { emitModule, parsePat } from './lib/pat_smd.mjs';

const inDir = process.argv[2] ? resolve(process.argv[2]) : ptClientPath('Field/Ricarten');
const outPath = resolve(process.argv[3] || 'src/render/pt_stage_objects.generated.ts');
const files = process.argv[2]
  ? process.argv.slice(4)
  : Array.from({ length: 14 }, (_, i) => `v-ani${String(i + 1).padStart(2, '0')}.smd`);

const objects = files.map((file) => parsePat(readFileSync(join(inDir, file)), file));
const label = `client/Field/Ricarten/${files[0]}..${files[files.length - 1]} (smPAT3D, SMD Model data Ver 0.62)`;
writeFileSync(outPath, emitModule(objects, label));
console.log(`wrote ${outPath}`);
