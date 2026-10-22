import { describe, expect, it } from 'vitest';
import { DUMMY_HASH, hashPassword, needsRehash, PBKDF2_ITERATIONS, verifyPassword } from './password';

describe('password hashing', () => {
  it('uses the versioned pbkdf2 format with a random salt', async () => {
    const a = await hashPassword('correct horse');
    expect(a).toMatch(new RegExp(`^pbkdf2-sha256\\$${PBKDF2_ITERATIONS}\\$[A-Za-z0-9_-]{22}\\$[A-Za-z0-9_-]{43}$`));
    expect(a).not.toBe(await hashPassword('correct horse'));
    expect(a).not.toContain('correct horse');
  });

  it('verifies the right password only', async () => {
    const h = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', h)).toBe(true);
    expect(await verifyPassword('correct horsf', h)).toBe(false);
  });

  it('verifies older, weaker hashes and flags them for rehash', async () => {
    const old = await hashPassword('correct horse', 1000);
    expect(await verifyPassword('correct horse', old)).toBe(true);
    expect(needsRehash(old)).toBe(true);
    expect(needsRehash(await hashPassword('correct horse'))).toBe(false);
  });

  it('rejects malformed hashes', async () => {
    expect(await verifyPassword('x', 'nope')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2-sha256$abc$AAAA$AAAA')).toBe(false);
    expect(needsRehash('nope')).toBe(true);
  });

  it('the dummy hash is well-formed and matches nothing', async () => {
    expect(needsRehash(DUMMY_HASH)).toBe(false);
    expect(await verifyPassword('', DUMMY_HASH)).toBe(false);
    expect(await verifyPassword('password1', DUMMY_HASH)).toBe(false);
  });
});
