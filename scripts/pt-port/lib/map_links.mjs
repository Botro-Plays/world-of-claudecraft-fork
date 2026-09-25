// Complete source-derived PT map connection graph.
//
// field.cpp's InitField() only carries the two in-world mechanisms
// (AddGate/AddGate2 FieldGates, AddWarpGate/AddWarpOutGate teleports). The
// rest of the original client's map-changing surface lives in other files:
//
//   sinbaram/sinWarpGate.cpp   wing-warp map UI (SpecialEffect=2 gates):
//                              sinWarpGateCODE destination fields, the wing
//                              item tiers (sinQW1|sin01..06) that unlock
//                              icons, WarpGateUseCost, the Bless-Castle
//                              haWarpGateCODE, and the map icon positions.
//   sinbaram/sinMsg.cpp        WarpGateName[] labels (doc order, same index
//                              as sinWarpGateCODE).
//   sinbaram/sinQuest.cpp      WarpGateDoc[] help docs (same index).
//   sinbaram/sinMessageBox.cpp MESSAGE_TELEPORT NPC service ->
//                              sinTeleportIndexArray {0,18,7,12} via
//                              WarpField2 (field center, not PosWarpOut);
//                              MESSAGE_CASTLE_TELEPORT -> field 33;
//                              MESSAGE_FALLGAME -> field 39;
//                              MESSAGE_TELEPORT_DUNGEON -> field 40;
//                              MESSAGE_CHANGE_JOB4 -> 3/21 by race.
//   sinbaram/sinHelp.cpp       TeleportUseCose[] NPC prices + the
//                              SIN_HELP_KIND_TELEPORT button flow and the
//                              index-4 level gate on field 12.
//   sinbaram/HaPremiumItem.cpp TelePort_FieldNum[54] teleport-core item:
//                              selection slot -> field -> level requirement.
//   character.cpp              ether-core item switch (sinEC1|sinNN ->
//                              WarpStartField(START_FIELD_*)), death
//                              respawn via WarpFieldNearPos/WarpStartField/
//                              WarpCastleField, and the WarTeleport path.
//   field.h                    START_FIELD_* constants the switch resolves.
//   SrcServer/onserver.h       rsSOD_FIELD/rsSOD_VILLAGE/rsWAR_FILED/
//                              rsCASTLE_FIELD/QUEST_ARENA_FIELD constants.
//   SrcServer/OnSever.cpp      smTRANSCODE_WARPFIELD senders: SOD event
//                              in/out, war join/end, devil castle in/out,
//                              admin /near /call. Enumerated here as the
//                              serverTransition catalog (each row cites
//                              the handler it came from).
//
// Everything below is parsed from the source files, not copied by hand;
// where the source expresses a rule in code (the wing-gate free/paid
// selection branches) the rule is recorded as named constants with the
// semantics documented, never re-invented.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ptClientPath, ptSourceDir } from './pt_client.mjs';
import { loadFieldRegistry } from './field_registry.mjs';
import { parseSmd } from './stage_smd.mjs';

// ---------------------------------------------------------------------------
// Source readers (field.cpp is GBK-era; TextDecoder('gbk') for the name
// table, plain utf8 is fine for the code files we parse)
// ---------------------------------------------------------------------------

function readSrcGbk(rel) {
  return new TextDecoder('gbk').decode(readFileSync(join(ptSourceDir(), rel)));
}
function readSrc(rel) {
  return readFileSync(join(ptSourceDir(), rel), 'utf8');
}

// Blank comments while preserving positions (same approach as
// field_registry.mjs - the parsed tables sit next to live // notes).
function stripComments(src) {
  const out = src.split('');
  let i = 0;
  let inString = false;
  while (i < out.length) {
    const c = out[i];
    if (inString) {
      if (c === '\\') i += 2;
      else { if (c === '"') inString = false; i += 1; }
      continue;
    }
    if (c === '"') { inString = true; i += 1; continue; }
    if (c === '/' && out[i + 1] === '/') {
      while (i < out.length && out[i] !== '\n') out[i++] = ' ';
      continue;
    }
    if (c === '/' && out[i + 1] === '*') {
      out[i] = ' '; out[i + 1] = ' '; i += 2;
      while (i < out.length && !(out[i] === '*' && out[i + 1] === '/')) {
        if (out[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      if (i < out.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
    }
    i += 1;
  }
  return out.join('');
}

function parseIntArray(src, name) {
  const re = new RegExp(`${name}\\s*\\[\\s*\\d*\\s*\\]\\s*=\\s*\\{([^}]*)\\}`);
  const m = re.exec(src);
  if (!m) return [];
  return m[1].split(',').map((t) => t.trim()).filter((t) => t !== '').map(Number);
}

function parseStringArray(src, name) {
  const re = new RegExp(`${name}\\s*\\[[^\\]]*\\]\\s*=\\s*\\{([^}]*)\\}`);
  const m = re.exec(src);
  if (!m) return [];
  const out = [];
  for (const sm of m[1].matchAll(/"([^"]*)"/g)) out.push(sm[1]);
  return out;
}

// ---------------------------------------------------------------------------
// Field catalog
// ---------------------------------------------------------------------------

function parseFieldLimitNames() {
  const src = readSrcGbk('field.cpp');
  const names = parseStringArray(src, 'FieldLimitName');
  return names;
}

// #define START_FIELD_NUM 3 etc.
function parseStartFieldDefines() {
  const src = readSrc('field.h');
  const out = {};
  for (const m of src.matchAll(/#define\s+(START_FIELD_[A-Z0-9_]+)\s+(\d+)/g)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wing-warp UI (sinWarpGate.cpp + friends)
// ---------------------------------------------------------------------------

function parseWingWarp() {
  const wg = stripComments(readSrc('sinbaram/sinWarpGate.cpp'));
  const quest = stripComments(readSrc('sinbaram/sinQuest.cpp'));
  const msg = readSrcGbk('sinbaram/sinMsg.cpp');

  const gateCodes = parseIntArray(wg, 'sinWarpGateCODE');
  const haCodes = parseIntArray(wg, 'haWarpGateCODE');
  const costs = parseIntArray(wg, 'WarpGateUseCost');

  // sSinWarpGate={{ {96,199},{64,21},... }}: the map-icon positions.
  const posi = [];
  const pm = /sSINWARPGATE\s+sSinWarpGate\s*=\s*\{\s*\{([^}]*)\}/.exec(wg);
  if (pm) {
    for (const p of pm[1].matchAll(/\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}/g)) {
      posi.push([Number(p[1]), Number(p[2])]);
    }
  }
  const haPosi = [];
  const hpm = /sSINWARPGATE\s+sHaWarpGate\s*=\s*\{\s*\{([^}]*)\}/.exec(wg);
  if (hpm) {
    for (const p of hpm[1].matchAll(/\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}/g)) {
      haPosi.push([Number(p[1]), Number(p[2])]);
    }
  }

  // Wing-item tiers: `case (sinQW1 | sin0N): ... GateUseIndex = K` inside
  // SerchUseWarpGate. The item code unlocks N icons on the map.
  const tiers = [];
  for (const m of wg.matchAll(/case\s*\(sinQW1\s*\|\s*sin(\d+)\)\s*:[^}]*?GateUseIndex\s*=\s*(\d+)/g)) {
    tiers.push({ item: `sinQW1|sin${m[1]}`, unlockCount: Number(m[2]) });
  }
  // `if(!sSinWarpGate.GateUseIndex) GateUseIndex = 2;` - no wing item.
  const dm = /if\s*\(\s*!sSinWarpGate\.GateUseIndex\s*\)\s*\r?\n?\s*sSinWarpGate\.GateUseIndex\s*=\s*(\d+)/.exec(wg);
  const defaultUnlock = dm ? Number(dm[1]) : 2;

  const docFiles = parseStringArray(quest, 'WarpGateDoc');
  const docs = docFiles.map((f) => f.replace(/^.*[\\/]/, '').replace(/\.sin$/i, ''));
  const haDocs = parseStringArray(quest, 'HaWarpGateDoc')
    .map((f) => f.replace(/^.*[\\/]/, '').replace(/\.sin$/i, ''));
  const names = parseStringArray(msg, 'WarpGateName');
  const haNames = parseStringArray(msg, 'HaWarpGateName');

  return {
    // sinWarpGateCODE[i] is the field index icon i warps to.
    destinations: gateCodes.map((fieldIndex, i) => ({
      icon: i,
      fieldIndex,
      name: names[i + 1] ?? null, // WarpGateName[0] is a blank header row
      doc: docs[i + 1] ?? null,
      iconPos: posi[i] ?? null,
    })),
    haGate: {
      // haWarpGateCODE + sHaWarpGate icon; shown only while the player's
      // clan owns Bless Castle (rsBlessCastle.dwMasterClan).
      fieldIndex: haCodes[0] ?? null,
      name: haNames[0] ?? null,
      doc: haDocs[0] ?? null,
      iconPos: haPosi[0] ?? null,
      requiresBlessCastleClan: true,
    },
    // WarpGateUseCost[GateUseIndex-4]: the fee charged for icon >= 2 while
    // holding a wing item. Icons 0-1 are always free; a SameAreaFlag pick
    // (destination == current field) is free too.
    costs,
    tiers,
    defaultUnlock,
    rules: {
      freeIconsBelow: 2,
      paidWhenUnlockAtLeast: 4,
      costIndexBase: 4,
      sameAreaFree: true,
      // WingWarpGate_Field checks FieldLimitLevel_Table[code] <= Level and
      // requires the player within DIST_TRANSLEVEL_LOW of the triggering
      // field's PosWarpOut; arrival is the DESTINATION's PosWarpOut.
      levelGate: 'FieldLimitLevel_Table[destField] <= playerLevel',
      arrival: 'destination field PosWarpOut',
      trigger: 'SpecialEffect=2 WarpGate touch opens the map UI',
    },
  };
}

// ---------------------------------------------------------------------------
// NPC teleport service (sinHelp.cpp + sinMessageBox.cpp)
// ---------------------------------------------------------------------------

function parseNpcTeleport() {
  const msg = stripComments(readSrc('sinbaram/sinMessageBox.cpp'));
  const help = stripComments(readSrc('sinbaram/sinHelp.cpp'));

  const dests = parseIntArray(msg, 'sinTeleportIndexArray');
  const costs = parseIntArray(help, 'TeleportUseCose');
  return {
    // sinTeleportIndexArray[sel-1] -> WarpField2(field) (field CENTER via
    // WarpField, not PosWarpOut). TeleportUseCose[sel-1] + siege tax.
    destinations: dests.map((fieldIndex, i) => ({
      select: i + 1,
      fieldIndex,
      cost: costs[i] ?? null,
      // sinHelp: `if(sinTeleportIndex == 4) FieldLimitLevel_Table[12] > Level`
      levelGateField: i + 1 === 4 ? 12 : null,
    })),
    arrival: 'WarpField2: field center (castle fields use a StartPoint)',
    costIncludesSiegeTax: true,
    dungeonTeleport: { fieldIndex: 40 }, // SIN_HELP_KIND_TELEPORT_MILTER -> WarpField2(40)
    castleTeleport: { fieldIndex: 33 },  // MESSAGE_CASTLE_TELEPORT -> WarpField2(33)
    warTeleport: { fieldIndex: 23, server: true }, // Send_WarTeleport -> server WARPFIELD
    fallGame: { fieldIndex: 39 },        // MESSAGE_FALLGAME -> WarpField2(39)
    jobChangeReturn: { tempskron: 3, morion: 21 }, // MESSAGE_CHANGE_JOB4/_2
  };
}

// ---------------------------------------------------------------------------
// Teleport Core premium item (HaPremiumItem.cpp)
// ---------------------------------------------------------------------------

function parseTeleportCore(limitTable) {
  const src = stripComments(readSrc('sinbaram/HaPremiumItem.cpp'));
  const out = [];
  // Rows look like {0 ,20 ,FieldLimitLevel_Table[20]},{...}
  const re = /\{\s*(\d+)\s*,\s*(\d+)\s*,\s*FieldLimitLevel_Table\[(\d+)\]\s*\}/g;
  const tm = /TelePort_FieldNum\[\]\[\d+\]\s*=\s*\{([\s\S]*?)\};/m.exec(src);
  if (tm) {
    for (const m of tm[1].matchAll(re)) {
      out.push({
        select: Number(m[1]),
        fieldIndex: Number(m[2]),
        level: limitTable[Number(m[3])] ?? 0,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ether-core town-return items (character.cpp UseEtherCoreCode switch)
// ---------------------------------------------------------------------------

function parseEtherCore(startDefines) {
  const src = stripComments(readSrc('character.cpp'));
  const out = [];
  // case sinEC1|sinNN: ... WarpStartField(START_FIELD_X,&pX,&pZ)
  const re = /case\s+sinEC1\|sin(\d+)\s*:[^}]*?WarpStartField\(\s*(START_FIELD_[A-Z0-9_]+)/g;
  for (const m of src.matchAll(re)) {
    const define = m[2];
    out.push({
      item: `sinEC1|sin${m[1]}`,
      fieldIndex: startDefines[define] ?? null,
      startFieldDefine: define,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Server-side field transitions (onserver.h + OnSever.cpp catalog)
// ---------------------------------------------------------------------------

function parseServerFieldDefines() {
  const src = readSrc('SrcServer/onserver.h');
  const out = {};
  for (const m of src.matchAll(/#define\s+(rsSOD_FIELD|rsSOD_VILLAGE|rsWAR_FILED|rsCASTLE_FIELD|QUEST_ARENA_FIELD)\s+(\d+)/g)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

// Terrain bounds for dead-edge detection, read in PT coordinates straight
// from the source .smd (the same parse auditMap reports). Best-effort - a
// field whose terrain file is missing simply contributes no bound and edges
// touching it stay unflagged.
function makeFieldBounds(manifests) {
  const byIndex = new Map();
  if (manifests) for (const m of manifests) byIndex.set(m.fieldIndex, m);
  const cache = new Map();
  return (fieldIndex) => {
    if (cache.has(fieldIndex)) return cache.get(fieldIndex);
    let bounds = null;
    const m = byIndex.get(fieldIndex);
    if (m && existsSync(ptClientPath(m.smdPath))) {
      try {
        const b = parseSmd(readFileSync(ptClientPath(m.smdPath))).bounds;
        bounds = { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
      } catch {
        bounds = null;
      }
    }
    cache.set(fieldIndex, bounds);
    return bounds;
  };
}

// A FieldGate is a boundary marker: its coordinate must sit near BOTH maps'
// footprints for the seamless crossing to work (the destination mesh has to
// extend to/over the gate point). A record whose point lies far outside both
// bounds is authored but dead - e.g. ff-01 -> pilai carries fore-3's copied
// coordinate. 512 units is well under the smallest map radius.
const GATE_DEAD_MARGIN = 512;
function nearBounds(b, x, z) {
  return x >= b.minX - GATE_DEAD_MARGIN && x <= b.maxX + GATE_DEAD_MARGIN
    && z >= b.minZ - GATE_DEAD_MARGIN && z <= b.maxZ + GATE_DEAD_MARGIN;
}

// ---------------------------------------------------------------------------
// Graph assembly
// ---------------------------------------------------------------------------

// fields[] entries: {fieldIndex,id,mapName,displayName,state,limitLevel,
//   posWarpOut,centerPos,startPoints}
// `manifests` is the resolved manifest list (manifestsForAll) so ids match
// the generated/pt-maps packages; when omitted, id falls back to mapName.
export function buildMapLinks(manifests = null) {
  const registry = loadFieldRegistry();
  const byIndex = new Map();
  if (manifests) for (const m of manifests) byIndex.set(m.fieldIndex, m.id);

  const limitNames = parseFieldLimitNames();
  const startDefines = parseStartFieldDefines();
  const fieldSrc = stripComments(readSrc('field.cpp'));
  const limitTableM = /FieldLimitLevel_Table\s*\[\s*MAX_FIELD\s*\]\s*=\s*\{([^}]*)\}/.exec(fieldSrc);
  const limitTable = limitTableM
    ? limitTableM[1].split(',').map((t) => Number(t.trim())).filter((n) => !Number.isNaN(n))
    : [];

  const idOf = (i) => byIndex.get(i) ?? null;

  const fields = registry.map((f) => ({
    fieldIndex: f.fieldIndex,
    id: idOf(f.fieldIndex),
    mapName: f.mapName,
    displayName: limitNames[f.fieldIndex] ?? null,
    asePath: f.asePath,
    state: f.state,
    limitLevel: f.limitLevel,
    centerPos: f.centerPos,
    startPoints: f.startPoints,
    posWarpOut: f.posWarpOut,
  }));

  // FieldGate: every authored AddGate(A,B,...) is a bidirectional boundary
  // (AddGate also writes the reverse record into B via AddGate2). Emit one
  // undirected edge per authored record, endpoints resolved to package ids.
  const fieldBounds = makeFieldBounds(manifests);
  const fieldGates = [];
  for (const f of registry) {
    for (const g of f.gates) {
      const rec = {
        from: f.fieldIndex,
        to: g.targetIndex,
        fromId: idOf(f.fieldIndex),
        toId: idOf(g.targetIndex),
        x: g.x,
        z: g.z,
        y: g.y,
        bidirectional: true,
        authoredIn: f.fieldIndex,
      };
      const bFrom = fieldBounds(rec.from);
      const bTo = fieldBounds(rec.to);
      if (bFrom && bTo && !nearBounds(bFrom, g.x, g.z) && !nearBounds(bTo, g.x, g.z)) {
        rec.dead = true; // gate point outside both fields' footprints
      }
      fieldGates.push(rec);
    }
  }

  // WarpGate triggers verbatim (exits resolved to ids).
  const warpGates = [];
  for (const f of registry) {
    for (const g of f.warpGates) {
      warpGates.push({
        field: f.fieldIndex,
        fieldId: idOf(f.fieldIndex),
        x: g.x, z: g.z, y: g.y,
        size: g.size, height: g.height,
        limitLevel: g.limitLevel,
        specialEffect: g.specialEffect,
        exits: g.exits.map((e) => ({
          to: e.targetIndex,
          toId: idOf(e.targetIndex),
          x: e.x, z: e.z, y: e.y,
        })),
      });
    }
  }

  const wingWarp = parseWingWarp();
  for (const d of wingWarp.destinations) {
    d.fieldId = idOf(d.fieldIndex);
    d.requiredLevel = limitTable[d.fieldIndex] ?? 0;
  }
  wingWarp.haGate.fieldId = idOf(wingWarp.haGate.fieldIndex);

  const npcTeleport = parseNpcTeleport();
  for (const d of npcTeleport.destinations) d.fieldId = idOf(d.fieldIndex);

  const teleportCore = parseTeleportCore(limitTable);
  for (const d of teleportCore) d.fieldId = idOf(d.fieldIndex);

  const etherCore = parseEtherCore(startDefines);
  for (const d of etherCore) d.fieldId = idOf(d.fieldIndex);

  const sv = parseServerFieldDefines();
  const serverTransitions = [
    { kind: 'SOD_ENTER', fieldIndex: sv.rsSOD_FIELD ?? 30, source: 'OnSever.cpp hardcore-event open' },
    { kind: 'SOD_EXIT', fieldIndex: sv.rsSOD_VILLAGE ?? 9, source: 'OnSever.cpp hardcore-event timeout' },
    { kind: 'SOD_STAGE', fieldIndex: sv.rsSOD_FIELD ?? 30, source: 'playsub.cpp SodNextStageNum' },
    { kind: 'WAR_JOIN', fieldIndex: sv.rsWAR_FILED ?? 23, x: -3630, z: -43167, source: 'smTRANSCODE_JOIN_WARMODE' },
    { kind: 'WAR_END', fieldIndex: 3, x: 2596, z: -18738, source: 'OnSever.cpp war cleanup' },
    { kind: 'DEVIL_CASTLE_ENTER', fieldIndex: 58, x: 21560, z: 16979, source: 'OnSever.cpp devilCastle open' },
    { kind: 'DEVIL_CASTLE_EXIT', fieldIndex: 3, x: 2596, z: -18738, source: 'OnSever.cpp DevCaleMain timeout' },
    { kind: 'QUEST_ARENA', fieldIndex: sv.QUEST_ARENA_FIELD ?? 32, source: 'netplay.cpp Start_QuestArena (client WarpField2 + server QUEST_COMMAND)' },
    { kind: 'CASTLE_RETURN', fieldIndex: sv.rsCASTLE_FIELD ?? 33, source: 'netplay.cpp castle-mode end -> WarpField2(rsCASTLE_FIELD)' },
    { kind: 'CASTLE_MASTER', fieldIndex: sv.rsCASTLE_FIELD ?? 33, source: 'field.cpp WarpCastleField CastleMasterPos' },
    { kind: 'ADMIN_TELEPORT', fieldIndex: null, source: 'OnSever.cpp /near /call; client /field N -> WarpField2' },
    { kind: 'PRISON', fieldIndex: 3, x: 1746, z: -19756, source: 'field.cpp WarpPrisonField' },
    { kind: 'RESPAWN_FIELD', fieldIndex: null, source: 'character.cpp RESTART_FEILD -> WarpFieldNearPos(current)' },
    { kind: 'RESPAWN_TOWN', fieldIndex: 3, source: 'character.cpp RESTART_TOWN -> WarpStartField (3 Tempskron / 21 Morion / castle master 33)' },
    { kind: 'LOGIN_DEAD', fieldIndex: null, source: 'netplay.cpp login newLife==0 -> WarpStartField' },
  ];
  for (const t of serverTransitions) t.fieldId = idOf(t.fieldIndex);

  // -------------------------------------------------------------------
  // Derived reachability classification (not authored data - computed from
  // the edges above). Roots: WarpStartField race towns 3 (Tempskron) and
  // 21 (Morion).
  // -------------------------------------------------------------------
  const undirected = new Map();
  const addU = (a, b) => {
    if (a === null || b === null || a === undefined || b === undefined) return;
    if (!undirected.has(a)) undirected.set(a, new Set());
    if (!undirected.has(b)) undirected.set(b, new Set());
    undirected.get(a).add(b);
    undirected.get(b).add(a);
  };
  // Dead edges (gate point outside both footprints) never trigger in the
  // original client, so they do not count as walkable adjacency.
  for (const g of fieldGates) if (!g.dead) addU(g.from, g.to);

  const walkableFrom = (roots) => {
    const seen = new Set(roots);
    const queue = [...roots];
    while (queue.length) {
      const c = queue.pop();
      for (const n of undirected.get(c) ?? []) {
        if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    return seen;
  };
  const footReach = walkableFrom([3, 21]);

  // Foot + WarpGate exits (directed edges, level gating ignored for graph
  // reachability - the edge exists even when the player's level does not).
  const warpTargets = new Map();
  for (const wg of warpGates) {
    if (!warpTargets.has(wg.field)) warpTargets.set(wg.field, new Set());
    for (const e of wg.exits) warpTargets.get(wg.field).add(e.to);
  }
  const warpReach = new Set(footReach);
  {
    const queue = [...warpReach];
    while (queue.length) {
      const c = queue.pop();
      for (const n of undirected.get(c) ?? []) if (!warpReach.has(n)) { warpReach.add(n); queue.push(n); }
      for (const n of warpTargets.get(c) ?? []) if (!warpReach.has(n)) { warpReach.add(n); queue.push(n); }
    }
  }

  const uiFields = new Set();
  for (const d of wingWarp.destinations) uiFields.add(d.fieldIndex);
  uiFields.add(wingWarp.haGate.fieldIndex);
  for (const d of npcTeleport.destinations) uiFields.add(d.fieldIndex);
  uiFields.add(npcTeleport.dungeonTeleport.fieldIndex);
  uiFields.add(npcTeleport.castleTeleport.fieldIndex);
  uiFields.add(npcTeleport.fallGame.fieldIndex);
  uiFields.add(npcTeleport.jobChangeReturn.tempskron);
  uiFields.add(npcTeleport.jobChangeReturn.morion);
  for (const d of teleportCore) uiFields.add(d.fieldIndex);
  for (const d of etherCore) uiFields.add(d.fieldIndex);

  const serverFields = new Set(
    serverTransitions.map((t) => t.fieldIndex).filter((x) => x !== null && x !== undefined),
  );

  // Connectivity components: fields joined by FieldGate edges ONLY (the
  // walkable islands; a WarpGate teleports between islands, it does not
  // merge them). A component is classified by the best entry point among
  // its members, so a map on the far continent (fo1/town1/ba*/iron3)
  // reports 'ui-item' - you arrive by ether core or teleport scroll and
  // then walk - rather than 'isolated'.
  const connected = new Map();
  const addC = (a, b) => {
    if (a === null || b === null || a === undefined || b === undefined) return;
    if (!connected.has(a)) connected.set(a, new Set());
    if (!connected.has(b)) connected.set(b, new Set());
    connected.get(a).add(b);
    connected.get(b).add(a);
  };
  for (const g of fieldGates) if (!g.dead) addC(g.from, g.to);
  const compOf = new Map();
  let compSeq = 0;
  for (const f of fields) {
    if (compOf.has(f.fieldIndex)) continue;
    const comp = compSeq++;
    const queue = [f.fieldIndex];
    compOf.set(f.fieldIndex, comp);
    while (queue.length) {
      const c = queue.pop();
      for (const n of connected.get(c) ?? []) {
        if (!compOf.has(n)) { compOf.set(n, comp); queue.push(n); }
      }
    }
  }
  const compMembers = new Map();
  for (const [fi, c] of compOf) {
    if (!compMembers.has(c)) compMembers.set(c, []);
    compMembers.get(c).push(fi);
  }

  const RANK = { foot: 0, warp: 1, 'ui-item': 2, server: 3, isolated: 4 };
  const fieldClass = (fi) => {
    if (footReach.has(fi)) return 'foot';
    if (warpReach.has(fi)) return 'warp';
    if (uiFields.has(fi)) return 'ui-item';
    if (serverFields.has(fi)) return 'server';
    return 'isolated';
  };
  for (const members of compMembers.values()) {
    let best = 'isolated';
    for (const fi of members) {
      const c = fieldClass(fi);
      if (RANK[c] < RANK[best]) best = c;
    }
    // A member with a strictly better direct class keeps it (e.g. a field
    // you can warp straight into even though its component only has a
    // server entry).
    for (const fi of members) {
      const f = fields.find((x) => x.fieldIndex === fi);
      const direct = fieldClass(fi);
      f.component = compOf.get(fi);
      f.reachability = RANK[direct] < RANK[best] ? direct : best;
    }
  }

  return {
    generatedFrom: [
      'PT-Source/field.cpp (field registry, gates, warp gates, limits)',
      'PT-Source/field.h (sFIELD/sWARPGATE/sFGATE, START_FIELD_*)',
      'PT-Source/sinbaram/sinWarpGate.cpp (wing UI: codes, tiers, costs, icons)',
      'PT-Source/sinbaram/sinQuest.cpp (WarpGateDoc)',
      'PT-Source/sinbaram/sinMsg.cpp (WarpGateName)',
      'PT-Source/sinbaram/sinMessageBox.cpp (NPC teleports, MESSAGE_WARP)',
      'PT-Source/sinbaram/sinHelp.cpp (SIN_HELP_KIND_TELEPORT, TeleportUseCose)',
      'PT-Source/sinbaram/HaPremiumItem.cpp (TelePort_FieldNum)',
      'PT-Source/character.cpp (ether cores, respawn, warp calls)',
      'PT-Source/netplay.cpp + SrcServer/OnSever.cpp (smTRANSCODE_WARPFIELD)',
    ],
    fieldCount: fields.length,
    startFields: startDefines,
    fields,
    fieldGates,
    warpGates,
    wingWarp,
    npcTeleport,
    teleportCore,
    etherCore,
    serverTransitions,
  };
}
