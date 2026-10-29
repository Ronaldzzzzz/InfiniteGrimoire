import { LANE_Y } from '../engine/combat';
import type { Pt } from './effects';

export interface Arena {
  /** screen position of the mage, the engine origin */
  center: Pt;
  /** screen pixels per engine unit along x (and y): 0.75 of the width, less when the lane would not fit the height */
  radius: number;
  w: number;
  h: number;
}

/** Space kept between the lane's edge and the top/bottom of the view. */
const LANE_MARGIN = 3;

/**
 * The side-scrolling strip: the mage stands at x = 0.25w, halfway down the view; engine x = 1 is the right edge.
 * The lane (engine y within +-LANE_Y) must fit the height, otherwise the height sets the scale.
 */
export function makeArena(w: number, h: number): Arena {
  const radius = Math.min(0.75 * w, Math.max(1, h / 2 - LANE_MARGIN) / LANE_Y);
  return { center: { x: 0.25 * w, y: h / 2 }, radius, w, h };
}

/** Engine arena coordinates (mage at 0, 0; y down like the screen) to view pixels. */
export function toScreen(a: Arena, x: number, y: number): Pt {
  return { x: a.center.x + x * a.radius, y: a.center.y + y * a.radius };
}

/**
 * Start point for bottom-anchored floating text of height `textH` that rises by `rise`: kept inside the view
 * (with `margin`) for the whole animation, so results on off-screen targets stay readable.
 */
export function floatTextStart(p: Pt, w: number, h: number, margin: number, textH: number, rise: number): Pt {
  return {
    x: Math.max(margin, Math.min(w - margin, p.x)),
    y: Math.max(margin + textH + rise, Math.min(h - margin, p.y)),
  };
}
