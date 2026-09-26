// PT field-transition curtain tests: the DOM-free orchestrator in
// src/game/pt_field_transition.ts plus a thin DOM pass over the overlay in
// src/ui/pt_transition_screen.ts.
//
// The seam under test: whenever the player stands inside the PT band and the
// bound map's view is not yet revealed (not bound, building, or compiling),
// the curtain is up and input is held; it lifts only once the view reports
// 'ready' AND the minimum presentation time has elapsed. A build failure or
// a grossly long wait flips the curtain to its failure line and releases
// input instead of trapping the player forever.

// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  createPtFieldTransition,
  PT_TRANSITION_FAIL_MS,
  PT_TRANSITION_MIN_MS,
  type PtFieldTransitionDeps,
  type PtFieldTransitionOverlay,
  type PtFieldViewState,
  ptFieldLabel,
} from '../src/game/pt_field_transition';
import {
  failPtTransition,
  hidePtTransition,
  setPtTransitionProgress,
  showPtTransition,
} from '../src/ui/pt_transition_screen';

interface Recorder {
  overlay: PtFieldTransitionOverlay;
  shows: string[];
  progress: number[];
  fails: string[];
  hides: number;
}

function makeOverlay(): Recorder {
  const rec: Recorder = {
    overlay: {
      show: (name) => rec.shows.push(name),
      setProgress: (p) => rec.progress.push(p),
      fail: (name) => rec.fails.push(name),
      hide: () => {
        rec.hides++;
      },
    },
    shows: [],
    progress: [],
    fails: [],
    hides: 0,
  };
  return rec;
}

interface Rig {
  rec: Recorder;
  inputHeld(): boolean;
  setBand(v: boolean): void;
  /** Bind a field. fresh=true swaps in a NEW binding object for the same id
   *  (a same-id /ptmap reinstall: a re-entry, not the same binding). */
  setActive(id: string | null, fresh?: boolean): void;
  setState(id: string, s: PtFieldViewState): void;
  advance(ms: number): void;
  tick(): void;
}

function makeRig(overrides: Partial<PtFieldTransitionDeps> = {}): Rig {
  const rec = makeOverlay();
  let band = true;
  const bindings = new Map<string, { id: string }>();
  const bindingFor = (id: string) => {
    let b = bindings.get(id);
    if (!b) {
      b = { id };
      bindings.set(id, b);
    }
    return b;
  };
  let active: { id: string } | null = bindingFor('ricarten');
  let now = 0;
  const states = new Map<string, PtFieldViewState>();
  const deps: PtFieldTransitionDeps = {
    inPtBand: () => band,
    activeMap: () => active,
    viewState: (id) => states.get(id) ?? 'none',
    fieldName: (id) => id.toUpperCase(),
    overlay: rec.overlay,
    nowMs: () => now,
    ...overrides,
  };
  const t = createPtFieldTransition(deps);
  return {
    rec,
    inputHeld: () => t.inputHeld,
    setBand: (v) => {
      band = v;
    },
    setActive: (id, fresh = false) => {
      active = id === null ? null : fresh ? { id } : bindingFor(id);
    },
    setState: (id, s) => {
      states.set(id, s);
    },
    advance: (ms) => {
      now += ms;
    },
    tick: () => t.tick(),
  };
}

// Drive a rig through one complete transition so later tests start from a
// revealed baseline (the way a live session reaches steady state).
function reveal(r: Rig, id: string): void {
  r.setActive(id);
  r.setState(id, 'building');
  r.tick();
  r.setState(id, 'ready');
  r.tick();
  r.advance(PT_TRANSITION_MIN_MS + 100);
  r.tick();
}

describe('pt_field_transition orchestrator', () => {
  it('raises the curtain on initial PT entry while the view builds', () => {
    const r = makeRig();
    r.setState('ricarten', 'building');
    r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN']);
    expect(r.inputHeld()).toBe(true);
  });

  it('shows the destination field name, not a hard-coded one', () => {
    const r = makeRig({ fieldName: (id) => `FIELD:${id}` });
    r.setActive('fore-1');
    r.setState('fore-1', 'building');
    r.tick();
    expect(r.rec.shows).toEqual(['FIELD:fore-1']);
  });

  it('requires real visual readiness before reveal, even past the minimum', () => {
    const r = makeRig();
    r.setState('ricarten', 'building');
    r.tick();
    r.advance(PT_TRANSITION_MIN_MS + 5000);
    r.tick();
    expect(r.rec.hides).toBe(0);
    r.setState('ricarten', 'compiling');
    r.tick();
    expect(r.rec.hides).toBe(0);
    r.setState('ricarten', 'ready');
    r.tick();
    expect(r.rec.hides).toBe(1);
    expect(r.rec.progress.at(-1)).toBe(100);
  });

  it('respects the minimum presentation time on an already-ready view', () => {
    const r = makeRig();
    r.setState('ricarten', 'ready');
    r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN']);
    expect(r.rec.hides).toBe(0);
    r.advance(PT_TRANSITION_MIN_MS - 1);
    r.tick();
    expect(r.rec.hides).toBe(0);
    r.advance(1);
    r.tick();
    expect(r.rec.hides).toBe(1);
  });

  it('raises a fresh curtain on a FieldGate promotion to a new map', () => {
    const r = makeRig();
    reveal(r, 'ricarten');
    expect(r.rec.hides).toBe(1);
    // Promotion: the bound map changes under the player.
    r.setActive('fore-1');
    r.setState('fore-1', 'ready');
    r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN', 'FORE-1']);
    r.advance(PT_TRANSITION_MIN_MS);
    r.tick();
    expect(r.rec.hides).toBe(2);
  });

  it('does not re-raise while the revealed map stays ready', () => {
    const r = makeRig();
    reveal(r, 'ricarten');
    for (let i = 0; i < 10; i++) r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN']);
    expect(r.rec.hides).toBe(1);
  });

  it('re-raises when the revealed map loses visual readiness (same-id rebuild)', () => {
    const r = makeRig();
    reveal(r, 'ricarten');
    r.setState('ricarten', 'building');
    r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN', 'RICARTEN']);
    expect(r.inputHeld()).toBe(true);
  });

  it('re-raises on a same-id re-bind even while the view reads ready throughout', () => {
    const r = makeRig();
    reveal(r, 'ricarten');
    expect(r.rec.hides).toBe(1);
    // A cache-warm /ptmap reinstall can detach and re-attach inside one
    // frame gap on a slow client: no tick ever samples 'building', so the
    // binding identity - not a missed sample - must raise the curtain.
    r.setActive('ricarten', true);
    r.setState('ricarten', 'ready');
    r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN', 'RICARTEN']);
    expect(r.inputHeld()).toBe(true);
    r.advance(PT_TRANSITION_MIN_MS);
    r.tick();
    expect(r.rec.hides).toBe(2);
    // And afterwards the new binding is the revealed one: no repeat.
    r.tick();
    expect(r.rec.hides).toBe(2);
  });

  it('releases input and reports failure when the build fails', () => {
    const r = makeRig();
    r.setState('ricarten', 'building');
    r.tick();
    r.setState('ricarten', 'failed');
    r.tick();
    expect(r.rec.fails).toEqual(['RICARTEN']);
    expect(r.inputHeld()).toBe(false);
    expect(r.rec.hides).toBe(0);
  });

  it('fails open past the long-wait bound instead of trapping input', () => {
    const r = makeRig();
    r.setState('ricarten', 'building');
    r.tick();
    r.advance(PT_TRANSITION_FAIL_MS + 1);
    r.tick();
    expect(r.rec.fails).toEqual(['RICARTEN']);
    expect(r.inputHeld()).toBe(false);
  });

  it('recovers a failed transition if the view eventually reports ready', () => {
    const r = makeRig();
    r.setState('ricarten', 'building');
    r.tick();
    r.setState('ricarten', 'failed');
    r.tick();
    expect(r.inputHeld()).toBe(false);
    // The gate's retry landed after all: reveal rather than strand the player.
    r.setState('ricarten', 'ready');
    r.advance(PT_TRANSITION_MIN_MS);
    r.tick();
    expect(r.rec.hides).toBe(1);
  });

  it('lifts the curtain immediately when the player leaves the PT band', () => {
    const r = makeRig();
    r.setState('ricarten', 'building');
    r.tick();
    r.setBand(false);
    r.tick();
    expect(r.rec.hides).toBe(1);
    expect(r.inputHeld()).toBe(false);
    // And re-entering later starts a fresh transition, not a stale one.
    r.setBand(true);
    r.setState('ricarten', 'building');
    r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN', 'RICARTEN']);
  });

  it('stays down entirely outside the PT band', () => {
    const r = makeRig();
    r.setBand(false);
    r.setState('ricarten', 'building');
    r.tick();
    r.tick();
    expect(r.rec.shows).toHaveLength(0);
    expect(r.inputHeld()).toBe(false);
  });

  it('stays down while no map is bound', () => {
    const r = makeRig();
    r.setActive(null);
    r.tick();
    expect(r.rec.shows).toHaveLength(0);
    expect(r.inputHeld()).toBe(false);
  });

  it('does not duplicate-show the same target across ticks', () => {
    const r = makeRig();
    r.setState('ricarten', 'building');
    r.tick();
    r.tick();
    r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN']);
  });

  it('retargets an open curtain without restarting the presentation clock', () => {
    const r = makeRig();
    r.setState('ricarten', 'building');
    r.tick();
    // A warp lands mid-build: the bound map changes under the open curtain.
    r.setActive('fore-1');
    r.setState('fore-1', 'ready');
    r.advance(PT_TRANSITION_MIN_MS + 1);
    r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN', 'FORE-1']);
    expect(r.rec.hides).toBe(1);
  });

  it('maps the staged progress model onto view states', () => {
    const r = makeRig();
    r.setState('ricarten', 'none');
    r.tick();
    expect(r.rec.progress.at(-1)).toBeLessThan(20);
    r.setState('ricarten', 'building');
    r.tick();
    expect(r.rec.progress.at(-1)).toBeGreaterThanOrEqual(20);
    expect(r.rec.progress.at(-1)).toBeLessThan(80);
    r.setState('ricarten', 'compiling');
    r.tick();
    const p = r.rec.progress.at(-1);
    expect(p).toBeGreaterThanOrEqual(80);
    expect(p).toBeLessThan(100);
    r.setState('ricarten', 'ready');
    r.tick();
    expect(r.rec.progress.at(-1)).toBe(100);
  });
});

describe('ptFieldLabel', () => {
  it('returns the uppercased id immediately and upgrades with the authored displayName', async () => {
    let upgrade: { id: string; label: string } | null = null;
    const immediate = ptFieldLabel('fore-1', (id, label) => {
      upgrade = { id, label };
    });
    expect(immediate).toBe('FORE-1');
    // The maplinks registry lands on a dynamic import: flush the loader,
    // with a poll budget generous enough for a heavily loaded test host.
    for (let i = 0; i < 1000 && !upgrade; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(upgrade).toEqual({ id: 'fore-1', label: 'FORE-1 (自由庭院)' });
  });

  it('never calls the upgrade for a field with no displayName', async () => {
    let fired = false;
    ptFieldLabel('no-such-field', () => {
      fired = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(fired).toBe(false);
  });
});

describe('pt_transition_screen DOM', () => {
  it('mounts one root lazily and repaints the field name and progress', () => {
    document.body.innerHTML = '';
    showPtTransition('RICARTEN');
    const root = document.getElementById('pt-transition-screen');
    expect(root).not.toBeNull();
    expect(root?.classList.contains('visible')).toBe(true);
    expect(root?.querySelector('.pts-field')?.textContent).toBe('RICARTEN');
    setPtTransitionProgress(55);
    const fill = root?.querySelector<HTMLElement>('.pts-fill');
    expect(fill?.style.width).toBe('55%');
    // A second show updates the label without stacking a second root.
    showPtTransition('FORE-1');
    expect(document.querySelectorAll('#pt-transition-screen')).toHaveLength(1);
    expect(root?.querySelector('.pts-field')?.textContent).toBe('FORE-1');
    hidePtTransition();
    expect(root?.classList.contains('visible')).toBe(false);
  });

  it('reports failure without removing the curtain', () => {
    document.body.innerHTML = '';
    showPtTransition('FORE-2');
    failPtTransition('FORE-2');
    const root = document.getElementById('pt-transition-screen');
    expect(root?.classList.contains('visible')).toBe(true);
    expect(root?.classList.contains('failed')).toBe(true);
    hidePtTransition();
    expect(root?.classList.contains('failed')).toBe(false);
  });
});
