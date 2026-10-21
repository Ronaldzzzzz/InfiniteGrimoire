import { describe, expect, it } from 'vitest';
import { createRng } from '../engine/rng';
import {
  angleGap,
  boxRadius,
  floatTextStart,
  ENGINE_STOP_X,
  makeArena,
  MIN_SEPARATION,
  monsterDistance,
  pickSpawnAngle,
  polarPoint,
  stopRadius,
  STOP_GAP,
} from './arena';

describe('makeArena', () => {
  it('centres the arena and sizes it past the view corners', () => {
    const a = makeArena(400, 300, 14);
    expect(a.center).toEqual({ x: 200, y: 150 });
    expect(a.radius).toBeCloseTo(Math.hypot(214, 164) + 1);
  });
});

describe('monster placement', () => {
  const views: [number, number][] = [[420, 700], [360, 170], [400, 400], [1280, 300]];

  it('spawns (x = 1) fully outside the view in every direction', () => {
    for (const [w, h] of views) {
      const r = 14;
      const a = makeArena(w, h, r);
      const stop = stopRadius(a, 19, r);
      for (let i = 0; i < 32; i++) {
        const p = polarPoint(a, (i / 32) * Math.PI * 2, monsterDistance(a, stop, 1));
        const outside = p.x - r >= w || p.x + r <= 0 || p.y - r >= h || p.y + r <= 0;
        expect(outside, `${w}x${h} angle ${i}`).toBe(true);
      }
    }
  });

  it('stops (x = 0.15) clear of the hero and fully inside the view when there is room', () => {
    for (const [w, h] of views) {
      for (const r of [14, 28]) {
        const a = makeArena(w, h, 28);
        const stop = stopRadius(a, 19, r);
        expect(monsterDistance(a, stop, ENGINE_STOP_X)).toBe(stop);
        expect(stop).toBeGreaterThanOrEqual(19 + r + STOP_GAP);
        if (19 + r + STOP_GAP <= Math.min(w, h) / 2 - r) expect(stop).toBeLessThanOrEqual(Math.min(w, h) / 2 - r);
      }
    }
  });

  it('prefers not overlapping the hero when the view is too small for both rules', () => {
    const a = makeArena(120, 60, 28);
    expect(stopRadius(a, 19, 28)).toBe(19 + 28 + STOP_GAP);
  });

  it('moves monotonically inward as x falls and clamps x outside [0.15, 1]', () => {
    const a = makeArena(400, 300, 14);
    const stop = stopRadius(a, 19, 14);
    expect(monsterDistance(a, stop, 0.5)).toBeLessThan(monsterDistance(a, stop, 0.8));
    expect(monsterDistance(a, stop, 0)).toBe(stop);
    expect(monsterDistance(a, stop, 2)).toBe(a.radius);
  });
});

describe('boxRadius', () => {
  it('keeps the hero box and a monster box (with its hp bar) apart at the stop ring, at any angle', () => {
    const u = 1.18;
    const hero = { hw: 11 * u, hh: 19 * u };
    for (const size of [28, 56]) {
      const mw = Math.max(12, size / 2) * u;
      const top = (size / 2 + 9) * u; // hp bar sits 9px above the body
      const bottom = (size / 2) * u;
      const a = makeArena(426, 746, 28 * u);
      const stop = stopRadius(a, boxRadius(hero.hw, hero.hh), boxRadius(mw, top));
      for (let i = 0; i < 64; i++) {
        const p = polarPoint(a, (i / 64) * Math.PI * 2, stop);
        const dx = Math.abs(p.x - a.center.x);
        const overlapX = dx < hero.hw + mw;
        const overlapY = p.y - top < a.center.y + hero.hh && p.y + bottom > a.center.y - hero.hh;
        expect(overlapX && overlapY, `size ${size} angle ${i}`).toBe(false);
      }
    }
  });
});

describe('angles', () => {
  it('measures the shortest gap between two angles', () => {
    expect(angleGap(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2);
    expect(angleGap(0, Math.PI)).toBeCloseTo(Math.PI);
  });

  it('keeps new spawns at least 25° from existing monsters when there is room', () => {
    const existing = [0, 2, 4];
    for (let seed = 1; seed <= 50; seed++) {
      const angle = pickSpawnAngle(existing, createRng(seed));
      for (const e of existing) expect(angleGap(angle, e)).toBeGreaterThanOrEqual(MIN_SEPARATION);
    }
  });

  it('returns an angle in [0, 2π) even when the circle is crowded', () => {
    const crowded = Array.from({ length: 20 }, (_, i) => (i / 20) * Math.PI * 2);
    const angle = pickSpawnAngle(crowded, createRng(3));
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThan(Math.PI * 2);
  });
});

describe('floatTextStart', () => {
  it('starts low enough that the text stays inside the view for its whole rise', () => {
    const textH = 16;
    const rise = 28;
    const start = floatTextStart({ x: 100, y: -200 }, 400, 300, 24, textH, rise);
    // bottom-anchored text: its top at the end of the rise is start.y - rise - textH
    expect(start.y - rise - textH).toBeGreaterThanOrEqual(24);
    expect(start.y).toBe(24 + textH + rise);
  });

  it('leaves on-screen targets alone and still clamps the bottom and sides', () => {
    expect(floatTextStart({ x: 100, y: 150 }, 400, 300, 24, 16, 28)).toEqual({ x: 100, y: 150 });
    expect(floatTextStart({ x: -9, y: 900 }, 400, 300, 24, 16, 28)).toEqual({ x: 24, y: 276 });
  });
});
