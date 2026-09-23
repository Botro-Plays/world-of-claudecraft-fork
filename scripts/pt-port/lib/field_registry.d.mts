// Type declarations for field_registry.mjs (PT-Source/field.cpp catalog parser).

export interface PtFieldGate {
  targetIndex: number;
  x: number;
  z: number;
  y: number;
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
}

export function parseFieldRegistry(src: string): PtFieldEntry[];
export function loadFieldRegistry(): PtFieldEntry[];
