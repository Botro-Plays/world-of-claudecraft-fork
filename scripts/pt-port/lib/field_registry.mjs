// Parser for the authored PT field catalog in PT-Source/field.cpp.
//
// field.cpp constructs every map imperatively inside a loop over psField[i]:
// a record begins at each SetName() call and accumulates the following
// State / AddStageObject / SetCenterPos / AddStartPoint / AddGate lines
// until the next SetName.
//
// Index semantics: fieldIndex is the registration order (authoritative).
// The trailing `//N` comment on SetName is recorded as authoredIndex but is
// NOT reliable - it drifts from registration order on three fields today
// (40/'dun-7'->41, 70/'Stemple'->62, 71/'swamp'->63), so consumers must key
// on fieldIndex only.
//
// Source facts recorded verbatim - this is catalog data, not guesswork:
//   SetName("ricarten\\village-2.ase","village-2")
//     arg1 = ASE source path (the shipped client carries the compiled .smd)
//     arg2 = map/minimap name (empty when the field has no minimap, e.g.
//            Fall_Game)
//   AddStageObject("ricarten\\v-ani01.ASE"[, 1])   // 1 = BipAnimation rig
//   SetCenterPos(x, z) / AddStartPoint(x, z)     // PT world coords
//   AddGate(psField[i+K], x, z, y)               // link target index + pos
//   AddGate(psField[N],  x, z, y)               // absolute registration index
//   AddWarpGate(x, z, y, size, height)          // teleport trigger cylinder
//   AddWarpOutGate(psField[i+K|N], x, z, y)     // exit; attaches to the
//                                             // last AddWarpGate (source
//                                             // WarpGateActiveNum)
//   WarpGate[WarpGateActiveNum].LimitLevel = FieldLimitLevel_Table[X]
//   WarpGate[WarpGateActiveNum].SpecialEffect = N
//
// WarpGate is a teleport, not a seam: CheckWarpGate warps the player to a
// randomly chosen OutGate record when the player stands inside the trigger
// cylinder (dx*dx+dz*dz < size*size, |dy| < height, height check disabled
// when the authored gate y is 0).
//
// The ChangeMapLevel() fixup block (direct psField[N]->WarpGate[K] writes)
// is dead code - the function has no caller anywhere in the tree - so its
// assignments are intentionally NOT parsed: the live engine never applies
// them. Only the inline WarpGateActiveNum assignments are live.
//
// The registry only reports what field.cpp declares; compiling a field is a
// separate step driven by its manifest.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ptSourceDir } from './pt_client.mjs';

// Second arg is the minimap name, or bare 0 when the field has none
// (e.g. `SetName("Fall_Game\\fall_game.ASE",0)`).
const RE_SET_NAME = /psField\[i\]->SetName\(\s*"([^"]*)"\s*,\s*(?:"([^"]*)"|0)\s*\)\s*;?\s*(?:\/\/\s*(\d+))?/;
const RE_STATE = /psField\[i\]->State\s*=\s*(FIELD_STATE_[A-Z_]+)/;
const RE_STAGE_OBJECT = /psField\[i\]->AddStageObject\(\s*"([^"]*)"\s*(?:,\s*(\d+)\s*)?\)/;
const RE_CENTER = /psField\[i\]->SetCenterPos\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/;
const RE_START = /psField\[i\]->AddStartPoint\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/;
// AddGate(psField[i+K], x, z, y) - relative slot, or
// AddGate(psField[N],  x, z, y) - absolute registration index; both forms
// appear in field.cpp.
const RE_GATE = /psField\[i\]->AddGate\(\s*psField\[(?:(\d+)|i([+-]\d+)?)\]\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/;
// AddWarpGate(x, z, y, size, height) - trigger cylinder. The definition's
// parameter order is (x, z, y, ...), and the authored calls confirm the
// second value is Z and the third the Y height.
const RE_WARP_GATE = /psField\[i\]->AddWarpGate\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/;
// AddWarpOutGate(psField[i+K|i-K|i|N], x, z, y) - one exit record bound to
// the most recent AddWarpGate (source WarpGateActiveNum).
const RE_WARP_OUT = /psField\[i\]->AddWarpOutGate\(\s*psField\[(?:(\d+)|i([+-]\d+)?)\]\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/;
// Inline live assignments on the last-created gate:
//   WarpGate[WarpGateActiveNum].LimitLevel    = FieldLimitLevel_Table[i+K|N]
//   WarpGate[WarpGateActiveNum].SpecialEffect = N
const RE_WARP_LIMIT = /psField\[i\]->WarpGate\[psField\[i\]->WarpGateActiveNum\]\.LimitLevel\s*=\s*FieldLimitLevel_Table\[(?:(\d+)|i([+-]\d+)?)\]/;
const RE_WARP_EFFECT = /psField\[i\]->WarpGate\[psField\[i\]->WarpGateActiveNum\]\.SpecialEffect\s*=\s*(\d+)/;
// Field-level limit: psField[i]->LimitLevel = FieldLimitLevel_Table[i].
// Only WingWarpGate_Field consults the field limit (via the table itself).
const RE_FIELD_LIMIT = /psField\[i\]->LimitLevel\s*=\s*FieldLimitLevel_Table\[(?:(\d+)|i([+-]\d+)?)\]/;

// field.cpp is GBK-era source with real /* ... */ regions (whole fields like
// Stemple/swamp are declared inside one) and // line comments that disable
// live-looking calls (AddGate/AddWarpGate among them). The matchers must only
// see active code, so comments are blanked out before parsing - positions
// preserved (comment bytes become spaces, newlines kept) so source layout
// and the //N authored-index capture on SetName still work: that capture
// reads the comment, so authoredIndex is taken BEFORE stripping.
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
      continue;
    }
    i += 1;
  }
  return out.join('');
}

// Resolve a psField/FieldLimitLevel_Table index expression captured as
// (absolute, relative): "N" -> N, "i+K"/"i-K" -> base+K, bare "i" -> base.
function resolveIndex(base, absolute, relative) {
  if (absolute !== undefined) return Number(absolute);
  return base + (relative ? Number(relative) : 0);
}

// FieldLimitLevel_Table[MAX_FIELD] = { ints... } is a plain C array
// literal; the per-field level limits live in the authored source, so the
// table is parsed rather than copied by hand. Comment bytes are already
// blanked by the caller.
function parseLimitLevelTable(strippedSrc) {
  const m = /FieldLimitLevel_Table\s*\[\s*MAX_FIELD\s*\]\s*=\s*\{([^}]*)\}/.exec(strippedSrc);
  if (!m) return [];
  return m[1].split(',').map((t) => Number(t.trim())).filter((n) => !Number.isNaN(n));
}

export function parseFieldRegistry(src) {
  const fields = [];
  let cur = null;
  // The AddWarpOutGate/assignment forms bind to the last AddWarpGate of the
  // current field (source: WarpGateActiveNum = WarpGateCount on add).
  let curWarp = null;
  // authoredIndex comes from the trailing //N comment on SetName, so it is
  // harvested from the UNstripped line; every other match runs on the
  // comment-free copy.
  const stripped = stripComments(src);
  const limitTable = parseLimitLevelTable(stripped);
  const lines = stripped.split(/\r?\n/);
  const raw = src.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const rawLine = raw[li] ?? line;
    // SetName only counts when it survives comment stripping (live code).
    // The //N authored-index capture lives in the trailing comment, which the
    // stripped line no longer carries, so it is recovered from the raw line.
    let m = RE_SET_NAME.exec(line);
    if (m) {
      const authored = RE_SET_NAME.exec(rawLine)?.[3];
      cur = {
        fieldIndex: fields.length,
        authoredIndex: authored !== undefined ? Number(authored) : fields.length,
        // C++ literals escape the path separator ("a\\b.ase"); collapse
        // the doubled backslash to a single '/'-style separator.
        asePath: m[1].replace(/\\\\/g, '/'),
        mapName: m[2] ?? null,
        state: null,
        stageObjects: [],
        centerPos: null,
        startPoints: [],
        gates: [],
        warpGates: [],
        // sFIELD is ZeroMemory'd: PosWarpOut is {0,0,0} until a self-targeting
        // AddWarpOutGate overwrites it, and LimitLevel stays 0 unless an
        // inline assignment appears.
        posWarpOut: null,
        limitLevel: limitTable[fields.length] ?? 0,
      };
      curWarp = null;
      fields.push(cur);
      continue;
    }
    if (!cur) continue;
    if ((m = RE_STATE.exec(line))) {
      cur.state = m[1];
    } else if ((m = RE_STAGE_OBJECT.exec(line))) {
      cur.stageObjects.push({ path: m[1].replace(/\\\\/g, '/'), bipAnimation: m[2] === '1' });
    } else if ((m = RE_CENTER.exec(line))) {
      cur.centerPos = [Number(m[1]), Number(m[2])];
    } else if ((m = RE_START.exec(line))) {
      cur.startPoints.push([Number(m[1]), Number(m[2])]);
    } else if ((m = RE_GATE.exec(line))) {
      const targetIndex = resolveIndex(cur.fieldIndex, m[1], m[2]);
      cur.gates.push({ targetIndex, x: Number(m[3]), z: Number(m[4]), y: Number(m[5]) });
    } else if ((m = RE_WARP_GATE.exec(line))) {
      // AddWarpGate(x, z, y, size, height); becomes the active gate that
      // following AddWarpOutGate/assignments bind to.
      curWarp = {
        x: Number(m[1]),
        z: Number(m[2]),
        y: Number(m[3]),
        size: Number(m[4]),
        height: Number(m[5]),
        limitLevel: 0,
        specialEffect: 0,
        exits: [],
      };
      cur.warpGates.push(curWarp);
    } else if ((m = RE_WARP_OUT.exec(line))) {
      const targetIndex = resolveIndex(cur.fieldIndex, m[1], m[2]);
      const exit = { targetIndex, x: Number(m[3]), z: Number(m[4]), y: Number(m[5]) };
      if (curWarp) curWarp.exits.push(exit);
      // Source parity: a self-targeting exit also stamps the field's own
      // PosWarpOut (last self-exit wins).
      if (targetIndex === cur.fieldIndex) {
        cur.posWarpOut = { x: exit.x, y: exit.y, z: exit.z };
      }
    } else if ((m = RE_WARP_LIMIT.exec(line))) {
      // Live only when bound to a gate that exists (source would write to
      // WarpGate[ActiveNum]; the authored data always pairs them).
      if (curWarp) {
        curWarp.limitLevel =
          limitTable[resolveIndex(cur.fieldIndex, m[1], m[2])] ?? 0;
      }
    } else if ((m = RE_WARP_EFFECT.exec(line))) {
      if (curWarp) curWarp.specialEffect = Number(m[1]);
    } else if ((m = RE_FIELD_LIMIT.exec(line))) {
      cur.limitLevel =
        limitTable[resolveIndex(cur.fieldIndex, m[1], m[2])] ?? 0;
    }
  }
  return fields;
}

// field.cpp lives at <PT-Source>/field.cpp (PT_SOURCE_DIR env override).
export function loadFieldRegistry() {
  const src = readFileSync(join(ptSourceDir(), 'field.cpp'), 'utf8');
  return parseFieldRegistry(src);
}
