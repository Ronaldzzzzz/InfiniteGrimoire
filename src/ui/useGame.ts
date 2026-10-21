import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { GameState } from '../engine/state';
import type { GameData } from '../engine/types';
import type { GameRuntime, Snapshot } from '../game/runtime';
import type { ConnStatus, SyncController } from '../game/sync';

export type RuntimeStore = Pick<GameRuntime, 'subscribe' | 'getSnapshot'>;

/**
 * Subscribes to one slice of the runtime snapshot. The component re-renders only when `select`
 * returns a different value (Object.is), so select primitives or references the runtime keeps stable.
 */
export function useRuntime<T>(runtime: RuntimeStore, select: (s: Snapshot) => T): T {
  const subscribe = useCallback((cb: () => void) => runtime.subscribe(cb), [runtime]);
  return useSyncExternalStore(subscribe, () => select(runtime.getSnapshot()));
}

/** The game state changes on kills / equip / travel / sync, not on every battle step. */
export function useGameState(runtime: RuntimeStore): GameState {
  return useRuntime(runtime, (s) => s.game);
}

export function bossAlive(s: Snapshot, data: GameData): boolean {
  const zone = data.zones.find((z) => z.id === s.game.currentZone);
  return Boolean(zone) && s.battle.bossActive && s.battle.monsters.some((m) => m.defId === zone!.bossId);
}

export function useConnStatus(sync: SyncController): ConnStatus {
  const [status, setStatus] = useState<ConnStatus>(sync.status);
  useEffect(() => {
    setStatus(sync.status);
    return sync.onStatus(setStatus);
  }, [sync]);
  return status;
}
