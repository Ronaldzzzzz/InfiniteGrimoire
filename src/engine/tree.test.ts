import { describe, expect, it } from 'vitest';
import { content } from './content';
import { passiveBonuses, passiveRequirementMet, unlockPassive, useKeyItem } from './tree';
import type { Content, GameState, Passive } from './model';

const mkState = (over: Partial<GameState> = {}): GameState => ({
  version: 2, inventory: {}, learned: ['mana_bolt'], equipped: 'mana_bolt', levels: {}, circleTier: 2, passives: [],
  currentZone: 'z1', unlockedZones: ['z1'], defeatedBosses: [], currentStage: 1, clearedStages: {}, lastClearAt: 0, clearTimes: {}, awayAt: 0, offlineUntil: 0, synthesisLog: {}, ...over,
});
const withPassives = (...ps: Passive[]): Content => ({
  ...content, passives: { ...content.passives, ...Object.fromEntries(ps.map((p) => [p.id, p])) },
});
const mkPassive = (id: string, bonus: Passive['bonus'], unlock: Passive['unlock'], region = 'core'): Passive => ({
  id, name: id, nameEn: id, desc: '', node: { region, ring: 1, angle: 0 }, bonus, unlock,
});

describe('tree', () => {
  it('key item raises circleTier and is consumed', () => {
    const s = mkState({ inventory: { 'key:storm_heart': 1, 'key:thunder_eye': 2 } });
    const { state, result } = useKeyItem(s, 'key:storm_heart', content);
    expect(result).toEqual({ kind: 'circleOpened', tier: 4 });
    expect(state.circleTier).toBe(4);
    expect(state.inventory).toEqual({ 'key:thunder_eye': 2 });
    // used out of order, a later key opens more, and an earlier one then does nothing
    const later = useKeyItem(mkState({ inventory: { 'key:thunder_eye': 1, 'key:storm_heart': 1 } }), 'key:thunder_eye', content);
    expect(later.result).toEqual({ kind: 'circleOpened', tier: 6 });
    const none = useKeyItem(later.state, 'key:storm_heart', content);
    expect(none.result).toEqual({ kind: 'rejected', reason: 'noEffect' });
    expect(none.state).toBe(later.state);
  });

  it('rejects an unknown or missing key item', () => {
    const s = mkState();
    expect(useKeyItem(s, 'key:storm_heart', content)).toEqual({ state: s, result: { kind: 'rejected', reason: 'notOwned' } });
    expect(useKeyItem(s, 'key:nope', content).result).toEqual({ kind: 'rejected', reason: 'unknown' });
    expect(useKeyItem(mkState({ inventory: { 'mat:ember_core': 1 } }), 'mat:ember_core', content).result).toEqual({ kind: 'rejected', reason: 'unknown' });
    expect(useKeyItem(s, 'constructor', content).result).toEqual({ kind: 'rejected', reason: 'unknown' });
  });

  it('unlocks an item passive only when affordable (there is no fog any more)', () => {
    const rich = mkState({ inventory: { 'mat:ember_core': 5 } });
    const poor = mkState({ inventory: { 'mat:ember_core': 4 } });
    const short = unlockPassive(poor, 'ember_affinity', content);
    expect(short.result).toEqual({ kind: 'rejected', reason: 'requirement' });
    expect(short.state).toEqual(poor);

    const ok = unlockPassive(mkState({ inventory: { 'mat:ember_core': 6 } }), 'ember_affinity', content);
    expect(ok.result).toEqual({ kind: 'unlocked' });
    expect(ok.state.passives).toEqual(['ember_affinity']);
    expect(ok.state.inventory).toEqual({ 'mat:ember_core': 1 });

    const again = unlockPassive(ok.state, 'ember_affinity', content);
    expect(again.result).toEqual({ kind: 'rejected', reason: 'already' });
    expect(unlockPassive(rich, 'nope', content).result).toEqual({ kind: 'rejected', reason: 'unknown' });
  });

  it('boss and learned-count requirements', () => {
    const boss = mkPassive('b', { kind: 'cooldown', pct: 5 }, { kind: 'boss', bossId: 'm_boss' });
    const learned = mkPassive('l', { kind: 'cooldown', pct: 5 }, { kind: 'learned', count: 2, element: 'fire' });
    const c = withPassives(boss, learned);
    expect(passiveRequirementMet(mkState(), 'b', c)).toBe(false);
    expect(passiveRequirementMet(mkState({ defeatedBosses: ['m_boss'] }), 'b', c)).toBe(true);
    // mana_bolt has no element; only fire spells count
    expect(passiveRequirementMet(mkState({ learned: ['mana_bolt', 'fireball', 'wind_blade'] }), 'l', c)).toBe(false);
    expect(passiveRequirementMet(mkState({ learned: ['mana_bolt', 'fireball', 'flame_burst'] }), 'l', c)).toBe(true);
    // magic circle spells count by their elements; ids that do not resolve never count
    expect(passiveRequirementMet(mkState({ learned: ['fireball', 'm:fire.2.----f.-----.bolt'] }), 'l', c)).toBe(true);
    expect(passiveRequirementMet(mkState({ learned: ['fireball', 'c(fireball|lightning)'] }), 'l', c)).toBe(false);
    const any = withPassives(mkPassive('a', { kind: 'cooldown', pct: 5 }, { kind: 'learned', count: 3, element: null }));
    expect(passiveRequirementMet(mkState({ learned: ['mana_bolt', 'fireball', 'wind_blade'] }), 'a', any)).toBe(true);
    expect(passiveRequirementMet(mkState(), 'missing', c)).toBe(false);

    const done = unlockPassive(mkState({ defeatedBosses: ['m_boss'] }), 'b', c);
    expect(done.result).toEqual({ kind: 'unlocked' });
    expect(unlockPassive(mkState(), 'b', c).result).toEqual({ kind: 'rejected', reason: 'requirement' });
  });

  it('passiveBonuses sums damage per element and cooldown', () => {
    const zero = passiveBonuses(mkState(), content);
    expect(zero.cooldownPct).toBe(0);
    expect(zero.damagePct).toEqual({ all: 0, fire: 0, wind: 0, thunder: 0, earth: 0, water: 0 });
    const c = withPassives(
      mkPassive('p1', { kind: 'damage', element: 'fire', pct: 10 }, { kind: 'boss', bossId: 'x' }),
      mkPassive('p2', { kind: 'damage', element: 'fire', pct: 5 }, { kind: 'boss', bossId: 'x' }),
      mkPassive('p3', { kind: 'damage', element: null, pct: 3 }, { kind: 'boss', bossId: 'x' }),
      mkPassive('p4', { kind: 'cooldown', pct: 4 }, { kind: 'boss', bossId: 'x' }),
    );
    const b = passiveBonuses(mkState({ passives: ['p1', 'p2', 'p3', 'p4', 'ghost'] }), c);
    expect(b.damagePct.fire).toBe(15);
    expect(b.damagePct.all).toBe(3);
    expect(b.damagePct.water).toBe(0);
    expect(b.cooldownPct).toBe(4);
  });
});
