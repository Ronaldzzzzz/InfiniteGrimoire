import { overlevelEfficiency } from './combat-rules';
import { addCounts } from './inventory';
import type { Content, GameState, Zone } from './model';
import type { Rng } from './rng';
import { damagesZone, equippedSpell, LOOT_ROLLS } from './stage-clear';
import { stageCount, stageTotal } from './stages';
import type { ItemId } from './types';

/** Offline income pays this share of what playing would have dropped. */
export const OFFLINE_RATE = 0.5;
/** At most this much away time is paid (8 hours). */
export const OFFLINE_CAP_MS = 28_800_000;
/** Hidden for this long before the client's "away" counts. */
export const AWAY_DELAY_MS = 30_000;
/** Clear times kept per stage. */
export const CLEAR_TIMES_KEEP = 5;

export type OfflineResult =
  | { kind: 'none' }
  | { kind: 'offline'; zoneId: string; stage: number; runs: number; awayMs: number; capped: boolean; loot: Record<ItemId, number> };

/** The stage offline time is spent on: the last cleared zone's highest ordinary stage. */
export function offlineStage(state: GameState, content: Content): { zoneId: string; stage: number; zone: Zone } | null {
  let found: { zoneId: string; stage: number; zone: Zone } | null = null;
  for (const zone of content.zones) {
    const cleared = Object.hasOwn(state.clearedStages, zone.id) ? state.clearedStages[zone.id]! : 0;
    if (cleared > 0) found = { zoneId: zone.id, stage: Math.min(cleared, stageCount(zone) - 1), zone };
  }
  return found;
}

/**
 * Aggregate loot of `runs` repeats of an ordinary stage: expected drops per monster, rounded
 * stochastically (one roll per item), at OFFLINE_RATE. Key items never drop.
 */
export function offlineLoot(
  zone: Zone, stage: number, runs: number, equippedTier: number, content: Content, rng: Rng,
): Record<ItemId, number> {
  const out: Record<ItemId, number> = {};
  if (zone.monsters.length === 0) return out;
  const foes = (runs * stageTotal(zone, stage)) / zone.monsters.length;
  for (const id of zone.monsters) {
    const def = Object.hasOwn(content.monsters, id) ? content.monsters[id] : undefined;
    if (!def) continue;
    const eff = overlevelEfficiency(equippedTier, def.tier);
    for (const d of def.drops) {
      if (d.itemId.startsWith('key:')) continue;
      const expected = foes * (LOOT_ROLLS + 1) * d.chance * eff * ((d.min + d.max) / 2) * OFFLINE_RATE;
      const whole = Math.floor(expected);
      const qty = whole + (rng.next() < expected - whole ? 1 : 0);
      if (qty > 0) out[d.itemId] = (out[d.itemId] ?? 0) + qty;
    }
  }
  return out;
}

export function markAway(state: GameState, now: number): { state: GameState; result: { kind: 'away' } } {
  return { state: state.awayAt === 0 ? { ...state, awayAt: now } : state, result: { kind: 'away' } };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Settles the time since the player left, at the median of their recorded clear times. */
export function claimOffline(
  state: GameState, prevSavedAt: number, now: number, content: Content, rng: Rng,
): { state: GameState; result: OfflineResult } {
  const none = { state: state.awayAt === 0 ? state : { ...state, awayAt: 0 }, result: { kind: 'none' } as const };
  const target = offlineStage(state, content);
  if (!target) return none;
  const { zone } = target;
  const key = `${target.zoneId}:${target.stage}`;
  const times = Object.hasOwn(state.clearTimes, key) ? state.clearTimes[key]! : [];
  if (times.length === 0) return none;
  const spell = equippedSpell(state, content);
  if (!spell || !damagesZone(spell, zone, content)) return none;
  const start = Math.max(state.awayAt > 0 ? state.awayAt : prevSavedAt, state.offlineUntil, state.lastClearAt);
  const awayMs = Math.max(0, now - start);
  const counted = Math.min(awayMs, OFFLINE_CAP_MS);
  const per = median(times);
  if (!(per > 0)) return none;
  const runs = Math.floor(counted / per);
  if (runs < 1) return none;
  const loot = offlineLoot(zone, target.stage, runs, spell.tier, content, rng);
  return {
    state: { ...state, inventory: addCounts(state.inventory, loot), offlineUntil: now, awayAt: 0 },
    result: { kind: 'offline', zoneId: target.zoneId, stage: target.stage, runs, awayMs, capped: awayMs > OFFLINE_CAP_MS, loot },
  };
}
