// Type declarations for stage_smd.mjs (PT stage-SMD parser/classifier/emitter).

export interface PtMaterial {
  index: number;
  inUse: boolean;
  textureCounter: number;
  blendType: number;
  shade: number;
  twoSide: boolean;
  transparency: number;
  useState: number;
  meshState: number;
  windMeshBottom: number;
  isWalkable: boolean;
  mapOpacity: number;
  textureType: number;
  animTexCounter: number;
  frameMask: number;
  shiftFrameSpeed: number;
  animationFrame: number;
  textureNames: string[];
  animTextureNames: string[];
}

export interface PtStageLight {
  type: number;
  x: number;
  y: number;
  z: number;
  range: number;
  r: number;
  g: number;
  b: number;
}

export interface PtStageSmd {
  version: string;
  nVertex: number;
  nFace: number;
  vertices: Float32Array;
  vertexColors: Int16Array;
  faces: Uint16Array;
  faceMat: Uint16Array;
  faceTexLinkIdx: Int32Array;
  texLinkU: Float32Array;
  texLinkV: Float32Array;
  materials: PtMaterial[];
  contrast: number;
  bright: number;
  vectLight: number[];
  lights: PtStageLight[];
  stageArea: (number[] | null)[];
  stageMapRect: unknown;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

export interface PtBuiltFaces {
  walkableFaceIndices: Uint16Array;
  waterFaceIndices: Uint16Array;
  decorativeFaceIndices: Uint16Array;
  nWalkable: number;
  cellOffsets: Int32Array;
  cellCounts: Int16Array;
  filteredFaceIndices: Uint16Array;
}

export interface PtTextureEntry {
  name: string;
  format: string;
  materialIndices: number[];
  anim: boolean;
}

export interface PtWaterRule {
  rule?: 'translucent' | 'explicit' | 'script';
  materials?: number[];
}

export const PT_TRANSLUCENT_THRESHOLD: number;

// Only the three fields the rule branches actually read, so synthetic
// material fixtures in tests need not fabricate the whole record.
export function waterMaterialSet(
  materials: ReadonlyArray<Pick<PtMaterial, 'index' | 'transparency' | 'windMeshBottom'>>,
  water?: PtWaterRule,
): Set<number>;
export function parseSmd(buf: Buffer): PtStageSmd;
export function classifyAndBuild(smd: PtStageSmd, waterMatSet: Set<number>): PtBuiltFaces;
export function buildPerFaceUVs(smd: PtStageSmd): Float32Array;
export function buildTextureManifest(smd: PtStageSmd): PtTextureEntry[];
export function emitModule(
  smd: PtStageSmd,
  built: PtBuiltFaces,
  uvs: Float32Array,
  textureManifest: PtTextureEntry[],
  sourceLabel: string,
  opts?: { minimapPng?: string | null },
): string;
