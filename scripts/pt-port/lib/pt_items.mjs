// PT canonical item catalog: OpenItem reader, sinItem.cpp sItem[] join,
// deterministic collision resolution, and the English-name layer.
//
// Source authority (MagicPT-Chinese):
//   server/GameServer/OpenItem/<FILE>.txt  - GB2312 item defs, looked up by
//     the *代码 LastCategory string (NOT the filename). 1931 files cover 1902
//     codes; see "collisions" below.
//   PT-Source/sinbaram/sinItem.cpp         - client sItem[MAX_ITEM] table:
//     authentic English ItemNameIndex, grid size, ITEM_CLASS_*, INVENTORY_POS_*,
//     DorpItem, SetModelPosi, SIN_SOUND_*, ITEM_WEAPONCLASS_*, plus the
//     NotSell/NotDrow/NotSet code+kind tables.
//
// Collision policy (replaces the old sorted-order last-write-wins):
//   * Every file in a duplicate-code group is parsed. The file whose stem
//     equals the code is the PRIMARY record.
//   * Byte-identical duplicate files (the OA145 "副本" copies) collapse into
//     the primary's source.files list.
//   * Files that differ are preserved as VARIANTS keyed by file stem
//     (QWA108, DA157, DB130), never silently merged into the primary.
//   * A group with no stem-matching primary fails loudly - there is no
//     source-faithful tiebreak and inventing one would corrupt data.
//
// English names: sItem[] ItemNameIndex wins when it is real English. When it
// is missing or non-English (much of the MagicPT-added sItem text is
// Korean-mojibake under GBK, or plain zh), the name comes from the authored
// deterministic table in pt_item_names_en.mjs. Codes whose source name IS
// the code (OR201-class placeholders) pass through as 'source'. Emit throws
// on any unresolved name so a new item can never ship untranslated.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ptSourcePath } from './pt_client.mjs';
import { PT_ITEM_EN_NAMES } from './pt_item_names_en.mjs';

const GBK = new TextDecoder('gbk');

function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Tokenizer (shared convention with pt_npcs.mjs npcTokens)
// ---------------------------------------------------------------------------

function* itemTokens(line) {
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

const numList = (rest) =>
  [...itemTokens(rest)]
    .map((t) => Number(t))
    .filter((n) => Number.isFinite(n));

// ---------------------------------------------------------------------------
// OpenItem reader - full DecodeItemInfo field set (fileread.cpp)
// ---------------------------------------------------------------------------

// Two-int/float stat fields (min max or paired values, preserved as pairs).
const PAIR_FIELDS = new Map([
  ['耐久', 'durability'],
  ['吸收', 'absorb'],
  ['防御', 'defense'],
  ['格档', 'block'],
  ['格挡', 'block'], // typo variant (3 files)
  ['命中', 'hit'],
  ['移动速度', 'moveSpeed'],
  ['魔法再生', 'mpRegen'],
  ['生命再生', 'hpRegen'],
  ['耐力再生', 'spRegen'],
  ['魔法增加', 'mpBonus'],
  ['生命增加', 'hpBonus'],
  ['耐力增加', 'spBonus'],
  ['魔法熟练', 'magicMastery'],
  ['耐力提高', 'spRestore'],
  ['魔法提高', 'mpRestore'],
  ['生命提高', 'hpRestore'],
]);

const ELEMENT_FIELDS = new Map([
  ['魔属性', 'magic'],
  ['自然属性', 'nature'],
  ['火属性', 'fire'],
  ['冰属性', 'ice'],
  ['雷属性', 'lightning'],
  ['毒属性', 'poison'],
  ['水属性', 'water'],
  ['风属性', 'wind'],
]);

const REQ_FIELDS = new Map([
  ['等级', 'level'],
  ['力量', 'str'],
  ['精神', 'spirit'],
  ['才能', 'talent'],
  ['敏捷', 'agi'],
  ['体质', 'hea'],
  ['体力', 'hea'],
  ['智力', 'int'],
]);

const SCALAR_FIELDS = new Map([
  ['价格', 'price'],
  ['重量', 'weight'],
  ['重v量', 'weight'], // shipped typo variant (82 files) carries the same field
  ['攻击范围', 'attackRange'],
  ['攻击速度', 'attackSpeed'],
  ['攻击必杀', 'critical'],
  ['技能攻击力', 'skillAttack'],
  ['技能攻击距离', 'skillAttackRange'],
  ['技能攻击率', 'skillAttackRate'],
  ['药水存量', 'potionStock'],
  ['转生限制', 'rebirthLimit'],
  ['自动检取', 'autoPickup'],
  ['道具大小', 'propSize'],
  ['限制', 'limit'],
  ['特殊', 'uniqueItem'],
  ['特殊颜色', 'specialColor'],
  ['效果设置', 'effectSet'],
]);

// ** random-bonus fields rolled at item creation (CreateHiItem).
const RANDOM_PAIR_FIELDS = new Map([
  ['攻击力', 'attack'],
  ['命中', 'hit'],
  ['吸收', 'absorb'],
  ['防御', 'defense'],
  ['移动速度', 'moveSpeed'],
  ['格档', 'block'],
  ['攻击范围', 'attackRange'],
  ['魔法熟练', 'magicMastery'],
  ['魔法增加', 'mpBonus'],
  ['生命增加', 'hpBonus'],
  ['魔法再生', 'mpRegen'],
  ['生命再生', 'hpRegen'],
  ['耐力再生', 'spRegen'],
]);

const RANDOM_SCALAR_FIELDS = new Map([
  ['攻击速度', 'attackSpeed'],
  ['攻击必杀', 'critical'],
]);

export function parseOpenItem(buf) {
  const text = GBK.decode(buf);
  const def = {
    code: null,
    name: null,
    nameEnFile: null,
    modelFile: null,
    linkFile: null,
    price: null,
    weight: null,
    durability: null,
    absorb: null,
    defense: null,
    block: null,
    hit: null,
    moveSpeed: null,
    mpRegen: null,
    hpRegen: null,
    spRegen: null,
    mpBonus: null,
    hpBonus: null,
    spBonus: null,
    magicMastery: null,
    spRestore: null,
    mpRestore: null,
    hpRestore: null,
    attack: null, // [min1,max1,min2,max2] - four ints per DecodeItemInfo
    attackRange: null,
    attackSpeed: null,
    critical: null,
    skillAttack: null,
    skillAttackRange: null,
    skillAttackRate: null,
    potionStock: null,
    rebirthLimit: null,
    autoPickup: null,
    propSize: null,
    limit: null,
    uniqueItem: null,
    specialColor: null,
    effectSet: null,
    elements: null,
    requirements: null,
    specJobs: null,
    specRandomJobs: null,
    randomBonus: null,
  };
  const elements = {};
  const requirements = {};
  const randomBonus = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || !line.startsWith('*')) continue;
    const sp = line.indexOf(' ');
    const head = sp < 0 ? line : line.slice(0, sp);
    const rest = sp < 0 ? '' : line.slice(sp + 1).trim();
    const toks = [...itemTokens(rest)];
    const isRandom = head.startsWith('**');
    const key = head.replace(/^\*+/, '');
    if (!isRandom) {
      switch (key) {
        case '名字':
          def.name = toks[0] || null;
          break;
        case 'Name':
          def.nameEnFile = toks[0] || null;
          break;
        case '代码':
          def.code = (toks[0] ?? '').toUpperCase() || null;
          break;
        case '外型文件':
          def.modelFile = (toks[0] ?? '').replace(/\\/g, '/') || null;
          break;
        case '连接文件':
          // Include-chain directive: the original fopen()s the referenced
          // file and keeps reading directives. Recorded as provenance only;
          // the referenced zhoon files are absent from this distribution.
          def.linkFile = (toks[0] ?? '').replace(/\\/g, '/') || null;
          break;
        default: {
          if (PAIR_FIELDS.has(key)) {
            def[PAIR_FIELDS.get(key)] = numList(rest).slice(0, 2);
          } else if (ELEMENT_FIELDS.has(key)) {
            elements[ELEMENT_FIELDS.get(key)] = numList(rest).slice(0, 2);
          } else if (REQ_FIELDS.has(key)) {
            const v = numList(rest);
            if (v.length) requirements[REQ_FIELDS.get(key)] = v[0];
          } else if (SCALAR_FIELDS.has(key)) {
            const v = numList(rest);
            def[SCALAR_FIELDS.get(key)] = v.length ? v[0] : null;
          }
          break;
        }
      }
    } else {
      switch (key) {
        case '特效':
          // Job-bound spec affinity (JobCodeMask at creation).
          def.specJobs = toks;
          break;
        case '随机特效':
          // Random-spec job pool (dwJobBitCode_Random candidates).
          def.specRandomJobs = toks;
          break;
        default: {
          if (RANDOM_PAIR_FIELDS.has(key)) {
            randomBonus[RANDOM_PAIR_FIELDS.get(key)] = numList(rest).slice(0, 2);
          } else if (RANDOM_SCALAR_FIELDS.has(key)) {
            const v = numList(rest);
            if (v.length) randomBonus[RANDOM_SCALAR_FIELDS.get(key)] = v[0];
          }
          break;
        }
      }
    }
  }
  if (Object.keys(elements).length) def.elements = elements;
  if (Object.keys(requirements).length) def.requirements = requirements;
  if (Object.keys(randomBonus).length) def.randomBonus = randomBonus;
  return def;
}

// ---------------------------------------------------------------------------
// sinItem.cpp sItem[] reader
// ---------------------------------------------------------------------------

// sItem row: {CODE|SUB ,"EnName" ,"LASTCAT" ,ITEMSIZE*w ,ITEMSIZE*h ,"path" ,
//             ITEM_CLASS_* ,"DorpItem" ,INVENTORY_POS_* ,SIN_SOUND_*
//             [, ITEM_WEAPONCLASS_*]}
// NOTE: DorpItem / invPos / sound can be bare 0 or unquoted tokens, so the
// trailing fields accept any non-comma token.
const SITEM_ROW =
  /\{\s*(sin[A-Za-z0-9]+\|sin[0-9A-Za-z]+)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*ITEMSIZE\s*\*\s*(\d+)\s*,\s*ITEMSIZE\s*\*\s*(\d+)\s*,\s*"([^"]*)"\s*,\s*([A-Za-z_][A-Za-z0-9_|()]*)\s*,\s*"?([^",]*)"?\s*,\s*([A-Za-z0-9_|()]+)\s*,\s*([A-Za-z0-9_|()]+)\s*(?:,\s*([A-Za-z_][A-Za-z0-9_|()]*)\s*)?\}/g;

// Code-expression -> LastCategory map, e.g. 'sinQT1|sin07' -> 'QT107'.
// Built from the sItem rows themselves so the NotSell/NotDrow/NotSet tables
// resolve against the same authority the server uses.
export function parseSitemTable(raw) {
  const text = Buffer.isBuffer(raw) ? GBK.decode(raw) : raw;
  const byCode = {};
  const byExpr = new Map();
  let m;
  SITEM_ROW.lastIndex = 0;
  while ((m = SITEM_ROW.exec(text))) {
    const row = {
      expr: m[1],
      name: m[2].trim() || null,
      code: m[3].toUpperCase(),
      gridW: Number(m[4]),
      gridH: Number(m[5]),
      itemPath: m[6] || null,
      itemClass: m[7],
      dropItem: m[8] || null,
      invPos: m[9],
      sound: m[10],
      weaponClass: m[11] ?? null,
    };
    byExpr.set(m[1].replace(/\s+/g, ''), row.code);
    // Rows may repeat a LastCategory; first wins (sItem lookup returns the
    // first match on the server too).
    if (!byCode[row.code]) byCode[row.code] = row;
  }

  // NotSell/NotDrow/NotSet tables: arrays of code expressions and KIND
  // constants, terminated by 0.
  const rules = { notSell: [], notDrop: [], notSet: [], questWeaponCodes: [] };
  const codeList = (name) => {
    const mm = text.match(new RegExp(`${name}\\s*\\[\\]\\s*=\\s*\\{([^}]*)\\}`));
    if (!mm) return [];
    return [...mm[1].matchAll(/\((sin[A-Za-z0-9]+\|sin[0-9A-Za-z]+)\)/g)]
      .map((x) => byExpr.get(x[1].replace(/\s+/g, '')) ?? x[1])
      .filter(Boolean);
  };
  const kindList = (name) => {
    const mm = text.match(new RegExp(`${name}\\s*\\[\\]\\s*=\\s*\\{([^}]*)\\}`));
    if (!mm) return [];
    return [...mm[1].matchAll(/(ITEM_KIND_[A-Z_]+)/g)].map((x) => x[1]);
  };
  rules.notSell = codeList('NotSell_Item_CODE');
  rules.notDrop = codeList('NotDrow_Item_CODE');
  rules.notSet = codeList('NotSet_Item_CODE');
  rules.notSellKinds = kindList('NotSell_Item_KIND');
  rules.notDropKinds = kindList('NotDrow_Item_KIND');
  rules.notSetKinds = kindList('NotSet_Item_KIND');
  return { byCode, rules };
}

const CJK = /[ᄀ-ᅟ가-힯぀-ヿ㐀-䶿一-鿿豈-﫿︰-﹏＀-￠]/;

function isEnglishName(s) {
  return !!s && !CJK.test(s);
}

// ---------------------------------------------------------------------------
// Kind / family classification (canonical, prefix-driven)
// ---------------------------------------------------------------------------

const FAMILY_KIND = new Map(
  Object.entries({
    // weapons
    WA: 'weapon', WC: 'weapon', WD: 'weapon', WH: 'weapon', WM: 'weapon',
    WN: 'weapon', WP: 'weapon', WR: 'weapon', WS: 'weapon', WT: 'weapon',
    WV: 'weapon', TW: 'weapon',
    // armor
    DA: 'armor', DB: 'armor', DG: 'armor', DS: 'armor', CA: 'armor',
    CW: 'armor',
    // accessories (belts, mounts-as-inventory, amulets, earrings, orbs, rings,
    // title items)
    DF: 'accessory', DE: 'accessory', OA: 'accessory', OE: 'accessory',
    OM: 'accessory', OR: 'accessory', OW: 'accessory',
    // materials / crafting
    OS: 'material', PR: 'material', MA: 'material', SE: 'material',
    CS: 'material', ES: 'material', SW: 'material', SR: 'material',
    SS: 'material', BI: 'material',
    // consumables
    PL: 'consumable', PM: 'consumable', PS: 'consumable', EC: 'consumable',
    // quest
    QT: 'quest',
    // special / event / currency-adjacent
    BC: 'special', GP: 'special', SD: 'special', SP: 'special',
    PZ: 'special', DR: 'special', GF: 'special', FO: 'special',
    GG: 'currency',
  }),
);

export function ptItemFamily(code) {
  const m = code.match(/^[A-Z]+/);
  return m ? m[0] : code;
}

export function ptItemKind(def, family) {
  // *特殊 2 is the source's UniqueItem/quest-weapon marker: all 20 QW*
  // variant files carry it (plus 4 OR* unique rings). It is what the
  // server's NotSell ITEM_KIND_QUEST_WEAPON rule keys on.
  if (def.uniqueItem === 2) return 'questWeapon';
  // Restore ranges make an item a usable consumable regardless of family
  // (BI/BC cash-shop potions restore too).
  if (def.hpRestore || def.mpRestore || def.spRestore) return 'consumable';
  return FAMILY_KIND.get(family) ?? 'special';
}

// ---------------------------------------------------------------------------
// Catalog assembly: collisions, sItem join, English names
// ---------------------------------------------------------------------------

function fingerprint(def) {
  // Compare the parsed payload (provenance excluded).
  return JSON.stringify(def);
}

export function buildItemCatalog(openItemDir, files, sitem) {
  const groups = new Map(); // code -> [{file, stem, def}]
  for (const f of files) {
    const def = parseOpenItem(readFileSync(join(openItemDir, f)));
    if (!def.code) continue;
    const stem = f.replace(/\.txt$/i, '');
    if (!groups.has(def.code)) groups.set(def.code, []);
    groups.get(def.code).push({ file: f, stem: stem.toUpperCase(), def });
  }

  const entries = new Map();
  const variants = new Map();
  const collisions = [];

  for (const code of [...groups.keys()].sort(cmpStr)) {
    const group = groups.get(code).sort((a, b) => cmpStr(a.file, b.file));
    const primary = group.find((g) => g.stem === code) ?? null;
    if (!primary) {
      throw new Error(
        `OpenItem collision group ${code} has no stem-matching file: ` +
          group.map((g) => g.file).join(', '),
      );
    }
    const others = group.filter((g) => g !== primary);
    const duplicates = [];
    for (const g of others) {
      if (fingerprint(g.def) === fingerprint(primary.def)) {
        duplicates.push(g.file);
        continue;
      }
      // Conflicting/intentional variant: preserve verbatim as its own record.
      variants.set(g.stem, {
        ...shapeRecord(g.def, g.file, sitem.byCode[code] ?? null, g.stem),
        code,
        variantOf: code,
      });
    }
    const rec = shapeRecord(primary.def, primary.file, sitem.byCode[code] ?? null, null);
    rec.source = {
      file: primary.file,
      duplicates,
      variants: others.filter((g) => !duplicates.includes(g.file)).map((g) => g.stem),
    };
    if (others.length) {
      collisions.push({
        code,
        primary: primary.file,
        duplicates,
        variants: rec.source.variants,
      });
    }
    entries.set(code, rec);
  }
  return { entries, variants, collisions };
}

const EN_SOURCE_ORDER = { sitem: 0, file: 1, translated: 2, source: 3 };

function shapeRecord(def, file, sitemRow, variantKey) {
  const key = variantKey ?? def.code;
  const family = ptItemFamily(def.code);
  const sitemName = sitemRow?.name ?? null;
  let nameEn, nameEnSource;
  if (isEnglishName(sitemName)) {
    nameEn = sitemName.replace(/\s+/g, ' ').trim();
    nameEnSource = 'sitem';
  } else if (isEnglishName(def.nameEnFile)) {
    nameEn = def.nameEnFile;
    nameEnSource = 'file';
  } else if (def.name && !CJK.test(def.name)) {
    // Source name is already non-CJK (the OR201-class placeholder codes).
    nameEn = def.name;
    nameEnSource = 'source';
  } else {
    nameEn = PT_ITEM_EN_NAMES[key];
    if (!nameEn) {
      throw new Error(
        `No English name for ${key} (${file}, source name ${JSON.stringify(def.name)})`,
      );
    }
    nameEnSource = 'translated';
  }
  return {
    code: def.code,
    name: def.name,
    nameEn,
    nameEnSource,
    family,
    kind: ptItemKind(def, family),
    price: def.price,
    weight: def.weight,
    level: def.requirements?.level ?? null,
    durability: def.durability,
    attack: def.attack,
    attackRange: def.attackRange,
    attackSpeed: def.attackSpeed,
    hit: def.hit,
    critical: def.critical,
    skillAttack: def.skillAttack,
    skillAttackRange: def.skillAttackRange,
    skillAttackRate: def.skillAttackRate,
    elements: def.elements,
    absorb: def.absorb,
    defense: def.defense,
    block: def.block,
    moveSpeed: def.moveSpeed,
    regen:
      def.hpRegen || def.mpRegen || def.spRegen
        ? { hp: def.hpRegen, mp: def.mpRegen, sp: def.spRegen }
        : null,
    bonus:
      def.hpBonus || def.mpBonus || def.spBonus
        ? { hp: def.hpBonus, mp: def.mpBonus, sp: def.spBonus }
        : null,
    restore:
      def.hpRestore || def.mpRestore || def.spRestore
        ? { hp: def.hpRestore, mp: def.mpRestore, sp: def.spRestore }
        : null,
    requirements: def.requirements,
    potionStock: def.potionStock,
    magicMastery: def.magicMastery,
    rebirthLimit: def.rebirthLimit,
    autoPickup: def.autoPickup,
    propSize: def.propSize,
    limit: def.limit,
    uniqueItem: def.uniqueItem,
    specialColor: def.specialColor,
    effectSet: def.effectSet,
    specJobs: def.specJobs,
    specRandomJobs: def.specRandomJobs,
    randomBonus: def.randomBonus,
    linkFile: def.linkFile,
    modelFile: def.modelFile,
    sitem: sitemRow
      ? {
          name: sitemRow.name,
          gridW: sitemRow.gridW,
          gridH: sitemRow.gridH,
          itemPath: sitemRow.itemPath,
          itemClass: sitemRow.itemClass,
          dropItem: sitemRow.dropItem,
          invPos: sitemRow.invPos,
          sound: sitemRow.sound,
          weaponClass: sitemRow.weaponClass,
        }
      : null,
    source: { file },
  };
}

// ---------------------------------------------------------------------------
// TypeScript emitters
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

const ITEM_HEADER = `// GENERATED by scripts/pt-port/pt_npcs.mjs, do not edit by hand.
// PT canonical item catalog - GameServer/OpenItem/<FILE>.txt joined with
// PT-Source/sinbaram/sinItem.cpp sItem[] client metadata.
//
// Keys: PT_ITEM_CATALOG is keyed by the *代码 LastCategory string (the join
// key NPC shop lists and monster drop tables resolve against). Variant files
// that share a code (QW* quest weapons, DA157/DB130-style mismatches) live in
// PT_ITEM_VARIANTS keyed by file stem - never silently merged.
// nameEn is the canonical player-facing English name (sitem = authentic
// sItem[] name, file = *Name directive, translated = pt_item_names_en.mjs,
// source = non-CJK source name passthrough). The 'name' field keeps the
// source zh for provenance only; it is NOT player-facing English.
// Numeric pairs keep source [min,max] ranges. See
// docs-botro/pt-monster-population-schema.md conventions.

`;

export function emitItemCatalogModule({ entries, variants, collisions, rules }) {
  const cat = {};
  for (const code of [...entries.keys()].sort(cmpStr)) cat[code] = entries.get(code);
  const varCat = {};
  for (const stem of [...variants.keys()].sort(cmpStr)) varCat[stem] = variants.get(stem);
  const enNames = {};
  for (const code of [...entries.keys()].sort(cmpStr)) {
    enNames[`pt_${code.toLowerCase()}`] = entries.get(code).nameEn;
  }
  for (const stem of [...variants.keys()].sort(cmpStr)) {
    enNames[`pt_${stem.toLowerCase()}`] = variants.get(stem).nameEn;
  }
  const lines = [ITEM_HEADER];
  lines.push(`export const PT_ITEM_CATALOG = ${jsVal(cat)};`);
  lines.push('');
  lines.push(`export const PT_ITEM_VARIANTS = ${jsVal(varCat)};`);
  lines.push('');
  lines.push(`export const PT_ITEM_COLLISIONS = ${jsVal(collisions)};`);
  lines.push('');
  lines.push(`export const PT_ITEM_RULES = ${jsVal(rules)};`);
  lines.push('');
  lines.push(`export const PT_ITEM_EN_NAMES = ${jsVal(enNames)};`);
  lines.push('');
  return lines.join('\n');
}
