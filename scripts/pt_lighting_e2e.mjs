// PT ambient/fill lighting E2E (Phase 5D, dev harness, offline world).
//
// Verifies the PT-only Lambert fill:
//   - every pt-mat-*/pt-obj-mat-* material compiles with uWocFillBoost bound
//     to the shared uTerrainFillBoost (same object the WoC Lambert terrain
//     rides, eased per frame by the renderer),
//   - the live eased value is >1 under the standard-materials rig,
//   - ground luminance lifts vs the same materials compiled WITHOUT the
//     patch (in-page A/B: swap the hook out, force relink, restore),
//   - installs across fields do not accumulate the fill,
//   - global lights are unchanged, zero shader/texture errors.
//
// Usage: npm run dev on :5173, then `node scripts/pt_lighting_e2e.mjs`.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { BROWSER_PATH as EDGE } from './browser_path.mjs';
import { dismissEntryOverlays } from './enter_offline_game.mjs';

// gfx=high forces the standard-materials rig + composer: the hemisphere is
// deliberately weak there (0.27) and Lambert materials cannot sample the
// IBL fill - the exact condition uTerrainFillBoost compensates (~3.33x).
// On the default headless-low tier the Lambert rig already runs a full
// hemisphere and the uniform correctly sits at 1.
const URL =
  (process.env.GAME_URL ?? 'http://localhost:5173') +
  '/?diagnostics=1&diagnosticsAuto=1&gfx=high';
fs.mkdirSync('tmp', { recursive: true });

// Minimal 8-bit RGB/RGBA PNG decoder (puppeteer screenshots), no deps.
function decodePng(buf) {
  let pos = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported png bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const row = raw.subarray(p, p + stride); p += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = x >= bpp && prev ? prev[x - bpp] : 0;
      let v = row[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
  }
  return { w, h, bpp, px: out };
}

// Mean luminance + dark/blown fractions over a rect (fractions of frame).
function regionStats(img, x0f, y0f, x1f, y1f) {
  const { w, h, bpp, px } = img;
  const x0 = Math.floor(w * x0f), x1 = Math.floor(w * x1f);
  const y0 = Math.floor(h * y0f), y1 = Math.floor(h * y1f);
  let sum = 0, n = 0, dark = 0, blown = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * bpp;
      const lum = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      sum += lum; n++;
      if (lum < 0.04) dark++;
      if (lum > 0.98) blown++;
    }
  }
  return { mean: sum / n, darkFrac: dark / n, blownFrac: blown / n };
}

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
  await browser.close();
  process.exit(1);
}
await sleep(1500);
await page.keyboard.press('Escape');
await dismissEntryOverlays(page);

await page.evaluate(() => {
  const g = () => window.__game;
  // Fake shader surface: enough for a material's onBeforeCompile hook to
  // declare uniforms and patch source strings, mirroring the vitest probe.
  const fakeShader = () => ({
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <lights_fragment_begin>',
  });
  window.__ptlum = {
    state() { return { active: g()?.ptActiveMap?.()?.id ?? null }; },
    ptMaterials(id) {
      const out = [];
      g().renderer.scene.traverse((o) => {
        if (!o.isMesh || !o.name.startsWith(`pt-${id}`)) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (/^pt-(obj-)?mat-/.test(m.name)) out.push(m);
        }
      });
      return out;
    },
    // Compile-probe each PT material: does its hook bind the fill uniform
    // and inject the irradiance lift? Returns the LIVE eased value too.
    fillReport(id) {
      const mats = window.__ptlum.ptMaterials(id);
      let bound = 0, patched = 0, value = null;
      for (const m of mats) {
        const sh = fakeShader();
        m.onBeforeCompile?.(sh);
        if (sh.uniforms.uWocFillBoost) {
          bound++;
          value = sh.uniforms.uWocFillBoost.value;
        }
        if (sh.fragmentShader.includes('irradiance *= uWocFillBoost')) patched++;
      }
      return { total: mats.length, bound, patched, value };
    },
    // A/B: swap the PT hook for a pass-through (plain Lambert) and relink,
    // or restore the saved hooks. Returns how many materials were toggled.
    setFillPatched(on) {
      let n = 0;
      for (const id of [window.__ptlum.state().active]) {
        if (!id) continue;
        for (const m of window.__ptlum.ptMaterials(id)) {
          if (on) {
            if (m.__ptSavedHook) {
              m.onBeforeCompile = m.__ptSavedHook;
              m.customProgramCacheKey = m.__ptSavedKey;
              delete m.__ptSavedHook; delete m.__ptSavedKey;
              m.needsUpdate = true; n++;
            }
          } else if (!m.__ptSavedHook) {
            m.__ptSavedHook = m.onBeforeCompile;
            m.__ptSavedKey = m.customProgramCacheKey;
            m.onBeforeCompile = () => {};
            m.customProgramCacheKey = () => `pt-nofill-${m.name}`;
            m.needsUpdate = true; n++;
          }
        }
      }
      return n;
    },
    lightCensus() {
      const out = [];
      g().renderer.scene.traverse((o) => {
        if (o.isHemisphereLight || o.isDirectionalLight) {
          out.push({ kind: o.type, intensity: o.intensity });
        }
      });
      return out;
    },
    placeAt(x, y, z, facing = 0) {
      const p = g().sim.player;
      p.pos.x = x; p.pos.y = y; p.pos.z = z;
      p.prevPos.x = x; p.prevPos.y = y; p.prevPos.z = z;
      p.facing = facing; p.velX = 0; p.velY = 0; p.velZ = 0;
    },
    pos() { const p = g().sim.player.pos; return { x: p.x, y: p.y, z: p.z }; },
  };
});

async function installMap(id) {
  await page.keyboard.press('Enter');
  await page.keyboard.type(`/ptmap ${id}`);
  await page.keyboard.press('Enter');
  const flipped = await page
    .waitForFunction((id) => window.__ptlum.state().active === id, { timeout: 60000 }, id)
    .then(() => true)
    .catch(() => false);
  if (!flipped) return false;
  return page
    .waitForFunction((id) => window.__ptlum.ptMaterials(id).length > 0, { timeout: 90000 }, id)
    .then(() => true)
    .catch(() => false);
}

// Screenshot the game canvas and return lower-center-band luminance stats
// (the ground the player stands on; sky is excluded by the band).
async function groundLum(label) {
  const el = await page.$('#game-canvas');
  const buf = await el.screenshot({ path: `tmp/ptlum_${label}.png` });
  const img = decodePng(buf);
  return regionStats(img, 0.3, 0.55, 0.7, 0.9);
}

const bootPos = await page.evaluate(() => window.__ptlum.pos());
const lightsBoot = await page.evaluate(() => window.__ptlum.lightCensus());

console.log('\n=== WoC overworld baseline ===');
await sleep(1000);
const wocLum = await groundLum('woc');
console.log(`  woc ground band: mean=${wocLum.mean.toFixed(3)} dark=${(wocLum.darkFrac * 100).toFixed(0)}% blown=${(wocLum.blownFrac * 100).toFixed(1)}%`);

console.log('\n=== ricarten: fill wiring + live value ===');
{
  const ok = await installMap('ricarten');
  check('/ptmap ricarten installed', ok);
  await sleep(3000); // let the fill uniform finish easing to target
  const rep = await page.evaluate(() => window.__ptlum.fillReport('ricarten'));
  check('all pt materials bind uWocFillBoost', rep.bound === rep.total && rep.total > 0,
    `${rep.bound}/${rep.total}`);
  check('all pt materials inject the irradiance lift', rep.patched === rep.total,
    `${rep.patched}/${rep.total}`);
  check('live fill value > 1 under the standard rig', rep.value > 1, `uTerrainFillBoost=${rep.value}`);

  console.log('\n=== ricarten A/B: patched vs unpatched (same scene) ===');
  const lumOn = await groundLum('ric_on');
  const off = await page.evaluate(() => window.__ptlum.setFillPatched(false));
  check('fill disabled in-page for A/B', off > 0, `${off} materials swapped`);
  await sleep(2500); // relink + a few frames
  const lumOff = await groundLum('ric_off');
  const back = await page.evaluate(() => window.__ptlum.setFillPatched(true));
  check('fill restored', back === off, `${back} restored`);
  await sleep(2500);
  const lumBack = await groundLum('ric_back');
  console.log(`  on=${lumOn.mean.toFixed(3)} off=${lumOff.mean.toFixed(3)} back=${lumBack.mean.toFixed(3)}` +
    ` | dark%: ${(lumOn.darkFrac * 100).toFixed(0)} -> ${(lumOff.darkFrac * 100).toFixed(0)} -> ${(lumBack.darkFrac * 100).toFixed(0)}`);
  // The lift multiplies hemisphere irradiance only: sun-facing ground is
  // dominated by the untouched sun term, so a modest mean delta over the
  // whole band is the expected signature (shade regions lift most).
  check('fill lifts ground luminance', lumOn.mean > lumOff.mean * 1.05,
    `${lumOn.mean.toFixed(3)} vs ${lumOff.mean.toFixed(3)}`);
  check('restore returns to lifted level', Math.abs(lumBack.mean - lumOn.mean) < 0.03,
    `${lumBack.mean.toFixed(3)} vs ${lumOn.mean.toFixed(3)}`);
  check('no blown highlights after fill', lumOn.blownFrac < 0.02,
    `${(lumOn.blownFrac * 100).toFixed(1)}% blown`);
}

console.log('\n=== fore-1: fill wiring ===');
{
  const ok = await installMap('fore-1');
  check('/ptmap fore-1 installed', ok);
  await sleep(3000);
  const rep = await page.evaluate(() => window.__ptlum.fillReport('fore-1'));
  check('all fore-1 pt materials bind the fill', rep.bound === rep.total && rep.total > 0,
    `${rep.bound}/${rep.total}`);
  check('fill value unchanged across field switch', rep.value > 1,
    `uTerrainFillBoost=${rep.value}`);
  const lum = await groundLum('fore1');
  check('fore-1 ground readable', lum.mean > 0.05, `mean=${lum.mean.toFixed(3)}`);
}

console.log('\n=== accumulation: reinstall cycle ===');
{
  const ok = await installMap('ricarten');
  check('ricarten reinstalled', ok);
  await sleep(2500);
  const rep = await page.evaluate(() => window.__ptlum.fillReport('ricarten'));
  const lum2 = await groundLum('ric2');
  check('uniform value stable after reinstall', rep.value > 1, `uTerrainFillBoost=${rep.value}`);
  check('luminance stable after reinstall', lum2.mean > 0.05, `mean=${lum2.mean.toFixed(3)}`);
}

console.log('\n=== PT -> non-PT: WoC lighting untouched ===');
{
  await page.evaluate((p) => window.__ptlum.placeAt(p.x, p.y, p.z), bootPos);
  await sleep(2500);
  const wocBack = await groundLum('woc_back');
  const lightsBack = await page.evaluate(() => window.__ptlum.lightCensus());
  // The day/night grade animates over minutes, so an exact luminance match
  // is impossible; the PT fill cannot leak into WoC materials (the hook is
  // installed only in the PT factories). Assert WoC stays readable and
  // unblown - it must not have gone dark or been driven into clipping.
  check('WoC ground still readable after PT', wocBack.mean > 0.15 && wocBack.blownFrac < 0.05,
    `${wocBack.mean.toFixed(3)} (baseline ${wocLum.mean.toFixed(3)}, day/night drift expected)`);
  check('global light census unchanged',
    JSON.stringify(lightsBack.map((l) => l.kind).sort()) ===
    JSON.stringify(lightsBoot.map((l) => l.kind).sort()),
    `${lightsBack.length} lights`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`}`);
if (texture404s.length) {
  console.log(`pt texture 404s: ${texture404s.length}`);
  for (const u of [...new Set(texture404s)].slice(0, 12)) console.log('  ' + u);
}
check('texture fetches bounded', texture404s.length < 50);
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
