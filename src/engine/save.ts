import { z } from 'zod';
import { ELEMENT_ORDER, MAX_ELEMENT_GRADE, type GameData } from './types';
import type { GameState } from './state';

const count = z.number().int().min(0);
/** Format of every inventory / synthesis item id. */
export const ITEM_ID_RE = new RegExp(`^(el:(${ELEMENT_ORDER.join('|')}):[1-${MAX_ELEMENT_GRADE}]|mat:[a-z_]+)$`);

const synthLogEntry = z.strictObject({
  attempts: count,
  results: z.record(z.string(), count),
  noReaction: z.boolean(),
});

const saveSchema = z.strictObject({
  version: z.literal(1),
  inventory: z.record(z.string(), count),
  learned: z.array(z.string()),
  equipped: z.string(),
  currentZone: z.string(),
  unlockedZones: z.array(z.string()),
  defeatedBosses: z.array(z.string()),
  zoneKills: z.record(z.string(), count),
  synthesisLog: z.record(z.string(), synthLogEntry),
});

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Validates untrusted input. Never throws, never repairs: any problem yields null. */
export function parseState(input: unknown, data: GameData): GameState | null {
  try {
    const r = saveSchema.safeParse(input);
    if (!r.success) return null;
    const s = r.data;
    const zoneIds = new Set(data.zones.map((z) => z.id));
    const isSpell = (id: string) => Object.hasOwn(data.spells, id);
    const isZone = (id: string) => zoneIds.has(id);
    const bossIds = new Set(data.zones.map((z) => z.bossId));
    const isBoss = (id: string) => bossIds.has(id);
    const ok =
      s.learned.every(isSpell) &&
      s.learned.includes(s.equipped) &&
      isZone(s.currentZone) &&
      s.unlockedZones.every(isZone) &&
      s.defeatedBosses.every(isBoss) &&
      Object.keys(s.zoneKills).every(isZone) &&
      Object.keys(s.inventory).every((k) => ITEM_ID_RE.test(k));
    return ok ? (s as GameState) : null;
  } catch {
    return null;
  }
}
