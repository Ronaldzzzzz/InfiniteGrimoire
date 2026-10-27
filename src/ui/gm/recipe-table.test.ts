import { describe, expect, it } from 'vitest';
import { fusionNeeds } from '../../engine/crafting';
import { content } from '../../engine/content';
import { createInitialState } from '../../engine/persist';
import recipes from '../../data/content/recipes.json';
import { recipeTable } from './recipe-table';

describe('recipeTable', () => {
  const state = { ...createInitialState(content), learned: ['mana_bolt', 'fireball', 'wind_blade', 'inferno'] };
  const rows = recipeTable(content, state);

  it('has one row per recipe', () => {
    expect(rows).toHaveLength(recipes.length);
  });

  it('turns weights into percentages with one decimal', () => {
    const fire = rows.find((r) => r.id === 'worldfire')!;
    expect(fire.outcomes.map((o) => o.pct)).toEqual([2, 98]);
    expect(fire.outcomes[0]).toMatchObject({ label: '焚世之焰 Lv.10', rare: true });
    expect(fire.outcomes[1]).toMatchObject({ label: '落空 → 自創魔法', rare: false });
    const holy = rows.find((r) => r.id === 'holy_judgment')!;
    expect(holy.outcomes.map((o) => o.pct)).toEqual([2, 98]);
  });

  it('a single outcome is 100% and not rare', () => {
    const base = rows.find((r) => r.id === 'fire_base')!;
    expect(base.outcomes).toEqual([{ label: `${content.spells.fireball!.name} Lv.${content.spells.fireball!.tier}`, pct: 100, rare: false }]);
  });

  it('fusion matches fusionNeeds for the same state', () => {
    for (const r of rows) expect(r.fusion).toEqual(fusionNeeds(state, r.inputs, content));
    expect(rows.find((r) => r.id === 'fire_wind')!.fusion.length).toBeGreaterThan(0);
  });
});
