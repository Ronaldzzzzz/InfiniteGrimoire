import { describe, expect, it } from 'vitest';
import { content } from './content';
import { empower, empowerCost } from './empower';
import { attackCeiling, craftedId, MAX_SPELL_LEVEL, resolveSpell, spellAtLevel } from './spells';
import type { GameState } from './model';

const mkState = (inventory: Record<string, number>, learned: string[], levels: Record<string, number> = {}): GameState => ({
  version: 2, inventory, learned, equipped: 'mana_bolt', levels, revealed: [], passives: [],
  currentZone: 'z1', unlockedZones: ['z1'], defeatedBosses: [], zoneKills: {}, synthesisLog: {},
});
const spell = (id: string) => resolveSpell(id, content)!;

describe('empower', () => {
  it('level 1 -> 2 costs 4 grade-1 units per element', () => {
    expect(empowerCost(spell('fireball'), 1)).toEqual(['el:fire:1', 'el:fire:1', 'el:fire:1', 'el:fire:1']);
    const s = mkState({ 'el:fire:1': 5 }, ['mana_bolt', 'fireball']);
    const { state, result } = empower(s, 'fireball', content);
    expect(result).toEqual({ kind: 'empowered', level: 2 });
    expect(state.levels.fireball).toBe(2);
    expect(state.inventory).toEqual({ 'el:fire:1': 1 });
  });

  it('level 11 -> 12 costs grade-2 units', () => {
    expect(empowerCost(spell('fireball'), 11)).toEqual(new Array(4).fill('el:fire:2'));
    expect(empowerCost(spell('fireball'), 12)).toEqual(new Array(6).fill('el:fire:2'));
    const s = mkState({ 'el:fire:2': 4 }, ['fireball'], { fireball: 11 });
    const { state, result } = empower(s, 'fireball', content);
    expect(result).toEqual({ kind: 'empowered', level: 12 });
    expect(state.inventory).toEqual({});
  });

  it('a dual-element spell pays both elements', () => {
    const tornado = spell('fire_tornado');
    expect(tornado.elements.length).toBe(2);
    const cost = empowerCost(tornado, 1);
    expect(cost.length).toBe(8);
    const s = mkState({ 'el:fire:1': 4, 'el:wind:1': 4 }, ['fire_tornado']);
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
    const s = mkState({ 'el:fire:1': 3 }, ['fireball']);
    expect(empower(s, 'fireball', content)).toEqual({ state: s, result: { kind: 'rejected', reason: 'insufficient' } });
    expect(empower(s, 'wind_blade', content).result).toEqual({ kind: 'rejected', reason: 'notLearned' });
    expect(empower(s, 'toString', content).result).toEqual({ kind: 'rejected', reason: 'notLearned' });
  });

  it('stops at MAX_SPELL_LEVEL', () => {
    const s = mkState({ 'el:fire:5': 999 }, ['fireball'], { fireball: MAX_SPELL_LEVEL });
    const r = empower(s, 'fireball', content);
    expect(r.result).toEqual({ kind: 'rejected', reason: 'maxLevel' });
    expect(r.state).toEqual(s);
    const at49 = empower(mkState({ 'el:fire:5': 999 }, ['fireball'], { fireball: 49 }), 'fireball', content);
    expect(at49.result).toEqual({ kind: 'empowered', level: 50 });
  });

  it('works for crafted spells', () => {
    const id = craftedId('fireball', 'lightning');
    const s = mkState({ 'el:fire:1': 4, 'el:thunder:1': 4 }, ['fireball', 'lightning', id]);
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
    expect(max.attack).toBeLessThanOrEqual(attackCeiling(deep!.tier, content) * (1 + 0.08 * 49));
    expect(max.tier).toBeLessThanOrEqual(20);
  });
});
