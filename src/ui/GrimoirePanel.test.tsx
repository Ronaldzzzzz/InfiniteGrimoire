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
  it('equips a learned spell on click', () => {
    const rt = fakeRuntime();
    render(<GrimoirePanel runtime={rt as unknown as GameRuntime} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(gameData.spells.mana_bolt.name) }));
    expect(rt.equip).toHaveBeenCalledWith('mana_bolt');
  });

  it('shows the hint for a locked spell without equipping', () => {
    const rt = fakeRuntime();
    render(<GrimoirePanel runtime={rt as unknown as GameRuntime} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(gameData.spells.fireball.name) }));
    expect(screen.getByText(gameData.spells.fireball.hint)).toBeTruthy();
    expect(rt.equip).not.toHaveBeenCalled();
  });
});
