import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchPresence } from './presence';

/** A page whose visibility and window focus the test drives. */
function stubPage() {
  const docListeners = new Set<() => void>();
  const winListeners = new Set<() => void>();
  let focused = true;
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    hasFocus: () => focused,
    addEventListener: (_: string, l: () => void) => void docListeners.add(l),
    removeEventListener: (_: string, l: () => void) => void docListeners.delete(l),
  };
  const win = {
    addEventListener: (_: string, l: () => void) => void winListeners.add(l),
    removeEventListener: (_: string, l: () => void) => void winListeners.delete(l),
  };
  const fire = (ls: Set<() => void>) => {
    for (const l of [...ls]) l();
  };
  return {
    env: { doc: doc as unknown as Document, win: win as unknown as Window },
    hide: () => {
      doc.visibilityState = 'hidden';
      fire(docListeners);
    },
    show: () => {
      doc.visibilityState = 'visible';
      fire(docListeners);
    },
    blur: () => {
      focused = false;
      fire(winListeners);
    },
    focus: () => {
      focused = true;
      fire(winListeners);
    },
    listenerCount: () => docListeners.size + winListeners.size,
  };
}

const DELAY = 10_000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('watchPresence', () => {
  it('a window that loses focus for the delay fires onAway once, even while visible', () => {
    const p = stubPage();
    const onAway = vi.fn();
    watchPresence({ delayMs: DELAY, onAway, onReturn: vi.fn() }, p.env);
    p.blur();
    vi.advanceTimersByTime(DELAY);
    vi.advanceTimersByTime(60_000);
    expect(onAway).toHaveBeenCalledTimes(1);
  });
  it('a hidden page fires onAway too', () => {
    const p = stubPage();
    const onAway = vi.fn();
    watchPresence({ delayMs: DELAY, onAway, onReturn: vi.fn() }, p.env);
    p.hide();
    vi.advanceTimersByTime(DELAY);
    expect(onAway).toHaveBeenCalledTimes(1);
  });
  it('back in focus before the delay fires nothing', () => {
    const p = stubPage();
    const onAway = vi.fn();
    const onReturn = vi.fn();
    watchPresence({ delayMs: DELAY, onAway, onReturn }, p.env);
    p.blur();
    vi.advanceTimersByTime(DELAY - 1);
    p.focus();
    vi.advanceTimersByTime(60_000);
    expect(onAway).not.toHaveBeenCalled();
    expect(onReturn).not.toHaveBeenCalled();
  });
  it('onReturn fires once when the window is in use again after onAway', () => {
    const p = stubPage();
    const onReturn = vi.fn();
    watchPresence({ delayMs: DELAY, onAway: vi.fn(), onReturn }, p.env);
    p.blur();
    vi.advanceTimersByTime(DELAY);
    p.focus();
    expect(onReturn).toHaveBeenCalledTimes(1);
    p.focus();
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
  it('a visible page without focus is still away; only focus returns', () => {
    const p = stubPage();
    const onReturn = vi.fn();
    watchPresence({ delayMs: DELAY, onAway: vi.fn(), onReturn }, p.env);
    p.blur();
    p.hide();
    vi.advanceTimersByTime(DELAY);
    p.show();
    expect(onReturn).not.toHaveBeenCalled();
    p.focus();
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
  it('disposer removes listeners', () => {
    const p = stubPage();
    const onAway = vi.fn();
    const stop = watchPresence({ delayMs: DELAY, onAway, onReturn: vi.fn() }, p.env);
    p.blur();
    stop();
    vi.advanceTimersByTime(60_000);
    expect(onAway).not.toHaveBeenCalled();
    expect(p.listenerCount()).toBe(0);
  });
  it('a page that starts without focus starts the away timer', () => {
    const p = stubPage();
    p.blur();
    const onAway = vi.fn();
    watchPresence({ delayMs: DELAY, onAway, onReturn: vi.fn() }, p.env);
    vi.advanceTimersByTime(DELAY);
    expect(onAway).toHaveBeenCalledTimes(1);
  });
});
