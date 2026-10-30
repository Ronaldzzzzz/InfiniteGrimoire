import { parseCanonical } from '../engine/circle';
import type { Content, Passive, Spell } from '../engine/model';
import { ELEMENT_ORDER } from '../engine/types';
import type { ElementId } from '../engine/types';

/**
 * The grimoire star map (spec 2026-10-30 section 2.8, option A 五元素星域), pure geometry.
 * Five sectors of 72° in ELEMENT_ORDER (火 at the top right, clockwise 風 雷 土 水); the farther from the centre the higher
 * the tier. Screen-style polar: 0° is up, angles grow clockwise, y points down.
 */
export interface Pt { x: number; y: number }
export interface Star extends Pt { angle: number; radius: number }

export const SECTOR_DEG = 72;
/** Radius of the Lv.1 ring and the step per tier (one step = the minimum star distance, so tiers never crowd each other). */
export const TIER_R0 = 110;
export const TIER_STEP_R = 40;
/** Passives sit on a ring inside the Lv.1 ring. */
export const PASSIVE_R = 60;
/** Two stars (or a star and a passive) are never closer than this. */
export const MIN_STAR_DIST = 40;
/** Deterministic per-spell spread inside a sector, so equal-tier stars do not all line up on the sector's centre. */
const JITTER_DEG = 10;
/** How far along its ring a crowded star may slide before it moves outwards (half a sector). */
const MAX_SLIDE_DEG = SECTOR_DEG / 2;

export function polar(deg: number, r: number): Pt {
  const t = (deg * Math.PI) / 180;
  return { x: r * Math.sin(t), y: -r * Math.cos(t) };
}

const norm = (deg: number) => ((deg % 360) + 360) % 360;

/** Centre angle of an element's sector. */
export const sectorAngle = (e: ElementId): number => SECTOR_DEG / 2 + SECTOR_DEG * ELEMENT_ORDER.indexOf(e);

export const tierRadius = (tier: number): number => TIER_R0 + TIER_STEP_R * (Math.max(1, tier) - 1);

/** FNV-1a of the id, in [0, 1). */
function unit(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 2 ** 32;
}

/**
 * Where a spell's star belongs: the (circular) mean angle of its elements' sectors plus a small deterministic spread,
 * at its tier's radius. A spell with no element (魔力彈) sits at the centre; one whose elements cancel out (all five)
 * falls back to its main element's sector.
 */
export function starPosition(spell: Spell): { angle: number; radius: number } {
  const els = [...new Set(spell.elements)];
  if (els.length === 0) return { angle: 0, radius: 0 };
  let sx = 0, sy = 0;
  for (const e of els) {
    const t = (sectorAngle(e) * Math.PI) / 180;
    sx += Math.sin(t);
    sy += Math.cos(t);
  }
  const base = Math.hypot(sx, sy) / els.length < 0.2 ? sectorAngle(els[0]!) : (Math.atan2(sx, sy) * 180) / Math.PI;
  return { angle: norm(base + (unit(spell.id) * 2 - 1) * JITTER_DEG), radius: tierRadius(spell.tier) };
}

const fits = (p: Pt, placed: Pt[]) => placed.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= MIN_STAR_DIST - 1e-9);

/**
 * Stars for the learned spells, in learning order: each takes its `starPosition` or, when that is too close to a star
 * already drawn (or an obstacle such as a passive), the nearest free spot sliding along its ring, then further out.
 * Earlier stars never move, so learning a spell only adds a star.
 */
export function layoutStars(spells: Spell[], obstacles: Pt[] = []): Map<string, Star> {
  const placed: Pt[] = [...obstacles];
  const out = new Map<string, Star>();
  for (const s of spells) {
    if (out.has(s.id)) continue;
    const home = starPosition(s);
    const maxSlide = home.radius === 0 ? 180 : MAX_SLIDE_DEG;
    let star: Star | null = null;
    for (let k = 0; !star; k++) {
      const radius = home.radius + (k * MIN_STAR_DIST) / 2;
      if (radius === 0) {
        if (fits({ x: 0, y: 0 }, placed)) star = { x: 0, y: 0, angle: 0, radius: 0 };
        continue;
      }
      const step = Math.min(maxSlide, (2 * Math.asin(Math.min(1, MIN_STAR_DIST / (2 * radius))) * 180) / Math.PI);
      for (let i = 0; !star && i * step <= maxSlide; i++) {
        for (const sign of i === 0 ? [1] : [1, -1]) {
          const angle = norm(home.angle + sign * i * step);
          const p = polar(angle, radius);
          if (fits(p, placed)) {
            star = { ...p, angle, radius };
            break;
          }
        }
      }
    }
    placed.push(star);
    out.set(s.id, star);
  }
  return out;
}

/** Passives still drawn: those whose only bonus is the retired depth cap do nothing any more. */
export function visiblePassives(content: Content): Passive[] {
  return Object.values(content.passives).filter((p) => p.bonus.kind !== 'depth');
}

/** Passives evenly around the inner ring, in the order of their old tree angle (so each stays near its element). */
export function layoutPassives(passives: Passive[]): Map<string, Pt> {
  const sorted = [...passives].sort((a, b) => a.node.angle - b.node.angle || a.id.localeCompare(b.id));
  return new Map(sorted.map((p, i) => [p.id, polar(sorted.length === 1 ? 0 : (360 * i) / sorted.length + SECTOR_DEG / 4, PASSIVE_R)]));
}

/** The node elements of a learned spell per ring (its own circle; a named or rare id uses the circle it names). */
function ringElements(id: string, content: Content): [Set<ElementId>, Set<ElementId>] | null {
  const named = Object.hasOwn(content.spells, id) ? content.spells[id] : undefined;
  const c = parseCanonical(named ? named.circle ?? '' : id);
  if (!c) return null;
  const set = (r: (ElementId | null)[]) => new Set(r.filter((e): e is ElementId => e !== null));
  return [set(c.ring1), set(c.ring2)];
}

/** Lines of the star map: every pair of spells with a node element in common on the same ring. */
export function starEdges(ids: string[], content: Content): [string, string][] {
  const rings = ids.map((id) => [id, ringElements(id, content)] as const).filter((x) => x[1] !== null);
  const out: [string, string][] = [];
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const a = rings[i]![1]!, b = rings[j]![1]!;
      if ([0, 1].some((r) => [...a[r]!].some((e) => b[r]!.has(e)))) out.push([rings[i]![0], rings[j]![0]]);
    }
  }
  return out;
}
