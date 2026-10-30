import { describe, expect, it } from 'vitest';
import type { Content, GameState, Monster, NamedSpellDef, Zone } from './model';
import { createInitialState } from './persist';
import { createRng } from './rng';
import { claimStage, stageLoot } from './stage-clear';
import { minStageMs, stageTotal } from './stages';

const words = { pre: 'p', noun: 'n', preEn: 'p', nounEn: 'n' };
const spell = (o: Partial<NamedSpellDef> & { id: string }): NamedSpellDef => ({
  name: o.id, nameEn: o.id, desc: '', elements: [], tier: 1, attack: 10, cooldownMs: 900,
  effects: [{ kind: 'bolt', mult: 1, count: 1, radius: 0.03, target: 'nearest' }], words, affinity: 'base', depth: 0,
  named: true, school: 'evocation', hint: 'h', prerequisites: [], node: null, ...o,
});
const mon = (o: Partial<Monster> & { id: string }): Monster => ({
  name: o.id, nameEn: o.id, element: 'fire', tier: 1, hp: 20, defense: 0, regenPerSec: 0, speed: 0.05, radius: 0.03,
  boss: false, drops: [], ...o,
});
const stages = Array.from({ length: 10 }, (_, i) => ({ waves: i === 9 ? [2] : [3, 4] }));
const zone = (id: string, order: number, bossId: string): Zone => ({
  id, name: id, nameEn: id, order, monsters: ['slime', 'bat'], bossId, stages,
});

const data: Content = {
  spells: { mana_bolt: spell({ id: 'mana_bolt' }), big: spell({ id: 'big', tier: 5 }) },
  recipes: [],
  monsters: {
    slime: mon({ id: 'slime', drops: [{ itemId: 'el:fire:1', chance: 0.5, min: 1, max: 3 }, { itemId: 'mat:goo', chance: 0.2, min: 1, max: 1 }] }),
    bat: mon({ id: 'bat', drops: [{ itemId: 'el:wind:1', chance: 1, min: 1, max: 1 }] }),
    b1: mon({ id: 'b1', boss: true, drops: [{ itemId: 'el:fire:2', chance: 1, min: 2, max: 2 }, { itemId: 'key:k1', chance: 1, min: 1, max: 1 }] }),
    b2: mon({ id: 'b2', boss: true }),
    golem: mon({ id: 'golem', tier: 5, defense: 1000 }),
  },
  zones: [zone('z1', 1, 'b1'), zone('z2', 2, 'b2'), { ...zone('z3', 3, 'b2'), monsters: ['slime', 'golem'] }],
  materials: {}, keyItems: {}, passives: {}, regions: [], baseSpells: {} as Content['baseSpells'],
};

const base = (o: Partial<GameState> = {}): GameState => ({ ...createInitialState(data), ...o });
const T = 1_000_000;
const count = (items: string[]) => items.length;

describe('claimStage', () => {
  it('claims the next stage: cleared goes up, lastClearAt is now, loot is added', () => {
    const { state, result } = claimStage(base(), 'z1', 1, T, data, createRng(1));
    expect(result.kind).toBe('cleared');
    if (result.kind !== 'cleared') return;
    expect(result.loot.length).toBeGreaterThan(0);
    expect(state.clearedStages).toEqual({ z1: 1 });
    expect(state.lastClearAt).toBe(T);
    const total = Object.values(state.inventory).reduce((a, b) => a + b, 0);
    expect(total).toBe(result.loot.length);
    for (const id of result.loot) expect(state.inventory[id]).toBeGreaterThan(0);
  });

  it('a repeated stage-clear is rejected as tooFast', () => {
    const first = claimStage(base(), 'z1', 1, T, data, createRng(1)).state;
    const again = claimStage(first, 'z1', 2, T, data, createRng(2));
    expect(again.result).toEqual({ kind: 'rejected', reason: 'tooFast' });
    expect(again.state).toBe(first);
    // just under the fastest possible stage (with the tolerance) is still too fast; at it, ok
    const min = minStageMs(data.zones[0]!, 2) / 1.25;
    expect(claimStage(first, 'z1', 2, T + min - 1, data, createRng(2)).result.kind).toBe('rejected');
    expect(claimStage(first, 'z1', 2, T + min, data, createRng(2)).result.kind).toBe('cleared');
  });

  it('rejects a locked zone and a stage beyond highestPlayable', () => {
    expect(claimStage(base(), 'z2', 1, T, data, createRng(1)).result).toEqual({ kind: 'rejected', reason: 'locked' });
    expect(claimStage(base(), 'nowhere', 1, T, data, createRng(1)).result).toEqual({ kind: 'rejected', reason: 'locked' });
    expect(claimStage(base(), 'z1', 2, T, data, createRng(1)).result).toEqual({ kind: 'rejected', reason: 'notReached' });
    expect(claimStage(base(), 'z1', 0, T, data, createRng(1)).result).toEqual({ kind: 'rejected', reason: 'notReached' });
    expect(claimStage(base(), 'z1', 1.5, T, data, createRng(1)).result).toEqual({ kind: 'rejected', reason: 'notReached' });
    expect(claimStage(base({ clearedStages: { z1: 10 } }), 'z1', 11, T, data, createRng(1)).result.kind).toBe('rejected');
  });

  it('the boss stage needs the boss in defeatedBosses', () => {
    const s = base({ clearedStages: { z1: 9 } });
    expect(claimStage(s, 'z1', 10, T, data, createRng(1)).result).toEqual({ kind: 'rejected', reason: 'bossAlive' });
    const won = claimStage({ ...s, defeatedBosses: ['b1'] }, 'z1', 10, T, data, createRng(1));
    expect(won.result.kind).toBe('cleared');
    expect(won.state.clearedStages.z1).toBe(10);
  });

  it('rejects a claim for a zone the player is not in', () => {
    const s = base({ unlockedZones: ['z1', 'z2'] });
    const r = claimStage(s, 'z2', 1, T, data, createRng(1));
    expect(r.result).toEqual({ kind: 'rejected', reason: 'elsewhere' });
    expect(r.state).toBe(s);
    expect(claimStage({ ...s, currentZone: 'z2' }, 'z2', 1, T, data, createRng(1)).result.kind).toBe('cleared');
  });

  it('rejects cannotDamage when the equipped spell cannot damage every monster of the zone', () => {
    const s = base({ unlockedZones: ['z1', 'z2', 'z3'], currentZone: 'z3' });
    const r = claimStage(s, 'z3', 1, T, data, createRng(1));
    expect(r.result).toEqual({ kind: 'rejected', reason: 'cannotDamage' });
    expect(r.state).toBe(s);
    // a tier 5 spell is within one tier of the golem
    expect(claimStage({ ...s, learned: [...s.learned, 'big'], equipped: 'big' }, 'z3', 1, T, data, createRng(1)).result.kind).toBe('cleared');
    // checked before the clock: a fast repeat with a weak spell is cannotDamage, not tooFast
    expect(claimStage({ ...s, lastClearAt: T }, 'z3', 1, T, data, createRng(1)).result).toEqual({ kind: 'rejected', reason: 'cannotDamage' });
    // and after the reach check
    expect(claimStage(s, 'z3', 2, T, data, createRng(1)).result).toEqual({ kind: 'rejected', reason: 'notReached' });
  });

  it('records clear times: floor at minStageMs, none for boss or first clear, newest 5 kept', () => {
    const z = data.zones[0]!;
    const min = minStageMs(z, 1);
    expect(claimStage(base(), 'z1', 1, T, data, createRng(1)).state.clearTimes).toEqual({});
    const fast = claimStage(base({ lastClearAt: T - 2400 }), 'z1', 1, T, data, createRng(1)).state;
    expect(fast.clearTimes['z1:1']).toEqual([min]);
    const slow = claimStage(base({ lastClearAt: T - 100_000 }), 'z1', 1, T, data, createRng(1)).state;
    expect(slow.clearTimes['z1:1']).toEqual([100_000]);
    const away = claimStage(base({ lastClearAt: 1 }), 'z1', 1, 100_000_000, data, createRng(1)).state;
    expect(away.clearTimes['z1:1']).toEqual([28_800_000]);
    const boss = claimStage(base({ clearedStages: { z1: 9 }, defeatedBosses: ['b1'], lastClearAt: T - 100_000 }), 'z1', 10, T, data, createRng(1)).state;
    expect(boss.clearTimes).toEqual({});
    let s = base({ lastClearAt: T - 10_000, clearTimes: { 'z1:1': [1, 2, 3, 4, 5] } });
    s = claimStage(s, 'z1', 1, T, data, createRng(1)).state;
    expect(s.clearTimes['z1:1']).toEqual([2, 3, 4, 5, 10_000]);
  });

  it('re-claiming an already cleared stage gives loot but keeps cleared', () => {
    const { state, result } = claimStage(base({ clearedStages: { z1: 6 } }), 'z1', 3, T, data, createRng(1));
    expect(result.kind).toBe('cleared');
    expect(state.clearedStages.z1).toBe(6);
    expect(Object.keys(state.inventory).length).toBeGreaterThan(0);
  });
});

describe('stageLoot', () => {
  const z1 = data.zones[0]!;
  /** expected items per foe, one roll of its table, keys excluded */
  const perFoe = (id: string) => data.monsters[id]!.drops
    .filter((d) => !d.itemId.startsWith('key:'))
    .reduce((a, d) => a + d.chance * (d.min + d.max) / 2, 0);

  it('loot is about twice the stage\'s drops and never has key items', () => {
    for (const stage of [1, 10]) {
      const rng = createRng(20261029);
      let n = 0;
      const runs = 200;
      for (let i = 0; i < runs; i++) {
        const loot = stageLoot(z1, stage, 1, data, rng);
        expect(loot.some((id) => id.startsWith('key:'))).toBe(false);
        n += count(loot);
      }
      const total = stageTotal(z1, stage);
      const normal = (perFoe('slime') + perFoe('bat')) / 2;
      const once = stage === 10 ? (total - 1) * normal + perFoe('b1') : total * normal;
      const ratio = n / runs / once;
      expect(ratio, `stage ${stage}`).toBeGreaterThan(1.6);
      expect(ratio, `stage ${stage}`).toBeLessThan(2.4);
    }
  });

  it('overleveling thins the loot like kills do', () => {
    const sum = (tier: number) => {
      const rng = createRng(5);
      let n = 0;
      for (let i = 0; i < 200; i++) n += stageLoot(z1, 1, tier, data, rng).length;
      return n;
    };
    expect(sum(5)).toBeLessThan(sum(1));
  });
});
