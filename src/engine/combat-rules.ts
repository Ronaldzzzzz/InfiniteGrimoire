import type { ElementId } from './types';
import type { Monster } from './model';

export const OVERLEVEL_K = 0.5;
/** Damage = attack x DEFENSE_SCALE / (DEFENSE_SCALE + defense); attack, hp and defense were all scaled x10, so this went 100 -> 1000. */
export const DEFENSE_SCALE = 1000;

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

/**
 * Damage of one hit of `attack` (the spell's attack already scaled by the effect) on a monster; 0 means immune.
 * Frozen foes take x1.5, wet foes take x2 from thunder, bonusPct comes from passives.
 */
export function computeDamage(
  attack: number,
  spell: { tier: number; attack: number; elements: ElementId[] },
  monster: Monster,
  opts: { frozen: boolean; wetThunder: boolean; bonusPct: number },
): number {
  if (!canDamage(spell, monster)) return 0;
  const raw =
    ((attack * DEFENSE_SCALE) / (DEFENSE_SCALE + monster.defense)) *
    affinityMultiplier(spell.elements, monster.element) *
    (opts.frozen ? 1.5 : 1) *
    (opts.wetThunder ? 2 : 1) *
    (1 + opts.bonusPct / 100);
  return Math.max(1, Math.round(raw));
}
