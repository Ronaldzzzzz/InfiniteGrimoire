import { describe, expect, it } from 'vitest';
import { createRng } from '../engine/rng';
import { ellipseArc, floatingText, jaggedPath } from './effects';

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

describe('ellipseArc', () => {
  it('returns segments + 1 points on the rotated ellipse', () => {
    const p = ellipseArc({ x: 100, y: 50 }, 20, 10, 0, 0, Math.PI, 4);
    expect(p).toHaveLength(5);
    expect(p[0]!.x).toBeCloseTo(120);
    expect(p[0]!.y).toBeCloseTo(50);
    expect(p[2]!.x).toBeCloseTo(100);
    expect(p[2]!.y).toBeCloseTo(60);
    expect(p[4]!.x).toBeCloseTo(80);
  });

  it('rotates the ellipse around its centre', () => {
    const p = ellipseArc({ x: 0, y: 0 }, 20, 10, Math.PI / 2, 0, 0, 1);
    expect(p[0]!.x).toBeCloseTo(0);
    expect(p[0]!.y).toBeCloseTo(20);
  });
});
