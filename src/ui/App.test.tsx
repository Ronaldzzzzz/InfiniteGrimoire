// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattle } from '../engine/battle';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import type { GameRuntime, Snapshot } from '../game/runtime';
import type { SyncController } from '../game/sync';
import { App } from './App';

vi.mock('./BattleCanvas', () => ({ BattleCanvas: () => null }));
afterEach(cleanup);

function setup(inventory: Record<string, number> = { 'el:fire:1': 3, 'el:wind:1': 1 }) {
  const game = { ...createInitialState(gameData), inventory };
  const snapshot: Snapshot = { game, battle: createBattle(game.currentZone), revision: 1, paused: false, synthPending: false };
  const runtime = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    equip: vi.fn(),
    travel: vi.fn(),
    upgrade: vi.fn(() => true),
  } as unknown as GameRuntime;
  const sync = { status: 'online', onStatus: () => () => {}, synthesize: vi.fn() } as unknown as SyncController;
  render(<App runtime={runtime} sync={sync} data={gameData} />);
  return { runtime };
}

const slotTexts = () =>
  screen.getAllByRole('button').filter((b) => b.classList.contains('slot')).map((b) => b.textContent);

describe('App layout', () => {
  it('has no synthesis / grimoire / map tabs', () => {
    setup();
    expect(screen.queryByRole('button', { name: '魔導書' })).toBeNull();
    expect(screen.queryByRole('button', { name: '地圖' })).toBeNull();
    expect(screen.getByRole('button', { name: '合成' })).toBeTruthy(); // the synth action button, not a tab
  });

  it('puts a clicked element cell into the first empty slot, then the next one', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    expect(slotTexts()).toEqual(['初階火', '空']);
    fireEvent.click(screen.getByRole('button', { name: '初階風 ×1' }));
    expect(slotTexts()).toEqual(['初階火', '初階風']);
  });

  it('keeps the slots when an element is upgraded', () => {
    const { runtime } = setup();
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    fireEvent.click(screen.getByRole('button', { name: '升階火' }));
    expect(runtime.upgrade).toHaveBeenCalledWith('fire', 1);
    expect(slotTexts()).toEqual(['初階火', '空']);
  });

  it('shows a locked spell hint next to the slots, and clears it when a learned spell is clicked', () => {
    setup();
    const hint = gameData.spells.fireball.hint;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${gameData.spells.fireball.name}（未學會）`) }));
    expect(screen.getByLabelText('殘卷線索').textContent).toContain(hint);
    fireEvent.click(screen.getByRole('button', { name: gameData.spells.mana_bolt.name }));
    expect(screen.queryByText(hint)).toBeNull();
  });
});
