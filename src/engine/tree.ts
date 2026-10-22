import { ELEMENT_ORDER } from './types';
import type { ElementId, ItemId } from './types';
import { removeItems } from './inventory';
import { HARD_MAX_DEPTH } from './spells';
import type { Content, GameState } from './model';

export const BASE_DEPTH_CAP = 3;

const own = <T>(rec: Record<string, T>, key: string): T | undefined => (Object.hasOwn(rec, key) ? rec[key] : undefined);

/** How deep a crafted spell may nest: 3, plus the depth passives, never above the hard cap. */
export function depthCap(state: GameState, content: Content): number {
  let add = 0;
  for (const id of state.passives) {
    const b = own(content.passives, id)?.bonus;
    if (b?.kind === 'depth') add += b.add;
  }
  return Math.min(HARD_MAX_DEPTH, BASE_DEPTH_CAP + add);
}

export function visibleRegions(state: Pick<GameState, 'revealed'>, content: Content): Set<string> {
  const out = new Set<string>(state.revealed);
  for (const r of content.regions) if (r.initiallyVisible) out.add(r.id);
  return out;
}

export type RevealResult =
  | { kind: 'revealed'; region: string }
  | { kind: 'rejected'; reason: 'unknown' | 'notOwned' | 'alreadyRevealed' };

/** Spends one key item to lift the fog on its region. */
export function revealRegion(state: GameState, keyItemId: ItemId, content: Content): { state: GameState; result: RevealResult } {
  const reject = (reason: 'unknown' | 'notOwned' | 'alreadyRevealed') => ({ state, result: { kind: 'rejected', reason } as const });
  const key = own(content.keyItems, keyItemId);
  if (!key) return reject('unknown');
  if (visibleRegions(state, content).has(key.reveals)) return reject('alreadyRevealed');
  const inventory = removeItems(state.inventory, [keyItemId]);
  if (!inventory) return reject('notOwned');
  return { state: { ...state, inventory, revealed: [...state.revealed, key.reveals] }, result: { kind: 'revealed', region: key.reveals } };
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
    const s = own(content.spells, id);
    if (s && (u.element === null || s.elements.includes(u.element))) count++;
  }
  return count >= u.count;
}

export type UnlockResult =
  | { kind: 'unlocked' }
  | { kind: 'rejected'; reason: 'unknown' | 'already' | 'hidden' | 'requirement' };

export function unlockPassive(state: GameState, passiveId: string, content: Content): { state: GameState; result: UnlockResult } {
  const reject = (reason: 'unknown' | 'already' | 'hidden' | 'requirement') => ({ state, result: { kind: 'rejected', reason } as const });
  const p = own(content.passives, passiveId);
  if (!p) return reject('unknown');
  if (state.passives.includes(passiveId)) return reject('already');
  if (!visibleRegions(state, content).has(p.node.region)) return reject('hidden');
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

