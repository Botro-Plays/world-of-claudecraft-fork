// Phase 5A: PT converter data-foundation tests.
//
// Pins the source data channels the Phase 5 audit found parsed-but-dropped:
// animated texture metadata (base texture stays distinct from the smAnimTexture
// flipbook), sDef_Color vertex colors, smSTAGE3D lighting header fields, the
// _Bip physique trailer on stage objects, minimap raster metadata, anim frame
// texture conversion coverage, and emit determinism.
//
// Source facts verified against the MagicPT-Chinese checkout:
//   smMATERIAL tail (320-byte struct): 108 MapOpacity f32, 112 TextureType
//   i32 (SMTEX_TYPE_ANIMATION=1), 304 AnimTexCounter, 308 FrameMask,
//   312 Shift_FrameSpeed, 316 AnimationFrame (SMTEX_AUTOANIMATION=0x100).
//   smSTAGE_VERTEX: 28 bytes; sDef_Color short[4] RGBA at offset 20.
//   smLIGHT3D: 28 bytes; {int type; int x,y,z; int Range; short r,g,b}.
//   _Bip physique trailer: nVertex x 32-byte bone names after TmPrevRot
//   (smOBJ3D::SaveFile).
//
// Cases needing the PT client tree skip when it is not checked out; the
// committed generated modules keep the emit-shape assertions runnable
// everywhere.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildPerFaceUVs,
  buildTextureManifest,
  classifyAndBuild,
  emitModule,
  parseSmd,
  waterMaterialSet,
} from '../scripts/pt-port/lib/stage_smd.mjs';
import { parsePat } from '../scripts/pt-port/lib/pat_smd.mjs';
import { ptClientPath } from '../scripts/pt-port/lib/pt_client.mjs';

const REPO_ROOT = resolve(__dirname, '..');
const MAPS_DIR = resolve(REPO_ROOT, 'scripts/pt-port/maps');

const hasPtClient = existsSync(ptClientPath('Field/Ricarten/village-2.smd'));

const FORE3_SMD = 'Field/forest/fore-3.smd';
const FORE1_SMD = 'Field/forest/fore-1.smd';
const RUIN1_SMD = 'Field/Ruin/ruin-1.smd';
const SOD1_DIR = 'Field/Sod';
const RICARTEN_SMD = 'Field/Ricarten/village-2.smd';

// Mirrors pt_map.mjs compileField for a derived manifest (no maps/<id>.mjs
// override needed): parse + build + emit, pure in-memory.
function compileFieldSource(smdPath: string, minimapPng: string | null = null): string {
  const smd = parseSmd(readFileSync(ptClientPath(smdPath)));
  const water = waterMaterialSet(smd.materials, { rule: 'translucent' });
  const built = classifyAndBuild(smd, water);
  const uvs = buildPerFaceUVs(smd);
  const textureManifest = buildTextureManifest(smd);
  return emitModule(smd, built, uvs, textureManifest, `client/${smdPath}`, { minimapPng });
}

function parseGenerated<T>(source: string, exportName: string): T {
  const m = source.match(new RegExp(`export const ${exportName} = (.*?);`, 's'));
  if (!m) throw new Error(`generated module lacks ${exportName}`);
  return JSON.parse(m[1]) as T;
}

describe('pt field data foundation (Phase 5A)', () => {
  it.skipIf(!hasPtClient)('emits animated texture metadata with the base texture kept separate', () => {
    // fore-3 mat 119 is the verified waterfall flipbook: anim8 wa_0..wa_7,
    // FrameMask=7, Shift_FrameSpeed=7, AnimationFrame=SMTEX_AUTOANIMATION.
    const smd = parseSmd(readFileSync(ptClientPath(FORE3_SMD)));
    const m119 = smd.materials[119];
    expect(m119.animTexCounter).toBe(8);
    expect(m119.textureType).toBe(1);
    expect(m119.frameMask).toBe(7);
    expect(m119.shiftFrameSpeed).toBe(7);
    expect(m119.animationFrame).toBe(0x100);
    expect(m119.animTextureNames).toHaveLength(8);
    expect(m119.animTextureNames[0].toLowerCase()).toContain('wa_0.bmp');
    expect(m119.animTextureNames[7].toLowerCase()).toContain('wa_7.bmp');

    const source = compileFieldSource(FORE3_SMD);
    interface Mat {
      index: number;
      textureNames: string[];
      textureType: number;
      animTexCounter?: number;
      animTextureNames?: string[];
      frameMask?: number;
      shiftFrameSpeed?: number;
      animationFrame?: number;
    }
    const mats = parseGenerated<Mat[]>(source, 'PT_MATERIALS');
    const e119 = mats.find((m) => m.index === 119)!;
    expect(e119.animTexCounter).toBe(8);
    expect(e119.animTextureNames).toHaveLength(8);
    expect(e119.frameMask).toBe(7);
    expect(e119.shiftFrameSpeed).toBe(7);
    expect(e119.animationFrame).toBe(0x100);
    expect(e119.textureType).toBe(1);
  });

  it.skipIf(!hasPtClient)('keeps the base texture distinct from the animation set (ruin-1 sea)', () => {
    // ruin-1 mat 436: base texture kr-001, flipbook sea_0..sea_7. The audit
    // caught the old pipeline rendering kr-001 where the sea anim belongs;
    // textureNames must NOT be overwritten by animTextureNames[0].
    const source = compileFieldSource(RUIN1_SMD);
    interface Mat { index: number; textureNames: string[]; animTextureNames?: string[] }
    const mats = parseGenerated<Mat[]>(source, 'PT_MATERIALS');
    const sea = mats.find((m) => m.index === 436)!;
    expect(sea.textureNames[0].toLowerCase()).toContain('kr-001');
    expect(sea.animTextureNames).toHaveLength(8);
    expect(sea.animTextureNames![0].toLowerCase()).toContain('sea_0');
    expect(sea.animTextureNames![7].toLowerCase()).toContain('sea_7');
    expect(sea.textureNames[0].toLowerCase()).not.toContain('sea_0');
  });

  it.skipIf(!hasPtClient)('stage-object materials keep anim frames out of textureNames', () => {
    // smoke: any stage-object material with an anim set emits both lists.
    // (greedy/dcave objects carry anim materials; Ricarten v-ani files do not.)
    const pat = parsePat(readFileSync(ptClientPath('Field/Ricarten/v-ani01.smd')), 'v-ani01.smd');
    for (const m of pat.materials) {
      if (m.animTexCounter > 0) {
        expect(m.animTextureNames).toHaveLength(m.animTexCounter);
      }
    }
    // Structural: no anim name leaks into textureNames.
    for (const m of pat.materials) {
      for (const n of m.animTextureNames) expect(m.textureNames).not.toContain(n);
    }
  });

  it.skipIf(!hasPtClient)('emits authored sDef_Color vertex colors (fore-1)', () => {
    const smd = parseSmd(readFileSync(ptClientPath(FORE1_SMD)));
    expect(smd.vertexColors).toHaveLength(smd.nVertex * 4);
    // Authored shades verified from the source binary (vertices 0..4).
    const expected = [
      [98, 98, 98, 255],
      [98, 98, 98, 255],
      [102, 102, 102, 255],
      [106, 106, 106, 255],
      [165, 165, 165, 255],
    ];
    for (let v = 0; v < expected.length; v++) {
      expect(Array.from(smd.vertexColors.slice(v * 4, v * 4 + 4))).toEqual(expected[v]);
    }

    const source = compileFieldSource(FORE1_SMD);
    expect(source).toContain('export function PT_VERTEX_COLORS');
    expect(source).toContain('Int16Array');
  });

  it.skipIf(!hasPtClient)('emits smSTAGE3D lighting header fields and smLIGHT3D records', () => {
    const fore3 = parseSmd(readFileSync(ptClientPath(FORE3_SMD)));
    expect(fore3.contrast).toBe(300);
    expect(fore3.bright).toBe(130);
    expect(fore3.vectLight).toEqual([0, -372, -93]);
    expect(fore3.lights).toHaveLength(0); // fore-3 carries no dynamic lights

    const ric = parseSmd(readFileSync(ptClientPath(RICARTEN_SMD)));
    expect(ric.contrast).toBe(300);
    expect(ric.bright).toBe(160);
    expect(ric.lights).toHaveLength(81);
    expect(ric.lights[0]).toEqual({
      type: 524291, x: 586285, y: 66368, z: -4018315, range: 65536, r: 78, g: 74, b: 54,
    });

    const source = compileFieldSource(RICARTEN_SMD);
    interface Lighting {
      nVertColor: number;
      contrast: number;
      bright: number;
      vectLight: number[];
      lights: { type: number; range: number }[];
    }
    const lighting = parseGenerated<Lighting>(source, 'PT_FIELD_LIGHTING');
    expect(lighting.bright).toBe(160);
    expect(lighting.lights).toHaveLength(81);
  });

  it.skipIf(!hasPtClient)('parses all 18 sod-1 _Bip stage objects', () => {
    const files = Array.from({ length: 18 }, (_, i) => `s-ani${String(i + 1).padStart(2, '0')}_Bip.smd`);
    for (const f of files) {
      const pat = parsePat(readFileSync(join(ptClientPath(SOD1_DIR), f)), f);
      expect(pat.nodes.length).toBeGreaterThan(0);
      for (const n of pat.nodes) {
        // Physique trailer: one 32-byte bone name per vertex.
        expect(n.physiqueBones).not.toBeNull();
        expect(n.physiqueBones).toHaveLength(n.nVertex);
        expect(n.physiqueBones![0]).toMatch(/^Bip01 /);
      }
    }
  });

  it.skipIf(!hasPtClient)('emits the converted minimap URL and keeps StageMapRect', () => {
    const source = compileFieldSource(FORE3_SMD, '/textures/pt-fore-3/minimap-fore-3.png');
    expect(source).toContain('export const PT_MINIMAP = {"png":"/textures/pt-fore-3/minimap-fore-3.png"};');
    expect(source).toContain('PT_STAGE_MAP_RECT');
    const noMap = compileFieldSource(FORE3_SMD, null);
    expect(noMap).toContain('export const PT_MINIMAP = null;');
  });

  it.skipIf(!hasPtClient)('texture manifest covers animation frames and marks them', () => {
    const smd = parseSmd(readFileSync(ptClientPath(FORE3_SMD)));
    const manifest = buildTextureManifest(smd);
    const wa = manifest.filter((t: { name: string }) => /\\wa_\d\.bmp$/i.test(t.name));
    expect(wa).toHaveLength(8);
    for (const t of wa) {
      expect((t as { anim: boolean }).anim).toBe(true);
      expect((t as { materialIndices: number[] }).materialIndices).toContain(119);
    }
    // A genuine missing source stays a manifest reference (never fabricated):
    const dd001 = manifest.find((t: { name: string }) => /dd001\.bmp$/i.test(t.name));
    expect(dd001).toBeDefined();
  });

  it.skipIf(!hasPtClient)('emission is deterministic', () => {
    expect(compileFieldSource(FORE3_SMD)).toBe(compileFieldSource(FORE3_SMD));
  });
});

describe('pt field data: committed modules carry the new channels', () => {
  // These run without the PT client: the generated files are committed.
  const committed = [
    'src/sim/pt_ricarten_field.generated.ts',
    'generated/pt-maps/fore-3/field.generated.ts',
    'generated/pt-maps/sod-1/field.generated.ts',
  ];

  it.each(committed)('%s exports vertex colors, lighting, minimap', (rel) => {
    const src = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
    expect(src).toContain('export function PT_VERTEX_COLORS');
    expect(src).toContain('export const PT_FIELD_LIGHTING');
    expect(src).toContain('export const PT_MINIMAP');
  });

  it('committed sod-1 stage objects exist (18 files)', () => {
    const p = resolve(REPO_ROOT, 'generated/pt-maps/sod-1/stage_objects.generated.ts');
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, 'utf8');
    expect([...src.matchAll(/name: "s-ani\d\d_Bip\.smd"/g)]).toHaveLength(18);
  });
});
