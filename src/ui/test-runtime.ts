import { vi } from 'vitest';
import { createBattle } from '../engine/combat';
import { content } from '../engine/content';
import type { GameState } from '../engine/model';
import { createInitialState } from '../engine/persist';
import type { Snapshot } from '../game/runtime';

/** A runtime stand-in for component tests: a mutable snapshot that notifies subscribers on `set`. */
export function fakeRuntime(game: Partial<GameState> = {}, synthPending = false) {
  const g = { ...createInitialState(content), ...game };
  let snapshot: Snapshot = { game: g, battle: createBattle(g.currentZone, g.currentStage), revision: 1, paused: false, synthPending };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<Omit<Snapshot, 'game'>> & { game?: Partial<GameState> }) => {
    snapshot = { ...snapshot, ...patch, game: { ...snapshot.game, ...patch.game } };
    for (const l of [...listeners]) l();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    equip: vi.fn((id: string) => set({ game: { equipped: id } })),
    set,
  };
}
