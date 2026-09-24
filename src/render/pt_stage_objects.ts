// PT Ricarten stage objects: the v-ani01..v-ani14 animated props from
// client/Field/Ricarten (windmills, carts, fountains, banners, signposts).
//
// The data comes from pt_stage_objects.generated.ts, emitted by
// scripts/pt-port/compile_pt_stage_objects.mjs straight out of the smPAT3D
// binary (SMD Model data Ver 0.62). field.cpp registers all 14 objects for
// the Ricarten field through smSTAGE_OBJECT::AddObject(Pat) - the no-position
// overload that takes each node's placement from its own Tm translation, so
// node transforms here are absolute map coordinates, not offsets.
//
// Animation model (smOBJ3D::TmAnimation / smSTAGE_OBJECT::Draw):
//   - PT ticks run at 2 per millisecond (Frame += ms << 1) and wrap into
//     [160, MaxFrame] after the first pass - the loop never replays frames
//     below SCENE_TICKSPERFRAME=160 once it has wrapped.
//   - Per node and frame: TmFrameCnt>0 selects a key segment through the
//     TmRotFrame/TmPosFrame/TmScaleFrame tables; TmFrameCnt==0 uses the whole
//     track while frame < last key, else falls back to the base Tm rotation /
//     *TM_POS position. Ricarten's v-ani nodes all have TmFrameCnt=0.
//   - Rotation keys are accumulated delta quats; the emitted rotKeys hold the
//     absolute per-key orientation (compiled from TmPrevRot) and the runtime
//     slerps between adjacent keys. Position/scale keys lerp, same as PT's
//     GetPosFrame/GetScaleFrame.
//   - The composed local matrix is PT's qmat = R * S with translation in row
//     4 (rotate first, then scale); node.matrix = B * transpose(qmat) where B
//     is the PT->WoC band transform (X mirror + PT_SCALE + band offset), the
//     same map the terrain applies per vertex.
//
// PT gives smSTAGE_OBJECT no collision path, so nothing here is walkable;
// collision stays with the field faces in src/sim/pt_ricarten_field.ts.

import * as THREE from 'three';
import {
  PT_STAGE_OBJECTS,
  type PtStageObject,
  type PtStageObjectMaterial,
  type PtStageObjectNode,
} from './pt_stage_objects.generated';
import {
  PT_BAND_X_MIN,
  PT_BAND_Z,
  PT_RICARTEN_MAX_X,
  PT_RICARTEN_MIN_Y,
  PT_RICARTEN_MIN_Z,
  PT_SCALE,
} from '../sim/pt_band';
import type { PtFieldTransform } from '../sim/pt_field';
import { loadTexture } from './assets/loader';
import { sharedUniforms } from './gfx';
import {
  PT_ALPHA_TEST_REF,
  PT_SCRIPT_WATER,
  PT_SCRIPT_WINDZ1,
  ptApplyVertexScript,
  ptMaterialHasOpacityMap,
  ptMaterialIsHidden,
} from './pt_terrain';

export interface PtStageObjectsView {
  group: THREE.Group;
  /** Advance animated nodes to the current shared uTime clock. */
  update(): void;
  dispose(): void;
}

const TEXTURE_BASE = '/textures/pt-ricarten/';

// PT ticks = 2 per ms; segments below SCENE_TICKSPERFRAME=160 only play on
// the first pass (smSTAGE_OBJECT::Draw wrap rule).
const PT_TICKS_PER_MS = 2;
const PT_MIN_LOOP_FRAME = 160;

// B maps a PT world point to the WoC band: x_woc = BAND_X + (MAX_X - x) * s
// (mirrored), y_woc = (y - MIN_Y) * s, z_woc = BAND_Z + (z - MIN_Z) * s.
export const PT_STAGE_BAND_MATRIX = new THREE.Matrix4().set(
  -PT_SCALE, 0, 0, PT_BAND_X_MIN + PT_RICARTEN_MAX_X * PT_SCALE,
  0, PT_SCALE, 0, -PT_RICARTEN_MIN_Y * PT_SCALE,
  0, 0, PT_SCALE, PT_BAND_Z - PT_RICARTEN_MIN_Z * PT_SCALE,
  0, 0, 0, 1,
);

/**
 * The band matrix for an arbitrary PT transform. Every generated map's
 * transform is a diagonal affine map (per-axis scale + offset, X mirrored),
 * so the matrix is recoverable by evaluating each axis function at 0 and 1.
 * For the Ricarten transform this reproduces PT_STAGE_BAND_MATRIX exactly.
 */
export function ptStageBandMatrixFor(transform: PtFieldTransform): THREE.Matrix4 {
  const sx = transform.ptXToWoC(1) - transform.ptXToWoC(0);
  const tx = transform.ptXToWoC(0);
  const sy = transform.ptYToWoC(1) - transform.ptYToWoC(0);
  const ty = transform.ptYToWoC(0);
  const sz = transform.ptZToWoC(1) - transform.ptZToWoC(0);
  const tz = transform.ptZToWoC(0);
  return new THREE.Matrix4().set(
    sx, 0, 0, tx,
    0, sy, 0, ty,
    0, 0, sz, tz,
    0, 0, 0, 1,
  );
}

/** Everything a stage-object build needs from one map package. */
export interface PtStageObjectSource {
  /** Map id used for the group name (pt-<id>-stage-objects). */
  id: string;
  objects: readonly PtStageObject[];
  bandMatrix: THREE.Matrix4;
  textureBase: string;
}

// Scratch objects shared by every per-frame node update (no allocation in
// the animation loop).
const _quat = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _rotMat = new THREE.Matrix4();
const _scaleMat = new THREE.Matrix4();
const _nodeMat = new THREE.Matrix4();
const _identityQuat = new THREE.Quaternion(0, 0, 0, 1);
const _baseQuat = new THREE.Quaternion();

// The committed Ricarten stage-object source: the compiled v-ani objects
// bound to the Ricarten band matrix and texture root. buildPtStageObjectsView()
// with no argument resolves to exactly the pre-parameterization path.
const PT_RICARTEN_STAGE_SOURCE: PtStageObjectSource = {
  id: 'ricarten',
  objects: PT_STAGE_OBJECTS,
  bandMatrix: PT_STAGE_BAND_MATRIX,
  textureBase: TEXTURE_BASE,
};

// Convert a PT-space row-vector matrix (translation in row 4, as emitted for
// node.localMatrix) into a THREE column-major matrix. A row-vector matrix
// stored row-major is byte-identical to its transpose stored column-major,
// and the transpose is exactly the column-vector equivalent transform, so
// this is a plain element copy (translation stays at elements 12-14 either
// way).
export function ptRowMatToThree(src: Float32Array, out: THREE.Matrix4): void {
  const e = out.elements;
  for (let k = 0; k < 16; k++) e[k] = src[k];
}

// smFRAME_POS {StartFrame, EndFrame, PosNum, PosCnt}: return the key index
// (PosNum) of the segment covering `frame`, or -1.
function findSegment(table: Int32Array, tmFrameCnt: number, frame: number): number {
  for (let i = 0; i < tmFrameCnt; i++) {
    const b = i * 4;
    if (table[b + 3] > 0 && table[b] <= frame && table[b + 1] > frame) {
      return table[b + 2];
    }
  }
  return -1;
}

// Walk a key track forward from `base` to the segment covering `frame`
// (GetRotFrame/GetPosFrame semantics). Returns the index of the segment's
// first key, or -1 when frame precedes the track (PT early-returns, leaving
// the identity/empty part in place) or runs past the last key (PT reads out
// of bounds; we hold the last key instead).
function trackSegment(keyFrames: (k: number) => number, base: number, count: number, frame: number): number {
  if (base >= count || keyFrames(base) > frame) return -1;
  let k = base;
  while (k + 1 < count && keyFrames(k + 1) <= frame) k++;
  return k;
}

// Absolute-quaternion slerp between adjacent emitted keys. Exact at every
// keyframe; between keys it matches PT's PrevRot[k] * slerp(0 -> delta, a)
// morph closely (the authored keys sit 160 ticks apart, so the path differs
// by well under a degree).
function sampleRot(node: PtStageObjectNode, base: number, frame: number): THREE.Quaternion {
  const keys = node.rotKeys;
  const count = keys.length / 5;
  const k = trackSegment((i) => keys[i * 5], base, count, frame);
  if (k < 0) {
    return _identityQuat;
  }
  if (k + 1 >= count) {
    return _quat.set(keys[k * 5 + 1], keys[k * 5 + 2], keys[k * 5 + 3], keys[k * 5 + 4]);
  }
  const s = keys[k * 5];
  const e = keys[(k + 1) * 5];
  const alpha = e > s ? (frame - s) / (e - s) : 0;
  _quat.set(keys[k * 5 + 1], keys[k * 5 + 2], keys[k * 5 + 3], keys[k * 5 + 4]);
  _quatB.set(keys[(k + 1) * 5 + 1], keys[(k + 1) * 5 + 2], keys[(k + 1) * 5 + 3], keys[(k + 1) * 5 + 4]);
  return _quat.slerp(_quatB, alpha);
}

// Linear position sample; returns into `out` ([x,y,z] PT units).
function samplePos(node: PtStageObjectNode, base: number, frame: number, out: [number, number, number]): void {
  const keys = node.posKeys;
  const count = keys.length / 4;
  const k = trackSegment((i) => keys[i * 4], base, count, frame);
  if (k < 0) {
    out[0] = out[1] = out[2] = 0;
    return;
  }
  if (k + 1 >= count) {
    out[0] = keys[k * 4 + 1];
    out[1] = keys[k * 4 + 2];
    out[2] = keys[k * 4 + 3];
    return;
  }
  const s = keys[k * 4];
  const e = keys[(k + 1) * 4];
  const alpha = e > s ? (frame - s) / (e - s) : 0;
  for (let i = 0; i < 3; i++) {
    out[i] = keys[k * 4 + 1 + i] + (keys[(k + 1) * 4 + 1 + i] - keys[k * 4 + 1 + i]) * alpha;
  }
}

function sampleScale(node: PtStageObjectNode, base: number, frame: number, out: [number, number, number]): void {
  const keys = node.scaleKeys;
  const count = keys.length / 4;
  const k = trackSegment((i) => keys[i * 4], base, count, frame);
  if (k < 0 || k + 1 >= count) {
    out[0] = out[1] = out[2] = 1;
    return;
  }
  const s = keys[k * 4];
  const e = keys[(k + 1) * 4];
  const alpha = e > s ? (frame - s) / (e - s) : 0;
  for (let i = 0; i < 3; i++) {
    out[i] = keys[k * 4 + 1 + i] + (keys[(k + 1) * 4 + 1 + i] - keys[k * 4 + 1 + i]) * alpha;
  }
}

// The smSTAGE_OBJECT::Draw frame rule: ticks accumulate at 2/ms; once Frame
// passes MaxFrame it wraps into [160, MaxFrame] - frames below 160 only play
// on the very first pass.
export function ptObjectFrame(ticks: number, maxFrame: number): number {
  if (maxFrame <= 0) return 0;
  if (maxFrame <= PT_MIN_LOOP_FRAME) return ticks % maxFrame;
  if (ticks < maxFrame) return ticks;
  return PT_MIN_LOOP_FRAME + ((ticks - maxFrame) % (maxFrame - PT_MIN_LOOP_FRAME));
}

// Compose a node's animated transform at `frame` ticks, in PT space, as a
// THREE column-major matrix. Mirrors smOBJ3D::TmAnimation: with segment
// tables the frame picks per-track segments; without them each track runs
// while frame < its last key and then falls back to the base Tm pieces.
// Returns false when the node takes its static localMatrix this frame.
export function composeAnimatedMatrix(node: PtStageObjectNode, frame: number, out: THREE.Matrix4): boolean {
  const rotCnt = node.rotKeys.length / 5;
  const posCnt = node.posKeys.length / 4;
  const scaleCnt = node.scaleKeys.length / 4;

  let quat: THREE.Quaternion;
  const pos: [number, number, number] = [0, 0, 0];
  const scale: [number, number, number] = [1, 1, 1];

  if (node.tmFrameCnt > 0) {
    const segR = findSegment(node.rotFrameTable, node.tmFrameCnt, frame);
    const segP = findSegment(node.posFrameTable, node.tmFrameCnt, frame);
    const segS = findSegment(node.scaleFrameTable, node.tmFrameCnt, frame);
    // PT quirk: the scale test is strictly > 0 while rot/pos use >= 0.
    if (!(segR >= 0 || segP >= 0 || segS > 0)) return false;
    quat = rotCnt > 0 && segR >= 0 ? sampleRot(node, segR, frame) : _baseQuat.set(...(node.baseRotQuat as [number, number, number, number]));
    if (scaleCnt > 0 && segS >= 0) sampleScale(node, segS, frame, scale);
    if (posCnt > 0 && segP >= 0) samplePos(node, segP, frame, pos);
    else {
      pos[0] = node.basePos[0];
      pos[1] = node.basePos[1];
      pos[2] = node.basePos[2];
    }
  } else {
    if (rotCnt === 0 && posCnt === 0 && scaleCnt === 0) return false;
    quat = rotCnt > 0 && node.rotKeys[(rotCnt - 1) * 5] > frame
      ? sampleRot(node, 0, frame)
      : _baseQuat.set(...(node.baseRotQuat as [number, number, number, number]));
    if (scaleCnt > 0 && node.scaleKeys[(scaleCnt - 1) * 4] > frame) {
      sampleScale(node, 0, frame, scale);
    }
    if (posCnt > 0 && node.posKeys[(posCnt - 1) * 4] > frame) {
      samplePos(node, 0, frame, pos);
    } else {
      pos[0] = node.basePos[0];
      pos[1] = node.basePos[1];
      pos[2] = node.basePos[2];
    }
  }

  // PT composes v * R * S + T (rotate first, then scale). In column-major
  // terms that is Scale * Rotation for the linear part.
  _rotMat.makeRotationFromQuaternion(quat);
  _scaleMat.makeScale(scale[0], scale[1], scale[2]);
  out.multiplyMatrices(_scaleMat, _rotMat);
  out.elements[12] = pos[0];
  out.elements[13] = pos[1];
  out.elements[14] = pos[2];
  return true;
}

interface AnimatedNodeEntry {
  mesh: THREE.Mesh;
  node: PtStageObjectNode;
  // Precomputed B * static-local column matrix, used when the node falls
  // back to its static transform this frame.
  staticWorld: THREE.Matrix4;
}

interface ObjectEntry {
  obj: PtStageObject;
  animNodes: AnimatedNodeEntry[];
}

function textureUrlFor(mat: PtStageObjectMaterial, textureBase: string): string | null {
  if (mat.textureNames.length === 0) return null;
  const fileName = mat.textureNames[0].replace(/\\/g, '/').split('/').pop() || '';
  const baseName = fileName.replace(/\.[^.]+$/i, '').toLowerCase();
  if (!baseName) return null;
  return textureBase + baseName + '.png';
}

async function loadStageTexture(
  mat: PtStageObjectMaterial,
  textureBase: string,
  cache: Map<string, THREE.Texture | null>,
): Promise<THREE.Texture | null> {
  const url = textureUrlFor(mat, textureBase);
  if (!url) return null;
  if (!cache.has(url)) {
    try {
      cache.set(url, await loadTexture(url, { srgb: true, repeat: true }));
    } catch {
      cache.set(url, null);
    }
  }
  return cache.get(url)!;
}

function makeStageMaterial(
  mat: PtStageObjectMaterial | undefined,
  texture: THREE.Texture | null,
): THREE.MeshLambertMaterial {
  const transparency = mat?.transparency ?? 0;
  const opacityMap = ptMaterialHasOpacityMap(mat);
  const m = new THREE.MeshLambertMaterial({
    side: mat?.twoSide === false ? THREE.FrontSide : THREE.DoubleSide,
    map: texture ?? null,
  });
  if (opacityMap) m.alphaTest = PT_ALPHA_TEST_REF;
  if (opacityMap || transparency > 0) {
    m.transparent = true;
    m.opacity = Math.min(1, Math.max(0, 1 - transparency));
    m.depthWrite = transparency <= 0.2;
  }
  const script = mat?.windMeshBottom ?? 0;
  if ((script & PT_SCRIPT_WATER) !== 0) ptApplyVertexScript(m, 'water');
  else if ((script & PT_SCRIPT_WINDZ1) !== 0) ptApplyVertexScript(m, 'windz1');
  return m;
}

// Build one node's mesh: local PT-unit vertices, faces grouped by material.
// aPtXZ (world PT x,z, mod-4 folded) is emitted only when a water-script
// material is present; it is sampled under the node's base transform, which
// is exact for static nodes and the common case for animated ones.
async function buildNodeMesh(
  node: PtStageObjectNode,
  matByIdx: Map<number, PtStageObjectMaterial>,
  textureBase: string,
  textureCache: Map<string, THREE.Texture | null>,
  outMaterials: THREE.Material[],
): Promise<THREE.Mesh | null> {
  const facesByMaterial = new Map<number, number[]>();
  for (let fi = 0; fi < node.nFace; fi++) {
    const matIdx = node.faces[fi * 4 + 3];
    const mat = matByIdx.get(matIdx);
    if (ptMaterialIsHidden(mat)) continue;
    if (!facesByMaterial.has(matIdx)) facesByMaterial.set(matIdx, []);
    facesByMaterial.get(matIdx)!.push(fi);
  }
  if (facesByMaterial.size === 0) return null;

  const needsPtXZ = [...facesByMaterial.keys()].some(
    (mi) => ((matByIdx.get(mi)?.windMeshBottom ?? 0) & PT_SCRIPT_WATER) !== 0,
  );

  const positions: number[] = [];
  const uvs: number[] = [];
  const ptXZ: number[] = [];
  const groups: { material: number; start: number; count: number }[] = [];
  const lm = node.localMatrix;
  for (const [matIdx, faces] of facesByMaterial) {
    const start = positions.length / 3;
    for (const fi of faces) {
      for (let c = 0; c < 3; c++) {
        const vi = node.faces[fi * 4 + c];
        positions.push(node.verts[vi * 3], node.verts[vi * 3 + 1], node.verts[vi * 3 + 2]);
        if (needsPtXZ) {
          // World PT position of the vertex under the node's base local
          // matrix (row-vector multiply): only the spatial phase matters.
          const lx = node.verts[vi * 3];
          const ly = node.verts[vi * 3 + 1];
          const lz = node.verts[vi * 3 + 2];
          const wx = lx * lm[0] + ly * lm[4] + lz * lm[8] + lm[12];
          const wz = lx * lm[2] + ly * lm[6] + lz * lm[10] + lm[14];
          ptXZ.push(((wx % 4) + 4) % 4, ((wz % 4) + 4) % 4);
        }
      }
      uvs.push(
        node.uvs[fi * 6], 1 - node.uvs[fi * 6 + 3],
        node.uvs[fi * 6 + 1], 1 - node.uvs[fi * 6 + 4],
        node.uvs[fi * 6 + 2], 1 - node.uvs[fi * 6 + 5],
      );
    }
    groups.push({ material: matIdx, start, count: faces.length * 3 });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (needsPtXZ) geo.setAttribute('aPtXZ', new THREE.Float32BufferAttribute(ptXZ, 2));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const materials: THREE.Material[] = [];
  for (const g of groups) {
    const mat = matByIdx.get(g.material);
    const texture = mat ? await loadStageTexture(mat, textureBase, textureCache) : null;
    const m = makeStageMaterial(mat, texture);
    m.name = `pt-obj-mat-${g.material}`;
    materials.push(m);
    geo.addGroup(g.start, g.count, materials.length - 1);
  }

  const mesh = new THREE.Mesh(geo, materials);
  mesh.name = `pt-obj-${node.name}`;
  mesh.matrixAutoUpdate = false;
  outMaterials.push(...materials);
  return mesh;
}

export async function buildPtStageObjectsView(
  src: PtStageObjectSource = PT_RICARTEN_STAGE_SOURCE,
): Promise<PtStageObjectsView> {
  const group = new THREE.Group();
  group.name = `pt-${src.id}-stage-objects`;
  const bandMatrix = src.bandMatrix;

  const textureCache = new Map<string, THREE.Texture | null>();
  const allMaterials: THREE.Material[] = [];
  const meshes: THREE.Mesh[] = [];
  const objectEntries: ObjectEntry[] = [];

  for (const obj of src.objects) {
    const matByIdx = new Map<number, PtStageObjectMaterial>(
      obj.materials.map((m) => [m.index, m]),
    );
    const entry: ObjectEntry = { obj, animNodes: [] };
    for (const node of obj.nodes) {
      const mesh = await buildNodeMesh(node, matByIdx, src.textureBase, textureCache, allMaterials);
      if (!mesh) continue;
      // Static/base placement: node.matrix = B * transpose(localMatrix),
      // mapping PT-local units straight into WoC band coordinates.
      const staticLocal = new THREE.Matrix4();
      ptRowMatToThree(node.localMatrix, staticLocal);
      const staticWorld = new THREE.Matrix4().multiplyMatrices(bandMatrix, staticLocal);
      if (node.animated) {
        entry.animNodes.push({ mesh, node, staticWorld });
        mesh.matrix.copy(staticWorld);
      } else {
        mesh.matrix.copy(staticWorld);
      }
      mesh.matrixWorldNeedsUpdate = true;
      group.add(mesh);
      meshes.push(mesh);
    }
    objectEntries.push(entry);
  }

  function update(): void {
    const ticks = Math.floor(sharedUniforms.uTime.value * 1000) * PT_TICKS_PER_MS;
    for (const entry of objectEntries) {
      if (entry.animNodes.length === 0) continue;
      const frame = ptObjectFrame(ticks, entry.obj.maxFrame);
      for (const { mesh, node, staticWorld } of entry.animNodes) {
        if (composeAnimatedMatrix(node, frame, _nodeMat)) {
          mesh.matrix.multiplyMatrices(bandMatrix, _nodeMat);
        } else {
          mesh.matrix.copy(staticWorld);
        }
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
  }

  return {
    group,
    update,
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of mats) mm.dispose();
      }
      for (const t of textureCache.values()) t?.dispose();
    },
  };
}
