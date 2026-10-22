// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import { createInitialState } from '../engine/persist';
import { SynthesisPanel } from './SynthesisPanel';

afterEach(cleanup);

function snap(inventory: Record<string, number>, synthPending = false, learned: string[] = ['mana_bolt']) {
  const game = { ...createInitialState(content), inventory, learned };
  return { game, synthPending };
}
const button = () => screen.getByRole('button', { name: /合成|嬗變中/ }) as HTMLButtonElement;

describe('SynthesisPanel', () => {
  it('enables the button when both slots are filled and affordable', () => {
    const sync = { synthesize: vi.fn() };
    render(<SynthesisPanel {...snap({ 'el:fire:1': 1, 'el:wind:1': 1 })} sync={sync} content={content} slots={['el:fire:1', 'el:wind:1']} onSlotsChange={() => {}} />);
    expect(button().disabled).toBe(false);
  });

  it('disables with one slot, missing stock, or a pending synth', () => {
    const sync = { synthesize: vi.fn() };
    const inv = { 'el:fire:1': 1, 'el:wind:1': 1 };
    const { rerender } = render(<SynthesisPanel {...snap(inv)} sync={sync} content={content} slots={['el:fire:1', null]} onSlotsChange={() => {}} />);
    expect(button().disabled).toBe(true);
    rerender(<SynthesisPanel {...snap(inv)} sync={sync} content={content} slots={['el:fire:1', 'el:fire:1']} onSlotsChange={() => {}} />);
    expect(button().disabled).toBe(true);
    rerender(<SynthesisPanel {...snap(inv, true)} sync={sync} content={content} slots={['el:fire:1', 'el:wind:1']} onSlotsChange={() => {}} />);
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain('嬗變中');
  });

  it('synthesizes with sorted inputs and shows the message', async () => {
    const sync = { synthesize: vi.fn(async () => ({ kind: 'noReaction' as const })) };
    const onSlotsChange = vi.fn();
    render(<SynthesisPanel {...snap({ 'el:fire:1': 1, 'el:wind:1': 1 })} sync={sync} content={content} slots={['el:wind:1', 'el:fire:1']} onSlotsChange={onSlotsChange} />);
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByText('沒有反應……材料損耗了一部分')).toBeTruthy());
    expect(sync.synthesize).toHaveBeenCalledWith(['el:fire:1', 'el:wind:1']);
    expect(onSlotsChange).toHaveBeenCalledWith([null, null]);
  });

  it('reports the result only after the reply arrives', async () => {
    let reply: (r: { kind: 'learned'; spellId: string; crafted: boolean }) => void = () => {};
    const sync = { synthesize: vi.fn(() => new Promise<{ kind: 'learned'; spellId: string; crafted: boolean }>((r) => (reply = r))) };
    const onResult = vi.fn();
    render(<SynthesisPanel {...snap({ 'el:fire:1': 2 })} sync={sync} content={content} slots={['el:fire:1', 'el:fire:1']} onSlotsChange={() => {}} onResult={onResult} />);
    fireEvent.click(button());
    expect(onResult).not.toHaveBeenCalled();
    reply({ kind: 'learned', spellId: 'fireball', crafted: false });
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ kind: 'learned', spellId: 'fireball', crafted: false }));
    expect(screen.getByText('習得新魔法：火球')).toBeTruthy();
  });

  it('shows an error and keeps the slots when synthesize throws', async () => {
    const sync = { synthesize: vi.fn(async () => { throw new Error('x'); }) };
    const onSlotsChange = vi.fn();
    render(<SynthesisPanel {...snap({ 'el:fire:1': 1, 'el:wind:1': 1 })} sync={sync} content={content} slots={['el:fire:1', 'el:wind:1']} onSlotsChange={onSlotsChange} />);
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByText('連線異常，請稍後再試')).toBeTruthy());
    expect(onSlotsChange).not.toHaveBeenCalled();
  });

  it('asks to retry when the server state was adopted instead (null result)', async () => {
    const sync = { synthesize: vi.fn(async () => null) };
    const onSlotsChange = vi.fn();
    render(<SynthesisPanel {...snap({ 'el:fire:1': 1, 'el:wind:1': 1 })} sync={sync} content={content} slots={['el:fire:1', 'el:wind:1']} onSlotsChange={onSlotsChange} />);
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByText('存檔已同步，請再試一次')).toBeTruthy());
    expect(onSlotsChange).not.toHaveBeenCalled();
  });

  it('keeps the slots and names the needed grade when the server refuses for the grade', async () => {
    const sync = { synthesize: vi.fn(async () => ({ kind: 'rejected' as const, reason: 'grade' as const })) };
    const onSlotsChange = vi.fn();
    const s = snap({ 'el:fire:1': 1 }, false, ['mana_bolt', 'fire_tornado']);
    render(<SynthesisPanel {...s} sync={sync} content={content} slots={['el:fire:1', 'fire_tornado']} onSlotsChange={onSlotsChange} />);
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByText('元素階級不夠，需要中階以上')).toBeTruthy());
    expect(onSlotsChange).not.toHaveBeenCalled();
  });

  it('synthesis slots accept a learned spell', () => {
    const onSlotsChange = vi.fn();
    const s = snap({ 'el:fire:2': 1 }, false, ['mana_bolt', 'fireball']);
    const { rerender } = render(<SynthesisPanel {...s} sync={{ synthesize: vi.fn() }} content={content} slots={[null, null]} onSlotsChange={onSlotsChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: '放入魔法' }), { target: { value: 'fireball' } });
    expect(onSlotsChange).toHaveBeenCalledWith(['fireball', null]);
    rerender(<SynthesisPanel {...s} sync={{ synthesize: vi.fn() }} content={content} slots={['fireball', 'el:fire:2']} onSlotsChange={onSlotsChange} />);
    expect(screen.getByRole('button', { name: '火球' })).toBeTruthy();
    expect(button().disabled).toBe(false);
    // a spell that is not learned can't be synthesized with
    rerender(<SynthesisPanel {...snap({ 'el:fire:2': 1 })} sync={{ synthesize: vi.fn() }} content={content} slots={['fireball', 'el:fire:2']} onSlotsChange={onSlotsChange} />);
    expect(button().disabled).toBe(true);
  });

  it('removes an item when its slot is clicked', () => {
    const onSlotsChange = vi.fn();
    render(<SynthesisPanel {...snap({ 'el:fire:1': 1 })} sync={{ synthesize: vi.fn() }} content={content} slots={['el:fire:1', null]} onSlotsChange={onSlotsChange} />);
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
    render(<SynthesisPanel {...s} sync={{ synthesize: vi.fn() }} content={content} slots={[null, null]} onSlotsChange={onSlotsChange} />);
    expect(screen.getByRole('button', { name: /^初階火 \+ 初階風：無反應 100%/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^初階雷 \+ 初階火：無反應 75%、魔力彈 25%/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^初階風 \+ 初階火/ }));
    expect(onSlotsChange).toHaveBeenCalledWith(['el:wind:1', 'el:fire:1']);
  });
});
