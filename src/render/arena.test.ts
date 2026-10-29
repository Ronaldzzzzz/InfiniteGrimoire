import { describe, expect, it } from 'vitest';
import { STOP_X } from '../engine/combat';
import { floatTextStart, makeArena, toScreen } from './arena';

describe('makeArena', () => {
  it('centres the arena and sizes it so the edge clears the view corners', () => {
    const a = makeArena(400, 300, 0.05);
    expect(a.center).toEqual({ x: 200, y: 150 });
    expect(a.radius * (1 - 0.05)).toBeCloseTo(Math.hypot(200, 150) + 1);
  });
});

describe('foe placement', () => {
  const views: [number, number][] = [[420, 700], [360, 170], [400, 400], [1280, 300]];

  it('maps the engine origin to the centre and scales both axes by the radius', () => {
    const a = makeArena(400, 300, 0.05);
    expect(toScreen(a, 0, 0)).toEqual({ x: 200, y: 150 });
    const p = toScreen(a, 0.5, -0.25);
    expect(p.x).toBeCloseTo(200 + 0.5 * a.radius);
    expect(p.y).toBeCloseTo(150 - 0.25 * a.radius);
  });

  it('spawns (distance 1) fully outside the view in every direction', () => {
    for (const [w, h] of views) {
      const foeR = 0.07;
      const a = makeArena(w, h, foeR);
      const r = foeR * a.radius;
      for (let i = 0; i < 32; i++) {
        const t = (i / 32) * Math.PI * 2;
        const p = toScreen(a, Math.cos(t), Math.sin(t));
        // distance from the foe's centre to the nearest point of the view rectangle
        const gap = Math.hypot(p.x - Math.max(0, Math.min(w, p.x)), p.y - Math.max(0, Math.min(h, p.y)));
        const outside = gap >= r;
        expect(outside, `${w}x${h} angle ${i}`).toBe(true);
      }
    }
  });

  it('puts the stop ring at STOP_X of the radius', () => {
    const a = makeArena(400, 400, 0.05);
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
