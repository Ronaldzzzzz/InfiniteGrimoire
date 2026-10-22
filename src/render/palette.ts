import type { ElementId } from '../engine/types';

export const COLORS: { bg: string; rune: string; amber: string; element: Record<ElementId | 'none', string> } = {
  bg: '#0d0f14',
  rune: '#8fd16a',
  amber: '#e8b84a',
  element: {
    fire: '#e2643b',
    wind: '#7fd0c0',
    thunder: '#f3e36b',
    earth: '#c79a5a',
    water: '#5aa0e8',
    none: '#b8c7ff',
  },
};

/** Spell effect colour: the first element's colour, or the neutral colour for element-less spells. */
export function spellColor(spell: { elements: readonly ElementId[] }): string {
  const first = spell.elements[0];
  return first ? COLORS.element[first] : COLORS.element.none;
}
