// PT monster population readers + deterministic registry + emitters.
//
// Source formats (verified against PT-Source/SrcServer/OnSever.cpp
// STG_AREA::LoadStage and PT-Source/fileread.cpp DecodeOpenMonster):
//
//   GameServer/Field/<base>.ase.spm  - GB2312 TEXT population config.
//     Directives (Chinese keyword or English alias):
//       *怪物种类 / *ACTOR       "<name>" <weight>   weighted regular type
//       *BOSS种类 / *BOSS_ACTOR  "<master>" "<slave>" <count> <hour...>
//       *怪物总数 / *MAX_ACTOR_POS <n>               field live cap LimitMax
//       *出现间隔 / *DELAY       <shift> [sec]       OpenInterval tick mask +
//                                                  per-anchor lockout seconds
//       *数量    / *MAX_ACTOR    <n>                 per-anchor cap OpenLimit
//     '//'-prefixed lines are dead (GetWord yields '//*TAG', matches nothing).
//     Unmatched *ACTOR names are silently skipped by the server: their weight
//     is dropped from PecetageCount and no rsMonster slot is consumed.
//
//   GameServer/Field/<base>.ase.spp  - BINARY spawn-anchor table.
//     200 records x 12 bytes: { state:i32, x:i32, z:i32 } map units.
//     state!=0 marks an authored anchor; x/z are field-space PT map units
//     (the server multiplies by fONE=256 when placing characters).
//
//   GameServer/Field/<base>.ase.spс  - BINARY fixed-NPC table (out of scope
//     for monsters; only the live-record count is carried as provenance).
//
//   GameServer/Monster/*.inf         - GB2312 TEXT monster definitions.
//     *名字 "<display name>"   - the .spm join key (NOT the filename)
//     *外型文件 "<path>.INI"   - model asset path char\monster\<dir>\...
//     *组织 <min> <max>        - GenerateGroup group-size range
//     *等级 <n>                - level
//     *属性 <kind>             - record kind (怪物 etc.)
//     *音效 <code>             - sound code
//     *活动时间 <hours>         - activity window (无限制 = unrestricted)
//
// Determinism: all directory scans are sorted, all emitted collections are
// sorted by a stable key, and nothing reads timestamps or randomness.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ptServerPath } from './pt_client.mjs';

const GBK = new TextDecoder('gbk');

// Codepoint-stable comparison - byte-identical ordering on every host
// (localeCompare would depend on the build's ICU collation tables).
function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// .spm reader
// ---------------------------------------------------------------------------

// Directive table. The Chinese forms live in the source as GB2312 bytes; the
// English aliases are matched case-insensitively here (the source itself uses
// lstrcmpi for ACTOR/BOSS_ACTOR and lstrcmp for the rest, but no shipped file
// exercises mixed-case aliases, so case-insensitive is a strict superset).
const SPM_DIRECTIVES = new Map([
  ['*ACTOR', 'actor'], ['*怪物种类', 'actor'],
  ['*BOSS_ACTOR', 'boss'], ['*BOSS种类', 'boss'],
  ['*MAX_ACTOR_POS', 'limit'], ['*怪物总数', 'limit'],
  ['*DELAY', 'delay'], ['*出现间隔', 'delay'],
  ['*MAX_ACTOR', 'limitPerAnchor'], ['*数量', 'limitPerAnchor'],
]);

// Whitespace tokenizer with quoted-string support, mirroring the source
// GetWord/GetString pair: a token starting with '"' reads to the next quote.
function* spmTokens(line) {
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    if (line[i] === '"') {
      const end = line.indexOf('"', i + 1);
      if (end === -1) { yield line.slice(i + 1); break; }
      yield line.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < line.length && !/\s/.test(line[j])) j++;
    yield line.slice(i, j);
    i = j;
  }
}

// Parse one .spm buffer. Returns authored values only - server defaults
// (LimitMax=10, OpenInterval=0x7F, OpenLimit=3) are runtime semantics and are
// left as null here so generated data stays source-faithful.
export function parseSpm(buf) {
  const text = GBK.decode(buf);
  const rec = {
    limitMax: null,
    delayShift: null,
    delayLockoutSec: null,
    openLimit: null,
    actors: [],
    bosses: [],
    commentedActors: 0,
    commentedBosses: 0,
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('//')) {
      const inner = line.slice(2).trimStart();
      const tag = inner.split(/\s/, 1)[0];
      const kind = tag && SPM_DIRECTIVES.get(tag.toUpperCase());
      if (kind === 'actor') rec.commentedActors++;
      else if (kind === 'boss') rec.commentedBosses++;
      continue;
    }
    const tok = [...spmTokens(line)];
    if (!tok.length || !tok[0].startsWith('*')) continue;
    const kind = SPM_DIRECTIVES.get(tok[0].toUpperCase());
    if (!kind) continue;
    if (kind === 'actor') {
      if (tok.length >= 3) rec.actors.push({ name: tok[1], weight: atoi(tok[2]) });
    } else if (kind === 'boss') {
      if (tok.length >= 4) {
        rec.bosses.push({
          master: tok[1],
          slave: tok[2],
          slaveCount: atoi(tok[3]),
          hours: tok.slice(4, 36).map(atoi),
        });
      }
    } else if (kind === 'limit') {
      rec.limitMax = atoi(tok[1]);
    } else if (kind === 'delay') {
      rec.delayShift = atoi(tok[1]);
      rec.delayLockoutSec = tok[2] !== undefined ? atoi(tok[2]) : 0;
    } else if (kind === 'limitPerAnchor') {
      rec.openLimit = atoi(tok[1]);
    }
  }
  return rec;
}

function atoi(s) {
  const n = parseInt(String(s), 10);
  return Number.isFinite(n) ? n : 0;
}

// Source-exact OpenInterval derivation: OpenInterval = (1<<shift), then
// decremented when >1 (fileread.cpp DecodeOpenMonster). Emitted alongside the
// raw shift so the generated data preserves both forms.
export function openIntervalMask(shift) {
  if (shift === null || shift === undefined) return null;
  const v = 1 << shift;
  return v > 1 ? v - 1 : v;
}

// ---------------------------------------------------------------------------
// .spp reader
// ---------------------------------------------------------------------------

// Fixed table of 200 STG_START_POINT records (12 bytes each): {state,x,z}.
// Only state!=0 slots are authored anchors; the slot index is retained as the
// anchor identity because the server's per-anchor bookkeeping
// (StartPointMonCount / dwStartPoint_OpenTime) is indexed by it.
export function parseSpp(buf) {
  const slots = Math.floor(buf.length / 12);
  const anchors = [];
  for (let i = 0; i < slots; i++) {
    const state = buf.readInt32LE(i * 12);
    if (state === 0) continue;
    anchors.push({ index: i, x: buf.readInt32LE(i * 12 + 4), z: buf.readInt32LE(i * 12 + 8) });
  }
  return { slots, anchors };
}

// ---------------------------------------------------------------------------
// .spc record counter (fixed NPCs - provenance only)
// ---------------------------------------------------------------------------

// 100 smTRNAS_PLAYERINFO records; a record with nonzero code is live.
export function countSpcRecords(buf) {
  const slots = Math.floor(buf.length / 504);
  let live = 0;
  for (let i = 0; i < slots; i++) {
    if (buf.readInt32LE(i * 504 + 4) !== 0) live++;
  }
  return { slots, live };
}

// ---------------------------------------------------------------------------
// .inf reader + deterministic monster registry
// ---------------------------------------------------------------------------

const INF_FIELDS = {
  名字: 'name',
  外型文件: 'model',
  组织: 'group',
  等级: 'level',
  属性: 'kind',
  音效: 'sound',
  活动时间: 'activeTime',
};

export function parseInf(buf) {
  const text = GBK.decode(buf);
  const out = { name: null, model: null, group: null, level: null, kind: null, sound: null, activeTime: null };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || !line.startsWith('*')) continue;
    const m = line.match(/^\*(\S+)\s*(.*)$/);
    if (!m) continue;
    const field = INF_FIELDS[m[1]];
    if (!field) continue;
    const rest = m[2].trim();
    const quoted = rest.match(/^"([^"]*)"/);
    const val = quoted ? quoted[1] : rest;
    if (field === 'group') {
      const nums = rest.match(/-?\d+/g);
      out.group = nums && nums.length >= 2 ? [atoi(nums[0]), atoi(nums[1])] : null;
    } else if (field === 'level') {
      out.level = atoi(val);
    } else {
      out[field] = val || null;
    }
  }
  return out;
}

// Variant class from the .inf filename prefix. VIP_-prefixed files are
// VIP-dungeon variants and event_-prefixed files are event monsters; both are
// real alternates but must never win the canonical slot for a shared name.
function infVariantClass(stem) {
  const s = stem.toLowerCase();
  if (s.startsWith('vip_')) return 'vip';
  if (s.startsWith('event_')) return 'event';
  return 'base';
}
const VARIANT_RANK = { base: 0, vip: 1, event: 2 };

// Deterministic canonical pick for names shared by multiple .inf files.
// The server picks by FindFirstFile enumeration order, which is filesystem-
// dependent and not portable to reproduce; this registry instead chooses:
//   1. lowest variant rank (base < vip < event)
//   2. lowest authored *等级
//   3. lexicographic stem (stable tiebreak)
// Every losing variant remains reachable via the entry's `alternates` list.
export function buildMonsterRegistry(monsterDir, { convertedDir } = {}) {
  const files = readdirSync(monsterDir)
    .filter((f) => f.toLowerCase().endsWith('.inf'))
    .map((f) => ({ file: f, key: f.replace(/\.inf$/i, '').toLowerCase() }))
    .sort((a, b) => cmpStr(a.key, b.key));

  const defs = [];
  const byName = new Map();
  for (const { file, key } of files) {
    // readdirSync + join keeps this machine-relative; never emitted.
    const inf = parseInf(readFileSync(join(monsterDir, file)));
    const stem = file.replace(/\.inf$/i, '');
    const def = {
      key,
      name: inf.name,
      inf: `GameServer/Monster/${file}`,
      kind: inf.kind,
      model: inf.model,
      modelDir: modelDirOf(inf.model),
      level: inf.level,
      group: inf.group,
      sound: inf.sound,
      activeTime: inf.activeTime,
      variant: infVariantClass(stem),
      stem,
    };
    // GLB conversion outputs live under scripts/pt-port/converted/monster/
    // keyed on the model directory name.
    if (convertedDir && def.modelDir) {
      def.asset = existsSync(join(convertedDir, `${def.modelDir}.glb`))
        ? `converted/monster/${def.modelDir}.glb`
        : null;
      def.dieAsset = existsSync(join(convertedDir, `${def.modelDir}-die.glb`))
        ? `converted/monster/${def.modelDir}-die.glb`
        : null;
    } else {
      def.asset = null;
      def.dieAsset = null;
    }
    defs.push(def);
    if (def.name !== null) {
      if (!byName.has(def.name)) byName.set(def.name, []);
      byName.get(def.name).push(def);
    }
  }

  const nameResolution = new Map();
  for (const [name, group] of [...byName.entries()].sort((a, b) => cmpStr(a[0], b[0]))) {
    const sorted = [...group].sort(
      (a, b) =>
        VARIANT_RANK[a.variant] - VARIANT_RANK[b.variant] ||
        (a.level ?? 0) - (b.level ?? 0) ||
        cmpStr(a.key, b.key),
    );
    nameResolution.set(name, {
      key: sorted[0].key,
      alternates: sorted.slice(1).map((d) => d.key),
    });
  }
  return { defs, nameResolution, byName };
}

function modelDirOf(modelPath) {
  if (!modelPath) return null;
  const m = modelPath.match(/monster\\([^\\]+)\\/i);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Field population assembly + emitters
// ---------------------------------------------------------------------------

// Locate the server-side population files for one field. SetFieldInfoPath in
// the source strips the field subdirectory and reads flat
// GameServer/Field/<asestem>.ase.<ext>; the same basename rule applies here,
// resolved case-insensitively against the real listing.
export function fieldPopulationPaths(aseStem) {
  const fieldDir = ptServerPath('GameServer/Field');
  if (!existsSync(fieldDir)) return { spm: null, spp: null, spc: null };
  const listing = readdirSync(fieldDir);
  const base = aseStem.toLowerCase();
  const find = (ext) =>
    listing.find((f) => f.toLowerCase() === `${base}.ase.${ext}`) ??
    listing.find((f) => f.toLowerCase() === `${base}.${ext}`) ??
    null;
  return { spm: find('spm'), spp: find('spp'), spc: find('spc') };
}

// Build the typed population record for one field manifest.
// manifest: { id, fieldIndex, smdPath }  (smdPath stem == ase stem)
// registry: result of buildMonsterRegistry
export function buildFieldPopulation(manifest, registry, { readFileSync: rf } = {}) {
  const read = rf ?? ((p) => readFileSync(p));
  const aseStem = manifest.smdPath.split('/').pop().replace(/\.[^.]*$/, '');
  const paths = fieldPopulationPaths(aseStem);
  const fieldDir = ptServerPath('GameServer/Field');

  const spm = paths.spm ? parseSpm(read(join(fieldDir, paths.spm))) : null;
  const spp = paths.spp ? parseSpp(read(join(fieldDir, paths.spp))) : null;
  const spc = paths.spc ? countSpcRecords(read(join(fieldDir, paths.spc))) : null;

  const resolve = (name) => {
    const hit = registry.nameResolution.get(name);
    return hit ? { key: hit.key, unresolved: null } : { key: null, unresolved: 'no-inf' };
  };

  // openStart mirrors the server's NumOpenStart exactly: cumulative weight
  // over RESOLVED actors only - an unmatched name consumes no slot and no
  // weight (fileread.cpp DecodeOpenMonster).
  let cumulative = 0;
  const actors = (spm?.actors ?? []).map((a, index) => {
    const r = resolve(a.name);
    const openStart = r.key ? cumulative : null;
    if (r.key) cumulative += a.weight;
    return { index, name: a.name, weight: a.weight, openStart, monster: r.key, unresolved: r.unresolved };
  });
  const bosses = (spm?.bosses ?? []).map((b, index) => ({
    index,
    master: { name: b.master, ...resolve(b.master) },
    slave: { name: b.slave, ...resolve(b.slave) },
    slaveCount: b.slaveCount,
    hours: b.hours,
  }));

  const status = !spm ? 'no-source' : actors.length === 0 && bosses.length === 0 ? 'no-actors' : 'populated';

  return {
    fieldId: manifest.id,
    fieldIndex: manifest.fieldIndex,
    aseStem,
    status,
    source: {
      spm: paths.spm ? `server/GameServer/Field/${paths.spm}` : null,
      spp: paths.spp ? `server/GameServer/Field/${paths.spp}` : null,
      spc: paths.spc ? `server/GameServer/Field/${paths.spc}` : null,
      npcRecords: spc ? spc.live : null,
    },
    limits: spm
      ? {
          limitMax: spm.limitMax,
          delayShift: spm.delayShift,
          delayLockoutSec: spm.delayLockoutSec,
          openIntervalMask: openIntervalMask(spm.delayShift),
          openLimit: spm.openLimit,
        }
      : null,
    pecetageCount: cumulative,
    commentedActors: spm ? spm.commentedActors : 0,
    commentedBosses: spm ? spm.commentedBosses : 0,
    actors,
    bosses,
    spawnAnchors: spp ? spp.anchors : [],
    sppSlots: spp ? spp.slots : 0,
    unresolved: [
      ...actors.filter((a) => a.unresolved).map((a) => a.name),
      ...bosses.flatMap((b) =>
        [b.master, b.slave].filter((s) => s.unresolved).map((s) => s.name),
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// TypeScript emitters (generated/, deterministic, ASCII-safe)
// ---------------------------------------------------------------------------

// Emit a JS string literal; non-ASCII escapes to \uXXXX so generated modules
// stay ASCII-clean regardless of locale tooling.
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

const POP_HEADER = `// GENERATED by scripts/pt-port/pt_map.mjs, do not edit by hand.
// PT monster population data - data only, no runtime wiring.
// Semantics are source-faithful: see docs-botro/pt-monster-population-schema.md.

`;

export function emitPopulationModule(rec, sourceLabel) {
  const lines = [POP_HEADER];
  lines.push(`// Source: ${sourceLabel}`);
  lines.push('');
  lines.push(`export const PT_FIELD_POPULATION = ${jsVal(rec)};`);
  lines.push('');
  return lines.join('\n');
}

export function emitRegistryModule(registry) {
  const defs = [...registry.defs].sort((a, b) => cmpStr(a.key, b.key));
  const byName = {};
  for (const [name, res] of [...registry.nameResolution.entries()].sort((a, b) =>
    cmpStr(a[0], b[0]),
  )) {
    byName[name] = { key: res.key, alternates: res.alternates };
  }
  const lines = [POP_HEADER];
  lines.push('// Source: server/GameServer/Monster/*.inf');
  lines.push('');
  lines.push(`export const PT_MONSTER_REGISTRY = ${jsVal(defs)};`);
  lines.push('');
  lines.push(`export const PT_MONSTER_BY_NAME = ${jsVal(byName)};`);
  lines.push('');
  return lines.join('\n');
}

// Coverage summary artifact: generated/pt-maps/population.json
export function buildPopulationSummary(records, registry) {
  const fields = {};
  const totals = {
    fields: records.length,
    populated: 0,
    noActors: 0,
    noSource: 0,
    actors: 0,
    bosses: 0,
    anchors: 0,
    npcRecords: 0,
    unresolvedNames: [],
  };
  const unresolvedSet = new Set();
  for (const r of [...records].sort((a, b) => a.fieldIndex - b.fieldIndex)) {
    fields[r.fieldId] = {
      status: r.status,
      actors: r.actors.length,
      bosses: r.bosses.length,
      anchors: r.spawnAnchors.length,
      npcRecords: r.source.npcRecords ?? 0,
      unresolved: r.unresolved,
    };
    if (r.status === 'populated') totals.populated++;
    else if (r.status === 'no-actors') totals.noActors++;
    else totals.noSource++;
    totals.actors += r.actors.length;
    totals.bosses += r.bosses.length;
    totals.anchors += r.spawnAnchors.length;
    totals.npcRecords += r.source.npcRecords ?? 0;
    for (const u of r.unresolved) unresolvedSet.add(u);
  }
  totals.unresolvedNames = [...unresolvedSet].sort((a, b) => cmpStr(a, b));
  const collisions = [...registry.nameResolution.entries()]
    .filter(([, r]) => r.alternates.length > 0)
    .map(([name, r]) => ({ name, canonical: r.key, alternates: r.alternates }));
  return {
    registry: {
      infFiles: registry.defs.length,
      uniqueNames: registry.nameResolution.size,
      collisions,
    },
    totals,
    fields,
  };
}
