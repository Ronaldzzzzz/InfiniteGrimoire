import { describe, expect, it } from 'vitest';
import { interpolate } from './motion';

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
