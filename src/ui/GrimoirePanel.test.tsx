// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattle } from '../engine/battle';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import type { GameRuntime, Snapshot } from '../game/runtime';
import { GrimoirePanel } from './GrimoirePanel';

afterEach(cleanup);

function fakeRuntime() {
  const game = createInitialState(gameData);
  const snapshot: Snapshot = { game, battle: createBattle(game.currentZone), revision: 1, paused: false, synthPending: false };
  return { getSnapshot: () => snapshot, subscribe: () => () => {}, equip: vi.fn() };
}

describe('GrimoirePanel', () => {
  it('equips a learned spell on click and clears the hint', () => {
    const rt = fakeRuntime();
    const onHint = vi.fn();
    render(<GrimoirePanel runtime={rt as unknown as GameRuntime} onHint={onHint} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(gameData.spells.mana_bolt.name) }));
    expect(rt.equip).toHaveBeenCalledWith('mana_bolt');
    expect(onHint).toHaveBeenCalledWith(null);
  });

  it('reports the locked spell for its hint without equipping', () => {
    const rt = fakeRuntime();
    const onHint = vi.fn();
    render(<GrimoirePanel runtime={rt as unknown as GameRuntime} onHint={onHint} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(gameData.spells.fireball.name) }));
    expect(onHint).toHaveBeenCalledWith('fireball');
    expect(rt.equip).not.toHaveBeenCalled();
  });
});
