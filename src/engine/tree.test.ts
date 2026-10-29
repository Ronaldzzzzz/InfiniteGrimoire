import { describe, expect, it } from 'vitest';
import { content } from './content';
import { BASE_DEPTH_CAP, depthCap, passiveBonuses, passiveRequirementMet, revealRegion, unlockPassive, visibleRegions } from './tree';
import { HARD_MAX_DEPTH } from './spells';
import type { Content, GameState, Passive } from './model';

const mkState = (over: Partial<GameState> = {}): GameState => ({
  version: 2, inventory: {}, learned: ['mana_bolt'], equipped: 'mana_bolt', levels: {}, revealed: [], passives: [],
  currentZone: 'z1', unlockedZones: ['z1'], defeatedBosses: [], currentStage: 1, clearedStages: {}, lastClearAt: 0, synthesisLog: {}, ...over,
});
const withPassives = (...ps: Passive[]): Content => ({
  ...content, passives: { ...content.passives, ...Object.fromEntries(ps.map((p) => [p.id, p])) },
});
const mkPassive = (id: string, bonus: Passive['bonus'], unlock: Passive['unlock'], region = 'core'): Passive => ({
  id, name: id, nameEn: id, desc: '', node: { region, ring: 1, angle: 0 }, bonus, unlock,
});

describe('tree', () => {
  it('starts with the initially visible regions', () => {
    expect([...visibleRegions(mkState(), content)]).toEqual(['core']);
    expect(visibleRegions(mkState({ revealed: ['outer'] }), content).has('outer')).toBe(true);
  });

  it('reveals a region with a key item and consumes it', () => {
    const s = mkState({ inventory: { 'key:storm_heart': 1 } });
    const { state, result } = revealRegion(s, 'key:storm_heart', content);
    expect(result).toEqual({ kind: 'revealed', region: 'outer' });
    expect(state.revealed).toEqual(['outer']);
    expect(state.inventory).toEqual({});
  });

  it('rejects revealing without the item or twice', () => {
    const s = mkState();
    const a = revealRegion(s, 'key:storm_heart', content);
    expect(a.result).toEqual({ kind: 'rejected', reason: 'notOwned' });
    expect(a.state).toEqual(s);
    const b = revealRegion(s, 'key:nope', content);
    expect(b.result).toEqual({ kind: 'rejected', reason: 'unknown' });
    const twice = mkState({ inventory: { 'key:storm_heart': 1 }, revealed: ['outer'] });
    const c = revealRegion(twice, 'key:storm_heart', content);
    expect(c.result).toEqual({ kind: 'rejected', reason: 'alreadyRevealed' });
    expect(c.state).toEqual(twice);
  });

  it('unlocks an item passive only when visible and affordable', () => {
    const rich = mkState({ inventory: { 'mat:ember_core': 5 } });
    const hidden = unlockPassive(rich, 'ember_affinity', content);
    expect(hidden.result).toEqual({ kind: 'rejected', reason: 'hidden' });
    expect(hidden.state).toEqual(rich);

    const poor = mkState({ revealed: ['outer'], inventory: { 'mat:ember_core': 4 } });
    const short = unlockPassive(poor, 'ember_affinity', content);
    expect(short.result).toEqual({ kind: 'rejected', reason: 'requirement' });
    expect(short.state).toEqual(poor);

    const ok = unlockPassive(mkState({ revealed: ['outer'], inventory: { 'mat:ember_core': 6 } }), 'ember_affinity', content);
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
    // crafted spells are not named spells
    expect(passiveRequirementMet(mkState({ learned: ['fireball', 'c(fireball|lightning)'] }), 'l', c)).toBe(false);
    const any = withPassives(mkPassive('a', { kind: 'cooldown', pct: 5 }, { kind: 'learned', count: 3, element: null }));
    expect(passiveRequirementMet(mkState({ learned: ['mana_bolt', 'fireball', 'wind_blade'] }), 'a', any)).toBe(true);
    expect(passiveRequirementMet(mkState(), 'missing', c)).toBe(false);

    const done = unlockPassive(mkState({ defeatedBosses: ['m_boss'] }), 'b', c);
    expect(done.result).toEqual({ kind: 'unlocked' });
    expect(unlockPassive(mkState(), 'b', c).result).toEqual({ kind: 'rejected', reason: 'requirement' });
  });

  it('depth passives raise the cap up to HARD_MAX_DEPTH', () => {
    expect(BASE_DEPTH_CAP).toBe(3);
    expect(depthCap(mkState(), content)).toBe(3);
    const d1 = mkPassive('d1', { kind: 'depth', add: 2 }, { kind: 'boss', bossId: 'x' });
    const d2 = mkPassive('d2', { kind: 'depth', add: 20 }, { kind: 'boss', bossId: 'x' });
    const c = withPassives(d1, d2);
    expect(depthCap(mkState({ passives: ['d1'] }), c)).toBe(5);
    expect(depthCap(mkState({ passives: ['d1', 'd2'] }), c)).toBe(HARD_MAX_DEPTH);
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
