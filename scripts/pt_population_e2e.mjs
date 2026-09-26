// PT ordinary-monster population E2E (Phase 6H-2, dev harness, offline world).
//
// Drives the real client through /ptmap and verifies the generated
// population pipeline end-to-end in a live browser session:
//   - /ptmap fore-1 installs the field, then teleporting next to a generated
//     spawn anchor produces field-owned mobs (ptFieldAnchor stamp, pt_*
//     template, mob_pt_* visual key) standing on the field floor,
//   - walking the player far away despawns the anchor group after the
//     source absence window (~14.6 s),
//   - ricarten (status: no-actors) owns no population,
//   - the standby field at the fore-1 -> ricarten seam never gains a
//     population of its own,
//   - no page errors, no 404s on models/creatures/pt fetches.
//
// Usage: npm run dev on :5173, then `node scripts/pt_population_e2e.mjs`.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH } from './browser_path.mjs';
import { dismissEntryOverlays } from './enter_offline_game.mjs';

const URL =
  (process.env.GAME_URL ?? 'http://localhost:5173') +
  '/?diagnostics=1&diagnosticsAuto=1';
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
const failedAssets = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
});
page.on('response', (r) => {
  if (r.status() === 404 && /models\/creatures\/pt\//.test(r.url())) {
    failedAssets.push(r.url());
  }
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
  await page.screenshot({ path: 'tmp/ptpop_boot_fail.png' });
  await browser.close();
  process.exit(1);
}
await sleep(1500);
await page.keyboard.press('Escape');
await dismissEntryOverlays(page);

// Give the test player a deep hp pool: spawned PT mobs aggro on a near
// player, and a dead player collapses the near-play gate the population
// lifecycle is exercised through.
await page.evaluate(() => {
  const g = window.__game;
  g.sim.player.hp = 1e9;
  const meta = g.sim.players.get?.(g.sim.player.id);
  if (meta) meta.maxHp = 1e9;
});

await page.evaluate(() => {
  const g = () => window.__game;
  window.__ptpop = {
    state() {
      return {
        active: g()?.ptActiveMap?.()?.id ?? null,
        standby: g()?.ptStandbyMap?.()?.id ?? null,
      };
    },
    placeAt(x, y, z) {
      const p = g().sim.player;
      p.pos.x = x; p.pos.y = y; p.pos.z = z;
      p.prevPos.x = x; p.prevPos.y = y; p.prevPos.z = z;
      p.velX = 0; p.velY = 0; p.velZ = 0;
    },
    ground(x, z) { return g().ptField().floorHeight(x, z); },
    async anchors(fieldId) {
      const mod = await import(`/generated/pt-maps/${fieldId}/population.generated.ts`);
      return mod.PT_FIELD_POPULATION.spawnAnchors;
    },
    anchorWoC(a) {
      const d = g()?.ptActiveMap?.();
      if (!d) return null;
      return { x: d.transform.ptXToWoC(a.x), z: d.transform.ptZToWoC(a.z), index: a.index };
    },
    ptMobs() {
      const out = [];
      for (const e of g().sim.entities.values()) {
        if (e.kind === 'mob' && e.ptFieldAnchor) {
          out.push({
            id: e.id,
            templateId: e.templateId,
            visualKey: e.visualKey,
            anchor: e.ptFieldAnchor,
            pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z },
            dead: !!e.dead,
          });
        }
      }
      return out;
    },
  };
});

async function installMap(id) {
  await page.keyboard.press('Enter');
  await page.keyboard.type(`/ptmap ${id}`);
  await page.keyboard.press('Enter');
  return page
    .waitForFunction((fid) => window.__ptpop.state().active === fid, { timeout: 30000 }, id)
    .then(() => true)
    .catch(() => false);
}

// Wait until at least `want` field-owned mobs exist (or the deadline).
async function waitForPtMobs(want, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let mobs = await page.evaluate(() => window.__ptpop.ptMobs());
  while (Date.now() < deadline && mobs.length < want) {
    await sleep(400);
    mobs = await page.evaluate(() => window.__ptpop.ptMobs());
  }
  return mobs;
}

// ---------------------------------------------------------------- fore-1
console.log('\n=== fore-1: anchor spawn, floor, absence despawn ===');
{
  const installed = await installMap('fore-1');
  check('/ptmap fore-1 installed', installed);
  if (installed) {
    await sleep(1500);
    const anchors = await page.evaluate(() => window.__ptpop.anchors('fore-1'));
    check('generated anchors readable in-page', anchors.length > 0, `${anchors.length}`);
    let spawned = [];
    if (anchors.length) {
      // Stand on the first anchor: near-gate distance is ~40 WoC yards.
      const w = await page.evaluate((a) => window.__ptpop.anchorWoC(a), anchors[0]);
      const gy = await page.evaluate((w2) => window.__ptpop.ground(w2.x, w2.z), w);
      await page.evaluate(
        (a) => window.__ptpop.placeAt(a.x, a.y, a.z),
        { x: w.x, y: Number.isFinite(gy) ? gy + 0.05 : 0, z: w.z },
      );
      spawned = await waitForPtMobs(1, 15000);
      check('anchor populates near the player', spawned.length > 0, `${spawned.length} mobs`);
      if (spawned.length) {
        const allOwned = spawned.every((m) => m.anchor.fieldId === 'fore-1');
        check('every spawned mob owned by fore-1', allOwned,
          spawned.map((m) => m.anchor.fieldId).join(','));
        const allPt = spawned.every((m) => /^pt_/.test(m.templateId));
        check('templates are pt_* catalog ids', allPt,
          spawned.map((m) => m.templateId).slice(0, 4).join(','));
        // templateId -> visual key runs through PT_MOB_KEYS (manifest.ts).
        const visualKeys = await page.evaluate(async () => {
          const mod = await import('/src/render/characters/pt_mob_visuals.ts');
          return window.__ptpop.ptMobs().map((m) => mod.PT_MOB_KEYS[m.templateId] ?? null);
        });
        check('visual keys resolve to mob_pt_*',
          visualKeys.every((k) => typeof k === 'string' && /^mob_pt_/.test(k)),
          visualKeys.slice(0, 4).join(','));
        // No floating/buried mobs: live pos.y within ~1 yd of the floor.
        const floorOk = await page.evaluate(() => {
          const field = window.__game.ptField();
          const out = [];
          for (const m of window.__ptpop.ptMobs()) {
            const f = field.floorHeight(m.pos.x, m.pos.z, m.pos.y + 2);
            out.push(Number.isFinite(f) ? Math.abs(f - m.pos.y) : Infinity);
          }
          return out;
        });
        check('mobs stand on the field floor', floorOk.every((d) => d < 1.0),
          `maxErr=${Math.max(...floorOk).toFixed(2)}yd`);
        await page.screenshot({ path: 'tmp/ptpop_fore1_spawned.png' });
      }
    }

    // Absence despawn: the check tracks anchor-0's own group, not the whole
    // field, because a "far" parking spot may still sit inside OTHER anchors'
    // near-play radius (those spawning is correct behavior). Park outside
    // every anchor's near radius: a corner 150 yd past the anchor bounding box.
    const targetIdx = anchors.length ? anchors[0].index : -1;
    const initialIds = new Set(spawned.map((m) => m.id));
    if (targetIdx >= 0) {
      const park = await page.evaluate((list) => {
        const pts = list.map((a) => window.__ptpop.anchorWoC(a));
        return {
          x: Math.min(...pts.map((p) => p.x)) - 150,
          z: Math.min(...pts.map((p) => p.z)) - 150,
        };
      }, anchors);
      await page.evaluate((p) => window.__ptpop.placeAt(p.x, 60, p.z), park);
      await sleep(19000);
      const survivors = await page.evaluate(
        (idx) => window.__ptpop.ptMobs().filter((m) => m.anchor.anchorIndex === idx && !m.dead),
        targetIdx,
      );
      check('absence window despawns the anchor group', survivors.length === 0,
        `${survivors.length} of anchor ${targetIdx} left`);
    }

    // Returning near the anchor re-arms it (lockout <= absence window on
    // fore-1 is 8 s, already elapsed during the far wait).
    if (targetIdx >= 0) {
      const w = await page.evaluate((a) => window.__ptpop.anchorWoC(a), anchors[0]);
      const gy = await page.evaluate((w2) => window.__ptpop.ground(w2.x, w2.z), w);
      await page.evaluate(
        (a) => window.__ptpop.placeAt(a.x, a.y, a.z),
        { x: w.x, y: Number.isFinite(gy) ? gy + 0.05 : 0, z: w.z },
      );
      const deadline = Date.now() + 15000;
      let fresh = [];
      while (Date.now() < deadline && fresh.length === 0) {
        await sleep(400);
        fresh = await page.evaluate(
          ({ idx, ids }) => window.__ptpop.ptMobs()
            .filter((m) => m.anchor.anchorIndex === idx && !m.dead && !ids.includes(m.id)),
          { idx: targetIdx, ids: [...initialIds] },
        );
      }
      check('anchor re-arms after absence', fresh.length > 0, `${fresh.length} new mobs`);
    }
  }
}

// ------------------------------------------------- ricarten: no population
console.log('\n=== ricarten: no-actors field owns no population ===');
{
  const installed = await installMap('ricarten');
  check('/ptmap ricarten installed', installed);
  if (installed) {
    await sleep(4000);
    const mobs = await page.evaluate(() => window.__ptpop.ptMobs());
    check('no field-owned mobs in ricarten', mobs.length === 0, `${mobs.length}`);
  }
}

// -------------------------------------- seam: standby never populates
console.log('\n=== seam: ricarten standby beside fore-1 ===');
{
  const installed = await installMap('fore-1');
  check('/ptmap fore-1 reinstalled for seam', installed);
  if (installed) {
    await sleep(1500);
    const gate = await page.evaluate(() => {
      const d = window.__game.ptActiveMap();
      const e = (d?.fieldGates ?? []).find((x) => x.targetId === 'ricarten');
      return e ? { x: d.transform.ptXToWoC(e.x), z: d.transform.ptZToWoC(e.z) } : null;
    });
    check('fore-1 -> ricarten gate resolves', gate !== null);
    if (gate) {
      const gy = await page.evaluate((g2) => window.__ptpop.ground(g2.x, g2.z), gate);
      await page.evaluate(
        (a) => window.__ptpop.placeAt(a.x, a.y, a.z),
        { x: gate.x, y: Number.isFinite(gy) ? gy + 0.05 : 0, z: gate.z },
      );
      const deadline = Date.now() + 30000;
      let s = await page.evaluate(() => window.__ptpop.state());
      while (Date.now() < deadline && s.standby !== 'ricarten' && s.active !== 'ricarten') {
        await sleep(400);
        s = await page.evaluate(() => window.__ptpop.state());
      }
      check('ricarten preloaded as standby', s.standby === 'ricarten' || s.active === 'ricarten',
        `standby=${s.standby} active=${s.active}`);
      await sleep(2000);
      const mobs = await page.evaluate(() => window.__ptpop.ptMobs());
      check('no ricarten-owned mobs while ricarten is standby',
        mobs.every((m) => m.anchor.fieldId !== 'ricarten'),
        mobs.map((m) => m.anchor.fieldId).join(',') || 'none');
      await page.screenshot({ path: 'tmp/ptpop_seam.png' });
    }
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`}`);
if (failedAssets.length) {
  console.log(`pt model 404s: ${failedAssets.length}`);
  for (const u of failedAssets.slice(0, 10)) console.log('  ' + u);
}
if (errors.length) {
  console.log(`page errors: ${errors.length}`);
  for (const e of errors.slice(0, 10)) console.log('  ' + e);
}
await browser.close();
process.exit(failures || failedAssets.length ? 1 : 0);
