import { describe, expect, it } from 'vitest';
import { STEP_MS, createBattle, stepBattle, type BattleEvent, type BattleState } from './battle';
import { createRng } from './rng';
import { createInitialState, type GameState } from './state';
import type { GameData, MonsterDef, SpellDef } from './types';

const spell = (o: Partial<SpellDef> & { id: string }): SpellDef => ({
  name: o.id, nameEn: o.id, elements: [], tier: 1, attack: 100, cooldownMs: 1000, pattern: 'bolt',
  prerequisites: [], hint: 'h', grimoire: { ring: 0, offset: 0 }, ...o,
});
const mon = (o: Partial<MonsterDef> & { id: string }): MonsterDef => ({
  name: o.id, nameEn: o.id, element: 'fire', tier: 1, hp: 100, defense: 0, regenPerSec: 0, boss: false,
  drops: [], ...o,
});

const data: GameData = {
  spells: {
    mana_bolt: spell({ id: 'mana_bolt', tier: 1, attack: 10, cooldownMs: 1000 }),
    strong: spell({ id: 'strong', tier: 5, attack: 1000 }),
    chain: spell({ id: 'chain', pattern: 'chain', chainCount: 2, attack: 100, tier: 1 }),
    para: spell({ id: 'para', attack: 1, status: { kind: 'paralyze', chance: 1, durationMs: 5000 } }),
    novaS: spell({ id: 'novaS', pattern: 'nova', tier: 5, attack: 1000 }),
    t10: spell({ id: 't10', tier: 10, attack: 1 }),
    t12: spell({ id: 't12', tier: 12, attack: 1 }),
  },
  recipes: [],
  monsters: {
    slime: mon({ id: 'slime', hp: 5, drops: [{ itemId: 'el:fire:1', chance: 1, min: 1, max: 2 }] }),
    tank: mon({ id: 'tank', hp: 100, regenPerSec: 10 }),
    giant: mon({ id: 'giant', tier: 3, hp: 1000, defense: 500 }),
    boss1: mon({ id: 'boss1', boss: true, hp: 5 }),
    boss2: mon({ id: 'boss2', boss: true, hp: 5 }),
    m10: mon({ id: 'm10', tier: 10, hp: 1, defense: 0, drops: [{ itemId: 'el:fire:1', chance: 0.5, min: 1, max: 1 }] }),
  },
  zones: [
    { id: 'z1', name: 'z1', nameEn: 'z1', order: 1, monsters: ['slime'], bossId: 'boss1', killsForBoss: 3, maxAlive: 3, spawnIntervalMs: 500 },
    { id: 'z2', name: 'z2', nameEn: 'z2', order: 2, monsters: ['slime'], bossId: 'boss2', killsForBoss: 3, maxAlive: 3, spawnIntervalMs: 500 },
    { id: 'zt', name: 'zt', nameEn: 'zt', order: 3, monsters: ['tank'], bossId: 'boss2', killsForBoss: 99, maxAlive: 3, spawnIntervalMs: 500 },
    { id: 'zg', name: 'zg', nameEn: 'zg', order: 4, monsters: ['giant'], bossId: 'boss2', killsForBoss: 99, maxAlive: 3, spawnIntervalMs: 500 },
    { id: 'zo', name: 'zo', nameEn: 'zo', order: 5, monsters: ['m10'], bossId: 'boss2', killsForBoss: 99999, maxAlive: 1, spawnIntervalMs: 50 },
    { id: 'zb', name: 'zb', nameEn: 'zb', order: 6, monsters: ['slime'], bossId: 'boss1', killsForBoss: 2, maxAlive: 6, spawnIntervalMs: 50 },
  ],
};

function run(game: GameState, battle: BattleState, ms: number, seed = 1) {
  const rng = createRng(seed);
  const events: BattleEvent[] = [];
  for (let t = 0; t < ms; t += STEP_MS) {
    const r = stepBattle(game, battle, data, rng);
    game = r.game; battle = r.battle; events.push(...r.events);
  }
  return { game, battle, events };
}
const base = (zone: string, equipped = 'mana_bolt'): GameState => ({
  ...createInitialState(data), currentZone: zone, equipped, learned: [equipped],
});

describe('battle', () => {
  it('spawns up to maxAlive', () => {
    const r = run(base('zt'), createBattle('zt'), 10000, 1);
    expect(r.battle.monsters.length).toBeLessThanOrEqual(3);
    const spawns = r.events.filter((e) => e.type === 'spawn').length;
    expect(spawns).toBeGreaterThanOrEqual(3);
  });

  it('mana_bolt vs tier-3 monster emits immune hits and never kills', () => {
    const r = run(base('zg'), createBattle('zg'), 60000);
    const hits = r.events.filter((e) => e.type === 'hit');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => e.type === 'hit' && e.immune && e.damage === 0)).toBe(true);
    expect(r.events.some((e) => e.type === 'kill')).toBe(false);
  });

  it('kills add drops and zoneKills', () => {
    const g = base('z1', 'strong');
    const r = run(g, createBattle('z1'), 1600);
    const kills = r.events.filter((e) => e.type === 'kill');
    expect(kills.length).toBeGreaterThanOrEqual(1);
    expect(r.game.zoneKills.z1).toBe(kills.length);
    expect(r.game.inventory['el:fire:1']).toBeGreaterThanOrEqual(kills.length);
    expect(g.zoneKills.z1).toBeUndefined();
  });

  it('boss spawns after killsForBoss and unlocks next zone on defeat', () => {
    const r = run(base('z1', 'strong'), createBattle('z1'), 12000);
    const spawns = r.events.filter((e) => e.type === 'spawn');
    expect(spawns.some((e) => e.type === 'spawn' && e.boss)).toBe(true);
    expect(r.game.defeatedBosses).toEqual(['boss1']);
    expect(r.game.unlockedZones).toContain('z2');
    expect(r.events).toContainEqual({ type: 'bossDefeated', zoneId: 'z1', unlockedZoneId: 'z2' });
  });

  it('defeating last zone boss unlocks nothing', () => {
    const d2: GameData = { ...data, zones: [data.zones[1]!] };
    const rng = createRng(2);
    let game = base('z2', 'strong');
    let battle = createBattle('z2');
    const events: BattleEvent[] = [];
    for (let t = 0; t < 12000; t += STEP_MS) {
      const r = stepBattle(game, battle, d2, rng);
      game = r.game; battle = r.battle; events.push(...r.events);
    }
    expect(events).toContainEqual({ type: 'bossDefeated', zoneId: 'z2', unlockedZoneId: null });
    expect(game.unlockedZones).toEqual(['z1']);
  });

  it('chain hits up to chainCount+1 targets with falloff', () => {
    const rng = createRng(1);
    const mk = (uid: number, x: number) => ({ uid, defId: 'tank', hp: 1000, maxHp: 1000, x, statuses: [] });
    const battle: BattleState = {
      ...createBattle('zt'), castTimerMs: 1000,
      monsters: [mk(1, 0.9), mk(2, 0.5), mk(3, 0.6), mk(4, 0.7)],
    };
    const r = stepBattle(base('zt', 'chain'), battle, data, rng);
    expect(r.events[0]).toEqual({ type: 'cast', spellId: 'chain', targets: [2, 3, 4] });
    const dmg = r.events.filter((e) => e.type === 'hit').map((e) => (e as { damage: number }).damage);
    expect(dmg).toEqual([100, 70, 49]);
  });

  it('paralyze stops movement and regen', () => {
    const rng = createRng(1);
    const m = { uid: 1, defId: 'tank', hp: 50, maxHp: 100, x: 0.8, statuses: [] };
    let battle: BattleState = { ...createBattle('zt'), monsters: [m], castTimerMs: 950, spawnTimerMs: -1e9 };
    let game = base('zt', 'para');
    let r = stepBattle(game, battle, data, rng);
    expect(r.events).toContainEqual({ type: 'status', uid: 1, kind: 'paralyze' });
    const after = r.battle.monsters[0]!;
    expect(after.statuses[0]!.kind).toBe('paralyze');
    const hpAfterHit = after.hp;
    for (let i = 0; i < 20; i++) {
      r = stepBattle(r.game, { ...r.battle, castTimerMs: 0 }, data, rng);
    }
    const end = r.battle.monsters.find((x) => x.uid === 1)!;
    expect(end.x).toBe(after.x);
    expect(end.hp).toBe(hpAfterHit);
    // unparalyzed control moves and regens
    const c = stepBattle(game, { ...battle, castTimerMs: 0, monsters: [m] }, data, rng);
    expect(c.battle.monsters[0]!.x).toBeLessThan(0.8);
    expect(c.battle.monsters[0]!.hp).toBeGreaterThan(50);
  });

  it('overlevel reduces drops', () => {
    const avg = (spellId: string): number => {
      const rng = createRng(42);
      let game = base('zo', spellId);
      let battle = createBattle('zo');
      let kills = 0, items = 0;
      while (kills < 2000) {
        const r = stepBattle(game, battle, data, rng);
        game = r.game; battle = r.battle;
        for (const e of r.events) if (e.type === 'kill') { kills++; items += e.drops.length; }
      }
      return items / kills;
    };
    const ratio = avg('t12') / avg('t10');
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(0.8);
  });

  it('never spawns more than one normal monster per spawnIntervalMs', () => {
    const normalSpawns = (events: BattleEvent[]) => events.filter((e) => e.type === 'spawn' && !e.boss).length;
    // full zone, no kills
    const full = run(base('zt'), createBattle('zt'), 10000);
    expect(normalSpawns(full.events)).toBeLessThanOrEqual(Math.floor(10000 / 500));
    // continuous kills, fast interval, maxAlive 1
    const d: GameData = { ...data, zones: [{ ...data.zones.find((z) => z.id === 'zo')!, maxAlive: 1, spawnIntervalMs: 200 }] };
    const rng = createRng(3);
    let game = base('zo', 'novaS');
    let battle = createBattle('zo');
    let spawns = 0, kills = 0;
    for (let t = 0; t < 20000; t += STEP_MS) {
      const r = stepBattle(game, battle, d, rng);
      game = r.game; battle = r.battle;
      spawns += r.events.filter((e) => e.type === 'spawn' && !e.boss).length;
      kills += r.events.filter((e) => e.type === 'kill').length;
    }
    expect(kills).toBeGreaterThan(10);
    expect(spawns).toBeLessThanOrEqual(Math.floor(20000 / 200));
  });

  it('normal kills during boss do not count toward the next boss', () => {
    const mk = (uid: number, defId: string) => ({ uid, defId, hp: 5, maxHp: 5, x: 0.5 + uid * 0.01, statuses: [] });
    const battle: BattleState = {
      ...createBattle('zb'), bossActive: true, castTimerMs: 1000, spawnTimerMs: 0,
      monsters: [mk(1, 'slime'), mk(2, 'slime'), mk(3, 'slime'), mk(4, 'boss1')],
      nextUid: 5,
    };
    let r = stepBattle(base('zb', 'novaS'), battle, data, createRng(1));
    expect(r.events.filter((e) => e.type === 'kill')).toHaveLength(4);
    expect(r.game.defeatedBosses).toEqual(['boss1']);
    expect(r.game.zoneKills.zb ?? 0).toBe(0);
    expect(r.battle.bossActive).toBe(false);
    // continue: count normal kills before the next boss spawns
    const rng = createRng(2);
    let normalKills = 0;
    let bossSpawned = false;
    for (let i = 0; i < 2000 && !bossSpawned; i++) {
      r = stepBattle(r.game, r.battle, data, rng);
      for (const e of r.events) {
        if (e.type === 'spawn' && e.boss) bossSpawned = true;
        if (e.type === 'kill') normalKills++;
      }
    }
    expect(bossSpawned).toBe(true);
    expect(normalKills).toBeGreaterThanOrEqual(2);
  });

  it('boss resolved before leftover normals in the same step does not let them count', () => {
    const mk = (uid: number, defId: string) => ({ uid, defId, hp: 5, maxHp: 5, x: 0.5 + uid * 0.01, statuses: [] });
    const battle: BattleState = {
      ...createBattle('zb'), bossActive: true, castTimerMs: 1000,
      monsters: [mk(1, 'boss1'), mk(2, 'slime'), mk(3, 'slime'), mk(4, 'slime')],
      nextUid: 5,
    };
    let r = stepBattle(base('zb', 'novaS'), battle, data, createRng(1));
    expect(r.events.filter((e) => e.type === 'kill')).toHaveLength(4);
    expect(r.events[r.events.findIndex((e) => e.type === 'kill')]).toMatchObject({ uid: 1 });
    expect(r.events.some((e) => e.type === 'spawn')).toBe(false);
    expect(r.battle.bossActive).toBe(false);
    expect(r.game.zoneKills.zb ?? 0).toBe(0);
    const rng = createRng(2);
    let normalKills = 0;
    let bossSpawned = false;
    for (let i = 0; i < 2000 && !bossSpawned; i++) {
      r = stepBattle(r.game, r.battle, data, rng);
      for (const e of r.events) {
        if (e.type === 'spawn' && e.boss) bossSpawned = true;
        if (e.type === 'kill') normalKills++;
      }
    }
    expect(bossSpawned).toBe(true);
    expect(normalKills).toBeGreaterThanOrEqual(2);
  });
});
