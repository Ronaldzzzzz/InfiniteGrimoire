// @vitest-environment jsdom
import { createRef, Profiler } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Placement } from '../engine/circle';
import { content } from '../engine/content';
import type { GameState } from '../engine/model';
import type { ActionResult } from '../game/api';
import { CircleTable, PROGRESS_MS, RARE_PROGRESS_MS, placementOfSpell, type CircleTableHandle } from './CircleTable';
import { SYNTH_ERROR_MESSAGE, SYNTH_RETRY_MESSAGE } from './messages';
import { fakeRuntime } from './test-runtime';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const FIREBALL = 'm:fire.2.----f.-----.bolt';

function setup(game: Partial<GameState> = {}, reply?: () => Promise<ActionResult | null>) {
  const rt = fakeRuntime({ inventory: { 'el:fire:1': 3, 'el:fire:2': 1, 'el:wind:1': 2 }, ...game });
  let resolve: (r: ActionResult | null) => void = () => {};
  let rejectReply: (e: unknown) => void = () => {};
  const synthesizeCircle = vi.fn(reply ?? (() => new Promise<ActionResult | null>((res, rej) => { resolve = res; rejectReply = rej; })));
  const onResult = vi.fn();
  const onCharging = vi.fn();
  const ref = createRef<CircleTableHandle>();
  const onRender = vi.fn();
  render(
    <Profiler id="parchment" onRender={onRender}>
      <CircleTable ref={ref} runtime={rt} sync={{ synthesizeCircle }} content={content} onResult={onResult} onCharging={onCharging} />
    </Profiler>,
  );
  return { rt, synthesizeCircle, onResult, onCharging, ref, onRender, reply: (r: ActionResult | null) => resolve(r), fail: (e: unknown) => rejectReply(e) };
}

const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const choose = (slot: string | RegExp, option: string | RegExp) => {
  fireEvent.click(btn(slot));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: option }));
};
/** core 初階火 + one ring-1 風 + 射: a tier-2 circle the starting player can draw */
const drawSmall = () => {
  choose(/^核心/, /^火・初階/);
  choose(/^一環 第1格/, /^風・初階/);
  choose(/^一環符文/, /^射/);
};
const synthButton = () => btn('合成') as HTMLButtonElement;
const flush = () => act(async () => {});

describe('CircleTable', () => {
  it('starts as an empty circle; 合成 waits for a core', () => {
    setup();
    expect(btn(/^核心：空/)).toBeTruthy();
    expect(synthButton().disabled).toBe(true);
    expect(screen.getByText('先選核心元素')).toBeTruthy();
  });

  it('shows the prediction (main element, effects, tier) without the form', () => {
    setup();
    drawSmall();
    const line = screen.getByLabelText('預測').textContent!;
    expect(line).toContain('火');
    expect(line).toContain('擊退');
    expect(line).toContain('約 Lv.2');
    for (const word of ['射', '魔彈', '飛刃', '鎖鏈', '形態']) expect(line).not.toContain(word);
    expect(synthButton().disabled).toBe(false);
  });

  it('greys out slots past the unlocked tier with 尚未開放 and past the core cap with 超過核心上限', () => {
    setup({ circleTier: 3 });
    choose(/^核心/, /^火・初階/);
    choose(/^一環 第1格/, /^火・初階/);
    // 初階 core caps the circle at Lv.2
    const next = btn(/^一環 第2格/) as HTMLButtonElement;
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(next.getAttribute('aria-label')).toContain('超過核心上限');
    // a 中階 core reaches Lv.4, past the unlocked Lv.3: the 3rd ring node is not open yet
    choose(/^核心/, /^火・中階/);
    choose(/^一環 第2格/, /^火・初階/);
    const locked = btn(/^一環 第3格/) as HTMLButtonElement;
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(locked.getAttribute('aria-label')).toContain('尚未開放');
  });

  it('tapping a greyed slot shows its reason (phones have no hover) and opens no picker', () => {
    setup({ circleTier: 3 });
    choose(/^核心/, /^火・初階/);
    choose(/^一環 第1格/, /^火・初階/);
    fireEvent.click(btn(/^一環 第2格/));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status', { name: '' }).textContent).toBe('超過核心上限');
    expect(btn(/^一環 第2格：空/)).toBeTruthy(); // still empty
    fireEvent.click(btn(/^二環 第1格/));
    expect(screen.getByText('一環要先放滿五格才能放二環')).toBeTruthy();
  });

  it('the picker opens over the parchment with focus inside, and Escape closes it', () => {
    setup();
    fireEvent.click(btn(/^核心/));
    const dialog = screen.getByRole('dialog', { name: '選擇核心元素' });
    expect(screen.getByRole('region', { name: '魔法陣' }).contains(dialog)).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('disables 合成 with the reason: 超過核心上限 after the core is lowered, 尚未開放 for a loaded circle', () => {
    const { ref } = setup({ circleTier: 4, inventory: { 'el:fire:1': 5, 'el:fire:2': 1, 'el:wind:1': 2 } });
    choose(/^核心/, /^火・中階/);
    choose(/^一環 第1格/, /^火・初階/);
    choose(/^一環 第2格/, /^火・初階/);
    choose(/^一環符文/, /^射/);
    expect(synthButton().disabled).toBe(false);
    choose(/^核心/, /^火・初階/);
    expect(synthButton().disabled).toBe(true);
    expect(screen.getByText('超過核心上限')).toBeTruthy();

    const loaded: Placement = {
      core: { element: 'fire', grade: 3 },
      ring1: [{ element: 'fire', grade: 1 }, { element: 'fire', grade: 1 }, { element: 'fire', grade: 1 }, { element: 'fire', grade: 1 }, null],
      ring2: [null, null, null, null, null],
      runes: ['bolt', null],
    };
    act(() => ref.current!.loadPlacement(loaded));
    expect(btn(/^核心：火・高階/)).toBeTruthy();
    expect(synthButton().disabled).toBe(true);
    expect(screen.getByText('尚未開放')).toBeTruthy();
  });

  it('disables 合成 when the elements are short', () => {
    setup({ inventory: { 'el:fire:1': 1, 'el:wind:1': 0 } });
    choose(/^核心/, /^火・初階/);
    choose(/^一環 第1格/, /^火・初階/);
    choose(/^一環符文/, /^射/);
    expect(synthButton().disabled).toBe(true);
    expect(screen.getByText(/元素不足：初階火 ×2（持有 1）/)).toBeTruthy();
  });

  it('shows branch counts and marks a circuit that does not connect', () => {
    setup();
    drawSmall();
    // core 火 sends 1 per ring-1 node, 風 takes 2 in: the layer does not match
    expect(screen.getByText('迴路對不上：大失敗機率提高')).toBeTruthy();
    expect(btn(/^核心：火・初階/).getAttribute('aria-label')).toContain('出 1');
    expect(btn(/^一環 第1格：風・初階/).getAttribute('aria-label')).toContain('入 2');
    expect(document.querySelector('.ring-line.mismatch')).toBeTruthy();
  });

  it('keeps the circle on refusal', async () => {
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    expect(h.synthesizeCircle).toHaveBeenCalledWith({
      core: { element: 'fire', grade: 1 },
      ring1: [{ element: 'wind', grade: 1 }, null, null, null, null],
      ring2: [null, null, null, null, null],
      runes: ['bolt', null],
    });
    h.reply({ kind: 'rejected', reason: 'insufficient' });
    await flush();
    expect(screen.getByText('材料不足')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('status', { name: '合成結果' })).toBeNull();
    expect(btn(/^核心：火・初階/)).toBeTruthy();
    expect(btn(/^一環 第1格：風・初階/)).toBeTruthy();
    expect(h.onResult).not.toHaveBeenCalled();
    expect(synthButton().disabled).toBe(false);
  });

  it('keeps the circle when the request fails or the save had to be synced', async () => {
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    h.fail(new Error('boom'));
    await flush();
    expect(screen.getByText(SYNTH_ERROR_MESSAGE)).toBeTruthy();
    expect(btn(/^一環 第1格：風・初階/)).toBeTruthy();
    fireEvent.click(synthButton());
    h.reply(null);
    await flush();
    expect(screen.getByText(SYNTH_RETRY_MESSAGE)).toBeTruthy();
    expect(btn(/^一環 第1格：風・初階/)).toBeTruthy();
  });

  it('a learned result shows after the 3 s progress ring, then hands the result on', async () => {
    vi.useFakeTimers();
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    expect(screen.getByRole('progressbar', { name: '注入魔力' })).toBeTruthy();
    expect(document.querySelectorAll('.spark').length).toBeGreaterThan(0);
    h.reply({ kind: 'learned', spellId: FIREBALL, form: 'bolt' });
    await flush();
    act(() => vi.advanceTimersByTime(PROGRESS_MS - 1));
    expect(screen.queryByRole('status', { name: '合成結果' })).toBeNull();
    expect(h.onResult).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status', { name: '合成結果' }).textContent).toContain('火球');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(h.onResult).toHaveBeenCalledWith({ kind: 'learned', spellId: FIREBALL, form: 'bolt' });
    // the circle stays on the parchment for another try
    expect(btn(/^一環 第1格：風・初階/)).toBeTruthy();
    expect(PROGRESS_MS).toBe(3000);
  });

  it('calls onCharging(true) before the request and onCharging(false) when the result is revealed', async () => {
    vi.useFakeTimers();
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    expect(h.onCharging.mock.calls).toEqual([[true]]);
    h.reply({ kind: 'learned', spellId: FIREBALL, form: 'bolt' });
    await flush();
    expect(h.onCharging.mock.calls).toEqual([[true]]);
    act(() => vi.advanceTimersByTime(PROGRESS_MS));
    expect(h.onCharging.mock.calls).toEqual([[true], [false]]);
  });

  it('lifts the veil on refusal, error and unmount', async () => {
    const refused = setup();
    drawSmall();
    fireEvent.click(synthButton());
    refused.reply({ kind: 'rejected', reason: 'overCap' } as ActionResult);
    await flush();
    expect(refused.onCharging.mock.calls).toEqual([[true], [false]]);
    cleanup();

    const failed = setup();
    drawSmall();
    fireEvent.click(synthButton());
    failed.fail(new Error('boom'));
    await flush();
    expect(failed.onCharging.mock.calls).toEqual([[true], [false]]);
    cleanup();

    const gone = setup();
    drawSmall();
    fireEvent.click(synthButton());
    cleanup();
    expect(gone.onCharging.mock.calls).toEqual([[true], [false]]);
  });

  it('a rare result keeps the veil for 5 s', async () => {
    vi.useFakeTimers();
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    h.reply({ kind: 'learned', spellId: 'worldfire', form: 'bolt', rare: { first: true } });
    await flush();
    act(() => vi.advanceTimersByTime(PROGRESS_MS));
    expect(h.onCharging.mock.calls).toEqual([[true]]);
    act(() => vi.advanceTimersByTime(RARE_PROGRESS_MS - PROGRESS_MS));
    expect(h.onCharging.mock.calls).toEqual([[true], [false]]);
  });

  it('a rare result keeps injecting for 5 s', async () => {
    vi.useFakeTimers();
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    h.reply({ kind: 'learned', spellId: 'worldfire', form: 'bolt', rare: { first: true } });
    await flush();
    act(() => vi.advanceTimersByTime(PROGRESS_MS));
    expect(screen.queryByRole('status', { name: '合成結果' })).toBeNull();
    expect(screen.getByRole('progressbar')).toBeTruthy();
    act(() => vi.advanceTimersByTime(RARE_PROGRESS_MS - PROGRESS_MS));
    expect(screen.getByRole('status', { name: '合成結果' }).textContent).toContain(content.spells.worldfire!.name);
    expect(h.onResult).toHaveBeenCalledTimes(1);
    expect(RARE_PROGRESS_MS).toBe(5000);
  });

  it('a failed circle says so', async () => {
    vi.useFakeTimers();
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    h.reply({ kind: 'failed', form: 'bolt' });
    await flush();
    act(() => vi.advanceTimersByTime(PROGRESS_MS));
    expect(screen.getByRole('status', { name: '合成結果' }).textContent).toContain('魔法陣崩解了');
  });

  it('nothing can be changed while injecting', async () => {
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    expect((btn(/^核心/) as HTMLButtonElement).disabled).toBe(true);
    act(() => h.ref.current!.placeItem('el:fire:1'));
    expect(btn(/^一環 第2格：空/)).toBeTruthy();
  });

  it('placeItem puts an element into the core, then the first open ring slot', () => {
    const { ref } = setup({ circleTier: 4 });
    act(() => ref.current!.placeItem('el:fire:2'));
    expect(btn(/^核心：火・中階/)).toBeTruthy();
    act(() => ref.current!.placeItem('el:wind:1'));
    expect(btn(/^一環 第1格：風・初階/)).toBeTruthy();
  });

  it('removes a node and clears the whole circle', () => {
    setup();
    drawSmall();
    choose(/^一環 第1格/, '移除');
    expect(btn(/^一環 第1格：空/)).toBeTruthy();
    fireEvent.click(btn('清空魔法陣'));
    expect(btn(/^核心：空/)).toBeTruthy();
    expect(btn(/^一環符文：空/)).toBeTruthy();
  });

  it('the parchment does not re-render on battle steps or drops it does not show', () => {
    const { rt, onRender } = setup();
    drawSmall();
    const before = onRender.mock.calls.length;
    act(() => rt.set({ battle: { ...rt.getSnapshot().battle, elapsedMs: 999 } as never }));
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 3, 'el:fire:2': 1, 'el:wind:1': 2, 'el:earth:1': 9 } } }));
    act(() => rt.set({ game: { clearedStages: { mist_meadow: 3 } } }));
    expect(onRender.mock.calls.length).toBe(before);
    // a drop of an element on the circle does
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 4, 'el:fire:2': 1, 'el:wind:1': 2, 'el:earth:1': 9 } } }));
    expect(onRender.mock.calls.length).toBe(before + 1);
  });
});

describe('placementOfSpell', () => {
  it('rebuilds the circle of a named or generated spell with the lowest grades that fit', () => {
    expect(placementOfSpell('fireball', content)).toEqual({
      core: { element: 'fire', grade: 1 },
      ring1: [null, null, null, null, { element: 'fire', grade: 1 }],
      ring2: [null, null, null, null, null],
      runes: ['bolt', null],
    });
    const p = placementOfSpell('m:water.4.--aae.-----.ring', content)!;
    expect(p.core).toEqual({ element: 'water', grade: 2 });
    expect(p.runes).toEqual(['ring', null]);
    expect(placementOfSpell('nope', content)).toBeNull();
  });
});
