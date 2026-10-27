import { describe, expect, it } from 'vitest';
import { content } from './content';
import { empower, empowerCost, empowerGrade } from './empower';
import { attackCeiling, craftedId, MAX_SPELL_LEVEL, resolveSpell, spellAtLevel, EMPOWER_MAX } from './spells';
import type { GameState } from './model';

const mkState = (inventory: Record<string, number>, learned: string[], levels: Record<string, number> = {}): GameState => ({
  version: 2, inventory, learned, equipped: 'mana_bolt', levels, revealed: [], passives: [],
  currentZone: 'z1', unlockedZones: ['z1'], defeatedBosses: [], zoneKills: {}, synthesisLog: {},
});
const spell = (id: string) => resolveSpell(id, content)!;

describe('empower', () => {
  it('empowerGrade follows the spell tier and the level band', () => {
    expect(empowerGrade(2, 1)).toBe(1);
    expect(empowerGrade(2, 11)).toBe(1);
    expect(empowerGrade(9, 41)).toBe(4);
    expect(empowerGrade(10, 41)).toBe(5);
    expect(empowerGrade(9, 1)).toBe(1);
  });

  it('costs scale with level and are capped by the spell tier', () => {
    const lv2 = { ...spell('fireball'), tier: 2 };
    expect(empowerCost(lv2, 1)).toEqual(new Array(2).fill('el:fire:1'));
    expect(empowerCost(lv2, 10)).toEqual(new Array(6).fill('el:fire:1'));
    expect(empowerCost(lv2, 11)).toEqual(new Array(2).fill('el:fire:1'));
    expect(empowerCost({ ...lv2, tier: 9 }, 41)).toEqual(new Array(2).fill('el:fire:4'));
    expect(empowerCost({ ...lv2, tier: 10 }, 41)).toEqual(new Array(2).fill('el:fire:5'));
    expect(empowerCost({ ...lv2, elements: ['fire', 'wind'] }, 1)).toEqual(['el:fire:1', 'el:fire:1', 'el:wind:1', 'el:wind:1']);
  });

  it('empower spends the cost and raises the level', () => {
    const s = mkState({ 'el:fire:1': 5 }, ['mana_bolt', 'fireball']);
    const { state, result } = empower(s, 'fireball', content);
    expect(result).toEqual({ kind: 'empowered', level: 2 });
    expect(state.levels.fireball).toBe(2);
    expect(state.inventory).toEqual({ 'el:fire:1': 3 });
  });

  it('a dual-element spell pays both elements', () => {
    const tornado = spell('fire_tornado');
    expect(tornado.elements.length).toBe(2);
    const cost = empowerCost(tornado, 1);
    expect(cost.length).toBe(4);
    const s = mkState({ 'el:fire:1': 2, 'el:wind:1': 2 }, ['fire_tornado']);
    const { state, result } = empower(s, 'fire_tornado', content);
    expect(result).toEqual({ kind: 'empowered', level: 2 });
    expect(state.inventory).toEqual({});
  });

  it('mana_bolt cannot be empowered (noElements)', () => {
    const s = mkState({ 'el:fire:1': 99 }, ['mana_bolt']);
    const r = empower(s, 'mana_bolt', content);
    expect(r.result).toEqual({ kind: 'rejected', reason: 'noElements' });
    expect(r.state).toEqual(s);
  });

  it('rejects unlearned, unknown and unaffordable without changing state', () => {
    const s = mkState({ 'el:fire:1': 1 }, ['fireball']);
    expect(empower(s, 'fireball', content)).toEqual({ state: s, result: { kind: 'rejected', reason: 'insufficient' } });
    expect(empower(s, 'wind_blade', content).result).toEqual({ kind: 'rejected', reason: 'notLearned' });
    expect(empower(s, 'toString', content).result).toEqual({ kind: 'rejected', reason: 'notLearned' });
  });

  it('stops at MAX_SPELL_LEVEL', () => {
    const s = mkState({ 'el:fire:5': 999 }, ['fireball'], { fireball: MAX_SPELL_LEVEL });
    const r = empower(s, 'fireball', content);
    expect(r.result).toEqual({ kind: 'rejected', reason: 'maxLevel' });
    expect(r.state).toEqual(s);
    const at49 = empower(mkState({ 'el:fire:1': 999, 'el:fire:2': 999, 'el:fire:3': 999, 'el:fire:4': 999, 'el:fire:5': 999 }, ['fireball'], { fireball: 49 }), 'fireball', content);
    expect(at49.result).toEqual({ kind: 'empowered', level: 50 });
  });

  it('works for crafted spells', () => {
    const id = craftedId('fireball', 'lightning');
    const s = mkState({ 'el:fire:1': 2, 'el:thunder:1': 2 }, ['fireball', 'lightning', id]);
    const { state, result } = empower(s, id, content);
    expect(result).toEqual({ kind: 'empowered', level: 2 });
    expect(state.levels[id]).toBe(2);
    expect(state.inventory).toEqual({});
  });

  it('max level stays bounded', () => {
    const names = ['fireball', 'wind_blade', 'lightning'];
    let id = names[0]!;
    for (let i = 0; i < 8; i++) id = craftedId(id, names[(i + 1) % 3]!);
    const deep = resolveSpell(id, content);
    expect(deep).not.toBeNull();
    expect(deep!.depth).toBe(8);
    const max = spellAtLevel(deep!, MAX_SPELL_LEVEL);
    expect(max.attack).toBeLessThanOrEqual(attackCeiling(deep!.tier, content) * EMPOWER_MAX);
    expect(max.tier).toBeLessThanOrEqual(9);
  });
});
