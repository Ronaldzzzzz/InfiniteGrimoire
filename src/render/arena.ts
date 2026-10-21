import type { Rng } from '../engine/rng';
import type { Pt } from './effects';

/** The engine's stop distance (MonsterInstance.x); the view maps x ∈ [0.15, 1] onto [stop ring, arena edge]. */
export const ENGINE_STOP_X = 0.15;
export const STOP_GAP = 6;
export const MIN_SEPARATION = (25 * Math.PI) / 180;
const TAU = Math.PI * 2;

export interface Arena {
  center: Pt;
  radius: number;
  w: number;
  h: number;
}

/**
 * A true circle centred on the view. Its radius is the half-diagonal of the view grown by one monster radius
 * (+1px for rounding), so a monster at x = 1 is fully off-screen in every direction.
 */
export function makeArena(w: number, h: number, maxMonsterR: number): Arena {
  return { center: { x: w / 2, y: h / 2 }, radius: Math.hypot(w / 2 + maxMonsterR, h / 2 + maxMonsterR) + 1, w, h };
}

/**
 * Where a monster of visual radius `monsterR` stops. Never overlaps the hero; stays fully visible when the
 * view leaves room for that (otherwise not overlapping the hero wins).
 */
export function stopRadius(a: Arena, heroR: number, monsterR: number): number {
  const lo = heroR + monsterR + STOP_GAP;
  const hi = Math.min(a.w, a.h) / 2 - monsterR;
  return Math.max(lo, Math.min(hi, ENGINE_STOP_X * a.radius));
}

export function monsterDistance(a: Arena, stop: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - ENGINE_STOP_X) / (1 - ENGINE_STOP_X)));
  return stop + t * (a.radius - stop);
}

export function polarPoint(a: Arena, angle: number, dist: number): Pt {
  return { x: a.center.x + Math.cos(angle) * dist, y: a.center.y + Math.sin(angle) * dist };
}

export function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU;
  return Math.min(d, TAU - d);
}

const minGap = (c: number, existing: number[]): number =>
  existing.reduce((m, e) => Math.min(m, angleGap(c, e)), Number.POSITIVE_INFINITY);

/** Random angle at least MIN_SEPARATION away from `existing`; after `tries` misses, the widest gap found. */
export function pickSpawnAngle(existing: number[], rng: Rng, tries = 12): number {
  let best = rng.next() * TAU;
  let bestGap = minGap(best, existing);
  for (let i = 1; i < tries && bestGap < MIN_SEPARATION; i++) {
    const c = rng.next() * TAU;
    const g = minGap(c, existing);
    if (g > bestGap) {
      best = c;
      bestGap = g;
    }
  }
  return best;
}

export function clampToView(p: Pt, w: number, h: number, margin: number): Pt {
  return {
    x: Math.max(margin, Math.min(w - margin, p.x)),
    y: Math.max(margin, Math.min(h - margin, p.y)),
  };
}
