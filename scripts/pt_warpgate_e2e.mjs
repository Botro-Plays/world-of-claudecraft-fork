// PT WarpGate connected-world E2E (dev harness, offline world).
//
// Drives the real proximity-teleport path: installs a source map through
// the /ptmap command, positions the player just outside the authored
// trigger cylinder, walks INTO the cylinder with real keyboard movement
// until CheckWarpGate fires, then asserts:
//   - the active map flipped to the authored destination field,
//   - the player landed on an authored WarpOutGate coordinate verbatim
//     (destination-field transform, never the source transform),
//   - no immediate re-trigger (the dwWarpDelayTime 3s lockout),
//   - SpecialEffect 0 warps immediately, SpecialEffect 1 holds the player
//     at the gate ~2s first, SpecialEffect 2 arms the wing-warp flow.
// A tight-cylinder gate that real movement cannot enter (height band
// above the walk floor) falls back to a direct placement inside the
// trigger, logged as such: the warp itself always fires through the real
// proximity check, never a debug teleport.
//
// Routes covered (all authored, from field.cpp):
//   dun-1 -> ruin-1 -> dun-1   reciprocal immediate warps
//   dun-4 -> dun-5             level-75 gate, three-exit record
//   ba1 -> town1               one-way (town1 authors no return gate)
//   ice3 -> ricarten           one-way (village-2 is the ricarten package)
//   ancientw SE1               delayed warp onto the no-floor self exit
//   ricarten SE2 wing warp     arm + destination select -> fore-2 PosWarpOut
//   ricarten L180 -> dc1       level gate: denied at 1, allowed at 180
//
// Usage: npm run dev on :5173, then `node scripts/pt_warpgate_e2e.mjs`.

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
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
});

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) failures++;
};

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
const booted = await page
  .waitForFunction(() => window.__game?.sim?.player, { timeout: 45000 })
  .then(() => true)
  .catch(() => false);
if (!booted) {
  console.log('FAIL: window.__game.sim.player never appeared');
  await page.screenshot({ path: 'tmp/ptwarp_boot_fail.png' });
  await browser.close();
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 1500));
await page.keyboard.press('Escape');
await dismissEntryOverlays(page);

// In-page helpers bound to the game's own objects via the __game debug
// surface (importing the modules in-page would resolve a second instance
// with stale null state under the Vite dev module graph).
await page.evaluate(() => {
  const g = () => window.__game;
  window.__pt = {
    state() {
      const p = g()?.sim?.player;
      return {
        active: g()?.ptActiveMap?.()?.id ?? null,
        standby: g()?.ptStandbyMap?.()?.id ?? null,
        x: p?.pos.x ?? 0,
        y: p?.pos.y ?? 0,
        z: p?.pos.z ?? 0,
        level: p?.level ?? 0,
      };
    },
    warp() {
      return g().ptWarp();
    },
    // The warp gate on the active field whose exits reach `targetId`
    // (or the index-th gate when targetId is null), with its trigger
    // center already in WoC coordinates.
    warpGate(targetId, index = 0) {
      const active = g()?.ptActiveMap?.();
      if (!active) return null;
      const all = active.warpGates ?? [];
      const gr = targetId === null
        ? all[index]
        : all.find((gr) => gr.exits.some((e) => e.targetId === targetId));
      if (!gr) return null;
      return {
        x: gr.x, z: gr.z, y: gr.y,
        size: gr.size, height: gr.height,
        limitLevel: gr.limitLevel, specialEffect: gr.specialEffect,
        wocX: active.transform.ptXToWoC(gr.x),
        wocY: active.transform.ptYToWoC(gr.y),
        wocZ: active.transform.ptZToWoC(gr.z),
        exits: gr.exits,
      };
    },
    // WoC coordinates of an authored exit on the CURRENT active field
    // (the destination after a warp), via the destination transform.
    exitWoc(exit) {
      const active = g()?.ptActiveMap?.();
      if (!active) return null;
      return {
        x: active.transform.ptXToWoC(exit.x),
        y: active.transform.ptYToWoC(exit.y),
        z: active.transform.ptZToWoC(exit.z),
      };
    },
    ground(x, z) {
      return g()?.ptField?.()?.groundHeight(x, z) ?? -Infinity;
    },
    placeAt(x, y, z, facing = 0) {
      const p = g().sim.player;
      p.pos.x = x; p.pos.y = y; p.pos.z = z;
      p.prevPos.x = x; p.prevPos.y = y; p.prevPos.z = z;
      p.facing = facing;
      p.velX = 0; p.velY = 0; p.velZ = 0;
    },
    faceTo(tx, tz) {
      const p = g().sim.player;
      p.facing = Math.atan2(tx - p.pos.x, tz - p.pos.z);
    },
    setLevel(l) {
      g().ptSetLevel(l);
    },
    wingWarp(i) {
      return g().ptWingWarp(i);
    },
  };
});

const ptState = () => page.evaluate(() => window.__pt.state());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function installMap(id) {
  // Real chat path: open the chat box, type the dev command, submit.
  await page.keyboard.press('Enter');
  await page.keyboard.type(`/ptmap ${id}`);
  await page.keyboard.press('Enter');
  const ok = await page
    .waitForFunction((id) => window.__pt.state().active === id, { timeout: 30000 }, id)
    .then(() => true)
    .catch(() => false);
  await sleep(800);
  return ok;
}

/**
 * Trigger `gate` on the active map. First tries real movement: probes a
 * ring outside the trigger radius for walkable floor, places the player
 * there, and walks toward the gate center. Falls back to a direct
 * placement just inside the cylinder (still the real proximity check).
 * Returns 'walk' or 'placed'.
 */
async function triggerGate(gate, timeoutMs = 12000) {
  const PT_YD = 0.036; // PT_SCALE: 1 PT unit in WoC yards
  const rWoc = gate.size * PT_YD;
  // Ring candidates just outside the radius (0.5..3yd out), 8 headings.
  for (const extra of [1.5, 3, 0.8]) {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const px = gate.wocX - Math.sin(a) * (rWoc + extra);
      const pz = gate.wocZ - Math.cos(a) * (rWoc + extra);
      const y = await page.evaluate((p) => window.__pt.ground(p.px, p.pz), { px, pz });
      if (!Number.isFinite(y)) continue;
      await page.evaluate(
        (a) => window.__pt.placeAt(a.px, a.y + 0.05, a.pz, 0),
        { px, pz, y },
      );
      await page.evaluate((g2) => window.__pt.faceTo(g2.wocX, g2.wocZ), gate);
      // Walk toward the gate center until the warp fires. Being inside the
      // XZ radius is NOT sufficient (the height band may still reject), so
      // "inside" only counts after the trigger actually fires; a player
      // sitting inside unfired for >1.5s means this corridor's floor is
      // out of band - bail to the direct-placement fallback.
      const t0 = Date.now();
      let insideSince = 0;
      await page.keyboard.down('w');
      try {
        while (Date.now() - t0 < timeoutMs / 2) {
          await sleep(150);
          await page.evaluate((g2) => window.__pt.faceTo(g2.wocX, g2.wocZ), gate);
          const s = await ptState();
          const w = await page.evaluate(() => window.__pt.warp());
          const d = Math.hypot(s.x - gate.wocX, s.z - gate.wocZ);
          if (s.active !== ACTIVE_ID || w.nextWarpDelay || w.warpInFlight) {
            return 'walk';
          }
          if (d < rWoc * 0.7) {
            if (insideSince === 0) insideSince = Date.now();
            if (Date.now() - insideSince > 1500) break;
          } else {
            insideSince = 0;
          }
        }
      } finally {
        await page.keyboard.up('w');
      }
    }
  }
  // Fallback: place directly inside the cylinder (near the authored
  // point). The proximity check still performs the warp - no debug
  // teleport is invoked anywhere in this path.
  await page.evaluate(
    (g2) => window.__pt.placeAt(g2.wocX, g2.wocY + 0.05, g2.wocZ, 0),
    gate,
  );
  await sleep(300);
  return 'placed';
}

let ACTIVE_ID = null;

/** Wait for the active map to become `dest` (or a warp to go in-flight). */
async function waitWarpTo(dest, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await ptState();
    if (s.active === dest) return s;
    await sleep(120);
  }
  return null;
}

/** Assert the player landed on one of the authored exits (verbatim).
 *  `snap` should be the player state at warp-flip detection; a later
 *  re-poll drifts because a held W key keeps walking at the destination
 *  (real post-teleport movement, not a teleport error). */
async function checkLanding(gate, srcId, snap = null, sameMap = false) {
  const s = snap ?? (await ptState());
  if (!sameMap) {
    check(`left ${srcId}`, s.active !== srcId && s.active !== null, `active=${s.active}`);
  }
  const landed = [];
  for (const e of gate.exits) {
    const w = await page.evaluate((ex) => window.__pt.exitWoc(ex), e);
    if (!w) continue;
    const d = Math.hypot(s.x - w.x, s.z - w.z);
    const dy = Math.abs(s.y - w.y);
    // XZ is the verbatim SetPosi coordinate plus up to ~2yd of real
    // post-landing movement (the warp fires while W is still held, so the
    // player walks a moment at the destination before the key releases);
    // Y settles onto the floor (or falls, at the no-floor exit).
    if (d < 2.0 && dy < 2.5) landed.push({ e, d, dy });
  }
  check(
    `landed on an authored exit coordinate (${gate.exits.length} exit(s))`,
    landed.length > 0,
    landed.length
      ? `d=${landed[0].d.toFixed(3)}yd dy=${landed[0].dy.toFixed(3)}`
      : `pos=(${s.x.toFixed(1)},${s.y.toFixed(1)},${s.z.toFixed(1)})`,
  );
}

// ---------------------------------------------------------------------------
// Test set
// ---------------------------------------------------------------------------

// A comfortable level for everything except the explicit level-gate test.
await page.evaluate(() => window.__pt.setLevel(200));

// --- 1. Reciprocal immediate warps: dun-1 -> ruin-1 -> dun-1 -------------
console.log('\n=== dun-1 <-> ruin-1 (SE0 reciprocal) ===');
ACTIVE_ID = 'dun-1';
check('/ptmap dun-1 installed', await installMap('dun-1'));
let gate = await page.evaluate(() => window.__pt.warpGate('ruin-1'));
check('dun-1 -> ruin-1 gate authored', gate !== null, gate && `SE${gate.specialEffect} L${gate.limitLevel}`);
if (gate) {
  const how = await triggerGate(gate);
  console.log(`  triggered by ${how}`);
  const s = await waitWarpTo('ruin-1');
  check('warped to ruin-1', s !== null, s && `at (${s.x.toFixed(1)},${s.z.toFixed(1)})`);
  await checkLanding(gate, 'dun-1', s);
  await sleep(1200);
  check('no immediate re-trigger (still ruin-1)', (await ptState()).active === 'ruin-1');
  // Reciprocal leg back.
  ACTIVE_ID = 'ruin-1';
  gate = await page.evaluate(() => window.__pt.warpGate('dun-1'));
  check('ruin-1 -> dun-1 gate authored', gate !== null, gate && `L${gate.limitLevel}`);
  if (gate) {
    await sleep(2200); // clear the 3s lockout first
    const how2 = await triggerGate(gate);
    console.log(`  triggered by ${how2}`);
    const s2 = await waitWarpTo('dun-1');
    check('warped back to dun-1', s2 !== null);
    await checkLanding(gate, 'ruin-1', s2);
  }
}

// --- 2. Level-75 multi-exit gate: dun-4 -> dun-5 --------------------------
console.log('\n=== dun-4 -> dun-5 (L75, 3 exits) ===');
ACTIVE_ID = 'dun-4';
check('/ptmap dun-4 installed', await installMap('dun-4'));
gate = await page.evaluate(() => window.__pt.warpGate('dun-5'));
check('dun-4 -> dun-5 gate authored', gate !== null, gate && `${gate.exits.length} exits L${gate.limitLevel}`);
if (gate) {
  const how = await triggerGate(gate);
  console.log(`  triggered by ${how}`);
  const s = await waitWarpTo('dun-5');
  check('warped to dun-5', s !== null);
  await checkLanding(gate, 'dun-4', s);
}

// --- 3. One-way: ba1 -> town1 ---------------------------------------------
console.log('\n=== ba1 -> town1 (one-way) ===');
ACTIVE_ID = 'ba1';
check('/ptmap ba1 installed', await installMap('ba1'));
gate = await page.evaluate(() => window.__pt.warpGate('town1'));
check('ba1 -> town1 gate authored', gate !== null);
if (gate) {
  const how = await triggerGate(gate);
  console.log(`  triggered by ${how}`);
  const s = await waitWarpTo('town1');
  check('warped to town1', s !== null);
  await checkLanding(gate, 'ba1', s);
  // One-way: town1 authors no gates at all - nothing can warp back.
  const back = await page.evaluate(() => window.__pt.warpGate('ba1'));
  const anyGate = await page.evaluate(() => window.__pt.warpGate(null, 0));
  check('no return gate on town1', back === null && anyGate === null);
}

// --- 4. One-way: ice3 -> ricarten ------------------------------------------
console.log('\n=== ice3 -> ricarten (one-way) ===');
ACTIVE_ID = 'ice3';
check('/ptmap ice3 installed', await installMap('ice3'));
gate = await page.evaluate(() => window.__pt.warpGate('ricarten'));
check('ice3 -> ricarten gate authored', gate !== null);
if (gate) {
  const how = await triggerGate(gate);
  console.log(`  triggered by ${how}`);
  const s = await waitWarpTo('ricarten');
  check('warped to ricarten', s !== null);
  await checkLanding(gate, 'ice3', s);
}

// --- 5. SE1 delayed warp: ancientw self-exit (the no-floor exit) ----------
console.log('\n=== ancientw SE1 (delayed, no-floor self exit) ===');
ACTIVE_ID = 'ancientw';
check('/ptmap ancientw installed', await installMap('ancientw'));
gate = await page.evaluate(() => window.__pt.warpGate(null, 0));
check('ancientw SE1 gate authored', gate !== null && gate.specialEffect === 1,
  gate && `SE${gate.specialEffect}`);
if (gate) {
  const t0 = Date.now();
  const how = await triggerGate(gate);
  console.log(`  triggered by ${how}`);
  // First pass: armed, player pinned at the gate center, still ancientw.
  const w1 = await page.evaluate(() => window.__pt.warp());
  const s1 = await ptState();
  const armedAt = Date.now() - t0;
  check('SE1 armed (dwNextWarpDelay)', w1.nextWarpDelay === true);
  check('player pinned at gate center',
    Math.hypot(s1.x - gate.wocX, s1.z - gate.wocZ) < 0.6,
    `d=${Math.hypot(s1.x - gate.wocX, s1.z - gate.wocZ).toFixed(2)}yd`);
  check('no teleport during the effect window', s1.active === 'ancientw');
  // Same-map warp: poll the position change (the active id stays
  // ancientw; the SE1 exit is a self-field coordinate ~10yd away).
  const t1 = Date.now();
  let moved = null;
  while (Date.now() - t1 < 8000) {
    const s = await ptState();
    if (Math.hypot(s.x - gate.wocX, s.z - gate.wocZ) > 2) { moved = s; break; }
    await sleep(100);
  }
  const delayMs = moved ? Date.now() - t0 : -1;
  check('SE1 warp landed after the delay', moved !== null,
    moved ? `~${delayMs}ms after trigger` : 'never moved');
  await checkLanding(gate, 'ancientw', moved, true);
}

// --- 6. SE2 wing warp: ricarten -> fore-2 PosWarpOut ----------------------
console.log('\n=== ricarten SE2 wing warp -> fore-2 ===');
ACTIVE_ID = 'ricarten';
check('/ptmap ricarten installed', await installMap('ricarten'));
gate = await page.evaluate(() => window.__pt.warpGate(null, 0));
check('ricarten wing gate authored', gate !== null && gate.specialEffect === 2,
  gate && `SE${gate.specialEffect}`);
if (gate) {
  const how = await triggerGate(gate);
  console.log(`  triggered by ${how}`);
  await sleep(400);
  const w = await page.evaluate(() => window.__pt.warp());
  // dwWarpDelayTime = 0xFFFF0000 (module Infinity) - Infinity serializes
  // as null across page.evaluate, so accept both representations.
  const blocked = w.warpDelayUntil === null || w.warpDelayUntil > 1e12;
  check('wing gate armed and blocked', w.nextWarpDelay === true && blocked,
    `armed=${w.nextWarpDelay} until=${w.warpDelayUntil}`);
  check('still on ricarten while armed', (await ptState()).active === 'ricarten');
  // The wing-gate destination select (the cSinWarpGate UI equivalent):
  // field 1 = fore-2, FieldLimitLevel 0, PosWarpOut authored.
  const sel = await page.evaluate(() => window.__pt.wingWarp(1));
  check('wing select fore-2 accepted', sel === true);
  await sleep(300);
  const s = await waitWarpTo('fore-2', 10000);
  check('warped to fore-2', s !== null);
  // Landed on fore-2's PosWarpOut, not a spawn or gate coordinate.
  const po = await page.evaluate(() => {
    const a = window.__game.ptActiveMap?.();
    return a?.posWarpOut ? {
      x: a.transform.ptXToWoC(a.posWarpOut.x),
      y: a.transform.ptYToWoC(a.posWarpOut.y),
      z: a.transform.ptZToWoC(a.posWarpOut.z),
    } : null;
  });
  const s2 = await ptState();
  check('landed on fore-2 PosWarpOut',
    po !== null && Math.hypot(s2.x - po.x, s2.z - po.z) < 0.6,
    po && `d=${Math.hypot(s2.x - po.x, s2.z - po.z).toFixed(2)}yd`);
}

// --- 7. Level gate: ricarten L180 -> dc1 ----------------------------------
console.log('\n=== ricarten L180 gate -> dc1 (level gating) ===');
check('/ptmap ricarten installed', await installMap('ricarten'));
await page.evaluate(() => window.__pt.setLevel(1));
gate = await page.evaluate(() => window.__pt.warpGate('dc1'));
check('L180 gate authored', gate !== null && gate.limitLevel === 180,
  gate && `L${gate.limitLevel}`);
if (gate) {
  await page.evaluate(
    (g2) => window.__pt.placeAt(g2.wocX, g2.wocY + 0.05, g2.wocZ, 0),
    gate,
  );
  await sleep(2500);
  const denied = await ptState();
  check('level 1 denied (still ricarten)', denied.active === 'ricarten',
    `active=${denied.active} level=${denied.level}`);
  await page.evaluate(() => window.__pt.setLevel(180));
  const s = await waitWarpTo('dc1', 10000);
  check('level 180 warped to dc1', s !== null);
  await checkLanding(gate, 'ricarten', s);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`}`);
// Known pre-existing noise (same classes the FieldGate E2E sees on this
// checkout): dev-server 502s and two unbuilt GLB assets. Anything else
// still fails the run.
const KNOWN_NOISE = [
  /Failed to load resource: the server responded with a status of 502/,
  /character visual unavailable, skipping view/,
];
const realErrors = errors.filter((e) => !KNOWN_NOISE.some((re) => re.test(e)));
if (errors.length) {
  console.log(`page errors: ${errors.length} (${realErrors.length} real, rest known noise)`);
  for (const e of errors.slice(0, 10)) console.log('  ' + e);
}
await browser.close();
process.exit(failures > 0 || realErrors.length > 0 ? 1 : 0);
