// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { ActionResult } from '../game/api';
import { EmpowerPanel } from './EmpowerPanel';
import { fakeRuntime } from './test-runtime';

afterEach(cleanup);

const button = () => screen.getByRole('button', { name: /強化/ }) as HTMLButtonElement;

describe('EmpowerPanel', () => {
  it('EmpowerPanel shows the next cost and locks while pending', async () => {
    // fireball level 2 -> 3 costs 6 grade-1 fire (empowerCost)
    const rt = fakeRuntime({ learned: ['mana_bolt', 'fireball'], levels: { fireball: 2 }, inventory: { 'el:fire:1': 5 } });
    let resolve: (r: ActionResult) => void = () => {};
    const sync = { action: vi.fn(() => new Promise<ActionResult | null>((r) => (resolve = r))) };
    const { rerender } = render(<EmpowerPanel spellId="fireball" runtime={rt} sync={sync} content={content} />);
    const panel = screen.getByRole('region', { name: '強化' });
    expect(panel.textContent).toContain('強化 +1');
    expect(panel.textContent).toContain('下一級：強化 +2');
    expect(panel.textContent).toContain('初階火 ×6');
    expect(panel.textContent).toContain('持有 5');
    expect(button().disabled).toBe(true);

    rt.set({ game: { inventory: { 'el:fire:1': 6 } } });
    rerender(<EmpowerPanel spellId="fireball" runtime={rt} sync={sync} content={content} />);
    expect(button().disabled).toBe(false);
    fireEvent.click(button());
    expect(sync.action).toHaveBeenCalledWith('empower', { spellId: 'fireball' });
    rt.set({ synthPending: true });
    await waitFor(() => expect(button().textContent).toBe('強化中…'));
    expect(button().disabled).toBe(true);
    rt.set({ synthPending: false, game: { levels: { fireball: 3 }, inventory: {} } });
    resolve({ kind: 'empowered', level: 3 });
    await waitFor(() => expect(screen.getByText('強化成功：強化 +2')).toBeTruthy());
  });

  it('shows the first step without a current level, and the cap at max level', () => {
    const rt = fakeRuntime({ learned: ['mana_bolt', 'fireball'], levels: {}, inventory: {} });
    const sync = { action: vi.fn() };
    const { rerender } = render(<EmpowerPanel spellId="fireball" runtime={rt} sync={sync} content={content} />);
    const panel = screen.getByRole('region', { name: '強化' });
    expect(panel.textContent).toContain('尚未強化');
    expect(panel.textContent).toContain('初階火 ×4');
    rt.set({ game: { levels: { fireball: 50 } } });
    rerender(<EmpowerPanel spellId="fireball" runtime={rt} sync={sync} content={content} />);
    expect(screen.getByRole('region', { name: '強化' }).textContent).toContain('已經強化到最高等級');
    expect(screen.queryByRole('button', { name: /強化/ })).toBeNull();
  });

  it('element-less spells cannot be empowered', () => {
    render(<EmpowerPanel spellId="mana_bolt" runtime={fakeRuntime()} sync={{ action: vi.fn() }} content={content} />);
    expect(screen.getByRole('region', { name: '強化' }).textContent).toContain('無屬性魔法不能強化');
    expect(screen.queryByRole('button', { name: /強化/ })).toBeNull();
  });
});
