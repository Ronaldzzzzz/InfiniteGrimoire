// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchPresence } from './presence';

function stubDoc() {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_: string, l: () => void) => void listeners.add(l),
    removeEventListener: (_: string, l: () => void) => void listeners.delete(l),
  };
  const set = (v: DocumentVisibilityState) => {
    doc.visibilityState = v;
    for (const l of [...listeners]) l();
  };
  return { doc: doc as unknown as Document, set, listeners };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('watchPresence', () => {
  it('hidden for the delay fires onAway once', () => {
    const { doc, set } = stubDoc();
    const onAway = vi.fn();
    watchPresence({ delayMs: 30_000, onAway, onReturn: vi.fn() }, doc);
    set('hidden');
    vi.advanceTimersByTime(30_000);
    vi.advanceTimersByTime(60_000);
    expect(onAway).toHaveBeenCalledTimes(1);
  });
  it('hidden 29 s then visible fires nothing', () => {
    const { doc, set } = stubDoc();
    const onAway = vi.fn();
    const onReturn = vi.fn();
    watchPresence({ delayMs: 30_000, onAway, onReturn }, doc);
    set('hidden');
    vi.advanceTimersByTime(29_000);
    set('visible');
    vi.advanceTimersByTime(60_000);
    expect(onAway).not.toHaveBeenCalled();
    expect(onReturn).not.toHaveBeenCalled();
  });
  it('blur while visible never fires onAway', () => {
    const { doc } = stubDoc();
    const onAway = vi.fn();
    watchPresence({ delayMs: 30_000, onAway, onReturn: vi.fn() }, doc);
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(120_000);
    expect(onAway).not.toHaveBeenCalled();
  });
  it('onReturn only after onAway', () => {
    const { doc, set } = stubDoc();
    const onReturn = vi.fn();
    watchPresence({ delayMs: 30_000, onAway: vi.fn(), onReturn }, doc);
    set('hidden');
    vi.advanceTimersByTime(30_000);
    set('visible');
    expect(onReturn).toHaveBeenCalledTimes(1);
    set('visible');
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
  it('disposer removes listeners', () => {
    const { doc, set, listeners } = stubDoc();
    const onAway = vi.fn();
    const stop = watchPresence({ delayMs: 30_000, onAway, onReturn: vi.fn() }, doc);
    set('hidden');
    stop();
    vi.advanceTimersByTime(60_000);
    expect(onAway).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
