import { describe, expect, it } from 'vitest';
import { createBattle, stepBattle, STEP_MS } from './combat';
import { content as realContent } from './content';
import type { Content, Monster, NamedSpellDef, Zone } from './model';
import { createInitialState } from './persist';
import { createRng } from './rng';
import { GAIN_SLACK, GAIN_TOLERANCE, maxGain, maxKills, validateUpload } from './audit';
import { gradeValue } from './types';
import type { GameState } from './model';

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
/** Packs off by default (size 0), so the arithmetic matches the MVP validator's. */
const zone = (id: string, order: number, monsters: string[], bossId: string, extra: Partial<Zone> = {}): Zone => ({
  id, name: id, nameEn: id, order, monsters, bossId, killsForBoss: 5, maxAlive: 3, spawnIntervalMs: 1000,
  pack: { everyMs: 3_600_000, size: 0 }, stages: [], ...extra,
});
const fixture = (o: Partial<Content>): Content => ({
  spells: {}, recipes: [], monsters: {}, zones: [], materials: {}, keyItems: {}, passives: {}, regions: [],
  baseSpells: {} as Content['baseSpells'], ...o,
});

const data = fixture({
  spells: {
    mana_bolt: spell({ id: 'mana_bolt' }),
    strong: spell({ id: 'strong', tier: 9, attack: 500 }),
  },
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
    b1: mon({
      id: 'b1', boss: true, hp: 50,
      drops: [{ itemId: 'el:wind:1', chance: 1, min: 1, max: 4 }, { itemId: 'key:k1', chance: 1, min: 1, max: 1 }],
    }),
    b2: mon({ id: 'b2', boss: true, tier: 9, defense: 5000, drops: [{ itemId: 'key:k2', chance: 1, min: 1, max: 1 }] }),
    b3: mon({ id: 'b3', boss: true }),
    bL: mon({ id: 'bL', boss: true, tier: 3, defense: 1000 }),
  },
  zones: [
    zone('z1', 1, ['slime'], 'b1'),
    zone('z2', 2, ['slime'], 'b2'),
    zone('z3', 3, ['slime'], 'b3'),
    zone('zw', 4, ['wall'], 'b2'),
    zone('zL', 5, ['slime'], 'bL'),
  ],
});

const base = (): GameState => createInitialState(data);
const withInv = (s: GameState, inv: Record<string, number>): GameState => ({ ...s, inventory: inv });
const fail = (r: ReturnType<typeof validateUpload>): string[] => {
  expect(r.ok).toBe(false);
  return r.ok ? [] : r.reasons;
};

describe('maxKills', () => {
  it('singles plus packs plus the standing crowd', () => {
    const z = zone('p', 1, ['slime'], 'b1', { pack: { everyMs: 5000, size: 4 } });
    expect(maxKills(z, 10_000)).toBe(10 + 2 * 4 + 3);
    expect(maxKills(z, -5)).toBe(3);
  });
});

describe('maxGain', () => {
  it('counts kills, drop maxima, grade conversion and boss drops', () => {
    // 10s: maxKills = 10 + 3 = 13; slime per kill: fire 2 + 3*1(grade 2) = 5; goo 1
    const g = maxGain(base(), 10_000, data);
    expect(g.elements.fire).toBe(13 * 5);
    expect(g.items['mat:goo']).toBe(13);
    // boss drops: floor(13/5)+1 = 3 boss kills * 4
    expect(g.elements.wind).toBe(12);
    expect(g.items['key:k1']).toBe(3);
    expect(g.elements.water).toBe(0);
  });

  it('pack spawns raise the kill bound', () => {
    const packed = fixture({ ...data, zones: data.zones.map((z) => (z.id === 'z1' ? { ...z, pack: { everyMs: 5000, size: 4 } } : z)) });
    // 10s: 10 singles + 2 packs of 4 + 3 standing = 21 kills
    expect(maxGain(base(), 10_000, packed).items['mat:goo']).toBe(21);
    expect(maxGain(base(), 10_000, data).items['mat:goo']).toBe(13);
  });

  it('converts every grade with gradeValue', () => {
    const grades = [1, 2, 3, 4, 5];
    const gd = fixture({
      ...data,
      monsters: { ...data.monsters, slime: mon({ id: 'slime', drops: grades.map((g) => ({ itemId: `el:earth:${g}`, chance: 1, min: 1, max: 1 })) }) },
    });
    const sum = grades.reduce((a, g) => a + gradeValue(g), 0);
    expect(maxGain(base(), 10_000, gd).elements.earth).toBe(13 * sum);
  });

  it('treats negative elapsed as zero', () => {
    expect(maxGain(base(), -5, data)).toEqual(maxGain(base(), 0, data));
  });
});

describe('validateUpload', () => {
  it('identical state is ok', () => {
    expect(validateUpload(base(), base(), 0, data)).toEqual({ ok: true });
  });

  it('normal play through the real engine is within the bound', () => {
    const prev = createInitialState(realContent);
    let game = prev;
    let battle = createBattle(prev.currentZone);
    const rng = createRng(7);
    for (let t = 0; t < 60_000; t += STEP_MS) {
      const r = stepBattle(game, battle, realContent, rng);
      game = r.game;
      battle = r.battle;
    }
    expect(Object.keys(game.inventory).length).toBeGreaterThan(0);
    expect(validateUpload(prev, game, 60_000, realContent)).toEqual({ ok: true });
  });

  it('inventory explosion rejected', () => {
    expect(fail(validateUpload(base(), withInv(base(), { 'el:fire:1': 10_000 }), 30_000, data)).join()).toContain('fire');
  });

  it('material explosion rejected, including unknown materials', () => {
    const r = fail(validateUpload(base(), withInv(base(), { 'mat:goo': 10_000, 'mat:nope': 7 }), 30_000, data));
    expect(r.join()).toContain('mat:goo');
    expect(r.join()).toContain('mat:nope');
  });

  it('key items are bounded by boss drops', () => {
    // 10 s in z1: 3 possible b1 kills -> 3 x 1.25, no slack for key items
    expect(validateUpload(base(), withInv(base(), { 'key:k1': 3 }), 10_000, data)).toEqual({ ok: true });
    expect(fail(validateUpload(base(), withInv(base(), { 'key:k1': 4 }), 10_000, data)).join()).toContain('key:k1');
    // b2 cannot be damaged by mana_bolt, and nothing drops key:zz
    expect(fail(validateUpload(base(), withInv(base(), { 'key:k2': 1 }), 600_000, data)).join()).toContain('key:k2');
    expect(fail(validateUpload(base(), withInv(base(), { 'key:zz': 1 }), 600_000, data)).join()).toContain('key:zz');
  });

  it('slack applies per element and decreases are fine', () => {
    const prev = withInv(base(), { 'el:fire:1': 50 });
    expect(validateUpload(prev, withInv(base(), {}), 0, data)).toEqual({ ok: true });
    expect(validateUpload(base(), withInv(base(), { 'mat:nope': GAIN_SLACK }), 0, data)).toEqual({ ok: true });
    expect(validateUpload(base(), withInv(base(), { 'mat:nope': GAIN_SLACK + 1 }), 0, data).ok).toBe(false);
    expect(GAIN_TOLERANCE).toBe(1.25);
    expect(GAIN_SLACK).toBe(6);
  });

  it('rejects changed server fields', () => {
    const prev: GameState = { ...base(), learned: ['mana_bolt', 'strong'] };
    const cases: [Partial<GameState>, string][] = [
      [{ learned: ['mana_bolt'] }, 'learned'],
      [{ levels: { strong: 2 } }, 'levels'],
      [{ revealed: ['outer'] }, 'revealed'],
      [{ passives: ['p1'] }, 'passives'],
      [{ synthesisLog: { r: { attempts: 1, results: {}, noReaction: true } } }, 'synthesisLog'],
    ];
    for (const [change, word] of cases) {
      expect(fail(validateUpload(prev, { ...prev, ...change }, 1000, data)).join(), word).toContain(word);
    }
  });

  it('learned, revealed and passives compare as sets', () => {
    const prev = { ...base(), learned: ['mana_bolt', 'strong'], revealed: ['a', 'b'] };
    const next = { ...prev, learned: ['strong', 'mana_bolt'], revealed: ['b', 'a'] };
    expect(validateUpload(prev, next, 0, data)).toEqual({ ok: true });
  });

  it('equipped must be learned and currentZone unlocked', () => {
    expect(fail(validateUpload(base(), { ...base(), equipped: 'strong' }, 0, data)).join()).toContain('equipped');
    expect(fail(validateUpload(base(), { ...base(), currentZone: 'z2' }, 0, data)).join()).toContain('currentZone');
  });

  it('new boss with enough time is ok and unlocks the next zone', () => {
    const next = { ...base(), defeatedBosses: ['b1'], unlockedZones: ['z1', 'z2'], inventory: { 'key:k1': 1 } };
    expect(validateUpload(base(), next, 5000 / GAIN_TOLERANCE + 1, data)).toEqual({ ok: true });
  });

  it('boss defeated too fast rejected', () => {
    const next = { ...base(), defeatedBosses: ['b1'], unlockedZones: ['z1', 'z2'] };
    expect(fail(validateUpload(base(), next, 1000, data)).join()).toContain('b1');
  });

  it('packs shorten the minimum boss time', () => {
    // 5 kills at 1/s + 4 per 5 s = 1.8 kills/s -> 2778 ms; the limit for a 2.4 s window is 3 s
    const packed = fixture({ ...data, zones: data.zones.map((z) => (z.id === 'z1' ? { ...z, pack: { everyMs: 5000, size: 4 } } : z)) });
    const next = { ...base(), defeatedBosses: ['b1'], unlockedZones: ['z1', 'z2'] };
    expect(validateUpload(base(), next, 2400, packed)).toEqual({ ok: true });
    expect(validateUpload(base(), next, 2400, data).ok).toBe(false);
    expect(validateUpload(base(), next, 2000, packed).ok).toBe(false);
  });

  it('carried zoneKills shorten the required boss time', () => {
    const next = { ...base(), defeatedBosses: ['b1'], unlockedZones: ['z1', 'z2'] };
    const carried = { ...base(), zoneKills: { z1: 4 } };
    expect(validateUpload(carried, { ...next, zoneKills: { z1: 0 } }, 3000, data)).toEqual({ ok: true });
    expect(fail(validateUpload({ ...base(), zoneKills: { z1: 0 } }, next, 3000, data)).join()).toContain('b1');
  });

  it('zoneKills jump of 1000 in 30 s rejected', () => {
    expect(fail(validateUpload(base(), { ...base(), zoneKills: { z1: 1000 } }, 30_000, data)).join()).toContain('z1');
  });

  it('simultaneous multi-zone zoneKills inflation rejected', () => {
    const next = { ...base(), unlockedZones: ['z1', 'z2', 'z3'], zoneKills: { z1: 8, z2: 8, z3: 8 } };
    const prev = { ...base(), unlockedZones: ['z1', 'z2', 'z3'] };
    expect(fail(validateUpload(prev, next, 1000, data)).join()).toContain('across zones');
  });

  it('zoneKills growth in a locked zone rejected', () => {
    expect(fail(validateUpload(base(), { ...base(), zoneKills: { z2: 1 } }, 30_000, data)).join()).toContain('z2');
  });

  it('boss in locked zone rejected', () => {
    const next = { ...base(), defeatedBosses: ['b2'], unlockedZones: ['z1', 'z3'] };
    expect(fail(validateUpload(base(), next, 600_000, data)).join()).toContain('b2');
  });

  it('chained bosses in one upload are allowed with enough combined time', () => {
    const prev = { ...base(), learned: ['mana_bolt', 'strong'] };
    const next = { ...prev, defeatedBosses: ['b1', 'b2'], unlockedZones: ['z1', 'z2', 'z3'] };
    expect(validateUpload(prev, next, 10_000 / GAIN_TOLERANCE + 1, data)).toEqual({ ok: true });
    expect(validateUpload(prev, next, 7000, data).ok).toBe(false);
  });

  it('boss that no learned spell can damage rejected', () => {
    const prev = { ...base(), unlockedZones: ['z1', 'z2'] };
    const next = { ...prev, defeatedBosses: ['b2'], unlockedZones: ['z1', 'z2', 'z3'] };
    expect(fail(validateUpload(prev, next, 600_000, data)).join()).toContain('b2');
  });

  it('boss hit check: spell levels raise attack, not tier', () => {
    // mana_bolt tier 1 cannot hurt the tier-3 bL, and empowering only raises its attack, never its tier
    const prev = { ...base(), unlockedZones: ['zL'], currentZone: 'zL' };
    const next = { ...prev, defeatedBosses: ['bL'] };
    expect(fail(validateUpload(prev, next, 600_000, data)).join()).toContain('cannot be damaged');
    const leveled = { mana_bolt: 11 };
    expect(fail(validateUpload({ ...prev, levels: leveled }, { ...next, levels: leveled }, 600_000, data)).join()).toContain('cannot be damaged');
  });

  it('zone unlocked without boss rejected', () => {
    expect(fail(validateUpload(base(), { ...base(), unlockedZones: ['z1', 'z2'] }, 600_000, data)).join()).toContain('unlockedZones');
  });

  it('no damaging spell means zero element gain allowed beyond slack', () => {
    const prev = { ...base(), currentZone: 'zw', unlockedZones: ['zw'] };
    expect(maxGain(prev, 600_000, data).elements.water).toBe(0);
    expect(validateUpload(prev, withInv(prev, { 'el:water:1': GAIN_SLACK }), 600_000, data)).toEqual({ ok: true });
    expect(validateUpload(prev, withInv(prev, { 'el:water:1': GAIN_SLACK + 1 }), 600_000, data).ok).toBe(false);
  });

  it('element upgrade conversion is ok', () => {
    expect(validateUpload(withInv(base(), { 'el:fire:1': 3 }), withInv(base(), { 'el:fire:2': 1 }), 0, data)).toEqual({ ok: true });
  });

  it('defeatedBosses shrinking is rejected', () => {
    const prev = { ...base(), defeatedBosses: ['b1'], unlockedZones: ['z1', 'z2'] };
    expect(fail(validateUpload(prev, { ...prev, defeatedBosses: [] }, 0, data)).join()).toContain('b1');
  });
});

describe('maxGain across zones', () => {
  const data2 = fixture({
    spells: { mana_bolt: spell({ id: 'mana_bolt' }) },
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
    },
    zones: [
      zone('A', 1, ['ma'], 'bA'),
      zone('B', 2, ['mb1', 'mb2'], 'bB', { maxAlive: 2, spawnIntervalMs: 2000 }),
    ],
  });
  const st = (unlocked: string[], extra: Partial<GameState> = {}): GameState => ({
    ...createInitialState(data2), currentZone: unlocked[0]!, unlockedZones: unlocked, ...extra,
  });

  it('per-monster maximum, not sum and not per-entry maximum', () => {
    // zone B: maxKills = 10000/2000 + 2 = 7; water mb1=3, mb2=1+3=4 -> 7*4
    const g = maxGain(st(['B']), 10_000, data2);
    expect(g.elements.water).toBe(28);
    expect(g.items['mat:b']).toBe(14);
    expect(g.elements.fire).toBe(7);
  });

  it('takes the max across zones and adds a maxAlive burst for the other zones', () => {
    const g = maxGain(st(['A', 'B']), 10_000, data2);
    expect(g.elements.fire).toBe(28);
    expect(g.elements.water).toBe(28);
    expect(g.items['mat:a']).toBe(13);
    expect(g.items['mat:b']).toBe(14);
  });

  it('zoneIds parameter overrides the unlocked zones', () => {
    expect(maxGain(st(['A']), 10_000, data2, ['B']).elements.water).toBe(28);
  });

  it('boss killed early, then farming the newly unlocked zone, is ok', () => {
    const next = st(['A', 'B'], { currentZone: 'B', defeatedBosses: ['bA'], inventory: { 'el:water:1': 20, 'mat:b': 10 } });
    expect(validateUpload(st(['A']), next, 10_000, data2)).toEqual({ ok: true });
  });

  it('gain in a zone that is still locked is rejected', () => {
    expect(validateUpload(st(['A']), st(['A'], { inventory: { 'el:water:1': 20 } }), 10_000, data2).ok).toBe(false);
  });
});
