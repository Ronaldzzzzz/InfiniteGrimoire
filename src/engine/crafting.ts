import { addItems, removeItems } from './inventory';
import { pickWeighted, type Rng } from './rng';
import { OVERLOAD_SPELL, type Content, type GameState, type Recipe, type SynthLogEntry } from './model';
import { craftedId, inputToken, resolveSpell } from './spells';
import { ITEM_ID_RE, type ItemId } from './types';

export const SYNTH_SLOTS = 2;

export type SynthResult =
  | { kind: 'learned'; spellId: string; crafted: boolean; /** Filled by the worker for rare spells only. */ rare?: { first: boolean } }
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

/** What a synthesis of these inputs decides before rolling: the fusion cost rules, the crafted fall-through and the recipe. */
function plan(state: GameState, inputs: string[], content: Content) {
  const items = [...inputs].sort().filter(isItem);
  const key = comboKey(inputs);
  const first = items[0]; // undefined when both inputs are spells
  const fused = !inputs.some(isElementItem);

  /** Fusion cost of a result spell: one element item per element, at the grade its depth demands. */
  const fusionCost = (elements: string[], depth: number): ItemId[] =>
    fused ? elements.map((e) => `el:${e}:${requiredGrade(depth)}`) : [];

  /** The crafted spell these inputs fall through to, with its fusion cost, or why it cannot be made. */
  const craftedOutcome = ():
    | { id: string; spell: NonNullable<ReturnType<typeof resolveSpell>>; cost: ItemId[] }
    | { reject: 'unknownInput' | 'grade' } => {
    const ta = inputToken(inputs[0]!, content), tb = inputToken(inputs[1]!, content);
    if (ta === null || tb === null) return { reject: 'unknownInput' };
    const id = craftedId(ta, tb);
    const spell = resolveSpell(id, content);
    if (!spell) return { reject: 'unknownInput' };
    const need = requiredGrade(spell.depth);
    if (items.some((it) => isElementItem(it) && Number(it.split(':')[2]) < need)) return { reject: 'grade' };
    return { id, spell, cost: fusionCost(spell.elements, spell.depth) };
  };

  const recipe = findRecipe(content, key);
  const eligible = recipe
    ? recipe.outcomes
        .filter((o) => o.spellId === null || (content.spells[o.spellId]?.prerequisites ?? []).every((p) => state.learned.includes(p)))
        .map((o) => ({ value: o.spellId, weight: o.weight }))
    : [];

  /** The fusion cost of every outcome the recipe's roll could land on (a named outcome already known costs none). */
  const outcomeCosts = (): ItemId[][] | { reject: 'unknownInput' | 'grade' } => {
    const costs: ItemId[][] = [];
    for (const { value } of eligible) {
      if (value === null) {
        const c = craftedOutcome();
        if ('reject' in c) return c;
        costs.push(c.cost);
      } else if (!state.learned.includes(value)) {
        const named = content.spells[value]!;
        costs.push(fusionCost(named.elements, named.depth));
      }
    }
    return costs;
  };

  return { items, key, first, fusionCost, craftedOutcome, recipe, eligible, outcomeCosts };
}

/** Whether these inputs pass the checks every synthesis makes first (two slots, items or learned spells). */
function validInputs(state: GameState, inputs: unknown): inputs is string[] {
  return (
    Array.isArray(inputs) &&
    inputs.length === SYNTH_SLOTS &&
    inputs.every((id) => typeof id === 'string' && (isItem(id) || state.learned.includes(id)))
  );
}

/**
 * Element items a synthesis of these inputs must also hold besides the inputs themselves: the fusion cost of
 * the result (for a random recipe, enough for every outcome the roll could land on). Empty when nothing extra
 * is charged or the attempt would be refused for another reason.
 */
export function fusionNeeds(state: GameState, inputs: string[], content: Content): ItemId[] {
  if (!validInputs(state, inputs)) return [];
  const p = plan(state, inputs, content);
  let costs: ItemId[][];
  if (p.recipe) {
    const c = p.outcomeCosts();
    if (!Array.isArray(c)) return [];
    costs = c;
  } else if (p.items.length === SYNTH_SLOTS) {
    return [];
  } else {
    const c = p.craftedOutcome();
    if ('reject' in c) return [];
    costs = [c.cost];
  }
  // each outcome is checked on its own, so the need per item is the most any single outcome charges
  const most = new Map<ItemId, number>();
  for (const cost of costs) {
    const n = new Map<ItemId, number>();
    for (const id of cost) n.set(id, (n.get(id) ?? 0) + 1);
    for (const [id, k] of n) most.set(id, Math.max(most.get(id) ?? 0, k));
  }
  return [...most].flatMap(([id, k]) => new Array<ItemId>(k).fill(id));
}

export function synthesize(
  state: GameState,
  inputs: string[],
  content: Content,
  rng: Rng,
  opts: { depthCap: number },
): { state: GameState; result: SynthResult } {
  const unchanged = (result: SynthResult) => ({ state, result });
  if (!Array.isArray(inputs) || inputs.length !== SYNTH_SLOTS) return unchanged({ kind: 'rejected', reason: 'slots' });
  if (!validInputs(state, inputs)) return unchanged({ kind: 'rejected', reason: 'unknownInput' });
  const { items, key, first, fusionCost, craftedOutcome, recipe, eligible, outcomeCosts } = plan(state, inputs, content);
  const removed = removeItems(state.inventory, items);
  if (!removed) return unchanged({ kind: 'rejected', reason: 'insufficient' });

  let namedId: string | null = null;
  if (recipe) {
    if (eligible.length === 0) return unchanged({ kind: 'dormant' });
    // Every outcome the roll could land on must be affordable before rolling; otherwise an unaffordable
    // outcome would be rejected for free and the player could retry until the affordable one comes up.
    const costs = outcomeCosts();
    if (!Array.isArray(costs)) return unchanged({ kind: 'rejected', reason: costs.reject });
    for (const cost of costs) if (!removeItems(removed, cost)) return unchanged({ kind: 'rejected', reason: 'insufficient' });
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
  const c = craftedOutcome();
  if ('reject' in c) return unchanged({ kind: 'rejected', reason: c.reject });
  const { id, spell, cost } = c;
  const paid = removeItems(removed, cost);
  if (!paid) return unchanged({ kind: 'rejected', reason: 'insufficient' });
  const spent = [...items, ...cost];

  const overload = spell.depth > opts.depthCap;
  const resultId = overload ? OVERLOAD_SPELL : id;
  const synthesisLog = logAttempt(state, key, overload ? 'overload' : id, false);
  if (state.learned.includes(resultId)) {
    if (recipe) {
      // A random recipe's roll fell through to a crafted spell already known: the attempt is spent like a
      // named duplicate (only the first item comes back, the fusion cost stays paid), so retries are not free.
      // When the first item is all that was spent (spell + one 高階 element, no fusion cost), nothing comes back.
      const refund = first && spent.length > 1 ? [first] : [];
      return {
        state: { ...state, inventory: addItems(paid, refund), synthesisLog },
        result: { kind: 'duplicate', spellId: resultId, refunded: refund },
      };
    }
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
