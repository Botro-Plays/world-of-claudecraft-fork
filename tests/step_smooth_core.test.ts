import { describe, expect, it } from 'vitest';
import {
  createStepSmooth,
  PT_STEP_SMOOTH_RATE,
  resetStepSmooth,
  STEP_SMOOTH_MAX_LAG,
  STEP_SMOOTH_SNAP,
  STEP_SMOOTH_RATE,
  stepSmoothHeight,
} from '../src/render/step_smooth_core';
import { MAX_STEP_HEIGHT } from '../src/sim/physics';

// Display-only vertical smoothing: the visual half of step-up. The physical
// height must stay authoritative; only what is DRAWN is eased.

const DT = 1 / 60;

describe('step smoothing', () => {
  it('passes flat ground through untouched', () => {
    const s = createStepSmooth();
    expect(stepSmoothHeight(s, 5, true, DT)).toBe(5);
    for (let i = 0; i < 60; i++) expect(stepSmoothHeight(s, 5, true, DT)).toBe(5);
  });

  it('eases a full step-up instead of popping, and lands exactly on it', () => {
    const s = createStepSmooth();
    stepSmoothHeight(s, 0, true, DT);
    // The solver moves the feet a whole step height in one tick.
    const first = stepSmoothHeight(s, MAX_STEP_HEIGHT, true, DT);
    expect(first).toBeLessThan(MAX_STEP_HEIGHT * 0.6); // did not pop
    expect(first).toBeGreaterThan(0); // but did begin to rise
    let prev = first;
    for (let i = 0; i < 60; i++) {
      const y = stepSmoothHeight(s, MAX_STEP_HEIGHT, true, DT);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9); // monotone, never dips
      prev = y;
    }
    expect(prev).toBeCloseTo(MAX_STEP_HEIGHT, 5); // settles on the truth
  });

  it('never lags further than a step, even against a staircase of them', () => {
    const s = createStepSmooth();
    let y = 0;
    stepSmoothHeight(s, y, true, DT);
    for (let i = 0; i < 40; i++) {
      y += MAX_STEP_HEIGHT; // absurd: a step every single frame
      const drawn = stepSmoothHeight(s, y, true, DT);
      expect(y - drawn).toBeLessThanOrEqual(STEP_SMOOTH_MAX_LAG + 1e-9);
    }
  });

  it('leaves jumps and falls exact', () => {
    const s = createStepSmooth();
    stepSmoothHeight(s, 0, true, DT);
    // Airborne: every frame must draw the physical height.
    let y = 0;
    for (let i = 0; i < 30; i++) {
      y += 0.25;
      expect(stepSmoothHeight(s, y, false, DT)).toBeCloseTo(y, 6);
    }
    for (let i = 0; i < 30; i++) {
      y -= 0.3;
      expect(stepSmoothHeight(s, y, false, DT)).toBeCloseTo(y, 6);
    }
  });

  it('absorbs a mantle catch: a flight ending on a surface ABOVE the feet', () => {
    // Jumping onto a boulder ends the arc by being pulled UP onto the top.
    // Gravity never does that, so it is the mantle, and drawing it raw is the
    // teleport-onto-the-rock jank this rule exists to remove.
    const s = createStepSmooth();
    stepSmoothHeight(s, 0, true, DT);
    let y = 0;
    for (let i = 0; i < 6; i++) {
      y += 0.1; // rising through the arc, airborne: exact
      expect(stepSmoothHeight(s, y, false, DT)).toBeCloseTo(y, 6);
    }
    // The catch: feet snap up onto the ledge as the body becomes grounded.
    const top = y + 0.7;
    const drawn = stepSmoothHeight(s, top, true, DT);
    expect(drawn).toBeLessThan(top - 0.2); // eased, not teleported
    expect(drawn).toBeGreaterThan(y - 1e-9); // and never dips below the arc
    let prev = drawn;
    for (let i = 0; i < 60; i++) {
      const next = stepSmoothHeight(s, top, true, DT);
      expect(next).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = next;
    }
    expect(prev).toBeCloseTo(top, 5);
  });

  it('keeps a real landing exact: a flight ending on a surface BELOW', () => {
    // The impact is the point; damping it would make gravity feel like syrup.
    const s = createStepSmooth();
    stepSmoothHeight(s, 10, true, DT);
    let y = 10;
    for (let i = 0; i < 8; i++) {
      y -= 0.28;
      expect(stepSmoothHeight(s, y, false, DT)).toBeCloseTo(y, 6);
    }
    const floor = y - 0.28;
    expect(stepSmoothHeight(s, floor, true, DT)).toBeCloseTo(floor, 6);
  });

  it('snaps on a teleport rather than gliding across the world', () => {
    const s = createStepSmooth();
    stepSmoothHeight(s, 0, true, DT);
    const drawn = stepSmoothHeight(s, STEP_SMOOTH_SNAP + 50, true, DT);
    expect(drawn).toBeCloseTo(STEP_SMOOTH_SNAP + 50, 4);
  });

  it('is frame-rate independent', () => {
    const a = createStepSmooth();
    const b = createStepSmooth();
    stepSmoothHeight(a, 0, true, 1 / 60);
    stepSmoothHeight(b, 0, true, 1 / 240);
    let ya = 0;
    let yb = 0;
    for (let i = 0; i < 12; i++) ya = stepSmoothHeight(a, 0.9, true, 1 / 60); // 0.2 s
    for (let i = 0; i < 48; i++) yb = stepSmoothHeight(b, 0.9, true, 1 / 240); // 0.2 s
    expect(Math.abs(ya - yb)).toBeLessThan(0.02);
  });

  it('re-seats after a reset', () => {
    const s = createStepSmooth();
    stepSmoothHeight(s, 0, true, DT);
    stepSmoothHeight(s, 0.9, true, DT);
    resetStepSmooth(s);
    expect(stepSmoothHeight(s, 12, true, DT)).toBe(12);
  });
});

// The PT band runs the same smoother at a slower convergence rate so Ricarten
// stair risers (which arrive in bursts) read as one continuous climb instead of
// a per-riser eased pop. Everything below pins that the slower rate changes
// ONLY the catch-up window — the absorption, leash, exclusion, and snap rules
// are identical, and the physical height input is never modified.
describe('PT-band step smoothing (slower rate)', () => {
  const PT_RISER = 10 * 0.036; // a full Stage_StepHeight riser, in yards

  it('is softer than the base rate', () => {
    expect(PT_STEP_SMOOTH_RATE).toBeLessThan(STEP_SMOOTH_RATE);
  });

  it('eases a riser over a longer window but still lands exactly', () => {
    const s = createStepSmooth();
    stepSmoothHeight(s, 0, true, DT, PT_STEP_SMOOTH_RATE);
    const first = stepSmoothHeight(s, PT_RISER, true, DT, PT_STEP_SMOOTH_RATE);
    expect(first).toBeLessThan(PT_RISER); // absorbed, not popped
    expect(first).toBeGreaterThan(0); // but still begins to rise
    // Converges measurably slower than the base rate.
    const base = createStepSmooth();
    stepSmoothHeight(base, 0, true, DT);
    const baseFirst = stepSmoothHeight(base, PT_RISER, true, DT);
    expect(first).toBeLessThan(baseFirst);
    let prev = first;
    for (let i = 0; i < 120; i++) {
      const y = stepSmoothHeight(s, PT_RISER, true, DT, PT_STEP_SMOOTH_RATE);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9); // monotone, never dips
      prev = y;
    }
    expect(prev).toBeCloseTo(PT_RISER, 5); // settles on the truth
  });

  it('keeps a continuous-climb profile across back-to-back risers', () => {
    // Risers every 150 ms (a running stair cadence): at the base rate the
    // offset drains nearly to zero between risers (the step-step-step look);
    // at the PT rate the drawn height is still catching up when the next
    // riser lands, so the motion reads continuous.
    const pt = createStepSmooth();
    const base = createStepSmooth();
    let y = 0;
    stepSmoothHeight(pt, y, true, DT, PT_STEP_SMOOTH_RATE);
    stepSmoothHeight(base, y, true, DT);
    let ptLag = 0;
    let baseLag = 0;
    for (let i = 0; i < 90; i++) {
      if (i % 9 === 0 && i > 0) y += PT_RISER;
      ptLag = y - stepSmoothHeight(pt, y, true, DT, PT_STEP_SMOOTH_RATE);
      baseLag = y - stepSmoothHeight(base, y, true, DT);
    }
    // Mid-climb, the PT display trails further (smoother) ...
    expect(ptLag).toBeGreaterThan(baseLag);
    // ... but never further than the shared leash (feet stay on the tread).
    expect(ptLag).toBeLessThanOrEqual(STEP_SMOOTH_MAX_LAG + 1e-9);
  });

  it('still draws a grounded step-DOWN by easing, never below-target overshoot', () => {
    const s = createStepSmooth();
    stepSmoothHeight(s, PT_RISER, true, DT, PT_STEP_SMOOTH_RATE);
    const first = stepSmoothHeight(s, 0, true, DT, PT_STEP_SMOOTH_RATE);
    expect(first).toBeGreaterThan(0); // eased down, not teleported
    let prev = first;
    for (let i = 0; i < 120; i++) {
      const y = stepSmoothHeight(s, 0, true, DT, PT_STEP_SMOOTH_RATE);
      expect(y).toBeLessThanOrEqual(prev + 1e-9); // monotone down
      prev = y;
    }
    expect(prev).toBeCloseTo(0, 5);
  });

  it('leaves airborne motion, real landings, and teleports exact', () => {
    const s = createStepSmooth();
    stepSmoothHeight(s, 0, true, DT, PT_STEP_SMOOTH_RATE);
    let y = 0;
    for (let i = 0; i < 10; i++) {
      y += 0.2;
      expect(stepSmoothHeight(s, y, false, DT, PT_STEP_SMOOTH_RATE)).toBeCloseTo(y, 6);
    }
    for (let i = 0; i < 10; i++) {
      y -= 0.2;
      expect(stepSmoothHeight(s, y, false, DT, PT_STEP_SMOOTH_RATE)).toBeCloseTo(y, 6);
    }
    const floor = y - 0.2;
    // Airborne -> grounded landing on a LOWER surface: exact.
    expect(stepSmoothHeight(s, floor, true, DT, PT_STEP_SMOOTH_RATE)).toBeCloseTo(floor, 6);
    // Teleport: snaps, no glide.
    const t = floor + STEP_SMOOTH_SNAP + 50;
    expect(stepSmoothHeight(s, t, true, DT, PT_STEP_SMOOTH_RATE)).toBeCloseTo(t, 4);
  });

  it('never modifies the physical height it is given (pure read)', () => {
    const s = createStepSmooth();
    stepSmoothHeight(s, 1, true, DT, PT_STEP_SMOOTH_RATE);
    const physical = 1 + PT_RISER;
    const drawn = stepSmoothHeight(s, physical, true, DT, PT_STEP_SMOOTH_RATE);
    // Drawn lags, but the input value is only read — the caller's `y` is the
    // authoritative display height and stays the collision/sim truth.
    expect(drawn).toBeLessThan(physical);
    expect(physical).toBeCloseTo(1 + PT_RISER, 9);
  });
});
