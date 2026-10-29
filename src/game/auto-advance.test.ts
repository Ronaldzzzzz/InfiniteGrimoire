import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAutoAdvance, saveAutoAdvance } from './auto-advance';

function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
afterEach(() => vi.unstubAllGlobals());

describe('auto-advance preference', () => {
  it('defaults to true', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(loadAutoAdvance()).toBe(true);
  });
  it('reads back what was saved', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    saveAutoAdvance(false);
    expect(loadAutoAdvance()).toBe(false);
    saveAutoAdvance(true);
    expect(loadAutoAdvance()).toBe(true);
  });
  it('returns true and does not throw when storage throws', () => {
    const boom = () => {
      throw new Error('denied');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom });
    expect(loadAutoAdvance()).toBe(true);
    expect(() => saveAutoAdvance(false)).not.toThrow();
  });
});
