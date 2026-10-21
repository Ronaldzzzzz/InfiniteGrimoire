import { describe, expect, it } from 'vitest';
import { gameData } from './data';
import { createRng } from './rng';
import { createInitialState, type GameState } from './state';
import { comboKey, synthesize } from './synthesis';

const withInv = (inventory: Record<string, number>, extra: Partial<GameState> = {}): GameState => ({
  ...createInitialState(gameData),
  inventory,
  ...extra,
});

describe('synthesis', () => {
  it('rejects one slot without consuming', () => {
    const s = withInv({ 'el:fire:1': 2 });
    const { state, result } = synthesize(s, ['el:fire:1'], gameData, createRng(1));
    expect(result).toEqual({ kind: 'rejected', reason: 'slots' });
    expect(state).toEqual(s);
  });

  it('rejects same element twice when only one owned', () => {
    const s = withInv({ 'el:fire:1': 1 });
    const { state, result } = synthesize(s, ['el:fire:1', 'el:fire:1'], gameData, createRng(1));
    expect(result).toEqual({ kind: 'rejected', reason: 'insufficient' });
    expect(state).toEqual(s);
  });

  it('first invalid combo consumes one item and logs noReaction', () => {
    const s = withInv({ 'el:fire:1': 1, 'el:water:1': 1 });
    const { state, result } = synthesize(s, ['el:water:1', 'el:fire:1'], gameData, createRng(1));
    expect(result).toEqual({ kind: 'noReaction', consumed: ['el:fire:1'] });
    expect(state.inventory).toEqual({ 'el:water:1': 1 });
    expect(state.synthesisLog[comboKey(['el:fire:1', 'el:water:1'])]).toEqual({
      attempts: 1,
      results: { none: 1 },
      noReaction: true,
    });
    expect(s.inventory).toEqual({ 'el:fire:1': 1, 'el:water:1': 1 });
  });

  it('second invalid combo consumes nothing', () => {
    const s = withInv({ 'el:fire:1': 2, 'el:water:1': 2 });
    const first = synthesize(s, ['el:fire:1', 'el:water:1'], gameData, createRng(1));
    const second = synthesize(first.state, ['el:fire:1', 'el:water:1'], gameData, createRng(1));
    expect(second.result).toEqual({ kind: 'knownNoReaction' });
    expect(second.state).toEqual(first.state);
  });

  it('dormant when prerequisite missing', () => {
    const s = withInv({ 'el:thunder:2': 2 }, { learned: ['mana_bolt'] });
    // lightning needs thunder_bolt; thunderstorm needs lightning -> make a recipe with only gated outcomes
    const data = {
      ...gameData,
      recipes: [{ id: 'x', inputs: ['el:thunder:2', 'el:thunder:2'], outcomes: [{ spellId: 'thunderstorm', weight: 1 }] }],
    };
    const { state, result } = synthesize(s, ['el:thunder:2', 'el:thunder:2'], data, createRng(1));
    expect(result).toEqual({ kind: 'dormant' });
    expect(state).toEqual(s);
  });

  it('learns T2 spell from two grade-1 elements', () => {
    const s = withInv({ 'el:fire:1': 2 });
    const { state, result } = synthesize(s, ['el:fire:1', 'el:fire:1'], gameData, createRng(1));
    expect(result).toEqual({ kind: 'learned', spellId: 'fireball' });
    expect(state.learned).toContain('fireball');
    expect(state.inventory).toEqual({});
    expect(state.synthesisLog['el:fire:1+el:fire:1']).toEqual({
      attempts: 1,
      results: { fireball: 1 },
      noReaction: false,
    });
    expect(s.learned).toEqual(['mana_bolt']);
  });

  it('duplicate refunds one input', () => {
    const s = withInv({ 'el:fire:1': 2 }, { learned: ['mana_bolt', 'fireball'] });
    const { state, result } = synthesize(s, ['el:fire:1', 'el:fire:1'], gameData, createRng(1));
    expect(result).toEqual({ kind: 'duplicate', spellId: 'fireball', refunded: ['el:fire:1'] });
    expect(state.inventory).toEqual({ 'el:fire:1': 1 });
    expect(state.learned).toEqual(['mana_bolt', 'fireball']);
    expect(state.synthesisLog['el:fire:1+el:fire:1']!.results).toEqual({ fireball: 1 });
  });

  it('outcome with unmet prereq is never rolled', () => {
    const s = withInv({ 'el:thunder:2': 2 }, { learned: ['mana_bolt', 'thunder_bolt'] });
    for (let i = 0; i < 200; i++) {
      const { result } = synthesize(s, ['el:thunder:2', 'el:thunder:2'], gameData, createRng(i));
      expect(result).toEqual({ kind: 'learned', spellId: 'lightning' });
    }
  });

  it('comboKey is order-insensitive', () => {
    expect(comboKey(['el:fire:1', 'el:water:1'])).toBe(comboKey(['el:water:1', 'el:fire:1']));
    expect(comboKey(['el:fire:1', 'el:fire:1'])).not.toBe(comboKey(['el:fire:1', 'el:water:1']));
  });
});
