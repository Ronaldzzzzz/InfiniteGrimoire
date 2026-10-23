import { describe, expect, it } from 'vitest';
import { BUBBLE_SIZE, bubblePlacement, panBy, viewBoxOf, zoomAt } from './tree-viewport';

describe('tree-viewport', () => {
  it('zoomAt keeps the point under the cursor fixed', () => {
    const v = zoomAt({ x: 0, y: 0, zoom: 1 }, 2, { x: 100, y: -50 });
    expect(v).toEqual({ x: 50, y: -25, zoom: 2 });
  });
  it('zoomAt clamps to MIN_ZOOM..MAX_ZOOM and then does not move', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 3 }, 1.1, { x: 100, y: 0 })).toEqual({ x: 0, y: 0, zoom: 3 });
    expect(zoomAt({ x: 0, y: 0, zoom: 0.5 }, 1 / 1.1, { x: 100, y: 0 }).zoom).toBe(0.5);
  });
  it('viewBoxOf is a square of base / zoom around the centre', () => {
    expect(viewBoxOf({ x: 10, y: 20, zoom: 2 }, 600)).toBe('-140 -130 300 300');
  });
  it('panBy moves the centre', () => {
    expect(panBy({ x: 1, y: 2, zoom: 2 }, 3, -4)).toEqual({ x: 4, y: -2, zoom: 2 });
  });
  it('bubblePlacement flips left near the right edge and below near the top', () => {
    const stage = { w: 400, h: 400 }, bubble = { w: 200, h: 80 };
    expect(bubblePlacement({ x: 100, y: 200 }, stage, bubble)).toMatchObject({ side: 'above', align: 'left' });
    expect(bubblePlacement({ x: 350, y: 200 }, stage, bubble)).toMatchObject({ align: 'right' });
    expect(bubblePlacement({ x: 100, y: 30 }, stage, bubble)).toMatchObject({ side: 'below' });
    const p = bubblePlacement({ x: 395, y: 395 }, stage, bubble);
    expect(p.left).toBeGreaterThanOrEqual(0); expect(p.left + 200).toBeLessThanOrEqual(400);
  });
  it('a learned spell bubble reserves room for its wrapped button row (measured 128px in a real browser)', () => {
    expect(BUBBLE_SIZE.learned.h).toBeGreaterThanOrEqual(128);
    expect(BUBBLE_SIZE.locked.h).toBeGreaterThanOrEqual(94); // longest hint, measured
  });
});
