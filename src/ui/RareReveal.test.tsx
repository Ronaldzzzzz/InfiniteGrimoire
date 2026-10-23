// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { NamedSpellDef } from '../engine/model';
import { resolveSpell } from '../engine/spells';
import { RARE_REVEAL_MS, RareReveal } from './RareReveal';

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
  it('lasts RARE_REVEAL_MS = 4000', () => {
    expect(RARE_REVEAL_MS).toBe(4000);
  });

  it('plays gather → burst → title, then calls onDone once at RARE_REVEAL_MS', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<RareReveal spell={worldfire} first={false} onDone={onDone} />);
    expect(phase()).toBe('gather');
    act(() => vi.advanceTimersByTime(999));
    expect(phase()).toBe('gather');
    act(() => vi.advanceTimersByTime(1));
    expect(phase()).toBe('burst');
    act(() => vi.advanceTimersByTime(1000));
    expect(phase()).toBe('title');
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1999));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(RARE_REVEAL_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a click in the first two phases jumps to the title; a click on the title ends it', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<RareReveal spell={worldfire} first={false} onDone={onDone} />);
    fireEvent.click(dialog());
    expect(phase()).toBe('title');
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(dialog());
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(RARE_REVEAL_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a click during the burst also jumps to the title', () => {
    vi.useFakeTimers();
    render(<RareReveal spell={worldfire} first={false} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(1500));
    expect(phase()).toBe('burst');
    fireEvent.click(dialog());
    expect(phase()).toBe('title');
  });

  it('the title says 全服首次發現 for the first finder, with dots, name, tier, 稀有魔法 and the hint', () => {
    vi.useFakeTimers();
    render(<RareReveal spell={worldfire} first onDone={vi.fn()} />);
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
    render(<RareReveal spell={worldfire} first={false} onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(dialog().textContent).toContain('✦ 稀有魔法！✦');
    expect(dialog().textContent).not.toContain('全服首次發現');
  });

  it('prefixes 殘卷： when a hint lacks it', () => {
    vi.useFakeTimers();
    const bare: NamedSpellDef = { ...worldfire, hint: '三重的火⋯⋯' };
    render(<RareReveal spell={bare} first onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(dialog().textContent).toContain('殘卷：三重的火⋯⋯');
  });

  it('draws burst particles in the spell element colour and shape', () => {
    vi.useFakeTimers();
    render(<RareReveal spell={worldfire} first onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(1000));
    const ps = dialog().querySelectorAll('.rr-p');
    expect(ps.length).toBeGreaterThan(0);
    expect(dialog().querySelectorAll('.rr-p.p-spark').length).toBe(ps.length);
    expect((ps[0] as HTMLElement).style.getPropertyValue('--c')).toBe('#e2643b');
  });

  it('starts on the title under prefers-reduced-motion, and still ends at RARE_REVEAL_MS', () => {
    vi.useFakeTimers();
    stubReducedMotion(true);
    const onDone = vi.fn();
    render(<RareReveal spell={worldfire} first onDone={onDone} />);
    expect(phase()).toBe('title');
    expect(dialog().textContent).toContain('✦ 全服首次發現 ✦');
    act(() => vi.advanceTimersByTime(RARE_REVEAL_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('plays normally when motion is allowed', () => {
    stubReducedMotion(false);
    render(<RareReveal spell={worldfire} first onDone={vi.fn()} />);
    expect(phase()).toBe('gather');
  });

  it('clears its timers on unmount', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<RareReveal spell={worldfire} first onDone={onDone} />);
    cleanup();
    act(() => vi.advanceTimersByTime(RARE_REVEAL_MS * 2));
    expect(onDone).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
