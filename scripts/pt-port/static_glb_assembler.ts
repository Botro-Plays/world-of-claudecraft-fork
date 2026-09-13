// Static GLB assembler for Priston Tale item models (no skeleton, no animation).
// Reuses the SMD parser from glb_assembler.ts but skips SMB/INX/skin/animation.
// Used for DropItem and other static meshes that only have SMD + texture files.
//
// Usage: npx tsx scripts/pt-port/static_glb_assembler.ts <input.smd> <output.glb>

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import {
  Document, Node, Mesh, Primitive,
  Material, Texture,
  NodeIO,
} from '@gltf-transform/core';
import { parseSmd, PTSmdModel, PTObject } from './smd_parser.ts';
import { bmpToPng } from './bmp_to_png.ts';
import { tgaToPng } from './tga_to_png.ts';

const FONE = 256;

// PT model format uses 3ds Max Z-up. Convert to glTF Y-up: (x, y, z) -> (x, z, -y).

// ---------------------------------------------------------------------------
// Case-insensitive texture path resolution (same logic as glb_assembler.ts)
// ---------------------------------------------------------------------------

function resolveCaseInsensitive(fullPath: string): string {
  const dir = dirname(fullPath);
  const target = basename(fullPath);
  const targetLower = target.toLowerCase();

  let entries: string[];
  try { entries = readdirSync(dir); } catch { return fullPath; }

  // Exact case-insensitive match only. No fuzzy stem matching -
  // fuzzy matching causes itWA126.tga to match itwa102.tga etc.
  for (const e of entries) {
    if (e.toLowerCase() === targetLower) return join(dir, e);
  }
  return fullPath;
}

// ---------------------------------------------------------------------------
// Static GLB assembly (no skeleton, no skin, no animation)
// ---------------------------------------------------------------------------

export interface StaticGlbBuildOptions {
  smdPath: string;
  outputPath: string;
}

export async function buildStaticGlb(opts: StaticGlbBuildOptions): Promise<void> {
  const smd = parseSmd(readFileSync(opts.smdPath));

  // Find ALL mesh objects (has vertices)
  const meshObjs = smd.objects.filter((o) => o.nVertex > 0);
  if (meshObjs.length === 0) throw new Error('No mesh object found in SMD');

  // Texture resolution (same logic as glb_assembler.ts, plus fallback to SMD dir)
  const clientRoot = 'D:\\From Luis Cezar Matias - Chinese MagicPT\\Client\\';
  const smdDir = dirname(opts.smdPath);
  const textureCache = new Map<string, { data: Buffer; mime: string } | null>();

  function getTexturePng(texPath: string): { data: Buffer; mime: string } | null {
    if (!texPath) return null;
    const cleanPath = texPath.split('|')[0];
    if (textureCache.has(cleanPath)) return textureCache.get(cleanPath)!;
    try {
      let fullPath = cleanPath;
      if (!fullPath.startsWith('D:')) {
        fullPath = clientRoot + cleanPath;
      }
      let resolvedPath = fullPath;
      if (!existsSync(resolvedPath)) {
        resolvedPath = resolveCaseInsensitive(fullPath);
      }
      // Fallback: some DropItem textures live next to the SMD file, not in Image\sinImage.
      // Try the SMD's own directory using the texture filename.
      if (!existsSync(resolvedPath)) {
        const texName = basename(cleanPath);
        const smdDirPath = join(smdDir, texName);
        if (existsSync(smdDirPath)) {
          resolvedPath = smdDirPath;
        } else {
          resolvedPath = resolveCaseInsensitive(smdDirPath);
        }
      }
      // Fallback 2: some *310 etc. items reference textures from other items
      // (e.g. itWA310 references Itwa133.tga) that only exist in char\Items\DropItem.
      if (!existsSync(resolvedPath)) {
        const texName = basename(cleanPath);
        const charDirPath = join(clientRoot, 'char\\Items\\DropItem', texName);
        if (existsSync(charDirPath)) {
          resolvedPath = charDirPath;
        } else {
          resolvedPath = resolveCaseInsensitive(charDirPath);
        }
      }
      // Fallback 3: some items reference textures from other item categories
      // (e.g. itSP194 references itSP194.bmp in char\Items\Event).
      if (!existsSync(resolvedPath)) {
        const texName = basename(cleanPath);
        for (const subDir of ['Event', 'Accessory', 'Defense', 'Weapon', 'Potion', 'Quest', 'Premium']) {
          const altPath = join(clientRoot, 'char\\Items\\' + subDir, texName);
          if (existsSync(altPath)) {
            resolvedPath = altPath;
            break;
          }
          const ciAltPath = resolveCaseInsensitive(altPath);
          if (existsSync(ciAltPath)) {
            resolvedPath = ciAltPath;
            break;
          }
        }
      }
      const lower = resolvedPath.toLowerCase();
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        // glTF supports JPEG natively, no conversion needed
        const data = readFileSync(resolvedPath);
        const result = { data, mime: 'image/jpeg' };
        textureCache.set(cleanPath, result);
        return result;
      }
      let png: Buffer;
      if (lower.endsWith('.png')) {
        png = readFileSync(resolvedPath);
      } else if (lower.endsWith('.tga')) {
        png = tgaToPng(readFileSync(resolvedPath));
      } else {
        png = bmpToPng(readFileSync(resolvedPath));
      }
      const result = { data: png, mime: 'image/png' };
      textureCache.set(cleanPath, result);
      return result;
    } catch (e) {
      console.warn(`  Failed to load texture ${cleanPath}: ${(e as Error).message}`);
      textureCache.set(cleanPath, null);
      return null;
    }
  }

  // Group faces by material index across ALL mesh objects
  const matGroups = new Map<number, { obj: PTObject; fi: number }[]>();
  for (const mo of meshObjs) {
    for (let fi = 0; fi < mo.faces.length; fi++) {
      const matIdx = mo.faces[fi].materialIndex;
      if (!matGroups.has(matIdx)) matGroups.set(matIdx, []);
      matGroups.get(matIdx)!.push({ obj: mo, fi });
    }
  }

  // Precompute texLink base pointer per object (same logic as glb_assembler.ts)
  const TEXLINK_SIZE = 32;
  const texLinkBase = new Map<PTObject, number | null>();
  for (const mo of meshObjs) {
    if (mo.texLinks.length === 0 || mo.faces.length === 0) {
      texLinkBase.set(mo, null);
      continue;
    }
    const indices = mo.faces.map(f => f.texLinkIndex);
    const maxIdx = Math.max(...indices);
    if (maxIdx >= mo.texLinks.length) {
      texLinkBase.set(mo, Math.min(...indices));
    } else {
      texLinkBase.set(mo, null);
    }
  }

  // Detect inverted normals per object (same logic as glb_assembler.ts)
  const flipNormals = new Set<PTObject>();
  for (const mo of meshObjs) {
    if (mo.faces.length === 0) continue;
    let dotSum = 0, dotCount = 0;
    for (let fi = 0; fi < Math.min(mo.faces.length, 50); fi++) {
      const f = mo.faces[fi];
      const v0 = mo.vertices[f.v[0]];
      const v1 = mo.vertices[f.v[1]];
      const v2 = mo.vertices[f.v[2]];
      const e1x = v1.x - v0.x, e1y = v1.y - v0.y, e1z = v1.z - v0.z;
      const e2x = v2.x - v0.x, e2y = v2.y - v0.y, e2z = v2.z - v0.z;
      const fnx = e1y * e2z - e1z * e2y;
      const fny = e1z * e2x - e1x * e2z;
      const fnz = e1x * e2y - e1y * e2x;
      const fnl = Math.hypot(fnx, fny, fnz);
      const vnl = Math.hypot(v0.nx, v0.ny, v0.nz);
      if (fnl > 0 && vnl > 0) {
        dotSum += (fnx * v0.nx + fny * v0.ny + fnz * v0.nz) / (fnl * vnl);
        dotCount++;
      }
    }
    if (dotCount > 0 && dotSum / dotCount < -0.3) {
      flipNormals.add(mo);
    }
  }

  console.log(`Mesh: ${meshObjs.reduce((s, o) => s + o.faces.length, 0)} faces, ${matGroups.size} material groups`);

  // Create glTF document
  const doc = new Document();
  const root = doc.getRoot();
  const buffer = doc.createBuffer('bin');

  // Build one primitive per material group (no joints/weights, no skin)
  const primitives: Primitive[] = [];

  for (const [matIdx, faceIndices] of matGroups) {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vertIdx = 0;

    for (const { obj: mo, fi } of faceIndices) {
      const face = mo.faces[fi];
      for (let vi = 0; vi < 3; vi++) {
        const vIdx = face.v[vi];
        const v = mo.vertices[vIdx];
        // Static mesh: vertices are in model space, just convert Z-up -> Y-up
        positions.push(v.x / FONE, v.z / FONE, -v.y / FONE);
        // Normals: convert Z-up -> Y-up, with flip detection
        const nl = Math.hypot(v.nx, v.ny, v.nz);
        const flip = flipNormals.has(mo) ? -1 : 1;
        if (nl > 0) {
          normals.push(flip * v.nx / nl, flip * v.nz / nl, -flip * v.ny / nl);
        } else {
          normals.push(0, 1, 0);
        }
        // UVs from texLink or face
        const base = texLinkBase.get(mo);
        let texLinkIdx = fi;
        if (base !== null && base !== undefined) {
          texLinkIdx = Math.round((face.texLinkIndex - base) / TEXLINK_SIZE);
        }
        const texLink = mo.texLinks[texLinkIdx];
        if (texLink && texLink.u[vi] !== undefined) {
          uvs.push(texLink.u[vi], texLink.v[vi]);
        } else {
          uvs.push(face.uvs[vi][0], face.uvs[vi][1]);
        }
        indices.push(vertIdx);
        vertIdx++;
      }
    }

    const posAcc = doc.createAccessor(`pos_${matIdx}`, buffer)
      .setType('VEC3').setArray(new Float32Array(positions));
    const normAcc = doc.createAccessor(`norm_${matIdx}`, buffer)
      .setType('VEC3').setArray(new Float32Array(normals));
    const uvAcc = doc.createAccessor(`uv_${matIdx}`, buffer)
      .setType('VEC2').setArray(new Float32Array(uvs));
    const idxAcc = doc.createAccessor(`idx_${matIdx}`, buffer)
      .setType('SCALAR').setArray(new Uint32Array(indices));

    // Material
    const mat = smd.materials[matIdx];
    const texName = mat?.textureNames?.[0] || '';
    const texResult = getTexturePng(texName);

    const material = doc.createMaterial(`mat_${matIdx}`)
      .setMetallicFactor(0)
      .setRoughnessFactor(1)
      .setAlphaMode('MASK')
      .setAlphaCutoff(0.5)
      .setDoubleSided(true);

    if (texResult && texResult.data.length > 0) {
      const texImage = doc.createTexture(`tex_${matIdx}`)
        .setImage(texResult.data)
        .setMimeType(texResult.mime);
      material.setBaseColorTexture(texImage);
    }

    console.log(`  Material ${matIdx}: ${faceIndices.length} faces, texture=${texName}`);

    const primitive = doc.createPrimitive()
      .setAttribute('POSITION', posAcc)
      .setAttribute('NORMAL', normAcc)
      .setAttribute('TEXCOORD_0', uvAcc)
      .setIndices(idxAcc)
      .setMaterial(material);
    primitives.push(primitive);
  }

  const mesh = doc.createMesh('mesh');
  for (const p of primitives) mesh.addPrimitive(p);

  // Single mesh node (no skin, no skeleton)
  const meshNode = doc.createNode('item').setMesh(mesh);
  const rootNode = doc.createNode('root');
  rootNode.addChild(meshNode);

  // Scene
  doc.createScene('scene').addChild(rootNode);

  // Write GLB
  const io = new NodeIO();
  await io.write(opts.outputPath, doc);
  const stats = readFileSync(opts.outputPath);
  console.log(`Written GLB: ${opts.outputPath} (${stats.length} bytes)`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('static_glb_assembler.ts')) {
  const smdPath = process.argv[2];
  const output = process.argv[3];

  if (!smdPath || !output) {
    console.log('Usage: npx tsx scripts/pt-port/static_glb_assembler.ts <input.smd> <output.glb>');
    process.exit(1);
  }

  console.log(`Converting: ${smdPath}`);
  buildStaticGlb({ smdPath, outputPath: output }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
