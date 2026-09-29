// Morion Monk GLB assembler entry point.
//
// The Monk is a fork-added class — MagicPT has no Monk JOBCODE, mesh, skeleton,
// or motion file (the last original JOBCODE is JOBCODE_MARTIALARTIST = 11).
// The visual source is a static Tripo GLB (pt_monk_source.glb): one unrigged
// mesh, no skin, no animations, already posed standing with arms down.
//
// Because the source has no skeleton, this assembler grafts the Monk mesh onto
// the EXISTING assembled m7 rig taken from public/models/creatures/pt_shaman.glb
// (the user-approved animation donor: Bip01 skeleton + the full m7 clip set —
// STAND, WALK, RUN, STAND_COMBAT, ATTACK, DAMAGE, DEAD, FALLDOWN, FALLSTAND,
// FALLSTAND_REVERSED, SKILL, EAT, YAHOO, RESTART, FALLDAMAGE). The Shaman GLB
// itself is not modified.
//
// Skinning follows the established PT convention: rigid skinning, one bone per
// vertex, weight 1.0 (see scripts/pt-port/glb_assembler.ts). Because the Tripo
// mesh has no authored bind pose, each Monk vertex is bound to the bone of its
// NEAREST Shaman vertex measured in the Shaman's STAND frame-0 pose — the
// Shaman mesh already carves the body into correct bone regions (arm verts
// carry arm bones, torso verts carry spine bones, etc.), so nearest-vertex
// transfer inherits that partitioning without a hand-authored region map.
//
// Bind matrices: IBM_j = inverse(jointWorld_j @ STAND frame 0), so the authored
// Tripo pose renders undeformed while STAND plays, and every other clip deforms
// the mesh relative to that authored pose.
//
// Scale/alignment: the Monk is authored 1 unit tall at origin-on-feet, Y-up,
// facing +Z (toes forward) — the same conventions the converted PT models use.
// It is scaled x47 to match the Shaman's measured STAND height (y 0 -> 47.09);
// in-world size is then normalized by the manifest rawHeight like every other
// PT class, so the GLB-space scale only needs to land each body part near its
// donor bone.
//
// Usage:
//   npx tsx scripts/pt-port/monk_assembler.ts [shaman_glb] [monk_src_glb] [out]

import { writeFileSync } from 'node:fs';
import { NodeIO, Node, type Document } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';

const DEFAULT_SHAMAN = 'public/models/creatures/pt_shaman.glb';
const DEFAULT_MONK_SRC = 'scripts/pt-port/pt_monk_source.glb';
const DEFAULT_OUT = 'public/models/creatures/pt_monk.glb';

// Monk source GLB is 1.0 units tall; the Shaman's STAND pose skinned bounds
// measure y 0 -> 47.09, so 47 puts the Monk crown at the Shaman crown.
const MONK_SCALE = 47.0;

// ---------------------------------------------------------------------------
// Minimal column-major mat4 helpers (glTF accessor layout)
// ---------------------------------------------------------------------------

type Mat4 = number[];

function trs(t: number[], q: number[], s: number[]): Mat4 {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function mul(a: Mat4, b: Mat4): Mat4 {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) r[i + j * 4] += a[i + k * 4] * b[k + j * 4];
  return r;
}

function xf(m: Mat4, v: [number, number, number]): [number, number, number] {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}

function invert(m: Mat4): Mat4 {
  // General 4x4 inverse (Gauss-Jordan on augmented rows); matrices here are
  // affine TRS, so conditioning is fine.
  const a = [
    [m[0], m[4], m[8], m[12], 1, 0, 0, 0],
    [m[1], m[5], m[9], m[13], 0, 1, 0, 0],
    [m[2], m[6], m[10], m[14], 0, 0, 1, 0],
    [m[3], m[7], m[11], m[15], 0, 0, 0, 1],
  ];
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) throw new Error('singular matrix');
    if (p !== c) { const t = a[p]; a[p] = a[c]; a[c] = t; }
    const d = a[c][c];
    for (let k = 0; k < 8; k++) a[c][k] /= d;
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = a[r][c];
      for (let k = 0; k < 8; k++) a[r][k] -= f * a[c][k];
    }
  }
  return [
    a[0][4], a[1][4], a[2][4], a[3][4],
    a[0][5], a[1][5], a[2][5], a[3][5],
    a[0][6], a[1][6], a[2][6], a[3][6],
    a[0][7], a[1][7], a[2][7], a[3][7],
  ];
}

// ---------------------------------------------------------------------------
// Joint world matrices at a given clip's frame 0
// ---------------------------------------------------------------------------

function jointWorldsAtClipStart(doc: Document, clipName: string): Map<Node, Mat4> {
  const root = doc.getRoot();
  const anim = root.listAnimations().find((a) => a.getName() === clipName);
  if (!anim) throw new Error(`clip ${clipName} not found`);
  const over = new Map<Node, { t?: number[]; r?: number[]; s?: number[] }>();
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode();
    if (!node) continue;
    const vals = ch.getSampler()?.getOutput()?.getArray();
    if (!vals) continue;
    let m = over.get(node);
    if (!m) { m = {}; over.set(node, m); }
    const p = ch.getTargetPath();
    if (p === 'translation') m.t = [vals[0], vals[1], vals[2]];
    else if (p === 'rotation') m.r = [vals[0], vals[1], vals[2], vals[3]];
    else if (p === 'scale') m.s = [vals[0], vals[1], vals[2]];
  }
  const world = new Map<Node, Mat4>();
  const walk = (n: Node, pm: Mat4 | null) => {
    const o = over.get(n) ?? {};
    const lm = trs(o.t ?? n.getTranslation(), o.r ?? n.getRotation(), o.s ?? n.getScale());
    const wm = pm ? mul(pm, lm) : lm;
    world.set(n, wm);
    for (const c of n.listChildren()) walk(c, wm);
  };
  for (const sc of root.listScenes()) for (const n of sc.listChildren()) walk(n, null);
  return world;
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const shamanPath = process.argv[2] || DEFAULT_SHAMAN;
  const monkSrcPath = process.argv[3] || DEFAULT_MONK_SRC;
  const outPath = process.argv[4] || DEFAULT_OUT;

  console.log('=== Morion Monk GLB Assembly (m7 rig graft) ===');
  console.log(`Donor rig:  ${shamanPath}`);
  console.log(`Monk source:${monkSrcPath}`);
  console.log(`Output:     ${outPath}`);

  const io = new NodeIO();
  const doc = await io.read(shamanPath);
  const monkDoc = await io.read(monkSrcPath);
  const root = doc.getRoot();
  const monkRoot = monkDoc.getRoot();

  const skin = root.listSkins()[0];
  if (!skin) throw new Error('donor GLB has no skin');
  const joints = skin.listJoints();
  const donorIbm = skin.getInverseBindMatrices();
  if (!donorIbm) throw new Error('donor skin has no inverseBindMatrices');

  // 1. Joint world matrices at STAND frame 0 (the bind pose for the graft).
  const standWorld = jointWorldsAtClipStart(doc, 'STAND');

  // 2. Shaman skinned vertex positions at STAND frame 0 + their bone indices.
  //    v_stand = jointWorld * IBM * v_bind  (PT rigid skinning: w = 1.0)
  const donorPts: number[] = [];
  const donorBone: number[] = [];
  const ibmArr = donorIbm.getArray() as Float32Array;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')?.getArray();
      const jn = prim.getAttribute('JOINTS_0')?.getArray();
      if (!pos || !jn) continue;
      for (let i = 0; i < pos.length / 3; i++) {
        const j = jn[i * 4];
        const w = standWorld.get(joints[j]);
        if (!w) continue;
        const ib: Mat4 = Array.from(ibmArr.slice(j * 16, j * 16 + 16));
        const v = xf(mul(w, ib), [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
        donorPts.push(v[0], v[1], v[2]);
        donorBone.push(j);
      }
    }
  }
  console.log(`Donor skinned verts at STAND: ${donorBone.length}`);

  // 3. Monk source mesh -> scale into skeleton space.
  const mPrim = monkRoot.listMeshes()[0]?.listPrimitives()[0];
  if (!mPrim) throw new Error('monk source has no mesh primitive');
  const mPos = mPrim.getAttribute('POSITION')?.getArray();
  const mNrm = mPrim.getAttribute('NORMAL')?.getArray();
  const mUv = mPrim.getAttribute('TEXCOORD_0')?.getArray();
  const mIdx = mPrim.getIndices()?.getArray();
  const mMat = mPrim.getMaterial();
  const mTex = mMat?.getBaseColorTexture();
  if (!mPos || !mNrm || !mUv || !mIdx || !mMat || !mTex) {
    throw new Error('monk source missing POSITION/NORMAL/TEXCOORD_0/indices/material/texture');
  }
  const nVert = mPos.length / 3;
  const pos = new Float32Array(nVert * 3);
  for (let i = 0; i < nVert * 3; i++) pos[i] = mPos[i] * MONK_SCALE;

  // 4. Rigid bind: nearest donor STAND vertex -> its bone.
  const jointsArr = new Uint8Array(nVert * 4);
  const weightsArr = new Float32Array(nVert * 4);
  const boneUse = new Map<number, number>();
  for (let i = 0; i < nVert; i++) {
    const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
    let best = 0, bestD = Infinity;
    for (let d = 0; d < donorBone.length; d++) {
      const dx = px - donorPts[d * 3], dy = py - donorPts[d * 3 + 1], dz = pz - donorPts[d * 3 + 2];
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd < bestD) { bestD = dd; best = d; }
    }
    const bone = donorBone[best];
    jointsArr[i * 4] = bone;
    weightsArr[i * 4] = 1;
    boneUse.set(bone, (boneUse.get(bone) ?? 0) + 1);
  }
  const used = [...boneUse.keys()].sort((a, b) => a - b);
  console.log(`Bones used (${used.length}):`);
  for (const b of used) {
    console.log(`  ${joints[b].getName().padEnd(22)} ${boneUse.get(b)} verts`);
  }

  // 5. New IBMs: inverse of each joint's world matrix at STAND frame 0, so the
  //    authored Tripo pose renders undeformed at idle.
  const ibm = new Float32Array(joints.length * 16);
  for (let j = 0; j < joints.length; j++) {
    const w = standWorld.get(joints[j]);
    if (!w) throw new Error(`no world matrix for joint ${joints[j].getName()}`);
    ibm.set(invert(w), j * 16);
  }

  // 6. Rebuild the doc: keep the skeleton node tree + all animation clips,
  //    replace the Shaman mesh/skin with the Monk mesh + new skin.
  const buf = root.listBuffers()[0] ?? doc.createBuffer();
  const acc = (type: 'VEC3' | 'VEC2' | 'VEC4' | 'SCALAR', arr: Float32Array | Uint8Array | Uint32Array | Uint16Array) =>
    doc.createAccessor().setType(type).setArray(arr as Float32Array).setBuffer(buf);

  const tex = doc.createTexture('pt_monk')
    .setImage(mTex.getImage()!)
    .setMimeType(mTex.getMimeType());
  const mat = doc.createMaterial('pt_monk')
    .setBaseColorTexture(tex)
    .setDoubleSided(mMat.getDoubleSided())
    .setMetallicFactor(mMat.getMetallicFactor())
    .setRoughnessFactor(mMat.getRoughnessFactor())
    .setBaseColorFactor(mMat.getBaseColorFactor());

  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', pos))
    .setAttribute('NORMAL', acc('VEC3', mNrm instanceof Float32Array ? mNrm : new Float32Array(mNrm)))
    .setAttribute('TEXCOORD_0', acc('VEC2', mUv instanceof Float32Array ? mUv : new Float32Array(mUv)))
    .setAttribute('JOINTS_0', acc('VEC4', jointsArr))
    .setAttribute('WEIGHTS_0', acc('VEC4', weightsArr))
    .setIndices(acc('SCALAR', mIdx instanceof Uint32Array ? mIdx : new Uint32Array(mIdx)))
    .setMaterial(mat);
  const mesh = doc.createMesh('pt_monk').addPrimitive(prim);

  const ibmAcc = doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf);
  const newSkin = doc.createSkin('pt_monk')
    .setInverseBindMatrices(ibmAcc);
  for (const j of joints) newSkin.addJoint(j);
  if (skin.getSkeleton()) newSkin.setSkeleton(skin.getSkeleton());

  const meshNode = root.listNodes().find((n) => n.getMesh());
  if (!meshNode) throw new Error('donor GLB has no mesh node');
  meshNode.setMesh(mesh).setSkin(newSkin).setName('pt_monk');

  // Dispose the donor mesh + skin; prune drops their now-orphaned accessors,
  // materials, and textures (nodes targeted by animation channels are kept).
  const donorMesh = root.listMeshes().filter((m) => m !== mesh);
  const donorSkins = root.listSkins().filter((s) => s !== newSkin);
  for (const m of donorMesh) m.dispose();
  for (const s of donorSkins) s.dispose();
  for (const m of root.listMaterials().filter((x) => x !== mat)) m.dispose();
  for (const t of root.listTextures().filter((x) => x !== tex)) t.dispose();
  await doc.transform(prune());

  // 7. Structural assertions before writing.
  const anims = root.listAnimations().map((a) => a.getName());
  for (const need of ['STAND', 'STAND_COMBAT', 'WALK', 'RUN', 'FALLDOWN', 'FALLSTAND',
    'FALLSTAND_REVERSED', 'ATTACK', 'DAMAGE', 'DEAD']) {
    if (!anims.includes(need)) throw new Error(`missing clip ${need}`);
  }
  const outSkin = meshNode.getSkin();
  if (!outSkin || outSkin.listJoints().length !== joints.length) {
    throw new Error('output skin/joint mismatch');
  }

  const bytes = await io.writeBinary(doc);
  writeFileSync(outPath, bytes);
  console.log(`\nWrote ${outPath} (${(bytes.length / 1024).toFixed(0)} KB, ${nVert} verts, ${anims.length} clips, ${joints.length} joints)`);
  console.log('Clips:', anims.join(', '));
}

main().catch((err) => {
  console.error('Monk assembly failed:', err);
  process.exit(1);
});
