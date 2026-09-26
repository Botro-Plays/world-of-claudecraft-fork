// Focused tests for the PT Ricarten stage-object module (v-ani01..14):
// generated data integrity, the smSTAGE_OBJECT frame-wrap rule, and the
// smOBJ3D::TmAnimation composition semantics the runtime reproduces.

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// THREE.TextureLoader needs a DOM; stub the loader seam so the view-build
// smoke test can run under vitest.
vi.mock('../src/render/assets/loader', () => ({
  loadTexture: vi.fn(async () => new THREE.Texture()),
}));
import { PT_STAGE_OBJECTS } from '../src/render/pt_stage_objects.generated';
import {
  PT_STAGE_BAND_MATRIX,
  buildPtStageObjectsView,
  composeAnimatedMatrix,
  ptObjectFrame,
  ptRowMatToThree,
} from '../src/render/pt_stage_objects';
import { ptXToWoC, ptYToWoC, ptZToWoC } from '../src/sim/pt_band';

const WINDMILL_HUBS: [number, number][] = [
  // (PT x, PT z) of the six windmill blade hubs, from v-ani03/04 node Tms.
  // The blades rotate about the vertical axis through the hub (the source's
  // accumulated PrevRot is a pure x-depth-plane rotation), i.e. Ricarten's
  // mills are vertical-axis rotors, not horizontal wheels.
  [2808, -16050],
  [2683, -15937],
  [2559, -15833],
  [2281, -15835],
  [2153, -15940],
  [2039, -16059],
];

function obj(name: string) {
  const o = PT_STAGE_OBJECTS.find((p) => p.name === name);
  if (!o) throw new Error(`missing object ${name}`);
  return o;
}

function node(objName: string, nodeName: string) {
  const n = obj(objName).nodes.find((p) => p.name === nodeName);
  if (!n) throw new Error(`missing node ${objName}/${nodeName}`);
  return n;
}

describe('PT stage-object generated data', () => {
  it('emits all 14 v-ani objects field.cpp registers for Ricarten', () => {
    expect(PT_STAGE_OBJECTS.length).toBe(14);
    for (let i = 0; i < 14; i++) {
      expect(PT_STAGE_OBJECTS[i].name).toBe(
        `v-ani${String(i + 1).padStart(2, '0')}.smd`,
      );
    }
  });

  it('windmill objects carry rot-only blade nodes and static tower bases', () => {
    for (const name of ['v-ani03.smd', 'v-ani04.smd']) {
      const o = obj(name);
      const blades = o.nodes.filter(
        (n) => n.animated && n.rotKeys.length > 0 && n.posKeys.length === 0,
      );
      const bases = o.nodes.filter((n) => !n.animated);
      expect(blades.length).toBe(3);
      expect(bases.length).toBe(3);
      // Blade keys run the full 24000-tick loop at 160-tick spacing.
      for (const b of blades) {
        expect(b.rotKeys.length / 5).toBe(150);
        expect(b.rotKeys[0]).toBe(160);
      }
    }
    // The six hubs sit at the authentic tower positions (field.cpp order:
    // v-ani03 hubs east-to-west, then v-ani04 continuing west).
    const hubs = [...obj('v-ani03.smd').nodes, ...obj('v-ani04.smd').nodes]
      .filter((n) => n.animated)
      .map((n) => [Math.round(n.basePos[0]), Math.round(n.basePos[2])]);
    expect(hubs).toEqual(WINDMILL_HUBS);
  });

  it('UVs come from TexLink (finite, in-range), not uninitialized face t[]', () => {
    // PT stores real UVs in the TexLink array, not in smFACE.t[3] which is
    // uninitialized garbage left over from the 3ds Max ASE export. The
    // compiler reads UVs from TexLink[i] (face i -> TexLink i, nFace ==
    // nTexLink). This test pins that the emitted UVs are finite and in a
    // sane range; a regression that reverts to reading face t[] would
    // produce NaN/Infinity/-431602080 values.
    let totalFaces = 0;
    let badFinite = 0;
    let badRange = 0;
    for (const o of PT_STAGE_OBJECTS) {
      for (const n of o.nodes) {
        for (let fi = 0; fi < n.nFace; fi++) {
          totalFaces++;
          for (let c = 0; c < 3; c++) {
            const u = n.uvs[fi * 6 + c];
            const v = n.uvs[fi * 6 + 3 + c];
            if (!Number.isFinite(u) || !Number.isFinite(v)) badFinite++;
            // PT UVs can tile (e.g. tem_rope_01 reaches ~4.7) but should
            // stay within a small integer multiple of the texture. The
            // garbage face t[] values reached -431602080 and 3.4e9.
            if (Math.abs(u) > 100 || Math.abs(v) > 100) badRange++;
          }
        }
      }
    }
    expect(totalFaces).toBeGreaterThan(4000);
    expect(badFinite).toBe(0);
    expect(badRange).toBe(0);
  });

  it('rotation keys are unit quaternions and pos keys are absolute PT coords', () => {
    for (const o of PT_STAGE_OBJECTS) {
      for (const n of o.nodes) {
        for (let k = 0; k < n.rotKeys.length / 5; k++) {
          const len = Math.hypot(
            n.rotKeys[k * 5 + 1],
            n.rotKeys[k * 5 + 2],
            n.rotKeys[k * 5 + 3],
            n.rotKeys[k * 5 + 4],
          );
          expect(len).toBeCloseTo(1, 3);
        }
      }
    }
    // ani-25 (v-ani01) pos keys stay near its authored pivot.
    const n25 = node('v-ani01.smd', 'ani-25');
    const px = n25.posKeys[1];
    const pz = n25.posKeys[3];
    expect(px).toBeGreaterThan(2300);
    expect(px).toBeLessThan(2450);
    expect(pz).toBeGreaterThan(-16700);
    expect(pz).toBeLessThan(-16500);
  });
});

describe('ptObjectFrame (smSTAGE_OBJECT::Draw wrap rule)', () => {
  it('plays the full 0..MaxFrame range on the first pass', () => {
    expect(ptObjectFrame(0, 24000)).toBe(0);
    expect(ptObjectFrame(100, 24000)).toBe(100);
    expect(ptObjectFrame(23999, 24000)).toBe(23999);
  });

  it('wraps into [160, MaxFrame) after the first pass', () => {
    // ticks = maxFrame + k lands at 160 + k (the Draw wrap clamp).
    expect(ptObjectFrame(24000, 24000)).toBe(160);
    expect(ptObjectFrame(24001, 24000)).toBe(161);
    expect(ptObjectFrame(24000 + 160, 24000)).toBe(320);
    // Later wraps keep the same [160, MaxFrame) window.
    const f = ptObjectFrame(24000 + 23840 + 5, 24000);
    expect(f).toBe(160 + 5);
    for (let t = 0; t < 500000; t += 977) {
      const fr = ptObjectFrame(t, 24000);
      if (t >= 24000) expect(fr).toBeGreaterThanOrEqual(160);
      expect(fr).toBeLessThan(24000);
    }
  });
});

describe('composeAnimatedMatrix (smOBJ3D::TmAnimation)', () => {
  it('pins a rot-only windmill blade to its hub while rotating', () => {
    const blade = node('v-ani03.smd', 'ani-30');
    const m0 = new THREE.Matrix4();
    const m1 = new THREE.Matrix4();
    expect(composeAnimatedMatrix(blade, 160, m0)).toBe(true);
    expect(composeAnimatedMatrix(blade, 1760, m1)).toBe(true);
    // Translation (elements 12-14) is the authored hub position at both
    // frames: rot-only nodes never move.
    for (const m of [m0, m1]) {
      expect(m.elements[12]).toBeCloseTo(blade.basePos[0], 3);
      expect(m.elements[13]).toBeCloseTo(blade.basePos[1], 3);
      expect(m.elements[14]).toBeCloseTo(blade.basePos[2], 3);
    }
    // The linear part differs: the blade actually rotates (it turns a full
    // revolution over the 24000-tick loop, so a half-turn shows clearly).
    composeAnimatedMatrix(blade, 160 + 12000, m1);
    const same =
      Math.abs(m0.elements[0] - m1.elements[0]) +
      Math.abs(m0.elements[5] - m1.elements[5]) +
      Math.abs(m0.elements[10] - m1.elements[10]);
    expect(same).toBeGreaterThan(0.5);
  });

  it('rotates a blade about a consistent axis through the hub', () => {
    const blade = node('v-ani03.smd', 'ani-30');
    // A blade-tip local vertex must stay within the blade radius of the hub
    // under every sampled frame: the rotation is about the node origin.
    const m = new THREE.Matrix4();
    const tip = new THREE.Vector3(0, 49, 0); // blade top (PT units, local)
    const hub = new THREE.Vector3(...(blade.basePos as [number, number, number]));
    for (const f of [160, 3200, 8000, 16000, 23999]) {
      composeAnimatedMatrix(blade, f, m);
      const p = tip.clone().applyMatrix4(m);
      // The tip orbits the hub at the authored radius (~49 PT units),
      // never drifting from the tower.
      expect(p.distanceTo(hub)).toBeCloseTo(49, 1);
    }
  });

  it('returns false for static nodes (Tm fallback)', () => {
    const base = node('v-ani03.smd', 'Object12471');
    const m = new THREE.Matrix4();
    expect(composeAnimatedMatrix(base, 160, m)).toBe(false);
    expect(composeAnimatedMatrix(base, 23999, m)).toBe(false);
  });

  it('keeps every animated node finite and in-bounds across its loop', () => {
    const m = new THREE.Matrix4();
    for (const o of PT_STAGE_OBJECTS) {
      for (const n of o.nodes) {
        if (!n.animated) continue;
        for (let f = 160; f < o.maxFrame; f += 1600) {
          const ok = composeAnimatedMatrix(n, f, m);
          if (!ok) continue; // static fallback frame: localMatrix applies
          for (let k = 0; k < 16; k++) {
            expect(Number.isFinite(m.elements[k])).toBe(true);
          }
          // Node origin must stay inside (or near) the Ricarten map bounds:
          // x [-3498, 5585], y [-259, 1013], z [-22373, -13194], with a
          // 500-unit margin for authored motion.
          expect(m.elements[12]).toBeGreaterThan(-4000);
          expect(m.elements[12]).toBeLessThan(6100);
          expect(m.elements[13]).toBeGreaterThan(-800);
          expect(m.elements[13]).toBeLessThan(1600);
          expect(m.elements[14]).toBeGreaterThan(-22900);
          expect(m.elements[14]).toBeLessThan(-12700);
        }
      }
    }
  });

  it('interpolates position tracks between keys', () => {
    const n25 = node('v-ani01.smd', 'ani-25');
    const mA = new THREE.Matrix4();
    const mB = new THREE.Matrix4();
    composeAnimatedMatrix(n25, 160, mA);
    composeAnimatedMatrix(n25, 16160, mB);
    // The node physically moves (carts on rails), so translations differ.
    const dx = mA.elements[12] - mB.elements[12];
    const dy = mA.elements[13] - mB.elements[13];
    const dz = mA.elements[14] - mB.elements[14];
    expect(Math.hypot(dx, dy, dz)).toBeGreaterThan(0.1);
  });
});

describe('WoC band placement', () => {
  it('maps the static node origin to the authored PT position', () => {
    const base = node('v-ani03.smd', 'Object12471');
    const local = new THREE.Matrix4();
    ptRowMatToThree(base.localMatrix, local);
    const world = new THREE.Matrix4().multiplyMatrices(PT_STAGE_BAND_MATRIX, local);
    // Origin of the node maps to its PT position through the same transform
    // the terrain uses per vertex (mirrored X, PT_SCALE, band offset).
    const o = new THREE.Vector3(0, 0, 0).applyMatrix4(world);
    expect(o.x).toBeCloseTo(ptXToWoC(base.basePos[0]), 4);
    expect(o.y).toBeCloseTo(ptYToWoC(base.basePos[1]), 4);
    expect(o.z).toBeCloseTo(ptZToWoC(base.basePos[2]), 4);
  });
});

describe('view build smoke test', () => {
  it('builds one mesh per visible node with finite geometry', async () => {
    const view = await buildPtStageObjectsView();
    const meshes: THREE.Mesh[] = [];
    view.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    // 63 nodes total across v-ani01..14; hidden-material nodes may drop out,
    // so require a sane lower bound rather than an exact count.
    expect(meshes.length).toBeGreaterThan(50);
    for (const mesh of meshes) {
      const pos = mesh.geometry.getAttribute('position');
      expect(pos.count).toBeGreaterThan(0);
      for (let i = 0; i < pos.count * 3; i++) {
        expect(Number.isFinite(pos.array[i])).toBe(true);
      }
    }
    // Animation update must not throw or produce NaN transforms. The view
    // reads the PT wall clock (source RendStatTime = wall ms).
    for (let i = 0; i < 40; i++) {
      view.update();
      for (const mesh of meshes) {
        for (let k = 0; k < 16; k++) {
          expect(Number.isFinite(mesh.matrix.elements[k])).toBe(true);
        }
      }
    }
    view.dispose();
  });
});
