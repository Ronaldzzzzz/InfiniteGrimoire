import { describe, expect, it } from 'vitest';
import { CLIENT_HASH_RE, hashPassword, verifyPassword } from './password';

const CLIENT = 'A'.repeat(42) + 'Q';
const OTHER = 'B'.repeat(42) + 'Q';

describe('password hashing (hmac + pepper over the client hash)', () => {
  it('uses the versioned hmac format and is deterministic', async () => {
    const a = await hashPassword(CLIENT, 'pepper');
    expect(a).toMatch(/^hmac-sha256\$v1\$[A-Za-z0-9_-]{43}$/);
    expect(await hashPassword(CLIENT, 'pepper')).toBe(a);
    expect(a).not.toContain(CLIENT);
  });

  it('verifies the right client hash and pepper only', async () => {
    const h = await hashPassword(CLIENT, 'pepper');
    expect(await verifyPassword(CLIENT, h, 'pepper')).toBe(true);
    expect(await verifyPassword(OTHER, h, 'pepper')).toBe(false);
    expect(await verifyPassword(CLIENT, h, 'other-pepper')).toBe(false);
  });

  it('rejects malformed and old-format hashes', async () => {
    expect(await verifyPassword(CLIENT, 'nope', 'pepper')).toBe(false);
    expect(await verifyPassword(CLIENT, `pbkdf2-sha256$50000$${'A'.repeat(22)}$${'A'.repeat(43)}`, 'pepper')).toBe(false);
  });

  it('refuses to work without a pepper', async () => {
    await expect(hashPassword(CLIENT, '')).rejects.toThrow();
    await expect(verifyPassword(CLIENT, await hashPassword(CLIENT, 'pepper'), '')).rejects.toThrow();
  });

  it('recognizes the client hash format', () => {
    expect(CLIENT_HASH_RE.test(CLIENT)).toBe(true);
    expect(CLIENT_HASH_RE.test('password1')).toBe(false);
    expect(CLIENT_HASH_RE.test(CLIENT + 'A')).toBe(false);
  });
});
