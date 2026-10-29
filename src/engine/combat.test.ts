import { describe, expect, it } from 'vitest';
import { content } from './content';
import {
  BLADE_FAN, DOT_REPORT_MS, LANE_Y, MAX_ACTIVE_FX, RANGE, RIGHT_X, SPAWN_X, STEP_MS, STOP_X, bladePositions, createBattle, enterStage, spawnPoint, stageProgress, stepBattle,
  type ActiveStatus, type BattleEvent, type BattleState, type Foe,
} from './combat';
import { createRng, type Rng } from './rng';
import { BOSS_LIMIT_MS, WALK_MS } from './stages';
import type { Content, Effect, GameState, Monster, NamedSpellDef, Zone } from './model';
import type { ElementId } from './types';

const mkGame = (o: Partial<GameState> = {}): GameState => ({
  version: 2, inventory: {}, learned: ['mana_bolt'], equipped: 'mana_bolt', levels: {}, revealed: [], passives: [],
  currentZone: 'mist_meadow', unlockedZones: ['mist_meadow'], defeatedBosses: [], currentStage: 1, clearedStages: {}, lastClearAt: 0, synthesisLog: {}, ...o,
});

const testSpell = (id: string, effects: Effect[], o: Partial<NamedSpellDef> = {}): NamedSpellDef => ({
  id, name: id, nameEn: id, desc: 'd', hint: 'h', elements: [], tier: 5, attack: 100, cooldownMs: 1e6,
  effects, words: { pre: 'p', noun: 'n', preEn: 'p', nounEn: 'n' }, affinity: 'base', depth: 0, named: true,
  prerequisites: [], node: null, school: 'evocation', ...o,
});
const mon = (id: string, o: Partial<Monster> = {}): Monster => ({
  id, name: id, nameEn: id, element: 'fire', tier: 1, hp: 1e6, defense: 0, regenPerSec: 0, speed: 0, radius: 0.03,
  boss: false, drops: [], ...o,
});
const testZone: Zone = {
  id: 'test_zone', name: 't', nameEn: 't', order: 99, monsters: ['dummy'], bossId: 'test_boss',
  stages: [{ waves: [2, 2] }, { waves: [1] }],
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
/** A battle with hand-placed foes: mid-fight, no wave left to send. */
const staged = (foes: Foe[], zoneId = 'test_zone'): BattleState => ({
  ...createBattle(zoneId, 1), foes, phase: 'fight', wave: 99, nextUid: 1000,
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
  it('waves spawn off the right edge inside the lane, then walk in and stop at the stop line', () => {
    const r = run(mkGame({ equipped: '' }), createBattle('mist_meadow', 1), content, 1200);
    expect(r.battle.foes.length).toBeGreaterThanOrEqual(4);
    const spawned = r.events.filter((e) => e.type === 'spawn');
    expect(spawned.length).toBe(r.battle.foes.length);
    let atLine = 0;
    for (const f of r.battle.foes) {
      const stop = STOP_X + content.monsters[f.defId]!.radius;
      expect(f.x).toBeGreaterThanOrEqual(stop - 1e-9);
      expect(Math.abs(f.y)).toBeLessThanOrEqual(LANE_Y + 1e-9);
      if (Math.abs(f.x - stop) < 1e-6) atLine++;
    }
    expect(atLine).toBeGreaterThan(2);
  });

  it('foes walk left to the stop line and never pass the mage', () => {
    const c = withTest();
    const b = staged([foe(1, 'walker', 1, 0.05, c)]);
    const r = run(mkGame({ equipped: '' }), b, c, 1200);
    const f = r.battle.foes[0]!;
    expect(f.x).toBeGreaterThanOrEqual(STOP_X + c.monsters.walker!.radius - 1e-9);
    expect(f.x).toBeLessThan(STOP_X + c.monsters.walker!.radius + 1e-6);
    expect(f.y).toBe(0.05);
  });

  it('spawnPoint is off the right edge inside the lane', () => {
    const rng = createRng(7);
    for (let i = 0; i < 100; i++) {
      const p = spawnPoint(rng);
      expect(p.x).toBeGreaterThanOrEqual(SPAWN_X);
      expect(p.x).toBeLessThanOrEqual(SPAWN_X + 0.15);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(LANE_Y);
    }
  });

  it('foes stay inside the lane while blind or pulled', () => {
    const c = withTest();
    const zone = testSpell('t_pullz', [{ kind: 'zone', mult: 0, radius: 0.3, ms: 5000, tickMs: 250, target: 'center', pull: 1, follow: false, strikes: 0 }]);
    const c2 = withTest([zone]);
    const blind: ActiveStatus[] = [{ kind: 'blind', remainingMs: 1e6 }];
    const b = staged([foe(1, 'walker', 0.98, 0.08, c, blind), foe(2, 'walker', 0.5, -0.08, c, blind), foe(3, 'walker', 0.3, 0, c)]);
    run(mkGame({ equipped: '' }), b, c, 400, createRng(3), (s) => {
      for (const f of s.foes) {
        expect(Math.abs(f.y)).toBeLessThanOrEqual(LANE_Y + 1e-9);
        expect(f.x).toBeLessThanOrEqual(RIGHT_X + 1e-9);
      }
    });
    const bz = staged([foe(1, 'dummy', 0.4, 0.05, c2), foe(2, 'dummy', 0.7, -0.09, c2)]);
    run(mkGame({ equipped: 't_pullz' }), bz, c2, 100, createRng(3), (s) => {
      for (const f of s.foes) {
        expect(Math.abs(f.y)).toBeLessThanOrEqual(LANE_Y + 1e-9);
        expect(f.x).toBeLessThanOrEqual(RIGHT_X + 1e-9);
      }
    });
  });

  it('stun and freeze stop movement, slow slows', () => {
    const c = withTest();
    const long = (kind: ActiveStatus['kind']): ActiveStatus[] => [{ kind, remainingMs: 1e6 }];
    const b = staged([
      foe(1, 'walker', 0.9, 0.05, c, long('stun')),
      foe(2, 'walker', 0.9, 0.02, c, long('freeze')),
      foe(3, 'walker', 0.9, -0.02, c, long('slow')),
      foe(4, 'walker', 0.9, -0.05, c),
    ]);
    const r = run(mkGame({ equipped: '' }), b, c, 20);
    const moved = (uid: number) => 0.9 - r.battle.foes.find((f) => f.uid === uid)!.x;
    expect(moved(1)).toBeCloseTo(0, 9);
    expect(moved(2)).toBeCloseTo(0, 9);
    expect(moved(4)).toBeCloseTo(0.4, 6); // 0.1 x LANE_SPEED per second
    expect(moved(3)).toBeCloseTo(0.1, 6);
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

describe('stepBattle: area targeting aims at the visible fight', () => {
  const meteorAt = (target: 'densest' | 'random' | 'strongest') =>
    testSpell(`t_meteor_${target}`, [{ kind: 'meteor', mult: 0.01, count: 1, radius: 0.1, delayMs: 1e6, lavaMs: 0, target }]);
  const castFx = (target: 'densest' | 'random' | 'strongest', foes: (c: Content) => Foe[]) => {
    const spell = meteorAt(target);
    const c = withTest([spell]);
    const r = run(mkGame({ equipped: spell.id }), staged(foes(c)), c, 1);
    const fx = r.battle.fx.find((f) => f.effect.kind === 'meteor');
    expect(fx).toBeDefined();
    return fx!;
  };
  /** a just-spawned pack of 8 around x = 1.0 and a pair well inside RANGE */
  const outerPack = (c: Content) => Array.from({ length: 8 }, (_, i) => foe(i + 1, 'dummy', 1.0, (i - 3.5) * 0.02, c));
  const innerPair = (c: Content) => [foe(50, 'dummy', 0.5, 0.03, c), foe(51, 'dummy', 0.53, 0.03, c)];

  it('exports a range inside the view', () => {
    expect(RANGE).toBe(0.75);
  });

  it('densest picks the inner group over a bigger pack at the edge', () => {
    const fx = castFx('densest', (c) => [...outerPack(c), ...innerPair(c)]);
    expect([50, 51]).toContain(fx.hits[0]);
    expect(fx.x).toBeLessThanOrEqual(RANGE);
  });

  it('area spells aim only within RANGE when someone is', () => {
    const fx = castFx('densest', (c) => [foe(1, 'dummy', 0.5, 0, c), ...[0, 1, 2].map((i) => foe(10 + i, 'dummy', 0.95, i * 0.01, c))]);
    expect(fx.hits[0]).toBe(1);
    expect(fx.x).toBe(0.5);
  });

  it('densest still picks the outer pack when nobody is within RANGE', () => {
    const fx = castFx('densest', (c) => [...outerPack(c), foe(60, 'dummy', 0.9, 0.08, c)]);
    expect(fx.hits[0]).toBeLessThanOrEqual(8);
  });

  it('strongest and random only look inside RANGE when someone is there', () => {
    const strong = castFx('strongest', (c) => [
      ...outerPack(c),
      { ...foe(50, 'dummy', 0.4, 0.03, c), hp: 10 },
    ]);
    expect(strong.hits[0]).toBe(50);
    for (let i = 0; i < 5; i++) {
      const rnd = castFx('random', (c) => [...outerPack(c), foe(50, 'dummy', 0.2, 0, c)]);
      expect(rnd.hits[0]).toBe(50);
    }
  });
});

describe('stepBattle: effects', () => {
  it('bolt explodes on impact', () => {
    const bolt = testSpell('t_bolt', [{ kind: 'bolt', mult: 1, count: 1, radius: 0.2, target: 'nearest' }]);
    const c = withTest([bolt]);
    const b = staged([foe(1, 'dummy', 0.5, 0, c), foe(2, 'dummy', 0.65, 0, c), foe(3, 'dummy', 0.95, 0.05, c)]);
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

  it('knockback pushes right and never past RIGHT_X', () => {
    const ring = testSpell('t_push', [{ kind: 'ring', mult: 0.01, radius: 0.8, push: 50 }]);
    const c = withTest([ring]);
    const b = staged([foe(1, 'dummy', 0.3, 0, c), foe(2, 'dummy', 0.9, 0.08, c)]);
    let far1 = 0;
    const r = run(mkGame({ equipped: 't_push' }), b, c, 80, createRng(1), (s) => {
      far1 = Math.max(far1, s.foes.find((f) => f.uid === 1)!.x);
      for (const f of s.foes) expect(Math.abs(f.y)).toBeLessThanOrEqual(LANE_Y + 1e-9);
    });
    expect(far1).toBeGreaterThan(0.3);
    expect(far1).toBeLessThanOrEqual(RIGHT_X + 1e-9);
    expect(r.battle.foes.find((f) => f.uid === 2)!.x).toBeLessThanOrEqual(RIGHT_X + 1e-9);
  });

  it('blades fly forward', () => {
    const fx = { uid: 5, spellId: 'x', elements: [], effect: { kind: 'blades' as const, mult: 1, count: 5, push: 0 }, x: 0, y: 0, ageMs: 600, hits: [] };
    const ps = bladePositions(fx);
    expect(ps).toHaveLength(5);
    for (const p of ps) {
      const a = Math.atan2(p.y, p.x);
      expect(a).toBeGreaterThanOrEqual(-BLADE_FAN);
      expect(a).toBeLessThanOrEqual(BLADE_FAN);
      expect(p.x).toBeGreaterThan(0);
    }
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

  it('a hit reports the hit points it actually removed next to its full damage', () => {
    const big = testSpell('t_big', [{ kind: 'field', mult: 1, delayMs: 0 }], { attack: 50, cooldownMs: 1e6 });
    const c = withTest([big]);
    const b = staged([foe(1, 'weak', 0.5, 0, c), foe(2, 'dummy', -0.5, 0, c)]);
    const r = run(mkGame({ equipped: 't_big', learned: ['mana_bolt', 't_big'] }), b, c, 5);
    const [onWeak] = hitsOn(r.events, 1);
    const [onDummy] = hitsOn(r.events, 2);
    expect(onWeak!.damage).toBeGreaterThan(10);
    expect(onWeak!.dealt).toBe(10); // weak has 10 hp: the rest is overkill
    expect(onDummy!.dealt).toBe(onDummy!.damage);
  });

  describe('damage over time', () => {
    const dots = (events: BattleEvent[]) => events.filter((e): e is Extract<BattleEvent, { type: 'dot' }> => e.type === 'dot');
    const stepsPerReport = DOT_REPORT_MS / STEP_MS;

    it('reports burn damage once per DOT_REPORT_MS, summed over every foe', () => {
      const c = withTest();
      const b = staged([
        foe(1, 'dummy', 0.5, 0, c, [{ kind: 'burn', remainingMs: 5000, power: 10 }]),
        foe(2, 'dummy', -0.5, 0, c, [{ kind: 'burn', remainingMs: 5000, power: 30 }]),
      ]);
      const r = run(mkGame({ equipped: '' }), b, c, stepsPerReport * 2);
      expect(r.perStep.slice(0, stepsPerReport - 1).flatMap(dots)).toEqual([]);
      const reports = dots(r.events);
      expect(reports).toHaveLength(2);
      expect(reports[0]!.damage).toBeCloseTo(40, 6); // (10 + 30) per second
      expect(dots(r.perStep[stepsPerReport - 1]!)).toHaveLength(1);
    });

    it('counts only the hit points a burn actually removes', () => {
      const c = withTest();
      const b = staged([foe(1, 'weak', 0.5, 0, c, [{ kind: 'burn', remainingMs: 5000, power: 1e3 }]), foe(2, 'dummy', 0.9, 0, c)]);
      const r = run(mkGame({ equipped: '' }), b, c, stepsPerReport);
      expect(dots(r.events)).toEqual([{ type: 'dot', damage: 10 }]); // weak has 10 hp
    });

    it('reports nothing when nothing burns', () => {
      const c = withTest();
      const r = run(mkGame({ equipped: '' }), staged([foe(1, 'dummy', 0.5, 0, c)]), c, stepsPerReport * 3);
      expect(dots(r.events)).toEqual([]);
    });
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
    const last = c.zones.find((z) => z.id === 'mist_meadow')!.stages.length;
    const r = run(mkGame({ equipped: 't_nuke' }), createBattle('mist_meadow', last), c, 4000);
    expect(r.events.some((e) => e.type === 'spawn' && e.boss)).toBe(true);
    const kill = r.events.find((e) => e.type === 'kill');
    expect(kill && kill.type === 'kill' && typeof kill.x).toBe('number');
    expect(r.events).toContainEqual({ type: 'bossDefeated', zoneId: 'mist_meadow', unlockedZoneId: 'thunder_gorge' });
    expect(r.game.unlockedZones).toContain('thunder_gorge');
    expect(r.game.defeatedBosses).toContain('mist_stag');
    expect(Object.keys(r.game.inventory).length).toBeGreaterThan(0);
    expect(r.battle.phase).toBe('done');
    expect(r.game).not.toHaveProperty('zoneKills');
  });

  it('a boss always drops its key item, even to an overleveled spell', () => {
    // tier 9 vs the tier-2 mist_stag: element drops shrink to 0.5 + 0.5 * 0.5^6, the key item does not
    const nuke = testSpell('t_nuke', [{ kind: 'field', mult: 100, delayMs: 0 }], { cooldownMs: 300, attack: 1000, tier: 9 });
    const c = withTest([nuke]);
    const last = c.zones.find((z) => z.id === 'mist_meadow')!.stages.length;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const rng = createRng(seed);
      let game = mkGame({ equipped: 't_nuke' });
      let battle = createBattle('mist_meadow', last);
      for (let i = 0; i < 4000 && !game.defeatedBosses.includes('mist_stag'); i++) ({ game, battle } = stepBattle(game, battle, c, rng));
      expect(game.defeatedBosses, String(seed)).toContain('mist_stag');
      // checked on the step of the first kill
      expect(game.inventory['key:storm_heart'], String(seed)).toBe(1);
    }
  });

  it('active effects never exceed MAX_ACTIVE_FX', () => {
    const spam = testSpell('t_spam', [
      { kind: 'zone', mult: 0.01, radius: 0.3, ms: 1e7, tickMs: 250, target: 'random', pull: 0, follow: false, strikes: 0 },
      { kind: 'meteor', mult: 0.01, count: 3, radius: 0.1, delayMs: 100, lavaMs: 1e7, target: 'random' },
    ], { cooldownMs: 50 });
    const c = withTest([spam]);
    let max = 0;
    run(mkGame({ equipped: 't_spam' }), createBattle('mist_meadow', 1), c, 2000, createRng(3), (b) => { max = Math.max(max, b.fx.length); });
    expect(max).toBe(MAX_ACTIVE_FX);
  });

  it('same seed gives the same events', () => {
    const game = mkGame({ learned: ['mana_bolt', 'fire_tornado'], equipped: 'fire_tornado', currentZone: 'thunder_gorge', unlockedZones: ['mist_meadow', 'thunder_gorge'] });
    const a = run(game, createBattle('thunder_gorge', 1), content, 600, createRng(42));
    const b = run(game, createBattle('thunder_gorge', 1), content, 600, createRng(42));
    expect(a.events.length).toBeGreaterThan(100);
    expect(a.events.some((e) => e.type === 'kill')).toBe(true);
    expect(b.events).toEqual(a.events);
    expect(b.battle).toEqual(a.battle);
  });

  it('does not mutate the previous battle state', () => {
    const game = mkGame({ equipped: 'fire_tornado', currentZone: 'thunder_gorge' });
    let battle = createBattle('thunder_gorge', 1);
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) battle = stepBattle(game, battle, content, rng).battle;
    const snapshot = structuredClone(battle);
    stepBattle(game, battle, content, rng);
    expect(battle).toEqual(snapshot);
  });

  it('uses element types the renderer can colour', () => {
    const game = mkGame({ equipped: 'fire_tornado', currentZone: 'thunder_gorge' });
    const r = run(game, createBattle('thunder_gorge', 1), content, 200);
    const els = new Set<ElementId | null>(r.events.flatMap((e) => (e.type === 'hit' ? [e.element] : [])));
    expect([...els].every((e) => e === 'fire' || e === 'wind')).toBe(true);
    expect(r.battle.fx.every((f) => f.elements.join() === 'fire,wind')).toBe(true);
  });
});

describe('stepBattle: stages', () => {
  const nuke = testSpell('t_nuke', [{ kind: 'field', mult: 100, delayMs: 0 }], { cooldownMs: 100, attack: 1000 });
  const ghost = testSpell('t_ghost', [{ kind: 'field', mult: 1, delayMs: 0 }], { cooldownMs: 100, attack: 1, tier: 1 });
  const types = (events: BattleEvent[], t: BattleEvent['type']) => events.filter((e) => e.type === t);
  const weakContent = () => {
    const c = withTest([nuke, ghost]);
    c.zones = c.zones.map((z) => (z.id === 'test_zone' ? { ...z, monsters: ['weak'] } : z));
    return c;
  };

  it('a stage walks, fights each wave in order and ends cleared', () => {
    const c = weakContent();
    const r = run(mkGame({ equipped: 't_nuke', currentZone: 'test_zone' }), createBattle('test_zone', 1, { content: c }), c, 400);
    expect(r.battle.phase).toBe('done');
    expect(r.battle.killed).toBe(4);
    expect(r.battle.total).toBe(4);
    expect(stageProgress(r.battle)).toBe(1);
    const order = r.events.filter((e) => e.type === 'waveStart' || e.type === 'stageCleared').map((e) => (e.type === 'waveStart' ? `w${e.wave}` : e.type));
    expect(order).toEqual(['w0', 'w1', 'stageCleared']);
    expect(r.events).toContainEqual({ type: 'stageCleared', zoneId: 'test_zone', stage: 1 });
    const w = firstStep(r.perStep, (e) => e.type === 'waveStart' && e.wave === 0);
    const w1 = firstStep(r.perStep, (e) => e.type === 'waveStart' && e.wave === 1);
    expect(w * STEP_MS).toBeGreaterThanOrEqual(WALK_MS - STEP_MS);
    expect((w1 - w) * STEP_MS).toBeGreaterThanOrEqual(WALK_MS);
  });

  it('no foe spawns while walking, the next wave waits for the last foe', () => {
    const c = withTest();
    const game = mkGame({ equipped: '', currentZone: 'test_zone' });
    const r = run(game, createBattle('test_zone', 1, { content: c }), c, 20_000 / STEP_MS);
    expect(r.perStep.slice(0, WALK_MS / STEP_MS - 1).flat()).toEqual([]);
    expect(types(r.events, 'waveStart')).toHaveLength(1); // dummies never die, so wave 1 never comes
    expect(types(r.events, 'spawn')).toHaveLength(2);
    expect(r.battle.phase).toBe('fight');
  });

  it('the boss comes after the boss stage waves and the timer starts only then', () => {
    const c = weakContent();
    const r = run(mkGame({ equipped: 't_nuke', currentZone: 'test_zone' }), createBattle('test_zone', 2, { content: c }), c, 200);
    const waveStep = firstStep(r.perStep, (e) => e.type === 'waveStart' && e.wave === 0);
    const bossStep = firstStep(r.perStep, (e) => e.type === 'spawn' && e.boss);
    expect(bossStep).toBeGreaterThan(waveStep);
    expect(types(r.perStep[bossStep]!.filter((e) => e.type !== 'spawn'), 'waveStart')).toHaveLength(1);
    // the very step the boss appears has bossMs 0
    let b = createBattle('test_zone', 2, { content: c });
    const game = mkGame({ equipped: 't_nuke', currentZone: 'test_zone' });
    const rng = createRng(1);
    let sawBoss = false;
    for (let i = 0; i < 400; i++) {
      const rr = stepBattle(game, b, c, rng);
      b = rr.battle;
      if (rr.events.some((e) => e.type === 'spawn' && e.boss)) { expect(b.bossMs).toBe(0); sawBoss = true; break; }
      expect(b.bossMs).toBeNull();
    }
    expect(sawBoss).toBe(true);
  });

  it('boss timer counts simulated steps', () => {
    const c = withTest();
    const game = mkGame({ equipped: '', currentZone: 'test_zone' });
    const boss = foe(1, 'test_boss', 0.5, 0, c);
    const b: BattleState = { ...staged([boss]), stage: 2, bossActive: true, bossMs: 0 };
    const steps = BOSS_LIMIT_MS / STEP_MS;
    const r = run(game, b, c, steps);
    expect(r.perStep[steps - 1]).toContainEqual({ type: 'stageFailed', zoneId: 'test_zone', stage: 2 });
    expect(types(r.perStep.slice(0, steps - 1).flat(), 'stageFailed')).toHaveLength(0);
    expect(r.battle.phase).toBe('failed');
    const after = run(game, r.battle, c, 200);
    expect(after.events).toEqual([]);
    expect(after.battle.foes.length).toBe(r.battle.foes.length);
  });

  it('an immune boss still times out', () => {
    const c = withTest([ghost]);
    c.monsters.test_boss = mon('test_boss', { boss: true, tier: 9, defense: 1e9 });
    const game = mkGame({ equipped: 't_ghost', currentZone: 'test_zone' });
    const boss = foe(1, 'test_boss', 0.5, 0, c);
    const steps = BOSS_LIMIT_MS / STEP_MS;
    const r = run(game, { ...staged([boss]), stage: 2, bossActive: true, bossMs: 0 }, c, steps);
    expect(r.events.some((e) => e.type === 'hit' && e.immune)).toBe(true);
    expect(r.perStep[steps - 1]).toContainEqual({ type: 'stageFailed', zoneId: 'test_zone', stage: 2 });
    expect(r.battle.phase).toBe('failed');
  });

  it('a held boss stage spawns nothing until entered', () => {
    const c = withTest();
    const game = mkGame({ equipped: '', currentZone: 'test_zone' });
    const held = createBattle('test_zone', 2, { held: true, content: c });
    expect(held.phase).toBe('held');
    const r = run(game, held, c, 10_000 / STEP_MS);
    expect(r.events).toEqual([]);
    expect(r.battle.phase).toBe('held');
    const entered = enterStage(r.battle);
    expect(entered.phase).toBe('walk');
    expect(enterStage(entered)).toBe(entered);
    const after = run(game, entered, c, WALK_MS / STEP_MS + 2);
    expect(after.events.some((e) => e.type === 'spawn')).toBe(true);
    // held only applies to a boss stage
    expect(createBattle('test_zone', 1, { held: true, content: c }).phase).toBe('walk');
  });

  it('a finished stage is inert', () => {
    const c = weakContent();
    const r = run(mkGame({ equipped: 't_nuke', currentZone: 'test_zone' }), createBattle('test_zone', 1, { content: c }), c, 400);
    expect(r.battle.phase).toBe('done');
    const more = run(r.game, r.battle, c, 200);
    expect(more.events).toEqual([]);
  });
});
