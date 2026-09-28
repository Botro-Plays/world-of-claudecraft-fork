// PT fixed-NPC + OpenItem readers and deterministic emitters.
//
// Source formats (verified against PT-Source/SrcServer/OnSever.cpp
// STG_AREA::LoadStage -> OpenNpc and PT-Source/fileread.cpp smCharDecode):
//
//   GameServer/Field/<base>.ase.spc  - BINARY fixed-NPC placement table.
//     100 records x 504 bytes, one smTRNAS_PLAYERINFO each:
//       +0   int  size            +4   int  code (nonzero = live record)
//       +8   smCHAR_INFO (464 B): szName[32] GB2312, szModelName[64] @+32,
//            szModelName2[64] @+96 (.npc definition path), State @+168
//       +472 DWORD dwObjectSerial
//       +476 int x,y,z            PT world units <<8 (fONE=256 fixed-point,
//                                 matching the server's pX/pY/pZ storage)
//       +488 int ax,ay,az         PT angles, ANGLE_360 = 4096 units/rev
//       +500 int state            record state (0 = smCHAR_STATE_NPC)
//     LoadStage opens every record with code != 0 via OpenNpc(), which copies
//     x/y/z and ax/ay/az verbatim and then decodes the szModelName2 .npc file.
//
//   GameServer/npc/*.npc             - GB2312 TEXT character definition.
//     Directives consumed by smCharDecode (fileread.cpp):
//       *名字 "<name>"        display name (overrides the .spc szName)
//       *外型文件 "<path>"     model override (else the .spc szModelName)
//       *对话 "<text>"        dialog line (repeatable -> lpNpcMessage list)
//       *等级 <n>             level
//       *尺寸 <code>          SizeLevel
//       *移动范围 <n>          MoveRange wander radius (<<FLOATNS)
//       *出现间隔 <a> <b>      OpenCount spawn-share gate
//       *武器出售 <code...>   SellAttackItem[]   (weapon shop stock)
//       *防具出售 <code...>   SellDefenceItem[]  (armor shop stock)
//       *物品出售 <code...>   SellEtcItem[]      (etc/goods shop stock)
//       service flags: *技能修炼 SkillMaster, *职业转换 SkillChangeJob,
//         *物品保管 WareHouseMaster, *事件接受 EventNPC, *移动 teleporter,
//         plus crafting/system masters (recorded under `flags`, unimplemented).
//     Shop codes are item LastCategory strings resolved against sItem[],
//     i.e. the *代码 field of GameServer/OpenItem/*.txt records.
//
//   GameServer/OpenItem/<CODE>.txt   - GB2312 TEXT item definition.
//       *名字 "<name>"   *代码 "<CODE>"   *价格 <copper>
//       *生命提高 <min> <max>   HP restore range (potions)
//       *魔法提高 <min> <max>   mana restore;  *耐力提高 stamina
//       *等级 <n>        required level;  *重量 <n>  weight;  *耐久 <n>
//
// Determinism: all directory scans are sorted, all emitted collections are
// sorted by a stable key, and nothing reads timestamps or randomness.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ptServerPath } from './pt_client.mjs';

const GBK = new TextDecoder('gbk');

function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cstr(buf) {
  const end = buf.indexOf(0);
  return GBK.decode(buf.slice(0, end < 0 ? buf.length : end)).replace(/\0+$/g, '').trim();
}

// ---------------------------------------------------------------------------
// .spc reader (smTRNAS_PLAYERINFO x 100, 504 bytes each)
// ---------------------------------------------------------------------------

export const SPC_STRIDE = 504;
export const SPC_SLOTS = 100;

export function parseSpc(buf) {
  const records = [];
  const slots = Math.min(SPC_SLOTS, Math.floor(buf.length / SPC_STRIDE));
  for (let i = 0; i < slots; i++) {
    const base = i * SPC_STRIDE;
    const code = buf.readInt32LE(base + 4);
    if (code === 0) continue;
    records.push({
      slot: i,
      code,
      name: cstr(buf.slice(base + 8, base + 40)),
      model: cstr(buf.slice(base + 40, base + 104)).replace(/\\/g, '/'),
      npcFile: cstr(buf.slice(base + 104, base + 168)).replace(/\\/g, '/'),
      charState: buf.readInt32LE(base + 176),
      // <<8 fixed-point (fONE=256) -> PT world units, matching the .spp
      // anchor convention (population.mjs emits plain map units).
      x: buf.readInt32LE(base + 476) / 256,
      y: buf.readInt32LE(base + 480) / 256,
      z: buf.readInt32LE(base + 484) / 256,
      ax: buf.readInt32LE(base + 488),
      ay: buf.readInt32LE(base + 492),
      az: buf.readInt32LE(base + 496),
      state: buf.readInt32LE(base + 500),
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// .npc reader (GB2312 text, '*'-directives, GetWord/GetString tokenization)
// ---------------------------------------------------------------------------

// '*'-directive -> canonical flag name. Values match smMonsterInfo field
// semantics in smPacket.h; only WareHouseMaster maps onto a WoC service today
// (banker). The rest are preserved for source completeness.
const NPC_FLAG_DIRECTIVES = new Map([
  ['*技能修炼', 'skillMaster'],
  ['*职业转换', 'skillChangeJob'],
  ['*物品保管', 'warehouse'],
  ['*事件接受', 'event'],
  ['*移动', 'teleport'],
  ['*物品合成', 'imbue'],
  ['*物品冶炼', 'smelt'],
  ['*物品制造', 'manufacture'],
  ['*力量石制造', 'forceStone'],
  ['*物品锻造', 'forge'],
  ['*合成恢复', 'restore'],
  ['*属性系统', 'attributeSystem'],
  ['*打孔系统', 'socketPunch'],
  ['*镶嵌系统', 'socketInlay'],
  ['*飞升系统', 'ascension'],
  ['*深造系统', 'deepStudy'],
  ['*新合成系统', 'newSynthesis'],
  ['*炉子系统', 'stove'],
  ['*宠物仓库', 'petWarehouse'],
  ['*星星积分', 'starPoints'],
  ['*活动事件', 'eventQuest'],
  ['*公会管理', 'clanMaster'],
  ['*物品发放', 'itemGrant'],
  ['*前线任务', 'frontierQuest'],
  ['*任务事件', 'questEvent'],
  ['*重置属性点', 'statReset'],
  ['*给金钱', 'giveMoney'],
  ['*祝福城堡', 'blessCastle'],
]);

// Whitespace tokenizer with quoted-string support, mirroring the source
// GetWord/GetString pair (same convention as population.mjs spmTokens).
function* npcTokens(line) {
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '"') {
      const end = line.indexOf('"', i + 1);
      const tok = line.slice(i + 1, end < 0 ? line.length : end);
      i = end < 0 ? line.length : end + 1;
      yield tok;
      continue;
    }
    let j = i;
    while (j < line.length && line[j] !== ' ' && line[j] !== '\t' && line[j] !== '\r') j++;
    yield line.slice(i, j);
    i = j;
  }
}

function parseItemList(rest) {
  // '无' (none) or a missing body is the empty list; shop codes are
  // LastCategory strings, matched case-insensitively -> emitted uppercase.
  const out = [];
  for (const tok of npcTokens(rest)) {
    const t = tok.replace(/[";]/g, '').trim();
    if (!t || t === '无') continue;
    out.push(t.toUpperCase());
  }
  return out;
}

export function parseNpcFile(buf) {
  const text = GBK.decode(buf);
  const def = {
    name: null,
    modelFile: null,
    dialog: [],
    level: null,
    sizeLevel: null,
    moveRange: 0,
    openInterval: null,
    isMonster: false,
    sellAttack: [],
    sellDefence: [],
    sellEtc: [],
    flags: [],
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const star = line.startsWith('*') ? line : line.startsWith('**') ? line : null;
    if (!star) continue;
    const sp = star.indexOf(' ');
    const directive = sp < 0 ? star : star.slice(0, sp);
    const rest = sp < 0 ? '' : star.slice(sp + 1).trim();
    const first = [...npcTokens(rest)][0] ?? '';
    switch (directive) {
      case '*名字':
        def.name = first.replace(/"/g, '') || null;
        break;
      case '*外型文件':
        def.modelFile = first.replace(/"/g, '').replace(/\\/g, '/') || null;
        break;
      case '*对话':
      case '*C_CHAT': {
        const d = rest.replace(/^"|"$/g, '');
        if (d) def.dialog.push(d);
        break;
      }
      case '*等级':
        def.level = Number(first) || null;
        break;
      case '*尺寸':
        def.sizeLevel = first || null;
        break;
      case '*移动范围':
        def.moveRange = Number(first) || 0;
        break;
      case '*出现间隔': {
        const toks = [...npcTokens(rest)].map((t) => Number(t));
        def.openInterval = toks.length ? toks : null;
        break;
      }
      case '*属性':
        def.isMonster = first === '怪物';
        break;
      case '*武器出售':
        def.sellAttack.push(...parseItemList(rest));
        break;
      case '*防具出售':
        def.sellDefence.push(...parseItemList(rest));
        break;
      case '*物品出售':
        def.sellEtc.push(...parseItemList(rest));
        break;
      default: {
        const flag = NPC_FLAG_DIRECTIVES.get(directive);
        if (flag) def.flags.push(flag);
        break;
      }
    }
  }
  return def;
}

// ---------------------------------------------------------------------------
// OpenItem reader (GB2312 text, one item per <CODE>.txt)
// ---------------------------------------------------------------------------

const numList = (rest) => [...npcTokens(rest)].map((t) => Number(t)).filter((n) => Number.isFinite(n));

export function parseOpenItem(buf) {
  const text = GBK.decode(buf);
  const def = {
    code: null,
    name: null,
    price: null,
    weight: null,
    durability: null,
    level: null,
    hp: null,
    mp: null,
    stamina: null,
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('*') || line.startsWith('**') || line.startsWith('//')) continue;
    const sp = line.indexOf(' ');
    const directive = sp < 0 ? line : line.slice(0, sp);
    const rest = sp < 0 ? '' : line.slice(sp + 1).trim();
    const toks = [...npcTokens(rest)];
    switch (directive) {
      case '*名字':
        def.name = (toks[0] ?? '').replace(/"/g, '') || null;
        break;
      case '*代码':
        def.code = (toks[0] ?? '').replace(/"/g, '').toUpperCase() || null;
        break;
      case '*价格':
        def.price = Number(toks[0]) || null;
        break;
      case '*重量':
      case '*重v量': // shipped typo variant (82 files) carries the same field
        def.weight = Number(toks[0]) || null;
        break;
      case '*耐久':
        def.durability = Number(toks[0]) || null;
        break;
      case '*等级':
        def.level = Number(toks[0]) || null;
        break;
      case '*生命提高':
        def.hp = numList(rest).slice(0, 2);
        break;
      case '*魔法提高':
        def.mp = numList(rest).slice(0, 2);
        break;
      case '*耐力提高':
        def.stamina = numList(rest).slice(0, 2);
        break;
      default:
        break;
    }
  }
  return def;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

// Case-insensitive file lookup inside a server directory listing.
function findFile(dir, base) {
  if (!existsSync(dir)) return null;
  const want = base.toLowerCase();
  return readdirSync(dir).find((f) => f.toLowerCase() === want) ?? null;
}

// Locate <base>.ase.spc / <base>.spc the same way fieldPopulationPaths does
// (SetFieldInfoPath reads flat GameServer/Field/<stem>.ase.<ext>).
export function fieldSpcPath(aseStem) {
  const fieldDir = ptServerPath('GameServer/Field');
  const base = aseStem.toLowerCase();
  const hit = findFile(fieldDir, `${base}.ase.spc`) ?? findFile(fieldDir, `${base}.spc`);
  return hit ? join(fieldDir, hit) : null;
}

// szModelName2 is a Windows path like "GameServer\npc\phillay-civilian1.npc"
// (or a bare name); resolve it inside GameServer/npc case-insensitively.
export function npcFilePath(szModelName2) {
  const stem = szModelName2.replace(/\\/g, '/').split('/').pop();
  if (!stem) return null;
  const npcDir = ptServerPath('GameServer/npc');
  const hit = findFile(npcDir, stem);
  return hit ? join(npcDir, hit) : null;
}

export function npcDefKey(szModelName2) {
  const stem = szModelName2.replace(/\\/g, '/').split('/').pop();
  return stem ? stem.replace(/\.[^.]*$/, '').toLowerCase() : null;
}

// Model asset stem: .npc *外型文件 overrides the .spc szModelName; both are
// 'char\npc\<dir>\<file>.INI' style paths -> basename without extension.
export function npcModelStem(npcDef, spcModel) {
  const src = npcDef?.modelFile ?? spcModel;
  const stem = src?.replace(/\\/g, '/').split('/').pop();
  return stem ? stem.replace(/\.[^.]*$/, '') : null;
}

// Alternate lookup key: the model DIRECTORY stem (converted GLBs are named
// after the PT model dir when the .ini filename differs, e.g.
// char\npc\NineFox\npc_ninefox.INI -> NineFox.glb).
export function npcModelDirStem(npcDef, spcModel) {
  const src = npcDef?.modelFile ?? spcModel;
  const parts = src?.replace(/\\/g, '/').split('/');
  return parts && parts.length >= 2 ? parts[parts.length - 2] : null;
}

// Build one field's placement module record from its .spc + the .npc files
// it references. npcDir/npcDefs are shared across fields so each .npc file is
// parsed once per run (catalog is keyed by def key).
export function buildFieldNpcs(fieldId, aseStem, npcDefs, { readFileSync: rf } = {}) {
  const read = rf ?? ((p) => readFileSync(p));
  const spcPath = fieldSpcPath(aseStem);
  if (!spcPath) {
    return { fieldId, aseStem, status: 'no-source', source: { spc: null }, npcs: [], unresolved: [] };
  }
  const records = parseSpc(read(spcPath));
  const npcs = [];
  const unresolved = [];
  for (const r of records) {
    const defKey = r.npcFile ? npcDefKey(r.npcFile) : null;
    let def = defKey ? npcDefs.get(defKey) : null;
    if (defKey && def === undefined) {
      const path = npcFilePath(r.npcFile);
      if (!path) {
        def = null;
        npcDefs.set(defKey, null);
      } else {
        def = parseNpcFile(read(path));
        def.file = `server/GameServer/npc/${path.split(/[\\/]/).pop()}`;
        npcDefs.set(defKey, def);
      }
    }
    const model = npcModelStem(def, r.model);
    const modelDir = npcModelDirStem(def, r.model);
    // The def's resolved model rides the catalog: *外型文件 wins over the
    // record's own szModelName, mirroring smCharDecode's override.
    if (def && def.model === undefined) {
      def.model = model;
      def.modelDir = modelDir;
    }
    const rec = {
      slot: r.slot,
      def: defKey,
      name: r.name || null,
      model,
      x: r.x,
      y: r.y,
      z: r.z,
      ay: r.ay & 4095,
      // Source fact: smCHAR_STATE_NPC=0 sits in charState for every placed
      // record we have surveyed; keep it so a future enemy-fixed-record is
      // visible rather than silently reclassified.
      charState: r.charState,
    };
    if (!defKey) unresolved.push(`slot${r.slot}:no-npc-file`);
    else if (def === null) unresolved.push(`slot${r.slot}:missing-def:${defKey}`);
    if (!model) unresolved.push(`slot${r.slot}:no-model`);
    npcs.push(rec);
  }
  return {
    fieldId,
    aseStem,
    status: npcs.length ? 'placed' : 'empty',
    source: { spc: `server/GameServer/Field/${spcPath.split(/[\\/]/).pop()}` },
    npcs,
    unresolved,
  };
}

// ---------------------------------------------------------------------------
// GLB measurement (bind-pose height for VisualDef.height)
// ---------------------------------------------------------------------------

// Reads a GLB's JSON chunk and returns the unioned POSITION accessor Y extent
// in GLB units (PT world units - the assembler writes v/fONE). Used to pin
// each NPC visual's rendered height instead of hand-authoring a guess.
export function glbHeightUnits(buf) {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return null;
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  let lo = Infinity;
  let hi = -Infinity;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const acc = json.accessors?.[prim.attributes?.POSITION];
      if (!acc?.min || !acc?.max) continue;
      lo = Math.min(lo, acc.min[1]);
      hi = Math.max(hi, acc.max[1]);
    }
  }
  return hi > lo ? hi - lo : null;
}

// ---------------------------------------------------------------------------
// TypeScript emitters (generated/, deterministic, ASCII-safe)
// ---------------------------------------------------------------------------

function jsStr(s) {
  return JSON.stringify(s).replace(/[^\x20-\x7E]/g, (ch) => {
    const esc = ch.codePointAt(0).toString(16).padStart(4, '0');
    return ch.codePointAt(0) > 0xffff ? `\\u{${ch.codePointAt(0).toString(16)}}` : `\\u${esc}`;
  });
}

function jsVal(v, indent = '') {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return jsStr(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const inner = v.map((x) => indent + '  ' + jsVal(x, indent + '  ')).join(',\n');
    return `[\n${inner},\n${indent}]`;
  }
  const keys = Object.keys(v);
  if (!keys.length) return '{}';
  const inner = keys
    .map((k) => `${indent}  ${/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : jsStr(k)}: ${jsVal(v[k], indent + '  ')}`)
    .join(',\n');
  return `{\n${inner},\n${indent}}`;
}

const NPC_HEADER = `// GENERATED by scripts/pt-port/pt_npcs.mjs, do not edit by hand.
// PT fixed-NPC placement data - data only, no runtime wiring.
// Semantics are source-faithful: .spc records keep PT world units and
// ANGLE_360=4096 facing units; consumers apply the canonical pt transform.

`;

export function emitFieldNpcsModule(rec) {
  const lines = [NPC_HEADER];
  lines.push(`// Source: ${rec.source.spc ?? '(no server .spc)'}`);
  lines.push('');
  lines.push(`export const PT_FIELD_NPCS = ${jsVal(rec)};`);
  lines.push('');
  return lines.join('\n');
}

const CATALOG_HEADER = `// GENERATED by scripts/pt-port/pt_npcs.mjs, do not edit by hand.
// PT NPC definition catalog - one entry per GameServer/npc/<def>.npc file
// referenced by a placed .spc record. Item codes are LastCategory keys into
// PT_ITEM_CATALOG (GameServer/OpenItem/<CODE>.txt).

`;

export function emitNpcCatalogModule(npcDefs) {
  const entries = {};
  for (const [key, def] of [...npcDefs.entries()].sort((a, b) => cmpStr(a[0], b[0]))) {
    if (def === null) continue;
    entries[key] = {
      file: def.file,
      name: def.name,
      modelFile: def.modelFile,
      model: def.model ?? null,
      glb: def.glb ?? null,
      height: def.height ?? null,
      dialog: def.dialog,
      level: def.level,
      moveRange: def.moveRange,
      openInterval: def.openInterval,
      isMonster: def.isMonster,
      sellAttack: def.sellAttack,
      sellDefence: def.sellDefence,
      sellEtc: def.sellEtc,
      flags: def.flags,
    };
  }
  const lines = [CATALOG_HEADER];
  lines.push(`export const PT_NPC_CATALOG = ${jsVal(entries)};`);
  lines.push('');
  return lines.join('\n');
}

const ITEM_HEADER = `// GENERATED by scripts/pt-port/pt_npcs.mjs, do not edit by hand.
// PT item definition catalog - GameServer/OpenItem/<CODE>.txt keyed by the
// *代码 LastCategory string (the join key .npc shop lists resolve against).
// price is the source copper value; hp/mp/stamina are [min,max] restore ranges.

`;

export function emitItemCatalogModule(items) {
  const entries = {};
  for (const code of [...items.keys()].sort(cmpStr)) {
    const d = items.get(code);
    entries[code] = {
      code: d.code,
      name: d.name,
      price: d.price,
      weight: d.weight,
      level: d.level,
      hp: d.hp,
      mp: d.mp,
      stamina: d.stamina,
    };
  }
  const lines = [ITEM_HEADER];
  lines.push(`export const PT_ITEM_CATALOG = ${jsVal(entries)};`);
  lines.push('');
  return lines.join('\n');
}
