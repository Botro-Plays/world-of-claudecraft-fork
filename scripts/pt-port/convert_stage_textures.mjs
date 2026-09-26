// One-shot: run convert_pt_textures.ts over every stage_objects.generated.ts
// (PT_STAGE_TEXTURE_MANIFEST) so stage-object-only textures are converted.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ptClientPath } from './lib/pt_client.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAPS_DIR = join(REPO_ROOT, 'generated', 'pt-maps');
const tsxCli = resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');
const script = resolve(REPO_ROOT, 'scripts/pt-port/convert_pt_textures.ts');

const totals = { maps: 0, converted: 0, failed: 0, notFound: 0 };
for (const dir of readdirSync(MAPS_DIR)) {
  const manifestPath = join(MAPS_DIR, dir, 'manifest.json');
  if (!existsSync(manifestPath)) continue;
  const man = JSON.parse(readFileSync(manifestPath, 'utf8')).manifest;
  const spec = man?.stageObjects;
  if (!spec?.out) continue;
  const stagePath = resolve(REPO_ROOT, spec.out);
  if (!existsSync(stagePath)) continue;
  if (!/PT_STAGE_TEXTURE_MANIFEST/.test(readFileSync(stagePath, 'utf8'))) continue;
  const r = spawnSync(
    process.execPath,
    [tsxCli, script, stagePath, ptClientPath(spec.dir), resolve(REPO_ROOT, man.textureOutDir), ''],
    { encoding: 'utf8' },
  );
  const out = r.stdout ?? '';
  const conv = /Converted: (\d+)/.exec(out)?.[1];
  const fail = /Failed: (\d+)/.exec(out)?.[1];
  const nf = /Not found: (\d+)/.exec(out)?.[1];
  totals.maps++;
  totals.converted += Number(conv ?? 0);
  totals.failed += Number(fail ?? 0);
  totals.notFound += Number(nf ?? 0);
  console.log(`  ${dir.padEnd(20)} converted=${conv ?? '?'} failed=${fail ?? '?'} missing=${nf ?? '?'}`);
  if (r.status !== 0) console.log((r.stderr ?? '').split('\n').slice(0, 5).join('\n'));
}
console.log(`stage textures: maps=${totals.maps} converted=${totals.converted} failed=${totals.failed} missing=${totals.notFound}`);
