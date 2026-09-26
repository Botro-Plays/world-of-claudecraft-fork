// One-shot: re-emit every generated/pt-maps/<id>/stage_objects.generated.ts
// so each gains PT_STAGE_TEXTURE_MANIFEST (added to emitModule for Phase 6G).
// Mirrors pt_map.mjs compileStageObjects() exactly; field modules untouched.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { parsePat, emitModule } from './lib/pat_smd.mjs';
import { ptClientPath } from './lib/pt_client.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAPS_DIR = join(REPO_ROOT, 'generated', 'pt-maps');

function tryParsePat(buf, file, skipped) {
  const header = buf.toString('ascii', 0, 24).replace(/\0+$/, '');
  if (!header.startsWith('SMD Model data Ver 0.62')) {
    skipped.push(`${file}: stage-format or unknown object SMD ("${header}")`);
    return null;
  }
  try {
    return parsePat(buf, file);
  } catch (e) {
    skipped.push(`${file}: ${e.message}`);
    return null;
  }
}

let written = 0;
for (const dir of readdirSync(MAPS_DIR)) {
  const manifestPath = join(MAPS_DIR, dir, 'manifest.json');
  if (!existsSync(manifestPath)) continue;
  const spec = JSON.parse(readFileSync(manifestPath, 'utf8')).manifest?.stageObjects;
  if (!spec || !spec.files?.length) continue;
  const outPath = join(REPO_ROOT, spec.out);
  if (!existsSync(outPath)) continue;
  const skipped = [];
  const objects = spec.files
    .map((file) => tryParsePat(readFileSync(join(ptClientPath(spec.dir), file)), file, skipped))
    .filter(Boolean);
  if (!objects.length) continue;
  const firstStem = basename(spec.files[0], extname(spec.files[0]));
  const label = `client/${spec.dir}/${firstStem}..${spec.files[spec.files.length - 1]} (smPAT3D, SMD Model data Ver 0.62).`;
  writeFileSync(outPath, emitModule(objects, label));
  written++;
  console.log(`${dir}: ${objects.length} objects${skipped.length ? ` (skipped ${skipped.length})` : ''}`);
}
console.log(`stage modules rewritten: ${written}`);
