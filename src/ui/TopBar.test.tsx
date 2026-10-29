// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattle } from '../engine/combat';
import { content } from '../engine/content';
import type { GameState } from '../engine/model';
import { createInitialState } from '../engine/persist';
import type { GameRuntime, Snapshot } from '../game/runtime';
import { BOSS_HINT, SAVE_ERROR_MESSAGE } from './messages';
import { TopBar } from './TopBar';

afterEach(cleanup);

function runtime(game: GameState, battlePatch: Partial<Snapshot['battle']> = {}, synthPending = false) {
  const snapshot: Snapshot = { game, battle: { ...createBattle(game.currentZone, game.currentStage), ...battlePatch }, revision: 1, paused: false, synthPending, autoAdvance: true, lastResult: null };
  return { getSnapshot: () => snapshot, subscribe: () => () => {}, equip: vi.fn(), travel: vi.fn() } as unknown as GameRuntime;
}

describe('TopBar', () => {
  it('shows the zone picker, the equipped spell and the spell picker', () => {
    render(<TopBar runtime={runtime(createInitialState(content))} content={content} status="online" bound={true} onOpenAccount={() => {}} />);
    expect(screen.getByRole('button', { name: '選擇地點' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '裝備魔法' })).toBeTruthy();
    expect(screen.getAllByText(/魔力彈/).length).toBeGreaterThan(0);
  });

  it('shows the overlevel note and the stuck-boss hint', () => {
    const g = { ...createInitialState(content), currentZone: 'thunder_gorge', unlockedZones: ['mist_meadow', 'thunder_gorge'] };
    const boss = { uid: 1, defId: 'storm_roc', hp: 1, maxHp: 1, x: 1, y: 0, statuses: [], kx: 0, ky: 0, wander: 0 };
    render(<TopBar runtime={runtime(g, { bossActive: true, foes: [boss] })} content={content} status="online" bound={true} onOpenAccount={() => {}} />);
    expect(screen.getByText(BOSS_HINT)).toBeTruthy();
    cleanup();
    const over = { ...createInitialState(content), learned: ['mana_bolt', 'fire_tornado'], equipped: 'fire_tornado' };
    render(<TopBar runtime={runtime(over)} content={content} status="online" bound={true} onOpenAccount={() => {}} />);
    expect(screen.getByText(/越級：掉落效益 75%/)).toBeTruthy();
  });

  it('locks zone and spell changes while a synthesis is in flight (its result would undo them)', () => {
    render(<TopBar runtime={runtime(createInitialState(content), {}, true)} content={content} status="online" bound={true} onOpenAccount={() => {}} />);
    expect((screen.getByRole('button', { name: '選擇地點' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '裝備魔法' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the save error banner when the status is error', () => {
    render(<TopBar runtime={runtime(createInitialState(content))} content={content} status="error" bound={true} onOpenAccount={() => {}} />);
    expect(screen.getByRole('alert').textContent).toBe(SAVE_ERROR_MESSAGE);
  });

  it('shows the account button with an unbound badge for guests', () => {
    const onOpenAccount = vi.fn();
    render(<TopBar runtime={runtime(createInitialState(content))} content={content} status="online" bound={false} onOpenAccount={onOpenAccount} />);
    const button = screen.getByRole('button', { name: /帳號/ });
    expect(button.textContent).toContain('未綁定');
    fireEvent.click(button);
    expect(onOpenAccount).toHaveBeenCalled();
  });
});
