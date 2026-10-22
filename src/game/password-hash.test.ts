import { describe, expect, it } from 'vitest';
import { CLIENT_PBKDF2_ITERATIONS, clientPasswordHash, passwordSalt } from './password-hash';

describe('client password hash', () => {
  it('uses 300k iterations and a salt from the normalized username', () => {
    expect(CLIENT_PBKDF2_ITERATIONS).toBe(300_000);
    expect(passwordSalt(' Ａｒｉａ_1 ')).toBe('infinite-grimoire:v1:aria_1');
  });

  it('is deterministic per account and differs by password', async () => {
    const a = await clientPasswordHash('Aria_1', 'password1', 1000);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await clientPasswordHash('ＡＲＩＡ_1', 'password1', 1000)).toBe(a);
    expect(await clientPasswordHash('Aria_1', 'password2', 1000)).not.toBe(a);
    expect(await clientPasswordHash('other_1', 'password1', 1000)).not.toBe(a);
  });

  it('defaults to the full iteration count', async () => {
    expect(await clientPasswordHash('Aria_1', 'password1')).not.toBe(await clientPasswordHash('Aria_1', 'password1', 1000));
  });
});
