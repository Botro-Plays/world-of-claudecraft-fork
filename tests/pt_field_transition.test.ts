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
  drawHeld(): boolean;
  raises: number;
  setBand(v: boolean): void;
  /** Bind a field. fresh=true swaps in a NEW binding object for the same id
   *  (a same-id /ptmap reinstall: a re-entry, not the same binding). */
  setActive(id: string | null, fresh?: boolean): void;
  /** Install (or clear) the preloaded FieldGate-neighbor binding. fresh
   *  swaps in a NEW binding object for the same id (a rebuilt descriptor). */
  setStandby(id: string | null, fresh?: boolean): void;
  /** Mark which standby id is within the pre-entry margin (null = none). */
  setNear(id: string | null): void;
  /** Mark which standby id the player is closing on (null = none/idle). */
  setApproach(id: string | null): void;
  /** Standby-gate view states, keyed by id (the active gate uses setState). */
  setStandbyState(id: string, s: PtFieldViewState): void;
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
  let standby: { id: string } | null = null;
  let nearId: string | null = null;
  let approachId: string | null = null;
  let now = 0;
  let raises = 0;
  const states = new Map<string, PtFieldViewState>();
  const standbyStates = new Map<string, PtFieldViewState>();
  const deps: PtFieldTransitionDeps = {
    inPtBand: () => band,
    activeMap: () => active,
    standbyMap: () => standby,
    viewState: (id) => states.get(id) ?? 'none',
    standbyViewState: (id) => standbyStates.get(id) ?? 'none',
    nearGateTo: (id) => nearId === id,
    approachingGateTo: (id) => approachId === id,
    onRaise: () => {
      raises++;
    },
    fieldName: (id) => id.toUpperCase(),
    overlay: rec.overlay,
    nowMs: () => now,
    ...overrides,
  };
  const t = createPtFieldTransition(deps);
  return {
    rec,
    get raises() {
      return raises;
    },
    inputHeld: () => t.inputHeld,
    drawHeld: () => t.drawHeld,
    setBand: (v) => {
      band = v;
    },
    setActive: (id, fresh = false) => {
      active = id === null ? null : fresh ? { id } : bindingFor(id);
    },
    setStandby: (id, fresh = false) => {
      standby = id === null ? null : fresh ? { id } : bindingFor(id);
    },
    setNear: (id) => {
      nearId = id;
    },
    setApproach: (id) => {
      approachId = id;
    },
    setStandbyState: (id, s) => {
      standbyStates.set(id, s);
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

  it('raises the pre-entry card for a near gate while the standby builds', () => {
    const r = makeRig();
    reveal(r, 'ricarten');
    r.setStandby('fore-1');
    r.setNear('fore-1');
    r.setApproach('fore-1');
    r.setStandbyState('fore-1', 'building');
    r.tick();
    // The card presents the DESTINATION field and freezes input+draw before
    // the boundary is crossed.
    expect(r.rec.shows).toEqual(['RICARTEN', 'FORE-1']);
    expect(r.inputHeld()).toBe(true);
    expect(r.drawHeld()).toBe(true);
    expect(r.raises).toBe(2);
    // The standby build finishing + the minimum lifts the card while the
    // binding has not changed - the player is still pre-crossing.
    r.setStandbyState('fore-1', 'ready');
    r.advance(PT_TRANSITION_MIN_MS);
    r.tick();
    expect(r.rec.hides).toBe(2);
    expect(r.inputHeld()).toBe(false);
    expect(r.drawHeld()).toBe(false);
  });

  it('suppresses the flip card for the promotion a lifted pre-entry card armed', () => {
    const r = makeRig();
    reveal(r, 'ricarten');
    r.setStandby('fore-1');
    r.setNear('fore-1');
    r.setApproach('fore-1');
    r.setStandbyState('fore-1', 'ready');
    r.tick();
    r.advance(PT_TRANSITION_MIN_MS);
    r.tick();
    expect(r.rec.hides).toBe(2);
    // The player walks through: the same binding object promotes to active
    // (promoteStandbyField swaps the slots, so ricarten becomes standby).
    r.setActive('fore-1');
    r.setStandby('ricarten');
    r.setState('fore-1', 'ready');
    r.tick();
    r.advance(PT_TRANSITION_MIN_MS + 100);
    r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN', 'FORE-1']);
    expect(r.rec.hides).toBe(2);
    // And the new revealed binding is stable.
    for (let i = 0; i < 5; i++) r.tick();
    expect(r.rec.shows).toHaveLength(2);
  });

  it('does not re-raise the pre-entry card while the armed crossing is pending', () => {
    const r = makeRig();
    reveal(r, 'ricarten');
    r.setStandby('fore-1');
    r.setNear('fore-1');
    r.setApproach('fore-1');
    r.setStandbyState('fore-1', 'ready');
    r.tick();
    r.advance(PT_TRANSITION_MIN_MS);
    r.tick();
    expect(r.rec.hides).toBe(2);
    // The card lifted and armed the pending crossing. The player is still
    // inside the gate mouth (the walk-through takes a moment), so the mouth
    // probes stay true - but the armed expectation means this crossing was
    // already presented, and must not re-raise every minimum interval.
    for (let i = 0; i < 10; i++) {
      r.tick();
      r.advance(PT_TRANSITION_MIN_MS);
    }
    expect(r.rec.shows).toEqual(['RICARTEN', 'FORE-1']);
    expect(r.rec.hides).toBe(2);
    expect(r.inputHeld()).toBe(false);
  });

  it('does not arm the pre-entry card for an idle player inside the margin', () => {
    const r = makeRig();
    reveal(r, 'ricarten');
    r.setStandby('fore-1');
    // Near the gate but not closing on it (stopped just past a crossing,
    // or simply standing at the mouth): proximity alone arms nothing.
    r.setNear('fore-1');
    r.setStandbyState('fore-1', 'ready');
    for (let i = 0; i < 5; i++) r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN']);
    expect(r.inputHeld()).toBe(false);
  });

  it('re-arms a fresh standby binding even when its id matches the lifted card', () => {
    const r = makeRig();
    reveal(r, 'ricarten');
    r.setStandby('fore-1');
    r.setNear('fore-1');
    r.setApproach('fore-1');
    r.setStandbyState('fore-1', 'ready');
    r.tick();
    r.advance(PT_TRANSITION_MIN_MS);
    r.tick();
    expect(r.rec.hides).toBe(2);
    // The gate scan swapped the standby binding for a fresh descriptor of
    // the same field: the armed expectation keyed on the OLD binding no
    // longer describes this approach, so the card may raise again.
    r.setStandby('fore-1', true);
    r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN', 'FORE-1', 'FORE-1']);
    expect(r.inputHeld()).toBe(true);
  });

  it('keeps the expectation armed only while the crossing is still pending', () => {
    const r = makeRig();
    reveal(r, 'ricarten');
    r.setStandby('fore-1');
    r.setNear('fore-1');
    r.setApproach('fore-1');
    r.setStandbyState('fore-1', 'ready');
    r.tick();
    r.advance(PT_TRANSITION_MIN_MS);
    r.tick();
    expect(r.rec.hides).toBe(2);
    // The player turns around instead of crossing: the slot rotates away
    // and the gate approach lapses, so a LATER entry to fore-1 gets a
    // fresh card.
    r.setStandby(null);
    r.setNear(null);
    r.setApproach(null);
    r.tick();
    r.setActive('fore-1');
    r.setState('fore-1', 'ready');
    r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN', 'FORE-1', 'FORE-1']);
  });

  it('drops the pre-entry card when the standby slot rotates without a crossing', () => {
    const r = makeRig();
    reveal(r, 'ricarten');
    r.setStandby('fore-1');
    r.setNear('fore-1');
    r.setApproach('fore-1');
    r.setStandbyState('fore-1', 'building');
    r.tick();
    expect(r.inputHeld()).toBe(true);
    // The gate scan retargeted the slot to a different neighbor, and the
    // player is not near that gate: the approach ended.
    r.setStandby('fore-2');
    r.setNear(null);
    r.tick();
    expect(r.rec.hides).toBe(2);
    expect(r.inputHeld()).toBe(false);
  });

  it('retargets the pre-entry card when another gate is armed', () => {
    const r = makeRig();
    reveal(r, 'ricarten');
    r.setStandby('fore-1');
    r.setNear('fore-1');
    r.setApproach('fore-1');
    r.setStandbyState('fore-1', 'building');
    r.tick();
    // The slot rotated to a neighbor whose gate the player is also near.
    r.setStandby('fore-2');
    r.setNear('fore-2');
    r.setStandbyState('fore-2', 'building');
    r.tick();
    expect(r.rec.shows).toEqual(['RICARTEN', 'FORE-1', 'FORE-2']);
    expect(r.rec.hides).toBe(1);
    expect(r.inputHeld()).toBe(true);
  });

  it('finishes as a flip transition when promotion runs under the open card', () => {
    const r = makeRig();
    reveal(r, 'ricarten');
    r.setStandby('fore-1');
    r.setNear('fore-1');
    r.setApproach('fore-1');
    r.setStandbyState('fore-1', 'building');
    r.tick();
    // Promotion raced the arm: the same binding is now active.
    r.setActive('fore-1');
    r.setStandby('ricarten');
    r.setState('fore-1', 'ready');
    r.tick();
    // Still the same card, now reading the active-gate probe.
    expect(r.rec.shows).toEqual(['RICARTEN', 'FORE-1']);
    r.advance(PT_TRANSITION_MIN_MS);
    r.tick();
    expect(r.rec.hides).toBe(2);
    for (let i = 0; i < 5; i++) r.tick();
    expect(r.rec.shows).toHaveLength(2);
  });

  it('reports drawHeld alongside inputHeld through the whole card', () => {
    const r = makeRig();
    r.setState('ricarten', 'building');
    r.tick();
    expect(r.inputHeld()).toBe(true);
    expect(r.drawHeld()).toBe(true);
    r.setState('ricarten', 'ready');
    r.advance(PT_TRANSITION_MIN_MS);
    r.tick();
    expect(r.inputHeld()).toBe(false);
    expect(r.drawHeld()).toBe(false);
  });
});

describe('ptFieldLabel', () => {
  it('returns the authentic display name immediately and upgrades with the authored zh name', async () => {
    let upgrade: { id: string; label: string } | null = null;
    const immediate = ptFieldLabel('fore-1', (id, label) => {
      upgrade = { id, label };
    });
    expect(immediate).toBe('GARDEN OF FREEDOM');
    // The maplinks registry lands on a dynamic import: flush the loader,
    // with a poll budget generous enough for a heavily loaded test host.
    for (let i = 0; i < 1000 && !upgrade; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(upgrade).toEqual({ id: 'fore-1', label: 'Garden of Freedom (自由庭院)' });
  });

  it('uses the authored zh name for fields with no canonical English name', () => {
    expect(ptFieldLabel('landofnurwn', () => {})).toBe('永霜圣殿');
  });

  it('falls back to the uppercased id for a field with no displayName', async () => {
    let fired = false;
    const label = ptFieldLabel('no-such-field', () => {
      fired = true;
    });
    expect(label).toBe('NO-SUCH-FIELD');
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
