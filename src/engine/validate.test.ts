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

const data2: GameData = {
  spells: { mana_bolt: spell({ id: 'mana_bolt' }) },
  recipes: [],
  monsters: {
    ma: mon({ id: 'ma', drops: [{ itemId: 'el:fire:1', chance: 1, min: 1, max: 2 }, { itemId: 'mat:a', chance: 1, min: 1, max: 1 }] }),
    mb1: mon({
      id: 'mb1',
      drops: [
        { itemId: 'el:water:1', chance: 1, min: 1, max: 3 },
        { itemId: 'el:fire:1', chance: 1, min: 1, max: 1 },
        { itemId: 'mat:b', chance: 1, min: 1, max: 2 },
      ],
    }),
    mb2: mon({
      id: 'mb2',
      drops: [
        { itemId: 'el:water:1', chance: 1, min: 1, max: 1 },
        { itemId: 'el:water:2', chance: 1, min: 1, max: 1 },
        { itemId: 'mat:b', chance: 1, min: 1, max: 1 },
      ],
    }),
    bA: mon({ id: 'bA', boss: true, drops: [{ itemId: 'el:wind:1', chance: 1, min: 1, max: 4 }] }),
    bB: mon({ id: 'bB', boss: true }),
    bU: mon({ id: 'bU', boss: true, tier: 9, defense: 5000, drops: [{ itemId: 'el:earth:1', chance: 1, min: 1, max: 10 }] }),
  },
  zones: [
    { ...zone('A', 1, ['ma'], 'bA'), maxAlive: 3, spawnIntervalMs: 1000, killsForBoss: 5 },
    { ...zone('B', 2, ['mb1', 'mb2'], 'bB'), maxAlive: 2, spawnIntervalMs: 2000, killsForBoss: 5 },
    { ...zone('U', 3, ['ma'], 'bU'), maxAlive: 3, spawnIntervalMs: 1000, killsForBoss: 5 },
  ],
};
const st = (unlocked: string[], extra: Partial<GameState> = {}): GameState => ({
  ...createInitialState(data2), currentZone: unlocked[0]!, unlockedZones: unlocked, ...extra,
});

describe('maxGain bounds (fixture data2)', () => {
  it('per-monster maximum, not sum and not per-entry maximum', () => {
    // zone B: maxKills = 10000/2000 + 2 = 7; water mb1=3, mb2=1+3=4 -> 7*4
    const g = maxGain(st(['B']), 10_000, data2);
    expect(g.elements.water).toBe(28);
    expect(g.materials['mat:b']).toBe(7 * 2);
    expect(g.elements.fire).toBe(7);
  });

  it('excludes drops of a boss no learned spell can damage', () => {
    const g = maxGain(st(['U']), 10_000, data2);
    expect(g.elements.earth).toBe(0);
    expect(g.elements.fire).toBe(13 * 2);
  });

  it('includes drops of a hittable boss', () => {
    // A: maxKills 13, boss kills floor(13/5)+1 = 3, wind 4 each
    expect(maxGain(st(['A']), 10_000, data2).elements.wind).toBe(12);
  });

  it('takes the max across zones and adds a maxAlive burst for the other zones', () => {
    const g = maxGain(st(['A', 'B']), 10_000, data2);
    // fire: A full (13*2=26) + B burst (2*1) = 28 ; B full (7) + A burst (3*2=6) = 13
    expect(g.elements.fire).toBe(28);
    expect(g.elements.water).toBe(28); // only B yields water
    expect(g.materials['mat:a']).toBe(13);
    expect(g.materials['mat:b']).toBe(14);
  });

  it('zoneIds parameter overrides the unlocked zones', () => {
    expect(maxGain(st(['A']), 10_000, data2, ['B']).elements.water).toBe(28);
  });
});

describe('validateUpload (fixture data2)', () => {
  it('boss killed early, then farming the newly unlocked zone, is ok', () => {
    const prev = st(['A']);
    const next = st(['A', 'B'], { currentZone: 'B', defeatedBosses: ['bA'], inventory: { 'el:water:1': 20, 'mat:b': 10 } });
    expect(validateUpload(prev, next, 10_000, data2)).toEqual({ ok: true });
  });

  it('gain in a zone that is still locked is rejected', () => {
    const prev = st(['A']);
    const next = st(['A'], { inventory: { 'el:water:1': 20 } });
    expect(validateUpload(prev, next, 10_000, data2).ok).toBe(false);
  });

  it('boss in a locked zone rejected even though a spell can hit it', () => {
    const prev = st(['A']);
    const next = st(['A', 'U'], { defeatedBosses: ['bB'] });
    const r = validateUpload(prev, next, 600_000, data2);
    expect(r.ok ? '' : r.reasons.join()).toContain('locked zone');
  });

  it('tolerance boundary: floor(bound * tolerance + slack) is ok, one above is rejected', () => {
    // zone A, 0ms: maxKills 3 -> mat:a bound 3 -> limit 9.75 ; fire bound 6 -> limit 13.5
    expect(validateUpload(st(['A']), st(['A'], { inventory: { 'mat:a': 9 } }), 0, data2)).toEqual({ ok: true });
    expect(validateUpload(st(['A']), st(['A'], { inventory: { 'mat:a': 10 } }), 0, data2).ok).toBe(false);
    expect(validateUpload(st(['A']), st(['A'], { inventory: { 'el:fire:1': 13 } }), 0, data2)).toEqual({ ok: true });
    expect(validateUpload(st(['A']), st(['A'], { inventory: { 'el:fire:1': 14 } }), 0, data2).ok).toBe(false);
  });

  it('defeatedBosses shrinking is rejected', () => {
    const prev = st(['A', 'B'], { defeatedBosses: ['bA'] });
    const next = st(['A', 'B'], { defeatedBosses: [] });
    const r = validateUpload(prev, next, 0, data2);
    expect(r.ok ? '' : r.reasons.join()).toContain('bA');
  });
});
