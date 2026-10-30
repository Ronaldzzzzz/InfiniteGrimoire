import { parseCanonical, RUNE_NAMES } from '../../engine/circle';
import { RARE_CHANCE } from '../../engine/circle-synth';
import type { Content } from '../../engine/model';
import type { ElementId } from '../../engine/types';
import { ELEMENT_NAMES } from '../messages';

/** One textbook circle: the named spell, the circle it names (or, for a rare spell, rolls from) and the chance. */
export type CircleRow = { id: string; name: string; tier: number; circle: string; layout: string; pct: number; rare: boolean; elements: ElementId[] };

const ring = (xs: (ElementId | null)[]) => {
  const names = xs.filter((x): x is ElementId => x !== null).map((e) => ELEMENT_NAMES[e]);
  return names.length > 0 ? names.join('・') : '—';
};

/** 「核心火｜一環 火・風｜二環 —｜射」: a canonical circle id in words. */
export function circleLabel(id: string): string {
  const c = parseCanonical(id);
  if (!c) return id;
  return `核心${ELEMENT_NAMES[c.core]}｜一環 ${ring(c.ring1)}｜二環 ${ring(c.ring2)}｜${RUNE_NAMES[c.form]}`;
}

/** Every named spell that has a circle, by tier: an ordinary one is learned every time the circle succeeds, a rare one RARE_CHANCE of the time. */
export function circleTable(content: Content): CircleRow[] {
  return Object.values(content.spells)
    .filter((s) => s.circle)
    .map((s) => ({
      id: s.id, name: s.name, tier: s.tier, circle: s.circle!, layout: circleLabel(s.circle!),
      pct: s.rare ? Math.round(RARE_CHANCE * 1000) / 10 : 100, rare: s.rare === true, elements: [...s.elements],
    }))
    .sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : 1));
}
