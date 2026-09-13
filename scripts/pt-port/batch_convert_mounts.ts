#!/usr/bin/env tsx
// Batch-convert all PT mount directories to GLB.
// Usage: npx tsx scripts/pt-port/batch_convert_mounts.ts "<PT mount root>" "<output dir>"
// Logs a summary at the end and writes a per-mount report to <output dir>/_report.json.

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMountGlb } from './mount_glb_assembler.ts';

const mountRoot =
  process.argv[2] || 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\mount';
const outputDir = process.argv[3] || 'scripts/pt-port/converted/mount';

mkdirSync(outputDir, { recursive: true });

const dirs = readdirSync(mountRoot)
  .filter((name) => {
    const p = join(mountRoot, name);
    return statSync(p).isDirectory();
  })
  .sort();

console.log(`Found ${dirs.length} mount directories`);
console.log(`Output: ${outputDir}`);
console.log('');

type Result = {
  name: string;
  status: 'ok' | 'fail' | 'skip';
  glbSize?: number;
  error?: string;
  durationMs?: number;
  smdFile?: string;
  smbFile?: string;
};

const results: Result[] = [];
let ok = 0;
let fail = 0;
let skip = 0;
const startTime = Date.now();

for (let i = 0; i < dirs.length; i++) {
  const name = dirs[i];
  const dir = join(mountRoot, name);
  const outPath = join(outputDir, `${name}.glb`);

  // Find the SMD file (case-insensitive match on directory name or any .smd)
  const entries = readdirSync(dir);
  let smdFile = entries.find(
    (e) => e.toLowerCase() === `${name.toLowerCase()}.smd`,
  );
  if (!smdFile) {
    // Fall back to first .smd file
    smdFile = entries.find((e) => e.toLowerCase().endsWith('.smd'));
  }
  if (!smdFile) {
    results.push({ name, status: 'skip', error: 'No SMD file found' });
    skip++;
    console.log(`[${i + 1}/${dirs.length}] SKIP ${name}: no SMD file`);
    continue;
  }

  // Find the SMB file (skeleton)
  let smbFile = entries.find(
    (e) => e.toLowerCase() === `${name.toLowerCase()}.smb`,
  );
  if (!smbFile) {
    smbFile = entries.find((e) => e.toLowerCase().endsWith('.smb'));
  }

  // Skip if already converted and non-empty
  if (existsSync(outPath) && statSync(outPath).size > 0) {
    results.push({
      name,
      status: 'skip',
      glbSize: statSync(outPath).size,
      smdFile,
      smbFile: smbFile || undefined,
    });
    skip++;
    console.log(`[${i + 1}/${dirs.length}] SKIP ${name} (already converted)`);
    continue;
  }

  const t0 = Date.now();
  try {
    await buildMountGlb({
      smdPath: join(dir, smdFile),
      smbPath: smbFile ? join(dir, smbFile) : undefined,
      outputPath: outPath,
    });
    const size = existsSync(outPath) ? statSync(outPath).size : 0;
    results.push({
      name,
      status: 'ok',
      glbSize: size,
      durationMs: Date.now() - t0,
      smdFile,
      smbFile: smbFile || undefined,
    });
    ok++;
    if (size > 0) {
      console.log(
        `[${i + 1}/${dirs.length}] OK   ${name} (${(size / 1024).toFixed(0)} KB, ${Date.now() - t0}ms)`,
      );
    } else {
      console.log(`[${i + 1}/${dirs.length}] WARN ${name} (no GLB written)`);
    }
  } catch (error: any) {
    const msg = (error.message || String(error)).split('\n').filter(Boolean).slice(-3).join(' | ');
    results.push({
      name,
      status: 'fail',
      error: msg,
      durationMs: Date.now() - t0,
      smdFile,
      smbFile: smbFile || undefined,
    });
    fail++;
    console.log(`[${i + 1}/${dirs.length}] FAIL ${name}: ${msg}`);
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log('');
console.log(`Done in ${elapsed}s: ${ok} ok, ${fail} failed, ${skip} skipped`);

writeFileSync(
  join(outputDir, '_report.json'),
  `${JSON.stringify({ total: dirs.length, ok, fail, skip, elapsedSec: Number(elapsed), results }, null, 2)}\n`,
);
console.log(`Report: ${join(outputDir, '_report.json')}`);
