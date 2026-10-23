import { fusionNeeds } from '../../engine/crafting';
import type { Content, GameState } from '../../engine/model';
import type { ItemId } from '../../engine/types';

export type RecipeOutcomeRow = { label: string; pct: number; rare: boolean };
export type RecipeRow = { id: string; inputs: [string, string]; outcomes: RecipeOutcomeRow[]; fusion: ItemId[] };

export const FALLTHROUGH_LABEL = '落空 → 自創魔法';

/** Every recipe with its outcome odds and the fusion elements it needs from this state (spec §5.3). */
export function recipeTable(content: Content, state: GameState): RecipeRow[] {
  return content.recipes.map((r) => {
    const total = r.outcomes.reduce((n, o) => n + o.weight, 0);
    const outcomes = r.outcomes.map((o): RecipeOutcomeRow => {
      const pct = total > 0 ? Math.round((o.weight / total) * 1000) / 10 : 0;
      if (o.spellId === null) return { label: FALLTHROUGH_LABEL, pct, rare: false };
      const spell = Object.hasOwn(content.spells, o.spellId) ? content.spells[o.spellId]! : null;
      return spell
        ? { label: `${spell.name} Lv.${spell.tier}`, pct, rare: spell.rare === true }
        : { label: o.spellId, pct, rare: false };
    });
    return { id: r.id, inputs: r.inputs, outcomes, fusion: fusionNeeds(state, r.inputs, content) };
  });
}
