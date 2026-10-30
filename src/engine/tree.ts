import { ELEMENT_ORDER } from './types';
import type { ElementId, ItemId } from './types';
import { removeItems } from './inventory';
import { tierUnlockOf } from './circle';
import { resolveSpell } from './spells';
import type { Content, GameState } from './model';

const own = <T>(rec: Record<string, T>, key: string): T | undefined => (Object.hasOwn(rec, key) ? rec[key] : undefined);

export type KeyItemResult =
  | { kind: 'circleOpened'; tier: number }
  | { kind: 'rejected'; reason: 'unknown' | 'notOwned' | 'noEffect' };

/** Spends one key item to open the magic circle up to its tier (spec 2026-10-30 section 2.6). */
export function useKeyItem(state: GameState, keyItemId: ItemId, content: Content): { state: GameState; result: KeyItemResult } {
  const reject = (reason: 'unknown' | 'notOwned' | 'noEffect') => ({ state, result: { kind: 'rejected', reason } as const });
  if (!own(content.keyItems, keyItemId)) return reject('unknown');
  const inventory = removeItems(state.inventory, [keyItemId]);
  if (!inventory) return reject('notOwned');
  const tier = tierUnlockOf(keyItemId);
  if (tier === null || tier <= state.circleTier) return reject('noEffect');
  return { state: { ...state, inventory, circleTier: tier }, result: { kind: 'circleOpened', tier } };
}

export function passiveRequirementMet(state: GameState, passiveId: string, content: Content): boolean {
  const p = own(content.passives, passiveId);
  if (!p) return false;
  const u = p.unlock;
  if (u.kind === 'items') {
    return Object.entries(u.items).every(([id, n]) => (Object.hasOwn(state.inventory, id) ? state.inventory[id]! : 0) >= n);
  }
  if (u.kind === 'boss') return state.defeatedBosses.includes(u.bossId);
  let count = 0;
  for (const id of new Set(state.learned)) {
    const s = resolveSpell(id, content);
    if (s && (u.element === null || s.elements.includes(u.element))) count++;
  }
  return count >= u.count;
}

export type UnlockResult =
  | { kind: 'unlocked' }
  | { kind: 'rejected'; reason: 'unknown' | 'already' | 'requirement' };

export function unlockPassive(state: GameState, passiveId: string, content: Content): { state: GameState; result: UnlockResult } {
  const reject = (reason: 'unknown' | 'already' | 'requirement') => ({ state, result: { kind: 'rejected', reason } as const });
  const p = own(content.passives, passiveId);
  if (!p) return reject('unknown');
  if (state.passives.includes(passiveId)) return reject('already');
  if (!passiveRequirementMet(state, passiveId, content)) return reject('requirement');
  let inventory = state.inventory;
  if (p.unlock.kind === 'items') {
    const list: ItemId[] = [];
    for (const [id, n] of Object.entries(p.unlock.items)) for (let i = 0; i < n; i++) list.push(id);
    const removed = removeItems(inventory, list);
    if (!removed) return reject('requirement');
    inventory = removed;
  }
  return { state: { ...state, inventory, passives: [...state.passives, passiveId] }, result: { kind: 'unlocked' } };
}

export interface PassiveBonuses { damagePct: Record<ElementId | 'all', number>; cooldownPct: number }

export function passiveBonuses(state: GameState, content: Content): PassiveBonuses {
  const damagePct = { all: 0, ...Object.fromEntries(ELEMENT_ORDER.map((e) => [e, 0])) } as Record<ElementId | 'all', number>;
  let cooldownPct = 0;
  for (const id of new Set(state.passives)) {
    const b = own(content.passives, id)?.bonus;
    if (!b) continue;
    if (b.kind === 'damage') damagePct[b.element ?? 'all'] += b.pct;
    else if (b.kind === 'cooldown') cooldownPct += b.pct;
  }
  return { damagePct, cooldownPct };
}

