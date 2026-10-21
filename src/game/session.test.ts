import { describe, expect, it } from 'vitest';
import { readToken, writeToken, TOKEN_KEY } from './session';

const throwing = (): Storage =>
  ({
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  }) as unknown as Storage;

describe('session', () => {
  it('readToken returns null when storage throws', () => {
    expect(readToken(throwing())).toBeNull();
    expect(readToken(null)).toBeNull();
  });
  it('writeToken returns false when setItem throws', () => {
    expect(writeToken(throwing(), 't')).toBe(false);
    expect(writeToken(null, 't')).toBe(false);
  });
  it('round-trips a token', () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as unknown as Storage;
    expect(writeToken(s, 'abc')).toBe(true);
    expect(m.get(TOKEN_KEY)).toBe('abc');
    expect(readToken(s)).toBe('abc');
  });
});
