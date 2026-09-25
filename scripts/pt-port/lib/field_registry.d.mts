// Type declarations for field_registry.mjs (PT-Source/field.cpp catalog parser).

export interface PtFieldGate {
  targetIndex: number;
  x: number;
  z: number;
  y: number;
}

/** One authored AddWarpOutGate exit record (sFGATE OutGate[] slot). */
export interface PtWarpOutGate {
  targetIndex: number;
  x: number;
  z: number;
  y: number;
}

/** One authored AddWarpGate trigger (sWARPGATE). */
export interface PtWarpGate {
  x: number;
  z: number;
  y: number;
  size: number;
  height: number;
  /** Resolved from FieldLimitLevel_Table (0 when unassigned). */
  limitLevel: number;
  specialEffect: number;
  exits: PtWarpOutGate[];
}

export interface PtFieldEntry {
  fieldIndex: number;
  authoredIndex: number;
  asePath: string;
  mapName: string | null;
  state: string | null;
  stageObjects: { path: string; bipAnimation: boolean }[];
  centerPos: [number, number] | null;
  startPoints: [number, number][];
  gates: PtFieldGate[];
  warpGates: PtWarpGate[];
  /** sFIELD::PosWarpOut, stamped by the last self-targeting exit. */
  posWarpOut: { x: number; y: number; z: number } | null;
  /** sFIELD::LimitLevel (FieldLimitLevel_Table[fieldIndex]). */
  limitLevel: number;
}

export function parseFieldRegistry(src: string): PtFieldEntry[];
export function loadFieldRegistry(): PtFieldEntry[];
