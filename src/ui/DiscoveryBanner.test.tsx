// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import { craftedId, resolveSpell } from '../engine/spells';
import { DiscoveryBanner } from './DiscoveryBanner';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DiscoveryBanner', () => {
  it('DiscoveryBanner shows the tag and hides after 2.6 s', () => {
    const spell = resolveSpell(craftedId('fireball', 'wind_blade'), content)!;
    const onDone = vi.fn();
    render(<DiscoveryBanner spell={spell} isNew onDone={onDone} />);
    const banner = screen.getByRole('status', { name: '新發現' });
    expect(banner.textContent).toContain('新發現！');
    expect(banner.textContent).toContain(spell.name);
    expect(banner.textContent).toContain('相性極佳');
    expect(banner.textContent).toContain(spell.desc);
    act(() => vi.advanceTimersByTime(2599));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status', { name: '新發現' })).toBeNull();
  });

  it('says 已經會了 for a known result and renders nothing without a spell', () => {
    const { rerender } = render(<DiscoveryBanner spell={content.spells.fireball!} isNew={false} onDone={vi.fn()} />);
    expect(screen.getByRole('status', { name: '新發現' }).textContent).toContain('已經會了');
    expect(screen.getByRole('status', { name: '新發現' }).textContent).toContain('基礎');
    rerender(<DiscoveryBanner spell={null} isNew={false} onDone={vi.fn()} />);
    expect(screen.queryByRole('status', { name: '新發現' })).toBeNull();
  });
});
