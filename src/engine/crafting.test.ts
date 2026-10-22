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
    const s = mkState({ 'el:thunder:2': 2 }, ['mana_bolt', 'fireball']);
    const { state, result } = run(s, ['fireball', 'el:thunder:2']);
    expect(result).toEqual({ kind: 'learned', spellId: craftedId('fireball', 'lightning'), crafted: true });
    expect(state.learned).toContain(craftedId('fireball', 'lightning'));
    expect(state.inventory).toEqual({ 'el:thunder:2': 1 });
  });

  it('synthesize is order independent', () => {
    const s = mkState({ 'el:thunder:2': 1 }, ['mana_bolt', 'fireball']);
    const a = run(s, ['fireball', 'el:thunder:2']).state;
    const b = run(s, ['el:thunder:2', 'fireball']).state;
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
    const id = craftedId('fireball', 'lightning');
    const s = mkState({ 'el:thunder:2': 1 }, ['mana_bolt', 'fireball', id]);
    const { state, result } = run(s, ['fireball', 'el:thunder:2']);
    expect(result).toEqual({ kind: 'duplicate', spellId: id, refunded: ['el:thunder:2'] });
    expect(state.inventory).toEqual({ 'el:thunder:2': 1 });
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
});
