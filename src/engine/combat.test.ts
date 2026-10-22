import { describe, expect, it } from 'vitest';
import { content } from './content';
import {
  MAX_ACTIVE_FX, STEP_MS, STOP_R, createBattle, stepBattle,
  type ActiveStatus, type BattleEvent, type BattleState, type Foe,
} from './combat';
import { createRng, type Rng } from './rng';
import type { Content, Effect, GameState, Monster, NamedSpellDef, Zone } from './model';
import type { ElementId } from './types';

const mkGame = (o: Partial<GameState> = {}): GameState => ({
  version: 2, inventory: {}, learned: ['mana_bolt'], equipped: 'mana_bolt', levels: {}, revealed: [], passives: [],
  currentZone: 'mist_meadow', unlockedZones: ['mist_meadow'], defeatedBosses: [], zoneKills: {}, synthesisLog: {}, ...o,
});

const testSpell = (id: string, effects: Effect[], o: Partial<NamedSpellDef> = {}): NamedSpellDef => ({
  id, name: id, nameEn: id, desc: 'd', hint: 'h', elements: [], tier: 5, attack: 100, cooldownMs: 1e6,
  effects, words: { pre: 'p', noun: 'n', preEn: 'p', nounEn: 'n' }, affinity: 'base', depth: 0, named: true,
  prerequisites: [], node: null, ...o,
});
const mon = (id: string, o: Partial<Monster> = {}): Monster => ({
  id, name: id, nameEn: id, element: 'fire', tier: 1, hp: 1e6, defense: 0, regenPerSec: 0, speed: 0, radius: 0.03,
  boss: false, drops: [], ...o,
});
const testZone: Zone = {
  id: 'test_zone', name: 't', nameEn: 't', order: 99, monsters: ['dummy'], bossId: 'test_boss', killsForBoss: 1e9,
  maxAlive: 15, spawnIntervalMs: 1000, pack: { everyMs: 3000, size: 10 },
};

/** The shipped content plus test-only spells, monsters and a test zone. */
function withTest(spells: NamedSpellDef[] = [], extra: Partial<Content> = {}): Content {
  return {
    ...content,
    spells: { ...content.spells, ...Object.fromEntries(spells.map((s) => [s.id, s])) },
    monsters: {
      ...content.monsters,
      dummy: mon('dummy'),
      walker: mon('walker', { speed: 0.1 }),
      weak: mon('weak', { hp: 10, drops: [{ itemId: 'el:fire:1', chance: 1, min: 1, max: 1 }] }),
      test_boss: mon('test_boss', { boss: true }),
    },
    zones: [...content.zones, testZone],
    ...extra,
  };
}

const foe = (uid: number, defId: string, x: number, y: number, c: Content, statuses: ActiveStatus[] = []): Foe => {
  const hp = c.monsters[defId]!.hp;
  return { uid, defId, x, y, hp, maxHp: hp, statuses, kx: 0, ky: 0, wander: 0 };
};
/** A battle with hand-placed foes and spawning switched off. */
const staged = (foes: Foe[], zoneId = 'test_zone'): BattleState => ({
  ...createBattle(zoneId), foes, spawnTimerMs: -1e12, packTimerMs: -1e12, nextUid: 1000,
});

interface Run { game: GameState; battle: BattleState; events: BattleEvent[]; perStep: BattleEvent[][] }
function run(game: GameState, battle: BattleState, c: Content, steps: number, rng: Rng = createRng(1), each?: (b: BattleState) => void): Run {
  const perStep: BattleEvent[][] = [];
  for (let i = 0; i < steps; i++) {
    const r = stepBattle(game, battle, c, rng);
    game = r.game; battle = r.battle;
    perStep.push(r.events);
    each?.(battle);
  }
  return { game, battle, events: perStep.flat(), perStep };
}
const firstStep = (perStep: BattleEvent[][], pred: (e: BattleEvent) => boolean) => perStep.findIndex((es) => es.some(pred));
const hitsOn = (events: BattleEvent[], uid: number) =>
  events.filter((e): e is Extract<BattleEvent, { type: 'hit' }> => e.type === 'hit' && e.uid === uid);
const dist = (f: { x: number; y: number }) => Math.hypot(f.x, f.y);

describe('stepBattle: crowd movement', () => {
  it('spawns singles and packs up to maxAlive', () => {
    const c = withTest();
    const game = mkGame({ equipped: '', currentZone: 'test_zone' });
    const first = run(game, createBattle('test_zone'), c, 60);
    expect(first.battle.foes.length).toBe(13); // singles at 1 s, 2 s, 3 s plus a pack of 10 at 3 s
    const pack = first.perStep[59]!.filter((e) => e.type === 'spawn');
    expect(pack.length).toBe(11);
    const packFoes = first.battle.foes.filter((f) => pack.slice(-10).some((e) => e.type === 'spawn' && e.uid === f.uid));
    const angles = packFoes.map((f) => Math.atan2(f.y, f.x));
    const spread = Math.max(...angles) - Math.min(...angles);
    expect(Math.min(spread, 2 * Math.PI - spread)).toBeLessThanOrEqual(0.24 + 1e-9);
    for (const f of first.battle.foes) expect(dist(f)).toBeCloseTo(1, 6);

    let max = 0;
    run(game, first.battle, c, 400, createRng(2), (b) => { max = Math.max(max, b.foes.length); });
    expect(max).toBe(15);
  });

  it('monsters walk in and stop at the stop ring', () => {
    const r = run(mkGame({ equipped: '' }), createBattle('mist_meadow'), content, 1200);
    expect(r.battle.foes.length).toBeGreaterThan(10);
    let atRing = 0;
    for (const f of r.battle.foes) {
      const stop = STOP_R + content.monsters[f.defId]!.radius;
      expect(dist(f)).toBeGreaterThanOrEqual(stop - 1e-9);
      expect(dist(f)).toBeLessThanOrEqual(1 + 1e-9);
      if (Math.abs(dist(f) - stop) < 1e-6) atRing++;
    }
    expect(atRing).toBeGreaterThan(5);
  });

  it('stun and freeze stop movement, slow slows', () => {
    const c = withTest();
    const long = (kind: ActiveStatus['kind']): ActiveStatus[] => [{ kind, remainingMs: 1e6 }];
    const b = staged([
      foe(1, 'walker', 0.9, 0, c, long('stun')),
      foe(2, 'walker', 0, 0.9, c, long('freeze')),
      foe(3, 'walker', -0.9, 0, c, long('slow')),
      foe(4, 'walker', 0, -0.9, c),
    ]);
    const r = run(mkGame({ equipped: '' }), b, c, 20);
    const moved = (uid: number) => 0.9 - dist(r.battle.foes.find((f) => f.uid === uid)!);
    expect(moved(1)).toBeCloseTo(0, 9);
    expect(moved(2)).toBeCloseTo(0, 9);
    expect(moved(4)).toBeCloseTo(0.1, 6);
    expect(moved(3)).toBeCloseTo(0.025, 6);
  });
});

describe('stepBattle: damage', () => {
  it('immune hits deal 0 and are reported', () => {
    const b = staged([foe(1, 'thunder_lizard', 0.3, 0, content)], 'thunder_gorge');
    const r = run(mkGame({ currentZone: 'thunder_gorge' }), b, content, 40);
    const hits = hitsOn(r.events, 1);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h).toMatchObject({ damage: 0, immune: true });
    expect(r.battle.foes[0]!.hp).toBe(content.monsters.thunder_lizard!.hp);
  });

  it('passive damage and cooldown bonuses apply', () => {
    const fire = testSpell('t_fire', [{ kind: 'field', mult: 1, delayMs: 0 }], { elements: ['fire'], cooldownMs: 1000 });
    const c = withTest([fire], {
      passives: { ...content.passives, quick: { ...content.passives.ember_affinity!, id: 'quick', bonus: { kind: 'cooldown', pct: 50 } } },
    });
    const b = staged([foe(1, 'dummy', 0.5, 0, c)]);
    const plain = run(mkGame({ equipped: 't_fire' }), b, c, 200);
    const boosted = run(mkGame({ equipped: 't_fire', passives: ['ember_affinity', 'quick'] }), b, c, 200);
    expect(hitsOn(plain.events, 1)[0]!.damage).toBe(100);
    expect(hitsOn(boosted.events, 1)[0]!.damage).toBe(110);
    const casts = (r: Run) => r.events.filter((e) => e.type === 'cast').length;
    expect(casts(plain)).toBe(11); // at 0 s, then every second
    expect(casts(boosted)).toBe(21);
  });
});

describe('stepBattle: effects', () => {
  it('bolt explodes on impact', () => {
    const bolt = testSpell('t_bolt', [{ kind: 'bolt', mult: 1, count: 1, radius: 0.2, target: 'nearest' }]);
    const c = withTest([bolt]);
    const b = staged([foe(1, 'dummy', 0.5, 0, c), foe(2, 'dummy', 0.65, 0, c), foe(3, 'dummy', -0.6, 0, c)]);
    const r = run(mkGame({ equipped: 't_bolt' }), b, c, 40);
    const at = firstStep(r.perStep, (e) => e.type === 'hit');
    expect(at).toBeGreaterThan(2); // the bolt has to fly there first
    const impact = r.perStep[at]!;
    expect(hitsOn(impact, 1).length).toBe(1);
    expect(hitsOn(impact, 2).length).toBe(1);
    expect(hitsOn(r.events, 3).length).toBe(0);
    const burst = impact.find((e) => e.type === 'burst');
    expect(burst).toMatchObject({ r: 0.2 });
    expect(burst && burst.type === 'burst' && Math.hypot(burst.x - 0.5, burst.y)).toBeLessThan(0.05);
  });

  it('ring hits each foe once', () => {
    const ring = testSpell('t_ring', [{ kind: 'ring', mult: 1, radius: 0.8, push: 0 }]);
    const c = withTest([ring]);
    const b = staged([0.3, 0.5, 0.7, 0.95].map((x, i) => foe(i + 1, 'dummy', x, 0, c)));
    const r = run(mkGame({ equipped: 't_ring' }), b, c, 60);
    expect([1, 2, 3, 4].map((u) => hitsOn(r.events, u).length)).toEqual([1, 1, 1, 0]);
    const stepOf = (u: number) => firstStep(r.perStep, (e) => e.type === 'hit' && e.uid === u);
    expect(stepOf(1)).toBeLessThan(stepOf(3));
  });

  it('chain doubles on wet foes', () => {
    const chain = testSpell('t_chain', [{ kind: 'chain', mult: 1, hops: 3, range: 0.5, explode: 0 }], { elements: ['thunder'] });
    const c = withTest([chain]);
    const b = staged([foe(1, 'dummy', 0.3, 0, c), foe(2, 'dummy', 0.5, 0, c, [{ kind: 'wet', remainingMs: 1e6 }])]);
    const r = run(mkGame({ equipped: 't_chain' }), b, c, 2);
    expect(hitsOn(r.events, 1)[0]!.damage).toBe(100);
    expect(hitsOn(r.events, 2)[0]!.damage).toBe(200);
    const ev = r.events.find((e) => e.type === 'chain');
    expect(ev && ev.type === 'chain' && ev.points.length).toBe(3);
  });

  it('zone pulls foes toward its centre', () => {
    const zone = testSpell('t_zone', [{ kind: 'zone', mult: 0, radius: 0.3, ms: 5000, tickMs: 250, target: 'center', pull: 0.5, follow: false, strikes: 0 }]);
    const c = withTest([zone]);
    const b = staged([foe(1, 'dummy', 0.4, 0, c)]);
    const r = run(mkGame({ equipped: 't_zone' }), b, c, 20);
    expect(dist(r.battle.foes[0]!)).toBeLessThan(0.2);
    expect(r.battle.fx.length).toBe(1);
  });

  it('storm strikes over time', () => {
    const storm = testSpell('t_storm', [{ kind: 'storm', mult: 1, ms: 3000, tickMs: 200 }], { elements: ['thunder'] });
    const c = withTest([storm]);
    const b = staged([0, 1, 2, 3, 4].map((i) => foe(i + 1, 'dummy', 0.6 * Math.cos(i), 0.6 * Math.sin(i), c)));
    const r = run(mkGame({ equipped: 't_storm' }), b, c, 100);
    const strikeSteps = r.perStep.flatMap((es, i) => (es.some((e) => e.type === 'strike') ? [i] : []));
    expect(r.events.filter((e) => e.type === 'strike').length).toBe(15);
    expect(strikeSteps.length).toBe(15);
    expect(r.events.filter((e) => e.type === 'hit').length).toBe(15);
    expect(r.battle.fx.length).toBe(0);
  });

  it('meteor lands after its delay and leaves lava', () => {
    const meteor = testSpell('t_meteor', [{ kind: 'meteor', mult: 1, count: 1, radius: 0.2, delayMs: 1000, lavaMs: 2000, target: 'nearest' }], { elements: ['earth', 'fire'] });
    const c = withTest([meteor]);
    const b = staged([foe(1, 'dummy', 0.5, 0, c)]);
    const r = run(mkGame({ equipped: 't_meteor' }), b, c, 30);
    const land = firstStep(r.perStep, (e) => e.type === 'burst');
    expect((land + 1) * STEP_MS).toBeGreaterThanOrEqual(1000);
    expect(firstStep(r.perStep, (e) => e.type === 'hit')).toBe(land);
    const lava = r.battle.fx.find((f) => f.effect.kind === 'zone');
    expect(lava).toBeDefined();
    expect(Math.hypot(lava!.x - 0.5, lava!.y)).toBeLessThan(0.05);
    expect(r.battle.foes[0]!.statuses.some((s) => s.kind === 'burn')).toBe(true);
    expect(hitsOn(r.events, 1).length).toBeGreaterThan(1);
  });

  it('field hits every foe', () => {
    const field = testSpell('t_field', [{ kind: 'field', mult: 1, delayMs: 500 }]);
    const c = withTest([field]);
    const b = staged(Array.from({ length: 10 }, (_, i) => foe(i + 1, 'dummy', 0.3 + 0.06 * i, 0.05 * i, c)));
    const r = run(mkGame({ equipped: 't_field' }), b, c, 30);
    for (let u = 1; u <= 10; u++) expect(hitsOn(r.events, u).length).toBe(1);
    expect(firstStep(r.perStep, (e) => e.type === 'hit') * STEP_MS).toBeGreaterThanOrEqual(500);
  });

  it('haste speeds up casting', () => {
    const plainS = testSpell('t_plain', [{ kind: 'field', mult: 0, delayMs: 0 }], { cooldownMs: 1000 });
    const hasteS = testSpell('t_haste', [{ kind: 'haste', factor: 2, ms: 1e6 }, { kind: 'field', mult: 0, delayMs: 0 }], { cooldownMs: 1000 });
    const c = withTest([plainS, hasteS]);
    const b = staged([foe(1, 'dummy', 0.5, 0, c)]);
    const casts = (id: string) => run(mkGame({ equipped: id }), b, c, 200).events.filter((e) => e.type === 'cast').length;
    expect(casts('t_plain')).toBe(11);
    expect(casts('t_haste')).toBeGreaterThanOrEqual(20);
    expect(run(mkGame({ equipped: 't_haste' }), b, c, 1).battle.mage.hasteMs).toBeGreaterThan(0);
  });

  it('backfire stuns the mage and skips the cast', () => {
    const bad = testSpell('t_bad', [{ kind: 'field', mult: 1, delayMs: 0 }, { kind: 'backfire', chance: 1, stunMs: 2000 }], { cooldownMs: 500 });
    const c = withTest([bad]);
    const b = staged([foe(1, 'dummy', 0.5, 0, c)]);
    const one = run(mkGame({ equipped: 't_bad' }), b, c, 1);
    expect(one.events).toEqual([{ type: 'backfire', stunMs: 2000 }]);
    expect(one.battle.mage.stunMs).toBeGreaterThan(1900);
    expect(one.battle.fx.length).toBe(0);
    const r = run(mkGame({ equipped: 't_bad' }), b, c, 200);
    expect(r.events.some((e) => e.type === 'cast' || e.type === 'hit')).toBe(false);
    // stunned 2 s each time, so far fewer attempts than the 500 ms cooldown allows
    expect(r.events.filter((e) => e.type === 'backfire').length).toBeLessThanOrEqual(5);
  });

  it('burning foes spread fire when they die', () => {
    const c = withTest();
    const b = staged([
      foe(1, 'weak', 0.5, 0, c, [{ kind: 'burn', remainingMs: 3000, power: 1e3 }]),
      foe(2, 'dummy', 0.58, 0, c),
      foe(3, 'dummy', 0.8, 0, c),
    ]);
    const r = run(mkGame({ equipped: 'fireball' }), b, c, 1);
    expect(r.events.some((e) => e.type === 'kill' && e.uid === 1)).toBe(true);
    const by = (u: number) => r.battle.foes.find((f) => f.uid === u)!;
    expect(by(2).statuses.some((s) => s.kind === 'burn')).toBe(true);
    expect(by(3).statuses.some((s) => s.kind === 'burn')).toBe(false);
  });

  it('burn never spreads to foes the spell cannot damage', () => {
    const c = withTest();
    const b = staged([
      foe(1, 'weak', 0.5, 0, c, [{ kind: 'burn', remainingMs: 3000, power: 1e3 }]),
      foe(2, 'thunder_lizard', 0.55, 0, c),
    ]);
    const lizard = c.monsters.thunder_lizard!;
    const one = run(mkGame({ equipped: 'fireball' }), b, c, 1);
    expect(one.events.some((e) => e.type === 'kill' && e.uid === 1)).toBe(true);
    expect(one.battle.foes.find((f) => f.uid === 2)!.statuses).toEqual([]);
    const later = run(mkGame({ equipped: 'fireball' }), one.battle, c, 40);
    expect(later.battle.foes.find((f) => f.uid === 2)!.hp).toBe(lizard.hp);
  });

  it('regen heals foes', () => {
    const c = withTest();
    const f = { ...foe(1, 'dummy', 0.5, 0, c, [{ kind: 'regen', remainingMs: 2000, power: 0.1 }]), hp: 1000 };
    const r = run(mkGame({ equipped: '' }), staged([f]), c, 20);
    expect(r.battle.foes[0]!.hp).toBeCloseTo(1000 + 1e6 * 0.1, 0);
  });
});

describe('stepBattle: progress and limits', () => {
  it('kills drop items, reach the boss and unlock the next zone', () => {
    const nuke = testSpell('t_nuke', [{ kind: 'field', mult: 100, delayMs: 0 }], { cooldownMs: 300, attack: 1000 });
    const c = withTest([nuke]);
    const r = run(mkGame({ equipped: 't_nuke' }), createBattle('mist_meadow'), c, 4000);
    expect(r.events.some((e) => e.type === 'spawn' && e.boss)).toBe(true);
    const kill = r.events.find((e) => e.type === 'kill');
    expect(kill && kill.type === 'kill' && typeof kill.x).toBe('number');
    expect(r.events).toContainEqual({ type: 'bossDefeated', zoneId: 'mist_meadow', unlockedZoneId: 'thunder_gorge' });
    expect(r.game.unlockedZones).toContain('thunder_gorge');
    expect(r.game.defeatedBosses).toContain('mist_stag');
    expect(Object.keys(r.game.inventory).length).toBeGreaterThan(0);
  });

  it('active effects never exceed MAX_ACTIVE_FX', () => {
    const spam = testSpell('t_spam', [
      { kind: 'zone', mult: 0.01, radius: 0.3, ms: 1e7, tickMs: 250, target: 'random', pull: 0, follow: false, strikes: 0 },
      { kind: 'meteor', mult: 0.01, count: 3, radius: 0.1, delayMs: 100, lavaMs: 1e7, target: 'random' },
    ], { cooldownMs: 50 });
    const c = withTest([spam]);
    let max = 0;
    run(mkGame({ equipped: 't_spam' }), createBattle('mist_meadow'), c, 2000, createRng(3), (b) => { max = Math.max(max, b.fx.length); });
    expect(max).toBe(MAX_ACTIVE_FX);
  });

  it('same seed gives the same events', () => {
    const game = mkGame({ learned: ['mana_bolt', 'fire_tornado'], equipped: 'fire_tornado', currentZone: 'thunder_gorge', unlockedZones: ['mist_meadow', 'thunder_gorge'] });
    const a = run(game, createBattle('thunder_gorge'), content, 600, createRng(42));
    const b = run(game, createBattle('thunder_gorge'), content, 600, createRng(42));
    expect(a.events.length).toBeGreaterThan(100);
    expect(a.events.some((e) => e.type === 'kill')).toBe(true);
    expect(b.events).toEqual(a.events);
    expect(b.battle).toEqual(a.battle);
  });

  it('does not mutate the previous battle state', () => {
    const game = mkGame({ equipped: 'fire_tornado', currentZone: 'thunder_gorge' });
    let battle = createBattle('thunder_gorge');
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) battle = stepBattle(game, battle, content, rng).battle;
    const snapshot = structuredClone(battle);
    stepBattle(game, battle, content, rng);
    expect(battle).toEqual(snapshot);
  });

  it('uses element types the renderer can colour', () => {
    const game = mkGame({ equipped: 'fire_tornado', currentZone: 'thunder_gorge' });
    const r = run(game, createBattle('thunder_gorge'), content, 200);
    const els = new Set<ElementId | null>(r.events.flatMap((e) => (e.type === 'hit' ? [e.element] : [])));
    expect([...els].every((e) => e === 'fire' || e === 'wind')).toBe(true);
    expect(r.battle.fx.every((f) => f.elements.join() === 'fire,wind')).toBe(true);
  });
});
