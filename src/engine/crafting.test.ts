import { describe, expect, it } from 'vitest';
import { comboKey, requiredGrade, synthesize } from './crafting';
import { content } from './content';
import { createRng } from './rng';
import { craftedId, resolveSpell } from './spells';
import { OVERLOAD_SPELL, type Content, type GameState } from './model';

const mkState = (inventory: Record<string, number>, learned: string[] = ['mana_bolt']): GameState => ({
  version: 2, inventory, learned, equipped: 'mana_bolt', levels: {}, revealed: [], passives: [],
  currentZone: 'z1', unlockedZones: ['z1'], defeatedBosses: [], zoneKills: {}, synthesisLog: {},
});
const run = (s: GameState, inputs: string[], depthCap = 8, c: Content = content, seed = 1) =>
  synthesize(s, inputs, c, createRng(seed), { depthCap });

describe('crafting', () => {
  it('requiredGrade clamps depth into 1..5', () => {
    expect([0, 1, 3, 9].map(requiredGrade)).toEqual([1, 1, 3, 5]);
  });

  it('teaches a base spell from two grade-1 elements', () => {
    const { state, result } = run(mkState({ 'el:fire:1': 2 }), ['el:fire:1', 'el:fire:1']);
    expect(result).toEqual({ kind: 'learned', spellId: 'fireball', crafted: false });
    expect(state.learned).toContain('fireball');
    expect(state.inventory).toEqual({});
    expect(state.synthesisLog['el:fire:1+el:fire:1']).toEqual({ attempts: 1, results: { fireball: 1 }, noReaction: false });
  });

  it('teaches the self spell from base + grade-2 element', () => {
    const { state, result } = run(mkState({ 'el:fire:2': 1 }, ['mana_bolt', 'fireball']), ['fireball', 'el:fire:2']);
    expect(result).toEqual({ kind: 'learned', spellId: 'flame_burst', crafted: false });
    expect(state.inventory).toEqual({});
  });

  it('fuses two learned spells into a named spell (fire_tornado)', () => {
    const s = mkState({ 'el:fire:1': 2, 'el:wind:1': 1 }, ['mana_bolt', 'fireball', 'wind_blade']);
    const { state, result } = run(s, ['wind_blade', 'fireball']);
    expect(result).toEqual({ kind: 'learned', spellId: 'fire_tornado', crafted: false });
    expect(state.inventory).toEqual({ 'el:fire:1': 1 });
  });

  it('rejects a named fusion without the fusion cost, changing nothing', () => {
    const s = mkState({ 'el:fire:1': 1 }, ['mana_bolt', 'fireball', 'wind_blade']);
    const { state, result } = run(s, ['wind_blade', 'fireball']);
    expect(result).toEqual({ kind: 'rejected', reason: 'insufficient' });
    expect(state).toEqual(s);
  });

  it('crafts a spell when no recipe matches', () => {
    const s = mkState({ 'el:water:2': 2 }, ['mana_bolt', 'fireball']);
    const { state, result } = run(s, ['fireball', 'el:water:2']);
    expect(result).toEqual({ kind: 'learned', spellId: craftedId('fireball', 'water_wave'), crafted: true });
    expect(state.learned).toContain(craftedId('fireball', 'water_wave'));
    expect(state.inventory).toEqual({ 'el:water:2': 1 });
  });

  it('synthesize is order independent', () => {
    const s = mkState({ 'el:water:2': 1 }, ['mana_bolt', 'fireball']);
    const a = run(s, ['fireball', 'el:water:2']).state;
    const b = run(s, ['el:water:2', 'fireball']).state;
    expect(b.learned).toEqual(a.learned);
    expect(comboKey(['b', 'a'])).toBe('a+b');
  });

  const deep = craftedId('fireball', 'lightning');
  it('rejects a too-low grade for a deep infusion', () => {
    const s = mkState({ 'el:fire:1': 1 }, ['mana_bolt', 'fireball', 'lightning', deep]);
    expect(resolveSpell(deep, content)!.depth).toBe(1);
    // deep (depth 1) + fire grade 1 -> depth 2 needs grade 2
    const { state, result } = run(s, [deep, 'el:fire:1']);
    expect(result).toEqual({ kind: 'rejected', reason: 'grade' });
    expect(state).toEqual(s);
  });

  it('overloads past the depth cap', () => {
    const s = mkState({ 'el:fire:2': 1 }, ['mana_bolt', 'fireball', 'lightning', deep]);
    const { state, result } = run(s, [deep, 'el:fire:2'], 1);
    expect(result).toEqual({ kind: 'overload', spellId: OVERLOAD_SPELL });
    expect(state.learned).toContain(OVERLOAD_SPELL);
    expect(state.inventory).toEqual({});
    expect(state.synthesisLog[comboKey([deep, 'el:fire:2'])]!.results).toEqual({ overload: 1 });
  });

  it('a repeated overload refunds everything', () => {
    const s = mkState({ 'el:fire:2': 1 }, ['mana_bolt', 'fireball', 'lightning', deep, OVERLOAD_SPELL]);
    const { state, result } = run(s, [deep, 'el:fire:2'], 1);
    expect(result).toEqual({ kind: 'duplicate', spellId: OVERLOAD_SPELL, refunded: ['el:fire:2'] });
    expect(state.inventory).toEqual({ 'el:fire:2': 1 });
  });

  it('items without a recipe do nothing', () => {
    const s = mkState({ 'mat:ember_core': 2 });
    const { state, result } = run(s, ['mat:ember_core', 'mat:ember_core']);
    expect(result).toEqual({ kind: 'noReaction' });
    expect(state.inventory).toEqual(s.inventory);
    expect(state.synthesisLog['mat:ember_core+mat:ember_core']).toEqual({ attempts: 1, results: { none: 1 }, noReaction: true });
  });

  it('a crafted duplicate refunds everything', () => {
    const id = craftedId('fireball', 'water_wave');
    const s = mkState({ 'el:water:2': 1 }, ['mana_bolt', 'fireball', id]);
    const { state, result } = run(s, ['fireball', 'el:water:2']);
    expect(result).toEqual({ kind: 'duplicate', spellId: id, refunded: ['el:water:2'] });
    expect(state.inventory).toEqual({ 'el:water:2': 1 });
    expect(state.learned).toEqual(s.learned);
  });

  it('a named duplicate refunds the first item', () => {
    const s = mkState({ 'el:fire:1': 2 }, ['mana_bolt', 'fireball']);
    const { state, result } = run(s, ['el:fire:1', 'el:fire:1']);
    expect(result).toEqual({ kind: 'duplicate', spellId: 'fireball', refunded: ['el:fire:1'] });
    expect(state.inventory).toEqual({ 'el:fire:1': 1 });
  });

  it('unknown or unowned inputs are rejected', () => {
    const s = mkState({ 'key:storm_heart': 1, 'el:fire:1': 1 });
    for (const bad of ['fireball', 'key:storm_heart', 'drop table']) {
      expect(run(s, [bad, 'el:fire:1']).result).toEqual({ kind: 'rejected', reason: 'unknownInput' });
    }
  });

  it('rejects wrong slot counts and missing items', () => {
    const s = mkState({});
    expect(run(s, ['el:fire:1']).result).toEqual({ kind: 'rejected', reason: 'slots' });
    expect(run(s, ['el:fire:1', 'el:fire:1']).result).toEqual({ kind: 'rejected', reason: 'insufficient' });
  });

  /** Shipped content plus a recipe whose roll always falls through to the crafted spell of its inputs. */
  const fallThrough = (inputs: [string, string]): Content => ({
    ...content,
    recipes: [...content.recipes, { id: 'r_fail', inputs, outcomes: [{ spellId: null, weight: 1 }] }],
  });

  it('retrying a random recipe that falls through to a known crafted spell is not free', () => {
    const c = fallThrough(['el:fire:1', 'el:water:1']);
    const crafted = craftedId('fireball', 'water_wave');
    const first = run(mkState({ 'el:fire:1': 2, 'el:water:1': 2 }), ['el:fire:1', 'el:water:1'], 8, c);
    expect(first.result).toEqual({ kind: 'learned', spellId: crafted, crafted: true });
    expect(first.state.inventory).toEqual({ 'el:fire:1': 1, 'el:water:1': 1 });
    // the second failed roll spends the inputs like a named duplicate: only the first (sorted) item comes back
    const second = run(first.state, ['el:water:1', 'el:fire:1'], 8, c);
    expect(second.result).toEqual({ kind: 'duplicate', spellId: crafted, refunded: ['el:fire:1'] });
    expect(second.state.inventory).toEqual({ 'el:fire:1': 1 });
    expect(second.state.learned).toEqual(first.state.learned);
    expect(second.state.synthesisLog['el:fire:1+el:water:1']!.attempts).toBe(2);
  });

  it('a failed retry with one item input still pays the fusion cost', () => {
    // spell + material (like 聖光審判): refunding the only item would make the retry free, so the fusion cost stays spent
    const c = fallThrough(['thunder_hammer', 'mat:ember_core']);
    const crafted = craftedId('mat:ember_core', 'thunder_hammer');
    const s = mkState({ 'mat:ember_core': 1, 'el:fire:2': 1, 'el:thunder:2': 1 }, ['mana_bolt', 'thunder_hammer', crafted]);
    const r = run(s, ['thunder_hammer', 'mat:ember_core'], 8, c);
    expect(r.result).toEqual({ kind: 'duplicate', spellId: crafted, refunded: ['mat:ember_core'] });
    expect(r.state.inventory).toEqual({ 'mat:ember_core': 1 });
  });

  it('a missed rare roll (spell + 高階 element) always spends the element, even on a known fall-through', () => {
    // 焚世之焰: inferno + el:fire:3, no fusion cost; refunding the only item would make retries free
    const miss = { next: () => 0.999, int: (min: number) => min };
    const go = (s: GameState) => synthesize(s, ['inferno', 'el:fire:3'], content, miss, { depthCap: 8 });
    const crafted = craftedId('fireball', 'inferno');
    const first = go(mkState({ 'el:fire:3': 2 }, ['mana_bolt', 'inferno']));
    expect(first.result).toEqual({ kind: 'learned', spellId: crafted, crafted: true });
    expect(first.state.inventory).toEqual({ 'el:fire:3': 1 });
    const second = go(first.state);
    expect(second.result).toEqual({ kind: 'duplicate', spellId: crafted, refunded: [] });
    expect(second.state.inventory).toEqual({});
    expect(second.state.learned).toEqual(first.state.learned);
    const third = go(second.state);
    expect(third.result).toEqual({ kind: 'rejected', reason: 'insufficient' });
    expect(third.state).toEqual(second.state);
  });

  it('a random recipe can fall through to the crafted spell', () => {
    const c: Content = {
      ...content,
      recipes: [...content.recipes, {
        id: 'r_test', inputs: ['el:fire:1', 'el:water:1'],
        outcomes: [{ spellId: 'fire_tornado', weight: 1 }, { spellId: null, weight: 1 }],
      }],
    };
    const s = mkState({ 'el:fire:1': 1, 'el:water:1': 1 }, ['mana_bolt', 'fireball', 'wind_blade']);
    const kinds = new Set<string>();
    for (let seed = 1; seed < 30; seed++) {
      const r = run(s, ['el:fire:1', 'el:water:1'], 8, c, seed).result;
      kinds.add(r.kind === 'learned' ? `${r.spellId}:${r.crafted}` : r.kind);
    }
    expect(kinds).toContain('fire_tornado:false');
    expect([...kinds].some((k) => k.startsWith('c('))).toBe(true);
  });

  describe('a random recipe needs every outcome affordable before the roll', () => {
    const inputs = ['thunder_hammer', 'mat:sun_shard'];
    const learned = ['mana_bolt', 'lightning', 'thunder_hammer'];
    const crafted = craftedId('mat:sun_shard', 'thunder_hammer');
    it('the outcomes really cost different amounts', () => {
      expect(content.spells.holy_judgment!.depth).toBe(3);
      expect(resolveSpell(crafted, content)!.depth).toBe(2);
    });
    for (const [label, stock] of [
      ['only the crafted fall-through', { 'el:fire:2': 1, 'el:thunder:2': 1 }],
      ['only the named outcome', { 'el:fire:3': 1, 'el:thunder:3': 1 }],
    ] as const) {
      it(`stock covering ${label} is rejected on every seed, spending nothing`, () => {
        const s = mkState({ 'mat:sun_shard': 1, ...stock }, learned);
        for (let seed = 1; seed <= 40; seed++) {
          const r = run(s, inputs, 8, content, seed);
          expect(r.result).toEqual({ kind: 'rejected', reason: 'insufficient' });
          expect(r.state).toEqual(s);
        }
      });
    }
    it('stock covering every outcome rolls and pays as before', () => {
      const s = mkState({ 'mat:sun_shard': 1, 'el:fire:2': 1, 'el:thunder:2': 1, 'el:fire:3': 1, 'el:thunder:3': 1 }, learned);
      const seen = new Set<string>();
      for (let seed = 1; seed <= 60; seed++) {
        const r = run(s, inputs, 8, content, seed);
        expect(r.result.kind).toBe('learned');
        if (r.result.kind !== 'learned') continue;
        seen.add(r.result.spellId);
        expect(r.state.learned).toContain(r.result.spellId);
        expect(r.state.inventory).toEqual(r.result.spellId === 'holy_judgment'
          ? { 'el:fire:2': 1, 'el:thunder:2': 1 }
          : { 'el:fire:3': 1, 'el:thunder:3': 1 });
      }
      expect(seen).toEqual(new Set(['holy_judgment', crafted]));
    });
  });
});
