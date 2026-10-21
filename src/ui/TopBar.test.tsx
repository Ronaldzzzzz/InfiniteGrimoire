// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattle } from '../engine/battle';
import { gameData } from '../engine/data';
import { createInitialState, type GameState } from '../engine/state';
import type { GameRuntime, Snapshot } from '../game/runtime';
import { BOSS_HINT, SAVE_ERROR_MESSAGE } from './messages';
import { TopBar } from './TopBar';

afterEach(cleanup);

function runtime(game: GameState, battlePatch: Partial<Snapshot['battle']> = {}) {
  const snapshot: Snapshot = { game, battle: { ...createBattle(game.currentZone), ...battlePatch }, revision: 1, paused: false, synthPending: false };
  return { getSnapshot: () => snapshot, subscribe: () => () => {}, equip: vi.fn(), travel: vi.fn() } as unknown as GameRuntime;
}

describe('TopBar', () => {
  it('shows the zone picker, the equipped spell and the spell picker', () => {
    render(<TopBar runtime={runtime(createInitialState(gameData))} data={gameData} status="online" />);
    expect(screen.getByRole('button', { name: '選擇地點' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '裝備魔法' })).toBeTruthy();
    expect(screen.getAllByText(/魔力彈/).length).toBeGreaterThan(0);
  });

  it('shows the overlevel note and the stuck-boss hint', () => {
    const g = { ...createInitialState(gameData), currentZone: 'ash_volcano', unlockedZones: ['mist_meadow', 'thunder_gorge', 'ash_volcano'] };
    const boss = { uid: 1, defId: 'ash_dragon', hp: 1, maxHp: 1, x: 1, statuses: [] };
    render(<TopBar runtime={runtime(g, { bossActive: true, monsters: [boss] })} data={gameData} status="online" />);
    expect(screen.getByText(BOSS_HINT)).toBeTruthy();
    cleanup();
    const over = { ...createInitialState(gameData), learned: ['mana_bolt', 'explosion'], equipped: 'explosion' };
    render(<TopBar runtime={runtime(over)} data={gameData} status="online" />);
    expect(screen.getByText(/越級：掉落效益 56%/)).toBeTruthy();
  });

  it('shows the save error banner when the status is error', () => {
    render(<TopBar runtime={runtime(createInitialState(gameData))} data={gameData} status="error" />);
    expect(screen.getByRole('alert').textContent).toBe(SAVE_ERROR_MESSAGE);
  });
});
