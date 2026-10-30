import { describe, expect, it } from 'vitest';
import type { Content, GameState, Monster, NamedSpellDef, Zone } from './model';
import {
  claimOffline, markAway, offlineLoot, offlineStage, OFFLINE_CAP_MS, OFFLINE_RATE, OFFLINE_TICK_MS,
} from './offline';
import { overlevelEfficiency } from './combat-rules';
import { createInitialState } from './persist';
import { createRng } from './rng';
import { LOOT_ROLLS } from './stage-clear';
import { stageTotal } from './stages';

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
  spells: { mana_bolt: spell({ id: 'mana_bolt' }) },
  recipes: [],
  monsters: {
    slime: mon({ id: 'slime', drops: [{ itemId: 'el:fire:1', chance: 0.5, min: 1, max: 3 }, { itemId: 'key:k', chance: 1, min: 1, max: 1 }] }),
    bat: mon({ id: 'bat', drops: [{ itemId: 'el:wind:1', chance: 0.25, min: 1, max: 1 }] }),
    b1: mon({ id: 'b1', boss: true }),
    golem: mon({ id: 'golem', tier: 5, defense: 1000 }),
  },
  zones: [zone('mist_meadow', 1, 'b1'), zone('thunder_gorge', 2, 'b1'), { ...zone('late', 3, 'b1'), monsters: ['slime', 'golem'] }],
  materials: {}, keyItems: {}, passives: {}, regions: [], baseSpells: {} as Content['baseSpells'],
};
const mist = data.zones[0]!;
const base = (o: Partial<GameState> = {}): GameState => ({ ...createInitialState(data), ...o });
const HOUR = 3_600_000;
const NOW = 100 * HOUR;
const away = (o: Partial<GameState> = {}) => base({
  clearedStages: { mist_meadow: 3 }, clearTimes: { 'mist_meadow:3': [150_000, 150_000, 200_000] }, ...o,
});

describe('offlineStage', () => {
  it('picks the last zone with a cleared stage, never the boss stage', () => {
    expect(offlineStage(base({ clearedStages: { mist_meadow: 10, thunder_gorge: 5 } }), data)).toMatchObject({ zoneId: 'thunder_gorge', stage: 5 });
    expect(offlineStage(base({ clearedStages: { mist_meadow: 10, thunder_gorge: 0 } }), data)).toMatchObject({ zoneId: 'mist_meadow', stage: 9 });
    expect(offlineStage(base({ unlockedZones: ['mist_meadow', 'thunder_gorge'], clearedStages: { mist_meadow: 10 } }), data)).toMatchObject({ zoneId: 'mist_meadow', stage: 9 });
    expect(offlineStage(base(), data)).toBeNull();
  });
});

describe('markAway', () => {
  it('sets awayAt once', () => {
    const a = markAway(base(), 500);
    expect(a.state.awayAt).toBe(500);
    expect(a.result).toEqual({ kind: 'away' });
    expect(markAway(a.state, 900).state.awayAt).toBe(500);
  });
});

describe('claimOffline', () => {
  it('pays one hour at the median clear time', () => {
    const s = away();
    const { state, result } = claimOffline(s, NOW - HOUR, NOW, data, createRng(1));
    expect(result.kind).toBe('offline');
    if (result.kind !== 'offline') return;
    expect(result).toMatchObject({ zoneId: 'mist_meadow', stage: 3, runs: 24, ticks: HOUR / OFFLINE_TICK_MS, capped: false, awayMs: HOUR });
    expect(state.offlineUntil).toBe(NOW);
    expect(state.awayAt).toBe(0);
    const grew: Record<string, number> = {};
    for (const [k, v] of Object.entries(state.inventory)) grew[k] = v - (s.inventory[k] ?? 0);
    expect(grew).toEqual(result.loot);
    expect(Object.keys(result.loot).length).toBeGreaterThan(0);
  });

  it('averages the middle two of an even count', () => {
    const s = away({ clearTimes: { 'mist_meadow:3': [100_000, 200_000] } });
    const r = claimOffline(s, NOW - HOUR, NOW, data, createRng(1)).result;
    expect(r.kind === 'offline' && r.runs).toBe(24);
  });

  it('uses awayAt when set, and a later lastClearAt wins', () => {
    const a = claimOffline(away({ awayAt: NOW - HOUR / 2 }), NOW - HOUR, NOW, data, createRng(1)).result;
    expect(a.kind === 'offline' && a.runs).toBe(12);
    const b = claimOffline(away({ awayAt: NOW - HOUR / 2, lastClearAt: NOW - HOUR / 4 }), NOW - HOUR, NOW, data, createRng(1)).result;
    expect(b.kind === 'offline' && b.runs).toBe(6);
    const c = claimOffline(away({ offlineUntil: NOW - HOUR / 4 }), NOW - HOUR, NOW, data, createRng(1)).result;
    expect(c.kind === 'offline' && c.runs).toBe(6);
  });

  it('caps at 8 hours', () => {
    const r = claimOffline(away(), NOW - 10 * HOUR, NOW, data, createRng(1)).result;
    expect(r.kind).toBe('offline');
    if (r.kind !== 'offline') return;
    expect(r.runs).toBe(Math.floor(OFFLINE_CAP_MS / 150_000));
    expect(r.capped).toBe(true);
    expect(r.awayMs).toBe(10 * HOUR);
  });

  it('pays in 30 s ticks, a share of a run when the time is shorter than a clear', () => {
    const r = claimOffline(away({ awayAt: NOW - 45_000 }), NOW - HOUR, NOW, data, createRng(1)).result;
    expect(r.kind).toBe('offline');
    if (r.kind !== 'offline') return;
    expect(r.ticks).toBe(1);
    expect(r.runs).toBeCloseTo(OFFLINE_TICK_MS / 150_000);
    expect(r.awayMs).toBe(45_000);
  });

  it('none below one tick', () => {
    const r = claimOffline(away({ awayAt: NOW - (OFFLINE_TICK_MS - 1) }), NOW - HOUR, NOW, data, createRng(1));
    expect(r.result).toEqual({ kind: 'none' });
  });

  it('clamps negative time to none', () => {
    const r = claimOffline(away(), NOW + HOUR, NOW, data, createRng(1));
    expect(r.result).toEqual({ kind: 'none' });
  });

  it('none without clear times, with a spell that cannot damage, or below one tick', () => {
    const cases: GameState[] = [
      away({ clearTimes: {}, awayAt: 5 }),
      base({ clearedStages: { late: 3 }, clearTimes: { 'late:3': [150_000] }, awayAt: 5, offlineUntil: 7 }),
      away({ awayAt: 5, offlineUntil: NOW - 1000 }),
    ];
    for (const s of cases) {
      const r = claimOffline(s, NOW - HOUR, NOW, data, createRng(1));
      expect(r.result).toEqual({ kind: 'none' });
      expect(r.state.awayAt).toBe(0);
      // a real away still ends here, so the frozen time is never recorded as a clear time
      expect(r.state.offlineUntil).toBe(NOW);
      expect(r.state.inventory).toBe(s.inventory);
    }
  });

  it('a none claim without an away mark (a reload) leaves offlineUntil alone', () => {
    const s = away({ awayAt: 0, clearTimes: {} });
    expect(claimOffline(s, NOW - HOUR, NOW, data, createRng(1)).state).toBe(s);
  });

  it('a second claim at the same moment pays nothing', () => {
    const first = claimOffline(away(), NOW - HOUR, NOW, data, createRng(1));
    expect(first.result.kind).toBe('offline');
    expect(claimOffline(first.state, NOW - HOUR, NOW, data, createRng(2)).result).toEqual({ kind: 'none' });
  });

  it('never pays key items', () => {
    const r = claimOffline(away(), NOW - 8 * HOUR, NOW, data, createRng(1)).result;
    expect(r.kind).toBe('offline');
    if (r.kind !== 'offline') return;
    expect(Object.keys(r.loot).some((k) => k.startsWith('key:'))).toBe(false);
  });
});

describe('offlineLoot', () => {
  const expectedOf = (runs: number, rate: number, id: string, drop: { chance: number; min: number; max: number }, tier: number) =>
    ((runs * stageTotal(mist, 3)) / mist.monsters.length) * (LOOT_ROLLS + 1) * drop.chance * overlevelEfficiency(tier, 1) *
    ((drop.min + drop.max) / 2) * rate;

  it('matches the expected value within 5% over many runs', () => {
    const runs = 200;
    const rng = createRng(7);
    const total = offlineLoot(mist, 3, runs, 1, data, rng)['el:fire:1']!;
    const want = expectedOf(runs, OFFLINE_RATE, 'el:fire:1', { chance: 0.5, min: 1, max: 3 }, 1);
    expect(Math.abs(total - want) / want).toBeLessThan(0.05);
  });

  it('pays OFFLINE_RATE of the full-rate expectation, and omits key items and zeros', () => {
    expect(OFFLINE_RATE).toBe(0.5);
    const drop = { chance: 0.5, min: 1, max: 3 };
    const runs = 400;
    const total = offlineLoot(mist, 3, runs, 1, data, createRng(3))['el:fire:1']!;
    const full = expectedOf(runs, 1, 'x', drop, 1);
    expect(Math.abs(total - full / 2) / (full / 2)).toBeLessThan(0.05);
    const loot = offlineLoot(mist, 3, 100, 1, data, createRng(3));
    expect(Object.keys(loot).every((k) => !k.startsWith('key:'))).toBe(true);
    expect(Object.values(loot).every((n) => n > 0)).toBe(true);
  });

  it('rounds a fractional expectation up or down at random, averaging to the expectation', () => {
    // 1 run: 7 foes over 2 monsters = 3.5 foes of bat; 3.5 * 3 * 0.25 * 1 * 0.5 = 1.3125 el:wind:1
    const want = expectedOf(1, OFFLINE_RATE, 'el:wind:1', { chance: 0.25, min: 1, max: 1 }, 1);
    expect(want % 1).toBeGreaterThan(0);
    const seen = new Set<number>();
    let sum = 0;
    const n = 2000;
    for (let seed = 1; seed <= n; seed++) {
      const q = offlineLoot(mist, 3, 1, 1, data, createRng(seed))['el:wind:1'] ?? 0;
      seen.add(q);
      sum += q;
    }
    expect([...seen].sort()).toEqual([Math.floor(want), Math.floor(want) + 1]);
    expect(Math.abs(sum / n - want)).toBeLessThan(0.05);
  });
});
