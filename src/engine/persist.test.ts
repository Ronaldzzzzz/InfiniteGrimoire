import { describe, expect, it } from 'vitest';
import { content } from './content';
import type { GameState } from './model';
import { createInitialState, parseState, serialize } from './persist';
import { HARD_MAX_DEPTH, craftedId, resolveSpell } from './spells';

const zone0 = content.zones[0]!.id;
const zone1 = content.zones[1]!.id;
const crafted = craftedId('fireball', 'mat:ember_core');

function sample(): GameState {
  return {
    ...createInitialState(content),
    inventory: { 'el:fire:1': 3, 'el:water:3': 1, 'mat:ember_core': 2, 'key:storm_heart': 1 },
    learned: ['mana_bolt', 'fireball', crafted],
    equipped: crafted,
    levels: { fireball: 12, [crafted]: 50 },
    revealed: ['outer'],
    passives: ['ember_affinity'],
    unlockedZones: [zone0, zone1],
    defeatedBosses: [content.zones[0]!.bossId],
    zoneKills: { [zone0]: 12 },
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
      version: 2, inventory: {}, learned: ['mana_bolt'], equipped: 'mana_bolt', levels: {}, revealed: [], passives: [],
      currentZone: 'mist_meadow', unlockedZones: ['mist_meadow'], defeatedBosses: [], zoneKills: {}, synthesisLog: {},
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
    expect(roundtrip((o) => o.learned.push(craftedId('fireball', 'nope_spell')))).toBeNull();
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

  it('revealed and passives: known ids, no duplicates', () => {
    expect(roundtrip((o) => o.revealed.push('nowhere'))).toBeNull();
    expect(roundtrip((o) => o.revealed.push('outer'))).toBeNull();
    expect(roundtrip((o) => o.passives.push('nothing'))).toBeNull();
    expect(roundtrip((o) => o.passives.push('ember_affinity'))).toBeNull();
  });

  it('zones, bosses, zoneKills and inventory keys are checked like the MVP', () => {
    expect(roundtrip((o) => (o.currentZone = 'nowhere'))).toBeNull();
    expect(roundtrip((o) => o.unlockedZones.push('nowhere'))).toBeNull();
    expect(roundtrip((o) => o.defeatedBosses.push('mist_slime'))).toBeNull();
    expect(roundtrip((o) => (o.zoneKills.nowhere = 1))).toBeNull();
    expect(roundtrip((o) => (o.zoneKills[zone0] = -1))).toBeNull();
    expect(roundtrip((o) => (o.inventory['el:fire:6'] = 1))).toBeNull();
    expect(roundtrip((o) => (o.inventory['fireball'] = 1))).toBeNull();
    expect(roundtrip((o) => (o.inventory['el:fire:1'] = 1.5))).toBeNull();
    expect(roundtrip((o) => (o.synthesisLog.k.attempts = -1))).toBeNull();
  });
});

describe('old saves after the tier rework', () => {
  it('still parses saves that hold rares and crafted spells built on them', () => {
    const learned = [
      'mana_bolt', 'worldfire', 'holy_judgment', 'inferno', 'fire_tornado',
      craftedId('inferno', 'worldfire'), craftedId('fire_tornado', 'mat:sun_shard'),
    ];
    const state = { ...sample(), learned: [...learned, 'fireball', crafted], equipped: 'worldfire' };
    const parsed = parseState(JSON.parse(serialize(state)), content);
    expect(parsed).not.toBeNull();
    for (const id of parsed!.learned) {
      const s = resolveSpell(id, content);
      expect(s, id).not.toBeNull();
      expect(s!.depth, id).toBeLessThanOrEqual(HARD_MAX_DEPTH);
    }
  });
});
