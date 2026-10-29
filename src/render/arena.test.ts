import { describe, expect, it } from 'vitest';
import { LANE_Y, STOP_X } from '../engine/combat';
import { floatTextStart, makeArena, toScreen } from './arena';

describe('makeArena', () => {
  it('stands the mage at a quarter of the width, mid-height, and puts x = 1 on the right edge', () => {
    const a = makeArena(1280, 180);
    expect(toScreen(a, 0, 0)).toEqual({ x: 320, y: 90 });
    expect(Math.abs(toScreen(a, 1, 0).x - 1280)).toBeLessThanOrEqual(1);
  });

  it('keeps the whole lane inside the view, shrinking the scale when the strip is low', () => {
    for (const [w, h] of [[1280, 180], [390, 140], [1280, 60], [600, 400]] as [number, number][]) {
      const a = makeArena(w, h);
      expect(toScreen(a, 0, -LANE_Y).y, `${w}x${h} top`).toBeGreaterThanOrEqual(0);
      expect(toScreen(a, 0, LANE_Y).y, `${w}x${h} bottom`).toBeLessThanOrEqual(h);
      expect(a.radius).toBeLessThanOrEqual(0.75 * w);
    }
    expect(makeArena(1280, 60).radius).toBeLessThan(0.75 * 1280);
  });

  it('scales both axes by the radius and puts the stop line at STOP_X', () => {
    const a = makeArena(400, 300);
    const p = toScreen(a, 0.5, -0.05);
    expect(p.x).toBeCloseTo(100 + 0.5 * a.radius);
    expect(p.y).toBeCloseTo(150 - 0.05 * a.radius);
    expect(toScreen(a, STOP_X, 0).x - a.center.x).toBeCloseTo(STOP_X * a.radius);
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
