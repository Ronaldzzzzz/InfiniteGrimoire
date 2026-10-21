// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import { SynthesisPanel } from './SynthesisPanel';

afterEach(cleanup);

function snap(inventory: Record<string, number>, synthPending = false) {
  const game = { ...createInitialState(gameData), inventory };
  return { game, synthPending };
}
const button = () => screen.getByRole('button', { name: /合成|嬗變中/ }) as HTMLButtonElement;

describe('SynthesisPanel', () => {
  it('enables the button when both slots are filled and affordable', () => {
    const sync = { synthesize: vi.fn() };
    render(<SynthesisPanel {...snap({ 'el:fire:1': 1, 'el:wind:1': 1 })} sync={sync} data={gameData} slots={['el:fire:1', 'el:wind:1']} onSlotsChange={() => {}} />);
    expect(button().disabled).toBe(false);
  });

  it('disables with one slot, missing stock, or a pending synth', () => {
    const sync = { synthesize: vi.fn() };
    const inv = { 'el:fire:1': 1, 'el:wind:1': 1 };
    const { rerender } = render(<SynthesisPanel {...snap(inv)} sync={sync} data={gameData} slots={['el:fire:1', null]} onSlotsChange={() => {}} />);
    expect(button().disabled).toBe(true);
    rerender(<SynthesisPanel {...snap(inv)} sync={sync} data={gameData} slots={['el:fire:1', 'el:fire:1']} onSlotsChange={() => {}} />);
    expect(button().disabled).toBe(true);
    rerender(<SynthesisPanel {...snap(inv, true)} sync={sync} data={gameData} slots={['el:fire:1', 'el:wind:1']} onSlotsChange={() => {}} />);
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain('嬗變中');
  });

  it('synthesizes with sorted inputs and shows the message', async () => {
    const sync = { synthesize: vi.fn(async () => ({ kind: 'noReaction' as const, consumed: ['el:fire:1'] })) };
    const onSlotsChange = vi.fn();
    render(<SynthesisPanel {...snap({ 'el:fire:1': 1, 'el:wind:1': 1 })} sync={sync} data={gameData} slots={['el:wind:1', 'el:fire:1']} onSlotsChange={onSlotsChange} />);
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByText('沒有反應……材料損耗了一部分')).toBeTruthy());
    expect(sync.synthesize).toHaveBeenCalledWith(['el:fire:1', 'el:wind:1']);
    expect(onSlotsChange).toHaveBeenCalledWith([null, null]);
  });

  it('shows an error and keeps the slots when synthesize throws', async () => {
    const sync = { synthesize: vi.fn(async () => { throw new Error('x'); }) };
    const onSlotsChange = vi.fn();
    render(<SynthesisPanel {...snap({ 'el:fire:1': 1, 'el:wind:1': 1 })} sync={sync} data={gameData} slots={['el:fire:1', 'el:wind:1']} onSlotsChange={onSlotsChange} />);
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByText('連線異常，請稍後再試')).toBeTruthy());
    expect(onSlotsChange).not.toHaveBeenCalled();
  });

  it('asks to retry when the server state was adopted instead (null result)', async () => {
    const sync = { synthesize: vi.fn(async () => null) };
    const onSlotsChange = vi.fn();
    render(<SynthesisPanel {...snap({ 'el:fire:1': 1, 'el:wind:1': 1 })} sync={sync} data={gameData} slots={['el:fire:1', 'el:wind:1']} onSlotsChange={onSlotsChange} />);
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByText('存檔已同步，請再試一次')).toBeTruthy());
    expect(onSlotsChange).not.toHaveBeenCalled();
  });

  it('removes an item when its slot is clicked', () => {
    const onSlotsChange = vi.fn();
    render(<SynthesisPanel {...snap({ 'el:fire:1': 1 })} sync={{ synthesize: vi.fn() }} data={gameData} slots={['el:fire:1', null]} onSlotsChange={onSlotsChange} />);
    fireEvent.click(screen.getByRole('button', { name: '初階火' }));
    expect(onSlotsChange).toHaveBeenCalledWith([null, null]);
  });

  it('shows the attempts as an element table and fills the slots from a cell', () => {
    const s = snap({});
    s.game.synthesisLog = {
      'el:fire:1+el:wind:1': { attempts: 4, results: { none: 4 }, noReaction: true },
      'el:fire:1+el:thunder:1': { attempts: 4, results: { mana_bolt: 1, none: 3 }, noReaction: false },
    };
    const onSlotsChange = vi.fn();
    render(<SynthesisPanel {...s} sync={{ synthesize: vi.fn() }} data={gameData} slots={[null, null]} onSlotsChange={onSlotsChange} />);
    expect(screen.getByRole('button', { name: /^初階火 \+ 初階風：無反應 100%/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^初階雷 \+ 初階火：無反應 75%、魔力彈 25%/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^初階風 \+ 初階火/ }));
    expect(onSlotsChange).toHaveBeenCalledWith(['el:wind:1', 'el:fire:1']);
  });
});
