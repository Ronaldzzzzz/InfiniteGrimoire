import { describe, expect, it } from 'vitest';
import { createRng } from '../engine/rng';
import { floatingText, jaggedPath } from './effects';

describe('jaggedPath', () => {
  it('keeps endpoints and returns segments + 1 points', () => {
    const from = { x: 10, y: 20 };
    const to = { x: 200, y: 80 };
    const p = jaggedPath(from, to, 5, createRng(1));
    expect(p).toHaveLength(6);
    expect(p[0]).toEqual(from);
    expect(p[5]).toEqual(to);
  });
});

describe('floatingText', () => {
  it('shows 無效 when immune', () => {
    expect(floatingText({ damage: 0, immune: true }).text).toBe('無效');
  });
  it('shows the damage number', () => {
    expect(floatingText({ damage: 12, immune: false }).text).toBe('12');
  });
});
