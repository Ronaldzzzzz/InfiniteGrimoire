import type { NamedSpellDef, Passive, TreeNode, TreeRegion } from '../engine/model';

export interface GrimoireNode { id: string; kind: 'spell' | 'passive'; region: string; x: number; y: number }
/** A fogged region drawn as the ring band its nodes sit in (radii in SVG units). */
export interface FogBand { region: string; inner: number; outer: number }

export interface GrimoireLayout {
  nodes: GrimoireNode[];
  edges: { from: string; to: string }[];
  fog: FogBand[];
}

/**
 * Rings 0-9 (ring = tier - 1). The step shrinks from 65 to 35 towards the rim so the ten rings still fit
 * the home view (ring 9 at 550 -> base size 1200); every step stays above 2 x the node radius (16).
 */
const RING_RADIUS = [0, 120, 185, 250, 315, 380, 430, 475, 515, 550];
const OUTER_RING_STEP = 35;
/** Light/dark tree: one column per ring, light to the left of the emblem and dark to the right. */
export const COLUMN_STEP = 60;
export const ROW_STEP = 48;

/** Screen-style polar: 0deg is up, angles grow clockwise, y points down. */
export function polar(deg: number, r: number): { x: number; y: number } {
  const t = (deg * Math.PI) / 180;
  return { x: r * Math.sin(t), y: -r * Math.cos(t) };
}

export const ringRadius = (ring: number): number =>
  RING_RADIUS[ring] ?? RING_RADIUS[RING_RADIUS.length - 1]! + (ring - RING_RADIUS.length + 1) * OUTER_RING_STEP;

/** Half-way between two rings, so neighbouring bands meet without overlapping. */
const between = (ring: number): number => (ringRadius(ring) + ringRadius(ring + 1)) / 2;

/**
 * Named spells and passives placed by their tree node (ring, angle). Spells without a node and nodes in
 * regions the player can't see yet (fog) are left out, and so are edges to them; each fogged region
 * gets a band instead, spanning the rings its nodes use.
 */
export function layoutGrimoire(
  spells: NamedSpellDef[],
  visible: ReadonlySet<string>,
  passives: Passive[] = [],
  regions: TreeRegion[] = [],
): GrimoireLayout {
  const shown = spells.filter((s) => s.node !== null && s.node.tree !== 'lightdark' && visible.has(s.node.region));
  const ids = new Set(shown.map((s) => s.id));
  const place = (id: string, kind: GrimoireNode['kind'], n: TreeNode): GrimoireNode => ({
    id, kind, region: n.region, ...polar(n.angle, ringRadius(n.ring)),
  });
  const nodes = [
    ...shown.map((s) => place(s.id, 'spell', s.node!)),
    ...passives.filter((p) => visible.has(p.node.region)).map((p) => place(p.id, 'passive', p.node)),
  ];
  const edges = shown.flatMap((s) => s.prerequisites.filter((from) => ids.has(from)).map((from) => ({ from, to: s.id })));

  const rings = new Map<string, { min: number; max: number }>();
  const all = [...spells.flatMap((s) => (s.node && s.node.tree !== 'lightdark' ? [s.node] : [])), ...passives.map((p) => p.node)];
  for (const n of all) {
    const r = rings.get(n.region);
    rings.set(n.region, r ? { min: Math.min(r.min, n.ring), max: Math.max(r.max, n.ring) } : { min: n.ring, max: n.ring });
  }
  const fog = [...regions]
    .sort((a, b) => a.order - b.order)
    .filter((r) => !visible.has(r.id) && rings.has(r.id))
    .map((r) => {
      const { min, max } = rings.get(r.id)!;
      return { region: r.id, inner: min === 0 ? 0 : between(min - 1), outer: between(max) };
    });
  return { nodes, edges, fog };
}

/**
 * The light/dark tree: spells with `tree: 'lightdark'` in columns left (light) and right (dark) of the
 * central emblem, one column per ring. A fogged region is a vertical band; `inner`/`outer` are half-widths in x.
 */
export function layoutLightDark(
  spells: NamedSpellDef[],
  visible: ReadonlySet<string>,
  regions: TreeRegion[] = [],
): GrimoireLayout {
  const own = spells.filter((s) => s.node?.tree === 'lightdark');
  const shown = own.filter((s) => visible.has(s.node!.region));
  const column = (n: TreeNode) => `${n.side}:${n.ring}`;
  const counts = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const s of shown) counts.set(column(s.node!), (counts.get(column(s.node!)) ?? 0) + 1);
  const nodes: GrimoireNode[] = shown.map((s) => {
    const n = s.node!;
    const k = column(n);
    const i = seen.get(k) ?? 0;
    seen.set(k, i + 1);
    return {
      id: s.id, kind: 'spell', region: n.region,
      x: (n.side === 'light' ? -1 : 1) * COLUMN_STEP * n.ring,
      y: (i - (counts.get(k)! - 1) / 2) * ROW_STEP,
    };
  });
  const ids = new Set(shown.map((s) => s.id));
  const edges = shown.flatMap((s) => s.prerequisites.filter((from) => ids.has(from)).map((from) => ({ from, to: s.id })));
  const rings = new Map<string, { min: number; max: number }>();
  for (const s of own) {
    const n = s.node!;
    const r = rings.get(n.region);
    rings.set(n.region, r ? { min: Math.min(r.min, n.ring), max: Math.max(r.max, n.ring) } : { min: n.ring, max: n.ring });
  }
  const fog = [...regions]
    .sort((a, b) => a.order - b.order)
    .filter((r) => !visible.has(r.id) && rings.has(r.id))
    .map((r) => {
      const { min, max } = rings.get(r.id)!;
      return { region: r.id, inner: Math.max(0, (min - 0.5) * COLUMN_STEP), outer: (max + 0.5) * COLUMN_STEP };
    });
  return { nodes, edges, fog };
}
