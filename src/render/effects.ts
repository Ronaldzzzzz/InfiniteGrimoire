import type { Rng } from '../engine/rng';

export interface Pt {
  x: number;
  y: number;
}

/** Lightning-style polyline from `from` to `to` with `segments` segments (segments + 1 points); endpoints are exact. */
export function jaggedPath(from: Pt, to: Pt, segments: number, rng: Rng): Pt[] {
  const n = Math.max(1, Math.floor(segments));
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const amp = Math.min(14, len / 6);
  const pts: Pt[] = [{ x: from.x, y: from.y }];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const off = (rng.next() * 2 - 1) * amp;
    pts.push({ x: from.x + dx * t + nx * off, y: from.y + dy * t + ny * off });
  }
  pts.push({ x: to.x, y: to.y });
  return pts;
}

export function floatingText(hit: { damage: number; immune: boolean }): { text: string; color: string } {
  if (hit.immune) return { text: '無效', color: '#9aa3b2' };
  return { text: String(Math.round(hit.damage)), color: '#ffffff' };
}

/** Points along an ellipse (radii rx, ry) rotated by `rot` around `c`, from angle a0 to a1 (segments + 1 points). */
export function ellipseArc(c: Pt, rx: number, ry: number, rot: number, a0: number, a1: number, segments: number): Pt[] {
  const n = Math.max(1, Math.floor(segments));
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    const x = Math.cos(t) * rx;
    const y = Math.sin(t) * ry;
    pts.push({ x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos });
  }
  return pts;
}
