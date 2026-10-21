// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createBattle } from '../engine/battle';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import type { Snapshot } from '../game/runtime';
import { bossAlive, useRuntime } from './useGame';

afterEach(cleanup);

function fakeStore(initial: Snapshot) {
  let snap = initial;
  const ls = new Set<() => void>();
  return {
    getSnapshot: () => snap,
    subscribe: (l: () => void) => {
      ls.add(l);
      return () => void ls.delete(l);
    },
    set(next: Snapshot) {
      snap = next;
      for (const l of [...ls]) l();
    },
  };
}

function initial(): Snapshot {
  const game = createInitialState(gameData);
  return { game, battle: createBattle(game.currentZone), revision: 1, paused: false, synthPending: false };
}

describe('useRuntime', () => {
  it('re-renders only when the selected value changes', () => {
    const store = fakeStore(initial());
    let renders = 0;
    function Probe() {
      renders++;
      const eq = useRuntime(store, (s) => s.game.equipped);
      return <span>{eq}</span>;
    }
    render(<Probe />);
    const before = renders;
    act(() => store.set({ ...store.getSnapshot(), battle: { ...store.getSnapshot().battle, castTimerMs: 999 } }));
    expect(renders).toBe(before);
    act(() => store.set({ ...store.getSnapshot(), game: { ...store.getSnapshot().game, equipped: 'fireball' } }));
    expect(renders).toBe(before + 1);
  });
});

describe('bossAlive', () => {
  it('is true only while the zone boss is on the field during a boss fight', () => {
    const s = initial();
    const zone = gameData.zones[0]!;
    const boss = { uid: 9, defId: zone.bossId, hp: 1, maxHp: 1, x: 1, statuses: [] };
    expect(bossAlive(s, gameData)).toBe(false);
    expect(bossAlive({ ...s, battle: { ...s.battle, bossActive: true, monsters: [boss] } }, gameData)).toBe(true);
    expect(bossAlive({ ...s, battle: { ...s.battle, bossActive: true, monsters: [] } }, gameData)).toBe(false);
  });
});
