import { describe, expect, it } from 'vitest';
import { interpolate, WANDER_BOB, WANDER_MAX_ANGLE, WANDER_RAMP_MS, wander } from './motion';

describe('interpolate', () => {
  it('blends the previous and current step by alpha', () => {
    expect(interpolate(1, 0.9, 0)).toBe(1);
    expect(interpolate(1, 0.9, 1)).toBe(0.9);
    expect(interpolate(1, 0.9, 0.5)).toBeCloseTo(0.95);
  });

  it('clamps alpha to [0, 1]', () => {
    expect(interpolate(1, 0.9, -1)).toBe(1);
    expect(interpolate(1, 0.9, 3)).toBe(0.9);
  });
});

describe('wander', () => {
  const phases = [0, 1.3, 2.9, 4.4];

  it('is still at the moment of arrival and eases in', () => {
    for (const phase of phases) {
      expect(wander(5000, phase, 0)).toEqual({ dAngle: 0, dRadius: 0 });
    }
    const half = wander(1234, 0.7, WANDER_RAMP_MS / 2);
    const full = wander(1234, 0.7, WANDER_RAMP_MS * 4);
    expect(Math.abs(half.dAngle)).toBeCloseTo(Math.abs(full.dAngle) / 2);
  });

  it('stays within the angle range and only pushes outward', () => {
    for (const phase of phases) {
      for (let t = 0; t < 20000; t += 37) {
        const w = wander(t, phase, 10_000);
        expect(Math.abs(w.dAngle)).toBeLessThanOrEqual(WANDER_MAX_ANGLE + 1e-9);
        expect(w.dRadius).toBeGreaterThanOrEqual(0);
        expect(w.dRadius).toBeLessThanOrEqual(WANDER_BOB + 1e-9);
      }
    }
  });

  it('actually moves over time', () => {
    const a = wander(0, 1, 10_000);
    const b = wander(700, 1, 10_000);
    expect(a.dAngle).not.toBeCloseTo(b.dAngle);
  });
});
