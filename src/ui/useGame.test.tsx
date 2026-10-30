// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createBattle } from '../engine/combat';
import { content } from '../engine/content';
import { createInitialState } from '../engine/persist';
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
  const game = createInitialState(content);
  return { game, battle: createBattle(game.currentZone, game.currentStage), revision: 1, paused: false, away: false, synthPending: false, autoAdvance: true, lastResult: null };
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
    act(() => store.set({ ...store.getSnapshot(), battle: { ...store.getSnapshot().battle, killed: 999 } }));
    expect(renders).toBe(before);
    act(() => store.set({ ...store.getSnapshot(), game: { ...store.getSnapshot().game, equipped: 'fireball' } }));
    expect(renders).toBe(before + 1);
  });
});

describe('bossAlive', () => {
  it('is true only while the zone boss is on the field during a boss fight', () => {
    const s = initial();
    const zone = content.zones[0]!;
    const boss = { uid: 9, defId: zone.bossId, hp: 1, maxHp: 1, x: 1, y: 0, statuses: [], kx: 0, ky: 0, wander: 0 };
    expect(bossAlive(s, content)).toBe(false);
    expect(bossAlive({ ...s, battle: { ...s.battle, bossActive: true, foes: [boss] } }, content)).toBe(true);
    expect(bossAlive({ ...s, battle: { ...s.battle, bossActive: true, foes: [] } }, content)).toBe(false);
  });
});
