import type { Pt } from './effects';

export interface Arena {
  center: Pt;
  /** screen pixels per engine arena unit (the engine's arena is the unit circle around the mage) */
  radius: number;
  w: number;
  h: number;
}

/**
 * A true circle centred on the view. Its radius makes a foe of arena radius `maxFoeR` standing on the edge
 * (distance 1) clear the half-diagonal of the view (+1px for rounding), so spawns are fully off-screen in
 * every direction.
 */
export function makeArena(w: number, h: number, maxFoeR: number): Arena {
  const reach = Math.hypot(w / 2, h / 2) + 1;
  return { center: { x: w / 2, y: h / 2 }, radius: reach / (1 - Math.min(0.5, Math.max(0, maxFoeR))), w, h };
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
