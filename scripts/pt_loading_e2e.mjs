// PT 3D world visual loading E2E (Phase 6A + 6B, dev harness, offline world).
//
// Measures the real loading pipeline in the browser:
//   INITIAL LOAD (cold, first /ptmap):
//     command -> descriptor flip (module ready) -> view attach (all
//     textures settled) -> group visible (programs linked + textures
//     uploaded through the compile gate).
//   WARM LOAD: reinstall after other fields; loader cache resolves.
//   CONNECTED FIELD: standby descriptor -> standby attach -> standby
//     visible -> FieldGate crossing. Destination must be VISIBLE before
//     ownership flips, with headroom.
//   TRANSITION CURTAIN (Phase 6B): #pt-transition-screen must raise when the
//     bound map's view is not ready, name the destination, hold the ~2s
//     minimum presentation, lift without leaving a blank viewport, and never
//     repeat or spuriously fail.
//   RESOURCE CHECKS: every pt texture fetch must settle before the view
//   attaches (visual-ready before visible), no duplicate URL requests,
//   bounded 404s, no page/shader errors.
//
// Usage: npm run dev on :5173, then `node scripts/pt_loading_e2e.mjs`.

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH as EDGE } from './browser_path.mjs';
import { dismissEntryOverlays } from './enter_offline_game.mjs';

const URL = `${process.env.GAME_URL ?? 'http://localhost:5173'}/?diagnostics=1&diagnosticsAuto=1&gfx=high`;
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
const badTexUrls = new Set();
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`);
});
page.on('response', (r) => {
  if (!/textures\/pt-/.test(r.url())) return;
  if (r.status() === 404) texture404s.push(r.url());
  // The dev server SPA-fallbacks missing files to 200+HTML, so "missing"
  // under npm run dev is a non-image content type, not a 404 status.
  const ct = r.headers()['content-type'] ?? '';
  if (!ct.startsWith('image/')) badTexUrls.add(r.url());
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
  performance.setResourceTimingBufferSize?.(20000);
  window.__ptload = {};
  const L = Object.assign(window.__ptload, {
    events: [],
    _groups: new Map(),
    _vis: new Set(),
    _active: undefined,
    _standby: undefined,
    rec(name) {
      this.events.push({ t: performance.now(), name });
    },
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
    eventsSince(mark) {
      const t =
        typeof mark === 'number' ? mark : (this.events.find((e) => e.name === mark)?.t ?? 0);
      return this.events.filter((e) => e.t >= t);
    },
    at(name) {
      const e = this.events.find((x) => x.name === name);
      return e ? e.t : null;
    },
    atAfter(name, t) {
      const e = this.events.find((x) => x.name === name && x.t >= t);
      return e ? e.t : null;
    },
    lastAt(name) {
      const m = this.events.filter((x) => x.name === name);
      return m.length ? m[m.length - 1].t : null;
    },
    // pt texture resource entries: {url, start, end}; dedupes by exact name.
    texEntries() {
      const out = new Map();
      for (const r of performance.getEntriesByType('resource')) {
        if (!/\/textures\/pt-/.test(r.name)) continue;
        if (!out.has(r.name)) out.set(r.name, []);
        out.get(r.name).push({ start: r.fetchStart, end: r.responseEnd });
      }
      return out;
    },
    placeAt(x, y, z, facing = 0) {
      const p = g().sim.player;
      p.pos.x = x;
      p.pos.y = y;
      p.pos.z = z;
      p.prevPos.x = x;
      p.prevPos.y = y;
      p.prevPos.z = z;
      p.facing = facing;
      p.velX = 0;
      p.velY = 0;
      p.velZ = 0;
    },
    setFacing(f) {
      g().sim.player.facing = f;
    },
    async gateInfo(destId) {
      const active = g()?.ptActiveMap?.();
      if (!active) return null;
      let e = (active.fieldGates ?? []).find((x) => x.targetId === destId);
      if (!e && g().ptLinks) {
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
      const dx = Math.sin(h),
        dz = Math.cos(h);
      const tx = -dz,
        tz = dx;
      return {
        px: gate.gateX - dx * 18 + tx * off,
        pz: gate.gateZ - dz * 18 + tz * off,
        heading: h,
      };
    },
    groupVisible(id) {
      const grp = g()?.renderer?.scene?.getObjectByName(`pt-${id}-terrain`);
      return grp ? grp.visible === true : null;
    },
    curtainState() {
      const el = document.getElementById('pt-transition-screen');
      return {
        on: el?.classList.contains('visible') === true,
        name: el?.querySelector('.pts-field')?.textContent ?? '',
        failed: el?.classList.contains('failed') === true,
      };
    },
  });
  L._vis = new Set();
  L._curtain = false;
  L._curtainName = '';
  L._curtainFail = false;
  // Watcher: descriptor flips, view attach, the compile-gated reveal, and the
  // Phase 6B transition curtain (DOM overlay, polled like the scene graph).
  setInterval(() => {
    const st = L.state();
    if (st.active !== L._active) {
      L.rec(`active:${st.active}`);
      L._active = st.active;
    }
    if (st.standby !== L._standby) {
      L.rec(`standby:${st.standby}`);
      L._standby = st.standby;
    }
    for (const id of new Set([st.active, st.standby].filter(Boolean))) {
      const grp = g()?.renderer?.scene?.getObjectByName(`pt-${id}-terrain`);
      if (!grp) continue;
      if (L._groups.get(id) !== grp) {
        L._groups.set(id, grp);
        L.rec(`attach:${id}`);
        L._vis.delete(id);
      }
      if (grp.visible && !L._vis.has(id)) {
        L._vis.add(id);
        L.rec(`visible:${id}`);
      }
    }
    const pts = document.getElementById('pt-transition-screen');
    const on = pts?.classList.contains('visible') === true;
    const nm = pts?.querySelector('.pts-field')?.textContent ?? '';
    if (on && !L._curtain) L.rec('curtain:show');
    if (on && nm && nm !== L._curtainName) L.rec(`curtain-name:${nm}`);
    if (!on && L._curtain) L.rec('curtain:hide');
    const failed = on && pts.classList.contains('failed');
    if (failed && !L._curtainFail) L.rec('curtain:fail');
    L._curtain = on;
    L._curtainName = nm;
    L._curtainFail = failed;
  }, 30);
});

const evLast = (name) => page.evaluate((n) => window.__ptload.lastAt(n), name);
const atAfter = (name, t) => page.evaluate((n, tt) => window.__ptload.atAfter(n, tt), name, t);
const mark = (name) =>
  page.evaluate((n) => {
    const t = performance.now();
    window.__ptload.rec(n);
    return t;
  }, name);
const state = () => page.evaluate(() => window.__ptload.state());
const clearRes = () => page.evaluate(() => performance.clearResourceTimings());
const curtainEvents = (t0) =>
  page.evaluate(
    (tt) => window.__ptload.events.filter((e) => e.t >= tt && e.name.startsWith('curtain')),
    t0,
  );

async function waitEventAfter(name, t, timeoutMs) {
  return page
    .waitForFunction(
      (n, tt) => window.__ptload.atAfter(n, tt) !== null,
      { timeout: timeoutMs, polling: 80 },
      name,
      t,
    )
    .then(() => true)
    .catch(() => false);
}

// Install a field through the real /ptmap path; returns the event timeline.
// All waits are scoped to the cmd mark so revisits measure THIS install.
async function installMap(id, tag) {
  const pre = await state();
  const cmdT = await mark(`cmd:${tag}`);
  await page.keyboard.press('Enter');
  await page.keyboard.type(`/ptmap ${id}`);
  await page.keyboard.press('Enter');
  if (pre.active !== id) {
    const flipped = await waitEventAfter(`active:${id}`, cmdT, 60000);
    if (!flipped) return null;
  }
  const attached = await waitEventAfter(`attach:${id}`, cmdT, 120000);
  if (!attached) return null;
  await waitEventAfter(`visible:${id}`, cmdT, 60000);
  // Phase 6B: the transition curtain must have raised for this install and
  // lifted only after real readiness + the minimum presentation.
  await waitEventAfter('curtain:hide', cmdT, 60000);
  const ce = await curtainEvents(cmdT);
  const tShow = ce.find((e) => e.name === 'curtain:show')?.t ?? null;
  const tHide = ce.find((e) => e.name === 'curtain:hide')?.t ?? null;
  const names = ce.filter((e) => e.name.startsWith('curtain-name:')).map((e) => e.name.slice(13));
  const wanted = id.toUpperCase();
  check(`${tag} transition curtain raised`, tShow !== null);
  check(
    `${tag} curtain names the destination`,
    names.some((n) => n.includes(wanted)),
    names.join(' | ') || 'none',
  );
  check(
    `${tag} curtain held the minimum presentation`,
    tShow !== null && tHide !== null && tHide - tShow >= 1900,
    tShow !== null && tHide !== null ? `${(tHide - tShow).toFixed(0)}ms` : 'missing events',
  );
  check(
    `${tag} curtain did not repeat or fail`,
    ce.filter((e) => e.name === 'curtain:show').length === 1 &&
      !ce.some((e) => e.name === 'curtain:fail'),
  );
  const post = await page.evaluate((i) => {
    const cs = window.__ptload.curtainState();
    return { on: cs.on, vis: window.__ptload.groupVisible(i) };
  }, id);
  check(
    `${tag} stays visible after the curtain closes (no blank)`,
    post.on === false && post.vis === true,
    `curtain on=${post.on} visible=${post.vis}`,
  );
  return {
    cmd: cmdT,
    active: (await atAfter(`active:${id}`, cmdT)) ?? cmdT,
    attach: await atAfter(`attach:${id}`, cmdT),
    visible: await atAfter(`visible:${id}`, cmdT),
    curtainShow: tShow,
    curtainHide: tHide,
  };
}

// pt-texture fetch stats between clearRes() and now: count, span, dup urls.
// A URL that 404s legitimately produces up to MAX_LOAD_ATTEMPTS (3) resource
// entries - the shared loader's transient-retry budget, not a dedup miss -
// so only SUCCESSFUL urls re-fetched count as duplicates.
async function texStats() {
  const m = await page.evaluate(() => {
    const out = [];
    for (const [url, arr] of window.__ptload.texEntries()) {
      for (const e of arr) out.push({ url, start: e.start, end: e.end, n: arr.length });
    }
    return out;
  });
  const dup = m.filter((e) => e.n > (badTexUrls.has(e.url) ? 3 : 1));
  return {
    count: m.length,
    lastEnd: m.length ? Math.max(...m.map((e) => e.end)) : 0,
    firstStart: m.length ? Math.min(...m.map((e) => e.start)) : 0,
    dupUrls: [...new Set(dup.map((e) => e.url))],
    dupDetail: dup.map((e) => `${e.url} x${e.n}`),
  };
}

async function shot(name) {
  const el = await page.$('#game-canvas');
  if (el) await el.screenshot({ path: `tmp/ptload_${name}.png` });
}

const fmtDelta = (t, base) =>
  t === null ? 'never' : `${t >= base ? '+' : ''}${(t - base).toFixed(0)}ms`;

// ---------------- INITIAL LOAD: cold Ricarten ----------------
console.log('\n=== INITIAL: cold ricarten ===');
await clearRes();
const cold = await installMap('ricarten', 'cold');
check('ricarten installed (cold)', cold !== null);
if (cold) {
  const stats = await texStats();
  const tModule = cold.active - cold.cmd;
  const tBuild = cold.attach - cold.active;
  const tGpu = (cold.visible ?? cold.attach) - cold.attach;
  const tTotal = (cold.visible ?? cold.attach) - cold.cmd;
  console.log(
    `  module ready: ${tModule.toFixed(0)}ms | build+textures: ${tBuild.toFixed(0)}ms | ` +
      `gpu link/upload: ${tGpu.toFixed(0)}ms | cmd->visible: ${tTotal.toFixed(0)}ms | ` +
      `curtain ${fmtDelta(cold.curtainShow, cold.cmd)}..${fmtDelta(cold.curtainHide, cold.cmd)}`,
  );
  console.log(
    `  texture requests: ${stats.count}, first ${(stats.firstStart - cold.cmd).toFixed(0)}ms after cmd`,
  );
  check(
    'view attaches only after textures settled',
    cold.attach >= stats.lastEnd - 25,
    `attach=${cold.attach.toFixed(0)} lastTexEnd=${stats.lastEnd.toFixed(0)}`,
  );
  check(
    'no duplicate texture fetches (cold)',
    stats.dupUrls.length === 0,
    stats.dupDetail.join(', ') || 'none',
  );
  check('cold visual-ready under 30s', tTotal < 30000, `${tTotal.toFixed(0)}ms`);
}
await sleep(800);
await shot('ricarten_first');

// ---------------- CONNECTED: ricarten -> fore-1 ----------------
// Same corridor routing as the minimap/fieldgate e2e (swept passable lines).
const ROUTES = {
  'ricarten->fore-1': [
    { dh: 0, off: 6 },
    { dh: 5, off: 6 },
    { dh: 10, off: 6 },
  ],
  'fore-1->fore-2': [
    { dh: 30, off: -2 },
    { dh: 40, off: -2 },
    { dh: 20, off: -2 },
    { dh: 10, off: -2 },
    { dh: 50, off: -2 },
    { dh: 0, off: 0 },
  ],
  'fore-3->fore-2': [
    { dh: 0, off: 0 },
    { dh: 0, off: 2 },
    { dh: 10, off: 2 },
  ],
  'fore-2->fore-1': [
    { dh: -30, off: 2 },
    { dh: -40, off: 2 },
    { dh: -20, off: 2 },
    { dh: -10, off: 2 },
  ],
  'fore-1->ricarten': [
    { dh: 19, off: -5 },
    { dh: 19, off: -6 },
    { dh: 19, off: -4 },
    { dh: 19, off: -8 },
  ],
};

async function walkLeg(fromId, toId) {
  console.log(`\n=== LEG ${fromId} -> ${toId} ===`);
  const gate = await page.evaluate((t) => window.__ptload.gateInfo(t), toId);
  check(`edge ${fromId}->${toId} resolves`, gate !== null);
  if (!gate) return false;
  const routes = ROUTES[`${fromId}->${toId}`] ?? [{ dh: 0, off: 0 }];
  await clearRes();
  const tApproach = await mark(`approach:${fromId}->${toId}`);

  // Phase 1: stand at the first corridor start to trigger the gate scan.
  const r0 = await page.evaluate((a) => window.__ptload.routeLine(a.gate, a.dh, a.off), {
    gate,
    ...routes[0],
  });
  const y0 = await page.evaluate((p) => window.__game.ptField().groundHeight(p.px, p.pz), r0);
  if (!Number.isFinite(y0)) {
    check(`approach corridor on ${fromId} floor`, false, `y=${y0}`);
    return false;
  }
  await page.evaluate((a) => window.__ptload.placeAt(a.px, a.y + 0.05, a.pz, a.heading), {
    ...r0,
    y: y0,
  });
  const s0 = await state();
  if (s0.active !== fromId && s0.active !== toId) {
    check(`start on ${fromId}`, false, `active=${s0.active}`);
    return false;
  }

  // Phase 2: give the gate scan a bounded window to install the standby
  // before the walk, but keep going either way - the source cadence +
  // one-pending-install rule can legitimately land it mid-walk. Events are
  // re-read AFTER the crossing so mid-walk installs are measured for real.
  const standbyBeforeWalk =
    s0.standby === toId || (await waitEventAfter(`standby:${toId}`, tApproach, 30000));
  const alreadyVisible = await page.evaluate(
    (id) => window.__ptload.groupVisible(id) === true,
    toId,
  );
  if (!alreadyVisible && standbyBeforeWalk) {
    await waitEventAfter(`attach:${toId}`, tApproach, 90000);
    await waitEventAfter(`visible:${toId}`, tApproach, 60000);
  }
  const stats = await texStats();
  check(
    `${toId} no duplicate texture fetches`,
    stats.dupUrls.length === 0,
    stats.dupDetail.join(', ') || 'none',
  );

  // Phase 3: walk the corridors until ownership flips.
  let crossed = false;
  for (let ri = 0; ri < routes.length && !crossed; ri++) {
    const route = routes[ri];
    const line = await page.evaluate((a) => window.__ptload.routeLine(a.gate, a.dh, a.off), {
      gate,
      ...route,
    });
    const cy = await page.evaluate((p) => window.__game.ptField().groundHeight(p.px, p.pz), line);
    if (!Number.isFinite(cy)) {
      console.log(`  route ${ri} (dh ${route.dh}, off ${route.off}): no floor at start, skipping`);
      continue;
    }
    if (ri > 0) console.log(`  retrying route ${ri}: dh ${route.dh}deg off ${route.off}yd`);
    await page.evaluate((a) => window.__ptload.placeAt(a.px, a.y + 0.05, a.pz, a.heading), {
      ...line,
      y: cy,
    });
    const t0 = Date.now();
    await page.keyboard.down('w');
    try {
      while (Date.now() - t0 < 45000) {
        await page.evaluate((h) => window.__ptload.setFacing(h), line.heading);
        await sleep(150);
        const st = await state();
        if (st.active === toId) {
          crossed = true;
          break;
        }
        const dGate = Math.hypot(st.x - gate.gateX, st.z - gate.gateZ);
        if (dGate > 60) {
          console.log(
            `  route ${ri} wandered off the seam (dGate ${dGate.toFixed(0)}yd), next corridor`,
          );
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
  const tCross = await evLast(`active:${toId}`);
  // Phase 6B: the promotion raises the transition curtain; it must lift only
  // after the minimum presentation and never leave a blank viewport.
  await waitEventAfter('curtain:hide', tCross, 30000);
  const legCurtain = await curtainEvents(tApproach);
  const legShow = legCurtain.filter((e) => e.name === 'curtain:show');
  const legHide = legCurtain.find((e) => e.name === 'curtain:hide')?.t ?? null;
  const legNames = legCurtain
    .filter((e) => e.name.startsWith('curtain-name:'))
    .map((e) => e.name.slice(13));
  const tShow = legShow.at(-1)?.t ?? null;
  check(`${toId} transition curtain raised on promotion`, tShow !== null);
  if (tShow !== null && tCross !== null) {
    check(
      `${toId} curtain tied to the crossing`,
      tShow >= tCross - 500 && tShow <= tCross + 3000,
      `show ${fmtDelta(tShow, tCross)} vs cross`,
    );
  }
  check(
    `${toId} curtain names the destination`,
    legNames.some((n) => n.includes(toId.toUpperCase())),
    legNames.join(' | ') || 'none',
  );
  check(
    `${toId} curtain held the minimum presentation`,
    tShow !== null && legHide !== null && legHide - tShow >= 1900,
    tShow !== null && legHide !== null ? `${(legHide - tShow).toFixed(0)}ms` : 'missing events',
  );
  check(
    `${toId} curtain did not repeat or fail`,
    legShow.length === 1 && !legCurtain.some((e) => e.name === 'curtain:fail'),
    `${legShow.length} shows`,
  );
  const postCurtain = await page.evaluate((id) => {
    const cs = window.__ptload.curtainState();
    return { on: cs.on, failed: cs.failed, vis: window.__ptload.groupVisible(id) };
  }, toId);
  check(
    `${toId} stays visible after the curtain closes (no blank)`,
    postCurtain.on === false && postCurtain.vis === true,
    `curtain on=${postCurtain.on} visible=${postCurtain.vis}`,
  );
  // Re-read events now that the walk is over: standby/attach/visible may
  // have landed mid-walk, or predate the approach mark entirely (already
  // warm). Headroom counts only a visible event that precedes the cross.
  const tStandby =
    (await atAfter(`standby:${toId}`, tApproach)) ?? (await evLast(`standby:${toId}`));
  // Pair visible with the CURRENT group object: a post-approach attach means
  // the group was rebuilt this leg, so only a post-approach reveal counts.
  const tAttachPost = await atAfter(`attach:${toId}`, tApproach);
  const tAttach = tAttachPost ?? (await evLast(`attach:${toId}`));
  const tVisible =
    tAttachPost !== null
      ? await atAfter(`visible:${toId}`, tApproach)
      : await evLast(`visible:${toId}`);
  const nowVis = await page.evaluate((id) => window.__ptload.groupVisible(id), toId);
  check(`${toId} view present and visible after crossing`, nowVis === true, `visible=${nowVis}`);
  check(
    `${toId} standby descriptor installed before crossing`,
    tStandby !== null && tCross !== null && tStandby <= tCross,
    tStandby ? `+${(tStandby - tApproach).toFixed(0)}ms rel approach` : 'never installed',
  );
  if (tAttach && tAttach >= tApproach && stats.count) {
    check(
      `${toId} attaches only after its textures settled`,
      tAttach >= stats.lastEnd - 25,
      `attach=${(tAttach - tApproach).toFixed(0)}ms lastTex=${(stats.lastEnd - tApproach).toFixed(0)}ms`,
    );
  }
  if (tVisible && tCross) {
    const headroom = tCross - tVisible;
    console.log(
      `  timing: standby ${fmtDelta(tStandby, tApproach)} | ` +
        `attach ${fmtDelta(tAttach, tApproach)} | ` +
        `visible ${fmtDelta(tVisible, tApproach)} | ` +
        `cross +${(tCross - tApproach).toFixed(0)}ms | headroom ${headroom.toFixed(0)}ms | ` +
        `curtain ${fmtDelta(tShow, tCross)}..${fmtDelta(legHide, tCross)} rel cross`,
    );
    check(`${toId} visible before crossing (headroom)`, headroom > 0, `${headroom.toFixed(0)}ms`);
  } else {
    check(
      `${toId} visible before crossing (headroom)`,
      false,
      `visible=${tVisible} cross=${tCross}`,
    );
  }
  await shot(`${fromId}_${toId}`);
  return true;
}

const leg1 = await walkLeg('ricarten', 'fore-1');
if (leg1) await walkLeg('fore-1', 'fore-2');

// ---------------- reverse chain: fore-3 -> fore-2 -> fore-1 -> ricarten ----
console.log('\n=== CHAIN fore-3 -> fore-2 -> fore-1 -> ricarten ===');
const f3 = await installMap('fore-3', 'f3');
check('/ptmap fore-3 installed', f3 !== null);
if (f3) {
  await sleep(1000);
  for (const [a, b] of [
    ['fore-3', 'fore-2'],
    ['fore-2', 'fore-1'],
    ['fore-1', 'ricarten'],
  ]) {
    const ok = await walkLeg(a, b);
    if (!ok) break;
  }
}

// ---------------- INITIAL LOAD: warm ricarten ----------------
console.log('\n=== INITIAL: warm ricarten (revisit) ===');
await clearRes();
const warm = await installMap('ricarten', 'warm');
check('ricarten reinstalled (warm)', warm !== null);
if (warm) {
  const stats = await texStats();
  const tTotal = (warm.visible ?? warm.attach) - warm.cmd;
  console.log(
    `  warm: cmd->attach ${(warm.attach - warm.cmd).toFixed(0)}ms | ` +
      `cmd->visible ${tTotal.toFixed(0)}ms | new texture fetches: ${stats.count}`,
  );
  check(
    'warm load faster than cold',
    cold ? tTotal < cold.attach - cold.cmd : true,
    `${tTotal.toFixed(0)}ms vs cold build ${cold ? (cold.attach - cold.cmd).toFixed(0) : '?'}ms`,
  );
}
await sleep(500);
await shot('ricarten_warm');

// ---------------- summary ----------------
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`}`);
if (badTexUrls.size || texture404s.length) {
  console.log(`pt texture fetch failures: ${badTexUrls.size} urls (404s: ${texture404s.length})`);
  for (const u of [...badTexUrls].slice(0, 12)) console.log(`  ${u}`);
}
check(
  'texture fetch failures bounded (known source gaps only)',
  badTexUrls.size + texture404s.length < 120,
);
const KNOWN_NOISE = [
  /Failed to load resource: the server responded with a status of 502/,
  /Failed to load resource: the server responded with a status of 404/,
  /character visual unavailable, skipping view/,
];
const realErrors = errors.filter((e) => !KNOWN_NOISE.some((re) => re.test(e)));
if (errors.length) {
  console.log(`page errors: ${errors.length} (${realErrors.length} real, rest known noise)`);
  for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
}
check('no new page/console errors', realErrors.length === 0);
await browser.close();
process.exit(failures > 0 ? 1 : 0);
