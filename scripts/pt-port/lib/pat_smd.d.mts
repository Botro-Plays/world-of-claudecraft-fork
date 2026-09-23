// Type declarations for pat_smd.mjs (smPAT3D stage-object parser/emitter).

export interface PtPatMaterial {
  index: number;
  inUse: boolean;
  textureNames: string[];
  twoSide: boolean;
  transparency: number;
  useState: number;
  meshState: number;
  windMeshBottom: number;
}

export interface PtPatNode {
  name: string;
  parent: string | null;
  nVertex: number;
  nFace: number;
  rotCnt: number;
  posCnt: number;
  scaleCnt: number;
  tmFrameCnt: number;
  basePos: number[];
  [key: string]: unknown;
}

export interface PtPatObject {
  fileName: string;
  objCounter: number;
  maxFrame: number;
  nodes: PtPatNode[];
  materials: PtPatMaterial[];
}

export function parsePat(buf: Buffer, fileName: string): PtPatObject;
export function emitModule(objects: PtPatObject[], sourceLabel: string): string;
