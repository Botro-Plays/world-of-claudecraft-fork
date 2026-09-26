// PT enlarged field-map E2E (Phase 6F, dev harness, offline world).
//
// Verifies the M key opens the existing #map-window with the enlarged PT
// field surface - the same per-field rasters and StageMapRect projection the
// corner minimap composites (Phase 5B), fitted to the 560px canvas:
//   - each tested field (ricarten, fore-1, fore-2, fore-3, dun-1) opens with
//     its raster painted (non-void coverage where the rect lands),
//   - the player marker sits at the view's projected position and its arrow
//     tracks facing,
//   - the field display name reaches #map-summary,
//   - the WoC zone/continent toggle + zoom controls hide in PT mode,
//   - M toggles closed, Escape closes, reopening issues zero new raster
//     fetches (shared pt_map_images cache with the corner minimap),
//   - WoC regression: back in the overworld the stock map controls return,
//   - no minimap-* texture request 404s, no page errors.
//
// Usage: npm run dev on :5173, then `node scripts/pt_map_e2e.mjs`.

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
const failedTextures = [];
let rasterFetches = 0;
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
});
page.on('request', (r) => {
  if (/textures\/pt-[^/]+\/minimap-.*\.png/.test(r.url())) rasterFetches++;
});
page.on('response', (r) => {
  if (r.status() === 404 && /minimap-.*\.png|textures\/pt-/.test(r.url())) {
    failedTextures.push(r.url());
  }
});

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) failures++;
};

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
const booted = await page
  .waitForFunction(() => window.__game?.sim?.player, { timeout: 120000 })
  .then(() => true)
  .catch(() => false);
if (!booted) {
  console.log('FAIL: window.__game.sim.player never appeared');
  await page.screenshot({ path: 'tmp/ptmap_boot_fail.png' });
  await browser.close();
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 1500));
await page.keyboard.press('Escape');
await dismissEntryOverlays(page);

await page.evaluate(() => {
  const g = () => window.__game;
  const S = 560; // index.html #map-canvas backing size
  window.__ptmap = {
    state() {
      const p = g()?.sim?.player;
      return {
        active: g()?.ptActiveMap?.()?.id ?? null,
        standby: g()?.ptStandbyMap?.()?.id ?? null,
        x: p?.pos.x ?? 0,
        y: p?.pos.y ?? 0,
        z: p?.pos.z ?? 0,
        facing: p?.facing ?? 0,
      };
    },
    mapOpen() {
      const el = document.getElementById('map-window');
      return !!el && getComputedStyle(el).display !== 'none';
    },
    controlDisplay(id) {
      const el = document.getElementById(id);
      return el ? getComputedStyle(el).display : 'missing';
    },
    summaryText() {
      return document.getElementById('map-summary')?.textContent ?? '';
    },
    placeAt(x, y, z, facing = 0) {
      const p = g().sim.player;
      p.pos.x = x; p.pos.y = y; p.pos.z = z;
      p.prevPos.x = x; p.prevPos.y = y; p.prevPos.z = z;
      p.facing = facing; p.velX = 0; p.velY = 0; p.velZ = 0;
    },
    setFacing(f) { g().sim.player.facing = f; },
    ground(x, z) { return g().ptField().groundHeight(x, z); },
    async gateInfo(destId) {
      const active = g()?.ptActiveMap?.();
      if (!active) return null;
      // Authored records first; fall back to the reciprocal edge the source
      // created via AddGate2 (same resolution pt_minimap_e2e.mjs uses).
      let e = (active.fieldGates ?? []).find((x) => x.targetId === destId);
      if (!e && g().ptLinks) {
        const links = await g().ptLinks(active.id);
        e = (links?.fieldGates ?? []).find((x) => x.otherId === destId) ?? null;
      }
      if (!e) return null;
      return {
        gateX: active.transform.ptXToWoC(e.x),
        gateZ: active.transform.ptZToWoC(e.z),
      };
    },
    // The view model pt_minimap_core.buildPtFieldMapView computes, re-derrived
    // from the live descriptors: raster union -> pxPerYard -> dest rects +
    // the projected player marker. Same math, no second source of truth.
    view() {
      const ac = g()?.ptActiveMap?.() ?? null;
      const sb = g()?.ptStandbyMap?.() ?? null;
      const layers = [];
      for (const d of [sb, ac]) {
        const r = d?.field?.PT_STAGE_MAP_RECT;
        const png = d?.field?.PT_MINIMAP?.png;
        if (!d || !r || !png) continue;
        const xA = d.transform.ptXToWoC(r.left / 256);
        const xB = d.transform.ptXToWoC(r.right / 256);
        const zA = d.transform.ptZToWoC(r.top / 256);
        const zB = d.transform.ptZToWoC(r.bottom / 256);
        layers.push({
          id: d.id,
          rect: {
            minX: Math.min(xA, xB), maxX: Math.max(xA, xB),
            minZ: Math.min(zA, zB), maxZ: Math.max(zA, zB),
          },
        });
      }
      const p = g().sim.player;
      if (!layers.length) return { layers: [], player: { mx: S / 2, my: S / 2 } };
      const minX = Math.min(...layers.map((l) => l.rect.minX));
      const maxX = Math.max(...layers.map((l) => l.rect.maxX));
      const minZ = Math.min(...layers.map((l) => l.rect.minZ));
      const maxZ = Math.max(...layers.map((l) => l.rect.maxZ));
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      const ppy = S / Math.max(maxX - minX, maxZ - minZ);
      const half = S / 2;
      return {
        layers: layers.map((l) => ({
          id: l.id,
          dest: {
            x: half - (l.rect.maxX - cx) * ppy,
            y: half - (l.rect.maxZ - cz) * ppy,
            w: (l.rect.maxX - l.rect.minX) * ppy,
            h: (l.rect.maxZ - l.rect.minZ) * ppy,
          },
        })),
        player: {
          mx: half - (p.pos.x - cx) * ppy,
          my: half - (p.pos.z - cz) * ppy,
        },
      };
    },
    pxAt(x, y) {
      const c = document.getElementById('map-canvas');
      const d = c.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    },
    // Count of canvas pixels differing from the --color-minimap-void fill in
    // a box: the raster coverage probe.
    paintedInBox(x0, y0, w, h) {
      const c = document.getElementById('map-canvas');
      const ctx = c.getContext('2d');
      const vx = Math.max(0, Math.round(x0));
      const vy = Math.max(0, Math.round(y0));
      const vw = Math.min(S - vx, Math.round(w));
      const vh = Math.min(S - vy, Math.round(h));
      if (vw <= 0 || vh <= 0) return -1;
      const ref = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-minimap-void')
        .trim();
      const rv = window.__ptmap.hexRgb(ref) ?? [20, 22, 28];
      const d = ctx.getImageData(vx, vy, vw, vh).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (!(Math.abs(d[i] - rv[0]) <= 12 && Math.abs(d[i + 1] - rv[1]) <= 12 &&
              Math.abs(d[i + 2] - rv[2]) <= 12)) n++;
      }
      return n;
    },
    // '#fff' AND '#ffffff' both parse (the tokens use the short form).
    hexRgb(css) {
      const m = css.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (!m) return null;
      let h = m[1];
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    },
    playerColor() {
      const ref = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-minimap-player')
        .trim();
      return window.__ptmap.hexRgb(ref) ?? [255, 255, 255];
    },
    // The arrow is the only solid near-white patch on a PT raster (title text
    // is #ffe9a0, not #fff): find the densest near-white cluster over the
    // whole canvas and return its centroid. Sim pos can settle a few yards
    // between the paint tick and the probe, so the callers compare against
    // the view projection with tolerance, and read facing from the centroid
    // SHIFT between two facings (the anchor error cancels in the diff).
    findMarker() {
      const c = document.getElementById('map-canvas');
      const ctx = c.getContext('2d');
      const ref = window.__ptmap.playerColor();
      const d = ctx.getImageData(0, 0, S, S).data;
      const G = 13;
      const cells = new Map();
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4;
          if (Math.abs(d[i] - ref[0]) <= 24 && Math.abs(d[i + 1] - ref[1]) <= 24 &&
              Math.abs(d[i + 2] - ref[2]) <= 24) {
            const k = Math.floor(y / G) * 64 + Math.floor(x / G);
            cells.set(k, (cells.get(k) ?? 0) + 1);
          }
        }
      }
      let bestK = -1, bestN = 0;
      for (const [k, n] of cells) if (n > bestN) { bestK = k; bestN = n; }
      if (bestN === 0) return null;
      const cx0 = (bestK % 64) * G;
      const cy0 = Math.floor(bestK / 64) * G;
      let sx = 0, sy = 0, n = 0;
      for (let y = Math.max(0, cy0 - 6); y < Math.min(S, cy0 + G + 6); y++) {
        for (let x = Math.max(0, cx0 - 6); x < Math.min(S, cx0 + G + 6); x++) {
          const i = (y * S + x) * 4;
          if (Math.abs(d[i] - ref[0]) <= 24 && Math.abs(d[i + 1] - ref[1]) <= 24 &&
              Math.abs(d[i + 2] - ref[2]) <= 24) {
            sx += x; sy += y; n++;
          }
        }
      }
      return { cx: sx / n, cy: sy / n, n };
    },
  };
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = () => page.evaluate(() => window.__ptmap.state());

// Install a field through the real /ptmap chat path; returns once the active
// descriptor flips.
async function installMap(id) {
  await page.keyboard.press('Enter');
  await page.keyboard.type(`/ptmap ${id}`);
  await page.keyboard.press('Enter');
  return page
    .waitForFunction((id) => window.__ptmap.state().active === id, { timeout: 30000 }, id)
    .then(() => true)
    .catch(() => false);
}

async function openMap() {
  await page.keyboard.press('m');
  await page
    .waitForFunction(() => window.__ptmap.mapOpen(), { timeout: 8000 })
    .catch(() => {});
  return page.evaluate(() => window.__ptmap.mapOpen());
}
async function closeMapM() {
  await page.keyboard.press('m');
  await page
    .waitForFunction(() => !window.__ptmap.mapOpen(), { timeout: 8000 })
    .catch(() => {});
  return !(await page.evaluate(() => window.__ptmap.mapOpen()));
}
async function mapShot(name) {
  const el = await page.$('#map-window');
  if (el) await el.screenshot({ path: `tmp/ptmap_${name}.png` });
}

const FIELDS = [
  { id: 'ricarten', name: 'Ricarten' },
  { id: 'fore-1', name: 'Garden of Freedom' },
  { id: 'fore-2', name: 'Bamboo Forest' },
  { id: 'fore-3', name: 'Acacia Forest' },
  { id: 'dun-1', name: 'Dungeon 1' },
];

for (const f of FIELDS) {
  console.log(`\n=== FIELD ${f.id} (${f.name}) ===`);
  const installed = await installMap(f.id);
  check(`/ptmap ${f.id} installed`, installed);
  if (!installed) continue;
  await sleep(2000);

  const open = await openMap();
  check('M opens the map window', open);
  if (!open) continue;
  await sleep(800);

  const s = await state();
  check(`${f.id} is the active field`, s.active === f.id, `active=${s.active}`);

  // PT-mode controls: the zone/continent toggle and zoom hide.
  const toggleDisp = await page.evaluate(() => window.__ptmap.controlDisplay('map-level-toggle'));
  const zoomDisp = await page.evaluate(() => window.__ptmap.controlDisplay('map-zoom'));
  check('zone/continent toggle hidden in PT mode', toggleDisp === 'none', toggleDisp);
  check('zoom controls hidden in PT mode', zoomDisp === 'none', zoomDisp);

  // Field name reaches the a11y summary.
  const summary = await page.evaluate(() => window.__ptmap.summaryText());
  check(`summary names ${f.name}`, summary.includes(f.name), summary.slice(0, 60));

  // Raster coverage: the active layer's dest rect is largely non-void.
  const cov = await page.evaluate(() => {
    const v = window.__ptmap.view();
    const active = v.layers[v.layers.length - 1];
    if (!active) return { n: -1, total: 0 };
    const inset = 18;
    const n = window.__ptmap.paintedInBox(
      active.dest.x + inset, active.dest.y + inset,
      active.dest.w - inset * 2, active.dest.h - inset * 2,
    );
    return { n, layers: v.layers.map((l) => l.id) };
  });
  check(`${f.id} raster painted in the window`, cov.n > 500, `${cov.n}px, layers=${cov.layers}`);

  // Player marker: the near-white arrow cluster, found on the canvas itself
  // so a still-settling spawn pos cannot hide it.
  const mk = await page.evaluate(() => window.__ptmap.findMarker());
  check('player marker painted', mk !== null && mk.n >= 8, mk ? `n=${mk.n}` : 'none found');
  if (mk) {
    const dist = await page.evaluate(() => {
      const v = window.__ptmap.view();
      const m = window.__ptmap.findMarker();
      return Math.hypot(m.cx - v.player.mx, m.cy - v.player.my);
    });
    check('marker near the projected position', dist <= 35, `${dist.toFixed(0)}px`);
  }

  // Facing: the arrow's mass sits at its base, OPPOSITE the tip. At facing 0
  // (tip up) the fill centroid is below the anchor; at PI it is above. The
  // sim pos can drift between the two paints, so this reads the centroid
  // shift, which cancels the anchor error.
  await page.evaluate(() => window.__ptmap.setFacing(0));
  await sleep(500);
  const c0 = await page.evaluate(() => window.__ptmap.findMarker());
  await page.evaluate(() => window.__ptmap.setFacing(Math.PI));
  await sleep(500);
  const cPi = await page.evaluate(() => window.__ptmap.findMarker());
  check('arrow rotates with facing (mass below at 0, above at PI)',
    c0 !== null && cPi !== null && c0.cy - cPi.cy > 1,
    c0 && cPi ? `cy0=${c0.cy.toFixed(1)} cyPi=${cPi.cy.toFixed(1)}` : 'marker not found');

  await mapShot(f.id);

  // Movement while open: the map stays open and the marker view updates.
  const posBefore = await state();
  await page.keyboard.down('w');
  await sleep(600);
  await page.keyboard.up('w');
  await sleep(300);
  const posAfter = await state();
  const moved = Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z);
  const stillOpen = await page.evaluate(() => window.__ptmap.mapOpen());
  check('movement while open works', moved > 0.5 && stillOpen,
    `moved=${moved.toFixed(1)}yd open=${stillOpen}`);

  // Close via M, reopen, then a second close/reopen cycle whose fetch count
  // must be exactly zero (the shared cache serves every already-decoded
  // raster; the first open may still have had a standby fetch in flight).
  check('M toggles the map closed', await closeMapM());
  const reopen = await openMap();
  check('M reopens the map', reopen);
  await sleep(500);
  check('second M closes again', await closeMapM());
  const fetchesAtReopen = rasterFetches;
  await openMap();
  await sleep(500);
  const refetches = rasterFetches - fetchesAtReopen;
  check('a warmed reopen fetches zero raster images', refetches === 0,
    `${refetches} new fetches (${rasterFetches} total)`);
  await page.keyboard.press('Escape');
  await page
    .waitForFunction(() => !window.__ptmap.mapOpen(), { timeout: 8000 })
    .catch(() => {});
  check('Escape closes the map', !(await page.evaluate(() => window.__ptmap.mapOpen())));
}

// --- Connected-world: the standby field composites beside the active one --
// Stand fore-1-side of the authored fore-1 -> ricarten gate so the boundary
// watch preloads ricarten into the standby slot, then the enlarged map must
// carry BOTH rasters (same sCompactMap[1] then [0] compositing as the corner
// minimap), not just the active field.
console.log('\n=== SEAM: fore-1 active + ricarten standby ===');
{
  const installed = await installMap('fore-1');
  check('/ptmap fore-1 installed for seam test', installed);
  if (installed) {
    await sleep(1500);
    const gate = await page.evaluate(() => window.__ptmap.gateInfo('ricarten'));
    check('fore-1 -> ricarten edge resolves', gate !== null);
    if (gate) {
      const y = await page.evaluate((g) => window.__ptmap.ground(g.gateX, g.gateZ), gate);
      await page.evaluate(
        (a) => window.__ptmap.placeAt(a.gx, a.y + 0.05, a.gz, 0),
        { gx: gate.gateX, gz: gate.gateZ, y: Number.isFinite(y) ? y : 0 },
      );
      const deadline = Date.now() + 30000;
      let s = await state();
      while (Date.now() < deadline && s.standby !== 'ricarten' && s.active !== 'ricarten') {
        await sleep(400);
        s = await state();
      }
      check('ricarten preloaded as standby at the seam',
        s.standby === 'ricarten' || s.active === 'ricarten',
        `standby=${s.standby} active=${s.active}`);
      const open = await openMap();
      check('M opens at the seam', open);
      await sleep(800);
      const seam = await page.evaluate(() => {
        const v = window.__ptmap.view();
        const inset = 18;
        return {
          ids: v.layers.map((l) => l.id),
          paints: v.layers.map((l) => window.__ptmap.paintedInBox(
            l.dest.x + inset, l.dest.y + inset, l.dest.w - inset * 2, l.dest.h - inset * 2,
          )),
        };
      });
      check('both connected rasters composite in the enlarged map',
        seam.ids.length === 2 && seam.paints.every((n) => n > 500),
        `layers=${seam.ids} paints=${seam.paints}`);
      const cur = await state();
      check('standby draws beneath active (source sCompactMap order)',
        cur.standby !== null && seam.ids[0] === cur.standby && seam.ids[1] === cur.active,
        `order=${seam.ids} active=${cur.active} standby=${cur.standby}`);
      await mapShot('seam_fore1_ricarten');
      await page.keyboard.press('Escape');
      await sleep(400);
    }
  }
}

// --- WoC regression: the stock map controls return outside the band -------
console.log('\n=== WOC REGRESSION ===');
{
  const y = await page.evaluate(() => {
    const g = window.__game;
    // WoC overworld: far from the PT band (positive-x overworld zone land).
    window.__ptmap.placeAt(0, 100, 100, 0);
    return g.sim.player.pos.y;
  });
  await sleep(800);
  const open = await openMap();
  check('M opens the map window in the overworld', open && Number.isFinite(y));
  await sleep(800);
  if (open) {
    const toggleDisp = await page.evaluate(() => window.__ptmap.controlDisplay('map-level-toggle'));
    const zoomDisp = await page.evaluate(() => window.__ptmap.controlDisplay('map-zoom'));
    check('zone/continent toggle visible in WoC', toggleDisp !== 'none', toggleDisp);
    check('zoom controls visible in WoC', zoomDisp !== 'none', zoomDisp);
    const summary = await page.evaluate(() => window.__ptmap.summaryText());
    check('WoC summary is a zone, not a PT field',
      !summary.includes('Ricarten') && !summary.includes('Freedom') &&
      !summary.includes('Bamboo') && !summary.includes('Acacia') && !summary.includes('Dungeon 1'),
      summary.slice(0, 60));
    await mapShot('woc');
    await page.keyboard.press('Escape');
    await sleep(400);
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`}`);
if (failedTextures.length) {
  console.log(`texture 404s: ${failedTextures.length}`);
  for (const u of failedTextures.slice(0, 10)) console.log('  ' + u);
}
check('no minimap texture 404s', failedTextures.length === 0);
const KNOWN_NOISE = [
  /Failed to load resource: the server responded with a status of 502/,
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
