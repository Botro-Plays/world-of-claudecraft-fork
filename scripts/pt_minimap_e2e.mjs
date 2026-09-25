// PT connected-world minimap E2E (Phase 5B, dev harness, offline world).
//
// Verifies the corner minimap composites the authentic per-field rasters
// (client/Field/map/<id>.tga -> public/textures/pt-<id>/minimap-*.png)
// through each field's authored StageMapRect:
//   - Ricarten shows the village-2 raster (not void),
//   - approaching the Ricarten -> fore-1 gate preloads fore-1's raster and
//     composites it beside Ricarten's (source sCompactMap[1] then [0]),
//   - walking across the seam keeps map coverage continuous (no void flash),
//   - the same holds on a second seam (fore-1 -> fore-2) and in reverse,
//   - no minimap texture request 404s, no page errors.
//
// Usage: npm run dev on :5173, then `node scripts/pt_minimap_e2e.mjs`.

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
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
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
  await page.screenshot({ path: 'tmp/ptmm_boot_fail.png' });
  await browser.close();
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 1500));
await page.keyboard.press('Escape');
await dismissEntryOverlays(page);

await page.evaluate(() => {
  const g = () => window.__game;
  const MM = 162;
  const PPY = 1.7; // MINIMAP_BASE_SCALE at zoom 1
  window.__ptmm = {
    state() {
      const p = g()?.sim?.player;
      return {
        active: g()?.ptActiveMap?.()?.id ?? null,
        standby: g()?.ptStandbyMap?.()?.id ?? null,
        x: p?.pos.x ?? 0,
        y: p?.pos.y ?? 0,
        z: p?.pos.z ?? 0,
      };
    },
    placeAt(x, y, z, facing = 0) {
      const p = g().sim.player;
      p.pos.x = x; p.pos.y = y; p.pos.z = z;
      p.prevPos.x = x; p.prevPos.y = y; p.prevPos.z = z;
      p.facing = facing; p.velX = 0; p.velY = 0; p.velZ = 0;
    },
    setFacing(f) { g().sim.player.facing = f; },
    async gateInfo(destId) {
      const active = g()?.ptActiveMap?.();
      if (!active) return null;
      // Authored records first; fall back to the reciprocal edge the source
      // created via AddGate2 (carried by the maplinks graph, not the
      // manifest, so ricarten->fore-1 still resolves).
      let e = (active.fieldGates ?? []).find((x) => x.targetId === destId);
      if (!e && g().ptLinks) {
        const links = await g().ptLinks(active.id);
        e = (links?.fieldGates ?? []).find((x) => x.otherId === destId) ?? null;
      }
      if (!e) return null;
      const gx = active.transform.ptXToWoC(e.x);
      const gz = active.transform.ptZToWoC(e.z);
      // Bearing away from the active field's own center (the "into
      // destination" reference direction for route deltas).
      const b = active.field.PT_BOUNDS;
      const cx = active.transform.ptXToWoC((b.minX + b.maxX) / 2);
      const cz = active.transform.ptZToWoC((b.minZ + b.maxZ) / 2);
      return { gateX: gx, gateZ: gz, baseH: Math.atan2(gx - cx, gz - cz) };
    },
    // Corridor start/end for a route {dh, off}: start 18yd before the gate
    // along the heading, offset laterally along the boundary tangent.
    routeLine(gate, dh, off) {
      const h = gate.baseH + (dh * Math.PI) / 180;
      const dx = Math.sin(h), dz = Math.cos(h);
      const tx = -dz, tz = dx;
      return {
        px: gate.gateX - dx * 18 + tx * off,
        pz: gate.gateZ - dz * 18 + tz * off,
        heading: h,
      };
    },
    // Canvas-space pixel of a world point under the minimap's player-centered
    // projection (+X world = map-left, +Z world = map-up).
    pxAt(wx, wz) {
      const p = g().sim.player;
      const c = document.getElementById('minimap');
      const ctx = c.getContext('2d');
      const sx = Math.round(MM / 2 - (wx - p.pos.x) * PPY);
      const sy = Math.round(MM / 2 - (wz - p.pos.z) * PPY);
      if (sx < 0 || sy < 0 || sx >= MM || sy >= MM) return null;
      const d = ctx.getImageData(sx, sy, 1, 1).data;
      return { x: sx, y: sy, r: d[0], g: d[1], b: d[2], a: d[3] };
    },
    // A void pixel reference: the four canvas corners inside the clip circle
    // are outside every field rect on a centered map.
    voidPx() {
      const c = document.getElementById('minimap');
      const d = c.getContext('2d').getImageData(4, 4, 1, 1).data;
      return [d[0], d[1], d[2]];
    },
    // Scan a descriptor's StageMapRect for world points whose canvas pixel
    // is inside the painter's circular clip but OUTSIDE the other field's
    // rect (a region only this raster can paint). Returns up to `want`
    // candidates spread across the rect so a transparent raster patch or a
    // dark pixel matching the void color cannot sink the whole check.
    samplePoints(d, otherRect, otherTf, want = 14) {
      const r = d.field.PT_STAGE_MAP_RECT;
      if (!r) return [];
      const p = g().sim.player;
      const cands = [];
      for (let i = 0.02; i < 1; i += 0.035) {
        for (let j = 0.02; j < 1; j += 0.035) {
          const ptX = (r.left + (r.right - r.left) * i) / 256;
          const ptZ = (r.top + (r.bottom - r.top) * j) / 256;
          const wx = d.transform.ptXToWoC(ptX);
          const wz = d.transform.ptZToWoC(ptZ);
          const sx = MM / 2 - (wx - p.pos.x) * PPY;
          const sy = MM / 2 - (wz - p.pos.z) * PPY;
          // Must land inside the painter's circular clip, not just the
          // square canvas: points near the corners stay void forever.
          const cdx = sx - MM / 2, cdy = sy - MM / 2;
          if (cdx * cdx + cdy * cdy > 68 * 68) continue;
          if (otherRect) {
            // Skip points the other field's rect also covers.
            const ox = otherTf.woCToPtX(wx);
            const oz = otherTf.woCToPtZ(wz);
            const l = otherRect.left / 256, t = otherRect.top / 256;
            const rr = otherRect.right / 256, b = otherRect.bottom / 256;
            if (ox >= l && ox <= rr && oz >= t && oz <= b) continue;
          }
          cands.push({ wx, wz });
        }
      }
      // Stride-pick so the kept samples spread over the whole rect instead
      // of clustering in the first scanned corner.
      const pts = [];
      const stride = Math.max(1, Math.floor(cands.length / want));
      for (let k = 0; k < cands.length && pts.length < want; k += stride) {
        pts.push(cands[k]);
      }
      return pts;
    },
    ground(x, z) { return g().ptField().groundHeight(x, z); },
  };
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = () => page.evaluate(() => window.__ptmm.state());

// Install a field through the real /ptmap chat path (same mechanism the
// FieldGate e2e uses); returns once the active descriptor flips.
async function installMap(id) {
  await page.keyboard.press('Enter');
  await page.keyboard.type(`/ptmap ${id}`);
  await page.keyboard.press('Enter');
  return page
    .waitForFunction((id) => window.__ptmm.state().active === id, { timeout: 30000 }, id)
    .then(() => true)
    .catch(() => false);
}
const eq = (a, b) => Math.abs(a - b) <= 12; // channel tolerance vs AA/noise

// Count candidate world points whose canvas pixel differs from the void
// reference right now.
async function countPainted(pts) {
  return page.evaluate((pts) => {
    const c = document.getElementById('minimap');
    const ctx = c.getContext('2d');
    const p = window.__game.sim.player;
    const ref = window.__ptmm.voidPx();
    let n = 0;
    for (const q of pts) {
      const sx = Math.round(81 - (q.wx - p.pos.x) * 1.7);
      const sy = Math.round(81 - (q.wz - p.pos.z) * 1.7);
      if (sx < 0 || sy < 0 || sx >= 162 || sy >= 162) continue;
      const d = ctx.getImageData(sx, sy, 1, 1).data;
      if (!(Math.abs(d[0] - ref[0]) <= 12 && Math.abs(d[1] - ref[1]) <= 12 &&
            Math.abs(d[2] - ref[2]) <= 12)) n++;
    }
    return n;
  }, pts);
}

// Wait until at least `need` of the sampled candidate points are painted
// (differ from the void fill), or timeout. Returns the painted count.
async function waitRaster(pts, timeoutMs, need = 2) {
  const deadline = Date.now() + timeoutMs;
  let n = 0;
  while (Date.now() < deadline) {
    n = await countPainted(pts);
    if (n >= need) return n;
    await sleep(250);
  }
  return n;
}

async function minimapShot(name) {
  const el = await page.$('#minimap');
  if (el) await el.screenshot({ path: `tmp/ptmm_${name}.png` });
}

// --- Phase A: Ricarten raster -------------------------------------------
console.log('\n=== PHASE A: Ricarten ===');
{
  // The diagnostics boot starts in the WoC overworld; enter the PT band via
  // the dev map command (the same path the FieldGate e2e drives).
  const installed = await installMap('ricarten');
  check('/ptmap ricarten installed', installed);
  await sleep(1500);
  const s = await state();
  check('ricarten is the active field', s.active === 'ricarten', `active=${s.active}`);
  // Ricarten town square (field.cpp SetCenterPos 2596,-18738), well inside
  // the authored rect.
  const ric = await page.evaluate(() => {
    const d = window.__game.ptActiveMap();
    return { x: d.transform.ptXToWoC(2596), z: d.transform.ptZToWoC(-18738) };
  });
  const px = await page.evaluate((p) => window.__ptmm.pxAt(p.wx, p.wz), { wx: ric.x, wz: ric.z });
  const painted = px && await waitRaster([{ wx: ric.x, wz: ric.z }], 15000, 1);
  check('ricarten raster painted at town center', !!painted,
    px ? `rgb(${px.r},${px.g},${px.b})` : 'still void');
  await minimapShot('a_ricarten');
}

// Verified passable corridors per leg, shared with pt_fieldgate_e2e.mjs
// (offline step-simulation sweeps of the real accepts() rule). dh = heading
// delta in degrees from the gate->away-from-source-center bearing; off =
// lateral offset in yards along the boundary tangent. fore-1->fore-2 walks
// the fore-2->fore-1 seam in the unproven reverse direction, so its
// candidates mirror the swept set (delta and offset flip sign) plus a
// spread for the baseH difference between the two field centers.
const ROUTES = {
  'ricarten->fore-1': [{ dh: 0, off: 6 }, { dh: 5, off: 6 }, { dh: 10, off: 6 }],
  'fore-1->fore-2': [
    { dh: 30, off: -2 }, { dh: 40, off: -2 }, { dh: 20, off: -2 },
    { dh: 10, off: -2 }, { dh: 50, off: -2 }, { dh: 0, off: 0 },
  ],
  'fore-3->fore-2': [{ dh: 0, off: 0 }, { dh: 0, off: 2 }, { dh: 10, off: 2 }],
  'fore-2->fore-1': [{ dh: -30, off: 2 }, { dh: -40, off: 2 }, { dh: -20, off: 2 }, { dh: -10, off: 2 }],
  'fore-1->ricarten': [{ dh: 19, off: -5 }, { dh: 19, off: -6 }, { dh: 19, off: -4 }, { dh: 19, off: -8 }],
};

// Walk one FieldGate leg with minimap assertions: place on a swept corridor
// start, wait for the standby preload, verify the standby raster composites
// into the viewport beside the active one, hold W until floor ownership
// flips, then verify the new active raster covers the player neighborhood.
async function walkLegMM(fromId, toId) {
  console.log(`\n=== LEG ${fromId} -> ${toId} ===`);
  const gate = await page.evaluate((toId) => window.__ptmm.gateInfo(toId), toId);
  check(`edge ${fromId}->${toId} resolves`, gate !== null);
  if (!gate) return false;
  const routes = ROUTES[`${fromId}->${toId}`] ?? [{ dh: 0, off: 0 }];

  // Phase 1: stand at the first corridor's start so the boundary watch
  // preloads the destination into the standby slot.
  const r0 = await page.evaluate(
    (a) => window.__ptmm.routeLine(a.gate, a.dh, a.off),
    { gate, ...routes[0] },
  );
  const y0 = await page.evaluate((p) => window.__game.ptField().groundHeight(p.px, p.pz), r0);
  check(`approach corridor on ${fromId} floor`, Number.isFinite(y0), `y=${y0}`);
  if (!Number.isFinite(y0)) return false;
  await page.evaluate(
    (a) => window.__ptmm.placeAt(a.px, a.y + 0.05, a.pz, a.heading),
    { ...r0, y: y0 },
  );
  const start = await state();
  check(`start on ${fromId}`, start.active === fromId, `active=${start.active}`);

  // Phase 2: standby preload + composite check.
  const preloadDeadline = Date.now() + 30000;
  let s = await state();
  while (Date.now() < preloadDeadline && s.standby !== toId && s.active !== toId) {
    await sleep(400);
    s = await state();
  }
  check(`${toId} preloaded as standby at the seam`, s.standby === toId || s.active === toId,
    `standby=${s.standby} active=${s.active}`);
  await sleep(500);
  await minimapShot(`${fromId}_${toId}_seam`);

  const pts = await page.evaluate(() => {
    const sb = window.__game.ptStandbyMap();
    const ac = window.__game.ptActiveMap();
    if (!sb) return [];
    return window.__ptmm.samplePoints(sb, ac.field.PT_STAGE_MAP_RECT, ac.transform);
  });
  if (pts.length) {
    const n = await waitRaster(pts, 15000, 2);
    check(`${toId} standby raster composited`, n >= 2,
      `${n}/${pts.length} sampled px painted`);
  } else {
    console.log('  (no standby-exclusive point inside the viewport; skipping pixel check)');
  }

  // Phase 3: walk each corridor until floor ownership flips.
  let crossed = false;
  for (let ri = 0; ri < routes.length && !crossed; ri++) {
    const route = routes[ri];
    const line = await page.evaluate(
      (a) => window.__ptmm.routeLine(a.gate, a.dh, a.off),
      { gate, ...route },
    );
    const cy = await page.evaluate((p) => window.__game.ptField().groundHeight(p.px, p.pz), line);
    if (!Number.isFinite(cy)) {
      console.log(`  route ${ri} (dh ${route.dh}, off ${route.off}): no floor at start, skipping`);
      continue;
    }
    if (ri > 0) console.log(`  retrying route ${ri}: dh ${route.dh}deg off ${route.off}yd`);
    await page.evaluate(
      (a) => window.__ptmm.placeAt(a.px, a.y + 0.05, a.pz, a.heading),
      { ...line, y: cy },
    );
    const trail = [];
    const t0 = Date.now();
    await page.keyboard.down('w');
    try {
      while (Date.now() - t0 < 45000) {
        await page.evaluate((h) => window.__ptmm.setFacing(h), line.heading);
        await sleep(150);
        const st = await state();
        trail.push(st);
        if (st.active === toId) { crossed = true; break; }
        const dGate = Math.hypot(st.x - gate.gateX, st.z - gate.gateZ);
        if (dGate > 60) {
          console.log(`  route ${ri} wandered off the seam (dGate ${dGate.toFixed(0)}yd), next corridor`);
          break;
        }
        const recent = trail.slice(-25);
        if (recent.length >= 25 &&
            Math.hypot(recent[0].x - st.x, recent[0].z - st.z) < 0.5) {
          console.log(`  route ${ri} STALL at (${st.x.toFixed(1)}, ${st.z.toFixed(1)})`);
          break;
        }
      }
    } finally {
      await page.keyboard.up('w');
    }
  }
  const s2 = await state();
  check(`ownership flipped to ${toId}`, crossed, `active=${s2.active}`);
  if (!crossed) return false;
  await sleep(800);
  await minimapShot(`${fromId}_${toId}_done`);

  // Coverage under the player marker: the new active raster should paint
  // the neighborhood (no void flash at the crossing).
  const center = await page.evaluate(() => {
    const c = document.getElementById('minimap');
    const d = c.getContext('2d').getImageData(70, 70, 22, 22).data;
    let nonVoid = 0;
    const ref = window.__ptmm.voidPx();
    for (let i = 0; i < d.length; i += 4) {
      if (!(Math.abs(d[i] - ref[0]) <= 12 && Math.abs(d[i + 1] - ref[1]) <= 12 &&
            Math.abs(d[i + 2] - ref[2]) <= 12)) nonVoid++;
    }
    return nonVoid;
  });
  check('minimap covered at player after crossing', center > 0, `${center}/484 non-void px`);

  // The new active raster itself is visible inside the viewport (points the
  // standby rect does not also cover, so the count cannot be satisfied by
  // leftover standby pixels beneath a missing active raster).
  const pts2 = await page.evaluate(() => {
    const ac = window.__game.ptActiveMap();
    const sb = window.__game.ptStandbyMap();
    if (!ac) return [];
    return window.__ptmm.samplePoints(
      ac, sb ? sb.field.PT_STAGE_MAP_RECT : null, sb ? sb.transform : null);
  });
  if (pts2.length) {
    const n = await waitRaster(pts2, 10000, 2);
    check(`${toId} active raster painted in viewport`, n >= 2,
      `${n}/${pts2.length} sampled px painted`);
  }
  return true;
}

// --- Phase B/C: Ricarten -> fore-1 (the authored seam both directions) ---
{
  const ok = await walkLegMM('ricarten', 'fore-1');
  // Phase C (spec): fore-1 -> fore-2 uses the same seam the forest chain
  // crosses southbound; walk it northbound with mirrored corridor
  // candidates. Only attempted while on fore-1.
  if (ok) await walkLegMM('fore-1', 'fore-2');
}

// --- Phase D/E: forest chain southbound back to Ricarten -----------------
// fore-3 -> fore-2 -> fore-1 -> ricarten covers the non-Ricarten-origin
// links and the reverse traversal where Ricarten's raster reappears.
{
  const installed = await installMap('fore-3');
  check('/ptmap fore-3 installed', installed);
  if (installed) {
    await sleep(1500);
    for (const [from, to] of [['fore-3', 'fore-2'], ['fore-2', 'fore-1'], ['fore-1', 'ricarten']]) {
      const s = await state();
      if (s.active !== from) {
        console.log(`  leg ${from} -> ${to} skipped (active=${s.active})`);
        break;
      }
      const ok = await walkLegMM(from, to);
      if (!ok) break;
    }
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
