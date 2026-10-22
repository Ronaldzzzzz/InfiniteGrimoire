import type { NamedSpellDef, Passive, TreeNode, TreeRegion } from '../engine/model';

export interface GrimoireNode { id: string; kind: 'spell' | 'passive'; region: string; x: number; y: number }
/** A fogged region drawn as the ring band its nodes sit in (radii in SVG units). */
export interface FogBand { region: string; inner: number; outer: number }

export interface GrimoireLayout {
  nodes: GrimoireNode[];
  edges: { from: string; to: string }[];
  fog: FogBand[];
}

const RING_RADIUS = [0, 120, 185, 250];
const OUTER_RING_STEP = 65;

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
  const shown = spells.filter((s) => s.node !== null && visible.has(s.node.region));
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
  const all = [...spells.flatMap((s) => (s.node ? [s.node] : [])), ...passives.map((p) => p.node)];
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
