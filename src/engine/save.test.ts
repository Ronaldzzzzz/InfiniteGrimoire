import { describe, expect, it } from 'vitest';
import { gameData } from './data';
import { parseState, serialize } from './save';
import { createInitialState, type GameState } from './state';

const zone0 = gameData.zones[0].id;
const spellIds = Object.keys(gameData.spells);

function sample(): GameState {
  const other = spellIds.find((id) => id !== 'mana_bolt')!;
  return {
    ...createInitialState(gameData),
    inventory: { 'el:fire:1': 3, 'el:water:3': 1, 'mat:slime_gel': 2 },
    learned: ['mana_bolt', other],
    equipped: other,
    unlockedZones: [zone0, gameData.zones[1].id],
    defeatedBosses: [gameData.zones[0].bossId],
    zoneKills: { [zone0]: 12 },
    synthesisLog: { k: { attempts: 2, results: { none: 1, [other]: 1 }, noReaction: true } },
  };
}
const roundtrip = (mutate: (o: any) => void) => {
  const o = JSON.parse(serialize(sample()));
  mutate(o);
  return parseState(o, gameData);
};

describe('save', () => {
  it('roundtrip', () => {
    const s = sample();
    expect(parseState(JSON.parse(serialize(s)), gameData)).toEqual(s);
  });
  it('roundtrip initial state', () => {
    const s = createInitialState(gameData);
    expect(parseState(JSON.parse(serialize(s)), gameData)).toEqual(s);
  });
  it('rejects wrong version', () => {
    expect(roundtrip((o) => (o.version = 2))).toBeNull();
  });
  it('rejects non-object / missing fields', () => {
    for (const v of [null, undefined, 1, 'x', [], true]) expect(parseState(v, gameData)).toBeNull();
    expect(roundtrip((o) => delete o.inventory)).toBeNull();
    expect(roundtrip((o) => delete o.synthesisLog)).toBeNull();
  });
  it('rejects unknown extra fields', () => {
    expect(roundtrip((o) => (o.hack = 1))).toBeNull();
    expect(roundtrip((o) => (o.synthesisLog.k.extra = 1))).toBeNull();
  });
  it('rejects unknown spell id in learned', () => {
    expect(roundtrip((o) => o.learned.push('nope'))).toBeNull();
  });
  it('rejects equipped unknown or not learned', () => {
    expect(roundtrip((o) => (o.equipped = 'nope'))).toBeNull();
    const notLearned = spellIds.find((id) => !sample().learned.includes(id))!;
    expect(roundtrip((o) => (o.equipped = notLearned))).toBeNull();
  });
  it('rejects unknown zone ids', () => {
    expect(roundtrip((o) => (o.currentZone = 'nope'))).toBeNull();
    expect(roundtrip((o) => o.unlockedZones.push('nope'))).toBeNull();
    expect(roundtrip((o) => (o.zoneKills.nope = 1))).toBeNull();
  });
  it('defeatedBosses holds boss monster ids, not zone ids', () => {
    expect(roundtrip((o) => o.defeatedBosses.push('nope'))).toBeNull();
    expect(roundtrip((o) => o.defeatedBosses.push(zone0))).toBeNull();
    // a regular (non-boss) monster is not a boss either
    expect(roundtrip((o) => o.defeatedBosses.push(gameData.zones[0].monsters[0]))).toBeNull();
    const all = gameData.zones.map((z) => z.bossId);
    expect(roundtrip((o) => (o.defeatedBosses = all))?.defeatedBosses).toEqual(all);
  });
  it('rejects negative or non-integer inventory counts', () => {
    expect(roundtrip((o) => (o.inventory['el:fire:1'] = -1))).toBeNull();
    expect(roundtrip((o) => (o.inventory['el:fire:1'] = 1.5))).toBeNull();
    expect(roundtrip((o) => (o.inventory['el:fire:1'] = '3'))).toBeNull();
  });
  it('accepts grade 5 elements and key items', () => {
    expect(roundtrip((o) => { o.inventory['el:fire:5'] = 1; o.inventory['key:storm_heart'] = 1; })).not.toBeNull();
  });
  it('rejects malformed inventory keys', () => {
    for (const k of ['el:fire:6', 'el:fire:0', 'key:', 'key:Up', 'el:dark:1', 'foo', 'mat:', '__proto__x']) {
      expect(roundtrip((o) => (o.inventory[k] = 1))).toBeNull();
    }
  });
  it('rejects bad counts in zoneKills and synthesisLog', () => {
    expect(roundtrip((o) => (o.zoneKills[zone0] = -2))).toBeNull();
    expect(roundtrip((o) => (o.synthesisLog.k.attempts = 0.5))).toBeNull();
    expect(roundtrip((o) => (o.synthesisLog.k.results.none = -1))).toBeNull();
  });
  it('never throws on hostile input', () => {
    expect(parseState(JSON.parse('{"__proto__":{"x":1},"version":1}'), gameData)).toBeNull();
  });
});
