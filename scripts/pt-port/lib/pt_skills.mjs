// PT skill catalog reader: joins the three MagicPT-Chinese sources into one
// canonical per-skill record.
//
//   PT-Source/sinbaram/sinSkill.h        - SKILL_* code constants encode
//     GROUP_<class> | CHANGE_JOB<1-5> | SKILL_<slot>; the GROUP prefix is the
//     class roster membership (sinSkill.cpp SearchUseSkill).
//   PT-Source/sinbaram/sinSkill.cpp      - sSkill[] table: display order,
//     icon filename, and the "TM<lvl>" learn-level tag per skill.
//   PT-Source/sinbaram/sinSkill_Info.h   - sSkill_Info[] rows: Chinese
//     name/doc, RequireLevel, UseStamina[2], RequireMastery[2], Element[3],
//     UseWeaponCode[10], F_* function tag, USECODE hand flag, UseMana key.
//   Server/skill.ini                     - per-rank (1..10) numeric tables
//     keyed <Prefix>_<Param>; the UseMana field names the mana key directly.
//
// All source text is GBK (Chinese MagicPT client). English display names are
// derived from the SKILL_* constant with an explicit override map for the
// official EN names that diverge from the constant spelling.

const GBK = new TextDecoder('gbk');

// GROUP_* high-byte owner -> our PlayerClass id. GROUP_OTHERSKILL is not a
// class (SOD/event skills) and never joins a roster.
export const PT_SKILL_GROUP_CLASS = {
  FIGHTER: 'tempskron_fighter',
  MECHANICIAN: 'tempskron_mechanician',
  PIKEMAN: 'tempskron_pikeman',
  ARCHER: 'tempskron_archer',
  KNIGHT: 'morion_knight',
  ATALANTA: 'morion_atalanta',
  PRIESTESS: 'morion_priestess',
  MAGICIAN: 'morion_magician',
  ASSASSIN: 'atlanteon_assassin',
  SHAMAN: 'atlanteon_shaman',
  MARTIALARTIST: 'atlanteon_martial_artist',
};

// SIN_SKILL_USE_* hand-binding flags (sinSkill_Info.h header).
export const PT_SKILL_HAND = {
  SIN_SKILL_USE_LEFT: 'left',
  SIN_SKILL_USE_RIGHT: 'right',
  SIN_SKILL_USE_ALL: 'all',
  SIN_SKILL_USE_NOT: 'passive',
};

// Official English PT names where the constant spelling is wrong or
// abbreviated. Anything absent falls back to a prettified SKILL_ token.
export const PT_SKILL_NAME_EN = {
  SKILL_PHYSICAL_ABSORB: 'Physical Absorption',
  SKILL_POISON_ATTRIBUTE: 'Poison Attribute',
  SKILL_MECHANIC_WEAPON: 'Mechanic Weapon Mastery',
  SKILL_LANDMINNING: 'Landmine',
  SKILL_H_SONIC: 'Hyper Sonic',
  SKILL_R_SMASH: 'Rough Smash',
  SKILL_P_ENHENCE: 'Precision',
  SKILL_FIRE_ATTRIBUTE: 'Fire Attribute',
  SKILL_MELEE_MASTERY: 'Melee Mastery',
  SKILL_RAGE_OF_ZECRAM: 'Rage of Zecram',
  SKILL_AVANGING_CRASH: 'Avenging Crash',
  SKILL_DETORYER: 'Destroyer',
  SKILL_BOOST_HEALTH: 'Boost Health',
  SKILL_D_HIT: 'Divine Impact',
  SKILL_P_DASH: 'Phantom Dash',
  SKILL_M_BLOW: 'Mortal Blow',
  SKILL_B_BERSERKER: 'Blood Berserker',
  SKILL_PIKE_WIND: 'Pike Wind',
  SKILL_ICE_ATTRIBUTE: 'Ice Attribute',
  SKILL_GROUND_PIKE: 'Ground Pike',
  SKILL_WEAPONE_DEFENCE_MASTERY: 'Weapon Defence Mastery',
  SKILL_D_REAPER: 'Death Reaper',
  SKILL_F_SPEAR: 'Flame Spear',
  SKILL_AMPLIFIED: 'Amplified Shield',
  SKILL_SS_ATTACK: 'Shadow Strike',
  SKILL_SCOUT_HAWK: 'Scout Hawk',
  SKILL_SHOOTING_MASTERY: 'Shooting Mastery',
  SKILL_WIND_ARROW: 'Wind Arrow',
  SKILL_PERFECT_AIM: 'Perfect Aim',
  SKILL_DIONS_EYE: "Dion's Eye",
  SKILL_ARROW_OF_RAGE: 'Arrow of Rage',
  SKILL_ELEMENTAL_SHOT: 'Elemental Shot',
  SKILL_GOLDEN_FALCON: 'Golden Falcon',
  SKILL_BOMB_SHOT: 'Bomb Shot',
  SKILL_PERFORATION: 'Perforation',
  SKILL_RECALL_WOLVERIN: 'Recall Wolverine',
  SKILL_EVASION_MASTERY: 'Evasion Mastery',
  SKILL_PHOENIX_SHOT: 'Phoenix Shot',
  SKILL_FORCE_OF_NATURE: 'Force of Nature',
  SKILL_E_SHOT: 'Exploding Shot',
  SKILL_S_ROPE: 'Spider Rope',
  SKILL_N_SPLASH: 'Nature Splash',
  SKILL_C_TRAP: 'Claymore Trap',
  SKILL_SWORD_BLAST: 'Sword Blast',
  SKILL_HOLY_BODY: 'Holy Body',
  SKILL_PHYSICAL_TRANING: 'Physical Training',
  SKILL_DOUBLE_CRASH: 'Double Crash',
  SKILL_HOLY_VALOR: 'Holy Valor',
  SKILL_PIERCING: 'Piercing',
  SKILL_DRASTIC_SPIRIT: 'Drastic Spirit',
  SKILL_SWORD_MASTERY: 'Sword Mastery',
  SKILL_DIVINE_INHALATION: 'Divine Inhalation',
  SKILL_HOLY_INCANTATION: 'Holy Incantation',
  SKILL_GRAND_CROSS: 'Grand Cross',
  SKILL_SWORD_OF_JUSTICE: 'Sword of Justice',
  SKILL_GODLY_SHIELD: 'Godly Shield',
  SKILL_GOD_BLESS: 'God Bless',
  SKILL_DIVINE_PIERCING: 'Divine Piercing',
  SKILL_S_BREAKER: 'Soul Breaker',
  SKILL_C_MOON: 'Crescent Moon',
  SKILL_S_BLADE: 'Shadow Blade',
  SKILL_H_BENEDIC: 'Holy Benediction',
  SKILL_SHIELD_STRIKE: 'Shield Strike',
  SKILL_THROWING_MASTERY: 'Throwing Mastery',
  SKILL_VIGOR_SPEAR: 'Vigor Spear',
  SKILL_TWIST_JAVELIN: 'Twist Javelin',
  SKILL_SOUL_SUCKER: 'Soul Sucker',
  SKILL_FIRE_JAVELIN: 'Fire Javelin',
  SKILL_SPLIT_JAVELIN: 'Split Javelin',
  SKILL_TRIUMPH_OF_VALHALLA: 'Triumph of Valhalla',
  SKILL_LIGHTNING_JAVELIN: 'Lightning Javelin',
  SKILL_STORM_JAVELIN: 'Storm Javelin',
  SKILL_HALL_OF_VALHALLA: 'Hall of Valhalla',
  SKILL_X_RAGE: 'X-Rage',
  SKILL_FROST_JAVELIN: 'Frost Javelin',
  SKILL_TALARIA: 'Talaria',
  SKILL_G_COUP: 'Grand Coup',
  SKILL_S_ARCUDA: 'Storm Arcuda',
  SKILL_S_FEAR: 'Shadow Fear',
  SKILL_MULTISPARK: 'Multi Spark',
  SKILL_HOLY_MIND: 'Holy Mind',
  SKILL_DIVINE_LIGHTNING: 'Divine Lightning',
  SKILL_HOLY_REFLECTION: 'Holy Reflection',
  SKILL_GRAND_HEALING: 'Grand Healing',
  SKILL_VIGOR_BALL: 'Vigor Ball',
  SKILL_EXTINCTION: 'Extinction',
  SKILL_VIRTUAL_LIFE: 'Virtual Life',
  SKILL_GLACIAL_SPIKE: 'Glacial Spike',
  SKILL_REGENERATION_FIELD: 'Regeneration Field',
  SKILL_CHAIN_LIGHTNING: 'Chain Lightning',
  SKILL_SUMMON_MUSPELL: 'Summon Muspell',
};

const DEFINE_RE = /^#define\s+(SKILL_[A-Z0-9_]+)\s+\(GROUP_([A-Z]+)\|CHANGE_JOB(\d+)\|SKILL_(\d+)\)/;
const GROUP_VALUE_RE = /^#define\s+GROUP_([A-Z]+)\s+0x([0-9A-Fa-f]+)0000/;
const USECODE_RE = /^SIN_SKILL_USE_(LEFT|RIGHT|ALL|NOT)$/;

// sinSkill.h: SKILL_* -> { group, tier, slot }. Skips utility defines
// (SKILL_1..SKILL_10 slot markers, SKILL_NORMAL_ATTACK, SKILL_ALL_WEAPON_USE).
export function parseSkillDefines(text) {
  const defs = new Map();
  const groups = new Map();
  for (const line of text.split('\n')) {
    const g = GROUP_VALUE_RE.exec(line);
    if (g) groups.set(g[1], parseInt(g[2], 16));
    const d = DEFINE_RE.exec(line);
    if (d) {
      defs.set(d[1], {
        constant: d[1],
        group: d[2],
        tier: Number(d[3]),
        slot: Number(d[4]),
      });
    }
  }
  return { defs, groups };
}

// sinSkill.cpp sSkill[] table: {"name", SKILL_X, "file", "icon"}, in roster
// order - the table order IS the class skill-window order (SearchUseSkill
// fills UseSkill slots by walking this array). Handles ragged rows where the
// icon column is absent.
export function parseSkillTable(text) {
  const start = text.indexOf('sSkill[SIN_MAX_SKILL]');
  if (start < 0) return [];
  const body = text.slice(start);
  const rows = [];
  const rowRe = /\{\s*"([^"]*)"\s*,\s*(SKILL_[A-Z0-9_]+)\s*,\s*"([^"]*)"\s*(?:,\s*"([^"]*)")?/g;
  let m;
  while ((m = rowRe.exec(body))) {
    rows.push({ code: m[2], nameZh: m[1].trim(), fileName: m[3].trim(), icon: (m[4] || '').trim() });
  }
  return rows;
}

// sinSkill_Info.h: the sSkill_Info[] initializer body. Entries are
//   {"name","doc", reqLevel, stamB,stamP, mastB,mastP, {e,e,e}, {w,...},
//    F_x, SKILL_Y, USECODE, ManaKey},
// separated by blank lines and GBK comments. Tokenize balanced top-level
// fields per entry; tolerate missing/misspelled tails (a few entries end at
// the weapons brace).
export function parseSkillInfo(text) {
  const entries = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const open = text.indexOf('{"', i);
    if (open < 0) break;
    // Find the balanced close of this top-level { ... } group.
    let depth = 0;
    let j = open;
    let inStr = false;
    for (; j < n; j++) {
      const ch = text[j];
      if (ch === '"') inStr = !inStr;
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) break;
    const entry = parseInfoEntry(text.slice(open + 1, j));
    if (entry) entries.push(entry);
    i = j + 1;
  }
  return entries;
}

function parseInfoEntry(body) {
  const fields = splitTopLevel(body);
  // fields[0] = "name", fields[1] = "doc", then scalars until the two brace
  // groups (element, weapons), then the tail tokens F_x,SKILL_Y,USE,mana.
  if (fields.length < 6) return null;
  const unquote = (s) => s.trim().replace(/^"|"$/g, '');
  const name = unquote(fields[0]);
  const doc = unquote(fields[1]);
  const scalars = [];
  const groups = [];
  let tail = [];
  for (const f of fields.slice(2)) {
    const t = f.trim();
    if (!t) continue;
    if (t.startsWith('{')) groups.push(t);
    else if (/^-?\d+$/.test(t)) scalars.push(Number(t));
    else tail.push(t);
  }
  // Tail order is F_func, SKILL_code, USECODE, UseManaKey but a few rows are
  // ragged; pick by shape instead of position.
  let func = '', code = '', use = '', manaKey = '';
  for (const t of tail) {
    if (t.startsWith('F_')) func = t;
    else if (t.startsWith('SKILL_')) code = t;
    else if (USECODE_RE.test(t)) use = t;
    else manaKey = t;
  }
  const numList = (g) => g.replace(/[{}]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    nameZh: name,
    docZh: doc,
    requireLevel: scalars[0] ?? 0,
    stamina: { base: scalars[1] ?? 0, perRank: scalars[2] ?? 0 },
    mastery: { base: scalars[3] ?? 0, perRank: scalars[4] ?? 0 },
    element: numList(groups[0] || '{0,0,0}'),
    weapons: numList(groups[1] || '{}'),
    func,
    code,
    use,
    manaKey,
  };
}

function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let inStr = false;
  let cur = '';
  for (const ch of s) {
    if (ch === '"') inStr = !inStr;
    if (!inStr) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (ch === ',' && depth === 0) {
        out.push(cur);
        cur = '';
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

// Server/skill.ini: KEY=v1,v2,... where each v is a scalar or "min|max".
// Values are keyed per rank (index = rank-1). GBK comments use '//'.
export function parseSkillIni(text) {
  const tables = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('[') || !line.includes('=')) continue;
    const eq = line.indexOf('=');
    const key = line.slice(0, eq).trim();
    const rhs = line.slice(eq + 1).replace(/\/\/.*$/, '').trim();
    const values = rhs.split(',').map((v) => {
      const t = v.trim();
      if (!t) return null;
      if (t.includes('|')) return t.split('|').map(Number);
      const n = Number(t);
      return Number.isFinite(n) ? n : t;
    });
    tables.set(key, values);
  }
  return tables;
}

function prettifyConstant(c) {
  return c
    .replace(/^SKILL_/, '')
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Join everything into catalog rows. Order follows the sSkill[] table (the
// client roster order); the sSkill_Info entry adds requirements and mana.
export function buildSkillCatalog({ skillH, skillCpp, skillInfoH, skillIni }) {
  const { defs } = parseSkillDefines(skillH);
  const tableRows = parseSkillTable(skillCpp);
  const infos = parseSkillInfo(skillInfoH);
  const ini = parseSkillIni(skillIni);
  const infoByCode = new Map(infos.filter((e) => e.code).map((e) => [e.code, e]));

  const rows = [];
  const seen = new Set();
  for (const tr of tableRows) {
    if (tr.code === 'SKILL_NORMAL_ATTACK' || seen.has(tr.code)) continue;
    const def = defs.get(tr.code);
    if (!def) continue; // not a class skill (SOD/event items)
    const cls = PT_SKILL_GROUP_CLASS[def.group];
    if (!cls) continue; // GROUP_OTHERSKILL and friends
    seen.add(tr.code);
    const info = infoByCode.get(tr.code);
    const manaKey = info?.manaKey || '';
    const iniPrefix = manaKey.replace(/_b?UseMana$/i, '');
    const mana = manaKey && ini.get(manaKey) ? ini.get(manaKey).map(Number) : null;
    // Per-skill ini tables share the mana key's prefix (E_Shield_* etc.).
    const iniKeys = {};
    if (iniPrefix) {
      for (const [k, v] of ini) {
        if (k === iniPrefix || k.startsWith(iniPrefix + '_')) iniKeys[k] = v;
      }
    }
    const id = 'pt_' + tr.code.replace(/^SKILL_/, '').toLowerCase();
    rows.push({
      id,
      code: tr.code,
      class: cls,
      tier: def.tier,
      slot: def.slot,
      name: PT_SKILL_NAME_EN[tr.code] || prettifyConstant(tr.code),
      nameZh: info?.nameZh || tr.nameZh,
      docZh: info?.docZh || '',
      requireLevel: info?.requireLevel ?? 0,
      stamina: info?.stamina || { base: 0, perRank: 0 },
      mastery: info?.mastery || { base: 0, perRank: 0 },
      element: info?.element || [],
      weapons: info?.weapons || [],
      func: info?.func || '',
      hand: PT_SKILL_HAND[info?.use] || 'all',
      mana,
      icon: tr.icon || '',
      fileName: tr.fileName || '',
      ini: iniKeys,
    });
  }
  return { rows, ini };
}
