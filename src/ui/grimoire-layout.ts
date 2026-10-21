import { ELEMENT_ORDER, type SpellDef } from '../engine/types';

export interface GrimoireLayout {
  nodes: { spellId: string; x: number; y: number }[];
  edges: { from: string; to: string }[];
}

const RING_RADIUS = [0, 120, 185, 250];
const HYBRID_RADIUS = 215;
const SECTOR_DEG = 72;
const OFFSET_DEG = 14;

/** Screen-style polar: 0deg is up, angles grow clockwise, y points down. */
function polar(deg: number, r: number): { x: number; y: number } {
  const t = (deg * Math.PI) / 180;
  return { x: r * Math.sin(t), y: -r * Math.cos(t) };
}

function sectorOf(spell: SpellDef): { deg: number; r: number } {
  const idx = spell.elements.map((e) => ELEMENT_ORDER.indexOf(e));
  if (idx.length === 2) {
    const n = ELEMENT_ORDER.length;
    // the clockwise-earlier element is the one whose next sector is the other
    const first = (idx[0] + 1) % n === idx[1] ? idx[0] : idx[1];
    return { deg: first * SECTOR_DEG + SECTOR_DEG / 2, r: HYBRID_RADIUS };
  }
  const base = idx.length === 1 ? idx[0] * SECTOR_DEG : 0;
  return { deg: base + spell.grimoire.offset * OFFSET_DEG, r: RING_RADIUS[spell.grimoire.ring] };
}

export function layoutGrimoire(spells: SpellDef[]): GrimoireLayout {
  const nodes = spells.map((s) => {
    const { deg, r } = sectorOf(s);
    const { x, y } = polar(deg, r);
    return { spellId: s.id, x, y };
  });
  const edges = spells.flatMap((s) => s.prerequisites.map((from) => ({ from, to: s.id })));
  return { nodes, edges };
}
