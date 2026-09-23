import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SkeletonUpdateCache } from '../src/render/characters/skeleton_update_cache';
import { skeletonPaletteNeedsUpdate } from '../src/render/characters/skeleton_update_core';
import { applySkinnedCullBounds } from '../src/render/characters/skinned_cull_bounds';

// r185 types boneMatrices nullable; a bound rig always has a palette.
function palette(skeleton: THREE.Skeleton): number[] {
  const matrices = skeleton.boneMatrices;
  if (matrices === null) throw new Error('skeleton.boneMatrices not initialized');
  return [...matrices];
}

function rig(): {
  model: THREE.Group;
  rootBone: THREE.Bone;
  childBone: THREE.Bone;
  skeleton: THREE.Skeleton;
} {
  const model = new THREE.Group();
  const rootBone = new THREE.Bone();
  const childBone = new THREE.Bone();
  rootBone.add(childBone);
  model.add(rootBone);
  const skeleton = new THREE.Skeleton([rootBone, childBone]);
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.add(rootBone);
  mesh.bind(skeleton);
  model.add(mesh);
  model.updateMatrixWorld(true);
  return { model, rootBone, childBone, skeleton };
}

describe('skeleton palette update decision', () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  it('updates initially, after a pose revision, and after an exact matrix change', () => {
    expect(skeletonPaletteNeedsUpdate(0, -1, null, identity)).toBe(true);
    expect(skeletonPaletteNeedsUpdate(1, 0, identity, identity)).toBe(true);
    expect(skeletonPaletteNeedsUpdate(0, 0, identity, [...identity.slice(0, 12), 2, 0, 0, 1])).toBe(
      true,
    );
  });

  it('skips only when both pose revision and world matrix are exactly unchanged', () => {
    expect(skeletonPaletteNeedsUpdate(4, 4, identity, [...identity])).toBe(false);
    const negativeZero = [...identity];
    negativeZero[1] = -0;
    expect(skeletonPaletteNeedsUpdate(4, 4, identity, negativeZero)).toBe(true);
  });
});

describe('SkeletonUpdateCache', () => {
  it('elides duplicate updates but refreshes pose and ancestor-transform changes', () => {
    const { model, childBone, skeleton } = rig();
    const originalUpdate = skeleton.update;
    const cache = new SkeletonUpdateCache(model);

    skeleton.update();
    const initialPalette = palette(skeleton);
    skeleton.update();
    expect(palette(skeleton)).toEqual(initialPalette);
    expect(cache.stats()).toEqual({
      requests: 2,
      updates: 1,
      skips: 1,
      paletteMatricesUpdated: 2,
    });

    childBone.position.x = 0.75;
    model.updateMatrixWorld(true);
    cache.markPoseChanged();
    skeleton.update();
    expect(cache.stats().updates).toBe(2);
    const posedPalette = palette(skeleton);
    expect(posedPalette).not.toEqual(initialPalette);

    // The palette is emitted in the armature's parent frame, so translating
    // the model cancels out: the update still fires (bones[0].matrixWorld
    // changed) but the ref-space values are motion-invariant — that invariance
    // is exactly what keeps far-band palettes from re-quantizing per frame.
    model.position.z = 3;
    model.updateMatrixWorld(true);
    skeleton.update();
    expect(palette(skeleton)).toEqual(posedPalette);
    expect(cache.stats()).toEqual({
      requests: 4,
      updates: 3,
      skips: 1,
      paletteMatricesUpdated: 6,
    });

    cache.dispose();
    expect(skeleton.update).toBe(originalUpdate);
  });
});

describe('far-band palette localization', () => {
  // The instance bands sit at |x| ~1.4e5 where float32 quantum is ~0.016 yd:
  // a world-space palette re-rounds every element per frame and skinned
  // vertices snap a whole ulp (the idle tremble). The cache must emit the
  // palette relative to the armature's parent frame instead.
  const FAR_X = 139_507;

  function farRig() {
    const model = new THREE.Group();
    const rootBone = new THREE.Bone();
    const childBone = new THREE.Bone();
    childBone.position.set(0, 0.5, 0);
    rootBone.add(childBone);
    const skeleton = new THREE.Skeleton([rootBone, childBone]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.25, 0], 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([1, 0, 0, 0], 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    mesh.add(rootBone);
    mesh.bind(skeleton);
    model.add(mesh);
    model.position.x = FAR_X;
    model.updateMatrixWorld(true);
    return { model, rootBone, childBone, skeleton, mesh };
  }

  /** The world-space vertex the shader must produce, computed stock-style. */
  function stockWorldVertex(mesh: THREE.SkinnedMesh, index: number): THREE.Vector3 {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const skinIndex = mesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
    const v = new THREE.Vector3().fromBufferAttribute(pos, index).applyMatrix4(mesh.bindMatrix);
    const m = new THREE.Matrix4().multiplyMatrices(
      mesh.skeleton.bones[skinIndex.getX(index)].matrixWorld,
      mesh.skeleton.boneInverses[skinIndex.getX(index)],
    );
    return v.applyMatrix4(m);
  }

  it('keeps palette matrices small at band coordinates', () => {
    const { model, skeleton } = farRig();
    const cache = new SkeletonUpdateCache(model);
    skeleton.update();
    const entries = palette(skeleton);
    // Root bone sits at the armature frame: its palette row is ~identity.
    // No element may carry the band's ~1.4e5 coordinate.
    for (const value of entries) expect(Math.abs(value)).toBeLessThan(100);
    cache.dispose();
  });

  it('produces the identical world vertex through the shader path', () => {
    const { model, skeleton, mesh } = farRig();
    const cache = new SkeletonUpdateCache(model);
    skeleton.update();
    // Shader chain: meshWorld * bindMatrixInverse * boneMatrix * bindMatrix * pos
    // must equal the stock boneWorld * boneInverse * bindMatrix * pos.
    const paletteMatrix = new THREE.Matrix4().fromArray(skeleton.boneMatrices ?? [], 16);
    const gpuChain = new THREE.Matrix4()
      .copy(mesh.matrixWorld)
      .multiply(mesh.bindMatrixInverse)
      .multiply(paletteMatrix)
      .multiply(mesh.bindMatrix);
    const pos = new THREE.Vector3(0, 0.25, 0).applyMatrix4(gpuChain);
    const expected = stockWorldVertex(mesh, 0);
    expect(pos.x).toBeCloseTo(expected.x, 4);
    expect(pos.y).toBeCloseTo(expected.y, 4);
    expect(pos.z).toBeCloseTo(expected.z, 4);
    cache.dispose();
  });

  it('keeps CPU skinning (applyBoneTransform) mesh-local and stock-equal', () => {
    const { model, skeleton, mesh } = farRig();
    const cache = new SkeletonUpdateCache(model);
    skeleton.update();
    // applyBoneTransform reads the vertex position from `target`, matching
    // the stock callers (assets.ts posed-bounds pass).
    const v = new THREE.Vector3().fromBufferAttribute(
      mesh.geometry.getAttribute('position') as THREE.BufferAttribute,
      0,
    );
    mesh.applyBoneTransform(0, v);
    // Mesh-local result: meshWorld^-1 * worldVertex.
    const expected = stockWorldVertex(mesh, 0).applyMatrix4(
      new THREE.Matrix4().copy(mesh.matrixWorld).invert(),
    );
    expect(v.x).toBeCloseTo(expected.x, 5);
    expect(v.y).toBeCloseTo(expected.y, 5);
    expect(v.z).toBeCloseTo(expected.z, 5);
    cache.dispose();
  });

  it('refreshes bindMatrixInverse even when the palette update is skipped', () => {
    const { model, skeleton, mesh } = farRig();
    const cache = new SkeletonUpdateCache(model);
    skeleton.update();
    // A second call with an unchanged pose skips the palette rewrite, but
    // updateMatrixWorld (attached mode) rewrites bindMatrixInverse each frame;
    // the refresh must still land the compensated value.
    mesh.bindMatrixInverse.copy(mesh.matrixWorld).invert();
    skeleton.update();
    const expected = new THREE.Matrix4()
      .copy(mesh.matrixWorld)
      .invert()
      .multiply(skeleton.bones[0].parent!.matrixWorld);
    expect(mesh.bindMatrixInverse.elements).toEqual(
      expected.elements.map((e) => expect.closeTo(e, 6)),
    );
    cache.dispose();
  });

  it('registerMesh covers a late-bound mesh', () => {
    const { model, skeleton, rootBone } = farRig();
    const cache = new SkeletonUpdateCache(model);
    const late = new THREE.SkinnedMesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    late.bind(skeleton);
    model.add(late);
    model.updateMatrixWorld(true);
    cache.registerMesh(late);
    skeleton.update();
    const expected = new THREE.Matrix4()
      .copy(late.matrixWorld)
      .invert()
      .multiply(rootBone.parent!.matrixWorld);
    for (let i = 0; i < 16; i++) {
      expect(late.bindMatrixInverse.elements[i]).toBeCloseTo(expected.elements[i], 6);
    }
    cache.dispose();
  });
});

describe('a rig culled from both passes costs no palette flatten', () => {
  // three calls Skeleton.update from WebGLObjects.update, and BOTH passes call
  // that inside their own `! frustumCulled || frustum.intersectsObject` guard
  // (pinned against three's source in tests/character_cull_core.test.ts). So
  // the padded sphere skinned_cull_bounds.ts installs is also what decides
  // whether a rig re-flattens its palette and re-arms its bone texture.
  const RIG_HEIGHT = 1.8;

  function culledRig() {
    const root = new THREE.Group();
    const rootBone = new THREE.Bone();
    const skeleton = new THREE.Skeleton([rootBone]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    mesh.add(rootBone);
    mesh.bind(skeleton);
    root.add(mesh);
    applySkinnedCullBounds(mesh, root, RIG_HEIGHT);
    return { root, mesh };
  }

  /** Replay of three's per-pass guard, using its own predicate. */
  function submit(frustum: THREE.Frustum, mesh: THREE.SkinnedMesh): void {
    if (!mesh.frustumCulled || frustum.intersectsObject(mesh)) mesh.skeleton.update();
  }

  function frustumOf(camera: THREE.Camera): THREE.Frustum {
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    return new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
  }

  const view = (() => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    camera.lookAt(0, 0, -1);
    camera.updateProjectionMatrix();
    return frustumOf(camera);
  })();
  // The sun's ortho box, aimed at the player standing at the origin.
  const light = (() => {
    const camera = new THREE.OrthographicCamera(-105, 105, 105, -105, 30, 480);
    camera.position.set(0, 400, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    return frustumOf(camera);
  })();

  it('asks for no palette update when neither pass can see it', () => {
    const { root, mesh } = culledRig();
    const cache = new SkeletonUpdateCache(root);
    // Behind the camera AND outside the sun's ortho box.
    root.position.set(0, 0, 400);
    root.updateMatrixWorld(true);
    submit(view, mesh);
    submit(light, mesh);
    expect(cache.stats().requests).toBe(0);
    expect(cache.stats().paletteMatricesUpdated).toBe(0);
  });

  it('still asks once for a rig only the shadow pass can see', () => {
    const { root, mesh } = culledRig();
    const cache = new SkeletonUpdateCache(root);
    // Behind the camera, inside the sun's box: the shadow draw is the only one.
    root.position.set(0, 0, 40);
    root.updateMatrixWorld(true);
    submit(view, mesh);
    expect(cache.stats().requests).toBe(0);
    submit(light, mesh);
    expect(cache.stats().requests).toBe(1);
    expect(cache.stats().updates).toBe(1);
  });

  it('asks in the colour pass for a rig on screen', () => {
    const { root, mesh } = culledRig();
    const cache = new SkeletonUpdateCache(root);
    root.position.set(0, 0, -20);
    root.updateMatrixWorld(true);
    submit(view, mesh);
    expect(cache.stats().requests).toBe(1);
  });
});
