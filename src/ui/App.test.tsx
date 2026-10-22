// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattle } from '../engine/battle';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import type { GameRuntime, Snapshot } from '../game/runtime';
import type { ApiClient } from '../game/api';
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
  const sync = { status: 'online', onStatus: () => () => {}, synthesize: vi.fn(), uploadNow: vi.fn(async () => {}) } as unknown as SyncController;
  const api = {
    getAccount: vi.fn(async () => ({ displayName: 'Aria', username: null, sessions: 1 })),
    bind: vi.fn(),
    changePassword: vi.fn(),
    logoutOthers: vi.fn(),
    logout: vi.fn(),
    login: vi.fn(),
  } as unknown as ApiClient;
  render(<App runtime={runtime} sync={sync} data={gameData} api={api} onSwitched={vi.fn()} onLoggedOut={vi.fn()} />);
  return { runtime };
}

const slotTexts = () =>
  screen.getAllByRole('button').filter((b) => b.classList.contains('slot')).map((b) => b.textContent);

describe('App layout', () => {
  it('opens the account dialog from the top bar', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /帳號.*未綁定/ }));
    expect(await screen.findByRole('dialog', { name: '帳號' })).toBeTruthy();
  });

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

  it('also shows the hint right under the grimoire (narrow screens stack the grimoire below the slots)', () => {
    setup();
    const hint = gameData.spells.fireball.hint;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${gameData.spells.fireball.name}（未學會）`) }));
    const grimoire = screen.getByRole('region', { name: '魔導書' });
    const below = grimoire.querySelector('.grimoire-hint');
    expect(below?.classList.contains('only-narrow')).toBe(true);
    expect(below?.textContent).toContain(hint);
  });
});
