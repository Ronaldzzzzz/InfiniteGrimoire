import { fromBase64Url, toBase64Url } from './auth';

/**
 * The browser runs the slow PBKDF2 (src/game/password-hash.ts) and sends only its 32-byte result.
 * The server HMACs that with a secret pepper, which costs well under 1 ms of the free plan's 10 ms CPU,
 * so a leaked database alone cannot be used to log in or to test password guesses.
 */
export const CLIENT_HASH_RE = /^[A-Za-z0-9_-]{43}$/;
const PREFIX = 'hmac-sha256$v1$';
const HASH_BYTES = 32;

async function hmac(clientHash: string, pepper: string): Promise<Uint8Array> {
  if (!pepper) throw new Error('PASSWORD_PEPPER is not set');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(clientHash)));
}

export async function hashPassword(clientHash: string, pepper: string): Promise<string> {
  return PREFIX + toBase64Url(await hmac(clientHash, pepper));
}

function parse(stored: string): Uint8Array | null {
  if (!stored.startsWith(PREFIX)) return null;
  try {
    const hash = fromBase64Url(stored.slice(PREFIX.length));
    return hash.length === HASH_BYTES ? hash : null;
  } catch {
    return null;
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyPassword(clientHash: string, stored: string, pepper: string): Promise<boolean> {
  const actual = await hmac(clientHash, pepper);
  const expected = parse(stored);
  return expected !== null && constantTimeEqual(actual, expected);
}
