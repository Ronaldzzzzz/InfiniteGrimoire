import { describe, expect, it } from 'vitest';
import { CENTER, CIRCLE_PAIRS, circumference, wheelCenter, wheelPoints, wheelLayout, GRADE_WHEEL_R, RUNE_WHEEL_R, RUNE_BAND_R, ITEM_HALF, VIEW, pentagramPoints, PROGRESS_R, openSlotCounts, RING2_DEFAULT, RING_R, shownPoint, shownSlots, slotPoint, sparkPoints, STAR_PAIRS, starPath } from './circle-draw';

const dist = (p: { x: number; y: number }) => Math.hypot(p.x - CENTER, p.y - CENTER);
const angle = (p: { x: number; y: number }) => Math.atan2(p.y - CENTER, p.x - CENTER);

describe('circle-draw', () => {
  it('has 5 pentagram points on ring 1, evenly spaced, the first at the top', () => {
    const pts = pentagramPoints();
    expect(pts).toHaveLength(5);
    for (const p of pts) expect(dist(p)).toBeCloseTo(RING_R[0], 1);
    expect(pts[0]!.x).toBeCloseTo(CENTER, 5);
    expect(pts[0]!.y).toBeLessThan(CENTER);
    const sides = CIRCLE_PAIRS.map(([a, b]) => Math.hypot(pts[a]!.x - pts[b]!.x, pts[a]!.y - pts[b]!.y));
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

  it('opens slots by the unlocked tier only', () => {
    expect(openSlotCounts(1)).toEqual([0, 0]);
    expect(openSlotCounts(2)).toEqual([1, 0]);
    expect(openSlotCounts(4)).toEqual([3, 0]);
    expect(openSlotCounts(6)).toEqual([5, 0]);
    expect(openSlotCounts(7)).toEqual([5, 1]);
    expect(openSlotCounts(10)).toEqual([5, 4]);
    expect(RING2_DEFAULT[2]).toEqual([1, 4]);
  });

  it('shows the default slots plus any filled ones, ascending', () => {
    expect(shownSlots(0, 2, [])).toEqual([0, 1]);
    expect(shownSlots(0, 2, [0, 2])).toEqual([0, 1, 2]);
    expect(shownSlots(1, 2, [])).toEqual([1, 4]);
    expect(shownSlots(1, 3, [1])).toEqual([0, 1, 2, 3]);
  });

  it('spreads the shown ring-1 slots evenly from the top; ring 2 stays on its ray', () => {
    expect(shownPoint(0, 0, [0])).toEqual({ x: CENTER, y: CENTER - RING_R[0] });
    expect(shownPoint(0, 1, [0, 1])).toEqual({ x: CENTER, y: CENTER + RING_R[0] });
    const four = shownPoint(0, 1, [0, 1, 2, 3]);
    expect(four.x).toBeCloseTo(CENTER + RING_R[0], 1);
    expect(four.y).toBeCloseTo(CENTER, 1);
    for (let j = 0; j < 5; j++) {
      expect(shownPoint(0, j, [0, 1, 2, 3, 4])).toEqual(slotPoint(0, j));
      expect(shownPoint(1, j, [1, 4])).toEqual(slotPoint(1, j));
    }
  });
});

describe('element wheel geometry', () => {
  it('wheelPoints lays n points from the top, clockwise', () => {
    const pts = wheelPoints(4, { x: 120, y: 120 }, 30);
    expect(pts.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([[120, 90], [150, 120], [120, 150], [90, 120]]);
  });

  it('wheelCenter keeps the wheel inside the sheet', () => {
    expect(wheelCenter({ x: 5, y: 120 }, 34)).toEqual({ x: 34, y: 120 });
    expect(wheelCenter({ x: 120, y: 238 }, 34)).toEqual({ x: 120, y: 206 });
    expect(wheelCenter({ x: 100, y: 90 }, 34)).toEqual({ x: 100, y: 90 });
  });
});

describe('grade wheel layout', () => {
  const spots = [
    { name: 'top of ring 1', at: slotPoint(0, 0) },
    { name: 'ring 2 corner-ish slot', at: slotPoint(1, 1) },
    { name: 'ring 2 slot 4', at: slotPoint(1, 4) },
    { name: 'core', at: { x: CENTER, y: CENTER } },
  ];
  for (const { name, at } of spots) {
    it(`keeps five items inside the sheet and apart: ${name}`, () => {
      const { points } = wheelLayout(at, 5, GRADE_WHEEL_R);
      for (const p of points) {
        expect(p.x - ITEM_HALF).toBeGreaterThanOrEqual(0);
        expect(p.x + ITEM_HALF).toBeLessThanOrEqual(VIEW);
        expect(p.y - ITEM_HALF).toBeGreaterThanOrEqual(0);
        expect(p.y + ITEM_HALF).toBeLessThanOrEqual(VIEW);
      }
      for (let i = 0; i < 5; i++) {
        const a = points[i]!, b = points[(i + 1) % 5]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(ITEM_HALF * 2);
      }
    });
  }
});

describe('rune wheel layout', () => {
  for (const [ring, name] of [[0, 'ring 1'], [1, 'ring 2']] as const) {
    it(`keeps eight items inside the sheet and apart: ${name} top`, () => {
      const { points } = wheelLayout({ x: CENTER, y: CENTER - RING_R[ring] }, 8, RUNE_WHEEL_R);
      for (const p of points) {
        expect(p.x - ITEM_HALF).toBeGreaterThanOrEqual(0);
        expect(p.x + ITEM_HALF).toBeLessThanOrEqual(VIEW);
        expect(p.y - ITEM_HALF).toBeGreaterThanOrEqual(0);
        expect(p.y + ITEM_HALF).toBeLessThanOrEqual(VIEW);
      }
      for (let i = 0; i < 8; i++) {
        const a = points[i]!, b = points[(i + 1) % 8]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(ITEM_HALF * 2);
      }
    });
  }
  it('bands sit just outside their rings', () => {
    expect(RUNE_BAND_R).toEqual([RING_R[0] + 10, RING_R[1] + 10]);
  });
});
