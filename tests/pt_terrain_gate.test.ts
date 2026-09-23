import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PtTerrainGate } from '../src/render/pt_terrain_gate';
import type { PtTerrainView } from '../src/render/pt_terrain';

function fakeView(): PtTerrainView {
  return { group: new THREE.Group(), update: () => undefined, dispose: () => undefined };
}

describe('PtTerrainGate', () => {
  it('starts exactly one build and attaches one view', async () => {
    const view = fakeView();
    const build = vi.fn().mockResolvedValue(view);
    const attach = vi.fn();
    const gate = new PtTerrainGate(build, attach);

    const pending = gate.ensure();
    expect(pending).not.toBeNull();
    // Per-frame ensure() calls while the build is in flight must not restart it.
    expect(gate.ensure()).toBe(pending);
    gate.ensure();
    gate.ensure();
    expect(build).toHaveBeenCalledTimes(1);

    await pending;
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith(view);
    expect(gate.current).toBe(view);

    // After completion, ensure() is a null no-op: the built view persists.
    expect(gate.ensure()).toBeNull();
    gate.ensure();
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

    const failed = gate.ensure();
    expect(failed).not.toBeNull();
    await failed; // resolves void after the internal catch
    expect(gate.current).toBeNull();
    expect(attach).not.toHaveBeenCalled();

    // A later frame (still inside the PT band) retries and succeeds.
    const retry = gate.ensure();
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

    const pending = gate.ensure();
    for (let i = 0; i < 100; i++) gate.ensure(); // hundreds of sync() frames
    expect(build).toHaveBeenCalledTimes(1);

    resolveBuild(fakeView());
    await pending;
    expect(attach).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
  });
});
