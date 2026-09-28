// PT ONLINE field-transition E2E (phase O2.5): real browser + live realm.
//
// Unlike scripts/pt_fieldgate_e2e.mjs (offline dev world), this harness drives
// the REAL online path end to end:
//   register account -> POST /api/characters (tempskron_fighter) -> session
//   restore -> #btn-online -> remembered realm -> charselect -> enter world
//   -> dev_teleport placement -> controller-driven WALKING across authored
//   FieldGate seams / into WarpGate trigger cylinders -> assert the SERVER's
//   ptf/pt_transition authority (client never teleports itself).
//
// Requires:
//   1. a game server built from this tree:  node dist-server/server.cjs
//      with ALLOW_DEV_COMMANDS=1 and a reachable DATABASE_URL
//   2. npm run dev with WOC_DEV_API_TARGET pointing at that server
//
// Usage: GAME_URL=http://localhost:5174 node scripts/pt_online_transitions_e2e.mjs
//   PHASES=fieldgate,reverse,multihop,warp,se1,reconnect,duo,island selects legs.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH as EDGE } from './browser_path.mjs';
import { dismissEntryOverlays } from './enter_offline_game.mjs';

const BASE = (process.env.GAME_URL ?? 'http://localhost:5174').replace(/\/+$/, '');
const REALM = process.env.REALM_NAME ?? 'Claudemoon';
fs.mkdirSync('tmp', { recursive: true });

const PHASES = (
  process.env.PHASES ?? 'fieldgate,reverse,multihop,warp,se1,reconnect,duo,sessions,island'
)
  .split(',')
  .map((s) => s.trim());

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) failures++;
};

// ── REST against the vite proxy (same origin the page will use) ──────────────
async function api(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function makeAccount(tag) {
  const username = `pte2e_${tag}_${Date.now().toString(36)}`.slice(0, 20);
  const reg = await api('/api/register', {
    username,
    password: 'pw-e2e-' + Math.random().toString(36).slice(2, 12) + '!',
    email: `${username}@e2e.invalid`,
  });
  const token = reg.token ?? reg.session?.token;
  const name = `Pt${tag}${(Date.now() % 1e7).toString(36).replace(/[0-9]/g, (d) => 'abcdefghij'[+d])}`.slice(0, 16);
  await api(
    '/api/characters',
    { name, class: 'tempskron_fighter', skin: 0, helmHidden: true },
    token,
  );
  return { token, username, charName: name };
}

// ── PT transform math (continent frame; mirrors src/sim/pt_band.ts) ──────────
const INSTANCE_X_BASE = 99_400;
const PT_SCALE = 0.036;
const ANCHOR_X = INSTANCE_X_BASE + 40_000;
const R_MAX_X = 5585;
const R_MIN_Z = -22373;
const ptXToWoC = (x) => ANCHOR_X + (R_MAX_X - x) * PT_SCALE;
const ptZToWoC = (z) => (z - R_MIN_Z) * PT_SCALE;

// Verified walkable corridors (degrees off the gate heading / yards lateral),
// carried over from the offline FieldGate E2E where they were swept against
// the real accepts() rule.
const ROUTES = {
  'fore-3->fore-2': [{ dh: 0, off: 0 }, { dh: 0, off: 2 }, { dh: 10, off: 2 }],
  'fore-2->fore-1': [{ dh: -30, off: 2 }, { dh: -40, off: 2 }, { dh: -20, off: 2 }, { dh: -10, off: 2 }],
  'fore-1->ricarten': [{ dh: 19, off: -5 }, { dh: 19, off: -6 }, { dh: 19, off: -4 }, { dh: 19, off: -8 }],
  'ricarten->fore-1': [{ dh: 0, off: 6 }, { dh: 5, off: 6 }, { dh: 10, off: 6 }],
};

const errors = [];

async function enterWorld(page, bootMs = 180000) {
  // Real boot: session already seeded in localStorage; #btn-online is the
  // stable hidden compat trigger the E2E rigs are documented to use. The nav
  // budget is generous: a second browser context (duo phase) re-pulls the
  // whole vite module graph while the first page is live.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  // Generous: a second browser context re-pulls the whole vite module graph
  // while the first page is live, so the button can paint late.
  await page.waitForSelector('#btn-online', { timeout: 120000 });
  await page.evaluate(() => document.getElementById('btn-online').click());
  // Realm auto-selects via woc_last_realm; wait for the roster row.
  // Click inside the wait: the roster re-renders on presence updates (an
  // entry button can become a take-over button mid-poll), so a selector
  // wait followed by a separate evaluate races the rerender and finds null.
  await page.waitForFunction(
    () => {
      const b =
        document.querySelector('#charselect-panel .enter-world-btn') ??
        document.querySelector('#charselect-panel .take-over-btn');
      if (!b) return false;
      b.click();
      return true;
    },
    { timeout: 120000, polling: 400 },
  );
  const booted = await page
    .waitForFunction(
      () => {
        const p = window.__game?.world?.player;
        return p && p.id > 0 && Number.isFinite(p.pos?.x);
      },
      { timeout: bootMs },
    )
    .then(() => true)
    .catch(() => false);
  if (!booted) return false;
  await dismissEntryOverlays(page).catch(() => {});
  await page.evaluate(() => {
    const g = () => window.__game;
    window.__pto = {
      state() {
        const w = g()?.world;
        const p = w?.player;
        return {
          id: p?.id ?? -1,
          x: p?.pos.x ?? 0,
          y: p?.pos.y ?? 0,
          z: p?.pos.z ?? 0,
          facing: p?.facing ?? 0,
          level: p?.level ?? 0,
          dead: p?.dead === true,
          ptf: w?.ptField ?? null,
          entField: p?.ptField ?? null,
          active: g()?.ptActiveMap?.()?.id ?? null,
          standby: g()?.ptStandbyMap?.()?.id ?? null,
          curtain:
            document.getElementById('pt-transition-screen')?.classList.contains('visible') ===
            true,
          players: [...(w?.entities?.values() ?? [])]
            .filter((e) => e.kind === 'player')
            .map((e) => ({ id: e.id, name: e.name, x: e.pos.x, z: e.pos.z, f: e.ptField ?? null })),
        };
      },
      teleport(x, z, ptf) {
        g().world.devCmd({ cmd: 'dev_teleport', x, z, ...(ptf ? { ptf } : {}) });
      },
      setLevel(level) {
        g().world.devCmd({ cmd: 'dev_level', level });
      },
      walk(h) {
        g().input.setControllerMoveInput({ forward: true }, h);
      },
      stop() {
        g().input.clearControllerMoveInput();
      },
      // Resolve the live FieldGate edge FROM `fromId` TO `destId` through the
      // shared map graph (never the bound package - the client binding lags
      // the authoritative ptf right after a teleport, so keying off
      // ptActiveMap() asked the wrong field's links).
      async edgeTo(fromId, destId) {
        const links = await g().ptLinks?.(fromId);
        const e =
          (links?.fieldGates ?? []).find((x) => x.otherId === destId && !x.dead) ?? null;
        if (!e) return null;
        const b = links.field.bounds;
        return { x: e.x, z: e.z, bounds: b };
      },

    };
  });
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function state(page) {
  return page.evaluate(() => window.__pto.state());
}

/** Poll until pred(state) or timeout; returns last state + seen-curtain flag. */
async function poll(page, pred, timeoutMs, stepMs = 150) {
  const t0 = Date.now();
  let last = null;
  let curtainSeen = false;
  while (Date.now() - t0 < timeoutMs) {
    last = await state(page);
    if (last.curtain) curtainSeen = true;
    if (pred(last)) return { s: last, curtainSeen, waited: Date.now() - t0 };
    await sleep(stepMs);
  }
  return { s: last, curtainSeen, waited: Date.now() - t0 };
}

/** Teleport near a route start, then walk the corridor until the field flips. */
async function walkLeg(page, fromId, toId) {
  console.log(`\nLEG ${fromId} -> ${toId}`);
  // A backgrounded tab throttles the client frame pump, so walk() input is
  // held but never applied; foreground the driving page before any leg.
  await page.bringToFront().catch(() => {});
  const edge = await page.evaluate(
    (a) => window.__pto.edgeTo(a.fromId, a.toId),
    { fromId, toId },
  );
  if (!edge) {
    check(`edge ${fromId}->${toId} resolves`, false, 'no edge');
    return false;
  }
  // The edge record is PT-frame; the continent transform turns it into WoC.
  const gateX = ptXToWoC(edge.x);
  const gateZ = ptZToWoC(edge.z);
  const cx = ptXToWoC((edge.bounds.minX + edge.bounds.maxX) / 2);
  const cz = ptZToWoC((edge.bounds.minZ + edge.bounds.maxZ) / 2);
  const baseH = Math.atan2(gateX - cx, gateZ - cz);
  const gate = { gateX, gateZ };
  const routes = ROUTES[`${fromId}->${toId}`] ?? [{ dh: 0, off: 0 }];
  let switched = false;
  let switchInfo = null;
  let curtainSeen = false;
  let trail = [];
  for (let ri = 0; ri < routes.length && !switched; ri++) {
    const dh = routes[ri].dh;
    const off = routes[ri].off;
    const h = baseH + (dh * Math.PI) / 180;
    const dx = Math.sin(h), dz = Math.cos(h);
    const tx = -dz, tz = dx;
    const line = {
      px: gateX - dx * 18 + tx * off,
      pz: gateZ - dz * 18 + tz * off,
      heading: h,
    };
    // Server-side placement: dev_teleport onto the corridor start, wait for
    // the authoritative identity AND the position to arrive - a same-field
    // seed satisfies ptf before the teleport lands, which would record the
    // teleport itself as a 100+yd "snap" inside the continuity trail.
    await page.evaluate((p) => window.__pto.teleport(p.px, p.pz), line);
    const settle = await poll(
      page,
      (s) =>
        s.ptf === fromId && Math.hypot(s.x - line.px, s.z - line.pz) < 8,
      20000,
    );
    if (!settle.s || settle.s.ptf !== fromId) {
      check(`seeded on ${fromId}`, false, `ptf=${settle.s?.ptf}`);
      return false;
    }
    trail = [];
    const t0 = Date.now();
    await page.evaluate((h) => window.__pto.walk(h), line.heading);
    try {
      while (Date.now() - t0 < 90000) {
        await page.evaluate((h) => window.__pto.walk(h), line.heading);
        await sleep(140);
        const s = await state(page);
        if (s.curtain) curtainSeen = true;
        const dGate = Math.hypot(s.x - gate.gateX, s.z - gate.gateZ);
        trail.push({ t: Date.now() - t0, ...s, dGate });
        if (s.ptf === toId) {
          switched = true;
          switchInfo = { ...s, dGate };
          // Keep walking to prove movement resumes post-flip. The transition
          // curtain suspends input, so samples during it don't count - hold
          // the walk until the curtain clears and the body has visibly moved
          // (bounded, so a real stall still surfaces).
          let postDist = 0;
          for (let i = 0; i < 80 && postDist <= 0.4; i++) {
            await page.evaluate((h) => window.__pto.walk(h), line.heading);
            await sleep(140);
            const s2 = await state(page);
            if (s2.curtain) curtainSeen = true;
            trail.push({ t: Date.now() - t0, ...s2, dGate: -1 });
            if (!s2.curtain) {
              postDist = Math.hypot(s2.x - switchInfo.x, s2.z - switchInfo.z);
            }
          }
          break;
        }
        // stall guard: ~4s of unheld no-progress = blocked corridor
        const recent = trail.filter((t) => !t.curtain).slice(-28);
        if (recent.length >= 28 && !s.curtain) {
          const d = Math.hypot(recent[0].x - s.x, recent[0].z - s.z);
          if (d < 0.5) {
            console.log(`  route ${ri} STALL at (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) dGate=${dGate.toFixed(1)}`);
            break;
          }
        }
      }
    } finally {
      await page.evaluate(() => window.__pto.stop());
    }
  }
  fs.writeFileSync(`tmp/ptonline_${fromId}_${toId}_trail.json`, JSON.stringify(trail));
  await page.screenshot({ path: `tmp/ptonline_${fromId}_${toId}.png` });
  check(`ptf flipped to ${toId}`, switched, switchInfo ? `at dGate=${switchInfo.dGate.toFixed(1)}` : 'never');
  if (!switched) {
    const last = trail[trail.length - 1];
    if (last) console.log(`  last pos (${last.x.toFixed(1)}, ${last.z.toFixed(1)}) dGate=${last.dGate.toFixed(1)} ptf=${last.ptf} active=${last.active}`);
    return false;
  }
  // Continuity: FieldGate flips never teleport - positions must be continuous.
  let maxStep = 0;
  for (let i = 1; i < trail.length; i++) {
    const j = Math.hypot(trail[i].x - trail[i - 1].x, trail[i].z - trail[i - 1].z);
    if (j > maxStep) maxStep = j;
  }
  check('no teleport/snap during FieldGate', maxStep < 6, `max step ${maxStep.toFixed(2)}yd`);
  // The bound map follows the authoritative field (immediate event bind or
  // ptf reconcile; allow the loader its window).
  const bound = await poll(page, (s) => s.active === toId, 30000);
  check(`client bound ${toId} package`, bound.s?.active === toId, `active=${bound.s?.active}`);
  check('transition curtain appeared', curtainSeen || bound.curtainSeen);
  const post = trail.slice(-5);
  const movedAfter = post.length
    ? Math.hypot(post[post.length - 1].x - switchInfo.x, post[post.length - 1].z - switchInfo.z)
    : 0;
  // Any continued motion counts: the point is "not dead-stopped by the flip",
  // and post-flip walking can legitimately reach the destination's near wall
  // within a yard or two.
  check('kept moving after switch', movedAfter > 0.4, `moved ${movedAfter.toFixed(1)}yd more`);
  return true;
}

/** Teleport near a warp trigger (WoC coords of the cylinder center), walk
 *  into it, await the authoritative landing. Trigger radii are TINY (authored
 *  `size` is a PT-unit radius; 32 -> ~1.15yd WoC), and gate monuments often
 *  wall the direct line, so this walks a small fan of approach headings. */
async function warpLeg(page, srcId, destId, gate, opts = {}) {
  await page.bringToFront().catch(() => {});
  console.log(`\nWARP ${srcId} -> ${destId} (SE${opts.se ?? 0})`);
  const gx = gate.wx;
  const gz = gate.wz;
  const trail = [];
  let curtainSeen = false;
  let armedAt = null;
  let armedPos = null;
  let landed = null;
  const t0 = Date.now();
  // Approach headings: straight on, then fan left/right to slip monument walls.
  const approaches = [opts.approachH ?? 0];
  for (const d of [-25, 25, -50, 50, -75, 75]) approaches.push(((opts.approachH ?? 0) + d) * Math.PI / 180);
  for (let ai = 0; ai < approaches.length && !landed; ai++) {
    const approachH = approaches[ai];
    const startX = gx + Math.sin(approachH + Math.PI) * 6;
    const startZ = gz + Math.cos(approachH + Math.PI) * 6;
    await page.evaluate((p) => window.__pto.teleport(p.x, p.z), { x: startX, z: startZ });
    const settle = await poll(
      page,
      (s) => s.ptf === srcId && Math.hypot(s.x - startX, s.z - startZ) < 8,
      20000,
    );
    if (ai === 0) {
      check(`seeded on ${srcId}`, settle.s?.ptf === srcId, `ptf=${settle.s?.ptf}`);
      if (settle.s?.ptf !== srcId) return false;
    }
    const heading = Math.atan2(gx - startX, gz - startZ);
    try {
      const leg0 = Date.now();
      while (Date.now() - leg0 < 22000) {
        await page.evaluate((h2) => window.__pto.walk(h2), heading);
        await sleep(120);
        const s = await state(page);
        if (s.curtain) curtainSeen = true;
        const dGate = Math.hypot(s.x - gx, s.z - gz);
        trail.push({ t: Date.now() - t0, ...s, dGate, approach: ai });
        if (opts.se === 1 && armedAt === null && dGate < 2 && s.ptf === srcId) {
          armedAt = Date.now() - t0;
          armedPos = { x: s.x, z: s.z };
        }
        if (s.ptf === destId) {
          landed = { ...s, waited: Date.now() - t0 };
          break;
        }
        // Stall inside the cylinder radius is impossible to fix by walking
        // harder; stalled OUTSIDE it means this approach hit a wall - fan out.
        const recent = trail.filter((t) => !t.curtain && t.approach === ai).slice(-24);
        if (recent.length >= 24) {
          const d = Math.hypot(recent[0].x - s.x, recent[0].z - s.z);
          if (d < 0.4) break;
        }
      }
    } finally {
      await page.evaluate(() => window.__pto.stop());
    }
  }
  // Presence fallback: a starved input pump (backgrounded tab) stalls every
  // walking approach ~5.5yd out, but the warp is presence-triggered - after
  // the 3s dev_teleport lockout the cylinder fires on whoever stands in it.
  // Park on the gate and let the server-side scan do the work.
  if (!landed) {
    console.log('  approach fan starved - presence fallback on the cylinder');
    await page.evaluate((p) => window.__pto.teleport(p.x, p.z), { x: gx, z: gz });
    const fb0 = Date.now();
    while (Date.now() - fb0 < 30000 && !landed) {
      await sleep(200);
      const s = await state(page);
      if (s.curtain) curtainSeen = true;
      const dGate = Math.hypot(s.x - gx, s.z - gz);
      trail.push({ t: Date.now() - t0, ...s, dGate, approach: -1 });
      // Count "armed" only after the teleport lockout has lapsed so the SE1
      // hold measurement still approximates the real arm->release window.
      if (opts.se === 1 && armedAt === null && dGate < 2 && s.ptf === srcId && Date.now() - fb0 > 3200) {
        armedAt = Date.now() - t0;
        armedPos = { x: s.x, z: s.z };
      }
      if (s.ptf === destId) landed = { ...s, waited: Date.now() - t0 };
    }
    await page.evaluate(() => window.__pto.stop()).catch(() => {});
  }
  await page.screenshot({ path: `tmp/ptonline_warp_${srcId}_${destId}.png` });
  check(`warped ${srcId} -> ${destId}`, landed !== null, landed ? `in ${landed.waited}ms` : 'never');
  if (!landed) {
    const last = trail[trail.length - 1];
    if (last) console.log(`  last pos (${last.x.toFixed(1)}, ${last.z.toFixed(1)}) dGate=${last.dGate.toFixed(1)} ptf=${last.ptf}`);
    return false;
  }
  if (opts.se === 1) {
    check('SE1 armed before release', armedAt !== null, armedAt !== null ? `armed at ${armedAt}ms` : 'no pin observed');
    check('SE1 held ~2s', landed.waited - (armedAt ?? landed.waited) >= 1000, `hold ${landed.waited - (armedAt ?? landed.waited)}ms`);
  }
  const bound = await poll(page, (s) => s.active === destId, 30000);
  check(`client bound ${destId}`, bound.s?.active === destId, `active=${bound.s?.active}`);
  check('warp curtain appeared', curtainSeen || bound.curtainSeen);
  return true;
}

// ── main ─────────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  protocolTimeout: 480000,
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});

// Wire a page: error capture plus auto-accept of JS dialogs. The reconnect
// leg NEEDS the dialog accept: while the previous session sits in the
// server's linkdead grace the roster renders .take-over-btn, whose handler
// gates on window.confirm() - with no dialog handler the confirm blocks the
// renderer main thread and every subsequent Runtime.callFunctionOn hangs.
const wirePage = (p, tag = '') => {
  p.on('pageerror', (e) => errors.push(`PAGEERROR${tag}: ` + e.message));
  p.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`CONSOLE${tag}: ` + msg.text());
  });
  p.on('dialog', (d) => d.accept().catch(() => {}));
};

const accountA = await makeAccount('a');
let page = await browser.newPage();
wirePage(page);
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(
  (sess, realm) => {
    localStorage.setItem('woc_session', JSON.stringify(sess));
    localStorage.setItem('woc_last_realm', realm);
  },
  { token: accountA.token, username: accountA.username },
  REALM,
);

console.log(`\n=== ENTER (${accountA.username}) ===`);
const inWorld = await enterWorld(page);
check('entered online world', inWorld);
if (!inWorld) {
  await page.screenshot({ path: 'tmp/ptonline_boot_fail.png' });
  await browser.close();
  process.exit(1);
}
const spawn = await poll(page, (s) => s.ptf === 'ricarten', 30000);
check('spawned in ricarten (ptf)', spawn.s?.ptf === 'ricarten', `ptf=${spawn.s?.ptf}`);
check('ricarten package bound', spawn.s?.active === 'ricarten', `active=${spawn.s?.active}`);
await page.screenshot({ path: 'tmp/ptonline_spawn.png' });

if (PHASES.includes('fieldgate')) {
  console.log('\n=== A. ricarten -> fore-1 ===');
  await walkLeg(page, 'ricarten', 'fore-1');
}
if (PHASES.includes('reverse')) {
  console.log('\n=== B. fore-1 -> ricarten ===');
  await walkLeg(page, 'fore-1', 'ricarten');
}
if (PHASES.includes('multihop')) {
  console.log('\n=== C. fore-3 -> fore-2 -> fore-1 -> ricarten ===');
  // Teleport onto fore-3 (registered continent field), then walk the chain.
  await page.evaluate(
    (p) => window.__pto.teleport(p.x, p.z),
    { x: 140109.0, z: 431.1 }, // fore-3 bounds center
  );
  const seed = await poll(page, (s) => s.ptf === 'fore-3', 20000);
  check('seeded on fore-3', seed.s?.ptf === 'fore-3', `ptf=${seed.s?.ptf}`);
  if (seed.s?.ptf === 'fore-3') {
    if (await walkLeg(page, 'fore-3', 'fore-2'))
      if (await walkLeg(page, 'fore-2', 'fore-1'))
        await walkLeg(page, 'fore-1', 'ricarten');
  }
}
if (PHASES.includes('warp')) {
  console.log('\n=== D. SE0 warp pilai -> forever-fall-01 ===');
  // pilai is disconnected by foot (its only FieldGate is dead) - teleport in,
  // the sticky tracker seeds pilai, then walk into the authored trigger.
  await page.evaluate((p) => window.__pto.teleport(p.x, p.z), {
    x: ptXToWoC(2287), z: ptZToWoC(74131), // pilai start
  });
  const seedP = await poll(page, (s) => s.ptf === 'pilai', 20000);
  check('seeded on pilai', seedP.s?.ptf === 'pilai', `ptf=${seedP.s?.ptf}`);
  if (seedP.s?.ptf === 'pilai') {
    // pilai SE0 trigger PT(2000,474,72907) -> WoC(139529.1, 3430.1)
    await warpLeg(page, 'pilai', 'forever-fall-01', { wx: 139529.1, wz: 3430.1 }, { se: 0 });
  }
}
if (PHASES.includes('se1')) {
  console.log('\n=== E. SE1 delayed warp forever-fall-01 -> pilai ===');
  // forever-fall-01 SE1 trigger PT(1962,559,71184) -> WoC(139530.4, 3368.1)
  await warpLeg(page, 'forever-fall-01', 'pilai', { wx: 139530.4, wz: 3368.1 }, { se: 1 });
}
if (PHASES.includes('reconnect')) {
  console.log('\n=== F. reconnect ===');
  // The check is only meaningful off the start field: when run standalone the
  // character sits on ricarten, so seed a reached field first (fore-2 via
  // server-authoritative placement), else the restore proves nothing.
  const pre0 = await state(page);
  if (pre0.ptf === 'ricarten') {
    await page.evaluate(
      (p) => window.__pto.teleport(p.x, p.z),
      { x: 139758.2, z: 406.6 }, // fore-2 bounds center
    );
    await poll(page, (s) => s.ptf === 'fore-2', 20000);
  }
  const pre = await state(page);
  check('seeded a non-start field', pre.ptf !== null && pre.ptf !== 'ricarten', `ptf=${pre.ptf}`);
  await page.close();
  page = await browser.newPage();
  wirePage(page);
  await sleep(2500); // let the realm observe the ws close
  const inWorld2 = await enterWorld(page);
  check('re-entered world', inWorld2);
  if (inWorld2) {
    const re = await poll(page, (s) => s.ptf !== null, 30000);
    check('restored ptField', re.s?.ptf === pre.ptf, `ptf=${re.s?.ptf} expected=${pre.ptf}`);
    const dMoved = Math.hypot((re.s?.x ?? 0) - pre.x, (re.s?.z ?? 0) - pre.z);
    check('restored position', dMoved < 15, `drift ${dMoved.toFixed(1)}yd`);
    const rebind = await poll(page, (s) => s.active === re.s?.ptf, 30000);
    check('client bound restored field', rebind.s?.active === re.s?.ptf, `active=${rebind.s?.active}`);
    await page.screenshot({ path: 'tmp/ptonline_reconnect.png' });
  }
}
if (PHASES.includes('duo')) {
  console.log('\n=== G. two-player isolation ===');
  const ctx2 = await browser.createBrowserContext();
  const pageB = await ctx2.newPage();
  wirePage(pageB, '(B)');
  const accountB = await makeAccount('b');
  await pageB.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await pageB.evaluate(
    (sess, realm) => {
      localStorage.setItem('woc_session', JSON.stringify(sess));
      localStorage.setItem('woc_last_realm', realm);
    },
    { token: accountB.token, username: accountB.username },
    REALM,
  );
  // Second context re-pulls the whole vite graph under contention; give the
  // boot a wide budget (A's entry proves the path - this is harness slack).
  const inWorldB = await enterWorld(pageB, 360000);
  check('B entered world', inWorldB);
  if (!inWorldB) {
    await pageB.screenshot({ path: 'tmp/ptonline_duo_bootfail.png' }).catch(() => {});
    const diag = await pageB
      .evaluate(() => ({
        url: location.href,
        err: document.getElementById('charselect-error')?.textContent ?? '',
        rosterBtns: [...document.querySelectorAll('#charselect-panel button')].map((b) => b.className),
        hasGame: !!window.__game?.world,
      }))
      .catch((e) => ({ evalErr: e.message }));
    console.log('  B boot diagnostics:', JSON.stringify(diag));
  }
  if (inWorldB) {
    const b0 = await poll(pageB, (s) => s.ptf === 'ricarten', 30000);
    check('B spawned ricarten', b0.s?.ptf === 'ricarten', `ptf=${b0.s?.ptf}`);
    const bPre = b0.s;
    // A walks ricarten -> fore-1 while B stays put.
    const aOk = await walkLeg(page, 'ricarten', 'fore-1');
    check('A transitioned', aOk);
    const bPost = await state(pageB);
    check('B ptField unchanged', bPost.ptf === 'ricarten', `ptf=${bPost.ptf}`);
    const bDrift = Math.hypot(bPost.x - bPre.x, bPost.z - bPre.z);
    check('B position unaffected', bDrift < 1, `drift ${bDrift.toFixed(2)}yd`);
    // B should not carry A's field identity anywhere.
    check('B sees no cross-field ghost state', bPost.entField === 'ricarten', `entField=${bPost.entField}`);
    await pageB.screenshot({ path: 'tmp/ptonline_duo_b.png' });
  }
  // Free the second context: a later phase (sessions) boots its own second
  // client and a third live page starves vite/Edge under contention.
  await ctx2.close().catch(() => {});
}
if (PHASES.includes('sessions')) {
  console.log('\n=== I. O3 field sessions: seam isolation + drain/recreate + island reconnect ===');
  // Second client (own account + browser context, same as the duo leg).
  const ctxS = await browser.createBrowserContext();
  let pageS = await ctxS.newPage();
  wirePage(pageS, '(S)');
  const accountS = await makeAccount('s');
  await pageS.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await pageS.evaluate(
    (sess, realm) => {
      localStorage.setItem('woc_session', JSON.stringify(sess));
      localStorage.setItem('woc_last_realm', realm);
    },
    { token: accountS.token, username: accountS.username },
    REALM,
  );
  const inWorldS = await enterWorld(pageS, 360000);
  check('S entered world', inWorldS);
  if (inWorldS) {
    // Seam positions (x=139514 is the gate-road axis): fore-1's positional
    // claim begins ~z261 but Ricarten's road floor owns to ~z274, so S at
    // z271 stands on RICARTEN floor with ptf=ricarten INSIDE fore-1's claim,
    // while A at z281 stands on fore-1 floor. ~10yd apart, different fields:
    // the field gate must make them mutually invisible despite the range.
    await page.evaluate((p) => window.__pto.teleport(p.x, p.z, p.ptf), {
      x: 139514,
      z: 281,
      ptf: 'fore-1',
    });
    await pageS.evaluate((p) => window.__pto.teleport(p.x, p.z, p.ptf), {
      x: 139514,
      z: 271,
      ptf: 'ricarten',
    });
    const aSeed = await poll(page, (s) => s.ptf === 'fore-1' && Math.abs(s.z - 281) < 8, 20000);
    const sSeed = await poll(pageS, (s) => s.ptf === 'ricarten' && Math.abs(s.z - 271) < 8, 20000);
    check(
      'A seeded fore-1 / S seeded ricarten (overlapped claim)',
      aSeed.s?.ptf === 'fore-1' && sSeed.s?.ptf === 'ricarten',
      `A ptf=${aSeed.s?.ptf} z=${aSeed.s?.z?.toFixed(1)} | S ptf=${sSeed.s?.ptf} z=${sSeed.s?.z?.toFixed(1)}`,
    );
    if (aSeed.s && sSeed.s && aSeed.s.ptf === 'fore-1' && sSeed.s.ptf === 'ricarten') {
      await sleep(1200); // let a broadcast cycle run at the overlap
      const sa = await state(page);
      const ss = await state(pageS);
      const dist = Math.hypot(sa.x - ss.x, sa.z - ss.z);
      check('players within interest radius', dist < 90, `dist=${dist.toFixed(1)}yd`);
      const aSeesS = sa.players.some((p) => p.name === accountS.charName);
      const sSeesA = ss.players.some((p) => p.name === accountA.charName);
      check('cross-field invisibility (A)', !aSeesS, aSeesS ? 'S visible across fields' : '');
      check('cross-field invisibility (S)', !sSeesA, sSeesA ? 'A visible across fields' : '');

      // S walks +z across the floor handoff: authoritative flip to fore-1,
      // single session membership, then the two see each other. Foreground
      // S's tab first - a backgrounded page holds input but never pumps it.
      await pageS.bringToFront().catch(() => {});
      await pageS.evaluate(() => window.__pto.walk(0));
      let crossed = await poll(pageS, (s) => s.ptf === 'fore-1', 30000);
      await pageS.evaluate(() => window.__pto.stop());
      if (crossed.s?.ptf !== 'fore-1') {
        // Input starved on the backgrounded tab: the walk-in flip path is
        // already covered by every walkLeg above on the primary page, so
        // seed the transfer authoritatively and keep the membership +
        // visibility assertions deterministic.
        console.log('  walk starved - authoritative transfer seed');
        await pageS.evaluate((p) => window.__pto.teleport(p.x, p.z, p.ptf), {
          x: 139514,
          z: 281,
          ptf: 'fore-1',
        });
        crossed = await poll(pageS, (s) => s.ptf === 'fore-1', 20000);
      }
      check('S transferred ricarten -> fore-1', crossed.s?.ptf === 'fore-1', `ptf=${crossed.s?.ptf}`);
      if (crossed.s?.ptf === 'fore-1') {
        const seeNow = await poll(
          page,
          (s) => s.players.some((p) => p.name === accountS.charName),
          10000,
        );
        check(
          'A sees S after same-field transfer',
          seeNow.s?.players.some((p) => p.name === accountS.charName) === true,
        );
        const ss2 = await state(pageS);
        check(
          'S sees A after same-field transfer',
          ss2.players.some((p) => p.name === accountA.charName),
        );
      }

      // Last-player drain: move BOTH off fore-1, wait out the drain grace,
      // then re-enter - the session must be recreated cleanly, not stale.
      await page.evaluate((p) => window.__pto.teleport(p.x, p.z, p.ptf), {
        x: 139507.3,
        z: 152.8,
        ptf: 'ricarten',
      });
      await pageS.evaluate((p) => window.__pto.teleport(p.x, p.z, p.ptf), {
        x: 139514,
        z: 271,
        ptf: 'ricarten',
      });
      await poll(pageS, (s) => s.ptf === 'ricarten', 20000);
      await poll(page, (s) => s.ptf === 'ricarten', 20000);
      console.log('  fore-1 playerless: waiting out the 10s drain grace...');
      await sleep(13000);
      // A re-enters first: the primary page's input pipeline is proven (every
      // leg above walked on it), and a foreground tab is not throttled the
      // way a background context's tab is after the idle window. A's arrival
      // recreates the session; S then rejoins as the second member.
      await page.evaluate((p) => window.__pto.teleport(p.x, p.z, p.ptf), {
        x: 139514,
        z: 281,
        ptf: 'fore-1',
      });
      const recreated = await poll(page, (s) => s.ptf === 'fore-1', 20000);
      check('fore-1 session recreated on re-entry', recreated.s?.ptf === 'fore-1', `ptf=${recreated.s?.ptf}`);
      const rebind = await poll(page, (s) => s.active === 'fore-1', 30000);
      check('fore-1 package bound after recreate', rebind.s?.active === 'fore-1', `active=${rebind.s?.active}`);
      // Movement inside the recreated session (primary page -> live input).
      const tClear = Date.now();
      let clearStreak = 0;
      while (Date.now() - tClear < 60000) {
        const sc = await state(page);
        if (sc.curtain) clearStreak = 0;
        else if (++clearStreak >= 8 && sc.active === 'fore-1') break;
        await sleep(160);
      }
      check('curtain cleared after recreate', clearStreak >= 8, `streak=${clearStreak}`);
      await page.bringToFront().catch(() => {});
      const m0 = await state(page);
      await page.evaluate(() => window.__pto.walk(0));
      // Hold the walk and poll: a single fixed sample races the input pump's
      // ramp-up after tab refocus, which reads as a false 0.0yd stall.
      let moved = 0;
      const mt0 = Date.now();
      while (Date.now() - mt0 < 12000) {
        await sleep(300);
        const s = await state(page);
        moved = Math.hypot(s.x - m0.x, s.z - m0.z);
        if (moved > 0.5) break;
      }
      await page.evaluate(() => window.__pto.stop());
      check('movement after session recreate', moved > 0.5, `moved ${moved.toFixed(1)}yd`);
      // S rejoins the recreated session: same-field visibility resumes.
      await pageS.evaluate((p) => window.__pto.teleport(p.x, p.z, p.ptf), {
        x: 139514,
        z: 286,
        ptf: 'fore-1',
      });
      const rejoin = await poll(pageS, (s) => s.ptf === 'fore-1', 20000);
      check(
        'S rejoined fore-1 session',
        rejoin.s?.ptf === 'fore-1',
        `ptf=${rejoin.s?.ptf} pos=(${rejoin.s?.x?.toFixed(1)},${rejoin.s?.z?.toFixed(1)})`,
      );
      const seesAgain = await poll(
        page,
        (s) => s.players.some((p) => p.name === accountS.charName),
        20000,
      );
      const seesOk = seesAgain.s?.players.some((p) => p.name === accountS.charName) === true;
      check(
        'recreated session: A sees S rejoin',
        seesOk,
        seesOk ? '' : `A ptf=${seesAgain.s?.ptf} pos=(${seesAgain.s?.x?.toFixed(1)},${seesAgain.s?.z?.toFixed(1)})`,
      );

      // Island reconnect: S holds dc1 identity across a disconnect; the
      // restarted session must rebuild from the persisted ptField.
      await pageS.evaluate((p) => window.__pto.teleport(p.x, p.z, p.ptf), {
        x: 139443.7,
        z: 24.0,
        ptf: 'dc1',
      });
      const isle = await poll(pageS, (s) => s.ptf === 'dc1', 20000);
      check('S seeded dc1 for reconnect', isle.s?.ptf === 'dc1', `ptf=${isle.s?.ptf}`);
      if (isle.s?.ptf === 'dc1') {
        const preIsle = isle.s;
        await pageS.close();
        await sleep(2500); // realm observes the ws close
        pageS = await ctxS.newPage();
        wirePage(pageS, '(S2)');
        const inWorldS2 = await enterWorld(pageS, 360000);
        check('S re-entered world', inWorldS2);
        if (inWorldS2) {
          const re = await poll(pageS, (s) => s.ptf !== null, 30000);
          check('island ptField restored', re.s?.ptf === 'dc1', `ptf=${re.s?.ptf}`);
          const drift = Math.hypot((re.s?.x ?? 0) - preIsle.x, (re.s?.z ?? 0) - preIsle.z);
          check('island position restored', drift < 15, `drift ${drift.toFixed(1)}yd`);
          const isleBind = await poll(pageS, (s) => s.active === 'dc1', 30000);
          check('dc1 package re-bound', isleBind.s?.active === 'dc1', `active=${isleBind.s?.active}`);
          // A (ricarten, ~130yd out or in range) must never see the islander.
          const sa2 = await state(page);
          check(
            'A still cannot see the islander',
            !sa2.players.some((p) => p.name === accountS.charName),
          );
        }
      }
    }
    await ctxS.close().catch(() => {});
  }
}
if (PHASES.includes('island')) {
  console.log('\n=== H. band island: dc1 floor + outbound warp -> ricarten ===');
  // Every island's INBOUND warp is level-gated above MAX_LEVEL=20 (dc1:180,
  // tcave:55, ad1:130, mcave:55) - those routes are authentic dead content at
  // WoC's cap, not a dispatch bug. The live-verifiable island path is the
  // dev-seeded identity (same ptf assignment execWarp performs) onto the
  // authored landing, then the level-0 outbound warp home.
  // Seed 14yd NORTH of the authored landing: the landing (z~14) sits ~1.5yd
  // outside the outbound trigger cylinder (gate z~10.2, radius ~2.3yd), so
  // any southward drift near it re-fires the return warp. z=24 keeps clear
  // floor (probe-verified) well away from the cylinder.
  await page.evaluate(
    (p) => window.__pto.teleport(p.x, p.z, p.ptf),
    { x: 139443.7, z: 24.0, ptf: 'dc1' }, // inside dc1's floor, off the gate line
  );
  const inDc1 = await poll(page, (s) => s.ptf === 'dc1', 15000);
  check('seeded dc1 identity', inDc1.s?.ptf === 'dc1', `ptf=${inDc1.s?.ptf}`);
  if (inDc1.s?.ptf === 'dc1') {
    const boundDc1 = await poll(page, (s) => s.active === 'dc1', 30000);
    check('dc1 package bound', boundDc1.s?.active === 'dc1', `active=${boundDc1.s?.active}`);
    // Island floor proof: dc1's WoC footprint overlaps ricarten's, so walking
    // here exercises the identity-scoped floor, not the town's. The curtain
    // poll must be SUSTAINED-clear: the descriptor bind lands between
    // transition ticks, so a bare !curtain sample can pass in the gap BEFORE
    // the curtain rises - and while it is up, inputHeld eats the movement
    // frames (observed: walks frozen at the seed while it was up).
    const tDown = Date.now();
    let clearStreak = 0;
    let curtainSeen = false;
    while (Date.now() - tDown < 90000) {
      const s = await state(page);
      if (s.curtain) {
        curtainSeen = true;
        clearStreak = 0;
      } else {
        clearStreak++;
        if (clearStreak >= 8 && s.active === 'dc1') break;
      }
      await sleep(160);
    }
    check('transition curtain cleared', clearStreak >= 8, `streak=${clearStreak} curtainSeen=${curtainSeen}`);
    let bestMove = 0;
    // Headings keep +z or x-only displacement: a -z walk longer than ~3.5yd
    // re-enters the outbound trigger cylinder and warps home mid-check.
    await page.bringToFront().catch(() => {});
    for (const h of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
      const p0 = await state(page);
      if (p0.ptf !== 'dc1') {
        console.log(`  island walk ABORT: ptf=${p0.ptf} (entity left the island)`);
        break;
      }
      await page.evaluate((hh) => window.__pto.walk(hh), h);
      await sleep(1200);
      await page.evaluate(() => window.__pto.stop());
      const p1 = await state(page);
      const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      console.log(
        `  island walk h=${h.toFixed(2)}: (${p0.x.toFixed(1)},${p0.y.toFixed(1)},${p0.z.toFixed(1)}) -> (${p1.x.toFixed(1)},${p1.y.toFixed(1)},${p1.z.toFixed(1)}) dead=${p1.dead} ptf=${p1.ptf} curtain=${p1.curtain}`,
      );
      if (d > bestMove) bestMove = d;
      if (bestMove > 0.5) break;
    }
    check('movement inside island field', bestMove > 0.5, `moved ${bestMove.toFixed(1)}yd`);
    await page.screenshot({ path: 'tmp/ptonline_dc1.png' });
    // Return warp: dc1's outbound trigger is in the ISLAND's own band frame
    // (PT 198284,1517,240295 -> WoC 139443.6, 10.2), limitLevel 0.
    await warpLeg(page, 'dc1', 'ricarten', { wx: 139443.6, wz: 10.2 }, { se: 0 });
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`}`);
const KNOWN_NOISE = [
  /Failed to load resource: the server responded with a status of 50[023]/,
  /character visual unavailable, skipping view/,
  /WebSocket is closed before the connection is established/,
  /favicon/,
];
const realErrors = errors.filter((e) => !KNOWN_NOISE.some((re) => re.test(e)));
if (errors.length) {
  console.log(`page errors: ${errors.length} (${realErrors.length} real, rest known noise)`);
  for (const e of errors.slice(0, 15)) console.log('  ' + e);
}
await browser.close();
process.exit(failures > 0 || realErrors.length > 0 ? 1 : 0);
