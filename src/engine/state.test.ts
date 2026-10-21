import { describe, expect, it } from 'vitest';
import { gameData } from './data';
import { createInitialState, equipSpell, travel } from './state';

describe('state', () => {
  it('createInitialState', () => {
    const s = createInitialState(gameData);
    expect(s.version).toBe(1);
    expect(s.learned).toEqual(['mana_bolt']);
    expect(s.equipped).toBe('mana_bolt');
    expect(s.currentZone).toBe(gameData.zones[0].id);
    expect(s.unlockedZones).toEqual([gameData.zones[0].id]);
    expect(s.inventory).toEqual({});
    expect(s.defeatedBosses).toEqual([]);
    expect(s.zoneKills).toEqual({});
    expect(s.synthesisLog).toEqual({});
  });
  it('travel to locked zone returns null', () => {
    const s = createInitialState(gameData);
    expect(travel(s, gameData.zones[1].id)).toBeNull();
  });
  it('travel to unlocked zone', () => {
    const s = { ...createInitialState(gameData), unlockedZones: [gameData.zones[0].id, gameData.zones[1].id] };
    const t = travel(s, gameData.zones[1].id);
    expect(t?.currentZone).toBe(gameData.zones[1].id);
    expect(s.currentZone).toBe(gameData.zones[0].id);
  });
  it('equipSpell unlearned returns same state', () => {
    const s = createInitialState(gameData);
    expect(equipSpell(s, 'nope')).toBe(s);
  });
  it('equipSpell learned', () => {
    const s = { ...createInitialState(gameData), learned: ['mana_bolt', 'x'] };
    expect(equipSpell(s, 'x').equipped).toBe('x');
    expect(s.equipped).toBe('mana_bolt');
  });
});
