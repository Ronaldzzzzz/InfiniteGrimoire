// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { Discovery } from '../game/api';
import { DiscoveryBell } from './DiscoveryBell';
import { discoveryLine, timeAgo } from './messages';
import { FEED_POLL_MS, FEED_SEEN_KEY, useDiscoveryFeed } from './useDiscoveryFeed';

const d = (id: number, over: Partial<Discovery> = {}): Discovery => ({ id, spellId: 'worldfire', displayName: `玩家${id}`, at: Date.now() - 5 * 60_000, first: false, ...over });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('timeAgo', () => {
  it('has the boundaries', () => {
    expect(timeAgo(0)).toBe('剛剛');
    expect(timeAgo(59_999)).toBe('剛剛');
    expect(timeAgo(60_000)).toBe('1 分鐘前');
    expect(timeAgo(3_599_999)).toBe('59 分鐘前');
    expect(timeAgo(3_600_000)).toBe('1 小時前');
    expect(timeAgo(86_400_000 - 1)).toBe('23 小時前');
    expect(timeAgo(86_400_000)).toBe('1 天前');
  });
});

describe('useDiscoveryFeed', () => {
  beforeEach(() => vi.useFakeTimers());

  it('fetches on going online, polls with the newest id, merges, and stops on unmount', async () => {
    const fn = vi.fn().mockResolvedValueOnce([d(2), d(1)]).mockResolvedValueOnce([d(3)]).mockResolvedValue([]);
    const { result, unmount } = renderHook(() => useDiscoveryFeed({ recentDiscoveries: fn }, true));
    await act(async () => {});
    expect(fn).toHaveBeenCalledWith(undefined);
    expect(result.current.entries.map((e) => e.id)).toEqual([2, 1]);
    await act(async () => {
      vi.advanceTimersByTime(FEED_POLL_MS);
    });
    expect(fn).toHaveBeenLastCalledWith(2);
    expect(result.current.entries.map((e) => e.id)).toEqual([3, 2, 1]);
    await act(async () => result.current.refresh());
    expect(fn).toHaveBeenCalledTimes(3);
    unmount();
    vi.advanceTimersByTime(FEED_POLL_MS * 3);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does nothing offline and keeps the old list on errors', async () => {
    const off = vi.fn().mockResolvedValue([]);
    renderHook(() => useDiscoveryFeed({ recentDiscoveries: off }, false));
    await act(async () => {
      vi.advanceTimersByTime(FEED_POLL_MS * 2);
    });
    expect(off).not.toHaveBeenCalled();
    const fn = vi.fn().mockResolvedValueOnce([d(1)]).mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useDiscoveryFeed({ recentDiscoveries: fn }, true));
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(FEED_POLL_MS);
    });
    expect(result.current.entries.map((e) => e.id)).toEqual([1]);
  });

  it('keeps at most 20, newest first', async () => {
    const many = Array.from({ length: 25 }, (_, i) => d(25 - i));
    const { result } = renderHook(() => useDiscoveryFeed({ recentDiscoveries: vi.fn().mockResolvedValue(many) }, true));
    await act(async () => {});
    expect(result.current.entries).toHaveLength(20);
    expect(result.current.entries[0]?.id).toBe(25);
  });
});

describe('DiscoveryBell', () => {
  it('counts unread, clears on open and stores the newest id', () => {
    render(<DiscoveryBell entries={[d(3), d(2)]} content={content} ownName="我" />);
    const bell = screen.getByRole('button', { name: '發現動態（2 則未讀）' });
    expect(bell.textContent).toContain('2');
    fireEvent.click(bell);
    expect(localStorage.getItem(FEED_SEEN_KEY)).toBe('3');
    expect(screen.getByRole('button', { name: '發現動態' })).toBeTruthy();
  });

  it('words first and later finds, with the hint and age, and no recipe', () => {
    render(<DiscoveryBell entries={[d(2, { displayName: '乙' }), d(1, { displayName: '甲', first: true })]} content={content} ownName="" />);
    fireEvent.click(screen.getByRole('button', { name: /發現動態/ }));
    const text = screen.getByRole('list').textContent ?? '';
    expect(text).toContain('✦ 全服首次發現　甲 合出了「');
    expect(text).toContain('乙 也合出了「');
    expect(text).toContain('殘卷：');
    expect(text).not.toContain('殘卷：殘卷：');
    expect(text).toContain('5 分鐘前');
    expect(text).not.toMatch(/\+|el:|inferno|c\(/);
    expect(discoveryLine(d(1), content)).toContain('也合出了');
  });

  it('shows the empty message', () => {
    render(<DiscoveryBell entries={[]} content={content} ownName="" />);
    fireEvent.click(screen.getByRole('button', { name: '發現動態' }));
    expect(screen.getByText('還沒有人發現稀有魔法')).toBeTruthy();
  });

  it('does not count your own finds as unread', () => {
    render(<DiscoveryBell entries={[d(2, { displayName: '我' }), d(1)]} content={content} ownName="我" />);
    expect(screen.getByRole('button', { name: '發現動態（1 則未讀）' })).toBeTruthy();
  });

  it('survives a localStorage that throws, with zero unread', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<DiscoveryBell entries={[d(1)]} content={content} ownName="" />);
    const bell = screen.getByRole('button', { name: '發現動態' });
    fireEvent.click(bell);
    expect(screen.getByRole('list')).toBeTruthy();
  });
});
