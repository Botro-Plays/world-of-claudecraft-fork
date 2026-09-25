// Scratch probe: sweep heading/offset candidates for ricarten -> fore-1
// (southbound over the bridge seam). Places the player before the gate,
// holds W briefly, reports displacement + active field. Dev-only.

import puppeteer from 'puppeteer-core';
import { BROWSER_PATH as EDGE } from './browser_path.mjs';
import { dismissEntryOverlays } from './enter_offline_game.mjs';

const URL =
  (process.env.GAME_URL ?? 'http://localhost:5173') +
  '/?diagnostics=1&diagnosticsAuto=1';

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 800, height: 600 },
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => window.__game?.sim?.player, { timeout: 45000 });
await new Promise((r) => setTimeout(r, 1500));
await page.keyboard.press('Escape');
await dismissEntryOverlays(page);

await page.evaluate(() => {
  const g = () => window.__game;
  window.__pt = {
    state() {
      const p = g()?.sim?.player;
      return { active: g()?.ptActiveMap?.()?.id ?? null, standby: g()?.ptStandbyMap?.()?.id ?? null, x: p.pos.x, z: p.pos.z };
    },
    async gateInfo(destId) {
      const active = g()?.ptActiveMap?.();
      let e = (active.fieldGates ?? []).find((x) => x.targetId === destId);
      if (!e) {
        const links = await g().ptLinks(active.id);
        e = (links?.fieldGates ?? []).find((x) => x.otherId === destId) ?? null;
      }
      if (!e) return null;
      const gx = active.transform.ptXToWoC(e.x);
      const gz = active.transform.ptZToWoC(e.z);
      const b = active.field.PT_BOUNDS;
      const cx = active.transform.ptXToWoC((b.minX + b.maxX) / 2);
      const cz = active.transform.ptZToWoC((b.minZ + b.maxZ) / 2);
      return { gateX: gx, gateZ: gz, baseH: Math.atan2(gx - cx, gz - cz) };
    },
    routeLine(gate, dh, off) {
      const h = gate.baseH + (dh * Math.PI) / 180;
      const dx = Math.sin(h), dz = Math.cos(h);
      const tx = -dz, tz = dx;
      return { px: gate.gateX - dx * 18 + tx * off, pz: gate.gateZ - dz * 18 + tz * off, heading: h };
    },
    placeAt(x, y, z, facing) {
      const p = g().sim.player;
      p.pos.x = x; p.pos.y = y; p.pos.z = z;
      p.prevPos.x = x; p.prevPos.y = y; p.prevPos.z = z;
      p.facing = facing; p.velX = 0; p.velY = 0; p.velZ = 0;
    },
    setFacing(f) { g().sim.player.facing = f; },
  };
});

// install ricarten via the real chat path
await page.keyboard.press('Enter');
await page.keyboard.type('/ptmap ricarten');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__pt.state().active === 'ricarten', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1000));

const gate = await page.evaluate(() => window.__pt.gateInfo('fore-1'));
console.log('gate', JSON.stringify(gate));

const candidates = [];
for (const dh of [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30]) {
  for (const off of [-10, -6, -3, 0, 3, 6, 10]) {
    candidates.push({ dh, off });
  }
}

for (const c of candidates) {
  const line = await page.evaluate((a) => window.__pt.routeLine(a.gate, a.dh, a.off), { gate, ...c });
  const y = await page.evaluate((p) => window.__game.ptField().groundHeight(p.px, p.pz), line);
  if (!Number.isFinite(y)) { console.log(`dh=${c.dh} off=${c.off}: no floor`); continue; }
  const s0 = await page.evaluate(() => window.__pt.state());
  await page.evaluate((a) => window.__pt.placeAt(a.px, a.y + 0.05, a.pz, a.heading), { ...line, y });
  // walk ~4s
  const t0 = Date.now();
  await page.keyboard.down('w');
  let end = null;
  while (Date.now() - t0 < 4000) {
    await page.evaluate((h) => window.__pt.setFacing(h), line.heading);
    await new Promise((r) => setTimeout(r, 100));
    end = await page.evaluate(() => window.__pt.state());
    if (end.active === 'fore-1') break;
  }
  await page.keyboard.up('w');
  const dist = Math.hypot(end.x - s0.x, end.z - s0.z);
  console.log(`dh=${c.dh} off=${c.off}: moved ${dist.toFixed(1)}yd -> active=${end.active} @(${end.x.toFixed(1)},${end.z.toFixed(1)})`);
  if (end.active === 'fore-1') {
    console.log(`*** CROSSING FOUND: dh=${c.dh} off=${c.off}`);
  }
}
await browser.close();
