import { addItems, removeItems } from './inventory';
import { pickWeighted, type Rng } from './rng';
import type { GameState, SynthLogEntry } from './state';
import type { GameData, ItemId, RecipeDef } from './types';

export const SYNTH_SLOTS = 2;

export type SynthResult =
  | { kind: 'learned'; spellId: string }
  | { kind: 'duplicate'; spellId: string; refunded: ItemId[] }
  | { kind: 'noReaction'; consumed: ItemId[] }
  | { kind: 'knownNoReaction' }
  | { kind: 'dormant' }
  | { kind: 'rejected'; reason: 'slots' | 'insufficient' };

export function comboKey(inputs: ItemId[]): string {
  return [...inputs].sort().join('+');
}

const recipeIndexes = new WeakMap<GameData, Map<string, RecipeDef>>();

function findRecipe(data: GameData, key: string): RecipeDef | undefined {
  let index = recipeIndexes.get(data);
  if (!index) {
    index = new Map(data.recipes.map((r) => [comboKey(r.inputs), r]));
    recipeIndexes.set(data, index);
  }
  return index.get(key);
}

function logAttempt(state: GameState, key: string, resultKey: string, noReaction: boolean): GameState['synthesisLog'] {
  const prev: SynthLogEntry = state.synthesisLog[key] ?? { attempts: 0, results: {}, noReaction: false };
  return {
    ...state.synthesisLog,
    [key]: {
      attempts: prev.attempts + 1,
      results: { ...prev.results, [resultKey]: (prev.results[resultKey] ?? 0) + 1 },
      noReaction: prev.noReaction || noReaction,
    },
  };
}

export function synthesize(
  state: GameState,
  inputs: ItemId[],
  data: GameData,
  rng: Rng,
): { state: GameState; result: SynthResult } {
  const unchanged = (result: SynthResult) => ({ state, result });
  if (inputs.length !== SYNTH_SLOTS) return unchanged({ kind: 'rejected', reason: 'slots' });
  const removed = removeItems(state.inventory, inputs);
  if (!removed) return unchanged({ kind: 'rejected', reason: 'insufficient' });

  const key = comboKey(inputs);
  const first = [...inputs].sort()[0]!;
  const recipe = findRecipe(data, key);

  if (!recipe) {
    if (state.synthesisLog[key]?.noReaction) return unchanged({ kind: 'knownNoReaction' });
    const inventory = removeItems(state.inventory, [first])!;
    return {
      state: { ...state, inventory, synthesisLog: logAttempt(state, key, 'none', true) },
      result: { kind: 'noReaction', consumed: [first] },
    };
  }

  const eligible = recipe.outcomes
    .filter((o) => (data.spells[o.spellId]?.prerequisites ?? []).every((p) => state.learned.includes(p)))
    .map((o) => ({ value: o.spellId, weight: o.weight }));
  if (eligible.length === 0) return unchanged({ kind: 'dormant' });

  const spellId = pickWeighted(rng, eligible);
  const synthesisLog = logAttempt(state, key, spellId, false);
  if (state.learned.includes(spellId)) {
    return {
      state: { ...state, inventory: addItems(removed, [first]), synthesisLog },
      result: { kind: 'duplicate', spellId, refunded: [first] },
    };
  }
  return {
    state: { ...state, inventory: removed, learned: [...state.learned, spellId], synthesisLog },
    result: { kind: 'learned', spellId },
  };
}
