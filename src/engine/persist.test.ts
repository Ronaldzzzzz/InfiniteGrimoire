import { describe, expect, it } from 'vitest';
import { createBattle, stepBattle } from './combat';
import { content } from './content';
import { createRng } from './rng';
import type { GameState } from './model';
import { createInitialState, parseState, serialize } from './persist';
import { resolveSpell } from './spells';

const zone0 = content.zones[0]!.id;
const zone1 = content.zones[1]!.id;
/** an unnamed magic circle spell (fire core, a fire and a wind node) */
const crafted = 'm:fire.3.---fw.-----.bolt';

function sample(): GameState {
  return {
    ...createInitialState(content),
    inventory: { 'el:fire:1': 3, 'el:water:3': 1, 'mat:ember_core': 2, 'key:storm_heart': 1 },
    learned: ['mana_bolt', 'fireball', crafted],
    equipped: crafted,
    levels: { fireball: 12, [crafted]: 50 },
    circleTier: 4,
    passives: ['ember_affinity'],
    unlockedZones: [zone0, zone1],
    defeatedBosses: [content.zones[0]!.bossId],
    currentStage: 4,
    clearedStages: { [zone0]: 3 },
    lastClearAt: 123_456,
    synthesisLog: { k: { attempts: 2, results: { none: 1, fireball: 1 }, noReaction: true } },
  };
}
const roundtrip = (mutate: (o: any) => void) => {
  const o = JSON.parse(serialize(sample()));
  mutate(o);
  return parseState(o, content);
};

describe('persist', () => {
  it('initial state: mana_bolt only, first zone, nothing else', () => {
    expect(createInitialState(content)).toEqual({
      version: 2, inventory: {}, learned: ['mana_bolt'], equipped: 'mana_bolt', levels: {}, circleTier: 2, passives: [],
      currentZone: 'mist_meadow', unlockedZones: ['mist_meadow'], defeatedBosses: [], currentStage: 1, clearedStages: {}, lastClearAt: 0, clearTimes: {}, awayAt: 0, offlineUntil: 0, synthesisLog: {},
    });
  });

  it('the initial state and a full sample roundtrip', () => {
    const s = createInitialState(content);
    expect(parseState(JSON.parse(serialize(s)), content)).toEqual(s);
    expect(parseState(JSON.parse(serialize(sample())), content)).toEqual(sample());
  });

  it('a v1 save is null', () => {
    const v1 = {
      version: 1, inventory: {}, learned: ['mana_bolt'], equipped: 'mana_bolt', currentZone: zone0,
      unlockedZones: [zone0], defeatedBosses: [], zoneKills: {}, synthesisLog: {},
    };
    expect(parseState(v1, content)).toBeNull();
    expect(roundtrip((o) => (o.version = 1))).toBeNull();
  });

  it('rejects non-objects, missing and extra fields, and never throws', () => {
    for (const bad of [null, undefined, 1, 'x', [], {}]) expect(parseState(bad, content)).toBeNull();
    expect(roundtrip((o) => delete o.levels)).toBeNull();
    expect(roundtrip((o) => (o.extra = 1))).toBeNull();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(parseState(cyclic, content)).toBeNull();
  });

  it('learned: every id must resolve, no duplicates, equipped among them', () => {
    expect(roundtrip((o) => o.learned.push('m:fire.3.---fw.-----.laser'))).toBeNull();
    expect(roundtrip((o) => o.learned.push('m:fire.3.---wf.-----.bolt'))).toBeNull(); // not the folded form
    expect(roundtrip((o) => o.learned.push('c(fireball|'))).toBeNull();
    expect(roundtrip((o) => o.learned.push('mat:ember_core'))).toBeNull();
    expect(roundtrip((o) => o.learned.push('fireball'))).toBeNull();
    expect(roundtrip((o) => (o.equipped = 'wind_blade'))).toBeNull();
    expect(roundtrip((o) => o.learned.push('wind_blade'))).not.toBeNull();
  });

  it('levels: integers 1..50 for learned spells only', () => {
    expect(roundtrip((o) => (o.levels.fireball = 51))).toBeNull();
    expect(roundtrip((o) => (o.levels.fireball = 0))).toBeNull();
    expect(roundtrip((o) => (o.levels.fireball = -3))).toBeNull();
    expect(roundtrip((o) => (o.levels.fireball = 2.5))).toBeNull();
    expect(roundtrip((o) => (o.levels.wind_blade = 2))).toBeNull();
    expect(roundtrip((o) => (o.levels.fireball = 1))).not.toBeNull();
  });

  it('circleTier: an integer 1..10; the old revealed field is gone', () => {
    for (const bad of [0, 11, 2.5, '4', null]) expect(roundtrip((o) => (o.circleTier = bad)), String(bad)).toBeNull();
    expect(roundtrip((o) => delete o.circleTier)).toBeNull();
    expect(roundtrip((o) => (o.revealed = []))).toBeNull();
    expect(roundtrip((o) => (o.circleTier = 10))).not.toBeNull();
  });

  it('passives: known ids, no duplicates', () => {
    expect(roundtrip((o) => o.passives.push('nothing'))).toBeNull();
    expect(roundtrip((o) => o.passives.push('ember_affinity'))).toBeNull();
  });

  it('zones, bosses, stage fields and inventory keys are checked like the MVP', () => {
    expect(roundtrip((o) => (o.currentZone = 'nowhere'))).toBeNull();
    expect(roundtrip((o) => o.unlockedZones.push('nowhere'))).toBeNull();
    expect(roundtrip((o) => o.defeatedBosses.push('mist_slime'))).toBeNull();
    expect(roundtrip((o) => (o.zoneKills = {}))).toBeNull();
    expect(roundtrip((o) => (o.clearedStages.nowhere = 1))).toBeNull();
    expect(roundtrip((o) => (o.clearedStages[zone0] = -1))).toBeNull();
    expect(roundtrip((o) => (o.inventory['el:fire:6'] = 1))).toBeNull();
    expect(roundtrip((o) => (o.inventory['fireball'] = 1))).toBeNull();
    expect(roundtrip((o) => (o.inventory['el:fire:1'] = 1.5))).toBeNull();
    expect(roundtrip((o) => (o.synthesisLog.k.attempts = -1))).toBeNull();
  });
});

describe('old saves after the magic circle rework', () => {
  it('old-format learned ids are rejected cleanly: crafted c(…) ids do not resolve and the save is null', () => {
    for (const id of ['c(fireball|rock_spear)', 'c(inferno|worldfire)', 'c(fire_tornado|mat:sun_shard)']) {
      expect(resolveSpell(id, content), id).toBeNull();
      expect(roundtrip((o) => o.learned.push(id)), id).toBeNull();
    }
    // a save from before 0008 (revealed, no circleTier) is not a save any more
    const { circleTier, ...rest } = sample();
    void circleTier;
    expect(parseState({ ...rest, revealed: ['outer'] }, content)).toBeNull();
  });

  it('rare and textbook ids still parse', () => {
    const state = { ...sample(), learned: ['mana_bolt', 'worldfire', 'fireball', crafted, content.spells.inferno!.circle!], equipped: 'worldfire' };
    const parsed = parseState(JSON.parse(serialize(state)), content);
    expect(parsed).not.toBeNull();
    for (const id of parsed!.learned) expect(resolveSpell(id, content), id).not.toBeNull();
  });
});

describe('legacy saves after the x10 number scale', () => {
  it('a pre-scale save still fights: parse, createBattle, 10 s of steps, real damage dealt', () => {
    const old = {
      ...JSON.parse(serialize(createInitialState(content))),
      learned: ['mana_bolt', 'fireball'], equipped: 'fireball', currentZone: 'mist_meadow',
    };
    let game = parseState(old, content)!;
    expect(game.currentZone).toBe('mist_meadow');
    let battle = createBattle(game.currentZone, game.currentStage);
    const rng = createRng(1234);
    let dealt = 0;
    for (let i = 0; i < 200; i++) {
      const r = stepBattle(game, battle, content, rng);
      game = r.game;
      battle = r.battle;
      for (const e of r.events) if (e.type === 'hit' && e.dealt > 0) dealt += e.dealt;
    }
    expect(dealt).toBeGreaterThan(0);
  });
});

describe('stage fields', () => {
  it('starts at stage 1 with nothing cleared', () => {
    const s = createInitialState(content);
    expect(s.currentStage).toBe(1);
    expect(s.clearedStages).toEqual({});
    expect(s.lastClearAt).toBe(0);
  });
  it('parses a save without the offline fields and rejects bad clearTimes keys', () => {
    const s = createInitialState(content);
    const { clearTimes, awayAt, offlineUntil, ...old } = s;
    void clearTimes; void awayAt; void offlineUntil;
    const parsed = parseState(old, content);
    expect(parsed).toMatchObject({ clearTimes: {}, awayAt: 0, offlineUntil: 0 });
    const z = content.zones[0]!;
    expect(parseState({ ...s, clearTimes: { [`${z.id}:3`]: [1000, 2000] }, awayAt: 5, offlineUntil: 9 }, content)).not.toBeNull();
    expect(parseState({ ...s, clearTimes: { [`${z.id}:${z.stages.length}`]: [1000] } }, content)).toBeNull();
    expect(parseState({ ...s, clearTimes: { [`${z.id}:03`]: [1000] } }, content)).toBeNull();
    expect(parseState({ ...s, clearTimes: { [`${z.id}:0`]: [1000] } }, content)).toBeNull();
    expect(parseState({ ...s, clearTimes: { 'nowhere:1': [1000] } }, content)).toBeNull();
    expect(parseState({ ...s, clearTimes: { [`${z.id}:1`]: [1, 2, 3, 4, 5, 6] } }, content)).toBeNull();
    expect(parseState({ ...s, awayAt: -1 }, content)).toBeNull();
  });
  it('rejects out-of-range or unknown stage data', () => {
    const s = createInitialState(content);
    expect(parseState({ ...s, currentStage: 0 }, content)).toBeNull();
    expect(parseState({ ...s, currentStage: 11 }, content)).toBeNull();
    expect(parseState({ ...s, clearedStages: { nowhere: 1 } }, content)).toBeNull();
    expect(parseState({ ...s, clearedStages: { [s.currentZone]: 11 } }, content)).toBeNull();
    expect(parseState({ ...s, lastClearAt: -1 }, content)).toBeNull();
    expect(parseState({ ...s, currentStage: 3, clearedStages: { [s.currentZone]: 2 }, lastClearAt: 5 }, content)).not.toBeNull();
  });
});
