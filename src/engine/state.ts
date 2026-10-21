import { STARTING_SPELL, type GameData, type Inventory } from './types';

export interface SynthLogEntry {
  attempts: number;
  results: Record<string, number>;
  noReaction: boolean;
}

export interface GameState {
  version: 1;
  inventory: Inventory;
  learned: string[];
  equipped: string;
  currentZone: string;
  unlockedZones: string[];
  defeatedBosses: string[];
  zoneKills: Record<string, number>;
  synthesisLog: Record<string, SynthLogEntry>;
}

export function createInitialState(data: GameData): GameState {
  const first = data.zones[0].id;
  return {
    version: 1,
    inventory: {},
    learned: [STARTING_SPELL],
    equipped: STARTING_SPELL,
    currentZone: first,
    unlockedZones: [first],
    defeatedBosses: [],
    zoneKills: {},
    synthesisLog: {},
  };
}

export function equipSpell(state: GameState, spellId: string): GameState {
  if (!state.learned.includes(spellId)) return state;
  return { ...state, equipped: spellId };
}

export function travel(state: GameState, zoneId: string): GameState | null {
  if (!state.unlockedZones.includes(zoneId)) return null;
  return { ...state, currentZone: zoneId };
}
