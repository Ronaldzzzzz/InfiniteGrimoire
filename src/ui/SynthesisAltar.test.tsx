// @vitest-environment jsdom
import { Profiler } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { GameState } from '../engine/model';
import type { ActionResult } from '../game/api';
import { MIN_FUSE_MS, RETRY_HINT, REVEAL_MS, SynthesisAltar, type Slots } from './SynthesisAltar';
import { craftedId } from '../engine/spells';
import { fakeRuntime } from './test-runtime';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Reply = ActionResult | null;
const go = () => screen.getByRole('button', { name: /^(合成|嬗變中…)$/ }) as HTMLButtonElement;
const altar = () => screen.getByRole('region', { name: '合成台' });
const reveal = () => screen.queryByRole('status', { name: '合成結果' });
const message = () => document.querySelector('.synth-message')!.textContent;
const flush = () => act(async () => {});

function setup(
  game: Partial<GameState>,
  slots: Slots,
  synthesize: (inputs: string[]) => Promise<Reply> = vi.fn(async () => null),
  synthPending = false,
) {
  const rt = fakeRuntime({ learned: ['mana_bolt'], ...game }, synthPending);
  const sync = { synthesize: vi.fn(synthesize) };
  const onSlotsChange = vi.fn();
  const onResult = vi.fn();
  const view = render(<SynthesisAltar runtime={rt} sync={sync} content={content} slots={slots} onSlotsChange={onSlotsChange} onResult={onResult} />);
  const rerender = (s: Slots) =>
    view.rerender(<SynthesisAltar runtime={rt} sync={sync} content={content} slots={s} onSlotsChange={onSlotsChange} onResult={onResult} />);
  return { rt, sync, onSlotsChange, onResult, rerender };
}

describe('SynthesisAltar', () => {
  describe('fusion cost of two spells', () => {
    const needs = () => screen.queryByLabelText('融合所需元素');
    const spells = { learned: ['mana_bolt', 'fireball', 'wind_blade'] };

    it('lists every element the fusion also needs with how many are held, and blocks 合成 while short', () => {
      const a = setup({ ...spells, inventory: { 'el:fire:1': 1 } }, ['fireball', 'wind_blade']);
      expect(needs()!.textContent).toBe('另外需要：初階火 ×1（持有 1）、初階風 ×1（持有 0）');
      expect(needs()!.querySelectorAll('.short')).toHaveLength(1);
      expect(needs()!.querySelector('.short')!.textContent).toContain('初階風');
      expect(go().disabled).toBe(true);
      act(() => a.rt.set({ game: { inventory: { 'el:fire:1': 1, 'el:wind:1': 1 } } }));
      expect(needs()!.querySelectorAll('.short')).toHaveLength(0);
      expect(go().disabled).toBe(false);
    });

    it('shows nothing when no fusion cost applies', () => {
      setup({ ...spells, learned: [...spells.learned, 'fire_tornado'] }, ['fireball', 'wind_blade']);
      expect(needs()).toBeNull(); // the named result is known: a duplicate costs no fusion
      cleanup();
      setup({ learned: ['mana_bolt', 'fireball'], inventory: { 'el:wind:2': 1 } }, ['fireball', 'el:wind:2']);
      expect(needs()).toBeNull(); // an element input: no fusion cost
      cleanup();
      setup(spells, ['fireball', null]);
      expect(needs()).toBeNull();
    });
  });

  it('enables 合成 only with two affordable, known inputs and no pending action', () => {
    const inv = { 'el:fire:1': 1, 'el:wind:1': 1 };
    const a = setup({ inventory: inv }, ['el:fire:1', 'el:wind:1']);
    expect(go().disabled).toBe(false);
    a.rerender(['el:fire:1', null]);
    expect(go().disabled).toBe(true);
    a.rerender(['el:fire:1', 'el:fire:1']); // needs two, has one
    expect(go().disabled).toBe(true);
    a.rerender(['fireball', 'el:fire:1']); // spell not learned
    expect(go().disabled).toBe(true);
    act(() => a.rt.set({ game: { learned: ['mana_bolt', 'fireball'] } }));
    expect(go().disabled).toBe(false);
    act(() => a.rt.set({ synthPending: true }));
    expect(go().disabled).toBe(true);
    expect(go().textContent).toBe('嬗變中…');
    act(() => a.rt.set({ synthPending: false, game: { inventory: {} } }));
    expect(go().disabled).toBe(true);
  });

  describe('a miss on a random recipe', () => {
    const retry = () => document.querySelector('.synth-retry')?.textContent ?? null;
    const missed = craftedId('el:fire:3', 'inferno');
    const play = async (learned: string[], reply: ActionResult) => {
      vi.useFakeTimers();
      setup({ learned: ['mana_bolt', ...learned], inventory: { 'el:fire:3': 1 } }, ['inferno', 'el:fire:3'], async () => reply);
      fireEvent.click(go());
      await flush();
      act(() => vi.advanceTimersByTime(MIN_FUSE_MS));
    };

    it('hints that trying again may turn out differently, without naming the result', async () => {
      await play(['inferno'], { kind: 'learned', spellId: missed, crafted: true });
      expect(retry()).toBe(RETRY_HINT);
      expect(retry()).not.toContain('焚世');
    });

    it('also hints after a duplicate miss', async () => {
      await play(['inferno', missed], { kind: 'duplicate', spellId: missed, refunded: [] });
      expect(retry()).toBe(RETRY_HINT);
    });

    it('stays quiet when the roll hits, or when the hidden result is already learned', async () => {
      await play(['inferno'], { kind: 'learned', spellId: 'worldfire', crafted: false, rare: { first: true } });
      expect(retry()).toBeNull();
      cleanup();
      await play(['inferno', 'worldfire', missed], { kind: 'duplicate', spellId: missed, refunded: [] });
      expect(retry()).toBeNull();
    });
  });

  it('synthesizes sorted inputs and reveals only after the reply and MIN_FUSE_MS', async () => {
    vi.useFakeTimers();
    const a = setup({ inventory: { 'el:fire:1': 1, 'el:wind:1': 1 } }, ['el:wind:1', 'el:fire:1'], async () => ({
      kind: 'learned',
      spellId: 'fireball',
      crafted: false,
    }));
    fireEvent.click(go());
    expect(a.sync.synthesize).toHaveBeenCalledWith(['el:fire:1', 'el:wind:1']);
    expect(altar().className).toContain('fusing');
    expect(go().textContent).toBe('嬗變中…');
    await flush();
    expect(reveal()).toBeNull();
    expect(a.onSlotsChange).not.toHaveBeenCalled();
    expect(a.onResult).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(MIN_FUSE_MS - 1));
    expect(reveal()).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const r = reveal()!;
    expect(r.textContent).toContain('新發現！');
    expect(r.textContent).toContain('火球');
    expect(r.className).toContain('tone-new');
    expect(altar().className).not.toContain('fusing');
    expect(a.onSlotsChange).toHaveBeenCalledWith([null, null]);
    expect(a.onResult).toHaveBeenCalledWith({ kind: 'learned', spellId: 'fireball', crafted: false });
    expect(message()).toBe('習得新魔法：火球');
    // the reveal leaves on its own; the message stays
    act(() => vi.advanceTimersByTime(REVEAL_MS));
    expect(reveal()).toBeNull();
    expect(message()).toBe('習得新魔法：火球');
  });

  it('a rare result clears both sides and reports it after MIN_FUSE_MS, without an altar reveal', async () => {
    vi.useFakeTimers();
    const rare: ActionResult = { kind: 'learned', spellId: 'worldfire', crafted: false, rare: { first: true } };
    const a = setup({ inventory: { 'el:fire:1': 1, 'el:wind:1': 1 } }, ['el:fire:1', 'el:wind:1'], async () => rare);
    fireEvent.click(go());
    await flush();
    act(() => vi.advanceTimersByTime(MIN_FUSE_MS - 1));
    expect(a.onResult).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(a.onSlotsChange).toHaveBeenCalledWith([null, null]);
    expect(a.onResult).toHaveBeenCalledWith(rare);
    expect(altar().className).not.toContain('fusing');
    expect(altar().className).not.toContain('revealing');
    expect(reveal()).toBeNull();
  });

  it('keeps fusing while the reply is slower than MIN_FUSE_MS, then reveals at once', async () => {
    vi.useFakeTimers();
    let reply: (r: Reply) => void = () => {};
    const a = setup({ inventory: { 'el:fire:1': 1, 'el:wind:1': 1 } }, ['el:fire:1', 'el:wind:1'], () => new Promise<Reply>((r) => (reply = r)));
    fireEvent.click(go());
    act(() => vi.advanceTimersByTime(MIN_FUSE_MS * 3));
    expect(altar().className).toContain('fusing');
    expect(reveal()).toBeNull();
    await act(async () => reply({ kind: 'noReaction' }));
    expect(reveal()!.className).toContain('tone-fizzle');
    expect(a.onSlotsChange).toHaveBeenCalledWith([null, null]);
    // clicking the reveal dismisses it
    fireEvent.click(reveal()!);
    expect(reveal()).toBeNull();
    expect(message()).toBe('沒有反應……材料損耗了一部分');
  });

  it('a refusal stops at once, keeps the inputs and says why', async () => {
    vi.useFakeTimers();
    const a = setup(
      { inventory: { 'el:fire:1': 1 }, learned: ['mana_bolt', 'fire_tornado'] },
      ['el:fire:1', 'fire_tornado'],
      async () => ({ kind: 'rejected', reason: 'grade' }),
    );
    fireEvent.click(go());
    await flush();
    expect(altar().className).not.toContain('fusing');
    expect(altar().className).toContain('bounce');
    expect(reveal()).toBeNull();
    expect(a.onSlotsChange).not.toHaveBeenCalled();
    expect(a.onResult).toHaveBeenCalledWith({ kind: 'rejected', reason: 'grade' });
    expect(message()).toMatch(/^元素階級不夠/);
    act(() => vi.advanceTimersByTime(400));
    expect(altar().className).not.toContain('bounce');
    act(() => vi.advanceTimersByTime(MIN_FUSE_MS));
    expect(reveal()).toBeNull();
    expect(a.onSlotsChange).not.toHaveBeenCalled();
  });

  it('null keeps the inputs with the retry message; a throw keeps them with the error message', async () => {
    const inv = { inventory: { 'el:fire:1': 1, 'el:wind:1': 1 } };
    const a = setup(inv, ['el:fire:1', 'el:wind:1'], async () => null);
    fireEvent.click(go());
    await flush();
    expect(message()).toBe('存檔已同步，請再試一次');
    expect(altar().className).not.toContain('fusing');
    expect(a.onSlotsChange).not.toHaveBeenCalled();
    expect(a.onResult).not.toHaveBeenCalled();
    cleanup();

    const b = setup(inv, ['el:fire:1', 'el:wind:1'], async () => {
      throw new Error('x');
    });
    fireEvent.click(go());
    await flush();
    expect(message()).toBe('連線異常，請稍後再試');
    expect(altar().className).toContain('bounce');
    expect(b.onSlotsChange).not.toHaveBeenCalled();
    expect(b.onResult).not.toHaveBeenCalled();
  });

  it('clicking a side takes it out; sides are locked while fusing', async () => {
    const a = setup({ inventory: { 'el:fire:1': 1, 'el:wind:1': 1 } }, ['el:fire:1', null], () => new Promise<Reply>(() => {}));
    expect(screen.getByRole('button', { name: '空的合成位置' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取出初階火' }));
    expect(a.onSlotsChange).toHaveBeenCalledWith([null, null]);
    a.onSlotsChange.mockClear();

    a.rerender(['el:fire:1', 'el:wind:1']);
    fireEvent.click(go());
    const side = screen.getByRole('button', { name: '取出初階風' }) as HTMLButtonElement;
    expect(side.disabled).toBe(true);
    fireEvent.click(side);
    expect(a.onSlotsChange).not.toHaveBeenCalled();
  });

  it('shows a spell side with tier, empower level and element dots', () => {
    setup({ inventory: { 'el:fire:2': 3 }, learned: ['mana_bolt', 'fireball'], levels: { fireball: 3 } }, ['fireball', 'el:fire:2']);
    const spell = screen.getByRole('button', { name: '取出火球' });
    expect(within(spell).getByText('火球').className).toContain('altar-name');
    expect(spell.textContent).toMatch(/Lv\.\d/);
    expect(spell.textContent).toContain('強化 +2');
    expect(spell.querySelector('.dots')).toBeTruthy();
    const el = screen.getByRole('button', { name: '取出中階火' });
    expect(el.textContent).toContain('火・中階');
    expect(el.textContent).toContain('×3');
  });

  it('a spell side has a halo and more particles than an element side', () => {
    setup({ inventory: { 'el:fire:1': 1 }, learned: ['mana_bolt', 'fireball'] }, ['fireball', 'el:fire:1']);
    const spell = screen.getByRole('button', { name: '取出火球' });
    const el = screen.getByRole('button', { name: '取出初階火' });
    expect(spell.querySelector('.halo')).toBeTruthy();
    expect(el.querySelector('.halo')).toBeNull();
    expect(spell.querySelectorAll('.p').length).toBeGreaterThan(el.querySelectorAll('.p').length);
    expect(el.querySelectorAll('.p-spark').length).toBe(el.querySelectorAll('.p').length);
  });

  it('placing the next input ends the reveal and is not cleared', async () => {
    vi.useFakeTimers();
    const a = setup({ inventory: { 'el:fire:1': 2, 'el:wind:1': 1 } }, ['el:fire:1', 'el:wind:1'], async () => ({ kind: 'noReaction' }));
    fireEvent.click(go());
    await flush();
    act(() => vi.advanceTimersByTime(MIN_FUSE_MS));
    expect(reveal()).toBeTruthy();
    a.rerender([null, null]);
    expect(reveal()).toBeTruthy();
    a.onSlotsChange.mockClear();
    a.rerender(['el:fire:1', null]);
    expect(reveal()).toBeNull();
    expect(message()).toBe('');
    act(() => vi.advanceTimersByTime(REVEAL_MS * 2));
    expect(a.onSlotsChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '取出初階火' })).toBeTruthy();
  });

  it('clears its timers on unmount', async () => {
    vi.useFakeTimers();
    const a = setup({ inventory: { 'el:fire:1': 1, 'el:wind:1': 1 } }, ['el:fire:1', 'el:wind:1'], async () => ({ kind: 'noReaction' }));
    fireEvent.click(go());
    await flush();
    cleanup();
    act(() => vi.advanceTimersByTime(MIN_FUSE_MS * 2));
    expect(a.onSlotsChange).not.toHaveBeenCalled();
    expect(a.onResult).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not re-render on drops unrelated to its inputs', () => {
    const rt = fakeRuntime({ inventory: { 'el:fire:1': 1 }, learned: ['mana_bolt', 'fireball'] });
    const onRender = vi.fn();
    render(
      <Profiler id="altar" onRender={onRender}>
        <SynthesisAltar runtime={rt} sync={{ synthesize: vi.fn() }} content={content} slots={['fireball', 'el:fire:1']} onSlotsChange={vi.fn()} />
      </Profiler>,
    );
    const before = onRender.mock.calls.length;
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 1, 'el:water:1': 9, 'mat:mist_dew': 2 } } }));
    act(() => rt.set({ game: { learned: ['mana_bolt', 'fireball', 'wind_blade'] } }));
    expect(onRender.mock.calls.length).toBe(before);
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 4 } } }));
    expect(onRender.mock.calls.length).toBe(before + 1);
    expect(screen.getByRole('button', { name: '取出初階火' }).textContent).toContain('×4');
  });
});
