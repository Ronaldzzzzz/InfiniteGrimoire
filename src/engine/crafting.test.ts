import { describe, expect, it } from 'vitest';
import { comboKey, fusionNeeds, rareStillHidden, requiredGrade, rollsRare, synthesize } from './crafting';
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

  it('a failed retry of spell + material refunds nothing and charges no fusion cost (R1)', () => {
    const c = fallThrough(['thunder_hammer', 'mat:ember_core']);
    const crafted = craftedId('mat:ember_core', 'thunder_hammer');
    const s = mkState({ 'mat:ember_core': 1, 'el:fire:2': 1, 'el:thunder:2': 1 }, ['mana_bolt', 'thunder_hammer', crafted]);
    const r = run(s, ['thunder_hammer', 'mat:ember_core'], 8, c);
    expect(r.result).toEqual({ kind: 'duplicate', spellId: crafted, refunded: [] });
    expect(r.state.inventory).toEqual({ 'el:fire:2': 1, 'el:thunder:2': 1 });
  });

  it('a missed rare roll (Lv.9 spell + material) always spends the material, even on a known fall-through', () => {
    // 焚世之焰: corona_scorch + mat:ember_core, no fusion cost; refunding the only item would make retries free
    const miss = { next: () => 0.999, int: (min: number) => min };
    const inputs = ['corona_scorch', 'mat:ember_core'];
    const go = (s: GameState) => synthesize(s, inputs, content, miss, { depthCap: 8 });
    const crafted = craftedId('corona_scorch', 'mat:ember_core');
    const first = go(mkState({ 'mat:ember_core': 2 }, ['mana_bolt', 'corona_scorch']));
    expect(first.result).toEqual({ kind: 'learned', spellId: crafted, crafted: true });
    expect(first.state.inventory).toEqual({ 'mat:ember_core': 1 });
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

  describe('rare recipe: spell + material costs the material only (R1)', () => {
    const rareC: Content = {
      ...content,
      spells: { ...content.spells, hi9: { ...content.spells.thunder_hammer!, id: 'hi9', tier: 9 } },
      recipes: [...content.recipes, { id: 'r_rare', inputs: ['hi9', 'mat:ember_core'], outcomes: [{ spellId: 'holy_judgment', weight: 1 }, { spellId: null, weight: 49 }] }],
    };
    const inputs = ['hi9', 'mat:ember_core'];
    const miss = { next: () => 0.999, int: (min: number) => min };
    const hit = { next: () => 0, int: (min: number) => min };
    const learned = ['mana_bolt', 'hi9', 'thunder_hammer', 'astral_fulmination'];
    const crafted = craftedId('hi9', 'mat:ember_core');

    it('a miss spends one material and no element, and a repeat miss refunds nothing', () => {
      const go = (s: GameState) => synthesize(s, inputs, rareC, miss, { depthCap: 8 });
      const first = go(mkState({ 'mat:ember_core': 2 }, learned));
      expect(first.result).toEqual({ kind: 'learned', spellId: crafted, crafted: true });
      expect(first.state.inventory).toEqual({ 'mat:ember_core': 1 });
      const second = go(first.state);
      expect(second.result).toEqual({ kind: 'duplicate', spellId: crafted, refunded: [] });
      expect(second.state.inventory).toEqual({});
    });

    it('a hit learns the rare spell and spends only the material', () => {
      const r = synthesize(mkState({ 'mat:ember_core': 1 }, learned), inputs, rareC, hit, { depthCap: 8 });
      expect(r.result).toEqual({ kind: 'learned', spellId: 'holy_judgment', crafted: false });
      expect(r.state.inventory).toEqual({});
    });

    it('fusionNeeds is empty', () => {
      expect(fusionNeeds(mkState({ 'mat:ember_core': 1 }, learned), inputs, rareC)).toEqual([]);
    });

    it('a spell + material with no recipe still pays the fusion cost', () => {
      expect(fusionNeeds(mkState({ 'mat:ember_core': 1 }, ['mana_bolt', 'thunder_hammer']), ['thunder_hammer', 'mat:ember_core'],
        { ...content, recipes: content.recipes.filter((r) => !r.inputs.includes('mat:ember_core')) }).length).toBeGreaterThan(0);
    });
  });

  describe('a random recipe needs every outcome affordable before the roll', () => {
    const inputs = ['inferno', 'vacuum_blades'];
    const learned = ['mana_bolt', 'fireball', 'wind_blade', 'inferno', 'vacuum_blades'];
    const c: Content = {
      ...content,
      recipes: [...content.recipes, { id: 'r_two', inputs: ['inferno', 'vacuum_blades'], outcomes: [{ spellId: 'fire_tornado', weight: 1 }, { spellId: null, weight: 1 }] }],
    };
    const crafted = craftedId('inferno', 'vacuum_blades');
    it('the outcomes really cost different amounts', () => {
      expect(content.spells.fire_tornado!.depth).toBe(1);
      expect(resolveSpell(crafted, content)!.depth).toBe(3);
    });
    for (const [label, stock] of [
      ['only the crafted fall-through', { 'el:fire:3': 1, 'el:wind:3': 1 }],
      ['only the named outcome', { 'el:fire:1': 1, 'el:wind:1': 1 }],
    ] as const) {
      it(`stock covering ${label} is rejected on every seed, spending nothing`, () => {
        const s = mkState({ ...stock }, learned);
        for (let seed = 1; seed <= 40; seed++) {
          const r = run(s, inputs, 8, c, seed);
          expect(r.result).toEqual({ kind: 'rejected', reason: 'insufficient' });
          expect(r.state).toEqual(s);
        }
      });
    }
    it('stock covering every outcome rolls and pays as before', () => {
      const s = mkState({ 'el:fire:1': 1, 'el:wind:1': 1, 'el:fire:3': 1, 'el:wind:3': 1 }, learned);
      const seen = new Set<string>();
      for (let seed = 1; seed <= 60; seed++) {
        const r = run(s, inputs, 8, c, seed);
        expect(r.result.kind).toBe('learned');
        if (r.result.kind !== 'learned') continue;
        seen.add(r.result.spellId);
        expect(r.state.learned).toContain(r.result.spellId);
        expect(r.state.inventory).toEqual(r.result.spellId === 'fire_tornado'
          ? { 'el:fire:3': 1, 'el:wind:3': 1 }
          : { 'el:fire:1': 1, 'el:wind:1': 1 });
      }
      expect(seen).toEqual(new Set(['fire_tornado', crafted]));
    });
  });
});

describe('the pure fire chain (real content)', () => {
  const chain: [string, string, string][] = [
    ['fireball', 'el:fire:2', 'flame_burst'], ['flame_burst', 'el:fire:2', 'ash_serpents'], ['ash_serpents', 'el:fire:3', 'inferno'],
    ['inferno', 'el:fire:3', 'crimson_pillar'], ['crimson_pillar', 'el:fire:4', 'sunfall'], ['sunfall', 'el:fire:4', 'hellfire_siege'],
    ['hellfire_siege', 'el:fire:5', 'corona_scorch'],
  ];
  it('walks Lv.2 to Lv.9, one learned spell per step', () => {
    let s = mkState({ 'el:fire:2': 2, 'el:fire:3': 2, 'el:fire:4': 2, 'el:fire:5': 1 }, ['mana_bolt', 'fireball']);
    for (const [spell, item, out] of chain) {
      const r = run(s, [spell, item], 8);
      expect(r.result, out).toEqual({ kind: 'learned', spellId: out, crafted: false });
      expect(content.spells[out]!.prerequisites, out).toEqual([spell]);
      s = r.state;
    }
    expect(s.inventory).toEqual({});
    expect(s.learned).toContain('corona_scorch');
  });

  it('corona_scorch + ember_core hits and misses with a fixed rng', () => {
    const inputs = ['corona_scorch', 'mat:ember_core'];
    const learned = ['mana_bolt', 'corona_scorch'];
    const hit = synthesize(mkState({ 'mat:ember_core': 1 }, learned), inputs, content, { next: () => 0, int: (min: number) => min }, { depthCap: 8 });
    expect(hit.result).toEqual({ kind: 'learned', spellId: 'worldfire', crafted: false });
    expect(hit.state.inventory).toEqual({});
    const miss = synthesize(mkState({ 'mat:ember_core': 1 }, learned), inputs, content, { next: () => 0.999, int: (min: number) => min }, { depthCap: 8 });
    expect(miss.result).toMatchObject({ kind: 'learned', crafted: true });
    expect(miss.state.learned).not.toContain('worldfire');
  });
});

describe('fusionNeeds', () => {
  const needs = (inputs: string[], learned: string[], inventory: Record<string, number> = {}) =>
    [...fusionNeeds(mkState(inventory, ['mana_bolt', ...learned]), inputs, content)].sort();
  const without = (inv: Record<string, number>, id: string) => ({ ...inv, [id]: inv[id]! - 1 });
  const stock = (ids: string[]) => {
    const inv: Record<string, number> = {};
    for (const id of ids) inv[id] = (inv[id] ?? 0) + 1;
    return inv;
  };

  it('a named fusion of two spells needs one element per element of the result, at the grade its depth demands', () => {
    expect(needs(['fireball', 'wind_blade'], ['fireball', 'wind_blade'])).toEqual(['el:fire:1', 'el:wind:1']);
  });

  it('a crafted fusion needs its own fusion cost, and a known named result needs none', () => {
    expect(needs(['inferno', 'vacuum_blades'], ['inferno', 'vacuum_blades'])).toEqual(['el:fire:3', 'el:wind:3']);
    expect(needs(['fireball', 'wind_blade'], ['fireball', 'wind_blade', 'fire_tornado'])).toEqual([]);
  });

  it('needs nothing extra when an element is an input, or when the inputs are not valid', () => {
    expect(needs(['fireball', 'el:wind:2'], ['fireball'])).toEqual([]);
    expect(needs(['fireball', 'wind_blade'], ['fireball'])).toEqual([]); // wind_blade not learned
    expect(needs(['fireball'], ['fireball'])).toEqual([]);
  });

  it('a random recipe needs what every outcome it could land on would charge', () => {
    const c: Content = {
      ...content,
      recipes: [...content.recipes, { id: 'r_two', inputs: ['inferno', 'vacuum_blades'], outcomes: [{ spellId: 'fire_tornado', weight: 1 }, { spellId: null, weight: 1 }] }],
    };
    const extra = fusionNeeds(mkState({}, ['mana_bolt', 'fireball', 'wind_blade', 'inferno', 'vacuum_blades']), ['inferno', 'vacuum_blades'], c);
    expect([...extra].sort()).toEqual(['el:fire:1', 'el:fire:3', 'el:wind:1', 'el:wind:3']);
  });

  it('matches synthesize: exactly the inputs plus these needs is enough, one fewer is not', () => {
    for (const [inputs, learned] of [
      [['fireball', 'wind_blade'], ['fireball', 'wind_blade']],
      [['inferno', 'vacuum_blades'], ['inferno', 'vacuum_blades']],
    ] as const) {
      const extra = needs([...inputs], [...learned]);
      const inv = stock([...inputs.filter((i) => i.includes(':')), ...extra]);
      const state = (i: Record<string, number>) => mkState(i, ['mana_bolt', ...learned]);
      expect(run(state(inv), [...inputs]).result.kind).not.toBe('rejected');
      expect(run(state(without(inv, extra[0]!)), [...inputs]).result).toEqual({ kind: 'rejected', reason: 'insufficient' });
    }
  });
});

describe('rareStillHidden', () => {
  const hidden = (inputs: string[], learned: string[]) => rareStillHidden(mkState({}, ['mana_bolt', ...learned]), inputs, content);

  it('is true when the inputs roll a random recipe whose named outcome is reachable but not learned yet', () => {
    expect(hidden(['corona_scorch', 'mat:ember_core'], ['corona_scorch'])).toBe(true);
  });

  it('is false once that outcome is learned, for fixed recipes, and for combos with no recipe', () => {
    expect(hidden(['corona_scorch', 'mat:ember_core'], ['corona_scorch', 'worldfire'])).toBe(false);
    expect(hidden(['fireball', 'wind_blade'], ['fireball', 'wind_blade'])).toBe(false);
    expect(hidden(['el:fire:1', 'el:wind:1'], [])).toBe(false);
  });

  it('is false when the named outcome needs a prerequisite the player lacks (the roll cannot land on it)', () => {
    expect(hidden(['astral_fulmination', 'mat:sun_shard'], ['astral_fulmination'])).toBe(true);
    const gated = { ...content, spells: { ...content.spells, holy_judgment: { ...content.spells.holy_judgment!, prerequisites: ['nope'] } } };
    expect(rareStillHidden(mkState({}, ['mana_bolt', 'astral_fulmination']), ['astral_fulmination', 'mat:sun_shard'], gated)).toBe(false);
  });
});

describe('rollsRare', () => {
  it('is true only for recipes with a rare outcome, in any input order', () => {
    expect(rollsRare(['corona_scorch', 'mat:ember_core'], content)).toBe(true);
    expect(rollsRare(['mat:ember_core', 'corona_scorch'], content)).toBe(true);
    expect(rollsRare(['fireball', 'wind_blade'], content)).toBe(false);
    expect(rollsRare(['el:fire:1', 'el:fire:1'], content)).toBe(false);
  });
});
