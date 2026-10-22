import type { NamedSpellDef } from '../engine/model';

export interface GrimoireLayout {
  nodes: { spellId: string; x: number; y: number }[];
  edges: { from: string; to: string }[];
}

const RING_RADIUS = [0, 120, 185, 250];
const OUTER_RING_STEP = 65;

/** Screen-style polar: 0deg is up, angles grow clockwise, y points down. */
function polar(deg: number, r: number): { x: number; y: number } {
  const t = (deg * Math.PI) / 180;
  return { x: r * Math.sin(t), y: -r * Math.cos(t) };
}

const ringRadius = (ring: number): number =>
  RING_RADIUS[ring] ?? RING_RADIUS[RING_RADIUS.length - 1]! + (ring - RING_RADIUS.length + 1) * OUTER_RING_STEP;

/**
 * Named spells placed by their tree node (ring, angle). Spells without a node and spells in regions the
 * player can't see yet (fog) are left out, and so are edges to them.
 */
export function layoutGrimoire(spells: NamedSpellDef[], visible: ReadonlySet<string>): GrimoireLayout {
  const shown = spells.filter((s) => s.node !== null && visible.has(s.node.region));
  const ids = new Set(shown.map((s) => s.id));
  const nodes = shown.map((s) => ({ spellId: s.id, ...polar(s.node!.angle, ringRadius(s.node!.ring)) }));
  const edges = shown.flatMap((s) => s.prerequisites.filter((from) => ids.has(from)).map((from) => ({ from, to: s.id })));
  return { nodes, edges };
}
