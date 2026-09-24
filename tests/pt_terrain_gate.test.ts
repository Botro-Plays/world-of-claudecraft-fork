import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PtTerrainGate } from '../src/render/pt_terrain_gate';
import type { PtTerrainView } from '../src/render/pt_terrain';
import type { PtMapDescriptor } from '../src/sim/pt_field';

function fakeView(): PtTerrainView {
  return { group: new THREE.Group(), update: () => undefined, dispose: () => undefined };
}

// The gate only compares descriptor identity; the fields are never read.
function fakeSrc(id: string): PtMapDescriptor {
  return { id } as PtMapDescriptor;
}

describe('PtTerrainGate', () => {
  it('starts exactly one build and attaches one view', async () => {
    const view = fakeView();
    const build = vi.fn().mockResolvedValue(view);
    const attach = vi.fn();
    const gate = new PtTerrainGate(build, attach);
    const src = fakeSrc('a');

    const pending = gate.ensure(src);
    expect(pending).not.toBeNull();
    // Per-frame ensure() calls while the build is in flight must not restart it.
    expect(gate.ensure(src)).toBe(pending);
    gate.ensure(src);
    gate.ensure(src);
    expect(build).toHaveBeenCalledTimes(1);

    await pending;
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith(view);
    expect(gate.current).toBe(view);

    // After completion, ensure() is a null no-op: the built view persists.
    expect(gate.ensure(src)).toBeNull();
    gate.ensure(src);
    expect(build).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(1);
  });

  it('clears the pending state on failure and permits a retry', async () => {
    const view = fakeView();
    const build = vi
      .fn<() => Promise<PtTerrainView>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(view);
    const attach = vi.fn();
    const gate = new PtTerrainGate(build, attach);
    const src = fakeSrc('a');

    const failed = gate.ensure(src);
    expect(failed).not.toBeNull();
    await failed; // resolves void after the internal catch
    expect(gate.current).toBeNull();
    expect(attach).not.toHaveBeenCalled();

    // A later frame (still inside the PT band) retries and succeeds.
    const retry = gate.ensure(src);
    expect(retry).not.toBeNull();
    await retry;
    expect(build).toHaveBeenCalledTimes(2);
    expect(attach).toHaveBeenCalledTimes(1);
    expect(gate.current).toBe(view);
  });

  it('ensure() during a pending retry still does not double-build', async () => {
    let resolveBuild!: (v: PtTerrainView) => void;
    const build = vi.fn(
      () => new Promise<PtTerrainView>((res) => (resolveBuild = res)),
    );
    const attach = vi.fn();
    const gate = new PtTerrainGate(build, attach);
    const src = fakeSrc('a');

    const pending = gate.ensure(src);
    for (let i = 0; i < 100; i++) gate.ensure(src); // hundreds of sync() frames
    expect(build).toHaveBeenCalledTimes(1);

    resolveBuild(fakeView());
    await pending;
    expect(attach).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('swaps views when the bound map descriptor changes', async () => {
    const viewA = fakeView();
    const viewB = fakeView();
    const build = vi
      .fn<(src: PtMapDescriptor) => Promise<PtTerrainView>>()
      .mockImplementation(async (src) => (src.id === 'a' ? viewA : viewB));
    const attach = vi.fn();
    const detach = vi.fn();
    const gate = new PtTerrainGate(build, attach, detach);
    const srcA = fakeSrc('a');
    const srcB = fakeSrc('b');

    await gate.ensure(srcA);
    expect(gate.current).toBe(viewA);

    const swap = gate.ensure(srcB);
    expect(swap).not.toBeNull();
    expect(detach).toHaveBeenCalledWith(viewA);
    await swap;
    expect(attach).toHaveBeenLastCalledWith(viewB);
    expect(gate.current).toBe(viewB);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('a superseded in-flight build disposes instead of attaching', async () => {
    let resolveA!: (v: PtTerrainView) => void;
    const viewA = fakeView();
    const disposeA = vi.spyOn(viewA, 'dispose');
    const viewB = fakeView();
    const build = vi
      .fn<(src: PtMapDescriptor) => Promise<PtTerrainView>>()
      .mockImplementationOnce(
        () => new Promise<PtTerrainView>((res) => (resolveA = res)),
      )
      .mockResolvedValueOnce(viewB);
    const attach = vi.fn();
    const gate = new PtTerrainGate(build, attach);
    const srcA = fakeSrc('a');
    const srcB = fakeSrc('b');

    const pendingA = gate.ensure(srcA);
    const pendingB = gate.ensure(srcB); // swap while A is still building
    resolveA(viewA);
    await Promise.all([pendingA, pendingB]);

    // A resolved after the swap: it must never reach the scene.
    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith(viewB);
    expect(gate.current).toBe(viewB);
  });
});
