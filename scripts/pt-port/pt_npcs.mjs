// Emits PT fixed-NPC + item generated modules from the MagicPT-Chinese
// server tree. Run from the repo root:
//
//   node scripts/pt-port/pt_npcs.mjs
//
// Field set = every generated/pt-maps/<id>/population.generated.ts module
// (the same closure the server registers in server/pt_fields.ts). Fields
// whose source field has no .spc still emit an explicit 'no-source' module
// so the runtime never has to guess whether data was dropped.
//
// Outputs:
//   generated/pt-maps/<field>/npcs.generated.ts    placement records (.spc)
//   generated/pt-maps/pt_npc_catalog.generated.ts  .npc definitions
//   generated/pt-maps/pt_item_catalog.generated.ts OpenItem definitions
//   generated/pt-maps/npcs.json                    coverage summary

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ptServerPath, ptServerExists } from './lib/pt_client.mjs';
import {
  buildFieldNpcs,
  emitFieldNpcsModule,
  emitItemCatalogModule,
  emitNpcCatalogModule,
  glbHeightUnits,
  parseOpenItem,
} from './lib/pt_npcs.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const genDir = join(repoRoot, 'generated', 'pt-maps');

function log(s) {
  console.log(s);
}

// fieldId + aseStem ride the generated population modules (data literals -
// regex reads are deliberate so this script needs no TS loader).
function generatedFields() {
  const out = [];
  for (const dir of readdirSync(genDir).sort()) {
    const pop = join(genDir, dir, 'population.generated.ts');
    if (!existsSync(pop)) continue;
    const src = readFileSync(pop, 'utf8');
    const fieldId = src.match(/fieldId:\s*"([^"]+)"/)?.[1];
    const aseStem = src.match(/aseStem:\s*"([^"]+)"/)?.[1];
    if (fieldId && aseStem) out.push({ fieldId, aseStem });
  }
  return out;
}

function main() {
  const fields = generatedFields();
  log(`fields: ${fields.length}`);
  if (!ptServerExists('GameServer')) {
    log('MagicPT server tree not found - emitting nothing.');
    return;
  }

  // .npc definitions are shared across fields: one parse per file.
  const npcDefs = new Map();
  const summary = { fields: {}, totals: { fields: 0, placed: 0, npcs: 0, defs: 0, items: 0 } };
  for (const { fieldId, aseStem } of fields) {
    const rec = buildFieldNpcs(fieldId, aseStem, npcDefs);
    writeFileSync(join(genDir, fieldId, 'npcs.generated.ts'), emitFieldNpcsModule(rec));
    summary.fields[fieldId] = {
      status: rec.status,
      npcs: rec.npcs.length,
      unresolved: rec.unresolved,
    };
    summary.totals.fields++;
    if (rec.status === 'placed') summary.totals.placed++;
    summary.totals.npcs += rec.npcs.length;
    log(`  ${fieldId}: ${rec.status} npcs=${rec.npcs.length}${rec.unresolved.length ? ` unresolved=${rec.unresolved.join(',')}` : ''}`);
  }
  summary.totals.defs = npcDefs.size;

  // Resolve each def's model to a served GLB path (public-relative URL):
  //   1. already-deployed creature GLBs (public/models/creatures/pt)
  //   2. converted NPC/monster GLBs staged for public/models/npc/pt
  //   3. unresolved (spawned anyway with the npc_villager fallback; listed
  //      in npcs.json)
  const creatureDir = join(repoRoot, 'public', 'models', 'creatures', 'pt');
  const npcConvDir = join(repoRoot, 'scripts', 'pt-port', 'converted', 'npc');
  const monConvDir = join(repoRoot, 'scripts', 'pt-port', 'converted', 'monster');
  const glbLookup = (dir) => {
    const m = new Map();
    if (existsSync(dir)) for (const f of readdirSync(dir)) m.set(f.toLowerCase(), f);
    return m;
  };
  const creatureGlbs = glbLookup(creatureDir);
  const npcGlbs = glbLookup(npcConvDir);
  const monGlbs = glbLookup(monConvDir);
  const measureGlb = (dir, file) => glbHeightUnits(readFileSync(join(dir, file)));
  // Files the caller stages into public/models/npc/pt (source dir -> name).
  summary.stagedGlbs = [];
  for (const def of npcDefs.values()) {
    if (!def || !def.model) continue;
    // File stem first, then the PT model-directory stem (converted GLBs are
    // named after the dir when the .ini filename differs from it).
    const wants = [`${def.model.toLowerCase()}.glb`];
    if (def.modelDir) wants.push(`${def.modelDir.toLowerCase()}.glb`);
    const pick = (table) => wants.map((w) => table.get(w)).find(Boolean) ?? null;
    const npcHit = pick(npcGlbs);
    const monHit = pick(monGlbs);
    const creatureHit = pick(creatureGlbs);
    if (npcHit) {
      def.glb = `models/npc/pt/${npcHit}`;
      def.height = measureGlb(npcConvDir, npcHit);
      summary.stagedGlbs.push({ file: npcHit, from: npcConvDir });
    } else if (monHit) {
      def.glb = `models/npc/pt/${monHit}`;
      def.height = measureGlb(monConvDir, monHit);
      summary.stagedGlbs.push({ file: monHit, from: monConvDir });
    } else if (creatureHit) {
      def.glb = `models/creatures/pt/${creatureHit}`;
      def.height = measureGlb(creatureDir, creatureHit);
    } else {
      def.glb = null;
    }
  }
  summary.stagedGlbs.sort((a, b) => (a.file < b.file ? -1 : 1));

  // Stage the referenced converted GLBs into public/models/npc/pt (the same
  // copy-model the map pipeline uses for textures under public/textures).
  const outDir = join(repoRoot, 'public', 'models', 'npc', 'pt');
  mkdirSync(outDir, { recursive: true });
  for (const { file, from } of summary.stagedGlbs) {
    copyFileSync(join(from, file), join(outDir, file));
  }

  // Full OpenItem catalog (shop lists join on it, and future drops/rewards
  // read the same table - emitting all of it keeps the catalog complete).
  const items = new Map();
  const openItemDir = ptServerPath('GameServer/OpenItem');
  if (existsSync(openItemDir)) {
    for (const f of readdirSync(openItemDir).sort()) {
      if (!f.toLowerCase().endsWith('.txt')) continue;
      const def = parseOpenItem(readFileSync(join(openItemDir, f)));
      if (def.code) items.set(def.code, def);
    }
  }
  summary.totals.items = items.size;
  log(`npc defs: ${npcDefs.size}  items: ${items.size}`);

  writeFileSync(join(genDir, 'pt_npc_catalog.generated.ts'), emitNpcCatalogModule(npcDefs));
  writeFileSync(join(genDir, 'pt_item_catalog.generated.ts'), emitItemCatalogModule(items));
  writeFileSync(join(genDir, 'npcs.json'), JSON.stringify(summary, null, 2) + '\n');
  log('done.');
}

main();
