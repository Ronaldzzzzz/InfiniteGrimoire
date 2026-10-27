// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EQUIP_TOAST_MS, EquipToasts, MAX_EQUIP_TOASTS, pushToast, type EquipToast } from './EquipToasts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const t = (n: number): EquipToast => ({ n, spellId: `s${n}`, name: `魔法${n}` });

describe('pushToast', () => {
  it('constants', () => {
    expect(EQUIP_TOAST_MS).toBe(3000);
    expect(MAX_EQUIP_TOASTS).toBe(3);
  });
  it('puts the newest first and drops the oldest past 3', () => {
    let list: EquipToast[] = [];
    for (const n of [1, 2, 3]) list = pushToast(list, t(n));
    expect(list.map((x) => x.n)).toEqual([3, 2, 1]);
    list = pushToast(list, t(4));
    expect(list.map((x) => x.n)).toEqual([4, 3, 2]);
  });
});

describe('EquipToasts', () => {
  it('expires after 3 s without equipping', () => {
    vi.useFakeTimers();
    const onEquip = vi.fn();
    const onExpire = vi.fn();
    render(<EquipToasts toasts={[t(1)]} onEquip={onEquip} onExpire={onExpire} />);
    act(() => vi.advanceTimersByTime(2999));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onExpire).toHaveBeenCalledWith(1);
    expect(onEquip).not.toHaveBeenCalled();
  });
  it('the 裝備 button equips; one button per toast, text asks', () => {
    vi.useFakeTimers();
    const onEquip = vi.fn();
    render(<EquipToasts toasts={[t(1)]} onEquip={onEquip} onExpire={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('裝備「魔法1」？')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '裝備' }));
    expect(onEquip).toHaveBeenCalledWith(1);
  });
  it('does not run while paused (rare reveal showing), then gets its full 3 s', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const { rerender } = render(<EquipToasts toasts={[t(1)]} onEquip={vi.fn()} onExpire={onExpire} paused />);
    act(() => vi.advanceTimersByTime(10_000));
    expect(onExpire).not.toHaveBeenCalled();
    rerender(<EquipToasts toasts={[t(1)]} onEquip={vi.fn()} onExpire={onExpire} paused={false} />);
    act(() => vi.advanceTimersByTime(2999));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onExpire).toHaveBeenCalledWith(1);
  });
  it('a pause mid-way keeps the remaining time', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const { rerender } = render(<EquipToasts toasts={[t(1)]} onEquip={vi.fn()} onExpire={onExpire} />);
    act(() => vi.advanceTimersByTime(2000));
    rerender(<EquipToasts toasts={[t(1)]} onEquip={vi.fn()} onExpire={onExpire} paused />);
    act(() => vi.advanceTimersByTime(5000));
    expect(onExpire).not.toHaveBeenCalled();
    rerender(<EquipToasts toasts={[t(1)]} onEquip={vi.fn()} onExpire={onExpire} paused={false} />);
    act(() => vi.advanceTimersByTime(999));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onExpire).toHaveBeenCalledWith(1);
  });
});
