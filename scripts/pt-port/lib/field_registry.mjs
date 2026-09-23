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
// AddGate(psField[i+K], x, z, y) - target index is authored relative to i.
const RE_GATE = /psField\[i\]->AddGate\(\s*psField\[i([+-]\d+)?\]\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/;

export function parseFieldRegistry(src) {
  const fields = [];
  let cur = null;
  for (const line of src.split(/\r?\n/)) {
    let m = RE_SET_NAME.exec(line);
    if (m) {
      cur = {
        fieldIndex: fields.length,
        authoredIndex: m[3] !== undefined ? Number(m[3]) : fields.length,
        // C++ literals escape the path separator ("a\\b.ase"); collapse
        // the doubled backslash to a single '/'-style separator.
        asePath: m[1].replace(/\\\\/g, '/'),
        mapName: m[2] ?? null,
        state: null,
        stageObjects: [],
        centerPos: null,
        startPoints: [],
        gates: [],
      };
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
      const offset = m[1] ? Number(m[1]) : 0;
      cur.gates.push({ targetIndex: cur.fieldIndex + offset, x: Number(m[2]), z: Number(m[3]), y: Number(m[4]) });
    }
  }
  return fields;
}

// field.cpp lives at <PT-Source>/field.cpp (PT_SOURCE_DIR env override).
export function loadFieldRegistry() {
  const src = readFileSync(join(ptSourceDir(), 'field.cpp'), 'utf8');
  return parseFieldRegistry(src);
}
