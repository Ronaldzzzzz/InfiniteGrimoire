import { addItems, removeItems } from './inventory';
import { pickWeighted, type Rng } from './rng';
import { OVERLOAD_SPELL, type Content, type GameState, type Recipe, type SynthLogEntry } from './model';
import { craftedId, inputToken, resolveSpell } from './spells';
import { ITEM_ID_RE, type ItemId } from './types';

export const SYNTH_SLOTS = 2;

export type SynthResult =
  | { kind: 'learned'; spellId: string; crafted: boolean }
  | { kind: 'duplicate'; spellId: string; refunded: ItemId[] }
  | { kind: 'noReaction' }
  | { kind: 'dormant' }
  | { kind: 'overload'; spellId: typeof OVERLOAD_SPELL }
  | { kind: 'rejected'; reason: 'slots' | 'unknownInput' | 'insufficient' | 'grade' };

/** Element grade a result of this depth demands from its inputs and fusion cost. */
export const requiredGrade = (depth: number): number => Math.min(5, Math.max(1, depth));

export function comboKey(inputs: string[]): string {
  return [...inputs].sort().join('+');
}

const recipeIndexes = new WeakMap<Content, Map<string, Recipe>>();

function findRecipe(content: Content, key: string): Recipe | undefined {
  let index = recipeIndexes.get(content);
  if (!index) {
    index = new Map(content.recipes.map((r) => [comboKey(r.inputs), r]));
    recipeIndexes.set(content, index);
  }
  return index.get(key);
}

function logAttempt(state: GameState, key: string, resultKey: string, noReaction: boolean): GameState['synthesisLog'] {
  const prev: SynthLogEntry = Object.hasOwn(state.synthesisLog, key)
    ? state.synthesisLog[key]!
    : { attempts: 0, results: {}, noReaction: false };
  return {
    ...state.synthesisLog,
    [key]: {
      attempts: prev.attempts + 1,
      results: { ...prev.results, [resultKey]: (Object.hasOwn(prev.results, resultKey) ? prev.results[resultKey]! : 0) + 1 },
      noReaction: prev.noReaction || noReaction,
    },
  };
}

const isItem = (id: string) => ITEM_ID_RE.test(id) && !id.startsWith('key:');
const isElementItem = (id: string) => id.startsWith('el:');

export function synthesize(
  state: GameState,
  inputs: string[],
  content: Content,
  rng: Rng,
  opts: { depthCap: number },
): { state: GameState; result: SynthResult } {
  const unchanged = (result: SynthResult) => ({ state, result });
  if (!Array.isArray(inputs) || inputs.length !== SYNTH_SLOTS) return unchanged({ kind: 'rejected', reason: 'slots' });
  for (const id of inputs) {
    if (typeof id !== 'string') return unchanged({ kind: 'rejected', reason: 'unknownInput' });
    if (!isItem(id) && !state.learned.includes(id)) return unchanged({ kind: 'rejected', reason: 'unknownInput' });
  }
  const items = [...inputs].sort().filter(isItem);
  const removed = removeItems(state.inventory, items);
  if (!removed) return unchanged({ kind: 'rejected', reason: 'insufficient' });

  const key = comboKey(inputs);
  const first = items[0]; // undefined when both inputs are spells
  const fused = !inputs.some(isElementItem);

  /** Fusion cost of a result spell: one element item per element, at the grade its depth demands. */
  const fusionCost = (elements: string[], depth: number): ItemId[] =>
    fused ? elements.map((e) => `el:${e}:${requiredGrade(depth)}`) : [];

  const recipe = findRecipe(content, key);
  let namedId: string | null = null;
  if (recipe) {
    const eligible = recipe.outcomes
      .filter((o) => o.spellId === null || (content.spells[o.spellId]?.prerequisites ?? []).every((p) => state.learned.includes(p)))
      .map((o) => ({ value: o.spellId, weight: o.weight }));
    if (eligible.length === 0) return unchanged({ kind: 'dormant' });
    namedId = pickWeighted(rng, eligible);
  } else if (items.length === SYNTH_SLOTS) {
    return {
      state: { ...state, synthesisLog: logAttempt(state, key, 'none', true) },
      result: { kind: 'noReaction' },
    };
  }

  if (namedId !== null) {
    const spell = content.spells[namedId]!;
    const synthesisLog = logAttempt(state, key, namedId, false);
    if (state.learned.includes(namedId)) {
      return {
        state: { ...state, inventory: first ? addItems(removed, [first]) : removed, synthesisLog },
        result: { kind: 'duplicate', spellId: namedId, refunded: first ? [first] : [] },
      };
    }
    const paid = removeItems(removed, fusionCost(spell.elements, spell.depth));
    if (!paid) return unchanged({ kind: 'rejected', reason: 'insufficient' });
    return {
      state: { ...state, inventory: paid, learned: [...state.learned, namedId], synthesisLog },
      result: { kind: 'learned', spellId: namedId, crafted: false },
    };
  }

  // Crafted spell.
  const ta = inputToken(inputs[0]!, content), tb = inputToken(inputs[1]!, content);
  if (ta === null || tb === null) return unchanged({ kind: 'rejected', reason: 'unknownInput' });
  const id = craftedId(ta, tb);
  const spell = resolveSpell(id, content);
  if (!spell) return unchanged({ kind: 'rejected', reason: 'unknownInput' });

  const need = requiredGrade(spell.depth);
  if (items.some((it) => isElementItem(it) && Number(it.split(':')[2]) < need)) {
    return unchanged({ kind: 'rejected', reason: 'grade' });
  }
  const cost = fusionCost(spell.elements, spell.depth);
  const paid = removeItems(removed, cost);
  if (!paid) return unchanged({ kind: 'rejected', reason: 'insufficient' });
  const spent = [...items, ...cost];

  const overload = spell.depth > opts.depthCap;
  const resultId = overload ? OVERLOAD_SPELL : id;
  const synthesisLog = logAttempt(state, key, overload ? 'overload' : id, false);
  if (state.learned.includes(resultId)) {
    return {
      state: { ...state, synthesisLog },
      result: { kind: 'duplicate', spellId: resultId, refunded: spent },
    };
  }
  const next = { ...state, inventory: paid, learned: [...state.learned, resultId], synthesisLog };
  return overload
    ? { state: next, result: { kind: 'overload', spellId: OVERLOAD_SPELL } }
    : { state: next, result: { kind: 'learned', spellId: id, crafted: true } };
}
