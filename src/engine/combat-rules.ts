import type { ElementId, MonsterDef, SpellDef } from './types';

export const OVERLEVEL_K = 0.5;

/** element -> the element it counters */
const COUNTERS: Record<ElementId, ElementId> = {
  water: 'fire',
  fire: 'wind',
  wind: 'earth',
  earth: 'thunder',
  thunder: 'water',
};

export function canDamage(spell: { tier: number; attack: number }, monster: { tier: number; defense: number }): boolean {
  return spell.tier >= monster.tier - 1 || spell.attack >= monster.defense * 0.7;
}

export function overlevelEfficiency(spellTier: number, monsterTier: number, k: number = OVERLEVEL_K): number {
  const d = spellTier - monsterTier;
  if (d < 2) return 1;
  return 0.5 + 0.5 * Math.pow(k, d - 1);
}

export function affinityMultiplier(spellElements: ElementId[], monsterElement: ElementId): number {
  if (spellElements.some((e) => COUNTERS[e] === monsterElement)) return 1.1;
  if (spellElements.some((e) => COUNTERS[monsterElement] === e)) return 0.9;
  return 1;
}

/** Damage of one hit; 0 means the monster is immune. */
export function computeHit(spell: SpellDef, monster: MonsterDef, opts: { frozen: boolean }): number {
  if (!canDamage(spell, monster)) return 0;
  const raw =
    ((spell.attack * 100) / (100 + monster.defense)) *
    affinityMultiplier(spell.elements, monster.element) *
    (opts.frozen ? 1.15 : 1);
  return Math.max(1, Math.round(raw));
}
