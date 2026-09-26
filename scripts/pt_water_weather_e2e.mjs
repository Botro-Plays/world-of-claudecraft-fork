// PT water + weather E2E (Phase 6D, dev harness, offline world).
//
// Verifies the restored smMATERIAL stage data end-to-end in a real browser:
//   - TextureFormState UV scroll animates fore-2's river (mat 122/123
//     [SCROLL3, SCROLL5]) and waterfall foam (mat 501 [SCROLL5]) - canvas
//     pixel diff over the authored faces, plus the live-stage shader keys.
//   - SMMAT_BLEND_LAMP (blendType 4) binds THREE additive blending on the
//     waterfall foam instead of ordinary alpha.
//   - WoC ambient precipitation never leaks into the PT band: the source
//     PT client runs no ambient biome weather at all (rain is a
//     FOREST-field server event; snow is not authored), and this build has
//     no weather-event server, so every PT field probes intensity ~= 0 -
//     Ricarten, bamboo forest, desert, ruin, and dungeon alike.
//   - Normal non-PT WoC weather is untouched: the Frostveil vantage still
//     snows once the player stands back on WoC land.
//   - No texture 404s, no shader/console errors throughout.
//
// Usage: npm run dev on :5173, then `node scripts/pt_water_weather_e2e.mjs`.

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
  await page.screenshot({ path: 'tmp/pt6d_boot_fail.png' });
  await browser.close();
  process.exit(1);
}
await sleep(1500);
await page.keyboard.press('Escape');
await dismissEntryOverlays(page);

await page.evaluate(() => {
  const g = () => window.__game;
  window.__pt6d = {
    active() { return g()?.ptActiveMap?.()?.id ?? null; },
    materials(id) {
      const out = [];
      g().renderer.scene.traverse((o) => {
        if (!o.isMesh || !o.name.startsWith(`pt-${id}`)) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          out.push({
            mesh: o.name,
            mat: m.name,
            cacheKey:
              typeof m.customProgramCacheKey === 'function'
                ? m.customProgramCacheKey()
                : null,
            blending: m.blending,
            transparent: !!m.transparent,
            hasMap: !!m.map,
          });
        }
      });
      return out;
    },
    // World-space AABB of one material group inside a named mesh: walks the
    // geometry group's index ranges and transforms each vertex by the
    // mesh's world matrix (column-major Matrix4 elements).
    matWorldBox(meshName, matName) {
      const o = g().renderer.scene.getObjectByName(meshName);
      if (!o) return null;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let idx = -1;
      for (let i = 0; i < mats.length; i++) if (mats[i].name === matName) idx = i;
      if (idx < 0) return null;
      o.updateWorldMatrix(true, false);
      const e = o.matrixWorld.elements;
      const pos = o.geometry.getAttribute('position');
      const groups = o.geometry.groups.filter((gg) => gg.materialIndex === idx);
      const box = { minX: 1e30, minY: 1e30, minZ: 1e30, maxX: -1e30, maxY: -1e30, maxZ: -1e30, n: 0 };
      for (const gg of groups) {
        for (let i = gg.start; i < gg.start + gg.count; i += 3) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
          const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
          const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
          box.minX = Math.min(box.minX, wx); box.maxX = Math.max(box.maxX, wx);
          box.minY = Math.min(box.minY, wy); box.maxY = Math.max(box.maxY, wy);
          box.minZ = Math.min(box.minZ, wz); box.maxZ = Math.max(box.maxZ, wz);
          box.n++;
        }
      }
      return box;
    },
    placeAt(x, y, z, facing = 0) {
      const p = g().sim.player;
      p.pos.x = x; p.pos.y = y; p.pos.z = z;
      p.prevPos.x = x; p.prevPos.y = y; p.prevPos.z = z;
      p.facing = facing; p.velX = 0; p.velY = 0; p.velZ = 0;
      g().input.camYaw = facing;
    },
    ground(x, z) { return g().ptField()?.groundHeight(x, z) ?? null; },
    weather() {
      const w = g().renderer.weather;
      return { intensity: w.intensity, visible: w.points.visible, mode: w.mode };
    },
  };
});

async function installMap(id) {
  await page.keyboard.press('Enter');
  await page.keyboard.type(`/ptmap ${id}`);
  await page.keyboard.press('Enter');
  const flipped = await page
    .waitForFunction((mid) => window.__pt6d.active() === mid, { timeout: 60000 }, id)
    .then(() => true)
    .catch(() => false);
  if (!flipped) return false;
  return page
    .waitForFunction(
      (mid) => window.__pt6d.materials(mid).length > 0,
      { timeout: 90000 },
      id,
    )
    .then(() => true)
    .catch(() => false);
}

// Precipitation probe: sample the eased intensity after a settle. PT fields
// must stay suppressed (intensity ~0, cloud hidden); WoC weathered land
// climbs past LIVE_INTENSITY.
async function weatherAt(label, settleMs = 4500) {
  await sleep(settleMs);
  return page.evaluate(() => window.__pt6d.weather()).then((w) => {
    check(`${label}: no WoC ambient precipitation`, w.intensity < 0.05 && !w.visible,
      `intensity=${w.intensity.toFixed(3)} visible=${w.visible} mode=${w.mode}`);
    return w;
  });
}

async function canvasShotDiff(label, gapMs = 1200) {
  const el = await page.$('#game-canvas');
  const a = await el.screenshot({ path: `tmp/pt6d_${label}_t0.png` });
  await sleep(gapMs);
  const b = await el.screenshot({ path: `tmp/pt6d_${label}_t1.png` });
  if (a.equals(b)) return 0;
  let diff = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) diff++;
  return diff;
}

// ---------------------------------------------------------------------------
console.log('\n=== ricarten: no precipitation, ambient lighting intact ===');
{
  const ok = await installMap('ricarten');
  check('/ptmap ricarten installed', ok);
  await sleep(2000);
  const mats = await page.evaluate(() => window.__pt6d.materials('ricarten'));
  check('ricarten terrain materials render', mats.length > 50, `${mats.length}`);
  const textured = mats.filter((m) => m.mesh === 'pt-ricarten-solid' && m.hasMap).length;
  check('ricarten materials textured (ambient lit, not blank)',
    textured > 50, `${textured} textured`);
  await weatherAt('ricarten');
  await page.screenshot({ path: 'tmp/pt6d_ricarten.png' });
}

console.log('\n=== fore-2: river + waterfall scroll, LAMP additive foam ===');
{
  const ok = await installMap('fore-2');
  check('/ptmap fore-2 installed', ok);
  await sleep(2500);
  const mats = await page.evaluate(() => window.__pt6d.materials('fore-2'));
  const water = mats.filter((m) => m.mesh === 'pt-fore-2-water');
  const m122 = water.find((m) => m.mat === 'pt-mat-122');
  const m123 = water.find((m) => m.mat === 'pt-mat-123');
  const m501 = water.find((m) => m.mat === 'pt-mat-501');
  check('river material 123 bound on the water mesh', !!m123);
  check('waterfall sheet material 122 bound', !!m122);
  check('waterfall foam material 501 bound', !!m501);
  // Live scroll stages reach the shader as a -s<scroll>o<ops> key suffix.
  check('mat 123 scrolls both stages [SCROLL3, SCROLL5]',
    !!m123 && m123.cacheKey === 'pt-flat-s7.9o0.0x', `${m123?.cacheKey}`);
  check('mat 122 scrolls both stages [SCROLL3, SCROLL5]',
    !!m122 && m122.cacheKey === 'pt-flat-s7.9o0.0x', `${m122?.cacheKey}`);
  check('mat 501 scrolls stage 0 [SCROLL5]',
    !!m501 && m501.cacheKey === 'pt-flat-s9.0o0.0', `${m501?.cacheKey}`);
  // SMMAT_BLEND_LAMP = THREE.AdditiveBlending (2), forced translucent.
  check('mat 501 additive LAMP blending', !!m501 && m501.blending === 2 && m501.transparent,
    `blending=${m501?.blending} transparent=${m501?.transparent}`);

  // Aim the camera at the authored waterfall faces: the mesh's material
  // groups carry the geometry; take the mat-501 (foam bands) world box and
  // stand the player so the follow camera frames it.
  const falls = await page.evaluate(
    () => window.__pt6d.matWorldBox('pt-fore-2-water', 'pt-mat-501'));
  check('foam faces occupy authored geometry', !!falls && falls.n > 100,
    falls ? `${falls.n} verts` : 'no box');
  if (falls) {
    const cx = (falls.minX + falls.maxX) / 2;
    const cy = (falls.minY + falls.maxY) / 2;
    const cz = (falls.minZ + falls.maxZ) / 2;
    // Stand ~14 yd south of the bands, on the ground, facing them.
    const px = cx, pz = cz + 14;
    const gy = await page.evaluate((x, z) => window.__pt6d.ground(x, z), px, pz);
    const yaw = Math.atan2(cx - px, cz - pz);
    await page.evaluate(
      (x, y, z, f) => window.__pt6d.placeAt(x, y, z, f),
      px, (gy ?? cy) + 2, pz, yaw,
    );
    await page.evaluate((p, d) => {
      window.__game.input.camPitch = p; window.__game.input.camDist = d;
    }, 0.15, 16);
    await sleep(1200);
    const diff = await canvasShotDiff('fore2_falls', 1400);
    check('waterfall + foam visibly animate', diff > 0, `${diff} diff bytes`);
  }

  // The river: mat-123 world box, stand over it, camera pitched down.
  const river = await page.evaluate(
    () => window.__pt6d.matWorldBox('pt-fore-2-water', 'pt-mat-123'));
  check('river faces occupy authored geometry', !!river && river.n > 400,
    river ? `${river.n} verts` : 'no box');
  if (river) {
    const cx = (river.minX + river.maxX) / 2;
    const cz = (river.minZ + river.maxZ) / 2;
    const gy = await page.evaluate((x, z) => window.__pt6d.ground(x, z), cx, cz + 8);
    await page.evaluate(
      (x, y, z, f) => window.__pt6d.placeAt(x, y, z, f),
      cx, (gy ?? river.minY) + 1, cz + 8, Math.PI, // face -z over the water
    );
    await page.evaluate((p, d) => {
      window.__game.input.camPitch = p; window.__game.input.camDist = d;
    }, 0.8, 10);
    await sleep(1200);
    const diff = await canvasShotDiff('fore2_river', 1400);
    check('river visibly animates', diff > 0, `${diff} diff bytes`);
  }

  // Bamboo/foliage: wind-scripted materials still bound and textured.
  const windMats = mats.filter((m) => String(m.cacheKey).startsWith('pt-wind'));
  check('foliage wind materials bound + textured',
    windMats.length > 0 && windMats.every((m) => m.hasMap), `${windMats.length}`);
  // No white/untextured replacement: every rendered material kept its map.
  check('no untextured water materials', water.every((m) => m.hasMap));
  await weatherAt('fore-2');
  await page.screenshot({ path: 'tmp/pt6d_fore2.png' });
}

console.log('\n=== PT desert / ruin / dungeon: no WoC ambient precipitation ===');
for (const [id, label] of [['de-2', 'desert de-2'], ['lost', 'ruin lost'], ['dun-1', 'dungeon dun-1']]) {
  const ok = await installMap(id);
  check(`/ptmap ${id} installed`, ok);
  if (ok) await weatherAt(label);
}

console.log('\n=== WoC field: frost vantage still snows (weather boundary one-way) ===');
{
  // Teleport the player back onto ordinary WoC land in the Frostveil; the
  // PT-band boundary must not have disabled the normal biome weather path.
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.sim.player;
    p.pos.x = 100; p.pos.z = 1650;
    p.facing = -Math.PI / 2;
    g.input.camYaw = -Math.PI / 2;
    g.input.camPitch = 0.36;
    g.input.camDist = 46;
  });
  // Cross-world teleport raises the loading screen while the destination
  // streams; wait for it to settle before probing.
  const clear = () =>
    page.evaluate(
      () => !document.querySelector('#loading-screen')?.classList.contains('visible'),
    );
  const deadline = Date.now() + 120000;
  let streak = 0;
  while (streak < 5 && Date.now() < deadline) {
    streak = (await clear()) ? streak + 1 : 0;
    await sleep(1500);
  }
  const w = await page
    .waitForFunction(() => window.__pt6d.weather().intensity > 0.05, { timeout: 30000 })
    .then(() => page.evaluate(() => window.__pt6d.weather()))
    .catch(() => page.evaluate(() => window.__pt6d.weather()));
  check('frost vantage snows again', w.intensity > 0.05, `intensity=${w.intensity.toFixed(3)}`);
  check('snow mode selected', w.mode === 'snow', `mode=${w.mode}`);
  await page.screenshot({ path: 'tmp/pt6d_woc_frost.png' });
}

console.log('\n=== hygiene ===');
// Known dev-harness noise (same filter as pt_visual_e2e): the dev server's
// 502 API proxy with no backend, 404 favicon/media misses, and the
// offline world's non-PT character preloads. A shader compile failure or
// PT regression would surface as a REAL error outside this list.
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
check('no new page/console errors', realErrors.length === 0,
  realErrors.slice(0, 4).join(' | '));
check('no PT texture 404s', texture404s.length === 0,
  [...new Set(texture404s)].slice(0, 4).join(' | '));

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
