import { GAIN_TOLERANCE } from './audit';
import { canDamage, overlevelEfficiency } from './combat-rules';
import { addItems } from './inventory';
import type { Content, GameState, Zone } from './model';
import type { Rng } from './rng';
import { resolveSpell, spellAtLevel } from './spells';
import { highestPlayable, isBossStage, minStageMs, stageTotal } from './stages';
import type { ItemId } from './types';

export type StageClearResult =
  | { kind: 'cleared'; loot: ItemId[] }
  | { kind: 'rejected'; reason: StageClearRejection };

export type StageClearRejection = 'locked' | 'elsewhere' | 'notReached' | 'cannotDamage' | 'tooFast' | 'bossAlive';

/** Rolls per foe in a settlement: about twice what the stage's kills dropped. */
const LOOT_ROLLS = 2;

/** The equipped spell at its empower level; null when it does not resolve. */
function equippedSpell(state: GameState, content: Content): { tier: number; attack: number } | null {
  const s = resolveSpell(state.equipped, content);
  if (!s) return null;
  return spellAtLevel(s, Object.hasOwn(state.levels, state.equipped) ? state.levels[state.equipped]! : 1);
}

/** Whether a spell can damage every ordinary monster of the zone (the boss is not checked). */
function damagesZone(spell: { tier: number; attack: number }, zone: Zone, content: Content): boolean {
  return zone.monsters.every((id) => Object.hasOwn(content.monsters, id) && canDamage(spell, content.monsters[id]!));
}

/**
 * Settlement loot of one stage: every foe of the stage (ordinary foes picked from the zone's monsters,
 * the boss stage's boss as itself) rolls its drop table LOOT_ROLLS times, thinned by overleveling.
 * Key items never come from a settlement: only a real boss kill drops them.
 */
export function stageLoot(zone: Zone, stage: number, equippedTier: number, content: Content, rng: Rng): ItemId[] {
  const out: ItemId[] = [];
  const total = stageTotal(zone, stage);
  const boss = isBossStage(zone, stage);
  for (let i = 0; i < total; i++) {
    const id = boss && i === total - 1 ? zone.bossId : zone.monsters[Math.floor(rng.next() * zone.monsters.length)]!;
    const def = Object.hasOwn(content.monsters, id) ? content.monsters[id] : undefined;
    if (!def) continue;
    const eff = overlevelEfficiency(equippedTier, def.tier);
    for (let r = 0; r < LOOT_ROLLS; r++) {
      for (const d of def.drops) {
        if (d.itemId.startsWith('key:')) continue;
        if (rng.next() < d.chance * eff) {
          const qty = rng.int(d.min, d.max);
          for (let q = 0; q < qty; q++) out.push(d.itemId);
        }
      }
    }
  }
  return out;
}

/**
 * Server settlement of a stage the client reports cleared. The server cannot see the fight, so it
 * only checks what it can: the zone is unlocked and is where the player is, the stage is reachable,
 * the equipped spell can damage every monster of the zone, enough server time has passed since the
 * last settlement, and a boss stage's boss is down.
 */
export function claimStage(
  state: GameState, zoneId: string, stage: number, now: number, content: Content, rng: Rng,
): { state: GameState; result: StageClearResult } {
  const reject = (reason: StageClearRejection) => ({ state, result: { kind: 'rejected', reason } as const });
  const zone = content.zones.find((z) => z.id === zoneId);
  if (!zone || !state.unlockedZones.includes(zoneId)) return reject('locked');
  if (zoneId !== state.currentZone) return reject('elsewhere');
  if (!Number.isInteger(stage) || stage < 1 || stage > highestPlayable(state, zone)) return reject('notReached');
  const spell = equippedSpell(state, content);
  if (!spell || !damagesZone(spell, zone, content)) return reject('cannotDamage');
  if (now - state.lastClearAt < minStageMs(zone, stage) / GAIN_TOLERANCE) return reject('tooFast');
  if (isBossStage(zone, stage) && !state.defeatedBosses.includes(zone.bossId)) return reject('bossAlive');
  const loot = stageLoot(zone, stage, spell.tier, content, rng);
  const cleared = Math.max(state.clearedStages[zoneId] ?? 0, stage);
  return {
    state: {
      ...state,
      clearedStages: { ...state.clearedStages, [zoneId]: cleared },
      lastClearAt: now,
      inventory: loot.length > 0 ? addItems(state.inventory, loot) : state.inventory,
    },
    result: { kind: 'cleared', loot },
  };
}
