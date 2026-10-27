// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { NamedSpellDef } from '../engine/model';
import { resolveSpell } from '../engine/spells';
import { RareReveal } from './RareReveal';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const worldfire = resolveSpell('worldfire', content) as NamedSpellDef;
const dialog = () => screen.getByRole('dialog', { name: '稀有魔法' });
const phase = () => /phase-(gather|burst|title)/.exec(dialog().className)?.[1];

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

describe('RareReveal', () => {
  it('plays gather → burst → title, then waits for a choice (no auto-close)', () => {
    vi.useFakeTimers();
    const onChoose = vi.fn();
    render(<RareReveal spell={worldfire} first={false} onChoose={onChoose} />);
    expect(phase()).toBe('gather');
    act(() => vi.advanceTimersByTime(1000));
    expect(phase()).toBe('burst');
    act(() => vi.advanceTimersByTime(1000));
    expect(phase()).toBe('title');
    act(() => vi.advanceTimersByTime(60000));
    expect(phase()).toBe('title');
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '裝備' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '不裝備' })).toBeTruthy();
  });

  it('a click in the first two phases jumps to the title; clicking the background there does not choose', () => {
    vi.useFakeTimers();
    const onChoose = vi.fn();
    render(<RareReveal spell={worldfire} first={false} onChoose={onChoose} />);
    fireEvent.click(dialog());
    expect(phase()).toBe('title');
    fireEvent.click(dialog());
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('the buttons call onChoose once with true / false', () => {
    vi.useFakeTimers();
    const yes = vi.fn();
    const { unmount } = render(<RareReveal spell={worldfire} first={false} onChoose={yes} />);
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByRole('button', { name: '裝備' }));
    fireEvent.click(screen.getByRole('button', { name: '不裝備' }));
    expect(yes).toHaveBeenCalledTimes(1);
    expect(yes).toHaveBeenCalledWith(true);
    unmount();
    const no = vi.fn();
    render(<RareReveal spell={worldfire} first={false} onChoose={no} />);
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByRole('button', { name: '不裝備' }));
    expect(no).toHaveBeenCalledWith(false);
  });

  it('keyboard: 裝備 gets focus at the title; Enter/Space on it chooses; Escape chooses 不裝備', () => {
    vi.useFakeTimers();
    const a = vi.fn();
    const { unmount } = render(<RareReveal spell={worldfire} first={false} onChoose={a} />);
    act(() => vi.advanceTimersByTime(2000));
    const btn = screen.getByRole('button', { name: '裝備' });
    expect(document.activeElement).toBe(btn);
    // a native Enter/Space click happens unless keydown was default-prevented
    expect(fireEvent.keyDown(btn, { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(btn, { key: ' ' })).toBe(true);
    fireEvent.click(btn);
    expect(a).toHaveBeenCalledWith(true);
    unmount();
    const b = vi.fn();
    render(<RareReveal spell={worldfire} first={false} onChoose={b} />);
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.keyDown(dialog(), { key: 'Enter' });
    expect(b).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(b).toHaveBeenCalledWith(false);
  });

  it('reduced motion: 裝備 has focus immediately', () => {
    stubReducedMotion(true);
    render(<RareReveal spell={worldfire} first onChoose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '裝備' }));
  });

  it('a click during the burst also jumps to the title', () => {
    vi.useFakeTimers();
    render(<RareReveal spell={worldfire} first={false} onChoose={vi.fn()} />);
    act(() => vi.advanceTimersByTime(1500));
    expect(phase()).toBe('burst');
    fireEvent.click(dialog());
    expect(phase()).toBe('title');
  });

  it('the title says 全服首次發現 for the first finder, with dots, name, tier, 稀有魔法 and the hint', () => {
    vi.useFakeTimers();
    render(<RareReveal spell={worldfire} first onChoose={vi.fn()} />);
    act(() => vi.advanceTimersByTime(2000));
    const text = dialog().textContent!;
    expect(text).toContain('✦ 全服首次發現 ✦');
    expect(text).not.toContain('✦ 稀有魔法！✦');
    expect(text).toContain('焚世之焰');
    expect(text).toContain(`Lv.${worldfire.tier}`);
    expect(text).toContain('稀有魔法');
    expect(dialog().querySelector('.dots')).toBeTruthy();
    // the hint already starts with 殘卷：, which must not be doubled
    expect(text).toContain(worldfire.hint);
    expect(text).not.toContain('殘卷：殘卷：');
  });

  it('later finders see 稀有魔法！', () => {
    vi.useFakeTimers();
    render(<RareReveal spell={worldfire} first={false} onChoose={vi.fn()} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(dialog().textContent).toContain('✦ 稀有魔法！✦');
    expect(dialog().textContent).not.toContain('全服首次發現');
  });

  it('prefixes 殘卷： when a hint lacks it', () => {
    vi.useFakeTimers();
    const bare: NamedSpellDef = { ...worldfire, hint: '三重的火⋯⋯' };
    render(<RareReveal spell={bare} first onChoose={vi.fn()} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(dialog().textContent).toContain('殘卷：三重的火⋯⋯');
  });

  it('draws burst particles in the spell element colour and shape', () => {
    vi.useFakeTimers();
    render(<RareReveal spell={worldfire} first onChoose={vi.fn()} />);
    act(() => vi.advanceTimersByTime(1000));
    const ps = dialog().querySelectorAll('.rr-p');
    expect(ps.length).toBeGreaterThan(0);
    expect(dialog().querySelectorAll('.rr-p.p-spark').length).toBe(ps.length);
    expect((ps[0] as HTMLElement).style.getPropertyValue('--c')).toBe('#e2643b');
  });

  it('starts on the title under prefers-reduced-motion, with both buttons', () => {
    vi.useFakeTimers();
    stubReducedMotion(true);
    const onChoose = vi.fn();
    render(<RareReveal spell={worldfire} first onChoose={onChoose} />);
    expect(phase()).toBe('title');
    expect(dialog().textContent).toContain('✦ 全服首次發現 ✦');
    expect(screen.getByRole('button', { name: '不裝備' })).toBeTruthy();
  });

  it('plays normally when motion is allowed', () => {
    stubReducedMotion(false);
    render(<RareReveal spell={worldfire} first onChoose={vi.fn()} />);
    expect(phase()).toBe('gather');
  });

  it('clears its timers on unmount', () => {
    vi.useFakeTimers();
    const onChoose = vi.fn();
    render(<RareReveal spell={worldfire} first onChoose={onChoose} />);
    cleanup();
    act(() => vi.advanceTimersByTime(10000));
    expect(onChoose).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
