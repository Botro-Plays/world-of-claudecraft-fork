// Phase 6D: authored TextureFormState UV-scroll + SMMAT_BLEND_LAMP tests.
//
// Source facts verified against the MagicPT-Chinese checkout
// (smRend3d.cpp SetD3DRendBuff, smType.h):
//   fwtime = ((RendStatTime >> 6) & 0xFF) / 256   (~16.4s sawtooth on u)
//   SCROLL (4):           u += fwtime
//   SCROLL2..10 (6..14):  u += fwtime * (state - 4)
//   SCROLLSLOW1..4 (15..18): mask = 0xFFFF >> (22 - state)   (0x1FF..0xFFF)
//                            u += ((t>>6) & mask) / mask
//   FORMX/Y/Z, REFLEX and NONE leave the texlink u untouched
//   TextureStageState 0 = modulate (texN x current), 7 = additive
//   SMMAT_BLEND_LAMP (blendType 4) = SRCALPHA/ONE additive dst blend
//
// The scroll math lives in two places that must agree: the CPU helper
// ptFormScrollU (covered directly) and the GLSL expression injected by
// ptApplyShaderHooks' uvfx path (covered by assertions on the baked
// constants so the two cannot silently diverge).

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  ptApplyShaderHooks,
  ptFormScrollU,
  ptLiveStages,
  ptMaterialBlendingFor,
  type PtUvFormBinding,
} from '../src/render/pt_terrain';

const REPO_ROOT = resolve(__dirname, '..');

function parseGenerated<T>(source: string, exportName: string): T {
  const m = source.match(new RegExp(`export const ${exportName} = (.*?);`, 's'));
  if (!m) throw new Error(`generated module lacks ${exportName}`);
  return JSON.parse(m[1]) as T;
}

describe('ptFormScrollU (source scroll ramp)', () => {
  // fwtime ramps 0 -> 255/256 over ~16.4s: (ms >> 6) & 0xff) / 256.
  const T_ZERO = 0;
  const T_HALF = 128 << 6; // fwtime = 0.5
  const T_WRAP = 256 << 6; // fwtime wraps to 0

  it('produces the authored sawtooth for SCROLL (code 4)', () => {
    expect(ptFormScrollU(4, T_ZERO)).toBe(0);
    expect(ptFormScrollU(4, T_HALF)).toBeCloseTo(0.5, 5);
    expect(ptFormScrollU(4, T_WRAP)).toBe(0);
  });

  it('scales SCROLL2..SCROLL10 by (code - 4) exactly like the source', () => {
    // SCROLL3 = 7, SCROLL5 = 9, SCROLL10 = 14.
    expect(ptFormScrollU(7, T_HALF)).toBeCloseTo(1.5, 5); // wraps by uv mod
    expect(ptFormScrollU(9, T_HALF)).toBeCloseTo(2.5, 5);
    expect(ptFormScrollU(14, T_HALF)).toBeCloseTo(5.0, 5);
    // fore-2 rates at fwtime = 0.5: SCROLL3 -> 0.5 * 3, SCROLL5 -> 0.5 * 5.
    expect(ptFormScrollU(7, T_HALF) / ptFormScrollU(4, T_HALF)).toBe(3);
    expect(ptFormScrollU(9, T_HALF) / ptFormScrollU(4, T_HALF)).toBe(5);
  });

  it('masks the ramp for SCROLLSLOW1..4 with mask = 0xFFFF >> (22 - code)', () => {
    // SLOW1 (15): mask 0x1FF -> half ramp at t=256, wraps at 512 ticks.
    expect(ptFormScrollU(15, 256 << 6)).toBeCloseTo(256 / 511, 5);
    expect(ptFormScrollU(15, 512 << 6)).toBe(0);
    // SLOW3 (17): mask 0x7FF; SLOW4 (18): mask 0xFFF.
    expect(ptFormScrollU(17, 2048 << 6)).toBe(0);
    expect(ptFormScrollU(18, 4096 << 6)).toBe(0);
    expect(ptFormScrollU(18, 2048 << 6)).toBeCloseTo(2048 / 4095, 5);
  });

  it('leaves the u axis untouched for non-scroll forms', () => {
    for (const code of [0, 1, 2, 3, 5, 19, 255]) {
      expect(ptFormScrollU(code, T_HALF)).toBe(0);
    }
  });

  it('is deterministic and periodic', () => {
    expect(ptFormScrollU(9, 12345)).toBe(ptFormScrollU(9, 12345));
    // 256 * 64ms = one full ramp period.
    expect(ptFormScrollU(9, 12345 + (256 << 6))).toBe(ptFormScrollU(9, 12345));
  });
});

describe('ptLiveStages (dynamic vs baked multimix plans)', () => {
  const mat = (names: string[], formState?: number[], stageState?: number[]) => ({
    textureNames: names,
    textureFormState: formState,
    textureStageState: stageState,
  });

  it('returns an empty set for fully static materials', () => {
    expect(ptLiveStages(undefined)).toEqual([]);
    expect(ptLiveStages(mat(['a.bmp']))).toEqual([]);
    expect(ptLiveStages(mat(['a.bmp', 'b.bmp'], [0, 0], [0, 0]))).toEqual([]);
  });

  it('returns only the authored scroll/op slots', () => {
    expect(ptLiveStages(mat(['a', 'b'], [7, 9]))).toEqual([0, 1]);
    expect(ptLiveStages(mat(['a', 'b'], [0, 9]))).toEqual([1]);
    // A nonzero stage op makes the slot live even without a scroll.
    expect(ptLiveStages(mat(['a', 'b'], [0, 0], [0, 7]))).toEqual([1]);
  });

  it('falls back to the fully-baked path beyond the two-sampler plan', () => {
    // A live stage at index >= 2 cannot bind uPtMap1.
    expect(ptLiveStages(mat(['a', 'b', 'c'], [0, 0, 9]))).toBeNull();
    // Two live stages plus a leftover static cannot express three slots.
    expect(ptLiveStages(mat(['a', 'b', 'c'], [7, 9, 0]))).toBeNull();
    // Three live stages exceed the two-sampler path entirely.
    expect(ptLiveStages(mat(['a', 'b', 'c'], [7, 9, 9]))).toBeNull();
  });
});

describe('ptApplyShaderHooks uvfx shader', () => {
  const VS = '#include <common>\n#include <begin_vertex>';
  const FS = '#include <common>\n#include <map_fragment>\n#include <lights_fragment_begin>';

  function compileWith(uvFx?: PtUvFormBinding) {
    const mat = new THREE.MeshLambertMaterial({ map: new THREE.Texture() });
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: VS,
      fragmentShader: FS,
    };
    ptApplyShaderHooks(mat, null, uvFx);
    mat.onBeforeCompile(shader as never, {} as THREE.WebGLRenderer);
    return { mat, shader };
  }

  it('binds uPtMap1 and scrolls each live stage by its authored rate', () => {
    const stage1 = new THREE.Texture();
    const { shader } = compileWith({
      stage1,
      scroll0: 7, // SCROLL3
      op0: 0,
      scroll1: 9, // SCROLL5
      op1: 0,
    });
    expect(shader.fragmentShader).toContain('uniform float uPtTime;');
    expect(shader.fragmentShader).toContain('uniform sampler2D uPtMap1;');
    expect(shader.uniforms.uPtMap1.value).toBe(stage1);
    // Same ramp as ptFormScrollU: mod(floor(uPtTime*15.625), 256) ticks,
    // multiplied by (code - 4) / 256.
    expect(shader.fragmentShader).toContain('mod(floor(uPtTime * 15.625), 256.0)');
    expect(shader.fragmentShader).toContain('* 0.01171875'); // 3/256 SCROLL3
    expect(shader.fragmentShader).toContain('* 0.01953125'); // 5/256 SCROLL5
    // Stage 0 scrolls the shared map UV; stage 1 modulates the result.
    expect(shader.fragmentShader).toContain('vec4 ptTex0 = texture2D( map,');
    expect(shader.fragmentShader).toContain('vec4 ptTex1 = texture2D( uPtMap1,');
    expect(shader.fragmentShader).toContain('diffuseColor *= ptTex0;');
    expect(shader.fragmentShader).toContain('diffuseColor *= ptTex1;');
  });

  it('emits the additive combine for TextureStageState 7', () => {
    const { shader } = compileWith({
      stage1: new THREE.Texture(),
      scroll0: 0,
      op0: 0,
      scroll1: 6, // dcave: stage1 SCROLL2 + ADD
      op1: 7,
    });
    expect(shader.fragmentShader).toContain('diffuseColor.rgb += ptTex1.rgb;');
    // Source ALPHAOP stays MODULATE on every stage.
    expect(shader.fragmentShader).toContain('diffuseColor.a *= ptTex1.a;');
  });

  it('keeps the program-cache key structural so identical plans share one program', () => {
    const fx = (t: THREE.Texture): PtUvFormBinding => ({
      stage1: t,
      scroll0: 7,
      op0: 0,
      scroll1: 9,
      op1: 0,
    });
    const a = new THREE.MeshLambertMaterial();
    const b = new THREE.MeshLambertMaterial();
    ptApplyShaderHooks(a, null, fx(new THREE.Texture()));
    ptApplyShaderHooks(b, null, fx(new THREE.Texture()));
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    const c = new THREE.MeshLambertMaterial();
    ptApplyShaderHooks(c, null);
    expect(c.customProgramCacheKey()).not.toBe(a.customProgramCacheKey());
    // A different scroll plan compiles its own variant, not one per texture.
    const d = new THREE.MeshLambertMaterial();
    ptApplyShaderHooks(d, null, { ...fx(new THREE.Texture()), scroll1: 6 });
    expect(d.customProgramCacheKey()).not.toBe(a.customProgramCacheKey());
  });
});

describe('ptMaterialBlendingFor (SMMAT_BLEND_LAMP)', () => {
  it('maps blendType 4 to additive blending', () => {
    expect(ptMaterialBlendingFor({ blendType: 4 })).toBe(THREE.AdditiveBlending);
  });

  it('leaves every other authored blend type on the normal path', () => {
    for (const blendType of [0, 1, 2, 3, 5, 6]) {
      expect(ptMaterialBlendingFor({ blendType })).toBe(THREE.NormalBlending);
    }
    expect(ptMaterialBlendingFor(undefined)).toBe(THREE.NormalBlending);
    expect(ptMaterialBlendingFor({})).toBe(THREE.NormalBlending);
  });
});

describe('committed fore-2 module carries the scroll data', () => {
  // Runs without the PT client checkout: the generated file is committed.
  interface Mat {
    index: number;
    textureFormState?: number[];
    blendType: number;
    transparency: number;
  }
  const mats = parseGenerated<Mat[]>(
    readFileSync(join(REPO_ROOT, 'generated/pt-maps/fore-2/field.generated.ts'), 'utf8'),
    'PT_MATERIALS',
  );

  it('river materials keep [SCROLL3, SCROLL5] per stage', () => {
    expect(mats.find((m) => m.index === 122)!.textureFormState).toEqual([7, 9]);
    expect(mats.find((m) => m.index === 123)!.textureFormState).toEqual([7, 9]);
  });

  it('waterfall foam keeps [SCROLL5] and the LAMP blend', () => {
    const m501 = mats.find((m) => m.index === 501)!;
    expect(m501.textureFormState).toEqual([9]);
    expect(m501.blendType).toBe(4);
    expect(m501.transparency).toBeCloseTo(0.7, 5);
  });

  it('static materials omit the channel', () => {
    expect(mats.find((m) => m.index === 0)!.textureFormState).toBeUndefined();
  });
});
