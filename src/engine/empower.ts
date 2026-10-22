import { elementItem } from './types';
import type { ItemId } from './types';
import { removeItems } from './inventory';
import { MAX_SPELL_LEVEL, resolveSpell } from './spells';
import type { Content, GameState, Spell } from './model';

/** Cost of raising a spell from `level` to level+1: 4..22 units of the grade that matches the level band, per element. */
export function empowerCost(spell: Spell, level: number): ItemId[] {
  const grade = 1 + Math.floor((level - 1) / 10);
  const n = 4 + 2 * ((level - 1) % 10);
  const out: ItemId[] = [];
  for (const e of spell.elements) for (let i = 0; i < n; i++) out.push(elementItem(e, grade));
  return out;
}

export type EmpowerResult =
  | { kind: 'empowered'; level: number }
  | { kind: 'rejected'; reason: 'notLearned' | 'maxLevel' | 'noElements' | 'insufficient' };

export function empower(state: GameState, spellId: string, content: Content): { state: GameState; result: EmpowerResult } {
  const reject = (reason: 'notLearned' | 'maxLevel' | 'noElements' | 'insufficient') => ({ state, result: { kind: 'rejected', reason } as const });
  if (!state.learned.includes(spellId)) return reject('notLearned');
  const spell = resolveSpell(spellId, content);
  if (!spell) return reject('notLearned');
  const level = Object.hasOwn(state.levels, spellId) ? state.levels[spellId]! : 1;
  if (level >= MAX_SPELL_LEVEL) return reject('maxLevel');
  if (spell.elements.length === 0) return reject('noElements');
  const inventory = removeItems(state.inventory, empowerCost(spell, level));
  if (!inventory) return reject('insufficient');
  return { state: { ...state, inventory, levels: { ...state.levels, [spellId]: level + 1 } }, result: { kind: 'empowered', level: level + 1 } };
}
