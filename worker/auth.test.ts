import { describe, expect, it } from 'vitest';
import { hashToken, newToken } from './auth';

describe('auth', () => {
  it('hashToken is deterministic SHA-256 hex', async () => {
    const a = await hashToken('abc');
    expect(a).toBe(await hashToken('abc'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(await hashToken('abd'));
  });

  it('newToken is long base64url and unique', () => {
    const a = newToken();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(newToken());
  });
});
