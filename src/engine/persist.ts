import { z } from 'zod';
import { STARTING_SPELL, type Content, type GameState } from './model';
import { MAX_SPELL_LEVEL, resolveSpell } from './spells';
import { ITEM_ID_RE } from './types';

/** A new player: mana_bolt only, standing in the first zone. */
export function createInitialState(content: Content): GameState {
  const first = content.zones[0]!.id;
  return {
    version: 2, inventory: {}, learned: [STARTING_SPELL], equipped: STARTING_SPELL, levels: {}, revealed: [], passives: [],
    currentZone: first, unlockedZones: [first], defeatedBosses: [], zoneKills: {}, currentStage: 1, clearedStages: {}, lastClearAt: 0, synthesisLog: {},
  };
}

const MAX_STAGES = 10;
const count = z.number().int().min(0);

const synthLogEntry = z.strictObject({
  attempts: count,
  results: z.record(z.string(), count),
  noReaction: z.boolean(),
});

const saveSchema = z.strictObject({
  version: z.literal(2),
  inventory: z.record(z.string(), count),
  learned: z.array(z.string()),
  equipped: z.string(),
  levels: z.record(z.string(), z.number().int().min(1).max(MAX_SPELL_LEVEL)),
  revealed: z.array(z.string()),
  passives: z.array(z.string()),
  currentZone: z.string(),
  unlockedZones: z.array(z.string()),
  defeatedBosses: z.array(z.string()),
  zoneKills: z.record(z.string(), count),
  currentStage: z.number().int().min(1).max(MAX_STAGES),
  clearedStages: z.record(z.string(), z.number().int().min(0).max(MAX_STAGES)),
  lastClearAt: count,
  synthesisLog: z.record(z.string(), synthLogEntry),
});

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

const unique = (xs: string[]): boolean => new Set(xs).size === xs.length;

/** Validates untrusted input. Never throws, never repairs: any problem yields null. */
export function parseState(input: unknown, content: Content): GameState | null {
  try {
    const r = saveSchema.safeParse(input);
    if (!r.success) return null;
    const s = r.data;
    const zoneIds = new Set(content.zones.map((z) => z.id));
    const bossIds = new Set(content.zones.map((z) => z.bossId));
    const regionIds = new Set(content.regions.map((g) => g.id));
    const isZone = (id: string) => zoneIds.has(id);
    const learned = new Set(s.learned);
    const ok =
      unique(s.learned) &&
      s.learned.every((id) => resolveSpell(id, content) !== null) &&
      learned.has(s.equipped) &&
      Object.keys(s.levels).every((id) => learned.has(id)) &&
      unique(s.revealed) &&
      s.revealed.every((id) => regionIds.has(id)) &&
      unique(s.passives) &&
      s.passives.every((id) => Object.hasOwn(content.passives, id)) &&
      isZone(s.currentZone) &&
      s.unlockedZones.every(isZone) &&
      s.defeatedBosses.every((id) => bossIds.has(id)) &&
      Object.keys(s.zoneKills).every(isZone) &&
      Object.keys(s.clearedStages).every(isZone) &&
      Object.keys(s.inventory).every((k) => ITEM_ID_RE.test(k));
    return ok ? (s as GameState) : null;
  } catch {
    return null;
  }
}
