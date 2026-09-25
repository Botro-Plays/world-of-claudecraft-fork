// Generic PT map compiler CLI - extraction of the proven Ricarten pipeline.
//
// Usage:
//   node scripts/pt-port/pt_map.mjs catalog            list field.cpp registry
//   node scripts/pt-port/pt_map.mjs audit <map-id>     inspect map sources
//   node scripts/pt-port/pt_map.mjs compile <map-id>   emit generated modules
//   node scripts/pt-port/pt_map.mjs validate <map-id>  audit + drift check
//   node scripts/pt-port/pt_map.mjs textures <map-id>  convert map textures
//   node scripts/pt-port/pt_map.mjs compile-all        bulk-convert all fields
//   node scripts/pt-port/pt_map.mjs textures-all       bulk texture conversion
//
// All behavior is manifest-driven (scripts/pt-port/maps/<id>.mjs); there are
// no per-map code paths in this file. Output is deterministic: no timestamps,
// no machine paths, stable ordering everywhere.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ptClientDir, ptClientPath } from './lib/pt_client.mjs';
import { loadFieldRegistry } from './lib/field_registry.mjs';
import {
  buildPerFaceUVs,
  buildTextureManifest,
  classifyAndBuild,
  emitModule,
  parseSmd,
  waterMaterialSet,
} from './lib/stage_smd.mjs';
import { emitModule as emitStageModule, parsePat } from './lib/pat_smd.mjs';

const MAPS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'maps');
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

async function loadManifest(id) {
  const path = join(MAPS_DIR, `${id}.mjs`);
  if (existsSync(path)) {
    const mod = await import(pathToFileURL(path).href);
    return mod.default;
  }
  // Fall back to a registry-derived manifest so single-map commands work
  // for every field.cpp entry, not just hand-written manifests.
  const all = await manifestsForAll();
  const found = all.find((m) => m.id === id || String(m.fieldIndex) === String(id));
  if (!found) {
    throw new Error(`unknown map '${id}' (try 'catalog' for the field list)`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Manifest derivation from the field.cpp registry (bulk conversion)
// ---------------------------------------------------------------------------

// The authored registry gives asePath/mapName/stageObjects/centerPos/
// startPoints/gates for every field. The shipped client stores the compiled
// equivalents as .smd files under Field/<dir>/ with inconsistent casing
// ('ricarten\\village-2.ase' -> 'Field/Ricarten/village-2.smd'), so paths are
// resolved case-insensitively against real directory listings. Missing
// sources are recorded, never invented.

const dirListingCache = new Map();
function listDirCaseInsensitive(absDir) {
  if (!dirListingCache.has(absDir)) {
    dirListingCache.set(absDir, existsSync(absDir) ? readdirSync(absDir) : []);
  }
  return dirListingCache.get(absDir);
}

// Resolve '<dir>/<file>' under client/Field, case-insensitively.
// Returns the client-relative resolved path or null.
function resolveFieldAsset(dirName, fileName) {
  const fieldsRoot = ptClientPath('Field');
  const dir = listDirCaseInsensitive(fieldsRoot).find(
    (d) => d.toLowerCase() === dirName.toLowerCase(),
  );
  if (!dir) return null;
  const file = listDirCaseInsensitive(join(fieldsRoot, dir)).find(
    (f) => f.toLowerCase() === fileName.toLowerCase(),
  );
  return file ? `Field/${dir}/${file}` : null;
}

function sanitizeId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function deriveManifest(entry, takenIds) {
  const aseDir = dirname(entry.asePath);
  const stem = basename(entry.asePath).replace(/\.[^.]*$/, '');
  let id = sanitizeId(entry.mapName || stem);
  if (takenIds.has(id)) id = `${id}-f${entry.fieldIndex}`;
  takenIds.add(id);

  const smdPath = resolveFieldAsset(aseDir, `${stem}.smd`);

  const stageFiles = [];
  const stageMissing = [];
  let stageDir = null;
  for (const obj of entry.stageObjects) {
    const objDir = dirname(obj.path);
    const objStem = basename(obj.path).replace(/\.[^.]*$/, '');
    const resolved = resolveFieldAsset(objDir, `${objStem}.smd`);
    if (resolved) {
      stageDir = dirname(resolved);
      stageFiles.push(basename(resolved));
    } else {
      stageMissing.push(obj.path);
    }
  }

  const minimap = entry.mapName
    ? resolveFieldAsset('map', `${entry.mapName}.tga`) ?? `Field/map/${entry.mapName}.tga`
    : null;

  const texturesDir = smdPath ? dirname(smdPath) : `Field/${aseDir}`;

  return {
    id,
    fieldIndex: entry.fieldIndex,
    mapName: entry.mapName,
    state: entry.state,
    smdPath: smdPath ?? `Field/${aseDir}/${stem}.smd`,
    fieldOut: `generated/pt-maps/${id}/field.generated.ts`,
    sourceLabel: `client/${smdPath ?? `Field/${aseDir}/${stem}.smd`}`,
    stageObjects: {
      dir: stageDir ?? `Field/${aseDir}`,
      files: stageFiles,
      missing: stageMissing,
      out: `generated/pt-maps/${id}/stage_objects.generated.ts`,
    },
    texturesDir,
    textureOutDir: `public/textures/pt-${id}`,
    water: { rule: 'translucent' },
    minimap,
    centerPos: entry.centerPos,
    startPoints: entry.startPoints,
    gates: entry.gates,
    derived: true,
  };
}

// Registry-driven manifest list: a maps/<id>.mjs override keyed on fieldIndex
// wins (Ricarten keeps its committed output paths); everything else is
// derived from field.cpp.
async function manifestsForAll() {
  const registry = loadFieldRegistry();
  const byIndex = new Map();
  for (const f of readdirSync(MAPS_DIR).filter((f) => f.endsWith('.mjs'))) {
    const m = (await import(pathToFileURL(join(MAPS_DIR, f)).href)).default;
    if (m && m.fieldIndex !== undefined) byIndex.set(m.fieldIndex, m);
  }
  const takenIds = new Set([...byIndex.values()].map((m) => m.id));
  const all = registry.map((e) => byIndex.get(e.fieldIndex) ?? deriveManifest(e, takenIds));
  // Second pass: every gate record also resolves its destination package id
  // from the registration table, so runtime code never re-derives
  // fieldIndex -> package id itself. A gate whose targetIndex points outside
  // the registered set gets targetId: null (kept, not dropped - the record
  // is authored data either way).
  const byFieldIndex = new Map(all.map((m) => [m.fieldIndex, m.id]));
  for (const m of all) {
    for (const g of m.gates ?? []) {
      g.targetId = byFieldIndex.get(g.targetIndex) ?? null;
    }
  }
  return all;
}

// ---------------------------------------------------------------------------
// Compile (pure: returns generated source text, does not write)
// ---------------------------------------------------------------------------

function compileField(manifest) {
  const smd = parseSmd(readFileSync(ptClientPath(manifest.smdPath)));
  const water = waterMaterialSet(smd.materials, manifest.water);
  const built = classifyAndBuild(smd, water);
  const uvs = buildPerFaceUVs(smd);
  const textureManifest = buildTextureManifest(smd);
  const source = emitModule(
    smd,
    built,
    uvs,
    textureManifest,
    manifest.sourceLabel ?? `client/${manifest.smdPath}`,
  );
  return { smd, built, water, textureManifest, source };
}

// Parse one stage-object file. Stage-format SMDs (v0.7x) are legitimately
// registered via AddStageObject on some maps (e.g. Iron/iron3-ani6.smd) and
// _Bip files carry an extra physique/bone block this parser doesn't model -
// both are reported as skipped, never fatal, per the bulk-conversion rule
// "report, don't repair".
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

function compileStageObjects(manifest) {
  const spec = manifest.stageObjects;
  if (!spec || spec.files.length === 0) return null;
  const skipped = [];
  const objects = spec.files
    .map((file) => tryParsePat(readFileSync(join(ptClientPath(spec.dir), file)), file, skipped))
    .filter(Boolean);
  if (objects.length === 0) return { objects, skipped, source: null };
  // Label matches the legacy emitter: "v-ani01..v-ani14.smd" (first stem +
  // last filename).
  const firstStem = basename(spec.files[0], extname(spec.files[0]));
  const label = `client/${spec.dir}/${firstStem}..${spec.files[spec.files.length - 1]} (smPAT3D, SMD Model data Ver 0.62).`;
  return { objects, skipped, source: emitStageModule(objects, label) };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

function auditMap(manifest) {
  const warnings = [];
  const errors = [];
  const info = [];
  const log = (s) => info.push(s);
  const warn = (s) => warnings.push(s);
  const err = (s) => errors.push(s);

  log(`MAP`);
  log(`  id=${manifest.id} fieldIndex=${manifest.fieldIndex} name=${manifest.mapName ?? '(none)'}`);
  log(`  state=${manifest.state ?? '?'} smd=${manifest.smdPath}`);

  if (!existsSync(ptClientPath(manifest.smdPath))) {
    err(`missing terrain SMD: ${manifest.smdPath}`);
    return finish();
  }
  const smd = parseSmd(readFileSync(ptClientPath(manifest.smdPath)));
  log(`SMD`);
  log(`  v${smd.version} vertices=${smd.nVertex} faces=${smd.nFace} materials=${smd.materials.length}`);

  const water = waterMaterialSet(smd.materials, manifest.water);
  const built = classifyAndBuild(smd, water);
  const textureManifest = buildTextureManifest(smd);

  log(`MATERIALS`);
  const inUse = smd.materials.filter((m) => m.inUse);
  const translucent = inUse.filter((m) => m.transparency > 0.1);
  log(`  inUse=${inUse.length} walkable=${inUse.filter((m) => m.isWalkable).length} translucent=${translucent.length}`);
  for (const m of translucent) {
    if (!water.has(m.index)) {
      warn(`translucent material ${m.index} (t=${m.transparency.toFixed(2)}) not classified as water - check rule '${manifest.water?.rule ?? 'translucent'}'`);
    }
  }
  for (let fi = 0; fi < smd.nFace; fi++) {
    if (smd.faceMat[fi] >= smd.materials.length) {
      err(`face ${fi} references invalid material ${smd.faceMat[fi]}`);
      break;
    }
  }

  log(`TEXTURES`);
  const texDir = manifest.texturesDir ? ptClientPath(manifest.texturesDir) : null;
  const available = new Map();
  if (texDir && existsSync(texDir)) {
    for (const f of readdirSync(texDir)) available.set(f.toLowerCase(), f);
  }
  const stems = new Map();
  let texMissing = 0;
  for (const tex of textureManifest) {
    const file = basename(tex.name.replace(/\\/g, '/')).toLowerCase();
    const stem = basename(file, extname(file));
    if (stems.has(stem) && stems.get(stem) !== file) {
      warn(`duplicate texture stem '${stem}': ${stems.get(stem)} vs ${file}`);
    }
    stems.set(stem, file);
    // Missing texture is a WARNING, not an error: the shipped PT client
    // itself lacks some referenced files (e.g. Ricarten tem_wall04.bmp) and
    // still runs; this is a source anomaly, not a compiler failure.
    if (texDir && !available.has(file)) {
      warn(`missing texture: ${tex.name} (materials ${tex.materialIndices.join(',')})`);
      texMissing++;
    }
  }
  log(`  referenced=${textureManifest.length} missing=${texMissing}`);

  // Unresolved UVs: textured material but no TexLink on the face.
  let unresolvedUv = 0;
  for (let fi = 0; fi < smd.nFace; fi++) {
    const mi = smd.faceMat[fi];
    const mat = smd.materials[mi];
    if (mat && mat.inUse && mat.textureNames.length > 0 && smd.faceTexLinkIdx[fi] < 0) {
      unresolvedUv++;
    }
  }
  if (unresolvedUv > 0) warn(`${unresolvedUv} textured faces have no TexLink (UVs emitted as 0)`);

  log(`COLLISION`);
  let multiFace = 0;
  for (let i = 0; i < built.cellCounts.length; i++) {
    if (built.cellCounts[i] > 1) multiFace++;
  }
  log(`  walkable=${built.nWalkable} water=${built.waterFaceIndices.length} decorative=${built.decorativeFaceIndices.length}`);
  log(`  stageArea cells-with-faces=${built.cellOffsets.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0)} multi-face-cells=${multiFace}`);

  log(`WATER`);
  log(`  rule=${manifest.water?.rule ?? 'translucent'} materials=[${[...water].sort((a, b) => a - b).join(',')}]`);

  log(`STAGE OBJECTS`);
  const spec = manifest.stageObjects;
  for (const missing of spec?.missing ?? []) {
    warn(`stage object declared in field.cpp but no .smd found: ${missing}`);
  }
  if (!spec || spec.files.length === 0) {
    log(`  none ${spec?.missing?.length ? `(${spec.missing.length} missing)` : 'declared'}`);
  } else {
    for (const file of spec.files) {
      const p = join(ptClientPath(spec.dir), file);
      if (!existsSync(p)) {
        err(`missing stage object: ${spec.dir}/${file}`);
        continue;
      }
      const skipped = [];
      const pat = tryParsePat(readFileSync(p), file, skipped);
      for (const s of skipped) warn(`stage object skipped: ${s}`);
      if (!pat) continue;
      const animated = pat.nodes.filter((n) => n.rotCnt > 0 || n.posCnt > 0 || n.scaleCnt > 0);
      log(`  ${file}: nodes=${pat.nodes.length} animated=${animated.length} maxFrame=${pat.maxFrame}`);
      // Stage-object SMDs reference many texture slots the client never
      // shipped (PT resolves them elsewhere or ignores the slot). Report
      // once per missing name, not per material.
      const missing = new Set();
      for (const mat of pat.materials) {
        if (!mat.inUse) continue;
        for (const texName of mat.textureNames ?? []) {
          const f = basename(texName.replace(/\\/g, '/')).toLowerCase();
          // Skip degenerate names (e.g. a bare 'field\ricarten\' slot).
          if (f.includes('.') && texDir && !available.has(f)) missing.add(f);
        }
      }
      for (const f of [...missing].sort()) {
        warn(`stage object ${file}: texture '${f}' not found in ${manifest.texturesDir}`);
      }
    }
  }

  log(`MINIMAP`);
  if (!manifest.minimap) {
    warn('no minimap declared');
  } else if (!existsSync(ptClientPath(manifest.minimap))) {
    warn(`minimap not found: ${manifest.minimap}`);
  } else {
    log(`  ${manifest.minimap}`);
  }

  log(`BOUNDS`);
  const b = smd.bounds;
  log(`  pt x=[${b.minX},${b.maxX}] y=[${b.minY},${b.maxY}] z=[${b.minZ},${b.maxZ}]`);
  if (!(b.maxX > b.minX && b.maxZ > b.minZ)) err('degenerate map bounds');

  log(`START POINTS`);
  for (const [x, z] of manifest.startPoints ?? []) {
    const inside = x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
    log(`  (${x},${z}) ${inside ? 'in-bounds' : 'OUT OF BOUNDS'}`);
    if (!inside) warn(`start point (${x},${z}) outside map bounds`);
  }
  if (manifest.centerPos) log(`  centerPos=(${manifest.centerPos[0]},${manifest.centerPos[1]})`);

  log(`GATES`);
  for (const g of manifest.gates ?? []) {
    log(`  -> field ${g.targetIndex} at (${g.x},${g.z},${g.y})`);
  }
  if (!manifest.gates?.length) log(`  none`);

  function finish() {
    const report = info.join('\n');
    const status = errors.length > 0 ? 'ERROR' : warnings.length > 0 ? 'WARNING' : 'PASS';
    return { report, warnings, errors, status };
  }
  return finish();
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdCatalog() {
  const fields = loadFieldRegistry();
  console.log(`PT field registry (PT-Source/field.cpp): ${fields.length} fields`);
  for (const f of fields) {
    console.log(
      `  [${String(f.fieldIndex).padStart(2)}] ${f.asePath}  name=${f.mapName ?? '-'} ` +
        `state=${f.state ?? '-'} objs=${f.stageObjects.length} starts=${f.startPoints.length} gates=${f.gates.length}`,
    );
  }
}

async function cmdAudit(id) {
  const manifest = await loadManifest(id);
  const { report, warnings, errors, status } = auditMap(manifest);
  console.log(report);
  if (warnings.length) console.log(`WARNINGS\n${warnings.map((w) => `  ${w}`).join('\n')}`);
  if (errors.length) console.log(`ERRORS\n${errors.map((e) => `  ${e}`).join('\n')}`);
  console.log(`STATUS: ${status}`);
  process.exitCode = errors.length > 0 ? 1 : 0;
}

async function cmdCompile(id, { write = true } = {}) {
  const manifest = await loadManifest(id);
  const results = {};

  const field = compileField(manifest);
  results.field = { path: resolve(REPO_ROOT, manifest.fieldOut), source: field.source };
  if (write) {
    mkdirSync(dirname(results.field.path), { recursive: true });
    writeFileSync(results.field.path, field.source);
  }
  console.log(
    `field: ${smdSummary(field.smd)} -> ${manifest.fieldOut} ` +
      `(walkable=${field.built.nWalkable} water=${field.built.waterFaceIndices.length} ` +
      `decorative=${field.built.decorativeFaceIndices.length} textures=${field.textureManifest.length})`,
  );

  const stage = compileStageObjects(manifest);
  if (stage?.skipped?.length) {
    for (const s of stage.skipped) console.log(`  stage object skipped: ${s}`);
  }
  if (stage?.source) {
    results.stage = { path: resolve(REPO_ROOT, manifest.stageObjects.out), source: stage.source };
    if (write) {
      mkdirSync(dirname(results.stage.path), { recursive: true });
      writeFileSync(results.stage.path, stage.source);
    }
    console.log(
      `stage objects: ${stage.objects.length} files -> ${manifest.stageObjects.out}`,
    );
  }
  return results;
}

function smdSummary(smd) {
  return `v${smd.version} v=${smd.nVertex} f=${smd.nFace}`;
}

async function cmdValidate(id) {
  const manifest = await loadManifest(id);
  const audit = auditMap(manifest);
  console.log(audit.report);
  if (audit.warnings.length) console.log(`WARNINGS\n${audit.warnings.map((w) => `  ${w}`).join('\n')}`);
  if (audit.errors.length) console.log(`ERRORS\n${audit.errors.map((e) => `  ${e}`).join('\n')}`);

  // Drift check: in-memory recompile vs on-disk generated modules.
  let drift = false;
  const compiled = await cmdCompile(id, { write: false });
  for (const [kind, r] of Object.entries(compiled)) {
    if (!existsSync(r.path)) {
      console.log(`DRIFT: ${kind} output missing on disk: ${r.path}`);
      drift = true;
      continue;
    }
    const disk = readFileSync(r.path, 'utf8');
    if (disk === r.source) {
      console.log(`drift check ${kind}: IDENTICAL`);
    } else {
      const a = disk.split('\n');
      const b = r.source.split('\n');
      const diffs = [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) diffs.push(i + 1);
        if (diffs.length > 10) break;
      }
      console.log(`drift check ${kind}: DIFFERS at lines ${diffs.join(',')}${diffs.length > 10 ? '...' : ''}`);
      drift = true;
    }
  }
  const status = audit.errors.length || drift ? 'ERROR' : audit.warnings.length ? 'WARNING' : 'PASS';
  console.log(`STATUS: ${status}`);
  process.exitCode = status === 'ERROR' ? 1 : 0;
}

async function cmdCompileAll() {
  const manifests = await manifestsForAll();
  const rows = [];
  for (const m of manifests) {
    const t0 = Date.now();
    const row = {
      fieldIndex: m.fieldIndex,
      id: m.id,
      name: m.mapName ?? '-',
      status: 'PASS',
      warnings: [],
      errors: [],
      ms: 0,
    };
    try {
      const audit = auditMap(m);
      row.warnings = audit.warnings;
      row.errors = audit.errors;
      if (audit.errors.length === 0) {
        // Determinism: compile twice, require byte-identical source.
        const f1 = compileField(m);
        const f2 = compileField(m);
        if (f1.source !== f2.source) {
          row.errors.push('non-deterministic field output');
        } else {
          const fieldPath = resolve(REPO_ROOT, m.fieldOut);
          mkdirSync(dirname(fieldPath), { recursive: true });
          writeFileSync(fieldPath, f1.source);
          row.field = { vertices: f1.smd.nVertex, faces: f1.smd.nFace, bytes: f1.source.length };
        }
        const s1 = compileStageObjects(m);
        if (s1) {
          // Audit already reports these; don't count them twice.
          for (const s of s1.skipped) {
            const w = `stage object skipped: ${s}`;
            if (!row.warnings.includes(w)) row.warnings.push(w);
          }
          if (s1.source) {
            const s2 = compileStageObjects(m);
            if (s1.source !== s2.source) {
              row.errors.push('non-deterministic stage-object output');
            } else {
              const stagePath = resolve(REPO_ROOT, m.stageObjects.out);
              mkdirSync(dirname(stagePath), { recursive: true });
              writeFileSync(stagePath, s1.source);
            }
          }
          row.stageObjects = s1.objects.length;
        }
      }
    } catch (e) {
      row.errors.push(`compile exception: ${e.message}`);
    }
    row.status = row.errors.length ? 'ERROR' : row.warnings.length ? 'WARN' : 'PASS';
    row.ms = Date.now() - t0;

    // Per-map package manifest: derived config + audit result + counts.
    // Deliberately no timestamps - the package must diff clean across runs.
    const pkgDir = resolve(REPO_ROOT, `generated/pt-maps/${m.id}`);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, 'manifest.json'),
      JSON.stringify({ manifest: m, status: row.status, warnings: row.warnings, errors: row.errors, field: row.field ?? null, stageObjects: row.stageObjects ?? 0 }, null, 2) + '\n',
    );

    rows.push(row);
    console.log(
      `  [${String(m.fieldIndex).padStart(2)}] ${m.id.padEnd(18)} ${row.status.padEnd(5)} ` +
        `${row.field ? `v=${row.field.vertices} f=${row.field.faces}` : '-'} ` +
        `objs=${row.stageObjects ?? 0} w=${row.warnings.length} e=${row.errors.length} ${row.ms}ms`,
    );
  }

  const pass = rows.filter((r) => r.status === 'PASS').length;
  const warn = rows.filter((r) => r.status === 'WARN').length;
  const error = rows.filter((r) => r.status === 'ERROR').length;
  console.log('');
  console.log('PT MAP BULK CONVERSION');
  console.log('======================');
  console.log(`Total fields: ${rows.length}`);
  console.log(`PASS: ${pass}  WARN: ${warn}  ERROR: ${error}`);
  for (const r of rows) {
    if (r.status === 'PASS') continue;
    console.log(`  field ${r.fieldIndex} ${r.id}: ${r.status}`);
    for (const e of r.errors) console.log(`    ERROR: ${e}`);
    for (const w of r.warnings.slice(0, 6)) console.log(`    warn: ${w}`);
    if (r.warnings.length > 6) console.log(`    ... +${r.warnings.length - 6} more warnings`);
  }
  process.exitCode = error > 0 ? 1 : 0;
  return rows;
}

async function cmdTexturesAll() {
  const manifests = await manifestsForAll();
  const { spawnSync } = await import('node:child_process');
  const script = join(dirname(fileURLToPath(import.meta.url)), 'convert_pt_textures.ts');
  const tsxCli = resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');
  const totals = { maps: 0, converted: 0, failed: 0, notFound: 0 };
  for (const m of manifests) {
    const genPath = resolve(REPO_ROOT, m.fieldOut);
    const texDir = ptClientPath(m.texturesDir);
    if (!existsSync(genPath) || !existsSync(texDir)) {
      console.log(`  [${m.fieldIndex}] ${m.id}: SKIP (missing ${!existsSync(genPath) ? 'generated module' : 'texture dir'})`);
      continue;
    }
    const r = spawnSync(
      process.execPath,
      [tsxCli, script, genPath, texDir, resolve(REPO_ROOT, m.textureOutDir)],
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
    console.log(
      `  [${String(m.fieldIndex).padStart(2)}] ${m.id.padEnd(18)} converted=${conv ?? '?'} failed=${fail ?? '?'} missing=${nf ?? '?'}`,
    );
    if (r.status !== 0) {
      console.log(`    converter exited ${r.status}`);
      if (r.stderr) console.log(r.stderr.split('\n').slice(0, 5).join('\n'));
    }
  }
  console.log(`textures: maps=${totals.maps} converted=${totals.converted} failed=${totals.failed} missing=${totals.notFound}`);
}

async function cmdTextures(id) {
  const manifest = await loadManifest(id);
  const { spawnSync } = await import('node:child_process');
  const script = join(dirname(fileURLToPath(import.meta.url)), 'convert_pt_textures.ts');
  // Invoke tsx's CLI under node directly - a shell:spawn would mis-split the
  // space in this repo's path ("PT Cross-Platform") on Windows.
  const tsxCli = resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');
  const r = spawnSync(
    process.execPath,
    [
      tsxCli, script,
      resolve(REPO_ROOT, manifest.fieldOut),
      ptClientPath(manifest.texturesDir),
      resolve(REPO_ROOT, manifest.textureOutDir),
    ],
    { stdio: 'inherit' },
  );
  process.exitCode = r.status ?? 1;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [cmd, arg] = process.argv.slice(2);
console.log(`pt-map: PT_CLIENT_DIR=${ptClientDir()}`);

switch (cmd) {
  case 'catalog':
    cmdCatalog();
    break;
  case 'audit':
    await cmdAudit(arg);
    break;
  case 'compile':
    await cmdCompile(arg);
    break;
  case 'validate':
    await cmdValidate(arg);
    break;
  case 'textures':
    await cmdTextures(arg);
    break;
  case 'compile-all':
    await cmdCompileAll();
    break;
  case 'textures-all':
    await cmdTexturesAll();
    break;
  default:
    console.log('usage: pt_map.mjs catalog | audit|compile|validate|textures <map-id> | compile-all | textures-all');
    process.exitCode = 1;
}
