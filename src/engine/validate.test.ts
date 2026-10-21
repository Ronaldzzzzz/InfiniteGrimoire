import { describe, expect, it } from 'vitest';
import { STEP_MS, createBattle, stepBattle } from './battle';
import { createRng } from './rng';
import { createInitialState, type GameState } from './state';
import { GAIN_SLACK, GAIN_TOLERANCE, maxGain, validateUpload } from './validate';
import type { GameData, MonsterDef, SpellDef } from './types';

const spell = (o: Partial<SpellDef> & { id: string }): SpellDef => ({
  name: o.id, nameEn: o.id, elements: [], tier: 1, attack: 10, cooldownMs: 900, pattern: 'bolt',
  prerequisites: [], hint: 'h', grimoire: { ring: 0, offset: 0 }, ...o,
});
const mon = (o: Partial<MonsterDef> & { id: string }): MonsterDef => ({
  name: o.id, nameEn: o.id, element: 'fire', tier: 1, hp: 20, defense: 0, regenPerSec: 0, boss: false,
  drops: [], ...o,
});
const zone = (id: string, order: number, monsters: string[], bossId: string) => ({
  id, name: id, nameEn: id, order, monsters, bossId, killsForBoss: 5, maxAlive: 3, spawnIntervalMs: 1000,
});

const data: GameData = {
  spells: {
    mana_bolt: spell({ id: 'mana_bolt' }),
    strong: spell({ id: 'strong', tier: 9, attack: 500 }),
  },
  recipes: [],
  monsters: {
    slime: mon({
      id: 'slime',
      drops: [
        { itemId: 'el:fire:1', chance: 1, min: 1, max: 2 },
        { itemId: 'el:fire:2', chance: 0.1, min: 1, max: 1 },
        { itemId: 'mat:goo', chance: 1, min: 1, max: 1 },
      ],
    }),
    wall: mon({ id: 'wall', tier: 9, defense: 5000, drops: [{ itemId: 'el:water:1', chance: 1, min: 1, max: 3 }] }),
    b1: mon({ id: 'b1', boss: true, hp: 50, drops: [{ itemId: 'el:wind:1', chance: 1, min: 1, max: 4 }] }),
    b2: mon({ id: 'b2', boss: true, tier: 9, defense: 5000 }),
    b3: mon({ id: 'b3', boss: true }),
  },
  zones: [
    zone('z1', 1, ['slime'], 'b1'),
    zone('z2', 2, ['slime'], 'b2'),
    zone('z3', 3, ['slime'], 'b3'),
    zone('zw', 4, ['wall'], 'b2'),
  ],
};

const base = (): GameState => createInitialState(data);
const withInv = (s: GameState, inv: Record<string, number>): GameState => ({ ...s, inventory: inv });

describe('maxGain', () => {
  it('counts kills, drop maxima, grade conversion and boss drops', () => {
    // 10s: maxKills = 10 + 3 = 13; slime per kill: fire 2 + 3*1(grade 2) = 5; goo 1
    const g = maxGain(base(), 10_000, data);
    expect(g.elements.fire).toBe(13 * 5);
    expect(g.materials['mat:goo']).toBe(13);
    // boss drops: floor(13/5)+1 = 3 boss kills * 4
    expect(g.elements.wind).toBe(12);
    expect(g.elements.water).toBe(0);
  });
  it('treats negative elapsed as zero', () => {
    expect(maxGain(base(), -5, data)).toEqual(maxGain(base(), 0, data));
  });
});

describe('validateUpload', () => {
  const fail = (r: ReturnType<typeof validateUpload>): string[] => {
    expect(r.ok).toBe(false);
    return r.ok ? [] : r.reasons;
  };

  it('identical state is ok', () => {
    expect(validateUpload(base(), base(), 0, data)).toEqual({ ok: true });
  });

  it('normal gain within bound is ok', () => {
    const prev = base();
    let game = prev;
    let battle = createBattle('z1');
    const rng = createRng(7);
    for (let t = 0; t < 30_000; t += STEP_MS) {
      const r = stepBattle(game, battle, data, rng);
      game = r.game; battle = r.battle;
    }
    expect(Object.keys(game.inventory).length).toBeGreaterThan(0);
    expect(validateUpload(prev, game, 30_000, data)).toEqual({ ok: true });
  });

  it('inventory explosion rejected', () => {
    const next = withInv(base(), { 'el:fire:1': 10_000 });
    expect(fail(validateUpload(base(), next, 30_000, data)).join()).toContain('fire');
  });

  it('material explosion rejected, including unknown materials', () => {
    const r = fail(validateUpload(base(), withInv(base(), { 'mat:goo': 10_000, 'mat:nope': 7 }), 30_000, data));
    expect(r.join()).toContain('mat:goo');
    expect(r.join()).toContain('mat:nope');
  });

  it('slack applies per element and decreases are fine', () => {
    const prev = withInv(base(), { 'el:fire:1': 50 });
    expect(validateUpload(prev, withInv(base(), {}), 0, data)).toEqual({ ok: true });
    const tiny = withInv(base(), { 'mat:nope': GAIN_SLACK });
    expect(validateUpload(base(), tiny, 0, data)).toEqual({ ok: true });
    expect(validateUpload(base(), withInv(base(), { 'mat:nope': GAIN_SLACK + 1 }), 0, data).ok).toBe(false);
    expect(GAIN_TOLERANCE).toBe(1.25);
  });

  it('added learned spell rejected', () => {
    const next = { ...base(), learned: ['mana_bolt', 'strong'] };
    expect(fail(validateUpload(base(), next, 1000, data)).join()).toContain('learned');
  });

  it('learned compared as set', () => {
    const prev = { ...base(), learned: ['mana_bolt', 'strong'] };
    const next = { ...prev, learned: ['strong', 'mana_bolt'] };
    expect(validateUpload(prev, next, 0, data)).toEqual({ ok: true });
  });

  it('modified synthesisLog rejected', () => {
    const next = { ...base(), synthesisLog: { r: { attempts: 1, results: {}, noReaction: true } } };
    expect(fail(validateUpload(base(), next, 1000, data)).join()).toContain('synthesisLog');
  });

  it('equipped must be learned and currentZone unlocked', () => {
    expect(fail(validateUpload(base(), { ...base(), equipped: 'strong' }, 0, data)).join()).toContain('equipped');
    expect(fail(validateUpload(base(), { ...base(), currentZone: 'z2' }, 0, data)).join()).toContain('currentZone');
  });

  it('new boss with enough time is ok and unlocks the next zone', () => {
    const next = { ...base(), defeatedBosses: ['b1'], unlockedZones: ['z1', 'z2'] };
    expect(validateUpload(base(), next, 5000 / GAIN_TOLERANCE + 1, data)).toEqual({ ok: true });
  });

  it('boss defeated too fast rejected', () => {
    const next = { ...base(), defeatedBosses: ['b1'], unlockedZones: ['z1', 'z2'] };
    expect(fail(validateUpload(base(), next, 1000, data)).join()).toContain('b1');
  });

  it('boss in locked zone rejected', () => {
    const next = { ...base(), defeatedBosses: ['b2'], unlockedZones: ['z1', 'z3'] };
    expect(fail(validateUpload(base(), next, 600_000, data)).join()).toContain('b2');
  });

  it('chained bosses in one upload are allowed with enough combined time', () => {
    const next = { ...base(), defeatedBosses: ['b1', 'b2'], unlockedZones: ['z1', 'z2', 'z3'] };
    const prev = { ...base(), learned: ['mana_bolt', 'strong'] };
    expect(validateUpload(prev, { ...next, learned: prev.learned }, 10_000 / GAIN_TOLERANCE + 1, data)).toEqual({ ok: true });
    expect(validateUpload(prev, { ...next, learned: prev.learned }, 7000, data).ok).toBe(false);
  });

  it('boss that no learned spell can damage rejected', () => {
    const prev = { ...base(), unlockedZones: ['z1', 'z2'] };
    const next = { ...prev, defeatedBosses: ['b2'], unlockedZones: ['z1', 'z2', 'z3'] };
    expect(fail(validateUpload(prev, next, 600_000, data)).join()).toContain('b2');
  });

  it('zone unlocked without boss rejected', () => {
    const next = { ...base(), unlockedZones: ['z1', 'z2'] };
    expect(fail(validateUpload(base(), next, 600_000, data)).join()).toContain('unlockedZones');
  });

  it('no damaging spell means zero element gain allowed beyond slack', () => {
    const prev = { ...base(), currentZone: 'zw', unlockedZones: ['zw'] };
    expect(maxGain(prev, 600_000, data).elements.water).toBe(0);
    expect(validateUpload(prev, withInv(prev, { 'el:water:1': GAIN_SLACK }), 600_000, data)).toEqual({ ok: true });
    expect(validateUpload(prev, withInv(prev, { 'el:water:1': GAIN_SLACK + 1 }), 600_000, data).ok).toBe(false);
  });

  it('element upgrade conversion is ok', () => {
    const prev = withInv(base(), { 'el:fire:1': 3 });
    const next = withInv(base(), { 'el:fire:2': 1 });
    expect(validateUpload(prev, next, 0, data)).toEqual({ ok: true });
  });
});
