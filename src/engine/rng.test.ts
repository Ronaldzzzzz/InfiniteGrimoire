import { describe, expect, it } from 'vitest';
import { createRng, pickWeighted } from './rng';

describe('createRng', () => {
  it('same seed gives same sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(
      Array.from({ length: 20 }, () => b.next()),
    );
  });

  it('next() stays within [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(1,3) stays in range and hits 1, 2, 3', () => {
    const r = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = r.int(1, 3);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});

describe('pickWeighted', () => {
  it('respects 92/8 weights', () => {
    const r = createRng(123);
    let b = 0;
    for (let i = 0; i < 10000; i++) {
      if (
        pickWeighted(r, [
          { value: 'a', weight: 92 },
          { value: 'b', weight: 8 },
        ]) === 'b'
      )
        b++;
    }
    expect(b / 10000).toBeGreaterThanOrEqual(0.06);
    expect(b / 10000).toBeLessThanOrEqual(0.1);
  });

  it('single item is always returned', () => {
    const r = createRng(5);
    for (let i = 0; i < 50; i++) {
      expect(pickWeighted(r, [{ value: 'only', weight: 3 }])).toBe('only');
    }
  });
});
