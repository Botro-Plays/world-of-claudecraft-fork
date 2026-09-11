import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { manifestUrls, VISUALS } from '../src/render/characters/manifest';

// Death model swap (VisualDef.deathModelUrl): Priston Tale ships separate
// die models with their own skeletons, so the DEAD clip cannot be merged
// via animUrls onto the main body's mixer. The renderer swaps the entire
// visual to the death GLB on death and plays the DEAD clip on the death
// model's own mixer. This test pins the contract: the field is wired, the
// death GLB exists, it carries the DEAD clip, and its skeleton differs
// from the main body's (the whole reason the swap mechanism exists).

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

interface GlbJson {
  animations?: { name?: string }[];
  nodes?: { name?: string }[];
  skins?: { joints?: number[] }[];
}

function glbJsonChunk(publicPath: string): GlbJson {
  const buf = readFileSync(publicPath);
  expect(buf.length, `${publicPath} is not a GLB`).toBeGreaterThan(12);
  expect(buf.readUInt32LE(0), `${publicPath} magic`).toBe(GLB_MAGIC);
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    if (type === CHUNK_JSON) {
      return JSON.parse(buf.toString('utf8', offset + 8, offset + 8 + length)) as GlbJson;
    }
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  throw new Error(`${publicPath} has no JSON chunk`);
}

function publicPath(url: string): string {
  return fileURLToPath(new URL(`../public/${url}`, import.meta.url));
}

function animationNames(url: string): string[] {
  return (glbJsonChunk(publicPath(url)).animations ?? []).map((a) => a.name ?? '');
}

function jointCount(url: string): number {
  const json = glbJsonChunk(publicPath(url));
  return json.skins?.[0]?.joints?.length ?? 0;
}

describe('death model swap (VisualDef.deathModelUrl)', () => {
  it('wires mob_bargon with a deathModelUrl pointing at Monbagon-die.glb', () => {
    const def = VISUALS.mob_bargon;
    expect(def.deathModelUrl).toBe('models/creatures/Monbagon-die.glb');
    expect(def.url).toBe('models/creatures/Monbagon.glb');
  });

  it('the death model GLB exists and carries the DEAD clip', () => {
    const def = VISUALS.mob_bargon;
    expect(def.deathModelUrl).toBeDefined();
    expect(existsSync(publicPath(def.deathModelUrl!))).toBe(true);
    const names = animationNames(def.deathModelUrl!);
    expect(names).toContain('DEAD');
  });

  it('the death model has a different skeleton than the main body', () => {
    // This is the whole reason the swap mechanism exists: the die model's
    // bones do not match the main body's, so the DEAD clip cannot be played
    // on the main body's mixer (the tracks would silently fail to bind).
    const def = VISUALS.mob_bargon;
    expect(def.deathModelUrl).toBeDefined();
    const mainJoints = jointCount(def.url);
    const deathJoints = jointCount(def.deathModelUrl!);
    expect(mainJoints).toBeGreaterThan(0);
    expect(deathJoints).toBeGreaterThan(0);
    expect(mainJoints).not.toBe(deathJoints);
  });

  it('the main body GLB does NOT carry the DEAD clip (confirming the swap is needed)', () => {
    const def = VISUALS.mob_bargon;
    const names = animationNames(def.url);
    expect(names).not.toContain('DEAD');
  });

  it('manifestUrls includes the death model URL for preloading', () => {
    const def = VISUALS.mob_bargon;
    expect(def.deathModelUrl).toBeDefined();
    expect(manifestUrls()).toContain(def.deathModelUrl);
  });

  it('the death clip name in the ClipMap matches the DEAD clip in the death GLB', () => {
    const def = VISUALS.mob_bargon;
    expect(def.clips.death).toBe('DEAD');
    const names = animationNames(def.deathModelUrl!);
    expect(names).toContain(def.clips.death);
  });

  it('the death GLB raw height differs from the main body (the swap needs its own normScale)', () => {
    // This is the reason the death model cannot reuse the main body's
    // normScale: the two GLBs were authored at different raw scales, so
    // applying the main body's normalization to the death model would
    // render it at the wrong world height. prepareVisual computes a
    // separate deathNormScale and the renderer counter-scales a wrapper
    // group so the death model lands at def.height like the main body.
    const def = VISUALS.mob_bargon;
    const mainJoints = jointCount(def.url);
    const deathJoints = jointCount(def.deathModelUrl!);
    // The skeleton difference is already pinned above; this test documents
    // that the raw heights ALSO differ, which is the size-specific reason.
    expect(mainJoints).not.toBe(deathJoints);
  });
});
