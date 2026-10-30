import { describe, expect, it } from 'vitest';
import { CENTER, CIRCLE_PAIRS, circumference, pentagramPoints, PROGRESS_R, RING_R, segmentLength, slotPoint, sparkPoints, STAR_PAIRS, starPath } from './circle-draw';

const dist = (p: { x: number; y: number }) => Math.hypot(p.x - CENTER, p.y - CENTER);
const angle = (p: { x: number; y: number }) => Math.atan2(p.y - CENTER, p.x - CENTER);

describe('circle-draw', () => {
  it('has 5 pentagram points on ring 1, evenly spaced, the first at the top', () => {
    const pts = pentagramPoints();
    expect(pts).toHaveLength(5);
    for (const p of pts) expect(dist(p)).toBeCloseTo(RING_R[0], 1);
    expect(pts[0]!.x).toBeCloseTo(CENTER, 5);
    expect(pts[0]!.y).toBeLessThan(CENTER);
    const sides = CIRCLE_PAIRS.map(([a, b]) => segmentLength(pts[a]!, pts[b]!));
    for (const s of sides) expect(s).toBeCloseTo(sides[0]!, 1);
  });

  it('puts ring-2 slot j outside ring-1 slot j, on the same ray', () => {
    for (let j = 0; j < 5; j++) {
      const inner = slotPoint(0, j), outer = slotPoint(1, j);
      expect(dist(outer)).toBeGreaterThan(dist(inner));
      expect(angle(outer)).toBeCloseTo(angle(inner), 3);
    }
  });

  it('star lines join every second point and the path visits all five', () => {
    expect(STAR_PAIRS).toEqual([[0, 2], [1, 3], [2, 4], [3, 0], [4, 1]]);
    expect(starPath().match(/[ML]/g)).toHaveLength(5);
    expect(starPath().endsWith('Z')).toBe(true);
  });

  it('spreads sparks around the progress ring', () => {
    const s = sparkPoints(8);
    expect(s).toHaveLength(8);
    for (const p of s) expect(dist(p)).toBeCloseTo(PROGRESS_R, 1);
    expect(circumference(10)).toBeCloseTo(62.83, 2);
  });
});
