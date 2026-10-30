// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattle } from '../engine/combat';
import { content } from '../engine/content';
import type { GameRuntime } from '../game/runtime';
import { StageBar } from './StageBar';
import { fakeRuntime } from './test-runtime';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const bar = (rt: ReturnType<typeof fakeRuntime>) => render(<StageBar runtime={rt as unknown as GameRuntime} content={content} />);

describe('StageBar', () => {
  it('shows the zone and stage and a progress bar, and never says 波', () => {
    const rt = fakeRuntime({ currentZone: 'mist_meadow', currentStage: 3 });
    const b = createBattle('mist_meadow', 3);
    rt.set({ battle: { ...b, killed: Math.floor(b.total / 2) } });
    const { container } = bar(rt);
    expect(screen.getByText('迷霧草原 1-3')).toBeTruthy();
    const pb = screen.getByRole('progressbar');
    expect(Number(pb.getAttribute('aria-valuenow'))).toBe(Math.round((Math.floor(b.total / 2) / b.total) * 100));
    expect(container.textContent).not.toContain('波');
  });

  it('counts the boss clock down only once the boss has appeared', () => {
    const rt = fakeRuntime({ currentZone: 'mist_meadow', currentStage: 10 });
    const b = createBattle('mist_meadow', 10);
    rt.set({ battle: { ...b, bossMs: null } });
    bar(rt);
    expect(screen.queryByText(/剩餘/)).toBeNull();
    act(() => rt.set({ battle: { ...b, bossMs: 30_000 } }));
    expect(screen.getByText(/剩餘 150 秒/)).toBeTruthy();
  });

  it('offers 進入魔王關 while the boss stage is held', () => {
    const rt = fakeRuntime({ currentZone: 'mist_meadow', currentStage: 10 });
    const b = createBattle('mist_meadow', 10, { held: true });
    rt.set({ battle: b });
    bar(rt);
    fireEvent.click(screen.getByRole('button', { name: '進入魔王關' }));
    expect(rt.enterBoss).toHaveBeenCalledTimes(1);
    act(() => rt.set({ battle: { ...b, phase: 'walk' } }));
    expect(screen.queryByRole('button', { name: '進入魔王關' })).toBeNull();
  });

  it('offers 進入魔王關 while farming once the boss stage is open, and goes there', () => {
    const rt = fakeRuntime({ currentZone: 'mist_meadow', currentStage: 9, clearedStages: { mist_meadow: 9 } });
    rt.set({ battle: createBattle('mist_meadow', 9) });
    bar(rt);
    fireEvent.click(screen.getByRole('button', { name: '進入魔王關' }));
    expect(rt.goToBoss).toHaveBeenCalledTimes(1);
  });

  it('hides 進入魔王關 while the boss stage is not open yet', () => {
    const rt = fakeRuntime({ currentZone: 'mist_meadow', currentStage: 9, clearedStages: { mist_meadow: 8 } });
    rt.set({ battle: createBattle('mist_meadow', 9) });
    bar(rt);
    expect(screen.queryByRole('button', { name: '進入魔王關' })).toBeNull();
  });

  it('says the battle is frozen while away', () => {
    const rt = fakeRuntime();
    bar(rt);
    expect(screen.queryByRole('status', { name: '離線中' })).toBeNull();
    act(() => rt.set({ away: true }));
    expect(screen.getByRole('status', { name: '離線中' }).textContent).toContain('收益每 30 秒以 5 折計算');
  });

  it('mirrors autoAdvance in the checkbox and toggles it', () => {
    const rt = fakeRuntime();
    bar(rt);
    const box = screen.getByRole('checkbox', { name: '自動前進' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(rt.setAutoAdvance).toHaveBeenCalledWith(false);
    expect((screen.getByRole('checkbox', { name: '自動前進' }) as HTMLInputElement).checked).toBe(false);
  });

  it('says where a failed boss stage sends you back to', () => {
    const rt = fakeRuntime();
    rt.set({ lastResult: { kind: 'failed', zoneId: 'mist_meadow', stage: 10, backTo: 9 } });
    bar(rt);
    expect(screen.getByText('時間到，退回 1-9')).toBeTruthy();
  });

  it('lists the settled loot of a cleared stage with element names and counts', () => {
    const rt = fakeRuntime();
    rt.set({ lastResult: { kind: 'cleared', zoneId: 'mist_meadow', stage: 2, loot: ['el:fire:1', 'el:fire:1', 'el:wind:2'], pending: false, claimed: true } });
    bar(rt);
    expect(screen.getByText(/通過 1-2/)).toBeTruthy();
    expect(screen.getByText(/初階火 ×2、中階風/)).toBeTruthy();
  });

  it('shows 結算中… while pending and 未能結算 (no loot) when the claim did not settle', () => {
    const rt = fakeRuntime();
    rt.set({ lastResult: { kind: 'cleared', zoneId: 'mist_meadow', stage: 2, loot: [], pending: true, claimed: false } });
    bar(rt);
    expect(screen.getByText(/結算中…/)).toBeTruthy();
    act(() => rt.set({ lastResult: { kind: 'cleared', zoneId: 'mist_meadow', stage: 2, loot: [], pending: false, claimed: false } }));
    expect(screen.getByText(/未能結算/)).toBeTruthy();
    expect(screen.queryByText(/戰利品/)).toBeNull();
  });

  it('hides the notice after about 3 seconds', () => {
    vi.useFakeTimers();
    const rt = fakeRuntime();
    rt.set({ lastResult: { kind: 'failed', zoneId: 'mist_meadow', stage: 10, backTo: 9 } });
    bar(rt);
    expect(screen.getByText('時間到，退回 1-9')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(3100));
    expect(screen.queryByText('時間到，退回 1-9')).toBeNull();
  });
});
