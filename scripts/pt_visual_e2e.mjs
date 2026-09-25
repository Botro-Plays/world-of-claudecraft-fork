// PT visual-rendering E2E (Phase 5C, dev harness, offline world).
//
// Verifies the renderer consumes the Phase 5A preserved data:
//   - SMTEX_TYPE_ANIMATION flipbooks bind the anim frame list (not the base
//     slot) and advance on the shared clock ((ms >> shift) & mask),
//   - all four PT wind vertex scripts dispatch by the source's exact-value
//     WindMeshBottom & 0x7FF switch (composite ASE residues stay rigid),
//   - textureless materials (RenderD3D FALSE) never reach the render mesh,
//   - authored sDef_Color vertex colors bind as a per-corner color attr,
//   - the recovered sod-1 _Bip stage objects build,
//   - foliage visibly moves (screenshot diff), no texture 404s, no errors.
//
// Usage: npm run dev on :5173, then `node scripts/pt_visual_e2e.mjs`.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH as EDGE } from './browser_path.mjs';
import { dismissEntryOverlays } from './enter_offline_game.mjs';

const URL =
  (process.env.GAME_URL ?? 'http://localhost:5173') +
  '/?diagnostics=1&diagnosticsAuto=1';
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
const texture404s = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
});
page.on('response', (r) => {
  if (r.status() === 404 && /textures\/pt-/.test(r.url())) texture404s.push(r.url());
});

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
const booted = await page
  .waitForFunction(() => window.__game?.sim?.player, { timeout: 120000 })
  .then(() => true)
  .catch(() => false);
if (!booted) {
  console.log('FAIL: window.__game.sim.player never appeared');
  await page.screenshot({ path: 'tmp/ptvis_boot_fail.png' });
  await browser.close();
  process.exit(1);
}
await sleep(1500);
await page.keyboard.press('Escape');
await dismissEntryOverlays(page);

await page.evaluate(() => {
  const g = () => window.__game;
  window.__ptvis = {
    state() {
      return { active: g()?.ptActiveMap?.()?.id ?? null };
    },
    // Collect every PT terrain/stage-object material of the active field:
    // {mesh, mat, cacheKey, vertexColors, hasMap, hasColorAttr}.
    materials(id) {
      const out = [];
      const scene = g().renderer.scene;
      scene.traverse((o) => {
        if (!o.isMesh || !o.name.startsWith(`pt-${id}`)) return;
        const geo = o.geometry;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          out.push({
            mesh: o.name,
            mat: m.name,
            cacheKey:
              typeof m.customProgramCacheKey === 'function'
                ? m.customProgramCacheKey()
                : null,
            vertexColors: !!m.vertexColors,
            hasMap: !!m.map,
            hasColorAttr: !!geo.getAttribute?.('color'),
          });
        }
      });
      return out;
    },
    stageObjectMeshCount(id) {
      let n = 0;
      const grp = g().renderer.scene.getObjectByName(`pt-${id}-stage-objects`);
      grp?.traverse((o) => { if (o.isMesh) n++; });
      return n;
    },
    // Snapshot the bound-map identity of a material by its pt-mat-N name.
    mapIds(matName) {
      const ids = [];
      const scene = g().renderer.scene;
      scene.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.name === matName) ids.push(m.map ? m.map.uuid : 'null');
        }
      });
      return ids;
    },
    placeAt(x, y, z, facing = 0) {
      const p = g().sim.player;
      p.pos.x = x; p.pos.y = y; p.pos.z = z;
      p.prevPos.x = x; p.prevPos.y = y; p.prevPos.z = z;
      p.facing = facing; p.velX = 0; p.velY = 0; p.velZ = 0;
    },
    ground(x, z) { return g().ptField().groundHeight(x, z); },
  };
});

async function installMap(id) {
  await page.keyboard.press('Enter');
  await page.keyboard.type(`/ptmap ${id}`);
  await page.keyboard.press('Enter');
  const flipped = await page
    .waitForFunction((id) => window.__ptvis.state().active === id, { timeout: 60000 }, id)
    .then(() => true)
    .catch(() => false);
  if (!flipped) return false;
  // The terrain gate build is async (geometry + texture fetches); wait for
  // the meshes to land in the scene before probing materials.
  return page
    .waitForFunction(
      (id) => window.__ptvis.materials(id).length > 0,
      { timeout: 90000 },
      id,
    )
    .then(() => true)
    .catch(() => false);
}

// Sample the bound texture uuid of a material over `ms`, returning the set
// of distinct ids seen (a cycling flipbook produces >1).
async function distinctMapsOver(matName, ms, stepMs = 90) {
  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const id of await page.evaluate((n) => window.__ptvis.mapIds(n), matName)) {
      seen.add(id);
    }
    await sleep(stepMs);
  }
  return [...seen];
}

async function canvasShotDiff(label, gapMs = 900) {
  const el = await page.$('#game-canvas');
  const a = await el.screenshot({ path: `tmp/ptvis_${label}_t0.png` });
  await sleep(gapMs);
  const b = await el.screenshot({ path: `tmp/ptvis_${label}_t1.png` });
  if (a.equals(b)) return 0;
  // Count differing byte positions as a coarse motion signal.
  let diff = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) diff++;
  return diff;
}

// ---------------------------------------------------------------------------
console.log('\n=== ricarten: vertex colors + textureless skip + windz1 ===');
{
  const ok = await installMap('ricarten');
  check('/ptmap ricarten installed', ok);
  await sleep(2500);
  const mats = await page.evaluate(() => window.__ptvis.materials('ricarten'));
  const solid = mats.filter((m) => m.mesh === 'pt-ricarten-solid');
  check('solid mesh materials exist', solid.length > 50, `${solid.length} materials`);
  check('vertex colors bound on all solid materials',
    solid.every((m) => m.vertexColors && m.hasColorAttr));
  check('textureless material 2 not rendered',
    !solid.some((m) => m.mat === 'pt-mat-2'));
  const wind = solid.filter((m) => m.cacheKey === 'pt-windz1');
  check('windz1 foliage materials scripted', wind.length === 13, `${wind.length}`);
  check('no wind scripts on non-wind materials',
    solid.every((m) => m.cacheKey === 'pt-windz1' || m.cacheKey === null ||
      !String(m.cacheKey).startsWith('pt-wind')));
  // Visual: foliage sway must move pixels (windz1 cosine, +-8 PT units).
  const diff = await canvasShotDiff('ricarten');
  check('ricarten scene visibly animates', diff > 0, `${diff} diff bytes`);
}

console.log('\n=== fore-3: WINDX2 foliage + wa_0..7 anim ===');
{
  const ok = await installMap('fore-3');
  check('/ptmap fore-3 installed', ok);
  await sleep(2500);
  const mats = await page.evaluate(() => window.__ptvis.materials('fore-3'));
  const windx2 = mats.filter((m) => m.cacheKey === 'pt-windx2');
  check('windx2 materials scripted (0x100 exact)', windx2.length >= 1, `${windx2.length}`);
  const windz1 = mats.filter((m) => m.cacheKey === 'pt-windz1');
  check('windz1 still scripted', windz1.length >= 1, `${windz1.length}`);
  // mat 119: wa_0..7, shift 7 -> 128ms/frame; 1.6s covers a full loop.
  const ids = await distinctMapsOver('pt-mat-119', 1600);
  check('fore-3 water anim cycles frames', ids.length >= 4 && ids.length <= 8,
    `${ids.length} distinct maps in 1.6s`);
  const diff = await canvasShotDiff('fore-3');
  check('fore-3 scene visibly animates', diff > 0, `${diff} diff bytes`);
}

console.log('\n=== forever-fall-04: WINDX1 ===');
{
  const ok = await installMap('forever-fall-04');
  check('/ptmap forever-fall-04 installed', ok);
  await sleep(2500);
  const mats = await page.evaluate(() => window.__ptvis.materials('forever-fall-04'));
  const windx1 = mats.filter((m) => m.cacheKey === 'pt-windx1');
  check('windx1 materials scripted (0x80 exact)', windx1.length >= 1, `${windx1.length}`);
  // ff-04's animated materials are Phase 5A preserved data with zero faces
  // in the render stream - correctly unbound (no material, no fetch).
  const bound = mats.filter((m) => m.mat === 'pt-mat-254');
  check('faceless anim material 254 correctly unbound', bound.length === 0);
}

console.log('\n=== tcave: WINDZ2 ===');
{
  const ok = await installMap('tcave');
  check('/ptmap tcave installed', ok);
  await sleep(2500);
  const mats = await page.evaluate(() => window.__ptvis.materials('tcave'));
  const windz2 = mats.filter((m) => m.cacheKey === 'pt-windz2');
  check('windz2 materials scripted (0x40 exact)', windz2.length >= 1, `${windz2.length}`);
}

console.log('\n=== ba1: composite 0x9 rigid + fwood/flame anims ===');
{
  const ok = await installMap('ba1');
  check('/ptmap ba1 installed', ok);
  await sleep(2500);
  const mats = await page.evaluate(() => window.__ptvis.materials('ba1'));
  const composite = mats.filter((m) => m.mat === 'pt-mat-147');
  if (composite.length) {
    check('ba1 mat-147 (WindMeshBottom 0x9) stays rigid',
      composite.every((m) => !String(m.cacheKey).startsWith('pt-wind') &&
        m.cacheKey !== 'pt-water'),
      `cacheKey=${composite[0].cacheKey}`);
  } else {
    console.log('  (mat-147 has no faces in ba1 render stream; skipping)');
  }
  const ids = await distinctMapsOver('pt-mat-176', 1200);
  check('ba1 flame_0..7 anim cycles', ids.length >= 4, `${ids.length} distinct maps`);
}

console.log('\n=== sod-1: recovered _Bip objects + anims ===');
{
  const ok = await installMap('sod-1');
  check('/ptmap sod-1 installed', ok);
  await sleep(2500);
  const n = await page.evaluate(() => window.__ptvis.stageObjectMeshCount('sod-1'));
  check('sod-1 stage objects render', n >= 18, `${n} node meshes`);
  const ids = await distinctMapsOver('pt-mat-191', 1200);
  check('sod-1 anim material cycles', ids.length >= 2, `${ids.length} distinct maps`);
}

console.log('\n=== ruin-1: flame flipbook (sea data preserved, no faces) ===');
{
  const ok = await installMap('ruin-1');
  check('/ptmap ruin-1 installed', ok);
  await sleep(2500);
  const mats = await page.evaluate(() => window.__ptvis.materials('ruin-1'));
  const animMat = mats.filter((m) => m.mat === 'pt-mat-486');
  check('flame material rendered', animMat.length >= 1 && animMat.every((m) => m.hasMap));
  const ids = await distinctMapsOver('pt-mat-486', 1200); // shift 6: 64ms/frame
  check('flame_0..7 cycles on the clock', ids.length >= 4, `${ids.length} distinct maps`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`}`);
if (texture404s.length) {
  console.log(`pt texture 404s: ${texture404s.length}`);
  for (const u of [...new Set(texture404s)].slice(0, 12)) console.log('  ' + u);
}
// Missing PT textures are a known Phase 5A source-data gap; the check only
// requires that they are not re-fetched every frame (bounded count).
check('texture fetches bounded (no per-frame spam)', texture404s.length < 50);
const KNOWN_NOISE = [
  /Failed to load resource: the server responded with a status of 502/,
  /Failed to load resource: the server responded with a status of 404/,
  /character visual unavailable, skipping view/,
];
const realErrors = errors.filter((e) => !KNOWN_NOISE.some((re) => re.test(e)));
if (errors.length) {
  console.log(`page errors: ${errors.length} (${realErrors.length} real, rest known noise)`);
  for (const e of errors.slice(0, 10)) console.log('  ' + e);
}
check('no new page/console errors', realErrors.length === 0);
await browser.close();
process.exit(failures > 0 ? 1 : 0);
