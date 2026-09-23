import * as THREE from 'three';
import { skeletonPaletteNeedsUpdate } from './skeleton_update_core';

export interface SkeletonUpdateStats {
  requests: number;
  updates: number;
  skips: number;
  paletteMatricesUpdated: number;
}

interface SkeletonUpdateEntry {
  skeleton: THREE.Skeleton;
  originalUpdate: THREE.Skeleton['update'];
  wrappedUpdate: THREE.Skeleton['update'];
  appliedPoseRevision: number;
  worldMatrix: number[] | null;
  skinnedMeshes: THREE.SkinnedMesh[];
  /** Stock applyBoneTransform per mesh, restored on dispose. */
  originalApplyBoneTransform: Map<
    THREE.SkinnedMesh,
    THREE.SkinnedMesh['applyBoneTransform']
  >;
}

const _refInv = new THREE.Matrix4();
const _rel = new THREE.Matrix4();
const _IDENTITY = new THREE.Matrix4();
const _skinIndex = new THREE.Vector4();
const _skinWeight = new THREE.Vector4();
const _baseVector = new THREE.Vector4();
const _vector4 = new THREE.Vector4();
const _boneMatrix = new THREE.Matrix4();
const _meshInv = new THREE.Matrix4();

// Bone palettes are uploaded to the GPU as float32. Stock Skeleton.update
// writes bone.matrixWorld * boneInverse — WORLD space — so at instance-band
// coordinates (|x| ~ 1.4e5, f32 ulp ~0.016 yd) the idle sway's sub-millimetre
// drift re-quantizes every matrix element each frame and skinned vertices
// snap a whole ulp at a time: the idle "tremble" seen on far-off bands.
// Emitting the palette relative to the armature's parent frame keeps every
// shader intermediate small; each bound mesh then compensates through
// bindMatrixInverse = meshWorld^-1 * refWorld (identity when the mesh sits at
// the armature transform, the common case) so the shader still produces
// mesh-local positions.
function skeletonRefWorld(skeleton: THREE.Skeleton): THREE.Matrix4 {
  // A rig whose root bone has no parent keeps stock world-space palettes.
  return skeleton.bones[0]?.parent?.matrixWorld ?? _IDENTITY;
}

function updateSkeletonLocalSpace(skeleton: THREE.Skeleton, refWorld: THREE.Matrix4): void {
  const boneMatrices = skeleton.boneMatrices;
  _refInv.copy(refWorld).invert();
  const bones = skeleton.bones;
  const boneInverses = skeleton.boneInverses;
  for (let i = 0; i < bones.length; i++) {
    _rel
      .copy(_refInv)
      .multiply(bones[i] ? bones[i].matrixWorld : _IDENTITY)
      .multiply(boneInverses[i]);
    if (boneMatrices) _rel.toArray(boneMatrices, i * 16);
  }
  if (skeleton.boneTexture) skeleton.boneTexture.needsUpdate = true;
}

// skinned = boneMatrix * bindSpaceVertex is ref-space under a localized
// palette; the shader's bindMatrixInverse must map ref-space back to each
// mesh's local frame (meshWorld^-1 * refWorld). updateMatrixWorld rewrites
// bindMatrixInverse in BOTH bind modes, so this refresh runs inside
// skeleton.update — after the scene-graph pass, before the draw reads it.
function refreshBindInverses(refWorld: THREE.Matrix4, meshes: THREE.SkinnedMesh[]): void {
  for (const mesh of meshes) {
    mesh.bindMatrixInverse.copy(mesh.matrixWorld).invert().multiply(refWorld);
  }
}

// three r185's stock applyBoneTransform reads the LIVE bones in f64 and ends
// with target.applyMatrix4(this.bindMatrixInverse). Under a localized palette
// bindMatrixInverse carries meshWorld^-1 * refWorld at read time, which would
// double-apply the ref frame to a world-space intermediate. This twin is the
// stock math verbatim except the final map is matrixWorld^-1 — algebraically
// the same result (ref cancels) and immune to bindMatrixInverse timing.
function applyBoneTransformLocalized(
  this: THREE.SkinnedMesh,
  index: number,
  target: THREE.Vector3,
): THREE.Vector3;
function applyBoneTransformLocalized(
  this: THREE.SkinnedMesh,
  index: number,
  target: THREE.Vector4,
): THREE.Vector4;
function applyBoneTransformLocalized(
  this: THREE.SkinnedMesh,
  index: number,
  target: THREE.Vector3 | THREE.Vector4,
): THREE.Vector3 | THREE.Vector4 {
  const skeleton = this.skeleton;
  const geometry = this.geometry;
  _skinIndex.fromBufferAttribute(
    geometry.getAttribute('skinIndex') as THREE.BufferAttribute,
    index,
  );
  _skinWeight.fromBufferAttribute(
    geometry.getAttribute('skinWeight') as THREE.BufferAttribute,
    index,
  );
  if ((target as THREE.Vector4).isVector4) {
    _baseVector.copy(target as THREE.Vector4);
    (target as THREE.Vector4).set(0, 0, 0, 0);
  } else {
    _baseVector.set(target.x, target.y, target.z, 1);
    (target as THREE.Vector3).set(0, 0, 0);
  }
  _baseVector.applyMatrix4(this.bindMatrix);
  for (let i = 0; i < 4; i++) {
    const weight = _skinWeight.getComponent(i);
    if (weight === 0) continue;
    const boneIndex = _skinIndex.getComponent(i);
    const bone = skeleton.bones[boneIndex];
    const boneInverse = skeleton.boneInverses[boneIndex];
    if (!bone || !boneInverse) continue;
    _boneMatrix.multiplyMatrices(bone.matrixWorld, boneInverse);
    (target as THREE.Vector4).addScaledVector(
      _vector4.copy(_baseVector).applyMatrix4(_boneMatrix),
      weight,
    );
  }
  if ((target as THREE.Vector4).isVector4) {
    (target as THREE.Vector4).w = _baseVector.w;
  }
  return target.applyMatrix4(_meshInv.copy(this.matrixWorld).invert());
}

/**
 * Three asks every visible skeleton to rebuild its palette once per render,
 * even when distance cadence skipped the mixer. Each character owns its
 * skeletons, so an exact pose revision plus the first bone's world matrix is
 * sufficient to reuse that character's unchanged palette and bone texture.
 */
export class SkeletonUpdateCache {
  private poseRevision = 0;
  private readonly entries: SkeletonUpdateEntry[] = [];
  private readonly counters: SkeletonUpdateStats = {
    requests: 0,
    updates: 0,
    skips: 0,
    paletteMatricesUpdated: 0,
  };

  constructor(model: THREE.Object3D) {
    const meshesBySkeleton = new Map<THREE.Skeleton, THREE.SkinnedMesh[]>();
    model.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh || !mesh.skeleton) return;
      const list = meshesBySkeleton.get(mesh.skeleton);
      if (list) list.push(mesh);
      else meshesBySkeleton.set(mesh.skeleton, [mesh]);
    });
    for (const [skeleton, meshes] of meshesBySkeleton) this.install(skeleton, meshes);
  }

  markPoseChanged(): void {
    this.poseRevision++;
  }

  stats(): SkeletonUpdateStats {
    return { ...this.counters };
  }

  /** Track a skinned mesh bound to a cached skeleton AFTER install (deferred
   *  face decals bind during attachDeferredDecals, well past the constructor
   *  sweep): without this its bindMatrixInverse stays the stock meshWorld^-1
   *  and the ref-space palette would displace it. */
  registerMesh(mesh: THREE.SkinnedMesh): void {
    const entry = this.entries.find((e) => e.skeleton === mesh.skeleton);
    if (!entry || entry.skinnedMeshes.includes(mesh)) return;
    entry.skinnedMeshes.push(mesh);
    this.patchApplyBoneTransform(entry, mesh);
  }

  dispose(): void {
    for (const entry of this.entries) {
      if (entry.skeleton.update === entry.wrappedUpdate) {
        entry.skeleton.update = entry.originalUpdate;
      }
      for (const [mesh, original] of entry.originalApplyBoneTransform) {
        mesh.applyBoneTransform = original;
      }
    }
    this.entries.length = 0;
  }

  private patchApplyBoneTransform(
    entry: SkeletonUpdateEntry,
    mesh: THREE.SkinnedMesh,
  ): void {
    if (entry.originalApplyBoneTransform.has(mesh)) return;
    entry.originalApplyBoneTransform.set(mesh, mesh.applyBoneTransform);
    mesh.applyBoneTransform = applyBoneTransformLocalized;
  }

  private install(skeleton: THREE.Skeleton, skinnedMeshes: THREE.SkinnedMesh[]): void {
    const originalUpdate = skeleton.update;
    const entry: SkeletonUpdateEntry = {
      skeleton,
      originalUpdate,
      wrappedUpdate: () => undefined,
      appliedPoseRevision: -1,
      worldMatrix: null,
      skinnedMeshes: [...skinnedMeshes],
      originalApplyBoneTransform: new Map(),
    };
    for (const mesh of skinnedMeshes) this.patchApplyBoneTransform(entry, mesh);
    entry.wrappedUpdate = () => {
      this.counters.requests++;
      const currentWorldMatrix = skeleton.bones[0]?.matrixWorld.elements;
      if (
        !currentWorldMatrix ||
        skeletonPaletteNeedsUpdate(
          this.poseRevision,
          entry.appliedPoseRevision,
          entry.worldMatrix,
          currentWorldMatrix,
        )
      ) {
        updateSkeletonLocalSpace(skeleton, skeletonRefWorld(skeleton));
        entry.appliedPoseRevision = this.poseRevision;
        entry.worldMatrix ??= new Array<number>(currentWorldMatrix?.length ?? 0);
        if (currentWorldMatrix) {
          for (let i = 0; i < currentWorldMatrix.length; i++) {
            entry.worldMatrix[i] = currentWorldMatrix[i];
          }
        }
        this.counters.updates++;
        this.counters.paletteMatricesUpdated += skeleton.bones.length;
      } else {
        this.counters.skips++;
      }
      // The bindMatrixInverse refresh runs on EVERY request, not just palette
      // rewrites: updateMatrixWorld overwrites it per frame in either bind
      // mode, and a mesh's own transform can move while the pose is static.
      refreshBindInverses(skeletonRefWorld(skeleton), entry.skinnedMeshes);
    };
    skeleton.update = entry.wrappedUpdate;
    this.entries.push(entry);
  }
}
