#!/usr/bin/env tsx
// Batch-convert all PT monster directories to GLB.
// Usage: npx tsx scripts/pt-port/batch_convert.ts "<PT monster root>" "<output dir>"
// Logs a summary at the end and writes a per-monster report to <output dir>/_report.json.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const monsterRoot = process.argv[2] || 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\char\\monster';
const outputDir = process.argv[3] || 'scripts/pt-port/converted/monster';

mkdirSync(outputDir, { recursive: true });

const dirs = readdirSync(monsterRoot)
  .filter((name) => {
    const p = join(monsterRoot, name);
    return statSync(p).isDirectory() && existsSync(join(p, `${name}.smd`)) === false
      ? readdirSync(p).some((f) => f.endsWith('.smd'))
      : existsSync(join(p, `${name}.smd`));
  })
  .sort();

console.log(`Found ${dirs.length} monster directories with SMD files`);
console.log(`Output: ${outputDir}`);
console.log('');

type Result = {
  name: string;
  status: 'ok' | 'fail' | 'skip';
  glbSize?: number;
  error?: string;
  durationMs?: number;
};

const results: Result[] = [];
let ok = 0;
let fail = 0;
let skip = 0;
const startTime = Date.now();

for (let i = 0; i < dirs.length; i++) {
  const name = dirs[i];
  const dir = join(monsterRoot, name);
  const outPath = join(outputDir, `${name}.glb`);

  // Skip if already converted and non-empty
  if (existsSync(outPath) && statSync(outPath).size > 0) {
    results.push({ name, status: 'skip', glbSize: statSync(outPath).size });
    skip++;
    continue;
  }

  const t0 = Date.now();
  try {
    const stdout = execFileSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/pt-port/glb_assembler.ts', `${dir}/`, outPath],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const size = existsSync(outPath) ? statSync(outPath).size : 0;
    results.push({ name, status: 'ok', glbSize: size, durationMs: Date.now() - t0 });
    ok++;
    if (size > 0) {
      console.log(`[${i + 1}/${dirs.length}] OK  ${name} (${(size / 1024).toFixed(0)} KB, ${Date.now() - t0}ms)`);
    } else {
      console.log(`[${i + 1}/${dirs.length}] WARN  ${name} (no GLB written)`);
    }
  } catch (error: any) {
    const msg = (error.stderr || error.message || '').split('\n').filter(Boolean).slice(-3).join(' | ');
    results.push({ name, status: 'fail', error: msg, durationMs: Date.now() - t0 });
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
