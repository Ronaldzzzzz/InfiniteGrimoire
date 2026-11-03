import type { ElementId } from '../engine/types';

/**
 * SVG geometry of the magic circle parchment (pure). The parchment's viewBox is VIEW x VIEW with the core at the centre;
 * ring 1 holds the 5 pentagram slots, ring-2 slot j sits on the same ray as ring-1 slot j, further out.
 */
export const VIEW = 240;
export const CENTER = VIEW / 2;
/** Radius of ring 1 (the pentagram's points) and ring 2. */
export const RING_R = [62, 100] as const;
/** Radius of the injection progress ring, just outside ring 2. */
export const PROGRESS_R = 114;
export const SLOT_COUNT = 5;

export interface Pt { x: number; y: number }

const round = (v: number) => Math.round(v * 100) / 100;

/** Point at `radius` on the ray of slot j (slot 0 at the top, clockwise every 72°). */
export function rayPoint(j: number, radius: number): Pt {
  const a = -Math.PI / 2 + (2 * Math.PI * j) / SLOT_COUNT;
  return { x: round(CENTER + radius * Math.cos(a)), y: round(CENTER + radius * Math.sin(a)) };
}

/** Centre of slot j on ring 1 (ring = 0) or ring 2 (ring = 1). */
export function slotPoint(ring: 0 | 1, j: number): Pt {
  return rayPoint(j, RING_R[ring]);
}

/** The 5 pentagram points (ring-1 slots). */
export function pentagramPoints(): Pt[] {
  return [0, 1, 2, 3, 4].map((j) => slotPoint(0, j));
}

/** Ring-1 pairs on the circle (neighbours, 相生) and on the star lines (i, i+2: 相剋). */
export const CIRCLE_PAIRS: [number, number][] = [0, 1, 2, 3, 4].map((i) => [i, (i + 1) % SLOT_COUNT]);
export const STAR_PAIRS: [number, number][] = [0, 1, 2, 3, 4].map((i) => [i, (i + 2) % SLOT_COUNT]);

/** The star drawn as one closed path (0 → 2 → 4 → 1 → 3 → 0). */
export function starPath(): string {
  const p = pentagramPoints();
  return [0, 2, 4, 1, 3].map((i, k) => `${k === 0 ? 'M' : 'L'}${p[i]!.x} ${p[i]!.y}`).join(' ') + ' Z';
}

/** Circumference of a circle of radius r (the progress ring's dasharray). */
export function circumference(r: number): number {
  return round(2 * Math.PI * r);
}

/** `n` spark positions evenly around the progress ring, starting at the top. */
export function sparkPoints(n: number, radius = PROGRESS_R): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: round(CENTER + radius * Math.cos(a)), y: round(CENTER + radius * Math.sin(a)) };
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** How many slots of ring 1 and ring 2 are open at a tier (only the unlocked tier, never the core: nothing jumps when the core changes). */
export function openSlotCounts(unlockedTier: number): [ring1: number, ring2: number] {
  return [clamp(unlockedTier - 1, 0, 5), clamp(unlockedTier - 6, 0, 4)];
}

/** Ring-2 rule slots drawn by default for an open count (symmetric about the vertical axis, on ring 1's star rays). */
export const RING2_DEFAULT: Record<1 | 2 | 3 | 4, number[]> = { 1: [0], 2: [1, 4], 3: [0, 2, 3], 4: [1, 2, 3, 4] };

/** The rule slot indices drawn for a ring: the default ones for `open` plus any already filled (a loaded circle), ascending. */
export function shownSlots(ring: 0 | 1, open: number, filled: number[]): number[] {
  const base = ring === 0
    ? Array.from({ length: open }, (_, i) => i)
    : open >= 1 ? RING2_DEFAULT[Math.min(open, 4) as 1 | 2 | 3 | 4] : [];
  return [...new Set([...base, ...filled])].sort((a, b) => a - b);
}

/** Centre of rule slot j: ring 1 spreads its shown slots evenly from the top clockwise; ring 2 stays on its ray. */
export function shownPoint(ring: 0 | 1, j: number, shown: number[]): Pt {
  if (ring === 1) return rayPoint(j, RING_R[1]);
  const k = Math.max(0, shown.indexOf(j));
  const a = -Math.PI / 2 + (2 * Math.PI * k) / Math.max(1, shown.length);
  return { x: round(CENTER + RING_R[0] * Math.cos(a)), y: round(CENTER + RING_R[0] * Math.sin(a)) };
}


/** The 相生 circle in the order an element wheel lays them out (water → earth → fire → thunder → wind). */
export const WHEEL_ORDER: ElementId[] = ['water', 'earth', 'fire', 'thunder', 'wind'];
/** Radius of a picker wheel, in viewBox units (placeholder). */
export const WHEEL_R = 34;

/** `n` points evenly around `center` at `radius`, the first straight above, clockwise. */
export function wheelPoints(n: number, center: Pt, radius: number): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: round(center.x + radius * Math.cos(a)), y: round(center.y + radius * Math.sin(a)) };
  });
}

/** The wheel's centre for a tapped slot: pushed inwards so the whole wheel stays on the sheet. */
export function wheelCenter(p: Pt, radius: number): Pt {
  return { x: clamp(p.x, radius, VIEW - radius), y: clamp(p.y, radius, VIEW - radius) };
}
